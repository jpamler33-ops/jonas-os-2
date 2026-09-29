import { sha256 } from './institutional-kernel.mjs';
import { ProbabilisticForecastEngine } from './forecast-runtime/forecast/index.js';

export const FORECAST_CANDIDATE_LAB_VERSION='TCX_FORECAST_CANDIDATE_LAB_V1';

const EPS=1e-12;

function finite(v,name){
  const n=Number(v);
  if(!Number.isFinite(n)) throw new Error(name+' must be finite');
  return n;
}
function clone(v){ return structuredClone(v); }
function deepFreeze(v){
  if(v&&typeof v==='object'&&!Object.isFrozen(v)){
    Object.freeze(v);
    for(const x of Object.values(v)) deepFreeze(x);
  }
  return v;
}
function stableRows(rows){
  return [...rows].sort((a,b)=>
    Number(a.timestamp)-Number(b.timestamp)||
    Number(a.horizonMs)-Number(b.horizonMs)||
    String(a.id||'').localeCompare(String(b.id||''))
  );
}
function validHistoryRow(r,featureIds){
  return Boolean(r&&r.symbol)&&
    Number.isFinite(Number(r.timestamp))&&
    Number.isFinite(Number(r.availableAt))&&
    Number.isFinite(Number(r.resolvedAt))&&
    Number(r.timestamp)<=Number(r.availableAt)&&
    Number(r.timestamp)<=Number(r.resolvedAt)&&
    Number.isFinite(Number(r.horizonMs))&&
    Number(r.horizonMs)>0&&
    Number.isFinite(Number(r.forwardReturn))&&
    featureIds.every(id=>Number.isFinite(Number(r.features?.[id])));
}
function semanticTarget(config){
  return {
    featureIds:[...(config?.featureIds||[])],
    horizons:[...(config?.horizons||[])].map(h=>({
      id:String(h.id),
      horizonMs:Number(h.horizonMs),
      flatThreshold:Number(h.flatThreshold)
    }))
  };
}
function assertSemanticLock(incumbent,candidate){
  const a=semanticTarget(incumbent);
  const b=semanticTarget(candidate);
  if(sha256(a)!==sha256(b)){
    throw new Error('candidate changes forecast target semantics; featureIds/horizonMs/flatThreshold must remain locked');
  }
  return sha256(a);
}
function direction(ret,flat){
  return ret>flat?'UP':ret<-flat?'DOWN':'FLAT';
}
function topDirection(p){
  return p.up>=p.down&&p.up>=p.flat?'UP':p.down>=p.up&&p.down>=p.flat?'DOWN':'FLAT';
}
function scoreProbabilities(p,actual){
  const yu=actual==='UP'?1:0,yd=actual==='DOWN'?1:0,yf=actual==='FLAT'?1:0;
  const brier=(p.up-yu)**2+(p.down-yd)**2+(p.flat-yf)**2;
  const hit=actual==='UP'?p.up:actual==='DOWN'?p.down:p.flat;
  return {brier,logLoss:-Math.log(Math.max(1e-9,hit))};
}
function horizonConfig(config,horizonMs){
  return config.horizons.find(h=>Number(h.horizonMs)===Number(horizonMs))||null;
}
function forecastForRow(engine,row,config){
  const input={
    symbol:String(row.symbol),
    asOf:Number(row.timestamp),
    price:1,
    features:clone(row.features),
    featureConfidence:Object.fromEntries(config.featureIds.map(id=>[id,1])),
    regimeId:String(row.regimeId??'UNKNOWN'),
    regimeConfidence:1,
    dataQuality:1,
    guards:[]
  };
  const report=engine.forecast(input);
  const forecast=report.forecasts.find(f=>Number(f.horizonMs)===Number(row.horizonMs));
  if(!forecast) throw new Error('forecast horizon missing for '+row.horizonMs);
  return {input,forecast};
}
function evaluationPoint(row,input,forecast){
  const actual=direction(Number(row.forwardReturn),Number(forecast.flatThreshold));
  const s=scoreProbabilities(forecast.probabilities,actual);
  const predicted=topDirection(forecast.probabilities);
  const topProbability=Math.max(forecast.probabilities.up,forecast.probabilities.down,forecast.probabilities.flat);
  const intervalMiss=Number(row.forwardReturn)<Number(forecast.interval.q10)||
    Number(row.forwardReturn)>Number(forecast.interval.q90);
  return {
    id:String(row.id||row.symbol+':'+row.timestamp+':'+row.horizonMs),
    symbol:String(row.symbol),
    timestamp:Number(row.timestamp),
    resolvedAt:Number(row.resolvedAt),
    horizonMs:Number(row.horizonMs),
    flatThreshold:Number(forecast.flatThreshold),
    regimeId:String(row.regimeId??'UNKNOWN'),
    features:clone(row.features),
    actualReturn:Number(row.forwardReturn),
    actualDirection:actual,
    predictedDirection:predicted,
    probabilities:clone(forecast.probabilities),
    rawProbabilities:clone(forecast.rawProbabilities),
    expectedReturn:Number(forecast.expectedReturn),
    interval:clone(forecast.interval),
    rawInterval:clone(forecast.rawInterval),
    models:clone(forecast.models||[]),
    gate:String(forecast.gate),
    brier:s.brier,
    logLoss:s.logLoss,
    absoluteReturnError:Math.abs(Number(row.forwardReturn)-Number(forecast.expectedReturn)),
    intervalMiss,
    topProbability,
    topCorrect:predicted===actual,
    input
  };
}
function feedMaturedPoint(engine,p){
  const quality=1;
  engine.calibration.add({
    id:'wf:'+p.id,
    symbol:p.symbol,
    horizonMs:p.horizonMs,
    regimeId:p.regimeId,
    predictedUp:p.probabilities.up,
    predictedDown:p.probabilities.down,
    predictedFlat:p.probabilities.flat,
    actualReturn:p.actualReturn,
    flatThreshold:p.flatThreshold,
    resolvedAt:p.resolvedAt,
    quality
  });
  engine.reliability.add({
    id:'wf:'+p.id,
    symbol:p.symbol,
    horizonMs:p.horizonMs,
    resolvedAt:p.resolvedAt,
    regimeId:p.regimeId,
    features:clone(p.features),
    predicted:clone(p.probabilities),
    actualDirection:p.actualDirection,
    brier:p.brier,
    logLoss:p.logLoss,
    absoluteReturnError:p.absoluteReturnError,
    intervalMiss:p.intervalMiss,
    topProbability:p.topProbability,
    topCorrect:p.topCorrect,
    quality
  });
  const raw=p.rawInterval||{median:p.expectedReturn,q10:p.interval.q10,q90:p.interval.q90};
  engine.intervalCalibration.add({
    id:'wf:'+p.id,
    symbol:p.symbol,
    horizonMs:p.horizonMs,
    regimeId:p.regimeId,
    median:Number(raw.median),
    lower:Number(raw.q10),
    upper:Number(raw.q90),
    actualReturn:p.actualReturn,
    features:clone(p.features),
    resolvedAt:p.resolvedAt,
    quality
  });
  engine.drift.add({
    id:'wf:'+p.id,
    symbol:p.symbol,
    horizonMs:p.horizonMs,
    resolvedAt:p.resolvedAt,
    regimeId:p.regimeId,
    features:clone(p.features),
    brier:p.brier,
    logLoss:p.logLoss,
    intervalMiss:p.intervalMiss,
    topProbability:p.topProbability,
    topCorrect:p.topCorrect,
    quality
  });
  for(const m of p.models||[]){
    const probs={up:Number(m.pUp),down:Number(m.pDown),flat:Number(m.pFlat)};
    if(!Object.values(probs).every(Number.isFinite)) continue;
    const ms=scoreProbabilities(probs,p.actualDirection);
    engine.modelPerformance.add({
      id:'wf:'+p.id+':'+m.modelId,
      symbol:p.symbol,
      horizonMs:p.horizonMs,
      resolvedAt:p.resolvedAt,
      regimeId:p.regimeId,
      modelId:String(m.modelId),
      predicted:probs,
      expectedReturn:Number(m.expectedReturn),
      actualDirection:p.actualDirection,
      actualReturn:p.actualReturn,
      brier:ms.brier,
      logLoss:ms.logLoss,
      absoluteReturnError:Math.abs(p.actualReturn-Number(m.expectedReturn)),
      quality
    });
  }
}
function aggregate(points,highConfidenceThreshold=.65){
  if(!points.length){
    return {brier:Infinity,logLoss:Infinity,intervalCoverage:0,highConfidenceWrongRate:1};
  }
  const mean=fn=>points.reduce((s,p)=>s+fn(p),0)/points.length;
  const high=points.filter(p=>p.topProbability>=highConfidenceThreshold);
  return {
    brier:mean(p=>p.brier),
    logLoss:mean(p=>p.logLoss),
    intervalCoverage:mean(p=>p.intervalMiss?0:1),
    highConfidenceWrongRate:high.length?high.filter(p=>!p.topCorrect).length/high.length:0
  };
}
function independentEpisodeCount(points){
  const groups=new Map();
  for(const p of [...points].sort((a,b)=>a.timestamp-b.timestamp)){
    const key=p.symbol+'\u0000'+p.horizonMs;
    const g=groups.get(key)??{last:-Infinity,count:0};
    if(p.timestamp-g.last>=p.horizonMs){
      g.count++;
      g.last=p.timestamp;
    }
    groups.set(key,g);
  }
  return [...groups.values()].reduce((s,g)=>s+g.count,0);
}

