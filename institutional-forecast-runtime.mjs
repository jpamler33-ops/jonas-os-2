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
import { sha256 } from './institutional-kernel.mjs';

export const INSTITUTIONAL_FORECAST_RUNTIME_VERSION='TCX_INSTITUTIONAL_FORECAST_RUNTIME_V1';

const DEFAULT_FORECAST_SNAPSHOT_BYTES=80*1024*1024;
const DEFAULT_FORECAST_ISSUANCE_STORE_BYTES=64*1024*1024;
const FORECAST_ISSUANCE_STORE_VERSION='TCX_FORECAST_ISSUANCE_STORE_V1';
const DEFAULT_FORECAST_TRACKER_ARCHIVE_BYTES=64*1024*1024;
const FORECAST_TRACKER_ARCHIVE_VERSION='TCX_FORECAST_TRACKER_ARCHIVE_V1';
const DEFAULT_FORECAST_ENGINE_STORE_BYTES=64*1024*1024;
const FORECAST_ENGINE_STORE_VERSION='TCX_FORECAST_ENGINE_STORE_V1';
const DEFAULT_FORECAST_JOURNAL_STORE_BYTES=64*1024*1024;
const FORECAST_JOURNAL_STORE_VERSION='TCX_FORECAST_JOURNAL_STORE_V1';
const FORECAST_PERSISTENCE_MANIFEST_VERSION='TCX_FORECAST_PERSISTENCE_MANIFEST_V1';
function snapshotByteLimit(value){
  const n=Number(value);
  return Math.max(1024,Number.isFinite(n)&&n>0?Math.floor(n):DEFAULT_FORECAST_SNAPSHOT_BYTES);
}

function issuanceStoreByteLimit(value){
  const n=Number(value);
  return Math.max(1024,Number.isFinite(n)&&n>0?Math.floor(n):DEFAULT_FORECAST_ISSUANCE_STORE_BYTES);
}

function issuanceStorePath(filePath,slot){
  if(slot!=='a'&&slot!=='b') throw new Error('invalid forecast issuance store slot');
  return filePath+'.issuances.'+slot+'.json.gz';
}

function trackerArchiveByteLimit(value){
  const n=Number(value);
  return Math.max(1024,Number.isFinite(n)&&n>0?Math.floor(n):DEFAULT_FORECAST_TRACKER_ARCHIVE_BYTES);
}

function trackerArchivePath(filePath,slot){
  if(slot!=='a'&&slot!=='b') throw new Error('invalid forecast tracker archive slot');
  return filePath+'.tracker.'+slot+'.json.gz';
}

function engineStoreByteLimit(value){
  const n=Number(value);
  return Math.max(1024,Number.isFinite(n)&&n>0?Math.floor(n):DEFAULT_FORECAST_ENGINE_STORE_BYTES);
}

function engineStorePath(filePath,slot){
  if(slot!=='a'&&slot!=='b') throw new Error('invalid forecast engine store slot');
  return filePath+'.engine.'+slot+'.json.gz';
}

function journalStoreByteLimit(value){
  const n=Number(value);
  return Math.max(1024,Number.isFinite(n)&&n>0?Math.floor(n):DEFAULT_FORECAST_JOURNAL_STORE_BYTES);
}

function journalStorePath(filePath,slot){
  if(slot!=='a'&&slot!=='b') throw new Error('invalid forecast journal store slot');
  return filePath+'.journal.'+slot+'.json.gz';
}

function isGzipBuffer(value){
  return Buffer.isBuffer(value)&&value.length>=2&&value[0]===0x1f&&value[1]===0x8b;
}

function manifestComponentsFromSnapshot(snapshot){
  return {
    issuanceStore:snapshot?.issuanceStore??null,
    trackerArchive:snapshot?.trackerArchive??null,
    engineStore:snapshot?.engineStore??null,
    journalStore:snapshot?.journalStore??null
  };
}

function hotSnapshotForManifest(snapshot){
  return {
    version:snapshot?.version,
    savedAt:snapshot?.savedAt,
    engine:snapshot?.engine??null,
    journal:snapshot?.journal??null,
    intelligence:snapshot?.intelligence??null,
    issuances:Array.isArray(snapshot?.issuances)?snapshot.issuances:[]
  };
}

function buildPersistenceManifest(snapshot){
  const core={
    version:FORECAST_PERSISTENCE_MANIFEST_VERSION,
    snapshotVersion:snapshot?.version??null,
    savedAt:snapshot?.savedAt??null,
    hotHash:sha256(hotSnapshotForManifest(snapshot)),
    components:manifestComponentsFromSnapshot(snapshot)
  };
  return {...core,generationId:sha256(core)};
}

