import { sha256 } from './institutional-kernel.mjs';

export const BIGGJ_TRADING_POLICY_VERSION='BIGGJ_TRADING_POLICY_V1';

const finite=(v,f=null)=>Number.isFinite(Number(v))?Number(v):f;
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,Number(v)));
const freeze=v=>{if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.freeze(v);for(const x of Object.values(v))freeze(x);}return v;};

export const DEFAULT_BIGGJ_TRADING_POLICY=freeze({
  version:BIGGJ_TRADING_POLICY_VERSION,
  timeframeRoles:{
    context:'4h',
    regime:'1h',
    setup:'15m',
    trigger:'5m',
    microExecution:'1m'
  },
  CORE:{
    minHorizonMs:60*60_000,
    maxForecastHorizonMs:3*60*60_000,
    maxHoldMs:3*24*60*60_000,
    reviewIntervalMs:15*60_000,
    minDirectionalProbability:.58,
    minProbabilityEdge:.10,
    minAbsExpectedReturn:.003,
    baseRiskPct:.0035,
    maxSingleTradeExposurePct:.12
  },
  MEME:{
    minHorizonMs:15*60_000,
    maxForecastHorizonMs:60*60_000,
    maxHoldMs:6*60*60_000,
    reviewIntervalMs:5*60_000,
    minDirectionalProbability:.62,
    minProbabilityEdge:.14,
    minAbsExpectedReturn:.005,
    baseRiskPct:.002,
    maxSingleTradeExposurePct:.06
  },
  entry:{
    minPrimaryScore:.70,
    minResearchScore:.58,
    minEvidenceCoverage:.70,
    maxCounterThesisPrimary:.55,
    minRewardRisk:1.5,
    weights:{
      forecastEdge:.25,
      structureQuality:.20,
      regimeFit:.15,
      flowConfirmation:.10,
      liquidityQuality:.10,
      setupMemory:.10,
      riskRewardQuality:.05,
      dataTrust:.05
    }
  },
  lifecycle:{
    thesisCollapse:.30,
    oppositeCollapse:.65,
    strongThesis:.65,
    weakThesis:.45,
    maxOppositeForExtension:.45,
    protectAtTargetFraction:.55,
    trailAtTargetFraction:.80,
    maxHoldHorizonMultiplier:2.5
  }
});

function assetPolicy(assetClass,policy=DEFAULT_BIGGJ_TRADING_POLICY){
  return String(assetClass||'CORE').toUpperCase()==='MEME'?policy.MEME:policy.CORE;
}
function probabilities(h){
  return h?.display?.probabilities||h?.probabilities||{};
}
function directionalStats(h){
  const direction=String(h?.direction||'').toUpperCase();
  const p=probabilities(h);
  const up=finite(p.up),down=finite(p.down),flat=finite(p.flat);
  if(!['UP','DOWN'].includes(direction)||up==null||down==null||flat==null)return null;
  const directionalProbability=direction==='UP'?up:down;
  const oppositeProbability=direction==='UP'?down:up;
  return {
    direction,
    directionalProbability,
    oppositeProbability,
    flatProbability:flat,
    probabilityEdge:directionalProbability-oppositeProbability
  };
}
function finalized(core){
  return freeze({...core,fingerprint:sha256(core)});
}

export function selectBiggjTradingHorizon(horizons,{
  assetClass='CORE',
  policy=DEFAULT_BIGGJ_TRADING_POLICY
}={}){
  const ap=assetPolicy(assetClass,policy);
  const candidates=(Array.isArray(horizons)?horizons:[])
    .map(h=>({h,stats:directionalStats(h)}))
    .filter(({h,stats})=>
      stats&&
      String(h?.gate||'').toUpperCase()==='PASS'&&
      h?.display?.probabilityDisplayAllowed===true&&
      String(h?.calibration?.status||'').toUpperCase()==='CALIBRATED'&&
      finite(h?.expectedReturn)!=null&&
      finite(h?.horizonMs)!=null&&
      Number(h.horizonMs)>=ap.minHorizonMs&&
      Number(h.horizonMs)<=ap.maxForecastHorizonMs&&
      stats.directionalProbability>=ap.minDirectionalProbability&&
      stats.probabilityEdge>=ap.minProbabilityEdge&&
      Math.abs(Number(h.expectedReturn))>=ap.minAbsExpectedReturn
    )
    .sort((a,b)=>
      b.stats.probabilityEdge-a.stats.probabilityEdge||
      Math.abs(Number(b.h.expectedReturn))-Math.abs(Number(a.h.expectedReturn))||
      Number(a.h.horizonMs)-Number(b.h.horizonMs)
    );
  if(!candidates.length){
    return finalized({
      version:BIGGJ_TRADING_POLICY_VERSION,
      eligible:false,
      reason:'NO_PRIMARY_HORIZON',
      assetClass:String(assetClass).toUpperCase(),
      minHorizonMs:ap.minHorizonMs,
      maxForecastHorizonMs:ap.maxForecastHorizonMs,
      execution:'SHADOW_ONLY',
      canExecuteLive:false
    });
  }
  const {h,stats}=candidates[0];
  return finalized({
    version:BIGGJ_TRADING_POLICY_VERSION,
    eligible:true,
    reason:'PRIMARY_HORIZON_SELECTED',
    assetClass:String(assetClass).toUpperCase(),
    horizonId:String(h.horizonId||''),
    horizonMs:Number(h.horizonMs),
    expectedReturn:Number(h.expectedReturn),
    ...stats,
    minHorizonMs:ap.minHorizonMs,
    maxForecastHorizonMs:ap.maxForecastHorizonMs,
    candidateCount:candidates.length,
    selectionRule:'MAX_EDGE_THEN_RETURN_THEN_SHORTEST',
    execution:'SHADOW_ONLY',
    canExecuteLive:false
  });
}

