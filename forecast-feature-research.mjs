import path from 'node:path';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';

import { sha256 } from './institutional-kernel.mjs';
import { evaluateForecastFeatureExtensionWalkForward } from './forecast-candidate-lab.mjs';

export const FORECAST_FEATURE_RESEARCH_VERSION='TCX_FORECAST_FEATURE_RESEARCH_V1';

export const DEFAULT_FEATURE_RESEARCH_POLICY=Object.freeze({
  minSeedRows:40,
  minCases:200,
  minIndependentEpisodes:80,
  familyAlpha:.05,
  minBrierImprovement:.005,
  maxLogLossRegression:.01,
  maxHighConfidenceWrongRateRegression:.02,
  maxCoverageErrorRegression:.02,
  targetIntervalCoverage:.80,
  permutationIterations:2048,
  bootstrapIterations:1200
});

export const DEFAULT_RESEARCH_FEATURES=Object.freeze([
  Object.freeze({
    id:'FUNDING_RATE',
    label:'Funding Rate',
    featureIds:Object.freeze(['research.derivatives.fundingRate'])
  }),
  Object.freeze({
    id:'PREMIUM',
    label:'Perpetual Premium',
    featureIds:Object.freeze(['research.derivatives.premiumPct'])
  }),
  Object.freeze({
    id:'OPEN_INTEREST',
    label:'Open Interest 5m',
    featureIds:Object.freeze(['research.derivatives.openInterestDelta5m'])
  }),
  Object.freeze({
    id:'LONG_SHORT',
    label:'Global Long/Short',
    featureIds:Object.freeze(['research.derivatives.globalLongShortRatio'])
  }),
  Object.freeze({
    id:'TAKER_FLOW',
    label:'Taker Buy/Sell',
    featureIds:Object.freeze(['research.derivatives.takerBuySellRatio'])
  }),
  Object.freeze({
    id:'FUNDING_VENUE_SPREAD',
    label:'Funding Venue Spread',
    featureIds:Object.freeze(['research.derivatives.fundingRateVenueSpread'])
  }),
  Object.freeze({
    id:'LIQUIDATION_IMBALANCE',
    label:'Liquidation Imbalance 5m',
    featureIds:Object.freeze(['research.liquidation.imbalance5m'])
  }),
  Object.freeze({
    id:'LIQUIDATION_INTENSITY',
    label:'Liquidation Intensity 5m',
    featureIds:Object.freeze(['research.liquidation.logUsd5m'])
  }),
  Object.freeze({
    id:'LIQUIDATION_CONCENTRATION',
    label:'Liquidation Concentration 5m',
    featureIds:Object.freeze(['research.liquidation.concentration5m'])
  }),
  Object.freeze({
    id:'LIQUIDATION_COUNT',
    label:'Liquidation Count 5m',
    featureIds:Object.freeze(['research.liquidation.logCount5m'])
  }),
  Object.freeze({
    id:'BTC_MEMPOOL_PRESSURE',
    label:'BTC Mempool Pressure',
    featureIds:Object.freeze(['research.onchain.btc.mempoolLogCount'])
  }),
  Object.freeze({
    id:'BTC_FEE_PRESSURE',
    label:'BTC Fee Pressure',
    featureIds:Object.freeze(['research.onchain.btc.fastestFeeSatVb'])
  }),
  Object.freeze({
    id:'ETH_GAS_UTILIZATION',
    label:'ETH Gas Utilization',
    featureIds:Object.freeze(['research.onchain.eth.gasUtilization'])
  }),
  Object.freeze({
    id:'ETH_BASE_FEE',
    label:'ETH Base Fee',
    featureIds:Object.freeze(['research.onchain.eth.baseFeeGwei'])
  }),
  Object.freeze({
    id:'ETH_LARGE_NATIVE_TRANSFER',
    label:'ETH Large Native Transfer Activity',
    featureIds:Object.freeze(['research.onchain.eth.largeNativeTransferLogEth'])
  }),
  Object.freeze({
    id:'SOL_TPS',
    label:'SOL Network Throughput',
    featureIds:Object.freeze(['research.onchain.sol.tps'])
  }),
  Object.freeze({
    id:'SOL_PRIORITY_FEE',
    label:'SOL Priority Fee',
    featureIds:Object.freeze(['research.onchain.sol.priorityFeeMedian'])
  }),
  Object.freeze({
    id:'ENTITY_FLOW_NET_5M',
    label:'Verified Entity Net Flow 5m',
    featureIds:Object.freeze(['research.entityflow.eth.netExternal5m'])
  }),
  Object.freeze({
    id:'ENTITY_FLOW_GROSS_5M',
    label:'Verified Entity Gross Flow 5m',
    featureIds:Object.freeze(['research.entityflow.eth.grossExternal5m'])
  }),
  Object.freeze({
    id:'ENTITY_FLOW_INFLOW_SHARE_5M',
    label:'Verified Entity Inflow Share 5m',
    featureIds:Object.freeze(['research.entityflow.eth.inflowShare5m'])
  }),
  Object.freeze({
    id:'ENTITY_FLOW_ANOMALY_5M',
    label:'Verified Entity Flow Anomaly 5m',
    featureIds:Object.freeze(['research.entityflow.eth.grossAnomaly5m'])
  })
]);

