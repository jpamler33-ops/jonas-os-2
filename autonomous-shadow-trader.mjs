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
  notionalQuote=100,
  maxAgeMs=10*60_000,
  minExpectedReturn=0.002,
  minDirectionalProbability=0.55,
  minProbabilityEdge=0.08,
  cautionMinExpectedReturn=0.0035,
  cautionMinDirectionalProbability=0.62,
  cautionMinProbabilityEdge=0.15,
  assetClass='CORE',
  horizonSelection='BIGGJ_POLICY'
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

  const requestedSelection=String(horizonSelection||'BIGGJ_POLICY').toUpperCase();
  const policyHorizon=selectBiggjTradingHorizon(
    Array.isArray(issuance.forecast?.horizons)?issuance.forecast.horizons:[],
    {assetClass}
  );
  if(!policyHorizon.eligible){
    return ineligible('BIGGJ_'+String(policyHorizon.reason||'NO_PRIMARY_HORIZON'),{
      admissionGate,
      ageMs,
      assetClass:String(assetClass||'CORE').toUpperCase(),
      tradingPolicyVersion:BIGGJ_TRADING_POLICY_VERSION,
      requestedLegacyHorizonSelection:requestedSelection
    });
  }

  const direction=String(policyHorizon.direction).toUpperCase();
  const expectedReturn=finite(policyHorizon.expectedReturn);
  const directionalProbability=finite(policyHorizon.directionalProbability);
  const oppositeProbability=finite(policyHorizon.oppositeProbability);
  const probabilityEdge=finite(policyHorizon.probabilityEdge);
  const flatProbability=finite(policyHorizon.flatProbability);
  if([expectedReturn,directionalProbability,oppositeProbability,probabilityEdge,flatProbability].some(x=>x==null)){
    return ineligible('BIGGJ_POLICY_HORIZON_INVALID',{
      admissionGate,
      ageMs,
      tradingPolicyVersion:BIGGJ_TRADING_POLICY_VERSION
    });
  }
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
    return ineligible('EXPECTED_RETURN_TOO_SMALL',{admissionGate,ageMs,horizonId:policyHorizon.horizonId,expectedReturn,requiredReturn,tradingPolicyVersion:BIGGJ_TRADING_POLICY_VERSION});
  }
  if(directionalProbability<requiredProbability){
    return ineligible('DIRECTIONAL_PROBABILITY_TOO_LOW',{admissionGate,ageMs,horizonId:policyHorizon.horizonId,directionalProbability,requiredProbability,tradingPolicyVersion:BIGGJ_TRADING_POLICY_VERSION});
  }
  if(probabilityEdge<requiredEdge){
    return ineligible('PROBABILITY_EDGE_TOO_LOW',{admissionGate,ageMs,horizonId:policyHorizon.horizonId,probabilityEdge,requiredEdge,tradingPolicyVersion:BIGGJ_TRADING_POLICY_VERSION});
  }

  const side=direction==='UP'?'BUY':'SELL';
  const decisionCore={
    version:AUTONOMOUS_SHADOW_TRADER_VERSION,
    issuanceId:String(issuance.issuanceId||''),
    forecastFingerprint:String(issuance.forecastFingerprint||issuance.forecast?.fingerprint||''),
    symbol:String(issuance.symbol||'').toUpperCase(),
    horizonId:String(policyHorizon.horizonId||''),
    side,
    expectedReturn,
    directionalProbability,
    oppositeProbability,
    flatProbability,
    admissionGate,
    generatedAt,
    assetClass:String(assetClass||'CORE').toUpperCase(),
    tradingPolicyVersion:BIGGJ_TRADING_POLICY_VERSION,
    horizonSelection:'BIGGJ_POLICY',
    horizonSelectionRule:String(policyHorizon.selectionRule||'MAX_EDGE_THEN_RETURN_THEN_SHORTEST'),
    requestedLegacyHorizonSelection:requestedSelection
  };
  return freezeDeep({
    ...decisionCore,
    eligible:true,
    reason:'ADMITTED_SHADOW_TRADE',
    decisionKey:sha256(decisionCore),
    type:'MARKET',
    notionalQuote:Math.max(1,Number(notionalQuote)||100),
    horizonMs:Number(policyHorizon.horizonMs),
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
