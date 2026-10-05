export const EARLY_MOMENTUM_CHALLENGER_VERSION='BIGGJ_EARLY_MOMENTUM_CHALLENGER_V1';

export const EARLY_MOMENTUM_CHALLENGER_POLICY=Object.freeze({
  version:EARLY_MOMENTUM_CHALLENGER_VERSION,
  execution:'SHADOW_ONLY',
  canExecute:false,
  canExecuteLive:false,
  automaticPrimaryMutation:false,
  baselineImmutable:true,
  epistemic:'EXTERNAL_SYNTHETIC_BENCHMARK_HYPOTHESIS_REQUIRES_POINT_IN_TIME_SHADOW_VALIDATION',
  purpose:'TEST_ENTRY_AGE_HOLD_TIME_AND_SIZE_VS_LIQUIDITY_WITHOUT_CHANGING_PRIMARY_POLICY',
  holdTargetsSeconds:Object.freeze([30,60,120,180,240,300,480]),
  userSizeHypothesis:'4_SOL_PER_10K_USD_LIQUIDITY_IS_CHALLENGER_NOT_TRUTH'
});

function finite(v,fallback=null){
  if(v===null||v===undefined||v==='')return fallback;
  const n=Number(v);
  return Number.isFinite(n)?n:fallback;
}
function clamp(v,a=0,b=1){return Math.max(a,Math.min(b,Number(v)||0));}
function freeze(v){
  if(v&&typeof v==='object'&&!Object.isFrozen(v)){
    Object.freeze(v);
    for(const x of Object.values(v))freeze(x);
  }
  return v;
}
function uniquePositive(values=[]){
  return [...new Set(values.map(x=>finite(x)).filter(x=>x>0))].sort((a,b)=>a-b);
}

export function earlyMomentumAgeBucket(ageSeconds){
  const x=finite(ageSeconds);
  if(x==null)return 'AGE_UNKNOWN';
  if(x<60)return 'AGE_LT1M';
  if(x<180)return 'AGE_1_3M';
  if(x<300)return 'AGE_3_5M';
  if(x<600)return 'AGE_5_10M';
  return 'AGE_10M_PLUS';
}

export function earlyMomentumLiquidityBucket(liquidityUsd){
  const x=finite(liquidityUsd);
  if(x==null)return 'LIQ_UNKNOWN';
  if(x<5_000)return 'LIQ_LT5K';
  if(x<10_000)return 'LIQ_5_10K';
  if(x<20_000)return 'LIQ_10_20K';
  if(x<40_000)return 'LIQ_20_40K';
  if(x<75_000)return 'LIQ_40_75K';
  return 'LIQ_75K_PLUS';
}

export function earlyMomentumSizeGrid(liquidityUsd,{includeUserHypothesis=true,maxSol=80}={}){
  const liq=finite(liquidityUsd);
  let base;
  if(liq==null||liq<=0)base=[.1,.25,.5,1];
  else if(liq<10_000)base=[.1,.25,.5,1];
  else if(liq<20_000)base=[.25,.5,1,2,4];
  else if(liq<40_000)base=[.5,1,2,4,8];
  else if(liq<75_000)base=[1,2,4,8,12];
  else base=[1,2,4,8,16];
  const cap=Math.max(.1,finite(maxSol,80));
  const userHypothesis=liq>0?Math.min(cap,liq*(4/10_000)):null;
  const sizes=uniquePositive([
    ...base.filter(x=>x<=cap),
    ...(includeUserHypothesis&&userHypothesis>0?[userHypothesis]:[])
  ]);
  return freeze({
    liquidityUsd:liq,
    liquidityBucket:earlyMomentumLiquidityBucket(liq),
    sizesSol:sizes,
    userHypothesisSizeSol:userHypothesis,
    userHypothesis:'4_SOL_PER_10K_USD_LIQUIDITY',
    semantics:'RESEARCH_GRID_NOT_LIVE_SIZE_RECOMMENDATION'
  });
}