export function routeBiggjStrategy({
  assetClass='CORE',
  regimeTrend='NEUTRAL',
  regimeState='UNKNOWN',
  breakRetestConfirmed=false,
  pullbackConfirmed=false,
  rangeBoundaryConfirmed=false,
  rejectionConfirmed=false,
  momentumExpansionConfirmed=false,
  liquidityReversalConfirmed=false
}={}){
  const meme=String(assetClass).toUpperCase()==='MEME';
  const trend=String(regimeTrend||'NEUTRAL').toUpperCase();
  const regime=String(regimeState||'UNKNOWN').toUpperCase();
  let family='ABSTAIN',mode='NONE',reason='NO_STRATEGY_FAMILY';
  if(meme&&momentumExpansionConfirmed){
    family='MEME_MOMENTUM';mode='PRIMARY_CANDIDATE';reason='MEME_MOMENTUM_CONFIRMED';
  }else if(breakRetestConfirmed){
    family='BREAKOUT_RETEST';mode='PRIMARY_CANDIDATE';reason='BREAK_RETEST_CONFIRMED';
  }else if(['UP','DOWN','BULLISH','BEARISH'].includes(trend)&&pullbackConfirmed){
    family='TREND_CONTINUATION';mode='PRIMARY_CANDIDATE';reason='TREND_PULLBACK_CONFIRMED';
  }else if(['CHOP','RANGE','SIDEWAYS'].includes(regime)&&rangeBoundaryConfirmed&&rejectionConfirmed){
    family='RANGE_MEAN_REVERSION';mode='PRIMARY_CANDIDATE';reason='RANGE_EDGE_REJECTION';
  }else if(liquidityReversalConfirmed){
    family='LIQUIDITY_REVERSAL';mode='RESEARCH_ONLY';reason='REVERSAL_REQUIRES_FORWARD_EVIDENCE';
  }
  return finalized({
    version:BIGGJ_TRADING_POLICY_VERSION,
    family,mode,reason,
    execution:'SHADOW_ONLY',
    canExecuteLive:false
  });
}

