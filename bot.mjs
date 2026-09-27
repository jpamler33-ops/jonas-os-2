import http from 'node:http';
import { loadPersistentState, savePersistentState } from './state-store.mjs';
import { candlesFromKlines, closedCandles, analyzeStructure, analyzeMultiTimeframe } from './market-structure.mjs';
import { renderCandlestickPng } from './chart-renderer.mjs';
import { deriveChartDashboard } from './dashboard-state.mjs';
import { loadEpisodeMemory, saveEpisodeMemory, createEpisode, shouldSampleEpisode, episodeVector, findSimilarEpisodes, summarizeSimilar, matureEpisode } from './episode-memory.mjs';
import { runMechanismTransitionEngine } from './mechanism-transition-engine.mjs';
import { fetchIndependentWitnesses, okxInstrument, krakenPair } from './independent-witness-network.mjs';
import { openAuditLedger, appendAuditRecord, auditMarketSnapshot, auditWitnessReport, auditEngineResult, determineSafetyState, buildResearchEnvelope, verifyLedgerRecords, replayEnvelopeIntegrity, ledgerTailSummary, sha256, INSTITUTIONAL_KERNEL_VERSION } from './institutional-kernel.mjs';
import { openMarketDataFabric, appendMarketEvents, createMarketEventInput, verifyMarketEventChain, marketFabricSummary, MARKET_DATA_FABRIC_VERSION } from './market-data-fabric.mjs';
import { reconstructInstitutionalState, replaySummary, DETERMINISTIC_REPLAY_VERSION } from './deterministic-replay.mjs';
import { buildRuntimeManifest, openReleaseRegistry, registerRuntimeRelease, verifyReleaseRegistry, releaseRegistrySummary, institutionalRuntimeFiles, RELEASE_REGISTRY_VERSION } from './runtime-release-registry.mjs';
import { createObservability, recordProviderCall, recordOperation, recordSafety, recordResearchTelemetry, recordError, observabilitySnapshot, deriveSloHealth, OBSERVABILITY_VERSION } from './observability.mjs';
import { evaluateOperationalReadiness, OPERATIONAL_READINESS_VERSION } from './operational-readiness.mjs';
import { runChaosSuite, runChaosScenario, chaosScenarioNames, CHAOS_ENGINEERING_VERSION } from './chaos-engineering.mjs';
import { loadShadowOms, saveShadowOms, normalizeExecutionBook, createShadowOrder, applyAggTrades, markShadowOrder, cancelShadowOrder, shadowOrderSummary, SHADOW_OMS_VERSION, SHADOW_OMS_CAPABILITIES } from './shadow-oms.mjs';
import { homeText as productHomeText, homeKeyboard as productHomeKeyboard, marketsKeyboard as productMarketsKeyboard, marketProductKeyboard, parseProductCallback } from './telegram-product-ui.mjs';
import { createAlert, evaluateAlert, formatAlert, requiredContext, ALERT_ENGINE_VERSION } from './alert-engine.mjs';
import { loadEvidenceHistory, saveEvidenceHistory, evidenceHistoryFor, EVIDENCE_HISTORY_VERSION } from './evidence-history.mjs';
import { formatValidityReason, STATE_VALIDITY_VERSION, DEFAULT_STATE_VALIDITY_CONFIG } from './state-validity.mjs';
import { latestEvidenceSnapshot, currentEvidenceLifecycle, advanceEvidenceLifecycle, compactValidity, RESEARCH_LIFECYCLE_VERSION } from './research-lifecycle.mjs';
import { createMarketDataProvider, MARKET_DATA_PROVIDER_VERSION } from './market-data-provider.mjs';
import { createTelegramCommandRouter, TELEGRAM_COMMAND_ROUTER_VERSION } from './telegram-command-router.mjs';
import { createReadCommandHandlers, TELEGRAM_READ_COMMANDS_VERSION } from './telegram-read-command-handlers.mjs';
import { createMutationCommandHandlers, TELEGRAM_MUTATION_COMMANDS_VERSION } from './telegram-mutation-command-handlers.mjs';
import { normalizeVenueBook, buildShadowSmartRoute, summarizeVenueQuality, SHADOW_SOR_VERSION, SHADOW_SOR_CAPABILITIES } from './multi-venue-shadow-sor.mjs';
import { loadVenueQualityMemory, saveVenueQualityMemory, createVenueQualityObservations, appendVenueQualityObservations, matureVenueQualityObservation, estimateVenueQuality, venueQualitySummary, VENUE_QUALITY_MEMORY_VERSION, VENUE_QUALITY_MEMORY_CAPABILITIES } from './venue-quality-memory.mjs';
import { executionResearchReport, EXECUTION_RESEARCH_LAB_VERSION, EXECUTION_RESEARCH_CAPABILITIES } from './execution-research-lab.mjs';
import { buildCanonicalForecastInput, FORECAST_INPUT_ADAPTER_VERSION } from './forecast-input-adapter.mjs';
import { buildForecastScienceInputs, FORECAST_RUNTIME_SCIENCE_ADAPTER_VERSION } from './forecast-science-adapter.mjs';
import { deriveForecastRuntimeQuality, renderInstitutionalForecastCard, forecastKeyboard as forecastProductKeyboard, FORECAST_PRODUCT_VERSION } from './forecast-product.mjs';
import { runScientificCore, SCIENTIFIC_CORE_VERSION } from './scientific-core.mjs';
import {
  openInstitutionalForecastRuntime,
  saveInstitutionalForecastRuntime,
  seedInstitutionalForecastRuntimeFromEpisodes,
  issueInstitutionalForecast,
  observeInstitutionalForecastRuntime,
  observeInstitutionalForecastOutcomePoint,
  latestInstitutionalForecast,
  institutionalForecastRuntimeSummary,
  episodeVectorExtraFeatures,
  INSTITUTIONAL_FORECAST_RUNTIME_VERSION
} from './institutional-forecast-runtime.mjs';
import {
  appendInstitutionalForecastIssuanceAudit,
  appendResearchTraceEvaluationAudit
} from './institutional-audit-binding.mjs';

const token = process.env.TCX_TELEGRAM_BOT_TOKEN;
if (!token) throw new Error('Missing TCX_TELEGRAM_BOT_TOKEN');

const telegramApi = `https://api.telegram.org/bot${token}`;
const configuredBinanceBases = process.env.TCX_BINANCE_REST_BASES || process.env.TCX_BINANCE_REST_BASE || '';
const binanceBases = (configuredBinanceBases
  ? configuredBinanceBases.split(',')
  : ['https://data-api.binance.vision','https://api1.binance.com','https://api.binance.com'])
  .map(x => x.trim().replace(/\/+$/, '')).filter(Boolean);
const okxBase = (process.env.TCX_OKX_REST_BASE || 'https://www.okx.com').replace(/\/+$/,'');
const krakenBase = (process.env.TCX_KRAKEN_REST_BASE || 'https://api.kraken.com').replace(/\/+$/,'');

const refreshMs = Math.max(5000, Number(process.env.TCX_TELEGRAM_REFRESH_MS || 10000));
const alertCheckMs = Math.max(10000, Number(process.env.TCX_TELEGRAM_ALERT_CHECK_MS || 15000));
const researchAlertCheckMs = Math.max(30000, Number(process.env.TCX_RESEARCH_ALERT_CHECK_MS || 60000));
const researchValidityStaleMs = Math.max(60000, Number(process.env.TCX_RESEARCH_VALIDITY_STALE_MS || 600000));
const researchValidityExpireMs = Math.max(researchValidityStaleMs+60000, Number(process.env.TCX_RESEARCH_VALIDITY_EXPIRE_MS || 1800000));
const researchValidityDriftThreshold = Math.max(0.05, Math.min(0.95, Number(process.env.TCX_RESEARCH_VALIDITY_DRIFT_THRESHOLD || 0.28)));
const researchValidityConfig = Object.freeze({
  ...DEFAULT_STATE_VALIDITY_CONFIG,
  staleAfterMs:researchValidityStaleMs,
  expireAfterMs:researchValidityExpireMs,
  driftThreshold:researchValidityDriftThreshold
});
const episodeSweepMs = Math.max(60000, Number(process.env.TCX_EPISODE_SWEEP_MS || 300000));
const forecastOutcomeCheckMs = Math.max(30000, Number(process.env.TCX_FORECAST_OUTCOME_CHECK_MS || 60000));
const configuredReplicaCount = Math.max(1, Math.floor(Number(process.env.TCX_REPLICA_COUNT || 1) || 1));
const institutionalMarketMaxAgeMs = Math.max(1000, Number(process.env.TCX_INSTITUTIONAL_MARKET_MAX_AGE_MS || 15000));
const shadowWatchMs = Math.max(5000, Number(process.env.TCX_SHADOW_WATCH_MS || 10000));
const shadowDefaultLatencyMs = Math.max(0, Math.min(5000, Number(process.env.TCX_SHADOW_LATENCY_MS || 120)));
const shadowMakerFeeBps = Math.max(0, Number(process.env.TCX_SHADOW_MAKER_FEE_BPS || 10));
const shadowTakerFeeBps = Math.max(0, Number(process.env.TCX_SHADOW_TAKER_FEE_BPS || 10));
const shadowHiddenQueueBufferPct = Math.max(0, Math.min(2, Number(process.env.TCX_SHADOW_HIDDEN_QUEUE_BUFFER_PCT || 0.15)));
const sorMaxBookAgeMs = Math.max(1000, Number(process.env.TCX_SOR_MAX_BOOK_AGE_MS || 15000));
const sorBinanceFeeBps = Math.max(0, Number(process.env.TCX_SOR_BINANCE_FEE_BPS || shadowTakerFeeBps));
const sorOkxFeeBps = Math.max(0, Number(process.env.TCX_SOR_OKX_FEE_BPS || shadowTakerFeeBps));
const sorKrakenFeeBps = Math.max(0, Number(process.env.TCX_SOR_KRAKEN_FEE_BPS || shadowTakerFeeBps));
const vqmWatchMs = Math.max(10000, Number(process.env.TCX_VQM_WATCH_MS || 15000));
const vqmMarkoutMaxLagMs = Math.max(5000, Number(process.env.TCX_VQM_MARKOUT_MAX_LAG_MS || 45000));
const vqmMinSamples = Math.max(3, Number(process.env.TCX_VQM_MIN_SAMPLES || 12));
const vqmMinToxicitySamples = Math.max(10, Number(process.env.TCX_VQM_MIN_TOXICITY_SAMPLES || 30));
const vqmHalfLifeDays = Math.max(1, Number(process.env.TCX_VQM_HALF_LIFE_DAYS || 30));
const allowedChats = new Set((process.env.TCX_TELEGRAM_ALLOWED_CHATS || '').split(',').map(x => x.trim()).filter(Boolean));
const requestedSymbols = (process.env.TCX_TELEGRAM_SYMBOLS ||
  'BTCUSDT,ETHUSDT,SOLUSDT,BNBUSDT,XRPUSDT,DOGEUSDT,ADAUSDT,LINKUSDT,AVAXUSDT,DOTUSDT,LTCUSDT,TRXUSDT')
  .split(',').map(x => x.trim().toUpperCase()).filter(Boolean);

const MARKET_META = {
  BTCUSDT:['₿','BTC'], ETHUSDT:['Ξ','ETH'], SOLUSDT:['◎','SOL'], BNBUSDT:['🟡','BNB'],
  XRPUSDT:['✕','XRP'], DOGEUSDT:['Ð','DOGE'], ADAUSDT:['₳','ADA'], LINKUSDT:['⬡','LINK'],
  AVAXUSDT:['🔺','AVAX'], DOTUSDT:['●','DOT'], LTCUSDT:['Ł','LTC'], TRXUSDT:['◆','TRX']
};

const markets = requestedSymbols.map(symbol => ({
  symbol,
  icon: MARKET_META[symbol]?.[0] || '•',
  label: MARKET_META[symbol]?.[1] || symbol.replace('USDT','')
}));

const sessions = new Map();
const witnessCache = new Map();
const radarCache = new Map();
const researchAlertContextCache = new Map();
const observability = createObservability({sampleLimit:500});
const marketDataProvider=createMarketDataProvider({
  binanceBases,
  okxBase,
  krakenBase,
  normalizeExecutionBook,
  normalizeVenueBook,
  okxInstrument,
  krakenPair,
  sorFees:{
    BINANCE:sorBinanceFeeBps,
    OKX:sorOkxFeeBps,
    KRAKEN:sorKrakenFeeBps
  },
  onProviderCall:event=>recordProviderCall(observability,event),
  onError:event=>recordError(observability,event),
  onOperation:event=>recordOperation(observability,event)
});
const {
  fetchJson,
  fetchMarketParts,
  fetchKlines,
  fetchExecutionBook,
  fetchSorVenueBooks,
  fetchLatestAggTradeId,
  fetchAggTradesSince
}=marketDataProvider;
const stateFile = process.env.TCX_STATE_FILE || '/data/tcx-state.json';
const loadedState = await loadPersistentState(stateFile);
const favorites = loadedState.favorites;
const alerts = loadedState.alerts;
const episodeFile = process.env.TCX_EPISODE_FILE || '/data/tcx-episodes.json';
const loadedEpisodeMemory = await loadEpisodeMemory(episodeFile);
let episodes = loadedEpisodeMemory.episodes;
const forecastRuntimeFile = process.env.TCX_FORECAST_RUNTIME_FILE || '/data/tcx-forecast-runtime.json';
const forecastRuntime = await openInstitutionalForecastRuntime(forecastRuntimeFile);
const forecastSeedAtBoot = seedInstitutionalForecastRuntimeFromEpisodes(forecastRuntime,episodes);
const evidenceHistoryFile = process.env.TCX_EVIDENCE_HISTORY_FILE || '/data/tcx-evidence-history.json';
const loadedEvidenceHistory = await loadEvidenceHistory(evidenceHistoryFile);
let evidenceRecords = loadedEvidenceHistory.records;
const auditFile = process.env.TCX_AUDIT_LEDGER_FILE || '/data/tcx-audit-ledger.jsonl';
const auditLedger = await openAuditLedger(auditFile);
const marketFabricFile = process.env.TCX_MARKET_FABRIC_FILE || '/data/tcx-market-events.jsonl';
const marketFabric = await openMarketDataFabric(marketFabricFile);
const releaseRegistryFile = process.env.TCX_RELEASE_REGISTRY_FILE || '/data/tcx-release-registry.jsonl';
const releaseRegistry = await openReleaseRegistry(releaseRegistryFile);
const shadowOmsFile = process.env.TCX_SHADOW_OMS_FILE || '/data/tcx-shadow-oms.json';
const loadedShadowOms = await loadShadowOms(shadowOmsFile);
const venueQualityFile = process.env.TCX_VENUE_QUALITY_MEMORY_FILE || '/data/tcx-venue-quality-memory.json';
const loadedVenueQuality = await loadVenueQualityMemory(venueQualityFile);
let venueQualityRecords = loadedVenueQuality.records;
let venueQualityHealthy = loadedVenueQuality.healthy;
let venueQualityLastError = loadedVenueQuality.error || null;
let venueQualityPersistenceQueue = Promise.resolve();
let shadowOrders = loadedShadowOms.orders;
let shadowOmsHealthy = loadedShadowOms.healthy;
let shadowOmsLastError = loadedShadowOms.error || null;
let shadowOmsPersistenceQueue = Promise.resolve();
let marketFabricAppendQueue = Promise.resolve();
let auditAppendQueue = Promise.resolve();
let forecastRuntimePersistenceQueue = Promise.resolve();
const institutionalConfig = Object.freeze({
  execution:'SHADOW_ONLY',
  marketMaxAgeMs:institutionalMarketMaxAgeMs,
  primaryProvider:'BINANCE',
  witnessProviders:['OKX','KRAKEN'],
  strictWitnessMinExternal:2,
  mechanismCausalStatus:'NOT_IDENTIFIED',
  orderExecutionPath:false,
  shadowOms:{
    version:SHADOW_OMS_VERSION,
    canExecuteLive:false,
    defaultLatencyMs:shadowDefaultLatencyMs,
    makerFeeBps:shadowMakerFeeBps,
    takerFeeBps:shadowTakerFeeBps,
    hiddenQueueBufferPct:shadowHiddenQueueBufferPct
  },
  shadowSor:{
    version:SHADOW_SOR_VERSION,
    canExecuteLive:false,
    routeQuote:'USDT',
    maxBookAgeMs:sorMaxBookAgeMs,
    feeAssumptionsBps:{
      BINANCE:sorBinanceFeeBps,
      OKX:sorOkxFeeBps,
      KRAKEN:sorKrakenFeeBps
    }
  },
  venueQualityMemory:{
    version:VENUE_QUALITY_MEMORY_VERSION,
    canExecuteLive:false,
    minSamples:vqmMinSamples,
    minToxicitySamples:vqmMinToxicitySamples,
    halfLifeDays:vqmHalfLifeDays,
    markoutMaxLagMs:vqmMarkoutMaxLagMs
  },
  executionResearchLab:{
    version:EXECUTION_RESEARCH_LAB_VERSION,
    canExecuteLive:false,
    objective:'EXECUTION_QUALITY_NOT_PNL'
  },
  forecastRuntime:{
    version:INSTITUTIONAL_FORECAST_RUNTIME_VERSION,
    configHash:sha256(forecastRuntime.engine.configSnapshot()),
    objective:'FORECAST_CALIBRATION_AND_ACCURACY_NOT_PNL',
    canExecuteLive:false
  }
});

let runtimeManifest=null;
let runtimeReleaseRecord=null;
try {
  runtimeManifest=await buildRuntimeManifest({
    rootDir:'.',
    files:institutionalRuntimeFiles(),
    config:institutionalConfig,
    deployment:{
      gitCommit:process.env.RAILWAY_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA || '',
      gitBranch:process.env.RAILWAY_GIT_BRANCH || process.env.GIT_BRANCH || '',
      service:process.env.RAILWAY_SERVICE_NAME || 'tcx-telegram'
    },
    versions:{
      institutionalKernel:INSTITUTIONAL_KERNEL_VERSION,
      mechanismEngine:'MTL_V1',
      witnessNetwork:'IWN_V1',
      marketDataFabric:MARKET_DATA_FABRIC_VERSION,
      deterministicReplay:DETERMINISTIC_REPLAY_VERSION,
      releaseRegistry:RELEASE_REGISTRY_VERSION,
      observability:OBSERVABILITY_VERSION,
      operationalReadiness:OPERATIONAL_READINESS_VERSION,
      chaosEngineering:CHAOS_ENGINEERING_VERSION,
      shadowOms:SHADOW_OMS_VERSION,
      alertEngine:ALERT_ENGINE_VERSION,
      evidenceHistory:EVIDENCE_HISTORY_VERSION,
      stateValidity:STATE_VALIDITY_VERSION,
      researchLifecycle:RESEARCH_LIFECYCLE_VERSION,
      marketDataProvider:MARKET_DATA_PROVIDER_VERSION,
      telegramCommandRouter:TELEGRAM_COMMAND_ROUTER_VERSION,
      telegramReadCommands:TELEGRAM_READ_COMMANDS_VERSION,
      telegramMutationCommands:TELEGRAM_MUTATION_COMMANDS_VERSION,
      shadowSor:SHADOW_SOR_VERSION,
      venueQualityMemory:VENUE_QUALITY_MEMORY_VERSION,
      executionResearchLab:EXECUTION_RESEARCH_LAB_VERSION,
      forecastInputAdapter:FORECAST_INPUT_ADAPTER_VERSION,
      forecastScienceAdapter:FORECAST_RUNTIME_SCIENCE_ADAPTER_VERSION,
      scientificCore:SCIENTIFIC_CORE_VERSION,
      institutionalForecastRuntime:INSTITUTIONAL_FORECAST_RUNTIME_VERSION,
      forecastConfigHash:sha256(forecastRuntime.engine.configSnapshot()),
      forecastProduct:FORECAST_PRODUCT_VERSION
    }
  });
  if(releaseRegistry.healthy){
    const registered=await registerRuntimeRelease(releaseRegistry,runtimeManifest,{registeredAt:Date.now()});
    runtimeReleaseRecord=registered.record;
  }
} catch(err) {
  releaseRegistry.healthy=false;
  releaseRegistry.verification={
    ok:false,
    error:'RUNTIME_RELEASE_REGISTRATION_FAILURE',
    detail:err instanceof Error?err.message:String(err)
  };
  console.error('runtime release registration failure',releaseRegistry.verification.detail);
}
let episodePersistenceHealthy = true;
let episodePersistenceLastError = null;
let episodePersistenceQueue = Promise.resolve();
let evidenceHistoryHealthy = true;
let evidenceHistoryLastError = null;
let evidenceHistoryQueue = Promise.resolve();
let persistenceHealthy = true;
let persistenceLastError = null;
let persistenceQueue = Promise.resolve();

async function persistVenueQualityMemory(reason='mutation') {
  venueQualityPersistenceQueue = venueQualityPersistenceQueue.then(async()=>{
    if(!venueQualityHealthy) return false;
    try {
      venueQualityRecords = await saveVenueQualityMemory(venueQualityFile,venueQualityRecords,{maxRecords:50000});
      venueQualityLastError=null;
      return true;
    } catch(err) {
      venueQualityHealthy=false;
      venueQualityLastError=err instanceof Error?err.message:String(err);
      recordError(observability,{scope:'venue_quality.persistence',message:venueQualityLastError});
      console.error('venue quality persistence error',reason,venueQualityLastError);
      return false;
    }
  });
  return venueQualityPersistenceQueue;
}

async function persistShadowOms(reason='mutation') {
  shadowOmsPersistenceQueue = shadowOmsPersistenceQueue.then(async()=>{
    if(!shadowOmsHealthy) return false;
    try {
      shadowOrders = await saveShadowOms(shadowOmsFile,shadowOrders,{maxOrders:1000});
      shadowOmsLastError=null;
      return true;
    } catch(err) {
      shadowOmsHealthy=false;
      shadowOmsLastError=err instanceof Error?err.message:String(err);
      recordError(observability,{scope:'shadow_oms.persistence',message:shadowOmsLastError});
      console.error('shadow OMS persistence error',reason,shadowOmsLastError);
      return false;
    }
  });
  return shadowOmsPersistenceQueue;
}

async function persistState(reason='mutation') {
  persistenceQueue = persistenceQueue.then(async () => {
    try {
      await savePersistentState(stateFile, { favorites, alerts });
      persistenceHealthy = true;
      persistenceLastError = null;
    } catch (err) {
      persistenceHealthy = false;
      persistenceLastError = err instanceof Error ? err.message : String(err);
      console.error('state persistence error', reason, persistenceLastError);
    }
  });
  await persistenceQueue;
  return persistenceHealthy;
}

async function persistEpisodeMemory(reason='mutation') {
  episodePersistenceQueue = episodePersistenceQueue.then(async () => {
    try {
      episodes = await saveEpisodeMemory(episodeFile,episodes,{maxPerSymbol:2000});
      episodePersistenceHealthy = true;
      episodePersistenceLastError = null;
    } catch (err) {
      episodePersistenceHealthy = false;
      episodePersistenceLastError = err instanceof Error ? err.message : String(err);
      console.error('episode persistence error',reason,episodePersistenceLastError);
    }
  });
  await episodePersistenceQueue;
  return episodePersistenceHealthy;
}