export function earlyMomentumImpactPct(notionalSol,solPriceUsd,liquidityUsd){
  const n=finite(notionalSol),sol=finite(solPriceUsd),liq=finite(liquidityUsd);
  if(!(n>0&&sol>0&&liq>0))return null;
  const notionalUsd=n*sol;
  const quoteReserveUsd=liq/2;
  return clamp(notionalUsd/(quoteReserveUsd+notionalUsd),0,.95);
}

function scenarioId(holdTargetSeconds,sizeSol){
  return 'H'+String(holdTargetSeconds)+'S_'+String(sizeSol).replace('.','P')+'SOL';
}

export function createEarlyMomentumChallengerLab({
  entryAgeSeconds=null,
  liquidityUsd=null,
  solPriceUsd=null,
  feeBps=30,
  holdTargetsSeconds=EARLY_MOMENTUM_CHALLENGER_POLICY.holdTargetsSeconds,
  sizesSol=null,
  includeUserHypothesis=true
}={}){
  const grid=sizesSol
    ?freeze({liquidityUsd:finite(liquidityUsd),liquidityBucket:earlyMomentumLiquidityBucket(liquidityUsd),sizesSol:uniquePositive(sizesSol),userHypothesisSizeSol:finite(liquidityUsd)>0?finite(liquidityUsd)*(4/10_000):null,userHypothesis:'4_SOL_PER_10K_USD_LIQUIDITY',semantics:'EXPLICIT_RESEARCH_GRID'})
    :earlyMomentumSizeGrid(liquidityUsd,{includeUserHypothesis});
  const holds=uniquePositive(Array.isArray(holdTargetsSeconds)?holdTargetsSeconds:[]);
  const scenarios=[];
  for(const holdTargetSeconds of holds){
    for(const sizeSol of grid.sizesSol){
      scenarios.push({
        id:scenarioId(holdTargetSeconds,sizeSol),
        holdTargetSeconds,
        sizeSol,
        sizeSource:Math.abs(sizeSol-finite(grid.userHypothesisSizeSol,-999))<1e-9?'USER_4_SOL_PER_10K_HYPOTHESIS':'LIQUIDITY_BUCKET_GRID',
        entryImpactPct:earlyMomentumImpactPct(sizeSol,solPriceUsd,liquidityUsd),
        exitImpactPct:null,
        grossPnlSol:null,
        feesSol:null,
        netPnlSol:null,
        capitalEfficiency:null,
        closedAt:null,
        observedCloseHoldSeconds:null,
        status:'OPEN'
      });
    }
  }
  return freeze({
    version:EARLY_MOMENTUM_CHALLENGER_VERSION,
    createdAt:null,
    entryAgeSeconds:finite(entryAgeSeconds),
    entryAgeBucket:earlyMomentumAgeBucket(entryAgeSeconds),
    entryLiquidityUsd:finite(liquidityUsd),
    entryLiquidityBucket:earlyMomentumLiquidityBucket(liquidityUsd),
    solPriceUsdAtEntry:finite(solPriceUsd),
    feeBps:Math.max(0,finite(feeBps,30)),
    sizeGrid:grid,
    scenarios,
    execution:'SHADOW_ONLY',
    canExecute:false,
    canExecuteLive:false,
    automaticPrimaryMutation:false,
    epistemic:EARLY_MOMENTUM_CHALLENGER_POLICY.epistemic
  });
}

