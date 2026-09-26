import {
  FEATURE_REGISTRY,
  GENOME_DISTANCE_FIELDS,
  agreementFromSignals,
  directionSign,
  noveltyFromDistances,
  percentileRank,
  weightedDistance
} from "./market_intelligence.js";
import {
  buildHypotheses,
  chronologicalBuckets,
  costAdjustedR,
  decayWindows,
  mean as researchMean,
  numericFeatureContrast,
  sequenceDNA,
  transitionMatrix,
  wilsonInterval
} from "./research_engine.js";
import { parameterGrid } from "./replay_engine.js";
import { discoverInformationEdges } from "./edge_discovery.js";
import { compareDecisions, STRATEGY_CORE_VERSION } from "./strategy_core.js";
import { featureAblationReport } from "./feature_ablation.js";
import {
  canonicalStringify,
  currentVersionManifest,
  fnv1a64,
  manifestId
} from "./version_manifest.js";
import {
  MARKET_LANGUAGE_VERSION,
  sequenceKey,
  tokenizeMarket,
  transitionTension
} from "./market_language.js";
import {
  buildInformationFlowGraph,
  graphRegime
} from "./information_flow.js";
import {
  MARKET_GRAMMAR_VERSION,
  combineBackoffDistributions,
  empiricalSurprisePercentile,
  grammarBreakStatus,
  grammarContexts,
  grammarDrift,
  nextStateForecast,
  scoreObservedToken
} from "./market_grammar.js";
import {
  ADAPTIVE_MEMORY_VERSION,
  learnFeatureMemory,
  memoryRoutingPlan
} from "./adaptive_memory.js";
import {
  GRAMMAR_COUNTERFACTUAL_VERSION,
  grammarCounterfactuals
} from "./grammar_counterfactual.js";
import {
  MARKET_WORLD_MODEL_VERSION,
  buildMarketWorld,
  scoreWorldStep,
  worldCalibration
} from "./market_world_model.js";

export class TradingCenter {
  constructor(sql) {
    this.sql = sql;
    this.init();
    this.ensureVersionManifest();
  }

  init() {
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS market_minutes (
        ts INTEGER PRIMARY KEY,
        open REAL NOT NULL,
        high REAL NOT NULL,
        low REAL NOT NULL,
        close REAL NOT NULL,
        volume REAL NOT NULL,
        source TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS historical_5m (
        ts INTEGER PRIMARY KEY,
        open REAL NOT NULL,
        high REAL NOT NULL,
        low REAL NOT NULL,
        close REAL NOT NULL,
        volume REAL NOT NULL,
        source TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS contexts (
        ts INTEGER PRIMARY KEY,
        price REAL NOT NULL,
        trend_5m TEXT,
        trend_15m TEXT,
        trend_1h TEXT,
        trend_4h TEXT,
        bias_score INTEGER,
        ema20 REAL,
        ema50 REAL,
        support REAL,
        resistance REAL,
        reason TEXT
      );

      CREATE TABLE IF NOT EXISTS alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts INTEGER NOT NULL,
        alert_key TEXT NOT NULL,
        stage TEXT,
        side TEXT,
        level REAL,
        price REAL,
        payload_json TEXT
      );

      CREATE TABLE IF NOT EXISTS setups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        signature TEXT NOT NULL UNIQUE,
        opened_ts INTEGER NOT NULL,
        closed_ts INTEGER,
        side TEXT NOT NULL,
        entry REAL NOT NULL,
        stop REAL NOT NULL,
        target REAL NOT NULL,
        planned_rr REAL NOT NULL,
        level REAL,
        status TEXT NOT NULL DEFAULT 'OPEN',
        result TEXT,
        exit_price REAL,
        realized_r REAL,
        mfe_r REAL NOT NULL DEFAULT 0,
        mae_r REAL NOT NULL DEFAULT 0,
        trend_5m TEXT,
        trend_15m TEXT,
        trend_1h TEXT,
        trend_4h TEXT,
        bias_score INTEGER,
        hour_utc INTEGER,
        dow_utc INTEGER
      );

      CREATE TABLE IF NOT EXISTS pattern_occurrences (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        candle_ts INTEGER NOT NULL,
        pattern TEXT NOT NULL,
        direction INTEGER NOT NULL,
        open REAL NOT NULL,
        high REAL NOT NULL,
        low REAL NOT NULL,
        close REAL NOT NULL,
        volume REAL NOT NULL,
        trend_5m TEXT,
        trend_15m TEXT,
        trend_1h TEXT,
        trend_4h TEXT,
        bias_score INTEGER,
        ret_15m REAL,
        ret_60m REAL,
        ret_240m REAL,
        ret_1440m REAL,
        UNIQUE(candle_ts, pattern)
      );

      CREATE TABLE IF NOT EXISTS news_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fingerprint TEXT NOT NULL UNIQUE,
        published_ts INTEGER NOT NULL,
        captured_ts INTEGER NOT NULL,
        title TEXT NOT NULL,
        url TEXT,
        domain TEXT,
        country TEXT,
        category TEXT NOT NULL,
        base_price REAL,
        ret_5m REAL,
        ret_15m REAL,
        ret_60m REAL,
        ret_240m REAL,
        ret_1440m REAL
      );

      CREATE TABLE IF NOT EXISTS macro_market_daily (
        series TEXT NOT NULL,
        observation_ts INTEGER NOT NULL,
        fetched_ts INTEGER NOT NULL,
        label TEXT,
        kind TEXT NOT NULL,
        value REAL NOT NULL,
        previous_value REAL,
        change_value REAL,
        source TEXT NOT NULL,
        PRIMARY KEY(series, observation_ts)
      );

