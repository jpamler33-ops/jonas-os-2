import { sha256 } from './institutional-kernel.mjs';

export const AUTONOMOUS_SHADOW_TRADER_VERSION='TCX_AUTONOMOUS_SHADOW_TRADER_V1';

function finite(v){ const n=Number(v); return Number.isFinite(n)?n:null; }
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
function freezeDeep(v){
  if(v&&typeof v==='object'&&!Object.isFrozen(v)){
    Object.freeze(v);
    for(const x of Object.values(v)) freezeDeep(x);
  }
  return v;
}
function ineligible(reason,extra={}){
  return freezeDeep({
    version:AUTONOMOUS_SHADOW_TRADER_VERSION,
    eligible:false,
    reason:String(reason),
    execution:'SHADOW_ONLY',
    canExecuteLive:false,
    ...extra
  });
}

export function deriveAutonomousShadowTrade(issuance,{
  now=Date.now(),
  notionalQuote=100,
  maxAgeMs=10*60_000,
  minExpectedReturn=0.002,
  minDirectionalProbability=0.55,
  minProbabilityEdge=0.08,
  cautionMinExpectedReturn=0.0035,
  cautionMinDirectionalProbability=0.62,
  cautionMinProbabilityEdge=0.15
}={}){
  if(!issuance||typeof issuance!=='object') return ineligible('ISSUANCE_MISSING');
  if(
    issuance.executionMode!=='SHADOW_ONLY'||
    issuance.action!=='ABSTAIN'||
    issuance.canExecute!==false
  ) return ineligible('ISSUANCE_SAFETY_INVARIANT_INVALID');

  const admissionGate=String(issuance.admission?.gate||'ABSTAIN').toUpperCase();
  if(!['PASS','CAUTION'].includes(admissionGate)){
    return ineligible('ADMISSION_'+admissionGate,{admissionGate});
  }
  if(issuance.probabilityDisplayAllowed!==true){
    return ineligible('PROBABILITY_NOT_ADMITTED',{admissionGate});
  }
  if(String(issuance.trace?.safety?.state||'UNKNOWN').toUpperCase()!=='NORMAL'){
    return ineligible('DATA_SAFETY_NOT_NORMAL',{admissionGate});
  }

  const generatedAt=finite(issuance.generatedAt),t=finite(now);
  if(generatedAt==null||t==null||t<generatedAt) return ineligible('FORECAST_TIME_INVALID',{admissionGate});
  const ageMs=t-generatedAt;
  if(ageMs>Math.max(1,Number(maxAgeMs)||1)) return ineligible('FORECAST_STALE',{admissionGate,ageMs});

  const horizons=(Array.isArray(issuance.forecast?.horizons)?issuance.forecast.horizons:[])
    .filter(h=>
      String(h?.gate||'').toUpperCase()==='PASS'&&
      h?.display?.probabilityDisplayAllowed===true&&
      String(h?.calibration?.status||'').toUpperCase()==='CALIBRATED'&&
      ['UP','DOWN'].includes(String(h?.direction||'').toUpperCase())&&
      finite(h?.expectedReturn)!=null
    )
    .sort((a,b)=>Number(a.horizonMs||Infinity)-Number(b.horizonMs||Infinity));
  if(!horizons.length) return ineligible('NO_ADMITTED_DIRECTIONAL_HORIZON',{admissionGate,ageMs});

  const h=horizons[0],direction=String(h.direction).toUpperCase();
  const p=h.display?.probabilities||h.probabilities||null;
  const pUp=finite(p?.up),pDown=finite(p?.down),pFlat=finite(p?.flat);
  if([pUp,pDown,pFlat].some(x=>x==null)) return ineligible('PROBABILITY_VECTOR_INVALID',{admissionGate,ageMs});

  const expectedReturn=finite(h.expectedReturn);
  const directionalProbability=direction==='UP'?pUp:pDown;
  const oppositeProbability=direction==='UP'?pDown:pUp;
  const probabilityEdge=directionalProbability-oppositeProbability;
  const caution=admissionGate==='CAUTION';
  const requiredReturn=caution
    ?Math.max(Number(minExpectedReturn)||0,Number(cautionMinExpectedReturn)||0)
    :Math.max(0,Number(minExpectedReturn)||0);
  const requiredProbability=caution
    ?Math.max(Number(minDirectionalProbability)||0,Number(cautionMinDirectionalProbability)||0)
    :clamp(Number(minDirectionalProbability)||0,0,1);
  const requiredEdge=caution
    ?Math.max(Number(minProbabilityEdge)||0,Number(cautionMinProbabilityEdge)||0)
    :Math.max(0,Number(minProbabilityEdge)||0);

  if(Math.abs(expectedReturn)<requiredReturn){
    return ineligible('EXPECTED_RETURN_TOO_SMALL',{admissionGate,ageMs,horizonId:h.horizonId,expectedReturn,requiredReturn});
  }
  if(directionalProbability<requiredProbability){
    return ineligible('DIRECTIONAL_PROBABILITY_TOO_LOW',{admissionGate,ageMs,horizonId:h.horizonId,directionalProbability,requiredProbability});
  }
  if(probabilityEdge<requiredEdge){
    return ineligible('PROBABILITY_EDGE_TOO_LOW',{admissionGate,ageMs,horizonId:h.horizonId,probabilityEdge,requiredEdge});
  }

  const side=direction==='UP'?'BUY':'SELL';
  const decisionCore={
    version:AUTONOMOUS_SHADOW_TRADER_VERSION,
    issuanceId:String(issuance.issuanceId||''),
    forecastFingerprint:String(issuance.forecastFingerprint||issuance.forecast?.fingerprint||''),
    symbol:String(issuance.symbol||'').toUpperCase(),
    horizonId:String(h.horizonId||''),
    side,
    expectedReturn,
    directionalProbability,
    oppositeProbability,
    admissionGate,
    generatedAt
  };
  return freezeDeep({
    ...decisionCore,
    eligible:true,
    reason:'ADMITTED_SHADOW_TRADE',
    decisionKey:sha256(decisionCore),
    type:'MARKET',
    notionalQuote:Math.max(1,Number(notionalQuote)||100),
    horizonMs:Number(h.horizonMs),
    probabilityEdge,
    thresholds:{
      minExpectedReturn:requiredReturn,
      minDirectionalProbability:requiredProbability,
      minProbabilityEdge:requiredEdge
    },
    execution:'SHADOW_ONLY',
    canExecuteLive:false
  });
}