export const WALLET_RESEARCH_FEATURES=Object.freeze([
  Object.freeze({
    id:'WALLET_ACTIVITY_5M',
    label:'Wallet Cohort Activity 5m',
    featureIds:Object.freeze(['research.wallet.activity5m'])
  }),
  Object.freeze({
    id:'WALLET_ACTIVITY_15M',
    label:'Wallet Cohort Activity 15m',
    featureIds:Object.freeze(['research.wallet.activity15m'])
  }),
  Object.freeze({
    id:'WALLET_NATIVE_NET_FLOW',
    label:'Wallet Cohort Native Net Flow',
    featureIds:Object.freeze(['research.wallet.nativeNetFlowSignedLog'])
  }),
  Object.freeze({
    id:'WALLET_NATIVE_GROSS_FLOW',
    label:'Wallet Cohort Native Gross Flow',
    featureIds:Object.freeze(['research.wallet.nativeGrossFlowLog'])
  })
]);

function finite(v){ const n=Number(v); return Number.isFinite(n)?n:null; }
function clone(v){ return structuredClone(v); }
function mean(xs){
  const ys=(Array.isArray(xs)?xs:[]).map(finite).filter(x=>x!=null);
  return ys.length?ys.reduce((a,b)=>a+b,0)/ys.length:null;
}
function quantile(xs,q){
  const ys=(Array.isArray(xs)?xs:[]).map(finite).filter(x=>x!=null).sort((a,b)=>a-b);
  if(!ys.length) return null;
  const pos=(ys.length-1)*Math.max(0,Math.min(1,Number(q)));
  const lo=Math.floor(pos),hi=Math.ceil(pos),w=pos-lo;
  return ys[lo]*(1-w)+ys[hi]*w;
}
function seed32(value){
  const h=sha256(String(value));
  return (parseInt(h.slice(0,8),16)>>>0)||0x9e3779b9;
}
function prng(seed){
  let a=seed>>>0;
  return ()=>{
    a=(a+0x6D2B79F5)>>>0;
    let t=a;
    t=Math.imul(t^(t>>>15),t|1);
    t^=t+Math.imul(t^(t>>>7),t|61);
    return ((t^(t>>>14))>>>0)/4294967296;
  };
}
function bootstrapMeanCi(values,{iterations,seed,alpha=.05}){
  const xs=(values||[]).map(Number).filter(Number.isFinite);
  if(xs.length<2) return {lower:null,upper:null,iterations:0};
  const rand=prng(seed32('feature-bootstrap:'+seed));
  const reps=[],n=xs.length;
  const it=Math.max(200,Math.floor(Number(iterations)||1200));
  for(let b=0;b<it;b++){
    let s=0;
    for(let i=0;i<n;i++) s+=xs[Math.floor(rand()*n)];
    reps.push(s/n);
  }
  return {lower:quantile(reps,alpha/2),upper:quantile(reps,1-alpha/2),iterations:it};
}
function permutationP(values,{iterations,seed}){
  const xs=(values||[]).map(Number).filter(Number.isFinite);
  if(xs.length<2) return 1;
  const observed=mean(xs);
  if(observed==null||observed>=0) return 1;
  const rand=prng(seed32('feature-permutation:'+seed));
  const it=Math.max(256,Math.floor(Number(iterations)||2048));
  let extreme=0;
  for(let b=0;b<it;b++){
    let s=0;
    for(const x of xs) s+=(rand()<.5?-x:x);
    if((s/xs.length)<=observed) extreme++;
  }
  return (extreme+1)/(it+1);
}
function holmAdjust(rows){
  const sorted=[...rows].sort((a,b)=>a.rawP-b.rawP||a.id.localeCompare(b.id));
  let running=0;
  const out=new Map();
  for(let i=0;i<sorted.length;i++){
    const adjusted=Math.min(1,Math.max(running,(sorted.length-i)*sorted[i].rawP));
    running=adjusted;
    out.set(sorted[i].id,adjusted);
  }
  return out;
}

