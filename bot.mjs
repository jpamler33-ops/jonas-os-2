import http from 'node:http';
import { missionControlSnapshot, renderMissionControlHtml, MISSION_CONTROL_VERSION } from './mission-control.mjs';
import { cleanupOrphanedPersistenceArtifacts, inspectPersistenceStorage, inspectStoragePressure, classifyStorageWriteAdmission } from './storage-maintenance.mjs';
import { rotateVerifiedMarketFabric, reconcileMarketFabricCheckpointFromArchive, MARKET_FABRIC_ROTATION_VERSION } from './market-fabric-rotation.mjs';
import { archiveMarketFabricSegments, MARKET_FABRIC_ARCHIVE_VERSION } from './market-fabric-archive.mjs';
import { createS3ColdStoreFromEnv, MARKET_FABRIC_COLD_STORE_VERSION } from './market-fabric-cold-store.mjs';
import { offloadMarketFabricArchive, MARKET_FABRIC_COLD_TIER_VERSION } from './market-fabric-cold-tier.mjs';
import { buildStrategyDnaMemory, allocateShadowOpportunity, OPPORTUNITY_ALLOCATOR_VERSION } from './opportunity-allocator.mjs';
import { evaluateShadowLeverageRisk, SHADOW_LEVERAGE_RISK_VERSION } from './shadow-leverage-risk.mjs';
import { evaluatePortfolioRiskBrain, PORTFOLIO_RISK_BRAIN_VERSION } from './portfolio-risk-brain.mjs';
import { buildPointInTimeCorrelation, PIT_CORRELATION_ENGINE_VERSION } from './pit-correlation-engine.mjs';
import { buildLeverageCounterfactualLab, LEVERAGE_COUNTERFACTUAL_LAB_VERSION } from './leverage-counterfactual-lab.mjs';
import { createFrozenShadowPolicy, SHADOW_POLICY_FREEZE_VERSION } from './shadow-policy-freeze.mjs';
import { classifyShadowSetup, TRADE_LIFECYCLE_VERSION } from './trade-lifecycle-v2.mjs';
import { buildSetupPerformanceMemory, setupEvidenceFor, SETUP_PERFORMANCE_MEMORY_VERSION } from './setup-performance-memory.mjs';
import { buildTcxProofReport, TCX_PROOF_SYSTEM_VERSION } from './tcx-proof-system.mjs';
import { loadPersistentState, savePersistentState } from './state-store.mjs';
import { candlesFromKlines, closedCandles, analyzeStructure, analyzeMultiTimeframe } from './market-structure.mjs';
import { renderCandlestickPng } from './chart-renderer.mjs';
import { buildChartIntelligence, CHART_INTELLIGENCE_VERSION } from './chart-intelligence.mjs';
import { buildMarketXray, buildMtfMatrix, MARKET_XRAY_VIEW_VERSION } from './market-xray-view.mjs';
import { buildObservedLiquidationHeatmap, buildConfluenceMap, LIQUIDATION_CONFLUENCE_VIEW_VERSION } from './liquidation-confluence-view.mjs';
import { buildStructureEventRadar, deriveStructureEvents, STRUCTURE_EVENT_RADAR_VERSION } from './structure-event-radar.mjs';
import { forecastIssuanceToChartOverlay, forecastOverlaySummary, FORECAST_CHART_OVERLAY_VERSION } from './forecast-chart-overlay.mjs';
import { buildFlowRadar, FLOW_RADAR_VIEW_VERSION } from './flow-radar-view.mjs';
import { buildForecastAccuracyView, FORECAST_ACCURACY_VIEW_VERSION } from './forecast-accuracy-view.mjs';
import { buildSuperchartIntel, SUPERCHART_VERSION } from './superchart-intel.mjs';
import { buildSuperRadar, renderSuperRadar, buildSuperSetup, renderSuperSetup, buildSuperRisk, renderSuperRisk, buildSuperSignal, renderSuperSignal, INTELLIGENCE_TERMINAL_VERSION } from './intelligence-terminal.mjs';
import { buildSuperMemory, discoverPatterns, buildDigitalTwin, renderCognitiveCore, COGNITIVE_CORE_VERSION } from './cognitive-core.mjs';
import { validateDiscoveredPatterns, buildModelLeague, diagnoseScientificBrain, buildBullBearDebate, buildMetaJudge, renderScientificBrain, SCIENTIFIC_BRAIN_VERSION } from './scientific-brain.mjs';
import { buildMarketGraph, buildCapitalRotation, buildRegimeGenome, renderWorldModelFoundation, WORLD_MODEL_FOUNDATION_VERSION } from './world-model-foundation.mjs';
import { discoverLeadLag, buildShockPropagation, buildEventReactionMemory, buildSystemReadiness, renderFinalFoundation, FINAL_FOUNDATION_PACK_VERSION } from './final-foundation-pack.mjs';
import { deriveChartDashboard } from './dashboard-state.mjs';
import { loadEpisodeMemory, saveEpisodeMemory, createEpisode, shouldSampleEpisode, episodeVector, findSimilarEpisodes, summarizeSimilar, matureEpisode } from './episode-memory.mjs';
import { runMechanismTransitionEngine } from './mechanism-transition-engine.mjs';
import { fetchIndependentWitnesses, okxInstrument, krakenPair } from './independent-witness-network.mjs';
import { openAuditLedger, appendAuditRecord, auditMarketSnapshot, auditWitnessReport, auditEngineResult, determineSafetyState, buildResearchEnvelope, replayEnvelopeIntegrity, ledgerTailSummary, sha256, INSTITUTIONAL_KERNEL_VERSION } from './institutional-kernel.mjs';
import { openMarketDataFabric, appendMarketEvents, createMarketEventInput, verifyMarketEventChain, marketFabricSummary, MARKET_DATA_FABRIC_VERSION } from './market-data-fabric.mjs';
import { reconstructInstitutionalState, replaySummary, DETERMINISTIC_REPLAY_VERSION } from './deterministic-replay.mjs';
import { buildRuntimeManifest, openReleaseRegistry, registerRuntimeRelease, verifyReleaseRegistry, releaseRegistrySummary, institutionalRuntimeFiles, RELEASE_REGISTRY_VERSION } from './runtime-release-registry.mjs';
import { createObservability, recordProviderCall, recordOperation, recordSafety, recordResearchTelemetry, recordError, observabilitySnapshot, deriveSloHealth, OBSERVABILITY_VERSION } from './observability.mjs';
import { evaluateOperationalReadiness, OPERATIONAL_READINESS_VERSION } from './operational-readiness.mjs';
import { evaluatePersistenceCompatibility, PERSISTENCE_CONTRACTS_VERSION } from './persistence-contracts.mjs';
import { runPersistenceSmokeTest, PERSISTENCE_SMOKE_VERSION } from './persistence-smoke.mjs';
import { buildForecastLearningSummary, FORECAST_LEARNING_CENTER_VERSION } from './forecast-learning-center.mjs';
import { createShadowCompetition, refreshShadowCompetitionHypotheses, evaluateShadowCompetition, shadowCompetitionSummary, loadShadowCompetition, saveShadowCompetition, FORECAST_SHADOW_COMPETITION_VERSION } from './forecast-shadow-competition.mjs';
import { createExperimentGovernor, evaluateExperimentGovernor, experimentGovernorSummary, loadExperimentGovernor, saveExperimentGovernor, FORECAST_EXPERIMENT_GOVERNOR_VERSION } from './forecast-experiment-governor.mjs';
import { openModelCandidateRegistry, modelCandidateRegistrySummary, MODEL_CANDIDATE_REGISTRY_VERSION } from './model-candidate-registry.mjs';
import { processGovernorPromotionReviews, MODEL_PROMOTION_REVIEW_SERVICE_VERSION } from './model-promotion-review-service.mjs';
import { createFeatureResearchRound, advanceFeatureResearchRound, featureResearchSummary, loadFeatureResearch, saveFeatureResearch, DEFAULT_RESEARCH_FEATURES, WALLET_RESEARCH_FEATURES, FORECAST_FEATURE_RESEARCH_VERSION } from './forecast-feature-research.mjs';
import { buildDerivedResearchIntelligenceFeatures, EXTERNAL_RESEARCH_FEATURE_EXPERIMENTS, DERIVED_INTELLIGENCE_RESEARCH_EXPERIMENTS, PREDICTION_MARKET_RESEARCH_EXPERIMENTS, RESEARCH_INTELLIGENCE_FEATURES_VERSION } from './research-intelligence-features.mjs';
import { runChaosSuite, runChaosScenario, chaosScenarioNames, CHAOS_ENGINEERING_VERSION } from './chaos-engineering.mjs';
import { loadShadowOms, saveShadowOms, normalizeExecutionBook, createShadowOrder, applyAggTrades, markShadowOrder, cancelShadowOrder, shadowOrderSummary, SHADOW_OMS_VERSION, SHADOW_OMS_CAPABILITIES } from './shadow-oms.mjs';
import { deriveAutonomousShadowTrade, AUTONOMOUS_SHADOW_TRADER_VERSION } from './autonomous-shadow-trader.mjs';
import {
  loadShadowPortfolioLedger, saveShadowPortfolioLedger,
  reconcileShadowPortfolioEntries, replaceShadowPortfolioPosition,
  markShadowPosition, closeShadowPosition, shadowPortfolioSummary, shadowResearchProbeSummary,
  shadowPortfolioPeriodStats, shadowPortfolioStatistics,
  SHADOW_PORTFOLIO_LEDGER_VERSION, SHADOW_PORTFOLIO_CAPABILITIES
} from './shadow-portfolio-ledger.mjs';
import {
  evaluateShadowCapitalAcademy, academyTradeBudget,
  SHADOW_CAPITAL_ACADEMY_VERSION
} from './shadow-capital-academy.mjs';
import {
  evaluateShadowTrainingSupervisor, supervisedShadowBudget, renderSupervisorCompact,
  SHADOW_TRAINING_SUPERVISOR_VERSION
} from './shadow-training-supervisor.mjs';
import {
  loadStrategyLeagueLedger, saveStrategyLeagueLedger,
  reconcileStrategyLeagueEntries, replaceStrategyLeaguePosition,
  markStrategyLeaguePosition, closeStrategyLeaguePosition,
  strategyLeagueSummary, deriveStrategyLeagueCandidates,
  SHADOW_STRATEGY_LEAGUE_VERSION, SHADOW_STRATEGIES
} from './shadow-strategy-league.mjs';
import { STRATEGY_EVIDENCE_ENGINE_VERSION } from './strategy-evidence-engine.mjs';
import {
  buildShadowTradeQualityModel, qualityLearnerSummary,
  SHADOW_TRADE_QUALITY_LEARNER_VERSION
} from './shadow-trade-quality-learner.mjs';
import {
  deriveMandatoryShadowDiscovery, MANDATORY_SHADOW_DISCOVERY_VERSION
} from './mandatory-shadow-discovery.mjs';
import {
  createTradeDiscoveryDiagnostics, recordTradeDiscoveryScan, summarizeTradeDiscovery,
  renderTradeDiscoveryDiagnostics, countOpenDiscoveryPositions,
  isMandatoryDiscoveryFallbackReasonAllowed
} from './trade-discovery-diagnostics.mjs';
import {
  deriveCoverageCurriculumCandidates, coverageCurriculumSummary,
  SHADOW_COVERAGE_CURRICULUM_VERSION, DEFAULT_COVERAGE_HORIZONS
} from './shadow-coverage-curriculum.mjs';
import {
  buildLearnedChallengerLab, deriveLearnedChallengerTrades, learnedChallengerSummary,
  LEARNED_CHALLENGER_ENGINE_VERSION
} from './learned-challenger-engine.mjs';
import {
  deriveShadowRegimeFingerprint, buildRegimeStrategyMatrix, regimeDecisionForStrategy,
  regimeBrainSummary, SHADOW_REGIME_BRAIN_VERSION
} from './shadow-regime-brain.mjs';
import {
  buildAdversarialStressLab, stressDecisionForRule, adversarialStressSummary,
  ADVERSARIAL_STRESS_LAB_VERSION
} from './adversarial-stress-lab.mjs';
import { homeText as productHomeText, homeKeyboard as productHomeKeyboard, marketsKeyboard as productMarketsKeyboard, marketProductKeyboard, deepDiveKeyboard, globalIntelKeyboard, renderGlobalIntelFeed, parseProductCallback } from './telegram-product-ui.mjs';
import { buildCommandMarketRows, deliverTelegramTextCard } from './telegram-ui-runtime.mjs';
import { createAlert, evaluateAlert, formatAlert, requiredContext, ALERT_ENGINE_VERSION } from './alert-engine.mjs';
import { loadEvidenceHistory, saveEvidenceHistory, evidenceHistoryFor, EVIDENCE_HISTORY_VERSION } from './evidence-history.mjs';
import { formatValidityReason, STATE_VALIDITY_VERSION, DEFAULT_STATE_VALIDITY_CONFIG } from './state-validity.mjs';
import { latestEvidenceSnapshot, currentEvidenceLifecycle, advanceEvidenceLifecycle, compactValidity, RESEARCH_LIFECYCLE_VERSION } from './research-lifecycle.mjs';
import { createMarketDataProvider, MARKET_DATA_PROVIDER_VERSION } from './market-data-provider.mjs';
import { createTelegramCommandRouter, TELEGRAM_COMMAND_ROUTER_VERSION } from './telegram-command-router.mjs';
import { createReadCommandHandlers, TELEGRAM_READ_COMMANDS_VERSION } from './telegram-read-command-handlers.mjs';
import { createMutationCommandHandlers, TELEGRAM_MUTATION_COMMANDS_VERSION } from './telegram-mutation-command-handlers.mjs';
import { createTelegramUpdateDispatcher, TELEGRAM_UPDATE_DISPATCHER_VERSION } from './telegram-update-dispatcher.mjs';
import { createDiscordTelegramBridge, isDiscordChatId } from './discord-telegram-bridge.mjs';
import {
  runForecastShadowEvaluationWorker,
  evaluateShadowWorkerAdmission,
  evaluateAutoLearnMemoryAdmission,
  forecastHistoryProgressAt,
  forecastHistoryHasAdvanced,
  FORECAST_SHADOW_EVALUATION_WORKER_VERSION,
  FORECAST_SHADOW_EVALUATION_ADMISSION_VERSION,
  AUTOLEARN_MEMORY_ADMISSION_VERSION
} from './forecast-shadow-evaluation-client.mjs';
import { normalizeVenueBook, buildShadowSmartRoute, summarizeVenueQuality, SHADOW_SOR_VERSION, SHADOW_SOR_CAPABILITIES } from './multi-venue-shadow-sor.mjs';
import { loadVenueQualityMemory, saveVenueQualityMemory, createVenueQualityObservations, appendVenueQualityObservations, matureVenueQualityObservation, estimateVenueQuality, venueQualitySummary, VENUE_QUALITY_MEMORY_VERSION, VENUE_QUALITY_MEMORY_CAPABILITIES } from './venue-quality-memory.mjs';
import { executionResearchReport, EXECUTION_RESEARCH_LAB_VERSION, EXECUTION_RESEARCH_CAPABILITIES } from './execution-research-lab.mjs';
import { buildCanonicalForecastInput, FORECAST_INPUT_ADAPTER_VERSION } from './forecast-input-adapter.mjs';
import { buildInstitutionalExpansionEvidence, INSTITUTIONAL_EXPANSION_VERSION } from './expansion-runtime/institutional-expansion.mjs';
import { createDexScreenerPublicProvider, DEXSCREENER_PUBLIC_PROVIDER_VERSION } from './expansion-runtime/dexscreener-public-provider.mjs';
import { createPublicMarketContextProvider, PUBLIC_MARKET_CONTEXT_PROVIDER_VERSION } from './expansion-runtime/public-market-context-provider.mjs';
import { createExternalResearchProvider, coinMetricsSnapshotToExtraFeatures, deribitOptionsSnapshotToExtraFeatures, macroSnapshotToExtraFeatures, predictionMarketSnapshotToExtraFeatures, EXTERNAL_RESEARCH_PROVIDER_VERSION } from './expansion-runtime/external-research-provider.mjs';
import { createDerivativesPublicProvider, derivativesSnapshotToExtraFeatures, DERIVATIVES_PUBLIC_PROVIDER_VERSION } from './expansion-runtime/derivatives-public-provider.mjs';
import { createLiquidationPublicStream, liquidationSnapshotToExtraFeatures, LIQUIDATION_PUBLIC_STREAM_VERSION } from './expansion-runtime/liquidation-public-stream.mjs';
import { createOnchainResearchProvider, onchainSnapshotToExtraFeatures, ONCHAIN_RESEARCH_PROVIDER_VERSION } from './expansion-runtime/onchain-research-provider.mjs';
import { createWalletCohortPublicProvider, parseWalletCohorts, walletCohortSnapshotToExtraFeatures, WALLET_COHORT_PUBLIC_PROVIDER_VERSION } from './expansion-runtime/wallet-cohort-public-provider.mjs';
import { fetchOfficialOkxPorRegistryStreaming, loadEntityRegistry, saveEntityRegistry, entityRegistrySummary, VERIFIED_ENTITY_REGISTRY_VERSION } from './expansion-runtime/verified-entity-registry.mjs';
import { buildEntityAddressIndex, createEthereumEntityFlowProvider, loadEntityFlowMemory, saveEntityFlowMemory, observeEntityFlowMemory, scoreEntityFlowSnapshot, entityFlowSnapshotToExtraFeatures, entityFlowMemorySummary, ENTITY_FLOW_ENGINE_VERSION } from './expansion-runtime/entity-flow-engine.mjs';
import { openResearchDataPlane, appendResearchDataPlane, researchFeaturesAsOf, researchDataPlaneSummary, RESEARCH_DATA_PLANE_VERSION } from './research-data-plane.mjs';
import { buildResearchDataPlaneSnapshots, RESEARCH_DATA_PLANE_ADAPTER_VERSION } from './research-data-plane-adapters.mjs';
import { loadResearchDataGovernance, saveResearchDataGovernance, governResearchSnapshot, refreshResearchSourceFreshness, quarantinedResearchSourceKeys, researchDataGovernanceSummary, RESEARCH_DATA_GOVERNANCE_VERSION } from './research-data-governance.mjs';
import { buildResearchDependencyGraph, bindResearchDependencyGateToValidity, RESEARCH_DEPENDENCY_GRAPH_VERSION } from './research-dependency-graph.mjs';
import { buildForecastScienceInputs, FORECAST_RUNTIME_SCIENCE_ADAPTER_VERSION } from './forecast-science-adapter.mjs';
import { deriveForecastRuntimeQuality, renderInstitutionalForecastCard, renderResearchDependencyCard, researchDependencyKeyboard, forecastKeyboard as forecastProductKeyboard, FORECAST_PRODUCT_VERSION } from './forecast-product.mjs';
import { runScientificCore, SCIENTIFIC_CORE_VERSION } from './scientific-core.mjs';
import {
  archiveForecastColdBatch,
  forecastColdArchiveSummary,
  planForecastHotCompaction,
  applyForecastHotCompaction,
  FORECAST_COLD_ARCHIVE_VERSION
} from './forecast-cold-archive.mjs';
import {
  openInstitutionalForecastRuntime,
  saveInstitutionalForecastRuntime,
  seedInstitutionalForecastRuntimeFromEpisodes,
  issueInstitutionalForecast,
  observeInstitutionalForecastRuntime,
  recordCoverageProbeCalibration,
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

const persistenceDataDir=process.env.RAILWAY_VOLUME_MOUNT_PATH||process.env.TCX_DATA_DIR||'/data';
const storageWarnFreeBytes=Math.max(32*1024*1024,Number(process.env.TCX_STORAGE_WARN_FREE_BYTES||96*1024*1024));
const storageCriticalFreeBytes=Math.max(16*1024*1024,Math.min(storageWarnFreeBytes,Number(process.env.TCX_STORAGE_CRITICAL_FREE_BYTES||48*1024*1024)));
const marketFabricArchiveBudgetBytes=Math.max(16*1024*1024,Number(process.env.TCX_MARKET_FABRIC_ARCHIVE_BUDGET_BYTES||80*1024*1024));
const marketFabricColdTargetBytes=Math.max(0,Math.min(
  marketFabricArchiveBudgetBytes,
  Number(process.env.TCX_MARKET_FABRIC_COLD_TARGET_BYTES||32*1024*1024)
));
const marketFabricColdMaxSegmentsPerRun=Math.max(1,Math.min(24,Number(process.env.TCX_MARKET_FABRIC_COLD_MAX_SEGMENTS_PER_RUN||2)));
const marketFabricColdStore=createS3ColdStoreFromEnv();
await cleanupOrphanedPersistenceArtifacts({dataDir:persistenceDataDir});
let startupStorageInventory=await inspectPersistenceStorage({dataDir:persistenceDataDir,topN:24});
let startupColdTier=null;
if(marketFabricColdStore.enabled){
  try{
    startupColdTier=await offloadMarketFabricArchive({
      filePath:process.env.TCX_MARKET_FABRIC_FILE||persistenceDataDir+'/tcx-market-events.jsonl',
      coldStore:marketFabricColdStore,
      maxLocalBytes:marketFabricArchiveBudgetBytes,
      targetLocalBytes:marketFabricColdTargetBytes,
      maxSegmentsPerRun:marketFabricColdMaxSegmentsPerRun
    });
    console.info('[TCX_MARKET_FABRIC_COLD_TIER]',JSON.stringify({...startupColdTier,phase:'startup'}));
    if(startupColdTier.offloadedSegments>0){
      startupStorageInventory=await inspectPersistenceStorage({dataDir:persistenceDataDir,topN:24});
    }
  }catch(err){
    console.error('[TCX_MARKET_FABRIC_COLD_TIER_FAILED]',JSON.stringify({
      phase:'startup',
      error:err instanceof Error?err.message:String(err),
      provider:marketFabricColdStore.summary?.()||null,
      destructiveRetention:false
    }));
  }
}
const startupStoragePressure=await inspectStoragePressure({
  dataDir:persistenceDataDir,
  warnFreeBytes:storageWarnFreeBytes,
  criticalFreeBytes:storageCriticalFreeBytes
});
console.info('[TCX_STORAGE_PRESSURE]',JSON.stringify({...startupStoragePressure,phase:'startup'}));

let storagePressureCache=startupStoragePressure;
let storagePressureCheckedAt=Date.now();
let storagePressureLastBlockLogAt=0;
let marketFabricArchiveBudgetBlocked=Number(startupStorageInventory?.categories?.marketFabricArchive||0)>=marketFabricArchiveBudgetBytes;
let marketFabricArchiveBudgetLastLogAt=0;
const storagePressureCheckMs=Math.max(5000,Math.min(60000,Number(process.env.TCX_STORAGE_PRESSURE_CHECK_MS||15000)));

async function currentStoragePressure(){
  if(Date.now()-storagePressureCheckedAt<storagePressureCheckMs) return storagePressureCache;
  storagePressureCache=await inspectStoragePressure({
    dataDir:persistenceDataDir,
    warnFreeBytes:storageWarnFreeBytes,
    criticalFreeBytes:storageCriticalFreeBytes
  });
  storagePressureCheckedAt=Date.now();
  return storagePressureCache;
}

async function storageWriteAdmission(scope){
  const pressure=await currentStoragePressure();
  const admission=classifyStorageWriteAdmission(pressure,{scope});
  if(!admission.allowed&&Date.now()-storagePressureLastBlockLogAt>=30000){
    storagePressureLastBlockLogAt=Date.now();
    console.error('[TCX_STORAGE_WRITE_BLOCKED]',JSON.stringify({
      ...admission,
      dataDir:persistenceDataDir,
      destructiveRetention:false
    }));
  }
  return admission;
}

const token = process.env.TCX_TELEGRAM_BOT_TOKEN;
if (!token) throw new Error('Missing TCX_TELEGRAM_BOT_TOKEN');
const discordToken = String(process.env.DISCORD_BOT_TOKEN || '').trim();
const discordApplicationId = String(process.env.DISCORD_APPLICATION_ID || '').trim();
const discordGuildId = String(process.env.DISCORD_GUILD_ID || '').trim();
let discordBridge = null;

const telegramApi = `https://api.telegram.org/bot${token}`;
const configuredBinanceBases = process.env.TCX_BINANCE_REST_BASES || process.env.TCX_BINANCE_REST_BASE || '';
const binanceBases = (configuredBinanceBases
  ? configuredBinanceBases.split(',')
  : ['https://data-api.binance.vision','https://api1.binance.com','https://api.binance.com'])
  .map(x => x.trim().replace(/\/+$/, '')).filter(Boolean);
const okxBase = (process.env.TCX_OKX_REST_BASE || 'https://www.okx.com').replace(/\/+$/,'');
const krakenBase = (process.env.TCX_KRAKEN_REST_BASE || 'https://api.kraken.com').replace(/\/+$/,'');

const refreshMs = Math.max(5000, Number(process.env.TCX_TELEGRAM_REFRESH_MS || 10000));
const telegramApiTimeoutMs = Math.max(5000, Number(process.env.TCX_TELEGRAM_API_TIMEOUT_MS || 12000));
const telegramLongPollTimeoutMs = Math.max(30000, Number(process.env.TCX_TELEGRAM_LONG_POLL_TIMEOUT_MS || 35000));
const telegramUpdateTimeoutMs = Math.max(5000, Number(process.env.TCX_TELEGRAM_UPDATE_TIMEOUT_MS || 20000));
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
const autoLearnEnabled = String(process.env.TCX_AUTOLEARN_ENABLED || '1') !== '0';
const autoLearnForecastMs = Math.max(60000, Number(process.env.TCX_AUTOLEARN_FORECAST_MS || 300000));
const autoLearnSweepMs = Math.max(30000, Number(process.env.TCX_AUTOLEARN_SWEEP_MS || 60000));
const autoLearnHeapHeadroomMb = Math.max(280, Math.min(360, Number(process.env.TCX_AUTOLEARN_HEAP_HEADROOM_MB || 320)));
const autoLearnRssHeadroomMb = Math.max(620, Math.min(820, Number(process.env.TCX_AUTOLEARN_RSS_HEADROOM_MB || 720)));
const autoLearnExternalHeadroomMb = Math.max(32, Math.min(160, Number(process.env.TCX_AUTOLEARN_EXTERNAL_HEADROOM_MB || 64)));
const autoLearnMaxIssuedPerSweep = Math.max(1, Math.min(3, Math.floor(Number(process.env.TCX_AUTOLEARN_MAX_ISSUED_PER_SWEEP || 1) || 1)));
const autoLearnInterIssueMs = Math.max(2000, Math.min(15000, Number(process.env.TCX_AUTOLEARN_INTER_ISSUE_MS || 8000)));
const autoLearnResumeHeapMb = Math.max(240, Math.min(autoLearnHeapHeadroomMb-20, Number(process.env.TCX_AUTOLEARN_RESUME_HEAP_MB || 280)));
const autoLearnResumeRssMb = Math.max(450, Math.min(autoLearnRssHeadroomMb-40, Number(process.env.TCX_AUTOLEARN_RESUME_RSS_MB || 620)));
const autoLearnResumeExternalMb = Math.max(16, Math.min(autoLearnExternalHeadroomMb-8, Number(process.env.TCX_AUTOLEARN_RESUME_EXTERNAL_MB || 48)));
const autoLearnMemoryBackoffMs = Math.max(30000, Math.min(180000, Number(process.env.TCX_AUTOLEARN_MEMORY_BACKOFF_MS || 90000)));
const servingGuardHeapMb = Math.max(260, Math.min(380, Number(process.env.TCX_SERVING_GUARD_HEAP_MB || 330)));
const servingGuardRssMb = Math.max(550, Math.min(900, Number(process.env.TCX_SERVING_GUARD_RSS_MB || 720)));
const servingGuardExternalMb = Math.max(24, Math.min(160, Number(process.env.TCX_SERVING_GUARD_EXTERNAL_MB || 64)));
const forecastPersistenceHeapHeadroomMb = Math.max(
  servingGuardHeapMb,
  Math.min(420,Number(process.env.TCX_FORECAST_PERSIST_HEAP_HEADROOM_MB||340))
);
const forecastPersistenceRssHeadroomMb = Math.max(
  550,
  Math.min(servingGuardRssMb,Number(process.env.TCX_FORECAST_PERSIST_RSS_HEADROOM_MB||servingGuardRssMb))
);
const forecastPersistenceExternalHeadroomMb = Math.max(
  24,
  Math.min(servingGuardExternalMb,Number(process.env.TCX_FORECAST_PERSIST_EXTERNAL_HEADROOM_MB||servingGuardExternalMb))
);
const shadowCompetitionEnabled = String(process.env.TCX_SHADOW_COMPETITION_ENABLED || '1') !== '0';
const shadowCompetitionEvalMs = Math.max(15*60_000, Number(process.env.TCX_SHADOW_COMPETITION_EVAL_MS || 60*60_000));
const shadowCompetitionMinSeedRows = Math.max(20, Number(process.env.TCX_SHADOW_COMPETITION_MIN_SEED_ROWS || 40));
const shadowCompetitionMinTrainCases = Math.max(20, Number(process.env.TCX_SHADOW_COMPETITION_MIN_TRAIN_CASES || 40));
const shadowCompetitionWorkerTimeoutMs = Math.max(60_000, Number(process.env.TCX_SHADOW_COMPETITION_WORKER_TIMEOUT_MS || 8*60_000));
const shadowCompetitionWorkerHeapMb = Math.max(128, Math.min(192, Number(process.env.TCX_SHADOW_COMPETITION_WORKER_HEAP_MB || 160)));
const shadowCompetitionWorkerModeRaw=String(process.env.TCX_SHADOW_COMPETITION_SERVING_WORKER_ENABLED||'AUTO').trim().toUpperCase();
const shadowCompetitionWorkerMode=['0','OFF','FALSE','DISABLED'].includes(shadowCompetitionWorkerModeRaw)
  ?'OFF'
  :['1','ON','TRUE','ENABLED'].includes(shadowCompetitionWorkerModeRaw)
    ?'ON'
    :'AUTO';
const shadowCompetitionServingWorkerEnabled=shadowCompetitionWorkerMode!=='OFF';
const shadowCompetitionAutoHeapMb=Math.max(220,Math.min(280,Number(process.env.TCX_SHADOW_COMPETITION_AUTO_HEAP_MB||260)));
const shadowCompetitionAutoRssMb=Math.max(450,Math.min(700,Number(process.env.TCX_SHADOW_COMPETITION_AUTO_RSS_MB||620)));
const shadowCompetitionAutoExternalMb=Math.max(24,Math.min(
  servingGuardExternalMb,
  Number(process.env.TCX_SHADOW_COMPETITION_AUTO_EXTERNAL_MB||servingGuardExternalMb)
));
const shadowCompetitionHardExternalMb=Math.max(
  servingGuardExternalMb,
  Math.min(256,Number(process.env.TCX_SHADOW_COMPETITION_HARD_EXTERNAL_MB||160))
);
const shadowCompetitionHistoryRows=Math.max(500,Math.min(2000,Math.floor(Number(process.env.TCX_SHADOW_COMPETITION_HISTORY_ROWS||1200)||1200)));
const configuredReplicaCount = Math.max(1, Math.floor(Number(process.env.TCX_REPLICA_COUNT || 1) || 1));
const persistentStorageMounted = Boolean(process.env.RAILWAY_VOLUME_MOUNT_PATH || process.env.TCX_PERSISTENCE_CONFIRMED === '1');
const institutionalMarketMaxAgeMs = Math.max(1000, Number(process.env.TCX_INSTITUTIONAL_MARKET_MAX_AGE_MS || 15000));
const shadowWatchMs = Math.max(5000, Number(process.env.TCX_SHADOW_WATCH_MS || 10000));
const shadowDefaultLatencyMs = Math.max(0, Math.min(5000, Number(process.env.TCX_SHADOW_LATENCY_MS || 120)));
const shadowMakerFeeBps = Math.max(0, Number(process.env.TCX_SHADOW_MAKER_FEE_BPS || 10));
const shadowTakerFeeBps = Math.max(0, Number(process.env.TCX_SHADOW_TAKER_FEE_BPS || 10));
const shadowHiddenQueueBufferPct = Math.max(0, Math.min(2, Number(process.env.TCX_SHADOW_HIDDEN_QUEUE_BUFFER_PCT || 0.15)));
const autoShadowTradingEnabled = String(process.env.TCX_AUTO_SHADOW_TRADING_ENABLED || '1') !== '0';
const autoShadowNotionalQuote = Math.max(1, Number(process.env.TCX_AUTO_SHADOW_NOTIONAL_QUOTE || 100));
const autoShadowCooldownMs = Math.max(60_000, Number(process.env.TCX_AUTO_SHADOW_COOLDOWN_MS || 5*60_000));
const autoShadowMaxPerSymbolPerDay = Math.max(1, Math.floor(Number(process.env.TCX_AUTO_SHADOW_MAX_PER_SYMBOL_DAY || 12) || 12));
const autoShadowMaxOpenPerSymbol = Math.max(1, Math.floor(Number(process.env.TCX_AUTO_SHADOW_MAX_OPEN_PER_SYMBOL || 3) || 3));
const autoShadowMaxOpenTotal = Math.max(autoShadowMaxOpenPerSymbol, Math.floor(Number(process.env.TCX_AUTO_SHADOW_MAX_OPEN_TOTAL || 20) || 20));
const autoShadowMemecoinMinExpectedReturn = Math.max(0, Number(process.env.TCX_AUTO_SHADOW_MEME_MIN_EXPECTED_RETURN || 0.0035));
const autoShadowMemecoinMinDirectionalProbability = Math.max(0.5, Math.min(0.99, Number(process.env.TCX_AUTO_SHADOW_MEME_MIN_DIRECTIONAL_PROB || 0.60)));
const autoShadowMemecoinMinProbabilityEdge = Math.max(0, Math.min(0.99, Number(process.env.TCX_AUTO_SHADOW_MEME_MIN_PROB_EDGE || 0.12)));
const autoShadowMinExpectedReturn = Math.max(0, Number(process.env.TCX_AUTO_SHADOW_MIN_EXPECTED_RETURN || 0.002));
const autoShadowMinDirectionalProbability = Math.max(0.5, Math.min(0.99, Number(process.env.TCX_AUTO_SHADOW_MIN_DIRECTIONAL_PROB || 0.55)));
const autoShadowMinProbabilityEdge = Math.max(0, Math.min(0.99, Number(process.env.TCX_AUTO_SHADOW_MIN_PROB_EDGE || 0.08)));
const mandatoryShadowDiscoveryEnabled = String(process.env.TCX_MANDATORY_SHADOW_DISCOVERY_ENABLED || '1') !== '0';
const mandatoryShadowDiscoveryNotional = Math.max(1, Number(process.env.TCX_MANDATORY_SHADOW_DISCOVERY_NOTIONAL || 12));
const mandatoryShadowDiscoveryCooldownMs = Math.max(5*60_000, Number(process.env.TCX_MANDATORY_SHADOW_DISCOVERY_COOLDOWN_MS || 30*60_000));
const mandatoryShadowDiscoveryMaxPerSymbolDay = Math.max(1, Math.floor(Number(process.env.TCX_MANDATORY_SHADOW_DISCOVERY_MAX_PER_SYMBOL_DAY || 4) || 4));
const mandatoryShadowDiscoveryMaxOpenTotal = Math.max(1, Math.floor(Number(process.env.TCX_MANDATORY_SHADOW_DISCOVERY_MAX_OPEN_TOTAL || 6) || 6));
const coverageCurriculumEnabled = String(process.env.TCX_COVERAGE_CURRICULUM_ENABLED || '1') !== '0';
const coverageCurriculumNotional = Math.max(1, Number(process.env.TCX_COVERAGE_CURRICULUM_NOTIONAL || 2));
const coverageCurriculumMaxOpenTotal = Math.max(8, Math.floor(Number(process.env.TCX_COVERAGE_CURRICULUM_MAX_OPEN_TOTAL || 96) || 96));
const coverageCurriculumMaxOpenPerLane = Math.max(1, Math.floor(Number(process.env.TCX_COVERAGE_CURRICULUM_MAX_OPEN_PER_LANE || 2) || 2));
const forecastJournalMaxEntries = Math.max(1000, Math.min(3000, Math.floor(Number(process.env.TCX_FORECAST_JOURNAL_MAX_ENTRIES || 1500) || 1500)));
const forecastAuditMaxEvents = Math.max(200, Math.floor(Number(process.env.TCX_FORECAST_AUDIT_MAX_EVENTS || 1000) || 1000));
const forecastMaxIssuances = Math.max(300, Math.floor(Number(process.env.TCX_FORECAST_MAX_ISSUANCES || 1500) || 1500));
const forecastMaxTracked = Math.max(300, Math.floor(Number(process.env.TCX_FORECAST_MAX_TRACKED || 1200) || 1200));
const forecastHotIssuances = Math.max(200, Math.min(800, Math.floor(Number(process.env.TCX_FORECAST_HOT_ISSUANCES || 400) || 400)));
const forecastHotTracked = Math.max(200, Math.min(800, Math.floor(Number(process.env.TCX_FORECAST_HOT_TRACKED || 400) || 400)));
const forecastColdBatchThreshold = Math.max(50, Math.min(300, Math.floor(Number(process.env.TCX_FORECAST_COLD_BATCH_THRESHOLD || 100) || 100)));
const forecastColdMinAgeMs = Math.max(4*60*60_000, Math.min(24*60*60_000, Number(process.env.TCX_FORECAST_COLD_MIN_AGE_MS || 6*60*60_000)));
const researchPlaneMaxMemoryRecords = Math.max(1500, Math.min(5000, Math.floor(Number(process.env.TCX_RESEARCH_DATA_PLANE_MAX_MEMORY_RECORDS || 3000) || 3000)));
const marketFabricMaxMemoryEvents = Math.max(2000, Math.min(8000, Math.floor(Number(process.env.TCX_MARKET_FABRIC_MAX_MEMORY_EVENTS || 4000) || 4000)));
const auditLedgerMaxMemoryRecords = Math.max(50, Math.min(2000, Math.floor(Number(process.env.TCX_AUDIT_LEDGER_MAX_MEMORY_RECORDS || 500) || 500)));
const auditLedgerMaxBytes = Math.max(48*1024*1024, Math.min(128*1024*1024, Number(process.env.TCX_AUDIT_LEDGER_MAX_BYTES || 64*1024*1024)));
const learnedChallengerEnabled = String(process.env.TCX_LEARNED_CHALLENGER_ENABLED || '1') !== '0';
const learnedChallengerBaseNotional = Math.max(1, Number(process.env.TCX_LEARNED_CHALLENGER_BASE_NOTIONAL || 10));
const learnedChallengerMaxPerIssuance = Math.max(1, Math.min(3, Math.floor(Number(process.env.TCX_LEARNED_CHALLENGER_MAX_PER_ISSUANCE || 2) || 2)));
const learnedChallengerMaxOpenTotal = Math.max(1, Math.floor(Number(process.env.TCX_LEARNED_CHALLENGER_MAX_OPEN_TOTAL || 8) || 8));
const learnedChallengerMaxOpenPerSymbol = Math.max(1, Math.floor(Number(process.env.TCX_LEARNED_CHALLENGER_MAX_OPEN_PER_SYMBOL || 2) || 2));
const learnedChallengerCooldownMs = Math.max(5*60_000, Number(process.env.TCX_LEARNED_CHALLENGER_COOLDOWN_MS || 30*60_000));
const shadowPortfolioWatchMs = Math.max(5000, Number(process.env.TCX_SHADOW_PORTFOLIO_WATCH_MS || 10000));
const shadowPortfolioInitialEquity = Math.max(100, Number(process.env.TCX_SHADOW_PORTFOLIO_INITIAL_EQUITY || 10000));
const shadowStatsTimeZone = String(process.env.TCX_STATS_TIMEZONE || 'Europe/Berlin');
const strategyLeagueEnabled = String(process.env.TCX_STRATEGY_LEAGUE_ENABLED || '1') !== '0';
const strategyLeagueWatchMs = Math.max(5000, Number(process.env.TCX_STRATEGY_LEAGUE_WATCH_MS || 10000));
const strategyLeagueBaseNotionalQuote = Math.max(1, Number(process.env.TCX_STRATEGY_LEAGUE_BASE_NOTIONAL || 50));
const strategyLeagueInitialEquity = Math.max(100, Number(process.env.TCX_STRATEGY_LEAGUE_INITIAL_EQUITY || 5000));
const strategyLeagueMaxOpenPerStrategy = Math.max(1, Math.floor(Number(process.env.TCX_STRATEGY_LEAGUE_MAX_OPEN_PER_STRATEGY || 4) || 4));
const strategyLeagueMaxOpenPerStrategySymbol = Math.max(1, Math.floor(Number(process.env.TCX_STRATEGY_LEAGUE_MAX_OPEN_PER_STRATEGY_SYMBOL || 1) || 1));
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
  'BTCUSDT,ETHUSDT,SOLUSDT,BNBUSDT,XRPUSDT,DOGEUSDT,ADAUSDT,LINKUSDT,AVAXUSDT,DOTUSDT,LTCUSDT,TRXUSDT,PEPEUSDT,SHIBUSDT,BONKUSDT,WIFUSDT,FLOKIUSDT')
  .split(',').map(x => x.trim().toUpperCase()).filter(Boolean);
const autoLearnSymbols = (process.env.TCX_AUTOLEARN_SYMBOLS || requestedSymbols.join(','))
  .split(',').map(x=>x.trim().toUpperCase()).filter(x=>requestedSymbols.includes(x));
const MEMECOIN_CEX_SYMBOLS=new Set(
  (process.env.TCX_MEMECOIN_CEX_SYMBOLS||'DOGEUSDT,PEPEUSDT,SHIBUSDT,BONKUSDT,WIFUSDT,FLOKIUSDT')
    .split(',').map(x=>x.trim().toUpperCase()).filter(Boolean)
);

const MARKET_META = {
  BTCUSDT:['₿','BTC'], ETHUSDT:['Ξ','ETH'], SOLUSDT:['◎','SOL'], BNBUSDT:['🟡','BNB'],
  XRPUSDT:['✕','XRP'], DOGEUSDT:['Ð','DOGE'], ADAUSDT:['₳','ADA'], LINKUSDT:['⬡','LINK'],
  AVAXUSDT:['🔺','AVAX'], DOTUSDT:['●','DOT'], LTCUSDT:['Ł','LTC'], TRXUSDT:['◆','TRX'],
  PEPEUSDT:['🐸','PEPE'], SHIBUSDT:['🐕','SHIB'], BONKUSDT:['🦴','BONK'],
  WIFUSDT:['🎩','WIF'], FLOKIUSDT:['🐕','FLOKI']
};

const markets = requestedSymbols.map(symbol => ({
  symbol,
  icon: MARKET_META[symbol]?.[0] || '•',
  label: MARKET_META[symbol]?.[1] || symbol.replace('USDT','')
}));

function servingMemoryPressure(){
  const m=process.memoryUsage();
  const heapUsedMb=Math.round(m.heapUsed/1024/1024);
  const rssMb=Math.round(m.rss/1024/1024);
  const externalMb=Math.round(m.external/1024/1024);
  return {
    pressured:heapUsedMb>=servingGuardHeapMb||rssMb>=servingGuardRssMb||externalMb>=servingGuardExternalMb,
    heapUsedMb,rssMb,externalMb,
    thresholds:{heapUsedMb:servingGuardHeapMb,rssMb:servingGuardRssMb,externalMb:servingGuardExternalMb}
  };
}

const sessions = new Map();
const witnessCache = new Map();
const radarCache = new Map();
const researchAlertContextCache = new Map();
const observability = createObservability({sampleLimit:500});
const tradeDiscoveryDiagnostics=createTradeDiscoveryDiagnostics({maxSymbols:32});
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
const dexScreenerProvider=createDexScreenerPublicProvider({fetchImpl:globalThis.fetch});
const publicMarketContextProvider=createPublicMarketContextProvider({fetchImpl:globalThis.fetch});
const derivativesResearchProvider=createDerivativesPublicProvider({fetchImpl:globalThis.fetch});
const externalResearchProvider=createExternalResearchProvider({
  fetchImpl:globalThis.fetch,
  fredApiKey:process.env.TCX_FRED_API_KEY||'',
  polymarketMarkets:process.env.TCX_POLYMARKET_MARKETS_JSON||'{}'
});
const liquidationResearchStream=createLiquidationPublicStream({symbols:autoLearnSymbols});
const onchainResearchProvider=createOnchainResearchProvider({
  fetchImpl:globalThis.fetch,
  ethereumRpcUrl:process.env.TCX_ETHEREUM_RPC_URL||'https://ethereum-rpc.publicnode.com',
  solanaRpcUrl:process.env.TCX_SOLANA_RPC_URL||'https://api.mainnet-beta.solana.com'
});
const entityRegistryFile=process.env.TCX_ENTITY_REGISTRY_FILE||'/data/tcx-entity-registry.json';
const okxPorSource=Object.freeze({
  url:process.env.TCX_OKX_POR_URL||'https://static.okx.com/cdn/okx/por/chain/por_csv_2026090800_V1.zip',
  reportId:process.env.TCX_OKX_POR_REPORT_ID||'502299735',
  reportDate:process.env.TCX_OKX_POR_REPORT_DATE||'2026-09-08'
});
let entityRegistry=await loadEntityRegistry(entityRegistryFile,{maxBytes:20*1024*1024});
let entityRegistryRefreshError=null;
const entityRegistryRefreshEnabled=String(process.env.TCX_ENTITY_REGISTRY_REFRESH_ENABLED||'1')!=='0';
if(entityRegistryRefreshEnabled){
  try{
    const fresh=await fetchOfficialOkxPorRegistryStreaming({
      fetchImpl:globalThis.fetch,
      url:okxPorSource.url,
      reportId:okxPorSource.reportId,
      reportDate:okxPorSource.reportDate,
      timeoutMs:30000,
      allowedChains:['BITCOIN','ETHEREUM','SOLANA'],
      maxEntriesPerChain:5000,
      maxExpandedBytes:300*1024*1024
    });
    entityRegistry=fresh;
    await saveEntityRegistry(entityRegistryFile,entityRegistry);
  }catch(err){
    entityRegistryRefreshError=err instanceof Error?err.message:String(err);
    recordError(observability,{scope:'entity_registry.refresh',message:entityRegistryRefreshError});
  }
}else if(!entityRegistry){
  entityRegistryRefreshError='LIVE_REFRESH_DISABLED_BY_CONFIG';
}
const entityFlowAddressIndex=buildEntityAddressIndex(entityRegistry||{entries:[]},{
  chain:'ETHEREUM',
  allowedEntityTypes:['EXCHANGE'],
  requireOfficialSource:true
});
const entityFlowEntityIds=[...entityFlowAddressIndex.entityMeta.keys()];
const entityFlowMemoryFile=process.env.TCX_ENTITY_FLOW_MEMORY_FILE||'/data/tcx-entity-flow-memory.json';
let entityFlowMemory=await loadEntityFlowMemory(entityFlowMemoryFile);
const entityFlowResearchProvider=createEthereumEntityFlowProvider({
  fetchImpl:globalThis.fetch,
  rpcUrl:process.env.TCX_ETHEREUM_RPC_URL||'https://ethereum-rpc.publicnode.com',
  addressIndex:entityFlowAddressIndex,
  entityIds:entityFlowEntityIds,
  maxBlocks:96,
  batchSize:6,
  timeoutMs:15000,
  cacheMs:45000
});
const manuallyConfiguredWalletCohorts=parseWalletCohorts(process.env.TCX_WALLET_RESEARCH_COHORTS_JSON||'');
const walletCohortResearchProvider=createWalletCohortPublicProvider({
  fetchImpl:globalThis.fetch,
  cohorts:manuallyConfiguredWalletCohorts,
  ethereumRpcUrl:process.env.TCX_ETHEREUM_RPC_URL||'https://ethereum-rpc.publicnode.com',
  solanaRpcUrl:process.env.TCX_SOLANA_RPC_URL||'https://api.mainnet-beta.solana.com'
});
const predictionMarketResearchEnabled=(()=>{
  try{
    const cfg=JSON.parse(process.env.TCX_POLYMARKET_MARKETS_JSON||'{}');
    return Boolean(cfg&&typeof cfg==='object'&&Object.keys(cfg).length);
  }catch{return false;}
})();
const activeFeatureResearchFeatures=[
  ...DEFAULT_RESEARCH_FEATURES,
  ...EXTERNAL_RESEARCH_FEATURE_EXPERIMENTS,
  ...DERIVED_INTELLIGENCE_RESEARCH_EXPERIMENTS,
  ...(predictionMarketResearchEnabled?PREDICTION_MARKET_RESEARCH_EXPERIMENTS:[]),
  ...(walletCohortResearchProvider.configuredCohorts>0?WALLET_RESEARCH_FEATURES:[])
];
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
const configuredForecastRuntimeFile=process.env.TCX_FORECAST_RUNTIME_FILE||null;
const forecastRuntimeFile=configuredForecastRuntimeFile||'/data/tcx-forecast-runtime.v2.json.gz';
const forecastRuntimeLegacyFile=configuredForecastRuntimeFile?null:'/data/tcx-forecast-runtime.json';
const forecastRuntime = await openInstitutionalForecastRuntime(forecastRuntimeFile,{
  legacyFilePath:forecastRuntimeLegacyFile,
  snapshotCompression:'gzip',
  maxHistoryRows:Math.max(2000,Math.min(8000,Math.floor(Number(process.env.TCX_FORECAST_MAX_HISTORY_ROWS||2000)))),
  maxSnapshotBytes:Math.max(64*1024*1024,Math.min(96*1024*1024,Math.floor(Number(process.env.TCX_FORECAST_MAX_SNAPSHOT_BYTES||80*1024*1024)))),
  maxJournalEntries:forecastJournalMaxEntries,
  maxAuditEvents:forecastAuditMaxEvents,
  maxIssuances:forecastMaxIssuances,
  maxTrackedForecasts:forecastMaxTracked,
  maxCalibrationRows:Math.max(300,Math.floor(Number(process.env.TCX_FORECAST_MAX_CALIBRATION_ROWS||1200))),
  maxReliabilityRows:Math.max(300,Math.floor(Number(process.env.TCX_FORECAST_MAX_RELIABILITY_ROWS||1200))),
  maxModelPerformanceRows:Math.max(1000,Math.floor(Number(process.env.TCX_FORECAST_MAX_MODEL_PERFORMANCE_ROWS||4000))),
  maxIntervalCalibrationRows:Math.max(300,Math.floor(Number(process.env.TCX_FORECAST_MAX_INTERVAL_ROWS||1200))),
  maxDriftRows:Math.max(500,Math.floor(Number(process.env.TCX_FORECAST_MAX_DRIFT_ROWS||1500)))
});
const forecastColdArchiveDir=process.env.TCX_FORECAST_COLD_ARCHIVE_DIR||forecastRuntimeFile+'.cold';
let forecastColdArchiveState=await forecastColdArchiveSummary(forecastColdArchiveDir);

async function compactForecastRuntimeToCold(reason='maintenance'){
  const plan=planForecastHotCompaction(forecastRuntime,{
    now:Date.now(),
    maxHotIssuances:forecastHotIssuances,
    maxHotTracked:forecastHotTracked,
    batchThreshold:forecastColdBatchThreshold,
    minColdAgeMs:forecastColdMinAgeMs
  });
  if(!plan.coldIssuances.length&&!plan.coldTrackerRecords.length){
    return {changed:false,reason:'NO_DUE_COLD_ROWS',before:plan.before,after:plan.before,archive:null};
  }
  try{
    const archive=await archiveForecastColdBatch({
      dir:forecastColdArchiveDir,
      issuances:plan.coldIssuances,
      trackerRecords:plan.coldTrackerRecords,
      archivedAt:Date.now()
    });
    const applied=applyForecastHotCompaction(forecastRuntime,plan);
    forecastColdArchiveState=await forecastColdArchiveSummary(forecastColdArchiveDir);
    console.info('[TCX_FORECAST_COLD_ARCHIVE]',JSON.stringify({
      version:FORECAST_COLD_ARCHIVE_VERSION,
      reason,
      archived:{issuances:archive.issuances,trackerRecords:archive.trackerRecords,duplicate:archive.duplicate===true},
      removed:{issuances:applied.removedIssuances,trackerRecords:applied.removedTrackerRecords},
      hot:applied.after,
      cold:forecastColdArchiveState
    }));
    return {changed:applied.removedIssuances>0||applied.removedTrackerRecords>0,before:plan.before,after:applied.after,archive};
  }catch(err){
    const message=err instanceof Error?err.message:String(err);
    console.error('[TCX_FORECAST_COLD_ARCHIVE_ERROR]',JSON.stringify({reason,error:message}));
    return {changed:false,reason:'ARCHIVE_FAILED',before:plan.before,after:plan.before,error:message,archive:null};
  }
}
const forecastBootColdCompaction=await compactForecastRuntimeToCold('startup');
const forecastSeedAtBoot = seedInstitutionalForecastRuntimeFromEpisodes(forecastRuntime,episodes);
const shadowCompetitionFile = process.env.TCX_SHADOW_COMPETITION_FILE || '/data/tcx-shadow-competition.json';
let shadowCompetitionState = await loadShadowCompetition(shadowCompetitionFile);
let shadowCompetitionLastHistorySize = Number(shadowCompetitionState?.evaluatedHistoryRows||0);
let shadowCompetitionLastHistoryProgressAt=0;
let shadowCompetitionWorkerRuns=0;
let shadowCompetitionWorkerMemoryDeferrals=0;
let shadowCompetitionWorkerNoChangeSkips=0;
let shadowCompetitionWorkerLastDecision=null;
const experimentGovernorFile = process.env.TCX_EXPERIMENT_GOVERNOR_FILE || '/data/tcx-experiment-governor.json';
let experimentGovernorState = await loadExperimentGovernor(experimentGovernorFile);
const modelCandidateRegistryFile=process.env.TCX_MODEL_CANDIDATE_REGISTRY_FILE||'/data/tcx-model-candidate-registry.jsonl';
const modelCandidateRegistry=await openModelCandidateRegistry(modelCandidateRegistryFile);
let modelPromotionReviewLastSummary=null;
const featureResearchFile = process.env.TCX_FEATURE_RESEARCH_FILE || '/data/tcx-feature-research.json';
let featureResearchState = await loadFeatureResearch(featureResearchFile);
const evidenceHistoryFile = process.env.TCX_EVIDENCE_HISTORY_FILE || '/data/tcx-evidence-history.json';
const loadedEvidenceHistory = await loadEvidenceHistory(evidenceHistoryFile);
let evidenceRecords = loadedEvidenceHistory.records;
const auditFile = process.env.TCX_AUDIT_LEDGER_FILE || '/data/tcx-audit-ledger.jsonl';
const auditLedger = await openAuditLedger(auditFile,{
  maxInMemoryRecords:auditLedgerMaxMemoryRecords,
  maxFileBytes:auditLedgerMaxBytes
});
const marketFabricFile = process.env.TCX_MARKET_FABRIC_FILE || '/data/tcx-market-events.jsonl';
const marketFabricCheckpointRecovery=await reconcileMarketFabricCheckpointFromArchive(marketFabricFile);
if(marketFabricCheckpointRecovery.reconciled){
  console.warn('[TCX_MARKET_FABRIC_CHECKPOINT_RECONCILED]',JSON.stringify(marketFabricCheckpointRecovery));
}
let marketFabric = await openMarketDataFabric(marketFabricFile,{maxInMemoryEvents:marketFabricMaxMemoryEvents});
if(marketFabric.healthy){
  const rotation=await rotateVerifiedMarketFabric({filePath:marketFabricFile,maxBytes:Number(process.env.TCX_MARKET_FABRIC_ROTATE_BYTES||220*1024*1024),verification:marketFabric.verification});
  if(rotation.rotated){
    console.info('[TCX_MARKET_FABRIC_ROTATED]',JSON.stringify({version:MARKET_FABRIC_ROTATION_VERSION,lastSeq:rotation.lastSeq,archivedBytes:rotation.archivedBytes,segment:rotation.archivedSegment}));
    marketFabric=await openMarketDataFabric(marketFabricFile,{maxInMemoryEvents:marketFabricMaxMemoryEvents});
  }
  const archive=await archiveMarketFabricSegments({
    filePath:marketFabricFile,
    maxArchivedBytes:Number(process.env.TCX_MARKET_FABRIC_ARCHIVE_BUDGET_BYTES||120*1024*1024),
    migrateExisting:false
  });
  if(archive.segments||archive.budgetExceeded) console.info('[TCX_MARKET_FABRIC_ARCHIVE]',JSON.stringify(archive));
}
const researchDataPlaneFile=process.env.TCX_RESEARCH_DATA_PLANE_FILE||'/data/tcx-research-data-plane.jsonl';
const researchDataPlane=await openResearchDataPlane(researchDataPlaneFile,{
  maxInMemoryRecords:researchPlaneMaxMemoryRecords,
  warnBytes:Number(process.env.TCX_RESEARCH_DATA_PLANE_WARN_BYTES||125829120),
  hardBytes:Number(process.env.TCX_RESEARCH_DATA_PLANE_HARD_BYTES||167772160)
});
const researchGovernanceFile=process.env.TCX_RESEARCH_GOVERNANCE_FILE||'/data/tcx-research-governance.json';
let researchDataGovernance=await loadResearchDataGovernance(researchGovernanceFile);
let researchGovernanceHealthy=true;
let researchGovernanceLastError=researchDataGovernance.lastLoadError||null;
const researchGovernanceMonitorStartedAt=Date.now();
const releaseRegistryFile = process.env.TCX_RELEASE_REGISTRY_FILE || '/data/tcx-release-registry.jsonl';
const releaseRegistry = await openReleaseRegistry(releaseRegistryFile);
const shadowOmsFile = process.env.TCX_SHADOW_OMS_FILE || '/data/tcx-shadow-oms.json';
const loadedShadowOms = await loadShadowOms(shadowOmsFile);
const shadowPortfolioFile = process.env.TCX_SHADOW_PORTFOLIO_FILE || '/data/tcx-shadow-portfolio.json';
const loadedShadowPortfolio = await loadShadowPortfolioLedger(shadowPortfolioFile,{initialEquityQuote:shadowPortfolioInitialEquity});
const strategyLeagueFile = process.env.TCX_STRATEGY_LEAGUE_FILE || '/data/tcx-strategy-league.json';
const loadedStrategyLeague = await loadStrategyLeagueLedger(strategyLeagueFile,{initialEquityPerStrategy:strategyLeagueInitialEquity});
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
let shadowPortfolioLedger = loadedShadowPortfolio.ledger;
let shadowPortfolioHealthy = loadedShadowPortfolio.healthy;
let shadowPortfolioLastError = loadedShadowPortfolio.error || null;
let shadowPortfolioPersistenceQueue = Promise.resolve();
let strategyLeagueLedger = loadedStrategyLeague.ledger;
let strategyLeagueHealthy = loadedStrategyLeague.healthy;
let strategyLeagueLastError = loadedStrategyLeague.error || null;
let strategyLeaguePersistenceQueue = Promise.resolve();
let marketFabricAppendQueue = Promise.resolve();
let marketFabricMaintenanceQueue = Promise.resolve();
let marketFabricLastMaintenanceAt = 0;
const marketFabricMaintenanceMs = Math.max(60000, Number(process.env.TCX_MARKET_FABRIC_MAINTENANCE_MS || 60000));
let auditAppendQueue = Promise.resolve();
let researchDataPlaneAppendQueue=Promise.resolve();
let activeBackgroundResearchJob=null;
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
  shadowPortfolio:{
    version:SHADOW_PORTFOLIO_LEDGER_VERSION,
    canExecuteLive:false,
    initialEquityQuote:shadowPortfolioInitialEquity,
    watchMs:shadowPortfolioWatchMs,
    objective:'MEASURE_AUTONOMOUS_SHADOW_STRATEGY_PNL_AND_DRAWDOWN'
  },
  strategyLeague:{
    version:SHADOW_STRATEGY_LEAGUE_VERSION,
    evidenceEngineVersion:STRATEGY_EVIDENCE_ENGINE_VERSION,
    canExecuteLive:false,
    enabled:strategyLeagueEnabled,
    strategies:SHADOW_STRATEGIES.map(x=>x.id),
    initialEquityPerStrategy:strategyLeagueInitialEquity,
    watchMs:strategyLeagueWatchMs,
    objective:'INDEPENDENT_VIRTUAL_STRATEGY_COMPETITION_AND_EVIDENCE_WEIGHTED_ALLOCATION'
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
  },
  researchDataGovernance:{
    version:RESEARCH_DATA_GOVERNANCE_VERSION,
    objective:'SOURCE_QUALITY_AND_POINT_IN_TIME_DATA_CONTROL',
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
      marketFabricArchive:MARKET_FABRIC_ARCHIVE_VERSION,
      marketFabricColdStore:MARKET_FABRIC_COLD_STORE_VERSION,
      marketFabricColdTier:MARKET_FABRIC_COLD_TIER_VERSION,
      deterministicReplay:DETERMINISTIC_REPLAY_VERSION,
      releaseRegistry:RELEASE_REGISTRY_VERSION,
      observability:OBSERVABILITY_VERSION,
      operationalReadiness:OPERATIONAL_READINESS_VERSION,
      persistenceContracts:PERSISTENCE_CONTRACTS_VERSION,
      chaosEngineering:CHAOS_ENGINEERING_VERSION,
      shadowOms:SHADOW_OMS_VERSION,
      shadowPortfolio:SHADOW_PORTFOLIO_LEDGER_VERSION,
      strategyLeague:SHADOW_STRATEGY_LEAGUE_VERSION,
      strategyEvidence:STRATEGY_EVIDENCE_ENGINE_VERSION,
      shadowTradeQualityLearner:SHADOW_TRADE_QUALITY_LEARNER_VERSION,
      mandatoryShadowDiscovery:MANDATORY_SHADOW_DISCOVERY_VERSION,
      shadowCoverageCurriculum:SHADOW_COVERAGE_CURRICULUM_VERSION,
      learnedChallengerEngine:LEARNED_CHALLENGER_ENGINE_VERSION,
      shadowRegimeBrain:SHADOW_REGIME_BRAIN_VERSION,
      adversarialStressLab:ADVERSARIAL_STRESS_LAB_VERSION,
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
      forecastProduct:FORECAST_PRODUCT_VERSION,
      researchDataPlane:RESEARCH_DATA_PLANE_VERSION,
      researchDataGovernance:RESEARCH_DATA_GOVERNANCE_VERSION
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
let forecastRuntimePersistTimer=null;
let forecastRuntimePersistRunning=null;
let forecastRuntimePersistDirty=false;
let forecastRuntimePersistLastAt=0;
let forecastRuntimePersistReason='mutation';

function scheduleForecastRuntimePersist(delayMs){
  if(forecastRuntimePersistTimer) return;
  forecastRuntimePersistTimer=setTimeout(()=>{
    forecastRuntimePersistTimer=null;
    void flushForecastRuntimePersistence();
  },Math.max(0,delayMs));
  forecastRuntimePersistTimer.unref?.();
}

async function flushForecastRuntimePersistence(force=false){
  if(forecastRuntimePersistRunning) return forecastRuntimePersistRunning;
  if(!forecastRuntimePersistDirty||!forecastRuntime.healthy) return false;
  const beforeMemory=process.memoryUsage();
  const persistenceAdmission=evaluateAutoLearnMemoryAdmission({
    phase:'ISSUE',
    heapUsedMb:Math.round(beforeMemory.heapUsed/1024/1024),
    rssMb:Math.round(beforeMemory.rss/1024/1024),
    externalMb:Math.round(beforeMemory.external/1024/1024),
    issueHeapMb:forecastPersistenceHeapHeadroomMb,
    issueRssMb:forecastPersistenceRssHeadroomMb,
    issueExternalMb:forecastPersistenceExternalHeadroomMb
  });
  if(!force&&!persistenceAdmission.allowed){
    console.warn('forecast runtime persistence deferred for memory headroom',JSON.stringify({
      ...persistenceAdmission.memory,
      arrayBuffersMb:Math.round((beforeMemory.arrayBuffers||0)/1024/1024),
      exceeded:persistenceAdmission.exceeded,
      threshold:persistenceAdmission.limits
    }));
    scheduleForecastRuntimePersist(15000);
    return false;
  }
  const waitMs=force?0:Math.max(0,30000-(Date.now()-forecastRuntimePersistLastAt));
  if(waitMs>0){scheduleForecastRuntimePersist(waitMs);return false;}
  forecastRuntimePersistDirty=false;
  const reason=forecastRuntimePersistReason;
  forecastRuntimePersistRunning=(async()=>{
    const started=Date.now();
    try{
      const coldCompaction=await compactForecastRuntimeToCold(reason);
      const snapshotMeta=await saveInstitutionalForecastRuntime(forecastRuntime);
      forecastRuntime.lastError=null;
      forecastRuntimePersistLastAt=Date.now();
      const m=process.memoryUsage();
      console.log('forecast runtime snapshot persisted',JSON.stringify({
        reason,durationMs:Date.now()-started,
        bytes:snapshotMeta?.bytes||null,
        logicalBytes:snapshotMeta?.logicalBytes||null,
        encoding:snapshotMeta?.encoding||forecastRuntime.snapshotEncoding||null,
        compressionRatio:snapshotMeta?.compressionRatio??null,
        maxSnapshotBytes:snapshotMeta?.maxSnapshotBytes||forecastRuntime.maxSnapshotBytes||null,
        snapshotBudgetUtilization:snapshotMeta?.logicalBytes&&forecastRuntime.maxSnapshotBytes?snapshotMeta.logicalBytes/forecastRuntime.maxSnapshotBytes:null,
        heapUsedMb:Math.round(m.heapUsed/1024/1024),
        rssMb:Math.round(m.rss/1024/1024),
        externalMb:Math.round(m.external/1024/1024),
        arrayBuffersMb:Math.round((m.arrayBuffers||0)/1024/1024),
        historyRows:forecastRuntime.engine.historySize(),
        journalRows:forecastRuntime.journal.entries.length,
        cacheRows:{calibration:forecastRuntime.engine.calibration.rows.length,reliability:forecastRuntime.engine.reliability.rows.length,modelPerformance:forecastRuntime.engine.modelPerformance.rows.length,interval:forecastRuntime.engine.intervalCalibration.rows.length,drift:forecastRuntime.engine.drift.rows.length},
        issuanceStore:snapshotMeta?.issuanceStore??null,
        trackerArchive:snapshotMeta?.trackerArchive??null,
        engineStore:snapshotMeta?.engineStore??null,
        journalStore:snapshotMeta?.journalStore??null,
        persistenceManifest:snapshotMeta?.persistenceManifest??null,
        componentProfile:snapshotMeta?.componentProfile??null,
        coldCompaction:coldCompaction?.changed?{
          before:coldCompaction.before,
          after:coldCompaction.after,
          archivedIssuances:coldCompaction.archive?.issuances||0,
          archivedTrackerRecords:coldCompaction.archive?.trackerRecords||0
        }:null
      }));
      return true;
    }catch(err){
      forecastRuntime.healthy=false;
      forecastRuntime.lastError=err instanceof Error?err.message:String(err);
      recordError(observability,{scope:'forecast_runtime.persistence',message:forecastRuntime.lastError});
      console.error('forecast runtime persistence error',reason,forecastRuntime.lastError);
      return false;
    }finally{
      forecastRuntimePersistRunning=null;
      if(forecastRuntimePersistDirty){
        const remaining=Math.max(0,30000-(Date.now()-forecastRuntimePersistLastAt));
        scheduleForecastRuntimePersist(remaining);
      }
    }
  })();
  return forecastRuntimePersistRunning;
}

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

async function persistShadowPortfolio(reason='mutation') {
  shadowPortfolioPersistenceQueue = shadowPortfolioPersistenceQueue.then(async()=>{
    if(!shadowPortfolioHealthy) return false;
    try{
      shadowPortfolioLedger = await saveShadowPortfolioLedger(shadowPortfolioFile,shadowPortfolioLedger,{maxPositions:5000});
      shadowPortfolioLastError=null;
      return true;
    }catch(err){
      shadowPortfolioHealthy=false;
      shadowPortfolioLastError=err instanceof Error?err.message:String(err);
      recordError(observability,{scope:'shadow_portfolio.persistence',message:shadowPortfolioLastError});
      console.error('shadow portfolio persistence error',reason,shadowPortfolioLastError);
      return false;
    }
  });
  return shadowPortfolioPersistenceQueue;
}

async function persistStrategyLeague(reason='mutation'){
  strategyLeaguePersistenceQueue = strategyLeaguePersistenceQueue.then(async()=>{
    if(!strategyLeagueHealthy) return false;
    try{
      strategyLeagueLedger = await saveStrategyLeagueLedger(strategyLeagueFile,strategyLeagueLedger,{maxPositions:20000});
      strategyLeagueLastError=null;
      return true;
    }catch(err){
      strategyLeagueHealthy=false;
      strategyLeagueLastError=err instanceof Error?err.message:String(err);
      recordError(observability,{scope:'strategy_league.persistence',message:strategyLeagueLastError});
      console.error('strategy league persistence error',reason,strategyLeagueLastError);
      return false;
    }
  });
  return strategyLeaguePersistenceQueue;
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

async function persistForecastRuntime(reason='mutation',{force=false}={}) {
  forecastRuntimePersistDirty=true;
  forecastRuntimePersistReason=reason;
  if(force){
    if(forecastRuntimePersistTimer){clearTimeout(forecastRuntimePersistTimer);forecastRuntimePersistTimer=null;}
    if(forecastRuntimePersistRunning) await forecastRuntimePersistRunning;
    return flushForecastRuntimePersistence(true);
  }
  if(forecastRuntimePersistRunning) return forecastRuntimePersistRunning;
  if(Date.now()-forecastRuntimePersistLastAt>=30000) return flushForecastRuntimePersistence();
  scheduleForecastRuntimePersist(30000-(Date.now()-forecastRuntimePersistLastAt));
  return true;
}

if((forecastSeedAtBoot.addedRows>0||forecastRuntime.migratedFromLegacyPath) && forecastRuntime.healthy){
  await persistForecastRuntime(
    forecastRuntime.migratedFromLegacyPath?'boot-snapshot-compression-migration':'boot-episode-seed',
    {force:true}
  );
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
    if(marketFabricArchiveBudgetBlocked){
      if(Date.now()-marketFabricArchiveBudgetLastLogAt>=30000){
        marketFabricArchiveBudgetLastLogAt=Date.now();
        console.error('[TCX_MARKET_FABRIC_ARCHIVE_BUDGET_BLOCKED]',JSON.stringify({
          budgetBytes:marketFabricArchiveBudgetBytes,
          reason:'ARCHIVE_BUDGET_FAIL_CLOSED',
          destructiveRetention:false
        }));
      }
      return {appended:[],duplicates:0,skipped:true,reason:'ARCHIVE_BUDGET_FAIL_CLOSED'};
    }
    const admission=await storageWriteAdmission('MARKET_FABRIC');
    if(!admission.allowed){
      return {appended:[],duplicates:0,skipped:true,reason:admission.reason,storagePressure:admission.state};
    }
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
const permitted = chatId => {
  const key=String(chatId);
  if(discordGuildId && isDiscordChatId(key,discordGuildId)) return true;
  return allowedChats.size === 0 || allowedChats.has(key);
};
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

function assetClassForSymbol(symbol){
  return MEMECOIN_CEX_SYMBOLS.has(String(symbol).toUpperCase())?'MEME':'CORE';
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

function alertSetupKeyboard(symbol){return {inline_keyboard:[[{text:'🧭 Regime-Wechsel',callback_data:'alertpreset:'+symbol+':REGIME'},{text:'⚡ Struktur-Event',callback_data:'alertpreset:'+symbol+':STRUCTURE'}],[{text:'🌐 Evidenz ≥75%',callback_data:'alertpreset:'+symbol+':WITNESS75'},{text:'🧠 Memory bereit',callback_data:'alertpreset:'+symbol+':MEMORY8'}],[{text:'⚠️ Risiko-Status',callback_data:'alertpreset:'+symbol+':SAFETY'},{text:'🎯 Smart Alert',callback_data:'alertpreset:'+symbol+':COMPOSITE'}],[{text:'📊 Zurück zum Markt',callback_data:'refresh:'+symbol},{text:'🏠 Home',callback_data:'home'}]]};}
async function showAlertSetup(chatId,symbol){return tg('sendMessage',{chat_id:chatId,text:['🔔 ALERTS · '+symbol.replace('USDT','/USDT'),'','Wähle, was TCX überwachen soll.','','🧭 Regime  · Marktphase ändert sich','⚡ Struktur · HH/HL/LH/LL, BOS, Retest oder Bruch ändert sich','🌐 Evidenz · Quellen bestätigen sich','🧠 Memory  · genug Vergleichsfälle','⚠️ Risiko  · Sicherheitsstatus ändert sich','🎯 Smart   · mehrere Faktoren passen','','Fester Preis: /alert '+symbolLabel(symbol)+' 70000','','Benachrichtigung · kein Trade-Signal'].join('\n'),reply_markup:alertSetupKeyboard(symbol)});}

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
  const structureEvents=deriveStructureEvents({
    timeframe:'5m',
    analysis:state.memoryAnalysis,
    candles:state.byTf?.['5m']||[]
  });
  const structureEventKey=structureEvents.map(e=>[e.type,e.level??'NA'].join(':')).join('|')||'NONE';
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
      structureKey:String(state.analysis?.trend||'INSUFFICIENT')+'|'+pattern+'|'+structureEventKey,
      structureEventKey,
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

async function placeShadowOrder({symbol,side,type,notionalQuote,limitPrice=null,latencyMs=shadowDefaultLatencyMs,strategyMeta=null}) {
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
  if(strategyMeta&&typeof strategyMeta==='object'){
    order.strategyMeta={
      ...structuredClone(strategyMeta),
      execution:'SHADOW_ONLY',
      canExecuteLive:false
    };
  }
  shadowOrders.push(order);
  await persistShadowOms('placed');
  if(auditLedger.healthy) await appendInstitutionalAudit('TCX_SHADOW_ORDER_EVENT',shadowAuditPayload('PLACED',order));
  recordOperation(observability,{name:'shadow_oms.place',ok:true,latencyMs:Date.now()-started});
  return order;
}

async function maybePlaceAutonomousShadowTrade(issuance,{auditHealthy=false}={}){
  const now=Date.now();
  const preReconcile=reconcileShadowPortfolioEntries(shadowPortfolioLedger,shadowOrders,{now});
  if(preReconcile.changed){
    shadowPortfolioLedger=preReconcile.ledger;
    await persistShadowPortfolio('pre-auto-trade-reconcile');
  }
  if(!autoShadowTradingEnabled){
    return {placed:false,eligible:false,reason:'AUTO_SHADOW_DISABLED',execution:'SHADOW_ONLY'};
  }
  const assetClass=assetClassForSymbol(issuance?.symbol);
  const isMeme=assetClass==='MEME';
  const academy=evaluateShadowCapitalAcademy(shadowPortfolioLedger,{asOf:now,timeZone:shadowStatsTimeZone});
  if(isMeme&&!academy.guard.memeAllowed){
    return {placed:false,eligible:false,reason:'ACADEMY_MEME_HOLD',academyBlockers:academy.guard.memeBlockers,execution:'SHADOW_ONLY'};
  }
  if(!isMeme&&!academy.guard.coreAllowed){
    return {placed:false,eligible:false,reason:'ACADEMY_RISK_HOLD',academyBlockers:academy.guard.blockers,execution:'SHADOW_ONLY'};
  }
  const portfolioNow=shadowPortfolioSummary(shadowPortfolioLedger,{asOf:now});
  const academyBudget=academyTradeBudget(academy,{
    assetClass,
    baseNotionalQuote:autoShadowNotionalQuote,
    equityQuote:portfolioNow.equityQuote
  });
  const training=evaluateShadowTrainingSupervisor(shadowPortfolioLedger,academy,{asOf:now});
  if(training.risk.hold){
    return {
      placed:false,eligible:false,reason:'TRAINING_SUPERVISOR_HOLD',
      trainingMission:training.mission.type,
      holdUntil:training.risk.holdUntil,
      execution:'SHADOW_ONLY'
    };
  }
  const supervisedBudget=supervisedShadowBudget(training,{academyNotionalQuote:academyBudget.notionalQuote});
  const decision=deriveAutonomousShadowTrade(issuance,{
    now,
    notionalQuote:supervisedBudget.notionalQuote,
    minExpectedReturn:isMeme?autoShadowMemecoinMinExpectedReturn:autoShadowMinExpectedReturn,
    minDirectionalProbability:isMeme?autoShadowMemecoinMinDirectionalProbability:autoShadowMinDirectionalProbability,
    minProbabilityEdge:isMeme?autoShadowMemecoinMinProbabilityEdge:autoShadowMinProbabilityEdge
  });
  if(!decision.eligible) return {...decision,placed:false};
  const setup=classifyShadowSetup({expectedReturn:decision.expectedReturn,probabilityEdge:decision.probabilityEdge,regimeConfidence:Number(issuance?.regime?.confidence||issuance?.regimeConfidence||0),stressRobustnessScore:Number(issuance?.stressRobustnessScore||0),assetClass});
  if(setup.setupType==='REJECT') return {...decision,placed:false,reason:'ENTRY_SETUP_REJECT',setup,execution:'SHADOW_ONLY'};
  const setupMemory=buildSetupPerformanceMemory(shadowPortfolioLedger);
  const setupEvidence=setupEvidenceFor(setupMemory,{setupType:setup.setupType,assetClass,symbol:decision.symbol,side:decision.side,horizonId:decision.horizonId,regimeKey:String(issuance?.regime?.id||issuance?.regimeId||'UNKNOWN')});
  if(setupEvidence.status==='DECAYING') return {...decision,placed:false,reason:'SETUP_EVIDENCE_DECAYING',setup,setupEvidence,execution:'SHADOW_ONLY'};
  const setupEvidenceMultiplier=setupEvidence.status==='SUPPORTED'&&setupEvidence.all.trades>=20&&Number(setupEvidence.recent.expectancyQuote)>0?1.10:setupEvidence.status==='WATCH'?.75:1;
  const strategyDnaMemory=buildStrategyDnaMemory(shadowPortfolioLedger);
  const opportunityAllocation=allocateShadowOpportunity(strategyDnaMemory,{
    ...decision,assetClass,symbol:decision.symbol
  },{baseNotionalQuote:decision.notionalQuote});
  if(opportunityAllocation.blocked){
    return {...decision,placed:false,reason:'FAILURE_MEMORY_AVOID',opportunityAllocation};
  }
  const leverageLab=buildLeverageCounterfactualLab(shadowPortfolioLedger);
  const requestedShadowLeverage=leverageLab.evidenceReady
    ? Math.min(isMeme?2:3,leverageLab.suggestedShadowLeverage)
    : 1;
  const leverageRisk=evaluateShadowLeverageRisk({
    requestedLeverage:requestedShadowLeverage,
    assetClass,
    volatilityPct:Math.max(.005,Math.abs(Number(decision.expectedReturn)||0)*2),
    stopDistancePct:Math.max(.01,Math.abs(Number(decision.expectedReturn)||0)*1.5),
    drawdownPct:Number(academy?.rolling?.maxDrawdownPct||training?.rolling?.maxDrawdownPct||0),
    portfolioCorrelation:.5,
    fundingRate8h:0,
    expectedHoldingHours:Math.max(1,Number(decision.horizonMs||3600000)/3600000),
    stressMovePct:isMeme?.10:.06
  });
  if(!leverageRisk.approved){
    return {...decision,placed:false,reason:'LEVERAGE_RISK_BLOCK',opportunityAllocation,leverageRisk};
  }
  const marginQuote=opportunityAllocation.notionalQuote*setupEvidenceMultiplier;
  const requestedLeveragedExposureQuote=marginQuote*leverageRisk.allowedLeverage;
  let correlationModel=null;
  const openRiskSymbols=[...new Set((shadowPortfolioLedger?.positions||[]).filter(p=>p?.status==='OPEN').map(p=>String(p.symbol||'')).filter(Boolean))];
  const correlationSymbols=[...new Set([...openRiskSymbols,decision.symbol])];
  if(correlationSymbols.length>1){
    try{
      const fetched=await Promise.all(correlationSymbols.map(symbol=>fetchKlines(symbol,'15m',130)));
      const series={};
      for(let i=0;i<correlationSymbols.length;i++){
        const candles=closedCandles(candlesFromKlines(fetched[i].rows,now));
        series[correlationSymbols[i]]=candles.map(x=>({closeTime:x.closeTime,close:x.c}));
      }
      correlationModel=buildPointInTimeCorrelation(series,{asOf:now,window:96,stressWindow:24,minSamples:48});
    }catch(err){
      recordError(observability,{scope:'portfolio_risk.correlation',message:err instanceof Error?err.message:String(err)});
    }
  }
  const portfolioRisk=evaluatePortfolioRiskBrain(shadowPortfolioLedger,{symbol:decision.symbol,side:decision.side,assetClass,exposureQuote:requestedLeveragedExposureQuote},{equityQuote:portfolioNow.equityQuote,correlationModel});
  if(portfolioRisk.blocked){
    return {...decision,placed:false,reason:'PORTFOLIO_RISK_BLOCK',opportunityAllocation,leverageRisk,portfolioRisk};
  }
  const leveragedExposureQuote=portfolioRisk.allowedExposureQuote;
  const effectiveMarginQuote=leveragedExposureQuote/leverageRisk.allowedLeverage;
  if(!auditHealthy||!auditLedger.healthy||!shadowOmsHealthy){
    return {...decision,placed:false,reason:'RUNTIME_AUDIT_OR_OMS_UNHEALTHY'};
  }
  if(shadowOrders.some(o=>o?.strategyMeta?.decisionKey===decision.decisionKey)){
    return {...decision,placed:false,reason:'DECISION_ALREADY_TRADED'};
  }
  const openAll=(shadowPortfolioLedger?.positions||[]).filter(p=>p.status==='OPEN');
  const openForSymbol=openAll.filter(p=>p.symbol===decision.symbol);
  const academyGlobalCap=Math.min(autoShadowMaxOpenTotal,Number(academy.riskPolicy.maxOpenTotal||autoShadowMaxOpenTotal));
  const academySymbolCap=Math.min(autoShadowMaxOpenPerSymbol,Number(academy.riskPolicy.maxOpenPerSymbol||autoShadowMaxOpenPerSymbol));
  if(openAll.length>=academyGlobalCap){
    return {...decision,placed:false,reason:'ACADEMY_GLOBAL_OPEN_CAP',academyStage:academy.activeStage};
  }
  if(openForSymbol.length>=academySymbolCap){
    return {...decision,placed:false,reason:'ACADEMY_SYMBOL_OPEN_CAP',academyStage:academy.activeStage};
  }

  const prior=shadowOrders
    .filter(o=>o?.strategyMeta?.strategy===AUTONOMOUS_SHADOW_TRADER_VERSION&&String(o?.strategyMeta?.role||'ENTRY').toUpperCase()==='ENTRY'&&o.symbol===decision.symbol)
    .sort((a,b)=>Number(b.createdAt||0)-Number(a.createdAt||0));
  const sameLanePrior=prior.filter(o=>
    String(o?.strategyMeta?.horizonId||'')===String(decision.horizonId||'')&&
    String(o?.side||'').toUpperCase()===String(decision.side||'').toUpperCase()
  );
  if(sameLanePrior.length&&now-Number(sameLanePrior[0].createdAt||0)<autoShadowCooldownMs){
    return {...decision,placed:false,reason:'STRATEGY_LANE_COOLDOWN'};
  }

  const dayStart=new Date(now);
  dayStart.setUTCHours(0,0,0,0);
  const todayCount=prior.filter(o=>Number(o.createdAt||0)>=dayStart.getTime()).length;
  if(todayCount>=autoShadowMaxPerSymbolPerDay){
    return {...decision,placed:false,reason:'DAILY_SYMBOL_CAP'};
  }

  const frozenPolicy=createFrozenShadowPolicy({policyVersion:'AUTO_SHADOW_ENTRY_POLICY_V1',frozenAt:now,parameters:{strategy:AUTONOMOUS_SHADOW_TRADER_VERSION,opportunityAllocator:OPPORTUNITY_ALLOCATOR_VERSION,leverageRisk:SHADOW_LEVERAGE_RISK_VERSION,leverageLab:LEVERAGE_COUNTERFACTUAL_LAB_VERSION,portfolioRisk:PORTFOLIO_RISK_BRAIN_VERSION,correlation:PIT_CORRELATION_ENGINE_VERSION,assetClass,horizonId:decision.horizonId,side:decision.side,admissionGate:decision.admissionGate,academyStage:academy.activeStage,trainingMissionType:training.mission.type,tradeLifecycle:TRADE_LIFECYCLE_VERSION,setupMemory:SETUP_PERFORMANCE_MEMORY_VERSION,setupType:setup.setupType,setupScore:setup.score,setupEvidenceStatus:setupEvidence.status,setupEvidenceMultiplier}});
  const order=await placeShadowOrder({
    symbol:decision.symbol,
    side:decision.side,
    type:'MARKET',
    notionalQuote:leveragedExposureQuote,
    strategyMeta:{
      strategy:AUTONOMOUS_SHADOW_TRADER_VERSION,
      role:'ENTRY',
      tradeLifecycleVersion:TRADE_LIFECYCLE_VERSION,
      setupType:setup.setupType,
      setupScore:setup.score,
      setupMemoryVersion:SETUP_PERFORMANCE_MEMORY_VERSION,
      setupEvidenceStatus:setupEvidence.status,
      setupEvidenceSamples:setupEvidence.all.trades,
      setupEvidenceRecentExpectancy:setupEvidence.recent.expectancyQuote,
      setupEvidenceMultiplier,
      frozenPolicyFingerprint:frozenPolicy.fingerprint,
      frozenPolicyVersion:frozenPolicy.policyVersion,
      frozenPolicyFreezeVersion:SHADOW_POLICY_FREEZE_VERSION,
      frozenPolicyFrozenAt:frozenPolicy.frozenAt,
      frozenPolicyParameters:frozenPolicy.parameters,
      leverageRiskVersion:SHADOW_LEVERAGE_RISK_VERSION,
      leverageLabVersion:LEVERAGE_COUNTERFACTUAL_LAB_VERSION,
      leverageLabEvidenceReady:leverageLab.evidenceReady,
      leverageLabSamples:leverageLab.samples,
      leverageLabSuggested:leverageLab.suggestedShadowLeverage,
      leverage:leverageRisk.allowedLeverage,
      marginQuote:effectiveMarginQuote,
      requestedMarginQuote:marginQuote,
      leveragedExposureQuote,
      portfolioRiskVersion:PORTFOLIO_RISK_BRAIN_VERSION,
      correlationEngineVersion:PIT_CORRELATION_ENGINE_VERSION,
      correlationMode:portfolioRisk.correlationMode,
      correlationFingerprint:correlationModel?.fingerprint||null,
      portfolioRiskMultiplier:portfolioRisk.multiplier,
    correlationMode:portfolioRisk.correlationMode,
      portfolioRiskReasons:portfolioRisk.reasons,
      portfolioRiskFingerprint:portfolioRisk.fingerprint,
      leverageRiskCap:leverageRisk.riskCap,
      leverageRiskFingerprint:leverageRisk.fingerprint,
      opportunityAllocatorVersion:OPPORTUNITY_ALLOCATOR_VERSION,
      setupType:setup.setupType,
    setupScore:setup.score,
    opportunityScore:opportunityAllocation.score,
      opportunityMultiplier:opportunityAllocation.multiplier,
      opportunityReason:opportunityAllocation.reason,
      strategyDnaSamples:opportunityAllocation.samples,
      failureMemoryScore:opportunityAllocation.failureScore,
      assetClass,
      strategyLane:[decision.symbol,decision.horizonId,decision.side].join(':'),
      academyVersion:SHADOW_CAPITAL_ACADEMY_VERSION,
      academyStage:academy.activeStage,
      academyAchievedLevel:academy.achievedLevel,
      academyRiskMultiplier:academy.riskPolicy.notionalMultiplier,
      academySizedNotionalQuote:academyBudget.notionalQuote,
      trainingSupervisorVersion:SHADOW_TRAINING_SUPERVISOR_VERSION,
      trainingMissionId:training.mission.missionId,
      trainingMissionType:training.mission.type,
      trainingRiskMultiplier:training.risk.multiplier,
      trainingRollingProfitFactor:training.rolling.profitFactor,
      trainingRollingExpectancyQuote:training.rolling.expectancyQuote,
      trainingRollingDrawdownPct:training.rolling.maxDrawdownPct,
      decisionKey:decision.decisionKey,
      issuanceId:decision.issuanceId,
      forecastFingerprint:decision.forecastFingerprint,
      horizonId:decision.horizonId,
      horizonMs:decision.horizonMs,
      admissionGate:decision.admissionGate,
      expectedReturn:decision.expectedReturn,
      directionalProbability:decision.directionalProbability,
      probabilityEdge:decision.probabilityEdge,
      generatedAt:decision.generatedAt
    }
  });
  recordOperation(observability,{name:'auto_shadow_trade',ok:true,latencyMs:0,error:null});
  console.log('auto shadow trade placed',JSON.stringify({
    symbol:decision.symbol,
    side:decision.side,
    notionalQuote:leveragedExposureQuote,
    marginQuote:effectiveMarginQuote,
    requestedMarginQuote:marginQuote,
    leverage:leverageRisk.allowedLeverage,
    portfolioRiskMultiplier:portfolioRisk.multiplier,
    portfolioRiskReasons:portfolioRisk.reasons,
    opportunityScore:opportunityAllocation.score,
    opportunityMultiplier:opportunityAllocation.multiplier,
    failureMemoryScore:opportunityAllocation.failureScore,
    horizonId:decision.horizonId,
    expectedReturn:decision.expectedReturn,
    directionalProbability:decision.directionalProbability,
    admissionGate:decision.admissionGate,
    assetClass,
    academyStage:academy.activeStage,
    academyAchievedLevel:academy.achievedLevel,
    academyProgress:academy.stageProgress,
    academyNotionalQuote:academyBudget.notionalQuote,
    trainingMission:training.mission.type,
    trainingRiskMultiplier:training.risk.multiplier,
    supervisedNotionalQuote:supervisedBudget.notionalQuote,
    academyGlobalCap,
    academySymbolCap,
    openForSymbolBefore:openForSymbol.length,
    openTotalBefore:openAll.length,
    orderId:order.id,
    execution:'SHADOW_ONLY'
  }));
  return {...decision,placed:true,orderId:order.id,status:order.status,opportunityAllocation,leverageRisk,leverageLab,portfolioRisk,marginQuote:effectiveMarginQuote,requestedMarginQuote:marginQuote,leveragedExposureQuote};
}


async function maybePlaceMandatoryShadowDiscovery(issuance,{auditHealthy=false,autoResult=null}={}){
  const now=Date.now();
  if(!mandatoryShadowDiscoveryEnabled){
    return {placed:false,eligible:false,reason:'MANDATORY_DISCOVERY_DISABLED',execution:'SHADOW_ONLY',canExecuteLive:false};
  }
  if(autoResult?.placed===true){
    return {placed:false,eligible:false,reason:'STANDARD_SHADOW_TRADE_ALREADY_PLACED',execution:'SHADOW_ONLY',canExecuteLive:false};
  }
  if(!isMandatoryDiscoveryFallbackReasonAllowed(autoResult?.reason)){
    return {
      placed:false,eligible:false,
      reason:'DISCOVERY_RESPECTS_STANDARD_BLOCK_'+String(autoResult?.reason||'UNKNOWN'),
      execution:'SHADOW_ONLY',canExecuteLive:false
    };
  }
  if(!auditHealthy||!auditLedger.healthy||!shadowOmsHealthy||!shadowPortfolioHealthy){
    return {placed:false,eligible:false,reason:'DISCOVERY_RUNTIME_UNHEALTHY',execution:'SHADOW_ONLY',canExecuteLive:false};
  }

  const reconciled=reconcileShadowPortfolioEntries(shadowPortfolioLedger,shadowOrders,{now});
  if(reconciled.changed){
    shadowPortfolioLedger=reconciled.ledger;
    await persistShadowPortfolio('pre-mandatory-discovery-reconcile');
  }

  const explorationOrders=shadowOrders
    .filter(o=>
      o?.strategyMeta?.strategy===AUTONOMOUS_SHADOW_TRADER_VERSION&&
      ['EXPLORATION_ENTRY','ABSTAIN_PROBE_ENTRY'].includes(String(o?.strategyMeta?.role||'').toUpperCase())
    )
    .sort((a,b)=>Number(b.createdAt||0)-Number(a.createdAt||0));
  const symbol=String(issuance?.symbol||'').toUpperCase();
  const symbolPrior=explorationOrders.filter(o=>o.symbol===symbol);
  if(symbolPrior.length&&now-Number(symbolPrior[0].createdAt||0)<mandatoryShadowDiscoveryCooldownMs){
    return {placed:false,eligible:false,reason:'DISCOVERY_SYMBOL_COOLDOWN',execution:'SHADOW_ONLY',canExecuteLive:false};
  }
  const dayStart=new Date(now); dayStart.setUTCHours(0,0,0,0);
  const todaySymbol=symbolPrior.filter(o=>Number(o.createdAt||0)>=dayStart.getTime()).length;
  if(todaySymbol>=mandatoryShadowDiscoveryMaxPerSymbolDay){
    return {placed:false,eligible:false,reason:'DISCOVERY_DAILY_SYMBOL_CAP',execution:'SHADOW_ONLY',canExecuteLive:false};
  }
  // Coverage probes are a separate curriculum and do not consume the smaller
  // mandatory-discovery allocation. The legacy flag includes both categories.
  const openExplorationCount=countOpenDiscoveryPositions(shadowPortfolioLedger.positions||[]);
  const openExploration=(shadowPortfolioLedger.positions||[]).filter(p=>
    p.status==='OPEN'&&['EXPLORATION','ABSTAIN_PROBE'].includes(String(p.entryMode||'').toUpperCase())
  );
  if(openExplorationCount>=mandatoryShadowDiscoveryMaxOpenTotal){
    return {placed:false,eligible:false,reason:'DISCOVERY_GLOBAL_OPEN_CAP',execution:'SHADOW_ONLY',canExecuteLive:false};
  }
  if(openExploration.some(p=>p.symbol===symbol)){
    return {placed:false,eligible:false,reason:'DISCOVERY_SYMBOL_OPEN_CAP',execution:'SHADOW_ONLY',canExecuteLive:false};
  }

  const qualityModel=buildShadowTradeQualityModel(shadowPortfolioLedger,{asOf:now});
  const assetClass=assetClassForSymbol(symbol);
  const decision=deriveMandatoryShadowDiscovery(issuance,qualityModel,{
    now,
    assetClass,
    notionalQuote:mandatoryShadowDiscoveryNotional
  });
  if(!decision.eligible) return {...decision,placed:false};
  if(shadowOrders.some(o=>o?.strategyMeta?.discoveryDecisionKey===decision.decisionKey)){
    return {...decision,placed:false,reason:'DISCOVERY_DECISION_ALREADY_TRADED'};
  }

  const order=await placeShadowOrder({
    symbol:decision.symbol,
    side:decision.side,
    type:'MARKET',
    notionalQuote:decision.notionalQuote,
    strategyMeta:{
      strategy:AUTONOMOUS_SHADOW_TRADER_VERSION,
      role:'EXPLORATION_ENTRY',
      entryMode:decision.entryMode,
      assetClass,
      strategyLane:['EXPLORE',decision.symbol,decision.horizonId,decision.side].join(':'),
      discoveryVersion:MANDATORY_SHADOW_DISCOVERY_VERSION,
      discoveryDecisionKey:decision.decisionKey,
      discoveryScore:decision.discoveryScore,
      entryQualityLearnerVersion:SHADOW_TRADE_QUALITY_LEARNER_VERSION,
      entryQualityLabel:decision.learning.qualityLabel,
      entryQualityScore:decision.learning.qualityScore,
      entryQualityConfidence:decision.learning.confidence,
      entryQualitySamples:decision.learning.samples,
      entryLearningValue:decision.learning.learningValue,
      entryDiscoveryScore:decision.discoveryScore,
      decisionKey:decision.decisionKey,
      issuanceId:decision.issuanceId,
      forecastFingerprint:decision.forecastFingerprint,
      horizonId:decision.horizonId,
      horizonMs:decision.horizonMs,
      admissionGate:decision.admissionGate,
      expectedReturn:decision.expectedReturn,
      directionalProbability:decision.directionalProbability,
      probabilityEdge:decision.probabilityEdge,
      generatedAt:decision.generatedAt
    }
  });
  recordOperation(observability,{name:'mandatory_shadow_discovery',ok:true,latencyMs:0,error:null});
  console.log('mandatory shadow discovery trade placed',JSON.stringify({
    symbol:decision.symbol,
    side:decision.side,
    horizonId:decision.horizonId,
    notionalQuote:decision.notionalQuote,
    qualityLabel:decision.learning.qualityLabel,
    qualityScore:decision.learning.qualityScore,
    learningValue:decision.learning.learningValue,
    discoveryScore:decision.discoveryScore,
    modelSamples:qualityModel.samples,
    entryMode:decision.entryMode,
    admissionGate:decision.admissionGate,
    orderId:order.id,
    execution:'SHADOW_ONLY',
    canExecuteLive:false
  }));
  return {...decision,placed:true,orderId:order.id,status:order.status,modelSamples:qualityModel.samples};
}


async function maybePlaceCoverageCurriculum(issuance,{auditHealthy=false}={}){
  const now=Date.now();
  if(!coverageCurriculumEnabled){
    return {placed:0,eligible:0,reason:'COVERAGE_CURRICULUM_DISABLED',execution:'SHADOW_ONLY',canExecuteLive:false};
  }
  if(!auditHealthy||!auditLedger.healthy||!shadowOmsHealthy||!shadowPortfolioHealthy){
    return {placed:0,eligible:0,reason:'COVERAGE_RUNTIME_UNHEALTHY',execution:'SHADOW_ONLY',canExecuteLive:false};
  }

  const reconciled=reconcileShadowPortfolioEntries(shadowPortfolioLedger,shadowOrders,{now});
  if(reconciled.changed){
    shadowPortfolioLedger=reconciled.ledger;
    await persistShadowPortfolio('pre-coverage-curriculum-reconcile');
  }

  const existingCoverageKeys=[
    ...shadowOrders.map(o=>o?.strategyMeta?.coverageKey).filter(Boolean),
    ...(shadowPortfolioLedger.positions||[]).map(p=>p?.coverageKey).filter(Boolean)
  ];
  const derived=deriveCoverageCurriculumCandidates(issuance,{
    now,
    notionalQuote:coverageCurriculumNotional,
    existingCoverageKeys,
    assetClass:assetClassForSymbol(issuance?.symbol)
  });
  if(!derived.candidates.length){
    return {placed:0,eligible:0,reason:derived.reason,execution:'SHADOW_ONLY',canExecuteLive:false};
  }

  const openCoverage=(shadowPortfolioLedger.positions||[]).filter(p=>
    p.status==='OPEN'&&String(p.entryMode||'').toUpperCase()==='COVERAGE_PROBE'
  );
  let remaining=Math.max(0,coverageCurriculumMaxOpenTotal-openCoverage.length);
  if(remaining<=0){
    return {placed:0,eligible:derived.candidates.length,reason:'COVERAGE_GLOBAL_OPEN_CAP',execution:'SHADOW_ONLY',canExecuteLive:false};
  }

  let placed=0;
  const results=[];
  for(const candidate of derived.candidates){
    if(remaining<=0) break;
    const laneOpen=openCoverage.filter(p=>
      p.symbol===candidate.symbol&&String(p.horizonId)===candidate.horizonId
    ).length+results.filter(x=>
      x.placed===true&&x.symbol===candidate.symbol&&x.horizonId===candidate.horizonId
    ).length;
    if(laneOpen>=coverageCurriculumMaxOpenPerLane){
      results.push({coverageKey:candidate.coverageKey,placed:false,reason:'COVERAGE_LANE_OPEN_CAP'});
      continue;
    }
    if(shadowOrders.some(o=>o?.strategyMeta?.coverageKey===candidate.coverageKey)){
      results.push({coverageKey:candidate.coverageKey,placed:false,reason:'COVERAGE_SLOT_ALREADY_TRADED'});
      continue;
    }

    const order=await placeShadowOrder({
      symbol:candidate.symbol,
      side:candidate.side,
      type:'MARKET',
      notionalQuote:candidate.notionalQuote,
      strategyMeta:{
        strategy:AUTONOMOUS_SHADOW_TRADER_VERSION,
        role:'COVERAGE_PROBE_ENTRY',
        entryMode:'COVERAGE_PROBE',
        assetClass:candidate.assetClass,
        strategyLane:['COVERAGE',candidate.symbol,candidate.horizonId].join(':'),
        coverageCurriculumVersion:SHADOW_COVERAGE_CURRICULUM_VERSION,
        coverageKey:candidate.coverageKey,
        coverageSlotStart:candidate.slotStart,
        coverageSlotEnd:candidate.slotEnd,
        coveragePurpose:candidate.purpose,
        coverageEvidenceTier:candidate.coverageEvidenceTier,
        coverageDataSafety:candidate.dataSafety,
        coverageCalibrationStatus:candidate.calibrationStatus,
        coverageHorizonGate:candidate.horizonGate,
        coverageProbabilityVector:candidate.probabilityVector,
        coverageFlatThreshold:candidate.flatThreshold,
        coverageForecastAsOf:candidate.generatedAt,
        coverageReferencePrice:candidate.referencePrice,
        coverageRegimeId:candidate.regimeId,
        horizonOnlyExit:true,
        decisionKey:candidate.decisionKey,
        issuanceId:candidate.issuanceId,
        forecastFingerprint:candidate.forecastFingerprint,
        horizonId:candidate.horizonId,
        horizonMs:candidate.horizonMs,
        admissionGate:candidate.admissionGate,
        expectedReturn:candidate.expectedReturn,
        directionalProbability:candidate.directionalProbability,
        probabilityEdge:candidate.probabilityEdge,
        generatedAt:candidate.generatedAt
      }
    });
    placed++;remaining--;
    results.push({
      coverageKey:candidate.coverageKey,placed:true,orderId:order.id,
      symbol:candidate.symbol,horizonId:candidate.horizonId,side:candidate.side,
      notionalQuote:candidate.notionalQuote
    });
  }

  if(placed){
    recordOperation(observability,{name:'coverage_curriculum_entries',ok:true,latencyMs:0,error:null});
    console.log('coverage curriculum entries',JSON.stringify({
      symbol:String(issuance?.symbol||''),
      eligible:derived.candidates.length,
      placed,
      horizons:results.filter(x=>x.placed).map(x=>x.horizonId),
      execution:'SHADOW_ONLY',
      canExecuteLive:false
    }));
  }
  return {
    placed,
    eligible:derived.candidates.length,
    reason:placed?'COVERAGE_SLOTS_PLACED':'COVERAGE_SLOTS_BLOCKED',
    results,
    execution:'SHADOW_ONLY',
    canExecuteLive:false
  };
}

async function maybePlaceLearnedChallengerTrades(issuance,{auditHealthy=false,regimeContext=null}={}){
  const now=Date.now();
  if(!learnedChallengerEnabled){
    return {placed:0,eligible:0,reason:'LEARNED_CHALLENGER_DISABLED',execution:'SHADOW_ONLY',canExecuteLive:false};
  }
  if(!auditHealthy||!auditLedger.healthy||!shadowOmsHealthy||!shadowPortfolioHealthy){
    return {placed:0,eligible:0,reason:'LEARNED_CHALLENGER_RUNTIME_UNHEALTHY',execution:'SHADOW_ONLY',canExecuteLive:false};
  }
  const reconciled=reconcileShadowPortfolioEntries(shadowPortfolioLedger,shadowOrders,{now});
  if(reconciled.changed){
    shadowPortfolioLedger=reconciled.ledger;
    await persistShadowPortfolio('pre-learned-challenger-reconcile');
  }

  const qualityModel=buildShadowTradeQualityModel(shadowPortfolioLedger,{asOf:now});
  const lab=buildLearnedChallengerLab(qualityModel,shadowPortfolioLedger,{asOf:now});
  const assetClass=assetClassForSymbol(issuance?.symbol);
  const regime=regimeContext||deriveShadowRegimeFingerprint({assetClass});
  const regimeMatrix=buildRegimeStrategyMatrix(shadowPortfolioLedger);
  const stressLab=buildAdversarialStressLab(shadowPortfolioLedger,lab);
  const derived=deriveLearnedChallengerTrades(issuance,lab,{
    now,
    assetClass,
    baseNotionalQuote:learnedChallengerBaseNotional,
    maxCandidates:learnedChallengerMaxPerIssuance,
    regimeBrain:{
      decisionForRule:(ruleId)=>regimeDecisionForStrategy(regimeMatrix,regime,ruleId)
    },
    stressLab:{
      decisionForRule:(ruleId)=>stressDecisionForRule(stressLab,ruleId)
    }
  });
  if(!derived.candidates.length){
    return {placed:0,eligible:0,reason:derived.reason,lab:learnedChallengerSummary(lab),execution:'SHADOW_ONLY',canExecuteLive:false};
  }

  const openAll=(shadowPortfolioLedger.positions||[]).filter(p=>
    p.status==='OPEN'&&String(p.entryMode||'').toUpperCase()==='CHALLENGER'
  );
  let remainingGlobal=Math.max(0,learnedChallengerMaxOpenTotal-openAll.length);
  if(remainingGlobal<=0){
    return {placed:0,eligible:derived.candidates.length,reason:'CHALLENGER_GLOBAL_OPEN_CAP',lab:learnedChallengerSummary(lab),execution:'SHADOW_ONLY',canExecuteLive:false};
  }

  let placed=0;
  const results=[];
  for(const candidate of derived.candidates){
    if(remainingGlobal<=0) break;
    if(shadowOrders.some(o=>o?.strategyMeta?.challengerDecisionKey===candidate.challengerDecisionKey)){
      results.push({ruleId:candidate.ruleId,placed:false,reason:'CHALLENGER_DECISION_ALREADY_TRADED'});
      continue;
    }
    const openSymbol=openAll.filter(p=>p.symbol===candidate.symbol);
    const placedForSymbol=results.filter(x=>x.placed===true&&x.symbol===candidate.symbol).length;
    if(openSymbol.length+placedForSymbol>=learnedChallengerMaxOpenPerSymbol){
      results.push({ruleId:candidate.ruleId,placed:false,reason:'CHALLENGER_SYMBOL_OPEN_CAP'});
      continue;
    }
    if(openAll.some(p=>p.challengerRuleId===candidate.ruleId)){
      results.push({ruleId:candidate.ruleId,placed:false,reason:'CHALLENGER_RULE_ALREADY_OPEN'});
      continue;
    }
    const prior=shadowOrders
      .filter(o=>
        String(o?.strategyMeta?.role||'').toUpperCase()==='LEARNED_CHALLENGER_ENTRY'&&
        o?.strategyMeta?.challengerRuleId===candidate.ruleId&&
        o.symbol===candidate.symbol
      )
      .sort((a,b)=>Number(b.createdAt||0)-Number(a.createdAt||0));
    if(prior.length&&now-Number(prior[0].createdAt||0)<learnedChallengerCooldownMs){
      results.push({ruleId:candidate.ruleId,placed:false,reason:'CHALLENGER_RULE_COOLDOWN'});
      continue;
    }

    const order=await placeShadowOrder({
      symbol:candidate.symbol,
      side:candidate.side,
      type:'MARKET',
      notionalQuote:candidate.notionalQuote,
      strategyMeta:{
        strategy:AUTONOMOUS_SHADOW_TRADER_VERSION,
        role:'LEARNED_CHALLENGER_ENTRY',
        entryMode:'CHALLENGER',
        assetClass,
        strategyLane:['LEARNED_CHALLENGER',candidate.ruleId,candidate.symbol,candidate.horizonId,candidate.side].join(':'),
        challengerEngineVersion:LEARNED_CHALLENGER_ENGINE_VERSION,
        challengerRuleId:candidate.ruleId,
        challengerDecisionKey:candidate.challengerDecisionKey,
        challengerRuleStatus:candidate.ruleStatus,
        challengerDiscoveryStrength:candidate.discoveryStrength,
        challengerSourceSamples:candidate.sourceSamples,
        challengerForwardSamples:candidate.forwardSamples,
        challengerWhyFeature:candidate.why?.[0]?.feature||'',
        challengerWhyValue:candidate.why?.[0]?.value||'',
        challengerRegimeStatus:candidate.regimeStatus,
        challengerRegimeSamples:candidate.regimeSamples,
        challengerRegimeMultiplier:candidate.regimeMultiplier,
        challengerStressStatus:candidate.stressStatus,
        challengerStressSamples:candidate.stressSamples,
        challengerStressMultiplier:candidate.stressMultiplier,
        challengerStressRobustnessScore:candidate.stressRobustnessScore,
        entryStressLabVersion:ADVERSARIAL_STRESS_LAB_VERSION,
        entryStressStatus:candidate.stressStatus,
        entryStressSamples:candidate.stressSamples,
        entryStressMultiplier:candidate.stressMultiplier,
        entryStressRobustnessScore:candidate.stressRobustnessScore,
        entryStressFailedChecks:candidate.stressFailedChecks,
        entryRegimeBrainVersion:SHADOW_REGIME_BRAIN_VERSION,
        entryRegimeKey:regime.regimeKey,
        entryRegimeFingerprint:regime.fingerprint,
        entryRegimeConfidence:regime.confidence,
        entryRegimeState:regime.components,
        decisionKey:candidate.challengerDecisionKey,
        issuanceId:candidate.issuanceId,
        forecastFingerprint:candidate.forecastFingerprint,
        horizonId:candidate.horizonId,
        horizonMs:candidate.horizonMs,
        admissionGate:candidate.admissionGate,
        expectedReturn:candidate.expectedReturn,
        directionalProbability:candidate.directionalProbability,
        probabilityEdge:candidate.probabilityEdge,
        generatedAt:candidate.generatedAt
      }
    });
    placed++;remainingGlobal--;
    results.push({
      ruleId:candidate.ruleId,placed:true,orderId:order.id,symbol:candidate.symbol,
      status:candidate.ruleStatus,side:candidate.side,horizonId:candidate.horizonId,
      regimeStatus:candidate.regimeStatus,regimeMultiplier:candidate.regimeMultiplier,
      stressStatus:candidate.stressStatus,stressMultiplier:candidate.stressMultiplier,
      stressRobustnessScore:candidate.stressRobustnessScore,
      notionalQuote:candidate.notionalQuote
    });
  }
  if(placed){
    recordOperation(observability,{name:'learned_challenger_entries',ok:true,latencyMs:0,error:null});
    console.log('learned challenger entries placed',JSON.stringify({
      symbol:String(issuance?.symbol||''),assetClass,
      eligible:derived.candidates.length,placed,results,
      lab:learnedChallengerSummary(lab),
      execution:'SHADOW_ONLY',canExecuteLive:false
    }));
  }
  return {
    placed,eligible:derived.candidates.length,reason:placed?'CHALLENGERS_PLACED':'CHALLENGERS_BLOCKED',
    results,lab:learnedChallengerSummary(lab),
    regime:{regimeKey:regime.regimeKey,confidence:regime.confidence},
    regimeBrain:regimeBrainSummary(regimeMatrix,regime),
    stressLab:adversarialStressSummary(stressLab),
    execution:'SHADOW_ONLY',canExecuteLive:false
  };
}

async function maybePlaceStrategyLeagueTrades(issuance,{auditHealthy=false}={}){
  const now=Date.now();
  if(!strategyLeagueEnabled){
    return {placed:0,eligible:0,reason:'STRATEGY_LEAGUE_DISABLED',execution:'SHADOW_ONLY'};
  }
  if(!auditHealthy||!auditLedger.healthy||!shadowOmsHealthy||!strategyLeagueHealthy){
    return {placed:0,eligible:0,reason:'LEAGUE_RUNTIME_UNHEALTHY',execution:'SHADOW_ONLY'};
  }

  const reconciled=reconcileStrategyLeagueEntries(strategyLeagueLedger,shadowOrders,{now});
  if(reconciled.changed){
    strategyLeagueLedger=reconciled.ledger;
    await persistStrategyLeague('pre-league-trade-reconcile');
  }

  const assetClass=assetClassForSymbol(issuance?.symbol);
  const derived=deriveStrategyLeagueCandidates(issuance,strategyLeagueLedger,{
    now,
    assetClass,
    baseNotionalQuote:strategyLeagueBaseNotionalQuote,
    memeMinExpectedReturn:autoShadowMemecoinMinExpectedReturn,
    memeMinDirectionalProbability:autoShadowMemecoinMinDirectionalProbability,
    memeMinProbabilityEdge:autoShadowMemecoinMinProbabilityEdge
  });

  let placed=0;
  const results=[];
  for(const candidate of derived.candidates){
    if(shadowOrders.some(o=>o?.strategyMeta?.leagueDecisionKey===candidate.leagueDecisionKey)){
      results.push({strategyId:candidate.leagueStrategyId,placed:false,reason:'LEAGUE_DECISION_ALREADY_TRADED'});
      continue;
    }
    const open=(strategyLeagueLedger.positions||[]).filter(p=>
      p.status==='OPEN'&&p.leagueStrategyId===candidate.leagueStrategyId
    );
    if(open.length>=strategyLeagueMaxOpenPerStrategy){
      results.push({strategyId:candidate.leagueStrategyId,placed:false,reason:'LEAGUE_STRATEGY_OPEN_CAP'});
      continue;
    }
    const sameSymbol=open.filter(p=>p.symbol===candidate.symbol);
    if(sameSymbol.length>=strategyLeagueMaxOpenPerStrategySymbol){
      results.push({strategyId:candidate.leagueStrategyId,placed:false,reason:'LEAGUE_STRATEGY_SYMBOL_CAP'});
      continue;
    }

    const order=await placeShadowOrder({
      symbol:candidate.symbol,
      side:candidate.side,
      type:'MARKET',
      notionalQuote:candidate.notionalQuote,
      strategyMeta:{
        strategy:AUTONOMOUS_SHADOW_TRADER_VERSION,
        role:'LEAGUE_ENTRY',
        assetClass,
        strategyLane:[
          'LEAGUE',candidate.leagueStrategyId,candidate.symbol,candidate.horizonId,candidate.side
        ].join(':'),
        leagueVersion:SHADOW_STRATEGY_LEAGUE_VERSION,
        leagueStrategyId:candidate.leagueStrategyId,
        leagueStrategyLabel:candidate.leagueStrategyLabel,
        leagueDecisionKey:candidate.leagueDecisionKey,
        leagueAllocationWeight:candidate.leagueAllocationWeight,
        leagueNotionalMultiplier:candidate.leagueNotionalMultiplier,
        leaguePerformanceScore:candidate.leaguePerformanceScore,
        leagueEvidenceGrade:candidate.leagueEvidenceGrade,
        leagueEvidenceFailedGates:candidate.leagueEvidenceFailedGates,
        leagueStatus:candidate.leagueStatus,
        decisionKey:candidate.leagueDecisionKey,
        issuanceId:candidate.issuanceId,
        forecastFingerprint:candidate.forecastFingerprint,
        horizonId:candidate.horizonId,
        horizonMs:candidate.horizonMs,
        horizonSelection:candidate.horizonSelection,
        admissionGate:candidate.admissionGate,
        expectedReturn:candidate.expectedReturn,
        directionalProbability:candidate.directionalProbability,
        probabilityEdge:candidate.probabilityEdge,
        generatedAt:candidate.generatedAt
      }
    });
    placed++;
    results.push({
      strategyId:candidate.leagueStrategyId,
      placed:true,
      orderId:order.id,
      side:candidate.side,
      horizonId:candidate.horizonId,
      notionalQuote:candidate.notionalQuote
    });
  }

  if(placed){
    recordOperation(observability,{name:'strategy_league_entries',ok:true,latencyMs:0,error:null});
    console.log('strategy league entries placed',JSON.stringify({
      symbol:String(issuance?.symbol||''),
      assetClass,
      eligible:derived.candidates.length,
      placed,
      allocationMode:derived.summary.allocationMode,
      results,
      execution:'SHADOW_ONLY'
    }));
  }
  return {
    placed,
    eligible:derived.candidates.length,
    allocationMode:derived.summary.allocationMode,
    results,
    execution:'SHADOW_ONLY',
    canExecuteLive:false
  };
}

async function tg(method, body) {
  if(discordBridge?.handlesTelegramCall(method,body)) return discordBridge.telegramCall(method,body);
  const timeoutMs=method==='getUpdates'?telegramLongPollTimeoutMs:telegramApiTimeoutMs;
  const res = await fetch(`${telegramApi}/${method}`, {
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify(body),
    signal:AbortSignal.timeout(timeoutMs)
  });
  const data = await res.json().catch(() => ({ ok:false, description:`HTTP ${res.status}` }));
  if (!res.ok || !data.ok) {
    const msg = String(data?.description || `Telegram HTTP ${res.status}`);
    if ((method === 'editMessageText' || method === 'editMessageMedia') && msg.includes('message is not modified')) return null;
    throw new Error(msg);
  }
  return data.result;
}

async function tgMultipart(method, fields, fileField, fileName, fileBuffer, mime="image/png") {
  if(discordBridge?.handlesTelegramCall(method,fields)) return discordBridge.telegramMultipart(method,fields,fileField,fileName,fileBuffer,mime);
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
      { text:'▥ CHART LAB', callback_data:`chart:${symbol}:5m` },
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
    [
      { text:'🔮 Prognose', callback_data:`forecast:${symbol}` },
      { text:'🔎 Warum?', callback_data:`why:${symbol}` }
    ],
    [
      { text:'📊 Übersicht', callback_data:`refresh:${symbol}` },
      { text:live?'⏸ Live aus':'⚡ Live an', callback_data:`live:${symbol}:${live?'off':'on'}` }
    ],
    [{ text:'🏠 Start', callback_data:'home' }]
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

function chartKeyboard(symbol, interval, live=false) {
  return { inline_keyboard:[
    [
      { text:interval==='1m'?"● 1M":"1M", callback_data:`chart:${symbol}:1m` },
      { text:interval==='5m'?"● 5M":"5M", callback_data:`chart:${symbol}:5m` },
      { text:interval==='15m'?"● 15M":"15M", callback_data:`chart:${symbol}:15m` }
    ],
    [
      { text:interval==='1h'?"● 1H":"1H", callback_data:`chart:${symbol}:1h` },
      { text:interval==='4h'?"● 4H":"4H", callback_data:`chart:${symbol}:4h` }
    ],
    [
      { text:"↻ AKTUALISIEREN", callback_data:`chartrefresh:${symbol}:${interval}` },
      { text:live?"⏸ AUTO AUS":"⚡ AUTO 10s", callback_data:`chartlive:${symbol}:${interval}:${live?'off':'on'}` }
    ],
    [
      { text:"⚡ EVENTS", callback_data:`events:${symbol}` },
      { text:"▦ MTF", callback_data:`mtf:${symbol}` }
    ],
    [
      { text:"◫ X-RAY", callback_data:`xray:${symbol}` },
      { text:"⌁ FORECAST", callback_data:`forecast:${symbol}` }
    ],
    [
      { text:"🔥 LIQ MAP", callback_data:`liqmap:${symbol}:5m` },
      { text:"◎ CONFLUENCE", callback_data:`confluence:${symbol}` }
    ],
    [
      { text:"◇ STRUKTUR", callback_data:`structure:${symbol}` },
      { text:"◇ WHY", callback_data:`why:${symbol}` }
    ],
    [
      { text:"↺ TRADE REPLAY", callback_data:`tradereplay:${symbol}` },
      { text:"◉ ALERT", callback_data:`alerthelp:${symbol}` }
    ],
    [
      { text:"▦ MARKT", callback_data:`refresh:${symbol}` },
      { text:"🏠 Start", callback_data:"home" }
    ]
  ]};
}

function superchartKeyboard(symbol,mode='PRO',interval='5m',live=false){
  const m=String(mode||'PRO').toUpperCase(),tf=String(interval||'5m').toLowerCase();
  return {inline_keyboard:[
    [
      {text:m==='CLEAN'?'● CLEAN':'CLEAN',callback_data:`superchart:${symbol}:CLEAN:${tf}`},
      {text:m==='PRO'?'● PRO':'PRO',callback_data:`superchart:${symbol}:PRO:${tf}`},
      {text:m==='FULL'?'● FULL':'FULL',callback_data:`superchart:${symbol}:FULL:${tf}`}
    ],
    [
      {text:tf==='1m'?'● 1M':'1M',callback_data:`superchart:${symbol}:${m}:1m`},
      {text:tf==='5m'?'● 5M':'5M',callback_data:`superchart:${symbol}:${m}:5m`},
      {text:tf==='15m'?'● 15M':'15M',callback_data:`superchart:${symbol}:${m}:15m`},
      {text:tf==='1h'?'● 1H':'1H',callback_data:`superchart:${symbol}:${m}:1h`}
    ],
    [
      {text:'↻ REFRESH',callback_data:`superchart:${symbol}:${m}:${tf}`},
      {text:live?'⏸ AUTO AUS':'⚡ AUTO 10s',callback_data:`superlive:${symbol}:${m}:${tf}:${live?'off':'on'}`}
    ],
    [
      {text:'⌁ FORECAST',callback_data:`forecast:${symbol}`},
      {text:'🐋 FLOW',callback_data:`flow:${symbol}`},
      {text:'📐 ACCURACY',callback_data:`accuracy:${symbol}`}
    ],
    [{text:'▦ MARKT',callback_data:`refresh:${symbol}`},{text:'🏠 Start',callback_data:'home'}]
  ]};
}

function xrayKeyboard(symbol,live=false){
  return {inline_keyboard:[
    [
      {text:"↻ AKTUALISIEREN",callback_data:`xrayrefresh:${symbol}`},
      {text:live?"⏸ AUTO AUS":"⚡ AUTO 10s",callback_data:`xraylive:${symbol}:${live?'off':'on'}`}
    ],
    [
      {text:"▦ MTF MATRIX",callback_data:`mtf:${symbol}`},
      {text:"▥ CHART",callback_data:`chart:${symbol}:5m`}
    ],
    [
      {text:"🔥 LIQ MAP",callback_data:`liqmap:${symbol}:5m`},
      {text:"◎ CONFLUENCE",callback_data:`confluence:${symbol}`}
    ],
    [
      {text:"🐋 FLOW",callback_data:`flow:${symbol}`},
      {text:"📐 ACCURACY",callback_data:`accuracy:${symbol}`}
    ],
    [
      {text:"⌁ FORECAST",callback_data:`forecast:${symbol}`},
      {text:"▦ MARKT",callback_data:`refresh:${symbol}`}
    ],
    [{text:"🏠 Start",callback_data:"home"}]
  ]};
}

function flowRadarKeyboard(symbol){
  return {inline_keyboard:[
    [
      {text:"↻ AKTUALISIEREN",callback_data:`flow:${symbol}`},
      {text:"📐 ACCURACY",callback_data:`accuracy:${symbol}`}
    ],
    [
      {text:"◫ X-RAY",callback_data:`xray:${symbol}`},
      {text:"◎ CONFLUENCE",callback_data:`confluence:${symbol}`}
    ],
    [
      {text:"⌁ FORECAST",callback_data:`forecast:${symbol}`},
      {text:"▦ MARKT",callback_data:`refresh:${symbol}`}
    ],
    [{text:"🏠 Start",callback_data:"home"}]
  ]};
}

function forecastAccuracyKeyboard(symbol=null){
  const rows=[];
  if(symbol){
    rows.push([
      {text:"↻ AKTUALISIEREN",callback_data:`accuracy:${symbol}`},
      {text:"⌁ FORECAST",callback_data:`forecast:${symbol}`}
    ]);
    rows.push([
      {text:"🐋 FLOW",callback_data:`flow:${symbol}`},
      {text:"▦ MARKT",callback_data:`refresh:${symbol}`}
    ]);
  }else{
    rows.push([
      {text:"↻ AKTUALISIEREN",callback_data:"accuracy:ALL"},
      {text:"🧪 LEARNING",callback_data:"home:performance"}
    ]);
  }
  rows.push([{text:"🏠 Start",callback_data:"home"}]);
  return {inline_keyboard:rows};
}

function mtfMatrixKeyboard(symbol){
  return {inline_keyboard:[
    [
      {text:"↻ AKTUALISIEREN",callback_data:`mtf:${symbol}`},
      {text:"◫ X-RAY",callback_data:`xray:${symbol}`}
    ],
    [
      {text:"🔥 LIQ MAP",callback_data:`liqmap:${symbol}:5m`},
      {text:"◎ CONFLUENCE",callback_data:`confluence:${symbol}`}
    ],
    [
      {text:"▥ 5m CHART",callback_data:`chart:${symbol}:5m`},
      {text:"▥ 1h CHART",callback_data:`chart:${symbol}:1h`}
    ],
    [
      {text:"⌁ FORECAST",callback_data:`forecast:${symbol}`},
      {text:"▦ MARKT",callback_data:`refresh:${symbol}`}
    ],
    [{text:"🏠 Start",callback_data:"home"}]
  ]};
}

function liquidationMapKeyboard(symbol,window='5m',live=false){
  const w=String(window).toLowerCase()==='15m'?'15m':'5m';
  return {inline_keyboard:[
    [
      {text:w==='5m'?'● 5M':'5M',callback_data:`liqmap:${symbol}:5m`},
      {text:w==='15m'?'● 15M':'15M',callback_data:`liqmap:${symbol}:15m`}
    ],
    [
      {text:"↻ AKTUALISIEREN",callback_data:`liqrefresh:${symbol}:${w}`},
      {text:live?"⏸ AUTO AUS":"⚡ AUTO 10s",callback_data:`liqlive:${symbol}:${w}:${live?'off':'on'}`}
    ],
    [
      {text:"◎ CONFLUENCE",callback_data:`confluence:${symbol}`},
      {text:"◫ X-RAY",callback_data:`xray:${symbol}`}
    ],
    [
      {text:"▥ CHART",callback_data:`chart:${symbol}:5m`},
      {text:"▦ MARKT",callback_data:`refresh:${symbol}`}
    ],
    [{text:"🏠 Start",callback_data:"home"}]
  ]};
}

function confluenceKeyboard(symbol){
  return {inline_keyboard:[
    [
      {text:"↻ AKTUALISIEREN",callback_data:`confluence:${symbol}`},
      {text:"🔥 LIQ MAP",callback_data:`liqmap:${symbol}:5m`}
    ],
    [
      {text:"◫ X-RAY",callback_data:`xray:${symbol}`},
      {text:"▦ MTF MATRIX",callback_data:`mtf:${symbol}`}
    ],
    [
      {text:"🐋 FLOW",callback_data:`flow:${symbol}`},
      {text:"📐 ACCURACY",callback_data:`accuracy:${symbol}`}
    ],
    [
      {text:"▥ CHART",callback_data:`chart:${symbol}:5m`},
      {text:"⌁ FORECAST",callback_data:`forecast:${symbol}`}
    ],
    [
      {text:"▦ MARKT",callback_data:`refresh:${symbol}`},
      {text:"🏠 Start",callback_data:"home"}
    ]
  ]};
}

function structureEventKeyboard(symbol){
  return {inline_keyboard:[
    [
      {text:"↻ AKTUALISIEREN",callback_data:`events:${symbol}`},
      {text:"▥ CHART + PATH",callback_data:`chart:${symbol}:5m`}
    ],
    [
      {text:"▦ MTF MATRIX",callback_data:`mtf:${symbol}`},
      {text:"◉ STRUKTUR-ALERT",callback_data:`alertpreset:${symbol}:STRUCTURE`}
    ],
    [
      {text:"◎ CONFLUENCE",callback_data:`confluence:${symbol}`},
      {text:"▦ MARKT",callback_data:`refresh:${symbol}`}
    ],
    [{text:"🏠 Start",callback_data:"home"}]
  ]};
}

function structureKeyboard(symbol) {
  return { inline_keyboard:[
    [
      { text:"📈 5m Chart", callback_data:`chart:${symbol}:5m` },
      { text:"⚡ Event Radar", callback_data:`events:${symbol}` }
    ],
    [
      { text:"🔮 Prognose", callback_data:`forecast:${symbol}` },
      { text:"🔎 Warum?", callback_data:`why:${symbol}` }
    ],
    [
      { text:"🧠 Lernhistorie", callback_data:`memory:${symbol}` },
      { text:"📊 Übersicht", callback_data:`refresh:${symbol}` }
    ],
    [{ text:"🏠 Start", callback_data:"home" }]
  ]};
}

function memoryKeyboard(symbol) {
  return { inline_keyboard:[
    [
      { text:"🔮 Prognose", callback_data:`forecast:${symbol}` },
      { text:"📊 Übersicht", callback_data:`refresh:${symbol}` }
    ],
    [
      { text:"📈 Chart", callback_data:`chart:${symbol}:5m` },
      { text:"🧭 Marktstruktur", callback_data:`structure:${symbol}` }
    ],
    [
      { text:"🔎 Daten & Belege", callback_data:`evidence:${symbol}` },
      { text:"⚙️ Profi-Analyse", callback_data:`engine:${symbol}` }
    ],
    [{ text:"🏠 Start", callback_data:"home" }]
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
  if(syms.length>=2) rows.push([{ text:'⚖️ Vergleichen', callback_data:'compare' }]);
  rows.push([{ text:'📊 Coins', callback_data:'home:markets' }, { text:'🏠 Start', callback_data:'home' }]);
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
    '⚡ TCX · HILFE','',
    'Du musst dir keine Befehle merken. Nutze am besten /start und tippe auf die Buttons.','',
    'DIE WICHTIGSTEN FUNKTIONEN',
    '/forecast BTC – verständliche Kursprognose',
    '/coin BTC – Coin analysieren',
    '/chart BTC 5m – Chart öffnen',
    '/structure BTC – Marktstruktur erklären',
    '/memory BTC – zeigen, was TCX aus ähnlichen Fällen gelernt hat',
    '/evidence BTC – Daten und Belege hinter der Einschätzung',
    '/validity BTC – prüfen, ob die Einschätzung noch aktuell ist',
    '/alerts – aktive Alarme anzeigen',
    'Startmenü: 🐸 Memecoin-Radar und 🧭 Stimmung & Trends nutzen öffentliche Live-Quellen.','',
    'PROFI-FUNKTIONEN',
    '/intelligence BTC · /engine BTC · /witness BTC · /history BTC',
    '/audit · /fabric · /replay · /release · /obs · /chaos',
    '/portfolio · /trades · /stats · /daystats · /weekstats · /monthstats · /academy · /coach · /league',
    '/why_not_trade · zeigt die letzten Discovery-Gates und Blocker',
    '/oms · /sorstatus · /venuequality · /executionlab','',
    'Hinweis: TCX führt keine echten Orders aus. Systemmodus: ABSTAIN / SHADOW_ONLY.'
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
  const liquidity = s.spreadBps < 1 ? '🟢 gut' : s.spreadBps < 4 ? '🟡 normal' : '🔴 dünn';
  const flow = s.imbalance > 0.15 ? '🟢 mehr Kaufdruck' : s.imbalance < -0.15 ? '🔴 mehr Verkaufsdruck' : '⚪ ausgeglichen';
  const move = Math.abs(s.changePct) < 1 ? '🟢 ruhig' : Math.abs(s.changePct) < 4 ? '🟡 normal' : '🔴 stark';
  return [
    `🧠 PROFI-DETAILS · ${s.symbol.replace('USDT','/USDT')}`,'',
    'EINFACH ERKLÄRT',
    `• Liquidität: ${liquidity}`,
    `• Kauf-/Verkaufsdruck: ${flow}`,
    `• 24h-Schwankung: ${move}`,'',
    'TECHNISCHE DATEN',
    `• Spread: ${fmt(s.spreadBps,3)} bps`,
    `• Orderbuch-Ungleichgewicht: ${fmt(s.imbalance*100,1)} %`,'',
    'Spread = Abstand zwischen bestem Kauf- und Verkaufspreis.',
    'Orderbuch-Ungleichgewicht = ob nahe am aktuellen Preis mehr Kauf- oder Verkaufsvolumen liegt.','',
    'Diese Werte beschreiben den aktuellen Zustand, beweisen aber keine zukünftige Kursrichtung.',
    'Systemmodus: ABSTAIN / SHADOW_ONLY'
  ].join('\n');
}

async function ack(id, text) {
  try { await tg('answerCallbackQuery', { callback_query_id:id, text, show_alert:false }); } catch {}
}

function commandMenuKeyboard(){
  return {inline_keyboard:[
    [{text:'🔮 Kursprognose',callback_data:'cmd:forecast'},{text:'📊 Coin analysieren',callback_data:'cmd:market'}],
    [{text:'🧠 Marktcheck',callback_data:'cmd:intelligence'},{text:'📈 Chart',callback_data:'cmd:chart'}],
    [{text:'🔎 Daten & Belege',callback_data:'cmd:evidence'},{text:'🧠 Was TCX gelernt hat',callback_data:'cmd:memory'}],
    [{text:'⚙️ Profi-Analyse',callback_data:'cmd:engine'},{text:'🖥 System',callback_data:'cmd:system'}],
    [{text:'🏠 Start',callback_data:'home'}]
  ]};
}
async function showCommandMenu(chatId,messageId){
  const payload={
    chat_id:chatId,
    text:[
      '⚙️ ALLE TCX-FUNKTIONEN','',
      'Wähle einfach aus, was du wissen willst.',
      'Bei Coin-Funktionen wählst du danach nur noch BTC, ETH, SOL usw. aus.','',
      'Die normalen Ansichten erklären Ergebnisse einfach.',
      'Profi-Ansichten zeigen zusätzlich technische Details.'
    ].join('\n'),
    reply_markup:commandMenuKeyboard()
  };
  if(messageId)return tg('editMessageText',{...payload,message_id:messageId});
  return tg('sendMessage',payload);
}
async function showCommandMarkets(chatId,messageId,command){
  const rows=buildCommandMarketRows(markets,command,{symbolLabel,limit:12});
  const names={
    forecast:'Kursprognose',
    intelligence:'Marktcheck',
    market:'Coin-Analyse',
    chart:'Chart',
    evidence:'Daten & Belege',
    memory:'Lernhistorie',
    engine:'Profi-Analyse'
  };
  return tg('editMessageText',{
    chat_id:chatId,
    message_id:messageId,
    text:'🪙 '+(names[command]||'Analyse')+'\n\nWelchen Coin möchtest du öffnen?',
    reply_markup:{inline_keyboard:rows}
  });
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
      '📊 COIN ANALYSIEREN','',
      'Wähle einen Coin. TCX zeigt dir danach auf einen Blick:',
      '• aktuellen Preis und 24h-Bewegung',
      '• Richtung und Marktphase',
      '• Kauf-/Verkaufsdruck',
      '• Risiko und Unsicherheit','',
      'Danach kannst du Prognose, Chart oder „Warum?“ direkt antippen.'
    ].join('\n'),
    reply_markup:productMarketsKeyboard(markets,favoriteSet(chatId).size)
  };
  if(messageId) await tg('editMessageText',{...payload,message_id:messageId});
  else await tg('sendMessage',payload);
}

function compactUsd(v){
  const n=Number(v);
  if(!Number.isFinite(n)) return '—';
  const a=Math.abs(n);
  if(a>=1e9) return '$'+(n/1e9).toFixed(2)+'B';
  if(a>=1e6) return '$'+(n/1e6).toFixed(2)+'M';
  if(a>=1e3) return '$'+(n/1e3).toFixed(1)+'K';
  if(a>=1) return '$'+n.toFixed(2);
  if(a>=0.01) return '$'+n.toFixed(4);
  return '$'+n.toFixed(8);
}

function signedPercent(v,d=1){
  const n=Number(v);
  return Number.isFinite(n)?(n>=0?'+':'')+n.toFixed(d)+'%':'—';
}

function memecoinRisk(pair,now=Date.now()){
  if(!pair) return {label:'⚪ unbekannt',reasons:['keine verwertbaren DEX-Paardaten']};
  const liq=Number(pair.liquidityUsd);
  const created=Number(pair.pairCreatedAt);
  const ageMs=Number.isFinite(created)?Math.max(0,now-created):null;
  const reasons=[];
  let level=1;
  if(!Number.isFinite(liq)||liq<=0){level=3;reasons.push('Liquidität unbekannt');}
  else if(liq<25000){level=3;reasons.push('sehr geringe Liquidität');}
  else if(liq<100000){level=Math.max(level,2);reasons.push('geringe Liquidität');}
  if(ageMs!=null&&ageMs<3600000){level=3;reasons.push('Pair jünger als 1 Stunde');}
  else if(ageMs!=null&&ageMs<86400000){level=Math.max(level,2);reasons.push('Pair jünger als 24 Stunden');}
  return {label:level>=3?'🔴 sehr hoch':level===2?'🟠 erhöht':'🟡 memecoin-typisch hoch',reasons};
}

function pairAgeText(createdAt,now=Date.now()){
  const t=Number(createdAt);
  if(!Number.isFinite(t)) return 'Alter unbekannt';
  const h=Math.floor(Math.max(0,now-t)/3600000);
  if(h<1) return '<1h alt';
  if(h<48) return h+'h alt';
  return Math.floor(h/24)+'d alt';
}

async function showMemecoinRadar(chatId,messageId,{force=false}={}){
  const started=Date.now();
  try{
    const radar=await dexScreenerProvider.fetchMemecoinRadar({limit:6,chainIds:['solana','base','ethereum'],force});
    const rows=[];
    radar.rows.forEach((item,i)=>{
      const p=item.pair;
      const risk=memecoinRisk(p,radar.capturedAt);
      const name=p?.baseToken?.symbol||p?.baseToken?.name||item.tokenAddress.slice(0,8)+'…';
      rows.push(
        (i+1)+'. '+name+' · '+String(item.chainId||'').toUpperCase(),
        '   Preis '+compactUsd(p?.priceUsd)+' · 1h '+signedPercent(p?.priceChangeH1)+' · Vol '+compactUsd(p?.volumeH1),
        '   Liquidität '+compactUsd(p?.liquidityUsd)+' · Käufe/Verkäufe 1h '+(p?.buysH1??'—')+'/'+(p?.sellsH1??'—')+' · '+pairAgeText(p?.pairCreatedAt,radar.capturedAt),
        '   Risikoindikator: '+risk.label
      );
    });
    const text=[
      '🐸 MEMECOIN-RADAR · LIVE','',
      'TCX zeigt aktuell stark beworbene/auffällige Tokens aus öffentlichen DEX-Daten.',
      'Das ist KEIN Ranking nach Kaufchance.','',
      ...(rows.length?rows:['Keine verwertbaren Tokens aus der Live-Quelle erhalten.']),'',
      ...(radar.errors.length?['⚠️ '+radar.errors.length+' Token-Abfragen konnten nicht geladen werden.']:[]),
      'WICHTIGE DATENLÜCKEN',
      '• Holder-Konzentration wird hier noch nicht verifiziert.',
      '• LP-Lock/Mint-/Freeze-Rechte werden durch DEX-Daten allein nicht bewiesen.',
      '• Der Risikoindikator nutzt nur sichtbare Liquidität und Pair-Alter.','',
      'Quelle: DEX Screener Public API',
      'Systemmodus: ABSTAIN / SHADOW_ONLY'
    ].join('\n');
    recordOperation(observability,{name:'memecoin_radar',ok:true,latencyMs:Date.now()-started});
    return deliverTelegramTextCard(tg,chatId,messageId,{
      text:text.slice(0,4096),
      reply_markup:{inline_keyboard:[
        [{text:'🔄 Aktualisieren',callback_data:'home:memecoins'},{text:'🧭 Stimmung & Trends',callback_data:'home:trends'}],
        [{text:'🏠 Start',callback_data:'home'}]
      ]}
    });
  }catch(err){
    const message=err instanceof Error?err.message:String(err);
    recordError(observability,{scope:'memecoin_radar',message});
    recordOperation(observability,{name:'memecoin_radar',ok:false,latencyMs:Date.now()-started,error:message});
    return deliverTelegramTextCard(tg,chatId,messageId,{
      text:['🐸 MEMECOIN-RADAR','','Live-Quelle gerade nicht verfügbar.','TCX zeigt deshalb keine erfundenen Token-Daten.','','Quelle: DEX Screener Public API','Systemmodus: ABSTAIN / SHADOW_ONLY'].join('\n'),
      reply_markup:{inline_keyboard:[[{text:'🔄 Nochmal versuchen',callback_data:'home:memecoins'},{text:'🏠 Start',callback_data:'home'}]]}
    });
  }
}

function sentimentLabel(value,classification){
  const n=Number(value);
  if(!Number.isFinite(n)) return '⚪ unbekannt';
  if(n<=24) return '🔴 '+(classification||'Extreme Fear');
  if(n<=44) return '🟠 '+(classification||'Fear');
  if(n<=55) return '⚪ '+(classification||'Neutral');
  if(n<=74) return '🟡 '+(classification||'Greed');
  return '🟠 '+(classification||'Extreme Greed');
}

async function showTrendContext(chatId,messageId,{force=false}={}){
  const started=Date.now();
  const [contextResult,metaResult]=await Promise.allSettled([
    publicMarketContextProvider.fetchContext({force}),
    dexScreenerProvider.fetchTrendingMetas({limit:6,force})
  ]);
  const context=contextResult.status==='fulfilled'?contextResult.value:null;
  const metas=metaResult.status==='fulfilled'?metaResult.value:null;
  const s=context?.sentiment;
  const g=context?.global;
  const metaLines=(metas?.rows||[]).flatMap((m,i)=>[
    (i+1)+'. '+(m.name||m.slug||'Unbekannter Trend')+' · '+(m.tokenCount||0)+' Tokens',
    '   1h '+signedPercent(m.marketCapChange?.h1)+' · 24h '+signedPercent(m.marketCapChange?.h24)+' · Vol '+compactUsd(m.volume)+' · Liq '+compactUsd(m.liquidity)
  ]);
  const errors=[
    ...(context?.errors||[]),
    ...(contextResult.status==='rejected'?[{source:'Alternative.me',error:contextResult.reason instanceof Error?contextResult.reason.message:String(contextResult.reason)}]:[]),
    ...(metaResult.status==='rejected'?[{source:'DEX Screener',error:metaResult.reason instanceof Error?metaResult.reason.message:String(metaResult.reason)}]:[])
  ];
  const text=[
    '🧭 MARKTSTIMMUNG & TRENDS · LIVE','',
    'GESAMTMARKT',
    s?'Fear & Greed: '+s.value+'/100 · '+sentimentLabel(s.value,s.classification)+(s.delta==null?'':' · Δ '+(s.delta>=0?'+':'')+s.delta):'Fear & Greed: ⚪ nicht verfügbar',
    g?'Bitcoin-Dominanz: '+(Number.isFinite(g.bitcoinDominancePct)?g.bitcoinDominancePct.toFixed(1)+'%':'—'):'Bitcoin-Dominanz: —',
    g?'Gesamtmarkt: '+compactUsd(g.totalMarketCapUsd)+' · 24h-Volumen '+compactUsd(g.totalVolume24hUsd):'Gesamtmarkt: —','',
    'TRENDING DEX-METAS',
    ...(metaLines.length?metaLines:['Keine Meta-Trends verfügbar.']),'',
    'SO IST DAS ZU LESEN',
    '• Fear & Greed beschreibt Marktstimmung, keine Kurswahrscheinlichkeit.',
    '• DEX-Metas zeigen, wo Aktivität/Kapital gerade gebündelt ist; sie sind kein Social-Sentiment und kein Kaufsignal.',
    ...(errors.length?['⚠️ Teilweise eingeschränkt: '+errors.length+' Quelle(n)/Abruf(e) fehlgeschlagen.']:[]),'',
    'Quellen: Alternative.me (Fear & Greed / Global Market) · DEX Screener Public API',
    'Systemmodus: ABSTAIN / SHADOW_ONLY'
  ].join('\n');
  const ok=Boolean(s||g||metaLines.length);
  recordOperation(observability,{name:'public_trend_context',ok,latencyMs:Date.now()-started,error:ok?null:'all public context sources unavailable'});
  return deliverTelegramTextCard(tg,chatId,messageId,{
    text:text.slice(0,4096),
    reply_markup:{inline_keyboard:[
      [{text:'🔄 Aktualisieren',callback_data:'home:trends'},{text:'🐸 Memecoin-Radar',callback_data:'home:memecoins'}],
      [{text:'🏠 Start',callback_data:'home'}]
    ]}
  });
}

const TCX_UI_VERSION='TCX_COMMAND_CENTER_UI_V2';
function tcxShell(title,{subtitle=null,lines=[],footer='SHADOW ONLY · REAL ORDERS BLOCKED'}={}){return ['TCX // '+String(title).toUpperCase(),'━━━━━━━━━━━━━━━━━━━━',...(subtitle?[subtitle,'']:[]),...lines,'',footer].join('\n').slice(0,4096);}
function tcxState(v){const x=String(v||'').toUpperCase();if(['READY','ONLINE','HEALTHY','ACTIVE','ON','VALID','SUPPORTED'].includes(x))return '● '+x;if(['DEGRADED','WATCH','CAUTION','LEARNING','COLLECTING_SEED'].includes(x))return '◐ '+x;if(['ERROR','BLOCKED','DECAYING','OFF'].includes(x))return '○ '+x;return '· '+(x||'UNKNOWN');}
function tcxHomeKeyboard(){return {inline_keyboard:[[{text:'◉ LIVE RADAR',callback_data:'home:radar'},{text:'▦ MÄRKTE',callback_data:'home:markets'}],[{text:'▤ PORTFOLIO',callback_data:'home:portfolio'},{text:'⌁ LEARNING',callback_data:'home:performance'}],[{text:'◇ PROOF',callback_data:'home:proof'},{text:'⚙ SYSTEM',callback_data:'home:system'}],[{text:'☰ MEHR',callback_data:'home:more'}]]};}

function learningPct01(v,d=1){
  const n=Number(v);
  return Number.isFinite(n)?(n*100).toFixed(d)+'%':'—';
}

function renderLearningCenterText(){
  const summary=buildForecastLearningSummary(forecastRuntime,{
    minDisplaySamples:30,
    autoLearnEnabled,
    autoLearnSymbols,
    autoLearnForecastMs,
    now:Date.now()
  });
  const competition=shadowCompetitionSummary(shadowCompetitionState||{});
  const research=featureResearchSummary(featureResearchState||{});
  const governor=experimentGovernorSummary(experimentGovernorState||{});
  const phaseLabel={
    COLD_START:'⚪ Startphase',
    LEARNING:'🟡 Lernphase',
    MEASURING:'🟢 Messphase',
    CANDIDATE_READY:'🧪 Kandidatenprüfung'
  }[summary.phase]||summary.phase;

  const lines=[
    'TCX // LEARNING LAB','━━━━━━━━━━━━━━━━━━━━','',
    'STATUS       '+phaseLabel,
    'AUTOLEARN    '+(summary.autoLearn.enabled?'🟢 aktiv':'⏸ aus'),
    'MÄRKTE       '+summary.autoLearn.symbols.length,
    'FORECASTS    '+summary.issuedForecasts,
    'AUSGEWERTET  '+summary.resolvedOutcomes,
    'OFFEN        '+summary.pendingOutcomes,'',
    'FORTSCHRITT'
  ];

  for(const horizon of summary.horizons.slice(0,4)){
    let row=horizon.horizonId.toUpperCase()+'   '+horizon.resolved+' fertig · '+horizon.pending+' offen';
    if(horizon.metricsReady) row+=' · Treffer '+learningPct01(horizon.metrics.directionalAccuracy,0);
    lines.push(row);
  }

  const competitionState=competition.status==='ACTIVE'
    ?'🟢 aktiv'
    :'🟡 '+String(competition.status||'wartet').replaceAll('_',' ').toLowerCase();
  const researchState=research.status==='ACTIVE'
    ?'🟢 aktiv'
    :'⚪ '+String(research.status||'wartet').replaceAll('_',' ').toLowerCase();

  lines.push(
    '',
    'RESEARCH',
    'Modellwettbewerb  '+competitionState+' · '+competition.candidates.length+' Kandidaten',
    'Feature Research   '+researchState+' · '+research.experiments.length+' Tests',
    'Experiment Gate    '+String(governor.status||'UNINITIALIZED').replaceAll('_',' ')+' · Gen '+(governor.generationNumber||'—'),
    '',
    'PROMOTION',
    'Fälle '+summary.promotion.resolvedCases+'/'+summary.promotion.requiredCases+
      ' · Episoden '+summary.promotion.independentEpisodes+'/'+summary.promotion.requiredIndependentEpisodes,
    'Gate '+(summary.promotion.dataReady?'🟢 Datenbasis bereit':'🟡 sammelt Evidenz'),
    '',
    'Produktionsmodell wird niemals automatisch durch einen Kandidaten ersetzt.',
    'ABSTAIN / SHADOW_ONLY'
  );
  return lines.join('\n').slice(0,4096);
}

async function showLearningCenter(chatId,messageId=null){
  return deliverTelegramTextCard(tg,chatId,messageId,{
    text:renderLearningCenterText(),
    reply_markup:{inline_keyboard:[
      [{text:'📐 Forecast Accuracy',callback_data:'accuracy:ALL'},{text:'🔄 Aktualisieren',callback_data:'home:performance'}],
      [{text:'🖥 System',callback_data:'home:system'},{text:'🏠 Start',callback_data:'home'}]
    ]}
  });
}

async function showPremiumMore(chatId,messageId){
  const payload={chat_id:chatId,text:['☰ TCX · MEHR','','Lernen & Entwicklung','Strategien testen, Qualität prüfen und Fortschritt verfolgen.','','System & Tools','Technische Diagnose und erweiterte Funktionen.'].join('\n'),reply_markup:{inline_keyboard:[[{text:'🧪 Lernzentrum',callback_data:'home:performance'},{text:'🏆 Academy',callback_data:'home:academy'}],[{text:'🧠 Coach',callback_data:'home:coach'},{text:'🏁 Strategy League',callback_data:'home:league'}],[{text:'🧭 Trends',callback_data:'home:trends'},{text:'🐸 Memecoins',callback_data:'home:memecoins'}],[{text:'🧾 Proof',callback_data:'home:proof'},{text:'🖥 System',callback_data:'home:system'}],[{text:'⚙️ Tools',callback_data:'commands'}],[{text:'🏠 Command Center',callback_data:'home'}]]}};
  if(messageId)return tg('editMessageText',{...payload,message_id:messageId});return tg('sendMessage',payload);
}

function dataStatusIcon(snapshot,{optional=false}={}){
  if(snapshot?.ok===true) return '🟢 LIVE';
  const reason=String(snapshot?.reason||'').toUpperCase();
  if(optional&&(reason.includes('NOT_CONFIGURED')||reason.includes('UNSUPPORTED'))) return '⚪ OPTIONAL';
  return '🔴 DOWN';
}
function dataAge(ms){
  const n=Number(ms);
  if(!Number.isFinite(n)) return '—';
  const age=Math.max(0,Date.now()-n);
  if(age<60_000) return Math.round(age/1000)+'s';
  if(age<3_600_000) return Math.round(age/60_000)+'m';
  return Math.round(age/3_600_000)+'h';
}
async function showDataStatus(chatId,messageId=null){
  const [venues,derivatives,external,btc,eth,sol]=await Promise.all([
    fetchSorVenueBooks('BTCUSDT').catch(error=>({books:[],errors:[{venue:'ALL',error:error instanceof Error?error.message:String(error)}],capturedAt:Date.now()})),
    derivativesResearchProvider.fetchSnapshot('BTCUSDT',{cacheMs:0}).catch(error=>({ok:false,reason:error instanceof Error?error.message:String(error),availableAt:Date.now()})),
    externalResearchProvider.fetchBundle('BTCUSDT',{force:true}).catch(error=>({
      coinMetrics:{ok:false,reason:error instanceof Error?error.message:String(error)},
      deribitOptions:{ok:false,reason:error instanceof Error?error.message:String(error)},
      macro:{ok:false,reason:error instanceof Error?error.message:String(error)},
      predictionMarket:{ok:false,reason:error instanceof Error?error.message:String(error)}
    })),
    onchainResearchProvider.fetchAssetSnapshot('BTCUSDT',{cacheMs:0}).catch(error=>({ok:false,reason:error instanceof Error?error.message:String(error)})),
    onchainResearchProvider.fetchAssetSnapshot('ETHUSDT',{cacheMs:0}).catch(error=>({ok:false,reason:error instanceof Error?error.message:String(error)})),
    onchainResearchProvider.fetchAssetSnapshot('SOLUSDT',{cacheMs:0}).catch(error=>({ok:false,reason:error instanceof Error?error.message:String(error)}))
  ]);
  const venueSet=new Set((venues?.books||[]).map(x=>String(x?.venue||'').toUpperCase()));
  const venueLine=name=>(venueSet.has(name)?'🟢 LIVE':'🔴 DOWN');
  const liq=liquidationResearchStream.health();
  const gov=researchDataGovernanceSummary(researchDataGovernance,{now:Date.now()});
  const macroTransport=external?.macro?.provenance?.transport==='FRED_API'?'API + Vintage':external?.macro?.provenance?.transport==='FRED_GRAPH_CSV'?'Public CSV + PIT Capture':'—';
  const macroAge=dataAge(external?.macro?.availableAt);
  const cmAge=dataAge(external?.coinMetrics?.availableAt);
  const deribitAge=dataAge(external?.deribitOptions?.availableAt);
  const text=[
    '📡 TCX // DATA STATUS',
    '━━━━━━━━━━━━━━━━━━━━','',
    'MARKET FEEDS',
    'Binance      '+venueLine('BINANCE'),
    'OKX          '+venueLine('OKX'),
    'Kraken       '+venueLine('KRAKEN'),
    'Derivatives  '+(derivatives?.ok===true?'🟢 LIVE':'🔴 DOWN'),
    'Liquidation  '+(liq?.connected===true?'🟢 LIVE':'🟡 CONNECTING'),'',
    'ON-CHAIN',
    'Bitcoin      '+dataStatusIcon(btc),
    'Ethereum     '+dataStatusIcon(eth),
    'Solana       '+dataStatusIcon(sol),
    'Coin Metrics '+dataStatusIcon(external?.coinMetrics)+' · '+cmAge+' alt','',
    'OPTIONS + MACRO',
    'Deribit      '+dataStatusIcon(external?.deribitOptions)+' · '+deribitAge+' alt',
    'FRED         '+dataStatusIcon(external?.macro)+' · '+macroTransport+' · '+macroAge+' alt',
    'Polymarket   '+dataStatusIcon(external?.predictionMarket,{optional:true}),'',
    'DATA GOVERNANCE',
    'Research Plane '+(researchDataPlane.healthy?'🟢 HEALTHY':'🔴 ERROR')+' · '+researchDataPlane.totalRecords+' Snapshots',
    'Governance     '+(researchGovernanceHealthy?'🟢 HEALTHY':'🟡 CHECK')+' · '+gov.featureCatalog.featureCount+' Features',
    'Quarantined    '+Number(gov.statuses?.QUARANTINED||0),'',
    'Polymarket bleibt OPTIONAL, bis ein Markt eindeutig einem TCX-Symbol zugeordnet ist.',
    'FRED ohne API-Key nutzt den öffentlichen CSV-Feed und archiviert Abrufe Point-in-Time.','',
    'SHADOW_ONLY · REAL ORDERS BLOCKED'
  ].join('\n').slice(0,4096);
  return deliverTelegramTextCard(tg,chatId,messageId,{
    text,
    reply_markup:{inline_keyboard:[
      [{text:'🔄 Neu prüfen',callback_data:'home:data'},{text:'🖥 System',callback_data:'home:system'}],
      [{text:'🏠 Command Center',callback_data:'home'}]
    ]}
  });
}

function terminalKeyboard(symbol=null){
 const rows=[];
 if(symbol){
  rows.push([{text:'🎯 SETUP',callback_data:`terminal:setup:${symbol}`},{text:'⚠️ RISK',callback_data:`terminal:risk:${symbol}`}]);
  rows.push([{text:'🧠 SUPERCHART',callback_data:`superchart:${symbol}:PRO:5m`},{text:'📡 SIGNAL',callback_data:`terminal:signal:${symbol}`}]);
 }
 rows.push([{text:'◉ SUPER RADAR',callback_data:'terminal:radar'},{text:'🏠 Home',callback_data:'home'}]);
 return {inline_keyboard:rows};
}
async function terminalContext(symbol){
 const state=await researchState(symbol,'5m');
 const [book]=await Promise.all([fetchExecutionBook(symbol)]);
 let liquidation=null;try{liquidation=liquidationResearchStream.snapshot(symbol,{asOf:state.availableAt,referencePrice:Number(state.market.price),clusterBinBps:25,maxClusters:12});}catch{}
 const confluence=buildConfluenceMap({symbol,currentPrice:Number(state.market.price),analysis:state.analysis,book,liquidation,intelligenceFeatures:[],mergeBps:20});
 const forecast=forecastIssuanceToChartOverlay(latestInstitutionalForecast(forecastRuntime,symbol),{now:state.availableAt,maxAgeMs:6*60*60_000});
 const events=buildStructureEventRadar({symbol,analyses:{'1m':state.mtf?.analyses?.['1m'],'5m':state.mtf?.analyses?.['5m'],'15m':state.mtf?.analyses?.['15m'],'1h':state.mtf?.analyses?.['1h'],'4h':state.mtf?.analyses?.['4h']},candlesByTf:state.byTf,now:state.availableAt});
 const accuracy=buildForecastAccuracyView(forecastRuntime?.journal?.all?.()??[],{symbol,minDisplaySamples:30,foldSize:50,highConfidenceThreshold:.65});
 const setup=buildSuperSetup({symbol,state,forecast,events,confluence});
 const risk=buildSuperRisk({symbol,state,liquidation,accuracy,confluence});
 const signal=buildSuperSignal({symbol,setup,risk,forecast});
 return {state,liquidation,confluence,forecast,events,accuracy,setup,risk,signal};
}
async function showSuperRadar(chatId,messageId){
 const now=Date.now();
 const rows=requestedSymbols.map(symbol=>{
  const r=radarCache.get(symbol);
  return {symbol,witnessAgreement:r?.witnessAgreement??0,support:r?.support??0,pressureScore:r?.pressureScore??0,eventCount:r?.eventCount??0,ageMs:r?.capturedAt?Math.max(0,now-r.capturedAt):null,status:r?.status||'ABSTAIN',regime:r?.regime||'UNKNOWN'};
 });
 const radar=buildSuperRadar(rows);
 const buttons=radar.rows.slice(0,10).map(x=>[{text:String(x.symbol).replace('USDT','')+' · '+Math.round(x.evidence*100)+'/100',callback_data:`terminal:setup:${x.symbol}`}]);
 buttons.push([{text:'↻ REFRESH',callback_data:'terminal:radar'},{text:'🏠 Home',callback_data:'home'}]);
 return deliverTelegramTextCard(tg,chatId,messageId,{text:renderSuperRadar(radar),reply_markup:{inline_keyboard:buttons}});
}
async function finalFoundationContext(symbol){
 const world=await worldModelContext(symbol);
 const science=await scientificBrainContext(symbol);
 // Re-fetch bounded PIT series because graph intentionally stores summaries, not raw candles.
 const symbols=[...new Set([symbol,...requestedSymbols])].slice(0,12),series={};
 const fetched=await Promise.allSettled(symbols.map(async s=>({symbol:s,rows:(await fetchKlines(s,'5m',130)).rows})));
 for(const x of fetched){if(x.status!=='fulfilled')continue;const candles=closedCandles(candlesFromKlines(x.value.rows,world.state.availableAt));if(candles.length>=48)series[x.value.symbol]=candles.map(k=>({closeTime:k.closeTime,close:k.c}));}
 const temporal=discoverLeadLag(series,{asOf:world.state.availableAt,maxLagBars:6,minSamples:48,minAbsCorrelation:.25,maxHypotheses:200});
 const shock=buildShockPropagation({seriesBySymbol:series,graph:world.graph,asOf:world.state.availableAt});
 const eventMemory=buildEventReactionMemory([],{asOf:world.state.availableAt});
 const tradeDiagnostics=summarizeTradeDiscovery(tradeDiscoveryDiagnostics,{now:world.state.availableAt,runtime:{}});
 const readiness=buildSystemReadiness({world,science,leadLag:temporal,shock,eventMemory,tradeDiagnostics});
 return {...world,science,leadLag:temporal,shock,eventMemory,tradeDiagnostics,readiness};
}
async function showFinalFoundation(chatId,messageId,symbol){
 const x=await finalFoundationContext(symbol);
 return deliverTelegramTextCard(tg,chatId,messageId,{text:renderFinalFoundation(x),reply_markup:{inline_keyboard:[
  [{text:'🌐 WORLD MODEL',callback_data:`world:${symbol}`},{text:'🔬 SCIENTIFIC BRAIN',callback_data:`science:${symbol}`}],
  [{text:'🔎 TRADE DIAGNOSTICS',callback_data:'home:trade_diagnostics'},{text:'🧠 SUPERCHART',callback_data:`superchart:${symbol}:FULL:5m`}],
  [{text:'↻ REFRESH',callback_data:`foundation:${symbol}`},{text:'🏠 Home',callback_data:'home'}]
 ]}});
}

async function worldModelContext(symbol){
 const state=await researchState(symbol,'5m');
 const symbols=[...new Set([symbol,...requestedSymbols])].slice(0,12);
 const fetched=await Promise.allSettled(symbols.map(async s=>({symbol:s,rows:(await fetchKlines(s,'5m',130)).rows})));
 const series={};
 for(const x of fetched){if(x.status!=='fulfilled')continue;const candles=closedCandles(candlesFromKlines(x.value.rows,state.availableAt));if(candles.length>=48)series[x.value.symbol]=candles.map(k=>({closeTime:k.closeTime,close:k.c}));}
 const correlationModel=buildPointInTimeCorrelation(series,{asOf:state.availableAt,window:96,minSamples:48});
 const graph=buildMarketGraph({correlationModel,seriesBySymbol:series,asOf:state.availableAt,minCorrelation:.35});
 const assetClassBySymbol=Object.fromEntries(Object.keys(series).map(s=>[s,/DOGE|PEPE|SHIB|BONK|WIF|FLOKI|MEME/i.test(s)?'MEME':s===symbol?'FOCUS':'CORE']));
 const rotation=buildCapitalRotation({seriesBySymbol:series,assetClassBySymbol,asOf:state.availableAt,minAssetsPerClass:2});
 const genome=buildRegimeGenome({state,rotation,graph});
 return {state,graph,rotation,genome};
}
async function showWorldModel(chatId,messageId,symbol){
 const x=await worldModelContext(symbol);
 return deliverTelegramTextCard(tg,chatId,messageId,{text:renderWorldModelFoundation(x),reply_markup:{inline_keyboard:[
  [{text:'🔬 SCIENTIFIC BRAIN',callback_data:`science:${symbol}`},{text:'🧬 COGNITIVE CORE',callback_data:`cognitive:${symbol}`}],
  [{text:'🧱 FINAL FOUNDATION',callback_data:`foundation:${symbol}`}],
  [{text:'🧠 SUPERCHART',callback_data:`superchart:${symbol}:FULL:5m`},{text:'◉ RADAR',callback_data:'terminal:radar'}],
  [{text:'↻ REFRESH',callback_data:`world:${symbol}`},{text:'🏠 Home',callback_data:'home'}]
 ]}});
}

async function scientificBrainContext(symbol){
 const base=await terminalContext(symbol);
 await captureEpisodeFromState(base.state,{persist:true});
 const memory=buildSuperMemory(episodeVector({analysis:base.state.memoryAnalysis,dashboard:base.state.memoryDashboard}),episodes,{symbol,horizonBars:12,k:60,minSimilarity:.35});
 const discovered=discoverPatterns(episodes.filter(e=>e.symbol===symbol),{horizonBars:12,minCases:20,minIndependentCases:10,minAbsMedianReturn:.20,maxPatterns:12});
 const validation=validateDiscoveredPatterns(discovered,{minIndependentCases:20,minDirectionalHitRate:.56,minRobustness:.55});
 const twin=buildDigitalTwin({symbol,price:Number(base.state.market.price),forecast:base.forecast,memory,patterns:validation});
 const shadowLeague=strategyLeagueSummary(strategyLeagueLedger,{asOf:base.state.availableAt});
 const league=buildModelLeague({strategyLeague:shadowLeague,accuracy:base.accuracy,patterns:validation,memory});
 const diagnostics=diagnoseScientificBrain({state:base.state,accuracy:base.accuracy,memory,patterns:validation,twin,league});
 const debate=buildBullBearDebate({setup:base.setup,risk:base.risk,memory,patterns:validation,twin,diagnostics});
 const judge=buildMetaJudge({setup:base.setup,risk:base.risk,debate,diagnostics,league});
 return {...base,memory,validation,twin,league,diagnostics,debate,judge};
}
async function showScientificBrain(chatId,messageId,symbol){
 const x=await scientificBrainContext(symbol);
 return deliverTelegramTextCard(tg,chatId,messageId,{text:renderScientificBrain(x),reply_markup:{inline_keyboard:[
  [{text:'🧬 COGNITIVE CORE',callback_data:`cognitive:${symbol}`},{text:'🧠 SUPERCHART',callback_data:`superchart:${symbol}:FULL:5m`}],
  [{text:'🌐 WORLD MODEL',callback_data:`world:${symbol}`}],
  [{text:'⚠️ RISK',callback_data:`terminal:risk:${symbol}`},{text:'📐 ACCURACY',callback_data:`accuracy:${symbol}`}],
  [{text:'↻ REFRESH',callback_data:`science:${symbol}`},{text:'🏠 Home',callback_data:'home'}]
 ]}});
}

async function showCognitiveCore(chatId,messageId,symbol){
 const state=await researchState(symbol,'5m');
 await captureEpisodeFromState(state,{persist:true});
 const memory=buildSuperMemory(episodeVector({analysis:state.memoryAnalysis,dashboard:state.memoryDashboard}),episodes,{symbol,horizonBars:12,k:60,minSimilarity:.35});
 const patterns=discoverPatterns(episodes.filter(e=>e.symbol===symbol),{horizonBars:12,minCases:20,minIndependentCases:10,minAbsMedianReturn:.20,maxPatterns:12});
 const forecast=forecastIssuanceToChartOverlay(latestInstitutionalForecast(forecastRuntime,symbol),{now:state.availableAt,maxAgeMs:6*60*60_000});
 const twin=buildDigitalTwin({symbol,price:Number(state.market.price),forecast,memory,patterns});
 const text=renderCognitiveCore({memory,patterns,twin});
 return deliverTelegramTextCard(tg,chatId,messageId,{text,reply_markup:{inline_keyboard:[
   [{text:'🧠 SUPERCHART',callback_data:`superchart:${symbol}:FULL:5m`},{text:'🎯 SETUP',callback_data:`terminal:setup:${symbol}`}],
   [{text:'🔬 SCIENTIFIC BRAIN',callback_data:`science:${symbol}`}],
   [{text:'↻ REFRESH',callback_data:`cognitive:${symbol}`},{text:'◉ RADAR',callback_data:'terminal:radar'}],
   [{text:'🏠 Home',callback_data:'home'}]
 ]}});
}

async function showTerminalView(chatId,messageId,symbol,view){
 const x=await terminalContext(symbol);
 const text=view==='RISK'?renderSuperRisk(x.risk):view==='SIGNAL'?renderSuperSignal(x.signal):renderSuperSetup(x.setup);
 return deliverTelegramTextCard(tg,chatId,messageId,{text,reply_markup:terminalKeyboard(symbol)});
}

const globalIntelEvents=[];
function globalIntelSnapshot(){return globalIntelEvents.slice(-250);}
async function showGlobalIntel(chatId,messageId,filter='TOP'){
  return deliverTelegramTextCard(tg,chatId,messageId,{text:renderGlobalIntelFeed(globalIntelSnapshot(),{filter}),reply_markup:globalIntelKeyboard(filter)});
}

async function showHomeSection(chatId,messageId,section) {
  if(section==='TERMINAL') return showSuperRadar(chatId,messageId);
  if(section==='DATA') return showDataStatus(chatId,messageId);
  if(section==='MARKETS') return showMarkets(chatId,messageId);
  if(section==='WATCHLIST') return showFavorites(chatId,messageId);
  if(section==='MEMECOINS') return showMemecoinRadar(chatId,messageId);
  if(section==='TRENDS') return showTrendContext(chatId,messageId);
  if(section==='PERFORMANCE') return showLearningCenter(chatId,messageId);
  if(section==='PORTFOLIO') return showShadowPortfolio(chatId,messageId);
  if(section==='ACADEMY') return showShadowCapitalAcademy(chatId,messageId);
  if(section==='COACH') return showShadowTrainingCoach(chatId,messageId);
  if(section==='LEAGUE') return showStrategyLeague(chatId,messageId);
  if(section==='STATS_DAY') return showShadowTradeStats(chatId,messageId,'DAY');
  if(section==='STATS_WEEK') return showShadowTradeStats(chatId,messageId,'WEEK');
  if(section==='STATS_MONTH') return showShadowTradeStats(chatId,messageId,'MONTH');
  if(section==='STATS_ALL') return showShadowTradeStats(chatId,messageId,'ALL');
  if(section==='MORE') return showPremiumMore(chatId,messageId);
  if(section==='NEWS') return showGlobalIntel(chatId,messageId,'TOP');
  if(section==='PROOF') { const p=buildTcxProofReport(shadowPortfolioLedger), icon=p.status==='ROBUST'?'🟢':p.status==='EMERGING'?'🟡':'⚪', wf=p.walkForward.validationMode==='FROZEN_POLICY_OOS'?'🟢 Frozen OOS':'🟡 Replay only'; const body=['🧾 TCX PROOF CENTER','',icon+' EVIDENZSTATUS   '+p.status,'PRÜFUNGEN       '+p.passedChecks+'/'+p.totalChecks,'TRADES          '+p.evidence.trades,'FORWARD TRADES  '+p.evidence.forwardTrades,'','VALIDIERUNG','Walk-Forward     '+wf,'Tail Risk        '+(p.tailRisk.passed?'🟢 bestanden':'🟡 nicht bestanden'),'Independent Audit '+(p.audit.passed?'🟢 bestanden':'🟡 nicht bestanden'),'Regime-Breite   '+p.regimes.distinct+' Regimes · '+p.regimes.matureCells+' reif','','RISIKO','Max Drawdown     '+(Number.isFinite(p.evidence.maxDrawdownPct)?fmt(p.evidence.maxDrawdownPct*100,1)+'%':'—'),'Stress p95 DD    '+(Number.isFinite(p.tailRisk.p95DrawdownPct)?fmt(p.tailRisk.p95DrawdownPct*100,1)+'%':'—'),'','ROBUST verlangt echte eingefrorene Out-of-Sample-Policy-Evidenz.','Status ist kein Profitversprechen und keine Live-Freigabe.','ABSTAIN / SHADOW_ONLY']; return deliverTelegramTextCard(tg,chatId,messageId,{text:body.join('\n'),reply_markup:{inline_keyboard:[[{text:'🔄 Aktualisieren',callback_data:'home:proof'},{text:'🧪 Lernzentrum',callback_data:'home:performance'}],[{text:'🏠 Command Center',callback_data:'home'}]]}}); }

  let text='';
  if(section==='ALERTS') {
    const list=activeAlerts(chatId);
    text=list.length
      ? ['🔔 DEINE ALERTS','',
         'TCX beobachtet diese Bedingungen für dich:','',
         ...list.map((a,i)=>`${i+1}. ${describeAlert(a)}`),'',
         'Neuen Preisalarm setzen: /alert BTC 70000',
         'Weitere Alarmtypen findest du über den 🔔-Button bei einem Coin.'].join('\n')
      : ['🔔 DEINE ALERTS','',
         'Aktuell ist kein Alarm aktiv.','',
         'Schnellster Weg:',
         '1. Coin öffnen',
         '2. 🔔 Alert antippen',
         '3. Bedingung auswählen','',
         'Preis direkt: /alert BTC 70000'].join('\n');
  } else if(section==='RADAR') {
    const now=Date.now();
    const lines=requestedSymbols.map(symbol=>{
      const r=radarCache.get(symbol);
      if(!r){
        const own=episodes.filter(e=>e.symbol===symbol);
        return `${symbolLabel(symbol)} · ⏳ sammelt Daten · ${own.length} Lernfälle`;
      }
      const age=Math.max(0,now-r.capturedAt);
      const witness=Math.round((Number(r.witnessAgreement)||0)*100);
      const status=String(r.status||'').toUpperCase();
      const icon=status==='VALID'?'🟢':status==='CAUTION'?'🟡':'⚪';
      return `${symbolLabel(symbol)} · ${icon} ${String(r.regime||'unklar').replaceAll('_',' ')} · Quellen ${witness}% · Lernfälle ${r.support||0} · ${Math.round(age/1000)}s alt`;
    });
    text=tcxShell('SIGNAL RADAR',{subtitle:'MARKET INTELLIGENCE · LIVE',lines:[...lines,'','● sauber   ◐ vorsichtig   ○ unklar','','Coin öffnen → Forecast → Why → Risiko']});
  } else if(section==='SYSTEM') {const port=shadowPortfolioSummary(shadowPortfolioLedger,{asOf:Date.now()}),league=strategyLeagueSummary(strategyLeagueLedger,{asOf:Date.now()}),coverage=coverageCurriculumSummary(shadowPortfolioLedger,{symbols:autoLearnSymbols}),gov=researchDataGovernanceSummary(researchDataGovernance,{now:Date.now()});text=['TCX // SYSTEM','━━━━━━━━━━━━━━━━━━━━','','CORE HEALTH','Engine       '+(auditLedger.healthy&&marketFabric.healthy?'🟢 ONLINE':'🟡 DEGRADED'),'Market Data  '+(marketFabric.healthy?'🟢 HEALTHY':'🔴 ERROR'),'Persistence  '+(persistenceHealthy&&episodePersistenceHealthy&&persistentStorageMounted?'🟢 HEALTHY':'🟡 CHECK'),'Evidence     '+(evidenceHistoryHealthy?'🟢 HEALTHY':'🟡 CHECK'),'','AUTOMATION','AutoLearn    '+(autoLearnEnabled?'🟢 ON':'⏸ OFF')+' · '+autoLearnSymbols.length+' Märkte · '+Math.round(autoLearnForecastMs/60000)+'m','Shadow Trade '+(autoShadowTradingEnabled?'🟢 ON':'⏸ OFF')+' · '+port.openPositions+' offen','Coverage     '+(coverageCurriculumEnabled?'🟢 ON':'⏸ OFF')+' · '+coverage.open+' offen · '+coverage.closed+' fertig','Strategy     '+(strategyLeagueEnabled?'🟢 ON':'⏸ OFF')+' · '+league.eligibleStrategies+' qualifiziert','','DATA','Research     '+(researchDataPlane.healthy?'🟢':'🔴')+' · '+researchDataPlane.totalRecords+' Snapshots','Governance   '+(researchGovernanceHealthy?'🟢':'🟡')+' · '+gov.featureCatalog.featureCount+' Features','Liquidation  '+(liquidationResearchStream.health().connected?'🟢 LIVE':'🟡 CONNECTING'),'On-Chain     🟢 BTC · ETH · SOL','','SAFETY','Execution    SHADOW_ONLY','Real Orders  ⛔ BLOCKED','canExecute   false'].join('\n');
  } else if(section==='PERFORMANCE') {
    const total=episodes.length;
    const mature15=episodes.filter(e=>e.outcomes?.['3']).length;
    const mature1h=episodes.filter(e=>e.outcomes?.['12']).length;
    const mature3h=episodes.filter(e=>e.outcomes?.['36']).length;
    text=[
      '🧠 WAS TCX GELERNT HAT','',
      `Gespeicherte Marktsituationen: ${total}`,
      `Davon nach 15 Min. ausgewertet: ${mature15}`,
      `Davon nach 1 Std. ausgewertet: ${mature1h}`,
      `Davon nach 3 Std. ausgewertet: ${mature3h}`,
      `Gespeicherte Beleg-Snapshots: ${evidenceRecords.length}`,'',
      'Warum das wichtig ist:',
      'TCX vergleicht neue Situationen mit früheren Fällen und kann dadurch erkennen,',
      'wann ein aktuelles Muster bekannt oder ungewöhnlich ist.','',
      'Eine Trefferquote wird erst angezeigt, wenn sie methodisch sauber gemessen werden kann.'
    ].join('\n');
  } else if(section==='SETTINGS') {
    text=[
      '⚙️ TCX EINSTELLUNGEN','',
      `Live-Aktualisierung: alle ${Math.round(refreshMs/1000)} Sekunden`,
      `Alert-Prüfung: alle ${Math.round(alertCheckMs/1000)} Sekunden`,
      `Beobachtete Märkte: ${markets.length}`,
      `Zugriffsschutz: ${allowedChats.size?'aktiv':'nicht eingeschränkt'}`,'',
      'Systemmodus: ABSTAIN / SHADOW_ONLY'
    ].join('\n');
  } else {
    text='Dieser Bereich ist noch nicht verfügbar.';
  }

  const sectionKb=section==='RADAR'
    ?{inline_keyboard:[[{text:'📊 Märkte öffnen',callback_data:'home:markets'},{text:'🔄 Radar',callback_data:'home:radar'}],[{text:'⭐ Watchlist',callback_data:'home:watchlist'},{text:'🏠 Command Center',callback_data:'home'}]]}
    :section==='SYSTEM'
      ?{inline_keyboard:[[{text:'📡 Data Status',callback_data:'home:data'},{text:'🔄 System',callback_data:'home:system'}],[{text:'🏠 Command Center',callback_data:'home'}]]}
      :homeBackKeyboard();
  const payload={chat_id:chatId,text:text.slice(0,4096),reply_markup:sectionKb};
  if(messageId) await tg('editMessageText',{...payload,message_id:messageId});
  else await tg('sendMessage',payload);
}

async function showWhy(chatId,messageId,symbol){const state=await researchState(symbol,'5m'),w=await witnessState(symbol,state.market).catch(()=>null),bias=String(state.dashboard.bias||'').toUpperCase(),flow=String(state.dashboard.flow||'').toUpperCase(),dir=bias.includes('BULL')||bias.includes('UP')?'↗ Aufwärts-Bias':bias.includes('BEAR')||bias.includes('DOWN')?'↘ Abwärts-Bias':'→ Neutral',pressure=flow.includes('BUY')||flow.includes('BID')?'Käufer stärker':flow.includes('SELL')||flow.includes('ASK')?'Verkäufer stärker':'Ausgeglichen',stored=episodes.filter(e=>e.symbol===symbol).length;const text=['TCX // WHY · '+symbol.replace('USDT','/USDT'),'━━━━━━━━━━━━━━━━━━━━','DECISION TRACE','','HAUPTFAKTOREN','1 · Richtung     '+dir,'2 · Regime       '+String(state.dashboard.regime||'unklar').replaceAll('_',' '),'3 · Flow         '+pressure,'4 · Marktdruck   '+Math.round(state.dashboard.pressureScore)+'/100','5 · Quellen      '+(w?Math.round((w.agreementScore||0)*100)+'% Agreement':'nicht verfügbar'),'','EVIDENZ','Historische Fälle: '+stored,'Widersprüche: '+(w?.contradictions?.length?'🟡 vorhanden':'🟢 keine starken'),'','','Market → Evidence → Regime → Forecast → Risk','Die Einschätzung wird mit neuen Marktdaten neu bewertet.','','SHADOW ONLY · REAL ORDERS BLOCKED'].join('\n');return deliverTelegramTextCard(tg,chatId,messageId,{text,reply_markup:marketProductKeyboard(symbol,{live:false,isFavorite:favoriteSet(chatId).has(symbol)})});}

async function showRegime(chatId,messageId,symbol) {
  const state=await researchState(symbol,'5m');
  const mtf=state.mtf;
  const humanTrend=value=>{
    const x=String(value||'').toUpperCase();
    if(x.includes('BULL')||x==='UP'||x.includes('UPTREND')) return '🟢 steigend';
    if(x.includes('BEAR')||x==='DOWN'||x.includes('DOWNTREND')) return '🔴 fallend';
    if(x.includes('RANGE')||x.includes('SIDE')) return '🟡 seitwärts';
    return '⚪ noch unklar';
  };
  const rows=['4h','1h','15m','5m'].map(tf=>{
    const a=mtf?.analyses?.[tf];
    return `• ${tf}: ${humanTrend(a?.trend)}`;
  });
  const text=[
    `🧭 MARKTSTRUKTUR · ${symbol.replace('USDT','/USDT')}`,'',
    'So sieht der Trend auf mehreren Zeitebenen aus:',
    ...rows,'',
    `Gesamtbild: ${humanTrend(state.dashboard.bias)}`,
    `Marktphase: ${String(state.dashboard.regime||'unklar').replaceAll('_',' ')}`,
    `Marktdruck: ${Math.round(state.dashboard.pressureScore)}/100`,'',
    'Warum mehrere Zeitebenen?',
    'Ein Coin kann kurzfristig steigen, obwohl der größere Trend noch fällt – oder umgekehrt.','',
    'Für technische Details nutze die Profi-Ansicht.',
    'Systemmodus: ABSTAIN / SHADOW_ONLY'
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
  const relation=x=>x==='ALIGNED'||x==='SUPPORTED'?'🟢 passt':x==='CONFLICT'?'🔴 widerspricht':x==='NOVEL'?'🟡 ungewöhnlich':'⚪ neutral';
  const lines=record.map.layers.map(x=>'• '+x.layer+': '+relation(x.relation));
  const index=Number(record.index);
  const indexText=index>=70?'stark':index>=45?'mittel':'schwach';
  const text=[
    '🔎 DATEN & BELEGE · '+symbol.replace('USDT','/USDT'),'',
    'KURZ GESAGT',
    `Beleglage: ${Number.isFinite(index)?index+'/100':'—'} · ${indexText}`,
    `Datenquellen stimmen zu: ${fmt(record.witnessAgreement*100,0)}%`,
    `Historische Vergleichsfälle: ${record.memorySupport}`,
    `Ungewöhnlichkeit: ${fmt(record.novelty*100,0)}%`,
    `Widersprüche: ${record.disagreementCount}`,'',
    'WAS PASST – UND WAS NICHT?',...lines,'',
    'IST DIE SICHT NOCH AKTUELL?',
    `Status: ${validity?.status||'BASELINE'}`+(validity?' · Veränderung '+fmt(validity.driftScore*100,0)+'%':''),
    '',
    'Der Wert 0–100 beschreibt nur, wie gut die vorhandenen Belege zusammenpassen.',
    'Er ist KEINE Wahrscheinlichkeit, dass der Kurs steigt oder fällt.','',
    'Systemmodus: ABSTAIN / SHADOW_ONLY'
  ].join('\n');
  const payload={chat_id:chatId,text:text.slice(0,4096),reply_markup:marketProductKeyboard(symbol,{live:false,isFavorite:favoriteSet(chatId).has(symbol)})};
  if(messageId) await tg('editMessageText',{...payload,message_id:messageId}); else await tg('sendMessage',payload);
}

async function showEvidenceHistory(chatId,messageId,symbol) {
  const rows=evidenceHistoryFor(evidenceRecords,symbol,{limit:12});
  const total=evidenceRecords.filter(r=>r.symbol===symbol).length;
  let text;
  if(!rows.length){
    text=['📜 BELEG-VERLAUF · '+symbol.replace('USDT','/USDT'),'','Noch keine gespeicherten Vergleichspunkte.','TCX baut den Verlauf automatisch auf, während es den Markt beobachtet.','','Der Belegwert ist keine Kurswahrscheinlichkeit.'].join('\n');
  }else{
    const latest=rows.at(-1), previous=rows.length>1?rows.at(-2):null, delta=previous?latest.index-previous.index:null;
    const entries=rows.slice().reverse().map(r=>{
      const ts=new Intl.DateTimeFormat('de-DE',{timeZone:'Europe/Berlin',hour:'2-digit',minute:'2-digit',day:'2-digit',month:'2-digit'}).format(new Date(r.capturedAt));
      return `• ${ts} · Beleglage ${r.index}/100 · ${String(r.regime||'').replaceAll('_',' ')}`;
    });
    text=['📜 BELEG-VERLAUF · '+symbol.replace('USDT','/USDT'),'',
      `Gespeicherte Vergleichspunkte: ${total}`,`Aktuell: ${latest.index}/100`,`Änderung zum letzten Punkt: ${delta==null?'—':(delta>=0?'+':'')+delta}`,'',
      'LETZTE PUNKTE',...entries,'',
      'Damit siehst du, ob die Datenlage stabiler oder widersprüchlicher geworden ist.','Der Belegwert ist keine Kurswahrscheinlichkeit.'
    ].join('\n');
  }
  const payload={chat_id:chatId,text:text.slice(0,4096),reply_markup:marketProductKeyboard(symbol,{live:false,isFavorite:favoriteSet(chatId).has(symbol)})};
  if(messageId) await tg('editMessageText',{...payload,message_id:messageId}); else await tg('sendMessage',payload);
}

async function showValidity(chatId,messageId,symbol) {
  const {baseline,record,validity}=await currentEvidenceState(symbol);
  let text;
  if(!baseline?.stateFingerprint){
    text=['⏱ IST DIE ANALYSE NOCH AKTUELL? · '+symbol.replace('USDT','/USDT'),'','Status: ⚪ Erstes Vergleichsbild','TCX braucht noch mindestens einen älteren Zustand, um Veränderungen sauber zu messen.','','Beim nächsten Analyse-Zyklus entsteht automatisch die Vergleichsbasis.'].join('\n');
  }else{
    const status=String(validity.status||'UNKNOWN').toUpperCase();
    const human=status==='VALID'?'🟢 aktuell':status==='STALE'?'🟡 aktualisieren empfohlen':status==='DRIFTED'||status==='EXPIRED'||status==='INVALIDATED'?'🔴 alte Sicht nicht weiterverwenden':'⚪ '+status;
    text=['⏱ IST DIE ANALYSE NOCH AKTUELL? · '+symbol.replace('USDT','/USDT'),'',
      `Status: ${human}`,`Alter: ${Math.round(validity.ageMs/1000)} Sekunden`,`Marktveränderung: ${fmt(validity.driftScore*100,1)}%`,`Preisänderung seit Vergleichspunkt: ${fmt(validity.priceMovePct,3)}%`,`Veränderte Merkmale: ${validity.changedDimensions}`,'',
      validity.validForResearch?'Die gespeicherte Sicht ist für die Analyse noch verwendbar.':'Die alte Sicht sollte verworfen und neu berechnet werden.','',
      'TCX vergleicht dafür den aktuellen Markt mit dem Zustand, auf dem die vorherige Analyse basierte.','','Systemmodus: ABSTAIN / SHADOW_ONLY'
    ].join('\n');
  }
  const payload={chat_id:chatId,text:text.slice(0,4096),reply_markup:marketProductKeyboard(symbol,{live:false,isFavorite:favoriteSet(chatId).has(symbol)})};
  if(messageId) await tg('editMessageText',{...payload,message_id:messageId}); else await tg('sendMessage',payload);
}

async function showFavorites(chatId, messageId) {
  const syms=[...favoriteSet(chatId)];
  let text;
  if(!syms.length){
    text='⭐ DEINE WATCHLIST\n\nNoch kein Coin gespeichert.\n\nÖffne einen Coin und tippe auf ☆ Beobachten.';
  } else {
    const marketRows=await Promise.all(syms.slice(0,20).map(async symbol=>{
      try{return [symbol,await snapshot(symbol)];}catch{return [symbol,null];}
    }));
    const live=new Map(marketRows);
    const lines=syms.slice(0,20).map(symbol=>{
      const s=live.get(symbol);
      const r=radarCache.get(symbol);
      const price=Number.isFinite(s?.price)?fmt(s.price,s.price<1?6:2):'—';
      const change=Number.isFinite(s?.changePct)?((s.changePct>=0?'+':'')+fmt(s.changePct,2)+'%'):'—';
      const raw=String(r?.regime||'').toUpperCase();
      const phase=raw.includes('TREND')?'Trend':raw.includes('RANGE')?'Seitwärts':raw?'Unklar':'sammelt Daten';
      const status=String(r?.status||'').toUpperCase();
      const state=status==='VALID'?'🟢':status==='CAUTION'?'🟡':'⚪';
      return `• ${symbolLabel(symbol)} · ${price} · ${change} · ${state} ${phase}`;
    });
    text=['⭐ DEINE WATCHLIST','','Preis · 24h · aktuelle Marktphase','',...lines,syms.length>20?'… weitere Coins ausgeblendet':'','','Tippe unten auf einen Coin für die vollständige Analyse.'].filter(Boolean).join('\n');
  }
  const payload={chat_id:chatId,text:text.slice(0,4096),reply_markup:favoritesKeyboard(chatId)};
  if(messageId) await tg('editMessageText',{...payload,message_id:messageId});
  else await tg('sendMessage',payload);
}

async function showCompare(chatId,messageId) {
  const syms=[...favoriteSet(chatId)].slice(0,4);
  if(syms.length<2){
    const payload={chat_id:chatId,text:'⚖️ COINS VERGLEICHEN\n\nSpeichere mindestens zwei Coins in deiner Watchlist.',reply_markup:favoritesKeyboard(chatId)};
    if(messageId) await tg('editMessageText',{...payload,message_id:messageId}); else await tg('sendMessage',payload);
    return;
  }
  const results=[];
  for(const symbol of syms){
    let r=radarCache.get(symbol);
    const stale=!r||Date.now()-Number(r.capturedAt||0)>10*60*1000;
    if(stale){try{await researchAlertContext(symbol,{force:true});r=radarCache.get(symbol);}catch{}}
    let market=null;try{market=await snapshot(symbol);}catch{}
    results.push({symbol,r,market,e:latestEvidenceRecord(symbol)});
  }
  const humanBias=v=>{
    const x=String(v||'').toUpperCase();
    if(x.includes('BULL')||x.includes('UP')) return '🟢 eher hoch';
    if(x.includes('BEAR')||x.includes('DOWN')) return '🔴 eher runter';
    return '🟡 unklar';
  };
  const lines=results.flatMap(({symbol,r,market,e})=>{
    const p=Number.isFinite(market?.price)?fmt(market.price,market.price<1?6:2):'—';
    return [`${symbolLabel(symbol)} · ${p}`,`  Richtung: ${humanBias(r?.bias)} · Quellen: ${r?fmt(r.witnessAgreement*100,0)+'%':'—'}`,`  Vergleichsfälle: ${r?.support??'—'} · Beleglage: ${e?.index??'—'}/100`];
  });
  const rows=[];
  for(let i=0;i<syms.length;i+=2) rows.push(syms.slice(i,i+2).map(symbol=>({text:symbolIcon(symbol)+' '+symbolLabel(symbol),callback_data:'market:'+symbol})));
  rows.push([{text:'⭐ Watchlist',callback_data:'favorites'},{text:'🏠 Start',callback_data:'home'}]);
  const text=['⚖️ COINS VERGLEICHEN','',...lines,'','Die Werte helfen beim Vergleichen der aktuellen Datenlage.','TCX erklärt hier keinen Coin zum „Gewinner“ und gibt kein Buy-/Sell-Signal.'].join('\n');
  const payload={chat_id:chatId,text:text.slice(0,4096),reply_markup:{inline_keyboard:rows}};
  if(messageId) await tg('editMessageText',{...payload,message_id:messageId}); else await tg('sendMessage',payload);
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

function chartCaption(symbol, interval, state, live=false,forecastOverlay=null) {
  const base=buildChartIntelligence({
    symbol,
    interval,
    analysis:state.analysis,
    dashboard:state.dashboard,
    mtf:state.mtf,
    candles:state.byTf[interval],
    live,
    refreshSeconds:Math.round(refreshMs/1000),
    now:state.availableAt
  }).caption;
  const summary=forecastOverlaySummary(forecastOverlay);
  const extra=summary.available?'\n\n'+summary.text:'\n\nForecast Overlay: kein frischer Pfad';
  return (base+extra).slice(0,1024);
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
  if(!s||s.n<3) return `${label}: erst ${s?.n||0} brauchbare Vergleichsfälle – noch zu wenig für eine Zusammenfassung`;
  const r=s.returnPct,up=s.maxRisePct,down=s.maxFallPct;
  return [`${label}: ${s.n} ähnliche Fälle · Ähnlichkeit ${fmt(s.medianSimilarity,0)}%`,`  Danach: Ende ${fmt(r.median,2)}% · max. hoch ${fmt(up.median,2)}% · max. runter ${fmt(down.median,2)}%`].join('\n');
}

function tradeReplayKeyboard(symbol){return {inline_keyboard:[[{text:'▥ CHART LAB',callback_data:`chart:${symbol}:5m`},{text:'⌁ FORECAST',callback_data:`forecast:${symbol}`}],[{text:'▤ PORTFOLIO',callback_data:'home:portfolio'},{text:'⌂ COMMAND',callback_data:'home'}]]};}
async function showTradeReplay(chatId,messageId,symbol){
  const rows=(shadowPortfolioLedger?.positions||[]).filter(p=>p?.symbol===symbol&&p?.status==='CLOSED'&&p?.execution==='SHADOW_ONLY'&&p?.canExecuteLive===false).sort((a,b)=>Number(b.closedAt||0)-Number(a.closedAt||0));
  const p=rows[0];
  if(!p)return deliverTelegramTextCard(tg,chatId,messageId,{text:['TCX // TRADE REPLAY · '+symbol.replace('USDT','/USDT'),'━━━━━━━━━━━━━━━━━━━━','','Noch kein abgeschlossener Shadow-Trade für diesen Markt vorhanden.','','ABSTAIN / SHADOW_ONLY'].join('\n'),reply_markup:tradeReplayKeyboard(symbol)});
  const roe=Number(p.realizedMarginRoePct),mfe=Number(p.mfeMarginRoePct),mae=Number(p.maeMarginRoePct),regret=Number(p.exitRegretMarginRoePct),capture=Number(p.captureEfficiency);
  const openedAt=Number(p.openedAt),closedAt=Number(p.closedAt);
  try{
    const replayEnd=Math.max(closedAt+30*60_000,openedAt+60*60_000);
    const fetched=await fetchKlines(symbol,'5m',100,{endTime:replayEnd});
    const replayCandles=candlesFromKlines(fetched.rows,replayEnd);
    const entryCandles=replayCandles.filter(x=>x.closed===true&&Number(x.closeTime)<=openedAt);
    const entryAnalysis=analyzeStructure(entryCandles);
    const png=renderCandlestickPng(replayCandles,entryAnalysis,{width:1100,height:760,dashboard:null,tradeReplay:{entryAt:openedAt,entryPrice:Number(p.entryPrice),exitAt:closedAt,exitPrice:Number(p.exitPrice)}});
    const caption=['TCX // TRADE REPLAY · '+symbol.replace('USDT','/USDT'),String(p.side||'—')+' · '+String(p.setupType||'UNKNOWN')+' · '+String(p.horizonId||'—'),'Entry '+priceText(p.entryPrice)+' → Exit '+priceText(p.exitPrice),'Margin ROE '+(Number.isFinite(roe)?fmt(roe*100,2)+'%':'—')+' · MFE '+(Number.isFinite(mfe)?fmt(mfe*100,2)+'%':'—')+' · MAE '+(Number.isFinite(mae)?fmt(mae*100,2)+'%':'—'),'Entry-Struktur: '+String(entryAnalysis.trend||'UNKNOWN')+' · nur bis Entry geschlossene 5m-Kerzen','Exit: '+String(p.closeReason||'UNKNOWN'),'MFE/MAE: gespeicherte Shadow-Marks; keine erfundenen Extrem-Zeitpunkte.','SHADOW_ONLY · REAL ORDERS BLOCKED'].join('\n');
    return tgMultipart('sendPhoto',{chat_id:String(chatId),caption:caption.slice(0,1024),reply_markup:JSON.stringify(tradeReplayKeyboard(symbol))},'photo',symbol+'-trade-replay.png',png,'image/png');
  }catch(err){
    console.error('trade replay chart error',symbol,err instanceof Error?err.message:String(err));
    const lines=['TCX // TRADE REPLAY · '+symbol.replace('USDT','/USDT'),'━━━━━━━━━━━━━━━━━━━━','',String(p.side||'—')+' · '+String(p.setupType||'UNKNOWN')+' · '+String(p.horizonId||'—'),'','LIFECYCLE','Entry        '+priceText(p.entryPrice),'Exit         '+priceText(p.exitPrice),'Exit reason  '+String(p.closeReason||'UNKNOWN'),'Opened       '+new Date(openedAt).toLocaleString('de-DE',{timeZone:'Europe/Berlin'}),'Closed       '+new Date(closedAt).toLocaleString('de-DE',{timeZone:'Europe/Berlin'}),'','OUTCOME','Margin ROE   '+(Number.isFinite(roe)?fmt(roe*100,2)+'%':'—'),'MFE          '+(Number.isFinite(mfe)?fmt(mfe*100,2)+'%':'—'),'MAE          '+(Number.isFinite(mae)?fmt(mae*100,2)+'%':'—'),'Exit regret  '+(Number.isFinite(regret)?fmt(regret*100,2)+'%':'—'),'Capture      '+(Number.isFinite(capture)?fmt(capture*100,1)+'%':'—'),'','Chart derzeit nicht verfügbar; Ledger-Replay bleibt erhalten.','SHADOW_ONLY · REAL ORDERS BLOCKED'];
    return deliverTelegramTextCard(tg,chatId,messageId,{text:lines.join('\n').slice(0,4096),reply_markup:tradeReplayKeyboard(symbol)});
  }
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
    `🧠 WAS TCX AUS ÄHNLICHEN FÄLLEN GELERNT HAT · ${symbol.replace("USDT","/USDT")}`,'',
    `Gespeicherte Situationen: ${stored}`,`Aktuelle Marktphase: ${String(state.memoryDashboard.regime||'unklar').replaceAll('_',' ')}`,'',
    'ÄHNLICHE FRÜHERE SITUATIONEN',statLine('Nach 15 Min.',s3),statLine('Nach 1 Std.',s12),statLine('Nach 3 Std.',s36),'',
    'TCX sucht frühere Situationen mit ähnlicher Marktstruktur, Liquidität und Kauf-/Verkaufsdruck.',
    'Die historischen Ergebnisse zeigen, was danach passiert ist – nicht was diesmal passieren muss.','',
    'Keine Trefferquote und kein Trade-Signal.','Systemmodus: ABSTAIN / SHADOW_ONLY'
  ].join('\n');
  return tg("sendMessage",{chat_id:chatId,text:text.slice(0,4096),reply_markup:memoryKeyboard(symbol)});
}

async function showLiquidationMap(chatId,messageId,symbol,{window='5m',live=true}={}){
  const market=await snapshot(symbol);
  let liquidation=null;
  try{
    liquidation=liquidationResearchStream.snapshot(symbol,{
      asOf:Date.now(),
      referencePrice:Number(market.price),
      clusterBinBps:25,
      maxClusters:12
    });
  }catch{}
  const view=buildObservedLiquidationHeatmap({
    symbol,
    liquidation,
    referencePrice:Number(market.price),
    window,
    live,
    refreshSeconds:Math.round(refreshMs/1000)
  });
  const sent=await deliverTelegramTextCard(tg,chatId,messageId,{
    text:view.text,
    reply_markup:liquidationMapKeyboard(symbol,window,live)
  });
  const effectiveMessageId=sent?.message_id||messageId;
  sessions.set(String(chatId),{
    chatId,
    messageId:effectiveMessageId,
    symbol,
    live:Boolean(live),
    view:'LIQ_MAP',
    interval:String(window).toLowerCase()==='15m'?'15m':'5m',
    lastRefresh:Date.now(),
    liquidationConfluenceVersion:LIQUIDATION_CONFLUENCE_VIEW_VERSION
  });
  return sent;
}

async function showConfluenceMap(chatId,messageId,symbol){
  const [state,book,derivatives,external]=await Promise.all([
    researchState(symbol,'5m'),
    fetchExecutionBook(symbol),
    derivativesResearchProvider.fetchSnapshot(symbol,{cacheMs:15000}).catch(()=>null),
    externalResearchProvider.fetchBundle(symbol).catch(()=>null)
  ]);
  let liquidation=null;
  try{
    liquidation=liquidationResearchStream.snapshot(symbol,{
      asOf:Date.now(),
      referencePrice:Number(state.market.price),
      clusterBinBps:25,
      maxClusters:12
    });
  }catch{}
  const rawFeatures=[
    ...derivativesSnapshotToExtraFeatures(derivatives),
    ...liquidationSnapshotToExtraFeatures(liquidation),
    ...coinMetricsSnapshotToExtraFeatures(external?.coinMetrics),
    ...deribitOptionsSnapshotToExtraFeatures(external?.deribitOptions),
    ...macroSnapshotToExtraFeatures(external?.macro),
    ...predictionMarketSnapshotToExtraFeatures(external?.predictionMarket)
  ];
  const intelligenceFeatures=buildDerivedResearchIntelligenceFeatures(rawFeatures);
  const view=buildConfluenceMap({
    symbol,
    currentPrice:Number(state.market.price),
    analysis:state.analysis,
    book,
    liquidation,
    intelligenceFeatures,
    mergeBps:20
  });
  sessions.set(String(chatId),{
    chatId,
    messageId,
    symbol,
    live:false,
    view:'CONFLUENCE',
    lastRefresh:Date.now(),
    liquidationConfluenceVersion:LIQUIDATION_CONFLUENCE_VIEW_VERSION
  });
  return deliverTelegramTextCard(tg,chatId,messageId,{
    text:view.text,
    reply_markup:confluenceKeyboard(symbol)
  });
}

async function showXray(chatId,messageId,symbol,{live=true}={}){
  const [book,market]=await Promise.all([
    fetchExecutionBook(symbol),
    snapshot(symbol)
  ]);
  let liquidation=null;
  try{liquidation=liquidationResearchStream.snapshot(symbol,{asOf:Date.now()});}catch{}
  const totalBook=(book.bids||[]).slice(0,50).reduce((s,[p,q])=>s+Number(p)*Number(q),0)+(book.asks||[]).slice(0,50).reduce((s,[p,q])=>s+Number(p)*Number(q),0);
  const bidBook=(book.bids||[]).slice(0,50).reduce((s,[p,q])=>s+Number(p)*Number(q),0);
  const visibleImbalance=totalBook>0?(2*bidBook/totalBook-1):0;
  const dashboard={
    flow:visibleImbalance>.08?'BUY':visibleImbalance<-.08?'SELL':'BALANCED',
    pressureScore:Math.min(100,Math.round(Math.abs(visibleImbalance)*100))
  };
  const view=buildMarketXray({
    symbol,book,liquidation,market,dashboard,live,
    refreshSeconds:Math.round(refreshMs/1000),
    now:Date.now()
  });
  const sent=await deliverTelegramTextCard(tg,chatId,messageId,{
    text:view.text,
    reply_markup:xrayKeyboard(symbol,live)
  });
  const effectiveMessageId=sent?.message_id||messageId;
  sessions.set(String(chatId),{
    chatId,
    messageId:effectiveMessageId,
    symbol,
    live:Boolean(live),
    view:'XRAY',
    lastRefresh:Date.now(),
    xrayVersion:MARKET_XRAY_VIEW_VERSION
  });
  return sent;
}

async function showFlowRadar(chatId,messageId,symbol){
  const [onchain,walletCohort]=await Promise.all([
    onchainResearchProvider.fetchAssetSnapshot(symbol,{cacheMs:20000}).catch(()=>null),
    walletCohortResearchProvider.configuredCohorts>0
      ?walletCohortResearchProvider.fetchSnapshot(symbol,{asOf:Date.now()}).catch(()=>null)
      :Promise.resolve(null)
  ]);

  let entityFlow=null;
  if(symbol==='ETHUSDT'&&entityFlowAddressIndex.addressCount>0){
    try{
      const raw=await entityFlowResearchProvider.fetchSnapshot();
      entityFlow=scoreEntityFlowSnapshot(raw,entityFlowMemory,{minBaselineSamples:20});
    }catch(err){
      recordError(observability,{scope:'flow_radar.entity_flow',message:err instanceof Error?err.message:String(err)});
    }
  }

  const view=buildFlowRadar({
    symbol,
    entityFlow,
    walletCohort,
    onchain,
    registryAddressCount:entityFlowAddressIndex.addressCount,
    registryEntityCount:entityFlowAddressIndex.entityCount,
    generatedAt:Date.now()
  });

  recordOperation(observability,{
    name:'flow_radar_view',
    ok:Boolean(entityFlow?.ok||walletCohort?.ok||onchain?.ok),
    latencyMs:0,
    error:null
  });

  return deliverTelegramTextCard(tg,chatId,messageId,{
    text:view.text,
    reply_markup:flowRadarKeyboard(symbol)
  });
}

async function showForecastAccuracy(chatId,messageId,symbol=null){
  const journal=forecastRuntime?.journal?.all?.()??[];
  const view=buildForecastAccuracyView(journal,{
    symbol:symbol||null,
    minDisplaySamples:30,
    foldSize:50,
    highConfidenceThreshold:.65
  });

  recordOperation(observability,{
    name:'forecast_accuracy_view',
    ok:true,
    latencyMs:0,
    error:null
  });

  return deliverTelegramTextCard(tg,chatId,messageId,{
    text:view.text,
    reply_markup:forecastAccuracyKeyboard(symbol)
  });
}

async function showStructureEvents(chatId,messageId,symbol){
  const state=await researchState(symbol,'1m');
  const analyses={
    '1m':state.analysis,
    '5m':state.mtf?.analyses?.['5m'],
    '15m':state.mtf?.analyses?.['15m'],
    '1h':state.mtf?.analyses?.['1h'],
    '4h':state.mtf?.analyses?.['4h']
  };
  const view=buildStructureEventRadar({
    symbol,
    analyses,
    candlesByTf:state.byTf,
    now:state.availableAt
  });
  sessions.set(String(chatId),{
    chatId,messageId,symbol,live:false,view:'STRUCTURE_EVENTS',
    lastRefresh:Date.now(),structureEventRadarVersion:STRUCTURE_EVENT_RADAR_VERSION
  });
  return deliverTelegramTextCard(tg,chatId,messageId,{
    text:view.text,
    reply_markup:structureEventKeyboard(symbol)
  });
}

async function showMtfMatrix(chatId,messageId,symbol){
  const state=await researchState(symbol,'1m');
  const analyses={
    '1m':state.analysis,
    '5m':state.mtf?.analyses?.['5m'],
    '15m':state.mtf?.analyses?.['15m'],
    '1h':state.mtf?.analyses?.['1h'],
    '4h':state.mtf?.analyses?.['4h']
  };
  const view=buildMtfMatrix({
    symbol,
    analyses,
    dashboard:state.memoryDashboard,
    availableAt:state.availableAt
  });
  sessions.set(String(chatId),{
    chatId,
    messageId,
    symbol,
    live:false,
    view:'MTF_MATRIX',
    lastRefresh:Date.now()
  });
  return deliverTelegramTextCard(tg,chatId,messageId,{
    text:view.text,
    reply_markup:mtfMatrixKeyboard(symbol)
  });
}

async function showSuperchart(chatId,symbol,{mode='PRO',interval='5m',messageId=null,edit=false,live=true}={}){
  const state=await researchState(symbol,interval);
  await captureEpisodeFromState(state,{persist:true});
  const [book,derivatives,external,onchain,walletCohort]=await Promise.all([
    fetchExecutionBook(symbol),
    derivativesResearchProvider.fetchSnapshot(symbol,{cacheMs:15000}).catch(()=>null),
    externalResearchProvider.fetchBundle(symbol).catch(()=>null),
    onchainResearchProvider.fetchAssetSnapshot(symbol,{cacheMs:20000}).catch(()=>null),
    walletCohortResearchProvider.configuredCohorts>0?walletCohortResearchProvider.fetchSnapshot(symbol,{asOf:state.availableAt}).catch(()=>null):Promise.resolve(null)
  ]);
  let liquidation=null,entityFlow=null;
  try{liquidation=liquidationResearchStream.snapshot(symbol,{asOf:state.availableAt,referencePrice:Number(state.market.price),clusterBinBps:25,maxClusters:12});}catch{}
  if(symbol==='ETHUSDT'&&entityFlowAddressIndex.addressCount>0){
    try{entityFlow=scoreEntityFlowSnapshot(await entityFlowResearchProvider.fetchSnapshot(),entityFlowMemory,{minBaselineSamples:20});}catch{}
  }
  const rawFeatures=[
    ...derivativesSnapshotToExtraFeatures(derivatives),
    ...liquidationSnapshotToExtraFeatures(liquidation),
    ...coinMetricsSnapshotToExtraFeatures(external?.coinMetrics),
    ...deribitOptionsSnapshotToExtraFeatures(external?.deribitOptions),
    ...macroSnapshotToExtraFeatures(external?.macro),
    ...predictionMarketSnapshotToExtraFeatures(external?.predictionMarket)
  ];
  const confluence=buildConfluenceMap({
    symbol,currentPrice:Number(state.market.price),analysis:state.analysis,book,liquidation,
    intelligenceFeatures:buildDerivedResearchIntelligenceFeatures(rawFeatures),mergeBps:20
  });
  const latestForecast=latestInstitutionalForecast(forecastRuntime,symbol);
  const forecastOverlay=forecastIssuanceToChartOverlay(latestForecast,{now:state.availableAt,maxAgeMs:6*60*60_000});
  const eventRadar=buildStructureEventRadar({
    symbol,
    analyses:{'1m':state.mtf?.analyses?.['1m'],'5m':state.mtf?.analyses?.['5m'],'15m':state.mtf?.analyses?.['15m'],'1h':state.mtf?.analyses?.['1h'],'4h':state.mtf?.analyses?.['4h']},
    candlesByTf:state.byTf,now:state.availableAt
  });
  const accuracy=buildForecastAccuracyView(forecastRuntime?.journal?.all?.()??[],{symbol,minDisplaySamples:30,foldSize:50,highConfidenceThreshold:.65});
  const intel=buildSuperchartIntel({mode,symbol,confluence,liquidation,entityFlow,walletCohort,onchain,accuracy,events:eventRadar,forecastOverlay});
  const png=renderCandlestickPng(state.byTf[interval],state.analysis,{width:1200,height:820,dashboard:state.dashboard,forecastOverlay,superchart:intel});
  const caption=[
    '🧠 TCX SUPERCHART · '+symbol.replace('USDT','/USDT')+' · '+String(interval).toUpperCase()+' · '+intel.mode,
    'Struktur + Forecast + Confluence + Liquidationen'+(intel.mode==='FULL'?' + Flow + Accuracy + Chain':''),
    forecastOverlay?'Forecast = probabilistische Modellpfade, keine garantierte Kursbahn.':'Kein frischer Forecast-Pfad verfügbar.',
    'SHADOW_ONLY · canExecute:false'
  ].join('\n').slice(0,1024);
  const keyboard=superchartKeyboard(symbol,intel.mode,interval,live);
  let sent;
  if(edit&&messageId){
    sent=await tgMultipart('editMessageMedia',{chat_id:String(chatId),message_id:String(messageId),media:{type:'photo',media:'attach://photo',caption},reply_markup:keyboard},'photo',`${symbol}-superchart-${interval}.png`,png,'image/png');
  }else{
    sent=await tgMultipart('sendPhoto',{chat_id:String(chatId),caption,reply_markup:keyboard},'photo',`${symbol}-superchart-${interval}.png`,png,'image/png');
    messageId=sent?.message_id||messageId;
  }
  sessions.set(String(chatId),{chatId,messageId,symbol,live:Boolean(live),view:'SUPERCHART',interval,mode:intel.mode,lastRefresh:Date.now(),superchartVersion:SUPERCHART_VERSION});
  return sent;
}

async function showChart(chatId, symbol, interval="5m",{messageId=null,edit=false,live=true}={}) {
  const state=await researchState(symbol,interval);
  await captureEpisodeFromState(state,{persist:true});
  const latestForecast=latestInstitutionalForecast(forecastRuntime,symbol);
  const forecastOverlay=forecastIssuanceToChartOverlay(latestForecast,{now:state.availableAt,maxAgeMs:6*60*60_000});
  const png=renderCandlestickPng(state.byTf[interval],state.analysis,{
    width:1100,height:760,dashboard:state.dashboard,forecastOverlay
  });
  const caption=chartCaption(symbol,interval,state,live,forecastOverlay);
  const keyboard=chartKeyboard(symbol,interval,live);
  let sent=null;
  if(edit&&messageId){
    sent=await tgMultipart("editMessageMedia",{
      chat_id:String(chatId),
      message_id:String(messageId),
      media:{type:"photo",media:"attach://photo",caption},
      reply_markup:keyboard
    },"photo",`${symbol}-${interval}.png`,png,"image/png");
  }else{
    sent=await tgMultipart("sendPhoto",{
      chat_id:String(chatId),
      caption,
      reply_markup:keyboard
    },"photo",`${symbol}-${interval}.png`,png,"image/png");
    messageId=sent?.message_id||messageId;
  }
  sessions.set(String(chatId),{
    chatId,
    messageId,
    symbol,
    live:Boolean(live),
    view:'CHART',
    interval,
    lastRefresh:Date.now(),
    chartIntelligenceVersion:CHART_INTELLIGENCE_VERSION,
    forecastChartOverlayVersion:FORECAST_CHART_OVERLAY_VERSION,
    forecastOverlayAvailable:Boolean(forecastOverlay)
  });
  return sent;
}

function structureText(symbol, result, availableAt) {
  const human=v=>{
    const x=String(v||'').toUpperCase();
    if(x.includes('BULL')||x.includes('UP')) return '🟢 steigend';
    if(x.includes('BEAR')||x.includes('DOWN')) return '🔴 fallend';
    if(x.includes('RANGE')||x.includes('SIDE')) return '🟡 seitwärts';
    return '⚪ unklar';
  };
  const lines=[`🧭 MARKTSTRUKTUR · ${symbol.replace("USDT","/USDT")}`,'','Trend auf mehreren Zeitebenen:'];
  for(const tf of ['4h','1h','15m','5m']) lines.push(`• ${tf}: ${human(result.analyses[tf]?.trend)}`);
  const five=result.analyses['5m'];
  lines.push('',`Gesamtbild: ${human(result.bias)}`,`Unterstützung (5m): ${priceText(five?.support)}`,`Widerstand (5m): ${priceText(five?.resistance)}`,'','Warum das wichtig ist:','Kurzfristiger und langfristiger Trend können unterschiedlich sein. Mehrere Zeitebenen verhindern, dass eine einzelne Bewegung zu stark gewichtet wird.','','Systemmodus: ABSTAIN / SHADOW_ONLY');
  return lines.join('\n');
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
  const agreement=Math.round((Number(report.agreementScore)||0)*100);
  const text=[
    `🌐 DATENQUELLEN-CHECK · ${symbol.replace("USDT","/USDT")}`,'',
    'TCX vergleicht denselben Markt auf mehreren Börsen.',
    `Geprüfte Börsen: ${report.venueCount}`,`Übereinstimmung: ${agreement}%`,`Unabhängige Vergleichsquellen: ${report.externalWitnessCount}`,'',
    report.independentWitnessSatisfied?'🟢 Die Datenquellen bestätigen sich ausreichend.':'🟡 Die Quellenlage reicht noch nicht für eine starke Bestätigung.',
    report.contradictions?.length?'⚠️ Abweichungen: '+report.contradictions.join(', '):'Keine starke Abweichung zwischen den geprüften Quellen erkannt.','',
    'Ein einzelner Börsenfeed kann fehlerhaft oder ungewöhnlich sein. Mehrere unabhängige Quellen reduzieren dieses Risiko.','',
    'Profi-Hinweis: USD- und USDT-Märkte sind nicht vollständig identisch.','Systemmodus: ABSTAIN / SHADOW_ONLY'
  ].join('\n');
  return tg("sendMessage",{chat_id:chatId,text:text.slice(0,4096),reply_markup:memoryKeyboard(symbol)});
}

async function showAudit(chatId) {
  const verification=auditLedger.verification||{ok:false,error:'LEDGER_VERIFICATION_UNAVAILABLE'};
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

async function showShadowCapitalAcademy(chatId,messageId=null){
  const a=evaluateShadowCapitalAcademy(shadowPortfolioLedger,{asOf:Date.now(),timeZone:shadowStatsTimeZone});
  const active=a.stages.find(x=>x.id===a.activeStage)||a.stages[0];
  const pct=v=>(Number.isFinite(Number(v))?fmt(Number(v)*100,1)+'%':'—');
  const money=v=>(Number.isFinite(Number(v))?(Number(v)>=0?'+':'')+fmt(Number(v),2)+' USDT':'—');
  const lines=[
    '🏆 TCX CAPITAL ACADEMY','',
    'AKTUELLER STATUS',
    'Erreichte Stufe: '+(a.achievedStage==='UNRANKED'?'noch keine':a.achievedStage.replaceAll('_',' ')),
    'Aktuelle Challenge: '+a.activeStageLabel,
    'Fortschritt: '+pct(a.stageProgress),
    'Abgeschlossene Trades: '+a.metrics.closedTrades,
    'Gesamt-PnL: '+money(a.metrics.netPnlQuote),
    'Profit Factor: '+(a.metrics.profitFactor==null?'—':fmt(a.metrics.profitFactor,2)),
    'Max. Drawdown: '+pct(a.metrics.maxDrawdownPct),'',
    'CHALLENGE-KRITERIEN'
  ];
  for(const x of active.criteria){
    const value=x.id.includes('drawdown')||x.id.includes('positive_')||x.id.includes('single_trade')
      ?pct(x.value)
      :x.id.includes('profit_factor')||x.id==='meme_pf'
        ?fmt(x.value,2)
        :x.id.includes('expectancy')||x.id.includes('net_pnl')
          ?money(x.value)
          :fmt(x.value,0);
    lines.push((x.pass?'✅ ':'⬜ ')+x.label+' · aktuell '+value);
  }
  lines.push(
    '',
    'RISIKO-LIZENZ DIESER STUFE',
    'Max. offene Trades: '+a.riskPolicy.maxOpenTotal,
    'Max. je Coin: '+a.riskPolicy.maxOpenPerSymbol,
    'Max. Memecoins offen: '+a.riskPolicy.maxOpenMemecoin,
    'Max. Gesamt-Exposure: '+pct(a.riskPolicy.maxExposurePct),
    'Tagesverlust-Limit: '+pct(a.riskPolicy.dailyLossLimitPct),
    'Positions-Skalierung: '+fmt(a.riskPolicy.notionalMultiplier,2)+'×',
    'Memecoin-Skalierung: '+fmt(a.riskPolicy.memeMultiplier,2)+'×','',
    'LIVE-GUARD',
    'Core Entries: '+(a.guard.coreAllowed?'🟢 freigegeben':'⛔ pausiert'),
    'Meme Entries: '+(a.guard.memeAllowed?'🟢 freigegeben':'⛔ pausiert'),
    'Heutiger PnL: '+money(a.guard.dailyRealizedPnlQuote),
    'Verlustserie: '+a.guard.lossStreak,
    ...(a.guard.blockers.length?['Blocker: '+a.guard.blockers.join(', ')]:[]),
    ...(a.guard.memeBlockers.length&&!a.guard.memeAllowed?['Meme-Blocker: '+a.guard.memeBlockers.join(', ')]:[]),
    '',
    'Die Academy erhöht simulierte Risikobudgets nur nach bestandenen Challenges.',
    'CAPITAL_READY_SIM ist kein Nachweis für echte zukünftige Gewinne.',
    'Mode: SHADOW_ONLY · echte Orders bleiben gesperrt.'
  );
  const payload={chat_id:chatId,text:lines.join('\n').slice(0,4096),reply_markup:{inline_keyboard:[
    [{text:'🔄 Prüfen',callback_data:'home:academy'},{text:'📈 Statistik',callback_data:'home:stats_day'}],
    [{text:'🏆 Academy',callback_data:'home:academy'},{text:'💼 Portfolio',callback_data:'home:portfolio'}],
    [{text:'🏠 Start',callback_data:'home'}]
  ]}};
  if(messageId) return tg('editMessageText',{...payload,message_id:messageId});
  return tg('sendMessage',payload);
}

async function showStrategyLeague(chatId,messageId=null){const x=strategyLeagueSummary(strategyLeagueLedger,{asOf:Date.now()}),money=v=>(Number.isFinite(Number(v))?(Number(v)>=0?'+':'')+fmt(Number(v),2)+' USDT':'—'),pct=v=>(Number.isFinite(Number(v))?fmt(Number(v)*100,1)+'%':'—'),lines=['🏁 STRATEGY LEAGUE','','MODE         '+x.allocationMode.replaceAll('_',' '),'STRATEGIEN   '+x.strategyCount,'QUALIFIZIERT '+x.eligibleStrategies,'VIRT. KAPITAL '+fmt(x.totalInitialVirtualCapital,0)+' USDT','','RANGLISTE'];x.strategies.slice(0,6).forEach((r,i)=>lines.push((i+1)+'. '+r.label,'   '+r.status+' · Equity '+fmt(r.account.equityQuote,2)+' · '+money(r.account.netPnlQuote),'   Trades '+r.account.closedTrades+' · PF '+(r.account.profitFactor==null?'—':fmt(r.account.profitFactor,2))+' · DD '+pct(r.account.maxDrawdownPct),'   Evidenz '+r.evidence.grade+' · '+fmt(r.evidence.score*100,0)+'/100'));lines.push('','Qualifikation verlangt belastbare, zeitlich stabile Shadow-Evidenz.','Kurze Glücksläufe erhalten kein höheres Kapital.','SHADOW_ONLY · echte Orders gesperrt.');const payload={chat_id:chatId,text:lines.join('\n').slice(0,4096),reply_markup:{inline_keyboard:[[{text:'🔄 Aktualisieren',callback_data:'home:league'},{text:'🧠 Coach',callback_data:'home:coach'}],[{text:'🏆 Academy',callback_data:'home:academy'},{text:'📈 Statistik',callback_data:'home:stats_day'}],[{text:'🏠 Command Center',callback_data:'home'}]]}};return messageId?tg('editMessageText',{...payload,message_id:messageId}):tg('sendMessage',payload);}

async function showShadowTrainingCoach(chatId,messageId=null){
  const academy=evaluateShadowCapitalAcademy(shadowPortfolioLedger,{asOf:Date.now(),timeZone:shadowStatsTimeZone});
  const t=evaluateShadowTrainingSupervisor(shadowPortfolioLedger,academy,{asOf:Date.now()});
  const x=renderSupervisorCompact(t);
  const qualityModel=buildShadowTradeQualityModel(shadowPortfolioLedger,{asOf:Date.now()});
  const quality=qualityLearnerSummary(qualityModel);
  const challengerLab=buildLearnedChallengerLab(qualityModel,shadowPortfolioLedger,{asOf:Date.now()});
  const challengers=learnedChallengerSummary(challengerLab);
  const regimeMatrix=buildRegimeStrategyMatrix(shadowPortfolioLedger);
  const regimeSummary=regimeBrainSummary(regimeMatrix);
  const stressLab=buildAdversarialStressLab(shadowPortfolioLedger,challengerLab);
  const stressSummary=adversarialStressSummary(stressLab);
  const pf=x.profitFactor==null?'—':Number.isFinite(x.profitFactor)?fmt(x.profitFactor,2):'∞';
  const money=v=>(Number.isFinite(Number(v))?(Number(v)>=0?'+':'')+fmt(Number(v),2)+' USDT':'—');
  const pct=v=>(Number.isFinite(Number(v))?fmt(Number(v)*100,1)+'%':'—');
  const topSymbol=t.diversity.symbols?.[0];
  const lines=[
    '🧠 TCX TRAINING COACH','',
    'AKTUELLE MISSION',
    x.mission,
    t.mission.objective,
    'Fortschritt: '+fmt(t.mission.progress*100,1)+'%','',
    'ROLLING-LEISTUNG',
    'Trades im Fenster: '+x.recentTrades,
    'Profit Factor: '+pf,
    'Expectancy: '+money(x.expectancyQuote),
    'Drawdown: '+pct(x.drawdownPct),
    'Verlustserie: '+t.rolling.lossStreak,
    'Dominanter Coin: '+(topSymbol?topSymbol.key+' · '+fmt((topSymbol.trades/Math.max(1,t.samples.recent))*100,1)+'%':'—'),'',
    'TRADE-QUALITY-LEARNER',
    'Gelernte Outcomes: '+quality.samples+' · davon Exploration: '+quality.explorationSamples,
    'Globaler posteriorer Trefferwert: '+(quality.global?fmt(quality.global.posteriorWinRate*100,1)+'%':'—'),
    'Bester belastbarer Kontext: '+(quality.bestContexts?.[0]?quality.bestContexts[0].key+' · '+fmt(quality.bestContexts[0].qualityScore*100,0)+'/100':'noch zu wenig Daten'),
    'Schwächster belastbarer Kontext: '+(quality.weakContexts?.[0]?quality.weakContexts[0].key+' · '+fmt(quality.weakContexts[0].qualityScore*100,0)+'/100':'noch zu wenig Daten'),'',
    'MANDATORY DISCOVERY',
    'Jeder Auto-Learn-Scan muss nach einem Lernkandidaten suchen, wenn kein normaler Entry die Qualitäts-Schwellen erreicht.',
    'Exploration: max. '+mandatoryShadowDiscoveryMaxPerSymbolDay+' je Coin/Tag · '+fmt(mandatoryShadowDiscoveryNotional,0)+' USDT virtuell · max. '+mandatoryShadowDiscoveryMaxOpenTotal+' gleichzeitig.','',
    'LEARNING V2 · CHALLENGER FACTORY',
    'Automatisch abgeleitete Regeln: '+challengers.ruleCount+
      ' · qualifiziert '+Number(challengers.counts?.qualified||0)+
      ' · Trial '+Number(challengers.counts?.trial||0)+
      ' · Drift-Watch '+Number(challengers.counts?.driftWatch||0)+
      ' · verworfen '+Number(challengers.counts?.rejected||0),
    'Top-Regel: '+(challengers.topRule?
      challengers.topRule.ruleId+' · '+challengers.topRule.status+
      ' · Quelle n='+challengers.topRule.sourceSamples+
      ' · Forward n='+challengers.topRule.forwardSamples
      :'noch keine belastbare Regel'),
    'Stärkster Unterschied: '+(challengers.strongestFeature?
      challengers.strongestFeature.feature+'='+challengers.strongestFeature.value+
      ' · Win-Lift '+(challengers.strongestFeature.winLift>=0?'+':'')+fmt(challengers.strongestFeature.winLift*100,1)+'pp'
      :'noch zu wenig Daten'),
    'Challenger handeln nur vorwärts im eigenen Testmodus; ihre Ergebnisse fließen nicht zurück in die Musterentdeckung.',
    'Budget: '+fmt(learnedChallengerBaseNotional,0)+' USDT virtuell Basis · max. '+learnedChallengerMaxOpenTotal+' offen · max. '+learnedChallengerMaxOpenPerSymbol+' je Coin.','',
    'LEARNING V3 · REGIME BRAIN',
    'Regime-markierte abgeschlossene Trades: '+regimeSummary.samples+' · gelernte Regime: '+regimeSummary.regimes,
    'Favored Matrix-Zellen: '+Number(regimeMatrix.favored?.length||0)+' · Avoid: '+Number(regimeMatrix.avoid?.length||0),
    'Challenger werden je Marktregime separat bewertet: FAVORED 1.15x · NEUTRAL 0.75x · unbekannt 0.65x · AVOID 0x.',
    'Regime wird beim Entry eingefroren; spätere Daten dürfen den historischen Entry-Kontext nicht umschreiben.','',
    'LEARNING V4 · ADVERSARIAL STRESS LAB',
    'Regeln: '+stressSummary.ruleCount+
      ' · sammeln '+Number(stressSummary.counts?.collecting||0)+
      ' · resilient '+Number(stressSummary.counts?.resilient||0)+
      ' · stress-mature '+Number(stressSummary.counts?.stressMature||0)+
      ' · watch '+Number(stressSummary.counts?.watch||0)+
      ' · fragil '+Number(stressSummary.counts?.fragile||0),
    'Stress prüft Zusatzkosten, harte Zusatzkosten, fehlende Top-Gewinner, jüngste Hälfte, Zeit-Folds sowie Coin-/Regime-Abhängigkeit.',
    'COLLECTING 1.00x · RESILIENT 0.85x · STRESS_MATURE 1.00x · WATCH 0.50x · FRAGILE 0x.',
    'Das Stress-Lab darf Risiko nur begrenzen, niemals über 1.00x erhöhen.','',
    'AUTOMATISCHE RISIKOANPASSUNG',
    'Academy-Budget wird aktuell mit '+fmt(x.riskMultiplier,2)+'× skaliert.',
    'Status: '+(x.hold?'⛔ Trainingspause':'🟢 neue qualifizierte Shadow-Entries erlaubt'),
    ...(x.hold&&t.risk.holdUntil?['Pause bis: '+new Date(t.risk.holdUntil).toLocaleString('de-DE',{timeZone:shadowStatsTimeZone})]:[]),
    '',
    'Der Coach darf Entry-Gates niemals lockern, nur Risiko reduzieren oder pausieren.',
    'Ziel: Robustheit statt einzelne Glückstreffer.',
    'Mode: SHADOW_ONLY · canExecuteLive: NO'
  ];
  const payload={chat_id:chatId,text:lines.join('\n').slice(0,4096),reply_markup:{inline_keyboard:[
    [{text:'🔄 Aktualisieren',callback_data:'home:coach'},{text:'🏆 Academy',callback_data:'home:academy'}],
    [{text:'📈 Statistik',callback_data:'home:stats_day'},{text:'💼 Portfolio',callback_data:'home:portfolio'}],
    [{text:'🏠 Start',callback_data:'home'}]
  ]}};
  if(messageId) return tg('editMessageText',{...payload,message_id:messageId});
  return tg('sendMessage',payload);
}

async function showShadowTradeStats(chatId,messageId=null,period='DAY'){
 const p=String(period||'DAY').toUpperCase(),s=shadowPortfolioPeriodStats(shadowPortfolioLedger,{period:p,asOf:Date.now(),timeZone:shadowStatsTimeZone}),all=shadowPortfolioStatistics(shadowPortfolioLedger,{asOf:Date.now(),timeZone:shadowStatsTimeZone});
 const money=v=>Number.isFinite(Number(v))?(Number(v)>=0?'+':'')+fmt(Number(v),2)+' USDT':'—', pct=v=>Number.isFinite(Number(v))?fmt(Number(v)*100,1)+'%':'—';
 const top=Object.entries(s.bySymbol||{}).sort((x,y)=>Number(y[1].realizedPnlQuote||0)-Number(x[1].realizedPnlQuote||0))[0];
 const lines=['📈 PERFORMANCE · '+s.label,'','PnL        '+money(s.realizedPnlQuote),'Winrate    '+pct(s.winRate),'Trades     '+s.trades,'Profit F.  '+(s.profitFactor==null?'—':fmt(s.profitFactor,2)),'Ø / Trade  '+money(s.expectancyQuote),'','BESTER MARKT',top?symbolLabel(top[0])+' · '+money(top[1].realizedPnlQuote):'Noch keine abgeschlossenen Trades','','ZEITRAUM','Heute '+money(all.DAY.realizedPnlQuote)+'   ·   Woche '+money(all.WEEK.realizedPnlQuote),'Monat '+money(all.MONTH.realizedPnlQuote)+'   ·   Gesamt '+money(all.ALL.realizedPnlQuote),'','🧪 Virtuelle Performance · SHADOW_ONLY'];
 const payload={chat_id:chatId,text:lines.join('\n'),reply_markup:{inline_keyboard:[[{text:'Heute',callback_data:'home:stats_day'},{text:'7 Tage',callback_data:'home:stats_week'}],[{text:'30 Tage',callback_data:'home:stats_month'},{text:'Gesamt',callback_data:'home:stats_all'}],[{text:'💼 Portfolio',callback_data:'home:portfolio'},{text:'🏠 Command Center',callback_data:'home'}]]}};return messageId?tg('editMessageText',{...payload,message_id:messageId}):tg('sendMessage',payload);
}

async function showShadowPortfolio(chatId,messageId=null){
 const r=reconcileShadowPortfolioEntries(shadowPortfolioLedger,shadowOrders,{now:Date.now()});if(r.changed){shadowPortfolioLedger=r.ledger;await persistShadowPortfolio('ui-reconcile');}
 const x=shadowPortfolioSummary(shadowPortfolioLedger,{asOf:Date.now()}),money=v=>Number.isFinite(Number(v))?(Number(v)>=0?'+':'')+fmt(Number(v),2)+' USDT':'—';
 const lines=['TCX // SHADOW PORTFOLIO','━━━━━━━━━━━━━━━━━━━━','CAPITAL SIMULATION','','EQUITY      '+fmt(x.equityQuote,2)+' USDT','GESAMT PnL  '+money(x.netPnlQuote),'HEUTE       '+money(shadowPortfolioPeriodStats(shadowPortfolioLedger,{period:'DAY',asOf:Date.now(),timeZone:shadowStatsTimeZone}).realizedPnlQuote),'DRAWDOWN    '+fmt(x.maxDrawdownPct*100,2)+'%','','PERFORMANCE','Trades '+x.closedTrades+'   ·   Winrate '+(x.winRate==null?'—':fmt(x.winRate*100,1)+'%'),'Profit Factor '+(x.profitFactor==null?'—':fmt(x.profitFactor,2))+'   ·   Offen '+x.openPositions,'','AKTIVE POSITIONEN'];
 if(x.active.length)for(const p of x.active.slice(0,5))lines.push((p.side==='LONG'?'↗':'↘')+' '+p.symbol.replace('USDT','/USDT')+' · '+p.side+' · '+money(p.unrealizedNetPnlQuote));else lines.push('Keine offene Hauptposition.');
 lines.push('','TRADE LOOP','Entry → Position → Exit → Attribution → Learning','','SHADOW ONLY · REAL ORDERS BLOCKED');
 const payload={chat_id:chatId,text:lines.join('\n'),reply_markup:{inline_keyboard:[[{text:'🔄 Aktualisieren',callback_data:'home:portfolio'},{text:'📈 Performance',callback_data:'home:stats_day'}],[{text:'🎯 Signale',callback_data:'home:radar'},{text:'🔎 Kein Trade?',callback_data:'cmdrun:why_not_trade'}],[{text:'🧠 Lernzentrum',callback_data:'home:performance'},{text:'🏠 Command Center',callback_data:'home'}]]}};return messageId?tg('editMessageText',{...payload,message_id:messageId}):tg('sendMessage',payload);
}

async function showTradeDiscoveryDiagnostics(chatId,messageId=null){
  const now=Date.now();
  const positions=shadowPortfolioLedger.positions||[];
  const openStandardPositions=positions.filter(p=>p.status==='OPEN'&&!['CHALLENGER','ABSTAIN_PROBE','COVERAGE_PROBE'].includes(String(p.entryMode||'STANDARD').toUpperCase())).length;
  const academy=evaluateShadowCapitalAcademy(shadowPortfolioLedger,{asOf:now,timeZone:shadowStatsTimeZone});
  const training=evaluateShadowTrainingSupervisor(shadowPortfolioLedger,academy,{asOf:now});
  const runtime={
    omsStatus:shadowOmsHealthy?'HEALTHY':'UNHEALTHY',
    omsFilled:shadowOrders.filter(o=>o.status==='FILLED').length,
    omsActive:shadowOrders.filter(o=>['ACTIVE','PARTIALLY_FILLED'].includes(o.status)).length,
    openStandardPositions,
    standardOpenCap:autoShadowMaxOpenTotal,
    openDiscoveryPositions:countOpenDiscoveryPositions(positions),
    discoveryOpenCap:mandatoryShadowDiscoveryMaxOpenTotal,
    academyStage:academy.activeStage,
    academyCoreAllowed:academy.guard.coreAllowed===true,
    academyMemeAllowed:academy.guard.memeAllowed===true,
    academyBlockers:academy.guard.blockers||[],
    trainingHold:training.risk.hold===true,
    trainingMission:training.mission.type,
    trainingHoldUntil:training.risk.holdUntil||null,
    reconciliation:shadowPortfolioHealthy
      ?(reconcileShadowPortfolioEntries(shadowPortfolioLedger,shadowOrders,{now}).changed?'pending correction':'in sync')
      :'unhealthy',
    reconciledAt:shadowPortfolioLedger.updatedAt||now
  };
  const summary=summarizeTradeDiscovery(tradeDiscoveryDiagnostics,{now,runtime});
  const text=renderTradeDiscoveryDiagnostics(summary);
  const payload={chat_id:chatId,text,reply_markup:{inline_keyboard:[
    [{text:'🔄 Aktualisieren',callback_data:'cmdrun:why_not_trade'}],
    [{text:'💼 Shadow-Portfolio',callback_data:'home:portfolio'},{text:'🧪 Lernzentrum',callback_data:'home:performance'}],
    [{text:'🏠 Start',callback_data:'home'}]
  ]}};
  if(messageId) return tg('editMessageText',{...payload,message_id:messageId});
  return tg('sendMessage',payload);
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

async function showIntelligence(chatId,symbol){
  const s=await snapshot(symbol);
  let derivatives=null;
  try{
    derivatives=await derivativesResearchProvider.fetchSnapshot(symbol,{cacheMs:15000});
  }catch{}
  let liquidations=null;
  try{
    liquidations=liquidationResearchStream.snapshot(symbol,{asOf:Date.now()});
  }catch{}
  let onchain=null;
  try{
    onchain=await onchainResearchProvider.fetchAssetSnapshot(symbol,{cacheMs:20000});
  }catch{}
  let entityFlow=null;
  if(symbol==='ETHUSDT'&&entityFlowAddressIndex.addressCount>0){
    try{
      const rawEntityFlow=await entityFlowResearchProvider.fetchSnapshot();
      entityFlow=scoreEntityFlowSnapshot(rawEntityFlow,entityFlowMemory,{minBaselineSamples:20});
    }catch{}
  }
  let walletCohort=null;
  if(walletCohortResearchProvider.configuredCohorts>0){
    try{walletCohort=await walletCohortResearchProvider.fetchSnapshot(symbol,{asOf:Date.now()});}catch{}
  }
  const expansion=buildInstitutionalExpansionEvidence({
    asOf:Number(s.availableAt),
    orderBook:{timestamp:Number(s.timestamp),availableAt:Number(s.availableAt),source:String(s.source),version:String(s.version),bids:[[Number(s.bid),1]],asks:[[Number(s.ask),1]]},
    liquidityContext:{aggressiveFlow:Number(s.imbalance||0),priceResponse:0,visibleBarrierStrength:Math.min(1,Math.abs(Number(s.imbalance||0))),approachVelocity:0}
  });
  const liq=expansion.liquiditySnapshot;
  const gate=String(liq?.gate||'INSUFFICIENT').toUpperCase();
  const lines=[
    '🧠 MARKTCHECK · '+symbolLabel(symbol),'',
    'WAS TCX GERADE LIVE PRÜFEN KANN',
    `💧 Liquidität: ${gate==='PASS'||gate==='VALID'?'🟢 ausreichend':'🟡 eingeschränkt'}`,
    `• Spread: ${Number.isFinite(liq?.spreadBps)?liq.spreadBps.toFixed(2)+' bps':'—'}`,
    `• Orderbuch-Balance: ${Number.isFinite(liq?.imbalance)?(liq.imbalance*100).toFixed(1)+'%':'—'}`,'',
    'DERIVATIVES-RESEARCH',
    `📊 Quellen: ${derivatives?.witness?.sourceCount||0}/2 live`,
    `• Funding: ${Number.isFinite(derivatives?.binance?.fundingRate)?(derivatives.binance.fundingRate*100).toFixed(4)+'%':'—'}`,
    `• Perp-Premium: ${Number.isFinite(derivatives?.binance?.premiumPct)?(derivatives.binance.premiumPct*100).toFixed(4)+'%':'—'}`,
    `• Open Interest Δ 5m: ${Number.isFinite(derivatives?.binance?.openInterestDelta5m)?(derivatives.binance.openInterestDelta5m*100).toFixed(2)+'%':'—'}`,
    `• Global Long/Short: ${Number.isFinite(derivatives?.binance?.globalLongShortRatio)?derivatives.binance.globalLongShortRatio.toFixed(3):'—'}`,
    `• Taker Buy/Sell: ${Number.isFinite(derivatives?.binance?.takerBuySellRatio)?derivatives.binance.takerBuySellRatio.toFixed(3):'—'}`,
    'Diese Werte laufen nur in Feature-Research und verändern das aktive Forecast-Modell nicht.','',
    'LIQUIDATION-RESEARCH',
    `⚡ Stream: ${liquidations?.connected?'🟢 verbunden':'🟡 nicht verbunden'}`,
    `• 5m-Abdeckung: ${liquidations?.ready5m?'bereit':'sammelt'}`,
    `• Liquidationsvolumen 5m: ${liquidations?.ready5m?('$'+Math.round(liquidations.window5m.totalUsd).toLocaleString('en-US')):'—'}`,
    `• Long-Liquidationsanteil: ${liquidations?.ready5m?((liquidations.window5m.longShare*100).toFixed(1)+'%'):'—'}`,
    `• Imbalance: ${liquidations?.ready5m?((liquidations.window5m.imbalance*100).toFixed(1)+'%'):'—'}`,
    'Liquidationen werden nur als Forschungsfeature gespeichert; keine Handelsfreigabe.','',
    'ON-CHAIN-RESEARCH',
    `⛓ Quelle: ${onchain?.ok?(onchain.chain+' live'):'für diesen Coin nicht verfügbar'}`,
    ...(onchain?.chain==='BITCOIN'?[
      `• Mempool-TXs: ${Number.isFinite(onchain.metrics?.mempoolTxCount)?Math.round(onchain.metrics.mempoolTxCount).toLocaleString('en-US'):'—'}`,
      `• Fastest Fee: ${Number.isFinite(onchain.metrics?.fastestFeeSatVb)?onchain.metrics.fastestFeeSatVb+' sat/vB':'—'}`
    ]:[]),
    ...(onchain?.chain==='ETHEREUM'?[
      `• Gas-Auslastung: ${Number.isFinite(onchain.metrics?.gasUtilization)?(onchain.metrics.gasUtilization*100).toFixed(1)+'%':'—'}`,
      `• Base Fee: ${Number.isFinite(onchain.metrics?.baseFeeGwei)?onchain.metrics.baseFeeGwei.toFixed(2)+' gwei':'—'}`,
      `• ≥100 ETH Native Transfers im letzten Block: ${Number(onchain.metrics?.largeNativeTransferCount||0)}`
    ]:[]),
    ...(onchain?.chain==='SOLANA'?[
      `• TPS: ${Number.isFinite(onchain.metrics?.tps)?onchain.metrics.tps.toFixed(0):'—'}`,
      `• Non-vote TPS: ${Number.isFinite(onchain.metrics?.nonVoteTps)?onchain.metrics.nonVoteTps.toFixed(0):'—'}`,
      `• Priority Fee Median: ${Number.isFinite(onchain.metrics?.priorityFeeMedian)?onchain.metrics.priorityFeeMedian.toFixed(0):'—'}`
    ]:[]),
    'Nur öffentlich beobachtbare Chain-Daten; kein Identitäts-Matching.','',
    'ENTITY-FLOW-RESEARCH',
    `🏦 Verifizierter ETH-Adress-Sample: ${entityFlowAddressIndex.addressCount} Adressen · ${entityFlowAddressIndex.entityCount} Entity`,
    `• Finalität: ${entityFlow?.ok?'finalisierte Blöcke':'—'} · Native ETH only`,
    ...(entityFlow?.entities?.OKX?.['5m']?[
      `• OKX extern 5m: rein ${entityFlow.entities.OKX['5m'].inflowEth.toFixed(2)} ETH · raus ${entityFlow.entities.OKX['5m'].outflowEth.toFixed(2)} ETH`,
      `• Netto extern: ${entityFlow.entities.OKX['5m'].netExternalEth>=0?'+':''}${entityFlow.entities.OKX['5m'].netExternalEth.toFixed(2)} ETH`,
      `• Bekannte interne Transfers ausgeschlossen: ${entityFlow.entities.OKX['5m'].internalEth.toFixed(2)} ETH`,
      `• Bekannte Entity↔Entity-Transfers ausgeschlossen: ${entityFlow.entities.OKX['5m'].interEntityEth.toFixed(2)} ETH`,
      `• Baseline: n=${entityFlow.entities.OKX['5m'].baselineSamples} · robuste Anomalie ${Number.isFinite(entityFlow.entities.OKX['5m'].grossExternalRobustZ)?entityFlow.entities.OKX['5m'].grossExternalRobustZ.toFixed(2):'—'}`
    ]:['• Für diesen Markt kein Entity-Flow-Snapshot verfügbar.']),
    'Wichtig: Das Registry-Set ist ein begrenzter verifizierter Adress-Sample, keine vollständige Exchange-Bilanz.','',
    'WALLET-COHORT-RESEARCH',
    `👛 Manuell konfigurierte öffentliche Kohorten: ${walletCohortResearchProvider.configuredCohorts}`,
    walletCohortResearchProvider.configuredCohorts===0
      ?'• Keine zusätzlichen Wallet-Kohorten konfiguriert.'
      :`• Aktivität 5m: ${walletCohort?.ok?walletCohort.metrics.activity5m:'—'} · 15m: ${walletCohort?.ok?walletCohort.metrics.activity15m:'—'}`,
    'Keine Zuordnung von Wallets zu natürlichen Personen.','',
    'NOCH NICHT MIT LIVE-DATEN VERBUNDEN',
    '🪙 Memecoin-On-Chain: Modul vorhanden, aktuelle Live-Daten fehlen',
    '🗣 Nachrichten/Narrative: Modul vorhanden, aktuelle Quelle fehlt',
    '🔭 Langfristige Zukunftssignale: Modul vorhanden, aktuelle Datenquelle fehlt','',
    'TCX zählt ein Modul erst als aktiv, wenn echte Daten vorhanden sind. Fehlende Daten werden nicht erfunden.','',
    'Systemmodus: ABSTAIN / SHADOW_ONLY'
  ];
  await tg('sendMessage',{chat_id:chatId,text:lines.join('\n').slice(0,4096),reply_markup:memoryKeyboard(symbol)});
}

async function showForecast(chatId,symbol,messageId=null,options={}){
  const started=Date.now();
  const silent=options?.silent===true;
  const issuanceSource=String(options?.source||'TCX_TELEGRAM_INSTITUTIONAL_FORECAST');
  const forecastMemoryTrace=issuanceSource==='TCX_AUTOLEARN_V1'?[]:null;
  const markForecastMemory=(phase)=>{
    if(!forecastMemoryTrace) return;
    const m=process.memoryUsage();
    forecastMemoryTrace.push({
      phase:String(phase),
      atMs:Date.now()-started,
      heapUsedMb:Math.round(m.heapUsed/1024/1024),
      rssMb:Math.round(m.rss/1024/1024),
      externalMb:Math.round(m.external/1024/1024),
      arrayBuffersMb:Math.round((m.arrayBuffers||0)/1024/1024)
    });
  };
  const emitForecastMemoryTrace=(outcome)=>{
    if(!forecastMemoryTrace?.length) return;
    const base=forecastMemoryTrace[0];
    const peak=forecastMemoryTrace.reduce((acc,row)=>({
      heapUsedMb:Math.max(acc.heapUsedMb,row.heapUsedMb),
      rssMb:Math.max(acc.rssMb,row.rssMb),
      externalMb:Math.max(acc.externalMb,row.externalMb),
      arrayBuffersMb:Math.max(acc.arrayBuffersMb,row.arrayBuffersMb)
    }),{heapUsedMb:0,rssMb:0,externalMb:0,arrayBuffersMb:0});
    console.info('[TCX_FORECAST_MEMORY_TRACE]',JSON.stringify({
      symbol,
      outcome:String(outcome||'UNKNOWN'),
      durationMs:Date.now()-started,
      base,
      peak,
      deltaFromStart:{
        heapUsedMb:peak.heapUsedMb-base.heapUsedMb,
        rssMb:peak.rssMb-base.rssMb,
        externalMb:peak.externalMb-base.externalMb,
        arrayBuffersMb:peak.arrayBuffersMb-base.arrayBuffersMb
      },
      phases:forecastMemoryTrace
    }));
  };
  markForecastMemory('start');
  if(!forecastRuntime.healthy){
    const failure={ok:false,skipped:true,reason:'FORECAST_RUNTIME_UNHEALTHY'};
    if(silent) return failure;
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

  let derivativesResearchSnapshot=null;
  let liquidationResearchSnapshot=null;
  let onchainResearchSnapshot=null;
  let entityFlowResearchSnapshot=null;
  let walletResearchSnapshot=null;
  let externalResearchSnapshot=null;
  if(issuanceSource==='TCX_AUTOLEARN_V1'){
    try{
      derivativesResearchSnapshot=await derivativesResearchProvider.fetchSnapshot(symbol,{cacheMs:15000});
      recordOperation(observability,{
        name:'derivatives_research_snapshot',
        ok:derivativesResearchSnapshot?.ok===true,
        latencyMs:0,
        error:derivativesResearchSnapshot?.ok?null:(derivativesResearchSnapshot?.errors||[]).map(x=>x.source+':'+x.error).join(' | ')
      });
    }catch(err){
      recordError(observability,{scope:'derivatives_research',message:err instanceof Error?err.message:String(err)});
    }
    try{
      liquidationResearchSnapshot=liquidationResearchStream.snapshot(symbol,{asOf:Date.now()});
    }catch(err){
      recordError(observability,{scope:'liquidation_research',message:err instanceof Error?err.message:String(err)});
    }
    try{
      onchainResearchSnapshot=await onchainResearchProvider.fetchAssetSnapshot(symbol,{cacheMs:20000});
    }catch(err){
      recordError(observability,{scope:'onchain_research',message:err instanceof Error?err.message:String(err)});
    }
    try{
      externalResearchSnapshot=await externalResearchProvider.fetchBundle(symbol);
      recordOperation(observability,{
        name:'external_research_data_hub',
        ok:Boolean(externalResearchSnapshot?.coinMetrics?.ok||externalResearchSnapshot?.deribitOptions?.ok||externalResearchSnapshot?.macro?.ok||externalResearchSnapshot?.predictionMarket?.ok),
        latencyMs:0,
        error:null
      });
    }catch(err){
      recordError(observability,{scope:'external_research_data_hub',message:err instanceof Error?err.message:String(err)});
    }
    if(symbol==='ETHUSDT'&&entityFlowAddressIndex.addressCount>0){
      try{
        const rawEntityFlow=await entityFlowResearchProvider.fetchSnapshot();
        entityFlowResearchSnapshot=scoreEntityFlowSnapshot(rawEntityFlow,entityFlowMemory,{minBaselineSamples:20});
        observeEntityFlowMemory(entityFlowMemory,rawEntityFlow,{observedAt:Date.now()});
        await saveEntityFlowMemory(entityFlowMemoryFile,entityFlowMemory);
      }catch(err){
        recordError(observability,{scope:'entity_flow_research',message:err instanceof Error?err.message:String(err)});
      }
    }
    if(walletCohortResearchProvider.configuredCohorts>0){
      try{
        walletResearchSnapshot=await walletCohortResearchProvider.fetchSnapshot(symbol,{asOf:Date.now()});
      }catch(err){
        recordError(observability,{scope:'wallet_cohort_research',message:err instanceof Error?err.message:String(err)});
      }
    }
  }

  markForecastMemory('research-providers');
  const ctx=await buildInstitutionalResearchContext(symbol,{auditEnvelope:true});
  const {
    state,witnessReport,r15,
    marketAudit,witnessAudit,engineAudit,safety,envelope
  }=ctx;
  markForecastMemory('institutional-context');

  const seed=seedInstitutionalForecastRuntimeFromEpisodes(forecastRuntime,episodes);
  if(seed.addedRows>0) await persistForecastRuntime('forecast-episode-seed');

  const evidenceContext=buildResearchAlertContext(state,witnessReport,{
    engineOverride:r15,
    safetyOverride:safety
  });
  const evidenceAppend=appendEvidenceFromContext(symbol,evidenceContext);
  if(evidenceAppend.changed) await persistEvidenceHistory('forecast-state');
  markForecastMemory('evidence-history');

  const episodeExtraFeatures=episodeVectorExtraFeatures(
    episodeVector({analysis:state.memoryAnalysis,dashboard:state.memoryDashboard}),
    state.availableAt
  );
  markForecastMemory('episode-features');
  let researchPlaneWrite={ok:researchDataPlane.healthy,appended:0,duplicates:0};
  if(issuanceSource==='TCX_AUTOLEARN_V1'&&researchDataPlane.healthy){
    try{
      const snapshots=buildResearchDataPlaneSnapshots({
        symbol,
        ingestedAt:Date.now(),
        derivativesSnapshot:derivativesResearchSnapshot,
        liquidationSnapshot:liquidationResearchSnapshot,
        onchainSnapshot:onchainResearchSnapshot,
        entityFlowSnapshot:entityFlowResearchSnapshot,
        walletSnapshot:walletResearchSnapshot,
        externalSnapshot:externalResearchSnapshot
      });
      researchPlaneWrite=await appendResearchDataPlaneQueued(snapshots,'autolearn:'+symbol);
      markForecastMemory('rdp-append');
    }catch(err){
      const msg=err instanceof Error?err.message:String(err);
      recordError(observability,{scope:'research_data_plane.capture',message:msg});
      researchPlaneWrite={ok:false,appended:0,duplicates:0,reason:msg};
    }
  }
  const researchGovernanceView=researchDataGovernanceSummary(researchDataGovernance,{now:Date.now()});
  const blockedResearchSourceKeys=quarantinedResearchSourceKeys(researchDataGovernance);
  const researchPlaneView=researchFeaturesAsOf(researchDataPlane,{
    streamKey:symbol,
    asOf:Number(state.availableAt),
    minCompleteness:.5,
    requireGoverned:true,
    blockedSourceKeys:blockedResearchSourceKeys
  });
  markForecastMemory('rdp-read');
  const researchPlaneExtraFeatures=researchPlaneView.ok?researchPlaneView.features:[];
  markForecastMemory('research-plane');
  const derivativesExtraFeatures=researchPlaneExtraFeatures.filter(row=>row.domain==='DERIVATIVES');
  const liquidationExtraFeatures=researchPlaneExtraFeatures.filter(row=>row.domain==='LIQUIDATION');
  const onchainExtraFeatures=researchPlaneExtraFeatures.filter(row=>row.domain==='ONCHAIN');
  const entityFlowExtraFeatures=researchPlaneExtraFeatures.filter(row=>row.domain==='ENTITY_FLOW');
  const walletExtraFeatures=researchPlaneExtraFeatures.filter(row=>row.domain==='WALLET_COHORT');
  const intelligenceExtraFeatures=buildDerivedResearchIntelligenceFeatures([
    ...episodeExtraFeatures,
    ...researchPlaneExtraFeatures
  ]);
  const extraFeatures=[...episodeExtraFeatures,...researchPlaneExtraFeatures,...intelligenceExtraFeatures];
  const runtimeQuality=deriveForecastRuntimeQuality({
    safety,
    marketAudit,
    witnessAudit,
    engineAudit,
    witnessReport,
    dashboard:state.memoryDashboard,
    extraFeatureCount:episodeExtraFeatures.length,
    expectedExtraFeatureCount:forecastRuntime.engine.configSnapshot().featureIds.length
  });
  if(silent&&issuanceSource==='TCX_AUTOLEARN_V1'){
    const cleanAudit=
      marketAudit?.ok===true&&
      witnessAudit?.ok===true&&
      engineAudit?.ok===true&&
      auditLedger.healthy===true&&
      marketFabric.healthy===true&&
      safety?.canResearch===true&&
      runtimeQuality.dataQuality>=0.70;
    if(!cleanAudit){
      markForecastMemory('quality-gate');
      emitForecastMemoryTrace('AUTOLEARN_QUALITY_GATE');
      return {
        ok:false,
        skipped:true,
        reason:'AUTOLEARN_QUALITY_GATE',
        dataQuality:runtimeQuality.dataQuality,
        safetyState:String(safety?.state||'UNKNOWN')
      };
    }
  }
  // Expansion V1 is wired only from evidence we actually observe here.
  // No synthetic wallet, memecoin, narrative or future-intelligence inputs are fabricated.
  let expansionEvidence=null;
  try{
    const expansionBook=await marketDataProvider.fetchExecutionBook(symbol);
    expansionEvidence=buildInstitutionalExpansionEvidence({
      asOf:Number(expansionBook.availableAt),
      orderBook:{
        timestamp:Number(expansionBook.availableAt),
        availableAt:Number(expansionBook.availableAt),
        source:String(expansionBook.source||'BINANCE_PUBLIC_REST_DEPTH100'),
        version:String(expansionBook.version||'UNKNOWN'),
        bids:(expansionBook.bids||[]).map(x=>[Number(x.price??x[0]),Number(x.qty??x[1])]),
        asks:(expansionBook.asks||[]).map(x=>[Number(x.price??x[0]),Number(x.qty??x[1])])
      }
    });
  }catch(err){
    recordError(observability,{
      scope:'forecast.expansion_evidence',
      message:err instanceof Error?err.message:String(err)
    });
  }
  markForecastMemory('expansion-evidence');
  const input=buildCanonicalForecastInput({
    envelope,
    dataQuality:runtimeQuality.dataQuality,
    regimeId:String(state.memoryDashboard?.regime||'UNKNOWN'),
    regimeConfidence:runtimeQuality.regimeConfidence,
    extraFeatures,
    expansionEvidence
  });

  let researchDependencyGraph=null;
  try{
    researchDependencyGraph=buildResearchDependencyGraph({
      plane:researchDataPlane,
      governanceSummary:researchGovernanceView,
      streamKey:symbol,
      asOf:Number(input.asOf),
      knowledgeTime:Math.max(Date.now(),Number(input.asOf)),
      forecastInputFingerprint:input.inputFingerprint,
      requireGoverned:true
    });
  }catch(err){
    recordError(observability,{
      scope:'research_dependency_graph.build',
      message:err instanceof Error?err.message:String(err)
    });
  }

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
  markForecastMemory('live-observation');
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
    if(silent){
      emitForecastMemoryTrace('AUDIT_BINDING_FAILED');
      return {ok:false,skipped:true,reason:'AUDIT_BINDING_FAILED'};
    }
    const failPayload={text:failText,reply_markup:forecastProductKeyboard(symbol)};
    return deliverTelegramTextCard(tg,chatId,messageId,failPayload);
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
    expansion:expansionEvidence,
    evidence:[
      ...(researchPlaneView.ok?[{
        type:'RESEARCH_DATA_PLANE',
        version:RESEARCH_DATA_PLANE_VERSION,
        adapterVersion:RESEARCH_DATA_PLANE_ADAPTER_VERSION,
        seq:researchPlaneView.planeSeq,
        tailHash:researchPlaneView.tailHash,
        featureCount:researchPlaneExtraFeatures.length,
        recordsConsidered:researchPlaneView.recordsConsidered,
        blockedSourceCount:blockedResearchSourceKeys.length,
        epistemic:'POINT_IN_TIME_RESEARCH_FEATURES'
      }]:[]),
      {type:'RESEARCH_DATA_GOVERNANCE',version:RESEARCH_DATA_GOVERNANCE_VERSION,fingerprint:researchGovernanceView.fingerprint,epistemic:'POINT_IN_TIME_DATA_POLICY'},
      ...(researchDependencyGraph?[{
        type:'RESEARCH_DEPENDENCY_GRAPH',
        version:RESEARCH_DEPENDENCY_GRAPH_VERSION,
        fingerprint:researchDependencyGraph.fingerprint,
        gate:researchDependencyGraph.gate,
        totalFeatures:researchDependencyGraph.impact.totalFeatures,
        usableFeatures:researchDependencyGraph.impact.usableFeatures,
        blockedFeatures:researchDependencyGraph.impact.blockedFeatures,
        degradedFeatures:researchDependencyGraph.impact.degradedFeatures,
        coverage:researchDependencyGraph.impact.coverage,
        epistemic:'POINT_IN_TIME_DEPENDENCY_LINEAGE'
      }]:[]),
      ...(expansionEvidence?[{
        type:'EXPANSION_EVIDENCE',
        version:INSTITUTIONAL_EXPANSION_VERSION,
        fingerprint:expansionEvidence.fingerprint,
        gate:expansionEvidence.evidenceGate,
        epistemic:'VERIFIED_READ_ONLY_EXPANSION_EVIDENCE'
      }]:[]),
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
      source:issuanceSource,
      version:INSTITUTIONAL_FORECAST_RUNTIME_VERSION
    }
  };

  const researchAdmissionValidity=bindResearchDependencyGateToValidity(
    forecastResearchValidity(evidenceAppend),
    researchDependencyGraph
  );
  const issued=issueInstitutionalForecast(forecastRuntime,{
    input,
    scientificValidity:scienceCore.validity,
    dataSafety:safety,
    researchValidity:researchAdmissionValidity,
    traceContext,
    generatedAt:Math.max(Date.now(),input.asOf)
  });

  const auditRecord=await appendForecastIssuanceAuditQueued(issued.issuance);
  await persistForecastRuntime('forecast-issued');
  markForecastMemory('forecast-issued');

  const issuance=issued.issuance;
  const auditHealthyAfter=Boolean(auditRecord)&&auditLedger.healthy;
  let autoShadowTrade=null;
  if(issuanceSource==='TCX_AUTOLEARN_V1'){
    try{
      autoShadowTrade=await maybePlaceAutonomousShadowTrade(issuance,{auditHealthy:auditHealthyAfter});
    }catch(err){
      const msg=err instanceof Error?err.message:String(err);
      autoShadowTrade={placed:false,eligible:false,reason:'AUTO_SHADOW_ERROR'};
      recordError(observability,{scope:'auto_shadow_trade',message:msg});
      console.error('auto shadow trade error',symbol,msg);
    }
  }
  let coverageCurriculumRun=null;
  if(issuanceSource==='TCX_AUTOLEARN_V1'){
    try{
      coverageCurriculumRun=await maybePlaceCoverageCurriculum(issuance,{auditHealthy:auditHealthyAfter});
    }catch(err){
      const msg=err instanceof Error?err.message:String(err);
      coverageCurriculumRun={placed:0,eligible:0,reason:'COVERAGE_CURRICULUM_ERROR'};
      recordError(observability,{scope:'coverage_curriculum.entry',message:msg});
      console.error('coverage curriculum error',symbol,msg);
    }
  }
  let mandatoryDiscoveryRun=null;
  if(issuanceSource==='TCX_AUTOLEARN_V1'){
    try{
      mandatoryDiscoveryRun=await maybePlaceMandatoryShadowDiscovery(issuance,{
        auditHealthy:auditHealthyAfter,
        autoResult:autoShadowTrade
      });
    }catch(err){
      const msg=err instanceof Error?err.message:String(err);
      mandatoryDiscoveryRun={placed:false,eligible:false,reason:'MANDATORY_DISCOVERY_ERROR'};
      recordError(observability,{scope:'mandatory_shadow_discovery',message:msg});
      console.error('mandatory shadow discovery error',symbol,msg);
    }
  }
  let learnedChallengerRun=null;
  if(issuanceSource==='TCX_AUTOLEARN_V1'&&issuance.gate!=='ABSTAIN'){
    try{
      const regimeContext=deriveShadowRegimeFingerprint({
        regimeId:String(input.regimeId||state.memoryDashboard?.regime||'UNKNOWN'),
        regimeConfidence:runtimeQuality.regimeConfidence,
        mtfBias:String(state.mtf?.bias||state.memoryDashboard?.bias||'UNKNOWN'),
        pressureScore:state.memoryDashboard?.pressureScore,
        volatilityState:String(state.memoryDashboard?.volatilityState||state.memoryDashboard?.volatility||input.regimeId||'UNKNOWN'),
        liquidityState:String(state.memoryDashboard?.liquidityState||state.memoryDashboard?.liquidity||'UNKNOWN'),
        fundingState:derivativesExtraFeatures.length?'OBSERVED':'UNKNOWN',
        liquidationState:liquidationResearchSnapshot?.ready5m===true?'OBSERVED':'UNKNOWN',
        narrativeState:assetClassForSymbol(symbol)==='MEME'?'MEME':'CORE',
        assetClass:assetClassForSymbol(symbol)
      });
      learnedChallengerRun=await maybePlaceLearnedChallengerTrades(issuance,{
        auditHealthy:auditHealthyAfter,
        regimeContext
      });
    }catch(err){
      const msg=err instanceof Error?err.message:String(err);
      learnedChallengerRun={placed:0,eligible:0,reason:'LEARNED_CHALLENGER_ERROR'};
      recordError(observability,{scope:'learned_challenger.entry',message:msg});
      console.error('learned challenger entry error',symbol,msg);
    }
  }
  let strategyLeagueRun=null;
  if(issuanceSource==='TCX_AUTOLEARN_V1'&&issuance.gate!=='ABSTAIN'){
    try{
      strategyLeagueRun=await maybePlaceStrategyLeagueTrades(issuance,{auditHealthy:auditHealthyAfter});
    }catch(err){
      const msg=err instanceof Error?err.message:String(err);
      strategyLeagueRun={placed:0,eligible:0,reason:'STRATEGY_LEAGUE_ERROR'};
      recordError(observability,{scope:'strategy_league.entry',message:msg});
      console.error('strategy league entry error',symbol,msg);
    }
  }
  markForecastMemory('shadow-actions');
  emitForecastMemoryTrace(issued.duplicate?'ISSUED_DUPLICATE':'ISSUED');
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
    name:silent?'institutional_forecast_autolearn':'institutional_forecast',
    ok:auditHealthyAfter&&issuance.gate!=='ABSTAIN',
    latencyMs:Date.now()-started,
    error:auditHealthyAfter?null:'forecast audit binding failed'
  });

  if(silent){
    const silentResult={
      ok:true,
      skipped:false,
      duplicate:issued.duplicate,
      symbol,
      issuance,
      auditHealthy:auditHealthyAfter,
      dataQuality:runtimeQuality.dataQuality,
      derivativesFeatureCount:derivativesExtraFeatures.length,
      derivativesSourceCount:Number(derivativesResearchSnapshot?.witness?.sourceCount||0),
      liquidationFeatureCount:liquidationExtraFeatures.length,
      liquidationReady5m:liquidationResearchSnapshot?.ready5m===true,
      onchainFeatureCount:onchainExtraFeatures.length,
      onchainChain:onchainResearchSnapshot?.chain||null,
      entityFlowFeatureCount:entityFlowExtraFeatures.length,
      entityFlowNet5m:Number(entityFlowResearchSnapshot?.entities?.OKX?.['5m']?.netExternalEth??NaN),
      entityFlowBaselineSamples:Number(entityFlowResearchSnapshot?.entities?.OKX?.['5m']?.baselineSamples||0),
      walletFeatureCount:walletExtraFeatures.length,
      walletCohorts:walletCohortResearchProvider.configuredCohorts,
      intelligenceFeatureCount:intelligenceExtraFeatures.length,
      intelligenceFeatureIds:intelligenceExtraFeatures.map(x=>x.id),
      intelligenceVersion:RESEARCH_INTELLIGENCE_FEATURES_VERSION,
      researchDataPlaneSeq:researchPlaneView.planeSeq||0,
      researchDataPlaneFeatures:researchPlaneExtraFeatures.length,
      researchDataPlaneAppendOk:researchPlaneWrite?.ok===true,
      researchGovernanceIssueCount:Number(researchGovernanceView.statuses?.QUARANTINED||0),
      researchGovernanceBlockedSources:blockedResearchSourceKeys.length,
      researchGovernanceFingerprint:researchGovernanceView.fingerprint,
      researchDependencyGate:researchDependencyGraph?.gate||'UNAVAILABLE',
      researchDependencyCoverage:Number(researchDependencyGraph?.impact?.coverage||0),
      researchDependencyBlockedFeatures:Number(researchDependencyGraph?.impact?.blockedFeatures||0),
      researchDependencyFingerprint:researchDependencyGraph?.fingerprint||null,
      autoShadowTradePlaced:autoShadowTrade?.placed===true,
      autoShadowTradeEligible:autoShadowTrade?.eligible===true,
      autoShadowTradeReason:autoShadowTrade?.reason||null,
      autoShadowOrderId:autoShadowTrade?.orderId||null,
      autoShadowSide:autoShadowTrade?.side||null,
      coverageCurriculumPlaced:Number(coverageCurriculumRun?.placed||0),
      coverageCurriculumEligible:Number(coverageCurriculumRun?.eligible||0),
      coverageCurriculumReason:coverageCurriculumRun?.reason||null,
      mandatoryDiscoveryPlaced:mandatoryDiscoveryRun?.placed===true,
      mandatoryDiscoveryEligible:mandatoryDiscoveryRun?.eligible===true,
      mandatoryDiscoveryReason:mandatoryDiscoveryRun?.reason||null,
      mandatoryDiscoveryOrderId:mandatoryDiscoveryRun?.orderId||null,
      mandatoryDiscoveryLearningValue:Number(mandatoryDiscoveryRun?.learning?.learningValue||0),
      mandatoryDiscoveryQualityLabel:mandatoryDiscoveryRun?.learning?.qualityLabel||null,
      mandatoryDiscoveryMode:mandatoryDiscoveryRun?.entryMode||null,
      learnedChallengerPlaced:Number(learnedChallengerRun?.placed||0),
      learnedChallengerEligible:Number(learnedChallengerRun?.eligible||0),
      learnedChallengerReason:learnedChallengerRun?.reason||null,
      learnedChallengerRules:Number(learnedChallengerRun?.lab?.ruleCount||0),
      learnedChallengerQualified:Number(learnedChallengerRun?.lab?.counts?.qualified||0),
      learnedChallengerRegime:learnedChallengerRun?.regime?.regimeKey||null,
      learnedChallengerStressRules:Number(learnedChallengerRun?.stressLab?.ruleCount||0),
      learnedChallengerStressFragile:Number(learnedChallengerRun?.stressLab?.counts?.fragile||0),
      learnedChallengerStressMature:Number(learnedChallengerRun?.stressLab?.counts?.stressMature||0),
      strategyLeaguePlaced:Number(strategyLeagueRun?.placed||0),
      strategyLeagueEligible:Number(strategyLeagueRun?.eligible||0),
      strategyLeagueAllocationMode:strategyLeagueRun?.allocationMode||null
    };
    const admissionGate=String(issuance.admission?.gate||'ABSTAIN').toUpperCase();
    const isMeme=assetClassForSymbol(symbol)==='MEME';
    const expectedThreshold=admissionGate==='CAUTION'
      ?Math.max(isMeme?autoShadowMemecoinMinExpectedReturn:autoShadowMinExpectedReturn,.0035)
      :(isMeme?autoShadowMemecoinMinExpectedReturn:autoShadowMinExpectedReturn);
    const directionThreshold=admissionGate==='CAUTION'
      ?Math.max(isMeme?autoShadowMemecoinMinDirectionalProbability:autoShadowMinDirectionalProbability,.62)
      :(isMeme?autoShadowMemecoinMinDirectionalProbability:autoShadowMinDirectionalProbability);
    const edgeThreshold=admissionGate==='CAUTION'
      ?Math.max(isMeme?autoShadowMemecoinMinProbabilityEdge:autoShadowMinProbabilityEdge,.15)
      :(isMeme?autoShadowMemecoinMinProbabilityEdge:autoShadowMinProbabilityEdge);
    const horizons=(issuance.forecast?.horizons||[]).map(h=>{
      const direction=String(h?.direction||'').toUpperCase();
      const probabilities=h?.display?.probabilities||h?.probabilities||{};
      const directional=direction==='UP'?Number(probabilities.up):direction==='DOWN'?Number(probabilities.down):NaN;
      const opposite=direction==='UP'?Number(probabilities.down):direction==='DOWN'?Number(probabilities.up):NaN;
      const expectedReturn=Number(h?.expectedReturn);
      return {
        horizonId:String(h?.horizonId||''),
        gate:String(h?.gate||'UNKNOWN').toUpperCase(),
        calibration:String(h?.calibration?.status||'UNKNOWN').toUpperCase(),
        direction,
        expectedReturn:Number.isFinite(expectedReturn)?expectedReturn:null,
        expectedReturnThreshold:expectedThreshold,
        directionalProbability:Number.isFinite(directional)?directional:null,
        directionThreshold,
        probabilityEdge:Number.isFinite(directional)&&Number.isFinite(opposite)?directional-opposite:null,
        edgeThreshold,
        expectedReturnPass:Number.isFinite(expectedReturn)&&Math.abs(expectedReturn)>=expectedThreshold,
        directionProbabilityPass:Number.isFinite(directional)&&directional>=directionThreshold,
        probabilityEdgePass:Number.isFinite(directional)&&Number.isFinite(opposite)&&directional-opposite>=edgeThreshold,
        reasons:(Array.isArray(h?.reasons)?h.reasons:[]).slice(0,3).map(x=>String(x).slice(0,160))
      };
    });
    recordTradeDiscoveryScan(tradeDiscoveryDiagnostics,{
      symbol,scannedAt:Date.now(),forecastAvailable:true,
      forecastGate:String(issuance.gate||'UNKNOWN').toUpperCase(),
      admissionGate,
      probabilityDisplayAllowed:issuance.probabilityDisplayAllowed===true,
      researchDependencyGate:String(researchDependencyGraph?.gate||'UNAVAILABLE').toUpperCase(),
      dataSafety:String(issuance.trace?.safety?.state||'UNKNOWN').toUpperCase(),
      autoShadowTradePlaced:silentResult.autoShadowTradePlaced,
      autoShadowTradeEligible:silentResult.autoShadowTradeEligible,
      autoShadowTradeReason:silentResult.autoShadowTradeReason,
      autoShadowOrderStatus:autoShadowTrade?.status||null,
      coverageCurriculumPlaced:silentResult.coverageCurriculumPlaced,
      coverageCurriculumReason:silentResult.coverageCurriculumReason,
      mandatoryDiscoveryPlaced:silentResult.mandatoryDiscoveryPlaced,
      mandatoryDiscoveryEligible:silentResult.mandatoryDiscoveryEligible,
      mandatoryDiscoveryReason:silentResult.mandatoryDiscoveryReason,
      mandatoryDiscoveryOrderStatus:mandatoryDiscoveryRun?.status||null,
      horizons
    });
    return silentResult;
  }

  const payload={text,reply_markup:forecastProductKeyboard(symbol)};
  return deliverTelegramTextCard(tg,chatId,messageId,payload);
}

async function showResearchLineage(chatId,messageId,symbol){
  const latest=latestInstitutionalForecast(forecastRuntime,symbol);
  if(!latest){
    return deliverTelegramTextCard(tg,chatId,messageId,{
      text:[
        '🧬 DATENWEG · '+String(symbol).replace('USDT','/USDT'),
        '',
        'Noch keine Prognose vorhanden.',
        'Erstelle zuerst eine Prognose. Danach kann TCX den kompletten Datenweg bis zum Forecast anzeigen.',
        '',
        'Systemmodus: ABSTAIN / SHADOW_ONLY'
      ].join('\n'),
      reply_markup:researchDependencyKeyboard(symbol)
    });
  }

  const asOf=Number(latest.asOf??latest.trace?.asOf);
  if(!Number.isFinite(asOf)) throw new Error('latest forecast asOf unavailable');
  const generatedAt=Number.isFinite(Number(latest.generatedAt))?Number(latest.generatedAt):asOf;
  const knowledgeTime=Math.max(asOf,generatedAt);
  const governanceView=researchDataGovernanceSummary(researchDataGovernance,{now:knowledgeTime});
  const graph=buildResearchDependencyGraph({
    plane:researchDataPlane,
    governanceSummary:governanceView,
    streamKey:symbol,
    asOf,
    knowledgeTime,
    forecastInputFingerprint:latest.trace?.data?.inputFingerprint??null,
    requireGoverned:true
  });
  const text=renderResearchDependencyCard(graph,{
    symbol,
    latestForecast:latest,
    now:Date.now()
  });
  recordOperation(observability,{
    name:'research_dependency_graph_view',
    ok:graph.gate!=='ABSTAIN',
    latencyMs:0,
    error:null
  });
  return deliverTelegramTextCard(tg,chatId,messageId,{
    text,
    reply_markup:researchDependencyKeyboard(symbol)
  });
}

function stopLiveAnalysisAuto(chatId){
  const key=String(chatId);
  const current=sessions.get(key);
  if(['CHART','XRAY','LIQ_MAP'].includes(String(current?.view||''))&&current?.live===true){
    sessions.set(key,{...current,live:false,lastRefresh:Date.now()});
  }
}

function parseAction(data='') {
  const product=parseProductCallback(data);
  if(product.kind!=='UNKNOWN') return product;
  if (data === 'commands') return { kind:'COMMANDS' };
  if (String(data).startsWith('cmd:')) return { kind:'COMMAND_PICK', command:String(data).split(':')[1] };
  if (String(data).startsWith('cmdrun:')) { const x=String(data).split(':'); return { kind:'COMMAND_RUN', command:x[1], symbol:x[2] }; }
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
  if (p[0] === 'chartrefresh' && p[1] && ['1m','5m','15m','1h','4h'].includes(p[2])) return { kind:'CHART_REFRESH', symbol:p[1], interval:p[2] };
  if (p[0] === 'chartlive' && p[1] && ['1m','5m','15m','1h','4h'].includes(p[2]) && (p[3]==='on'||p[3]==='off')) return { kind:'CHART_LIVE', symbol:p[1], interval:p[2], enabled:p[3]==='on' };
  if (p[0] === 'xrayrefresh' && p[1]) return { kind:'XRAY_REFRESH', symbol:p[1] };
  if (p[0] === 'xraylive' && p[1] && (p[2]==='on'||p[2]==='off')) return { kind:'XRAY_LIVE', symbol:p[1], enabled:p[2]==='on' };
  if (p[0] === 'liqrefresh' && p[1] && ['5m','15m'].includes(p[2])) return { kind:'LIQ_MAP_REFRESH', symbol:p[1], window:p[2] };
  if (p[0] === 'liqlive' && p[1] && ['5m','15m'].includes(p[2]) && (p[3]==='on'||p[3]==='off')) return { kind:'LIQ_MAP_LIVE', symbol:p[1], window:p[2], enabled:p[3]==='on' };
  if (p[0] === 'tradereplay' && p[1]) return { kind:'TRADE_REPLAY', symbol:p[1] };
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
  showCommandMenu,
  showFavorites,
  showCompare,
  showMarket,
  showChart,
  showStructure,
  showObservability,
  showChaos,
  showOms,
  showShadowPortfolio,
  showTradeDiscoveryDiagnostics,
  showShadowTradeStats,
  showShadowCapitalAcademy,
  showShadowTrainingCoach,
  showStrategyLeague,
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
  showIntelligence,
  showMemory,
  showEvidence,
  showEvidenceHistory,
  showValidity,
  showDataStatus,
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
    if (a.kind === 'COMMANDS') { await showCommandMenu(chatId,messageId); await ack(q.id); return; }
    if (a.kind === 'COMMAND_PICK') {
      if(a.command==='system'){ await showHomeSection(chatId,messageId,'SYSTEM'); await ack(q.id); return; }
      await showCommandMarkets(chatId,messageId,a.command); await ack(q.id); return;
    }
    if (a.kind === 'COMMAND_RUN') {
      if(a.command==='why_not_trade') { await showTradeDiscoveryDiagnostics(chatId,messageId); await ack(q.id); return; }
      if(!symbolOk(a.symbol)){ await ack(q.id,'Unbekannter Markt'); return; }
      if(a.command==='forecast') await showForecast(chatId,a.symbol,messageId);
      else if(a.command==='intelligence') { await showIntelligence(chatId,a.symbol); }
      else if(a.command==='market') await showMarket(chatId,messageId,a.symbol);
      else if(a.command==='chart') await showChart(chatId,a.symbol,'5m');
      else if(a.command==='evidence') await showEvidence(chatId,messageId,a.symbol);
      else if(a.command==='memory') await showMemory(chatId,a.symbol);
      else if(a.command==='engine') await showEngine(chatId,a.symbol);
      await ack(q.id); return;
    }
    if (a.kind === 'FINAL_FOUNDATION') {
      if(!symbolOk(a.symbol)){await ack(q.id,'Unbekannter Markt');return;}
      stopLiveAnalysisAuto(chatId);
      const textMessageId=(Array.isArray(q.message?.photo)&&q.message.photo.length>0)?null:messageId;
      await showFinalFoundation(chatId,textMessageId,a.symbol); await ack(q.id,'Final Foundation geladen'); return;
    }
    if (a.kind === 'WORLD_MODEL') {
      if(!symbolOk(a.symbol)){await ack(q.id,'Unbekannter Markt');return;}
      stopLiveAnalysisAuto(chatId);
      const textMessageId=(Array.isArray(q.message?.photo)&&q.message.photo.length>0)?null:messageId;
      await showWorldModel(chatId,textMessageId,a.symbol); await ack(q.id,'World Model geladen'); return;
    }
    if (a.kind === 'SCIENTIFIC_BRAIN') {
      if(!symbolOk(a.symbol)){await ack(q.id,'Unbekannter Markt');return;}
      stopLiveAnalysisAuto(chatId);
      const textMessageId=(Array.isArray(q.message?.photo)&&q.message.photo.length>0)?null:messageId;
      await showScientificBrain(chatId,textMessageId,a.symbol); await ack(q.id,'Scientific Brain geladen'); return;
    }
    if (a.kind === 'COGNITIVE_CORE') {
      if(!symbolOk(a.symbol)){await ack(q.id,'Unbekannter Markt');return;}
      stopLiveAnalysisAuto(chatId);
      const textMessageId=(Array.isArray(q.message?.photo)&&q.message.photo.length>0)?null:messageId;
      await showCognitiveCore(chatId,textMessageId,a.symbol); await ack(q.id,'Cognitive Core geladen'); return;
    }
    if (a.kind === 'SUPER_RADAR') {
      stopLiveAnalysisAuto(chatId);
      const textMessageId=(Array.isArray(q.message?.photo)&&q.message.photo.length>0)?null:messageId;
      await showSuperRadar(chatId,textMessageId); await ack(q.id,'Super Radar geladen'); return;
    }
    if (a.kind === 'TERMINAL_VIEW') {
      if(!symbolOk(a.symbol)){await ack(q.id,'Unbekannter Markt');return;}
      stopLiveAnalysisAuto(chatId);
      const textMessageId=(Array.isArray(q.message?.photo)&&q.message.photo.length>0)?null:messageId;
      await showTerminalView(chatId,textMessageId,a.symbol,a.view); await ack(q.id,'Terminal '+a.view); return;
    }
    if (a.kind === 'HOME') {
      stopLiveAnalysisAuto(chatId);
      const textMessageId=(Array.isArray(q.message?.photo)&&q.message.photo.length>0)?null:messageId;
      await showStart(chatId,textMessageId);
      await ack(q.id);
      return;
    }
    if (a.kind === 'GLOBAL_INTEL') {
      await showGlobalIntel(chatId,messageId,a.filter||'TOP');
      await ack(q.id);
      return;
    }
    if (a.kind === 'HOME_SECTION') {
      await showHomeSection(chatId,messageId,a.section);
      await ack(q.id);
      return;
    }
    if (a.kind === 'DEEP_DIVE') {
      if(!symbolOk(a.symbol)) { await ack(q.id,'Unbekannter Markt'); return; }
      stopLiveAnalysisAuto(chatId);
      const textMessageId=(Array.isArray(q.message?.photo)&&q.message.photo.length>0)?null:messageId;
      const text=[
        'TCX // DEEP DIVE · '+a.symbol.replace('USDT','/USDT'),
        '━━━━━━━━━━━━━━━━━━━━',
        'ANALYSE-ZENTRALE',
        '',
        'Chart · MTF · Flow · Liquidation',
        'Confluence · X-Ray · Events · Accuracy · Alerts',
        '',
        'Wähle eine Analyseebene.',
        '',
        'SHADOW_ONLY · REAL ORDERS BLOCKED'
      ].join('\n');
      await deliverTelegramTextCard(tg,chatId,textMessageId,{text,reply_markup:deepDiveKeyboard(a.symbol)});
      await ack(q.id,'Deep Dive geöffnet');
      return;
    }
    if (a.kind === 'WHY') {
      if(!symbolOk(a.symbol)) { await ack(q.id,'Unbekannter Markt'); return; }
      stopLiveAnalysisAuto(chatId);
      const textMessageId=(Array.isArray(q.message?.photo)&&q.message.photo.length>0)?null:messageId;
      await showWhy(chatId,textMessageId,a.symbol);
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
    if (a.kind === 'LINEAGE') {
      if(!symbolOk(a.symbol)) { await ack(q.id,'Unbekannter Markt'); return; }
      await showResearchLineage(chatId,messageId,a.symbol);
      await ack(q.id,'Datenweg geladen');
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
      stopLiveAnalysisAuto(chatId);
      const textMessageId=(Array.isArray(q.message?.photo)&&q.message.photo.length>0)?null:messageId;
      await showMarket(chatId,textMessageId,a.symbol,sessions.get(String(chatId))?.live === true);
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
    if (a.kind === 'FLOW_RADAR') {
      stopLiveAnalysisAuto(chatId);
      const textMessageId=(Array.isArray(q.message?.photo)&&q.message.photo.length>0)?null:messageId;
      await showFlowRadar(chatId,textMessageId,a.symbol);
      await ack(q.id,'Flow Radar geladen');
      return;
    }
    if (a.kind === 'FORECAST_ACCURACY') {
      stopLiveAnalysisAuto(chatId);
      const textMessageId=(Array.isArray(q.message?.photo)&&q.message.photo.length>0)?null:messageId;
      await showForecastAccuracy(chatId,textMessageId,a.scope==='ALL'?null:a.symbol);
      await ack(q.id,'Forecast Accuracy geladen');
      return;
    }

    if (a.kind === 'STRUCTURE_EVENTS') {
      stopLiveAnalysisAuto(chatId);
      const textMessageId=(Array.isArray(q.message?.photo)&&q.message.photo.length>0)?null:messageId;
      await showStructureEvents(chatId,textMessageId,a.symbol);
      await ack(q.id,'Structure Events geladen');
      return;
    }

    if (a.kind === 'LIQ_MAP') {
      const textMessageId=(Array.isArray(q.message?.photo)&&q.message.photo.length>0)?null:messageId;
      const current=sessions.get(String(chatId));
      const live=current?.view==='LIQ_MAP'?current.live===true:true;
      await showLiquidationMap(chatId,textMessageId,a.symbol,{window:a.window||'5m',live});
      await ack(q.id,'Liquidation Heatmap geladen');
      return;
    }
    if (a.kind === 'LIQ_MAP_REFRESH') {
      const textMessageId=(Array.isArray(q.message?.photo)&&q.message.photo.length>0)?null:messageId;
      const live=sessions.get(String(chatId))?.view==='LIQ_MAP'&&sessions.get(String(chatId))?.live===true;
      await showLiquidationMap(chatId,textMessageId,a.symbol,{window:a.window||'5m',live});
      await ack(q.id,'Heatmap aktualisiert');
      return;
    }
    if (a.kind === 'LIQ_MAP_LIVE') {
      const textMessageId=(Array.isArray(q.message?.photo)&&q.message.photo.length>0)?null:messageId;
      await showLiquidationMap(chatId,textMessageId,a.symbol,{window:a.window||'5m',live:a.enabled});
      await ack(q.id,a.enabled?'Heatmap Auto aktiviert':'Heatmap Auto deaktiviert');
      return;
    }
    if (a.kind === 'CONFLUENCE') {
      stopLiveAnalysisAuto(chatId);
      const textMessageId=(Array.isArray(q.message?.photo)&&q.message.photo.length>0)?null:messageId;
      await showConfluenceMap(chatId,textMessageId,a.symbol);
      await ack(q.id,'Confluence Map geladen');
      return;
    }

    if (a.kind === 'XRAY') {
      const textMessageId=(Array.isArray(q.message?.photo)&&q.message.photo.length>0)?null:messageId;
      const current=sessions.get(String(chatId));
      const live=current?.view==='XRAY'?current.live===true:true;
      await showXray(chatId,textMessageId,a.symbol,{live});
      await ack(q.id,'Market X-Ray geladen');
      return;
    }
    if (a.kind === 'XRAY_REFRESH') {
      const textMessageId=(Array.isArray(q.message?.photo)&&q.message.photo.length>0)?null:messageId;
      const live=sessions.get(String(chatId))?.view==='XRAY'&&sessions.get(String(chatId))?.live===true;
      await showXray(chatId,textMessageId,a.symbol,{live});
      await ack(q.id,'X-Ray aktualisiert');
      return;
    }
    if (a.kind === 'XRAY_LIVE') {
      const textMessageId=(Array.isArray(q.message?.photo)&&q.message.photo.length>0)?null:messageId;
      await showXray(chatId,textMessageId,a.symbol,{live:a.enabled});
      await ack(q.id,a.enabled?'X-Ray Auto aktiviert':'X-Ray Auto deaktiviert');
      return;
    }
    if (a.kind === 'MTF_MATRIX') {
      stopLiveAnalysisAuto(chatId);
      const textMessageId=(Array.isArray(q.message?.photo)&&q.message.photo.length>0)?null:messageId;
      await showMtfMatrix(chatId,textMessageId,a.symbol);
      await ack(q.id,'MTF Matrix geladen');
      return;
    }

    if (a.kind === "TRADE_REPLAY") {
      if(!symbolOk(a.symbol)){ await ack(q.id,"Unbekannter Markt"); return; }
      stopLiveAnalysisAuto(chatId);
      const textMessageId=(Array.isArray(q.message?.photo)&&q.message.photo.length>0)?null:messageId;
      await showTradeReplay(chatId,textMessageId,a.symbol);
      await ack(q.id,"Trade Replay geladen");
      return;
    }
    if (a.kind === 'SUPERCHART') {
      const isPhoto=Array.isArray(q.message?.photo)&&q.message.photo.length>0;
      const current=sessions.get(String(chatId));
      const live=current?.view==='SUPERCHART'?current.live===true:true;
      await showSuperchart(chatId,a.symbol,{mode:a.mode,interval:a.interval,messageId:isPhoto?messageId:null,edit:isPhoto,live});
      await ack(q.id,'Superchart '+a.mode);
      return;
    }
    if (String(q.data||'').startsWith('superlive:')) {
      const p=String(q.data).split(':');
      const symbol=p[1],mode=String(p[2]||'PRO').toUpperCase(),interval=String(p[3]||'5m').toLowerCase(),enabled=p[4]==='on';
      const isPhoto=Array.isArray(q.message?.photo)&&q.message.photo.length>0;
      await showSuperchart(chatId,symbol,{mode,interval,messageId:isPhoto?messageId:null,edit:isPhoto,live:enabled});
      await ack(q.id,enabled?'Superchart Auto aktiviert':'Superchart Auto deaktiviert');
      return;
    }

    if (a.kind === "CHART") {
      const isPhoto=Array.isArray(q.message?.photo)&&q.message.photo.length>0;
      const current=sessions.get(String(chatId));
      const live=current?.view==='CHART'?current.live===true:true;
      await showChart(chatId,a.symbol,a.interval,{messageId:isPhoto?messageId:null,edit:isPhoto,live});
      await ack(q.id,`Chart ${a.interval}`);
      return;
    }
    if (a.kind === "CHART_REFRESH") {
      const isPhoto=Array.isArray(q.message?.photo)&&q.message.photo.length>0;
      const live=sessions.get(String(chatId))?.live===true;
      await showChart(chatId,a.symbol,a.interval,{messageId:isPhoto?messageId:null,edit:isPhoto,live});
      await ack(q.id,'Chart aktualisiert');
      return;
    }
    if (a.kind === "CHART_LIVE") {
      const isPhoto=Array.isArray(q.message?.photo)&&q.message.photo.length>0;
      await showChart(chatId,a.symbol,a.interval,{messageId:isPhoto?messageId:null,edit:isPhoto,live:a.enabled});
      await ack(q.id,a.enabled?'Chart-Auto aktiviert':'Chart-Auto deaktiviert');
      return;
    }
    if (a.kind === "STRUCTURE") {
      stopLiveAnalysisAuto(chatId);
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
      stopLiveAnalysisAuto(chatId);
      const textMessageId=(Array.isArray(q.message?.photo)&&q.message.photo.length>0)?null:messageId;
      await showForecast(chatId,a.symbol,textMessageId);
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

if(discordToken && discordApplicationId && discordGuildId){
  discordBridge=createDiscordTelegramBridge({
    token:discordToken,
    applicationId:discordApplicationId,
    guildId:discordGuildId,
    handleUpdate:handle,
    getMissionControl:missionControlData,
    logger:console,
    autoSetup:String(process.env.DISCORD_AUTO_SETUP || '1') !== '0',
    panelRefreshMs:Math.max(30000,Number(process.env.DISCORD_PANEL_REFRESH_MS || 60000))
  });
}

const telegramUpdateDispatcher=createTelegramUpdateDispatcher({
  handle,
  timeoutMs:telegramUpdateTimeoutMs,
  onError:(err,update)=>{
    const msg=err instanceof Error?err.message:String(err);
    recordError(observability,{scope:'telegram.dispatch',message:msg});
    console.error('telegram dispatch error',JSON.stringify({
      updateId:update?.update_id??null,
      chatId:update?.message?.chat?.id??update?.callback_query?.message?.chat?.id??null,
      error:msg
    }));
  }
});
let telegramLastPollAt=null;
let telegramLastPollError=null;

async function poll() {
  while (running) {
    try {
      const updates = await tg('getUpdates',{
        offset,
        timeout:25,
        allowed_updates:['message','callback_query']
      }) || [];
      telegramLastPollAt=Date.now();
      telegramLastPollError=null;
      for (const u of updates) offset = Math.max(offset,Number(u.update_id)+1);
      await telegramUpdateDispatcher.dispatchBatch(updates);
    } catch (err) {
      telegramLastPollError=err instanceof Error?err.message:String(err);
      console.error('poll error', telegramLastPollError);
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
        if (s.view === 'CHART') await showChart(s.chatId,s.symbol,s.interval || '5m',{messageId:s.messageId,edit:true,live:true});
        else if (s.view === 'SUPERCHART') await showSuperchart(s.chatId,s.symbol,{mode:s.mode||'PRO',interval:s.interval||'5m',messageId:s.messageId,edit:true,live:true});
        else if (s.view === 'XRAY') await showXray(s.chatId,s.messageId,s.symbol,{live:true});
        else if (s.view === 'LIQ_MAP') await showLiquidationMap(s.chatId,s.messageId,s.symbol,{window:s.interval || '5m',live:true});
        else if (s.view === 'TCX') await showTcx(s.chatId,s.messageId,s.symbol);
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

async function maintainMarketFabric(){
  if(!marketFabric?.healthy) return;
  if(Date.now()-marketFabricLastMaintenanceAt<marketFabricMaintenanceMs) return;
  marketFabricLastMaintenanceAt=Date.now();
  marketFabricMaintenanceQueue=marketFabricMaintenanceQueue.then(async()=>{
    let storagePressure=await inspectStoragePressure({
      dataDir:persistenceDataDir,
      warnFreeBytes:storageWarnFreeBytes,
      criticalFreeBytes:storageCriticalFreeBytes
    });
    const configuredRotateBytes=Math.max(16*1024*1024,Number(process.env.TCX_MARKET_FABRIC_ROTATE_BYTES||80*1024*1024));
    let coldTier=null;
    if(marketFabricColdStore.enabled){
      try{
        coldTier=await offloadMarketFabricArchive({
          filePath:marketFabricFile,
          coldStore:marketFabricColdStore,
          maxLocalBytes:marketFabricArchiveBudgetBytes,
          targetLocalBytes:marketFabricColdTargetBytes,
          maxSegmentsPerRun:marketFabricColdMaxSegmentsPerRun
        });
        if(coldTier.offloadedSegments>0||coldTier.verifiedExisting>0){
          console.info('[TCX_MARKET_FABRIC_COLD_TIER]',JSON.stringify({...coldTier,phase:'maintenance'}));
        }
      }catch(err){
        console.error('[TCX_MARKET_FABRIC_COLD_TIER_FAILED]',JSON.stringify({
          phase:'maintenance',
          error:err instanceof Error?err.message:String(err),
          provider:marketFabricColdStore.summary?.()||null,
          destructiveRetention:false
        }));
      }
    }
    if(storagePressure.state==='CRITICAL'){
      storagePressure=await inspectStoragePressure({
        dataDir:persistenceDataDir,
        warnFreeBytes:storageWarnFreeBytes,
        criticalFreeBytes:storageCriticalFreeBytes
      });
      if(storagePressure.state==='CRITICAL'){
        console.error('[TCX_MARKET_FABRIC_MAINTENANCE_DEFERRED]',JSON.stringify({
          ...storagePressure,
          reason:'CRITICAL_STORAGE_NO_TEMP_FILE_RISK',
          archiveBudgetBytes:marketFabricArchiveBudgetBytes,
          coldTier,
          destructiveRetention:false
        }));
        return;
      }
    }
    const pressureRotateBytes=storagePressure.state==='CRITICAL'
      ?16*1024*1024
      :storagePressure.state==='WARN'
        ?32*1024*1024
        :configuredRotateBytes;
    const effectiveRotateBytes=Math.min(configuredRotateBytes,pressureRotateBytes);
    if(storagePressure.state!=='NORMAL'){
      console.warn('[TCX_STORAGE_PRESSURE]',JSON.stringify({
        ...storagePressure,
        phase:'market-fabric-maintenance',
        configuredRotateBytes,
        effectiveRotateBytes,
        destructiveRetention:false
      }));
    }

    let rotation={rotated:false,reason:'NOT_ATTEMPTED'};
    marketFabricAppendQueue=marketFabricAppendQueue.then(async()=>{
      if(!marketFabric?.healthy) return {rotated:false,reason:'FABRIC_UNHEALTHY'};
      rotation=await rotateVerifiedMarketFabric({
        filePath:marketFabricFile,
        maxBytes:effectiveRotateBytes,
        verification:marketFabric.verification
      });
      if(rotation.rotated){
        console.info('[TCX_MARKET_FABRIC_RUNTIME_ROTATED]',JSON.stringify({
          lastSeq:rotation.lastSeq,
          archivedBytes:rotation.archivedBytes,
          segment:rotation.archivedSegment
        }));
        marketFabric=await openMarketDataFabric(marketFabricFile,{maxInMemoryEvents:marketFabricMaxMemoryEvents});
      }else if(rotation.reason==='VERIFICATION_STALE'){
        console.error('[TCX_MARKET_FABRIC_ROTATION_BLOCKED_STALE_VERIFICATION]',JSON.stringify(rotation));
      }
      return rotation;
    });
    rotation=await marketFabricAppendQueue;

    const archive=await archiveMarketFabricSegments({
      filePath:marketFabricFile,
      maxArchivedBytes:marketFabricArchiveBudgetBytes,
      migrateExisting:storagePressure.state==='NORMAL',
      maxMigrationsPerRun:storagePressure.state==='NORMAL'?1:0
    });
    marketFabricArchiveBudgetBlocked=archive.budgetBlocked===true||archive.budgetExceeded===true;
    if(rotation.rotated||archive.migratedSegments||archive.recompressedSegments||archive.budgetBlocked||archive.budgetExceeded){
      console.info('[TCX_MARKET_FABRIC_RUNTIME_ARCHIVE]',JSON.stringify({
        ...archive,
        coldTier,
        writeAdmission:marketFabricArchiveBudgetBlocked?'BLOCKED':'ALLOWED'
      }));
    }
  }).catch(err=>console.error('market fabric maintenance error',err instanceof Error?err.message:String(err)));
  await marketFabricMaintenanceQueue;
}

async function marketFabricMaintenanceWatcher(){while(running){await sleep(marketFabricMaintenanceMs);await maintainMarketFabric();}}

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
                'Trigger: '+result.message
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
    if(servingMemoryPressure().pressured) continue;
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

async function shadowPortfolioWatcher(){
  while(running){
    await sleep(shadowPortfolioWatchMs);
    if(!shadowPortfolioHealthy||!shadowOmsHealthy) continue;
    if(servingMemoryPressure().pressured) continue;
    const started=Date.now();
    let changed=false,opened=0,closed=0;
    try{
      const reconciled=reconcileShadowPortfolioEntries(shadowPortfolioLedger,shadowOrders,{now:Date.now()});
      if(reconciled.changed){
        shadowPortfolioLedger=reconciled.ledger;
        changed=true;
        opened+=reconciled.added;
        if(auditLedger.healthy){
          await appendInstitutionalAudit('TCX_SHADOW_PORTFOLIO_OPEN',{
            version:SHADOW_PORTFOLIO_LEDGER_VERSION,
            at:Date.now(),
            opened:reconciled.added,
            execution:'SHADOW_ONLY',
            canExecuteLive:false
          });
        }
      }

      const openPositions=(shadowPortfolioLedger.positions||[]).filter(p=>p.status==='OPEN');
      const symbols=[...new Set(openPositions.map(p=>p.symbol))];
      const books=new Map();
      for(const symbol of symbols){
        try{ books.set(symbol,await fetchExecutionBook(symbol)); }
        catch(err){
          recordError(observability,{scope:'shadow_portfolio.book',message:err instanceof Error?err.message:String(err)});
        }
      }

      for(const current of [...(shadowPortfolioLedger.positions||[])]){
        if(current.status!=='OPEN') continue;
        const book=books.get(current.symbol);
        if(!book) continue;
        const marked=markShadowPosition(current,book,{at:Number(book.availableAt||Date.now()),feeBps:shadowTakerFeeBps});
        if(marked.changed){
          shadowPortfolioLedger=replaceShadowPortfolioPosition(shadowPortfolioLedger,marked.position);
          changed=true;
        }
        if(marked.trigger){
          const academyBefore=evaluateShadowCapitalAcademy(shadowPortfolioLedger,{asOf:Number(book.availableAt||Date.now()),timeZone:shadowStatsTimeZone});
          const closedPosition=closeShadowPosition(marked.position,{reason:marked.trigger,at:Number(book.availableAt||Date.now())});
          shadowPortfolioLedger=replaceShadowPortfolioPosition(shadowPortfolioLedger,closedPosition);
          changed=true;closed++;
          if(String(closedPosition.entryMode||'').toUpperCase()==='COVERAGE_PROBE'){
            const bootstrap=recordCoverageProbeCalibration(forecastRuntime,{position:closedPosition,closeReason:marked.trigger,resolvedPrice:Number(book.mid)});
            if(bootstrap.recorded){
              await persistForecastRuntime('coverage-bootstrap-calibration');
              console.log('coverage bootstrap outcome learned',JSON.stringify({
                symbol:closedPosition.symbol,horizonId:closedPosition.horizonId,
                calibrationId:bootstrap.id,quality:bootstrap.quality,
                historyRows:forecastRuntime.engine.calibration.rows.length,
                execution:'SHADOW_ONLY',canExecuteLive:false
              }));
            }
          }
          const academyAfter=evaluateShadowCapitalAcademy(shadowPortfolioLedger,{asOf:Number(closedPosition.closedAt||Date.now()),timeZone:shadowStatsTimeZone});
          if(auditLedger.healthy&&academyAfter.achievedLevel!==academyBefore.achievedLevel){
            await appendInstitutionalAudit('TCX_SHADOW_ACADEMY_STAGE_CHANGE',{
              version:SHADOW_CAPITAL_ACADEMY_VERSION,
              at:Number(closedPosition.closedAt||Date.now()),
              fromLevel:academyBefore.achievedLevel,
              fromStage:academyBefore.activeStage,
              toLevel:academyAfter.achievedLevel,
              toStage:academyAfter.activeStage,
              progress:academyAfter.stageProgress,
              triggerPositionId:closedPosition.positionId,
              execution:'SHADOW_ONLY',
              canExecuteLive:false
            });
          }
          if(auditLedger.healthy){
            await appendInstitutionalAudit('TCX_SHADOW_POSITION_CLOSED',{
              version:SHADOW_PORTFOLIO_LEDGER_VERSION,
              at:closedPosition.closedAt,
              position:{
                positionId:closedPosition.positionId,
                entryOrderId:closedPosition.entryOrderId,
                symbol:closedPosition.symbol,
                side:closedPosition.side,
                closeReason:closedPosition.closeReason,
                entryPrice:closedPosition.entryPrice,
                exitPrice:closedPosition.exitPrice,
                realizedNetPnlQuote:closedPosition.realizedNetPnlQuote,
                realizedReturnPct:closedPosition.realizedReturnPct,
                openedAt:closedPosition.openedAt,
                closedAt:closedPosition.closedAt
              },
              exitModel:SHADOW_PORTFOLIO_CAPABILITIES.exitModel,
              execution:'SHADOW_ONLY',
              canExecuteLive:false
            });
          }
          console.log('auto shadow position closed',JSON.stringify({
            symbol:closedPosition.symbol,
            side:closedPosition.side,
            reason:closedPosition.closeReason,
            pnlQuote:closedPosition.realizedNetPnlQuote,
            returnPct:closedPosition.realizedReturnPct,
            execution:'SHADOW_ONLY'
          }));
        }
      }

      if(changed) await persistShadowPortfolio('watcher');
      const summary=shadowPortfolioSummary(shadowPortfolioLedger,{asOf:Date.now()});
      recordOperation(observability,{name:'shadow_portfolio_watch',ok:true,latencyMs:Date.now()-started,error:null});
      if(opened||closed){
        console.log('shadow portfolio cycle',JSON.stringify({
          opened,closed,openPositions:summary.openPositions,closedTrades:summary.closedTrades,
          netPnlQuote:summary.netPnlQuote,equityQuote:summary.equityQuote,
          academyStage:evaluateShadowCapitalAcademy(shadowPortfolioLedger,{asOf:Date.now(),timeZone:shadowStatsTimeZone}).activeStage,
          academyLevel:evaluateShadowCapitalAcademy(shadowPortfolioLedger,{asOf:Date.now(),timeZone:shadowStatsTimeZone}).achievedLevel
        }));
      }
    }catch(err){
      const msg=err instanceof Error?err.message:String(err);
      recordError(observability,{scope:'shadow_portfolio.watch',message:msg});
      recordOperation(observability,{name:'shadow_portfolio_watch',ok:false,latencyMs:Date.now()-started,error:msg});
      console.error('shadow portfolio watcher error',msg);
    }
  }
}

async function strategyLeagueWatcher(){
  while(running){
    await sleep(strategyLeagueWatchMs);
    if(!strategyLeagueEnabled||!strategyLeagueHealthy||!shadowOmsHealthy) continue;
    if(servingMemoryPressure().pressured) continue;
    const started=Date.now();
    let changed=false,opened=0,closed=0;
    try{
      const reconciled=reconcileStrategyLeagueEntries(strategyLeagueLedger,shadowOrders,{now:Date.now()});
      if(reconciled.changed){
        strategyLeagueLedger=reconciled.ledger;
        changed=true;
        opened+=reconciled.added;
      }

      const openPositions=(strategyLeagueLedger.positions||[]).filter(p=>p.status==='OPEN');
      const symbols=[...new Set(openPositions.map(p=>p.symbol))];
      const books=new Map();
      for(const symbol of symbols){
        try{ books.set(symbol,await fetchExecutionBook(symbol)); }
        catch(err){
          recordError(observability,{scope:'strategy_league.book',message:err instanceof Error?err.message:String(err)});
        }
      }

      for(const current of [...(strategyLeagueLedger.positions||[])]){
        if(current.status!=='OPEN') continue;
        const book=books.get(current.symbol);
        if(!book) continue;
        const marked=markStrategyLeaguePosition(current,book,{
          at:Number(book.availableAt||Date.now()),
          feeBps:shadowTakerFeeBps
        });
        if(marked.changed){
          strategyLeagueLedger=replaceStrategyLeaguePosition(strategyLeagueLedger,marked.position);
          changed=true;
        }
        if(marked.trigger){
          const finished=closeStrategyLeaguePosition(marked.position,{
            reason:marked.trigger,
            at:Number(book.availableAt||Date.now())
          });
          strategyLeagueLedger=replaceStrategyLeaguePosition(strategyLeagueLedger,finished);
          changed=true;closed++;
          if(auditLedger.healthy){
            await appendInstitutionalAudit('TCX_STRATEGY_LEAGUE_POSITION_CLOSED',{
              version:SHADOW_STRATEGY_LEAGUE_VERSION,
              at:finished.closedAt,
              strategyId:finished.leagueStrategyId,
              positionId:finished.positionId,
              symbol:finished.symbol,
              side:finished.side,
              horizonId:finished.horizonId,
              closeReason:finished.closeReason,
              realizedNetPnlQuote:finished.realizedNetPnlQuote,
              realizedReturnPct:finished.realizedReturnPct,
              execution:'SHADOW_ONLY',
              canExecuteLive:false
            });
          }
        }
      }

      if(changed) await persistStrategyLeague('watcher');
      const summary=strategyLeagueSummary(strategyLeagueLedger,{asOf:Date.now()});
      recordOperation(observability,{name:'strategy_league_watch',ok:true,latencyMs:Date.now()-started,error:null});
      if(opened||closed){
        console.log('strategy league cycle',JSON.stringify({
          opened,closed,
          allocationMode:summary.allocationMode,
          eligibleStrategies:summary.eligibleStrategies,
          leader:summary.strategies[0]?.strategyId||null,
          leaderWeight:summary.strategies[0]?.allocationWeight||0,
          execution:'SHADOW_ONLY'
        }));
      }
    }catch(err){
      const msg=err instanceof Error?err.message:String(err);
      recordError(observability,{scope:'strategy_league.watch',message:msg});
      recordOperation(observability,{name:'strategy_league_watch',ok:false,latencyMs:Date.now()-started,error:msg});
      console.error('strategy league watcher error',msg);
    }
  }
}

async function venueQualityWatcher() {
  const horizons=[60_000,300_000,900_000];
  while(running){
    await sleep(vqmWatchMs);
    if(!venueQualityHealthy || !venueQualityRecords.length) continue;
    if(servingMemoryPressure().pressured) continue;
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

async function appendResearchDataPlaneQueued(inputs,reason='capture'){
  if(!researchDataPlane.healthy) return {ok:false,appended:0,duplicates:0,reason:'RDP_UNHEALTHY'};
  const job=researchDataPlaneAppendQueue.then(async()=>{
    const started=Date.now();
    const admission=await storageWriteAdmission('RESEARCH_DATA_PLANE');
    if(!admission.allowed){
      return {ok:false,appended:0,duplicates:0,governed:0,restrictedSources:0,governanceFingerprint:null,reason:admission.reason,storagePressure:admission.state};
    }
    const nextGovernance=structuredClone(researchDataGovernance);
    refreshResearchSourceFreshness(nextGovernance,{
      now:started,
      monitorStartedAt:researchGovernanceMonitorStartedAt
    });
    const governed=(Array.isArray(inputs)?inputs:[])
      .map(input=>governResearchSnapshot(nextGovernance,input,{evaluatedAt:started}))
      .filter(Boolean);
    const result=await appendResearchDataPlane(researchDataPlane,governed);
    researchDataGovernance=nextGovernance;
    try{
      await saveResearchDataGovernance(researchGovernanceFile,researchDataGovernance);
      researchGovernanceHealthy=true;
      researchGovernanceLastError=null;
    }catch(err){
      researchGovernanceHealthy=false;
      researchGovernanceLastError=err instanceof Error?err.message:String(err);
      recordError(observability,{scope:'research_data_governance.persistence',message:researchGovernanceLastError});
    }
    const governanceSummary=researchDataGovernanceSummary(researchDataGovernance,{now:started});
    recordOperation(observability,{
      name:'research_data_plane_append',
      ok:true,
      latencyMs:Date.now()-started,
      error:null
    });
    return {
      ok:true,
      appended:result.appended.length,
      duplicates:result.duplicates,
      governed:governed.length,
      restrictedSources:governanceSummary.quarantinedSources.length,
      governanceFingerprint:governanceSummary.fingerprint
    };
  });
  researchDataPlaneAppendQueue=job.catch(err=>{
    const msg=err instanceof Error?err.message:String(err);
    recordError(observability,{scope:'research_data_plane.append',message:msg});
    console.error('research data plane append error',reason,msg);
  });
  return job;
}

async function onchainResearchStartupProbe(){
  const symbols=['BTCUSDT','ETHUSDT','SOLUSDT'];
  const results=[];
  for(const symbol of symbols){
    try{
      const s=await onchainResearchProvider.fetchAssetSnapshot(symbol,{cacheMs:20000});
      results.push({
        symbol,
        ok:s?.ok===true,
        chain:s?.chain||null,
        features:onchainSnapshotToExtraFeatures(s).length,
        error:s?.error||s?.reason||null
      });
    }catch(err){
      results.push({symbol,ok:false,chain:null,features:0,error:err instanceof Error?err.message:String(err)});
    }
  }
  console.log('onchain research startup probe',JSON.stringify(results));
  return results;
}

async function syncFeatureResearch(reason='update'){
  try{
    const beforeStatus=featureResearchState?.status||'UNINITIALIZED';
    const expectedFeatureExperimentIds=new Set(activeFeatureResearchFeatures.map(x=>x.id));
    const currentFeatureExperimentIds=new Set((featureResearchState?.experiments||[]).map(x=>x.id));
    const grammarExpanded=[...expectedFeatureExperimentIds].some(id=>!currentFeatureExperimentIds.has(id));
    if(featureResearchState?.status==='COLLECTING_SEED'&&grammarExpanded){
      featureResearchState=null;
    }
    if(!featureResearchState){
      featureResearchState=createFeatureResearchRound({
        journalEntries:forecastRuntime.journal.all(),
        incumbentConfig:forecastRuntime.engine.configSnapshot(),
        features:activeFeatureResearchFeatures,
        generationNumber:1,
        now:Date.now()
      });
    }else{
      featureResearchState=advanceFeatureResearchRound(featureResearchState,{
        journalEntries:forecastRuntime.journal.all(),
        incumbentConfig:forecastRuntime.engine.configSnapshot(),
        now:Date.now(),
        minimumTrainCases:40
      });
    }
    await saveFeatureResearch(featureResearchFile,featureResearchState);
    const summary=featureResearchSummary(featureResearchState);
    console.log('feature research sync',JSON.stringify({
      reason,
      status:summary.status,
      generationNumber:summary.generationNumber,
      experiments:summary.experiments.length,
      supported:summary.supported.length,
      changed:beforeStatus!==summary.status
    }));
    return summary;
  }catch(err){
    const msg=err instanceof Error?err.message:String(err);
    recordError(observability,{scope:'forecast_feature_research',message:msg});
    console.error('feature research error',reason,msg);
    return null;
  }
}

async function autoLearnForecastWatcher() {
  await sleep(15000);
  while(running) {
    const started=Date.now();
    let issued=0,skipped=0,failed=0,deferred=0;
    let memoryPressure=false;
    if(autoLearnEnabled&&forecastRuntime.healthy){
      while(running&&activeBackgroundResearchJob) await sleep(250);
      if(!running) break;
      activeBackgroundResearchJob='autolearn';
      try{
      for(const symbol of autoLearnSymbols){
        if(!running) break;
        if(issued>=autoLearnMaxIssuedPerSweep){ deferred++; break; }
        const memory=process.memoryUsage();
        const heapUsedMb=Math.round(memory.heapUsed/1024/1024);
        const rssMb=Math.round(memory.rss/1024/1024);
        const externalMb=Math.round(memory.external/1024/1024);
        const memoryAdmission=evaluateAutoLearnMemoryAdmission({
          phase:'ISSUE',
          heapUsedMb,
          rssMb,
          externalMb,
          issueHeapMb:autoLearnHeapHeadroomMb,
          issueRssMb:autoLearnRssHeadroomMb,
          issueExternalMb:autoLearnExternalHeadroomMb,
          resumeHeapMb:autoLearnResumeHeapMb,
          resumeRssMb:autoLearnResumeRssMb,
          resumeExternalMb:autoLearnResumeExternalMb
        });
        // Each issuance may scan research history and write bounded state.
        // Leave headroom for transient parsing/serialization and native/buffer
        // allocations instead of letting background learning pressure serving.
        if(!memoryAdmission.allowed){
          deferred++;
          memoryPressure=true;
          console.warn('autolearn forecast deferred for memory headroom',JSON.stringify({
            symbol,
            ...memoryAdmission.memory,
            exceeded:memoryAdmission.exceeded,
            historyRows:forecastRuntime.engine.historySize(),
            threshold:memoryAdmission.limits
          }));
          break;
        }
        try{
          const latest=latestInstitutionalForecast(forecastRuntime,symbol);
          const lastAt=Math.max(Number(latest?.generatedAt||0),Number(latest?.asOf||0));
          if(lastAt&&Date.now()-lastAt<autoLearnForecastMs){
            skipped++;
            continue;
          }
          const result=await showForecast(null,symbol,null,{silent:true,source:'TCX_AUTOLEARN_V1'});
          if(result?.ok){
            issued++;
            console.log('autolearn forecast issued',JSON.stringify({
              symbol,
              gate:result.issuance?.gate||'UNKNOWN',
              admissionReasons:(result.issuance?.admission?.reasons||[]).slice(0,6),
              safetyState:result.issuance?.trace?.safety?.state||'UNKNOWN',
              safetyReasons:(result.issuance?.trace?.safety?.reasons||[]).slice(0,4),
              probabilityDisplayAllowed:result.issuance?.probabilityDisplayAllowed===true,
              horizonGates:(result.issuance?.forecast?.horizons||[]).map(h=>({
                id:h.horizonId,gate:h.gate,calibration:h.calibration?.status||'UNKNOWN',
                direction:h.direction,expectedReturn:h.expectedReturn,
                reasons:(h.reasons||[]).slice(0,3)
              })),
              dataQuality:result.dataQuality,
              derivativesFeatures:result.derivativesFeatureCount||0,
              derivativesSources:result.derivativesSourceCount||0,
              liquidationFeatures:result.liquidationFeatureCount||0,
              liquidationReady5m:result.liquidationReady5m===true,
              onchainFeatures:result.onchainFeatureCount||0,
              onchainChain:result.onchainChain||null,
              entityFlowFeatures:result.entityFlowFeatureCount||0,
              entityFlowNet5m:Number.isFinite(result.entityFlowNet5m)?result.entityFlowNet5m:null,
              entityFlowBaselineSamples:result.entityFlowBaselineSamples||0,
              walletFeatures:result.walletFeatureCount||0,
              walletCohorts:result.walletCohorts||0,
              intelligenceFeatures:result.intelligenceFeatureCount||0,
              intelligenceFeatureIds:(result.intelligenceFeatureIds||[]).slice(0,12),
              researchDataPlaneSeq:result.researchDataPlaneSeq||0,
              researchDataPlaneFeatures:result.researchDataPlaneFeatures||0,
              researchDataPlaneAppendOk:result.researchDataPlaneAppendOk===true,
              researchGovernanceIssueCount:result.researchGovernanceIssueCount||0,
              researchGovernanceBlockedSources:result.researchGovernanceBlockedSources||0,
              researchGovernanceFingerprint:result.researchGovernanceFingerprint||null,
              researchDependencyGate:result.researchDependencyGate||'UNAVAILABLE',
              researchDependencyCoverage:result.researchDependencyCoverage||0,
              researchDependencyBlockedFeatures:result.researchDependencyBlockedFeatures||0,
              researchDependencyFingerprint:result.researchDependencyFingerprint||null,
              autoShadowTradePlaced:result.autoShadowTradePlaced===true,
              autoShadowTradeEligible:result.autoShadowTradeEligible===true,
              autoShadowTradeReason:result.autoShadowTradeReason||null,
              autoShadowOrderId:result.autoShadowOrderId||null,
              autoShadowSide:result.autoShadowSide||null,
              coverageCurriculumPlaced:result.coverageCurriculumPlaced||0,
              coverageCurriculumEligible:result.coverageCurriculumEligible||0,
              coverageCurriculumReason:result.coverageCurriculumReason||null,
              mandatoryDiscoveryPlaced:result.mandatoryDiscoveryPlaced===true,
              mandatoryDiscoveryReason:result.mandatoryDiscoveryReason||null,
              mandatoryDiscoveryMode:result.mandatoryDiscoveryMode||null,
              strategyLeaguePlaced:result.strategyLeaguePlaced||0,
              strategyLeagueEligible:result.strategyLeagueEligible||0,
              strategyLeagueAllocationMode:result.strategyLeagueAllocationMode||null,
              duplicate:result.duplicate===true
            }));
          }else{
            skipped++;
            if(result?.reason&&result.reason!=='AUTOLEARN_QUALITY_GATE'){
              console.log('autolearn forecast skipped',JSON.stringify({symbol,reason:result.reason}));
            }
          }
        }catch(err){
          failed++;
          const msg=err instanceof Error?err.message:String(err);
          recordError(observability,{scope:'forecast_runtime.autolearn',message:msg});
          console.error('autolearn forecast error',symbol,msg,err instanceof Error?err.stack:'');
        }
        if(issued>0){
          const postMemory=process.memoryUsage();
          const postAdmission=evaluateAutoLearnMemoryAdmission({
            phase:'ISSUE',
            heapUsedMb:Math.round(postMemory.heapUsed/1024/1024),
            rssMb:Math.round(postMemory.rss/1024/1024),
            externalMb:Math.round(postMemory.external/1024/1024),
            issueHeapMb:autoLearnHeapHeadroomMb,
            issueRssMb:autoLearnRssHeadroomMb,
            issueExternalMb:autoLearnExternalHeadroomMb,
            resumeHeapMb:autoLearnResumeHeapMb,
            resumeRssMb:autoLearnResumeRssMb,
            resumeExternalMb:autoLearnResumeExternalMb
          });
          if(!postAdmission.allowed){
            deferred++;
            memoryPressure=true;
            console.warn('autolearn post-issuance memory pressure',JSON.stringify({
              symbol,
              ...postAdmission.memory,
              exceeded:postAdmission.exceeded,
              threshold:postAdmission.limits
            }));
            break;
          }
        }
        await sleep(autoLearnInterIssueMs);
      }
      }finally{
        if(activeBackgroundResearchJob==='autolearn') activeBackgroundResearchJob=null;
      }
    }
    recordOperation(observability,{
      name:'forecast_autolearn_cycle',
      ok:failed===0,
      latencyMs:Date.now()-started,
      error:failed?failed+' symbol(s) failed':null
    });
    if(issued||failed||deferred){
      console.log('autolearn cycle',JSON.stringify({
        issued,skipped,failed,deferred,
        symbols:autoLearnSymbols.length,
        nextSweepMs:autoLearnSweepMs,
        forecastIntervalMs:autoLearnForecastMs,
        maxIssuedPerSweep:autoLearnMaxIssuedPerSweep,
        interIssueMs:autoLearnInterIssueMs,
        memory:(()=>{const m=process.memoryUsage();return {
          heapUsedMb:Math.round(m.heapUsed/1024/1024),
          heapTotalMb:Math.round(m.heapTotal/1024/1024),
          rssMb:Math.round(m.rss/1024/1024),
          externalMb:Math.round(m.external/1024/1024),
          forecastHistoryRows:forecastRuntime.engine.historySize(),
          forecastJournalRows:forecastRuntime.journal.entries.length
        };})()
      }));
    }
    if(memoryPressure){
      const before=process.memoryUsage();
      console.log('autolearn memory backoff',JSON.stringify({
        delayMs:autoLearnMemoryBackoffMs,
        resumeHeapMb:autoLearnResumeHeapMb,
        resumeRssMb:autoLearnResumeRssMb,
        resumeExternalMb:autoLearnResumeExternalMb,
        heapUsedMb:Math.round(before.heapUsed/1024/1024),
        rssMb:Math.round(before.rss/1024/1024),
        externalMb:Math.round(before.external/1024/1024)
      }));
      await sleep(autoLearnMemoryBackoffMs);
      const after=process.memoryUsage();
      const resumeAdmission=evaluateAutoLearnMemoryAdmission({
        phase:'RESUME',
        heapUsedMb:Math.round(after.heapUsed/1024/1024),
        rssMb:Math.round(after.rss/1024/1024),
        externalMb:Math.round(after.external/1024/1024),
        issueHeapMb:autoLearnHeapHeadroomMb,
        issueRssMb:autoLearnRssHeadroomMb,
        issueExternalMb:autoLearnExternalHeadroomMb,
        resumeHeapMb:autoLearnResumeHeapMb,
        resumeRssMb:autoLearnResumeRssMb,
        resumeExternalMb:autoLearnResumeExternalMb
      });
      if(!resumeAdmission.allowed){
        console.warn('autolearn remains deferred after memory backoff',JSON.stringify({
          ...resumeAdmission.memory,
          exceeded:resumeAdmission.exceeded,
          threshold:resumeAdmission.limits
        }));
        await sleep(autoLearnSweepMs);
        continue;
      }
    }
    await sleep(autoLearnSweepMs);
  }
}

async function syncExperimentGovernor({evaluate=false}={}){
  if(!shadowCompetitionState||shadowCompetitionState.status!=='ACTIVE') return null;
  const cfgHash=String(shadowCompetitionState.incumbentConfigHash||sha256(forecastRuntime.engine.configSnapshot()));
  if(!experimentGovernorState){
    experimentGovernorState=createExperimentGovernor({
      competition:shadowCompetitionState,
      championConfigHash:cfgHash,
      championReleaseId:String(runtimeManifest?.releaseId||'UNAVAILABLE'),
      generationNumber:1,
      now:Date.now()
    });
    await saveExperimentGovernor(experimentGovernorFile,experimentGovernorState);
    console.log('experiment governor initialized',JSON.stringify({
      generationId:experimentGovernorState.generationId,
      generationNumber:experimentGovernorState.generationNumber,
      participants:experimentGovernorState.participants.length,
      cutoff:experimentGovernorState.dataCutoffAt
    }));
    return experimentGovernorState;
  }
  if(evaluate&&experimentGovernorState.status==='ACTIVE'){
    const before=experimentGovernorState.status;
    experimentGovernorState=evaluateExperimentGovernor(experimentGovernorState,{
      competition:shadowCompetitionState,
      now:Date.now()
    });
    await saveExperimentGovernor(experimentGovernorFile,experimentGovernorState);
    const summary=experimentGovernorSummary(experimentGovernorState);
    console.log('experiment governor evaluated',JSON.stringify({
      generationId:summary.generationId,
      status:summary.status,
      participants:summary.participantCount,
      measuring:summary.counts?.MEASURING||0,
      rejected:summary.counts?.REJECTED||0,
      promotionReviewRequired:(summary.counts?.PROMOTION_REVIEW_REQUIRED||0)+(summary.counts?.PROMOTION_CANDIDATE||0),
      changed:before!==summary.status
    }));
  }
  return experimentGovernorState;
}

async function shadowCompetitionWatcher(){
  while(running){
    const started=Date.now();
    try{
      if(shadowCompetitionEnabled&&shadowCompetitionServingWorkerEnabled&&forecastRuntime.healthy){
        const memory=process.memoryUsage();
        const heapUsedMb=Math.round(memory.heapUsed/1024/1024);
        const rssMb=Math.round(memory.rss/1024/1024);
        const externalMb=Math.round(memory.external/1024/1024);
        const admission=evaluateShadowWorkerAdmission({
          mode:shadowCompetitionWorkerMode,
          heapUsedMb,
          rssMb,
          externalMb,
          autoHeapMb:shadowCompetitionAutoHeapMb,
          autoRssMb:shadowCompetitionAutoRssMb,
          autoExternalMb:shadowCompetitionAutoExternalMb,
          hardHeapMb:300,
          hardRssMb:900,
          hardExternalMb:shadowCompetitionHardExternalMb
        });
        shadowCompetitionWorkerLastDecision={...admission,at:Date.now()};
        if(!admission.allowed){
          shadowCompetitionWorkerMemoryDeferrals++;
          console.warn('shadow competition deferred for memory headroom',JSON.stringify({
            mode:shadowCompetitionWorkerMode,
            reason:admission.reason,
            heapUsedMb,rssMb,externalMb,
            historyRows:forecastRuntime.engine.historySize(),
            limits:admission.limits
          }));
          recordOperation(observability,{name:'forecast_shadow_competition',ok:true,latencyMs:Date.now()-started,error:'DEFERRED_'+admission.reason});
          await sleep(shadowCompetitionEvalMs);
          continue;
        }
        const history=forecastRuntime.engine.historySnapshot(Number.POSITIVE_INFINITY,{limit:shadowCompetitionHistoryRows});
        const historyProgressAt=forecastHistoryProgressAt(history);
        if(shadowCompetitionLastHistoryProgressAt>0&&!forecastHistoryHasAdvanced(history,shadowCompetitionLastHistoryProgressAt)){
          shadowCompetitionWorkerNoChangeSkips++;
          shadowCompetitionWorkerLastDecision={...admission,at:Date.now(),allowed:false,reason:'NO_NEW_PIT_HISTORY',historyProgressAt};
          recordOperation(observability,{name:'forecast_shadow_competition',ok:true,latencyMs:Date.now()-started,error:'SKIPPED_NO_NEW_PIT_HISTORY'});
          await sleep(shadowCompetitionEvalMs);
          continue;
        }
        const slotWaitStarted=Date.now();
        while(running&&activeBackgroundResearchJob) await sleep(250);
        if(!running) break;
        const slotWaitMs=Date.now()-slotWaitStarted;
        activeBackgroundResearchJob='shadow-competition';

        let result=null;
        let freshAdmission=null;
        let heapBefore=0;
        try{
          const freshMemory=process.memoryUsage();
          freshAdmission=evaluateShadowWorkerAdmission({
            mode:shadowCompetitionWorkerMode,
            heapUsedMb:Math.round(freshMemory.heapUsed/1024/1024),
            rssMb:Math.round(freshMemory.rss/1024/1024),
            externalMb:Math.round(freshMemory.external/1024/1024),
            autoHeapMb:shadowCompetitionAutoHeapMb,
            autoRssMb:shadowCompetitionAutoRssMb,
            autoExternalMb:shadowCompetitionAutoExternalMb,
            hardHeapMb:300,
            hardRssMb:900,
            hardExternalMb:shadowCompetitionHardExternalMb
          });
          shadowCompetitionWorkerLastDecision={...freshAdmission,at:Date.now(),slotWaitMs};
          if(freshAdmission.allowed){
            const cfg=forecastRuntime.engine.configSnapshot();
            const releaseId=String(runtimeManifest?.releaseId||'UNAVAILABLE');
            heapBefore=Math.round(freshMemory.heapUsed/1024/1024);
            result=await runForecastShadowEvaluationWorker({
              competitionState:shadowCompetitionState,
              experimentGovernorState,
              historyRows:history,
              incumbentConfig:cfg,
              releaseId,
              minSeedRows:shadowCompetitionMinSeedRows,
              minimumTrainCases:shadowCompetitionMinTrainCases,
              maxGeneratedHypotheses:4,
              now:Date.now()
            },{
              timeoutMs:shadowCompetitionWorkerTimeoutMs,
              maxOldGenerationSizeMb:shadowCompetitionWorkerHeapMb
            });
          }
        }finally{
          if(activeBackgroundResearchJob==='shadow-competition') activeBackgroundResearchJob=null;
        }

        if(!freshAdmission?.allowed){
          shadowCompetitionWorkerMemoryDeferrals++;
          console.warn('shadow competition deferred after research-slot wait',JSON.stringify({
            mode:shadowCompetitionWorkerMode,
            reason:freshAdmission?.reason||'MEMORY_PRESSURE',
            slotWaitMs,
            memory:freshAdmission?.memory||null,
            limits:freshAdmission?.limits||null
          }));
          recordOperation(observability,{
            name:'forecast_shadow_competition',
            ok:true,
            latencyMs:Date.now()-started,
            error:'DEFERRED_AFTER_SLOT_'+String(freshAdmission?.reason||'MEMORY_PRESSURE')
          });
          await sleep(shadowCompetitionEvalMs);
          continue;
        }

        shadowCompetitionState=result.competitionState;
        experimentGovernorState=result.experimentGovernorState;
        shadowCompetitionLastHistorySize=Number(result.historyRows||history.length);
        shadowCompetitionLastHistoryProgressAt=historyProgressAt;
        shadowCompetitionWorkerRuns++;
        shadowCompetitionWorkerLastDecision={
          ...admission,
          at:Date.now(),
          allowed:true,
          reason:'WORKER_COMPLETED',
          historyProgressAt
        };

        await saveShadowCompetition(shadowCompetitionFile,shadowCompetitionState);
        if(experimentGovernorState) await saveExperimentGovernor(experimentGovernorFile,experimentGovernorState);

        if(experimentGovernorState&&modelCandidateRegistry.healthy&&auditLedger.healthy){
          const promotionReviews=await processGovernorPromotionReviews({
            governorState:experimentGovernorState,
            competitionState:shadowCompetitionState,
            registry:modelCandidateRegistry,
            auditLedger
          });
          modelPromotionReviewLastSummary={
            generationId:promotionReviews.generationId,
            candidates:promotionReviews.candidates,
            reviewed:promotionReviews.reviewed,
            holds:promotionReviews.holds,
            rejected:promotionReviews.rejected,
            promotionReady:promotionReviews.promotionReady,
            failed:promotionReviews.failed,
            at:Date.now()
          };
          if(promotionReviews.candidates>0){
            console.log('[TCX_MODEL_PROMOTION_REVIEW]',JSON.stringify({
              version:MODEL_PROMOTION_REVIEW_SERVICE_VERSION,
              registryVersion:MODEL_CANDIDATE_REGISTRY_VERSION,
              ...modelPromotionReviewLastSummary,
              automaticProductionMutation:false,
              execution:'SHADOW_ONLY',
              canExecute:false
            }));
          }
        }

        const summary=result.summary||shadowCompetitionSummary(shadowCompetitionState);
        const gov=result.governorSummary||null;
        console.log('shadow competition worker completed',JSON.stringify({
          workerVersion:FORECAST_SHADOW_EVALUATION_WORKER_VERSION,
          historyRows:result.historyRows,
          initialized:result.flags?.initialized===true,
          refreshed:result.flags?.refreshed===true,
          evaluated:result.flags?.evaluated===true,
          governorCreated:result.flags?.governorCreated===true,
          governorEvaluated:result.flags?.governorEvaluated===true,
          oosRows:summary.competition?.oosRows||0,
          evaluatedCandidates:summary.competition?.evaluatedCandidates||0,
          governorStatus:gov?.status||experimentGovernorState?.status||null,
          durationMs:Date.now()-started,
          mainHeapBeforeMb:heapBefore,
          mainHeapAfterMb:Math.round(process.memoryUsage().heapUsed/1024/1024),
          mode:shadowCompetitionWorkerMode,
          historyProgressAt,
          configuredHistoryRows:shadowCompetitionHistoryRows,
          workerRuns:shadowCompetitionWorkerRuns,
          slotWaitMs,
          promotionReview:modelPromotionReviewLastSummary
        }));
      }
      recordOperation(observability,{name:'forecast_shadow_competition',ok:true,latencyMs:Date.now()-started});
    }catch(err){
      const msg=err instanceof Error?err.message:String(err);
      recordError(observability,{scope:'forecast_shadow_competition.worker',message:msg});
      recordOperation(observability,{name:'forecast_shadow_competition',ok:false,latencyMs:Date.now()-started,error:msg});
      console.error('shadow competition worker error',JSON.stringify({
        error:msg,
        durationMs:Date.now()-started,
        mainHeapMb:Math.round(process.memoryUsage().heapUsed/1024/1024)
      }));
    }
    await sleep(shadowCompetitionEvalMs);
  }
}

async function forecastOutcomeWatcher() {
  while(running) {
    await sleep(forecastOutcomeCheckMs);
    if(!forecastRuntime.healthy) continue;

    const slotWaitStarted=Date.now();
    while(running&&activeBackgroundResearchJob) await sleep(250);
    if(!running) break;
    const slotWaitMs=Date.now()-slotWaitStarted;
    activeBackgroundResearchJob='outcome-watch';

    try {
      const started=Date.now();
      const beforeMemory=process.memoryUsage();
      const admission=evaluateAutoLearnMemoryAdmission({
        phase:'ISSUE',
        heapUsedMb:Math.round(beforeMemory.heapUsed/1024/1024),
        rssMb:Math.round(beforeMemory.rss/1024/1024),
        externalMb:Math.round(beforeMemory.external/1024/1024),
        issueHeapMb:autoLearnHeapHeadroomMb,
        issueRssMb:autoLearnRssHeadroomMb,
        issueExternalMb:autoLearnExternalHeadroomMb,
        resumeHeapMb:autoLearnResumeHeapMb,
        resumeRssMb:autoLearnResumeRssMb,
        resumeExternalMb:autoLearnResumeExternalMb
      });
      if(!admission.allowed){
        console.warn('forecast outcome watch deferred for memory headroom',JSON.stringify({
          slotWaitMs,
          ...admission.memory,
          exceeded:admission.exceeded,
          threshold:admission.limits
        }));
        recordOperation(observability,{
          name:'forecast_outcome_watch',
          ok:true,
          latencyMs:Date.now()-started,
          error:'DEFERRED_MEMORY_PRESSURE'
        });
        continue;
      }

      const pending=forecastRuntime.journal.pending();
      if(!pending.length) continue;

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

      const postMemory=process.memoryUsage();
      const postAdmission=evaluateAutoLearnMemoryAdmission({
        phase:'ISSUE',
        heapUsedMb:Math.round(postMemory.heapUsed/1024/1024),
        rssMb:Math.round(postMemory.rss/1024/1024),
        externalMb:Math.round(postMemory.external/1024/1024),
        issueHeapMb:autoLearnHeapHeadroomMb,
        issueRssMb:autoLearnRssHeadroomMb,
        issueExternalMb:autoLearnExternalHeadroomMb,
        resumeHeapMb:autoLearnResumeHeapMb,
        resumeRssMb:autoLearnResumeRssMb,
        resumeExternalMb:autoLearnResumeExternalMb
      });

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
          auditFailures,
          slotWaitMs,
          postMemory:postAdmission.memory
        }));
        if(postAdmission.allowed){
          await syncFeatureResearch('resolved-outcomes');
        }else{
          console.warn('resolved-outcome feature research deferred for memory headroom',JSON.stringify({
            ...postAdmission.memory,
            exceeded:postAdmission.exceeded,
            threshold:postAdmission.limits
          }));
        }
      }
    } finally {
      if(activeBackgroundResearchJob==='outcome-watch') activeBackgroundResearchJob=null;
    }
  }
}

async function episodeWatcher() {
  while(running) {
    if(servingMemoryPressure().pressured){ await sleep(30000); continue; }
    while(running&&activeBackgroundResearchJob) await sleep(250);
    if(!running) break;
    activeBackgroundResearchJob='episode-sweep';
    try{
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
    }finally{
      if(activeBackgroundResearchJob==='episode-sweep') activeBackgroundResearchJob=null;
    }
    await sleep(episodeSweepMs);
  }
}

function currentPersistenceCompatibility(){
  return evaluatePersistenceCompatibility({
    stores:{
      USER_STATE:{
        healthy:persistenceHealthy,
        recoveredFromCorrupt:loadedState.recoveredFromCorrupt,
        migrationNeeded:loadedState.migrationNeeded,
        loadedSchema:loadedState.loadedSchemaVersion
      },
      EPISODE_MEMORY:{
        healthy:episodePersistenceHealthy,
        recoveredFromCorrupt:loadedEpisodeMemory.recoveredFromCorrupt
      },
      EVIDENCE_HISTORY:{
        healthy:evidenceHistoryHealthy,
        recoveredFromCorrupt:loadedEvidenceHistory.recoveredFromCorrupt
      },
      FORECAST_RUNTIME:{
        healthy:forecastRuntime.healthy,
        recoveredFromCorrupt:forecastRuntime.recoveredFromCorrupt
      },
      SHADOW_OMS:{
        healthy:shadowOmsHealthy,
        recoveredFromCorrupt:loadedShadowOms.recoveredFromCorrupt
      },
      SHADOW_PORTFOLIO:{
        healthy:shadowPortfolioHealthy,
        recoveredFromCorrupt:loadedShadowPortfolio.recoveredFromCorrupt
      },
      VENUE_QUALITY_MEMORY:{
        healthy:venueQualityHealthy,
        recoveredFromCorrupt:loadedVenueQuality.recoveredFromCorrupt
      },
      AUDIT_LEDGER:{healthy:auditLedger.healthy},
      MARKET_DATA_FABRIC:{healthy:marketFabric.healthy},
      RELEASE_REGISTRY:{healthy:releaseRegistry.healthy},
      MODEL_CANDIDATE_REGISTRY:{healthy:modelCandidateRegistry.healthy,recoveredFromCorrupt:false},
      RESEARCH_DATA_PLANE:{healthy:researchDataPlane.healthy},
      RESEARCH_DATA_GOVERNANCE:{
        healthy:researchGovernanceHealthy,
        recoveredFromCorrupt:researchDataGovernance.recoveredFromCorrupt===true
      }
    },
    localFilePersistence:true,
    replicaCount:configuredReplicaCount
  });
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
    persistenceCompatibility:currentPersistenceCompatibility(),
    localFilePersistence:true,
    replicaCount:configuredReplicaCount
  });
}

function missionControlData(){
 const health={
  ok:true,
  operationalReadiness:currentOperationalReadiness(),
  institutionalKernel:{ledgerHealthy:auditLedger.healthy,execution:'SHADOW_ONLY',canExecute:false},
  marketDataFabric:{healthy:marketFabric.healthy,events:marketFabric.events.length},
  shadowOms:{healthy:shadowOmsHealthy,total:shadowOrders.length,active:shadowOrders.filter(o=>['ACTIVE','PARTIALLY_FILLED'].includes(o.status)).length,filled:shadowOrders.filter(o=>o.status==='FILLED').length},
  institutionalForecastRuntime:institutionalForecastRuntimeSummary(forecastRuntime),
  episodeMemory:{total:episodes.length,healthy:episodePersistenceHealthy},
  evidenceHistory:{total:evidenceRecords.length,healthy:evidenceHistoryHealthy},
  telegramPolling:{lastPollAt:telegramLastPollAt,lastPollError:telegramLastPollError},
  discordBridge:discordBridge?discordBridge.snapshot():{enabled:false,reason:'NOT_CONFIGURED'}
 };
 const portfolio=shadowPortfolioSummary(shadowPortfolioLedger,{asOf:Date.now()});
 const visibleShadowPositions=(shadowPortfolioLedger?.positions||[]).filter(p=>!['CHALLENGER','ABSTAIN_PROBE','COVERAGE_PROBE'].includes(String(p?.entryMode||'STANDARD').toUpperCase()));
 const openPositions=visibleShadowPositions.filter(p=>p?.status==='OPEN').slice(0,30);
 const recentClosed=visibleShadowPositions.filter(p=>p?.status==='CLOSED').sort((a,b)=>Number(b?.closedAt||0)-Number(a?.closedAt||0)).slice(0,30);
 const discovery=summarizeTradeDiscovery(tradeDiscoveryDiagnostics,{now:Date.now(),runtime:{omsStatus:shadowOmsHealthy?'HEALTHY':'ERROR',omsFilled:health.shadowOms.filled,omsActive:health.shadowOms.active,openStandardPositions:(shadowPortfolioLedger?.positions||[]).filter(p=>p.status==='OPEN'&&p.entryMode!=='EXPLORATION').length,openDiscoveryPositions:countOpenDiscoveryPositions(shadowPortfolioLedger?.positions||[])}});
 return missionControlSnapshot({health,portfolio:{...portfolio,positions:openPositions,recentClosed},discovery,storage:{persistentStorageMounted}});
}
const port = Number(process.env.PORT || 8080);
const server = http.createServer((req,res) => {
  if (req.url === '/mission-control') {
    const snapshot=missionControlData();
    res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'"});
    res.end(renderMissionControlHtml(snapshot));
    return;
  }
  if (req.url === '/mission-control.json') {
    res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});
    res.end(JSON.stringify(missionControlData()));
    return;
  }
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
      shadowResearchWorker:{
        version:FORECAST_SHADOW_EVALUATION_WORKER_VERSION,
        admissionVersion:FORECAST_SHADOW_EVALUATION_ADMISSION_VERSION,
        enabledInServingProcess:shadowCompetitionServingWorkerEnabled,
        mode:shadowCompetitionWorkerMode,
        state:shadowCompetitionServingWorkerEnabled?(shadowCompetitionWorkerMode==='AUTO'?'ADAPTIVE':'ENABLED'):'DISABLED',
        timeoutMs:shadowCompetitionWorkerTimeoutMs,
        maxOldGenerationSizeMb:shadowCompetitionWorkerHeapMb,
        configuredHistoryRows:shadowCompetitionHistoryRows,
        lastHistoryProgressAt:shadowCompetitionLastHistoryProgressAt||null,
        runs:shadowCompetitionWorkerRuns,
        memoryDeferrals:shadowCompetitionWorkerMemoryDeferrals,
        noChangeSkips:shadowCompetitionWorkerNoChangeSkips,
        lastDecision:shadowCompetitionWorkerLastDecision,
        memory:(()=>{const m=process.memoryUsage();return {
          heapUsedMb:Math.round(m.heapUsed/1024/1024),
          heapTotalMb:Math.round(m.heapTotal/1024/1024),
          rssMb:Math.round(m.rss/1024/1024),
          externalMb:Math.round(m.external/1024/1024),
          forecastHistoryRows:forecastRuntime.engine.historySize(),
          forecastJournalRows:forecastRuntime.journal.entries.length
        };})()
      },
      telegramPolling:{
        dispatcher:telegramUpdateDispatcher.snapshot(),
        lastPollAt:telegramLastPollAt,
        lastPollError:telegramLastPollError,
        apiTimeoutMs:telegramApiTimeoutMs,
        longPollTimeoutMs:telegramLongPollTimeoutMs
      },
      discordBridge:discordBridge?discordBridge.snapshot():{enabled:false,reason:'NOT_CONFIGURED'},
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
      persistenceContracts:{
        version:PERSISTENCE_CONTRACTS_VERSION,
        ...currentPersistenceCompatibility()
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
      researchDataPlane:researchDataPlaneSummary(researchDataPlane),
      researchDataGovernance:{
        ...researchDataGovernanceSummary(researchDataGovernance,{now:Date.now()}),
        file:researchGovernanceFile,
        healthy:researchGovernanceHealthy,
        lastError:researchGovernanceLastError
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
  await persistForecastRuntime(`shutdown:${signal}`,{force:true});
  await researchDataPlaneAppendQueue.catch(()=>{});
  await saveResearchDataGovernance(researchGovernanceFile,researchDataGovernance).catch(()=>{});
  await saveEntityFlowMemory(entityFlowMemoryFile,entityFlowMemory).catch(()=>{});
  await persistShadowOms(`shutdown:${signal}`);
  await persistVenueQualityMemory(`shutdown:${signal}`);
  try{ await discordBridge?.stop(); }catch{}
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0),5000).unref();
}
process.on('SIGINT',() => void gracefulShutdown('SIGINT'));
process.on('SIGTERM',() => void gracefulShutdown('SIGTERM'));

liquidationResearchStream.start();
await onchainResearchStartupProbe();
await syncFeatureResearch('startup');
const me = await tg('getMe',{});
if(discordBridge){
  try{
    await discordBridge.start();
    console.log('[TCX_DISCORD_READY]',JSON.stringify(discordBridge.snapshot()));
  }catch(err){
    console.error('[TCX_DISCORD_START_ERROR]',err instanceof Error?err.message:String(err));
  }
}
const persistenceSmoke=runPersistenceSmokeTest();
console.log('[TCX_PERSISTENCE_SMOKE]',JSON.stringify(persistenceSmoke));
const startupReadiness=currentOperationalReadiness();
console.log('[TCX_STARTUP_READY]',JSON.stringify({
  service:'TCX Telegram UI',
  botUsername:me?.username||'UNKNOWN',
  markets:markets.length,
  releaseId:runtimeManifest?.releaseId||null,
  operationalReadiness:startupReadiness.state,
  operationalReadinessReasons:{hard:startupReadiness.hardReasons,warnings:startupReadiness.warningReasons},
  releaseRegistryVerification:releaseRegistry.verification,
  runtimeReleaseRegistered:Boolean(runtimeReleaseRecord),
  persistenceHealthy,
  shadowOmsHealthy,
  shadowPortfolioHealthy,
  strategyLeagueHealthy,
  modelCandidateRegistry:modelCandidateRegistrySummary(modelCandidateRegistry),
  auditLedger:{
    healthy:auditLedger.healthy,
    fileBytes:Number(auditLedger.fileBytes||0),
    maxFileBytes:Number(auditLedger.maxFileBytes||auditLedgerMaxBytes),
    utilization:Number(auditLedger.maxFileBytes)>0?Number(auditLedger.fileBytes||0)/Number(auditLedger.maxFileBytes):null,
    writeBlocked:auditLedger.writeBlocked===true,
    verification:auditLedger.verification
  },
  modelPromotionReviewService:MODEL_PROMOTION_REVIEW_SERVICE_VERSION,
  telegramDispatcher:TELEGRAM_UPDATE_DISPATCHER_VERSION,
  shadowResearchWorker:FORECAST_SHADOW_EVALUATION_WORKER_VERSION,
  shadowResearchWorkerAdmission:FORECAST_SHADOW_EVALUATION_ADMISSION_VERSION,
  autoLearnMemoryAdmission:AUTOLEARN_MEMORY_ADMISSION_VERSION,
  backgroundMemoryLimits:{
    autoLearn:{
      issue:{heapUsedMb:autoLearnHeapHeadroomMb,rssMb:autoLearnRssHeadroomMb,externalMb:autoLearnExternalHeadroomMb},
      resume:{heapUsedMb:autoLearnResumeHeapMb,rssMb:autoLearnResumeRssMb,externalMb:autoLearnResumeExternalMb}
    },
    shadowWorker:{
      auto:{heapUsedMb:shadowCompetitionAutoHeapMb,rssMb:shadowCompetitionAutoRssMb,externalMb:shadowCompetitionAutoExternalMb},
      hard:{heapUsedMb:300,rssMb:900,externalMb:shadowCompetitionHardExternalMb}
    },
    forecastPersistence:{
      heapUsedMb:forecastPersistenceHeapHeadroomMb,
      rssMb:forecastPersistenceRssHeadroomMb,
      externalMb:forecastPersistenceExternalHeadroomMb
    }
  },
  shadowResearchWorkerMode:shadowCompetitionWorkerMode,
  shadowResearchWorkerState:shadowCompetitionServingWorkerEnabled?(shadowCompetitionWorkerMode==='AUTO'?'ADAPTIVE':'ENABLED'):'DISABLED',
  coverageCurriculum:coverageCurriculumEnabled?'ENABLED':'DISABLED',
  coverageHorizons:DEFAULT_COVERAGE_HORIZONS.map(x=>x.id),
  autoLearnSymbols:autoLearnSymbols.length,
  forecastSnapshotPersistence:{
    storageBytes:forecastRuntime.lastPersistedBytes??null,
    logicalBytes:forecastRuntime.lastPersistedLogicalBytes??null,
    maxLogicalBytes:forecastRuntime.maxSnapshotBytes??null,
    encoding:forecastRuntime.snapshotEncoding??'unknown',
    loadedFromPath:forecastRuntime.loadedFromPath??null,
    utilization:forecastRuntime.maxSnapshotBytes&&forecastRuntime.lastPersistedLogicalBytes!=null?forecastRuntime.lastPersistedLogicalBytes/forecastRuntime.maxSnapshotBytes:null,
    compressionRatio:forecastRuntime.lastPersistedLogicalBytes>0&&forecastRuntime.lastPersistedBytes!=null?forecastRuntime.lastPersistedBytes/forecastRuntime.lastPersistedLogicalBytes:null,
    trackerArchive:{
      slot:forecastRuntime.trackerArchiveSlot??null,
      recordCount:forecastRuntime.trackerArchiveRecordCount??0,
      revisionCount:forecastRuntime.trackerArchiveRevisionCount??0,
      storageBytes:forecastRuntime.lastTrackerArchiveBytes??null,
      logicalBytes:forecastRuntime.lastTrackerArchiveLogicalBytes??null
    },
    engineStore:{
      slot:forecastRuntime.engineStoreSlot??null,
      storageBytes:forecastRuntime.lastEngineStoreBytes??null,
      logicalBytes:forecastRuntime.lastEngineStoreLogicalBytes??null
    },
    journalStore:{
      slot:forecastRuntime.journalStoreSlot??null,
      count:forecastRuntime.journalStoreCount??0,
      storageBytes:forecastRuntime.lastJournalStoreBytes??null,
      logicalBytes:forecastRuntime.lastJournalStoreLogicalBytes??null
    },
    manifest:{
      status:forecastRuntime.persistenceManifestStatus??'UNINITIALIZED',
      generationId:forecastRuntime.persistenceGenerationId??null,
      hotHash:forecastRuntime.persistenceManifestHotHash??null
    }
  },
  forecastMemoryCaps:{
    history:forecastRuntime.engine.maxHistoryRows,
    journal:forecastJournalMaxEntries,
    audit:forecastAuditMaxEvents,
    issuances:forecastMaxIssuances,
    tracked:forecastMaxTracked,
    hotIssuances:forecastHotIssuances,
    hotTracked:forecastHotTracked,
    coldBatchThreshold:forecastColdBatchThreshold,
    coldMinAgeMs:forecastColdMinAgeMs,
    coldArchive:forecastColdArchiveState,
    bootColdCompaction:forecastBootColdCompaction?.changed?{
      before:forecastBootColdCompaction.before,
      after:forecastBootColdCompaction.after
    }:null,
    researchPlane:researchPlaneMaxMemoryRecords,
    calibration:forecastRuntime.engine.calibration.maxRows,
    reliability:forecastRuntime.engine.reliability.maxRows,
    modelPerformance:forecastRuntime.engine.modelPerformance.maxRows,
    interval:forecastRuntime.engine.intervalCalibration.maxRows,
    drift:forecastRuntime.engine.drift.maxRows
  },
  execution:'SHADOW_ONLY',
  canExecute:false
}));

await tg('deleteWebhook',{ drop_pending_updates:false });
await Promise.all([poll(),refresher(),alertWatcher(),episodeWatcher(),autoLearnForecastWatcher(),shadowCompetitionWatcher(),forecastOutcomeWatcher(),shadowOmsWatcher(),shadowPortfolioWatcher(),strategyLeagueWatcher(),venueQualityWatcher(),marketFabricMaintenanceWatcher()]);