async function persistEvidenceHistory(reason='mutation') {
  evidenceHistoryQueue = evidenceHistoryQueue.then(async () => {
    try {
      evidenceRecords = await saveEvidenceHistory(evidenceHistoryFile,evidenceRecords,{maxPerSymbol:2000});
      evidenceHistoryHealthy = true;
      evidenceHistoryLastError = null;
    } catch (err) {
      evidenceHistoryHealthy = false;
      evidenceHistoryLastError = err instanceof Error ? err.message : String(err);
      recordError(observability,{scope:'evidence_history.persistence',message:evidenceHistoryLastError});
      console.error('evidence history persistence error',reason,evidenceHistoryLastError);
    }
  });
  await evidenceHistoryQueue;
  return evidenceHistoryHealthy;
}

async function persistForecastRuntime(reason='mutation') {
  forecastRuntimePersistenceQueue = forecastRuntimePersistenceQueue.then(async()=>{
    if(!forecastRuntime.healthy) return false;
    try {
      await saveInstitutionalForecastRuntime(forecastRuntime);
      forecastRuntime.lastError=null;
      return true;
    } catch(err) {
      forecastRuntime.healthy=false;
      forecastRuntime.lastError=err instanceof Error?err.message:String(err);
      recordError(observability,{scope:'forecast_runtime.persistence',message:forecastRuntime.lastError});
      console.error('forecast runtime persistence error',reason,forecastRuntime.lastError);
      return false;
    }
  });
  return forecastRuntimePersistenceQueue;
}

if(forecastSeedAtBoot.addedRows>0 && forecastRuntime.healthy){
  await persistForecastRuntime('boot-episode-seed');
}

function latestEvidenceRecord(symbol) {
  return latestEvidenceSnapshot(evidenceRecords,symbol);
}

function updateRadarValidity(symbol,validity) {
  const r=radarCache.get(symbol);
  if(!r) return;
  const compact=compactValidity(validity,{limit:3});
  r.validity=compact.status;
  r.driftScore=compact.driftScore;
  r.validityAgeMs=compact.ageMs;
  r.validityReasons=compact.reasons;
}

function appendEvidenceFromContext(symbol,context) {
  const result=advanceEvidenceLifecycle(evidenceRecords,symbol,context,{
    config:researchValidityConfig,
    dedupeWindowMs:15*60*1000,
    maxPerSymbol:2000
  });
  evidenceRecords=result.records;
  updateRadarValidity(symbol,result.validity);
  return result;
}

async function appendInstitutionalAudit(kind,payload) {
  auditAppendQueue = auditAppendQueue.then(async()=>{
    if(!auditLedger.healthy) return null;
    try {
      return await appendAuditRecord(auditLedger,{kind,payload,occurredAt:Date.now()});
    } catch(err) {
      auditLedger.healthy=false;
      auditLedger.verification={
        ok:false,
        error:'LEDGER_APPEND_FAILURE',
        detail:err instanceof Error?err.message:String(err)
      };
      console.error('institutional audit append failure',auditLedger.verification.detail);
      return null;
    }
  });
  return auditAppendQueue;
}

async function appendForecastIssuanceAuditQueued(issuance) {
  auditAppendQueue = auditAppendQueue.then(async()=>{
    if(!auditLedger.healthy) return null;
    try {
      return await appendInstitutionalForecastIssuanceAudit(auditLedger,issuance,{
        occurredAt:issuance.generatedAt
      });
    } catch(err) {
      auditLedger.healthy=false;
      auditLedger.verification={
        ok:false,
        error:'FORECAST_AUDIT_APPEND_FAILURE',
        detail:err instanceof Error?err.message:String(err)
      };
      recordError(observability,{scope:'forecast.audit.issue',message:auditLedger.verification.detail});
      return null;
    }
  });
  return auditAppendQueue;
}

async function appendForecastEvaluationAuditQueued(trace,evaluation) {
  auditAppendQueue = auditAppendQueue.then(async()=>{
    if(!auditLedger.healthy) return null;
    try {
      return await appendResearchTraceEvaluationAudit(auditLedger,trace,evaluation,{
        occurredAt:evaluation.observedAt
      });
    } catch(err) {
      auditLedger.healthy=false;
      auditLedger.verification={
        ok:false,
        error:'FORECAST_EVALUATION_AUDIT_APPEND_FAILURE',
        detail:err instanceof Error?err.message:String(err)
      };
      recordError(observability,{scope:'forecast.audit.evaluation',message:auditLedger.verification.detail});
      return null;
    }
  });
  return auditAppendQueue;
}

async function appendFabricEvents(inputs) {
  marketFabricAppendQueue = marketFabricAppendQueue.then(async()=>{
    if(!marketFabric.healthy) return {appended:[],duplicates:0,skipped:true};
    try {
      return await appendMarketEvents(marketFabric,inputs);
    } catch(err) {
      marketFabric.healthy=false;
      marketFabric.verification={
        ok:false,
        error:'FABRIC_APPEND_FAILURE',
        detail:err instanceof Error?err.message:String(err)
      };
      console.error('market data fabric append failure',marketFabric.verification.detail);
      return {appended:[],duplicates:0,skipped:true};
    }
  });
  return marketFabricAppendQueue;
}

function witnessPayload(report) {
  return {
    availableAt:Date.now(),
    sourceIndependence:String(report?.sourceIndependence||'UNKNOWN'),
    independentWitnessSatisfied:report?.independentWitnessSatisfied===true,
    externalWitnessCount:Number(report?.externalWitnessCount||0),
    venueCount:Number(report?.venueCount||0),
    distinctVenues:[...(report?.distinctVenues||[])].map(String).sort(),
    agreementScore:Number(report?.agreementScore||0),
    flowAgreement:Number(report?.flowAgreement||0),
    liquidityAgreement:Number(report?.liquidityAgreement||0),
    sameQuotePriceAgreement:Number(report?.sameQuotePriceAgreement||0),
    contradictions:[...(report?.contradictions||[])].map(String).sort(),
    caveats:[...(report?.caveats||[])].map(String).sort(),
    witnesses:[...(report?.witnesses||[])].map(w=>({
      source:String(w.source||'UNKNOWN'),
      venue:String(w.venue||'UNKNOWN'),
      quote:String(w.quote||'UNKNOWN'),
      bid:Number(w.bid),
      ask:Number(w.ask),
      mid:Number(w.mid),
      spreadBps:Number(w.spreadBps),
      imbalance:Number(w.imbalance),
      publishedAt:Number(w.publishedAt),
      availableAt:Number(w.availableAt)
    }))
  };
}

async function ingestResearchFabric(state,witnessReport) {
  const ingestedAt=Date.now();
  const inputs=[
    createMarketEventInput({
      kind:'PRIMARY_MARKET',
      streamKey:`PRIMARY:${state.symbol}`,
      source:String(state.market.source||'BINANCE'),
      sourceEventId:`${state.symbol}:${state.market.timestamp}:${state.market.availableAt}`,
      eventTime:Number(state.market.timestamp),
      availableAt:Number(state.market.availableAt),
      ingestedAt,
      payload:state.market
    }),
    createMarketEventInput({
      kind:'WITNESS_CONSENSUS',
      streamKey:`WITNESS:${state.symbol}`,
      source:'TCX_IWN',
      sourceEventId:`${state.symbol}:${state.availableAt}`,
      eventTime:Number(state.availableAt),
      availableAt:Number(state.availableAt),
      ingestedAt,
      payload:witnessPayload(witnessReport)
    })
  ];

  for(const tf of state.frames){
    for(const candle of closedCandles(state.byTf[tf])){
      inputs.push(createMarketEventInput({
        kind:'CANDLE_CLOSE',
        streamKey:`CANDLE:${state.symbol}:${tf}`,
        source:'BINANCE_PUBLIC_REST_KLINES',
        sourceEventId:`${state.symbol}:${tf}:${candle.closeTime}`,
        eventTime:Number(candle.closeTime),
        availableAt:Number(state.availableAt),
        ingestedAt,
        payload:{
          openTime:Number(candle.openTime),
          closeTime:Number(candle.closeTime),
          o:Number(candle.o),h:Number(candle.h),l:Number(candle.l),c:Number(candle.c),v:Number(candle.v),
          closed:true,
          interval:tf
        }
      }));
    }
  }
  return appendFabricEvents(inputs);
}

let offset = 0;
let running = true;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const permitted = chatId => allowedChats.size === 0 || allowedChats.has(String(chatId));
const fmt = (n, max=2) => Number(n).toLocaleString('de-DE', { maximumFractionDigits:max });
const symbolOk = symbol => /^[A-Z0-9]{2,18}USDT$/.test(symbol);

function normalizeSymbol(input='') {
  const raw = String(input).trim().toUpperCase().replace(/[^A-Z0-9]/g,'');
  if (!raw) return null;
  const symbol = raw.endsWith('USDT') ? raw : `${raw}USDT`;
  return symbolOk(symbol) ? symbol : null;
}

function symbolLabel(symbol) {
  return MARKET_META[symbol]?.[1] || symbol.replace('USDT','');
}

function symbolIcon(symbol) {
  return MARKET_META[symbol]?.[0] || '•';
}

async function witnessState(symbol,primarySnapshot,{maxAgeMs=5000}={}) {
  const cached=witnessCache.get(symbol);
  const now=Date.now();
  if(cached && now-cached.fetchedAt<=maxAgeMs) return cached.report;
  const report=await fetchIndependentWitnesses({
    symbol,
    primarySnapshot,
    fetchJson,
    okxBase,
    krakenBase
  });
  witnessCache.set(symbol,{fetchedAt:now,report});
  return report;
}

function favoriteSet(chatId) {
  const key = String(chatId);
  if (!favorites.has(key)) favorites.set(key, new Set());
  return favorites.get(key);
}

function alertList(chatId) {
  const key = String(chatId);
  if (!alerts.has(key)) alerts.set(key, []);
  return alerts.get(key);
}

function activeAlerts(chatId) {
  return alertList(chatId).filter(a=>a?.enabled!==false);
}

function describeAlert(alert) {
  const a=alert||{};
  const c=Array.isArray(a.conditions)?a.conditions:[];
  const first=c[0]||{};
  if(a.type==='PRICE') {
    const op=first.op==='GTE'?'≥':'≤';
    return 'PRICE · '+symbolLabel(a.symbol)+' '+op+' '+fmt(Number(first.value),Number(first.value)<1?6:2)+' USDT';
  }
  if(a.type==='REGIME_CHANGE') return 'REGIME · '+symbolLabel(a.symbol)+' · change';
  if(a.type==='STRUCTURE_CHANGE') return 'STRUCTURE · '+symbolLabel(a.symbol)+' · change';
  if(a.type==='WITNESS_AGREEMENT') return 'WITNESS · '+symbolLabel(a.symbol)+' ≥ '+fmt(Number(first.value)*100,0)+'%';
  if(a.type==='WITNESS_CONTRADICTION') return 'WITNESS · '+symbolLabel(a.symbol)+' · contradiction';
  if(a.type==='MEMORY_SUPPORT') return 'MEMORY · '+symbolLabel(a.symbol)+' support ≥ '+fmt(Number(first.value),0);
  if(a.type==='SAFETY_STATE_CHANGE') return 'SAFETY · '+symbolLabel(a.symbol)+' · state change';
  if(a.type==='COMPOSITE') return 'COMPOSITE · '+symbolLabel(a.symbol)+' · research evidence gate';
  return formatAlert(a);
}

async function addTcXAlert(chatId,alert) {
  const list=alertList(chatId);
  if(list.length>=50) return {added:false,reason:'LIMIT'};
  const key=JSON.stringify({
    symbol:alert.symbol,
    type:alert.type,
    mode:alert.mode,
    conditions:alert.conditions
  });
  const duplicate=list.some(x=>x?.enabled!==false && JSON.stringify({
    symbol:x.symbol,
    type:x.type,
    mode:x.mode,
    conditions:x.conditions
  })===key);
  if(duplicate) return {added:false,reason:'DUPLICATE'};
  list.push(alert);
  const persisted=await persistState('alert-v2-added');
  return {added:true,persisted};
}

function alertPreset(symbol,preset,{witnessPct=75,memorySupport=8}={}) {
  const p=String(preset||'').toUpperCase();
  const now=Date.now();
  if(p==='REGIME') return createAlert({
    symbol,type:'REGIME_CHANGE',createdAt:now,cooldownMs:5*60*1000,
    conditions:[{path:'state.regime',op:'CHANGED'}],
    label:'Regime changed'
  });
  if(p==='STRUCTURE') return createAlert({
    symbol,type:'STRUCTURE_CHANGE',createdAt:now,cooldownMs:5*60*1000,
    conditions:[{path:'state.structureKey',op:'CHANGED'}],
    label:'Structure changed'
  });
  if(p==='WITNESS75'||p==='WITNESS') return createAlert({
    symbol,type:'WITNESS_AGREEMENT',createdAt:now,cooldownMs:15*60*1000,
    conditions:[{path:'witness.agreement',op:'GTE',value:Math.max(0,Math.min(100,Number(witnessPct)))/100}],
    label:'Witness agreement threshold'
  });
  if(p==='MEMORY8'||p==='MEMORY') return createAlert({
    symbol,type:'MEMORY_SUPPORT',createdAt:now,cooldownMs:30*60*1000,
    conditions:[{path:'memory.support',op:'GTE',value:Math.max(1,Math.round(Number(memorySupport)||8))}],
    label:'Historical support threshold'
  });
  if(p==='SAFETY') return createAlert({
    symbol,type:'SAFETY_STATE_CHANGE',createdAt:now,cooldownMs:0,
    conditions:[{path:'safety.state',op:'CHANGED'}],
    label:'Safety state changed'
  });
  if(p==='COMPOSITE') return createAlert({
    symbol,type:'COMPOSITE',createdAt:now,cooldownMs:30*60*1000,
    conditions:[
      {path:'witness.agreement',op:'GTE',value:0.75},
      {path:'memory.support',op:'GTE',value:8},
      {path:'engine.evidenceStrength',op:'GTE',value:0.65},
      {path:'engine.contradiction',op:'LTE',value:0.25},
      {path:'safety.canResearch',op:'TRUTHY'}
    ],
    label:'Research evidence gate'
  });
  return null;
}

function alertSetupKeyboard(symbol) {
  return {inline_keyboard:[
    [
      {text:'🧬 Regime-Wechsel',callback_data:'alertpreset:'+symbol+':REGIME'},
      {text:'🧭 Struktur-Wechsel',callback_data:'alertpreset:'+symbol+':STRUCTURE'}
    ],
    [
      {text:'🛰 Witness ≥75%',callback_data:'alertpreset:'+symbol+':WITNESS75'},
      {text:'🧠 Memory ≥8',callback_data:'alertpreset:'+symbol+':MEMORY8'}
    ],
    [
      {text:'🛡 Safety-Wechsel',callback_data:'alertpreset:'+symbol+':SAFETY'},
      {text:'🧩 Composite',callback_data:'alertpreset:'+symbol+':COMPOSITE'}
    ],
    [{text:'📊 Markt',callback_data:'refresh:'+symbol},{text:'🏠 Home',callback_data:'home'}]
  ]};
}

async function showAlertSetup(chatId,symbol) {
  return tg('sendMessage',{
    chat_id:chatId,
    text:[
      '🔔 TCX ALERTS · '+symbol.replace('USDT','/USDT'),'',
      'Wähle einen Research-Alert oder setze einen Preisalarm mit:',
      '/alert '+symbolLabel(symbol)+' PREIS','',
      'Research-Alerts informieren über Zustandsänderungen und Evidenz.',
      'Sie sind keine Buy/Sell-Signale.'
    ].join('\n'),
    reply_markup:alertSetupKeyboard(symbol)
  });
}

function buildResearchAlertContext(state,witnessReport,{engineOverride=null,safetyOverride=null}={}) {
  const engine=engineOverride||runMechanismTransitionEngine({
    analysis:state.memoryAnalysis,
    dashboard:state.memoryDashboard,
    episodes,
    symbol:state.symbol,
    horizonMinutes:15,
    witnessReport
  });
  const marketAudit=auditMarketSnapshot(state.market,{
    now:Date.now(),
    maxAgeMs:institutionalMarketMaxAgeMs
  });
  const witnessAudit=auditWitnessReport(witnessReport);
  const engineAudit=auditEngineResult(engine);
  const safety=safetyOverride||determineSafetyState({
    marketAudit,
    witnessAudit,
    engineAudit,
    ledgerHealthy:auditLedger.healthy,
    fabricHealthy:marketFabric.healthy,
    registryHealthy:releaseRegistry.healthy && Boolean(runtimeReleaseRecord)
  });
  const pattern=state.analysis?.pattern
    ? [state.analysis.pattern.stage,state.analysis.pattern.side,Number(state.analysis.pattern.level||0).toFixed(8)].join(':')
    : 'NONE';
  return {
    capturedAt:Date.now(),
    market:{
      price:Number(state.market.price),
      spreadBps:Number(state.market.spreadBps),
      change24hPct:Number(state.market.changePct),
      availableAt:Number(state.market.availableAt)
    },
    state:{
      regime:String(state.dashboard.regime),
      mtfBias:String(state.dashboard.bias),
      structure:String(state.analysis?.trend||'INSUFFICIENT'),
      structureKey:String(state.analysis?.trend||'INSUFFICIENT')+'|'+pattern,
      liquidity:String(state.dashboard.liquidity),
      flow:String(state.dashboard.flow),
      pressure:Number(state.dashboard.pressureScore)
    },
    witness:{
      agreement:Number(witnessReport?.agreementScore||0),
      contradiction:Boolean(witnessReport?.contradictions?.length),
      externalCount:Number(witnessReport?.externalWitnessCount||0),
      satisfied:witnessReport?.independentWitnessSatisfied===true
    },
    memory:{
      support:Number(engine.lattice.support||0),
      sufficient:engine.lattice.sufficient===true,
      novelty:Number(engine.lattice.novelty||0)
    },
    engine:{
      evidenceStrength:Number(engine.hypothesis.evidenceStrength||0),
      contradiction:Number(engine.audit.contradictionScore||0),
      coherence:Number(engine.lattice.transitionCoherence||0),
      gate:String(engine.hypothesis.gate||'INSUFFICIENT_EVIDENCE')
    },
    safety:{
      state:String(safety.state||'UNKNOWN'),
      canResearch:safety.canResearch===true,
      canExecute:false
    }
  };
}

function updateRadarCache(symbol,ctx) {
  radarCache.set(symbol,{
    capturedAt:Number(ctx.capturedAt||Date.now()),
    price:Number(ctx.market?.price),
    change24hPct:Number(ctx.market?.change24hPct),
    status:String(ctx.safety?.state||'UNKNOWN'),
    regime:String(ctx.state?.regime||'UNKNOWN'),
    bias:String(ctx.state?.mtfBias||'UNKNOWN'),
    witnessAgreement:Number(ctx.witness?.agreement||0),
    witnessSatisfied:ctx.witness?.satisfied===true,
    support:Number(ctx.memory?.support||0),
    sufficient:ctx.memory?.sufficient===true,
    novelty:Number(ctx.memory?.novelty||0),
    contradiction:Number(ctx.engine?.contradiction||0),
    evidenceStrength:Number(ctx.engine?.evidenceStrength||0),
    gate:String(ctx.engine?.gate||'UNKNOWN')
  });
}

async function researchAlertContext(symbol,{force=false}={}) {
  const now=Date.now();
  const cached=researchAlertContextCache.get(symbol);
  if(!force && cached && now-cached.at<researchAlertCheckMs) return cached.context;
  const state=await researchState(symbol,'5m');
  const witnessReport=await witnessState(symbol,state.market,{maxAgeMs:Math.min(researchAlertCheckMs,60000)});
  const context=buildResearchAlertContext(state,witnessReport);
  researchAlertContextCache.set(symbol,{at:now,context});
  updateRadarCache(symbol,context);
  return context;
}

function alertCurrentStateLines(ctx) {
  if(!ctx) return [];
  return [
    'Preis: '+(Number.isFinite(ctx.market?.price)?fmt(ctx.market.price,ctx.market.price<1?6:2)+' USDT':'—'),
    'Regime: '+String(ctx.state?.regime||'—'),
    'Structure: '+String(ctx.state?.structure||'—'),
    'Witness: '+fmt(Number(ctx.witness?.agreement||0)*100,0)+'%',
    'Memory support: '+fmt(Number(ctx.memory?.support||0),0),
    'Evidence: '+fmt(Number(ctx.engine?.evidenceStrength||0)*100,0)+'%',
    'Contradiction: '+fmt(Number(ctx.engine?.contradiction||0)*100,0)+'%',
    'Safety: '+String(ctx.safety?.state||'—')
  ];
}


function shadowAuditPayload(event,order,extra={}) {
  return {
    event:String(event),
    at:Date.now(),
    order:shadowOrderSummary(order),
    runtimeReleaseId:runtimeManifest?.releaseId||null,
    capabilities:SHADOW_OMS_CAPABILITIES,
    ...extra
  };
}

async function placeShadowOrder({symbol,side,type,notionalQuote,limitPrice=null,latencyMs=shadowDefaultLatencyMs}) {
  if(!shadowOmsHealthy) throw new Error('Shadow OMS unhealthy');
  const started=Date.now();
  const decisionBook=await fetchExecutionBook(symbol);
  const boundedLatency=Math.max(0,Math.min(5000,Number(latencyMs)));
  if(boundedLatency>0) await sleep(boundedLatency);
  const arrivalBook=await fetchExecutionBook(symbol);
  let lastAggTradeId=null;
  try { lastAggTradeId=await fetchLatestAggTradeId(symbol); }
  catch(err) { recordError(observability,{scope:'shadow_oms.trade_cursor',message:err instanceof Error?err.message:String(err)}); }
  const order=createShadowOrder({
    intent:{symbol,side,type,notionalQuote,limitPrice,latencyMs:boundedLatency},
    decisionBook,arrivalBook,createdAt:Date.now(),lastAggTradeId,
    config:{
      makerFeeBps:shadowMakerFeeBps,
      takerFeeBps:shadowTakerFeeBps,
      hiddenQueueBufferPct:shadowHiddenQueueBufferPct
    }
  });
  if(order.liquidity==='MAKER' && lastAggTradeId==null){
    order.dataQuality='DEGRADED_NO_TRADE_CURSOR';
  }
  shadowOrders.push(order);
  await persistShadowOms('placed');
  if(auditLedger.healthy) await appendInstitutionalAudit('TCX_SHADOW_ORDER_EVENT',shadowAuditPayload('PLACED',order));
  recordOperation(observability,{name:'shadow_oms.place',ok:true,latencyMs:Date.now()-started});
  return order;
}