export function featureResearchRowsFromJournal(entries){
  const rows=[];
  for(const e of Array.isArray(entries)?entries:[]){
    if(e?.status!=='RESOLVED'||!e?.resolution) continue;
    const timestamp=finite(e.asOf);
    const resolvedAt=finite(e.resolution.resolvedAt);
    const forwardReturn=finite(e.resolution.actualReturn);
    const horizonMs=finite(e.horizonMs);
    if(timestamp==null||resolvedAt==null||forwardReturn==null||horizonMs==null) continue;
    rows.push({
      id:'feature:'+String(e.id),
      symbol:String(e.symbol),
      timestamp,
      availableAt:timestamp,
      resolvedAt,
      horizonMs,
      regimeId:String(e.regimeId||'UNKNOWN'),
      // Read-only research projection: keep the journal feature-map reference here.
      // Candidate evaluators clone only the rows/features they actually consume,
      // avoiding a second deep copy of every wide technical-indicator vector.
      features:e.features||{},
      forwardReturn,
      quality:finite(e.dataQuality)??1
    });
  }
  rows.sort((a,b)=>a.timestamp-b.timestamp||a.horizonMs-b.horizonMs||a.id.localeCompare(b.id));
  return rows;
}

function eligibleSeedRows(rows,featureIds,cutoff=Infinity){
  return rows.filter(r=>
    Number(r.resolvedAt)<=Number(cutoff)&&
    featureIds.every(id=>Number.isFinite(Number(r.features?.[id])))
  );
}

export function createFeatureResearchRound({
  journalEntries,
  incumbentConfig,
  features=DEFAULT_RESEARCH_FEATURES,
  generationNumber=1,
  now=Date.now(),
  policy=DEFAULT_FEATURE_RESEARCH_POLICY
}={}){
  const t=finite(now);
  if(t==null) throw new Error('now must be finite');
  const p={...DEFAULT_FEATURE_RESEARCH_POLICY,...policy};
  const rows=featureResearchRowsFromJournal(journalEntries);
  const defs=(Array.isArray(features)?features:[]).map(f=>({
    id:String(f.id),
    label:String(f.label||f.id),
    featureIds:[...(f.featureIds||[])].map(String)
  })).filter(f=>f.id&&f.featureIds.length);
  if(!defs.length) throw new Error('feature definitions required');

  const coverage=defs.map(f=>{
    const xs=eligibleSeedRows(rows,f.featureIds,t);
    return {id:f.id,cases:xs.length,lastResolvedAt:xs.at(-1)?.resolvedAt??null};
  });
  const allReady=coverage.every(x=>x.cases>=Number(p.minSeedRows));
  if(!allReady){
    return Object.freeze({
      version:FORECAST_FEATURE_RESEARCH_VERSION,
      status:'COLLECTING_SEED',
      generationNumber:Math.max(1,Math.floor(Number(generationNumber)||1)),
      createdAt:t,
      incumbentConfigHash:sha256(incumbentConfig),
      policy:Object.freeze(p),
      dataCutoffAt:null,
      coverage:Object.freeze(coverage),
      experiments:Object.freeze(defs.map(f=>Object.freeze({
        ...f,status:'COLLECTING_SEED',lastEvaluation:null,decision:null
      }))),
      executionMode:'SHADOW_ONLY',
      productionMutationPerformed:false
    });
  }

  const cutoff=Math.max(...coverage.map(x=>Number(x.lastResolvedAt)));
  const generationCore={
    generationNumber:Math.max(1,Math.floor(Number(generationNumber)||1)),
    createdAt:t,
    dataCutoffAt:cutoff,
    incumbentConfigHash:sha256(incumbentConfig),
    experiments:defs.map(x=>({id:x.id,featureIds:x.featureIds}))
  };
  const generationId='FEAT-'+sha256(generationCore).slice(0,20).toUpperCase();
  return Object.freeze({
    version:FORECAST_FEATURE_RESEARCH_VERSION,
    status:'ACTIVE',
    generationId,
    ...generationCore,
    policy:Object.freeze(p),
    coverage:Object.freeze(coverage),
    experiments:Object.freeze(defs.map(f=>Object.freeze({
      ...f,status:'SHADOW_TESTING',lastEvaluation:null,decision:null
    }))),
    decisionLookAt:null,
    executionMode:'SHADOW_ONLY',
    productionMutationPerformed:false
  });
}