function independentPairedSeries(candidatePoints,incumbentPoints,{maxPoints=1000}={}){
  const incumbentById=new Map((incumbentPoints||[]).map(p=>[String(p.id),p]));
  const selected=[];
  const groups=new Map();
  for(const cp of [...(candidatePoints||[])].sort((a,b)=>a.timestamp-b.timestamp||a.horizonMs-b.horizonMs)){
    const ip=incumbentById.get(String(cp.id));
    if(!ip) continue;
    const key=cp.symbol+'\u0000'+cp.horizonMs;
    const g=groups.get(key)??{last:-Infinity};
    if(cp.timestamp-g.last<cp.horizonMs) continue;
    g.last=cp.timestamp;
    groups.set(key,g);
    selected.push({
      id:String(cp.id),
      symbol:String(cp.symbol),
      timestamp:Number(cp.timestamp),
      resolvedAt:Number(cp.resolvedAt),
      horizonMs:Number(cp.horizonMs),
      regimeId:String(cp.regimeId??'UNKNOWN'),
      candidate:{
        brier:Number(cp.brier),
        logLoss:Number(cp.logLoss),
        intervalMiss:cp.intervalMiss===true,
        topProbability:Number(cp.topProbability),
        topCorrect:cp.topCorrect===true
      },
      incumbent:{
        brier:Number(ip.brier),
        logLoss:Number(ip.logLoss),
        intervalMiss:ip.intervalMiss===true,
        topProbability:Number(ip.topProbability),
        topCorrect:ip.topCorrect===true
      },
      deltas:{
        brier:Number(cp.brier)-Number(ip.brier),
        logLoss:Number(cp.logLoss)-Number(ip.logLoss),
        intervalMiss:(cp.intervalMiss?1:0)-(ip.intervalMiss?1:0),
        topCorrect:(cp.topCorrect?1:0)-(ip.topCorrect?1:0)
      }
    });
  }
  const limit=Math.max(1,Math.floor(Number(maxPoints)||1000));
  return selected.slice(-limit);
}
function gateCounts(points){
  const out={PASS:0,CAUTION:0,INSUFFICIENT:0,ABSTAIN:0,OTHER:0};
  for(const p of points){
    if(p.gate in out) out[p.gate]++;
    else out.OTHER++;
  }
  return out;
}

