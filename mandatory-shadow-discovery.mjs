import { sha256 } from './institutional-kernel.mjs';
import { scoreShadowTradeCandidate } from './shadow-trade-quality-learner.mjs';

export const MANDATORY_SHADOW_DISCOVERY_VERSION='TCX_MANDATORY_SHADOW_DISCOVERY_V1';

function finite(v,fallback=null){
  if(v===null||v===undefined||v==='') return fallback;
  const n=Number(v);
  return Number.isFinite(n)?n:fallback;
}
function clamp(v,a=0,b=1){ return Math.max(a,Math.min(b,Number(v))); }
function freeze(v){
  if(v&&typeof v==='object'&&!Object.isFrozen(v)){
    Object.freeze(v);
    for(const x of Object.values(v)) freeze(x);
  }
  return v;
}
function no(reason,extra={}){
  return freeze({
    version:MANDATORY_SHADOW_DISCOVERY_VERSION,
    eligible:false,reason:String(reason),
    searchRequired:true,
    execution:'SHADOW_ONLY',action:'ABSTAIN',canExecuteLive:false,
    ...extra
  });
}

export function deriveMandatoryShadowDiscovery(issuance,qualityModel,{
  now=Date.now(),
  notionalQuote=12,
  maxAgeMs=10*60_000,
  minDirectionalProbability=.505,
  minAbsoluteExpectedReturn=.0004,
  minLearningValue=.10,
  assetClass='CORE',
  allowAbstainProbe=false,
  abstainProbeNotionalQuote=5
}={}){
  if(!issuance||typeof issuance!=='object') return no('ISSUANCE_MISSING');
  if(issuance.executionMode!=='SHADOW_ONLY'||issuance.action!=='ABSTAIN'||issuance.canExecute!==false){
    return no('ISSUANCE_SAFETY_INVARIANT_INVALID');
  }
  const admissionGate=String(issuance.admission?.gate||'ABSTAIN').toUpperCase();
  const abstainProbe=admissionGate==='ABSTAIN'&&allowAbstainProbe===true;
  if(!abstainProbe&&!['PASS','CAUTION'].includes(admissionGate)) return no('ADMISSION_'+admissionGate,{admissionGate});
  if(!abstainProbe&&issuance.probabilityDisplayAllowed!==true) return no('PROBABILITY_NOT_ADMITTED',{admissionGate});
  if(String(issuance.trace?.safety?.state||'UNKNOWN').toUpperCase()!=='NORMAL'){
    return no('DATA_SAFETY_NOT_NORMAL',{admissionGate});
  }
  const generatedAt=finite(issuance.generatedAt),t=finite(now);
  if(generatedAt==null||t==null||t<generatedAt) return no('FORECAST_TIME_INVALID',{admissionGate});
  const ageMs=t-generatedAt;
  if(ageMs>Math.max(1,Number(maxAgeMs)||1)) return no('FORECAST_STALE',{admissionGate,ageMs});

  const candidates=[];
  for(const h of Array.isArray(issuance.forecast?.horizons)?issuance.forecast.horizons:[]){
    const horizonGate=String(h?.gate||'').toUpperCase();
    const calibrationStatus=String(h?.calibration?.status||'INSUFFICIENT').toUpperCase();
    const calibrated=calibrationStatus==='CALIBRATED';
    const p=h.probabilities||h.display?.probabilities||{};
    const pUp=finite(p.up),pDown=finite(p.down),pFlat=finite(p.flat);
    const expectedReturn=finite(h.expectedReturn);
    if([pUp,pDown,pFlat,expectedReturn].some(x=>x==null)) continue;

    let direction=String(h?.direction||'').toUpperCase();
    if(!['UP','DOWN'].includes(direction)){
      if(Math.abs(expectedReturn)>1e-12) direction=expectedReturn>=0?'UP':'DOWN';
      else direction=pUp>=pDown?'UP':'DOWN';
    }
    const directional=['UP','DOWN'].includes(direction);
    const normalEligible=
      horizonGate==='PASS'&&
      h?.display?.probabilityDisplayAllowed===true&&
      calibrated&&directional;
    // ABSTAIN probes are deliberately broader than normal entries: they exist to
    // collect outcome labels precisely where institutional admission is uncertain.
    // They still require canonical finite forecast values, fresh data and NORMAL safety.
    const probeEligible=abstainProbe&&directional;
    if(!normalEligible&&!probeEligible) continue;

    const directionalProbability=direction==='UP'?pUp:pDown;
    const oppositeProbability=direction==='UP'?pDown:pUp;
    const probabilityEdge=directionalProbability-oppositeProbability;
    const minProb=abstainProbe?0:minDirectionalProbability;
    const minMove=abstainProbe?0:minAbsoluteExpectedReturn;
    if(directionalProbability<minProb) continue;
    if(Math.abs(expectedReturn)<minMove) continue;
    const side=direction==='UP'?'BUY':'SELL';
    const features={
      assetClass:String(assetClass||'CORE').toUpperCase(),
      side:side==='BUY'?'LONG':'SHORT',
      horizonMs:Number(h.horizonMs||0),
      directionalProbability,probabilityEdge,expectedReturn
    };
    const learned=scoreShadowTradeCandidate(qualityModel,features);
    // Exploration deliberately favors uncertainty/novelty while still preferring
    // candidates with some directional/return structure. It is not a live signal.
    const structuralScore=clamp(
      .45*clamp((directionalProbability-.50)/.20)+
      .30*clamp(probabilityEdge/.25)+
      .25*clamp(Math.abs(expectedReturn)/.01)
    );
    const discoveryScore=clamp(.58*learned.learningValue+.27*structuralScore+.15*learned.qualityScore);
    candidates.push({
      horizonId:String(h.horizonId||''),
      horizonMs:Number(h.horizonMs||0),
      side,direction,expectedReturn,directionalProbability,oppositeProbability,probabilityEdge,
      horizonGate,calibrationStatus,
      probeEvidenceClass:abstainProbe
        ?(calibrated?'CALIBRATED_ABSTAIN_PROBE':'UNCALIBRATED_DIAGNOSTIC_PROBE')
        :'NORMAL_ADMITTED_EXPLORATION',
      structuralScore,discoveryScore,learned
    });
  }
  candidates.sort((a,b)=>b.discoveryScore-a.discoveryScore||b.learned.learningValue-a.learned.learningValue);
  if(!candidates.length) return no('NO_SAFE_LEARNABLE_CANDIDATE',{admissionGate,ageMs,candidatesExamined:0});
  const c=candidates[0];
  if(!abstainProbe&&c.learned.learningValue<minLearningValue){
    return no('LEARNING_VALUE_TOO_LOW',{admissionGate,ageMs,candidate:c});
  }
  const core={
    version:MANDATORY_SHADOW_DISCOVERY_VERSION,
    issuanceId:String(issuance.issuanceId||''),
    forecastFingerprint:String(issuance.forecastFingerprint||issuance.forecast?.fingerprint||''),
    symbol:String(issuance.symbol||'').toUpperCase(),
    horizonId:c.horizonId,
    horizonMs:c.horizonMs,
    side:c.side,
    expectedReturn:c.expectedReturn,
    directionalProbability:c.directionalProbability,
    probabilityEdge:c.probabilityEdge,
    discoveryScore:c.discoveryScore,
    qualityModelFingerprint:String(qualityModel?.fingerprint||''),
    generatedAt,
    admissionGate
  };
  const entryMode=abstainProbe?'ABSTAIN_PROBE':'EXPLORATION';
  return freeze({
    ...core,
    eligible:true,
    reason:abstainProbe?'MANDATORY_ABSTAIN_SHADOW_PROBE_CANDIDATE':'MANDATORY_SHADOW_EXPLORATION_CANDIDATE',
    decisionKey:sha256({...core,entryMode}),
    type:'MARKET',
    notionalQuote:abstainProbe
      ?Math.max(1,Number(abstainProbeNotionalQuote)||5)
      :Math.max(1,Number(notionalQuote)||12),
    entryMode,
    probeOnly:abstainProbe,
    admissionOverrideForLearning:abstainProbe,
    admissionReasons:Array.isArray(issuance.admission?.reasons)?issuance.admission.reasons.slice(0,12).map(String):[],
    searchRequired:true,
    learning:{
      qualityLabel:c.learned.qualityLabel,
      qualityScore:c.learned.qualityScore,
      matchedLevel:c.learned.matchedLevel,
      samples:c.learned.samples,
      confidence:c.learned.confidence,
      novelty:c.learned.novelty,
      uncertainty:c.learned.uncertainty,
      learningValue:c.learned.learningValue,
      structuralScore:c.structuralScore,
      horizonGate:c.horizonGate,
      calibrationStatus:c.calibrationStatus,
      probeEvidenceClass:c.probeEvidenceClass
    },
    candidatesExamined:candidates.length,
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecuteLive:false
  });
}