async function tg(method, body) {
  const res = await fetch(`${telegramApi}/${method}`, {
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({ ok:false, description:`HTTP ${res.status}` }));
  if (!res.ok || !data.ok) {
    const msg = String(data?.description || `Telegram HTTP ${res.status}`);
    if (method === 'editMessageText' && msg.includes('message is not modified')) return null;
    throw new Error(msg);
  }
  return data.result;
}

async function tgMultipart(method, fields, fileField, fileName, fileBuffer, mime="image/png") {
  const form = new FormData();
  for (const [key,value] of Object.entries(fields)) {
    form.append(key, typeof value === "string" ? value : JSON.stringify(value));
  }
  form.append(fileField, new Blob([fileBuffer], { type:mime }), fileName);
  const res = await fetch(`${telegramApi}/${method}`, { method:"POST", body:form });
  const data = await res.json().catch(() => ({ ok:false, description:`HTTP ${res.status}` }));
  if (!res.ok || !data.ok) throw new Error(String(data?.description || `Telegram HTTP ${res.status}`));
  return data.result;
}

function startKeyboard() {
  const rows = [];
  for (let i=0;i<markets.length;i+=2) {
    rows.push(markets.slice(i,i+2).map(m => ({
      text:`${m.icon} ${m.label}`,
      callback_data:`market:${m.symbol}`
    })));
  }
  rows.push([
    { text:'⭐ Favoriten', callback_data:'favorites' },
    { text:'🔎 Suche', callback_data:'searchhelp' }
  ]);
  return { inline_keyboard: rows };
}

function marketKeyboard(chatId, symbol, live) {
  const isFav = favoriteSet(chatId).has(symbol);
  return { inline_keyboard:[
    [
      { text:'🔄 Aktualisieren', callback_data:`refresh:${symbol}` },
      { text:live?'⏸ Live aus':'⚡ Live an', callback_data:`live:${symbol}:${live?'off':'on'}` }
    ],
    [
      { text:'1m', callback_data:`tf:${symbol}:1m` },
      { text:'5m', callback_data:`tf:${symbol}:5m` },
      { text:'15m', callback_data:`tf:${symbol}:15m` },
      { text:'1h', callback_data:`tf:${symbol}:1h` }
    ],
    [
      { text:'📈 Chart', callback_data:`chart:${symbol}:5m` },
      { text:'🧭 Struktur', callback_data:`structure:${symbol}` },
      { text:'🧬 Memory', callback_data:`memory:${symbol}` }
    ],
    [
      { text:'🧪 MTL Engine', callback_data:`engine:${symbol}` },
      { text:'🛰 Witness', callback_data:`witness:${symbol}` }
    ],
    [
      { text:isFav?'★ Favorit':'☆ Favorit', callback_data:`fav:${symbol}` },
      { text:'🔔 Alarm', callback_data:`alerthelp:${symbol}` },
      { text:'🧠 TCX', callback_data:`tcx:${symbol}` }
    ],
    [{ text:'⬅️ Zurück', callback_data:'back' }]
  ]};
}

function tcxKeyboard(symbol, live) {
  return { inline_keyboard:[
    [{ text:'📊 Markt', callback_data:`refresh:${symbol}` }],
    [
      { text:live?'⏸ Live aus':'⚡ Live an', callback_data:`live:${symbol}:${live?'off':'on'}` },
      { text:'⬅️ Zurück', callback_data:'back' }
    ]
  ]};
}

function timeframeKeyboard(symbol) {
  return { inline_keyboard:[
    [
      { text:'1m', callback_data:`tf:${symbol}:1m` },
      { text:'5m', callback_data:`tf:${symbol}:5m` },
      { text:'15m', callback_data:`tf:${symbol}:15m` },
      { text:'1h', callback_data:`tf:${symbol}:1h` }
    ],
    [
      { text:'📈 Chart', callback_data:`chart:${symbol}:5m` },
      { text:'🧭 Struktur', callback_data:`structure:${symbol}` },
      { text:'🧬 Memory', callback_data:`memory:${symbol}` }
    ],
    [
      { text:'📊 Markt', callback_data:`refresh:${symbol}` },
      { text:'🧠 TCX', callback_data:`tcx:${symbol}` }
    ],
    [{ text:'⬅️ Zurück', callback_data:'back' }]
  ]};
}

function chartKeyboard(symbol, interval) {
  return { inline_keyboard:[
    [
      { text:"1m", callback_data:`chart:${symbol}:1m` },
      { text:"5m", callback_data:`chart:${symbol}:5m` },
      { text:"15m", callback_data:`chart:${symbol}:15m` },
      { text:"1h", callback_data:`chart:${symbol}:1h` },
      { text:"4h", callback_data:`chart:${symbol}:4h` }
    ],
    [
      { text:"🧭 Struktur", callback_data:`structure:${symbol}` },
      { text:"🧬 Memory", callback_data:`memory:${symbol}` },
      { text:"🧪 MTL", callback_data:`engine:${symbol}` },
      { text:"🛰 Witness", callback_data:`witness:${symbol}` },
      { text:"📊 Markt", callback_data:`refresh:${symbol}` }
    ]
  ]};
}

function structureKeyboard(symbol) {
  return { inline_keyboard:[
    [
      { text:"📈 5m Chart", callback_data:`chart:${symbol}:5m` },
      { text:"📈 1h Chart", callback_data:`chart:${symbol}:1h` }
    ],
    [
      { text:"📊 Markt", callback_data:`refresh:${symbol}` },
      { text:"🧬 Memory", callback_data:`memory:${symbol}` },
      { text:"🧪 MTL", callback_data:`engine:${symbol}` },
      { text:"🛰 Witness", callback_data:`witness:${symbol}` },
      { text:"🧠 TCX", callback_data:`tcx:${symbol}` }
    ]
  ]};
}

function memoryKeyboard(symbol) {
  return { inline_keyboard:[
    [
      { text:"📈 5m Chart", callback_data:`chart:${symbol}:5m` },
      { text:"🧭 Struktur", callback_data:`structure:${symbol}` },
      { text:"🧪 MTL", callback_data:`engine:${symbol}` },
      { text:"🛰 Witness", callback_data:`witness:${symbol}` }
    ],
    [
      { text:"🔮 Forecast", callback_data:`forecast:${symbol}` },
      { text:"📊 Markt", callback_data:`refresh:${symbol}` },
      { text:"🧠 TCX", callback_data:`tcx:${symbol}` }
    ]
  ]};
}

function favoritesKeyboard(chatId) {
  const syms = [...favoriteSet(chatId)];
  const rows = [];
  for (let i=0;i<syms.length;i+=2) {
    rows.push(syms.slice(i,i+2).map(symbol => ({
      text:`${symbolIcon(symbol)} ${symbolLabel(symbol)}`,
      callback_data:`market:${symbol}`
    })));
  }
  if(syms.length>=2) rows.push([{ text:'📊 Compare', callback_data:'compare' }]);
  rows.push([{ text:'📊 Märkte', callback_data:'home:markets' }, { text:'🏠 Home', callback_data:'home' }]);
  return { inline_keyboard: rows };
}

async function snapshot(symbol) {
  const started = Date.now();
  const { ticker, book, depth, base } = await fetchMarketParts(symbol);
  const bids = (depth.bids || []).slice(0,10).map(([p,q]) => [Number(p),Number(q)]);
  const asks = (depth.asks || []).slice(0,10).map(([p,q]) => [Number(p),Number(q)]);
  const bid = Number(book.bidPrice);
  const ask = Number(book.askPrice);
  const mid = (bid + ask) / 2;
  const spreadBps = mid > 0 ? (ask - bid) / mid * 10000 : 0;
  const bidNotional = bids.reduce((s,[p,q]) => s + p*q, 0);
  const askNotional = asks.reduce((s,[p,q]) => s + p*q, 0);
  const total = bidNotional + askNotional;
  const imbalance = total > 0 ? (bidNotional - askNotional) / total : 0;
  const now = Date.now();
  return {
    symbol,
    price:Number(ticker.lastPrice),
    changePct:Number(ticker.priceChangePercent),
    high:Number(ticker.highPrice),
    low:Number(ticker.lowPrice),
    volumeQuote:Number(ticker.quoteVolume),
    bid, ask, spreadBps, imbalance,
    timestamp:now,
    availableAt:now,
    source:'BINANCE_PUBLIC_REST',
    version:'v3',
    provenance:`ticker24hr+bookTicker+depth20; host=${new URL(base).host}; fetched_ms=${now-started}`
  };
}

async function timeframeSnapshot(symbol, interval) {
  const started = Date.now();
  const { rows, base } = await fetchKlines(symbol, interval, 30);
  const availableAt = Date.now();
  const candles = candlesFromKlines(rows, availableAt);
  const closed = closedCandles(candles);
  if (closed.length < 2) throw new Error("Insufficient closed kline data");
  const firstOpen = closed[0].o;
  const lastClose = closed.at(-1).c;
  const high = Math.max(...closed.map(c => c.h));
  const low = Math.min(...closed.map(c => c.l));
  const quoteVolume = rows.slice(0,closed.length).reduce((s,r) => s + Number(r[7] || 0), 0);
  const movePct = firstOpen > 0 ? (lastClose-firstOpen)/firstOpen*100 : 0;
  const rangePct = firstOpen > 0 ? (high-low)/firstOpen*100 : 0;
  return {
    symbol, interval, bars:closed.length, firstOpen, lastClose, high, low, quoteVolume, movePct, rangePct,
    timestamp:closed.at(-1).closeTime,
    availableAt,
    source:"BINANCE_PUBLIC_REST_KLINES",
    version:"v3",
    provenance:`closed_klines; interval=${interval}; host=${new URL(base).host}; fetched_ms=${availableAt-started}`
  };
}

function startText() {
  return [
    '🧠 TCX v2 · Live Market','',
    'Wähle eine Währung oder nutze /coin BTC.','',
    'Live-Daten: Binance · Execution: SHADOW_ONLY',
    'Keine Order-Ausführung.'
  ].join('\n');
}

function helpText() {
  return [
    '🧠 TCX Bot · Befehle','',
    '/start – Hauptmenü',
    '/coin BTC – Coin direkt öffnen',
    '/chart BTC 5m – Candlestick-Chart',
    '/structure BTC – 4H/1H/15m/5m Struktur',
    '/memory BTC – ähnliche historische TCX-Episoden',
    '/evidence BTC – Disagreement Map + Evidence-Diagnostik',
    '/validity BTC – Drift/Expiry der letzten Research-Sicht',
    '/history BTC – persistenter Evidence-Verlauf',
    '/engine BTC – Mechanism Transition Lattice',
    '/forecast BTC – institutioneller Multi-Horizon Forecast',
    '/witness BTC – Binance vs OKX vs Kraken Witness Audit',
    '/audit – Institutional Kernel / Ledger-Integrität',
    '/fabric – Event-Sourced Market Data Fabric',
    '/replay BTC [ISO-Zeit] – Point-in-Time Replay',
    'Replay auch per 🎬-Button direkt am Markt',
    '/release – Runtime Release & Configuration Registry',
    '/obs – Institutional Observability / SLOs',
    '/chaos [SCENARIO] – synthetischer Fail-Closed-Test',
    '/oms – Shadow OMS / Microstructure Simulator',
    '/shadow BTC BUY 100 MARKET [latencyMs] – virtuelle Market-Order',
    '/shadow BTC BUY 100 LIMIT 65000 [latencyMs] – virtuelle Limit-Order',
    '/shadoworders [BTC] – Shadow-Orders',
    '/shadowcancel ORDER_ID – virtuelle Order abbrechen',
    '/sor BTC BUY 100 – Multi-Venue Shadow Smart Order Route',
    '/sorstatus [BTC] – Venue-Qualität / Routing-Fähigkeit',
    '/venuequality BTC [BUY|SELL] [1000] – gelernte Venue-Execution-Qualität',
    '/executionlab BTC [BUY|SELL] – OOS / Walk-Forward / Calibration / Drift',
    '/favorites – Favoriten',
    '/compare – bis zu vier Favoriten vergleichen',
    '/alert BTC 70000 – einmaliger Preisalarm',
    '/alertregime BTC – Regime-Wechsel',
    '/alertstructure BTC – Struktur-Wechsel',
    '/alertwitness BTC 75 – Witness-Schwelle in %',
    '/alertmemory BTC 8 – Mindestzahl historischer Transitionen',
    '/alertsafety BTC – Safety-State-Wechsel',
    '/alertcombo BTC – Composite Research Gate',
    '/alerts – aktive Alarme',
    '/clearalerts – alle Alarme löschen','',
    'Favoriten und Alarme werden persistent gespeichert, wenn Railway ein Volume auf /data gemountet hat.',
    'Execution bleibt SHADOW_ONLY.'
  ].join('\n');
}

function renderMarket(s, live) {
  const dir = s.changePct >= 0 ? '▲' : '▼';
  const im = s.imbalance > 0.12 ? 'Bid-lastig' : s.imbalance < -0.12 ? 'Ask-lastig' : 'ausgeglichen';
  return [
    `📊 ${s.symbol.replace('USDT','/USDT')} · Binance`,'',
    `💰 ${fmt(s.price, s.price < 1 ? 6 : 2)} USDT`,
    `${dir} 24h: ${s.changePct >= 0 ? '+' : ''}${fmt(s.changePct,2)} %`,
    `↕️ 24h: ${fmt(s.low,2)} – ${fmt(s.high,2)}`,
    `📦 Quote-Volumen: ${fmt(s.volumeQuote,0)} USDT`,'',
    `📖 Bid / Ask: ${fmt(s.bid, s.bid<1?6:2)} / ${fmt(s.ask, s.ask<1?6:2)}`,
    `↔️ Spread: ${fmt(s.spreadBps,3)} bps`,
    `⚖️ Depth-Imbalance: ${fmt(s.imbalance*100,1)} % (${im})`,'',
    live ? `⚡ LIVE · Auto-Refresh ${Math.round(refreshMs/1000)}s` : '⏸ Live aus',
    '🧪 TCX: SHADOW_ONLY'
  ].join('\n');
}

function renderTimeframe(t) {
  const dir = t.movePct >= 0 ? '▲' : '▼';
  return [
    `🕯 ${t.symbol.replace('USDT','/USDT')} · ${t.interval}`,'',
    `${dir} 30 Kerzen: ${t.movePct >= 0 ? '+' : ''}${fmt(t.movePct,2)} %`,
    `Start: ${fmt(t.firstOpen,t.firstOpen<1?6:2)}`,
    `Letzter Close: ${fmt(t.lastClose,t.lastClose<1?6:2)}`,
    `High / Low: ${fmt(t.high,t.high<1?6:2)} / ${fmt(t.low,t.low<1?6:2)}`,
    `Range: ${fmt(t.rangePct,2)} %`,
    `Quote-Volumen: ${fmt(t.quoteVolume,0)} USDT`,'',
    'Status: OBSERVED / DERIVED',
    'Execution: SHADOW_ONLY'
  ].join('\n');
}

function renderTcx(s) {
  const liquidity = s.spreadBps < 1 ? 'TIGHT' : s.spreadBps < 4 ? 'NORMAL' : 'WIDE';
  const flow = s.imbalance > 0.15 ? 'BID_PRESSURE' : s.imbalance < -0.15 ? 'ASK_PRESSURE' : 'BALANCED';
  const move = Math.abs(s.changePct) < 1 ? 'LOW' : Math.abs(s.changePct) < 4 ? 'MEDIUM' : 'HIGH';
  return [
    `🧠 TCX · ${s.symbol.replace('USDT','/USDT')}`,'',
    'OBSERVED',
    `• Liquidity: ${liquidity}`,
    `• Orderbook flow: ${flow}`,
    `• 24h move magnitude: ${move}`,
    `• Spread: ${fmt(s.spreadBps,3)} bps`,
    `• Depth imbalance: ${fmt(s.imbalance*100,1)} %`,'',
    'EPISTEMIC STATUS',
    '• Market snapshot: OBSERVED',
    '• Mechanism attribution: NOT INFERRED HERE',
    '• Trading action: ABSTAIN / SHADOW_ONLY','',
    `timestamp: ${new Date(s.timestamp).toISOString()}`,
    `availableAt: ${new Date(s.availableAt).toISOString()}`,
    `source: ${s.source}`,
    `version: ${s.version}`
  ].join('\n');
}

async function ack(id, text) {
  try { await tg('answerCallbackQuery', { callback_query_id:id, text, show_alert:false }); } catch {}
}

async function showStart(chatId, messageId) {
  sessions.delete(String(chatId));
  const payload = {
    chat_id:chatId,
    text:productHomeText({marketCount:markets.length,systemStatus:'ONLINE'}),
    reply_markup:productHomeKeyboard()
  };
  if (messageId) await tg('editMessageText', { ...payload, message_id:messageId });
  else await tg('sendMessage', payload);
}

function homeBackKeyboard(extra=[]) {
  return { inline_keyboard:[
    ...extra,
    [{ text:'📊 Märkte', callback_data:'home:markets' }, { text:'🏠 Home', callback_data:'home' }]
  ]};
}

async function showMarkets(chatId,messageId) {
  const payload={
    chat_id:chatId,
    text:[
      '📊 TCX Märkte','',
      'Wähle einen Markt. Jeder Coin öffnet die Live-Marktkarte.',
      'Research-Status bleibt ABSTAIN / SHADOW_ONLY.'
    ].join('\n'),
    reply_markup:productMarketsKeyboard(markets,favoriteSet(chatId).size)
  };
  if(messageId) await tg('editMessageText',{...payload,message_id:messageId});
  else await tg('sendMessage',payload);
}

async function showHomeSection(chatId,messageId,section) {
  if(section==='MARKETS') return showMarkets(chatId,messageId);
  if(section==='WATCHLIST') return showFavorites(chatId,messageId);

  let text='';
  if(section==='ALERTS') {
    const list=activeAlerts(chatId);
    text=list.length
      ? ['🔔 TCX ALERTS v2','',...list.map((a,i)=>`${i+1}. ${describeAlert(a)}`),'','Preis: /alert BTC 70000','Weitere Alerts direkt über den 🔔-Button eines Marktes.'].join('\n')
      : ['🔔 TCX ALERTS v2','','Keine aktiven Alarme.','Preis: /alert BTC 70000','Research-Alerts direkt über den 🔔-Button eines Marktes.'].join('\n');
  } else if(section==='RADAR') {
    const now=Date.now();
    const lines=requestedSymbols.map(symbol=>{
      const r=radarCache.get(symbol);
      if(!r){
        const own=episodes.filter(e=>e.symbol===symbol);
        return `${symbolLabel(symbol)} · warming · Memory ${own.length}`;
      }
      const age=Math.max(0,now-r.capturedAt);
      return `${symbolLabel(symbol)} · ${r.status} · ${r.regime} · V${r.validity||'BASE'} · W${fmt(r.witnessAgreement*100,0)}% · M${r.support} · N${fmt(r.novelty*100,0)}% · C${fmt(r.contradiction*100,0)}% · ${Math.round(age/1000)}s`;
    });
    text=['🧠 TCX RADAR v2','',
      'Kein Trade-Ranking. V=View Validity · W=Witness · M=Memory · N=Novelty · C=Contradiction.','',
      ...lines,'',
      'Action bleibt ABSTAIN / SHADOW_ONLY.'
    ].join('\n');
  } else if(section==='SYSTEM') {
    text=[
      '🩺 TCX SYSTEM','',
      `Audit ledger: ${auditLedger.healthy?'OK':'DEGRADED'} · seq ${auditLedger.seq}`,
      `Market fabric: ${marketFabric.healthy?'OK':'DEGRADED'} · events ${marketFabric.events.length}`,
      `Release registry: ${releaseRegistry.healthy?'OK':'DEGRADED'} · seq ${releaseRegistry.seq}`,
      `State persistence: ${persistenceHealthy?'OK':'DEGRADED'}`,
      `Episode persistence: ${episodePersistenceHealthy?'OK':'DEGRADED'}`,
      `Evidence persistence: ${evidenceHistoryHealthy?'OK':'DEGRADED'} · snapshots ${evidenceRecords.length}`,
      `Witness cache: ${witnessCache.size}`,
      `Active sessions: ${sessions.size}`,'',
      'Execution: SHADOW_ONLY',
      'canExecute: false'
    ].join('\n');
  } else if(section==='PERFORMANCE') {
    const total=episodes.length;
    const mature15=episodes.filter(e=>e.outcomes?.['3']).length;
    const mature1h=episodes.filter(e=>e.outcomes?.['12']).length;
    const mature3h=episodes.filter(e=>e.outcomes?.['36']).length;
    const activeAlerts=[...alerts.values()].reduce((n,x)=>n+x.length,0);
    text=[
      '📈 TCX PERFORMANCE · Measured only','',
      `Episodes total: ${total}`,
      `Mature 15m: ${mature15}`,
      `Mature 1h: ${mature1h}`,
      `Mature 3h: ${mature3h}`,
      `Active alerts: ${activeAlerts}`,
      `Evidence snapshots: ${evidenceRecords.length}`,
      `Tracked markets: ${markets.length}`,'',
      'Noch keine künstliche Winrate und keine erfundenen Forecast-Scores.',
      'Brier/Calibration/Coverage kommen erst mit einem validierten Forecast-Modul.'
    ].join('\n');
  } else if(section==='SETTINGS') {
    text=[
      '⚙️ TCX SETTINGS · Runtime','',
      `Live refresh: ${Math.round(refreshMs/1000)} s`,
      `Alert check: ${Math.round(alertCheckMs/1000)} s`,
      `Episode sweep: ${Math.round(episodeSweepMs/1000)} s`,
      `Markets: ${markets.length}`,
      `Chat whitelist: ${allowedChats.size?'ON':'OFF'}`,
      `State file: ${stateFile}`,'',
      'Execution: SHADOW_ONLY',
      'Telegram-spezifische User-Settings werden als eigener persistenter Layer ergänzt.'
    ].join('\n');
  } else {
    text='TCX Bereich noch nicht verfügbar.';
  }

  const payload={chat_id:chatId,text:text.slice(0,4096),reply_markup:homeBackKeyboard()};
  if(messageId) await tg('editMessageText',{...payload,message_id:messageId});
  else await tg('sendMessage',payload);
}

async function showWhy(chatId,messageId,symbol) {
  const state=await researchState(symbol,'5m');
  const witness=await witnessState(symbol,state.market).catch(()=>null);
  const stored=episodes.filter(e=>e.symbol===symbol).length;
  const mature=episodes.filter(e=>e.symbol===symbol && e.outcomes?.['12']).length;
  const contradictions=witness?.contradictions?.length
    ? witness.contradictions.slice(0,4).join(', ')
    : 'keine harte Cross-Venue-Contradiction im aktuellen Audit';
  const pattern=state.analysis?.pattern
    ? `${state.analysis.pattern.stage}/${state.analysis.pattern.side}`
    : 'kein frisches Break/Retest-Muster';
  const text=[
    `❓ WARUM? · ${symbol.replace('USDT','/USDT')}`,'',
    'AKTUELL BEOBACHTET / ABGELEITET',
    `• MTF Bias: ${state.dashboard.bias} (${state.dashboard.biasScore>=0?'+':''}${state.dashboard.biasScore})`,
    `• Regime: ${state.dashboard.regime}`,
    `• Flow: ${state.dashboard.flow}`,
    `• Liquidity: ${state.dashboard.liquidity}`,
    `• RIFT pressure proxy: ${Math.round(state.dashboard.pressureScore)}/100 · ${state.dashboard.pressureBand}`,
    `• 5m Structure: ${state.analysis?.trend||'INSUFFICIENT'} · ${pattern}`,
    `• Memory: ${stored} gespeichert · ${mature} mit 1h-Outcome`,
    `• Witness agreement: ${witness?Math.round((witness.agreementScore||0)*100)+'%':'nicht verfügbar'}`,'',
    'WIDERSPRUCH / UNSICHERHEIT',
    `• ${contradictions}`,'',
    'WAS WÜRDE DIE AKTUELLE SICHT ÄNDERN?',
    '• neuer Strukturzustand / Break-Retest-Wechsel',
    '• Regime-Transition',
    '• deutlicher Cross-Venue-Konflikt',
    '• veraltete oder fehlerhafte Daten',
    '• aktuell historisch neuartiger Zustand','',
    'Kein Buy/Sell-Signal. Mechanism posterior: NOT_IDENTIFIED.',
    'Action: ABSTAIN / SHADOW_ONLY'
  ].join('\n');
  await tg('editMessageText',{
    chat_id:chatId,message_id:messageId,text:text.slice(0,4096),
    reply_markup:marketProductKeyboard(symbol,{live:false,isFavorite:favoriteSet(chatId).has(symbol)})
  });
}

async function showRegime(chatId,messageId,symbol) {
  const state=await researchState(symbol,'5m');
  const mtf=state.mtf;
  const rows=['4h','1h','15m','5m'].map(tf=>{
    const a=mtf?.analyses?.[tf];
    return `${tf}: ${a?.trend||'INSUFFICIENT'} · EMA20 ${priceText(a?.ema20)} · EMA50 ${priceText(a?.ema50)}`;
  });
  const text=[
    `🧬 REGIME · ${symbol.replace('USDT','/USDT')}`,'',
    `Local regime: ${state.dashboard.regime}`,
    `MTF Bias: ${state.dashboard.bias} · Score ${state.dashboard.biasScore}`,
    `Flow: ${state.dashboard.flow}`,
    `Liquidity: ${state.dashboard.liquidity}`,
    `RIFT: ${Math.round(state.dashboard.pressureScore)}/100 · ${state.dashboard.pressureBand}`,'',
    ...rows,'',
    'Status: DERIVED_HEURISTIC',
    'Causal mechanism: NOT_IDENTIFIED',
    'Action: ABSTAIN / SHADOW_ONLY',
    `availableAt: ${new Date(state.availableAt).toISOString()}`
  ].join('\n');
  await tg('editMessageText',{
    chat_id:chatId,message_id:messageId,text:text.slice(0,4096),
    reply_markup:marketProductKeyboard(symbol,{live:false,isFavorite:favoriteSet(chatId).has(symbol)})
  });
}

function evidenceRelationIcon(relation) {
  if(relation==='ALIGNED'||relation==='SUPPORTED') return '✓';
  if(relation==='CONFLICT') return '!';
  if(relation==='NOVEL') return '?';
  return '·';
}

async function currentEvidenceState(symbol) {
  const context=await researchAlertContext(symbol,{force:true});
  const state=currentEvidenceLifecycle(evidenceRecords,symbol,context,{config:researchValidityConfig});
  updateRadarValidity(symbol,state.validity);
  return {...state,context};
}

async function currentEvidenceRecord(symbol) {
  return (await currentEvidenceState(symbol)).record;
}

async function showEvidence(chatId,messageId,symbol) {
  const {record,validity}=await currentEvidenceState(symbol);
  const map=record.map;
  const lines=map.layers.map(x=>
    '• '+x.layer+': '+x.value+' · '+evidenceRelationIcon(x.relation)+' '+x.relation
  );
  const text=[
    '🧩 TCX EVIDENCE · '+symbol.replace('USDT','/USDT'),'',
    'Evidence Index: '+record.index+'/100',
    'Evidence Trend: '+record.trend,
    'Directional reference: '+record.reference,
    'Safety: '+record.status,
    'Gate: '+record.gate,
    'View validity: '+(validity?.status||'BASELINE')+(validity?' · drift '+fmt(validity.driftScore*100,0)+'%':''),
    'State FP: '+(record.stateFingerprint?.hash?record.stateFingerprint.hash.slice(0,16)+'…':'legacy'),'',
    'DISAGREEMENT MAP',
    ...lines,'',
    'Witness agreement: '+fmt(record.witnessAgreement*100,0)+'%',
    'Historical support: '+record.memorySupport,
    'Novelty: '+fmt(record.novelty*100,0)+'%',
    'Contradiction: '+fmt(record.contradiction*100,0)+'%',
    'Evidence strength: '+fmt(record.evidenceStrength*100,0)+'%',
    'Conflicts: '+record.disagreementCount+' · weak/novel: '+record.weakCount,
    ...(validity?['Validity reasons: '+(formatValidityReason(validity,{limit:3}).join(', ')||'none')]:[]),'',
    'Der Evidence Index ist ein diagnostischer Forschungsindex, KEINE Eintrittswahrscheinlichkeit.',
    'Epistemic: DERIVED_RESEARCH_DIAGNOSTIC_NOT_PROBABILITY',
    'Action: ABSTAIN / SHADOW_ONLY'
  ].join('\n');
  const payload={
    chat_id:chatId,
    text:text.slice(0,4096),
    reply_markup:marketProductKeyboard(symbol,{live:false,isFavorite:favoriteSet(chatId).has(symbol)})
  };
  if(messageId) await tg('editMessageText',{...payload,message_id:messageId});
  else await tg('sendMessage',payload);
}

async function showEvidenceHistory(chatId,messageId,symbol) {
  const rows=evidenceHistoryFor(evidenceRecords,symbol,{limit:12});
  const total=evidenceRecords.filter(r=>r.symbol===symbol).length;
  let text;
  if(!rows.length){
    text=[
      '📜 TCX EVIDENCE HISTORY · '+symbol.replace('USDT','/USDT'),'',
      'Noch keine persistente Evidence-Historie.',
      'Der Research-Sweep schreibt automatisch Zustands-Snapshots.',
      '',
      'Evidence ist ein diagnostischer Forschungsindex, keine Trading-Wahrscheinlichkeit.',
      'Action: ABSTAIN / SHADOW_ONLY'
    ].join('\n');
  } else {
    const latest=rows.at(-1);
    const previous=rows.length>1?rows.at(-2):null;
    const delta=previous?latest.index-previous.index:null;
    const entries=rows.slice().reverse().map(r=>{
      const ts=new Intl.DateTimeFormat('de-DE',{
        timeZone:'Europe/Berlin',
        hour:'2-digit',
        minute:'2-digit',
        day:'2-digit',
        month:'2-digit'
      }).format(new Date(r.capturedAt));
      const lifecycle=r.validityLast?.status || (r===latest?'ACTIVE':'LEGACY');
      return '• '+ts+' · '+r.index+'/100 · '+r.trend+' · '+lifecycle+' · '+r.regime;
    });
    text=[
      '📜 TCX EVIDENCE HISTORY · '+symbol.replace('USDT','/USDT'),'',
      'Snapshots gespeichert: '+total,
      'Aktuell: '+latest.index+'/100 · '+latest.trend,
      'Δ letzter Snapshot: '+(delta==null?'—':(delta>=0?'+':'')+delta),
      'Conflicts: '+latest.disagreementCount+' · Gate: '+latest.gate,
      'Latest lifecycle: '+(latest.validityLast?.status||'ACTIVE'),'',
      'LETZTE SNAPSHOTS',
      ...entries,'',
      'Index = Evidence-Diagnostik, nicht Preis- oder Trefferwahrscheinlichkeit.',
      'Action: ABSTAIN / SHADOW_ONLY'
    ].join('\n');
  }
  const payload={
    chat_id:chatId,
    text:text.slice(0,4096),
    reply_markup:marketProductKeyboard(symbol,{live:false,isFavorite:favoriteSet(chatId).has(symbol)})
  };
  if(messageId) await tg('editMessageText',{...payload,message_id:messageId});
  else await tg('sendMessage',payload);
}

async function showValidity(chatId,messageId,symbol) {
  const {baseline,record,validity}=await currentEvidenceState(symbol);
  let text;
  if(!baseline?.stateFingerprint){
    text=[
      '⏱ TCX RESEARCH VALIDITY · '+symbol.replace('USDT','/USDT'),'',
      'Status: BASELINE',
      'Noch kein fingerprint-fähiger gespeicherter Snapshot vorhanden.',
      'Der nächste Research-Sweep erzeugt die Vergleichsbasis.','',
      'Current fingerprint: '+(record.stateFingerprint?.hash?.slice(0,20)||'unavailable')+'…',
      'Execution: SHADOW_ONLY'
    ].join('\n');
  } else {
    const reasons=formatValidityReason(validity,{limit:6});
    text=[
      '⏱ TCX RESEARCH VALIDITY · '+symbol.replace('USDT','/USDT'),'',
      'Status: '+validity.status,
      'Age: '+Math.round(validity.ageMs/1000)+'s',
      'Drift: '+fmt(validity.driftScore*100,1)+'%',
      'Changed dimensions: '+validity.changedDimensions,
      'Price drift from baseline: '+fmt(validity.priceMovePct,3)+'%',
      'Reusable without refresh: '+(validity.reusableWithoutRefresh?'YES':'NO'),
      'Valid for research: '+(validity.validForResearch?'YES':'NO'),'',
      'BASELINE',
      '• '+new Date(baseline.capturedAt).toISOString(),
      '• '+baseline.stateFingerprint.hash.slice(0,20)+'…',
      'CURRENT',
      '• '+new Date(record.capturedAt).toISOString(),
      '• '+record.stateFingerprint.hash.slice(0,20)+'…','',
      'REASONS',
      ...(reasons.length?reasons.map(x=>'• '+x):['• none']),
      '',
      'STALE = refresh recommended.',
      'DRIFTED / EXPIRED / INVALIDATED = alte Research-Sicht nicht weiterverwenden.',
      'canExecute: false · SHADOW_ONLY'
    ].join('\n');
  }
  const payload={
    chat_id:chatId,
    text:text.slice(0,4096),
    reply_markup:marketProductKeyboard(symbol,{live:false,isFavorite:favoriteSet(chatId).has(symbol)})
  };
  if(messageId) await tg('editMessageText',{...payload,message_id:messageId});
  else await tg('sendMessage',payload);
}

async function showFavorites(chatId, messageId) {
  const syms = [...favoriteSet(chatId)];
  let text;
  if(!syms.length){
    text='⭐ WATCHLIST\n\nNoch keine Favoriten.\n\nÖffne einen Coin und tippe auf ☆ Favorit.';
  } else {
    const marketRows=await Promise.all(syms.slice(0,20).map(async symbol=>{
      try{
        const s=await snapshot(symbol);
        return [symbol,s];
      }catch{
        return [symbol,null];
      }
    }));
    const live=new Map(marketRows);
    const lines=syms.slice(0,20).map(symbol=>{
      const s=live.get(symbol);
      const r=radarCache.get(symbol);
      const price=s?.price;
      const change=s?.changePct;
      const priceText=Number.isFinite(price)?fmt(price,price<1?6:2):'—';
      const changeText=Number.isFinite(change)?((change>=0?'+':'')+fmt(change,2)+'%'):'—';
      const regime=r?.regime||'warming';
      const status=r?.status||'—';
      return '• '+symbolLabel(symbol)+' · '+priceText+' · '+changeText+' · '+regime+' · '+status+' · V '+(r?.validity||'BASE');
    });
    text=[
      '⭐ TCX WATCHLIST v2','',
      'Preis · 24h · Regime · Safety · Validity','',
      ...lines,
      syms.length>20?'… weitere Favoriten ausgeblendet':'',
      '',
      'Research-Felder werden vom TCX-Sweep aktualisiert.',
      'Action: ABSTAIN / SHADOW_ONLY'
    ].filter(Boolean).join('\n');
  }
  const payload = { chat_id:chatId, text:text.slice(0,4096), reply_markup:favoritesKeyboard(chatId) };
  if (messageId) await tg('editMessageText', { ...payload, message_id:messageId });
  else await tg('sendMessage', payload);
}

async function showCompare(chatId,messageId) {
  const syms=[...favoriteSet(chatId)].slice(0,4);
  if(syms.length<2){
    const payload={
      chat_id:chatId,
      text:'📊 COMPARE\n\nMindestens zwei Favoriten erforderlich.',
      reply_markup:favoritesKeyboard(chatId)
    };
    if(messageId) await tg('editMessageText',{...payload,message_id:messageId});
    else await tg('sendMessage',payload);
    return;
  }

  const results=[];
  for(const symbol of syms){
    let r=radarCache.get(symbol);
    const stale=!r || Date.now()-Number(r.capturedAt||0)>10*60*1000;
    if(stale){
      try{
        await researchAlertContext(symbol,{force:true});
        r=radarCache.get(symbol);
      }catch{}
    }
    let market=null;
    try{ market=await snapshot(symbol); }catch{}
    const e=latestEvidenceRecord(symbol);
    results.push({symbol,r,market,e});
  }

  const lines=results.map(({symbol,r,market,e})=>{
    const price=market?.price;
    return [
      symbolLabel(symbol),
      'P '+(Number.isFinite(price)?fmt(price,price<1?6:2):'—'),
      'R '+String(r?.regime||'—'),
      'MTF '+String(r?.bias||'—'),
      'W '+(r?fmt(r.witnessAgreement*100,0)+'%':'—'),
      'M '+(r?.support??'—'),
      'N '+(r?fmt(r.novelty*100,0)+'%':'—'),
      'C '+(r?fmt(r.contradiction*100,0)+'%':'—'),
      'E '+(e?.index??'—')+'/100',
      'V '+String(r?.validity||'BASE'),
      'S '+String(r?.status||'—')
    ].join(' · ');
  });

  const rows=[];
  for(let i=0;i<syms.length;i+=2){
    rows.push(syms.slice(i,i+2).map(symbol=>({
      text:symbolIcon(symbol)+' '+symbolLabel(symbol),
      callback_data:'market:'+symbol
    })));
  }
  rows.push([{text:'⭐ Watchlist',callback_data:'favorites'},{text:'🏠 Home',callback_data:'home'}]);

  const text=[
    '📊 TCX COMPARE','',
    'P=Preis · R=Regime · W=Witness · M=Memory · N=Novelty · C=Contradiction · E=Evidence · V=Validity · S=Safety','',
    ...lines,'',
    'Keine Rangliste und kein Trade-Winner.',
    'Action: ABSTAIN / SHADOW_ONLY'
  ].join('\n');

  const payload={chat_id:chatId,text:text.slice(0,4096),reply_markup:{inline_keyboard:rows}};
  if(messageId) await tg('editMessageText',{...payload,message_id:messageId});
  else await tg('sendMessage',payload);
}

async function showMarket(chatId, messageId, symbol, live) {
  const s = await snapshot(symbol);
  const text = renderMarket(s,live);
  const reply_markup = marketProductKeyboard(symbol,{live,isFavorite:favoriteSet(chatId).has(symbol)});
  if (messageId) {
    await tg('editMessageText', { chat_id:chatId, message_id:messageId, text, reply_markup });
    sessions.set(String(chatId), { chatId, messageId, symbol, live, view:'MARKET', lastRefresh:Date.now() });
  } else {
    const sent = await tg('sendMessage', { chat_id:chatId, text, reply_markup });
    sessions.set(String(chatId), { chatId, messageId:sent.message_id, symbol, live, view:'MARKET', lastRefresh:Date.now() });
  }
}

async function showTimeframe(chatId, messageId, symbol, interval) {
  const t = await timeframeSnapshot(symbol, interval);
  await tg('editMessageText', {
    chat_id:chatId,
    message_id:messageId,
    text:renderTimeframe(t),
    reply_markup:timeframeKeyboard(symbol)
  });
  const live = sessions.get(String(chatId))?.live === true;
  sessions.set(String(chatId), { chatId, messageId, symbol, live, view:'TIMEFRAME', interval, lastRefresh:Date.now() });
}

async function showTcx(chatId, messageId, symbol) {
  const s = await snapshot(symbol);
  const live = sessions.get(String(chatId))?.live === true;
  await tg('editMessageText', {
    chat_id:chatId,
    message_id:messageId,
    text:renderTcx(s),
    reply_markup:tcxKeyboard(symbol,live)
  });
  sessions.set(String(chatId), { chatId, messageId, symbol, live, view:'TCX', lastRefresh:Date.now() });
}

function priceText(v) {
  if (!Number.isFinite(v)) return "—";
  return fmt(v,Math.abs(v)<1?6:2);
}

function chartCaption(symbol, interval, analysis, candles, availableAt, host, dashboard) {
  const recent=(analysis.classifiedPivots||[]).slice(-4).map(p=>`${p.label} ${priceText(p.price)}`).join(" · ")||"keine bestätigten Swings";
  const pattern=analysis.pattern?`${analysis.pattern.stage} · ${analysis.pattern.side} @ ${priceText(analysis.pattern.level)}`:"kein frisches Break/Retest-Muster";
  const activeVisible=candles.some(c=>c.closed===false);
  return [
    `📈 ${symbol.replace("USDT","/USDT")} · ${interval}`,
    `MTF Bias: ${dashboard.bias} (${dashboard.biasScore>=0?"+":""}${dashboard.biasScore}) · Regime: ${dashboard.regime}`,
    `RIFT pressure proxy: ${Math.round(dashboard.pressureScore)}/100 ${dashboard.pressureBand} · ${dashboard.dominantPressure}`,
    `Flow: ${dashboard.flow} · Liquidity: ${dashboard.liquidity} · Spread ${dashboard.spreadBps.toFixed(2)} bps`,
    `Swings: ${recent}`,
    `EMA20 / EMA50: ${priceText(analysis.ema20)} / ${priceText(analysis.ema50)}`,
    `Support / Resistance: ${priceText(analysis.support)} / ${priceText(analysis.resistance)}`,
    `Pattern: ${pattern}`,
    activeVisible?"Live-Kerze sichtbar; Struktur nutzt nur geschlossene Kerzen.":"Alle dargestellten Kerzen geschlossen.",
    "",
    "OBSERVED: OHLCV/Orderbook · DERIVED_HEURISTIC: Struktur/Regime/RIFT pressure",
    "Mechanism posterior: NOT_IDENTIFIED · Action: ABSTAIN / SHADOW_ONLY",
    `availableAt: ${new Date(availableAt).toISOString()} · source: ${host}`
  ].join("\n").slice(0,1024);
}

async function researchState(symbol,interval="5m") {
  const frames=[...new Set(["4h","1h","15m","5m",interval])];
  const [market,...fetched]=await Promise.all([
    snapshot(symbol),
    ...frames.map(tf=>fetchKlines(symbol,tf,tf==="5m"?500:180))
  ]);
  const availableAt=Math.max(Date.now(),Number(market.availableAt)||0);
  const byTf={};
  frames.forEach((tf,i)=>{byTf[tf]=candlesFromKlines(fetched[i].rows,availableAt);});
  const analysis=analyzeStructure(byTf[interval]);
  const mtf=analyzeMultiTimeframe({
    "4h":byTf["4h"],
    "1h":byTf["1h"],
    "15m":byTf["15m"],
    "5m":byTf["5m"]
  });
  const dashboard=deriveChartDashboard(byTf[interval],analysis,mtf,market);
  const memoryAnalysis=interval==="5m"?analysis:analyzeStructure(byTf["5m"]);
  const memoryDashboard=interval==="5m"?dashboard:deriveChartDashboard(byTf["5m"],memoryAnalysis,mtf,market);
  return {symbol,interval,availableAt,frames,fetched,market,byTf,analysis,mtf,dashboard,memoryAnalysis,memoryDashboard};
}

function latestSymbolEpisode(symbol) {
  for(let i=episodes.length-1;i>=0;i--) if(episodes[i].symbol===symbol) return episodes[i];
  return null;
}

async function captureEpisodeFromState(state,{persist=true}={}) {
  const closed5=closedCandles(state.byTf["5m"]);
  const anchor=closed5.at(-1)?.closeTime;
  if(!Number.isFinite(anchor)) return null;
  const lastEpisode=latestSymbolEpisode(state.symbol);
  const decision=shouldSampleEpisode({
    anchorCloseTime:anchor,
    analysis:state.memoryAnalysis,
    dashboard:state.memoryDashboard,
    lastEpisode
  });
  if(!decision.capture) return null;
  const id=`${state.symbol}:5m:${anchor}`;
  const existing=episodes.find(e=>e.id===id);
  if(existing) return existing;
  const episode=createEpisode({
    symbol:state.symbol,
    interval:"5m",
    anchorCloseTime:anchor,
    availableAt:state.availableAt,
    analysis:state.memoryAnalysis,
    dashboard:state.memoryDashboard,
    market:state.market,
    samplingReason:decision.reason
  });
  episodes.push(episode);
  if(persist) await persistEpisodeMemory("capture");
  return episode;
}

function matureSymbolEpisodes(symbol,candles,observedAt=Date.now()) {
  let changed=false;
  for(const e of episodes) {
    if(e.symbol!==symbol) continue;
    if(matureEpisode(e,candles,{observedAt})) changed=true;
  }
  return changed;
}

function statLine(label,s) {
  if(!s||s.n<3) return `${label}: n=${s?.n||0} · noch zu wenig gereifte Episoden`;
  const r=s.returnPct,up=s.maxRisePct,down=s.maxFallPct;
  return `${label}: n=${s.n} · Sim ${fmt(s.medianSimilarity,0)}% · End ${fmt(r.median,2)}% [IQR ${fmt(r.q25,2)}..${fmt(r.q75,2)}] · Rise ${fmt(up.median,2)}% · Fall ${fmt(down.median,2)}%`;
}

async function showMemory(chatId,symbol) {
  const state=await researchState(symbol,"5m");
  await captureEpisodeFromState(state,{persist:false});
  const matured=matureSymbolEpisodes(symbol,state.byTf["5m"],state.availableAt);
  if(matured) await persistEpisodeMemory("manual-maturity");
  const vector=episodeVector({analysis:state.memoryAnalysis,dashboard:state.memoryDashboard});
  const m3=findSimilarEpisodes(vector,episodes,{symbol,k:8,requireMatured:true,horizonBars:3});
  const m12=findSimilarEpisodes(vector,episodes,{symbol,k:8,requireMatured:true,horizonBars:12});
  const m36=findSimilarEpisodes(vector,episodes,{symbol,k:8,requireMatured:true,horizonBars:36});
  const s3=summarizeSimilar(m3,3),s12=summarizeSimilar(m12,12),s36=summarizeSimilar(m36,36);
  const stored=episodes.filter(e=>e.symbol===symbol).length;
  const text=[
    `🧬 TCX Episode Memory · ${symbol.replace("USDT","/USDT")}`,
    "",
    `Aktuell: ${state.memoryDashboard.regime} · ${state.memoryDashboard.flow} · RIFT ${Math.round(state.memoryDashboard.pressureScore)}/100`,
    `Gespeicherte Episoden: ${stored}`,
    "",
    "Ähnlichkeit = Zustand/Mechanik-Telemetrie, NICHT Chartform.",
    statLine("15m",s3),
    statLine("1h",s12),
    statLine("3h",s36),
    "",
    "Outcomes: historisch beobachtete Endbewegung + maximale Auf-/Abwärtsbewegung.",
    "Keine Trefferquote, keine Prognose, kein Trade-Signal.",
    "Mechanism posterior: NOT_IDENTIFIED",
    "Action: ABSTAIN / SHADOW_ONLY"
  ].join("\n");
  return tg("sendMessage",{chat_id:chatId,text,reply_markup:memoryKeyboard(symbol)});
}

async function showChart(chatId, symbol, interval="5m") {
  const state=await researchState(symbol,interval);
  await captureEpisodeFromState(state,{persist:true});
  const png=renderCandlestickPng(state.byTf[interval],state.analysis,{width:1100,height:760,dashboard:state.dashboard});
  const host=new URL(state.fetched[state.frames.indexOf(interval)].base).host;
  return tgMultipart("sendPhoto",{
    chat_id:String(chatId),
    caption:chartCaption(symbol,interval,state.analysis,state.byTf[interval],state.availableAt,host,state.dashboard),
    reply_markup:JSON.stringify(chartKeyboard(symbol,interval))
  },"photo",`${symbol}-${interval}.png`,png,"image/png");
}

function structureText(symbol, result, availableAt) {
  const lines=[`🧭 TCX Structure · ${symbol.replace("USDT","/USDT")}`,""];
  for (const tf of ["4h","1h","15m","5m"]) {
    const a=result.analyses[tf];
    const p=a?.pattern ? `${a.pattern.stage}/${a.pattern.side}` : "—";
    lines.push(`${tf}: ${a?.trend || "INSUFFICIENT"} · EMA20 ${priceText(a?.ema20)} · EMA50 ${priceText(a?.ema50)} · Pattern ${p}`);
  }
  lines.push("",`MTF Bias: ${result.bias} · Score ${result.biasScore}`);
  const five=result.analyses["5m"];
  lines.push(`5m Support / Resistance: ${priceText(five?.support)} / ${priceText(five?.resistance)}`);
  lines.push("","EPISTEMIC STATUS","• OHLCV: OBSERVED","• Pivots/EMA/Bias/Break-Retest: DERIVED HEURISTIC","• Causal mechanism: NOT INFERRED","• Trading action: ABSTAIN / SHADOW_ONLY",`availableAt: ${new Date(availableAt).toISOString()}`);
  return lines.join("\n");
}

async function showStructure(chatId, symbol) {
  const frames=["4h","1h","15m","5m"];
  const availableAt=Date.now();
  const fetched=await Promise.all(frames.map(tf => fetchKlines(symbol,tf,220)));
  const byTf={};
  frames.forEach((tf,i) => { byTf[tf]=candlesFromKlines(fetched[i].rows,availableAt); });
  const result=analyzeMultiTimeframe(byTf);
  return tg("sendMessage",{
    chat_id:chatId,
    text:structureText(symbol,result,availableAt),
    reply_markup:structureKeyboard(symbol)
  });
}

function witnessLine(w) {
  const age=Math.max(0,Date.now()-Number(w.publishedAt||w.availableAt||Date.now()));
  return `• ${w.source} ${w.quote}: mid ${priceText(w.mid)} · spread ${fmt(w.spreadBps,2)} bps · imbalance ${fmt(w.imbalance*100,1)}% · age ${Math.round(age/1000)}s`;
}

function witnessSummary(report) {
  const usable=report.witnesses||[];
  const errors=report.witnessErrors||[];
  return [
    `Venues: ${report.venueCount} · external ${report.externalWitnessCount}`,
    `Agreement: ${pct01(report.agreementScore)}% · flow ${pct01(report.flowAgreement)}% · liquidity ${pct01(report.liquidityAgreement)}%`,
    `Same-quote price agreement: ${pct01(report.sameQuotePriceAgreement)}%`,
    `Independent witness gate: ${report.independentWitnessSatisfied?"SATISFIED":"NOT SATISFIED"}`,
    `Source independence: ${report.sourceIndependence}`,
    "",
    "VENUE SNAPSHOTS",
    witnessLine(report.primary),
    ...usable.map(witnessLine),
    ...(errors.length?["","Unavailable: "+errors.map(e=>`${e.source}(${e.error})`).join(" · ")]:[]),
    ...(report.contradictions?.length?["","Contradictions/caveats: "+report.contradictions.join(", ")]:[])
  ].join("\n");
}

async function showWitness(chatId,symbol) {
  const primary=await snapshot(symbol);
  const report=await witnessState(symbol,primary,{maxAgeMs:2000});
  const text=[
    `🛰 TCX Independent Witness Network · ${symbol.replace("USDT","/USDT")}`,
    "",
    witnessSummary(report),
    "",
    "EPISTEMIC STATUS",
    "• Binance / OKX / Kraken: independent venue observations",
    "• Cross-venue agreement: evidence audit, not causality",
    "• USD vs USDT: quote-basis caveat where Kraken is used",
    "• Mechanism: NOT_IDENTIFIED",
    "• Action: ABSTAIN / SHADOW_ONLY"
  ].join("\n");
  return tg("sendMessage",{chat_id:chatId,text:text.slice(0,4096),reply_markup:memoryKeyboard(symbol)});
}

async function showAudit(chatId) {
  const verification=verifyLedgerRecords(auditLedger.records);
  const tail=ledgerTailSummary(auditLedger);
  const last=auditLedger.records.at(-1);
  const replay=last?.kind==='TCX_RESEARCH_ENVELOPE'?replayEnvelopeIntegrity(last.payload):null;
  const text=[
    '🛡 TCX Institutional Kernel',
    '',
    `Kernel: ${INSTITUTIONAL_KERNEL_VERSION}`,
    `Ledger health: ${auditLedger.healthy&&verification.ok?'HEALTHY':'UNHEALTHY / SAFE_STOP'}`,
    `Records: ${tail.seq}`,
    `Tail hash: ${tail.tailHash.slice(0,20)}…`,
    `File: ${tail.filePath}`,
    '',
    `Chain verification: ${verification.ok?'PASS':'FAIL '+(verification.error||'UNKNOWN')}`,
    replay?`Last envelope replay integrity: ${replay.ok?'PASS':'FAIL'}`:'Last envelope replay integrity: n/a',
    last?`Last record: #${last.seq} · ${last.kind}`:'Last record: none',
    last?.payload?.symbol?`Last symbol: ${last.payload.symbol}`:'',
    last?.payload?.safety?.state?`Last safety state: ${last.payload.safety.state}`:'',
    '',
    'INVARIANTS',
    '• Execution path: DISABLED',
    '• canExecute: FALSE',
    '• Mode: SHADOW_ONLY',
    '• Ledger corruption => SAFE_STOP',
    '• Invalid/stale primary data => SAFE_STOP'
  ].filter(Boolean).join('\n');
  return tg('sendMessage',{chat_id:chatId,text:text.slice(0,4096)});
}

function parseReplayTime(raw) {
  if(!raw) return Date.now();
  const n=Number(raw);
  if(Number.isFinite(n) && n>0) return n;
  const t=Date.parse(raw);
  return Number.isFinite(t)?t:null;
}

async function showRelease(chatId) {
  const verification=verifyReleaseRegistry(releaseRegistry.records);
  const s=releaseRegistrySummary(releaseRegistry,runtimeManifest);
  const text=[
    '🧬 TCX Runtime Release Registry',
    '',
    `Registry: ${RELEASE_REGISTRY_VERSION}`,
    `Health: ${releaseRegistry.healthy&&verification.ok?'HEALTHY':'UNHEALTHY / SAFE_STOP'}`,
    `Releases: ${s.releases} · seq ${s.seq}`,
    `Tail hash: ${s.tailHash.slice(0,20)}…`,
    `Current registered: ${s.currentRegistered?'YES':'NO'}`,
    `Current release: ${s.currentReleaseId?s.currentReleaseId.slice(0,20)+'…':'UNAVAILABLE'}`,
    `Registry record: ${s.currentRegistrySeq??'n/a'}`,
    '',
    runtimeManifest?`Package: ${runtimeManifest.package.name} ${runtimeManifest.package.version}`:'Package: unavailable',
    runtimeManifest?`Node: ${runtimeManifest.runtime.node} · ${runtimeManifest.runtime.platform}/${runtimeManifest.runtime.arch}`:'Runtime: unavailable',
    runtimeManifest?`Config hash: ${runtimeManifest.configHash.slice(0,20)}…`:'Config hash: unavailable',
    runtimeManifest?`Components hashed: ${Object.keys(runtimeManifest.componentHashes||{}).length}`:'Components hashed: 0',
    '',
    `Chain verification: ${verification.ok?'PASS':'FAIL '+(verification.error||'UNKNOWN')}`,
    'Secrets werden nicht in die Release Registry aufgenommen.',
    'Execution: SHADOW_ONLY'
  ].join('\n');
  return tg('sendMessage',{chat_id:chatId,text:text.slice(0,4096)});
}

function fmtMetric(v,d=0) {
  return Number.isFinite(Number(v))?fmt(Number(v),d):'n/a';
}

async function showObservability(chatId) {
  const s=observabilitySnapshot(observability);
  const slo=deriveSloHealth(s);
  const providers=Object.entries(s.providers);
  const text=[
    '📡 TCX Institutional Observability',
    '',
    `Version: ${OBSERVABILITY_VERSION}`,
    `Uptime: ${fmtMetric(s.uptimeMs/1000,0)}s`,
    `Safety: ${s.safety.current}`,
    `SLO: ${slo.ok?'PASS':'BREACH'}`,
    ...(slo.breaches.length?[`Breaches: ${slo.breaches.join(', ')}`]:[]),
    '',
    'PROVIDERS',
    ...(providers.length?providers.map(([name,p])=>
      `• ${name}: ${p.calls} calls · success ${p.successRate==null?'n/a':fmtMetric(p.successRate*100,1)+'%'} · p95 ${fmtMetric(p.latency.p95Ms,0)}ms`
    ):['• no samples yet']),
    '',
    'RESEARCH TELEMETRY',
    `• evidence mean: ${fmtMetric((s.research.evidence.mean??NaN)*100,1)}%`,
    `• novelty p95: ${fmtMetric((s.research.novelty.p95??NaN)*100,1)}%`,
    `• contradiction p95: ${fmtMetric((s.research.contradiction.p95??NaN)*100,1)}%`,
    `• witness agreement mean: ${fmtMetric((s.research.witnessAgreement.mean??NaN)*100,1)}%`,
    `• primary age p95: ${fmtMetric(s.research.primaryAgeMs.p95,0)}ms`,
    '',
    `Safety transitions: ${s.safety.transitions.length}`,
    `Recent errors: ${s.recentErrors.length}`,
    'Execution: SHADOW_ONLY'
  ].join('\n');
  return tg('sendMessage',{chat_id:chatId,text:text.slice(0,4096)});
}

async function showChaos(chatId,scenario=null) {
  const started=Date.now();
  let report;
  if(scenario){
    const name=String(scenario).toUpperCase();
    if(!chaosScenarioNames().includes(name)){
      const names=chaosScenarioNames().join(', ');
      await tg('sendMessage',{chat_id:chatId,text:`Unbekanntes Chaos-Szenario. Verfügbar: ${names}`.slice(0,4096)});
      return;
    }
    const r=runChaosScenario(name);
    report={
      version:CHAOS_ENGINEERING_VERSION,
      mode:'SYNTHETIC_SIDE_EFFECT_FREE',
      total:1,
      passed:r.pass?1:0,
      failed:r.pass?0:1,
      passRate:r.pass?1:0,
      executionInvariant:r.invariantOk,
      results:[r]
    };
  } else {
    report=runChaosSuite();
  }
  recordOperation(observability,{
    name:'chaos_suite',
    ok:report.failed===0,
    latencyMs:Date.now()-started,
    error:report.failed?String(report.failed)+' failed':null
  });
  if(auditLedger.healthy) await appendInstitutionalAudit('TCX_CHAOS_REPORT',report);
  const text=[
    '🧨 TCX Chaos Engineering',
    '',
    `Version: ${report.version}`,
    `Mode: ${report.mode}`,
    `Result: ${report.passed}/${report.total} PASS`,
    `Execution invariant: ${report.executionInvariant?'PASS':'FAIL'}`,
    '',
    ...report.results.map(r=>
      `${r.pass?'PASS':'FAIL'} · ${r.name}: expected ${r.expectedState} / actual ${r.actualState} · execute=${r.canExecute?'YES':'NO'}`
    ),
    '',
    'Keine echten Provider, Orders, Fabric-Events oder Marktstates werden manipuliert.',
    'Execution: SHADOW_ONLY'
  ].join('\n');
  return tg('sendMessage',{chat_id:chatId,text:text.slice(0,4096)});
}
function shadowOrderLine(order) {
  const s=shadowOrderSummary(order);
  const fill=`${fmt(Number(s.fillRatio||0)*100,1)}%`;
  const px=s.avgFillPrice?priceText(s.avgFillPrice):'—';
  return `${s.id} · ${s.symbol.replace('USDT','/USDT')} · ${s.side} ${s.type} · ${s.status} · fill ${fill} · avg ${px}`;
}

function shadowOrderDetail(order) {
  const s=shadowOrderSummary(order);
  const lines=[
    `🧾 TCX Shadow Order · ${s.symbol.replace('USDT','/USDT')}`,
    '',
    `ID: ${s.id}`,
    `Intent: ${s.side} ${s.type} · ${fmt(s.notionalQuote,2)} USDT`,
    ...(s.limitPrice?[`Limit: ${priceText(s.limitPrice)}`]:[]),
    `Status: ${s.status}`,
    `Fill: ${fmt(s.fillRatio*100,1)}% · avg ${s.avgFillPrice?priceText(s.avgFillPrice):'—'}`,
    `Slippage vs arrival mid: ${Number.isFinite(s.slippageBps)?fmt(s.slippageBps,2)+' bps':'—'}`,
    `Latency move: ${Number.isFinite(s.latencyMoveBps)?fmt(s.latencyMoveBps,2)+' bps':'—'}`,
    `Fees (assumption): ${fmt(s.feesQuote,4)} USDT`,
    ...(s.queueAheadBase!=null?[`Queue ahead proxy: ${fmt(s.queueAheadBase,8)} base · uncertainty ${order.queue?.uncertainty||'UNKNOWN'}`]:[]),
    ...(order.depthExhausted?[`Visible L2 depth exhausted: YES · remaining intent was NOT fabricated as filled.`]:[]),
    `Data quality: ${s.dataQuality}`,
    '',
    'MARKOUT / ADVERSE SELECTION',
    ...['60000','300000','900000'].map(k=>{
      const m=s.markouts?.[k];
      const label=k==='60000'?'1m':k==='300000'?'5m':'15m';
      return m?`• ${label}: signed ${fmt(m.signedMarkoutBps,2)} bps · adverse ${fmt(m.adverseSelectionBps,2)} bps`:`• ${label}: pending`;
    }),
    '',
    'Execution adapter: NONE',
    'Exchange order ID: NONE',
    'Mode: SHADOW_ONLY'
  ];
  return lines.join('\n').slice(0,4096);
}

async function showOms(chatId) {
  const counts={};
  for(const o of shadowOrders) counts[o.status]=(counts[o.status]||0)+1;
  const active=shadowOrders.filter(o=>['ACTIVE','PARTIALLY_FILLED'].includes(o.status)).length;
  const text=[
    '🧾 TCX Shadow OMS + Microstructure Simulator',
    '',
    `Version: ${SHADOW_OMS_VERSION}`,
    `Health: ${shadowOmsHealthy?'HEALTHY':'UNHEALTHY / OMS DISABLED'}`,
    `Orders: ${shadowOrders.length} · active ${active}`,
    `Filled: ${counts.FILLED||0} · partial ${counts.PARTIALLY_FILLED||0} · cancelled ${counts.CANCELLED||0}`,
    '',
    'ASSUMPTIONS',
    `• default latency: ${shadowDefaultLatencyMs}ms`,
    `• maker fee: ${shadowMakerFeeBps} bps`,
    `• taker fee: ${shadowTakerFeeBps} bps`,
    `• hidden queue buffer: ${fmt(shadowHiddenQueueBufferPct*100,1)}%`,
    `• watcher: ${Math.round(shadowWatchMs/1000)}s`,
    '',
    'CAPABILITIES',
    `• canExecuteLive: ${SHADOW_OMS_CAPABILITIES.canExecuteLive?'YES':'NO'}`,
    `• exchangeOrderAdapter: ${SHADOW_OMS_CAPABILITIES.exchangeOrderAdapter?'YES':'NO'}`,
    `• networkOrderSubmission: ${SHADOW_OMS_CAPABILITIES.networkOrderSubmission?'YES':'NO'}`,
    '',
    'Market/marketable limit: observed L2 walk.',
    'Passive limit: price-time queue proxy + observed aggTrades.',
    'No real order submission exists in this runtime.'
  ].join('\n');
  return tg('sendMessage',{chat_id:chatId,text:text.slice(0,4096)});
}

function sorLegLine(leg,totalBase){
  const share=totalBase>0?leg.baseQty/totalBase:0;
  const tox=leg.toxicityPenaltyBps>0?` · tox ${fmt(leg.toxicityPenaltyBps,2)}bps`:' · tox n/a';
  return `• ${leg.venue}: ${fmt(share*100,1)}% · avg ${priceText(leg.avgPrice)} · fee ${fmt(leg.feeQuote,4)} · latency ${Number.isFinite(leg.latencyMs)?Math.round(leg.latencyMs)+'ms':'n/a'}${tox}`;
}

async function sorLearningContext(symbol){
  try {
    const ctx=await researchAlertContext(symbol);
    const pressure=Number(ctx.state?.pressure);
    return {
      regime:String(ctx.state?.regime||'UNKNOWN'),
      liquidity:String(ctx.state?.liquidity||'UNKNOWN'),
      pressureBand:Number.isFinite(pressure)?(pressure>=65?'HIGH':pressure>=35?'MEDIUM':'LOW'):'UNKNOWN'
    };
  } catch(err) {
    recordError(observability,{scope:'venue_quality.context',message:err instanceof Error?err.message:String(err)});
    return {regime:'UNKNOWN',liquidity:'UNKNOWN',pressureBand:'UNKNOWN'};
  }
}

function enrichSorBooksWithVenueQuality(books,{symbol,side,notionalQuote,regime,liquidity}){
  if(!venueQualityHealthy) return books.map(b=>({...b,toxicityBps:0,toxicityEvidenceN:0,vqmEstimate:null}));
  return books.map(book=>{
    const estimate=estimateVenueQuality(venueQualityRecords,{
      venue:book.venue,symbol,side,notionalQuote,regime,liquidity
    },{
      minSamples:vqmMinSamples,
      minToxicitySamples:vqmMinToxicitySamples,
      halfLifeDays:vqmHalfLifeDays,
      now:Date.now()
    });
    return {...book,toxicityBps:estimate.toxicityBps,toxicityEvidenceN:estimate.toxicityEvidenceN,vqmEstimate:estimate};
  });
}

function fmtMaybe(v,d=2,suffix=''){
  return Number.isFinite(Number(v))?fmt(Number(v),d)+suffix:'n/a';
}

async function showVenueQuality(chatId,{symbol,side='BUY',notionalQuote=1000}){
  const context=await sorLearningContext(symbol);
  const summary=venueQualitySummary(venueQualityRecords,{symbol});
  const venues=[...new Set(['BINANCE','OKX','KRAKEN',...Object.keys(summary.byVenue||{})])];
  const lines=[
    `🧠 TCX Venue Quality Memory · ${symbol.replace('USDT','/USDT')}`,
    '',
    `Version: ${VENUE_QUALITY_MEMORY_VERSION}`,
    `Health: ${venueQualityHealthy?'HEALTHY':'UNHEALTHY / LEARNING DISABLED'}`,
    `Context: ${side} · ${fmt(notionalQuote,2)} USDT · ${context.regime} · ${context.liquidity}`,
    `Records: ${summary.total}`,
    '',
    'VENUE MEMORY'
  ];
  for(const venue of venues){
    const e=estimateVenueQuality(venueQualityRecords,{venue,symbol,side,notionalQuote,regime:context.regime,liquidity:context.liquidity},{
      minSamples:vqmMinSamples,minToxicitySamples:vqmMinToxicitySamples,halfLifeDays:vqmHalfLifeDays,now:Date.now()
    });
    lines.push(`• ${venue}: scope ${e.scope} · n=${e.sampleN} · fill ${fmtMaybe((e.fillRatioMean??NaN)*100,1,'%')} · slip ${fmtMaybe(e.slippageBpsMean,2,'bps')} · all-in ${fmtMaybe(e.allInBpsMean,2,'bps')} · latency ${fmtMaybe(e.latencyMsMean,0,'ms')}`);
    lines.push(`  adverse 5m ${fmtMaybe(e.adverseSelection5mBps,2,'bps')} · toxicity ${fmtMaybe(e.toxicityBps,2,'bps')} · ${e.toxicityStatus}`);
  }
  lines.push(
    '',
    'Memory ist empirische Shadow-Execution-Evidenz, keine kausale Wahrheit.',
    `canExecuteLive: ${VENUE_QUALITY_MEMORY_CAPABILITIES.canExecuteLive?'YES':'NO'} · SHADOW_ONLY`
  );
  return tg('sendMessage',{chat_id:chatId,text:lines.join('\n').slice(0,4096)});
}

async function showExecutionResearch(chatId,{symbol,side=null,regime=null}){
  const started=Date.now();
  const report=executionResearchReport(venueQualityRecords,{symbol,side,regime,now:Date.now()});
  const ins=report.inSample;
  const oos=report.oos;
  const wf=report.walkForward;
  const cal=report.calibration;
  const drift=report.drift;
  const regimeSegments=(report.segments?.REGIME||[]).slice(0,4);
  const edge=ins?.edgeVsBestSingle||{};
  const oosEdge=oos?.test?.edgeVsBestSingle||{};
  const auditPayload={
    ...report,
    runtimeReleaseId:runtimeManifest?.releaseId||null,
    capabilities:EXECUTION_RESEARCH_CAPABILITIES
  };
  const auditRecord=auditLedger.healthy
    ? await appendInstitutionalAudit('TCX_EXECUTION_RESEARCH_REPORT',auditPayload)
    : null;
  recordOperation(observability,{
    name:'execution_research_lab',
    ok:true,
    latencyMs:Date.now()-started
  });

  const lines=[
    `🧪 TCX Execution Research Lab · ${symbol.replace('USDT','/USDT')}`,
    '',
    `Version: ${EXECUTION_RESEARCH_LAB_VERSION}`,
    `Filter: ${side||'ALL SIDES'}${regime?' · '+regime:''}`,
    `Routes: ${report.sampleRoutes} · venue observations: ${report.venueObservations}`,
    '',
    'POLICY vs BEST SINGLE-VENUE COUNTERFACTUAL',
    `• comparable n: ${ins?.comparableN||0}`,
    `• mean edge: ${fmtMaybe(edge.mean,2,'bps')}`,
    `• 95% interval: ${fmtMaybe(edge.lo,2,'')} .. ${fmtMaybe(edge.hi,2,'bps')}`,
    `• positive-edge share: ${fmtMaybe((ins?.positiveEdgeRate??NaN)*100,1,'%')}`,
    `• policy fill mean: ${fmtMaybe((ins?.policyFillRatio?.mean??NaN)*100,1,'%')}`,
    '',
    'TEMPORAL OOS',
    `• status: ${oos?.status||'UNKNOWN'}`,
    ...(oos?.status==='OOS_AVAILABLE'?[
      `• train/test: ${oos.train?.n||0}/${oos.test?.n||0}`,
      `• test edge: ${fmtMaybe(oosEdge.mean,2,'bps')} · CI ${fmtMaybe(oosEdge.lo,2,'')}..${fmtMaybe(oosEdge.hi,2,'bps')}`,
      `• generalization gap: ${fmtMaybe(oos.generalizationGapBps,2,'bps')}`,
      `• OOS status: ${oos.oosPolicyEdgeStatus}`
    ]:[]),
    '',
    'WALK-FORWARD',
    `• status: ${wf?.status||'UNKNOWN'} · folds ${wf?.folds||0}`,
    `• fold edge mean: ${fmtMaybe(wf?.foldEdge?.mean,2,'bps')}`,
    `• positive folds: ${fmtMaybe((wf?.positiveFoldRate??NaN)*100,1,'%')}`,
    `• worst fold: ${fmtMaybe(wf?.worstFoldEdgeBps,2,'bps')}`,
    '',
    'TOXICITY CALIBRATION',
    `• status: ${cal?.status||'UNKNOWN'} · n=${cal?.n||0}`,
    `• MAE: ${fmtMaybe(cal?.maeBps,2,'bps')} · bias ${fmtMaybe(cal?.biasBps,2,'bps')}`,
    `• correlation: ${fmtMaybe(cal?.correlation,3,'')}`,
    '',
    'DRIFT',
    `• status: ${drift?.status||'UNKNOWN'} · recent/reference ${drift?.recentN||0}/${drift?.referenceN||0}`,
    ...(drift?.signals?.length?drift.signals.map(s=>`• ${s.metric}: deterioration ${fmtMaybe(s.deterioration,3,'')}`):['• no active drift signal']),
    ...(regimeSegments.length?[
      '',
      'REGIME BREAKDOWN',
      ...regimeSegments.map(s=>`• ${s.segment}: n=${s.n} · edge ${fmtMaybe(s.edgeMeanBps,2,'bps')} · fill ${fmtMaybe((s.fillRatioMean??NaN)*100,1,'%')}`)
    ]:[]),
    '',
    `Audit: ${auditRecord?'#'+auditRecord.seq:'NOT WRITTEN'}`,
    'Objective: execution quality, not PnL.',
    'Inference: DESCRIPTIVE OOS EVALUATION · NOT CAUSAL',
    'Action: ABSTAIN · Execution: SHADOW_ONLY'
  ];
  return tg('sendMessage',{chat_id:chatId,text:lines.join('\n').slice(0,4096)});
}

async function showSorStatus(chatId,symbol='BTCUSDT'){
  const {books,errors,capturedAt}=await fetchSorVenueBooks(symbol);
  const quality=summarizeVenueQuality(books,{routeQuote:'USDT',asOf:capturedAt,maxAgeMs:sorMaxBookAgeMs});
  const text=[
    `🧭 TCX Shadow SOR Status · ${symbol.replace('USDT','/USDT')}`,
    '',
    `Version: ${SHADOW_SOR_VERSION}`,
    `Captured: ${new Date(capturedAt).toISOString()}`,
    '',
    'VENUES',
    ...quality.map(v=>
      `• ${v.venue} ${v.quote}: ${v.eligible?'ROUTABLE':'EXCLUDED'} · spread ${fmt(v.spreadBps,2)}bps · fee ${fmt(v.feeBps,2)}bps · latency ${Number.isFinite(v.fetchLatencyMs)?Math.round(v.fetchLatencyMs)+'ms':'n/a'} · askDepth ${fmt(v.askDepthQuote,0)} ${v.quote}${v.exclusionReasons.length?' · '+v.exclusionReasons.join(', '):''}`
    ),
    ...(errors.length?['','UNAVAILABLE',...errors.map(e=>`• ${e.venue}: ${e.error}`)]:[]),
    '',
    'TOXICITY',
    ...quality.map(v=>`• ${v.venue}: ${v.toxicityStatus} · n=${v.toxicityEvidenceN}`),
    '',
    `canExecuteLive: ${SHADOW_SOR_CAPABILITIES.canExecuteLive?'YES':'NO'}`,
    `networkOrderSubmission: ${SHADOW_SOR_CAPABILITIES.networkOrderSubmission?'YES':'NO'}`,
    'Mode: SHADOW_ONLY'
  ].join('\n');
  return tg('sendMessage',{chat_id:chatId,text:text.slice(0,4096)});
}

async function showSorRoute(chatId,{symbol,side,notionalQuote}){
  const started=Date.now();
  const context=await sorLearningContext(symbol);
  const {books,errors,capturedAt}=await fetchSorVenueBooks(symbol);
  if(!books.length) throw new Error('No SOR venue books available');
  const learnedBooks=enrichSorBooksWithVenueQuality(books,{
    symbol,side,notionalQuote,regime:context.regime,liquidity:context.liquidity
  });
  const report=buildShadowSmartRoute({side,notionalQuote},learnedBooks,{
    routeQuote:'USDT',
    asOf:capturedAt,
    maxAgeMs:sorMaxBookAgeMs,
    minToxicityEvidenceN:vqmMinToxicitySamples
  });
  const r=report.route;
  const excluded=[...r.excluded];
  for(const e of errors) excluded.push({venue:e.venue,quote:'UNKNOWN',reasons:['UNAVAILABLE'],error:e.error});

  let vqmAdded=0;
  let vqmObservationIds=[];
  if(venueQualityHealthy){
    const observations=createVenueQualityObservations({
      report,
      symbol,
      regime:context.regime,
      liquidity:context.liquidity,
      pressureBand:context.pressureBand,
      capturedAt
    });
    const appended=appendVenueQualityObservations(venueQualityRecords,observations,{maxRecords:50000});
    venueQualityRecords=appended.records;
    vqmAdded=appended.added;
    vqmObservationIds=observations.map(x=>x.id);
    if(vqmAdded>0) await persistVenueQualityMemory('sor-observations');
  }

  const auditPayload={
    ...report,
    symbol,
    executionContext:context,
    venueErrors:errors,
    venueQualityMemory:{
      version:VENUE_QUALITY_MEMORY_VERSION,
      healthy:venueQualityHealthy,
      observationsAdded:vqmAdded,
      observationIds:vqmObservationIds
    },
    runtimeReleaseId:runtimeManifest?.releaseId||null,
    capabilities:SHADOW_SOR_CAPABILITIES
  };
  const auditRecord=auditLedger.healthy?await appendInstitutionalAudit('TCX_SHADOW_SOR_REPORT',auditPayload):null;
  recordOperation(observability,{name:'shadow_sor.route',ok:r.fillRatio>0,latencyMs:Date.now()-started,error:r.fillRatio>0?null:'NO_FILL'});
  const improvement=Number.isFinite(report.improvementBps)
    ? `${fmt(report.improvementBps,2)} bps (${fmt(report.improvementQuote,4)} USDT)`
    : 'n/a';
  const text=[
    `🧭 TCX Multi-Venue Shadow SOR · ${symbol.replace('USDT','/USDT')}`,
    '',
    `Intent: ${side} · ${fmt(notionalQuote,2)} USDT`,
    `Fill: ${fmt(r.fillRatio*100,1)}%${r.depthExhausted?' · DEPTH EXHAUSTED':''}`,
    `Reference mid: ${priceText(r.referenceMid)}`,
    `Avg fill: ${priceText(r.avgFillPrice)}`,
    `Slippage: ${Number.isFinite(r.slippageBps)?fmt(r.slippageBps,2)+' bps':'n/a'}`,
    `Fees: ${fmt(r.feesQuote,4)} USDT`,
    `All-in: ${Number.isFinite(r.allInBps)?fmt(r.allInBps,2)+' bps':'n/a'}`,
    `vs best single-venue counterfactual: ${improvement}`,
    `Context: ${context.regime} · ${context.liquidity} · pressure ${context.pressureBand}`,
    `VQM: ${venueQualityHealthy?'ACTIVE':'DISABLED'} · +${vqmAdded} observations`,
    '',
    'ROUTE',
    ...(r.legs.length?r.legs.map(x=>sorLegLine(x,r.filledBase)):['• no fill']),
    '',
    `Fragmentation: ${r.fragmentation.venueCountUsed} venues · HHI ${Number.isFinite(r.fragmentation.hhi)?fmt(r.fragmentation.hhi,3):'n/a'} · effective ${Number.isFinite(r.fragmentation.effectiveVenues)?fmt(r.fragmentation.effectiveVenues,2):'n/a'}`,
    ...(excluded.length?['','EXCLUDED / UNAVAILABLE',...excluded.map(x=>`• ${x.venue} ${x.quote||''}: ${(x.reasons||[]).join(', ')}${x.error?' · '+x.error:''}`)]:[]),
    '',
    'EPISTEMIC STATUS',
    `• Books: ${report.epistemic.books}`,
    `• Fees: ${report.epistemic.fees}`,
    `• Toxicity: ${report.epistemic.toxicity}`,
    `• Route: ${report.epistemic.route}`,
    `• Route hash: ${report.routeHash.slice(0,20)}…`,
    `• Audit: ${auditRecord?'#'+auditRecord.seq:'NOT WRITTEN'}`,
    '',
    'No authenticated exchange order endpoint exists.',
    'Execution: SHADOW_ONLY · canExecuteLive: NO'
  ].join('\n');
  return tg('sendMessage',{chat_id:chatId,text:text.slice(0,4096)});
}

async function showShadowOrders(chatId,symbol=null) {
  const xs=shadowOrders
    .filter(o=>!symbol||o.symbol===symbol)
    .slice(-12)
    .reverse();
  const text=xs.length
    ? ['🧾 TCX Shadow Orders','',...xs.map(shadowOrderLine),'','Nutze /shadowcancel ORDER_ID für aktive virtuelle Orders.','Mode: SHADOW_ONLY'].join('\n')
    : '🧾 Keine passenden Shadow-Orders vorhanden.';
  return tg('sendMessage',{chat_id:chatId,text:text.slice(0,4096)});
}

async function showPlacedShadowOrder(chatId,order) {
  return tg('sendMessage',{chat_id:chatId,text:shadowOrderDetail(order)});
}

async function showFabric(chatId) {
  const verification=verifyMarketEventChain(marketFabric.events);
  const s=marketFabricSummary(marketFabric);
  const text=[
    '🧱 TCX Market Data Fabric',
    '',
    `Version: ${MARKET_DATA_FABRIC_VERSION}`,
    `Health: ${marketFabric.healthy&&verification.ok?'HEALTHY':'UNHEALTHY / SAFE_STOP'}`,
    `Events: ${s.eventCount} · seq ${s.seq}`,
    `Tail hash: ${s.tailHash.slice(0,20)}…`,
    `File: ${s.filePath}`,
    '',
    `PRIMARY_MARKET: ${s.counts.PRIMARY_MARKET||0}`,
    `WITNESS_CONSENSUS: ${s.counts.WITNESS_CONSENSUS||0}`,
    `CANDLE_CLOSE: ${s.counts.CANDLE_CLOSE||0}`,
    '',
    `Chain verification: ${verification.ok?'PASS':'FAIL '+(verification.error||'UNKNOWN')}`,
    'Backfill rule: availableAt = tatsächliche TCX-Ingestion, nicht historischer Candle-Close.',
    'Execution: SHADOW_ONLY'
  ].join('\n');
  return tg('sendMessage',{chat_id:chatId,text:text.slice(0,4096)});
}

function recentReplayPoints(symbol,{limit=8}={}) {
  const rows=(marketFabric.events||[])
    .filter(e=>
      e?.kind==='PRIMARY_MARKET' &&
      String(e?.payload?.symbol||'').toUpperCase()===String(symbol).toUpperCase() &&
      Number.isFinite(Number(e?.availableAt))
    )
    .sort((a,b)=>Number(b.availableAt)-Number(a.availableAt));
  const out=[];
  const seen=new Set();
  for(const e of rows){
    const at=Number(e.availableAt);
    const bucket=Math.floor(at/60000);
    if(seen.has(bucket)) continue;
    seen.add(bucket);
    out.push(at);
    if(out.length>=limit) break;
  }
  return out;
}

function replayMenuKeyboard(symbol,points) {
  const rows=[];
  for(let i=0;i<points.length;i+=2){
    rows.push(points.slice(i,i+2).map(at=>{
      const label=new Intl.DateTimeFormat('de-DE',{
        timeZone:'Europe/Berlin',
        hour:'2-digit',
        minute:'2-digit',
        second:'2-digit'
      }).format(new Date(at));
      return {
        text:'⏪ '+label,
        callback_data:'replayat:'+symbol+':'+Math.floor(at/1000)
      };
    }));
  }
  rows.push([
    {text:'📊 Markt',callback_data:'refresh:'+symbol},
    {text:'🏠 Home',callback_data:'home'}
  ]);
  return {inline_keyboard:rows};
}

async function showReplayMenu(chatId,messageId,symbol) {
  const points=recentReplayPoints(symbol,{limit:8});
  const text=points.length
    ? [
        '🎬 TCX REPLAY · '+symbol.replace('USDT','/USDT'),'',
        'Wähle einen gespeicherten Point-in-Time-Zustand.',
        'Der Replay rekonstruiert nur Informationen, die zu diesem Zeitpunkt bereits verfügbar waren.','',
        'Verfügbare Punkte: '+points.length,
        'Future leakage guard: aktiv',
        'Execution: SHADOW_ONLY'
      ].join('\n')
    : [
        '🎬 TCX REPLAY · '+symbol.replace('USDT','/USDT'),'',
        'Noch keine PRIMARY_MARKET-Punkte im Market Data Fabric.',
        'Research-Läufe erzeugen die Replay-Basis automatisch.',
        'Execution: SHADOW_ONLY'
      ].join('\n');
  const payload={chat_id:chatId,text,reply_markup:replayMenuKeyboard(symbol,points)};
  if(messageId) return tg('editMessageText',{...payload,message_id:messageId});
  return tg('sendMessage',payload);
}

async function showReplay(chatId,symbol,asOf,messageId=null) {
  const state=reconstructInstitutionalState(marketFabric.events,{symbol,asOf});
  const s=replaySummary(state);
  const primary=state.primary;
  const witness=state.witness;
  const text=[
    '⏪ TCX Deterministic Replay · '+symbol.replace('USDT','/USDT'),
    '',
    'Replay: '+DETERMINISTIC_REPLAY_VERSION,
    'asOf: '+new Date(asOf).toISOString(),
    'Hash: '+s.replayHash.slice(0,20)+'…',
    'Future leakage: '+(s.leakage.ok?'PASS':'FAIL '+s.leakage.violations.join(', ')),
    '',
    'Primary: '+(primary?(priceText(primary.price)+' · '+(primary.source||'UNKNOWN')):'not available'),
    'Witness: '+(witness?(fmt(Number(witness.agreementScore||0)*100,0)+'% agreement · external '+(witness.externalWitnessCount||0)):'not available'),
    '',
    'CANDLES KNOWN AT asOf',
    ...Object.entries(s.candleCounts).map(([tf,n])=>'• '+tf+': '+n),
    '',
    'Replay nutzt ausschließlich Events mit event.availableAt <= asOf.',
    'Action: ABSTAIN / SHADOW_ONLY'
  ].join('\n');
  const payload={
    chat_id:chatId,
    text:text.slice(0,4096),
    reply_markup:{inline_keyboard:[
      [{text:'🎬 Andere Zeit',callback_data:'replaymenu:'+symbol}],
      [{text:'📊 Markt',callback_data:'refresh:'+symbol},{text:'🏠 Home',callback_data:'home'}]
    ]}
  };
  if(messageId) return tg('editMessageText',{...payload,message_id:messageId});
  return tg('sendMessage',payload);
}

function pct01(x){ return fmt(Number(x)*100,0); }

function transitionLine(label,lattice){
  if(!lattice.sufficient){
    return `${label}: n=${lattice.support} · insufficient evidence · novelty ${pct01(lattice.novelty)}%`;
  }
  const top=lattice.states[0];
  const topText=top?`${top.state.replaceAll("|"," → ")} · ${fmt(top.share*100,0)}%`:"—";
  return `${label}: n=${lattice.support} · coherence ${pct01(lattice.transitionCoherence)}% · entropy ${pct01(lattice.transitionEntropy)}% · top ${topText}`;
}

async function buildInstitutionalResearchContext(symbol,{auditEnvelope=true}={}){
  const state=await researchState(symbol,"5m");
  await captureEpisodeFromState(state,{persist:false});
  if(matureSymbolEpisodes(symbol,state.byTf["5m"],state.availableAt)) {
    await persistEpisodeMemory("institutional-context-maturity");
  }

  const witnessReport=await witnessState(symbol,state.market,{maxAgeMs:3000});
  const contextAvailableAt=Math.max(
    Number(state.availableAt)||0,
    Number(witnessReport?.primary?.availableAt)||0,
    ...(witnessReport?.witnesses||[]).map(w=>Number(w?.availableAt)||0)
  );
  const r15=runMechanismTransitionEngine({
    analysis:state.memoryAnalysis,dashboard:state.memoryDashboard,episodes,symbol,horizonMinutes:15,witnessReport
  });
  const r60=runMechanismTransitionEngine({
    analysis:state.memoryAnalysis,dashboard:state.memoryDashboard,episodes,symbol,horizonMinutes:60,witnessReport
  });
  const r180=runMechanismTransitionEngine({
    analysis:state.memoryAnalysis,dashboard:state.memoryDashboard,episodes,symbol,horizonMinutes:180,witnessReport
  });

  const fabricWrite=await ingestResearchFabric(state,witnessReport);
  const fabricSummary=marketFabricSummary(marketFabric);
  const marketAudit=auditMarketSnapshot(state.market,{
    now:Date.now(),
    maxAgeMs:institutionalMarketMaxAgeMs
  });
  const witnessAudit=auditWitnessReport(witnessReport);
  const engineAudit=auditEngineResult(r15);

  let safety=determineSafetyState({
    marketAudit,
    witnessAudit,
    engineAudit,
    ledgerHealthy:auditLedger.healthy,
    fabricHealthy:marketFabric.healthy,
    registryHealthy:releaseRegistry.healthy && Boolean(runtimeReleaseRecord)
  });

  const makeEnvelope=()=>buildResearchEnvelope({
    symbol,
    availableAt:contextAvailableAt,
    market:state.market,
    witness:witnessReport,
    engine:r15,
    safety,
    config:institutionalConfig,
    versions:{
      institutionalKernel:INSTITUTIONAL_KERNEL_VERSION,
      mechanismEngine:r15.version,
      episodeMemory:'V3',
      witnessNetwork:'IWN_V1',
      marketDataFabric:MARKET_DATA_FABRIC_VERSION,
      deterministicReplay:DETERMINISTIC_REPLAY_VERSION
    },
    dataFabric:{
      version:MARKET_DATA_FABRIC_VERSION,
      seq:marketFabric.seq,
      tailHash:marketFabric.tailHash,
      healthy:marketFabric.healthy
    },
    runtimeRelease:{
      registryVersion:RELEASE_REGISTRY_VERSION,
      releaseId:runtimeManifest?.releaseId||'UNAVAILABLE',
      registrySeq:runtimeReleaseRecord?.seq??null,
      registryTailHash:releaseRegistry.tailHash,
      registryHealthy:releaseRegistry.healthy
    }
  });

  let envelope=makeEnvelope();
  let auditRecord=null;
  if(auditEnvelope){
    auditRecord=await appendInstitutionalAudit('TCX_RESEARCH_ENVELOPE',envelope);
    if(!auditLedger.healthy){
      safety=determineSafetyState({
        marketAudit,
        witnessAudit,
        engineAudit,
        ledgerHealthy:false,
        fabricHealthy:marketFabric.healthy,
        registryHealthy:releaseRegistry.healthy && Boolean(runtimeReleaseRecord)
      });
      envelope=makeEnvelope();
    }
  }

  return {
    state,witnessReport,r15,r60,r180,
    fabricWrite,fabricSummary,
    marketAudit,witnessAudit,engineAudit,
    safety,envelope,auditRecord
  };
}

async function showEngine(chatId,symbol){
  const engineStarted=Date.now();
  const {
    state,witnessReport,r15,r60,r180,
    fabricWrite,marketAudit,witnessAudit,engineAudit,
    safety,envelope,auditRecord
  }=await buildInstitutionalResearchContext(symbol,{auditEnvelope:true});

  recordSafety(observability,safety.state,{
    hardReasons:safety.hardReasons,
    softReasons:safety.softReasons
  });
  recordResearchTelemetry(observability,{
    evidenceStrength:r15.hypothesis.evidenceStrength,
    novelty:r15.lattice.novelty,
    contradiction:r15.audit.contradictionScore,
    witnessAgreement:witnessReport.agreementScore,
    primaryAgeMs:marketAudit.ageMs
  });
  recordOperation(observability,{
    name:'engine',
    ok:safety.state!=='SAFE_STOP',
    latencyMs:Date.now()-engineStarted,
    error:safety.state==='SAFE_STOP'?safety.hardReasons.join(','):null
  });
  const ch=Object.entries(r15.channels).sort((a,b)=>b[1]-a[1]);
  const strongest=ch[0]||["NONE",0];
  const text=[
    `🧪 TCX Mechanism Transition Lattice · ${symbol.replace("USDT","/USDT")}`,
    "",
    `Candidate channel: ${strongest[0]} · ${pct01(strongest[1])}%`,
    `Gate: ${r15.hypothesis.gate}`,
    `Evidence strength: ${pct01(r15.hypothesis.evidenceStrength)}%`,
    `Modality coverage: ${pct01(r15.audit.modalityCoverage)}%`,
    `Contradiction: ${pct01(r15.audit.contradictionScore)}%`,
    `Independent witness: ${r15.audit.independentWitnessSatisfied?"YES":"NO"} · venues ${witnessReport.venueCount}`,
    `Witness agreement: ${pct01(witnessReport.agreementScore)}% · external ${witnessReport.externalWitnessCount}`,
    "",
    "PRESSURE CHANNELS",
    ...ch.map(([k,v])=>`• ${k}: ${pct01(v)}%`),
    "",
    "TRANSITION LATTICE",
    transitionLine("15m",r15.lattice),
    transitionLine("1h",r60.lattice),
    transitionLine("3h",r180.lattice),
    "",
    `Conflicts: ${r15.audit.conflictFlags.length?r15.audit.conflictFlags.join(", "):"none detected"}`,
    `Source independence: ${r15.audit.sourceIndependence}`,
    `Witness caveats: ${witnessReport.caveats?.join(", ")||"none"}`,
    "",
    "INSTITUTIONAL CONTROL PLANE",
    `Safety state: ${safety.state}`,
    `Primary data: ${marketAudit.ok?"PASS":"FAIL"} · age ${marketAudit.ageMs==null?"n/a":Math.round(marketAudit.ageMs)+"ms"}`,
    `Witness audit: ${witnessAudit.ok?"PASS":"FAIL"} · external ${witnessAudit.externalWitnessCount}`,
    `Engine invariants: ${engineAudit.ok?"PASS":"FAIL"}`,
    `Audit ledger: ${auditLedger.healthy?"HEALTHY":"UNHEALTHY"} · seq ${auditLedger.seq}`,
    `Market Fabric: ${marketFabric.healthy?"HEALTHY":"UNHEALTHY"} · seq ${marketFabric.seq} · +${fabricWrite.appended?.length||0} events`,
    `Fabric tail: ${marketFabric.tailHash.slice(0,16)}…`,
    `Runtime release: ${runtimeManifest?.releaseId?runtimeManifest.releaseId.slice(0,16)+'…':'UNAVAILABLE'}`,
    `Release Registry: ${releaseRegistry.healthy?"HEALTHY":"UNHEALTHY"} · seq ${releaseRegistry.seq}`,
    `Envelope: ${envelope.envelopeHash.slice(0,16)}…`,
    `Audit record: ${auditRecord?"#"+auditRecord.seq:"NOT WRITTEN"}`,
    `canResearch: ${safety.canResearch?"YES":"NO"} · canExecute: NO`,
    ...(safety.hardReasons.length?[`HARD: ${safety.hardReasons.join(", ")}`]:[]),
    ...(safety.softReasons.length?[`DEGRADED: ${safety.softReasons.join(", ")}`]:[]),
    "",
    "STATUS",
    "• Transition evidence: OBSERVATIONAL",
    "• Mechanism channel: HYPOTHESIS",
    "• Causal status: NOT_IDENTIFIED",
    "• Action: ABSTAIN / SHADOW_ONLY"
  ].join("\n");

  return tg("sendMessage",{chat_id:chatId,text:text.slice(0,4096),reply_markup:memoryKeyboard(symbol)});
}


function forecastResearchValidity(evidenceAppend){
  const validity=evidenceAppend?.validity;
  if(!validity){
    return {
      status:'BASELINE',
      reasons:['CURRENT_PIT_BASELINE_NO_PRIOR_DRIFT_COMPARISON']
    };
  }
  return {
    status:String(validity.status||'UNKNOWN'),
    reasons:formatValidityReason(validity,{limit:5})
  };
}

async function showForecast(chatId,symbol,messageId=null){
  const started=Date.now();
  if(!forecastRuntime.healthy){
    return tg('sendMessage',{
      chat_id:chatId,
      text:[
        '🔮 TCX Forecast Intelligence · '+symbol.replace('USDT','/USDT'),
        '',
        'Runtime: UNHEALTHY',
        'Forecast-Ausgabe fail-closed.',
        'Action: ABSTAIN / SHADOW_ONLY'
      ].join('\n')
    });
  }

  const ctx=await buildInstitutionalResearchContext(symbol,{auditEnvelope:true});
  const {
    state,witnessReport,r15,
    marketAudit,witnessAudit,engineAudit,safety,envelope
  }=ctx;

  const seed=seedInstitutionalForecastRuntimeFromEpisodes(forecastRuntime,episodes);
  if(seed.addedRows>0) await persistForecastRuntime('forecast-episode-seed');

  const evidenceContext=buildResearchAlertContext(state,witnessReport,{
    engineOverride:r15,
    safetyOverride:safety
  });
  const evidenceAppend=appendEvidenceFromContext(symbol,evidenceContext);
  if(evidenceAppend.changed) await persistEvidenceHistory('forecast-state');

  const extraFeatures=episodeVectorExtraFeatures(
    episodeVector({analysis:state.memoryAnalysis,dashboard:state.memoryDashboard}),
    state.availableAt
  );
  const runtimeQuality=deriveForecastRuntimeQuality({
    safety,
    marketAudit,
    witnessAudit,
    engineAudit,
    witnessReport,
    dashboard:state.memoryDashboard,
    extraFeatureCount:extraFeatures.length,
    expectedExtraFeatureCount:forecastRuntime.engine.configSnapshot().featureIds.length
  });
  const input=buildCanonicalForecastInput({
    envelope,
    dataQuality:runtimeQuality.dataQuality,
    regimeId:String(state.memoryDashboard?.regime||'UNKNOWN'),
    regimeConfidence:runtimeQuality.regimeConfidence,
    extraFeatures
  });

  const liveObservation=observeInstitutionalForecastRuntime(forecastRuntime,{
    input,
    quality:runtimeQuality.dataQuality
  });
  let observationAuditFailures=0;
  for(const row of liveObservation.evaluations){
    const audit=await appendForecastEvaluationAuditQueued(row.trace,row.evaluation);
    if(!audit) observationAuditFailures++;
  }
  if(
    liveObservation.revisions.length||
    liveObservation.resolved.length||
    liveObservation.evaluations.length
  ){
    await persistForecastRuntime('forecast-live-observation');
  }
  if(observationAuditFailures||!auditLedger.healthy){
    recordError(observability,{
      scope:'forecast.live_observation',
      message:'forecast outcome audit binding failed'
    });
    const failText=[
      '🔮 TCX Forecast Intelligence · '+symbol.replace('USDT','/USDT'),
      '',
      'Institutional Gate: ABSTAIN',
      'Audit: FAILED',
      'Neue Forecast-Ausgabe wurde fail-closed blockiert.',
      'Action: ABSTAIN / SHADOW_ONLY'
    ].join('\n');
    const failPayload={chat_id:chatId,text:failText,reply_markup:forecastProductKeyboard(symbol)};
    if(messageId) return tg('editMessageText',{...failPayload,message_id:messageId});
    return tg('sendMessage',failPayload);
  }

  const scienceAdapter=buildForecastScienceInputs({
    engine:forecastRuntime.engine,
    asOf:input.asOf,
    symbol,
    witnessReport
  });
  const scienceCore=runScientificCore({
    asOf:input.asOf,
    inputs:scienceAdapter.inputs,
    options:scienceAdapter.options,
    profile:scienceAdapter.profile,
    minimumRequiredCoverage:1
  });

  const evidenceRecord=evidenceAppend.record;
  const traceContext={
    data:{
      fabricSeq:Number(envelope.dataFabric?.seq??marketFabric.seq),
      fabricTailHash:String(envelope.dataFabric?.tailHash??marketFabric.tailHash),
      inputFingerprint:input.inputFingerprint
    },
    release:{
      releaseId:String(runtimeManifest?.releaseId||'UNAVAILABLE'),
      configHash:String(runtimeManifest?.configHash||'')
    },
    researchState:{
      fingerprint:String(evidenceRecord?.stateFingerprint?.hash||''),
      regime:input.regimeId,
      epistemic:'DERIVED_RESEARCH_STATE'
    },
    evidence:[
      {
        type:'EVIDENCE_SNAPSHOT',
        fingerprint:evidenceRecord?.fingerprint??null,
        stateFingerprint:evidenceRecord?.stateFingerprint?.hash??null,
        index:Number(evidenceRecord?.index??0),
        gate:String(evidenceRecord?.gate??'UNKNOWN')
      },
      {
        type:'INDEPENDENT_WITNESS_MESH',
        venues:[...(witnessReport?.distinctVenues||[])],
        agreementScore:Number(witnessReport?.agreementScore||0),
        independentWitnessSatisfied:witnessReport?.independentWitnessSatisfied===true
      }
    ],
    contradictions:(witnessReport?.contradictions||[]).map(code=>({
      type:'WITNESS_CONTRADICTION',
      code:String(code)
    })),
    provenance:{
      source:'TCX_TELEGRAM_INSTITUTIONAL_FORECAST',
      version:INSTITUTIONAL_FORECAST_RUNTIME_VERSION
    }
  };

  const issued=issueInstitutionalForecast(forecastRuntime,{
    input,
    scientificValidity:scienceCore.validity,
    dataSafety:safety,
    researchValidity:forecastResearchValidity(evidenceAppend),
    traceContext,
    generatedAt:Math.max(Date.now(),input.asOf)
  });

  const auditRecord=await appendForecastIssuanceAuditQueued(issued.issuance);
  await persistForecastRuntime('forecast-issued');

  const issuance=issued.issuance;
  const auditHealthyAfter=Boolean(auditRecord)&&auditLedger.healthy;
  const runtimeSummary=institutionalForecastRuntimeSummary(forecastRuntime);
  const scienceGuardLines=Object.entries(scienceAdapter.profile)
    .filter(([,cfg])=>cfg.required===true)
    .map(([id])=>id.replaceAll('_',' ')+': '+String(scienceCore.reports[id]?.gate||'INSUFFICIENT'));
  const text=renderInstitutionalForecastCard(issuance,{
    runtimeSummary,
    auditHealthy:auditHealthyAfter,
    scienceGuardLines,
    now:Date.now()
  });


  recordOperation(observability,{
    name:'institutional_forecast',
    ok:auditHealthyAfter&&issuance.gate!=='ABSTAIN',
    latencyMs:Date.now()-started,
    error:auditHealthyAfter?null:'forecast audit binding failed'
  });

  const payload={chat_id:chatId,text,reply_markup:forecastProductKeyboard(symbol)};
  if(messageId) return tg('editMessageText',{...payload,message_id:messageId});
  return tg('sendMessage',payload);
}

function parseAction(data='') {
  const product=parseProductCallback(data);
  if(product.kind!=='UNKNOWN') return product;
  if (data === 'back') return { kind:'BACK' };
  if (data === 'favorites') return { kind:'FAVORITES' };
  if (data === 'compare') return { kind:'COMPARE' };
  if (data === 'searchhelp') return { kind:'SEARCH_HELP' };
  const p = String(data).split(':');
  if (p[0] === 'market' && p[1]) return { kind:'MARKET', symbol:p[1] };
  if (p[0] === 'refresh' && p[1]) return { kind:'REFRESH', symbol:p[1] };
  if (p[0] === 'tcx' && p[1]) return { kind:'TCX', symbol:p[1] };
  if (p[0] === 'fav' && p[1]) return { kind:'FAV', symbol:p[1] };
  if (p[0] === 'alerthelp' && p[1]) return { kind:'ALERT_HELP', symbol:p[1] };
  if (p[0] === 'alertpreset' && p[1] && p[2]) return { kind:'ALERT_PRESET', symbol:p[1], preset:p[2] };
  if (p[0] === 'tf' && p[1] && ['1m','5m','15m','1h'].includes(p[2])) return { kind:'TIMEFRAME', symbol:p[1], interval:p[2] };
  if (p[0] === 'chart' && p[1] && ['1m','5m','15m','1h','4h'].includes(p[2])) return { kind:'CHART', symbol:p[1], interval:p[2] };
  if (p[0] === 'structure' && p[1]) return { kind:'STRUCTURE', symbol:p[1] };
  if (p[0] === 'memory' && p[1]) return { kind:'MEMORY', symbol:p[1] };
  if (p[0] === 'engine' && p[1]) return { kind:'ENGINE', symbol:p[1] };
  if (p[0] === 'forecast' && p[1]) return { kind:'FORECAST', symbol:p[1] };
  if (p[0] === 'witness' && p[1]) return { kind:'WITNESS', symbol:p[1] };
  if (p[0] === 'live' && p[1] && (p[2] === 'on' || p[2] === 'off')) return { kind:'LIVE', symbol:p[1], enabled:p[2] === 'on' };
  if (p[0] === 'replayat' && p[1] && /^\d{9,13}$/.test(String(p[2]||''))) return { kind:'REPLAY_AT', symbol:p[1], asOf:Number(p[2])*1000 };
  return { kind:'UNKNOWN' };
}


const readCommandHandlers=createReadCommandHandlers({
  tg,
  helpText,
  normalizeSymbol,
  showStart,
  showFavorites,
  showCompare,
  showMarket,
  showChart,
  showStructure,
  showObservability,
  showChaos,
  showOms,
  showExecutionResearch,
  showVenueQuality,
  showSorStatus,
  showRelease,
  showFabric,
  parseReplayTime,
  showReplay,
  showAudit,
  showWitness,
  showEngine,
  showForecast,
  showMemory,
  showEvidence,
  showEvidenceHistory,
  showValidity,
  recordError,
  recordOperation,
  observability
});

const mutationCommandHandlers=createMutationCommandHandlers({
  tg,
  normalizeSymbol,
  showShadowOrders,
  getShadowOrders:()=>shadowOrders,
  replaceShadowOrder:(index,order)=>{ shadowOrders[index]=order; },
  cancelShadowOrder,
  persistShadowOms,
  isAuditHealthy:()=>auditLedger.healthy,
  appendInstitutionalAudit,
  shadowAuditPayload,
  showPlacedShadowOrder,
  shadowDefaultLatencyMs,
  getShadowOmsStatus:()=>({healthy:shadowOmsHealthy,lastError:shadowOmsLastError}),
  placeShadowOrder,
  recordError,
  recordOperation,
  observability,
  showSorRoute,
  snapshot,
  createAlert,
  addTcXAlert,
  symbolLabel,
  fmt,
  alertPreset,
  describeAlert,
  activeAlerts,
  clearAlerts:async chatId=>{
    alerts.set(String(chatId),[]);
    return persistState("alerts-cleared");
  }
});

const telegramCommandHandlers={
  ...readCommandHandlers,
  ...mutationCommandHandlers
};

const routeTelegramCommand=createTelegramCommandRouter({
  permitted,
  handlers:telegramCommandHandlers
});

async function handleCommand(msg){
  return routeTelegramCommand(msg);
}

async function handle(update) {
  const msg = update?.message;
  if (msg?.chat?.id !== undefined && typeof msg.text === 'string' && msg.text.trim().startsWith('/')) {
    if (await handleCommand(msg)) return;
  }

  const q = update?.callback_query;
  if (!q?.id || q?.message?.chat?.id === undefined || q?.message?.message_id === undefined) return;
  const chatId = q.message.chat.id;
  const messageId = q.message.message_id;

  if (!permitted(chatId)) {
    await ack(q.id,'Nicht freigegeben');
    return;
  }

  const a = parseAction(q.data);
  try {
    if (a.kind === 'HOME') {
      await showStart(chatId,messageId);
      await ack(q.id);
      return;
    }
    if (a.kind === 'HOME_SECTION') {
      await showHomeSection(chatId,messageId,a.section);
      await ack(q.id);
      return;
    }
    if (a.kind === 'WHY') {
      if(!symbolOk(a.symbol)) { await ack(q.id,'Unbekannter Markt'); return; }
      await showWhy(chatId,messageId,a.symbol);
      await ack(q.id,'Evidence geladen');
      return;
    }
    if (a.kind === 'REGIME') {
      if(!symbolOk(a.symbol)) { await ack(q.id,'Unbekannter Markt'); return; }
      await showRegime(chatId,messageId,a.symbol);
      await ack(q.id,'Regime geladen');
      return;
    }
    if (a.kind === 'EVIDENCE') {
      if(!symbolOk(a.symbol)) { await ack(q.id,'Unbekannter Markt'); return; }
      await showEvidence(chatId,messageId,a.symbol);
      await ack(q.id,'Evidence geladen');
      return;
    }
    if (a.kind === 'HISTORY') {
      if(!symbolOk(a.symbol)) { await ack(q.id,'Unbekannter Markt'); return; }
      await showEvidenceHistory(chatId,messageId,a.symbol);
      await ack(q.id,'History geladen');
      return;
    }
    if (a.kind === 'VALIDITY') {
      if(!symbolOk(a.symbol)) { await ack(q.id,'Unbekannter Markt'); return; }
      await showValidity(chatId,messageId,a.symbol);
      await ack(q.id,'Validity geladen');
      return;
    }
    if (a.kind === 'REPLAY_MENU') {
      if(!symbolOk(a.symbol)) { await ack(q.id,'Unbekannter Markt'); return; }
      await showReplayMenu(chatId,messageId,a.symbol);
      await ack(q.id,'Replay-Punkte geladen');
      return;
    }
    if (a.kind === 'REPLAY_AT') {
      if(!symbolOk(a.symbol) || !Number.isFinite(a.asOf)) { await ack(q.id,'Ungültiger Replay-Punkt'); return; }
      await showReplay(chatId,a.symbol,a.asOf,messageId);
      await ack(q.id,'Replay geladen');
      return;
    }
    if (a.kind === 'OMS') {
      if(!symbolOk(a.symbol)) { await ack(q.id,'Unbekannter Markt'); return; }
      await showShadowOrders(chatId,a.symbol);
      await ack(q.id,'Shadow OMS geladen');
      return;
    }
    if (a.kind === 'SOR') {
      if(!symbolOk(a.symbol)) { await ack(q.id,'Unbekannter Markt'); return; }
      await showSorStatus(chatId,a.symbol);
      await ack(q.id,'Shadow SOR geladen');
      return;
    }
    if (a.kind === 'VQM') {
      if(!symbolOk(a.symbol)) { await ack(q.id,'Unbekannter Markt'); return; }
      await showVenueQuality(chatId,{symbol:a.symbol,side:'BUY',notionalQuote:1000});
      await ack(q.id,'Venue Memory geladen');
      return;
    }
    if (a.kind === 'ERL') {
      if(!symbolOk(a.symbol)) { await ack(q.id,'Unbekannter Markt'); return; }
      await showExecutionResearch(chatId,{symbol:a.symbol});
      await ack(q.id,'Execution Lab geladen');
      return;
    }
    if (a.kind === 'BACK') {
      await showStart(chatId,messageId);
      await ack(q.id);
      return;
    }
    if (a.kind === 'FAVORITES') {
      await showFavorites(chatId,messageId);
      await ack(q.id);
      return;
    }
    if (a.kind === 'COMPARE') {
      await showCompare(chatId,messageId);
      await ack(q.id,'Compare geladen');
      return;
    }
    if (a.kind === 'SEARCH_HELP') {
      await ack(q.id,'Schreibe z. B. /coin BTC');
      return;
    }
    if (a.kind === 'UNKNOWN' || (a.symbol && !symbolOk(a.symbol))) {
      await ack(q.id,'Unbekannte Aktion');
      return;
    }
    if (a.kind === 'MARKET' || a.kind === 'REFRESH') {
      await showMarket(chatId,messageId,a.symbol,sessions.get(String(chatId))?.live === true);
      await ack(q.id);
      return;
    }
    if (a.kind === 'LIVE') {
      await showMarket(chatId,messageId,a.symbol,a.enabled);
      await ack(q.id,a.enabled?'Live aktiviert':'Live deaktiviert');
      return;
    }
    if (a.kind === 'TCX') {
      await showTcx(chatId,messageId,a.symbol);
      await ack(q.id);
      return;
    }
    if (a.kind === 'TIMEFRAME') {
      await showTimeframe(chatId,messageId,a.symbol,a.interval);
      await ack(q.id);
      return;
    }
    if (a.kind === "CHART") {
      await showChart(chatId,a.symbol,a.interval);
      await ack(q.id,`Chart ${a.interval}`);
      return;
    }
    if (a.kind === "STRUCTURE") {
      await showStructure(chatId,a.symbol);
      await ack(q.id,"Struktur geladen");
      return;
    }


    if (a.kind === "WITNESS") {
      await showWitness(chatId,a.symbol);
      await ack(q.id,"Witness Audit geladen");
      return;
    }

    if (a.kind === "ENGINE") {
      await showEngine(chatId,a.symbol);
      await ack(q.id,"MTL Engine geladen");
      return;
    }

    if (a.kind === "FORECAST") {
      await showForecast(chatId,a.symbol,messageId);
      await ack(q.id,"Forecast geladen");
      return;
    }

    if (a.kind === "MEMORY") {
      await showMemory(chatId,a.symbol);
      await ack(q.id,"Episode Memory geladen");
      return;
    }

    if (a.kind === 'FAV') {
      const set = favoriteSet(chatId);
      if (set.has(a.symbol)) set.delete(a.symbol); else set.add(a.symbol);
      const persisted = await persistState('favorite-toggled');
      await showMarket(chatId,messageId,a.symbol,sessions.get(String(chatId))?.live === true);
      await ack(
        q.id,
        persisted
          ? (set.has(a.symbol)?'Favorit gespeichert':'Favorit entfernt')
          : 'Favorit nur temporär – State-Volume prüfen'
      );
      return;
    }
    if (a.kind === 'ALERT_HELP') {
      await showAlertSetup(chatId,a.symbol);
      await ack(q.id,'Alert-Auswahl geöffnet');
      return;
    }
    if (a.kind === 'ALERT_PRESET') {
      const alert=alertPreset(a.symbol,a.preset);
      if(!alert){
        await ack(q.id,'Unbekannter Alert');
        return;
      }
      const added=await addTcXAlert(chatId,alert);
      await ack(q.id,added.added?'Alert gespeichert':(added.reason==='DUPLICATE'?'Schon aktiv':'Limit erreicht'));
      if(added.added){
        await tg('sendMessage',{chat_id:chatId,text:'🔔 '+describeAlert(alert)+'\nAction bleibt ABSTAIN / SHADOW_ONLY.'});
      }
      return;
    }
  } catch (err) {
    console.error('callback error', err instanceof Error ? err.message : String(err));
    await ack(q.id,'Live-Daten gerade nicht verfügbar');
  }
}

async function poll() {
  while (running) {
    try {
      const updates = await tg('getUpdates',{
        offset,
        timeout:25,
        allowed_updates:['message','callback_query']
      }) || [];
      for (const u of updates) {
        offset = Math.max(offset,Number(u.update_id)+1);
        await handle(u);
      }
    } catch (err) {
      console.error('poll error', err instanceof Error ? err.message : String(err));
      await sleep(1500);
    }
  }
}

async function refresher() {
  while (running) {
    await sleep(1000);
    const now = Date.now();
    for (const [key,s] of [...sessions]) {
      if (!s.live || now - s.lastRefresh < refreshMs) continue;
      try {
        if (s.view === 'TCX') await showTcx(s.chatId,s.messageId,s.symbol);
        else if (s.view === 'TIMEFRAME') await showTimeframe(s.chatId,s.messageId,s.symbol,s.interval || '5m');
        else await showMarket(s.chatId,s.messageId,s.symbol,true);
      } catch (err) {
        console.error('refresh error', err instanceof Error ? err.message : String(err));
        const cur = sessions.get(key);
        if (cur) cur.lastRefresh = now;
      }
    }
  }
}

async function alertWatcher() {
  while (running) {
    await sleep(alertCheckMs);
    const grouped = new Map();
    for (const [chatKey,list] of alerts) {
      for (const alert of list) {
        if(alert?.enabled===false) continue;
        if (!grouped.has(alert.symbol)) grouped.set(alert.symbol,[]);
        grouped.get(alert.symbol).push({ chatKey, alert });
      }
    }

    let persistenceChanged=false;
    for (const [symbol,items] of grouped) {
      const needsResearch=items.some(({alert})=>
        [...requiredContext(alert)].some(root=>root!=='market')
      );
      let context;
      try {
        if(needsResearch){
          context=await researchAlertContext(symbol);
        } else {
          const s=await snapshot(symbol);
          context={
            capturedAt:Date.now(),
            market:{
              price:Number(s.price),
              spreadBps:Number(s.spreadBps),
              change24hPct:Number(s.changePct),
              availableAt:Number(s.availableAt)
            }
          };
        }
      } catch (err) {
        console.error('alert context error',symbol,err instanceof Error ? err.message : String(err));
        continue;
      }

      for (const { chatKey, alert } of items) {
        const result=evaluateAlert(alert,context,{now:Date.now()});
        if(!result.alert) continue;
        const list=alertList(chatKey);
        const idx=list.findIndex(x=>x?.id===alert.id);
        if(idx<0) continue;

        if(result.triggered){
          let delivered=false;
          try {
            await tg('sendMessage',{
              chat_id:chatKey,
              text:[
                '🔔 TCX ALERT · '+symbolLabel(symbol)+'/USDT',
                describeAlert(alert),'',
                ...alertCurrentStateLines(context),'',
                'Trigger: '+result.message,
                'Action: ABSTAIN / SHADOW_ONLY'
              ].join('\n').slice(0,4096)
            });
            delivered=true;
          } catch (err) {
            console.error('alert send error',err instanceof Error ? err.message : String(err));
          }
          if(!delivered) continue;
          if(result.alert.once && result.alert.enabled===false) list.splice(idx,1);
          else list[idx]=result.alert;
          persistenceChanged=true;
          continue;
        }

        if(result.reason==='EXPIRED'){
          list.splice(idx,1);
          persistenceChanged=true;
          continue;
        }

        const before=JSON.stringify(list[idx]);
        list[idx]=result.alert;
        if(JSON.stringify(result.alert)!==before) persistenceChanged=true;
      }
    }
    if(persistenceChanged) await persistState('alert-v2-sweep');
  }
}

async function shadowOmsWatcher() {
  while(running){
    await sleep(shadowWatchMs);
    if(!shadowOmsHealthy) continue;
    const started=Date.now();
    let changed=false;
    try {
      for(let i=0;i<shadowOrders.length;i++){
        let order=shadowOrders[i];
        if(!['ACTIVE','PARTIALLY_FILLED'].includes(order.status) || order.liquidity!=='MAKER') continue;

        if(!Number.isFinite(Number(order.lastAggTradeId))){
          try {
            const cursor=await fetchLatestAggTradeId(order.symbol);
            order={...order,lastAggTradeId:cursor,dataQuality:'RECOVERED_CURSOR_NO_BACKFILL',updatedAt:Date.now()};
            shadowOrders[i]=order;
            changed=true;
          } catch(err){
            recordError(observability,{scope:'shadow_oms.cursor_recovery',message:err instanceof Error?err.message:String(err)});
          }
          continue;
        }

        try {
          const batch=await fetchAggTradesSince(order.symbol,Number(order.lastAggTradeId)+1,{maxPages:3});
          if(!batch.trades.length) continue;
          const beforeFill=Number(order.fillBase||0);
          const beforeStatus=order.status;
          const applied=applyAggTrades(order,batch.trades,{at:Date.now()});
          if(applied.changed){
            order=applied.order;
            order.dataQuality=batch.truncated?'BACKLOG_REPLAYING':'OK';
            shadowOrders[i]=order;
            changed=true;
            if((Number(order.fillBase||0)>beforeFill+1e-12 || order.status!==beforeStatus) && auditLedger.healthy){
              await appendInstitutionalAudit('TCX_SHADOW_ORDER_EVENT',shadowAuditPayload('FILL_UPDATE',order,{
                previousStatus:beforeStatus,
                previousFillBase:beforeFill,
                aggTradesProcessed:batch.trades.length,
                backlog:batch.truncated
              }));
            }
          }
        } catch(err){
          const msg=err instanceof Error?err.message:String(err);
          order={...order,dataQuality:'DEGRADED_AGGTRADE_UNAVAILABLE',updatedAt:Date.now()};
          shadowOrders[i]=order;
          changed=true;
          recordError(observability,{scope:'shadow_oms.aggtrades',message:msg});
        }
      }

      const markable=shadowOrders.filter(o=>
        Number(o.fillBase||0)>0 &&
        (o.liquidity==='TAKER' || ['FILLED','CANCELLED'].includes(o.status)) &&
        Object.keys(o.markouts||{}).length<3
      );
      const symbols=[...new Set(markable.map(o=>o.symbol))];
      for(const symbol of symbols){
        let book;
        try { book=await fetchExecutionBook(symbol); }
        catch(err){
          recordError(observability,{scope:'shadow_oms.markout_book',message:err instanceof Error?err.message:String(err)});
          continue;
        }
        for(let i=0;i<shadowOrders.length;i++){
          const order=shadowOrders[i];
          if(order.symbol!==symbol || !markable.some(x=>x.id===order.id)) continue;
          const beforeCount=Object.keys(order.markouts||{}).length;
          const next=markShadowOrder(order,{mid:book.mid,at:book.availableAt});
          const afterCount=Object.keys(next.markouts||{}).length;
          if(afterCount>beforeCount){
            shadowOrders[i]=next;
            changed=true;
            if(auditLedger.healthy){
              await appendInstitutionalAudit('TCX_SHADOW_ORDER_EVENT',shadowAuditPayload('MARKOUT_UPDATE',next,{
                addedMarkouts:afterCount-beforeCount
              }));
            }
          }
        }
      }

      if(changed) await persistShadowOms('watcher');
      recordOperation(observability,{name:'shadow_oms.watch',ok:true,latencyMs:Date.now()-started});
    } catch(err){
      const msg=err instanceof Error?err.message:String(err);
      recordOperation(observability,{name:'shadow_oms.watch',ok:false,latencyMs:Date.now()-started,error:msg});
      recordError(observability,{scope:'shadow_oms.watch',message:msg});
    }
  }
}

async function venueQualityWatcher() {
  const horizons=[60_000,300_000,900_000];
  while(running){
    await sleep(vqmWatchMs);
    if(!venueQualityHealthy || !venueQualityRecords.length) continue;
    const started=Date.now();
    let changed=false,observed=0,missed=0;
    try {
      const now=Date.now();

      for(let i=0;i<venueQualityRecords.length;i++){
        const r=venueQualityRecords[i];
        if(!(Number(r.fillRatio)>0) || !(Number(r.avgFillPrice)>0) || Object.keys(r.markouts||{}).length>=3) continue;
        const before=JSON.stringify(r.markouts||{});
        const matured=matureVenueQualityObservation(r,{mid:null,at:now,maxLagMs:vqmMarkoutMaxLagMs});
        if(matured.changed){
          venueQualityRecords[i]=matured.record;
          changed=true;
          const after=matured.record.markouts||{};
          for(const h of horizons){
            const key=String(h);
            if(!JSON.parse(before||'{}')[key] && after[key]?.status==='MISSED_CAPTURE_WINDOW') missed++;
          }
        }
      }

      const dueBySymbol=new Map();
      for(let i=0;i<venueQualityRecords.length;i++){
        const r=venueQualityRecords[i];
        if(!(Number(r.fillRatio)>0) || !(Number(r.avgFillPrice)>0) || Object.keys(r.markouts||{}).length>=3) continue;
        const elapsed=now-Number(r.capturedAt);
        const due=horizons.some(h=>{
          const key=String(h);
          return !r.markouts?.[key] && elapsed>=h && elapsed<=h+vqmMarkoutMaxLagMs;
        });
        if(!due) continue;
        if(!dueBySymbol.has(r.symbol)) dueBySymbol.set(r.symbol,[]);
        dueBySymbol.get(r.symbol).push(i);
      }

      for(const [symbol,indexes] of dueBySymbol){
        let books=[];
        try { ({books}=await fetchSorVenueBooks(symbol)); }
        catch(err){
          recordError(observability,{scope:'venue_quality.markout_books',message:err instanceof Error?err.message:String(err)});
          continue;
        }
        const byVenue=new Map(books.map(b=>[b.venue,b]));
        for(const i of indexes){
          const r=venueQualityRecords[i];
          const book=byVenue.get(r.venue);
          if(!book || book.quote!==r.quote) continue;
          const beforeKeys=new Set(Object.keys(r.markouts||{}));
          const matured=matureVenueQualityObservation(r,{mid:book.mid,at:book.availableAt,maxLagMs:vqmMarkoutMaxLagMs});
          if(!matured.changed) continue;
          venueQualityRecords[i]=matured.record;
          changed=true;
          for(const [key,m] of Object.entries(matured.record.markouts||{})){
            if(beforeKeys.has(key)) continue;
            if(m?.status==='OBSERVED') observed++;
            if(m?.status==='MISSED_CAPTURE_WINDOW') missed++;
          }
        }
      }

      if(changed){
        await persistVenueQualityMemory('markout-maturity');
        if(auditLedger.healthy){
          await appendInstitutionalAudit('TCX_VENUE_QUALITY_MATURITY',{
            version:VENUE_QUALITY_MEMORY_VERSION,
            at:Date.now(),
            observed,missed,
            records:venueQualityRecords.length,
            execution:'SHADOW_ONLY'
          });
        }
      }
      recordOperation(observability,{name:'venue_quality.watch',ok:true,latencyMs:Date.now()-started});
    } catch(err){
      const msg=err instanceof Error?err.message:String(err);
      recordOperation(observability,{name:'venue_quality.watch',ok:false,latencyMs:Date.now()-started,error:msg});
      recordError(observability,{scope:'venue_quality.watch',message:msg});
    }
  }
}

async function forecastOutcomeWatcher() {
  while(running) {
    await sleep(forecastOutcomeCheckMs);
    if(!forecastRuntime.healthy) continue;
    const pending=forecastRuntime.journal.pending();
    if(!pending.length) continue;

    const started=Date.now();
    const symbols=[...new Set(pending.map(x=>String(x.symbol)).filter(Boolean))];
    let observedSymbols=0;
    let resolvedCount=0;
    let auditFailures=0;

    for(const symbol of symbols) {
      if(!running) break;
      try {
        const s=await snapshot(symbol);
        const result=observeInstitutionalForecastOutcomePoint(forecastRuntime,{
          symbol,
          timestamp:Number(s.availableAt),
          price:Number(s.price),
          quality:1
        });
        observedSymbols++;
        resolvedCount+=result.resolved.length;

        for(const row of result.evaluations) {
          const audit=await appendForecastEvaluationAuditQueued(row.trace,row.evaluation);
          if(!audit) auditFailures++;
        }
      } catch(err) {
        const msg=err instanceof Error?err.message:String(err);
        recordError(observability,{scope:'forecast_runtime.outcome_watch',message:msg});
        console.error('forecast outcome watcher error',symbol,msg);
      }
      await sleep(150);
    }

    try {
      await persistForecastRuntime('outcome-watch');
    } catch {}

    recordOperation(observability,{
      name:'forecast_outcome_watch',
      ok:forecastRuntime.healthy&&auditFailures===0,
      latencyMs:Date.now()-started,
      error:auditFailures?auditFailures+' forecast evaluation audit failure(s)':forecastRuntime.lastError
    });

    if(resolvedCount){
      console.log('forecast outcomes resolved',JSON.stringify({
        resolved:resolvedCount,
        observedSymbols,
        pendingBefore:pending.length,
        pendingAfter:forecastRuntime.journal.pending().length,
        auditFailures
      }));
    }
  }
}

async function episodeWatcher() {
  while(running) {
    let changed=false;
    let evidenceChanged=false;
    for(const symbol of requestedSymbols) {
      if(!running) break;
      try {
        const state=await researchState(symbol,"5m");
        const before=episodes.length;
        await captureEpisodeFromState(state,{persist:false});
        if(episodes.length!==before) changed=true;
        if(matureSymbolEpisodes(symbol,state.byTf["5m"],state.availableAt)) changed=true;
        try {
          const witnessReport=await witnessState(symbol,state.market,{maxAgeMs:60000});
          const context=buildResearchAlertContext(state,witnessReport);
          researchAlertContextCache.set(symbol,{at:Date.now(),context});
          updateRadarCache(symbol,context);
          const evidenceAppend=appendEvidenceFromContext(symbol,context);
          if(evidenceAppend.changed) evidenceChanged=true;
        } catch(radarErr) {
          console.error("radar refresh error",symbol,radarErr instanceof Error?radarErr.message:String(radarErr));
        }
      } catch(err) {
        console.error("episode watcher error",symbol,err instanceof Error?err.message:String(err));
      }
      await sleep(250);
    }
    if(changed) await persistEpisodeMemory("sweep");
    if(evidenceChanged) await persistEvidenceHistory("sweep");
    await sleep(episodeSweepMs);
  }
}

function currentOperationalReadiness(){
  const snapshot=observabilitySnapshot(observability);
  const slo=deriveSloHealth(snapshot);
  return evaluateOperationalReadiness({
    auditLedger,
    marketFabric,
    releaseRegistry,
    runtimeReleaseRecord,
    forecastRuntime:institutionalForecastRuntimeSummary(forecastRuntime),
    persistence:{
      healthy:persistenceHealthy,
      recoveredFromCorrupt:loadedState.recoveredFromCorrupt
    },
    episodePersistence:{
      healthy:episodePersistenceHealthy,
      recoveredFromCorrupt:loadedEpisodeMemory.recoveredFromCorrupt
    },
    evidenceHistory:{
      healthy:evidenceHistoryHealthy,
      recoveredFromCorrupt:loadedEvidenceHistory.recoveredFromCorrupt
    },
    providerHealth:marketDataProvider.providerHealth(),
    slo,
    localFilePersistence:true,
    replicaCount:configuredReplicaCount
  });
}

const port = Number(process.env.PORT || 8080);
const server = http.createServer((req,res) => {
  if (req.url === '/ready') {
    const readiness=currentOperationalReadiness();
    res.writeHead(readiness.httpStatus,{'content-type':'application/json','cache-control':'no-store'});
    res.end(JSON.stringify({
      ok:readiness.ready,
      service:'TCX Telegram',
      readiness,
      releaseId:runtimeManifest?.releaseId||null,
      execution:'SHADOW_ONLY',
      canExecute:false
    }));
    return;
  }
  if (req.url === '/health' || req.url === '/') {
    const activeAlerts = [...alerts.values()].reduce((n,x) => n+x.length,0);
    res.writeHead(200,{'content-type':'application/json'});
    res.end(JSON.stringify({
      ok:true,
      service:'TCX Telegram',
      execution:'SHADOW_ONLY',
      markets:markets.map(x => x.symbol),
      sessions:sessions.size,
      favorites:[...favorites.values()].reduce((n,x) => n+x.size,0),
      alerts:activeAlerts,
      alertEngine:{version:ALERT_ENGINE_VERSION,radarEntries:radarCache.size,researchCheckMs:researchAlertCheckMs},
      institutionalKernel:{
        version:INSTITUTIONAL_KERNEL_VERSION,
        ledgerHealthy:auditLedger.healthy,
        ledgerSeq:auditLedger.seq,
        ledgerTailHash:auditLedger.tailHash,
        canExecute:false,
        execution:'SHADOW_ONLY'
      },
      releaseRegistry:{
        version:RELEASE_REGISTRY_VERSION,
        healthy:releaseRegistry.healthy,
        seq:releaseRegistry.seq,
        tailHash:releaseRegistry.tailHash,
        currentReleaseId:runtimeManifest?.releaseId||null,
        currentRegistered:Boolean(runtimeReleaseRecord),
        file:releaseRegistryFile
      },
      marketDataFabric:{
        version:MARKET_DATA_FABRIC_VERSION,
        healthy:marketFabric.healthy,
        seq:marketFabric.seq,
        tailHash:marketFabric.tailHash,
        events:marketFabric.events.length,
        file:marketFabricFile
      },
      deterministicReplay:{
        version:DETERMINISTIC_REPLAY_VERSION
      },
      observability:{
        version:OBSERVABILITY_VERSION,
        snapshot:observabilitySnapshot(observability),
        slo:deriveSloHealth(observabilitySnapshot(observability))
      },
      operationalReadiness:{
        version:OPERATIONAL_READINESS_VERSION,
        ...currentOperationalReadiness()
      },
      chaosEngineering:{
        version:CHAOS_ENGINEERING_VERSION,
        mode:'SYNTHETIC_SIDE_EFFECT_FREE'
      },
      shadowOms:{
        version:SHADOW_OMS_VERSION,
        healthy:shadowOmsHealthy,
        file:shadowOmsFile,
        total:shadowOrders.length,
        active:shadowOrders.filter(o=>['ACTIVE','PARTIALLY_FILLED'].includes(o.status)).length,
        filled:shadowOrders.filter(o=>o.status==='FILLED').length,
        lastError:shadowOmsLastError,
        recoveredFromCorrupt:loadedShadowOms.recoveredFromCorrupt,
        capabilities:SHADOW_OMS_CAPABILITIES
      },
      shadowSor:{
        version:SHADOW_SOR_VERSION,
        routeQuote:'USDT',
        maxBookAgeMs:sorMaxBookAgeMs,
        feeAssumptionsBps:{
          BINANCE:sorBinanceFeeBps,
          OKX:sorOkxFeeBps,
          KRAKEN:sorKrakenFeeBps
        },
        capabilities:SHADOW_SOR_CAPABILITIES
      },
      venueQualityMemory:{
        version:VENUE_QUALITY_MEMORY_VERSION,
        healthy:venueQualityHealthy,
        file:venueQualityFile,
        records:venueQualityRecords.length,
        lastError:venueQualityLastError,
        recoveredFromCorrupt:loadedVenueQuality.recoveredFromCorrupt,
        watchMs:vqmWatchMs,
        markoutMaxLagMs:vqmMarkoutMaxLagMs,
        minSamples:vqmMinSamples,
        minToxicitySamples:vqmMinToxicitySamples,
        capabilities:VENUE_QUALITY_MEMORY_CAPABILITIES
      },
      executionResearchLab:{
        version:EXECUTION_RESEARCH_LAB_VERSION,
        venueObservations:venueQualityRecords.length,
        capabilities:EXECUTION_RESEARCH_CAPABILITIES
      },
      witnessNetwork:{
        cacheEntries:witnessCache.size,
        providers:["BINANCE","OKX","KRAKEN"]
      },
      marketDataProvider:{
        version:MARKET_DATA_PROVIDER_VERSION,
        binanceFallbacks:binanceBases.length,
        okxHost:new URL(okxBase).host,
        krakenHost:new URL(krakenBase).host
      },
      telegramCommandRouter:{
        version:TELEGRAM_COMMAND_ROUTER_VERSION,
        commands:Object.keys(telegramCommandHandlers).length,
        legacyFallback:false
      },
      telegramReadCommands:{
        version:TELEGRAM_READ_COMMANDS_VERSION,
        commands:Object.keys(readCommandHandlers).length
      },
      telegramMutationCommands:{
        version:TELEGRAM_MUTATION_COMMANDS_VERSION,
        commands:Object.keys(mutationCommandHandlers).length
      },
      episodeMemory:{
        file:episodeFile,
        total:episodes.length,
        mature1h:episodes.filter(e=>e.outcomes?.["12"]).length,
        healthy:episodePersistenceHealthy,
        lastError:episodePersistenceLastError,
        recoveredFromCorrupt:loadedEpisodeMemory.recoveredFromCorrupt
      },
      evidenceHistory:{
        version:EVIDENCE_HISTORY_VERSION,
        file:evidenceHistoryFile,
        total:evidenceRecords.length,
        healthy:evidenceHistoryHealthy,
        lastError:evidenceHistoryLastError,
        recoveredFromCorrupt:loadedEvidenceHistory.recoveredFromCorrupt
      },
      stateValidity:{
        version:STATE_VALIDITY_VERSION,
        staleAfterMs:researchValidityStaleMs,
        expireAfterMs:researchValidityExpireMs,
        driftThreshold:researchValidityDriftThreshold,
        canExecute:false
      },
      researchLifecycle:{
        version:RESEARCH_LIFECYCLE_VERSION,
        evidenceSnapshots:evidenceRecords.length
      },
      institutionalForecastRuntime:{
        ...institutionalForecastRuntimeSummary(forecastRuntime),
        file:forecastRuntimeFile,
        outcomeCheckMs:forecastOutcomeCheckMs
      },
      persistence:{
        file:stateFile,
        healthy:persistenceHealthy,
        lastError:persistenceLastError,
        recoveredFromCorrupt:loadedState.recoveredFromCorrupt
      }
    }));
    return;
  }
  res.writeHead(404);
  res.end('not found');
});

server.listen(port,'0.0.0.0',() => console.log(`health server :${port}`));

let shuttingDown = false;
async function gracefulShutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  running = false;
  console.log('shutdown', signal);
  await persistState(`shutdown:${signal}`);
  await persistEpisodeMemory(`shutdown:${signal}`);
  await persistEvidenceHistory(`shutdown:${signal}`);
  await persistForecastRuntime(`shutdown:${signal}`);
  await persistShadowOms(`shutdown:${signal}`);
  await persistVenueQualityMemory(`shutdown:${signal}`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0),5000).unref();
}
process.on('SIGINT',() => void gracefulShutdown('SIGINT'));
process.on('SIGTERM',() => void gracefulShutdown('SIGTERM'));