function verifyPersistenceManifest(snapshot){
  const manifest=snapshot?.persistenceManifest;
  if(!manifest){
    return {status:'LEGACY_UNBOUND',generationId:null,hotHash:null};
  }
  if(manifest?.version!==FORECAST_PERSISTENCE_MANIFEST_VERSION){
    throw new Error('unsupported forecast persistence manifest');
  }
  const {generationId,...core}=manifest;
  if(typeof generationId!=='string'||sha256(core)!==generationId){
    throw new Error('forecast persistence manifest hash mismatch');
  }
  if(core.snapshotVersion!==snapshot.version||core.savedAt!==snapshot.savedAt){
    throw new Error('forecast persistence manifest snapshot identity mismatch');
  }
  const hotHash=sha256(hotSnapshotForManifest(snapshot));
  if(core.hotHash!==hotHash){
    throw new Error('forecast persistence manifest hot snapshot mismatch');
  }
  if(sha256(core.components)!==sha256(manifestComponentsFromSnapshot(snapshot))){
    throw new Error('forecast persistence manifest component reference mismatch');
  }
  return {status:'VERIFIED',generationId,hotHash};
}

function verifyStoredLengths(meta,storageBytes,logicalBytes,label){
  if(Number.isFinite(Number(meta?.storageBytes))&&Number(meta.storageBytes)!==storageBytes){
    throw new Error(label+' storage byte count mismatch');
  }
  if(Number.isFinite(Number(meta?.logicalBytes))&&Number(meta.logicalBytes)!==logicalBytes){
    throw new Error(label+' logical byte count mismatch');
  }
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
    maxIssuanceStoreBytes:issuanceStoreByteLimit(opts.maxIssuanceStoreBytes),
    issuanceStoreSlot:null,
    issuanceStoreHash:null,
    issuanceStoreCount:0,
    lastIssuanceStoreBytes:null,
    lastIssuanceStoreLogicalBytes:null,
    maxTrackerArchiveBytes:trackerArchiveByteLimit(opts.maxTrackerArchiveBytes),
    trackerArchiveSlot:null,
    trackerArchiveHash:null,
    trackerArchiveRecordCount:0,
    trackerArchiveRevisionCount:0,
    lastTrackerArchiveBytes:null,
    lastTrackerArchiveLogicalBytes:null,
    maxEngineStoreBytes:engineStoreByteLimit(opts.maxEngineStoreBytes),
    engineStoreSlot:null,
    engineStoreHash:null,
    lastEngineStoreBytes:null,
    lastEngineStoreLogicalBytes:null,
    maxJournalStoreBytes:journalStoreByteLimit(opts.maxJournalStoreBytes),
    journalStoreSlot:null,
    journalStoreHash:null,
    journalStoreCount:0,
    lastJournalStoreBytes:null,
    lastJournalStoreLogicalBytes:null,
    persistenceManifestStatus:'UNINITIALIZED',
    persistenceGenerationId:null,
    persistenceManifestHotHash:null,
    snapshotProfilePending:true,
    lastSnapshotProfile:null,
    maxIssuances:Math.max(100,Math.floor(opts.maxIssuances??5_000))
  };
}