export function buildForecastCandidateArtifact({
  historyRows,
  incumbentConfig,
  candidateConfig,
  dataCutoffAt,
  createdAt=dataCutoffAt,
  parentReleaseId,
  source='TCX_OFFLINE_FORECAST_CANDIDATE_BUILDER'
}={}){
  const cutoff=finite(dataCutoffAt,'dataCutoffAt');
  const created=finite(createdAt,'createdAt');
  if(created<cutoff) throw new Error('createdAt cannot predate dataCutoffAt');
  const targetSemanticHash=assertSemanticLock(incumbentConfig,candidateConfig);
  const featureIds=[...candidateConfig.featureIds];
  const valid=stableRows((historyRows||[]).filter(r=>validHistoryRow(r,featureIds)));
  const matured=valid.filter(r=>Number(r.resolvedAt)<=cutoff);
  if(!matured.length) throw new Error('no matured outcome history at candidate cutoff');
  const evidence=stableRows(matured).map(r=>({
    id:String(r.id||''),
    symbol:String(r.symbol),
    timestamp:Number(r.timestamp),
    availableAt:Number(r.availableAt),
    resolvedAt:Number(r.resolvedAt),
    horizonMs:Number(r.horizonMs),
    regimeId:String(r.regimeId??'UNKNOWN'),
    features:clone(r.features),
    forwardReturn:Number(r.forwardReturn),
    quality:Number(r.quality??1)
  }));
  const trainingEvidenceHash=sha256(evidence);
  const config=clone(candidateConfig);
  const configHash=sha256(config);
  const modelCore={
    version:FORECAST_CANDIDATE_LAB_VERSION,
    kind:'TCX_FORECAST_MODEL_CANDIDATE',
    targetSemanticHash,
    trainingEvidenceHash,
    configHash,
    dataCutoffAt:cutoff,
    objective:'FORECAST_CALIBRATION_AND_ACCURACY_NOT_PNL'
  };
  const modelHash=sha256(modelCore);
  const candidateId='FC-'+modelHash.slice(0,20).toUpperCase();
  const core={
    ...modelCore,
    candidateId,
    modelHash,
    config,
    createdAt:created,
    parentReleaseId:String(parentReleaseId??'UNKNOWN'),
    source:String(source),
    trainingCases:evidence.length,
    executionMode:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecute:false
  };
  return deepFreeze({...core,fingerprint:sha256(core)});
}

