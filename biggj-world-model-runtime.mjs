import { sha256 } from './institutional-kernel.mjs';
import { buildPointInTimeCorrelation } from './pit-correlation-engine.mjs';
import { buildMarketGraph, buildCapitalRotation } from './world-model-foundation.mjs';
import { discoverLeadLag, buildShockPropagation } from './final-foundation-pack.mjs';
import { buildForecastAccuracyView } from './forecast-accuracy-view.mjs';

export const BIGGJ_WORLD_MODEL_RUNTIME_VERSION='BIGGJ_WORLD_MODEL_RUNTIME_V1';

const finite=(v,f=null)=>{
  if(v===null||v===undefined||v==='') return f;
  const n=Number(v);
  return Number.isFinite(n)?n:f;
};
const txt=(v,f='')=>{
  const s=String(v??'').trim();
  return s||f;
};
const upper=(v,f='UNKNOWN')=>txt(v,f).toUpperCase();
const uniq=xs=>[...new Set((Array.isArray(xs)?xs:[]).map(x=>txt(x)).filter(Boolean))].sort();
const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
const deepFreeze=v=>{
  if(v&&typeof v==='object'&&!Object.isFrozen(v)){
    Object.freeze(v);
    for(const x of Object.values(v)) deepFreeze(x);
  }
  return v;
};
const finalize=core=>deepFreeze({...core,fingerprint:sha256(core)});

function stateAtlas(radarRows=[],asOf){
  return radarRows
    .map(row=>({
      symbol:upper(row?.symbol),
      asOf:finite(row?.capturedAt,asOf),
      state:{
        regime:upper(row?.regime),
        bias:upper(row?.bias),
        status:upper(row?.status),
        gate:upper(row?.gate),
        witnessAgreement:finite(row?.witnessAgreement),
        memorySupport:finite(row?.support,0),
        novelty:finite(row?.novelty),
        contradiction:finite(row?.contradiction),
        evidenceStrength:finite(row?.evidenceStrength)
      },
      epistemicClass:'INFERRED',
      causal:false,
      source:'BIGGJ_RADAR_CACHE'
    }))
    .filter(x=>x.symbol!=='UNKNOWN')
    .sort((a,b)=>a.symbol.localeCompare(b.symbol));
}

function horizonMetrics(evaluation={}){
  return Object.entries(evaluation?.byHorizon||{})
    .map(([horizonId,row])=>({
      horizonId:upper(horizonId),
      samples:finite(row?.count,0),
      directionalAccuracy:finite(row?.directionalAccuracy),
      multiclassBrier:finite(row?.multiclassBrier),
      logLoss:finite(row?.logLoss),
      expectedCalibrationError:finite(row?.expectedCalibrationError),
      intervalCoverage:finite(row?.intervalCoverage),
      highConfidenceWrongRate:finite(row?.highConfidenceWrongRate),
      epistemicClass:'OBSERVED_OUTCOME_STATISTICS'
    }))
    .sort((a,b)=>String(a.horizonId).localeCompare(String(b.horizonId)));
}

function forecastabilityField(entries=[],symbols=[],minSamples=30){
  return symbols.map(symbol=>{
    const view=buildForecastAccuracyView(entries,{
      symbol,
      minDisplaySamples:minSamples,
      foldSize:50,
      highConfidenceThreshold:.65
    });
    const horizons=horizonMetrics(view.evaluation);
    const matureHorizons=horizons.filter(x=>x.samples>=minSamples);
    const gate=upper(view?.gate?.status,'UNKNOWN');
    let status='INSUFFICIENT';
    if(matureHorizons.length){
      status=['CALIBRATED','PASS'].includes(gate)?'CALIBRATED_EVIDENCE':'MEASURED_UNCALIBRATED';
    }
    return {
      symbol,
      status,
      resolved:finite(view?.evaluation?.resolvedCount,0),
      pending:finite(view?.evaluation?.pendingCount,0),
      calibrationGate:gate,
      ready:view.ready===true,
      horizons,
      matureHorizons:matureHorizons.map(x=>x.horizonId),
      epistemicClass:'OBSERVED_FORECAST_PERFORMANCE',
      meaning:'MEASURED_FORECAST_PERFORMANCE_NOT_INTRINSIC_MARKET_PREDICTABILITY'
    };
  }).sort((a,b)=>a.symbol.localeCompare(b.symbol));
}

function associationView(graph={}){
  return {
    status:(graph?.edges||[]).length?'MEASURED_ASSOCIATION':'INSUFFICIENT',
    nodes:clone(graph?.nodes||[]),
    edges:(graph?.edges||[]).map(x=>({
      ...clone(x),
      epistemicClass:'OBSERVED_ASSOCIATION',
      causal:false
    })),
    meaning:'POINT_IN_TIME_ASSOCIATION_GRAPH_NOT_CAUSAL_GRAPH'
  };
}