      CREATE TABLE IF NOT EXISTS macro_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_key TEXT NOT NULL UNIQUE,
        event_ts INTEGER NOT NULL,
        captured_ts INTEGER NOT NULL,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        importance TEXT NOT NULL,
        source TEXT NOT NULL,
        source_url TEXT,
        before_min INTEGER NOT NULL,
        after_min INTEGER NOT NULL,
        base_price REAL,
        ret_5m REAL,
        ret_15m REAL,
        ret_60m REAL,
        ret_240m REAL
      );

      CREATE TABLE IF NOT EXISTS shadow_setups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        variant TEXT NOT NULL,
        signature TEXT NOT NULL UNIQUE,
        opened_ts INTEGER NOT NULL,
        closed_ts INTEGER,
        side TEXT NOT NULL,
        entry REAL NOT NULL,
        stop REAL NOT NULL,
        target REAL NOT NULL,
        planned_rr REAL NOT NULL,
        level REAL,
        status TEXT NOT NULL DEFAULT 'OPEN',
        result TEXT,
        realized_r REAL,
        mfe_r REAL NOT NULL DEFAULT 0,
        mae_r REAL NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS setup_predictions (
        setup_id INTEGER PRIMARY KEY,
        created_ts INTEGER NOT NULL,
        raw_score REAL,
        sample_n INTEGER NOT NULL DEFAULT 0,
        source TEXT NOT NULL,
        data_quality REAL,
        novelty REAL,
        outcome INTEGER,
        resolved_ts INTEGER
      );

      CREATE TABLE IF NOT EXISTS setup_features (
        setup_id INTEGER PRIMARY KEY,
        session TEXT,
        volatility_regime TEXT,
        atr_pct REAL,
        volume_ratio REAL,
        trend_alignment TEXT,
        ema_state TEXT,
        distance_level_pct REAL,
        pattern_tags TEXT,
        recent_news_60m INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS factor_snapshots (
        ts INTEGER PRIMARY KEY,
        close REAL NOT NULL,
        session TEXT,
        volatility_regime TEXT,
        atr_pct REAL,
        volume_ratio REAL,
        trend_alignment TEXT,
        ema_state TEXT,
        distance_level_pct REAL,
        pattern_tags TEXT,
        recent_news_60m INTEGER NOT NULL DEFAULT 0,
        ret_15m REAL,
        ret_60m REAL,
        ret_240m REAL,
        ret_1440m REAL
      );

      CREATE TABLE IF NOT EXISTS open_interest_history (
        ts INTEGER PRIMARY KEY,
        open_interest REAL NOT NULL,
        source TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS funding_history (
        ts INTEGER PRIMARY KEY,
        funding_rate REAL NOT NULL,
        source TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS long_short_history (
        ts INTEGER PRIMARY KEY,
        long_ratio REAL NOT NULL,
        short_ratio REAL NOT NULL,
        long_short_ratio REAL,
        source TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS cross_asset_history (
        ts INTEGER NOT NULL,
        symbol TEXT NOT NULL,
        ret_5m REAL,
        ret_60m REAL,
        close REAL,
        source TEXT NOT NULL,
        PRIMARY KEY(ts, symbol)
      );

      CREATE TABLE IF NOT EXISTS liquidations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts INTEGER NOT NULL,
        position_side TEXT NOT NULL,
        size REAL NOT NULL,
        price REAL NOT NULL,
        notional_usdt REAL NOT NULL,
        source TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS options_snapshots (
        ts INTEGER PRIMARY KEY,
        contracts INTEGER,
        expiry_count INTEGER,
        iv_7d REAL,
        iv_30d REAL,
        iv_90d REAL,
        skew_7d REAL,
        skew_30d REAL,
        skew_90d REAL,
        term_30m7 REAL,
        term_90m30 REAL,
        oi_7d REAL,
        oi_30d REAL,
        oi_90d REAL,
        source TEXT NOT NULL,
        payload_json TEXT
      );

      CREATE TABLE IF NOT EXISTS coinbase_premium_history (
        ts INTEGER PRIMARY KEY,
        coinbase_price REAL NOT NULL,
        reference_price REAL NOT NULL,
        premium_bps REAL NOT NULL,
        trade_time TEXT,
        trade_id TEXT,
        source TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS venue_snapshots (
        ts INTEGER PRIMARY KEY,
        binance_spot REAL,
        bybit_spot REAL,
        bybit_perp REAL,
        bybit_mark REAL,
        bybit_index REAL,
        spot_cross_diff_bps REAL,
        perp_spot_basis_bps REAL,
        mark_index_basis_bps REAL,
        source TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS secondary_microstructure (
        ts INTEGER PRIMARY KEY,
        bid_best REAL,
        ask_best REAL,
        bid_liq_005 REAL,
        ask_liq_005 REAL,
        bid_liq_01 REAL,
        ask_liq_01 REAL,
        bid_liq_025 REAL,
        ask_liq_025 REAL,
        bid_liq_05 REAL,
        ask_liq_05 REAL,
        bid_liq_10 REAL,
        ask_liq_10 REAL,
        bid_slip_1k REAL,
        ask_slip_1k REAL,
        bid_slip_10k REAL,
        ask_slip_10k REAL,
        bid_slip_100k REAL,
        ask_slip_100k REAL,
        bid_slip_1m REAL,
        ask_slip_1m REAL,
        buy_volume REAL,
        sell_volume REAL,
        cvd REAL,
        future_basis REAL,
        depth_imbalance_01 REAL,
        liquidity_shock REAL,
        source TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS orderflow_5m (
        ts INTEGER PRIMARY KEY,
        buy_notional REAL NOT NULL,
        sell_notional REAL NOT NULL,
        delta_notional REAL NOT NULL,
        delta_ratio REAL,
        trade_count INTEGER NOT NULL,
        spread_bps REAL,
        book_imbalance REAL,
        source TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS historical_genomes (
        ts INTEGER PRIMARY KEY,
        price REAL NOT NULL,
        ret_5m REAL,
        ret_15m REAL,
        atr_pct REAL,
        volume_ratio REAL,
        ema_distance_pct REAL,
        oi_change REAL,
        funding_rate REAL,
        long_short_ratio REAL,
        cross_ret_60m REAL,
        data_completeness REAL,
        state_label TEXT,
        fingerprint TEXT,
        ret_fwd_15m REAL,
        ret_fwd_60m REAL,
        ret_fwd_240m REAL,
        source TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS market_genomes (
        ts INTEGER PRIMARY KEY,
        price REAL NOT NULL,
        ret_5m REAL,
        ret_15m REAL,
        atr_pct REAL,
        volume_ratio REAL,
        ema_distance_pct REAL,
        level_distance_pct REAL,
        bias_score REAL,
        oi_change REAL,
        funding_rate REAL,
        long_short_ratio REAL,
        liq_5m REAL,
        liq_imbalance REAL,
        cross_ret_60m REAL,
        flow_delta_ratio REAL,
        spread_bps REAL,
        book_imbalance REAL,
        agreement REAL,
        entropy REAL,
        novelty REAL,
        data_quality REAL,
        volume_surprise REAL,
        oi_surprise REAL,
        liq_surprise REAL,
        flow_surprise REAL,
        state_label TEXT,
        fingerprint TEXT,
        ret_fwd_15m REAL,
        ret_fwd_60m REAL,
        ret_fwd_240m REAL
      );

      CREATE TABLE IF NOT EXISTS market_genome_extensions (
        ts INTEGER PRIMARY KEY,
        options_iv_30d REAL,
        options_skew_30d REAL,
        options_term_30m7 REAL,
        coinbase_premium_bps REAL,
        venue_spot_diff_bps REAL,
        perp_spot_basis_bps REAL,
        mark_index_basis_bps REAL,
        depth_imbalance_01 REAL,
        liquidity_shock REAL,
        futures_basis REAL,
        vix_change REAL,
        sp500_change REAL,
        nasdaq_change REAL,
        usd_change REAL,
        us2y_change_bps REAL,
        us10y_change_bps REAL,
        source_completeness REAL
      );

      CREATE TABLE IF NOT EXISTS research_governor_snapshots (
        ts INTEGER PRIMARY KEY,
        historical_n INTEGER NOT NULL,
        live_n INTEGER NOT NULL,
        historical_json TEXT NOT NULL,
        live_json TEXT NOT NULL,
        promoted_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS genome_provenance (
        ts INTEGER PRIMARY KEY,
        known_at_ts INTEGER NOT NULL,
        recorded_at_ts INTEGER NOT NULL,
        options_source_ts INTEGER,
        coinbase_source_ts INTEGER,
        venue_source_ts INTEGER,
        micro_source_ts INTEGER,
        macro_source_ts INTEGER,
        source_completeness REAL,
        leakage_safe INTEGER NOT NULL,
        issues_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS genome_safe_outcomes (
        ts INTEGER PRIMARY KEY,
        reference_ts INTEGER NOT NULL,
        ret_fwd_15m REAL,
        ret_fwd_60m REAL,
        ret_fwd_240m REAL
      );

      CREATE TABLE IF NOT EXISTS parity_audits (
        ts INTEGER PRIMARY KEY,
        strategy_version TEXT NOT NULL,
        match INTEGER NOT NULL,
        reason TEXT NOT NULL,
        native_signal TEXT,
        replay_signal TEXT,
        details_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS evidence_maturity_snapshots (
        ts INTEGER PRIMARY KEY,
        payload_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS leakage_audits (
        ts INTEGER PRIMARY KEY,
        safe INTEGER NOT NULL,
        issues_json TEXT NOT NULL,
        metrics_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS promotion_audits (
        ts INTEGER PRIMARY KEY,
        constitution_version TEXT NOT NULL,
        payload_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS version_manifests (
        manifest_id TEXT PRIMARY KEY,
        created_ts INTEGER NOT NULL,
        system_version TEXT NOT NULL,
        strategy_version TEXT NOT NULL,
        research_model_version TEXT NOT NULL,
        feature_schema_version TEXT NOT NULL,
        governance_version TEXT NOT NULL,
        data_schema_version TEXT NOT NULL,
        payload_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS decision_version_links (
        subject_type TEXT NOT NULL,
        subject_id TEXT NOT NULL,
        created_ts INTEGER NOT NULL,
        manifest_id TEXT NOT NULL,
        strategy_version TEXT NOT NULL,
        research_model_version TEXT NOT NULL,
        feature_schema_version TEXT NOT NULL,
        governance_version TEXT NOT NULL,
        params_json TEXT,
        PRIMARY KEY(subject_type,subject_id)
      );

      CREATE TABLE IF NOT EXISTS prediction_ledger (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT NOT NULL UNIQUE,
        created_ts INTEGER NOT NULL,
        event_type TEXT NOT NULL,
        subject_type TEXT NOT NULL,
        subject_id TEXT NOT NULL,
        context_ts INTEGER,
        decision TEXT,
        score REAL,
        data_quality REAL,
        novelty REAL,
        manifest_id TEXT NOT NULL,
        strategy_version TEXT NOT NULL,
        research_model_version TEXT NOT NULL,
        feature_schema_version TEXT NOT NULL,
        governance_version TEXT NOT NULL,
        prior_fingerprint TEXT,
        fingerprint TEXT NOT NULL,
        payload_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS feature_ablation_snapshots (
        ts INTEGER PRIMARY KEY,
        historical_json TEXT NOT NULL,
        live_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS market_tokens (
        ts INTEGER PRIMARY KEY,
        token_id TEXT NOT NULL,
        grammar TEXT NOT NULL,
        language_version TEXT NOT NULL,
        components_json TEXT NOT NULL,
        raw_dimensions INTEGER,
        token_dimensions INTEGER,
        ret_fwd_15m REAL,
        ret_fwd_60m REAL,
        ret_fwd_240m REAL
      );

      CREATE TABLE IF NOT EXISTS information_flow_snapshots (
        ts INTEGER PRIMARY KEY,
        status TEXT NOT NULL,
        dominant_leader TEXT,
        graph_regime TEXT,
        leader_concentration REAL,
        payload_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS phase_transition_snapshots (
        ts INTEGER PRIMARY KEY,
        status TEXT NOT NULL,
        tension_score REAL,
        switch_rate REAL,
        unique_ratio REAL,
        sequence_rarity REAL,
        payload_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS grammar_transition_counts (
        order_n INTEGER NOT NULL,
        context_key TEXT NOT NULL,
        next_token TEXT NOT NULL,
        count_n INTEGER NOT NULL DEFAULT 0,
        first_ts INTEGER NOT NULL,
        last_ts INTEGER NOT NULL,
        PRIMARY KEY(order_n,context_key,next_token)
      );

      CREATE TABLE IF NOT EXISTS grammar_forecasts (
        origin_ts INTEGER PRIMARY KEY,
        model_version TEXT NOT NULL,
        context_json TEXT NOT NULL,
        top_json TEXT NOT NULL,
        top1_token TEXT,
        top1_probability REAL,
        entropy_bits REAL,
        normalized_entropy REAL,
        effective_order INTEGER,
        support INTEGER,
        branching_factor INTEGER,
        resolved_ts INTEGER,
        actual_token TEXT,
        actual_probability REAL,
        actual_rank INTEGER,
        surprise_bits REAL,
        surprise_percentile REAL,
        status TEXT NOT NULL DEFAULT 'PENDING',
        hit1 INTEGER,
        hit3 INTEGER
      );

      CREATE TABLE IF NOT EXISTS adaptive_memory_snapshots (
        ts INTEGER PRIMARY KEY,
        version TEXT NOT NULL,
        historical_json TEXT NOT NULL,
        live_json TEXT NOT NULL,
        routing_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS grammar_counterfactual_snapshots (
        ts INTEGER PRIMARY KEY,
        version TEXT NOT NULL,
        token_id TEXT,
        payload_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS market_world_snapshots (
        origin_ts INTEGER PRIMARY KEY,
        model_version TEXT NOT NULL,
        horizon INTEGER NOT NULL,
        beam_width INTEGER NOT NULL,
        branch_width INTEGER NOT NULL,
        payload_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS market_world_resolutions (
        origin_ts INTEGER NOT NULL,
        step_n INTEGER NOT NULL,
        target_ts INTEGER NOT NULL,
        resolved_ts INTEGER,
        actual_token TEXT,
        actual_probability REAL,
        actual_rank INTEGER,
        surprise_bits REAL,
        hit1 INTEGER,
        hit3 INTEGER,
        PRIMARY KEY(origin_ts,step_n)
      );

      CREATE TABLE IF NOT EXISTS data_quality_snapshots (
        ts INTEGER PRIMARY KEY,
        score REAL NOT NULL,
        missing_json TEXT,
        stale_json TEXT,
        details_json TEXT
      );

      CREATE TABLE IF NOT EXISTS market_timeline (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts INTEGER NOT NULL,
        event_type TEXT NOT NULL,
        subtype TEXT,
        direction REAL,
        magnitude REAL,
        source TEXT,
        payload_json TEXT
      );

      CREATE TABLE IF NOT EXISTS replay_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        signature TEXT NOT NULL UNIQUE,
        params_hash TEXT NOT NULL,
        params_json TEXT NOT NULL,
        ts INTEGER NOT NULL,
        side TEXT NOT NULL,
        entry REAL NOT NULL,
        stop REAL NOT NULL,
        target REAL NOT NULL,
        planned_rr REAL NOT NULL,
        level REAL,
        result TEXT,
        realized_r REAL,
        mfe_r REAL,
        mae_r REAL,
        closed_ts INTEGER,
        trend_5m TEXT,
        trend_15m TEXT,
        trend_1h TEXT,
        trend_4h TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_setups_status ON setups(status);
      CREATE INDEX IF NOT EXISTS idx_patterns_pattern ON pattern_occurrences(pattern);
      CREATE INDEX IF NOT EXISTS idx_news_category ON news_events(category);
      CREATE INDEX IF NOT EXISTS idx_macro_events_ts ON macro_events(event_ts);
      CREATE INDEX IF NOT EXISTS idx_macro_market_series_ts ON macro_market_daily(series,observation_ts);
      CREATE INDEX IF NOT EXISTS idx_macro_events_category ON macro_events(category);
      CREATE INDEX IF NOT EXISTS idx_market_minutes_ts ON market_minutes(ts);
      CREATE INDEX IF NOT EXISTS idx_historical_5m_ts ON historical_5m(ts);
      CREATE INDEX IF NOT EXISTS idx_setup_features_session ON setup_features(session);
      CREATE INDEX IF NOT EXISTS idx_setup_predictions_created ON setup_predictions(created_ts);
      CREATE INDEX IF NOT EXISTS idx_shadow_setups_status ON shadow_setups(status);
      CREATE INDEX IF NOT EXISTS idx_shadow_setups_variant ON shadow_setups(variant);
      CREATE INDEX IF NOT EXISTS idx_factor_snapshots_ts ON factor_snapshots(ts);
      CREATE INDEX IF NOT EXISTS idx_oi_ts ON open_interest_history(ts);
      CREATE INDEX IF NOT EXISTS idx_funding_ts ON funding_history(ts);
      CREATE INDEX IF NOT EXISTS idx_long_short_ts ON long_short_history(ts);
      CREATE INDEX IF NOT EXISTS idx_cross_asset_ts ON cross_asset_history(ts);
      CREATE INDEX IF NOT EXISTS idx_liquidations_ts ON liquidations(ts);
      CREATE INDEX IF NOT EXISTS idx_orderflow_5m_ts ON orderflow_5m(ts);
      CREATE INDEX IF NOT EXISTS idx_secondary_microstructure_ts ON secondary_microstructure(ts);
      CREATE INDEX IF NOT EXISTS idx_venue_snapshots_ts ON venue_snapshots(ts);
      CREATE INDEX IF NOT EXISTS idx_options_snapshots_ts ON options_snapshots(ts);
      CREATE INDEX IF NOT EXISTS idx_coinbase_premium_ts ON coinbase_premium_history(ts);
      CREATE INDEX IF NOT EXISTS idx_market_genomes_ts ON market_genomes(ts);
      CREATE INDEX IF NOT EXISTS idx_market_genome_extensions_ts ON market_genome_extensions(ts);
      CREATE INDEX IF NOT EXISTS idx_research_governor_ts ON research_governor_snapshots(ts);
      CREATE INDEX IF NOT EXISTS idx_genome_provenance_recorded ON genome_provenance(recorded_at_ts);
      CREATE INDEX IF NOT EXISTS idx_safe_outcomes_reference ON genome_safe_outcomes(reference_ts);
      CREATE INDEX IF NOT EXISTS idx_parity_audits_ts ON parity_audits(ts);
      CREATE INDEX IF NOT EXISTS idx_decision_version_links_manifest ON decision_version_links(manifest_id);
      CREATE INDEX IF NOT EXISTS idx_prediction_ledger_subject ON prediction_ledger(subject_type,subject_id);
      CREATE INDEX IF NOT EXISTS idx_prediction_ledger_created ON prediction_ledger(created_ts);
      CREATE INDEX IF NOT EXISTS idx_feature_ablation_ts ON feature_ablation_snapshots(ts);
      CREATE INDEX IF NOT EXISTS idx_market_tokens_id_ts ON market_tokens(token_id,ts);
      CREATE INDEX IF NOT EXISTS idx_information_flow_ts ON information_flow_snapshots(ts);
      CREATE INDEX IF NOT EXISTS idx_phase_transition_ts ON phase_transition_snapshots(ts);
      CREATE INDEX IF NOT EXISTS idx_grammar_transition_context ON grammar_transition_counts(order_n,context_key);
      CREATE INDEX IF NOT EXISTS idx_grammar_forecast_status ON grammar_forecasts(status,resolved_ts);
      CREATE INDEX IF NOT EXISTS idx_adaptive_memory_ts ON adaptive_memory_snapshots(ts);
      CREATE INDEX IF NOT EXISTS idx_grammar_counterfactual_ts ON grammar_counterfactual_snapshots(ts);
      CREATE INDEX IF NOT EXISTS idx_market_world_origin ON market_world_snapshots(origin_ts);
      CREATE INDEX IF NOT EXISTS idx_market_world_resolution_target ON market_world_resolutions(target_ts,resolved_ts);
      CREATE INDEX IF NOT EXISTS idx_historical_genomes_ts ON historical_genomes(ts);
      CREATE INDEX IF NOT EXISTS idx_timeline_ts ON market_timeline(ts);
      CREATE INDEX IF NOT EXISTS idx_timeline_type ON market_timeline(event_type);
      CREATE INDEX IF NOT EXISTS idx_replay_params ON replay_results(params_hash);
      CREATE INDEX IF NOT EXISTS idx_replay_ts ON replay_results(ts);
    `);
  }

  rows(query, ...params) {
    return this.sql.exec(query, ...params).toArray();
  }

  one(query, ...params) {
    const rows = this.rows(query, ...params);
    return rows.length ? rows[0] : null;
  }

  ensureVersionManifest() {
    const m=currentVersionManifest();
    const id=manifestId(m);
    this.sql.exec(
      `INSERT OR IGNORE INTO version_manifests(
        manifest_id,created_ts,system_version,strategy_version,research_model_version,
        feature_schema_version,governance_version,data_schema_version,payload_json
      ) VALUES(?,?,?,?,?,?,?,?,?)`,
      id,Date.now(),m.systemVersion,m.strategyVersion,m.researchModelVersion,
      m.featureSchemaVersion,m.governanceVersion,m.dataSchemaVersion,
      canonicalStringify(m)
    );
    return {manifestId:id,...m};
  }

  linkDecisionVersion(subjectType,subjectId,params=null) {
    if(subjectId===null||subjectId===undefined) return null;
    const v=this.ensureVersionManifest();
    this.sql.exec(
      `INSERT OR IGNORE INTO decision_version_links(
        subject_type,subject_id,created_ts,manifest_id,strategy_version,
        research_model_version,feature_schema_version,governance_version,params_json
      ) VALUES(?,?,?,?,?,?,?,?,?)`,
      String(subjectType),String(subjectId),Date.now(),v.manifestId,v.strategyVersion,
      v.researchModelVersion,v.featureSchemaVersion,v.governanceVersion,
      params?canonicalStringify(params):null
    );
    return this.one(
      "SELECT * FROM decision_version_links WHERE subject_type=? AND subject_id=?",
      String(subjectType),String(subjectId)
    );
  }

  versionReport() {
    const current=this.ensureVersionManifest();
    const manifests=this.rows(
      `SELECT manifest_id,MIN(created_ts) AS first_seen,MAX(created_ts) AS last_seen,
        COUNT(*) AS n
       FROM decision_version_links
       GROUP BY manifest_id ORDER BY last_seen DESC`
    );
    const subjects=this.rows(
      `SELECT subject_type,manifest_id,COUNT(*) AS n
       FROM decision_version_links
       GROUP BY subject_type,manifest_id
       ORDER BY subject_type,n DESC`
    );
    return {
      current,
      manifests,
      subjects,
      strategyCoreVersion:STRATEGY_CORE_VERSION,
      note:"Every new setup, shadow setup and replay result is linked to an explicit version manifest."
    };
  }

  appendLedgerEvent({
    eventType,subjectType,subjectId,contextTs=null,decision=null,score=null,
    dataQuality=null,novelty=null,payload={}
  }) {
    if(!eventType||subjectId===null||subjectId===undefined) return null;
    const v=this.ensureVersionManifest();
    const createdTs=Date.now();
    const last=this.one("SELECT fingerprint FROM prediction_ledger ORDER BY id DESC LIMIT 1");
    const prior=last?.fingerprint||"GENESIS";
    const core={
      createdTs,eventType:String(eventType),subjectType:String(subjectType),
      subjectId:String(subjectId),contextTs:contextTs===null?null:Number(contextTs),
      decision:decision===null?null:String(decision),
      score:score===null||score===undefined||!Number.isFinite(Number(score))?null:Number(score),
      dataQuality:dataQuality===null||dataQuality===undefined||!Number.isFinite(Number(dataQuality))?null:Number(dataQuality),
      novelty:novelty===null||novelty===undefined||!Number.isFinite(Number(novelty))?null:Number(novelty),
      manifestId:v.manifestId,
      strategyVersion:v.strategyVersion,
      researchModelVersion:v.researchModelVersion,
      featureSchemaVersion:v.featureSchemaVersion,
      governanceVersion:v.governanceVersion,
      payload
    };
    const canonical=canonicalStringify(core);
    const fingerprint=fnv1a64(prior+"|"+canonical);
    const eventId=fnv1a64(
      [core.eventType,core.subjectType,core.subjectId,core.contextTs??"",fingerprint].join("|")
    );
    const cur=this.sql.exec(
      `INSERT OR IGNORE INTO prediction_ledger(
        event_id,created_ts,event_type,subject_type,subject_id,context_ts,
        decision,score,data_quality,novelty,manifest_id,strategy_version,
        research_model_version,feature_schema_version,governance_version,
        prior_fingerprint,fingerprint,payload_json
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      eventId,createdTs,core.eventType,core.subjectType,core.subjectId,core.contextTs,
      core.decision,core.score,core.dataQuality,core.novelty,
      core.manifestId,core.strategyVersion,core.researchModelVersion,
      core.featureSchemaVersion,core.governanceVersion,
      prior,fingerprint,canonicalStringify(payload||{})
    );
    if(Number(cur.rowsWritten||0)===0) {
      return this.one("SELECT * FROM prediction_ledger WHERE event_id=?",eventId);
    }
    return this.one("SELECT * FROM prediction_ledger WHERE event_id=?",eventId);
  }

  ledgerPredictionForSubject(subjectType,subjectId) {
    return this.one(
      `SELECT * FROM prediction_ledger
       WHERE subject_type=? AND subject_id=? AND event_type='PREDICTION'
       ORDER BY id ASC LIMIT 1`,
      String(subjectType),String(subjectId)
    );
  }

  appendPredictionResolution(subjectType,subjectId,result,payload={}) {
    const pred=this.ledgerPredictionForSubject(subjectType,subjectId);
    if(!pred) return null;
    const exists=this.one(
      `SELECT * FROM prediction_ledger
       WHERE subject_type=? AND subject_id=? AND event_type='RESOLUTION'
       ORDER BY id ASC LIMIT 1`,
      String(subjectType),String(subjectId)
    );
    if(exists) return exists;
    return this.appendLedgerEvent({
      eventType:"RESOLUTION",
      subjectType,subjectId,
      contextTs:Date.now(),
      decision:String(result),
      payload:{predictionEventId:pred.event_id,result,...(payload||{})}
    });
  }

  predictionLedgerAudit(limit=5000) {
    const rows=this.rows(
      "SELECT * FROM prediction_ledger ORDER BY id ASC LIMIT ?",
      Math.min(20000,Math.max(1,Number(limit||5000)))
    );
    let prior="GENESIS",valid=0;
    const issues=[];
    const predictions=new Map(),resolutions=new Map();
    for(const r of rows){
      const payload=JSON.parse(r.payload_json||"{}");
      const core={
        createdTs:Number(r.created_ts),
        eventType:r.event_type,
        subjectType:r.subject_type,
        subjectId:r.subject_id,
        contextTs:r.context_ts===null?null:Number(r.context_ts),
        decision:r.decision===null?null:r.decision,
        score:r.score===null?null:Number(r.score),
        dataQuality:r.data_quality===null?null:Number(r.data_quality),
        novelty:r.novelty===null?null:Number(r.novelty),
        manifestId:r.manifest_id,
        strategyVersion:r.strategy_version,
        researchModelVersion:r.research_model_version,
        featureSchemaVersion:r.feature_schema_version,
        governanceVersion:r.governance_version,
        payload
      };
      const expected=fnv1a64(prior+"|"+canonicalStringify(core));
      const chainOk=String(r.prior_fingerprint)===prior && String(r.fingerprint)===expected;
      if(chainOk) valid++;
      else issues.push({id:Number(r.id),eventId:r.event_id,reason:"CHAIN_MISMATCH"});
      prior=String(r.fingerprint);
      const key=`${r.subject_type}|${r.subject_id}`;
      if(r.event_type==="PREDICTION"){
        if(predictions.has(key)) issues.push({id:Number(r.id),reason:"DUPLICATE_PREDICTION",subject:key});
        predictions.set(key,r);
      }
      if(r.event_type==="RESOLUTION"){
        resolutions.set(key,(resolutions.get(key)||0)+1);
        if((resolutions.get(key)||0)>1) issues.push({id:Number(r.id),reason:"DUPLICATE_RESOLUTION",subject:key});
      }
    }
    const unresolved=[...predictions.keys()].filter(k=>!resolutions.has(k));
    return {
      n:rows.length,
      validChainRows:valid,
      chainValid:rows.length===valid,
      issueCount:issues.length,
      issues:issues.slice(0,50),
      predictions:predictions.size,
      resolved:[...resolutions.keys()].length,
      unresolved:unresolved.length,
      latestFingerprint:rows.at(-1)?.fingerprint||null,
      ledgerPolicy:"Append-only application ledger; resolutions are separate events and prediction rows are never updated."
    };
  }

  recordOpenInterest(ts, value, source = "bybit") {
    if (!Number.isFinite(Number(value))) return;
    const cur = this.sql.exec(
      "INSERT OR REPLACE INTO open_interest_history(ts, open_interest, source) VALUES(?,?,?)",
      Number(ts), Number(value), source
    );
    return Number(cur.rowsWritten || 0);
  }

  recordFunding(ts, rate, source = "bybit") {
    if (!Number.isFinite(Number(rate))) return;
    const cur = this.sql.exec(
      "INSERT OR REPLACE INTO funding_history(ts, funding_rate, source) VALUES(?,?,?)",
      Number(ts), Number(rate), source
    );
    return Number(cur.rowsWritten || 0);
  }

  recordLongShort(ts, longRatio, shortRatio, source = "bybit") {
    const l=Number(longRatio), s=Number(shortRatio);
    if (!Number.isFinite(l) || !Number.isFinite(s)) return;
    const cur = this.sql.exec(
      "INSERT OR REPLACE INTO long_short_history(ts, long_ratio, short_ratio, long_short_ratio, source) VALUES(?,?,?,?,?)",
      Number(ts), l, s, s > 0 ? l/s : null, source
    );
    return Number(cur.rowsWritten || 0);
  }

  recordCrossAsset(ts, symbol, ret5m, ret60m, close, source = "bybit") {
    const cur = this.sql.exec(
      "INSERT OR REPLACE INTO cross_asset_history(ts, symbol, ret_5m, ret_60m, close, source) VALUES(?,?,?,?,?,?)",
      Number(ts), String(symbol), ret5m ?? null, ret60m ?? null, close ?? null, source
    );
    return Number(cur.rowsWritten || 0);
  }

  recordLiquidation({ ts, side, size, price, source = "bybit" }) {
    const q=Number(size), p=Number(price);
    if (!Number.isFinite(q) || !Number.isFinite(p) || q <= 0 || p <= 0) return;
    this.sql.exec(
      "INSERT INTO liquidations(ts, position_side, size, price, notional_usdt, source) VALUES(?,?,?,?,?,?)",
      Number(ts), String(side), q, p, q*p, source
    );
    this.recordTimeline({
      ts:Number(ts),eventType:"LIQUIDATION",subtype:String(side),
      direction:String(side).toUpperCase()==="BUY"?1:String(side).toUpperCase()==="SELL"?-1:null,
      magnitude:q*p,source,payload:{size:q,price:p,notional:q*p}
    });
  }

  externalMarketSummary() {
    const latestOI=this.one("SELECT * FROM open_interest_history ORDER BY ts DESC LIMIT 1");
    const prevOI=this.one("SELECT * FROM open_interest_history WHERE ts < ? ORDER BY ts DESC LIMIT 1", latestOI?.ts || 0);
    const latestFunding=this.one("SELECT * FROM funding_history ORDER BY ts DESC LIMIT 1");
    const latestLS=this.one("SELECT * FROM long_short_history ORDER BY ts DESC LIMIT 1");
    const cross=this.rows("SELECT * FROM cross_asset_history WHERE ts=(SELECT MAX(ts) FROM cross_asset_history) ORDER BY symbol");
    const since=Date.now()-60*60*1000;
    const liq=this.rows(
      `SELECT position_side, COUNT(*) AS n, SUM(notional_usdt) AS notional
       FROM liquidations WHERE ts>=? GROUP BY position_side`,
      since
    );
    return {
      openInterest: latestOI ? {
        ts: latestOI.ts,
        value: Number(latestOI.open_interest),
        change5m: prevOI && Number(prevOI.open_interest) ? (Number(latestOI.open_interest)-Number(prevOI.open_interest))/Number(prevOI.open_interest) : null
      } : null,
      funding: latestFunding ? { ts: latestFunding.ts, rate: Number(latestFunding.funding_rate) } : null,
      longShort: latestLS ? {
        ts: latestLS.ts,
        longRatio: Number(latestLS.long_ratio),
        shortRatio: Number(latestLS.short_ratio),
        ratio: latestLS.long_short_ratio === null ? null : Number(latestLS.long_short_ratio)
      } : null,
      crossAssets: cross,
      liquidations1h: liq
    };
  }

  recordOptionsContext(x) {
    if(!x || !Number.isFinite(Number(x.ts))) return 0;
    const t7=x.tenor7d||{},t30=x.tenor30d||{},t90=x.tenor90d||{};
    const cur=this.sql.exec(
      `INSERT OR REPLACE INTO options_snapshots(
        ts,contracts,expiry_count,iv_7d,iv_30d,iv_90d,
        skew_7d,skew_30d,skew_90d,term_30m7,term_90m30,
        oi_7d,oi_30d,oi_90d,source,payload_json
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      Number(x.ts),Number(x.contracts||0),Number(x.expiryCount||0),
      t7.atmIv??null,t30.atmIv??null,t90.atmIv??null,
      t7.putCallSkewIvPoints??null,t30.putCallSkewIvPoints??null,t90.putCallSkewIvPoints??null,
      x.termSlope30m7??null,x.termSlope90m30??null,
      t7.openInterest??null,t30.openInterest??null,t90.openInterest??null,
      x.source||"deribit",JSON.stringify(x)
    );
    return Number(cur.rowsWritten||0);
  }

  latestOptionsContext() {
    return this.one("SELECT * FROM options_snapshots ORDER BY ts DESC LIMIT 1");
  }

  optionsResearchSummary(limit=576) {
    const rows=this.rows(
      "SELECT * FROM options_snapshots ORDER BY ts DESC LIMIT ?",
      Math.min(5000,Math.max(1,Number(limit||576)))
    );
    if(!rows.length) return {n:0,latest:null};
    const vals=k=>rows.map(r=>Number(r[k])).filter(Number.isFinite);
    const avg=xs=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;
    const latest=rows[0];
    return {
      n:rows.length,
      latest,
      avgIv7d:avg(vals("iv_7d")),
      avgIv30d:avg(vals("iv_30d")),
      avgIv90d:avg(vals("iv_90d")),
      avgSkew30d:avg(vals("skew_30d")),
      avgTerm30m7:avg(vals("term_30m7")),
      avgTerm90m30:avg(vals("term_90m30"))
    };
  }

  recordCoinbasePremium(x) {
    if(!x || !Number.isFinite(Number(x.ts)) || !Number.isFinite(Number(x.premiumBps))) return 0;
    const cur=this.sql.exec(
      `INSERT OR REPLACE INTO coinbase_premium_history(
        ts,coinbase_price,reference_price,premium_bps,trade_time,trade_id,source
      ) VALUES(?,?,?,?,?,?,?)`,
      Number(x.ts),Number(x.coinbasePrice),Number(x.referencePrice),Number(x.premiumBps),
      x.tradeTime||null,x.tradeId===null||x.tradeId===undefined?null:String(x.tradeId),
      x.source||"coinbase_exchange"
    );
    return Number(cur.rowsWritten||0);
  }

  latestCoinbasePremium() {
    return this.one("SELECT * FROM coinbase_premium_history ORDER BY ts DESC LIMIT 1");
  }

  coinbasePremiumSummary(limit=576) {
    const rows=this.rows(
      "SELECT * FROM coinbase_premium_history ORDER BY ts DESC LIMIT ?",
      Math.min(5000,Math.max(1,Number(limit||576)))
    );
    if(!rows.length) return {n:0,latest:null};
    const xs=rows.map(r=>Number(r.premium_bps)).filter(Number.isFinite);
    const avg=xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;
    const sorted=[...xs].sort((a,b)=>a-b);
    const median=sorted.length?sorted[Math.floor(sorted.length/2)]:null;
    return {
      n:rows.length,
      latest:rows[0],
      avgPremiumBps:avg,
      medianPremiumBps:median,
      maxPremiumBps:xs.length?Math.max(...xs):null,
      minPremiumBps:xs.length?Math.min(...xs):null
    };
  }

  recordVenueSnapshot({ts=Date.now(),binanceSpot=null,bybitSpot=null,bybitPerp=null,bybitMark=null,bybitIndex=null,source="binance+bybit"}) {
    const b=Number(binanceSpot),s=Number(bybitSpot),p=Number(bybitPerp);
    const mark=Number(bybitMark),index=Number(bybitIndex);
    const cross=Number.isFinite(b)&&b>0&&Number.isFinite(s)?(s-b)/b*10000:null;
    const basis=Number.isFinite(s)&&s>0&&Number.isFinite(p)?(p-s)/s*10000:null;
    const markBasis=Number.isFinite(index)&&index>0&&Number.isFinite(mark)?(mark-index)/index*10000:null;
    this.sql.exec(
      `INSERT OR REPLACE INTO venue_snapshots(
        ts,binance_spot,bybit_spot,bybit_perp,bybit_mark,bybit_index,
        spot_cross_diff_bps,perp_spot_basis_bps,mark_index_basis_bps,source
      ) VALUES(?,?,?,?,?,?,?,?,?,?)`,
      Number(ts),
      Number.isFinite(b)?b:null,Number.isFinite(s)?s:null,Number.isFinite(p)?p:null,
      Number.isFinite(mark)?mark:null,Number.isFinite(index)?index:null,
      cross,basis,markBasis,source
    );
    return {ts:Number(ts),spotCrossDiffBps:cross,perpSpotBasisBps:basis,markIndexBasisBps:markBasis};
  }

  latestVenueSnapshot() {
    return this.one("SELECT * FROM venue_snapshots ORDER BY ts DESC LIMIT 1");
  }

  venueStats(limit=576) {
    const rows=this.rows("SELECT * FROM venue_snapshots ORDER BY ts DESC LIMIT ?",Math.min(5000,Math.max(1,Number(limit||576))));
    if(!rows.length) return {n:0};
    const vals=k=>rows.map(r=>Number(r[k])).filter(Number.isFinite);
    const avg=xs=>xs.length?xs.reduce((x,y)=>x+y,0)/xs.length:null;
    const maxAbs=xs=>xs.length?Math.max(...xs.map(Math.abs)):null;
    const cross=vals("spot_cross_diff_bps"),basis=vals("perp_spot_basis_bps"),mark=vals("mark_index_basis_bps");
    return {n:rows.length,latest:rows[0],avgSpotCrossDiffBps:avg(cross),maxAbsSpotCrossDiffBps:maxAbs(cross),avgPerpSpotBasisBps:avg(basis),maxAbsPerpSpotBasisBps:maxAbs(basis),avgMarkIndexBasisBps:avg(mark)};
  }

  recordSecondaryMicrostructure(row) {
    if(!row || !Number.isFinite(Number(row.ts))) return 0;
    const bid=row.bid||{}, ask=row.ask||{};
    const currentDepth=Number(bid.liquidity01||0)+Number(ask.liquidity01||0);
    const prev=this.one("SELECT bid_liq_01,ask_liq_01 FROM secondary_microstructure ORDER BY ts DESC LIMIT 1");
    const prevDepth=prev ? Number(prev.bid_liq_01||0)+Number(prev.ask_liq_01||0) : 0;
    const shock=prevDepth>0 ? (currentDepth-prevDepth)/prevDepth : null;
    const depthImbalance=currentDepth>0
      ? (Number(bid.liquidity01||0)-Number(ask.liquidity01||0))/currentDepth
      : null;

    const cur=this.sql.exec(
      `INSERT OR REPLACE INTO secondary_microstructure(
        ts,bid_best,ask_best,
        bid_liq_005,ask_liq_005,bid_liq_01,ask_liq_01,bid_liq_025,ask_liq_025,
        bid_liq_05,ask_liq_05,bid_liq_10,ask_liq_10,
        bid_slip_1k,ask_slip_1k,bid_slip_10k,ask_slip_10k,
        bid_slip_100k,ask_slip_100k,bid_slip_1m,ask_slip_1m,
        buy_volume,sell_volume,cvd,future_basis,depth_imbalance_01,liquidity_shock,source
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      Number(row.ts),
      bid.bestPrice??null,ask.bestPrice??null,
      bid.liquidity005??null,ask.liquidity005??null,
      bid.liquidity01??null,ask.liquidity01??null,
      bid.liquidity025??null,ask.liquidity025??null,
      bid.liquidity05??null,ask.liquidity05??null,
      bid.liquidity10??null,ask.liquidity10??null,
      bid.slippage1k??null,ask.slippage1k??null,
      bid.slippage10k??null,ask.slippage10k??null,
      bid.slippage100k??null,ask.slippage100k??null,
      bid.slippage1m??null,ask.slippage1m??null,
      row.buyVolume??null,row.sellVolume??null,row.cvd??null,row.futureBasis??null,
      depthImbalance,shock,row.source||"kraken_futures_analytics"
    );

    if(Number.isFinite(shock) && Math.abs(shock)>=0.25) {
      this.recordTimeline({
        ts:Number(row.ts),
        eventType:"LIQUIDITY_SHIFT",
        subtype:shock<0?"DEPTH_DROP":"DEPTH_BUILD",
        direction:depthImbalance,
        magnitude:Math.abs(shock),
        source:row.source||"kraken_futures_analytics",
        payload:{liquidityShock:shock,depthImbalance01:depthImbalance,currentDepth,prevDepth}
      });
    }
    return Number(cur.rowsWritten||0);
  }

  latestSecondaryMicrostructure() {
    return this.one("SELECT * FROM secondary_microstructure ORDER BY ts DESC LIMIT 1");
  }

  secondaryMicrostructureSummary(limit=288) {
    const rows=this.rows(
      "SELECT * FROM secondary_microstructure ORDER BY ts DESC LIMIT ?",
      Math.min(2000,Math.max(1,Number(limit||288)))
    );
    if(!rows.length) return {n:0,latest:null};
    const latest=rows[0];
    const vals=k=>rows.map(r=>Number(r[k])).filter(Number.isFinite);
    const avg=xs=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;
    return {
      n:rows.length,
      latest,
      avgDepthImbalance01:avg(vals("depth_imbalance_01")),
      avgLiquidityShock:avg(vals("liquidity_shock")),
      maxAbsLiquidityShock:vals("liquidity_shock").length
        ? Math.max(...vals("liquidity_shock").map(Math.abs)):null,
      avgBidSlippage100k:avg(vals("bid_slip_100k")),
      avgAskSlippage100k:avg(vals("ask_slip_100k")),
      avgFutureBasis:avg(vals("future_basis"))
    };
  }

  recordOrderflow5m({
    ts, buyNotional, sellNotional, tradeCount,
    spreadBps = null, bookImbalance = null, source = "binance"
  }) {
    const buy=Number(buyNotional||0), sell=Number(sellNotional||0);
    const total=buy+sell;
    const delta=buy-sell;
    const ratio=total>0 ? delta/total : null;
    const cur=this.sql.exec(
      `INSERT OR REPLACE INTO orderflow_5m(
        ts,buy_notional,sell_notional,delta_notional,delta_ratio,
        trade_count,spread_bps,book_imbalance,source
      ) VALUES(?,?,?,?,?,?,?,?,?)`,
      Number(ts),buy,sell,delta,ratio,Number(tradeCount||0),
      spreadBps===null?null:Number(spreadBps),
      bookImbalance===null?null:Number(bookImbalance),
      source
    );
    this.recordTimeline({
      ts:Number(ts), eventType:"ORDERFLOW_5M",
      subtype: ratio===null ? "NO_FLOW" : ratio>0.15 ? "BUY_HEAVY" : ratio<-0.15 ? "SELL_HEAVY" : "BALANCED",
      direction: ratio, magnitude: Math.abs(delta), source,
      payload:{buy,sell,delta,ratio,spreadBps,bookImbalance,tradeCount}
    });
    return Number(cur.rowsWritten||0);
  }

  recordTimeline({ts=Date.now(),eventType,subtype=null,direction=null,magnitude=null,source=null,payload=null}) {
    if (!eventType) return;
    this.sql.exec(
      `INSERT INTO market_timeline(ts,event_type,subtype,direction,magnitude,source,payload_json)
       VALUES(?,?,?,?,?,?,?)`,
      Number(ts),String(eventType),subtype===null?null:String(subtype),
      direction===null?null:Number(direction),
      magnitude===null?null:Number(magnitude),
      source===null?null:String(source),
      payload?JSON.stringify(payload):null
    );
  }

  latestOrderflow() {
    return this.one("SELECT * FROM orderflow_5m ORDER BY ts DESC LIMIT 1");
  }

  recentLiquidationSummary(minutes=5) {
    const since=Date.now()-Number(minutes)*60_000;
    const rows=this.rows(
      `SELECT position_side, SUM(notional_usdt) AS notional, COUNT(*) AS n
       FROM liquidations WHERE ts>=? GROUP BY position_side`,
      since
    );
    let buy=0,sell=0,total=0;
    for (const r of rows) {
      const n=Number(r.notional||0);
      total+=n;
      const side=String(r.position_side||"").toUpperCase();
      if(side==="BUY") buy+=n;
      else if(side==="SELL") sell+=n;
    }
    return {
      total,
      buy,
      sell,
      imbalance: total>0 ? (buy-sell)/total : 0,
      rows
    };
  }

  nearestAnyClose(targetTs) {
    return this.one(
      `SELECT close,ts FROM (
         SELECT close,ts FROM market_minutes WHERE ts>=?
         UNION ALL
         SELECT close,ts FROM historical_5m WHERE ts>=?
       ) ORDER BY ts ASC LIMIT 1`,
      Number(targetTs),Number(targetTs)
    );
  }

  dataQuality(ctx) {
    const now=Date.now();
    const missing=[], stale=[];
    const details={};

    const mark=(name,row,maxAgeMs)=>{
      if(!row || !Number.isFinite(Number(row.ts))) {
        missing.push(name); details[name]={status:"missing"}; return;
      }
      const age=now-Number(row.ts);
      details[name]={status:age<=maxAgeMs?"fresh":"stale",ageMs:age,ts:Number(row.ts)};
      if(age>maxAgeMs) stale.push(name);
    };

    const oi=this.one("SELECT ts FROM open_interest_history ORDER BY ts DESC LIMIT 1");
    const funding=this.one("SELECT ts FROM funding_history ORDER BY ts DESC LIMIT 1");
    const ls=this.one("SELECT ts FROM long_short_history ORDER BY ts DESC LIMIT 1");
    const cross=this.one("SELECT MAX(ts) AS ts FROM cross_asset_history");
    const flow=this.one("SELECT ts FROM orderflow_5m ORDER BY ts DESC LIMIT 1");
    const micro=this.one("SELECT ts FROM secondary_microstructure ORDER BY ts DESC LIMIT 1");
    const venue=this.one("SELECT ts FROM venue_snapshots ORDER BY ts DESC LIMIT 1");
    const options=this.one("SELECT ts FROM options_snapshots ORDER BY ts DESC LIMIT 1");
    const coinbase=this.one("SELECT ts FROM coinbase_premium_history ORDER BY ts DESC LIMIT 1");
    const macro=this.macroCalendarHealth(now);
    const macroMarket=this.macroMarketHealth(now);

    mark("open_interest",oi,15*60_000);
    mark("funding",funding,12*60*60_000);
    mark("long_short_ratio",ls,15*60_000);
    mark("cross_asset",cross,20*60_000);
    mark("orderflow",flow,15*60_000);
    mark("secondary_microstructure",micro,20*60_000);
    mark("venue_confirmation",venue,15*60_000);
    mark("options_surface",options,45*60_000);
    mark("coinbase_premium",coinbase,20*60_000);
    if(!macro.lastCapturedAt) {
      missing.push("official_macro_calendar");
      details.official_macro_calendar={status:"missing"};
    } else if(!macro.fresh) {
      stale.push("official_macro_calendar");
      details.official_macro_calendar={status:"stale",ageMs:macro.ageMs};
    } else {
      details.official_macro_calendar={status:"fresh",ageMs:macro.ageMs,nextEvent:macro.nextEvent?.event_ts||null};
    }
    if(!macroMarket.fresh || macroMarket.missing.length) {
      if(!macroMarket.seriesCount) missing.push("macro_market_context");
      else stale.push("macro_market_context");
      details.macro_market_context={
        status:macroMarket.seriesCount?(macroMarket.fresh?"partial":"stale"):"missing",
        ageMs:macroMarket.ageMs,
        missing:macroMarket.missing
      };
    } else {
      details.macro_market_context={status:"fresh",ageMs:macroMarket.ageMs,missing:[]};
    }

    const c5=Array.isArray(ctx?.c5)?ctx.c5:[];
    if(c5.length<100) missing.push("price_history");
    else details.price_history={status:"fresh",bars:c5.length};

    const recent=this.rows(
      "SELECT ts FROM market_minutes WHERE ts>=? ORDER BY ts ASC",
      now-30*60_000
    );
    let gaps=0;
    for(let i=1;i<recent.length;i++){
      if(Number(recent[i].ts)-Number(recent[i-1].ts)>125_000) gaps++;
    }
    details.live_gaps_30m=gaps;

    const critical=["open_interest","cross_asset","orderflow","price_history","official_macro_calendar","macro_market_context","venue_confirmation","secondary_microstructure"];
    const criticalPenalty=missing.filter(x=>critical.includes(x)).length*14 +
      stale.filter(x=>critical.includes(x)).length*9;
    const otherPenalty=missing.filter(x=>!critical.includes(x)).length*7 +
      stale.filter(x=>!critical.includes(x)).length*4;
    const gapPenalty=Math.min(20,gaps*4);
    const score=Math.max(0,100-criticalPenalty-otherPenalty-gapPenalty);

    const ts=Number(ctx?.c5?.at(-1)?.t||now);
    this.sql.exec(
      `INSERT OR REPLACE INTO data_quality_snapshots(ts,score,missing_json,stale_json,details_json)
       VALUES(?,?,?,?,?)`,
      ts,score,JSON.stringify(missing),JSON.stringify(stale),JSON.stringify(details)
    );
    return {score,missing,stale,details};
  }

  buildMarketGenome(ctx) {
    const f=this.factorsFromContext(ctx);
    const c5=Array.isArray(ctx?.c5)?ctx.c5:[];
    const last=c5.at(-1), prev=c5.at(-2), prev3=c5.at(-4);
    const price=Number(ctx?.price||last?.c||0);
    const ret5=prev?.c ? price/Number(prev.c)-1 : null;
    const ret15=prev3?.c ? price/Number(prev3.c)-1 : null;
    const emaMid=(Number(ctx?.ema20||0)+Number(ctx?.ema50||0))/2;
    const emaDistance=price && emaMid ? (price-emaMid)/price : null;
    const levelDistance=f.distance_level_pct;

    const oi=this.one("SELECT * FROM open_interest_history ORDER BY ts DESC LIMIT 1");
    const prevOi=oi?this.one("SELECT * FROM open_interest_history WHERE ts<? ORDER BY ts DESC LIMIT 1",oi.ts):null;
    const oiChange=oi&&prevOi&&Number(prevOi.open_interest)
      ? (Number(oi.open_interest)-Number(prevOi.open_interest))/Number(prevOi.open_interest):null;
    const funding=this.one("SELECT * FROM funding_history ORDER BY ts DESC LIMIT 1");
    const ls=this.one("SELECT * FROM long_short_history ORDER BY ts DESC LIMIT 1");
    const flow=this.latestOrderflow();
    const liq=this.recentLiquidationSummary(5);
    const crossRows=this.rows(
      "SELECT * FROM cross_asset_history WHERE ts=(SELECT MAX(ts) FROM cross_asset_history)"
    );
    const crossVals=crossRows.map(r=>Number(r.ret_60m)).filter(Number.isFinite);
    const crossRet=crossVals.length?crossVals.reduce((a,b)=>a+b,0)/crossVals.length:null;

    const history=this.rows(
      `SELECT volume_ratio,oi_change,liq_5m,flow_delta_ratio
       FROM market_genomes ORDER BY ts DESC LIMIT 576`
    );
    const volumeSample=history.map(r=>Number(r.volume_ratio)).filter(Number.isFinite);
    const oiSample=history.map(r=>Number(r.oi_change)).filter(Number.isFinite);
    const liqSample=history.map(r=>Number(r.liq_5m)).filter(Number.isFinite);
    const flowSample=history.map(r=>Number(r.flow_delta_ratio)).filter(Number.isFinite);

    const directional=[
      directionSign(ret5,0.0001),
      directionSign(ret15,0.0002),
      directionSign(ctx?.score,0),
      directionSign(emaDistance,0.0002),
      directionSign(crossRet,0.001),
      directionSign(flow?.delta_ratio,0.05),
      directionSign(flow?.book_imbalance,0.05),
      directionSign((ls?.long_short_ratio??1)-1,0.03)
    ];
    const agree=agreementFromSignals(directional);
    const quality=this.dataQuality(ctx);

    const g={
      ts:Number(last?.t||Date.now()),
      price,
      ret_5m:ret5,
      ret_15m:ret15,
      atr_pct:f.atr_pct,
      volume_ratio:f.volume_ratio,
      ema_distance_pct:emaDistance,
      level_distance_pct:levelDistance,
      bias_score:Number(ctx?.score||0),
      oi_change:oiChange,
      funding_rate:funding?Number(funding.funding_rate):null,
      long_short_ratio:ls?.long_short_ratio===null||ls?.long_short_ratio===undefined?null:Number(ls.long_short_ratio),
      liq_5m:Number(liq.total||0),
      liq_imbalance:Number(liq.imbalance||0),
      cross_ret_60m:crossRet,
      flow_delta_ratio:flow?.delta_ratio===null||flow?.delta_ratio===undefined?null:Number(flow.delta_ratio),
      spread_bps:flow?.spread_bps===null||flow?.spread_bps===undefined?null:Number(flow.spread_bps),
      book_imbalance:flow?.book_imbalance===null||flow?.book_imbalance===undefined?null:Number(flow.book_imbalance),
      agreement:agree.agreement,
      entropy:agree.entropy,
      novelty:null,
      data_quality:quality.score,
      volume_surprise:percentileRank(f.volume_ratio,volumeSample),
      oi_surprise:percentileRank(Math.abs(oiChange??0),oiSample.map(Math.abs)),
      liq_surprise:percentileRank(liq.total,liqSample),
      flow_surprise:percentileRank(Math.abs(flow?.delta_ratio??0),flowSample.map(Math.abs))
    };

    const peers=this.rows("SELECT * FROM market_genomes ORDER BY ts DESC LIMIT 1000");
    const distances=peers.map(x=>weightedDistance(g,x,GENOME_DISTANCE_FIELDS)).filter(Number.isFinite);
    g.novelty=noveltyFromDistances(distances);

    const trend=f.trend_alignment;
    const leverage=oiChange===null?"OI?":oiChange>0.003?"OI_BUILD":oiChange<-0.003?"OI_UNWIND":"OI_FLAT";
    const flowState=g.flow_delta_ratio===null?"FLOW?":g.flow_delta_ratio>0.15?"BUY_FLOW":g.flow_delta_ratio<-0.15?"SELL_FLOW":"FLOW_BAL";
    g.state_label=`${trend}|${f.volatility_regime}|${leverage}|${flowState}`;
    g.fingerprint=[
      trend,f.volatility_regime,
      Math.round((g.volume_surprise??0.5)*10),
      Math.round((g.oi_surprise??0.5)*10),
      Math.round((g.liq_surprise??0.5)*10),
      Math.round((g.flow_surprise??0.5)*10),
      Math.round((g.agreement??0)*10),
      Math.round((g.novelty??0)*10)
    ].join(":");
    return g;
  }

  grammarVocabulary() {
    return this.rows(
      `SELECT next_token,count_n FROM grammar_transition_counts
       WHERE order_n=0 AND context_key='*'
       ORDER BY count_n DESC`
    ).map(r=>({token:String(r.next_token),count:Number(r.count_n||0)}));
  }

  grammarPrediction(history,maxOrder=5) {
    const vocabRows=this.grammarVocabulary();
    const vocabulary=vocabRows.map(x=>x.token);
    if(!vocabulary.length) return combineBackoffDistributions({vocabulary:[]});

    const unigramCounts=Object.fromEntries(vocabRows.map(x=>[x.token,x.count]));
    const contextCounts=[];
    for(const ctx of grammarContexts(history,maxOrder)){
      if(ctx.order===0) continue;
      const rows=this.rows(
        `SELECT next_token,count_n FROM grammar_transition_counts
         WHERE order_n=? AND context_key=?`,
        Number(ctx.order),String(ctx.key)
      );
      if(!rows.length) continue;
      contextCounts.push({
        order:ctx.order,
        key:ctx.key,
        counts:Object.fromEntries(rows.map(r=>[String(r.next_token),Number(r.count_n||0)]))
      });
    }
    return combineBackoffDistributions({vocabulary,unigramCounts,contextCounts});
  }

  incrementGrammarCounts(history,nextToken,ts,maxOrder=5) {
    const token=String(nextToken);
    for(const ctx of grammarContexts(history,maxOrder)){
      this.sql.exec(
        `INSERT INTO grammar_transition_counts(
          order_n,context_key,next_token,count_n,first_ts,last_ts
        ) VALUES(?,?,?,?,?,?)
        ON CONFLICT(order_n,context_key,next_token)
        DO UPDATE SET count_n=count_n+1,last_ts=excluded.last_ts`,
        Number(ctx.order),String(ctx.key),token,1,Number(ts),Number(ts)
      );
    }
  }

  ensureGrammarBootstrap(maxRows=5000) {
    const transitions=Number(this.one(
      "SELECT COUNT(*) AS n FROM grammar_transition_counts"
    )?.n||0);
    if(transitions>0) return {bootstrapped:false,transitions};

    const rows=this.rows(
      `SELECT ts,token_id FROM market_tokens
       ORDER BY ts DESC LIMIT ?`,
      Math.min(10000,Math.max(100,Number(maxRows||5000)))
    ).reverse();
    if(rows.length<2) return {bootstrapped:false,transitions:0,tokens:rows.length};

    const history=[];
    for(const r of rows){
      this.incrementGrammarCounts(history,String(r.token_id),Number(r.ts),5);
      history.push(String(r.token_id));
      if(history.length>5)history.shift();
    }
    return{
      bootstrapped:true,
      tokens:rows.length,
      transitions:Number(this.one("SELECT COUNT(*) AS n FROM grammar_transition_counts")?.n||0)
    };
  }

  processGrammarObservation(token,ts) {
    this.ensureGrammarBootstrap();
    const historyRows=this.rows(
      `SELECT ts,token_id FROM market_tokens
       WHERE ts<? ORDER BY ts DESC LIMIT 5`,
      Number(ts)
    ).reverse();
    const history=historyRows.map(r=>String(r.token_id));
    const previousOrigin=historyRows.at(-1)?.ts??null;

    const pre=this.grammarPrediction(history,5);
    const totalSeen=this.grammarVocabulary().reduce((s,x)=>s+Number(x.count||0),0);
    let resolved=null;

    if(pre.vocabulary?.length){
      const scored=scoreObservedToken(pre,token.tokenId,totalSeen);
      const surpriseHistory=this.rows(
        `SELECT surprise_bits FROM grammar_forecasts
         WHERE surprise_bits IS NOT NULL
         ORDER BY resolved_ts DESC LIMIT 2000`
      ).map(r=>Number(r.surprise_bits)).filter(Number.isFinite);
      const percentile=empiricalSurprisePercentile(scored.surpriseBits,surpriseHistory);
      const status=grammarBreakStatus({
        percentile,
        probability:scored.probability,
        support:pre.support,
        resolvedSample:surpriseHistory.length
      });
      resolved={
        ...scored,
        percentile,
        status,
        support:Number(pre.support||0),
        effectiveOrder:Number(pre.effectiveOrder||0),
        entropyBits:pre.entropyBits??null
      };

      if(previousOrigin!==null){
        this.sql.exec(
          `UPDATE grammar_forecasts SET
            resolved_ts=?,actual_token=?,actual_probability=?,actual_rank=?,
            surprise_bits=?,surprise_percentile=?,status=?,hit1=?,hit3=?
           WHERE origin_ts=? AND resolved_ts IS NULL`,
          Number(ts),String(token.tokenId),Number(scored.probability),
          scored.rank===null?null:Number(scored.rank),
          Number(scored.surpriseBits),
          percentile===null?null:Number(percentile),
          String(status),scored.top1?1:0,scored.top3?1:0,
          Number(previousOrigin)
        );
      }
    }

    this.incrementGrammarCounts(history,token.tokenId,Number(ts),5);

    const nextHistory=[...history,String(token.tokenId)].slice(-5);
    const post=this.grammarPrediction(nextHistory,5);
    const forecast=nextStateForecast(post,10);
    this.sql.exec(
      `INSERT OR REPLACE INTO grammar_forecasts(
        origin_ts,model_version,context_json,top_json,top1_token,top1_probability,
        entropy_bits,normalized_entropy,effective_order,support,branching_factor,status
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,'PENDING')`,
      Number(ts),MARKET_GRAMMAR_VERSION,JSON.stringify(nextHistory),
      JSON.stringify(forecast.top||[]),
      forecast.top1?.token||null,
      forecast.top1?.probability===undefined?null:Number(forecast.top1.probability),
      forecast.entropyBits===null?null:Number(forecast.entropyBits),
      forecast.normalizedEntropy===null?null:Number(forecast.normalizedEntropy),
      Number(forecast.effectiveOrder||0),Number(forecast.support||0),
      Number(forecast.branchingFactor||0)
    );

    return{resolved,next:forecast};
  }

  buildMarketWorldReport({horizon=12,beamWidth=24,branchWidth=4}={}) {
    this.ensureGrammarBootstrap();
    const rows=this.rows(
      `SELECT ts,token_id FROM market_tokens ORDER BY ts DESC LIMIT 5`
    ).reverse();
    const history=rows.map(r=>String(r.token_id));
    const latestTs=rows.at(-1)?.ts??null;
    if(!history.length)return{
      status:"LEARNING",
      version:MARKET_WORLD_MODEL_VERSION,
      horizonRequested:Number(horizon||12),
      originTs:null,
      paths:[],
      steps:[]
    };

    const world=buildMarketWorld({
      history,
      predictor:(h,maxOrder)=>this.grammarPrediction(h,maxOrder),
      horizon,
      beamWidth,
      branchWidth,
      minBranchProbability:0.012,
      maxOrder:5
    });
    return{
      ...world,
      originTs:Number(latestTs),
      originToken:history.at(-1),
      tokenMinutes:5,
      horizonMinutes:Number(world.horizonBuilt||0)*5,
      calibration:this.marketWorldCalibrationReport(1500)
    };
  }

  refreshMarketWorldModel({horizon=12,beamWidth=24,branchWidth=4}={}) {
    const report=this.buildMarketWorldReport({horizon,beamWidth,branchWidth});
    if(!report.originTs)return report;

    const existing=this.one(
      "SELECT origin_ts FROM market_world_snapshots WHERE origin_ts=?",
      Number(report.originTs)
    );
    if(!existing){
      this.sql.exec(
        `INSERT INTO market_world_snapshots(
          origin_ts,model_version,horizon,beam_width,branch_width,payload_json
        ) VALUES(?,?,?,?,?,?)`,
        Number(report.originTs),MARKET_WORLD_MODEL_VERSION,
        Number(report.horizonBuilt||horizon),Number(beamWidth),Number(branchWidth),
        JSON.stringify(report)
      );
      for(let step=1;step<=Number(report.horizonBuilt||0);step++){
        this.sql.exec(
          `INSERT OR IGNORE INTO market_world_resolutions(
            origin_ts,step_n,target_ts
          ) VALUES(?,?,?)`,
          Number(report.originTs),step,Number(report.originTs)+step*5*60_000
        );
      }
    }
    return report;
  }

  resolveMarketWorlds(actualToken,tokenTs) {
    const pending=this.rows(
      `SELECT r.origin_ts,r.step_n,s.payload_json
       FROM market_world_resolutions r
       JOIN market_world_snapshots s ON s.origin_ts=r.origin_ts
       WHERE r.target_ts=? AND r.resolved_ts IS NULL`,
      Number(tokenTs)
    );
    const resolved=[];
    for(const row of pending){
      const payload=JSON.parse(row.payload_json||"{}");
      const step=(payload.steps||[]).find(x=>Number(x.step)===Number(row.step_n));
      if(!step)continue;
      const scored=scoreWorldStep(step,actualToken);
      this.sql.exec(
        `UPDATE market_world_resolutions SET
          resolved_ts=?,actual_token=?,actual_probability=?,actual_rank=?,
          surprise_bits=?,hit1=?,hit3=?
         WHERE origin_ts=? AND step_n=?`,
        Number(tokenTs),String(actualToken),Number(scored.probability||0),
        scored.rank===null?null:Number(scored.rank),Number(scored.surpriseBits),
        scored.top1?1:0,scored.top3?1:0,
        Number(row.origin_ts),Number(row.step_n)
      );
      resolved.push({originTs:Number(row.origin_ts),...scored});
    }
    return resolved;
  }

  marketWorldCalibrationReport(limit=2000) {
    const rows=this.rows(
      `SELECT * FROM market_world_resolutions
       WHERE resolved_ts IS NOT NULL
       ORDER BY resolved_ts DESC LIMIT ?`,
      Math.min(10000,Math.max(50,Number(limit||2000)))
    );
    return worldCalibration(rows);
  }

  latestMarketWorld() {
    const r=this.one(
      "SELECT * FROM market_world_snapshots ORDER BY origin_ts DESC LIMIT 1"
    );
    if(!r)return null;
    return{
      originTs:Number(r.origin_ts),
      modelVersion:r.model_version,
      horizon:Number(r.horizon),
      beamWidth:Number(r.beam_width),
      branchWidth:Number(r.branch_width),
      ...JSON.parse(r.payload_json||"{}")
    };
  }

  marketWorldHistory(limit=30) {
    return this.rows(
      `SELECT origin_ts,model_version,horizon,payload_json
       FROM market_world_snapshots ORDER BY origin_ts DESC LIMIT ?`,
      Math.min(200,Math.max(1,Number(limit||30)))
    ).map(r=>{
      const p=JSON.parse(r.payload_json||"{}");
      return{
        originTs:Number(r.origin_ts),
        modelVersion:r.model_version,
        horizon:Number(r.horizon),
        worldUncertainty:p.worldUncertainty??null,
        divergence:p.divergence??null,
        attractors:p.attractors??[],
        consensusPath:p.consensusPath??[]
      };
    });
  }

  marketGrammarReport(limit=1500) {
    const resolved=this.rows(
      `SELECT * FROM grammar_forecasts
       WHERE resolved_ts IS NOT NULL
       ORDER BY resolved_ts DESC LIMIT ?`,
      Math.min(5000,Math.max(50,Number(limit||1500)))
    ).reverse();
    const latest=this.one(
      "SELECT * FROM grammar_forecasts ORDER BY origin_ts DESC LIMIT 1"
    );
    const latestResolved=resolved.at(-1)||null;
    const n=resolved.length;
    const hit1=n?resolved.filter(r=>Number(r.hit1)===1).length/n:null;
    const hit3=n?resolved.filter(r=>Number(r.hit3)===1).length/n:null;
    const surprises=resolved.map(r=>Number(r.surprise_bits)).filter(Number.isFinite);
    const avgSurprise=surprises.length
      ?surprises.reduce((a,b)=>a+b,0)/surprises.length:null;
    const statuses={};
    for(const r of resolved)statuses[r.status]=(statuses[r.status]||0)+1;
    const drift=grammarDrift(resolved);

    return{
      status:n>=100?"ACTIVE":n>=30?"EARLY":"LEARNING",
      modelVersion:MARKET_GRAMMAR_VERSION,
      resolvedN:n,
      top1Accuracy:hit1,
      top3Accuracy:hit3,
      avgSurpriseBits:avgSurprise,
      perplexity:avgSurprise===null?null:Math.pow(2,avgSurprise),
      statuses,
      drift,
      latestForecast:latest?{
        originTs:Number(latest.origin_ts),
        top1Token:latest.top1_token,
        top1Probability:latest.top1_probability===null?null:Number(latest.top1_probability),
        top:JSON.parse(latest.top_json||"[]"),
        entropyBits:latest.entropy_bits===null?null:Number(latest.entropy_bits),
        normalizedEntropy:latest.normalized_entropy===null?null:Number(latest.normalized_entropy),
        effectiveOrder:Number(latest.effective_order||0),
        support:Number(latest.support||0),
        branchingFactor:Number(latest.branching_factor||0),
        resolvedTs:latest.resolved_ts===null?null:Number(latest.resolved_ts),
        actualToken:latest.actual_token||null,
        status:latest.status
      }:null,
      latestResolved:latestResolved?{
        originTs:Number(latestResolved.origin_ts),
        resolvedTs:Number(latestResolved.resolved_ts),
        actualToken:latestResolved.actual_token,
        actualProbability:Number(latestResolved.actual_probability),
        actualRank:latestResolved.actual_rank===null?null:Number(latestResolved.actual_rank),
        surpriseBits:Number(latestResolved.surprise_bits),
        surprisePercentile:latestResolved.surprise_percentile===null?null:Number(latestResolved.surprise_percentile),
        status:latestResolved.status,
        hit1:Number(latestResolved.hit1)===1,
        hit3:Number(latestResolved.hit3)===1
      }:null,
      note:"Variable-order token grammar with Bayesian-style backoff. Surprise is calibrated against prior resolved forecasts; it is not a price-direction probability."
    };
  }

  recordMarketToken(genome) {
    if(!genome?.ts) return null;
    const existing=this.one("SELECT * FROM market_tokens WHERE ts=?",Number(genome.ts));
    if(existing) {
      return{
        tokenId:existing.token_id,
        grammar:existing.grammar,
        version:existing.language_version,
        components:JSON.parse(existing.components_json||"{}"),
        existing:true
      };
    }

    const extension=this.one("SELECT * FROM market_genome_extensions WHERE ts=?",Number(genome.ts))||{};
    const token=tokenizeMarket(genome,extension,this.macroRiskState(Number(genome.ts)+5*60_000));
    const grammarResult=this.processGrammarObservation(token,Number(genome.ts));

    this.sql.exec(
      `INSERT INTO market_tokens(
        ts,token_id,grammar,language_version,components_json,raw_dimensions,token_dimensions
      ) VALUES(?,?,?,?,?,?,?)`,
      Number(genome.ts),token.tokenId,token.grammar,token.version,
      JSON.stringify(token.components),
      Number(token.compression?.rawDimensions||0),
      Number(token.compression?.tokenDimensions||0)
    );
    const worldResolutions=this.resolveMarketWorlds(token.tokenId,Number(genome.ts));
    return{...token,grammarResult,worldResolutions};
  }

  updateMarketTokenOutcomes() {
    const rows=this.rows(
      `SELECT t.ts,o.ret_fwd_15m,o.ret_fwd_60m,o.ret_fwd_240m
       FROM market_tokens t
       JOIN genome_safe_outcomes o ON o.ts=t.ts
       WHERE t.ret_fwd_240m IS NULL
       ORDER BY t.ts ASC LIMIT 500`
    );
    for(const r of rows){
      this.sql.exec(
        `UPDATE market_tokens SET
          ret_fwd_15m=COALESCE(?,ret_fwd_15m),
          ret_fwd_60m=COALESCE(?,ret_fwd_60m),
          ret_fwd_240m=COALESCE(?,ret_fwd_240m)
         WHERE ts=?`,
        r.ret_fwd_15m??null,r.ret_fwd_60m??null,r.ret_fwd_240m??null,Number(r.ts)
      );
    }
  }

  marketLanguageReport(limit=2500) {
    const rows=this.rows(
      `SELECT * FROM market_tokens ORDER BY ts DESC LIMIT ?`,
      Math.min(10000,Math.max(100,Number(limit||2500)))
    ).reverse();
    if(!rows.length) return {status:"LEARNING",n:0,languageVersion:MARKET_LANGUAGE_VERSION};

    const tokenMap=new Map();
    const transitions=new Map();
    for(const r of rows){
      const x=tokenMap.get(r.token_id)||{
        tokenId:r.token_id,grammar:r.grammar,n:0,ret15:[],ret60:[],ret240:[]
      };
      x.n++;
      if(Number.isFinite(Number(r.ret_fwd_15m)))x.ret15.push(Number(r.ret_fwd_15m));
      if(Number.isFinite(Number(r.ret_fwd_60m)))x.ret60.push(Number(r.ret_fwd_60m));
      if(Number.isFinite(Number(r.ret_fwd_240m)))x.ret240.push(Number(r.ret_fwd_240m));
      tokenMap.set(r.token_id,x);
    }
    for(let i=1;i<rows.length;i++){
      const key=`${rows[i-1].token_id}>${rows[i].token_id}`;
      const x=transitions.get(key)||{from:rows[i-1].token_id,to:rows[i].token_id,n:0,ret60:[]};
      x.n++;
      if(Number.isFinite(Number(rows[i].ret_fwd_60m)))x.ret60.push(Number(rows[i].ret_fwd_60m));
      transitions.set(key,x);
    }
    const avg=xs=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;
    const tokens=[...tokenMap.values()].map(x=>({
      tokenId:x.tokenId,grammar:x.grammar,n:x.n,
      avgForward15m:avg(x.ret15),avgForward60m:avg(x.ret60),avgForward240m:avg(x.ret240)
    })).sort((a,b)=>b.n-a.n);
    const transitionRows=[...transitions.values()].map(x=>({
      from:x.from,to:x.to,n:x.n,avgForward60m:avg(x.ret60)
    })).sort((a,b)=>b.n-a.n);

    const recent=rows.slice(-12);
    const tension=transitionTension(recent);
    return{
      status:rows.length>=100?"ACTIVE":"LEARNING",
      languageVersion:MARKET_LANGUAGE_VERSION,
      n:rows.length,
      uniqueTokens:tokenMap.size,
      latest:rows.at(-1)||null,
      tension,
      commonTokens:tokens.slice(0,30),
      commonTransitions:transitionRows.slice(0,40)
    };
  }

  sequenceMemoryReport(length=4,limit=4000) {
    const L=Math.max(2,Math.min(6,Number(length||4)));
    const rows=this.rows(
      `SELECT ts,token_id,grammar,ret_fwd_15m,ret_fwd_60m,ret_fwd_240m
       FROM market_tokens ORDER BY ts DESC LIMIT ?`,
      Math.min(12000,Math.max(200,Number(limit||4000)))
    ).reverse();
    if(rows.length<L+20) return {status:"LEARNING",n:rows.length,length:L,sequences:[]};

    const map=new Map();
    for(let i=L-1;i<rows.length;i++){
      const slice=rows.slice(i-L+1,i+1);
      const key=sequenceKey(slice,L);
      if(!key) continue;
      const end=rows[i];
      const x=map.get(key)||{sequence:key,n:0,r15:[],r60:[],r240:[]};
      x.n++;
      if(Number.isFinite(Number(end.ret_fwd_15m)))x.r15.push(Number(end.ret_fwd_15m));
      if(Number.isFinite(Number(end.ret_fwd_60m)))x.r60.push(Number(end.ret_fwd_60m));
      if(Number.isFinite(Number(end.ret_fwd_240m)))x.r240.push(Number(end.ret_fwd_240m));
      map.set(key,x);
    }
    const avg=xs=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;
    const sequences=[...map.values()].map(x=>({
      sequence:x.sequence,n:x.n,
      avgForward15m:avg(x.r15),avgForward60m:avg(x.r60),avgForward240m:avg(x.r240),
      positive60m:x.r60.length?x.r60.filter(v=>v>0).length/x.r60.length:null
    })).sort((a,b)=>b.n-a.n);

    const recent=rows.slice(-L);
    const currentKey=sequenceKey(recent,L);
    const current=sequences.find(x=>x.sequence===currentKey)||null;
    const totalWindows=Math.max(1,rows.length-L+1);
    const currentFrequency=current?current.n/totalWindows:0;
    const rarity=1-Math.min(1,currentFrequency*20);

    return{
      status:rows.length>=200?"ACTIVE":"LEARNING",
      n:rows.length,length:L,
      uniqueSequences:map.size,
      currentSequence:currentKey,
      currentStats:current,
      currentRarity:rarity,
      sequences:sequences.slice(0,80),
      note:"Sequence outcomes describe historical observations after the final token in each sequence."
    };
  }

  informationFlowReport(limit=3000) {
    const rows=this.rows(
      `SELECT g.ts,g.ret_5m,g.ret_15m,g.atr_pct,g.volume_ratio,g.oi_change,
        g.funding_rate,g.long_short_ratio,g.liq_imbalance,g.cross_ret_60m,
        g.flow_delta_ratio,g.book_imbalance,g.agreement,g.entropy,g.novelty,
        e.coinbase_premium_bps,e.perp_spot_basis_bps,e.depth_imbalance_01,
        e.liquidity_shock,e.options_iv_30d,e.options_skew_30d,
        e.vix_change,e.sp500_change,e.nasdaq_change,e.usd_change,
        e.us2y_change_bps,e.us10y_change_bps
       FROM market_genomes g
       LEFT JOIN market_genome_extensions e ON e.ts=g.ts
       JOIN genome_provenance p ON p.ts=g.ts AND p.leakage_safe=1
       ORDER BY g.ts DESC LIMIT ?`,
      Math.min(8000,Math.max(200,Number(limit||3000)))
    ).reverse();

    const features=[
      "oi_change","funding_rate","long_short_ratio","liq_imbalance",
      "cross_ret_60m","flow_delta_ratio","book_imbalance","agreement","entropy","novelty",
      "coinbase_premium_bps","perp_spot_basis_bps","depth_imbalance_01","liquidity_shock",
      "options_iv_30d","options_skew_30d","vix_change","sp500_change","nasdaq_change",
      "usd_change","us2y_change_bps","us10y_change_bps"
    ];
    const graph=buildInformationFlowGraph(rows,features,"ret_5m",[1,2,3,6,12]);
    const regime=graphRegime(graph);
    return{...graph,regime};
  }

  refreshInformationFlow() {
    const graph=this.informationFlowReport();
    const ts=Date.now();
    this.sql.exec(
      `INSERT OR REPLACE INTO information_flow_snapshots(
        ts,status,dominant_leader,graph_regime,leader_concentration,payload_json
       ) VALUES(?,?,?,?,?,?)`,
      ts,graph.status,graph.dominantLeader?.source||null,graph.regime?.status||"UNKNOWN",
      graph.leaderConcentration??null,JSON.stringify(graph)
    );
    return{ts,...graph};
  }

  latestInformationFlow() {
    const r=this.one("SELECT * FROM information_flow_snapshots ORDER BY ts DESC LIMIT 1");
    if(!r)return null;
    return{ts:Number(r.ts),...JSON.parse(r.payload_json||"{}")};
  }

  phaseTransitionReport() {
    const lang=this.marketLanguageReport(500);
    const seq=this.sequenceMemoryReport(4,2500);
    const graph=this.latestInformationFlow()||this.informationFlowReport(1500);
    const grammar=this.marketGrammarReport(600);
    const tension=lang.tension||{};
    const rarity=Number(seq.currentRarity||0);
    const leaderConcentration=Number(graph.leaderConcentration||0);
    const grammarSurprise=Number(grammar.latestResolved?.surprisePercentile||0);
    const score=Math.min(1,
      0.38*Number(tension.score||0)+
      0.24*rarity+
      0.16*Math.min(1,leaderConcentration*2)+
      0.22*grammarSurprise
    );
    const status=score>=0.78?"PHASE_TRANSITION":score>=0.58?"TENSION_BUILDING":"STABLE";
    const payload={
      generatedAt:Date.now(),status,score,
      transitionTension:tension,
      currentSequence:seq.currentSequence,
      sequenceRarity:rarity,
      informationLeader:graph.dominantLeader||null,
      informationRegime:graph.regime||null,
      grammarStatus:grammar.latestResolved?.status||"LEARNING",
      grammarSurprisePercentile:grammar.latestResolved?.surprisePercentile??null,
      grammarDrift:grammar.drift||null,
      nextStateForecast:grammar.latestForecast||null,
      note:"This is a structural instability score, not a directional forecast."
    };
    this.sql.exec(
      `INSERT OR REPLACE INTO phase_transition_snapshots(
        ts,status,tension_score,switch_rate,unique_ratio,sequence_rarity,payload_json
       ) VALUES(?,?,?,?,?,?,?)`,
      payload.generatedAt,status,score,tension.switchRate??null,tension.uniqueRatio??null,rarity,
      JSON.stringify(payload)
    );
    return payload;
  }

  buildGenomeExtension(ts) {
    const options=this.latestOptionsContext()||{};
    const premium=this.latestCoinbasePremium()||{};
    const venue=this.latestVenueSnapshot()||{};
    const micro=this.latestSecondaryMicrostructure()||{};
    const macro=this.macroMarketSummary();
    const rows=macro?.rows||[];
    const by=Object.fromEntries(rows.map(r=>[r.series,r]));

    const ext={
      ts:Number(ts),
      options_iv_30d:options.iv_30d===null||options.iv_30d===undefined?null:Number(options.iv_30d),
      options_skew_30d:options.skew_30d===null||options.skew_30d===undefined?null:Number(options.skew_30d),
      options_term_30m7:options.term_30m7===null||options.term_30m7===undefined?null:Number(options.term_30m7),
      coinbase_premium_bps:premium.premium_bps===null||premium.premium_bps===undefined?null:Number(premium.premium_bps),
      venue_spot_diff_bps:venue.spot_cross_diff_bps===null||venue.spot_cross_diff_bps===undefined?null:Number(venue.spot_cross_diff_bps),
      perp_spot_basis_bps:venue.perp_spot_basis_bps===null||venue.perp_spot_basis_bps===undefined?null:Number(venue.perp_spot_basis_bps),
      mark_index_basis_bps:venue.mark_index_basis_bps===null||venue.mark_index_basis_bps===undefined?null:Number(venue.mark_index_basis_bps),
      depth_imbalance_01:micro.depth_imbalance_01===null||micro.depth_imbalance_01===undefined?null:Number(micro.depth_imbalance_01),
      liquidity_shock:micro.liquidity_shock===null||micro.liquidity_shock===undefined?null:Number(micro.liquidity_shock),
      futures_basis:micro.future_basis===null||micro.future_basis===undefined?null:Number(micro.future_basis),
      vix_change:by.VIXCLS?.change===null||by.VIXCLS?.change===undefined?null:Number(by.VIXCLS.change),
      sp500_change:by.SP500?.change===null||by.SP500?.change===undefined?null:Number(by.SP500.change),
      nasdaq_change:by.NASDAQCOM?.change===null||by.NASDAQCOM?.change===undefined?null:Number(by.NASDAQCOM.change),
      usd_change:by.DTWEXBGS?.change===null||by.DTWEXBGS?.change===undefined?null:Number(by.DTWEXBGS.change),
      us2y_change_bps:by.DGS2?.change===null||by.DGS2?.change===undefined?null:Number(by.DGS2.change),
      us10y_change_bps:by.DGS10?.change===null||by.DGS10?.change===undefined?null:Number(by.DGS10.change)
    };
    const fields=Object.entries(ext).filter(([k])=>k!=="ts").map(([,v])=>v);
    ext.source_completeness=fields.length?fields.filter(Number.isFinite).length/fields.length:0;
    return ext;
  }

  recordGenomeExtension(ts) {
    const x=this.buildGenomeExtension(ts);
    const recordedAt=Date.now();
    const options=this.latestOptionsContext()||{};
    const premium=this.latestCoinbasePremium()||{};
    const venue=this.latestVenueSnapshot()||{};
    const micro=this.latestSecondaryMicrostructure()||{};
    const macro=this.macroMarketSummary()||{};
    const macroSourceTs=Number(macro.latestFetch||0)||null;

    this.sql.exec(
      `INSERT OR REPLACE INTO market_genome_extensions(
        ts,options_iv_30d,options_skew_30d,options_term_30m7,coinbase_premium_bps,
        venue_spot_diff_bps,perp_spot_basis_bps,mark_index_basis_bps,
        depth_imbalance_01,liquidity_shock,futures_basis,
        vix_change,sp500_change,nasdaq_change,usd_change,
        us2y_change_bps,us10y_change_bps,source_completeness
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      x.ts,x.options_iv_30d,x.options_skew_30d,x.options_term_30m7,x.coinbase_premium_bps,
      x.venue_spot_diff_bps,x.perp_spot_basis_bps,x.mark_index_basis_bps,
      x.depth_imbalance_01,x.liquidity_shock,x.futures_basis,
      x.vix_change,x.sp500_change,x.nasdaq_change,x.usd_change,
      x.us2y_change_bps,x.us10y_change_bps,x.source_completeness
    );

    const sources={
      options:Number(options.ts||0)||null,
      coinbase:Number(premium.ts||0)||null,
      venue:Number(venue.ts||0)||null,
      micro:Number(micro.ts||0)||null,
      macro:macroSourceTs
    };
    const issues=[];
    for(const [name,sourceTs] of Object.entries(sources)){
      if(sourceTs!==null && sourceTs>recordedAt+5_000) issues.push(`${name}:source_after_ingest`);
    }
    const knownAt=Number(ts)+5*60_000;
    if(recordedAt<knownAt) issues.push("recorded_before_candle_close");

    this.sql.exec(
      `INSERT OR REPLACE INTO genome_provenance(
        ts,known_at_ts,recorded_at_ts,options_source_ts,coinbase_source_ts,
        venue_source_ts,micro_source_ts,macro_source_ts,source_completeness,
        leakage_safe,issues_json
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
      Number(ts),knownAt,recordedAt,
      sources.options,sources.coinbase,sources.venue,sources.micro,sources.macro,
      Number(x.source_completeness||0),issues.length?0:1,JSON.stringify(issues)
    );

    this.sql.exec(
      `INSERT OR IGNORE INTO genome_safe_outcomes(ts,reference_ts)
       VALUES(?,?)`,
      Number(ts),Math.max(knownAt,recordedAt)
    );
    return x;
  }

  recordMarketGenome(ctx) {
    const g=this.buildMarketGenome(ctx);
    this.sql.exec(
      `INSERT OR REPLACE INTO market_genomes(
        ts,price,ret_5m,ret_15m,atr_pct,volume_ratio,ema_distance_pct,level_distance_pct,
        bias_score,oi_change,funding_rate,long_short_ratio,liq_5m,liq_imbalance,cross_ret_60m,
        flow_delta_ratio,spread_bps,book_imbalance,agreement,entropy,novelty,data_quality,
        volume_surprise,oi_surprise,liq_surprise,flow_surprise,state_label,fingerprint
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      g.ts,g.price,g.ret_5m,g.ret_15m,g.atr_pct,g.volume_ratio,g.ema_distance_pct,g.level_distance_pct,
      g.bias_score,g.oi_change,g.funding_rate,g.long_short_ratio,g.liq_5m,g.liq_imbalance,g.cross_ret_60m,
      g.flow_delta_ratio,g.spread_bps,g.book_imbalance,g.agreement,g.entropy,g.novelty,g.data_quality,
      g.volume_surprise,g.oi_surprise,g.liq_surprise,g.flow_surprise,g.state_label,g.fingerprint
    );
    this.recordGenomeExtension(g.ts);
    this.recordMarketToken(g);
    return g;
  }

  updateGenomeOutcomes(nowTs=Date.now()) {
    const rows=this.rows(
      `SELECT ts,price,ret_fwd_15m,ret_fwd_60m,ret_fwd_240m
       FROM market_genomes WHERE ret_fwd_240m IS NULL ORDER BY ts ASC LIMIT 250`
    );
    const horizons=[["ret_fwd_15m",15],["ret_fwd_60m",60],["ret_fwd_240m",240]];
    for(const row of rows){
      const updates=[],vals=[];
      for(const [field,min] of horizons){
        if(row[field]!==null&&row[field]!==undefined) continue;
        const target=Number(row.ts)+min*60_000;
        if(nowTs<target) continue;
        const p=this.nearestAnyClose(target);
        if(!p) continue;
        updates.push(`${field}=?`);
        vals.push((Number(p.close)-Number(row.price))/Number(row.price));
      }
      if(updates.length){
        vals.push(row.ts);
        this.sql.exec(`UPDATE market_genomes SET ${updates.join(",")} WHERE ts=?`,...vals);
      }
    }
  }

  currentGenomeIntelligence(ctx, limit=20) {
    const current=this.buildMarketGenome(ctx);
    const liveRows=this.rows(
      "SELECT *, 'LIVE_GENOME' AS genome_source FROM market_genomes WHERE ts<? ORDER BY ts DESC LIMIT 1500",
      current.ts
    );
    const historicalRows=this.rows(
      `SELECT ts,price,ret_5m,ret_15m,atr_pct,volume_ratio,ema_distance_pct,
        NULL AS level_distance_pct,NULL AS bias_score,oi_change,funding_rate,long_short_ratio,
        NULL AS liq_5m,NULL AS liq_imbalance,cross_ret_60m,NULL AS flow_delta_ratio,
        NULL AS spread_bps,NULL AS book_imbalance,NULL AS agreement,NULL AS entropy,
        NULL AS novelty,data_completeness*100 AS data_quality,
        NULL AS volume_surprise,NULL AS oi_surprise,NULL AS liq_surprise,NULL AS flow_surprise,
        state_label,fingerprint,ret_fwd_15m,ret_fwd_60m,ret_fwd_240m,
        'HISTORICAL_PARTIAL' AS genome_source
       FROM historical_genomes WHERE ts<? ORDER BY ts DESC LIMIT 5000`,
      current.ts
    );
    const rows=[...liveRows,...historicalRows];
    const scored=rows.map(r=>({
      ...r,
      distance:weightedDistance(current,r,GENOME_DISTANCE_FIELDS)
    })).filter(x=>Number.isFinite(x.distance)).sort((a,b)=>a.distance-b.distance);

    const twins=scored.slice(0,Math.max(1,Number(limit||20)));
    const withOutcome=twins.filter(x=>Number.isFinite(Number(x.ret_fwd_60m)));
    const avg60=withOutcome.length
      ? withOutcome.reduce((s,x)=>s+Number(x.ret_fwd_60m),0)/withOutcome.length:null;
    const sameDir=withOutcome.length
      ? withOutcome.filter(x=>Math.sign(Number(x.ret_fwd_60m))===Math.sign(Number(current.ret_15m||current.ret_5m||0))).length/withOutcome.length:null;

    const failure=withOutcome.length
      ? withOutcome.find(x=>Math.sign(Number(x.ret_fwd_60m))!==Math.sign(Number(current.ret_15m||current.ret_5m||0)))||null:null;

    return {
      current,
      sample:twins.length,
      outcomeSample:withOutcome.length,
      avgForward60m:avg60,
      sameDirectionRate:sameDir,
      nearestTwins:twins.slice(0,10),
      nearestFailureTwin:failure
    };
  }

  latestGenome() {
    return this.one("SELECT * FROM market_genomes ORDER BY ts DESC LIMIT 1");
  }

  historicalGenomeCount() {
    return Number(this.one("SELECT COUNT(*) AS n FROM historical_genomes")?.n||0);
  }

  bootstrapHistoricalGenomeChunk(startTs,endTs) {
    const start=Number(startTs),end=Number(endTs);
    if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start) return {written:0,processed:0,lastTs:null};

    const warmup=12*60*60_000;
    const forward=4*60*60_000+5*60_000;
    const candles=this.rows(
      `SELECT ts AS t,open AS o,high AS h,low AS l,close AS c,volume AS v
       FROM historical_5m WHERE ts>=? AND ts<=? ORDER BY ts ASC`,
      start-warmup,end+forward
    ).map(x=>({t:Number(x.t),o:Number(x.o),h:Number(x.h),l:Number(x.l),c:Number(x.c),v:Number(x.v)}));
    if(candles.length<60) return {written:0,processed:0,lastTs:null};

    const closes=candles.map(x=>x.c);
    const emaSeries=(period)=>{
      const a=2/(period+1),out=[closes[0]];
      for(let i=1;i<closes.length;i++) out.push(a*closes[i]+(1-a)*out[i-1]);
      return out;
    };
    const e20=emaSeries(20),e50=emaSeries(50);

    const oi=this.rows(
      "SELECT ts,open_interest FROM open_interest_history WHERE ts>=? AND ts<=? ORDER BY ts ASC",
      start-warmup,end
    );
    const funding=this.rows(
      "SELECT ts,funding_rate FROM funding_history WHERE ts>=? AND ts<=? ORDER BY ts ASC",
      start-24*60*60_000,end
    );
    const ls=this.rows(
      "SELECT ts,long_short_ratio FROM long_short_history WHERE ts>=? AND ts<=? ORDER BY ts ASC",
      start-warmup,end
    );
    const crossRows=this.rows(
      "SELECT ts,symbol,ret_60m FROM cross_asset_history WHERE ts>=? AND ts<=? ORDER BY ts ASC",
      start-warmup,end
    );
    const crossBy={};
    for(const r of crossRows){
      if(!crossBy[r.symbol]) crossBy[r.symbol]=[];
      crossBy[r.symbol].push(r);
    }

    const latestIndex=(arr,ts)=>{
      let lo=0,hi=arr.length-1,best=-1;
      while(lo<=hi){
        const mid=(lo+hi)>>1;
        if(Number(arr[mid].ts)<=ts){best=mid;lo=mid+1;} else hi=mid-1;
      }
      return best;
    };
    const median=xs=>{
      const v=xs.filter(Number.isFinite).sort((a,b)=>a-b);
      if(!v.length)return null;
      const m=Math.floor(v.length/2);
      return v.length%2?v[m]:(v[m-1]+v[m])/2;
    };

    let written=0,processed=0,lastTs=null;
    const atrValues=[];
    for(let i=1;i<candles.length;i++){
      const x=candles[i],prev=candles[i-1];
      const tr=Math.max(x.h-x.l,Math.abs(x.h-prev.c),Math.abs(x.l-prev.c));
      atrValues[i]=prev.c?tr/prev.c:0;
    }

    for(let i=50;i<candles.length-48;i++){
      const x=candles[i];
      if(x.t<start||x.t>=end) continue;
      if(x.t%(15*60_000)!==0) continue;
      processed++;
      lastTs=x.t;

      const ret5=candles[i-1]?.c?x.c/candles[i-1].c-1:null;
      const ret15=candles[i-3]?.c?x.c/candles[i-3].c-1:null;
      const atr14=atrValues.slice(Math.max(1,i-13),i+1).filter(Number.isFinite);
      const atr=atr14.length?atr14.reduce((a,b)=>a+b,0)/atr14.length:null;
      const atrBase=median(atrValues.slice(Math.max(1,i-80),i).filter(Number.isFinite));
      const volReg=atr!==null&&atrBase
        ? (atr/atrBase<0.7?"LOW":atr/atrBase<1.3?"NORMAL":atr/atrBase<2?"HIGH":"EXTREME")
        : "UNKNOWN";
      const volBase=median(candles.slice(Math.max(0,i-20),i).map(z=>z.v));
      const volumeRatio=volBase?x.v/volBase:null;
      const emaMid=(e20[i]+e50[i])/2;
      const emaDist=x.c? (x.c-emaMid)/x.c:null;

      const oiIdx=latestIndex(oi,x.t);
      const oiNow=oiIdx>=0?Number(oi[oiIdx].open_interest):null;
      const oiPrev=oiIdx>0?Number(oi[oiIdx-1].open_interest):null;
      const oiChange=Number.isFinite(oiNow)&&Number.isFinite(oiPrev)&&oiPrev
        ? (oiNow-oiPrev)/oiPrev:null;

      const fIdx=latestIndex(funding,x.t);
      const fundingRate=fIdx>=0?Number(funding[fIdx].funding_rate):null;
      const lIdx=latestIndex(ls,x.t);
      const longShort=lIdx>=0?Number(ls[lIdx].long_short_ratio):null;

      const cv=[];
      for(const arr of Object.values(crossBy)){
        const j=latestIndex(arr,x.t);
        const v=j>=0?Number(arr[j].ret_60m):null;
        if(Number.isFinite(v)) cv.push(v);
      }
      const cross60=cv.length?cv.reduce((a,b)=>a+b,0)/cv.length:null;

      const fields=[oiChange,fundingRate,longShort,cross60];
      const completeness=fields.filter(Number.isFinite).length/fields.length;
      const direction=ret15===null?"FLAT":ret15>0.001?"UP":ret15<-0.001?"DOWN":"FLAT";
      const leverage=oiChange===null?"OI?":oiChange>0.003?"OI_BUILD":oiChange<-0.003?"OI_UNWIND":"OI_FLAT";
      const state=`HIST_${direction}|${volReg}|${leverage}`;
      const fp=[direction,volReg,leverage,
        volumeRatio===null?"V?":Math.round(Math.min(9,Math.max(0,volumeRatio*3))),
        oiChange===null?"O?":Math.round(Math.min(9,Math.max(0,5+oiChange*500)))
      ].join(":");

      const r15=candles[i+3]?.c?candles[i+3].c/x.c-1:null;
      const r60=candles[i+12]?.c?candles[i+12].c/x.c-1:null;
      const r240=candles[i+48]?.c?candles[i+48].c/x.c-1:null;

      const cur=this.sql.exec(
        `INSERT OR IGNORE INTO historical_genomes(
          ts,price,ret_5m,ret_15m,atr_pct,volume_ratio,ema_distance_pct,
          oi_change,funding_rate,long_short_ratio,cross_ret_60m,data_completeness,
          state_label,fingerprint,ret_fwd_15m,ret_fwd_60m,ret_fwd_240m,source
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        x.t,x.c,ret5,ret15,atr,volumeRatio,emaDist,
        oiChange,fundingRate,longShort,cross60,completeness,
        state,fp,r15,r60,r240,"historical_backfill"
      );
      written+=Number(cur.rowsWritten||0);
    }
    return {written,processed,lastTs};
  }

  historicalIntegrityAudit() {
    const b=this.one(
      "SELECT MIN(ts) AS min_ts,MAX(ts) AS max_ts,COUNT(*) AS n FROM historical_5m"
    )||{};
    const n=Number(b.n||0),min=Number(b.min_ts),max=Number(b.max_ts);
    const expected=n&&Number.isFinite(min)&&Number.isFinite(max)
      ? Math.floor((max-min)/(5*60_000))+1 : 0;
    const missing=Math.max(0,expected-n);
    const invalid=Number(this.one(
      `SELECT COUNT(*) AS n FROM historical_5m
       WHERE high<MAX(open,close) OR low>MIN(open,close)
          OR high<low OR volume<0 OR open<=0 OR close<=0`
    )?.n||0);

    let maxGapMs=null;
    try {
      maxGapMs=Number(this.one(
        `SELECT MAX(gap) AS g FROM (
           SELECT ts-LAG(ts) OVER (ORDER BY ts) AS gap FROM historical_5m
         )`
      )?.g||0)||null;
    } catch {}

    const oi=Number(this.one("SELECT COUNT(*) AS n FROM open_interest_history")?.n||0);
    const ls=Number(this.one("SELECT COUNT(*) AS n FROM long_short_history")?.n||0);
    const funding=Number(this.one("SELECT COUNT(*) AS n FROM funding_history")?.n||0);
    const cross=this.rows(
      "SELECT symbol,COUNT(*) AS n,MIN(ts) AS min_ts,MAX(ts) AS max_ts FROM cross_asset_history GROUP BY symbol"
    );
    const completeness=expected?Math.max(0,1-missing/expected):0;
    const score=Math.max(0,Math.min(100,
      completeness*80 + (invalid===0?10:0) + (oi>0&&ls>0&&funding>0?10:0)
    ));
    return {
      score,
      candles:{n,expected,missing,completeness,minTs:min||null,maxTs:max||null,maxGapMs,invalid},
      derivatives:{openInterest:oi,longShort:ls,funding},
      crossAssets:cross
    };
  }

  coverageReport(ctx=null) {
    const summary=this.summary();
    const genomeCount=Number(this.one("SELECT COUNT(*) AS n FROM market_genomes")?.n||0);
    const flowCount=Number(this.one("SELECT COUNT(*) AS n FROM orderflow_5m")?.n||0);
    const currentQuality=ctx
      ? this.dataQuality(ctx)
      : (()=>{const q=this.one("SELECT * FROM data_quality_snapshots ORDER BY ts DESC LIMIT 1");
          return q?{score:Number(q.score),missing:JSON.parse(q.missing_json||"[]"),stale:JSON.parse(q.stale_json||"[]")} : null;})();
    const live=new Set([
      "price_structure","volatility","volume","ema_state","support_resistance","session",
      "open_interest","funding","long_short_ratio","liquidations","cross_asset","news_events",
      "orderflow_delta","spread","book_imbalance","data_quality","novelty","agreement_entropy",
      "historical_twins","walk_forward","cost_model","edge_decay",
      "official_macro_calendar","macro_risk_window","macro_reaction_history",
      "historical_gap_audit","multi_exchange_confirmation","spot_perp_dislocation",
      "data_quality_lock","parameter_stability","historical_genome_bootstrap",
      "sequence_outcomes","change_point_detection","missed_opportunity_analysis",
      "failure_attribution","alert_value_tracking","orderbook_depth","slippage_model",
      "liquidity_sweep_detection","daily_risk_lock","position_sizing",
      "drawdown_monitor","multiple_testing_guard","model_drift_monitor","source_provenance",
      "probability_calibration","shadow_strategies",
      "traditional_risk_assets","usd_rates_context",
      "options_iv_skew","options_term_structure","coinbase_premium",
      "latency_cost_model","risk_of_ruin_simulation","endpoint_auth",
      "information_gain_discovery","interaction_synergy_discovery",
      "feature_redundancy_map","research_governor",
      "evidence_maturity","live_replay_parity","leakage_inspector","promotion_constitution",
      "immutable_prediction_ledger","model_rule_versioning","feature_abstinence","ledger_integrity_audit",
      "market_language","sequence_memory","dynamic_information_flow_graph","phase_transition_radar",
      "market_grammar_predictor","grammar_surprise_detector","grammar_drift_monitor","next_state_forecast",
      "adaptive_memory_horizons","grammar_counterfactuals","memory_routing_plan",
      "feed_latency_monitor","feed_redundancy","lead_lag_network","counterfactuals","hypothesis_falsification",
          ]);
    const partial=new Set([
    ]);
    const features=FEATURE_REGISTRY.map(f=>{
      const status=live.has(f.key)?"LIVE":partial.has(f.key)?"PARTIAL":"PLANNED";
      return {
        ...f,status,
        disadvantageIfMissing:Boolean(f.critical&&status==="PLANNED")
      };
    });
    const critical=features.filter(f=>f.critical);
    const criticalLive=critical.filter(f=>f.status==="LIVE").length;
    const criticalPartial=critical.filter(f=>f.status==="PARTIAL").length;
    const criticalMissing=critical.filter(f=>f.status==="PLANNED").map(f=>f.key);
    const weighted=features.reduce((s,f)=>s+(f.status==="LIVE"?1:f.status==="PARTIAL"?0.5:0),0);
    return {
      features,summary,genomeCount,flowCount,currentQuality,
      historicalIntegrity:this.historicalIntegrityAudit(),
      capabilityAudit:{
        total:features.length,
        live:features.filter(f=>f.status==="LIVE").length,
        partial:features.filter(f=>f.status==="PARTIAL").length,
        planned:features.filter(f=>f.status==="PLANNED").length,
        weightedCoverage:features.length?weighted/features.length:null,
        criticalTotal:critical.length,
        criticalLive,
        criticalPartial,
        criticalMissing,
        criticalCoverage:critical.length?(criticalLive+0.5*criticalPartial)/critical.length:null,
        complete:criticalMissing.length===0&&criticalPartial===0
      }
    };
  }

  historicalBounds() {
    return this.one(
      "SELECT MIN(ts) AS min_ts, MAX(ts) AS max_ts, COUNT(*) AS n FROM historical_5m"
    ) || {min_ts:null,max_ts:null,n:0};
  }

  historicalReplayWindow(startTs,endTs) {
    return this.rows(
      `SELECT ts AS t,open AS o,high AS h,low AS l,close AS c,volume AS v
       FROM historical_5m WHERE ts>=? AND ts<=? ORDER BY ts ASC`,
      Number(startTs),Number(endTs)
    ).map(x=>({
      t:Number(x.t),o:Number(x.o),h:Number(x.h),l:Number(x.l),c:Number(x.c),v:Number(x.v)
    }));
  }

  paramsHash(params) {
    return [
      Number(params.retestTol??0.0012).toFixed(6),
      Number(params.stopBuffer??0.0005).toFixed(6),
      Number(params.minRR??2).toFixed(2),
      Number(params.maxExtension??0.002).toFixed(6)
    ].join("|");
  }

  replayParameterSet() {
    const champion={retestTol:0.0012,stopBuffer:0.0005,minRR:2,maxExtension:0.002};
    const grid=parameterGrid().filter(p =>
      p.stopBuffer===0.0005 &&
      [0.0010,0.0012,0.0016].includes(p.retestTol) &&
      [1.5,2.0,2.5].includes(p.minRR)
    );
    const seen=new Set();
    return [champion,...grid].filter(p=>{
      const h=this.paramsHash(p);
      if(seen.has(h)) return false;
      seen.add(h); return true;
    });
  }

  recordReplayResult(setup,outcome,params) {
    if(!setup||!outcome)return 0;
    const hash=this.paramsHash(params);
    const levelBucket=Math.round(Number(setup.level||setup.entry)/5)*5;
    const signature=`${hash}|${setup.side}|${Number(setup.ts)}|${levelBucket}`;
    const t=setup.trends||{};
    const cur=this.sql.exec(
      `INSERT OR IGNORE INTO replay_results(
        signature,params_hash,params_json,ts,side,entry,stop,target,planned_rr,level,
        result,realized_r,mfe_r,mae_r,closed_ts,trend_5m,trend_15m,trend_1h,trend_4h
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      signature,hash,JSON.stringify(params),Number(setup.ts),setup.side,
      Number(setup.entry),Number(setup.stop),Number(setup.target),Number(setup.planned_rr),
      setup.level??null,outcome.result,outcome.realized_r??null,
      Number(outcome.mfe_r||0),Number(outcome.mae_r||0),outcome.closed_ts??null,
      t["5m"]||null,t["15m"]||null,t["1h"]||null,t["4h"]||null
    );
    const written=Number(cur.rowsWritten||0);
    const row=this.one("SELECT id FROM replay_results WHERE signature=?",signature);
    if(row?.id) {
      this.linkDecisionVersion("REPLAY_RESULT",row.id,{
        params,
        strategyVersion:setup.strategyVersion||STRATEGY_CORE_VERSION
      });
    }
    return written;
  }

  replayStats() {
    const rows=this.rows(
      `SELECT params_hash,params_json,
        COUNT(*) AS n,
        SUM(CASE WHEN result='TARGET' THEN 1 ELSE 0 END) AS wins,
        SUM(CASE WHEN result='STOP' THEN 1 ELSE 0 END) AS losses,
        SUM(CASE WHEN result='AMBIGUOUS' THEN 1 ELSE 0 END) AS ambiguous,
        AVG(CASE WHEN realized_r IS NOT NULL THEN realized_r END) AS avg_r,
        AVG(mfe_r) AS avg_mfe,
        AVG(mae_r) AS avg_mae
       FROM replay_results GROUP BY params_hash,params_json ORDER BY n DESC`
    );
    return rows.map(r=>{
      const wins=Number(r.wins||0),losses=Number(r.losses||0),decided=wins+losses;
      const ci=wilsonInterval(wins,decided);
      return {
        paramsHash:r.params_hash,
        params:JSON.parse(r.params_json),
        n:Number(r.n||0),wins,losses,ambiguous:Number(r.ambiguous||0),
        hitRate:ci.p,hitLow95:ci.low,hitHigh95:ci.high,
        avgR:r.avg_r===null?null:Number(r.avg_r),
        avgMfe:r.avg_mfe===null?null:Number(r.avg_mfe),
        avgMae:r.avg_mae===null?null:Number(r.avg_mae)
      };
    });
  }

  parameterStabilityReport() {
    const stats=this.replayStats();
    if(!stats.length)return {status:"WAITING_FOR_REPLAY",variants:[]};
    const byRR={};
    for(const s of stats){
      const k=`RR_${s.params.minRR}`;
      if(!byRR[k])byRR[k]=[];
      byRR[k].push(s.avgR);
    }
    const neighborhood=Object.entries(byRR).map(([key,vals])=>({
      key,nVariants:vals.length,avgOfAvgR:researchMean(vals.filter(Number.isFinite))
    }));
    return {
      status:stats.length>=5?"ACTIVE":"EARLY",
      variants:stats,
      neighborhood,
      warning:"A single best parameter is not promoted automatically; stable neighborhoods matter more than an isolated optimum."
    };
  }

  positionSizing({balance,entry,stop,riskFraction=0.005}) {
    const bal=Number(balance),e=Number(entry),s=Number(stop);
    const rf=Math.min(0.01,Math.max(0,Number(riskFraction||0.005)));
    if(!(bal>0)||!(e>0)||!(s>0)||e===s) return null;
    const riskPerUnit=Math.abs(e-s);
    const riskAmount=bal*rf;
    const units=riskAmount/riskPerUnit;
    return {
      balance:bal,riskFraction:rf,riskAmount,entry:e,stop:s,
      riskPerUnit,units,notional:units*e,
      note:"Mechanical sizing only; leverage, fees and slippage are not included in this number."
    };
  }

  modelDriftReport() {
    const now=Date.now();
    const windows=[
      {name:"LAST_14D",start:now-14*86400000,end:now},
      {name:"PREV_14D",start:now-28*86400000,end:now-14*86400000},
      {name:"LAST_30D",start:now-30*86400000,end:now},
      {name:"PREV_30D",start:now-60*86400000,end:now-30*86400000}
    ];
    const result=windows.map(w=>{
      const r=this.one(
        `SELECT COUNT(*) AS n,
          AVG(realized_r) AS avg_r,
          SUM(CASE WHEN result='TARGET' THEN 1 ELSE 0 END) AS wins,
          SUM(CASE WHEN result='STOP' THEN 1 ELSE 0 END) AS losses
         FROM setups WHERE opened_ts>=? AND opened_ts<? AND result IN ('TARGET','STOP')`,
        w.start,w.end
      )||{};
      const wins=Number(r.wins||0),losses=Number(r.losses||0),n=wins+losses;
      return {name:w.name,n,avgR:r.avg_r===null?null:Number(r.avg_r),hitRate:n?wins/n:null};
    });
    const a=result.find(x=>x.name==="LAST_14D"),b=result.find(x=>x.name==="PREV_14D");
    const avgDelta=a?.avgR!==null&&b?.avgR!==null&&a?.avgR!==undefined&&b?.avgR!==undefined?a.avgR-b.avgR:null;
    const hitDelta=a?.hitRate!==null&&b?.hitRate!==null&&a?.hitRate!==undefined&&b?.hitRate!==undefined?a.hitRate-b.hitRate:null;
    let status="LEARNING";
    if((a?.n||0)>=8&&(b?.n||0)>=8) {
      status=(avgDelta!==null&&avgDelta<-0.4)||(hitDelta!==null&&hitDelta<-0.15)?"DEGRADING":"STABLE_OR_MIXED";
    }
    return {status,avgRDelta14d:avgDelta,hitRateDelta14d:hitDelta,windows:result};
  }

  executionLatencyCostReport() {
    const rows=this.rows(
      `SELECT entry,stop,realized_r FROM setups
       WHERE realized_r IS NOT NULL AND entry>0 AND stop>0
       ORDER BY closed_ts ASC`
    );
    const scenarios=[0,1,2,5,10,20].map(oneWayBps=>{
      const net=[];
      for(const r of rows) {
        const entry=Number(r.entry),stop=Number(r.stop),gross=Number(r.realized_r);
        const riskPct=Math.abs(entry-stop)/entry;
        if(!(riskPct>0)||!Number.isFinite(gross)) continue;
        const dragR=(oneWayBps/10000)/riskPct;
        net.push(gross-dragR);
      }
      return {
        oneWayEntryDelayBps:oneWayBps,
        n:net.length,
        avgAdjustedR:net.length?net.reduce((a,b)=>a+b,0)/net.length:null,
        totalAdjustedR:net.length?net.reduce((a,b)=>a+b,0):null
      };
    });
    return {
      n:rows.length,
      scenarios,
      note:"Sensitivity model: adverse entry delay/slippage is converted into R using each setup's original stop distance. It is not a measured fill model."
    };
  }

  riskOfRuinBootstrap({
    riskFraction=0.005,
    paths=500,
    tradesPerPath=250,
    ruinEquity=0.5
  }={}) {
    const outcomes=this.rows(
      `SELECT realized_r FROM setups
       WHERE realized_r IS NOT NULL AND result IN ('TARGET','STOP')
       ORDER BY closed_ts ASC`
    ).map(r=>Number(r.realized_r)).filter(Number.isFinite);

    if(outcomes.length<20) {
      return {
        status:"LEARNING",
        n:outcomes.length,
        required:20,
        riskFraction,
        paths,
        tradesPerPath,
        ruinEquity,
        warning:"Not enough resolved paper setups for a useful bootstrap."
      };
    }

    let seed=0x9e3779b9;
    const rand=()=>{
      seed=(Math.imul(seed^seed>>>16,2246822507)+3266489909)>>>0;
      seed^=seed>>>13;
      seed=Math.imul(seed,3266489909)>>>0;
      return (seed>>>0)/4294967296;
    };

    const maxDDs=[];
    const terminal=[];
    let ruined=0;

    for(let p=0;p<paths;p++) {
      let equity=1,peak=1,maxDD=0,hitRuin=false;
      for(let t=0;t<tradesPerPath;t++) {
        const r=outcomes[Math.min(outcomes.length-1,Math.floor(rand()*outcomes.length))];
        equity*=Math.max(0.000001,1+riskFraction*r);
        peak=Math.max(peak,equity);
        const dd=peak>0?1-equity/peak:0;
        maxDD=Math.max(maxDD,dd);
        if(equity<=ruinEquity) hitRuin=true;
      }
      if(hitRuin) ruined++;
      maxDDs.push(maxDD);
      terminal.push(equity);
    }

    const quantile=(xs,q)=>{
      const v=[...xs].sort((a,b)=>a-b);
      if(!v.length) return null;
      return v[Math.min(v.length-1,Math.max(0,Math.floor((v.length-1)*q)))];
    };

    return {
      status:outcomes.length>=50?"USABLE_SAMPLE":"EARLY_SAMPLE",
      n:outcomes.length,
      riskFraction,
      paths,
      tradesPerPath,
      ruinEquity,
      historicalBootstrapRuinRate:ruined/paths,
      medianTerminalEquity:quantile(terminal,0.5),
      terminalEquityP10:quantile(terminal,0.1),
      terminalEquityP90:quantile(terminal,0.9),
      medianMaxDrawdown:quantile(maxDDs,0.5),
      maxDrawdownP90:quantile(maxDDs,0.9),
      warning:"Bootstrap resamples past paper-trade R outcomes. It is a stress test, not a forecast or guaranteed probability."
    };
  }

  riskPolicyState(nowTs=Date.now()) {
    const d=new Date(Number(nowTs));
    const start=Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate());
    const day=this.one(
      `SELECT COUNT(*) AS setups,
        SUM(CASE WHEN realized_r IS NOT NULL THEN realized_r ELSE 0 END) AS realized_r,
        SUM(CASE WHEN result='STOP' THEN 1 ELSE 0 END) AS stops,
        SUM(CASE WHEN result='TARGET' THEN 1 ELSE 0 END) AS targets
       FROM setups WHERE opened_ts>=?`,
      start
    )||{};
    const setups=Number(day.setups||0),realizedR=Number(day.realized_r||0);
    const reasons=[];
    if(setups>=3) reasons.push("MAX_3_SETUPS_UTC_DAY");
    if(realizedR<=-2) reasons.push("DAILY_STOP_MINUS_2R");
    return {
      locked:reasons.length>0,
      reasons,
      dayStartUtc:start,
      setups,
      realizedR,
      stops:Number(day.stops||0),
      targets:Number(day.targets||0),
      policy:{
        paperRiskFraction:0.005,
        hardMaxRiskFraction:0.01,
        maxSetupsPerUtcDay:3,
        dailyStopR:-2,
        minimumPlannedRR:2
      }
    };
  }

  equityResearch() {
    const rows=this.rows(
      `SELECT closed_ts,realized_r FROM setups
       WHERE realized_r IS NOT NULL ORDER BY closed_ts ASC`
    );
    let equity=0,peak=0,maxDrawdown=0,lossStreak=0,maxLossStreak=0;
    for(const r of rows){
      const x=Number(r.realized_r);
      if(!Number.isFinite(x)) continue;
      equity+=x;
      peak=Math.max(peak,equity);
      maxDrawdown=Math.max(maxDrawdown,peak-equity);
      lossStreak=x<0?lossStreak+1:0;
      maxLossStreak=Math.max(maxLossStreak,lossStreak);
    }
    return {n:rows.length,cumulativeR:equity,maxDrawdownR:maxDrawdown,maxLossStreak};
  }

  setupValidationReport() {
    const closed=this.rows(
      `SELECT * FROM setups WHERE result IN ('TARGET','STOP') ORDER BY opened_ts ASC`
    );
    const wins=closed.filter(x=>x.result==="TARGET").length;
    const interval=wilsonInterval(wins,closed.length);
    const grossAvg=researchMean(closed.map(x=>Number(x.realized_r)).filter(Number.isFinite));
    const costScenarios=[4,8,12,20].map(bps=>({
      roundTripBps:bps,
      avgNetR:researchMean(closed.map(x=>costAdjustedR(x,bps)).filter(Number.isFinite))
    }));
    const walkForward=chronologicalBuckets(closed,4).map((bucket,i)=>{
      const w=bucket.filter(x=>x.result==="TARGET").length;
      const ci=wilsonInterval(w,bucket.length);
      return {
        fold:i+1,
        n:bucket.length,
        hitRate:ci.p,
        hitLow95:ci.low,
        hitHigh95:ci.high,
        avgR:researchMean(bucket.map(x=>Number(x.realized_r)).filter(Number.isFinite)),
        startTs:bucket[0]?.opened_ts||null,
        endTs:bucket.at(-1)?.opened_ts||null
      };
    });
    return {
      n:closed.length,
      wins,
      losses:closed.length-wins,
      hitRate:interval.p,
      hitLow95:interval.low,
      hitHigh95:interval.high,
      grossAvgR:grossAvg,
      costScenarios,
      walkForward,
      decay:decayWindows(closed),
      note:"Cost scenarios are sensitivity tests, not assumed broker/exchange fees."
    };
  }

  genomeResearchReport(limit=5000) {
    const rows=this.rows(
      `SELECT * FROM market_genomes WHERE ret_fwd_60m IS NOT NULL
       ORDER BY ts DESC LIMIT ?`,
      Math.min(10000,Math.max(100,Number(limit||5000)))
    );
    const hypotheses=buildHypotheses(rows).slice(0,30);
    const transitions=transitionMatrix(rows).slice(0,40);
    const events=this.recentTimeline(1000);
    const sequences=sequenceDNA(events,5).slice(0,30);
    return {
      sample:rows.length,
      hypotheses,
      transitions,
      sequenceDNA:sequences,
      warning:"Exploratory findings are hypotheses only. They require out-of-sample confirmation before being promoted to a rule."
    };
  }

  alertValueReport() {
    const alerts=this.rows(
      "SELECT ts,stage,side FROM alerts ORDER BY ts DESC LIMIT 5000"
    ).sort((a,b)=>Number(a.ts)-Number(b.ts));
    const setups=this.rows(
      "SELECT opened_ts,side FROM setups ORDER BY opened_ts ASC"
    );
    const groups=new Map();
    for(const a of alerts){
      const key=String(a.stage||"UNKNOWN");
      if(!groups.has(key)) groups.set(key,{stage:key,n:0,toSetup30m:0,toSetup60m:0});
      const g=groups.get(key); g.n++;
      const t=Number(a.ts);
      const same=s=>!a.side||!s.side||String(a.side)===String(s.side);
      if(setups.some(s=>same(s)&&Number(s.opened_ts)>=t&&Number(s.opened_ts)<=t+30*60_000)) g.toSetup30m++;
      if(setups.some(s=>same(s)&&Number(s.opened_ts)>=t&&Number(s.opened_ts)<=t+60*60_000)) g.toSetup60m++;
    }
    return [...groups.values()].map(g=>({
      ...g,
      conversion30m:g.n?g.toSetup30m/g.n:null,
      conversion60m:g.n?g.toSetup60m/g.n:null
    })).sort((a,b)=>b.n-a.n);
  }

  failureAttributionReport() {
    const rows=this.factorEdgeStats();
    const out=[];
    for(const r of rows){
      const wins=Number(r.wins||0),losses=Number(r.losses||0),n=wins+losses;
      if(n<5) continue;
      out.push({
        side:r.side,session:r.session,volatility:r.volatility_regime,
        trend:r.trend_alignment,ema:r.ema_state,n,wins,losses,
        stopRate:n?losses/n:null,
        avgR:r.avg_r===null?null:Number(r.avg_r),
        avgMfe:r.avg_mfe===null?null:Number(r.avg_mfe),
        avgMae:r.avg_mae===null?null:Number(r.avg_mae)
      });
    }
    return out.sort((a,b)=>(b.stopRate??0)-(a.stopRate??0)).slice(0,40);
  }

  sequenceOutcomeReport(length=3) {
    const events=this.recentTimeline(1500).sort((a,b)=>Number(a.ts)-Number(b.ts));
    const groups=new Map();
    for(let i=length-1;i<events.length;i++){
      const seq=events.slice(i-length+1,i+1);
      const end=Number(seq.at(-1).ts);
      const base=this.nearestAnyClose(end);
      const future=this.nearestAnyClose(end+60*60_000);
      if(!base?.close||!future?.close) continue;
      const key=seq.map(e=>`${e.event_type}:${e.subtype||"-"}`).join(">");
      const ret=Number(future.close)/Number(base.close)-1;
      const g=groups.get(key)||{sequence:key,n:0,sum:0,sumAbs:0,pos:0};
      g.n++;g.sum+=ret;g.sumAbs+=Math.abs(ret);if(ret>0)g.pos++;
      groups.set(key,g);
    }
    return [...groups.values()].filter(g=>g.n>=3).map(g=>({
      sequence:g.sequence,n:g.n,
      avgForward60m:g.sum/g.n,
      avgAbsForward60m:g.sumAbs/g.n,
      positiveRate:g.pos/g.n
    })).sort((a,b)=>b.n-a.n).slice(0,50);
  }

  changePointReport() {
    const rows=this.rows(
      `SELECT ts,atr_pct,volume_ratio,oi_change,liq_5m,flow_delta_ratio,
        agreement,entropy,spot_cross_diff_bps
       FROM market_genomes g
       LEFT JOIN venue_snapshots v ON v.ts=(
         SELECT MAX(v2.ts) FROM venue_snapshots v2 WHERE v2.ts<=g.ts
       )
       ORDER BY g.ts DESC LIMIT 240`
    ).reverse();
    if(rows.length<72) return {status:"LEARNING",n:rows.length,score:null,features:[]};
    const recent=rows.slice(-24),base=rows.slice(-120,-24);
    const keys=["atr_pct","volume_ratio","oi_change","liq_5m","flow_delta_ratio","agreement","entropy","spot_cross_diff_bps"];
    const feats=[];
    for(const key of keys){
      const a=base.map(x=>Number(x[key])).filter(Number.isFinite);
      const b=recent.map(x=>Number(x[key])).filter(Number.isFinite);
      if(a.length<20||b.length<6) continue;
      const ma=a.reduce((x,y)=>x+y,0)/a.length;
      const mb=b.reduce((x,y)=>x+y,0)/b.length;
      const sd=Math.sqrt(a.reduce((s,x)=>s+(x-ma)*(x-ma),0)/Math.max(1,a.length-1));
      const z=sd>0?(mb-ma)/sd:0;
      feats.push({feature:key,baseline:ma,recent:mb,zShift:z});
    }
    const score=feats.length?feats.reduce((s,x)=>s+Math.abs(x.zShift),0)/feats.length:null;
    return {
      status:score===null?"LEARNING":score>=2?"MAJOR_SHIFT":score>=1?"SHIFT":"STABLE",
      n:rows.length,score,features:feats.sort((a,b)=>Math.abs(b.zShift)-Math.abs(a.zShift))
    };
  }

  missedOpportunityReport(threshold=0.01,horizonBars=12) {
    const b=this.historicalBounds();
    if(Number(b.n||0)<1500) return {status:"WAITING_FOR_HISTORY",events:0};
    const candles=this.historicalReplayWindow(Number(b.min_ts),Number(b.max_ts));
    const championHash=this.paramsHash({retestTol:0.0012,stopBuffer:0.0005,minRR:2,maxExtension:0.002});
    const setups=this.rows(
      "SELECT ts,side,result,realized_r FROM replay_results WHERE params_hash=? ORDER BY ts ASC",
      championHash
    );
    if(!setups.length) return {status:"WAITING_FOR_REPLAY",events:0};
    const events=[];
    for(let i=0;i+horizonBars<candles.length;i++){
      const ret=candles[i+horizonBars].c/candles[i].c-1;
      if(Math.abs(ret)<threshold) continue;
      const side=ret>0?"LONG":"SHORT",t=Number(candles[i].t);
      const covered=setups.some(s=>
        String(s.side)===side &&
        Number(s.ts)>=t-30*60_000 &&
        Number(s.ts)<=t+15*60_000
      );
      events.push({ts:t,side,forwardReturn:ret,covered});
      i+=horizonBars-1;
    }
    const missed=events.filter(x=>!x.covered);
    return {
      status:"ACTIVE",
      threshold,
      horizonMinutes:horizonBars*5,
      events:events.length,
      covered:events.length-missed.length,
      missed:missed.length,
      coverageRate:events.length?(events.length-missed.length)/events.length:null,
      largestMisses:missed.sort((a,b)=>Math.abs(b.forwardReturn)-Math.abs(a.forwardReturn)).slice(0,20)
    };
  }

  crossMarketLeadResearch() {
    const rows=this.rows(
      `SELECT cross_ret_60m,ret_fwd_60m FROM historical_genomes
       WHERE cross_ret_60m IS NOT NULL AND ret_fwd_60m IS NOT NULL
       ORDER BY ts DESC LIMIT 5000`
    );
    if(rows.length<30) return {status:"LEARNING",n:rows.length,correlation:null};
    const x=rows.map(r=>Number(r.cross_ret_60m)),y=rows.map(r=>Number(r.ret_fwd_60m));
    const mx=x.reduce((a,b)=>a+b,0)/x.length,my=y.reduce((a,b)=>a+b,0)/y.length;
    let num=0,dx=0,dy=0;
    for(let i=0;i<x.length;i++){const a=x[i]-mx,b=y[i]-my;num+=a*b;dx+=a*a;dy+=b*b;}
    const corr=dx>0&&dy>0?num/Math.sqrt(dx*dy):null;
    return {
      status:"ACTIVE",n:rows.length,correlation:corr,
      interpretation:"Correlation between imported cross-asset trailing 60m return and BTC following 60m return; association only, not causality."
    };
  }

  feedLatencyReport(nowTs=Date.now()) {
    const sources=[
      ["btc_live","SELECT MAX(ts) AS ts FROM market_minutes",2*60_000],
      ["context","SELECT MAX(ts) AS ts FROM contexts",10*60_000],
      ["open_interest","SELECT MAX(ts) AS ts FROM open_interest_history",15*60_000],
      ["funding","SELECT MAX(ts) AS ts FROM funding_history",12*60*60_000],
      ["long_short","SELECT MAX(ts) AS ts FROM long_short_history",15*60_000],
      ["cross_asset","SELECT MAX(ts) AS ts FROM cross_asset_history",20*60_000],
      ["orderflow","SELECT MAX(ts) AS ts FROM orderflow_5m",15*60_000],
      ["venue","SELECT MAX(ts) AS ts FROM venue_snapshots",15*60_000],
      ["microstructure","SELECT MAX(ts) AS ts FROM secondary_microstructure",20*60_000],
      ["macro_calendar","SELECT MAX(captured_ts) AS ts FROM macro_events",24*60*60_000],
      ["macro_market","SELECT MAX(fetched_ts) AS ts FROM macro_market_daily",12*60*60_000]
    ];
    const feeds=sources.map(([name,q,threshold])=>{
      const ts=Number(this.one(q)?.ts||0);
      const ageMs=ts?Number(nowTs)-ts:null;
      return {
        name,ts:ts||null,ageMs,thresholdMs:threshold,
        status:!ts?"MISSING":ageMs<=threshold?"FRESH":ageMs<=threshold*2?"DEGRADED":"STALE"
      };
    });
    const fresh=feeds.filter(x=>x.status==="FRESH").length;
    const missing=feeds.filter(x=>x.status==="MISSING").map(x=>x.name);
    const stale=feeds.filter(x=>x.status==="STALE").map(x=>x.name);
    return {
      feeds,
      freshFraction:feeds.length?fresh/feeds.length:null,
      missing,stale,
      status:missing.length||stale.length?"DEGRADED":"HEALTHY"
    };
  }

  leadLagNetworkReport() {
    const symbols=this.rows("SELECT DISTINCT symbol FROM cross_asset_history").map(r=>String(r.symbol));
    const lags=[0,15,30,60];
    const network=[];
    const corr=(pairs)=>{
      if(pairs.length<20) return null;
      const xs=pairs.map(x=>x.x),ys=pairs.map(x=>x.y);
      const mx=researchMean(xs),my=researchMean(ys);
      let num=0,dx=0,dy=0;
      for(let i=0;i<pairs.length;i++){
        const a=xs[i]-mx,b=ys[i]-my;
        num+=a*b;dx+=a*a;dy+=b*b;
      }
      return dx>0&&dy>0?num/Math.sqrt(dx*dy):null;
    };
    for(const symbol of symbols) {
      const rows=this.rows(
        `SELECT ts,ret_60m FROM cross_asset_history
         WHERE symbol=? AND ret_60m IS NOT NULL ORDER BY ts DESC LIMIT 2500`,
        symbol
      );
      for(const lagMin of lags) {
        const pairs=[];
        for(const r of rows) {
          const t=Number(r.ts)+lagMin*60_000;
          const base=this.one(
            "SELECT close FROM historical_5m WHERE ts>=? ORDER BY ts ASC LIMIT 1",t
          );
          const future=this.one(
            "SELECT close FROM historical_5m WHERE ts>=? ORDER BY ts ASC LIMIT 1",t+60*60_000
          );
          if(!base?.close||!future?.close) continue;
          const y=Number(future.close)/Number(base.close)-1;
          const x=Number(r.ret_60m);
          if(Number.isFinite(x)&&Number.isFinite(y)) pairs.push({x,y});
        }
        const r=corr(pairs);
        if(r!==null) network.push({
          symbol,lagMinutes:lagMin,n:pairs.length,correlation:r,
          relation:`${symbol} trailing 60m vs BTC following 60m starting +${lagMin}m`
        });
      }
    }
    return {
      status:network.length?"ACTIVE":"LEARNING",
      edges:network.sort((a,b)=>Math.abs(b.correlation)-Math.abs(a.correlation)),
      warning:"Lead-lag edges are time-shifted associations, not proof that one market causes another."
    };
  }

  matchedCounterfactualReport(limit=150) {
    const championHash=this.paramsHash({retestTol:0.0012,stopBuffer:0.0005,minRR:2,maxExtension:0.002});
    const setups=this.rows(
      `SELECT ts,side,result,realized_r FROM replay_results
       WHERE params_hash=? AND result IN ('TARGET','STOP')
       ORDER BY ts DESC LIMIT ?`,
      championHash,Math.min(300,Math.max(20,Number(limit||150)))
    );
    if(setups.length<10) return {status:"WAITING_FOR_REPLAY",n:setups.length};

    const genomes=this.rows(
      `SELECT ts,ret_5m,ret_15m,atr_pct,volume_ratio,ema_distance_pct,
        oi_change,funding_rate,long_short_ratio,cross_ret_60m,state_label,ret_fwd_60m
       FROM historical_genomes WHERE ret_fwd_60m IS NOT NULL
       ORDER BY ts DESC LIMIT 6000`
    );
    if(genomes.length<100) return {status:"WAITING_FOR_GENOMES",n:genomes.length};

    const setupTimes=setups.map(s=>Number(s.ts));
    const isNearSetup=t=>setupTimes.some(x=>Math.abs(Number(t)-x)<=2*60*60_000);
    const controls=genomes.filter(g=>!isNearSetup(g.ts));
    const fields=[
      ["ret_15m",0.008,1.2],["atr_pct",0.004,1],["volume_ratio",1,0.8],
      ["ema_distance_pct",0.006,0.8],["oi_change",0.01,1],
      ["funding_rate",0.0005,0.5],["cross_ret_60m",0.02,0.7]
    ];
    const distance=(a,b)=>{
      let s=0,w=0;
      for(const [k,scale,wt] of fields){
        const x=Number(a[k]),y=Number(b[k]);
        if(!Number.isFinite(x)||!Number.isFinite(y)) continue;
        const d=(x-y)/scale;s+=wt*d*d;w+=wt;
      }
      return w?Math.sqrt(s/w):Infinity;
    };

    const pairs=[];
    for(const s of setups) {
      const state=this.one(
        "SELECT * FROM historical_genomes WHERE ts<=? ORDER BY ts DESC LIMIT 1",
        Number(s.ts)
      );
      if(!state||!Number.isFinite(Number(state.ret_fwd_60m))) continue;
      let best=null,bestD=Infinity;
      for(const g of controls) {
        if(state.state_label&&g.state_label&&state.state_label!==g.state_label) continue;
        const d=distance(state,g);
        if(d<bestD){bestD=d;best=g;}
      }
      if(!best||!Number.isFinite(Number(best.ret_fwd_60m))) continue;
      const sideSign=String(s.side)==="LONG"?1:-1;
      const treated=Number(state.ret_fwd_60m)*sideSign;
      const control=Number(best.ret_fwd_60m)*sideSign;
      pairs.push({
        setupTs:Number(s.ts),side:s.side,result:s.result,
        treatedDirectional60m:treated,
        controlDirectional60m:control,
        difference:treated-control,
        distance:bestD,
        controlTs:Number(best.ts)
      });
    }
    return {
      status:pairs.length>=30?"ACTIVE":pairs.length?"EARLY":"WAITING",
      n:pairs.length,
      meanTreated:researchMean(pairs.map(x=>x.treatedDirectional60m)),
      meanMatchedControl:researchMean(pairs.map(x=>x.controlDirectional60m)),
      meanDifference:researchMean(pairs.map(x=>x.difference)),
      medianDistance:(()=>{
        const xs=pairs.map(x=>x.distance).filter(Number.isFinite).sort((a,b)=>a-b);
        return xs.length?xs[Math.floor(xs.length/2)]:null;
      })(),
      examples:pairs.slice(0,25),
      warning:"Matched controls reduce obvious context differences but remain observational; this is not causal proof."
    };
  }

  hypothesisFalsificationReport() {
    const rows=this.rows(
      `SELECT * FROM historical_genomes WHERE ret_fwd_60m IS NOT NULL ORDER BY ts ASC LIMIT 10000`
    );
    if(rows.length<120) return {status:"LEARNING",n:rows.length,tests:[]};
    const split=Math.floor(rows.length*0.7);
    const train=rows.slice(0,split),test=rows.slice(split);
    const keys=["volume_ratio","oi_change","funding_rate","long_short_ratio","cross_ret_60m"];
    const tests=[];
    for(const key of keys) {
      const tr=numericFeatureContrast(train,key,"ret_fwd_60m");
      if(!tr) continue;
      const valid=test.filter(r=>Number.isFinite(Number(r[key]))&&Number.isFinite(Number(r.ret_fwd_60m)));
      const lo=valid.filter(r=>Number(r[key])<=tr.median);
      const hi=valid.filter(r=>Number(r[key])>tr.median);
      if(lo.length<10||hi.length<10) continue;
      const loMean=researchMean(lo.map(r=>Number(r.ret_fwd_60m)));
      const hiMean=researchMean(hi.map(r=>Number(r.ret_fwd_60m)));
      const holdoutDiff=(hiMean??0)-(loMean??0);
      const sameSign=Math.sign(holdoutDiff)===Math.sign(Number(tr.difference||0));
      const retained=Math.abs(Number(tr.difference||0))>0
        ? Math.abs(holdoutDiff)/Math.abs(Number(tr.difference))
        : null;
      tests.push({
        feature:key,trainN:tr.lowN+tr.highN,holdoutN:valid.length,
        threshold:tr.median,trainEffect:tr.difference,holdoutEffect:holdoutDiff,
        sameDirection:sameSign,effectRetention:retained,
        verdict:sameSign&&retained!==null&&retained>=0.25?"SURVIVED_HOLDOUT":"FAILED_OR_WEAK"
      });
    }
    return {
      status:tests.length?"ACTIVE":"LEARNING",
      n:rows.length,trainN:train.length,holdoutN:test.length,
      tests,
      survived:tests.filter(x=>x.verdict==="SURVIVED_HOLDOUT").length,
      warning:"Discovery is separated chronologically from falsification. Surviving a holdout is evidence of robustness, not certainty."
    };
  }

  updateSafeGenomeOutcomes(nowTs=Date.now()) {
    const rows=this.rows(
      `SELECT o.ts,o.reference_ts,o.ret_fwd_15m,o.ret_fwd_60m,o.ret_fwd_240m,g.price
       FROM genome_safe_outcomes o
       JOIN market_genomes g ON g.ts=o.ts
       WHERE o.ret_fwd_240m IS NULL
       ORDER BY o.reference_ts ASC LIMIT 300`
    );
    const horizons=[["ret_fwd_15m",15],["ret_fwd_60m",60],["ret_fwd_240m",240]];
    for(const row of rows){
      const updates=[],vals=[];
      for(const [field,min] of horizons){
        if(row[field]!==null&&row[field]!==undefined) continue;
        const target=Number(row.reference_ts)+min*60_000;
        if(Number(nowTs)<target) continue;
        const base=this.nearestAnyClose(Number(row.reference_ts));
        const future=this.nearestAnyClose(target);
        if(!base?.close||!future?.close) continue;
        updates.push(`${field}=?`);
        vals.push(Number(future.close)/Number(base.close)-1);
      }
      if(updates.length){
        vals.push(Number(row.ts));
        this.sql.exec(`UPDATE genome_safe_outcomes SET ${updates.join(",")} WHERE ts=?`,...vals);
      }
    }
    this.updateMarketTokenOutcomes();
  }

  recordParityAudit(nativeDecision,replayDecision,details={}) {
    const compared=compareDecisions(nativeDecision,replayDecision);
    const ts=Date.now();
    this.sql.exec(
      `INSERT OR REPLACE INTO parity_audits(
        ts,strategy_version,match,reason,native_signal,replay_signal,details_json
      ) VALUES(?,?,?,?,?,?,?)`,
      ts,STRATEGY_CORE_VERSION,compared.match?1:0,compared.reason,
      compared.a?.signal||"NONE",compared.b?.signal||"NONE",
      JSON.stringify({...details,comparison:compared})
    );
    return {ts,strategyVersion:STRATEGY_CORE_VERSION,...compared};
  }

  parityReport(limit=200) {
    const rows=this.rows(
      "SELECT * FROM parity_audits ORDER BY ts DESC LIMIT ?",
      Math.min(1000,Math.max(1,Number(limit||200)))
    );
    const matched=rows.filter(r=>Number(r.match)===1).length;
    const reasons={};
    for(const r of rows) reasons[r.reason]=(reasons[r.reason]||0)+1;
    return {
      strategyVersion:STRATEGY_CORE_VERSION,
      n:rows.length,
      matched,
      mismatch:rows.length-matched,
      matchRate:rows.length?matched/rows.length:null,
      reasons,
      latest:rows[0]||null,
      status:rows.length<20?"LEARNING":matched/rows.length>=0.99?"PASS":"FAIL"
    };
  }

  leakageInspectorReport() {
    const provenance=this.rows(
      "SELECT * FROM genome_provenance ORDER BY recorded_at_ts DESC LIMIT 1000"
    );
    const unsafe=provenance.filter(r=>Number(r.leakage_safe)!==1);
    const safeOutcomes=Number(this.one(
      "SELECT COUNT(*) AS n FROM genome_safe_outcomes WHERE ret_fwd_60m IS NOT NULL"
    )?.n||0);
    const legacyLive=Number(this.one(
      "SELECT COUNT(*) AS n FROM market_genomes WHERE ret_fwd_60m IS NOT NULL"
    )?.n||0);
    const issues={};
    for(const r of unsafe){
      for(const x of JSON.parse(r.issues_json||"[]")) issues[x]=(issues[x]||0)+1;
    }
    const safe=unsafe.length===0;
    return {
      safe,
      provenanceN:provenance.length,
      unsafeN:unsafe.length,
      unsafeRate:provenance.length?unsafe.length/provenance.length:null,
      safeOutcomeN:safeOutcomes,
      legacyOutcomeN:legacyLive,
      issues,
      policies:{
        liveOutcomeReference:"max(candle_close, feature_ingest_time)",
        historicalPriceFeatures:"closed 5m candle only",
        historicalExternalFeatures:"as-of lookup at or before historical timestamp",
        researchLiveOutcomeSource:"genome_safe_outcomes only"
      },
      note:"Legacy live genome outcomes remain for backward compatibility but are excluded from the new discovery governor."
    };
  }

  evidenceMaturityReport() {
    const governor=this.latestResearchGovernor()||this.edgeDiscoveryReport();
    const ablation=this.latestFeatureAblation()||this.featureAblationResearchReport();
    const histA=new Map((ablation.historicalCore?.features||[]).map(x=>[x.feature,x]));
    const liveA=new Map((ablation.liveExtended?.features||[]).map(x=>[x.feature,x]));
    const map=[];
    const consume=(dataset,report)=>{
      const aMap=dataset==="HISTORICAL_CORE"?histA:liveA;
      for(const x of report?.governor||[]){
        const n=Number(x?.holdoutN??x?.holdout?.n??0);
        const ab=aMap.get(x.feature)||null;
        let maturity="COLLECTING";
        if(n>=50) maturity="ENOUGH_DATA";
        if(ab?.verdict==="POSSIBLE_NOISE" && n>=50) maturity="REJECTED";
        else if(x.action==="PROMOTE_TO_CHALLENGER_TEST" && ab?.verdict!=="POSSIBLE_NOISE") maturity="HOLDOUT_PASSED";
        map.push({
          dataset,feature:x.feature,n,
          maturity,
          holdoutAction:x.action,
          ablationVerdict:ab?.verdict||null,
          ablationDeltaBrier:ab?.deltaBrier??null,
          ablationDeltaAccuracy:ab?.deltaAccuracy??null,
          discoveryScore:Number(x.discoveryScore||0),
          redundantWith:x.redundantWith||[],
          nextGate:maturity==="HOLDOUT_PASSED"?"SHADOW_TEST":
            maturity==="REJECTED"?"RESEARCH_REVIEW":
            maturity==="ENOUGH_DATA"?"HOLDOUT_STABILITY":"MORE_DATA"
        });
      }
    };
    consume("HISTORICAL_CORE",governor.historicalCore);
    consume("LIVE_EXTENDED",governor.liveExtended);

    const shadows=this.shadowStrategyStats().map(s=>{
      const decided=Number(s.wins||0)+Number(s.losses||0);
      let maturity="COLLECTING";
      if(decided>=30) maturity="ENOUGH_DATA";
      if(decided>=50 && Number(s.avgR)>0) maturity="SHADOW_PASSED";
      return {
        dataset:"SHADOW_STRATEGY",feature:s.variant,n:decided,maturity,
        avgR:s.avgR,hitRate:s.hitRate,
        nextGate:maturity==="SHADOW_PASSED"?"PROMOTION_CONSTITUTION":"MORE_SHADOW_DATA"
      };
    });

    const payload={
      generatedAt:Date.now(),
      features:map,
      strategies:shadows,
      levels:["COLLECTING","ENOUGH_DATA","HOLDOUT_PASSED","SHADOW_PASSED","ROBUST","DECAYING","REJECTED"],
      rule:"Implementation status and evidence maturity are separate. LIVE does not mean empirically validated."
    };
    this.sql.exec(
      "INSERT OR REPLACE INTO evidence_maturity_snapshots(ts,payload_json) VALUES(?,?)",
      payload.generatedAt,JSON.stringify(payload)
    );
    return payload;
  }

  promotionConstitutionReport() {
    const version="PROMOTION_CONSTITUTION_V2";
    const parity=this.parityReport(200);
    const leakage=this.leakageInspectorReport();
    const ledger=this.predictionLedgerAudit(5000);
    const versions=this.versionReport();
    const ablation=this.latestFeatureAblation()||this.featureAblationResearchReport();
    const stability=this.parameterStabilityReport();
    const drift=this.modelDriftReport();
    const quality=this.one("SELECT score FROM data_quality_snapshots ORDER BY ts DESC LIMIT 1");
    const qualityScore=quality?Number(quality.score):null;
    const replay=this.replayStats();
    const championHash=this.paramsHash({retestTol:0.0012,stopBuffer:0.0005,minRR:2,maxExtension:0.002});
    const championReplay=replay.find(x=>x.paramsHash===championHash)||null;

    const gates=[
      {gate:"PARITY",pass:parity.n>=20&&Number(parity.matchRate)>=0.99,metric:parity.matchRate,requirement:"N>=20 and >=99% live/replay match"},
      {gate:"LEAKAGE",pass:leakage.safe,metric:leakage.unsafeRate,requirement:"no detected future-source violations"},
      {gate:"LEDGER_INTEGRITY",pass:ledger.chainValid&&ledger.issueCount===0,metric:ledger.issueCount,requirement:"append-only prediction chain validates with zero integrity issues"},
      {gate:"VERSION_MANIFEST",pass:Boolean(versions.current?.manifestId)&&versions.current?.strategyVersion===STRATEGY_CORE_VERSION,metric:versions.current?.manifestId||null,requirement:"all decisions linked to explicit current manifest"},
      {gate:"DATA_QUALITY",pass:qualityScore!==null&&qualityScore>=75,metric:qualityScore,requirement:">=75/100"},
      {gate:"REPLAY_SAMPLE",pass:Number(championReplay?.wins||0)+Number(championReplay?.losses||0)>=100,metric:Number(championReplay?.wins||0)+Number(championReplay?.losses||0),requirement:">=100 decided replay outcomes"},
      {gate:"REPLAY_EXPECTANCY",pass:Number(championReplay?.avgR)>0,metric:championReplay?.avgR??null,requirement:"average replay R > 0"},
      {gate:"PARAMETER_STABILITY",pass:stability.status==="ACTIVE",metric:stability.status,requirement:"stable parameter neighborhood available"},
      {gate:"MODEL_DRIFT",pass:drift.status!=="DEGRADING",metric:drift.status,requirement:"not degrading"}
    ];

    const shadowCandidates=this.shadowStrategyStats().map(s=>{
      const decided=Number(s.wins||0)+Number(s.losses||0);
      const candidateGates=[
        {gate:"SHADOW_SAMPLE",pass:decided>=50,metric:decided,requirement:">=50 decided shadow outcomes"},
        {gate:"SHADOW_EXPECTANCY",pass:Number(s.avgR)>0,metric:s.avgR,requirement:"average shadow R > 0"},
        {gate:"GLOBAL_GOVERNANCE",pass:gates.every(x=>x.pass),metric:null,requirement:"all system gates pass"}
      ];
      return {
        variant:s.variant,
        eligibleForHumanReview:candidateGates.every(x=>x.pass),
        gates:candidateGates
      };
    });

    const featureCandidates=[];
    const addFeatures=(dataset,report)=>{
      for(const f of report?.features||[]){
        if(f.verdict!=="USEFUL_INCREMENT") continue;
        featureCandidates.push({
          dataset,
          feature:f.feature,
          eligibleForChallengerTest:f.holdoutN>=100 && Number(f.deltaBrier)>0,
          gates:[
            {gate:"HOLDOUT_SAMPLE",pass:f.holdoutN>=100,metric:f.holdoutN,requirement:">=100 holdout observations"},
            {gate:"ABSTINENCE_VALUE",pass:Number(f.deltaBrier)>0,metric:f.deltaBrier,requirement:"removing feature worsens holdout Brier"},
            {gate:"NO_AUTOPROMOTION",pass:true,metric:false,requirement:"challenger test only; no direct champion mutation"}
          ]
        });
      }
    };
    addFeatures("HISTORICAL_CORE",ablation.historicalCore);
    addFeatures("LIVE_EXTENDED",ablation.liveExtended);

    const payload={
      generatedAt:Date.now(),
      constitutionVersion:version,
      automaticPromotion:false,
      championRuleChangesRequireHumanReview:true,
      systemGates:gates,
      systemPass:gates.every(x=>x.pass),
      shadowCandidates,
      featureCandidates:featureCandidates.slice(0,50),
      researchFeaturePolicy:"A feature must survive holdout and abstinence testing before challenger evaluation. No feature can directly alter champion rules.",
      evidence:this.evidenceMaturityReport(),
      versionManifest:versions.current
    };
    this.sql.exec(
      "INSERT OR REPLACE INTO promotion_audits(ts,constitution_version,payload_json) VALUES(?,?,?)",
      payload.generatedAt,version,JSON.stringify(payload)
    );
    return payload;
  }

  featureAblationResearchReport() {
    const historical=this.rows(
      `SELECT ts,ret_5m,ret_15m,atr_pct,volume_ratio,ema_distance_pct,
        oi_change,funding_rate,long_short_ratio,cross_ret_60m,data_completeness,
        ret_fwd_60m
       FROM historical_genomes
       WHERE ret_fwd_60m IS NOT NULL
       ORDER BY ts ASC LIMIT 10000`
    );
    const historicalFeatures=[
      "ret_5m","ret_15m","atr_pct","volume_ratio","ema_distance_pct",
      "oi_change","funding_rate","long_short_ratio","cross_ret_60m","data_completeness"
    ];

    const live=this.rows(
      `SELECT g.ts,g.ret_5m,g.ret_15m,g.atr_pct,g.volume_ratio,g.ema_distance_pct,
        g.level_distance_pct,g.bias_score,g.oi_change,g.funding_rate,g.long_short_ratio,
        g.liq_5m,g.liq_imbalance,g.cross_ret_60m,g.flow_delta_ratio,g.spread_bps,
        g.book_imbalance,g.agreement,g.entropy,g.novelty,g.data_quality,
        e.options_iv_30d,e.options_skew_30d,e.options_term_30m7,
        e.coinbase_premium_bps,e.venue_spot_diff_bps,e.perp_spot_basis_bps,
        e.mark_index_basis_bps,e.depth_imbalance_01,e.liquidity_shock,e.futures_basis,
        e.vix_change,e.sp500_change,e.nasdaq_change,e.usd_change,
        e.us2y_change_bps,e.us10y_change_bps,e.source_completeness,
        o.ret_fwd_60m
       FROM market_genomes g
       LEFT JOIN market_genome_extensions e ON e.ts=g.ts
       JOIN genome_safe_outcomes o ON o.ts=g.ts
       JOIN genome_provenance p ON p.ts=g.ts AND p.leakage_safe=1
       WHERE o.ret_fwd_60m IS NOT NULL
       ORDER BY g.ts ASC LIMIT 5000`
    );
    const liveFeatures=[
      "ret_5m","ret_15m","atr_pct","volume_ratio","ema_distance_pct","level_distance_pct",
      "bias_score","oi_change","funding_rate","long_short_ratio","liq_5m","liq_imbalance",
      "cross_ret_60m","flow_delta_ratio","spread_bps","book_imbalance","agreement","entropy",
      "novelty","data_quality","options_iv_30d","options_skew_30d","options_term_30m7",
      "coinbase_premium_bps","venue_spot_diff_bps","perp_spot_basis_bps","mark_index_basis_bps",
      "depth_imbalance_01","liquidity_shock","futures_basis","vix_change","sp500_change",
      "nasdaq_change","usd_change","us2y_change_bps","us10y_change_bps","source_completeness"
    ];

    return {
      generatedAt:Date.now(),
      historicalCore:featureAblationReport(historical,historicalFeatures,"ret_fwd_60m"),
      liveExtended:featureAblationReport(live,liveFeatures,"ret_fwd_60m"),
      policy:{
        automaticRemoval:false,
        automaticLiveWeighting:false,
        action:"Features with low or negative incremental holdout value are deprioritized for research, not silently removed from raw data collection."
      }
    };
  }

  refreshFeatureAblation() {
    const report=this.featureAblationResearchReport();
    const ts=Date.now();
    this.sql.exec(
      `INSERT OR REPLACE INTO feature_ablation_snapshots(ts,historical_json,live_json)
       VALUES(?,?,?)`,
      ts,
      JSON.stringify(report.historicalCore),
      JSON.stringify(report.liveExtended)
    );
    return {ts,...report};
  }

  latestFeatureAblation() {
    const r=this.one("SELECT * FROM feature_ablation_snapshots ORDER BY ts DESC LIMIT 1");
    if(!r) return null;
    return {
      ts:Number(r.ts),
      historicalCore:JSON.parse(r.historical_json||"{}"),
      liveExtended:JSON.parse(r.live_json||"{}")
    };
  }

  adaptiveMemoryReport() {
    const historical=this.rows(
      `SELECT ts,ret_5m,ret_15m,atr_pct,volume_ratio,ema_distance_pct,
        oi_change,funding_rate,long_short_ratio,cross_ret_60m,data_completeness,
        ret_fwd_60m
       FROM historical_genomes
       WHERE ret_fwd_60m IS NOT NULL
       ORDER BY ts ASC LIMIT 10000`
    );
    const historicalFeatures=[
      "ret_5m","ret_15m","atr_pct","volume_ratio","ema_distance_pct",
      "oi_change","funding_rate","long_short_ratio","cross_ret_60m","data_completeness"
    ];

    const live=this.rows(
      `SELECT g.ts,g.ret_5m,g.ret_15m,g.atr_pct,g.volume_ratio,g.ema_distance_pct,
        g.level_distance_pct,g.bias_score,g.oi_change,g.funding_rate,g.long_short_ratio,
        g.liq_5m,g.liq_imbalance,g.cross_ret_60m,g.flow_delta_ratio,g.spread_bps,
        g.book_imbalance,g.agreement,g.entropy,g.novelty,g.data_quality,
        e.options_iv_30d,e.options_skew_30d,e.options_term_30m7,
        e.coinbase_premium_bps,e.venue_spot_diff_bps,e.perp_spot_basis_bps,
        e.mark_index_basis_bps,e.depth_imbalance_01,e.liquidity_shock,e.futures_basis,
        e.vix_change,e.sp500_change,e.nasdaq_change,e.usd_change,
        e.us2y_change_bps,e.us10y_change_bps,e.source_completeness,
        o.ret_fwd_60m
       FROM market_genomes g
       LEFT JOIN market_genome_extensions e ON e.ts=g.ts
       JOIN genome_safe_outcomes o ON o.ts=g.ts
       JOIN genome_provenance p ON p.ts=g.ts AND p.leakage_safe=1
       WHERE o.ret_fwd_60m IS NOT NULL
       ORDER BY g.ts ASC LIMIT 5000`
    );
    const liveFeatures=[
      "ret_5m","ret_15m","atr_pct","volume_ratio","ema_distance_pct","level_distance_pct",
      "bias_score","oi_change","funding_rate","long_short_ratio","liq_5m","liq_imbalance",
      "cross_ret_60m","flow_delta_ratio","spread_bps","book_imbalance","agreement","entropy",
      "novelty","data_quality","options_iv_30d","options_skew_30d","options_term_30m7",
      "coinbase_premium_bps","venue_spot_diff_bps","perp_spot_basis_bps","mark_index_basis_bps",
      "depth_imbalance_01","liquidity_shock","futures_basis","vix_change","sp500_change",
      "nasdaq_change","usd_change","us2y_change_bps","us10y_change_bps","source_completeness"
    ];

    const historicalCore=learnFeatureMemory(historical,historicalFeatures,"ret_fwd_60m");
    const liveExtended=learnFeatureMemory(live,liveFeatures,"ret_fwd_60m");
    return{
      generatedAt:Date.now(),
      version:ADAPTIVE_MEMORY_VERSION,
      historicalCore,
      liveExtended,
      routing:{
        historicalCore:memoryRoutingPlan(historicalCore),
        liveExtended:memoryRoutingPlan(liveExtended)
      },
      policy:"Memory horizons route research windows only. They do not automatically alter champion strategy rules."
    };
  }

  refreshAdaptiveMemory() {
    const report=this.adaptiveMemoryReport();
    const ts=Date.now();
    this.sql.exec(
      `INSERT OR REPLACE INTO adaptive_memory_snapshots(
        ts,version,historical_json,live_json,routing_json
      ) VALUES(?,?,?,?,?)`,
      ts,ADAPTIVE_MEMORY_VERSION,
      JSON.stringify(report.historicalCore),
      JSON.stringify(report.liveExtended),
      JSON.stringify(report.routing)
    );
    return{ts,...report};
  }

  latestAdaptiveMemory() {
    const r=this.one("SELECT * FROM adaptive_memory_snapshots ORDER BY ts DESC LIMIT 1");
    if(!r)return null;
    return{
      ts:Number(r.ts),version:r.version,
      historicalCore:JSON.parse(r.historical_json||"{}"),
      liveExtended:JSON.parse(r.live_json||"{}"),
      routing:JSON.parse(r.routing_json||"{}")
    };
  }

  grammarCounterfactualReport(limit=3500) {
    const rows=this.rows(
      `SELECT ts,token_id,grammar,components_json,ret_fwd_15m,ret_fwd_60m,ret_fwd_240m
       FROM market_tokens ORDER BY ts DESC LIMIT ?`,
      Math.min(8000,Math.max(200,Number(limit||3500)))
    ).reverse();
    if(rows.length<30)return{
      status:"LEARNING",version:GRAMMAR_COUNTERFACTUAL_VERSION,n:rows.length,features:[]
    };

    const parsed=rows.map((r,i)=>({
      ts:Number(r.ts),
      tokenId:String(r.token_id),
      grammar:r.grammar,
      components:JSON.parse(r.components_json||"{}"),
      ret15:r.ret_fwd_15m===null?null:Number(r.ret_fwd_15m),
      ret60:r.ret_fwd_60m===null?null:Number(r.ret_fwd_60m),
      ret240:r.ret_fwd_240m===null?null:Number(r.ret_fwd_240m),
      nextToken:i+1<rows.length?String(rows[i+1].token_id):null
    }));
    const current=parsed.at(-1);
    const history=parsed.slice(0,-1).filter(r=>r.ret60!==null||r.nextToken);

    const report=grammarCounterfactuals({current,history});
    return{
      ...report,
      generatedAt:Date.now(),
      n:history.length,
      note:"Counterfactuals compare matched historical grammar states that differ on one selected component while allowing limited mismatch on other components."
    };
  }

  refreshGrammarCounterfactuals() {
    const report=this.grammarCounterfactualReport();
    const ts=Date.now();
    this.sql.exec(
      `INSERT OR REPLACE INTO grammar_counterfactual_snapshots(
        ts,version,token_id,payload_json
      ) VALUES(?,?,?,?)`,
      ts,GRAMMAR_COUNTERFACTUAL_VERSION,report.current?.tokenId||null,JSON.stringify(report)
    );
    return{ts,...report};
  }

  latestGrammarCounterfactuals() {
    const r=this.one("SELECT * FROM grammar_counterfactual_snapshots ORDER BY ts DESC LIMIT 1");
    if(!r)return null;
    return{ts:Number(r.ts),version:r.version,...JSON.parse(r.payload_json||"{}")};
  }

  edgeDiscoveryReport() {
    const historical=this.rows(
      `SELECT ts,ret_5m,ret_15m,atr_pct,volume_ratio,ema_distance_pct,
        oi_change,funding_rate,long_short_ratio,cross_ret_60m,data_completeness,
        ret_fwd_60m
       FROM historical_genomes
       WHERE ret_fwd_60m IS NOT NULL
       ORDER BY ts ASC LIMIT 10000`
    );
    const historicalFeatures=[
      "ret_5m","ret_15m","atr_pct","volume_ratio","ema_distance_pct",
      "oi_change","funding_rate","long_short_ratio","cross_ret_60m","data_completeness"
    ];

    const live=this.rows(
      `SELECT g.ts,g.ret_5m,g.ret_15m,g.atr_pct,g.volume_ratio,g.ema_distance_pct,
        g.level_distance_pct,g.bias_score,g.oi_change,g.funding_rate,g.long_short_ratio,
        g.liq_5m,g.liq_imbalance,g.cross_ret_60m,g.flow_delta_ratio,g.spread_bps,
        g.book_imbalance,g.agreement,g.entropy,g.novelty,g.data_quality,
        e.options_iv_30d,e.options_skew_30d,e.options_term_30m7,
        e.coinbase_premium_bps,e.venue_spot_diff_bps,e.perp_spot_basis_bps,
        e.mark_index_basis_bps,e.depth_imbalance_01,e.liquidity_shock,e.futures_basis,
        e.vix_change,e.sp500_change,e.nasdaq_change,e.usd_change,
        e.us2y_change_bps,e.us10y_change_bps,e.source_completeness,
        o.ret_fwd_60m
       FROM market_genomes g
       LEFT JOIN market_genome_extensions e ON e.ts=g.ts
       JOIN genome_safe_outcomes o ON o.ts=g.ts
       JOIN genome_provenance p ON p.ts=g.ts AND p.leakage_safe=1
       WHERE o.ret_fwd_60m IS NOT NULL
       ORDER BY g.ts ASC LIMIT 5000`
    );
    const liveFeatures=[
      "ret_5m","ret_15m","atr_pct","volume_ratio","ema_distance_pct","level_distance_pct",
      "bias_score","oi_change","funding_rate","long_short_ratio","liq_5m","liq_imbalance",
      "cross_ret_60m","flow_delta_ratio","spread_bps","book_imbalance","agreement","entropy",
      "novelty","data_quality","options_iv_30d","options_skew_30d","options_term_30m7",
      "coinbase_premium_bps","venue_spot_diff_bps","perp_spot_basis_bps","mark_index_basis_bps",
      "depth_imbalance_01","liquidity_shock","futures_basis","vix_change","sp500_change",
      "nasdaq_change","usd_change","us2y_change_bps","us10y_change_bps","source_completeness"
    ];

    const historicalReport=discoverInformationEdges(historical,historicalFeatures,"ret_fwd_60m");
    const liveReport=discoverInformationEdges(live,liveFeatures,"ret_fwd_60m");

    const ablation=this.latestFeatureAblation()||this.featureAblationResearchReport();
    const adaptiveMemory=this.latestAdaptiveMemory()||this.adaptiveMemoryReport();
    const historicalAblation=new Map(
      (ablation.historicalCore?.features||[]).map(x=>[x.feature,x])
    );
    const liveAblation=new Map(
      (ablation.liveExtended?.features||[]).map(x=>[x.feature,x])
    );
    const historicalMemory=new Map(
      (adaptiveMemory.historicalCore?.features||[]).map(x=>[x.feature,x])
    );
    const liveMemory=new Map(
      (adaptiveMemory.liveExtended?.features||[]).map(x=>[x.feature,x])
    );
    const abstinencePass=(dataset,feature)=>{
      const x=(dataset==="HISTORICAL_CORE"?historicalAblation:liveAblation).get(feature);
      if(!x) return true;
      return x.verdict!=="POSSIBLE_NOISE";
    };

    const promoted=[
      ...(historicalReport.governor||[])
        .filter(x=>x.action==="PROMOTE_TO_CHALLENGER_TEST" && abstinencePass("HISTORICAL_CORE",x.feature))
        .map(x=>({dataset:"HISTORICAL_CORE",type:"FEATURE",ablation:historicalAblation.get(x.feature)||null,memory:historicalMemory.get(x.feature)||null,...x})),
      ...(historicalReport.interactionGovernor||[])
        .map(x=>({dataset:"HISTORICAL_CORE",type:"INTERACTION",...x})),
      ...(liveReport.governor||[])
        .filter(x=>x.action==="PROMOTE_TO_CHALLENGER_TEST" && abstinencePass("LIVE_EXTENDED",x.feature))
        .map(x=>({dataset:"LIVE_EXTENDED",type:"FEATURE",ablation:liveAblation.get(x.feature)||null,memory:liveMemory.get(x.feature)||null,...x})),
      ...(liveReport.interactionGovernor||[])
        .map(x=>({dataset:"LIVE_EXTENDED",type:"INTERACTION",...x}))
    ].sort((a,b)=>Number(b.discoveryScore||0)-Number(a.discoveryScore||0));

    return {
      generatedAt:Date.now(),
      historicalCore:historicalReport,
      liveExtended:liveReport,
      featureAblation:ablation,
      adaptiveMemory,
      promotedToChallengerTest:promoted.slice(0,30),
      policy:{
        automaticChampionChanges:false,
        liveTradeRulesUntouched:true,
        objective:"Identify incremental information and interaction synergy while penalizing redundancy and requiring chronological holdout survival."
      }
    };
  }

  refreshResearchGovernor() {
    const report=this.edgeDiscoveryReport();
    const ts=Date.now();
    const promoted=report.promotedToChallengerTest||[];
    this.sql.exec(
      `INSERT OR REPLACE INTO research_governor_snapshots(
        ts,historical_n,live_n,historical_json,live_json,promoted_json
      ) VALUES(?,?,?,?,?,?)`,
      ts,
      Number(report.historicalCore?.n||0),
      Number(report.liveExtended?.n||0),
      JSON.stringify(report.historicalCore),
      JSON.stringify(report.liveExtended),
      JSON.stringify(promoted)
    );
    return {ts,...report};
  }

  latestResearchGovernor() {
    const r=this.one("SELECT * FROM research_governor_snapshots ORDER BY ts DESC LIMIT 1");
    if(!r) return null;
    return {
      ts:Number(r.ts),
      historicalN:Number(r.historical_n||0),
      liveN:Number(r.live_n||0),
      historicalCore:JSON.parse(r.historical_json||"{}"),
      liveExtended:JSON.parse(r.live_json||"{}"),
      promotedToChallengerTest:JSON.parse(r.promoted_json||"[]")
    };
  }

  fullResearchReport(ctx=null) {
    return {
      generatedAt:Date.now(),
      validation:this.setupValidationReport(),
      genomeResearch:this.genomeResearchReport(),
      currentGenome:ctx?this.currentGenomeIntelligence(ctx,30):null,
      coverage:this.coverageReport(ctx),
      replay:this.replayStats(),
      parameterStability:this.parameterStabilityReport(),
      macro:{
        risk:this.macroRiskState(),
        upcoming:this.upcomingMacro(20),
        stats:this.macroStats(),
        health:this.macroCalendarHealth()
      },
      historicalIntegrity:this.historicalIntegrityAudit(),
      venue:this.venueStats(),
      microstructure:this.secondaryMicrostructureSummary(),
      macroMarket:this.macroMarketSummary(),
      options:this.optionsResearchSummary(),
      coinbasePremium:this.coinbasePremiumSummary(),
      risk:this.riskPolicyState(),
      equity:this.equityResearch(),
      alertValue:this.alertValueReport(),
      failureAttribution:this.failureAttributionReport(),
      sequenceOutcomes:this.sequenceOutcomeReport(),
      changePoint:this.changePointReport(),
      missedOpportunities:this.missedOpportunityReport(),
      crossMarketLead:this.crossMarketLeadResearch(),
      modelDrift:this.modelDriftReport(),
      probabilityCalibration:this.probabilityCalibrationReport(),
      shadowStrategies:this.shadowStrategyStats(),
      latencyCost:this.executionLatencyCostReport(),
      riskOfRuin:this.riskOfRuinBootstrap(),
      feedLatency:this.feedLatencyReport(),
      leadLagNetwork:this.leadLagNetworkReport(),
      counterfactuals:this.matchedCounterfactualReport(),
      falsification:this.hypothesisFalsificationReport(),
      informationDiscovery:this.latestResearchGovernor()||this.edgeDiscoveryReport(),
      featureAblation:this.latestFeatureAblation()||this.featureAblationResearchReport(),
      marketLanguage:this.marketLanguageReport(),
      sequenceMemory:this.sequenceMemoryReport(),
      informationFlow:this.latestInformationFlow()||this.informationFlowReport(),
      phaseTransition:this.phaseTransitionReport(),
      marketGrammar:this.marketGrammarReport(),
      adaptiveMemory:this.latestAdaptiveMemory()||this.adaptiveMemoryReport(),
      grammarCounterfactuals:this.latestGrammarCounterfactuals()||this.grammarCounterfactualReport(),
      marketWorld:this.latestMarketWorld()||this.buildMarketWorldReport(),
      marketWorldCalibration:this.marketWorldCalibrationReport(),
      versions:this.versionReport(),
      predictionLedger:this.predictionLedgerAudit(),
      parity:this.parityReport(),
      leakage:this.leakageInspectorReport(),
      evidenceMaturity:this.evidenceMaturityReport(),
      promotionConstitution:this.promotionConstitutionReport()
    };
  }

  recentTimeline(limit=100) {
    return this.rows(
      "SELECT * FROM market_timeline ORDER BY ts DESC LIMIT ?",
      Math.min(500,Math.max(1,Number(limit||100)))
    );
  }

  recordHistorical5m(rows, source = "bybit") {
    let written = 0;
    for (const row of rows || []) {
      const cur = this.sql.exec(
        `INSERT OR IGNORE INTO historical_5m(ts, open, high, low, close, volume, source)
         VALUES(?,?,?,?,?,?,?)`,
        Number(row.t), Number(row.o), Number(row.h), Number(row.l),
        Number(row.c), Number(row.v), source
      );
      written += Number(cur.rowsWritten || 0);
    }
    return written;
  }

  historical5mCount() {
    return Number(this.one("SELECT COUNT(*) AS n FROM historical_5m")?.n || 0);
  }

  recordMinute({ ts, open, high, low, close, volume, source = "binance" }) {
    this.sql.exec(
      `INSERT OR IGNORE INTO market_minutes(ts, open, high, low, close, volume, source)
       VALUES(?, ?, ?, ?, ?, ?, ?)`,
      ts, open, high, low, close, volume, source
    );
  }

  recordContext(ctx, reason = "") {
    const ts = Number(ctx?.c5?.at(-1)?.t || Date.now());
    this.sql.exec(
      `INSERT OR REPLACE INTO contexts(
        ts, price, trend_5m, trend_15m, trend_1h, trend_4h, bias_score,
        ema20, ema50, support, resistance, reason
      ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ts,
      Number(ctx.price),
      ctx.trends?.["5m"] || null,
      ctx.trends?.["15m"] || null,
      ctx.trends?.["1h"] || null,
      ctx.trends?.["4h"] || null,
      Number(ctx.score || 0),
      Number(ctx.ema20 || 0),
      Number(ctx.ema50 || 0),
      ctx.support ?? null,
      ctx.resistance ?? null,
      reason
    );
  }

  recordAlert({ key, stage, side = null, level = null, price = null, payload = null }) {
    const ts=Date.now();
    this.sql.exec(
      `INSERT INTO alerts(ts, alert_key, stage, side, level, price, payload_json)
       VALUES(?, ?, ?, ?, ?, ?, ?)`,
      ts, key, stage, side, level, price,
      payload ? JSON.stringify(payload) : null
    );
    this.recordTimeline({
      ts,eventType:"ALERT",subtype:stage,direction:side==="LONG"?1:side==="SHORT"?-1:null,
      magnitude:level,source:"system",payload:{key,price,...(payload||{})}
    });
  }

  sessionFor(ts) {
    const h = new Date(Number(ts)).getUTCHours();
    if (h < 7) return "ASIA_00_07_UTC";
    if (h < 13) return "EUROPE_07_13_UTC";
    if (h < 16) return "NY_OPEN_13_16_UTC";
    if (h < 21) return "US_16_21_UTC";
    return "LATE_21_24_UTC";
  }

  median(values) {
    const xs = values.filter(Number.isFinite).sort((a,b) => a-b);
    if (!xs.length) return 0;
    const m = Math.floor(xs.length/2);
    return xs.length % 2 ? xs[m] : (xs[m-1] + xs[m]) / 2;
  }

  factorsFromContext(ctx) {
    const c5 = Array.isArray(ctx?.c5) ? ctx.c5 : [];
    const latest = c5.at(-1);
    const ts = Number(latest?.t || Date.now());
    const price = Number(ctx?.price || latest?.c || 0);
    const recent = c5.slice(-101);
    const trs = [];
    for (let i=1;i<recent.length;i++) {
      const cur=recent[i], prev=recent[i-1];
      const tr=Math.max(
        cur.h-cur.l,
        Math.abs(cur.h-prev.c),
        Math.abs(cur.l-prev.c)
      );
      trs.push(prev.c ? tr/prev.c : 0);
    }
    const atr14 = trs.slice(-14).reduce((a,b)=>a+b,0) / Math.max(1, Math.min(14, trs.length));
    const baseline = this.median(trs.slice(-80));
    const volRatio = baseline > 0 ? atr14 / baseline : 1;
    const volatility_regime = volRatio < 0.70 ? "LOW"
      : volRatio < 1.30 ? "NORMAL"
      : volRatio < 2.00 ? "HIGH"
      : "EXTREME";

    const vols = c5.slice(-21,-1).map(x => Number(x.v));
    const volMedian = this.median(vols);
    const volume_ratio = volMedian > 0 && latest ? Number(latest.v)/volMedian : 1;

    const t = ctx?.trends || {};
    const bull = ["4h","1h","15m","5m"].filter(tf => t[tf] === "BULLISH").length;
    const bear = ["4h","1h","15m","5m"].filter(tf => t[tf] === "BEARISH").length;
    const trend_alignment = bull === 4 ? "ALL_BULL"
      : bear === 4 ? "ALL_BEAR"
      : bull >= 3 ? "BULL_ALIGNED"
      : bear >= 3 ? "BEAR_ALIGNED"
      : "MIXED";

    const e20=Number(ctx?.ema20||0), e50=Number(ctx?.ema50||0);
    const ema_state = price > e20 && price > e50 ? "ABOVE_BOTH"
      : price < e20 && price < e50 ? "BELOW_BOTH"
      : "BETWEEN";

    const levels=[ctx?.support,ctx?.resistance]
      .filter(x => typeof x === "number" && x > 0)
      .map(x => Math.abs(price-x)/price);
    const distance_level_pct = levels.length ? Math.min(...levels) : null;

    const patterns = this.detectPatterns(c5).map(x => x[0]);
    const recentNews = Number(this.one(
      "SELECT COUNT(*) AS n FROM news_events WHERE published_ts >= ?",
      ts - 60*60*1000
    )?.n || 0);

    return {
      ts,
      close: price,
      session: this.sessionFor(ts),
      volatility_regime,
      atr_pct: atr14,
      volume_ratio,
      trend_alignment,
      ema_state,
      distance_level_pct,
      pattern_tags: patterns.join(","),
      recent_news_60m: recentNews
    };
  }

  recordFactorSnapshot(ctx) {
    const f = this.factorsFromContext(ctx);
    this.sql.exec(
      `INSERT OR REPLACE INTO factor_snapshots(
        ts, close, session, volatility_regime, atr_pct, volume_ratio,
        trend_alignment, ema_state, distance_level_pct, pattern_tags, recent_news_60m
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
      f.ts, f.close, f.session, f.volatility_regime, f.atr_pct, f.volume_ratio,
      f.trend_alignment, f.ema_state, f.distance_level_pct, f.pattern_tags, f.recent_news_60m
    );
    return f;
  }

  attachSetupFeatures(setupId, ctx) {
    const f = this.factorsFromContext(ctx);
    this.sql.exec(
      `INSERT OR REPLACE INTO setup_features(
        setup_id, session, volatility_regime, atr_pct, volume_ratio,
        trend_alignment, ema_state, distance_level_pct, pattern_tags, recent_news_60m
      ) VALUES(?,?,?,?,?,?,?,?,?,?)`,
      Number(setupId), f.session, f.volatility_regime, f.atr_pct, f.volume_ratio,
      f.trend_alignment, f.ema_state, f.distance_level_pct, f.pattern_tags, f.recent_news_60m
    );
    return f;
  }

  updateFactorOutcomes(nowTs = Date.now()) {
    const pending = this.rows(
      `SELECT ts, close, ret_15m, ret_60m, ret_240m, ret_1440m
       FROM factor_snapshots WHERE ret_1440m IS NULL
       ORDER BY ts ASC LIMIT 300`
    );
    const horizons=[["ret_15m",15],["ret_60m",60],["ret_240m",240],["ret_1440m",1440]];
    for (const row of pending) {
      const updates=[], values=[];
      for (const [field,min] of horizons) {
        if (row[field] !== null && row[field] !== undefined) continue;
        const target=Number(row.ts)+min*60_000;
        if (nowTs < target) continue;
        const p=this.nearestClose(target);
        if (!p) continue;
        updates.push(`${field}=?`);
        values.push((Number(p.close)-Number(row.close))/Number(row.close));
      }
      if (updates.length) {
        values.push(row.ts);
        this.sql.exec(`UPDATE factor_snapshots SET ${updates.join(", ")} WHERE ts=?`,...values);
      }
    }
  }

  matchingSetupHistory(side, ctx) {
    const f=this.factorsFromContext(ctx);
    const row=this.one(
      `SELECT COUNT(*) AS n,
        SUM(CASE WHEN s.result='TARGET' THEN 1 ELSE 0 END) AS wins,
        SUM(CASE WHEN s.result='STOP' THEN 1 ELSE 0 END) AS losses,
        AVG(s.realized_r) AS avg_r,
        AVG(s.mfe_r) AS avg_mfe,
        AVG(s.mae_r) AS avg_mae
       FROM setups s JOIN setup_features f ON f.setup_id=s.id
       WHERE s.side=? AND s.result IN ('TARGET','STOP')
         AND f.session=? AND f.volatility_regime=?
         AND f.trend_alignment=? AND f.ema_state=?`,
      side, f.session, f.volatility_regime, f.trend_alignment, f.ema_state
    ) || {};
    const n=Number(row.n||0), wins=Number(row.wins||0), losses=Number(row.losses||0);
    return {
      factors:f,
      n,wins,losses,
      hitRate:n ? wins/n : null,
      avgR: row.avg_r === null ? null : Number(row.avg_r),
      avgMfe: row.avg_mfe === null ? null : Number(row.avg_mfe),
      avgMae: row.avg_mae === null ? null : Number(row.avg_mae),
      evidence: n >= 50 ? "STRONG_SAMPLE" : n >= 20 ? "USABLE_SAMPLE" : n >= 8 ? "EARLY_SAMPLE" : "LEARNING"
    };
  }

  factorEdgeStats() {
    return this.rows(
      `SELECT f.session, f.volatility_regime, f.trend_alignment, f.ema_state, s.side,
        COUNT(*) AS n,
        SUM(CASE WHEN s.result='TARGET' THEN 1 ELSE 0 END) AS wins,
        SUM(CASE WHEN s.result='STOP' THEN 1 ELSE 0 END) AS losses,
        AVG(s.realized_r) AS avg_r,
        AVG(s.mfe_r) AS avg_mfe,
        AVG(s.mae_r) AS avg_mae
       FROM setups s JOIN setup_features f ON f.setup_id=s.id
       WHERE s.result IN ('TARGET','STOP')
       GROUP BY f.session, f.volatility_regime, f.trend_alignment, f.ema_state, s.side
       ORDER BY n DESC, avg_r DESC`
    );
  }

  factorSnapshotStats() {
    return this.rows(
      `SELECT session, volatility_regime, trend_alignment, ema_state,
        COUNT(*) AS n,
        AVG(ret_15m) AS avg_15m,
        AVG(ret_60m) AS avg_60m,
        AVG(ABS(ret_60m)) AS avg_abs_60m,
        AVG(ret_240m) AS avg_240m
       FROM factor_snapshots
       GROUP BY session, volatility_regime, trend_alignment, ema_state
       ORDER BY n DESC`
    );
  }

  alertFunnel() {
    return this.rows(
      `SELECT stage, COUNT(*) AS n FROM alerts GROUP BY stage ORDER BY n DESC`
    );
  }

  openShadowSetup(variant,confirmed,ctx) {
    if(!variant||!confirmed) return null;
    const candleTs=Number(ctx?.c5?.at(-1)?.t||Date.now());
    const levelBucket=Math.round(Number(confirmed.level||confirmed.entry)/5)*5;
    const signature=`${variant}|${confirmed.side}|${levelBucket}|${candleTs}`;
    this.sql.exec(
      `INSERT OR IGNORE INTO shadow_setups(
        variant,signature,opened_ts,side,entry,stop,target,planned_rr,level
      ) VALUES(?,?,?,?,?,?,?,?,?)`,
      String(variant),signature,candleTs,confirmed.side,
      Number(confirmed.entry),Number(confirmed.stop),Number(confirmed.target),
      Number(confirmed.rr),confirmed.level??null
    );
    const row=this.one("SELECT * FROM shadow_setups WHERE signature=?",signature);
    if(row?.id) {
      this.linkDecisionVersion("SHADOW_SETUP",row.id,{
        variant:String(variant),
        strategyVersion:confirmed.strategyVersion||STRATEGY_CORE_VERSION
      });
      if(!this.ledgerPredictionForSubject("SHADOW_SETUP",row.id)) {
        this.appendLedgerEvent({
          eventType:"PREDICTION",
          subjectType:"SHADOW_SETUP",
          subjectId:row.id,
          contextTs:candleTs,
          decision:confirmed.side,
          payload:{
            variant:String(variant),
            entry:Number(confirmed.entry),
            stop:Number(confirmed.stop),
            target:Number(confirmed.target),
            plannedRR:Number(confirmed.rr),
            level:confirmed.level??null
          }
        });
      }
    }
    return row;
  }

  checkOpenShadowSetups({ts,high,low}) {
    const open=this.rows("SELECT * FROM shadow_setups WHERE status='OPEN' ORDER BY id ASC");
    const closed=[];
    for(const s of open) {
      const risk=s.side==="LONG"?Number(s.entry)-Number(s.stop):Number(s.stop)-Number(s.entry);
      if(!(risk>0)) continue;
      const favorable=s.side==="LONG"?(Number(high)-s.entry)/risk:(s.entry-Number(low))/risk;
      const adverse=s.side==="LONG"?(s.entry-Number(low))/risk:(Number(high)-s.entry)/risk;
      const mfe=Math.max(Number(s.mfe_r||0),favorable);
      const mae=Math.max(Number(s.mae_r||0),adverse);
      const stopHit=s.side==="LONG"?Number(low)<=s.stop:Number(high)>=s.stop;
      const targetHit=s.side==="LONG"?Number(high)>=s.target:Number(low)<=s.target;
      if(stopHit&&targetHit) {
        this.sql.exec(
          "UPDATE shadow_setups SET status='CLOSED',result='AMBIGUOUS',closed_ts=?,mfe_r=?,mae_r=? WHERE id=?",
          Number(ts),mfe,mae,s.id
        );
        this.appendPredictionResolution("SHADOW_SETUP",s.id,"AMBIGUOUS",{
          closedTs:Number(ts),mfeR:mfe,maeR:mae
        });
        closed.push({...s,result:"AMBIGUOUS"});
      } else if(targetHit) {
        this.sql.exec(
          "UPDATE shadow_setups SET status='CLOSED',result='TARGET',closed_ts=?,realized_r=?,mfe_r=?,mae_r=? WHERE id=?",
          Number(ts),Number(s.planned_rr),mfe,mae,s.id
        );
        this.appendPredictionResolution("SHADOW_SETUP",s.id,"TARGET",{
          closedTs:Number(ts),realizedR:Number(s.planned_rr),mfeR:mfe,maeR:mae
        });
        closed.push({...s,result:"TARGET",realized_r:Number(s.planned_rr)});
      } else if(stopHit) {
        this.sql.exec(
          "UPDATE shadow_setups SET status='CLOSED',result='STOP',closed_ts=?,realized_r=-1,mfe_r=?,mae_r=? WHERE id=?",
          Number(ts),mfe,mae,s.id
        );
        this.appendPredictionResolution("SHADOW_SETUP",s.id,"STOP",{
          closedTs:Number(ts),realizedR:-1,mfeR:mfe,maeR:mae
        });
        closed.push({...s,result:"STOP",realized_r:-1});
      } else {
        this.sql.exec("UPDATE shadow_setups SET mfe_r=?,mae_r=? WHERE id=?",mfe,mae,s.id);
      }
    }
    return closed;
  }

  shadowStrategyStats() {
    return this.rows(
      `SELECT variant,
        COUNT(*) AS n,
        SUM(CASE WHEN status='OPEN' THEN 1 ELSE 0 END) AS open_n,
        SUM(CASE WHEN result='TARGET' THEN 1 ELSE 0 END) AS wins,
        SUM(CASE WHEN result='STOP' THEN 1 ELSE 0 END) AS losses,
        SUM(CASE WHEN result='AMBIGUOUS' THEN 1 ELSE 0 END) AS ambiguous,
        AVG(CASE WHEN realized_r IS NOT NULL THEN realized_r END) AS avg_r,
        AVG(mfe_r) AS avg_mfe,
        AVG(mae_r) AS avg_mae
       FROM shadow_setups GROUP BY variant ORDER BY n DESC`
    ).map(r=>{
      const wins=Number(r.wins||0),losses=Number(r.losses||0),decided=wins+losses;
      const ci=wilsonInterval(wins,decided);
      return {
        variant:r.variant,n:Number(r.n||0),open:Number(r.open_n||0),
        wins,losses,ambiguous:Number(r.ambiguous||0),
        hitRate:ci.p,hitLow95:ci.low,hitHigh95:ci.high,
        avgR:r.avg_r===null?null:Number(r.avg_r),
        avgMfe:r.avg_mfe===null?null:Number(r.avg_mfe),
        avgMae:r.avg_mae===null?null:Number(r.avg_mae)
      };
    });
  }

  recordSetupPrediction({setupId,rawScore=null,sampleN=0,source="empirical_reference",dataQuality=null,novelty=null}) {
    const id=Number(setupId);
    if(!Number.isFinite(id)||id<=0) return 0;
    const score=Number(rawScore);
    const safeScore=Number.isFinite(score)?Math.max(0.01,Math.min(0.99,score)):null;
    const cur=this.sql.exec(
      `INSERT OR REPLACE INTO setup_predictions(
        setup_id,created_ts,raw_score,sample_n,source,data_quality,novelty,outcome,resolved_ts
      ) VALUES(
        ?,?,
        ?,?,?,?,?,
        COALESCE((SELECT outcome FROM setup_predictions WHERE setup_id=?),NULL),
        COALESCE((SELECT resolved_ts FROM setup_predictions WHERE setup_id=?),NULL)
      )`,
      id,Date.now(),safeScore,Number(sampleN||0),String(source),
      dataQuality===null?null:Number(dataQuality),
      novelty===null?null:Number(novelty),
      id,id
    );
    return Number(cur.rowsWritten||0);
  }

  resolveSetupPrediction(setupId,result,resolvedTs=Date.now()) {
    const outcome=result==="TARGET"?1:result==="STOP"?0:null;
    if(outcome===null) return;
    this.sql.exec(
      "UPDATE setup_predictions SET outcome=?,resolved_ts=? WHERE setup_id=?",
      outcome,Number(resolvedTs),Number(setupId)
    );
  }

  probabilityCalibrationReport() {
    const rows=this.rows(
      `SELECT raw_score,outcome,sample_n,data_quality,novelty
       FROM setup_predictions
       WHERE raw_score IS NOT NULL AND outcome IN (0,1)
       ORDER BY created_ts ASC`
    ).map(r=>({
      score:Number(r.raw_score),outcome:Number(r.outcome),
      sampleN:Number(r.sample_n||0),quality:r.data_quality===null?null:Number(r.data_quality),
      novelty:r.novelty===null?null:Number(r.novelty)
    })).filter(r=>Number.isFinite(r.score)&&Number.isFinite(r.outcome));

    const bins=[];
    for(let lo=0;lo<1;lo+=0.1) {
      const hi=lo+0.1;
      const xs=rows.filter(r=>r.score>=lo && (hi>=1?r.score<=hi:r.score<hi));
      if(!xs.length) continue;
      const predicted=xs.reduce((s,r)=>s+r.score,0)/xs.length;
      const observed=xs.reduce((s,r)=>s+r.outcome,0)/xs.length;
      bins.push({
        low:Number(lo.toFixed(1)),
        high:Number(hi.toFixed(1)),
        n:xs.length,
        meanRawScore:predicted,
        observedTargetRate:observed,
        calibrationError:observed-predicted
      });
    }
    const brier=rows.length
      ? rows.reduce((s,r)=>s+(r.score-r.outcome)*(r.score-r.outcome),0)/rows.length
      : null;
    const meanScore=rows.length?rows.reduce((s,r)=>s+r.score,0)/rows.length:null;
    const baseRate=rows.length?rows.reduce((s,r)=>s+r.outcome,0)/rows.length:null;
    return {
      status:rows.length>=100?"USABLE":rows.length>=30?"EARLY":rows.length?"LEARNING":"WAITING",
      n:rows.length,
      brierScore:brier,
      meanRawScore:meanScore,
      observedTargetRate:baseRate,
      bins,
      warning:"Raw score is an empirical reference score. It is not treated as a calibrated probability until enough resolved samples exist."
    };
  }

  openSetup(confirmed, ctx) {
    const candleTs = Number(ctx?.c5?.at(-1)?.t || Date.now());
    const levelBucket = Math.round(Number(confirmed.level || confirmed.entry) / 5) * 5;
    const signature = `${confirmed.side}|${levelBucket}|${candleTs}`;
    const d = new Date(candleTs);
    this.sql.exec(
      `INSERT OR IGNORE INTO setups(
        signature, opened_ts, side, entry, stop, target, planned_rr, level,
        trend_5m, trend_15m, trend_1h, trend_4h, bias_score, hour_utc, dow_utc
      ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      signature,
      candleTs,
      confirmed.side,
      Number(confirmed.entry),
      Number(confirmed.stop),
      Number(confirmed.target),
      Number(confirmed.rr),
      confirmed.level ?? null,
      ctx.trends?.["5m"] || null,
      ctx.trends?.["15m"] || null,
      ctx.trends?.["1h"] || null,
      ctx.trends?.["4h"] || null,
      Number(ctx.score || 0),
      d.getUTCHours(),
      d.getUTCDay()
    );
    const row = this.one("SELECT * FROM setups WHERE signature = ?", signature);
    if (row?.id) {
      this.attachSetupFeatures(row.id, ctx);
      this.linkDecisionVersion("SETUP",row.id,{
        strategyVersion:confirmed.strategyVersion||STRATEGY_CORE_VERSION,
        side:confirmed.side,
        plannedRR:Number(confirmed.rr)
      });
    }
    return row;
  }

  checkOpenSetups({ ts, high, low, close }) {
    const open = this.rows("SELECT * FROM setups WHERE status = 'OPEN' ORDER BY id ASC");
    const closed = [];

    for (const s of open) {
      const risk = s.side === "LONG" ? s.entry - s.stop : s.stop - s.entry;
      if (!(risk > 0)) continue;

      const favorable = s.side === "LONG" ? (high - s.entry) / risk : (s.entry - low) / risk;
      const adverse = s.side === "LONG" ? (s.entry - low) / risk : (high - s.entry) / risk;
      const mfe = Math.max(Number(s.mfe_r || 0), favorable);
      const mae = Math.max(Number(s.mae_r || 0), adverse);

      const stopHit = s.side === "LONG" ? low <= s.stop : high >= s.stop;
      const targetHit = s.side === "LONG" ? high >= s.target : low <= s.target;

      if (stopHit && targetHit) {
        this.sql.exec(
          `UPDATE setups SET status='CLOSED', result='AMBIGUOUS', closed_ts=?,
           exit_price=?, realized_r=NULL, mfe_r=?, mae_r=? WHERE id=?`,
          ts, close, mfe, mae, s.id
        );
        this.appendPredictionResolution("SETUP",s.id,"AMBIGUOUS",{
          closedTs:Number(ts),exitPrice:Number(close),mfeR:mfe,maeR:mae
        });
        closed.push({ ...s, result: "AMBIGUOUS", exit_price: close, mfe_r: mfe, mae_r: mae });
      } else if (targetHit) {
        this.sql.exec(
          `UPDATE setups SET status='CLOSED', result='TARGET', closed_ts=?,
           exit_price=?, realized_r=?, mfe_r=?, mae_r=? WHERE id=?`,
          ts, s.target, s.planned_rr, mfe, mae, s.id
        );
        this.resolveSetupPrediction(s.id,"TARGET",ts);
        this.appendPredictionResolution("SETUP",s.id,"TARGET",{
          closedTs:Number(ts),exitPrice:Number(s.target),realizedR:Number(s.planned_rr),mfeR:mfe,maeR:mae
        });
        closed.push({ ...s, result: "TARGET", exit_price: s.target, realized_r: s.planned_rr, mfe_r: mfe, mae_r: mae });
      } else if (stopHit) {
        this.sql.exec(
          `UPDATE setups SET status='CLOSED', result='STOP', closed_ts=?,
           exit_price=?, realized_r=-1, mfe_r=?, mae_r=? WHERE id=?`,
          ts, s.stop, mfe, mae, s.id
        );
        this.resolveSetupPrediction(s.id,"STOP",ts);
        this.appendPredictionResolution("SETUP",s.id,"STOP",{
          closedTs:Number(ts),exitPrice:Number(s.stop),realizedR:-1,mfeR:mfe,maeR:mae
        });
        closed.push({ ...s, result: "STOP", exit_price: s.stop, realized_r: -1, mfe_r: mfe, mae_r: mae });
      } else {
        this.sql.exec("UPDATE setups SET mfe_r=?, mae_r=? WHERE id=?", mfe, mae, s.id);
      }
    }
    return closed;
  }

  detectPatterns(c5) {
    if (!Array.isArray(c5) || c5.length < 2) return [];
    const a = c5.at(-2);
    const b = c5.at(-1);
    const range = Math.max(b.h - b.l, 1e-9);
    const body = Math.abs(b.c - b.o);
    const upper = b.h - Math.max(b.o, b.c);
    const lower = Math.min(b.o, b.c) - b.l;
    const out = [];

    if (body / range <= 0.10) out.push(["DOJI", 0]);
    if (lower >= body * 2 && upper <= Math.max(body, range * 0.15) && (Math.max(b.o, b.c) - b.l) / range >= 0.65) {
      out.push(["HAMMER", 1]);
    }
    if (upper >= body * 2 && lower <= Math.max(body, range * 0.15) && (b.h - Math.min(b.o, b.c)) / range >= 0.65) {
      out.push(["SHOOTING_STAR", -1]);
    }
    if (b.c > b.o && a.c < a.o && b.o <= a.c && b.c >= a.o) out.push(["BULLISH_ENGULFING", 1]);
    if (b.c < b.o && a.c > a.o && b.o >= a.c && b.c <= a.o) out.push(["BEARISH_ENGULFING", -1]);
    if (b.h < a.h && b.l > a.l) out.push(["INSIDE_BAR", 0]);
    if (b.h > a.h && b.l < a.l) out.push(["OUTSIDE_BAR", b.c >= b.o ? 1 : -1]);
    if (body / range >= 0.80) out.push([b.c >= b.o ? "BULL_MARUBOZU" : "BEAR_MARUBOZU", b.c >= b.o ? 1 : -1]);

    return out;
  }

  recordPatterns(ctx) {
    const c5 = ctx?.c5;
    if (!Array.isArray(c5) || !c5.length) return;
    const candle = c5.at(-1);
    for (const [pattern, direction] of this.detectPatterns(c5)) {
      this.sql.exec(
        `INSERT OR IGNORE INTO pattern_occurrences(
          candle_ts, pattern, direction, open, high, low, close, volume,
          trend_5m, trend_15m, trend_1h, trend_4h, bias_score
        ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        Number(candle.t), pattern, direction,
        Number(candle.o), Number(candle.h), Number(candle.l), Number(candle.c), Number(candle.v),
        ctx.trends?.["5m"] || null,
        ctx.trends?.["15m"] || null,
        ctx.trends?.["1h"] || null,
        ctx.trends?.["4h"] || null,
        Number(ctx.score || 0)
      );
    }
  }

  bootstrapPatternHistory(candles) {
    if (!Array.isArray(candles) || candles.length < 300) return 0;
    let inserted = 0;
    const retAt = (i, bars) => {
      const j=i+bars;
      if (j >= candles.length) return null;
      const base=Number(candles[i].c);
      return base ? (Number(candles[j].c)-base)/base : null;
    };

    for (let i=2;i<candles.length;i++) {
      const slice=candles.slice(Math.max(0,i-2),i+1);
      const candle=candles[i];
      for (const [pattern,direction] of this.detectPatterns(slice)) {
        const cur=this.sql.exec(
          `INSERT OR IGNORE INTO pattern_occurrences(
            candle_ts, pattern, direction, open, high, low, close, volume,
            trend_5m, trend_15m, trend_1h, trend_4h, bias_score,
            ret_15m, ret_60m, ret_240m, ret_1440m
          ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          Number(candle.t), pattern, direction,
          Number(candle.o), Number(candle.h), Number(candle.l), Number(candle.c), Number(candle.v),
          null,null,null,null,null,
          retAt(i,3), retAt(i,12), retAt(i,48), retAt(i,288)
        );
        inserted += Number(cur.rowsWritten || 0);
      }
    }
    return inserted;
  }

  nearestClose(targetTs) {
    return this.one(
      "SELECT close, ts FROM market_minutes WHERE ts >= ? ORDER BY ts ASC LIMIT 1",
      targetTs
    );
  }

  updatePatternOutcomes(nowTs = Date.now()) {
    const pending = this.rows(
      `SELECT id, candle_ts, close, ret_15m, ret_60m, ret_240m, ret_1440m
       FROM pattern_occurrences
       WHERE ret_1440m IS NULL
       ORDER BY candle_ts ASC LIMIT 200`
    );
    const horizons = [
      ["ret_15m", 15],
      ["ret_60m", 60],
      ["ret_240m", 240],
      ["ret_1440m", 1440]
    ];

    for (const row of pending) {
      const updates = [];
      const values = [];
      for (const [field, minutes] of horizons) {
        if (row[field] !== null && row[field] !== undefined) continue;
        const target = Number(row.candle_ts) + minutes * 60_000;
        if (nowTs < target) continue;
        const p = this.nearestClose(target);
        if (!p) continue;
        updates.push(`${field}=?`);
        values.push((Number(p.close) - Number(row.close)) / Number(row.close));
      }
      if (updates.length) {
        values.push(row.id);
        this.sql.exec(`UPDATE pattern_occurrences SET ${updates.join(", ")} WHERE id=?`, ...values);
      }
    }
  }

  upsertMacroMarketContext(result) {
    let written=0;
    const fetchedTs=Number(result?.fetchedAt||Date.now());
    for(const row of result?.rows||[]) {
      if(!row?.series||!Number.isFinite(Number(row.observationTs))||!Number.isFinite(Number(row.value))) continue;
      const cur=this.sql.exec(
        `INSERT OR REPLACE INTO macro_market_daily(
          series,observation_ts,fetched_ts,label,kind,value,previous_value,change_value,source
        ) VALUES(?,?,?,?,?,?,?,?,?)`,
        String(row.series),Number(row.observationTs),fetchedTs,row.label||null,
        String(row.kind||"other"),Number(row.value),
        row.previousValue===null||row.previousValue===undefined?null:Number(row.previousValue),
        row.change===null||row.change===undefined?null:Number(row.change),
        row.source||"fred"
      );
      written+=Number(cur.rowsWritten||0);
    }
    return written;
  }

  macroMarketSummary() {
    const rows=this.rows(
      `SELECT m.* FROM macro_market_daily m
       JOIN (
         SELECT series,MAX(observation_ts) AS max_ts
         FROM macro_market_daily GROUP BY series
       ) x ON x.series=m.series AND x.max_ts=m.observation_ts
       ORDER BY m.series`
    );
    const map=Object.fromEntries(rows.map(r=>[r.series,{
      series:r.series,label:r.label,kind:r.kind,
      observationTs:Number(r.observation_ts),fetchedTs:Number(r.fetched_ts),
      value:Number(r.value),
      previousValue:r.previous_value===null?null:Number(r.previous_value),
      change:r.change_value===null?null:Number(r.change_value),
      source:r.source
    }]));
    const rates={
      twoYear:map.DGS2||null,
      tenYear:map.DGS10||null,
      curveBps:map.DGS2&&map.DGS10
        ? (Number(map.DGS10.value)-Number(map.DGS2.value))*100:null
    };
    const riskAssets={
      sp500:map.SP500||null,
      nasdaq:map.NASDAQCOM||null,
      vix:map.VIXCLS||null
    };
    const dollar=map.DTWEXBGS||null;
    const latestFetch=rows.length?Math.max(...rows.map(r=>Number(r.fetched_ts||0))):null;
    return {n:rows.length,latestFetch,rates,riskAssets,dollar,rows};
  }

  macroMarketHealth(nowTs=Date.now()) {
    const s=this.macroMarketSummary();
    const expected=["SP500","NASDAQCOM","VIXCLS","DGS2","DGS10","DTWEXBGS"];
    const present=new Set((s.rows||[]).map(r=>r.series));
    const missing=expected.filter(x=>!present.has(x));
    const age=s.latestFetch?Number(nowTs)-Number(s.latestFetch):null;
    return {
      fresh:Boolean(age!==null&&age<12*60*60_000),
      ageMs:age,
      missing,
      seriesCount:s.n
    };
  }

  upsertMacroEvents(events, capturedTs=Date.now()) {
    let written=0;
    for(const e of events||[]) {
      const cur=this.sql.exec(
        `INSERT INTO macro_events(
          event_key,event_ts,captured_ts,name,category,importance,source,source_url,before_min,after_min
        ) VALUES(?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(event_key) DO UPDATE SET
          event_ts=excluded.event_ts,
          captured_ts=excluded.captured_ts,
          name=excluded.name,
          category=excluded.category,
          importance=excluded.importance,
          source=excluded.source,
          source_url=excluded.source_url,
          before_min=excluded.before_min,
          after_min=excluded.after_min`,
        String(e.eventKey),Number(e.eventTs),Number(capturedTs),
        String(e.name),String(e.category),String(e.importance),String(e.source),
        e.sourceUrl||null,Number(e.beforeMin||30),Number(e.afterMin||30)
      );
      written+=Number(cur.rowsWritten||0);
    }
    return written;
  }

  macroRiskState(nowTs=Date.now()) {
    const active=this.rows(
      `SELECT * FROM macro_events
       WHERE ? >= event_ts - before_min*60000
         AND ? <= event_ts + after_min*60000
       ORDER BY ABS(event_ts-?) ASC`,
      Number(nowTs),Number(nowTs),Number(nowTs)
    );
    const next=this.one(
      "SELECT * FROM macro_events WHERE event_ts>=? ORDER BY event_ts ASC LIMIT 1",
      Number(nowTs)
    );
    const nearest=this.one(
      "SELECT * FROM macro_events ORDER BY ABS(event_ts-?) ASC LIMIT 1",
      Number(nowTs)
    );
    return {
      active:active.length>0,
      activeEvents:active,
      nextEvent:next||null,
      nearest:nearest||null
    };
  }

  updateMacroImpacts(nowTs=Date.now()) {
    const pending=this.rows(
      `SELECT * FROM macro_events
       WHERE event_ts<=? AND ret_240m IS NULL
       ORDER BY event_ts ASC LIMIT 100`,
      Number(nowTs)
    );
    const horizons=[["ret_5m",5],["ret_15m",15],["ret_60m",60],["ret_240m",240]];
    for(const row of pending) {
      let base=Number(row.base_price);
      if(!(base>0)) {
        const p=this.nearestAnyClose(Number(row.event_ts));
        if(p?.close) {
          base=Number(p.close);
          this.sql.exec("UPDATE macro_events SET base_price=? WHERE id=?",base,row.id);
        }
      }
      if(!(base>0)) continue;
      const updates=[],vals=[];
      for(const [field,min] of horizons) {
        if(row[field]!==null&&row[field]!==undefined) continue;
        const target=Number(row.event_ts)+min*60_000;
        if(nowTs<target) continue;
        const p=this.nearestAnyClose(target);
        if(!p?.close) continue;
        updates.push(`${field}=?`);
        vals.push((Number(p.close)-base)/base);
      }
      if(updates.length) {
        vals.push(row.id);
        this.sql.exec(`UPDATE macro_events SET ${updates.join(",")} WHERE id=?`,...vals);
      }
    }
  }

  macroStats() {
    return this.rows(
      `SELECT category,importance,COUNT(*) AS n,
        AVG(ret_5m) AS avg_5m,AVG(ABS(ret_5m)) AS avg_abs_5m,
        AVG(ret_15m) AS avg_15m,AVG(ABS(ret_15m)) AS avg_abs_15m,
        AVG(ret_60m) AS avg_60m,AVG(ABS(ret_60m)) AS avg_abs_60m,
        AVG(ret_240m) AS avg_240m,AVG(ABS(ret_240m)) AS avg_abs_240m
       FROM macro_events
       WHERE event_ts<=?
       GROUP BY category,importance
       ORDER BY n DESC,category ASC`,
      Date.now()
    );
  }

  upcomingMacro(limit=20) {
    return this.rows(
      "SELECT * FROM macro_events WHERE event_ts>=? ORDER BY event_ts ASC LIMIT ?",
      Date.now(),Math.min(100,Math.max(1,Number(limit||20)))
    );
  }

  macroCalendarHealth(nowTs=Date.now()) {
    const latestCapture=this.one("SELECT MAX(captured_ts) AS ts FROM macro_events");
    const next=this.one(
      "SELECT * FROM macro_events WHERE event_ts>=? ORDER BY event_ts ASC LIMIT 1",
      Number(nowTs)
    );
    const captureTs=Number(latestCapture?.ts||0);
    return {
      lastCapturedAt:captureTs||null,
      ageMs:captureTs?Number(nowTs)-captureTs:null,
      nextEvent:next||null,
      fresh:Boolean(captureTs && Number(nowTs)-captureTs<24*60*60_000)
    };
  }

  upsertNews(event) {
    const cursor = this.sql.exec(
      `INSERT OR IGNORE INTO news_events(
        fingerprint, published_ts, captured_ts, title, url, domain, country, category
      ) VALUES(?, ?, ?, ?, ?, ?, ?, ?)`,
      event.fingerprint,
      Number(event.publishedTs),
      Date.now(),
      event.title,
      event.url || null,
      event.domain || null,
      event.country || null,
      event.category || "other"
    );
    const inserted=Number(cursor.rowsWritten || 0) > 0;
    if(inserted) {
      this.recordTimeline({
        ts:Number(event.publishedTs),
        eventType:"NEWS",
        subtype:event.category||"other",
        direction:null,
        magnitude:event.critical?1:0.5,
        source:event.domain||"gdelt",
        payload:{title:event.title,url:event.url||null}
      });
    }
    return inserted;
  }

  updateNewsImpacts(nowTs = Date.now()) {
    const pending = this.rows(
      `SELECT * FROM news_events
       WHERE ret_1440m IS NULL
       ORDER BY published_ts ASC LIMIT 200`
    );
    const horizons = [
      ["ret_5m", 5],
      ["ret_15m", 15],
      ["ret_60m", 60],
      ["ret_240m", 240],
      ["ret_1440m", 1440]
    ];

    for (const row of pending) {
      let basePrice = row.base_price;
      if (basePrice === null || basePrice === undefined) {
        const base = this.nearestClose(Number(row.published_ts));
        if (base) {
          basePrice = Number(base.close);
          this.sql.exec("UPDATE news_events SET base_price=? WHERE id=?", basePrice, row.id);
        }
      }
      if (!(basePrice > 0)) continue;

      const updates = [];
      const values = [];
      for (const [field, minutes] of horizons) {
        if (row[field] !== null && row[field] !== undefined) continue;
        const target = Number(row.published_ts) + minutes * 60_000;
        if (nowTs < target) continue;
        const p = this.nearestClose(target);
        if (!p) continue;
        updates.push(`${field}=?`);
        values.push((Number(p.close) - basePrice) / basePrice);
      }
      if (updates.length) {
        values.push(row.id);
        this.sql.exec(`UPDATE news_events SET ${updates.join(", ")} WHERE id=?`, ...values);
      }
    }
  }

  summary() {
    const setup = this.one(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status='OPEN' THEN 1 ELSE 0 END) AS open_count,
        SUM(CASE WHEN result='TARGET' THEN 1 ELSE 0 END) AS targets,
        SUM(CASE WHEN result='STOP' THEN 1 ELSE 0 END) AS stops,
        AVG(CASE WHEN realized_r IS NOT NULL THEN realized_r END) AS avg_r
      FROM setups
    `) || {};

    const decided = Number(setup.targets || 0) + Number(setup.stops || 0);
    return {
      setups: {
        total: Number(setup.total || 0),
        open: Number(setup.open_count || 0),
        targets: Number(setup.targets || 0),
        stops: Number(setup.stops || 0),
        hitRate: decided ? Number(setup.targets || 0) / decided : null,
        avgR: setup.avg_r === null ? null : Number(setup.avg_r)
      },
      patterns: Number(this.one("SELECT COUNT(*) AS n FROM pattern_occurrences")?.n || 0),
      newsEvents: Number(this.one("SELECT COUNT(*) AS n FROM news_events")?.n || 0),
      marketMinutes: Number(this.one("SELECT COUNT(*) AS n FROM market_minutes")?.n || 0),
      historical5m: this.historical5mCount(),
      openInterestRows: Number(this.one("SELECT COUNT(*) AS n FROM open_interest_history")?.n || 0),
      longShortRows: Number(this.one("SELECT COUNT(*) AS n FROM long_short_history")?.n || 0),
      fundingRows: Number(this.one("SELECT COUNT(*) AS n FROM funding_history")?.n || 0),
      crossAssetRows: Number(this.one("SELECT COUNT(*) AS n FROM cross_asset_history")?.n || 0),
      orderflow5mRows: Number(this.one("SELECT COUNT(*) AS n FROM orderflow_5m")?.n || 0),
      secondaryMicrostructureRows: Number(this.one("SELECT COUNT(*) AS n FROM secondary_microstructure")?.n || 0),
      genomeRows: Number(this.one("SELECT COUNT(*) AS n FROM market_genomes")?.n || 0),
      historicalGenomeRows: this.historicalGenomeCount(),
      timelineEvents: Number(this.one("SELECT COUNT(*) AS n FROM market_timeline")?.n || 0),
      replayResults: Number(this.one("SELECT COUNT(*) AS n FROM replay_results")?.n || 0),
      shadowSetups: Number(this.one("SELECT COUNT(*) AS n FROM shadow_setups")?.n || 0),
      macroEvents: Number(this.one("SELECT COUNT(*) AS n FROM macro_events")?.n || 0),
      macroMarketRows: Number(this.one("SELECT COUNT(*) AS n FROM macro_market_daily")?.n || 0),
      venueSnapshots: Number(this.one("SELECT COUNT(*) AS n FROM venue_snapshots")?.n || 0),
      optionsSnapshots: Number(this.one("SELECT COUNT(*) AS n FROM options_snapshots")?.n || 0),
      coinbasePremiumRows: Number(this.one("SELECT COUNT(*) AS n FROM coinbase_premium_history")?.n || 0),
      parityAudits: Number(this.one("SELECT COUNT(*) AS n FROM parity_audits")?.n || 0),
      safeGenomeOutcomes: Number(this.one("SELECT COUNT(*) AS n FROM genome_safe_outcomes WHERE ret_fwd_60m IS NOT NULL")?.n || 0),
      marketTokens: Number(this.one("SELECT COUNT(*) AS n FROM market_tokens")?.n || 0),
      informationFlowSnapshots: Number(this.one("SELECT COUNT(*) AS n FROM information_flow_snapshots")?.n || 0),
      grammarTransitions: Number(this.one("SELECT COUNT(*) AS n FROM grammar_transition_counts")?.n || 0),
      grammarForecasts: Number(this.one("SELECT COUNT(*) AS n FROM grammar_forecasts")?.n || 0),
      adaptiveMemorySnapshots: Number(this.one("SELECT COUNT(*) AS n FROM adaptive_memory_snapshots")?.n || 0),
      grammarCounterfactualSnapshots: Number(this.one("SELECT COUNT(*) AS n FROM grammar_counterfactual_snapshots")?.n || 0),
      marketWorldSnapshots: Number(this.one("SELECT COUNT(*) AS n FROM market_world_snapshots")?.n || 0),
      marketWorldResolutions: Number(this.one("SELECT COUNT(*) AS n FROM market_world_resolutions WHERE resolved_ts IS NOT NULL")?.n || 0)
    };
  }

  setupTimeStats() {
    return this.rows(`
      SELECT hour_utc,
        COUNT(*) AS n,
        SUM(CASE WHEN result='TARGET' THEN 1 ELSE 0 END) AS wins,
        SUM(CASE WHEN result='STOP' THEN 1 ELSE 0 END) AS losses,
        AVG(realized_r) AS avg_r
      FROM setups
      WHERE result IN ('TARGET','STOP')
      GROUP BY hour_utc
      ORDER BY hour_utc
    `);
  }

  patternStats() {
    return this.rows(`
      SELECT pattern, direction,
        COUNT(*) AS n,
        AVG(ret_15m) AS avg_15m,
        AVG(ret_60m) AS avg_60m,
        AVG(ret_240m) AS avg_240m,
        AVG(ret_1440m) AS avg_1440m,
        AVG(CASE
          WHEN direction=1 AND ret_60m>0 THEN 1.0
          WHEN direction=-1 AND ret_60m<0 THEN 1.0
          WHEN direction=0 THEN NULL
          WHEN ret_60m IS NOT NULL THEN 0.0
        END) AS directional_hit_60m
      FROM pattern_occurrences
      GROUP BY pattern, direction
      ORDER BY n DESC, pattern ASC
    `);
  }

  newsStats() {
    return this.rows(`
      SELECT category,
        COUNT(*) AS n,
        AVG(ret_15m) AS avg_15m,
        AVG(ABS(ret_15m)) AS avg_abs_15m,
        AVG(ret_60m) AS avg_60m,
        AVG(ABS(ret_60m)) AS avg_abs_60m,
        AVG(ret_240m) AS avg_240m,
        AVG(ABS(ret_240m)) AS avg_abs_240m
      FROM news_events
      GROUP BY category
      ORDER BY n DESC, category ASC
    `);
  }

  recentSetups(limit = 30) {
    return this.rows("SELECT * FROM setups ORDER BY opened_ts DESC LIMIT ?", limit);
  }

  recentNews(limit = 30) {
    return this.rows("SELECT * FROM news_events ORDER BY published_ts DESC LIMIT ?", limit);
  }

  recentPatterns(limit = 30) {
    return this.rows("SELECT * FROM pattern_occurrences ORDER BY candle_ts DESC LIMIT ?", limit);
  }

  exportSnapshot() {
    return {
      generatedAt: Date.now(),
      summary: this.summary(),
      setupTimeStats: this.setupTimeStats(),
      patternStats: this.patternStats(),
      newsStats: this.newsStats(),
      factorEdgeStats: this.factorEdgeStats(),
      factorSnapshotStats: this.factorSnapshotStats(),
      alertFunnel: this.alertFunnel(),
      recentSetups: this.recentSetups(50),
      recentNews: this.recentNews(50),
      recentPatterns: this.recentPatterns(50),
      externalMarket: this.externalMarketSummary(),
      coverage: this.coverageReport(),
      recentTimeline: this.recentTimeline(50),
      validation: this.setupValidationReport(),
      latestGenome: this.latestGenome(),
      replayStats: this.replayStats(),
      parameterStability: this.parameterStabilityReport(),
      macroRisk: this.macroRiskState(),
      upcomingMacro: this.upcomingMacro(12),
      macroStats: this.macroStats(),
      riskPolicy: this.riskPolicyState(),
      equityResearch: this.equityResearch()
    };
  }
}

export function renderTradingCenter(snapshot) {
  const pct = x => x === null || x === undefined ? "—" : (Number(x) * 100).toFixed(1) + "%";
  const num = x => x === null || x === undefined ? "—" : Number(x).toFixed(2);
  const s = snapshot.summary.setups;

  const g = snapshot.latestGenome || {};
  const quality = snapshot.coverage?.currentQuality?.score ?? g.data_quality ?? null;
  const replayRows = (snapshot.replayStats || []).slice(0,10).map(r => `
    <tr><td>${r.paramsHash}</td><td>${r.n}</td><td>${pct(r.hitRate)}</td>
    <td>${r.avgR===null?"—":num(r.avgR)+"R"}</td><td>${r.avgMfe===null?"—":num(r.avgMfe)+"R"}</td>
    <td>${r.avgMae===null?"—":num(r.avgMae)+"R"}</td></tr>
  `).join("");
  const coverageRows = (snapshot.coverage?.features || []).map(f => `
    <tr><td>${f.group}</td><td>${f.key}</td><td>${f.status}</td><td>${f.critical?"critical":"support"}</td></tr>
  `).join("");

  const patternRows = snapshot.patternStats.slice(0, 12).map(r => `
    <tr><td>${r.pattern}</td><td>${r.n}</td><td>${pct(r.directional_hit_60m)}</td>
    <td>${pct(r.avg_15m)}</td><td>${pct(r.avg_60m)}</td><td>${pct(r.avg_240m)}</td></tr>
  `).join("");

  const newsRows = snapshot.newsStats.slice(0, 12).map(r => `
    <tr><td>${r.category}</td><td>${r.n}</td><td>${pct(r.avg_abs_15m)}</td>
    <td>${pct(r.avg_abs_60m)}</td><td>${pct(r.avg_abs_240m)}</td></tr>
  `).join("");

  const setupRows = snapshot.recentSetups.slice(0, 12).map(r => `
    <tr><td>#${r.id}</td><td>${r.side}</td><td>${r.status}</td><td>${r.result || "—"}</td>
    <td>${num(r.planned_rr)}R</td><td>${r.realized_r === null ? "—" : num(r.realized_r) + "R"}</td></tr>
  `).join("");

  const edgeRows = (snapshot.factorEdgeStats || []).slice(0, 12).map(r => {
    const decided=Number(r.wins||0)+Number(r.losses||0);
    const hit=decided ? Number(r.wins||0)/decided : null;
    const sample=Number(r.n||0) >= 50 ? "STRONG" : Number(r.n||0) >= 20 ? "USABLE" : Number(r.n||0) >= 8 ? "EARLY" : "LEARNING";
    return `<tr><td>${r.side}</td><td>${r.session}</td><td>${r.volatility_regime}</td>
      <td>${r.trend_alignment}</td><td>${r.ema_state}</td><td>${r.n}</td>
      <td>${pct(hit)}</td><td>${r.avg_r===null?"—":num(r.avg_r)+"R"}</td><td>${sample}</td></tr>`;
  }).join("");

  const funnelRows = (snapshot.alertFunnel || []).slice(0, 16).map(r => `
    <tr><td>${r.stage}</td><td>${r.n}</td></tr>
  `).join("");

  const factorRows = (snapshot.factorSnapshotStats || []).slice(0, 12).map(r => `
    <tr><td>${r.session}</td><td>${r.volatility_regime}</td><td>${r.trend_alignment}</td>
    <td>${r.ema_state}</td><td>${r.n}</td><td>${pct(r.avg_60m)}</td><td>${pct(r.avg_abs_60m)}</td></tr>
  `).join("");

  return `<!doctype html>
  <html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>BTC Trading Center</title>
  <style>
    body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;margin:0;background:#0b0d10;color:#f4f5f7}
    main{max-width:1100px;margin:auto;padding:18px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px}
    .card{background:#15181d;border:1px solid #272b33;border-radius:14px;padding:14px}.big{font-size:26px;font-weight:700}
    h1{font-size:28px}h2{margin-top:28px;font-size:19px}table{width:100%;border-collapse:collapse;background:#15181d;border-radius:12px;overflow:hidden}
    th,td{text-align:left;padding:10px;border-bottom:1px solid #272b33;font-size:13px}th{color:#aeb4bf}
    .note{color:#9aa2ad;font-size:13px;line-height:1.5}a{color:#9ecbff}
    .pill{display:inline-block;padding:5px 9px;border-radius:999px;background:#20242b;color:#c9d0da;font-size:12px;margin-right:6px}
    .section{overflow-x:auto}.topline{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0 18px}
  </style></head><body><main>
    <h1>BTC Trading Center</h1>
    <p class="note">Empirische Datenbank. Trefferquoten und Event-Reaktionen sind historische Beobachtungen, keine Garantie für zukünftige Ergebnisse.</p>
    <div class="grid">
      <div class="card"><div class="big">${s.total}</div><div>Setups gesamt</div></div>
      <div class="card"><div class="big">${s.open}</div><div>offene Paper-Setups</div></div>
      <div class="card"><div class="big">${pct(s.hitRate)}</div><div>TP-Quote*</div></div>
      <div class="card"><div class="big">${s.avgR === null ? "—" : num(s.avgR)+"R"}</div><div>Ø realisiertes R</div></div>
      <div class="card"><div class="big">${snapshot.summary.patterns}</div><div>Candle-Patterns</div></div>
      <div class="card"><div class="big">${snapshot.summary.newsEvents}</div><div>News-Events</div></div>
      <div class="card"><div class="big">${quality===null?"—":Number(quality).toFixed(0)+"/100"}</div><div>Datenqualität</div></div>
      <div class="card"><div class="big">${g.novelty===null||g.novelty===undefined?"—":pct(g.novelty)}</div><div>Market Novelty</div></div>
      <div class="card"><div class="big">${g.agreement===null||g.agreement===undefined?"—":pct(g.agreement)}</div><div>Signal Agreement</div></div>
      <div class="card"><div class="big">${snapshot.summary.genomeRows||0}</div><div>Market Genomes</div></div>
      <div class="card"><div class="big">${snapshot.summary.replayResults||0}</div><div>Replay-Ergebnisse</div></div>
    </div>

    <div class="topline">
      <span class="pill">LIVE + DATABASE</span>
      <span class="pill">FACTOR INTELLIGENCE</span>
      <span class="pill">GLOBAL EVENT RADAR</span>
      <span class="pill">PAPER-TRACKING</span>
      <span class="pill">MARKET GENOME</span>
      <span class="pill">NO-LOOKAHEAD REPLAY</span>
      <span class="pill">FALSIFICATION LAB</span>
    </div>

    <h2>Market Genome · aktueller Zustand</h2>
    <div class="grid">
      <div class="card"><div class="big">${g.state_label || "—"}</div><div>State DNA</div></div>
      <div class="card"><div class="big">${g.entropy===null||g.entropy===undefined?"—":num(g.entropy)}</div><div>Informationsentropie</div></div>
      <div class="card"><div class="big">${g.flow_delta_ratio===null||g.flow_delta_ratio===undefined?"—":pct(g.flow_delta_ratio)}</div><div>Taker Flow Delta</div></div>
      <div class="card"><div class="big">${g.oi_change===null||g.oi_change===undefined?"—":pct(g.oi_change)}</div><div>OI Δ</div></div>
      <div class="card"><div class="big">${g.liq_5m===null||g.liq_5m===undefined?"—":Number(g.liq_5m).toLocaleString("en-US",{maximumFractionDigits:0})}</div><div>Liquidationen 5m · USDT</div></div>
    </div>
    <p class="note">Novelty misst historische Unähnlichkeit. Agreement/Entropie beschreiben, wie stark unabhängige Datenquellen übereinstimmen; sie sind keine Gewinnwahrscheinlichkeit.</p>

    <h2>No-Lookahead Replay & Parameter-Stabilität</h2>
    <p class="note">Die Replay Engine sieht pro historischem Zeitpunkt nur Daten, die damals bereits geschlossen waren. Varianten werden nicht automatisch zur Live-Regel befördert.</p>
    <div class="section"><table><thead><tr><th>Parameter</th><th>N</th><th>TP-Quote</th><th>Ø R</th><th>Ø MFE</th><th>Ø MAE</th></tr></thead><tbody>${replayRows}</tbody></table></div>

    <h2>Feature Coverage</h2>
    <p class="note">Fehlende kritische Datenquellen bleiben explizit sichtbar, statt stillschweigend als Null behandelt zu werden.</p>
    <div class="section"><table><thead><tr><th>Gruppe</th><th>Feature</th><th>Status</th><th>Priorität</th></tr></thead><tbody>${coverageRows}</tbody></table></div>

    <h2>Letzte Setups</h2>
    <table><thead><tr><th>ID</th><th>Side</th><th>Status</th><th>Ergebnis</th><th>Plan</th><th>Realisiert</th></tr></thead><tbody>${setupRows}</tbody></table>

    <h2>Intelligence Layer: Setup-Kombinationen</h2>
    <p class="note">Session + Volatilitätsregime + Trend-Ausrichtung + EMA-Lage. Aussagekraft wird erst mit größerem N sinnvoll.</p>
    <div class="section"><table><thead><tr><th>Side</th><th>Session</th><th>Vol</th><th>Trend</th><th>EMA</th><th>N</th><th>TP-Quote</th><th>Ø R</th><th>Sample</th></tr></thead><tbody>${edgeRows}</tbody></table></div>

    <h2>Marktregime: Verhalten ohne Setup</h2>
    <p class="note">Misst, wie BTC sich in verschiedenen Marktregimen historisch danach bewegt hat.</p>
    <div class="section"><table><thead><tr><th>Session</th><th>Vol</th><th>Trend</th><th>EMA</th><th>N</th><th>Ø 1h</th><th>Ø |1h|</th></tr></thead><tbody>${factorRows}</tbody></table></div>

    <h2>Signal-Funnel</h2>
    <p class="note">Zeigt, wie oft RADAR/PREPARE/BREAK/SETUP usw. tatsächlich auftreten.</p>
    <div class="section"><table><thead><tr><th>Stufe</th><th>Anzahl</th></tr></thead><tbody>${funnelRows}</tbody></table></div>

    <h2>Candle-Pattern Statistik</h2>
    <table><thead><tr><th>Pattern</th><th>N</th><th>60m Richtungsquote</th><th>Ø 15m</th><th>Ø 1h</th><th>Ø 4h</th></tr></thead><tbody>${patternRows}</tbody></table>

    <h2>News-Kategorien: BTC-Bewegung danach</h2>
    <p class="note">Das misst zeitliche Preisreaktion nach einer Meldung, nicht bewiesene Kausalität.</p>
    <table><thead><tr><th>Kategorie</th><th>N</th><th>Ø |15m|</th><th>Ø |1h|</th><th>Ø |4h|</th></tr></thead><tbody>${newsRows}</tbody></table>

    <p class="note">* TP-Quote = TARGET / (TARGET + STOP). Ambiguous-1m-Kerzen werden nicht als Gewinn/Verlust gewertet.</p>
  </main></body></html>`;
}
