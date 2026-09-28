import path from 'node:path';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { gzip as gzipCallback, gunzip as gunzipCallback } from 'node:zlib';

const gzip=promisify(gzipCallback);
const gunzip=promisify(gunzipCallback);

import {
  ProbabilisticForecastEngine,
  ForecastLearningJournal,
  ForecastIntelligenceService
} from './forecast-runtime/forecast/index.js';
import { verifyCanonicalForecastInput } from './forecast-input-adapter.mjs';
import { createInstitutionalForecastIssuance, verifyInstitutionalForecastIssuance } from './institutional-forecast-issuance.mjs';
import { createResearchTraceEvaluation } from './research-trace.mjs';
import { evaluateProbabilityCalibrationGate } from './forecast-runtime/forecast/evaluation.js';

export const INSTITUTIONAL_FORECAST_RUNTIME_VERSION='TCX_INSTITUTIONAL_FORECAST_RUNTIME_V1';

const DEFAULT_FORECAST_SNAPSHOT_BYTES=80*1024*1024;
function snapshotByteLimit(value){
  const n=Number(value);
  return Math.max(1024,Number.isFinite(n)&&n>0?Math.floor(n):DEFAULT_FORECAST_SNAPSHOT_BYTES);
}

function isGzipBuffer(value){
  return Buffer.isBuffer(value)&&value.length>=2&&value[0]===0x1f&&value[1]===0x8b;
}

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
const FORECAST_ISSUANCE_PERSISTENCE_ENCODING='TCX_FORECAST_ISSUANCE_DEDUP_V1';

function issuanceForPersistence(value){
  const issuance=clone(value);
  if(!issuance?.trace||!issuance?.forecast||!issuance?.scientificValidity) return issuance;
  const trace={...issuance.trace};
  delete trace.forecast;
  delete trace.science;
  issuance.trace=trace;
  issuance.persistenceEncoding=FORECAST_ISSUANCE_PERSISTENCE_ENCODING;
  return issuance;
}

function issuanceFromPersistence(value){
  const issuance=clone(value);
  if(issuance?.persistenceEncoding!==FORECAST_ISSUANCE_PERSISTENCE_ENCODING) return issuance;
  delete issuance.persistenceEncoding;
  if(!issuance?.trace||!issuance?.forecast||!issuance?.scientificValidity){
    throw new Error('invalid compact forecast issuance snapshot');
  }
  issuance.trace={
    ...issuance.trace,
    forecast:clone(issuance.forecast),
    science:clone(issuance.scientificValidity)
  };
  const verification=verifyInstitutionalForecastIssuance(issuance);
  if(!verification.ok){
    throw new Error('compact forecast issuance restore failed: '+verification.reasons.join(','));
  }
  return issuance;
}

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
  horizonMs=null,
  hasRow=()=>false,
  maxRows=Number.POSITIVE_INFINITY
}={}){
  const wanted=new Set(featureIds);
  const allowedHorizons=Array.isArray(horizonMs)&&horizonMs.length
    ?new Set(horizonMs.map(Number).filter(Number.isFinite))
    :null;
  const rows=[];
  const rowCap=Number.isFinite(Number(maxRows))?Math.max(1,Math.floor(Number(maxRows))):Number.POSITIVE_INFINITY;
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
      const id='episode:'+String(episode.id)+':'+bars;
      if(hasRow(id)) continue;
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
        id,
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
      // Keep the temporary seed buffer bounded even when an old episode file
      // contains far more rows than the serving engine is allowed to retain.
      if(rows.length>=rowCap*2){
        rows.sort((a,b)=>a.timestamp-b.timestamp||a.horizonMs-b.horizonMs);
        rows.splice(0,rows.length-rowCap);
      }
    }
  }

  rows.sort((a,b)=>a.timestamp-b.timestamp||a.horizonMs-b.horizonMs);
  if(rows.length>rowCap) rows.splice(0,rows.length-rowCap);
  return {rows,rejected,blockedFutureOutcome};
}

function engineSnapshot(engine){
  return {
    config:engine.configSnapshot(),
    // JSON serialization below is synchronous, so these live arrays cannot be
    // mutated while written. Avoid cloning every cache row into a second full
    // copy of the runtime before producing the snapshot string.
    history:engine.history,
    calibration:engine.calibration.rows,
    reliability:engine.reliability.rows,
    modelPerformance:engine.modelPerformance.rows,
    intervalCalibration:engine.intervalCalibration.rows,
    drift:engine.drift.rows
  };
}