export function verifyForecastCandidateArtifact(value){
  try{
    if(value?.version!==FORECAST_CANDIDATE_LAB_VERSION) return {ok:false,reasons:['VERSION_INVALID']};
    if(value?.executionMode!=='SHADOW_ONLY'||value?.action!=='ABSTAIN'||value?.canExecute!==false){
      return {ok:false,reasons:['SAFETY_INVARIANT_INVALID']};
    }
    const {fingerprint,...core}=value;
    if(fingerprint!==sha256(core)) return {ok:false,reasons:['FINGERPRINT_MISMATCH']};
    if(value.modelHash!==sha256({
      version:value.version,
      kind:value.kind,
      targetSemanticHash:value.targetSemanticHash,
      trainingEvidenceHash:value.trainingEvidenceHash,
      configHash:value.configHash,
      dataCutoffAt:value.dataCutoffAt,
      objective:value.objective
    })) return {ok:false,reasons:['MODEL_HASH_MISMATCH']};
    if(value.configHash!==sha256(value.config)) return {ok:false,reasons:['CONFIG_HASH_MISMATCH']};
    return {ok:true,reasons:[]};
  }catch(err){
    return {ok:false,reasons:['CANDIDATE_INVALID',err instanceof Error?err.message:String(err)]};
  }
}

