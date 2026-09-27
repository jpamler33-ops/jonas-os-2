import path from 'node:path';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';

import {
  ProbabilisticForecastEngine,
  ForecastLearningJournal,
  ForecastIntelligenceService
} from './forecast-runtime/forecast/index.js';
import { verifyCanonicalForecastInput } from './forecast-input-adapter.mjs';
import { createInstitutionalForecastIssuance } from './institutional-forecast-issuance.mjs';
import { createResearchTraceEvaluation } from './research-trace.mjs';

export const INSTITUTIONAL_FORECAST_RUNTIME_VERSION='TCX_INSTITUTIONAL_FORECAST_RUNTIME_V1';

export const EPISODE_FORECAST_FEATURE_IDS=Object.freeze([
  'episode.biasScore',
  'episode.pressureScore',
  'episode.spreadBps',
  'episode.imbalance',
  'episode.atrPct',
  'episode.realizedVolPct',
  'episode.volumeRatio',
  'episode.emaGapPct',
  'episode.supportDistancePct',
  'episode.resistanceDistancePct'
]);

export const DEFAULT_INSTITUTIONAL_FORECAST_CONFIG=Object.freeze({
  featureIds:[...EPISODE_FORECAST_FEATURE_IDS],
  horizons:[
    {id:'5m',horizonMs:5*60_000,flatThreshold:.0008,topK:180,minSimilarity:.08,analogBandwidth:1.5,independenceWindowMs:5*60_000},
    {id:'15m',horizonMs:15*60_000,flatThreshold:.0015,topK:180,minSimilarity:.08,analogBandwidth:1.5,independenceWindowMs:15*60_000},
    {id:'1h',horizonMs:60*60_000,flatThreshold:.0030,topK:180,minSimilarity:.08,analogBandwidth:1.5,independenceWindowMs:60*60_000},
    {id:'3h',horizonMs:3*60*60_000,flatThreshold:.0060,topK:180,minSimilarity:.08,analogBandwidth:1.5,independenceWindowMs:3*60*60_000}
  ],
  minTrainingCases:25,
  minRegimeCases:12,
  minAnalogCount:12,
  minAnalogEffectiveSamples:6,
  minAnalogIndependentEpisodes:5,
  minDataQuality:.70,
  minRegimeConfidence:.40,
  calibrationMinCases:40,
  reliabilityMinCases:25,
  intervalCalibrationMinCases:30,
  driftRecentCases:24,
  driftBaselineCases:60,
  pathMinCompleteTrajectories:12,
  pathMinEffectiveSamples:6,
  pathTopK:120,
  pathMinSimilarity:.08
});

const EPISODE_HORIZON_TO_MS=Object.freeze({
  '1':5*60_000,
  '3':15*60_000,
  '12':60*60_000,
  '36':3*60*60_000
});

const VECTOR_TO_FEATURE=Object.freeze({
  biasScore:'episode.biasScore',
  pressureScore:'episode.pressureScore',
  spreadBps:'episode.spreadBps',
  imbalance:'episode.imbalance',
  atrPct:'episode.atrPct',
  realizedVolPct:'episode.realizedVolPct',
  volumeRatio:'episode.volumeRatio',
  emaGapPct:'episode.emaGapPct',
  supportDistancePct:'episode.supportDistancePct',
  resistanceDistancePct:'episode.resistanceDistancePct'
});

function finite(v,name){
  const n=Number(v);
  if(!Number.isFinite(n)) throw new Error(name+' must be finite');
  return n;
}
function finiteOrNull(v){
  const n=Number(v);
  return Number.isFinite(n)?n:null;
}
function deepFreeze(v){
  if(v&&typeof v==='object'&&!Object.isFrozen(v)){
    Object.freeze(v);
    for(const x of Object.values(v)) deepFreeze(x);
  }
  return v;
}
function clone(v){return structuredClone(v);}
function trimIssuances(rows,max){
  const sorted=[...(rows||[])].sort((a,b)=>Number(a.generatedAt)-Number(b.generatedAt));
  return sorted.slice(-Math.max(50,Math.floor(max)));
}

export function episodeVectorExtraFeatures(vector,availableAt){
  const t=finite(availableAt,'availableAt');
  const out=[];
  for(const [vectorKey,id] of Object.entries(VECTOR_TO_FEATURE)){
    const value=finiteOrNull(vector?.[vectorKey]);
    if(value==null) continue;
    out.push({
      id,
      value,
      availableAt:t,
      source:'TCX_EPISODE_VECTOR_DERIVED'
    });
  }
  return out;
}