function informationFlowHypotheses(leadLag={}){
  const links=(leadLag?.links||[]).map(x=>({
    leader:x.leader,
    follower:x.follower,
    lagBars:x.lagBars,
    samples:x.samples,
    rho:x.rho,
    absRho:x.absRho,
    screenStatus:x.status,
    epistemicClass:'HYPOTHESIS',
    causal:false,
    predictivePermission:false
  }));
  const candidates=links.filter(x=>x.screenStatus==='RESEARCH_CANDIDATE');
  return {
    status:candidates.length?'RESEARCH_HYPOTHESES':'INSUFFICIENT',
    candidates,
    screened:links,
    meaning:'LEAD_LAG_SCREEN_GENERATES_INFORMATION_FLOW_HYPOTHESES_NOT_CAUSAL_EDGES'
  };
}

function shockView(shock={}){
  return {
    status:(shock?.origins||[]).length?'OBSERVED_SHOCKS':'NO_ACTIVE_SHOCK',
    origins:clone(shock?.origins||[]),
    associatedWaves:(shock?.waves||[]).map(x=>({
      ...clone(x),
      epistemicClass:'INFERRED_FROM_ASSOCIATION',
      causal:false
    })),
    meaning:'OBSERVED_SHOCK_PLUS_ASSOCIATION_NOT_CAUSAL_PROPAGATION_PROOF'
  };
}

function rotationView(rotation={}){
  return {
    status:upper(rotation?.status,'INSUFFICIENT'),
    classes:clone(rotation?.classes||[]),
    leader:clone(rotation?.leader||null),
    laggard:clone(rotation?.laggard||null),
    rotationStrength:finite(rotation?.rotationStrength),
    epistemicClass:'OBSERVED_CROSS_SECTION',
    actualCapitalFlowProven:false,
    meaning:'RELATIVE_PRICE_ROTATION_NOT_CAPITAL_FLOW_PROOF'
  };
}

export function buildBiggjWorldModelRuntime({
  seriesBySymbol={},
  radarRows=[],
  forecastJournalEntries=[],
  assetClassBySymbol={},
  asOf=Date.now(),
  minCorrelation=.35,
  minForecastSamples=30
}={}){
  const t=finite(asOf);
  if(t==null) throw new Error('BIGGJ_WORLD_MODEL_ASOF_INVALID');

  const pitSeries={};
  for(const [symbol,rows] of Object.entries(seriesBySymbol||{})){
    const usable=(Array.isArray(rows)?rows:[])
      .filter(x=>finite(x?.closeTime)!=null&&finite(x?.close)!=null&&Number(x.closeTime)<=t)
      .sort((a,b)=>Number(a.closeTime)-Number(b.closeTime));
    if(usable.length>=48) pitSeries[upper(symbol)]=usable;
  }
  const symbols=uniq([
    ...Object.keys(pitSeries),
    ...(radarRows||[]).map(x=>upper(x?.symbol)).filter(x=>x!=='UNKNOWN')
  ]);

  const correlation=buildPointInTimeCorrelation(pitSeries,{
    asOf:t,
    window:96,
    minSamples:48,
    threshold:.60,
    stressThreshold:.70,
    stressFraction:.30,
    shrinkageStrength:20
  });
  const graph=buildMarketGraph({
    correlationModel:correlation,
    seriesBySymbol:pitSeries,
    asOf:t,
    minCorrelation
  });
  const rotation=buildCapitalRotation({
    seriesBySymbol:pitSeries,
    assetClassBySymbol,
    asOf:t,
    minAssetsPerClass:2
  });
  const leadLag=discoverLeadLag(pitSeries,{
    asOf:t,
    maxLagBars:6,
    minSamples:48,
    minAbsCorrelation:.25,
    maxHypotheses:Math.max(50,Math.min(500,symbols.length*Math.max(1,symbols.length-1)*6))
  });
  const shock=buildShockPropagation({
    seriesBySymbol:pitSeries,
    graph,
    shockThreshold:.012,
    asOf:t
  });

  const states=stateAtlas(radarRows,t);
  const forecastability=forecastabilityField(forecastJournalEntries,symbols,minForecastSamples);
  const association=associationView(graph);
  const informationFlow=informationFlowHypotheses(leadLag);
  const shocks=shockView(shock);
  const rotationState=rotationView(rotation);

  const unknowns=[
    {
      id:'LATENT_MARKET_STATE',
      status:'UNKNOWN',
      reason:'No validated latent-state estimator has been promoted into the canonical World Model.',
      requiredEvidence:['PRE_REGISTERED_STATE_DEFINITION','OUT_OF_SAMPLE_STATE_STABILITY','CROSS_REGIME_REPLICATION']
    },
    {
      id:'CAUSAL_INFORMATION_FLOW',
      status:informationFlow.candidates.length?'HYPOTHESES_EXIST':'UNKNOWN',
      reason:'Lead/lag and association screens do not identify causal transmission by themselves.',
      requiredEvidence:['TEMPORAL_ORDER','CONFOUNDER_CONTROLS','PLACEBO_LAGS','OUT_OF_SAMPLE_REPLICATION']
    },
    {
      id:'INTRINSIC_PREDICTABILITY',
      status:'UNKNOWN',
      reason:'Forecast performance is measured, but it is not equivalent to an intrinsic predictability property of the market.',
      requiredEvidence:['CALIBRATED_FORWARD_FORECASTS','HORIZON_SPECIFIC_OOS_EVIDENCE','REGIME_CONDITIONING']
    }
  ];

  const core={
    version:BIGGJ_WORLD_MODEL_RUNTIME_VERSION,
    asOf:t,
    markets:symbols,
    seriesCoverage:Object.fromEntries(Object.entries(pitSeries).map(([s,rows])=>[s,{
      rows:rows.length,
      firstAt:finite(rows[0]?.closeTime),
      lastAt:finite(rows.at(-1)?.closeTime)
    }])),
    stateAtlas:states,
    associationGraph:association,
    rotation:rotationState,
    informationFlowHypotheses:informationFlow,
    shockMap:shocks,
    forecastabilityField:{
      status:forecastability.some(x=>x.status!=='INSUFFICIENT')?'MEASURED':'INSUFFICIENT',
      markets:forecastability,
      meaning:'FORECAST_PERFORMANCE_FIELD_NOT_GUARANTEED_PREDICTABILITY'
    },
    latentState:{
      status:'UNKNOWN',
      estimatorPromoted:false,
      dimensions:[],
      meaning:'NO_CANONICAL_LATENT_STATE_IS_INFERRED'
    },
    unknowns,
    epistemicPolicy:{
      observedAssociationIsNotCausality:true,
      leadLagIsHypothesisOnly:true,
      forecastPerformanceIsNotIntrinsicPredictability:true,
      relativeRotationIsNotCapitalFlowProof:true,
      unknownIsValidState:true,
      noFutureData:true
    },
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canInfluencePrimary:false,
    canExecuteLive:false
  };
  return finalize(core);
}