export function evaluateForecastCandidateWalkForward({
  historyRows,
  incumbentConfig,
  candidate,
  asOf,
  minimumTrainCases=40,
  highConfidenceThreshold=.65
}={}){
  const check=verifyForecastCandidateArtifact(candidate);
  if(!check.ok) throw new Error('invalid forecast candidate: '+check.reasons.join(','));
  const t=finite(asOf,'asOf');
  if(t<candidate.dataCutoffAt) throw new Error('asOf cannot predate candidate cutoff');
  assertSemanticLock(incumbentConfig,candidate.config);

  const featureIds=[...candidate.config.featureIds];
  const all=stableRows((historyRows||[]).filter(r=>validHistoryRow(r,featureIds)));
  const blockedFuture=all.filter(r=>Number(r.resolvedAt)>t).length;
  const usable=all.filter(r=>Number(r.resolvedAt)<=t);
  const testRows=usable.filter(r=>Number(r.timestamp)>Number(candidate.dataCutoffAt));

  const candidateEngine=new ProbabilisticForecastEngine(clone(candidate.config));
  const incumbentEngine=new ProbabilisticForecastEngine(clone(incumbentConfig));
  const candPoints=[];
  const incPoints=[];
  const pendingCand=[];
  const pendingInc=[];
  let historyCursor=0;
  let pitViolations=0;
  let skippedWarmup=0;

  const byTimestamp=new Map();
  for(const row of testRows){
    const xs=byTimestamp.get(Number(row.timestamp))??[];
    xs.push(row);
    byTimestamp.set(Number(row.timestamp),xs);
  }
  const times=[...byTimestamp.keys()].sort((a,b)=>a-b);

  const maturePending=(pending,engine,at)=>{
    const keep=[];
    for(const p of pending){
      if(p.resolvedAt<=at) feedMaturedPoint(engine,p);
      else keep.push(p);
    }
    pending.splice(0,pending.length,...keep);
  };

  for(const timestamp of times){
    while(historyCursor<usable.length&&Number(usable[historyCursor].resolvedAt)<=timestamp){
      const row=usable[historyCursor++];
      if(Number(row.resolvedAt)>timestamp){ pitViolations++; continue; }
      candidateEngine.addHistory(row);
      incumbentEngine.addHistory(row);
    }
    maturePending(pendingCand,candidateEngine,timestamp);
    maturePending(pendingInc,incumbentEngine,timestamp);

    // The walk-forward loader only adds rows once resolvedAt <= timestamp.
    // historySize() is therefore semantically identical here and avoids cloning
    // the full training history at every timestamp (O(n²) allocation pressure).
    const trainCount=candidateEngine.historySize();
    const group=byTimestamp.get(timestamp)||[];
    if(trainCount<Math.max(1,Number(minimumTrainCases))){
      skippedWarmup+=group.length;
      continue;
    }

    for(const row of group){
      const hc=horizonConfig(candidate.config,row.horizonMs);
      const hi=horizonConfig(incumbentConfig,row.horizonMs);
      if(!hc||!hi) continue;
      const cf=forecastForRow(candidateEngine,row,candidate.config);
      const inf=forecastForRow(incumbentEngine,row,incumbentConfig);
      const cp=evaluationPoint(row,cf.input,cf.forecast);
      const ip=evaluationPoint(row,inf.input,inf.forecast);
      candPoints.push(cp);
      incPoints.push(ip);
      pendingCand.push(cp);
      pendingInc.push(ip);
    }
  }

  const candidateMetrics=aggregate(candPoints,highConfidenceThreshold);
  const incumbentMetrics=aggregate(incPoints,highConfidenceThreshold);
  const independentEpisodes=independentEpisodeCount(candPoints);
  const pairedIndependent=independentPairedSeries(candPoints,incPoints,{maxPoints:1000});
  const core={
    version:FORECAST_CANDIDATE_LAB_VERSION,
    kind:'TCX_FORECAST_TEMPORAL_WALK_FORWARD',
    asOf:t,
    candidateId:candidate.candidateId,
    candidateModelHash:candidate.modelHash,
    targetSemanticHash:candidate.targetSemanticHash,
    evaluation:{
      cases:candPoints.length,
      independentEpisodes,
      candidate:candidateMetrics,
      incumbent:incumbentMetrics,
      deltas:{
        brier:candidateMetrics.brier-incumbentMetrics.brier,
        logLoss:candidateMetrics.logLoss-incumbentMetrics.logLoss,
        intervalCoverage:candidateMetrics.intervalCoverage-incumbentMetrics.intervalCoverage,
        highConfidenceWrongRate:candidateMetrics.highConfidenceWrongRate-incumbentMetrics.highConfidenceWrongRate
      }
    },
    diagnostics:{
      candidateGateCounts:gateCounts(candPoints),
      incumbentGateCounts:gateCounts(incPoints),
      skippedWarmup,
      blockedFuture,
      pitViolations,
      temporalOosPassed:pitViolations===0,
      pairedIndependentTotal:independentEpisodes,
      pairedIndependent,
      sameSampleFeedbackAllowed:false
    },
    objective:'FORECAST_CALIBRATION_AND_ACCURACY_NOT_PNL',
    executionMode:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecute:false
  };
  return deepFreeze({
    ...core,
    fingerprint:sha256(core),
    promotionEvaluationInput:{
      cases:candPoints.length,
      independentEpisodes,
      candidate:candidateMetrics,
      incumbent:incumbentMetrics
    }
  });
}