export async function openInstitutionalForecastRuntime(filePath,{
  config=DEFAULT_INSTITUTIONAL_FORECAST_CONFIG,
  maxHistoryRows=8_000,
  maxSnapshotBytes=80*1024*1024,
  maxIssuanceStoreBytes=64*1024*1024,
  maxTrackerArchiveBytes=64*1024*1024,
  maxEngineStoreBytes=64*1024*1024,
  maxJournalStoreBytes=64*1024*1024,
  legacyFilePath=null,
  snapshotCompression='json',
  ...opts
}={}){
  await mkdir(path.dirname(filePath),{recursive:true});
  const runtime=createRuntimeState(filePath,{...config,featureIds:[...config.featureIds],horizons:config.horizons.map(x=>({...x}))},{...opts,maxHistoryRows,maxSnapshotBytes,maxIssuanceStoreBytes,maxTrackerArchiveBytes,maxEngineStoreBytes,maxJournalStoreBytes,snapshotCompression});

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
    const persistenceManifestVerification=verifyPersistenceManifest(snapshot);
    let engineState=snapshot.engine;
    if(snapshot.engineStore){
      const meta=snapshot.engineStore;
      if(meta?.version!==FORECAST_ENGINE_STORE_VERSION||!['a','b'].includes(meta?.slot)||typeof meta?.sha256!=='string'){
        throw new Error('invalid forecast engine store reference');
      }
      const storePath=engineStorePath(sourcePath,meta.slot);
      const storeStat=await stat(storePath);
      if(storeStat.size>runtime.maxEngineStoreBytes){
        throw Object.assign(new Error('forecast engine store exceeds configured storage safety limit'),{
          code:'TCX_ENGINE_STORE_TOO_LARGE',
          bytes:storeStat.size,
          maxEngineStoreBytes:runtime.maxEngineStoreBytes
        });
      }
      const packed=await readFile(storePath);
      const engineLogical=await gunzip(packed);
      if(engineLogical.length>runtime.maxEngineStoreBytes){
        throw Object.assign(new Error('forecast engine store exceeds configured logical safety limit'),{
          code:'TCX_ENGINE_STORE_TOO_LARGE',
          bytes:engineLogical.length,
          maxEngineStoreBytes:runtime.maxEngineStoreBytes
        });
      }
      verifyStoredLengths(meta,storeStat.size,engineLogical.length,'forecast engine store');
      const serializedEngine=engineLogical.toString('utf8');
      if(sha256(serializedEngine)!==meta.sha256) throw new Error('forecast engine store hash mismatch');
      const store=JSON.parse(serializedEngine);
      if(store?.version!==FORECAST_ENGINE_STORE_VERSION||!store?.engine){
        throw new Error('unsupported forecast engine store');
      }
      engineState={
        config:snapshot?.engine?.config??store.engine.config,
        history:store.engine.history,
        calibration:store.engine.calibration,
        reliability:store.engine.reliability,
        modelPerformance:store.engine.modelPerformance,
        intervalCalibration:store.engine.intervalCalibration,
        drift:store.engine.drift
      };
      runtime.engineStoreSlot=meta.slot;
      runtime.engineStoreHash=meta.sha256;
      runtime.lastEngineStoreBytes=storeStat.size;
      runtime.lastEngineStoreLogicalBytes=engineLogical.length;
    }
    restoreEngine(runtime.engine,engineState);
    let journalSnapshot=snapshot.journal;
    if(snapshot.journalStore){
      const meta=snapshot.journalStore;
      if(meta?.version!==FORECAST_JOURNAL_STORE_VERSION||!['a','b'].includes(meta?.slot)||typeof meta?.sha256!=='string'){
        throw new Error('invalid forecast journal store reference');
      }
      const storePath=journalStorePath(sourcePath,meta.slot);
      const storeStat=await stat(storePath);
      if(storeStat.size>runtime.maxJournalStoreBytes){
        throw Object.assign(new Error('forecast journal store exceeds configured storage safety limit'),{
          code:'TCX_JOURNAL_STORE_TOO_LARGE',
          bytes:storeStat.size,
          maxJournalStoreBytes:runtime.maxJournalStoreBytes
        });
      }
      const packed=await readFile(storePath);
      const journalLogical=await gunzip(packed);
      if(journalLogical.length>runtime.maxJournalStoreBytes){
        throw Object.assign(new Error('forecast journal store exceeds configured logical safety limit'),{
          code:'TCX_JOURNAL_STORE_TOO_LARGE',
          bytes:journalLogical.length,
          maxJournalStoreBytes:runtime.maxJournalStoreBytes
        });
      }
      verifyStoredLengths(meta,storeStat.size,journalLogical.length,'forecast journal store');
      const serializedJournal=journalLogical.toString('utf8');
      if(sha256(serializedJournal)!==meta.sha256) throw new Error('forecast journal store hash mismatch');
      const store=JSON.parse(serializedJournal);
      if(store?.version!==FORECAST_JOURNAL_STORE_VERSION||!store?.journal||!Array.isArray(store.journal.entries)){
        throw new Error('unsupported forecast journal store');
      }
      if(Number.isFinite(Number(meta.count))&&store.journal.entries.length!==Number(meta.count)){
        throw new Error('forecast journal store count mismatch');
      }
      journalSnapshot=store.journal;
      runtime.journalStoreSlot=meta.slot;
      runtime.journalStoreHash=meta.sha256;
      runtime.journalStoreCount=store.journal.entries.length;
      runtime.lastJournalStoreBytes=storeStat.size;
      runtime.lastJournalStoreLogicalBytes=journalLogical.length;
    }
    if(journalSnapshot) runtime.journal.restore(journalSnapshot,{rehydrateLearningMemory:false});
    let intelligenceSnapshot=snapshot.intelligence?clone(snapshot.intelligence):null;
    if(snapshot.trackerArchive){
      const meta=snapshot.trackerArchive;
      if(meta?.version!==FORECAST_TRACKER_ARCHIVE_VERSION||!['a','b'].includes(meta?.slot)||typeof meta?.sha256!=='string'){
        throw new Error('invalid forecast tracker archive reference');
      }
      const archivePath=trackerArchivePath(sourcePath,meta.slot);
      const archiveStat=await stat(archivePath);
      if(archiveStat.size>runtime.maxTrackerArchiveBytes){
        throw Object.assign(new Error('forecast tracker archive exceeds configured storage safety limit'),{
          code:'TCX_TRACKER_ARCHIVE_TOO_LARGE',
          bytes:archiveStat.size,
          maxTrackerArchiveBytes:runtime.maxTrackerArchiveBytes
        });
      }
      const packed=await readFile(archivePath);
      const logical=await gunzip(packed);
      if(logical.length>runtime.maxTrackerArchiveBytes){
        throw Object.assign(new Error('forecast tracker archive exceeds configured logical safety limit'),{
          code:'TCX_TRACKER_ARCHIVE_TOO_LARGE',
          bytes:logical.length,
          maxTrackerArchiveBytes:runtime.maxTrackerArchiveBytes
        });
      }
      verifyStoredLengths(meta,archiveStat.size,logical.length,'forecast tracker archive');
      const serializedArchive=logical.toString('utf8');
      if(sha256(serializedArchive)!==meta.sha256) throw new Error('forecast tracker archive hash mismatch');
      const archive=JSON.parse(serializedArchive);
      if(archive?.version!==FORECAST_TRACKER_ARCHIVE_VERSION||!Array.isArray(archive?.records)){
        throw new Error('unsupported forecast tracker archive');
      }
      if(Number.isFinite(Number(meta.recordCount))&&archive.records.length!==Number(meta.recordCount)){
        throw new Error('forecast tracker archive record count mismatch');
      }
      const archiveById=new Map(archive.records.map(row=>[row.id,row]));
      const trackerRecords=intelligenceSnapshot?.tracker?.records;
      if(!Array.isArray(trackerRecords)) throw new Error('forecast tracker archive missing tracker records');
      let restoredRevisionCount=0;
      for(const record of trackerRecords){
        const archived=archiveById.get(record.id);
        if(!archived) throw new Error('forecast tracker archive record missing: '+record.id);
        record.issueState=clone(archived.issueState);
        record.revisions=clone(Array.isArray(archived.revisions)?archived.revisions:[]);
        restoredRevisionCount+=record.revisions.length;
      }
      if(Number.isFinite(Number(meta.revisionCount))&&restoredRevisionCount!==Number(meta.revisionCount)){
        throw new Error('forecast tracker archive revision count mismatch');
      }
      runtime.trackerArchiveSlot=meta.slot;
      runtime.trackerArchiveHash=meta.sha256;
      runtime.trackerArchiveRecordCount=archive.records.length;
      runtime.trackerArchiveRevisionCount=restoredRevisionCount;
      runtime.lastTrackerArchiveBytes=archiveStat.size;
      runtime.lastTrackerArchiveLogicalBytes=logical.length;
    }
    if(intelligenceSnapshot) runtime.intelligence.restore(intelligenceSnapshot,Date.now());
    let persistedIssuances=Array.isArray(snapshot.issuances)?snapshot.issuances:[];
    if(snapshot.issuanceStore){
      const meta=snapshot.issuanceStore;
      if(meta?.version!==FORECAST_ISSUANCE_STORE_VERSION||!['a','b'].includes(meta?.slot)||typeof meta?.sha256!=='string'){
        throw new Error('invalid forecast issuance store reference');
      }
      const storePath=issuanceStorePath(sourcePath,meta.slot);
      const storeStat=await stat(storePath);
      if(storeStat.size>runtime.maxIssuanceStoreBytes){
        throw Object.assign(new Error('forecast issuance store exceeds configured storage safety limit'),{
          code:'TCX_ISSUANCE_STORE_TOO_LARGE',
          bytes:storeStat.size,
          maxIssuanceStoreBytes:runtime.maxIssuanceStoreBytes
        });
      }
      const packed=await readFile(storePath);
      const logical=await gunzip(packed);
      if(logical.length>runtime.maxIssuanceStoreBytes){
        throw Object.assign(new Error('forecast issuance store exceeds configured logical safety limit'),{
          code:'TCX_ISSUANCE_STORE_TOO_LARGE',
          bytes:logical.length,
          maxIssuanceStoreBytes:runtime.maxIssuanceStoreBytes
        });
      }
      verifyStoredLengths(meta,storeStat.size,logical.length,'forecast issuance store');
      const serializedStore=logical.toString('utf8');
      if(sha256(serializedStore)!==meta.sha256) throw new Error('forecast issuance store hash mismatch');
      const store=JSON.parse(serializedStore);
      if(store?.version!==FORECAST_ISSUANCE_STORE_VERSION||!Array.isArray(store?.issuances)){
        throw new Error('unsupported forecast issuance store');
      }
      if(Number.isFinite(Number(meta.count))&&store.issuances.length!==Number(meta.count)){
        throw new Error('forecast issuance store count mismatch');
      }
      persistedIssuances=store.issuances;
      runtime.issuanceStoreSlot=meta.slot;
      runtime.issuanceStoreHash=meta.sha256;
      runtime.issuanceStoreCount=store.issuances.length;
      runtime.lastIssuanceStoreBytes=storeStat.size;
      runtime.lastIssuanceStoreLogicalBytes=logical.length;
    }
    runtime.issuances=trimIssuances(
      persistedIssuances.map(issuanceFromPersistence),
      runtime.maxIssuances
    );
    runtime.persistenceManifestStatus=persistenceManifestVerification.status;
    runtime.persistenceGenerationId=persistenceManifestVerification.generationId;
    runtime.persistenceManifestHotHash=persistenceManifestVerification.hotHash;
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

const TRACKER_REPORT_PERSISTENCE_PROJECTION='TCX_TRACKER_REPORT_OPERATIONAL_V1';

function trackerReportForPersistence(report){
  if(!report||typeof report!=='object') return report;
  return {
    persistenceProjection:TRACKER_REPORT_PERSISTENCE_PROJECTION,
    symbol:report.symbol,
    asOf:report.asOf,
    price:report.price,
    executionMode:report.executionMode,
    forecasts:(Array.isArray(report.forecasts)?report.forecasts:[]).map(f=>({
      horizonId:f.horizonId,
      horizonMs:f.horizonMs,
      flatThreshold:f.flatThreshold,
      gate:f.gate,
      direction:f.direction,
      expectedReturn:f.expectedReturn,
      probabilities:clone(f.probabilities),
      interval:{
        q10:f?.interval?.q10,
        q90:f?.interval?.q90
      },
      operationalConfidence:f.operationalConfidence
    }))
  };
}

function intelligenceForPersistence(snapshot,{externalizeTrackerArchive=false}={}){
  if(!snapshot?.tracker||!Array.isArray(snapshot.tracker.records)) return snapshot;
  return {
    ...snapshot,
    tracker:{
      ...snapshot.tracker,
      records:snapshot.tracker.records.map(record=>({
        ...record,
        report:trackerReportForPersistence(record.report),
        ...(externalizeTrackerArchive?{issueState:null,revisions:[]}:null)
      }))
    }
  };
}

function trackerArchiveForPersistence(snapshot){
  const records=Array.isArray(snapshot?.tracker?.records)?snapshot.tracker.records:[];
  return {
    version:FORECAST_TRACKER_ARCHIVE_VERSION,
    records:records.map(record=>({
      id:record.id,
      issueState:clone(record.issueState),
      revisions:clone(Array.isArray(record.revisions)?record.revisions:[])
    }))
  };
}

export async function saveInstitutionalForecastRuntime(runtime){
  if(!runtime?.healthy) throw new Error('institutional forecast runtime unhealthy: fail closed');
  await mkdir(path.dirname(runtime.filePath),{recursive:true});
  const payload=institutionalForecastRuntimeSnapshot(runtime);
  const externalizeArchives=runtime.snapshotCompression==='gzip';
  let persistencePayload={
    ...payload,
    intelligence:intelligenceForPersistence(payload.intelligence,{externalizeTrackerArchive:externalizeArchives})
  };
  const tmp=runtime.filePath+'.tmp-'+process.pid;
  let issuanceStoreMeta=null;
  let trackerArchiveMeta=null;
  let engineStoreMeta=null;
  let journalStoreMeta=null;
  try{
    if(externalizeArchives){
      const journalStorePayload={
        version:FORECAST_JOURNAL_STORE_VERSION,
        journal:payload.journal
      };
      const journalSerialized=JSON.stringify(journalStorePayload);
      const journalLogicalBytes=Buffer.byteLength(journalSerialized);
      const maxJournalStoreBytes=journalStoreByteLimit(runtime.maxJournalStoreBytes);
      if(journalLogicalBytes>maxJournalStoreBytes){
        throw Object.assign(new Error('forecast journal store exceeds configured persistence limit'),{
          code:'TCX_JOURNAL_STORE_TOO_LARGE_TO_PERSIST',
          bytes:journalLogicalBytes,
          maxJournalStoreBytes
        });
      }
      const journalHash=sha256(journalSerialized);
      let journalSlot=runtime.journalStoreSlot;
      let journalBytes=runtime.lastJournalStoreBytes;
      if(!journalSlot||runtime.journalStoreHash!==journalHash){
        journalSlot=runtime.journalStoreSlot==='a'?'b':'a';
        const packed=await gzip(Buffer.from(journalSerialized,'utf8'),{level:1});
        const storePath=journalStorePath(runtime.filePath,journalSlot);
        const storeTmp=storePath+'.tmp-'+process.pid;
        try{
          await writeFile(storeTmp,packed,{mode:0o600});
          await rename(storeTmp,storePath);
        }catch(err){
          await rm(storeTmp,{force:true}).catch(()=>{});
          throw err;
        }
        journalBytes=packed.length;
      }
      journalStoreMeta={
        version:FORECAST_JOURNAL_STORE_VERSION,
        slot:journalSlot,
        sha256:journalHash,
        count:Array.isArray(payload?.journal?.entries)?payload.journal.entries.length:0,
        storageBytes:journalBytes,
        logicalBytes:journalLogicalBytes
      };
      persistencePayload={
        ...persistencePayload,
        journal:{version:payload?.journal?.version??3,entries:[]},
        journalStore:journalStoreMeta
      };

      const engineStorePayload={
        version:FORECAST_ENGINE_STORE_VERSION,
        engine:payload.engine
      };
      const engineSerialized=JSON.stringify(engineStorePayload);
      const engineLogicalBytes=Buffer.byteLength(engineSerialized);
      const maxEngineStoreBytes=engineStoreByteLimit(runtime.maxEngineStoreBytes);
      if(engineLogicalBytes>maxEngineStoreBytes){
        throw Object.assign(new Error('forecast engine store exceeds configured persistence limit'),{
          code:'TCX_ENGINE_STORE_TOO_LARGE_TO_PERSIST',
          bytes:engineLogicalBytes,
          maxEngineStoreBytes
        });
      }
      const engineHash=sha256(engineSerialized);
      let engineSlot=runtime.engineStoreSlot;
      let engineBytes=runtime.lastEngineStoreBytes;
      if(!engineSlot||runtime.engineStoreHash!==engineHash){
        engineSlot=runtime.engineStoreSlot==='a'?'b':'a';
        const packed=await gzip(Buffer.from(engineSerialized,'utf8'),{level:1});
        const storePath=engineStorePath(runtime.filePath,engineSlot);
        const storeTmp=storePath+'.tmp-'+process.pid;
        try{
          await writeFile(storeTmp,packed,{mode:0o600});
          await rename(storeTmp,storePath);
        }catch(err){
          await rm(storeTmp,{force:true}).catch(()=>{});
          throw err;
        }
        engineBytes=packed.length;
      }
      engineStoreMeta={
        version:FORECAST_ENGINE_STORE_VERSION,
        slot:engineSlot,
        sha256:engineHash,
        storageBytes:engineBytes,
        logicalBytes:engineLogicalBytes
      };
      persistencePayload={
        ...persistencePayload,
        engine:{config:payload.engine?.config??null},
        engineStore:engineStoreMeta
      };
    }
    if(externalizeArchives){
      const trackerArchive=trackerArchiveForPersistence(payload.intelligence);
      const archiveSerialized=JSON.stringify(trackerArchive);
      const archiveLogicalBytes=Buffer.byteLength(archiveSerialized);
      const maxTrackerArchiveBytes=trackerArchiveByteLimit(runtime.maxTrackerArchiveBytes);
      if(archiveLogicalBytes>maxTrackerArchiveBytes){
        throw Object.assign(new Error('forecast tracker archive exceeds configured persistence limit'),{
          code:'TCX_TRACKER_ARCHIVE_TOO_LARGE_TO_PERSIST',
          bytes:archiveLogicalBytes,
          maxTrackerArchiveBytes
        });
      }
      const archiveHash=sha256(archiveSerialized);
      let slot=runtime.trackerArchiveSlot;
      let archiveBytes=runtime.lastTrackerArchiveBytes;
      if(!slot||runtime.trackerArchiveHash!==archiveHash){
        slot=runtime.trackerArchiveSlot==='a'?'b':'a';
        const packed=await gzip(Buffer.from(archiveSerialized,'utf8'),{level:1});
        const archivePath=trackerArchivePath(runtime.filePath,slot);
        const archiveTmp=archivePath+'.tmp-'+process.pid;
        try{
          await writeFile(archiveTmp,packed,{mode:0o600});
          await rename(archiveTmp,archivePath);
        }catch(err){
          await rm(archiveTmp,{force:true}).catch(()=>{});
          throw err;
        }
        archiveBytes=packed.length;
      }
      const revisionCount=trackerArchive.records.reduce((n,row)=>n+row.revisions.length,0);
      trackerArchiveMeta={
        version:FORECAST_TRACKER_ARCHIVE_VERSION,
        slot,
        sha256:archiveHash,
        recordCount:trackerArchive.records.length,
        revisionCount,
        storageBytes:archiveBytes,
        logicalBytes:archiveLogicalBytes
      };
      persistencePayload={
        ...persistencePayload,
        trackerArchive:trackerArchiveMeta
      };
    }
    if(externalizeArchives){
      const storePayload={
        version:FORECAST_ISSUANCE_STORE_VERSION,
        issuances:payload.issuances
      };
      const storeSerialized=JSON.stringify(storePayload);
      const storeLogicalBytes=Buffer.byteLength(storeSerialized);
      const maxIssuanceStoreBytes=issuanceStoreByteLimit(runtime.maxIssuanceStoreBytes);
      if(storeLogicalBytes>maxIssuanceStoreBytes){
        throw Object.assign(new Error('forecast issuance store exceeds configured persistence limit'),{
          code:'TCX_ISSUANCE_STORE_TOO_LARGE_TO_PERSIST',
          bytes:storeLogicalBytes,
          maxIssuanceStoreBytes
        });
      }
      const storeHash=sha256(storeSerialized);
      let slot=runtime.issuanceStoreSlot;
      let storeBytes=runtime.lastIssuanceStoreBytes;
      if(!slot||runtime.issuanceStoreHash!==storeHash){
        slot=runtime.issuanceStoreSlot==='a'?'b':'a';
        const packed=await gzip(Buffer.from(storeSerialized,'utf8'),{level:1});
        const storePath=issuanceStorePath(runtime.filePath,slot);
        const storeTmp=storePath+'.tmp-'+process.pid;
        try{
          await writeFile(storeTmp,packed,{mode:0o600});
          await rename(storeTmp,storePath);
        }catch(err){
          await rm(storeTmp,{force:true}).catch(()=>{});
          throw err;
        }
        storeBytes=packed.length;
      }
      issuanceStoreMeta={
        version:FORECAST_ISSUANCE_STORE_VERSION,
        slot,
        sha256:storeHash,
        count:payload.issuances.length,
        storageBytes:storeBytes,
        logicalBytes:storeLogicalBytes
      };
      persistencePayload={
        ...persistencePayload,
        issuances:[],
        issuanceStore:issuanceStoreMeta
      };
    }
    const persistenceManifest=buildPersistenceManifest(persistencePayload);
    persistencePayload={
      ...persistencePayload,
      persistenceManifest
    };
    const serialized=JSON.stringify(persistencePayload);
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
    runtime.persistenceManifestStatus='VERIFIED';
    runtime.persistenceGenerationId=persistencePayload.persistenceManifest.generationId;
    runtime.persistenceManifestHotHash=persistencePayload.persistenceManifest.hotHash;
    if(issuanceStoreMeta){
      runtime.maxIssuanceStoreBytes=issuanceStoreByteLimit(runtime.maxIssuanceStoreBytes);
      runtime.issuanceStoreSlot=issuanceStoreMeta.slot;
      runtime.issuanceStoreHash=issuanceStoreMeta.sha256;
      runtime.issuanceStoreCount=issuanceStoreMeta.count;
      runtime.lastIssuanceStoreBytes=issuanceStoreMeta.storageBytes;
      runtime.lastIssuanceStoreLogicalBytes=issuanceStoreMeta.logicalBytes;
    }
    if(trackerArchiveMeta){
      runtime.maxTrackerArchiveBytes=trackerArchiveByteLimit(runtime.maxTrackerArchiveBytes);
      runtime.trackerArchiveSlot=trackerArchiveMeta.slot;
      runtime.trackerArchiveHash=trackerArchiveMeta.sha256;
      runtime.trackerArchiveRecordCount=trackerArchiveMeta.recordCount;
      runtime.trackerArchiveRevisionCount=trackerArchiveMeta.revisionCount;
      runtime.lastTrackerArchiveBytes=trackerArchiveMeta.storageBytes;
      runtime.lastTrackerArchiveLogicalBytes=trackerArchiveMeta.logicalBytes;
    }
    if(engineStoreMeta){
      runtime.maxEngineStoreBytes=engineStoreByteLimit(runtime.maxEngineStoreBytes);
      runtime.engineStoreSlot=engineStoreMeta.slot;
      runtime.engineStoreHash=engineStoreMeta.sha256;
      runtime.lastEngineStoreBytes=engineStoreMeta.storageBytes;
      runtime.lastEngineStoreLogicalBytes=engineStoreMeta.logicalBytes;
    }
    if(journalStoreMeta){
      runtime.maxJournalStoreBytes=journalStoreByteLimit(runtime.maxJournalStoreBytes);
      runtime.journalStoreSlot=journalStoreMeta.slot;
      runtime.journalStoreHash=journalStoreMeta.sha256;
      runtime.journalStoreCount=journalStoreMeta.count;
      runtime.lastJournalStoreBytes=journalStoreMeta.storageBytes;
      runtime.lastJournalStoreLogicalBytes=journalStoreMeta.logicalBytes;
    }
    runtime.lastError=null;
    let componentProfile=null;
    if(runtime.snapshotProfilePending){
      componentProfile=snapshotComponentProfile(persistencePayload);
      runtime.snapshotProfilePending=false;
      runtime.lastSnapshotProfile=componentProfile;
    }
    return {
      bytes:storageBytes,
      logicalBytes:bytes,
      maxSnapshotBytes,
      encoding,
      compressionRatio:bytes>0?storageBytes/bytes:null,
      issuanceStore:issuanceStoreMeta,
      trackerArchive:trackerArchiveMeta,
      engineStore:engineStoreMeta,
      journalStore:journalStoreMeta,
      persistenceManifest:{
        status:'VERIFIED',
        generationId:persistencePayload.persistenceManifest.generationId,
        hotHash:persistencePayload.persistenceManifest.hotHash
      },
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
    persistenceManifest:{
      version:FORECAST_PERSISTENCE_MANIFEST_VERSION,
      status:runtime?.persistenceManifestStatus??'UNINITIALIZED',
      generationId:runtime?.persistenceGenerationId??null,
      hotHash:runtime?.persistenceManifestHotHash??null
    },
    journalStore:{
      version:FORECAST_JOURNAL_STORE_VERSION,
      slot:runtime?.journalStoreSlot??null,
      count:runtime?.journalStoreCount??0,
      storageBytes:runtime?.lastJournalStoreBytes??null,
      logicalBytes:runtime?.lastJournalStoreLogicalBytes??null,
      maxLogicalBytes:runtime?.maxJournalStoreBytes??null,
      compressionRatio:Number(runtime?.lastJournalStoreLogicalBytes)>0&&Number.isFinite(Number(runtime?.lastJournalStoreBytes))
        ?Number(runtime.lastJournalStoreBytes)/Number(runtime.lastJournalStoreLogicalBytes)
        :null
    },
    engineStore:{
      version:FORECAST_ENGINE_STORE_VERSION,
      slot:runtime?.engineStoreSlot??null,
      storageBytes:runtime?.lastEngineStoreBytes??null,
      logicalBytes:runtime?.lastEngineStoreLogicalBytes??null,
      maxLogicalBytes:runtime?.maxEngineStoreBytes??null,
      compressionRatio:Number(runtime?.lastEngineStoreLogicalBytes)>0&&Number.isFinite(Number(runtime?.lastEngineStoreBytes))
        ?Number(runtime.lastEngineStoreBytes)/Number(runtime.lastEngineStoreLogicalBytes)
        :null
    },
    trackerArchive:{
      version:FORECAST_TRACKER_ARCHIVE_VERSION,
      slot:runtime?.trackerArchiveSlot??null,
      recordCount:runtime?.trackerArchiveRecordCount??0,
      revisionCount:runtime?.trackerArchiveRevisionCount??0,
      storageBytes:runtime?.lastTrackerArchiveBytes??null,
      logicalBytes:runtime?.lastTrackerArchiveLogicalBytes??null,
      maxLogicalBytes:runtime?.maxTrackerArchiveBytes??null,
      compressionRatio:Number(runtime?.lastTrackerArchiveLogicalBytes)>0&&Number.isFinite(Number(runtime?.lastTrackerArchiveBytes))
        ?Number(runtime.lastTrackerArchiveBytes)/Number(runtime.lastTrackerArchiveLogicalBytes)
        :null
    },
    issuanceStore:{
      version:FORECAST_ISSUANCE_STORE_VERSION,
      slot:runtime?.issuanceStoreSlot??null,
      count:runtime?.issuanceStoreCount??0,
      storageBytes:runtime?.lastIssuanceStoreBytes??null,
      logicalBytes:runtime?.lastIssuanceStoreLogicalBytes??null,
      maxLogicalBytes:runtime?.maxIssuanceStoreBytes??null,
      compressionRatio:Number(runtime?.lastIssuanceStoreLogicalBytes)>0&&Number.isFinite(Number(runtime?.lastIssuanceStoreBytes))
        ?Number(runtime.lastIssuanceStoreBytes)/Number(runtime.lastIssuanceStoreLogicalBytes)
        :null
    },
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