export function biggjWorldModelRuntimeSummary(runtime){
  if(runtime?.version!==BIGGJ_WORLD_MODEL_RUNTIME_VERSION) throw new Error('BIGGJ_WORLD_MODEL_RUNTIME_INVALID');
  return deepFreeze({
    version:runtime.version,
    asOf:runtime.asOf,
    marketCount:runtime.markets.length,
    stateCount:runtime.stateAtlas.length,
    associationStatus:runtime.associationGraph.status,
    associationEdges:runtime.associationGraph.edges.length,
    rotationStatus:runtime.rotation.status,
    informationFlowStatus:runtime.informationFlowHypotheses.status,
    informationFlowCandidates:runtime.informationFlowHypotheses.candidates.length,
    shockStatus:runtime.shockMap.status,
    activeShockOrigins:runtime.shockMap.origins.length,
    forecastabilityStatus:runtime.forecastabilityField.status,
    forecastabilityMarkets:runtime.forecastabilityField.markets,
    latentState:runtime.latentState,
    unknowns:runtime.unknowns,
    epistemicPolicy:runtime.epistemicPolicy,
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canInfluencePrimary:false,
    canExecuteLive:false,
    fingerprint:runtime.fingerprint
  });
}

export function verifyBiggjWorldModelRuntime(runtime){
  const reasons=[];
  if(runtime?.version!==BIGGJ_WORLD_MODEL_RUNTIME_VERSION) reasons.push('VERSION_INVALID');
  if(runtime?.execution!=='SHADOW_ONLY') reasons.push('EXECUTION_INVALID');
  if(runtime?.action!=='ABSTAIN') reasons.push('ACTION_INVALID');
  if(runtime?.canInfluencePrimary!==false) reasons.push('PRIMARY_INFLUENCE_INVALID');
  if(runtime?.canExecuteLive!==false) reasons.push('LIVE_EXECUTION_INVALID');
  if(runtime?.latentState?.estimatorPromoted!==false) reasons.push('LATENT_STATE_PROMOTION_INVALID');
  if(runtime?.epistemicPolicy?.observedAssociationIsNotCausality!==true) reasons.push('ASSOCIATION_CAUSALITY_GUARD_MISSING');
  if(runtime?.epistemicPolicy?.leadLagIsHypothesisOnly!==true) reasons.push('LEAD_LAG_GUARD_MISSING');
  if((runtime?.informationFlowHypotheses?.candidates||[]).some(x=>x.causal!==false||x.predictivePermission!==false)) reasons.push('FLOW_HYPOTHESIS_AUTHORITY_INVALID');
  const {fingerprint,...core}=runtime||{};
  if(fingerprint!==sha256(core)) reasons.push('FINGERPRINT_MISMATCH');
  return {ok:reasons.length===0,reasons};
}
