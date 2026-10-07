export const JONAS_CLONE_V1_VERSION='JONAS_CLONE_V1';
export const JONAS_CLONE_PRIORITY='P0';

export const JONAS_CLONE_V1_POLICY=Object.freeze({
  version:JONAS_CLONE_V1_VERSION,
  contract:'GMGN_NEW_PAIR_1M_GREEN_99K_HOLD_4M_V1',
  priority:JONAS_CLONE_PRIORITY,
  execution:'SHADOW_ONLY',
  canExecute:false,
  canExecuteLive:false,
  automaticPrimaryMutation:false,
  objective:'REPRODUCE_EXACT_GMGN_NEW_PAIR_1M_99K_PERCENT_4M_SHADOW_WORKFLOW',
  discovery:Object.freeze({
    maxAgeSeconds:120,
    minGmgn1mChangePct:99000,
    requireExactGmgnTrend:true,
    requireTrendFeed:true,
    requireNewPair:true,
    marketCapGate:false
  }),
  sizing:Object.freeze({mode:'LIQUIDITY_PROPORTIONAL_RESEARCH',solPerLiquidityUsd:4/10000,epistemic:'USER_HYPOTHESIS_NOT_LIVE_SAFE_LIMIT'}),
  exit:Object.freeze({fixedHoldSeconds:240,closeOnLiquidityDeath:true,requireLiquidityBackedSettlement:true}),
  observation:Object.freeze({
    checkpointsSeconds:Object.freeze([60,120,180,240]),
    exitComparisonsSeconds:Object.freeze([240]),
    fixedHoldSeconds:240,
    trackLiquidityDecay:true,
    trackMfeMae:true,
    trackFees:true,
    trackPriceImpact:true,
    trackExitLiquidity:true
  }),
  telemetry:Object.freeze([
    'candidateAgeSeconds','gmgn1mChangePct','liquidityUsd','sizeSol','entryPrice',
    'priceImpactBps','feesQuote','mfeReturnPct','maeReturnPct','liquidityDecayPct',
    'exitLiquidityUsd','targetHoldSeconds','actualHoldSeconds','exitProceedsQuote',
    'grossPnl','netPnl','exitReason'
  ]),
  validation:Object.freeze({baselineImmutable:true,compareAgainstManualTrades:true,optimizeOnlyAfterBaselineEvidence:true,variantsMustRunInParallel:true})
});

export function jonasCloneSizeSol(liquidityUsd,{minSol=0,maxSol=80}={}){
  const liq=Number(liquidityUsd);
  if(!Number.isFinite(liq)||liq<=0)return null;
  return Math.max(minSol,Math.min(maxSol,liq*(4/10000)));
}

export function jonasCloneEligible(row={}){
  const rawAge=row.ageSeconds??row.tokenAgeSeconds;
  const age=rawAge==null?NaN:Number(rawAge);
  const green=Number(row.gmgn1mChangePct??row.greenPercent??row.gmgnDisplayedChangePct??row.priceChangeSelectedPct);
  const exact=row.exactGmgnTrend===true||row.gmgnExactTrend===true;
  const trendVisible=row.trendFeed===true||row.signalTrending===true||row.w6TrendVisible===true;
  const newPairVisible=row.signalNewPair===true&&trendVisible;
  return Number.isFinite(age)&&age>=0&&age<120&&exact&&newPairVisible&&Number.isFinite(green)&&green>=99000;
}

export function jonasCloneResearchPlan(row={}){
  if(!jonasCloneEligible(row))return Object.freeze({eligible:false,execution:'SHADOW_ONLY',canExecuteLive:false});
  const liquidityUsd=Number(row.liquidityUsd??row.liquidity);
  return Object.freeze({
    eligible:true,
    priority:'P0',
    execution:'SHADOW_ONLY',
    canExecuteLive:false,
    sizeSol:jonasCloneSizeSol(liquidityUsd),
    gmgn1mChangePct:Number(row.gmgn1mChangePct??row.greenPercent??row.gmgnDisplayedChangePct??row.priceChangeSelectedPct),
    checkpointsSeconds:[60,120,180,240],
    exitComparisonsSeconds:[240],
    fixedHoldSeconds:240,
    liquidityDecaySignal:true
  });
}