function metricsFinite(m){
  return m&&[
    m.brier,m.logLoss,m.intervalCoverage,m.highConfidenceWrongRate
  ].every(x=>finite(x)!=null);
}
function coverageError(m,target){
  return Math.abs(Number(m.intervalCoverage)-Number(target));
}

export function advanceFeatureResearchRound(state,{
  journalEntries,
  incumbentConfig,
  now=Date.now(),
  minimumTrainCases=40
}={}){
  if(!state||state.version!==FORECAST_FEATURE_RESEARCH_VERSION) throw new Error('feature research state invalid');
  const t=finite(now);
  if(t==null) throw new Error('now must be finite');
  if(state.incumbentConfigHash!==sha256(incumbentConfig)){
    return Object.freeze({...clone(state),status:'INTEGRITY_HOLD',integrityReason:'INCUMBENT_CONFIG_CHANGED'});
  }
  if(state.status==='COLLECTING_SEED'){
    return createFeatureResearchRound({
      journalEntries,
      incumbentConfig,
      features:state.experiments,
      generationNumber:state.generationNumber,
      now:t,
      policy:state.policy
    });
  }
  if(state.status!=='ACTIVE') return Object.freeze(clone(state));

  const rows=featureResearchRowsFromJournal(journalEntries);
  const evaluated=[];
  let allDecisionReady=true;

  for(const exp of state.experiments){
    let wf=null;
    try{
      wf=evaluateForecastFeatureExtensionWalkForward({
        historyRows:rows,
        incumbentConfig,
        addedFeatureIds:exp.featureIds,
        dataCutoffAt:state.dataCutoffAt,
        asOf:t,
        minimumTrainCases
      });
    }catch(err){
      evaluated.push({...clone(exp),status:'EVALUATION_ERROR',lastError:err instanceof Error?err.message:String(err)});
      allDecisionReady=false;
      continue;
    }
    const ev=wf.evaluation;
    const paired=wf.diagnostics?.pairedIndependent||[];
    const ready=
      metricsFinite(ev?.candidate)&&
      metricsFinite(ev?.incumbent)&&
      ev.cases>=Number(state.policy.minCases)&&
      ev.independentEpisodes>=Number(state.policy.minIndependentEpisodes)&&
      paired.length>=Number(state.policy.minIndependentEpisodes);
    if(!ready) allDecisionReady=false;
    evaluated.push({
      ...clone(exp),
      status:ready?'DECISION_READY':(ev?.cases>0?'MEASURING':'SHADOW_TESTING'),
      lastEvaluation:wf,
      decision:null
    });
  }

  if(!allDecisionReady){
    return Object.freeze({
      ...clone(state),
      experiments:Object.freeze(evaluated.map(Object.freeze)),
      lastEvaluatedAt:t,
      productionMutationPerformed:false
    });
  }

  const prepared=evaluated.map(exp=>{
    const ev=exp.lastEvaluation.evaluation;
    const paired=exp.lastEvaluation.diagnostics.pairedIndependent;
    const brierDeltas=paired.map(x=>Number(x.deltas.brier));
    const stats={
      meanBrierDelta:mean(brierDeltas),
      brierCi95:bootstrapMeanCi(brierDeltas,{
        iterations:state.policy.bootstrapIterations,
        seed:state.generationId+':'+exp.id,
        alpha:.05
      }),
      rawP:permutationP(brierDeltas,{
        iterations:state.policy.permutationIterations,
        seed:state.generationId+':'+exp.id
      })
    };
    return {exp,ev,stats};
  });
  const adjusted=holmAdjust(prepared.map(x=>({id:x.exp.id,rawP:x.stats.rawP})));
  const decided=[];

  for(const x of prepared){
    const p=state.policy;
    const adj=adjusted.get(x.exp.id)??1;
    const candidate=x.ev.candidate,incumbent=x.ev.incumbent;
    const logLossDelta=Number(candidate.logLoss)-Number(incumbent.logLoss);
    const hcWrongDelta=Number(candidate.highConfidenceWrongRate)-Number(incumbent.highConfidenceWrongRate);
    const covDelta=coverageError(candidate,p.targetIntervalCoverage)-coverageError(incumbent,p.targetIntervalCoverage);
    const reasons=[];
    if(!(Number(x.stats.meanBrierDelta)<=-Number(p.minBrierImprovement))) reasons.push('BRIER_IMPROVEMENT_TOO_SMALL');
    if(!(adj<=Number(p.familyAlpha))) reasons.push('MULTIPLE_TESTING_NOT_SIGNIFICANT');
    if(!(finite(x.stats.brierCi95.upper)!=null&&Number(x.stats.brierCi95.upper)<0)) reasons.push('BRIER_CI_CROSSES_ZERO');
    if(logLossDelta>Number(p.maxLogLossRegression)) reasons.push('LOG_LOSS_REGRESSION');
    if(hcWrongDelta>Number(p.maxHighConfidenceWrongRateRegression)) reasons.push('HIGH_CONFIDENCE_WRONG_RATE_REGRESSION');
    if(covDelta>Number(p.maxCoverageErrorRegression)) reasons.push('INTERVAL_COVERAGE_REGRESSION');

    const status=reasons.length?'REJECTED':'SUPPORTED';
    const evidenceCore={
      version:'TCX_FEATURE_RESEARCH_EVIDENCE_V1',
      generationId:state.generationId,
      experimentId:x.exp.id,
      label:x.exp.label,
      featureIds:x.exp.featureIds,
      trainingCutoffAt:state.dataCutoffAt,
      evaluatedAt:t,
      cases:x.ev.cases,
      independentEpisodes:x.ev.independentEpisodes,
      metrics:{candidate,incumbent,deltas:x.ev.deltas},
      statistics:{
        meanBrierDelta:x.stats.meanBrierDelta,
        brierCi95:x.stats.brierCi95,
        rawPermutationP:x.stats.rawP,
        holmAdjustedP:adj,
        familyAlpha:Number(p.familyAlpha)
      },
      decision:status,
      reasons,
      restrictions:{
        mayMutateProductionForecast:false,
        mayExecute:false
      }
    };
    decided.push(Object.freeze({
      ...clone(x.exp),
      status,
      decision:Object.freeze({
        evidenceId:sha256(evidenceCore),
        ...evidenceCore
      })
    }));
  }

  return Object.freeze({
    ...clone(state),
    status:decided.some(x=>x.status==='SUPPORTED')?'COMPLETE_SUPPORTED_FEATURES':'COMPLETE_NO_SUPPORTED_FEATURES',
    experiments:Object.freeze(decided),
    lastEvaluatedAt:t,
    decisionLookAt:t,
    productionMutationPerformed:false
  });
}