function restoreEngine(engine,snapshot){
  if(!snapshot) return;
  const tail=(rows,cap)=>Array.isArray(rows)?rows.slice(-Math.max(1,cap)):[];
  engine.addHistoryMany(tail(snapshot.history,engine.maxHistoryRows));
  engine.calibration.addMany(tail(snapshot.calibration,engine.calibration.maxRows));
  engine.reliability.addMany(tail(snapshot.reliability,engine.reliability.maxRows));
  engine.modelPerformance.addMany(tail(snapshot.modelPerformance,engine.modelPerformance.maxRows));
  engine.intervalCalibration.addMany(tail(snapshot.intervalCalibration,engine.intervalCalibration.maxRows));
  engine.drift.addMany(tail(snapshot.drift,engine.drift.maxRows));
}

function createRuntimeState(filePath,config,opts={}){
  const engine=new ProbabilisticForecastEngine(config,{
    maxHistoryRows:opts.maxHistoryRows??2_000,
    maxCalibrationRows:opts.maxCalibrationRows??2_000,
    maxReliabilityRows:opts.maxReliabilityRows??2_000,
    maxModelPerformanceRows:opts.maxModelPerformanceRows??8_000,
    maxIntervalCalibrationRows:opts.maxIntervalCalibrationRows??2_000,
    maxDriftRows:opts.maxDriftRows??2_000
  });
  const journal=new ForecastLearningJournal(engine,{
    maxEntries:opts.maxJournalEntries??1_500,
    maxResolutionDelayRatio:opts.maxResolutionDelayRatio??.25
  });
  const intelligence=new ForecastIntelligenceService(engine,{
    maxAuditEvents:opts.maxAuditEvents??5_000,
    maxTrackedForecasts:opts.maxTrackedForecasts??5_000
  });
  return {
    filePath,
    engine,
    journal,
    intelligence,
    issuances:[],
    healthy:true,
    recoveredFromCorrupt:false,
    recoveredFromOversizedSnapshot:false,
    backupPath:null,
    lastError:null,
    maxSnapshotBytes:snapshotByteLimit(opts.maxSnapshotBytes),
    snapshotCompression:opts.snapshotCompression==='gzip'?'gzip':'json',
    snapshotEncoding:'unknown',
    loadedFromPath:null,
    migratedFromLegacyPath:null,
    lastPersistedBytes:null,
    lastPersistedLogicalBytes:null,
    snapshotProfilePending:true,
    lastSnapshotProfile:null,
    maxIssuances:Math.max(100,Math.floor(opts.maxIssuances??5_000))
  };
}

