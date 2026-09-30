import { sha256 } from './institutional-kernel.mjs';
import { selectBiggjTradingHorizon, BIGGJ_TRADING_POLICY_VERSION } from './biggj-trading-policy.mjs';

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
  notionalQuote=200,
  maxAgeMs=10*60_000,
  minExpectedReturn=0.002,
  minDirectionalProbability=0.55,
  minProbabilityEdge=0.08,
  cautionMinExpectedReturn=0.0035,
  cautionMinDirectionalProbability=0.62,
  cautionMinProbabilityEdge=0.15,
  horizonSelection='SHORTEST',
  assetClass='CORE'
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

  const selection=String(horizonSelection||'SHORTEST').toUpperCase();
  const allHorizons=Array.isArray(issuance.forecast?.horizons)?issuance.forecast.horizons:[];
  let horizons;
  let policyHorizon=null;
  if(selection==='BIGGJ_POLICY'){
    policyHorizon=selectBiggjTradingHorizon(allHorizons,{assetClass});
    if(!policyHorizon.eligible){
      return ineligible('NO_PRIMARY_HORIZON',{
        admissionGate,
        ageMs,
        assetClass:String(assetClass||'CORE').toUpperCase(),
        tradingPolicyVersion:BIGGJ_TRADING_POLICY_VERSION,
        tradingPolicyReason:policyHorizon.reason
      });
    }
    const selected=allHorizons.find(h=>
      String(h?.horizonId||'')===String(policyHorizon.horizonId||'')&&
      Number(h?.horizonMs||0)===Number(policyHorizon.horizonMs||0)
    );
    if(!selected) return ineligible('PRIMARY_HORIZON_RESOLUTION_FAILED',{admissionGate,ageMs});
    horizons=[selected];
  }else{
    horizons=allHorizons
      .filter(h=>
        String(h?.gate||'').toUpperCase()==='PASS'&&
        h?.display?.probabilityDisplayAllowed===true&&
        String(h?.calibration?.status||'').toUpperCase()==='CALIBRATED'&&
        ['UP','DOWN'].includes(String(h?.direction||'').toUpperCase())&&
        finite(h?.expectedReturn)!=null
      )
      .sort((a,b)=>{
        if(selection==='LONGEST') return Number(b.horizonMs||0)-Number(a.horizonMs||0);
        const pa=a.display?.probabilities||a.probabilities||{};
        const pb=b.display?.probabilities||b.probabilities||{};
        const da=String(a.direction||'').toUpperCase()==='UP'?finite(pa.up):finite(pa.down);
        const db=String(b.direction||'').toUpperCase()==='UP'?finite(pb.up):finite(pb.down);
        const oa=String(a.direction||'').toUpperCase()==='UP'?finite(pa.down):finite(pa.up);
        const ob=String(b.direction||'').toUpperCase()==='UP'?finite(pb.down):finite(pb.up);
        if(selection==='MAX_EDGE') return Number((db??-Infinity)-(ob??0))-Number((da??-Infinity)-(oa??0));
        if(selection==='MAX_RETURN') return Math.abs(Number(b.expectedReturn||0))-Math.abs(Number(a.expectedReturn||0));
        return Number(a.horizonMs||Infinity)-Number(b.horizonMs||Infinity);
      });
    if(!horizons.length) return ineligible('NO_ADMITTED_DIRECTIONAL_HORIZON',{admissionGate,ageMs});
  }

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
    generatedAt,
    horizonSelection:selection,
    assetClass:String(assetClass||'CORE').toUpperCase(),
    tradingPolicyVersion:selection==='BIGGJ_POLICY'?BIGGJ_TRADING_POLICY_VERSION:null
  };
  return freezeDeep({
    ...decisionCore,
    eligible:true,
    reason:'ADMITTED_SHADOW_TRADE',
    decisionKey:sha256(decisionCore),
    type:'MARKET',
    notionalQuote:Math.max(1,Number(notionalQuote)||200),
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