const me = await tg('getMe',{});
console.log(JSON.stringify({
  service:'TCX Telegram UI',
  botUsername:me?.username || 'UNKNOWN',
  markets:markets.map(x=>x.symbol),
  refreshMs,
  alertCheckMs,
  researchAlertCheckMs,
  episodeSweepMs,
  forecastOutcomeCheckMs,
  institutionalForecastRuntime:{
    ...institutionalForecastRuntimeSummary(forecastRuntime),
    file:forecastRuntimeFile
  },
  forecastProduct:FORECAST_PRODUCT_VERSION,
  forecastScienceAdapter:FORECAST_RUNTIME_SCIENCE_ADAPTER_VERSION,
  institutionalKernel:INSTITUTIONAL_KERNEL_VERSION,
  auditLedger:{file:auditFile,healthy:auditLedger.healthy,seq:auditLedger.seq,tailHash:auditLedger.tailHash},
  releaseRegistry:{
    version:RELEASE_REGISTRY_VERSION,
    file:releaseRegistryFile,
    healthy:releaseRegistry.healthy,
    seq:releaseRegistry.seq,
    tailHash:releaseRegistry.tailHash,
    currentReleaseId:runtimeManifest?.releaseId||null,
    currentRegistrySeq:runtimeReleaseRecord?.seq??null
  },
  marketDataFabric:{
    version:MARKET_DATA_FABRIC_VERSION,
    file:marketFabricFile,
    healthy:marketFabric.healthy,
    seq:marketFabric.seq,
    tailHash:marketFabric.tailHash
  },
  deterministicReplay:DETERMINISTIC_REPLAY_VERSION,
  observability:OBSERVABILITY_VERSION,
  operationalReadiness:currentOperationalReadiness(),
  chaosEngineering:CHAOS_ENGINEERING_VERSION,
  alertEngine:ALERT_ENGINE_VERSION,
  stateValidity:{
    version:STATE_VALIDITY_VERSION,
    staleAfterMs:researchValidityStaleMs,
    expireAfterMs:researchValidityExpireMs,
    driftThreshold:researchValidityDriftThreshold
  },
  researchLifecycle:RESEARCH_LIFECYCLE_VERSION,
  shadowOms:{
    version:SHADOW_OMS_VERSION,
    file:shadowOmsFile,
    healthy:shadowOmsHealthy,
    loaded:shadowOrders.length,
    recoveredFromCorrupt:loadedShadowOms.recoveredFromCorrupt,
    watchMs:shadowWatchMs,
    capabilities:SHADOW_OMS_CAPABILITIES
  },
  shadowSor:{
    version:SHADOW_SOR_VERSION,
    routeQuote:'USDT',
    maxBookAgeMs:sorMaxBookAgeMs,
    feeAssumptionsBps:{
      BINANCE:sorBinanceFeeBps,
      OKX:sorOkxFeeBps,
      KRAKEN:sorKrakenFeeBps
    },
    capabilities:SHADOW_SOR_CAPABILITIES
  },
  venueQualityMemory:{
    version:VENUE_QUALITY_MEMORY_VERSION,
    file:venueQualityFile,
    healthy:venueQualityHealthy,
    loaded:venueQualityRecords.length,
    recoveredFromCorrupt:loadedVenueQuality.recoveredFromCorrupt,
    watchMs:vqmWatchMs,
    markoutMaxLagMs:vqmMarkoutMaxLagMs,
    minSamples:vqmMinSamples,
    minToxicitySamples:vqmMinToxicitySamples,
    halfLifeDays:vqmHalfLifeDays,
    capabilities:VENUE_QUALITY_MEMORY_CAPABILITIES
  },
  executionResearchLab:{
    version:EXECUTION_RESEARCH_LAB_VERSION,
    capabilities:EXECUTION_RESEARCH_CAPABILITIES
  },
  execution:'SHADOW_ONLY',
  allowedChats:allowedChats.size || 'ALL',
  recommendedReplicas:1,
  configuredReplicaCount,
  marketDataHosts:binanceBases.map(x => new URL(x).host),
  witnessProviders:{
    okx:new URL(okxBase).host,
    kraken:new URL(krakenBase).host
  },
  persistence:{
    file:stateFile,
    healthy:persistenceHealthy,
    recoveredFromCorrupt:loadedState.recoveredFromCorrupt,
    loadedFavorites:[...favorites.values()].reduce((n,x) => n+x.size,0),
    loadedAlerts:[...alerts.values()].reduce((n,x) => n+x.length,0)
  },
  episodeMemory:{
    file:episodeFile,
    loaded:episodes.length,
    recoveredFromCorrupt:loadedEpisodeMemory.recoveredFromCorrupt
  }
},null,2));

await tg('deleteWebhook',{ drop_pending_updates:false });
await Promise.all([poll(),refresher(),alertWatcher(),episodeWatcher(),forecastOutcomeWatcher(),shadowOmsWatcher(),venueQualityWatcher()]);