export function forecastHistoryFromEpisodes(episodes,{
  featureIds=EPISODE_FORECAST_FEATURE_IDS,
  horizonMs=null
}={}){
  const wanted=new Set(featureIds);
  const allowedHorizons=Array.isArray(horizonMs)&&horizonMs.length
    ?new Set(horizonMs.map(Number).filter(Number.isFinite))
    :null;
  const rows=[];
  let rejected=0;
  let blockedFutureOutcome=0;

  for(const episode of Array.isArray(episodes)?episodes:[]){
    const timestamp=finiteOrNull(episode?.anchorCloseTime);
    const availableAt=finiteOrNull(episode?.availableAt);
    const entryPrice=finiteOrNull(episode?.entryPrice);
    if(timestamp==null||availableAt==null||timestamp>availableAt||!(entryPrice>0)){
      rejected++;
      continue;
    }

    const features={};
    for(const [vectorKey,id] of Object.entries(VECTOR_TO_FEATURE)){
      if(!wanted.has(id)) continue;
      const value=finiteOrNull(episode?.vector?.[vectorKey]);
      if(value!=null) features[id]=value;
    }
    if(featureIds.some(id=>!Number.isFinite(features[id]))){
      rejected++;
      continue;
    }

    for(const [bars,horizon] of Object.entries(EPISODE_HORIZON_TO_MS)){
      if(allowedHorizons&&!allowedHorizons.has(horizon)) continue;
      const horizonMs=horizon;
      const outcome=episode?.outcomes?.[bars];
      if(!outcome) continue;
      const maturedAt=finiteOrNull(outcome?.maturedAt);
      const observedAt=finiteOrNull(outcome?.observedAt??outcome?.maturedAt);
      const returnPct=finiteOrNull(outcome?.returnPct);
      if(maturedAt==null||observedAt==null||returnPct==null||observedAt<maturedAt){
        rejected++;
        continue;
      }
      if(observedAt<availableAt){
        blockedFutureOutcome++;
        continue;
      }

      rows.push({
        id:'episode:'+String(episode.id)+':'+bars,
        symbol:String(episode.symbol),
        timestamp,
        availableAt,
        resolvedAt:observedAt,
        horizonMs,
        features:clone(features),
        regimeId:String(episode?.vector?.regime??'UNKNOWN'),
        forwardReturn:returnPct/100,
        maxAdverseReturn:finiteOrNull(outcome?.maxFallPct)==null?undefined:Number(outcome.maxFallPct)/100,
        maxFavorableReturn:finiteOrNull(outcome?.maxRisePct)==null?undefined:Number(outcome.maxRisePct)/100,
        realizedVolatility:finiteOrNull(outcome?.realizedRangePct)==null?undefined:Math.abs(Number(outcome.realizedRangePct))/100,
        quality:1
      });
    }
  }

  rows.sort((a,b)=>a.timestamp-b.timestamp||a.horizonMs-b.horizonMs);
  return {rows,rejected,blockedFutureOutcome};
}

function engineSnapshot(engine){
  return {
    config:engine.configSnapshot(),
    history:engine.historySnapshot(Number.POSITIVE_INFINITY),
    calibration:engine.calibration.all(),
    reliability:engine.reliability.all(),
    modelPerformance:engine.modelPerformance.all(),
    intervalCalibration:engine.intervalCalibration.all(),
    drift:engine.drift.all()
  };
}

function restoreEngine(engine,snapshot){
  if(!snapshot) return;
  engine.addHistoryMany(Array.isArray(snapshot.history)?snapshot.history:[]);
  engine.calibration.addMany(Array.isArray(snapshot.calibration)?snapshot.calibration:[]);
  engine.reliability.addMany(Array.isArray(snapshot.reliability)?snapshot.reliability:[]);
  engine.modelPerformance.addMany(Array.isArray(snapshot.modelPerformance)?snapshot.modelPerformance:[]);
  engine.intervalCalibration.addMany(Array.isArray(snapshot.intervalCalibration)?snapshot.intervalCalibration:[]);
  engine.drift.addMany(Array.isArray(snapshot.drift)?snapshot.drift:[]);
}

