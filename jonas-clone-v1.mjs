export const JONAS_CLONE_V1_VERSION='JONAS_CLONE_V1';
export const JONAS_CLONE_PRIORITY='P0';

export const JONAS_CLONE_V1_POLICY=Object.freeze({
  version:JONAS_CLONE_V1_VERSION,
  priority:JONAS_CLONE_PRIORITY,
  execution:'SHADOW_ONLY',
  canExecute:false,
  canExecuteLive:false,
  automaticPrimaryMutation:false,
  objective:'REPRODUCE_AND_MEASURE_USER_ULTRA_EARLY_MEMECOIN_WORKFLOW_BEFORE_OPTIMIZATION',
  discovery:Object.freeze({maxAgeSeconds:120,minMarketCapUsd:99000,requireTrendFeed:false}),
  sizing:Object.freeze({mode:'LIQUIDITY_PROPORTIONAL_RESEARCH',solPerLiquidityUsd:4/10000,epistemic:'USER_HYPOTHESIS_NOT_LIVE_SAFE_LIMIT'}),
  observation:Object.freeze({checkpointsSeconds:Object.freeze([60,120,180,240,300,600]),exitComparisonsSeconds:Object.freeze([180,240,300,600]),minimumNormalLossExitSeconds:180,trackLiquidityDecay:true,trackMfeMae:true,trackFees:true,trackPriceImpact:true,trackExitLiquidity:true}),
  telemetry:Object.freeze(['candidateAgeSeconds','marketCapUsd','liquidityUsd','sizeSol','entryPrice','priceImpactBps','feesQuote','mfeReturnPct','maeReturnPct','liquidityDecayPct','exitLiquidityUsd','holdSeconds','grossPnl','netPnl','exitReason']),
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
  const mcap=Number(row.marketCapUsd??row.marketCap);
  return Number.isFinite(age)&&age>=0&&age<120&&Number.isFinite(mcap)&&mcap>=99000;
}

export function jonasCloneResearchPlan(row={}){
  if(!jonasCloneEligible(row))return Object.freeze({eligible:false,execution:'SHADOW_ONLY',canExecuteLive:false});
  const liquidityUsd=Number(row.liquidityUsd??row.liquidity);
  return Object.freeze({eligible:true,priority:'P0',execution:'SHADOW_ONLY',canExecuteLive:false,sizeSol:jonasCloneSizeSol(liquidityUsd),checkpointsSeconds:[60,120,180,240,300,600],exitComparisonsSeconds:[180,240,300,600],liquidityDecaySignal:true});
}