export function featureResearchSummary(state){
  const experiments=(state?.experiments||[]).map(x=>({
    id:x.id,
    label:x.label,
    featureIds:x.featureIds,
    status:x.status,
    cases:Number(x.lastEvaluation?.evaluation?.cases??0),
    independentEpisodes:Number(x.lastEvaluation?.evaluation?.independentEpisodes??0),
    candidateMetrics:x.lastEvaluation?.evaluation?.candidate??null,
    incumbentMetrics:x.lastEvaluation?.evaluation?.incumbent??null,
    decision:x.decision?{
      evidenceId:x.decision.evidenceId,
      holmAdjustedP:finite(x.decision.statistics?.holmAdjustedP),
      meanBrierDelta:finite(x.decision.statistics?.meanBrierDelta),
      reasons:x.decision.reasons||[]
    }:null
  }));
  return {
    version:FORECAST_FEATURE_RESEARCH_VERSION,
    status:String(state?.status||'UNINITIALIZED'),
    generationId:state?.generationId??null,
    generationNumber:Number(state?.generationNumber??0),
    dataCutoffAt:finite(state?.dataCutoffAt),
    coverage:state?.coverage??[],
    experiments,
    supported:experiments.filter(x=>x.status==='SUPPORTED').map(x=>x.id),
    policy:state?.policy??DEFAULT_FEATURE_RESEARCH_POLICY,
    executionMode:'SHADOW_ONLY',
    productionMutationPerformed:false
  };
}

export async function loadFeatureResearch(filePath){
  await mkdir(path.dirname(filePath),{recursive:true});
  try{
    const raw=await readFile(filePath,'utf8');
    const state=JSON.parse(raw);
    if(state?.version!==FORECAST_FEATURE_RESEARCH_VERSION) throw new Error('unsupported feature research version');
    return state;
  }catch(err){
    if(err?.code==='ENOENT') return null;
    const backup=filePath+'.corrupt-'+Date.now();
    try{ await rename(filePath,backup); }catch{}
    return null;
  }
}

export async function saveFeatureResearch(filePath,state){
  await mkdir(path.dirname(filePath),{recursive:true});
  const tmp=filePath+'.tmp-'+process.pid;
  await writeFile(tmp,JSON.stringify(state,null,2)+'\n',{encoding:'utf8',mode:0o600});
  await rename(tmp,filePath);
  return state;
}