function createRuntimeState(filePath,config,opts={}){
  const engine=new ProbabilisticForecastEngine(config);
  const journal=new ForecastLearningJournal(engine,{
    maxEntries:opts.maxJournalEntries??100_000,
    maxResolutionDelayRatio:opts.maxResolutionDelayRatio??.25
  });
  const intelligence=new ForecastIntelligenceService(engine,{
    maxAuditEvents:opts.maxAuditEvents??5_000
  });
  return {
    filePath,
    engine,
    journal,
    intelligence,
    issuances:[],
    healthy:true,
    recoveredFromCorrupt:false,
    backupPath:null,
    lastError:null,
    maxIssuances:Math.max(100,Math.floor(opts.maxIssuances??5_000))
  };
}

export async function openInstitutionalForecastRuntime(filePath,{
  config=DEFAULT_INSTITUTIONAL_FORECAST_CONFIG,
  ...opts
}={}){
  await mkdir(path.dirname(filePath),{recursive:true});
  const runtime=createRuntimeState(filePath,{...config,featureIds:[...config.featureIds],horizons:config.horizons.map(x=>({...x}))},opts);

  try{
    const raw=await readFile(filePath,'utf8');
    const snapshot=JSON.parse(raw);
    if(snapshot?.version!==INSTITUTIONAL_FORECAST_RUNTIME_VERSION){
      throw new Error('unsupported institutional forecast runtime snapshot');
    }
    restoreEngine(runtime.engine,snapshot.engine);
    if(snapshot.journal) runtime.journal.restore(snapshot.journal,{rehydrateLearningMemory:false});
    if(snapshot.intelligence) runtime.intelligence.restore(snapshot.intelligence,Date.now());
    runtime.issuances=trimIssuances(
      Array.isArray(snapshot.issuances)?snapshot.issuances:[],
      runtime.maxIssuances
    );
  }catch(err){
    if(err?.code!=='ENOENT'){
      runtime.recoveredFromCorrupt=true;
      runtime.lastError=err instanceof Error?err.message:String(err);
      const backup=filePath+'.corrupt-'+Date.now();
      try{
        await rename(filePath,backup);
        runtime.backupPath=backup;
      }catch{}
    }
  }

  return runtime;
}

export function institutionalForecastRuntimeSnapshot(runtime){
  return {
    version:INSTITUTIONAL_FORECAST_RUNTIME_VERSION,
    savedAt:Date.now(),
    engine:engineSnapshot(runtime.engine),
    journal:runtime.journal.snapshot(),
    intelligence:runtime.intelligence.snapshot(),
    issuances:trimIssuances(runtime.issuances,runtime.maxIssuances)
  };
}

export async function saveInstitutionalForecastRuntime(runtime){
  if(!runtime?.healthy) throw new Error('institutional forecast runtime unhealthy: fail closed');
  await mkdir(path.dirname(runtime.filePath),{recursive:true});
  const payload=institutionalForecastRuntimeSnapshot(runtime);
  const tmp=runtime.filePath+'.tmp-'+process.pid;
  try{
    await writeFile(tmp,JSON.stringify(payload),{encoding:'utf8',mode:0o600});
    await rename(tmp,runtime.filePath);
    runtime.lastError=null;
    return payload;
  }catch(err){
    runtime.healthy=false;
    runtime.lastError=err instanceof Error?err.message:String(err);
    throw err;
  }
}

export function seedInstitutionalForecastRuntimeFromEpisodes(runtime,episodes){
  if(!runtime?.healthy) throw new Error('institutional forecast runtime unhealthy: fail closed');
  const cfg=runtime.engine.configSnapshot();
  const built=forecastHistoryFromEpisodes(episodes,{
    featureIds:cfg.featureIds,
    horizonMs:cfg.horizons.map(h=>h.horizonMs)
  });
  const before=runtime.engine.historySize();
  runtime.engine.addHistoryMany(built.rows);
  const after=runtime.engine.historySize();
  return {
    builtRows:built.rows.length,
    addedRows:after-before,
    rejected:built.rejected,
    blockedFutureOutcome:built.blockedFutureOutcome,
    historySize:after
  };
}

export function issueInstitutionalForecast(runtime,{
  input,
  scientificValidity,
  dataSafety,
  researchValidity,
  traceContext,
  generatedAt=Date.now()
}={}){
  if(!runtime?.healthy) throw new Error('institutional forecast runtime unhealthy: fail closed');
  const iv=verifyCanonicalForecastInput(input);
  if(!iv.ok) throw new Error('canonical forecast input invalid: '+iv.reasons.join(','));

  const raw=runtime.intelligence.issue(input);
  runtime.journal.record(input,raw.report.forecast);

  const issuance=createInstitutionalForecastIssuance({
    input,
    forecastReport:raw.report,
    scientificValidity,
    dataSafety,
    researchValidity,
    traceContext,
    generatedAt
  });

  const prior=runtime.issuances.find(x=>x.issuanceId===issuance.issuanceId);
  if(!prior){
    runtime.issuances.push(clone(issuance));
    runtime.issuances=trimIssuances(runtime.issuances,runtime.maxIssuances);
  }

  return deepFreeze({
    forecastId:raw.forecastId,
    issuance:prior??issuance,
    duplicate:Boolean(prior)
  });
}