export function evaluateBiggjEntryAdmission({
  assetClass='CORE',
  dataSafetyState='NORMAL',
  executableLiquidity=true,
  portfolioBlocked=false,
  setupMemoryStatus='LEARNING',
  setupType='B',
  structureInvalidationDefined=true,
  plannedRewardRisk=null,
  counterThesisStrength=0,
  horizon=null,
  components={}
}={},{
  policy=DEFAULT_BIGGJ_TRADING_POLICY
}={}){
  const ep=policy.entry;
  const ap=assetPolicy(assetClass,policy);
  const blockers=[];
  if(String(dataSafetyState||'UNKNOWN').toUpperCase()!=='NORMAL')blockers.push('DATA_SAFETY_NOT_NORMAL');
  if(executableLiquidity!==true)blockers.push('EXECUTABLE_LIQUIDITY_INSUFFICIENT');
  if(portfolioBlocked===true)blockers.push('PORTFOLIO_RISK_BLOCK');
  if(['DECAYING','AVOID'].includes(String(setupMemoryStatus||'').toUpperCase()))blockers.push('SETUP_MEMORY_BLOCK');
  if(!['A','B','C'].includes(String(setupType||'').toUpperCase()))blockers.push('SETUP_CLASS_INVALID');
  if(structureInvalidationDefined!==true)blockers.push('STRUCTURE_INVALIDATION_MISSING');
  const rr=finite(plannedRewardRisk);
  if(rr==null||rr<ep.minRewardRisk)blockers.push('REWARD_RISK_TOO_LOW');
  if(!horizon?.eligible)blockers.push('PRIMARY_HORIZON_MISSING');
  else{
    if(finite(horizon.directionalProbability,0)<ap.minDirectionalProbability)blockers.push('DIRECTIONAL_PROBABILITY_TOO_LOW');
    if(finite(horizon.probabilityEdge,0)<ap.minProbabilityEdge)blockers.push('PROBABILITY_EDGE_TOO_LOW');
    if(Math.abs(finite(horizon.expectedReturn,0))<ap.minAbsExpectedReturn)blockers.push('EXPECTED_RETURN_TOO_SMALL');
  }
  const weights=ep.weights;
  let knownWeight=0,weighted=0;
  const scored={};
  for(const [key,weight] of Object.entries(weights)){
    const value=finite(components?.[key]);
    if(value==null){
      scored[key]={known:false,value:null,weight};
      continue;
    }
    const v=clamp(value);
    knownWeight+=weight;
    weighted+=weight*v;
    scored[key]={known:true,value:v,weight};
  }
  const totalWeight=Object.values(weights).reduce((a,b)=>a+b,0);
  const evidenceCoverage=totalWeight>0?knownWeight/totalWeight:0;
  const knownAverage=knownWeight>0?weighted/knownWeight:0;
  const evidenceScore=clamp(knownAverage*(.70+.30*evidenceCoverage));
  const counter=clamp(finite(counterThesisStrength,0));
  if(evidenceCoverage<ep.minEvidenceCoverage)blockers.push('EVIDENCE_COVERAGE_TOO_LOW');
  if(counter>ep.maxCounterThesisPrimary)blockers.push('COUNTER_THESIS_TOO_STRONG');
  if(String(setupType).toUpperCase()==='C')blockers.push('SETUP_C_RESEARCH_ONLY');

  let admission='ABSTAIN';
  if(blockers.length===0&&evidenceScore>=ep.minPrimaryScore)admission='PRIMARY';
  else if(
    !blockers.some(x=>[
      'DATA_SAFETY_NOT_NORMAL','EXECUTABLE_LIQUIDITY_INSUFFICIENT','PORTFOLIO_RISK_BLOCK',
      'STRUCTURE_INVALIDATION_MISSING','PRIMARY_HORIZON_MISSING','REWARD_RISK_TOO_LOW'
    ].includes(x))&&
    evidenceScore>=ep.minResearchScore
  ) admission='RESEARCH_ONLY';

  return finalized({
    version:BIGGJ_TRADING_POLICY_VERSION,
    admission,
    admitted:admission==='PRIMARY',
    evidenceScore,
    evidenceCoverage,
    counterThesisStrength:counter,
    blockers,
    components:scored,
    thresholds:{
      primaryScore:ep.minPrimaryScore,
      researchScore:ep.minResearchScore,
      minEvidenceCoverage:ep.minEvidenceCoverage,
      maxCounterThesisPrimary:ep.maxCounterThesisPrimary,
      minRewardRisk:ep.minRewardRisk
    },
    execution:'SHADOW_ONLY',
    canExecuteLive:false
  });
}

export function deriveBiggjShadowRiskBudget({
  equityQuote,
  assetClass='CORE',
  entryScore,
  stopDistancePct,
  portfolioMultiplier=1
}={},{
  policy=DEFAULT_BIGGJ_TRADING_POLICY
}={}){
  const ap=assetPolicy(assetClass,policy);
  const equity=Math.max(0,finite(equityQuote,0));
  const stop=Math.max(.0001,Math.abs(finite(stopDistancePct,.01)));
  const score=clamp(finite(entryScore,0));
  const portfolio=clamp(finite(portfolioMultiplier,1),0,1);
  const quality=clamp(.75+Math.max(0,score-policy.entry.minPrimaryScore)*2,.60,1.15);
  const riskPct=Math.min(ap.baseRiskPct*1.15,ap.baseRiskPct*quality*portfolio);
  const riskQuote=equity*riskPct;
  const rawNotional=riskQuote/stop;
  const maxNotional=equity*ap.maxSingleTradeExposurePct;
  const notionalQuote=Math.max(0,Math.min(rawNotional,maxNotional));
  return finalized({
    version:BIGGJ_TRADING_POLICY_VERSION,
    assetClass:String(assetClass).toUpperCase(),
    equityQuote:equity,
    stopDistancePct:stop,
    riskPct,
    riskQuote,
    notionalQuote,
    maxNotionalQuote:maxNotional,
    leverage:1,
    leveragePolicy:'PRIMARY_BASELINE_UNLEVERED',
    execution:'SHADOW_ONLY',
    canExecuteLive:false
  });
}