export async function openInstitutionalForecastRuntime(filePath,{
  config=DEFAULT_INSTITUTIONAL_FORECAST_CONFIG,
  maxHistoryRows=8_000,
  maxSnapshotBytes=80*1024*1024,
  legacyFilePath=null,
  snapshotCompression='json',
  ...opts
}={}){
  await mkdir(path.dirname(filePath),{recursive:true});
  const runtime=createRuntimeState(filePath,{...config,featureIds:[...config.featureIds],horizons:config.horizons.map(x=>({...x}))},{...opts,maxHistoryRows,maxSnapshotBytes,snapshotCompression});

  let sourcePath=filePath;
  try{
    let snapshotStat;
    try{
      snapshotStat=await stat(filePath);
    }catch(err){
      if(err?.code!=='ENOENT'||!legacyFilePath) throw err;
      sourcePath=legacyFilePath;
      snapshotStat=await stat(sourcePath);
      runtime.migratedFromLegacyPath=sourcePath;
    }
    runtime.loadedFromPath=sourcePath;
    runtime.lastPersistedBytes=snapshotStat.size;
    if(snapshotStat.size>runtime.maxSnapshotBytes) throw Object.assign(new Error('forecast runtime snapshot exceeds configured storage safety limit'),{code:'TCX_RUNTIME_SNAPSHOT_TOO_LARGE',bytes:snapshotStat.size,maxSnapshotBytes:runtime.maxSnapshotBytes});
    const stored=await readFile(sourcePath);
    const encodedAsGzip=isGzipBuffer(stored);
    const logical=encodedAsGzip?await gunzip(stored):stored;
    if(logical.length>runtime.maxSnapshotBytes) throw Object.assign(new Error('forecast runtime snapshot exceeds configured logical safety limit'),{code:'TCX_RUNTIME_SNAPSHOT_TOO_LARGE',bytes:logical.length,maxSnapshotBytes:runtime.maxSnapshotBytes});
    runtime.lastPersistedLogicalBytes=logical.length;
    runtime.snapshotEncoding=encodedAsGzip?'gzip':'json';
    const raw=logical.toString('utf8');
    const snapshot=JSON.parse(raw);
    if(snapshot?.version!==INSTITUTIONAL_FORECAST_RUNTIME_VERSION){
      throw new Error('unsupported institutional forecast runtime snapshot');
    }
    restoreEngine(runtime.engine,snapshot.engine);
    if(snapshot.journal) runtime.journal.restore(snapshot.journal,{rehydrateLearningMemory:false});
    if(snapshot.intelligence) runtime.intelligence.restore(snapshot.intelligence,Date.now());
    runtime.issuances=trimIssuances(
      (Array.isArray(snapshot.issuances)?snapshot.issuances:[]).map(issuanceFromPersistence),
      runtime.maxIssuances
    );
  }catch(err){
    if(err?.code!=='ENOENT'){
      const oversized=err?.code==='TCX_RUNTIME_SNAPSHOT_TOO_LARGE';
      runtime.recoveredFromCorrupt=!oversized;
      runtime.recoveredFromOversizedSnapshot=oversized;
      runtime.lastError=err instanceof Error?err.message:String(err);
      const backup=sourcePath+(oversized?'.oversized-':'.corrupt-')+Date.now();
      try{
        await rename(sourcePath,backup);
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
    journal:{version:3,entries:runtime.journal.entries},
    intelligence:runtime.intelligence.snapshot(),
    issuances:trimIssuances(runtime.issuances,runtime.maxIssuances).map(issuanceForPersistence)
  };
}

function jsonBytes(value){
  return Buffer.byteLength(JSON.stringify(value));
}

function snapshotComponentProfile(payload){
  const engine=payload?.engine??{};
  const intelligence=payload?.intelligence??{};
  const profile={
    engine:{
      total:jsonBytes(engine),
      config:jsonBytes(engine.config??null),
      history:jsonBytes(engine.history??[]),
      calibration:jsonBytes(engine.calibration??[]),
      reliability:jsonBytes(engine.reliability??[]),
      modelPerformance:jsonBytes(engine.modelPerformance??[]),
      intervalCalibration:jsonBytes(engine.intervalCalibration??[]),
      drift:jsonBytes(engine.drift??[])
    },
    journal:jsonBytes(payload?.journal??null),
    intelligence:{
      total:jsonBytes(intelligence),
      tracker:jsonBytes(intelligence.tracker??null),
      audit:jsonBytes(intelligence.audit??[])
    },
    issuances:jsonBytes(payload?.issuances??[])
  };
  const trackerRecords=Array.isArray(intelligence?.tracker?.records)?intelligence.tracker.records:[];
  const trackerFieldBytes={
    records:trackerRecords.length,
    revisions:trackerRecords.reduce((s,r)=>s+(Array.isArray(r?.revisions)?r.revisions.length:0),0),
    report:trackerRecords.reduce((s,r)=>s+jsonBytes(r?.report??null),0),
    issueState:trackerRecords.reduce((s,r)=>s+jsonBytes(r?.issueState??null),0),
    transitionAtIssue:trackerRecords.reduce((s,r)=>s+jsonBytes(r?.transitionAtIssue??null),0),
    revisionsBytes:trackerRecords.reduce((s,r)=>s+jsonBytes(r?.revisions??[]),0),
    metadata:trackerRecords.reduce((s,r)=>{
      const x={...r};
      delete x.report;
      delete x.issueState;
      delete x.transitionAtIssue;
      delete x.revisions;
      return s+jsonBytes(x);
    },0)
  };
  profile.intelligence.trackerFields=trackerFieldBytes;
  const issuanceRows=Array.isArray(payload?.issuances)?payload.issuances:[];
  profile.issuanceFields={
    rows:issuanceRows.length,
    forecast:issuanceRows.reduce((s,r)=>s+jsonBytes(r?.forecast??null),0),
    scientificValidity:issuanceRows.reduce((s,r)=>s+jsonBytes(r?.scientificValidity??null),0),
    admission:issuanceRows.reduce((s,r)=>s+jsonBytes(r?.admission??null),0),
    trace:issuanceRows.reduce((s,r)=>s+jsonBytes(r?.trace??null),0),
    metadata:issuanceRows.reduce((s,r)=>{
      const x={...r};
      delete x.forecast;
      delete x.scientificValidity;
      delete x.admission;
      delete x.trace;
      return s+jsonBytes(x);
    },0)
  };
  const topLevel=profile.engine.total+profile.journal+profile.intelligence.total+profile.issuances;
  return {...profile,topLevelBytes:topLevel};
}

export async function saveInstitutionalForecastRuntime(runtime){
  if(!runtime?.healthy) throw new Error('institutional forecast runtime unhealthy: fail closed');
  await mkdir(path.dirname(runtime.filePath),{recursive:true});
  const payload=institutionalForecastRuntimeSnapshot(runtime);
  const tmp=runtime.filePath+'.tmp-'+process.pid;
  try{
    const serialized=JSON.stringify(payload);
    const bytes=Buffer.byteLength(serialized);
    const maxSnapshotBytes=snapshotByteLimit(runtime.maxSnapshotBytes);
    if(bytes>maxSnapshotBytes){
      throw Object.assign(new Error('forecast runtime snapshot exceeds configured persistence limit'),{
        code:'TCX_RUNTIME_SNAPSHOT_TOO_LARGE_TO_PERSIST',
        bytes,
        maxSnapshotBytes
      });
    }
    let output=serialized;
    let storageBytes=bytes;
    let encoding='json';
    if(runtime.snapshotCompression==='gzip'){
      output=await gzip(Buffer.from(serialized,'utf8'),{level:1});
      storageBytes=output.length;
      encoding='gzip';
    }
    await writeFile(tmp,output,{encoding:typeof output==='string'?'utf8':undefined,mode:0o600});
    await rename(tmp,runtime.filePath);
    runtime.maxSnapshotBytes=maxSnapshotBytes;
    runtime.lastPersistedBytes=storageBytes;
    runtime.lastPersistedLogicalBytes=bytes;
    runtime.snapshotEncoding=encoding;
    runtime.loadedFromPath=runtime.filePath;
    runtime.migratedFromLegacyPath=null;
    runtime.lastError=null;
    let componentProfile=null;
    if(runtime.snapshotProfilePending){
      componentProfile=snapshotComponentProfile(payload);
      runtime.snapshotProfilePending=false;
      runtime.lastSnapshotProfile=componentProfile;
    }
    return {
      bytes:storageBytes,
      logicalBytes:bytes,
      maxSnapshotBytes,
      encoding,
      compressionRatio:bytes>0?storageBytes/bytes:null,
      componentProfile
    };
  }catch(err){
    await rm(tmp,{force:true}).catch(()=>{});
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
    horizonMs:cfg.horizons.map(h=>h.horizonMs),
    hasRow:id=>runtime.engine.hasHistory?.(id)===true,
    maxRows:runtime.engine.maxHistoryRows??8_000
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

/**
 * Feed a matured, horizon-only raw coverage probe into probability calibration.
 * These rows are isolated from portfolio performance and are admitted only when
 * the entry was a point-in-time NORMAL-safety bootstrap probe and actually
 * exited at its stated horizon.
 */
export function recordCoverageProbeCalibration(runtime,{position,closeReason,resolvedPrice}={}){
  const no=(reason)=>({recorded:false,reason,execution:'SHADOW_ONLY',canExecuteLive:false});
  if(!runtime?.healthy||!runtime?.engine?.calibration) return no('RUNTIME_UNHEALTHY');
  if(String(position?.entryMode||'').toUpperCase()!=='COVERAGE_PROBE') return no('NOT_COVERAGE_PROBE');
  if(String(position?.coverageEvidenceTier||'').toUpperCase()!=='BOOTSTRAP_RAW_FORECAST') return no('NOT_RAW_BOOTSTRAP_EVIDENCE');
  if(String(position?.coverageDataSafety||'').toUpperCase()!=='NORMAL') return no('DATA_SAFETY_NOT_NORMAL');
  if(position?.horizonOnlyExit!==true) return no('NOT_HORIZON_ONLY');
  if(String(position?.coverageHorizonGate||'').toUpperCase()==='INSUFFICIENT') return no('HORIZON_INSUFFICIENT');
  if(String(position?.status||'').toUpperCase()!=='CLOSED'||String(closeReason||position?.closeReason||'').toUpperCase()!=='HORIZON_EXIT') return no('NOT_HORIZON_RESOLVED');
  if(String(position?.execution||'')!=='SHADOW_ONLY'||position?.canExecuteLive!==false) return no('EXECUTION_INVARIANT_INVALID');
  const p=position?.coverageProbabilityVector||{};
  const up=finiteOrNull(p.up),down=finiteOrNull(p.down),flat=finiteOrNull(p.flat);
  const sum=Number(up)+Number(down)+Number(flat);
  const referencePrice=finiteOrNull(position?.coverageReferencePrice),observedPrice=finiteOrNull(resolvedPrice);
  const asOf=finiteOrNull(position?.coverageForecastAsOf),resolvedAt=finiteOrNull(position?.closedAt);
  const horizonMs=finiteOrNull(position?.horizonMs),threshold=finiteOrNull(position?.coverageFlatThreshold);
  if([up,down,flat,referencePrice,observedPrice,asOf,resolvedAt,horizonMs,threshold].some(x=>x==null)||up<0||down<0||flat<0||Math.abs(sum-1)>.001||referencePrice<=0||observedPrice<=0||resolvedAt<asOf+horizonMs) return no('OUTCOME_OR_PROBABILITY_INVALID');
  const id='coverage-bootstrap:'+String(position.coverageKey||position.entryOrderId||position.positionId||'');
  if(id.endsWith(':')) return no('COVERAGE_ID_MISSING');
  if(runtime.engine.calibration.keys?.has(id)) return no('DUPLICATE_OUTCOME');
  runtime.engine.calibration.add({
    id,
    symbol:String(position.symbol||'').toUpperCase(),
    horizonMs,
    regimeId:String(position.coverageRegimeId||'UNKNOWN'),
    predictedUp:up,predictedDown:down,predictedFlat:flat,
    actualReturn:observedPrice/referencePrice-1,
    flatThreshold:threshold,
    resolvedAt,
    quality:.5,
    source:'SHADOW_COVERAGE_RAW_BOOTSTRAP'
  });
  return {recorded:true,id,quality:.5,evidenceTier:'BOOTSTRAP_RAW_FORECAST',execution:'SHADOW_ONLY',canExecuteLive:false};
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
  const probabilityCalibration=runtime?.journal?.all?evaluateProbabilityCalibrationGate(runtime.journal.all()):null;
  return {
    version:INSTITUTIONAL_FORECAST_RUNTIME_VERSION,
    healthy:runtime?.healthy===true,
    recoveredFromCorrupt:runtime?.recoveredFromCorrupt===true,
    recoveredFromOversizedSnapshot:runtime?.recoveredFromOversizedSnapshot===true,
    backupPath:runtime?.backupPath??null,
    lastError:runtime?.lastError??null,
    maxSnapshotBytes:runtime?.maxSnapshotBytes??null,
    snapshotEncoding:runtime?.snapshotEncoding??'unknown',
    loadedFromPath:runtime?.loadedFromPath??null,
    migratedFromLegacyPath:runtime?.migratedFromLegacyPath??null,
    lastPersistedBytes:runtime?.lastPersistedBytes??null,
    lastPersistedLogicalBytes:runtime?.lastPersistedLogicalBytes??null,
    snapshotBudgetUtilization:Number(runtime?.maxSnapshotBytes)>0&&Number.isFinite(Number(runtime?.lastPersistedLogicalBytes))
      ?Number(runtime.lastPersistedLogicalBytes)/Number(runtime.maxSnapshotBytes)
      :null,
    snapshotCompressionRatio:Number(runtime?.lastPersistedLogicalBytes)>0&&Number.isFinite(Number(runtime?.lastPersistedBytes))
      ?Number(runtime.lastPersistedBytes)/Number(runtime.lastPersistedLogicalBytes)
      :null,
    snapshotProfile:runtime?.lastSnapshotProfile??null,
    historyCases:runtime?.engine?.historySize?.()??0,
    journalEntries:runtime?.journal?.all?.().length??0,
    pendingOutcomes:runtime?.journal?.pending?.().length??0,
    issuedForecasts:runtime?.issuances?.length??0,
    trackedForecasts:runtime?.intelligence?.all?.().length??0,
    probabilityCalibration,
    executionMode:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecute:false
  };
}