function evaluationsFromResolved(runtime,resolved){
  const evaluations=[];
  for(const row of resolved){
    const forecastId=String(row.id).slice(0,-(':'+row.horizonId).length);
    const issuance=runtime.issuances
      .filter(x=>x.symbol===row.symbol)
      .find(x=>String(x.forecast?.forecastId??'')===forecastId||String(x.forecastId??'')===forecastId) ??
      runtime.issuances.find(x=>x.symbol===row.symbol&&Number(x.asOf)===Number(row.asOf));
    if(!issuance?.trace) continue;

    const evaluation=createResearchTraceEvaluation(issuance.trace,{
      horizonId:row.horizonId,
      maturedAt:row.dueAt,
      observedAt:row.resolution.resolvedAt,
      outcome:{
        resolvedPrice:row.resolution.resolvedPrice,
        actualReturn:row.resolution.actualReturn,
        actualDirection:row.resolution.actualDirection,
        maxAdverseReturn:row.resolution.maxAdverseReturn,
        maxFavorableReturn:row.resolution.maxFavorableReturn
      },
      metrics:{
        brier:row.resolution.brier,
        logLoss:row.resolution.logLoss,
        absoluteReturnError:row.resolution.absoluteReturnError,
        intervalMiss:row.resolution.intervalMiss,
        topCorrect:row.resolution.topCorrect
      },
      provenance:{
        source:'TCX_FORECAST_LEARNING_JOURNAL',
        version:'V1'
      }
    });
    evaluations.push({issuanceId:issuance.issuanceId,trace:issuance.trace,evaluation});
  }
  return evaluations;
}

export function observeInstitutionalForecastOutcomePoint(runtime,{
  symbol,
  timestamp,
  price,
  quality=1
}={}){
  if(!runtime?.healthy) throw new Error('institutional forecast runtime unhealthy: fail closed');
  const point={
    symbol:String(symbol??'').toUpperCase(),
    timestamp:finite(timestamp,'timestamp'),
    price:finite(price,'price'),
    quality
  };
  if(!(point.price>0)) throw new Error('price must be positive');
  const resolved=runtime.journal.observe(point);
  return deepFreeze({
    resolved:clone(resolved),
    evaluations:evaluationsFromResolved(runtime,resolved)
  });
}

export function observeInstitutionalForecastRuntime(runtime,{
  input,
  quality=1
}={}){
  if(!runtime?.healthy) throw new Error('institutional forecast runtime unhealthy: fail closed');
  const iv=verifyCanonicalForecastInput(input);
  if(!iv.ok) throw new Error('canonical forecast observation invalid: '+iv.reasons.join(','));

  const revisions=runtime.intelligence.observe(input);
  const resolved=runtime.journal.observe({
    symbol:input.symbol,
    timestamp:input.asOf,
    price:input.price,
    quality
  });

  return deepFreeze({
    revisions:clone(revisions),
    resolved:clone(resolved),
    evaluations:evaluationsFromResolved(runtime,resolved)
  });
}

export function latestInstitutionalForecast(runtime,symbol){
  const s=String(symbol??'').toUpperCase();
  const rows=runtime?.issuances?.filter(x=>x.symbol===s)??[];
  return rows.length?clone(rows.at(-1)):null;
}

export function institutionalForecastRuntimeSummary(runtime){
  return {
    version:INSTITUTIONAL_FORECAST_RUNTIME_VERSION,
    healthy:runtime?.healthy===true,
    recoveredFromCorrupt:runtime?.recoveredFromCorrupt===true,
    backupPath:runtime?.backupPath??null,
    lastError:runtime?.lastError??null,
    historyCases:runtime?.engine?.historySize?.()??0,
    journalEntries:runtime?.journal?.all?.().length??0,
    pendingOutcomes:runtime?.journal?.pending?.().length??0,
    issuedForecasts:runtime?.issuances?.length??0,
    trackedForecasts:runtime?.intelligence?.all?.().length??0,
    executionMode:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecute:false
  };
}