export function earlyMomentumFailureDiagnostics({
  entryAgeSeconds=null,
  entryLiquidityUsd=null,
  currentLiquidityUsd=null,
  securityGate='UNKNOWN',
  criticalRiskFlags=[],
  buysM5=null,
  sellsM5=null,
  priceChangeM5=null,
  maxScenarioImpactPct=null
}={}){
  const age=finite(entryAgeSeconds);
  const entryLiq=finite(entryLiquidityUsd);
  const currentLiq=finite(currentLiquidityUsd);
  const gate=String(securityGate||'UNKNOWN').toUpperCase();
  const critical=Array.isArray(criticalRiskFlags)?criticalRiskFlags:[];
  const buys=Math.max(0,finite(buysM5,0));
  const sells=Math.max(0,finite(sellsM5,0));
  const momentum=finite(priceChangeM5);
  const impact=finite(maxScenarioImpactPct);

  const lateEntryRisk=age==null?.5:age<180?.10:age<300?.60:age<600?.82:.95;
  let rugRisk=.20;
  if(gate==='ABSTAIN'||critical.length)rugRisk=1;
  else if(gate==='PASS')rugRisk=.08;
  if(entryLiq!=null&&entryLiq<5_000)rugRisk=Math.max(rugRisk,.80);
  else if(entryLiq!=null&&entryLiq<10_000)rugRisk=Math.max(rugRisk,.55);

  const pressureTotal=buys+sells;
  const buyShare=pressureTotal>0?buys/pressureTotal:null;
  let falseMomentumRisk=.35;
  if(momentum!=null&&momentum>60&&buyShare!=null&&buyShare<.60)falseMomentumRisk=.85;
  else if(momentum!=null&&momentum>25&&buyShare!=null&&buyShare<.55)falseMomentumRisk=.70;
  else if(momentum!=null&&momentum>0&&buyShare!=null&&buyShare>=.65)falseMomentumRisk=.18;
  else if(momentum!=null&&momentum<=0)falseMomentumRisk=.65;

  const liquidityDecayPct=entryLiq>0&&currentLiq!=null?(entryLiq-currentLiq)/entryLiq:null;
  const liquidityDecayRisk=liquidityDecayPct==null?.35:clamp((liquidityDecayPct+.05)/.65,0,1);
  const executionRisk=impact==null?.50:clamp(impact/.10,0,1);
  const researchQualityScore=clamp(1-(.22*lateEntryRisk+.25*rugRisk+.20*falseMomentumRisk+.18*liquidityDecayRisk+.15*executionRisk));

  return freeze({
    lateEntryRisk,
    rugRisk,
    falseMomentumRisk,
    liquidityDecayRisk,
    executionRisk,
    liquidityDecayPct,
    researchQualityScore,
    scoreSemantics:'HEURISTIC_DIAGNOSTIC_NOT_WIN_PROBABILITY',
    evidenceClass:'MODELLED',
    execution:'SHADOW_ONLY',
    canExecuteLive:false
  });
}

export function updateEarlyMomentumChallengerLab(lab,{
  now=Date.now(),
  holdSeconds=0,
  returnPct=null,
  currentLiquidityUsd=null,
  solPriceUsd=null,
  feeBps=null,
  securityGate='UNKNOWN',
  criticalRiskFlags=[],
  buysM5=null,
  sellsM5=null,
  priceChangeM5=null
}={}){
  if(!lab||lab.version!==EARLY_MOMENTUM_CHALLENGER_VERSION)return lab;
  const hold=Math.max(0,finite(holdSeconds,0));
  const ret=finite(returnPct);
  const fee=Math.max(0,finite(feeBps,lab.feeBps??30));
  const feeRate=fee/10_000*2;
  const exitLiq=finite(currentLiquidityUsd);
  const sol=finite(solPriceUsd,finite(lab.solPriceUsdAtEntry));
  let newCloses=0;
  const scenarios=(lab.scenarios||[]).map(s=>{
    if(s?.status==='CLOSED')return s;
    const size=Math.max(0,finite(s?.sizeSol,0));
    const exitImpactPct=earlyMomentumImpactPct(size,sol,exitLiq);
    if(hold<Math.max(0,finite(s?.holdTargetSeconds,0))||ret==null){
      return {...s,exitImpactPct};
    }
    const entryImpactPct=finite(s?.entryImpactPct);
    const grossPnlSol=size*ret;
    const feesSol=size*feeRate;
    const capitalEfficiency=entryImpactPct==null||exitImpactPct==null
      ?null
      :((1+ret)*(1-entryImpactPct)*(1-exitImpactPct)-1-feeRate);
    const netPnlSol=capitalEfficiency==null?null:size*capitalEfficiency;
    newCloses++;
    return {
      ...s,
      exitImpactPct,
      grossPnlSol,
      feesSol,
      netPnlSol,
      capitalEfficiency,
      closedAt:Number(now),
      observedCloseHoldSeconds:hold,
      status:'CLOSED'
    };
  });
  const maxScenarioImpactPct=scenarios.reduce((m,s)=>{
    const a=finite(s?.entryImpactPct),b=finite(s?.exitImpactPct);
    return Math.max(m,a??0,b??0);
  },0);
  const diagnostics=earlyMomentumFailureDiagnostics({
    entryAgeSeconds:lab.entryAgeSeconds,
    entryLiquidityUsd:lab.entryLiquidityUsd,
    currentLiquidityUsd:exitLiq,
    securityGate,
    criticalRiskFlags,
    buysM5,
    sellsM5,
    priceChangeM5,
    maxScenarioImpactPct
  });
  return freeze({
    ...lab,
    updatedAt:Number(now),
    lastObservedHoldSeconds:hold,
    lastObservedReturnPct:ret,
    lastObservedLiquidityUsd:exitLiq,
    scenarios,
    newCloses,
    diagnostics
  });
}