export function evaluateForecastFeatureExtensionWalkForward({
  historyRows,
  incumbentConfig,
  addedFeatureIds,
  dataCutoffAt,
  asOf,
  minimumTrainCases=40,
  highConfidenceThreshold=.65
}={}){
  const t=finite(asOf,'asOf');
  const cutoff=finite(dataCutoffAt,'dataCutoffAt');
  if(t<cutoff) throw new Error('asOf cannot predate feature research cutoff');

  const baseIds=[...(incumbentConfig?.featureIds||[])];
  if(!baseIds.length) throw new Error('incumbent featureIds required');
  const additions=[...new Set((Array.isArray(addedFeatureIds)?addedFeatureIds:[]).map(x=>String(x).trim()).filter(Boolean))];
  if(!additions.length) throw new Error('addedFeatureIds required');
  if(additions.some(id=>baseIds.includes(id))) throw new Error('feature research additions must be new');

  const candidateConfig=clone(incumbentConfig);
  candidateConfig.featureIds=[...baseIds,...additions];
  const a={horizons:(incumbentConfig?.horizons||[]).map(h=>({id:String(h.id),horizonMs:Number(h.horizonMs),flatThreshold:Number(h.flatThreshold)}))};
  const b={horizons:(candidateConfig?.horizons||[]).map(h=>({id:String(h.id),horizonMs:Number(h.horizonMs),flatThreshold:Number(h.flatThreshold)}))};
  if(sha256(a)!==sha256(b)) throw new Error('feature research may not change forecast target semantics');

  const all=stableRows((historyRows||[]).filter(r=>validHistoryRow(r,candidateConfig.featureIds)));
  const blockedFuture=all.filter(r=>Number(r.resolvedAt)>t).length;
  const usable=all.filter(r=>Number(r.resolvedAt)<=t);
  const testRows=usable.filter(r=>Number(r.timestamp)>cutoff);

  const candidateEngine=new ProbabilisticForecastEngine(candidateConfig);
  const incumbentEngine=new ProbabilisticForecastEngine(clone(incumbentConfig));
  const candPoints=[],incPoints=[],pendingCand=[],pendingInc=[];
  let historyCursor=0,pitViolations=0,skippedWarmup=0;

  const byTimestamp=new Map();
  for(const row of testRows){
    const xs=byTimestamp.get(Number(row.timestamp))??[];
    xs.push(row);
    byTimestamp.set(Number(row.timestamp),xs);
  }
  const times=[...byTimestamp.keys()].sort((x,y)=>x-y);

  const maturePending=(pending,engine,at)=>{
    const keep=[];
    for(const p of pending){
      if(p.resolvedAt<=at) feedMaturedPoint(engine,p);
      else keep.push(p);
    }
    pending.splice(0,pending.length,...keep);
  };

  for(const timestamp of times){
    while(historyCursor<usable.length&&Number(usable[historyCursor].resolvedAt)<=timestamp){
      const row=usable[historyCursor++];
      if(Number(row.resolvedAt)>timestamp){ pitViolations++; continue; }
      candidateEngine.addHistory(row);
      incumbentEngine.addHistory(row);
    }
    maturePending(pendingCand,candidateEngine,timestamp);
    maturePending(pendingInc,incumbentEngine,timestamp);

    // The walk-forward loader only adds rows once resolvedAt <= timestamp.
    // historySize() is therefore semantically identical here and avoids cloning
    // the full training history at every timestamp (O(n²) allocation pressure).
    const trainCount=candidateEngine.historySize();
    const group=byTimestamp.get(timestamp)||[];
    if(trainCount<Math.max(1,Number(minimumTrainCases))){
      skippedWarmup+=group.length;
      continue;
    }

    for(const row of group){
      const hc=horizonConfig(candidateConfig,row.horizonMs);
      const hi=horizonConfig(incumbentConfig,row.horizonMs);
      if(!hc||!hi) continue;
      const cf=forecastForRow(candidateEngine,row,candidateConfig);
      const inf=forecastForRow(incumbentEngine,row,incumbentConfig);
      const cp=evaluationPoint(row,cf.input,cf.forecast);
      const ip=evaluationPoint(row,inf.input,inf.forecast);
      candPoints.push(cp);
      incPoints.push(ip);
      pendingCand.push(cp);
      pendingInc.push(ip);
    }
  }

  const candidateMetrics=aggregate(candPoints,highConfidenceThreshold);
  const incumbentMetrics=aggregate(incPoints,highConfidenceThreshold);
  const independentEpisodes=independentEpisodeCount(candPoints);
  const pairedIndependent=independentPairedSeries(candPoints,incPoints,{maxPoints:1000});
  const core={
    version:FORECAST_CANDIDATE_LAB_VERSION,
    kind:'TCX_FORECAST_FEATURE_EXTENSION_WALK_FORWARD',
    asOf:t,
    dataCutoffAt:cutoff,
    incumbentConfigHash:sha256(incumbentConfig),
    candidateConfigHash:sha256(candidateConfig),
    addedFeatureIds:additions,
    evaluation:{
      cases:candPoints.length,
      independentEpisodes,
      candidate:candidateMetrics,
      incumbent:incumbentMetrics,
      deltas:{
        brier:candidateMetrics.brier-incumbentMetrics.brier,
        logLoss:candidateMetrics.logLoss-incumbentMetrics.logLoss,
        intervalCoverage:candidateMetrics.intervalCoverage-incumbentMetrics.intervalCoverage,
        highConfidenceWrongRate:candidateMetrics.highConfidenceWrongRate-incumbentMetrics.highConfidenceWrongRate
      }
    },
    diagnostics:{
      candidateGateCounts:gateCounts(candPoints),
      incumbentGateCounts:gateCounts(incPoints),
      skippedWarmup,
      blockedFuture,
      pitViolations,
      temporalOosPassed:pitViolations===0,
      pairedIndependentTotal:independentEpisodes,
      pairedIndependent,
      sameSampleFeedbackAllowed:false,
      productionMutationAllowed:false
    },
    objective:'INCREMENTAL_FEATURE_VALUE_NOT_PNL',
    executionMode:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecute:false
  };
  return deepFreeze({...core,fingerprint:sha256(core)});
}