export function evaluateBiggjPositionLifecycle(position={},state={},{
  policy=DEFAULT_BIGGJ_TRADING_POLICY
}={}){
  const lp=policy.lifecycle;
  const ap=assetPolicy(position.assetClass||'CORE',policy);
  const at=finite(state.at,Date.now());
  const openedAt=finite(position.openedAt,at);
  const ageMs=Math.max(0,at-openedAt);
  const horizonMs=Math.max(ap.minHorizonMs,finite(position.horizonMs,ap.minHorizonMs));
  const style=String(position.tradingStyle||'INTRADAY').toUpperCase();
  const styleMultiplierCap=style==='SWING'?16:style==='SCALP'?1.5:3;
  const adaptiveHoldMultiplier=clamp(finite(state.adaptiveHoldMultiplier,1),.50,Math.max(lp.maxHoldHorizonMultiplier,styleMultiplierCap));
  const effectiveReviewHorizonMs=Math.max(ap.reviewIntervalMs,horizonMs*adaptiveHoldMultiplier);
  const styleMaxHoldMs=Math.max(horizonMs,finite(position.maxHoldMs,ap.maxHoldMs));
  const dynamicCap=Math.max(effectiveReviewHorizonMs,Math.min(styleMaxHoldMs,effectiveReviewHorizonMs*1.75,ap.maxHoldMs));
  const maxHoldAt=openedAt+dynamicCap;
  const roe=finite(state.marginRoePct,0);
  const stop=Math.abs(finite(position.stopLossPct,.005));
  const target=Math.abs(finite(position.takeProfitPct,.01));
  const thesis=clamp(finite(state.thesisHealth,.5));
  const opposite=clamp(finite(state.oppositeThesisStrength,0));
  const targetReached=state.targetReached===true||roe>=target;
  const executable=state.trustedExecutableBook!==false;

  const result=(action,reason,extra={})=>finalized({
    version:BIGGJ_TRADING_POLICY_VERSION,
    action,reason,
    ageMs,horizonMs,effectiveReviewHorizonMs,adaptiveHoldMultiplier,
    horizonProgress:horizonMs>0?ageMs/horizonMs:0,
    effectiveHorizonProgress:effectiveReviewHorizonMs>0?ageMs/effectiveReviewHorizonMs:0,
    maxHoldAt,
    thesisHealth:thesis,
    oppositeThesisStrength:opposite,
    marginRoePct:roe,
    ...extra,
    execution:'SHADOW_ONLY',
    canExecuteLive:false
  });

  if(!executable)return result('DATA_FREEZE','EXECUTABLE_BOOK_UNTRUSTED');
  if(state.hardStopReached===true||roe<=-stop)return result('EXIT','STOP_LOSS');
  if(state.structureInvalidationConfirmed===true)return result('EXIT','THESIS_INVALIDATED');
  if(thesis<=lp.thesisCollapse&&opposite>=lp.oppositeCollapse)return result('EXIT','THESIS_COLLAPSE');
  if(at>=maxHoldAt)return result('EXIT','MAX_HOLD_EXIT');

  if(targetReached){
    if(thesis<lp.strongThesis||opposite>.50)return result('EXIT','TARGET_THESIS_EXHAUSTED');
    return result('TRAIL','TARGET_RUNNER',{nextReviewAt:Math.min(maxHoldAt,at+ap.reviewIntervalMs)});
  }
  if(roe>=target*lp.trailAtTargetFraction)return result('TRAIL','PROFIT_LOCK',{nextReviewAt:Math.min(maxHoldAt,at+ap.reviewIntervalMs)});
  if(roe>=target*lp.protectAtTargetFraction)return result('PROTECT','BREAK_EVEN_LOCK',{nextReviewAt:Math.min(maxHoldAt,at+ap.reviewIntervalMs)});

  if(ageMs>=effectiveReviewHorizonMs){
    if(thesis>=lp.strongThesis&&opposite<=lp.maxOppositeForExtension){
      return result('HOLD','HORIZON_REVIEW_EXTEND',{nextReviewAt:Math.min(maxHoldAt,at+ap.reviewIntervalMs)});
    }
    if(thesis<lp.weakThesis)return result('EXIT','HORIZON_REVIEW_THESIS_WEAK');
    if(roe>0)return result('PROTECT','HORIZON_REVIEW_NEUTRAL',{nextReviewAt:Math.min(maxHoldAt,at+ap.reviewIntervalMs)});
    return result('REVIEW','HORIZON_REVIEW_NEUTRAL',{nextReviewAt:Math.min(maxHoldAt,at+ap.reviewIntervalMs)});
  }

  return result('HOLD','THESIS_ACTIVE',{nextReviewAt:Math.min(maxHoldAt,openedAt+horizonMs)});
}