function bestRow(rows,field){
  return rows.filter(x=>finite(x?.[field])!=null).slice().sort((a,b)=>finite(b?.[field],-Infinity)-finite(a?.[field],-Infinity))[0]||null;
}
function compactScenario(x){
  return x?freeze({
    id:x.id,
    holdTargetSeconds:x.holdTargetSeconds,
    observedCloseHoldSeconds:x.observedCloseHoldSeconds,
    sizeSol:x.sizeSol,
    sizeSource:x.sizeSource,
    grossPnlSol:x.grossPnlSol,
    feesSol:x.feesSol,
    netPnlSol:x.netPnlSol,
    capitalEfficiency:x.capitalEfficiency,
    entryImpactPct:x.entryImpactPct,
    exitImpactPct:x.exitImpactPct
  }):null;
}

export function summarizeEarlyMomentumChallengerLab(lab={}){
  const rows=Array.isArray(lab?.scenarios)?lab.scenarios:[];
  const closed=rows.filter(x=>x?.status==='CLOSED');
  const bestEfficiency=bestRow(closed,'capitalEfficiency');
  const bestAbsolute=bestRow(closed,'netPnlSol');
  const userRows=closed.filter(x=>x?.sizeSource==='USER_4_SOL_PER_10K_HYPOTHESIS');
  const bestUser=bestRow(userRows,'netPnlSol');
  const byHold={};
  for(const x of closed){
    const k=String(x.holdTargetSeconds);
    const list=closed.filter(y=>y.holdTargetSeconds===x.holdTargetSeconds);
    byHold[k]=compactScenario(bestRow(list,'netPnlSol'));
  }
  return freeze({
    version:EARLY_MOMENTUM_CHALLENGER_VERSION,
    scenarios:rows.length,
    open:rows.length-closed.length,
    closed:closed.length,
    bestCapitalEfficiency:compactScenario(bestEfficiency),
    bestAbsoluteNetPnl:compactScenario(bestAbsolute),
    bestUser4SolPer10kHypothesis:compactScenario(bestUser),
    bestByHoldSeconds:byHold,
    diagnostics:lab?.diagnostics||null,
    entryAgeBucket:lab?.entryAgeBucket||'AGE_UNKNOWN',
    entryLiquidityBucket:lab?.entryLiquidityBucket||'LIQ_UNKNOWN',
    baselineImmutable:true,
    automaticPrimaryMutation:false,
    execution:'SHADOW_ONLY',
    canExecute:false,
    canExecuteLive:false,
    semantics:'COUNTERFACTUAL_RESEARCH_ONLY_SYNTHETIC_BENCHMARK_HYPOTHESES_REQUIRE_LIVE_SHADOW_EVIDENCE'
  });
}
