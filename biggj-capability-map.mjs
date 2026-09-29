import { sha256 } from './institutional-kernel.mjs';
import { TCX_RESEARCH_OS_CANON_VERSION } from './tcx-research-os-contract.mjs';

export const BIGGJ_CAPABILITY_MAP_VERSION='BIGGJ_CAPABILITY_MAP_V2';

const deepFreeze=v=>{
  if(v&&typeof v==='object'&&!Object.isFrozen(v)){
    Object.freeze(v);
    for(const x of Object.values(v)) deepFreeze(x);
  }
  return v;
};

export const BIGGJ_ARCHITECTURE_PLANES=deepFreeze([
  {id:'REALITY_EVIDENCE_PLANE',purpose:'Capture point-in-time reality, governed evidence and a coherent multi-scale world state.'},
  {id:'UNDERSTANDING_PREDICTION_PLANE',purpose:'Explain mechanisms and participants, then forecast scenarios with explicit uncertainty and failure conditions.'},
  {id:'DECISION_CAPITAL_PLANE',purpose:'Discover opportunities, choose how to act in shadow, and allocate scarce capital only where scalable evidence supports it.'},
  {id:'LEARNING_EVOLUTION_PLANE',purpose:'Learn from outcomes, discover missing knowledge and observe BIGGJ itself for recurring reasoning failures.'},
  {id:'SCIENTIFIC_GOVERNANCE_PLANE',purpose:'Control promotion, scientific validity, mission boundaries and human approval without silent self-modification.'},
  {id:'PLATFORM_OPERATOR_PLANE',purpose:'Keep the research OS reliable, secure, reproducible, observable and understandable to the operator.'}
]);

export const BIGGJ_ROOT_PLANE_MAP=deepFreeze({
  MARKET_TRUTH:'REALITY_EVIDENCE_PLANE',
  EVIDENCE_INTELLIGENCE:'REALITY_EVIDENCE_PLANE',
  MULTI_MARKET_INTELLIGENCE:'REALITY_EVIDENCE_PLANE',
  WORLD_STATE_MODEL:'REALITY_EVIDENCE_PLANE',

  MECHANISM_INTELLIGENCE:'UNDERSTANDING_PREDICTION_PLANE',
  PARTICIPANT_GAME_THEORY:'UNDERSTANDING_PREDICTION_PLANE',
  FORECAST_INTELLIGENCE:'UNDERSTANDING_PREDICTION_PLANE',
  FAILURE_UNCERTAINTY:'UNDERSTANDING_PREDICTION_PLANE',

  OPPORTUNITY_DECISION:'DECISION_CAPITAL_PLANE',
  TRADING_STYLE_INTELLIGENCE:'DECISION_CAPITAL_PLANE',
  SETUP_STRATEGY_INTELLIGENCE:'DECISION_CAPITAL_PLANE',
  EXECUTION_MICROSTRUCTURE:'DECISION_CAPITAL_PLANE',
  POSITION_LIFECYCLE:'DECISION_CAPITAL_PLANE',
  PORTFOLIO_RISK:'DECISION_CAPITAL_PLANE',
  CAPITAL_CAPACITY_ECONOMICS:'DECISION_CAPITAL_PLANE',

  LEARNING_REVERSE_ENGINEERING:'LEARNING_EVOLUTION_PLANE',
  AUTONOMOUS_RESEARCH:'LEARNING_EVOLUTION_PLANE',
  META_COGNITION:'LEARNING_EVOLUTION_PLANE',

  PROMOTION_GOVERNANCE:'SCIENTIFIC_GOVERNANCE_PLANE',
  HUMAN_OVERSIGHT_CONTROL:'SCIENTIFIC_GOVERNANCE_PLANE',

  RELIABILITY_SECURITY_OPERATIONS:'PLATFORM_OPERATOR_PLANE',
  EXPLAINABILITY_OPERATOR:'PLATFORM_OPERATOR_PLANE'
});


const root=(id,layer,purpose,priority='CORE')=>({id,parentId:null,layer,plane:BIGGJ_ROOT_PLANE_MAP[id]||null,purpose,priority,kind:'ROOT'});
const skill=(id,parentId,layer,purpose,priority='CORE',moduleHints=[])=>({id,parentId,layer,plane:BIGGJ_ROOT_PLANE_MAP[parentId]||null,purpose,priority,kind:'CAPABILITY',moduleHints});

export const BIGGJ_CAPABILITY_ROOTS=deepFreeze([
  root('MARKET_TRUTH','TEMPORAL_MARKET_FABRIC','Reconstruct exactly what was knowable at decision time.'),
  root('EVIDENCE_INTELLIGENCE','EVIDENCE_MESH','Know which evidence exists, where it came from, how independent it is, and where sources disagree.'),
  root('WORLD_STATE_MODEL','TEMPORAL_MARKET_FABRIC','Maintain a canonical multi-scale representation of market state, latent state uncertainty and state transitions.'),
  root('MECHANISM_INTELLIGENCE','MECHANISM_RIFT','Explain market motion through constraints, forced flow, liquidity, reflexivity, cascades and absorption without overstating causality.'),
  root('PARTICIPANT_GAME_THEORY','MECHANISM_RIFT','Model participant incentives, constraints, reaction functions and strategic interaction without pretending hidden positions are observed.'),
  root('FORECAST_INTELLIGENCE','FORECAST_INTELLIGENCE','Produce calibrated multi-horizon probabilistic forecasts, paths, revisions, invalidations and counterfactuals.'),
  root('FAILURE_UNCERTAINTY','FAILURE_FIRST_KERNEL','Search for failure conditions first and abstain when uncertainty or invalidation is unresolved.'),
  root('OPPORTUNITY_DECISION','SHADOW_DECISION_CONSUMERS','Search the opportunity set and choose trade, wait, research or abstain using expected utility and opportunity cost.'),
  root('TRADING_STYLE_INTELLIGENCE','SHADOW_DECISION_CONSUMERS','Choose whether SCALP, INTRADAY, SWING or no trade fits the current market.'),
  root('SETUP_STRATEGY_INTELLIGENCE','STRATEGY_CHALLENGERS','Learn which setup family works in which regime and trading style.'),
  root('EXECUTION_MICROSTRUCTURE','SHADOW_DECISION_CONSUMERS','Choose entry method, limit zones, confirmation, routing and executable liquidity assumptions.'),
  root('POSITION_LIFECYCLE','SHADOW_DECISION_CONSUMERS','Adapt hold duration, protection, trailing and exit to the live thesis instead of fixed timers.'),
  root('PORTFOLIO_RISK','SHADOW_DECISION_CONSUMERS','Allocate capital by edge, stability, liquidity, correlation, drawdown and epistemic quality.'),
  root('CAPITAL_CAPACITY_ECONOMICS','SHADOW_DECISION_CONSUMERS','Measure whether an edge survives larger size, costs, turnover, market impact, liquidity and compounding constraints.'),
  root('MULTI_MARKET_INTELLIGENCE','EVIDENCE_MESH','Combine spot, derivatives, liquidations, on-chain, memecoins, entities, events and alternative data under governed contracts.'),
  root('LEARNING_REVERSE_ENGINEERING','LEARNING_MEMORY','Learn from each forecast and trade, including missed opportunity, timing, MFE/MAE and counterfactual outcomes.'),
  root('AUTONOMOUS_RESEARCH','LEARNING_MEMORY','Detect knowledge gaps, ask useful questions, form falsifiable hypotheses and design shadow experiments.'),
  root('META_COGNITION','LEARNING_MEMORY','Observe BIGGJ itself: rule dominance, stale assumptions, feature dependence, repeated errors, blind spots and reasoning monoculture.'),
  root('PROMOTION_GOVERNANCE','PROMOTION_LADDER','Version, test, compare, promote, demote and roll back changes without silent self-modification.'),
  root('HUMAN_OVERSIGHT_CONTROL','PROMOTION_LADDER','Keep immutable mission boundaries, approval gates, emergency freezes and audited operator authority over system evolution.'),
  root('RELIABILITY_SECURITY_OPERATIONS','OPERATOR_INTERFACES','Keep the research OS observable, reproducible, crash-safe, fail-closed and resistant to corrupted data, secrets or dependencies.'),
  root('EXPLAINABILITY_OPERATOR','OPERATOR_INTERFACES','Expose market state, evidence, mechanism, uncertainty, invalidation, decision rationale and trace to the operator.')
]);

export const BIGGJ_SEED_CAPABILITIES=deepFreeze([
  skill('PIT_EVENT_CLOCK','MARKET_TRUTH','TEMPORAL_MARKET_FABRIC','Track event time, available time and valid-until semantics.','FOUNDATION',['market-data-fabric.mjs']),
  skill('DETERMINISTIC_REPLAY','MARKET_TRUTH','TEMPORAL_MARKET_FABRIC','Reconstruct historical state without future data.','FOUNDATION',['deterministic-replay.mjs']),
  skill('REGIME_STATE_MEMORY','MARKET_TRUTH','TEMPORAL_MARKET_FABRIC','Store and compare regime states across time.','CORE',['episode-memory.mjs','shadow-regime-brain.mjs']),
  skill('CHANGE_POINT_DETECTION','MARKET_TRUTH','TEMPORAL_MARKET_FABRIC','Detect structural changes that invalidate stale learned relationships.'),
  skill('PATTERN_HALF_LIFE','MARKET_TRUTH','TEMPORAL_MARKET_FABRIC','Estimate how quickly a learned relationship decays.'),

  skill('PROVENANCE_CHAIN','EVIDENCE_INTELLIGENCE','EVIDENCE_MESH','Trace every observation and feature back to governed sources.','FOUNDATION',['research-dependency-graph.mjs']),
  skill('SOURCE_TRUST','EVIDENCE_INTELLIGENCE','EVIDENCE_MESH','Score freshness, quality and reliability without hiding uncertainty.','FOUNDATION',['research-data-governance.mjs']),
  skill('EVIDENCE_INDEPENDENCE','EVIDENCE_INTELLIGENCE','EVIDENCE_MESH','Prevent correlated sources from being counted as independent confirmation.','FOUNDATION',['science-runtime/evidence-lineage-independence.mjs']),
  skill('COMMON_CAUSE_GUARD','EVIDENCE_INTELLIGENCE','EVIDENCE_MESH','Detect evidence that shares the same upstream cause.'),
  skill('DISAGREEMENT_ENGINE','EVIDENCE_INTELLIGENCE','EVIDENCE_MESH','Preserve contradictory evidence and quantify disagreement.'),
  skill('COVERAGE_GAP_DETECTION','EVIDENCE_INTELLIGENCE','EVIDENCE_MESH','Know when missing modalities make a conclusion unsafe.','CORE',['research-coverage-doctor.mjs']),

  skill('CANONICAL_WORLD_STATE','WORLD_STATE_MODEL','TEMPORAL_MARKET_FABRIC','Build one versioned state object from PIT-safe observations instead of letting subsystems invent incompatible views.','FOUNDATION',['world-model-foundation.mjs']),
  skill('MULTISCALE_STATE_GRAPH','WORLD_STATE_MODEL','TEMPORAL_MARKET_FABRIC','Represent local, intraday, swing and cross-market state with explicit relationships and temporal scope.','CORE',['world-model-foundation.mjs']),
  skill('STATE_UNCERTAINTY','WORLD_STATE_MODEL','TEMPORAL_MARKET_FABRIC','Attach uncertainty and missing-observation flags to state variables instead of treating reconstructed state as fact.','CORE'),
  skill('REGIME_TRANSITION_MODEL','WORLD_STATE_MODEL','TEMPORAL_MARKET_FABRIC','Model transition probabilities and change points between market regimes.','CORE',['shadow-regime-brain.mjs']),
  skill('CROSS_ASSET_CONTEXT','WORLD_STATE_MODEL','TEMPORAL_MARKET_FABRIC','Represent relevant cross-asset and cross-venue context without leaking future information.','RESEARCH'),
  skill('STATE_CHANGE_ATTRIBUTION','WORLD_STATE_MODEL','TEMPORAL_MARKET_FABRIC','Record what changed in the world state, when it changed and which evidence supports the change.','CORE'),

  skill('FORCED_FLOW','MECHANISM_INTELLIGENCE','MECHANISM_RIFT','Model mechanically forced buying/selling.','CORE',['mechanism-transition-engine.mjs']),
  skill('LIQUIDITY_ELASTICITY','MECHANISM_INTELLIGENCE','MECHANISM_RIFT','Model how price responds to changing executable liquidity.'),
  skill('REFLEXIVITY','MECHANISM_INTELLIGENCE','MECHANISM_RIFT','Model feedback between price, positioning and participant behavior.'),
  skill('CASCADE_DYNAMICS','MECHANISM_INTELLIGENCE','MECHANISM_RIFT','Model liquidation and stop cascades.'),
  skill('ABSORPTION','MECHANISM_INTELLIGENCE','MECHANISM_RIFT','Detect when aggressive flow fails to move price.'),
  skill('CONSTRAINT_MAP','MECHANISM_INTELLIGENCE','MECHANISM_RIFT','Represent participant and venue constraints that can force actions.'),
  skill('IDENTIFIABILITY','MECHANISM_INTELLIGENCE','MECHANISM_RIFT','Distinguish mechanism hypothesis from identified causal effect.','FOUNDATION',['science-runtime/epistemic-integrity.mjs']),

  skill('PARTICIPANT_CLASSIFICATION','PARTICIPANT_GAME_THEORY','MECHANISM_RIFT','Classify plausible participant archetypes from observable behavior while preserving uncertainty.','RESEARCH'),
  skill('INCENTIVE_CONSTRAINT_INFERENCE','PARTICIPANT_GAME_THEORY','MECHANISM_RIFT','Infer which incentives or constraints could force participant actions and expose alternative explanations.','CORE'),
  skill('POSITION_PRESSURE_INFERENCE','PARTICIPANT_GAME_THEORY','MECHANISM_RIFT','Estimate crowded or stressed positioning from governed proxies without relabeling inference as observation.','RESEARCH'),
  skill('REACTION_FUNCTIONS','PARTICIPANT_GAME_THEORY','MECHANISM_RIFT','Model how participant classes may react to price, liquidity, funding, volatility and event shocks.','RESEARCH'),
  skill('CROWDING_GAME_DYNAMICS','PARTICIPANT_GAME_THEORY','MECHANISM_RIFT','Detect strategic fragility when many participants depend on the same exit, hedge or trigger.','RESEARCH'),
  skill('ADVERSARIAL_PARTICIPANT_MODEL','PARTICIPANT_GAME_THEORY','MECHANISM_RIFT','Stress a thesis against participants acting against obvious liquidity and signal-following behavior.','RESEARCH'),

  skill('MULTI_HORIZON_FORECAST','FORECAST_INTELLIGENCE','FORECAST_INTELLIGENCE','Forecast several horizons without conflating them.','CORE',['institutional-forecast-runtime.mjs']),
  skill('CALIBRATED_PROBABILITY','FORECAST_INTELLIGENCE','FORECAST_INTELLIGENCE','Calibrate directional and path probabilities.','FOUNDATION',['forecast-learning-center.mjs']),
  skill('PLAUSIBLE_PATHS','FORECAST_INTELLIGENCE','FORECAST_INTELLIGENCE','Generate multiple plausible future paths rather than one line.'),
  skill('ADAPTIVE_INTERVALS','FORECAST_INTELLIGENCE','FORECAST_INTELLIGENCE','Widen or narrow uncertainty intervals as conditions change.'),
  skill('FORECAST_REVISION','FORECAST_INTELLIGENCE','FORECAST_INTELLIGENCE','Track how and why forecasts change after new evidence.'),
  skill('FORECAST_INVALIDATION','FORECAST_INTELLIGENCE','FORECAST_INTELLIGENCE','Define what evidence or price state invalidates a forecast.'),
  skill('HISTORICAL_ANALOGUES','FORECAST_INTELLIGENCE','FORECAST_INTELLIGENCE','Find point-in-time comparable episodes with effective sample size control.'),
  skill('COUNTERFACTUAL_FORECAST','FORECAST_INTELLIGENCE','FORECAST_INTELLIGENCE','Explain how forecast changes under alternative assumptions.'),

  skill('UNCERTAINTY_DECOMPOSITION','FAILURE_UNCERTAINTY','FAILURE_FIRST_KERNEL','Separate data, model, regime and mechanism uncertainty.'),
  skill('ABSTAIN_POLICY','FAILURE_UNCERTAINTY','FAILURE_FIRST_KERNEL','Prefer no conclusion over unsupported certainty.','FOUNDATION',['scientific-validity.mjs']),
  skill('FAILURE_MODE_DISCOVERY','FAILURE_UNCERTAINTY','FAILURE_FIRST_KERNEL','Search for ways current reasoning can fail before acting.'),
  skill('UNKNOWN_UNKNOWN_PROBES','FAILURE_UNCERTAINTY','FAILURE_FIRST_KERNEL','Use anomalies and residuals to discover missing explanatory variables.'),
  skill('NEGATIVE_KNOWLEDGE','FAILURE_UNCERTAINTY','FAILURE_FIRST_KERNEL','Learn contexts where the system has no repeatable edge.'),

  skill('OPPORTUNITY_DISCOVERY','OPPORTUNITY_DECISION','SHADOW_DECISION_CONSUMERS','Search markets and horizons for research-worthy opportunities instead of forcing a decision on a fixed symbol.','CORE'),
  skill('EXPECTED_UTILITY_DECISION','OPPORTUNITY_DECISION','SHADOW_DECISION_CONSUMERS','Compare actions using expected value, uncertainty, downside, cost and portfolio interaction rather than forecast direction alone.','FOUNDATION'),
  skill('VALUE_OF_ABSTENTION','OPPORTUNITY_DECISION','SHADOW_DECISION_CONSUMERS','Estimate when waiting preserves optionality and dominates taking weak evidence.','CORE'),
  skill('OPPORTUNITY_COST','OPPORTUNITY_DECISION','SHADOW_DECISION_CONSUMERS','Compare a candidate with the best available alternative and with no-trade.','CORE'),
  skill('EXPLORATION_EXPLOITATION','OPPORTUNITY_DECISION','SHADOW_DECISION_CONSUMERS','Balance learning value against use of already-supported shadow edges under explicit research budgets.','RESEARCH'),
  skill('DECISION_UNDER_DISAGREEMENT','OPPORTUNITY_DECISION','SHADOW_DECISION_CONSUMERS','Choose actions when models, mechanisms or evidence sources disagree materially.','CORE'),
  skill('NO_TRADE_BASELINE','OPPORTUNITY_DECISION','SHADOW_DECISION_CONSUMERS','Keep no-trade as a measured benchmark so activity is never mistaken for progress.','FOUNDATION'),

  skill('STYLE_SCALP','TRADING_STYLE_INTELLIGENCE','SHADOW_DECISION_CONSUMERS','Learn when microstructure-sensitive short holds are appropriate.','RESEARCH',['biggj-market-playbook.mjs']),
  skill('STYLE_INTRADAY','TRADING_STYLE_INTELLIGENCE','SHADOW_DECISION_CONSUMERS','Learn when intraday structure and flow dominate.','RESEARCH',['biggj-market-playbook.mjs']),
  skill('STYLE_SWING','TRADING_STYLE_INTELLIGENCE','SHADOW_DECISION_CONSUMERS','Learn when higher-timeframe thesis persistence justifies multi-hour/day holds.','RESEARCH',['biggj-market-playbook.mjs']),
  skill('STYLE_SELECTION','TRADING_STYLE_INTELLIGENCE','SHADOW_DECISION_CONSUMERS','Choose style from market state rather than operator preference.','CORE',['biggj-market-playbook.mjs']),

  skill('TREND_CONTINUATION','SETUP_STRATEGY_INTELLIGENCE','STRATEGY_CHALLENGERS','Learn trend continuation by style and regime.','RESEARCH',['biggj-market-playbook.mjs']),
  skill('BREAKOUT_RETEST','SETUP_STRATEGY_INTELLIGENCE','STRATEGY_CHALLENGERS','Learn valid breaks, retests and failure modes.','RESEARCH',['market-structure.mjs','biggj-market-playbook.mjs']),
  skill('RANGE_MEAN_REVERSION','SETUP_STRATEGY_INTELLIGENCE','STRATEGY_CHALLENGERS','Learn range boundaries and mean-reversion conditions.','RESEARCH',['biggj-market-playbook.mjs']),
  skill('LIQUIDITY_SWEEP_REVERSAL','SETUP_STRATEGY_INTELLIGENCE','STRATEGY_CHALLENGERS','Learn when liquidity sweeps imply rejection rather than continuation.','RESEARCH',['biggj-market-playbook.mjs']),
  skill('MOMENTUM_EXPANSION','SETUP_STRATEGY_INTELLIGENCE','STRATEGY_CHALLENGERS','Learn expansion when flow, OI and structure align.','RESEARCH',['biggj-market-playbook.mjs']),
  skill('MEME_MOMENTUM','SETUP_STRATEGY_INTELLIGENCE','STRATEGY_CHALLENGERS','Keep memecoin mechanics isolated from CORE strategy evidence.','RESEARCH'),

  skill('LIQUIDITY_MAP','EXECUTION_MICROSTRUCTURE','SHADOW_DECISION_CONSUMERS','Map structure, walls and observed liquidation clusters.','CORE',['liquidation-confluence-view.mjs']),
  skill('SWEEP_DETECTION','EXECUTION_MICROSTRUCTURE','SHADOW_DECISION_CONSUMERS','Detect buy-side and sell-side liquidity sweeps.','RESEARCH',['biggj-market-playbook.mjs']),
  skill('LIMIT_ENTRY_SELECTION','EXECUTION_MICROSTRUCTURE','SHADOW_DECISION_CONSUMERS','Choose limit/retest entry only when the market structure supports it.','RESEARCH',['biggj-market-playbook.mjs']),
  skill('CONFIRMATION_ENTRY','EXECUTION_MICROSTRUCTURE','SHADOW_DECISION_CONSUMERS','Choose confirmation entry when waiting for a limit is structurally wrong.','RESEARCH',['biggj-market-playbook.mjs']),
  skill('ROUTING_SLIPPAGE','EXECUTION_MICROSTRUCTURE','SHADOW_DECISION_CONSUMERS','Estimate fills, depth exhaustion and venue fragmentation.','CORE',['multi-venue-shadow-sor.mjs']),
  skill('EXECUTION_TOXICITY','EXECUTION_MICROSTRUCTURE','SHADOW_DECISION_CONSUMERS','Learn when apparent edge is consumed by adverse selection or costs.','RESEARCH',['execution-research-lab.mjs']),

  skill('ADAPTIVE_HOLD_DURATION','POSITION_LIFECYCLE','SHADOW_DECISION_CONSUMERS','Learn when to shorten or extend a position from live thesis and historical context.','RESEARCH',['biggj-adaptive-learning-core.mjs','biggj-trading-policy.mjs']),
  skill('STRUCTURAL_INVALIDATION','POSITION_LIFECYCLE','SHADOW_DECISION_CONSUMERS','Exit when the thesis is structurally invalid, not because a timer expired.','CORE',['biggj-trading-policy.mjs']),
  skill('PROFIT_PROTECTION','POSITION_LIFECYCLE','SHADOW_DECISION_CONSUMERS','Learn break-even and profit protection behavior.','RESEARCH',['biggj-trading-policy.mjs']),
  skill('RUNNER_MANAGEMENT','POSITION_LIFECYCLE','SHADOW_DECISION_CONSUMERS','Keep strong trades open while protecting accumulated edge.','RESEARCH',['biggj-trading-policy.mjs']),
  skill('EXIT_REGRET','POSITION_LIFECYCLE','SHADOW_DECISION_CONSUMERS','Measure opportunity loss after premature or late exits.','CORE',['shadow-portfolio-ledger.mjs']),

  skill('RISK_BASED_SIZING','PORTFOLIO_RISK','SHADOW_DECISION_CONSUMERS','Size by stop distance, evidence and portfolio constraints.','CORE',['biggj-trading-policy.mjs']),
  skill('CORRELATION_CONCENTRATION','PORTFOLIO_RISK','SHADOW_DECISION_CONSUMERS','Reduce duplicated exposure across correlated positions.','CORE',['portfolio-risk-brain.mjs']),
  skill('DRAWDOWN_CONTROL','PORTFOLIO_RISK','SHADOW_DECISION_CONSUMERS','Reduce risk as evidence or portfolio health deteriorates.'),
  skill('TAIL_STRESS','PORTFOLIO_RISK','SHADOW_DECISION_CONSUMERS','Stress portfolio under discontinuous moves and liquidity loss.','CORE',['adversarial-stress-lab.mjs']),
  skill('EDGE_CAPITAL_ALLOCATION','PORTFOLIO_RISK','SHADOW_DECISION_CONSUMERS','Allocate more shadow capital only to stable, liquid, independently supported edge.'),

  skill('EDGE_CAPACITY_CURVE','CAPITAL_CAPACITY_ECONOMICS','SHADOW_DECISION_CONSUMERS','Estimate expectancy as shadow size increases and identify where the edge saturates.','CORE'),
  skill('LIQUIDITY_ADJUSTED_SCALABILITY','CAPITAL_CAPACITY_ECONOMICS','SHADOW_DECISION_CONSUMERS','Measure whether an edge remains usable after depth, spread, venue and fill constraints.','CORE'),
  skill('MARKET_IMPACT_MODEL','CAPITAL_CAPACITY_ECONOMICS','SHADOW_DECISION_CONSUMERS','Estimate impact and adverse selection under larger hypothetical size without enabling live orders.','RESEARCH'),
  skill('COST_TURNOVER_ECONOMICS','CAPITAL_CAPACITY_ECONOMICS','SHADOW_DECISION_CONSUMERS','Track fee, funding, slippage and turnover drag by style and strategy.','CORE'),
  skill('CAPITAL_UTILIZATION','CAPITAL_CAPACITY_ECONOMICS','SHADOW_DECISION_CONSUMERS','Measure idle capital, overlapping opportunities and bottlenecks without forcing deployment.','RESEARCH'),
  skill('COMPOUNDING_SURVIVAL','CAPITAL_CAPACITY_ECONOMICS','SHADOW_DECISION_CONSUMERS','Evaluate whether drawdowns and variance permit durable compounding under conservative shadow assumptions.','CORE'),
  skill('FUNDING_MARGIN_CONSTRAINTS','CAPITAL_CAPACITY_ECONOMICS','SHADOW_DECISION_CONSUMERS','Model funding, margin, borrow and venue constraints as costs and hard limits, never as reasons to add leverage.','CORE'),

  skill('DERIVATIVES_INTELLIGENCE','MULTI_MARKET_INTELLIGENCE','EVIDENCE_MESH','Use funding, OI and taker positioning under governed provenance.','CORE',['expansion-runtime/derivatives-public-provider.mjs']),
  skill('LIQUIDATION_INTELLIGENCE','MULTI_MARKET_INTELLIGENCE','EVIDENCE_MESH','Use observed liquidation flow without inventing unseen future levels.','CORE',['liquidation-confluence-view.mjs']),
  skill('ONCHAIN_INTELLIGENCE','MULTI_MARKET_INTELLIGENCE','EVIDENCE_MESH','Integrate on-chain observations as context, not unquestioned direction signals.','RESEARCH',['expansion-runtime/onchain-research-provider.mjs']),
  skill('ENTITY_FLOW_INTELLIGENCE','MULTI_MARKET_INTELLIGENCE','EVIDENCE_MESH','Track verified entity flows with transfer classification.','RESEARCH',['expansion-runtime/entity-flow-engine.mjs']),
  skill('EVENT_INTELLIGENCE','MULTI_MARKET_INTELLIGENCE','EVIDENCE_MESH','Model event surprise and price impact without hindsight leakage.','RESEARCH'),
  skill('NARRATIVE_INTELLIGENCE','MULTI_MARKET_INTELLIGENCE','EVIDENCE_MESH','Track narrative state while controlling for reflexive and selection effects.','RESEARCH'),

  skill('POST_TRADE_REVERSE_ENGINEERING','LEARNING_REVERSE_ENGINEERING','LEARNING_MEMORY','Explain what was right, wrong and merely lucky after every closed trade.','CORE',['biggj-market-playbook.mjs']),
  skill('MFE_MAE_LEARNING','LEARNING_REVERSE_ENGINEERING','LEARNING_MEMORY','Separate direction quality from timing and exit quality.','CORE',['shadow-portfolio-ledger.mjs']),
  skill('FACTOR_INTERACTION_MEMORY','LEARNING_REVERSE_ENGINEERING','LEARNING_MEMORY','Store regime-aware factor interactions with shrinkage and sample controls.','RESEARCH',['biggj-adaptive-learning-core.mjs']),
  skill('COUNTERFACTUAL_TRADE_REPLAY','LEARNING_REVERSE_ENGINEERING','LEARNING_MEMORY','Compare alternative hold, stop, entry and no-trade paths point-in-time.','RESEARCH'),
  skill('DECISION_QUALITY_VS_OUTCOME','LEARNING_REVERSE_ENGINEERING','LEARNING_MEMORY','Judge process independently from realized PnL.','CORE'),
  skill('OPPORTUNITY_LOSS_MEMORY','LEARNING_REVERSE_ENGINEERING','LEARNING_MEMORY','Track profitable paths missed by premature exits or abstentions.','RESEARCH'),

  skill('SELF_QUESTIONING','AUTONOMOUS_RESEARCH','LEARNING_MEMORY','Generate useful research questions from uncertainty, contradictions and residual error.','CORE'),
  skill('HYPOTHESIS_GENERATION','AUTONOMOUS_RESEARCH','LEARNING_MEMORY','Convert questions into falsifiable hypotheses.','CORE',['forecast-hypothesis-generator.mjs']),
  skill('EXPERIMENT_DESIGN','AUTONOMOUS_RESEARCH','LEARNING_MEMORY','Specify forward shadow tests, falsifiers, samples and stopping rules.','CORE'),
  skill('CAPABILITY_GAP_DISCOVERY','AUTONOMOUS_RESEARCH','LEARNING_MEMORY','Recognize when a missing skill or data source blocks progress.','CORE'),
  skill('CHILD_SKILL_DISCOVERY','AUTONOMOUS_RESEARCH','LEARNING_MEMORY','Create new skill-tree nodes only as research proposals, never as silent production changes.','CORE'),
  skill('INFORMATION_VALUE_PRIORITIZATION','AUTONOMOUS_RESEARCH','LEARNING_MEMORY','Prioritize research by expected information value, impact and uncertainty reduction.'),

  skill('SELF_MODEL','META_COGNITION','LEARNING_MEMORY','Maintain a versioned model of which capabilities, policies and evidence paths BIGGJ actually uses.','FOUNDATION'),
  skill('RULE_DOMINANCE_AUDIT','META_COGNITION','LEARNING_MEMORY','Detect when a small set of rule codes dominates entries, exits, abstentions or invalidations.','CORE'),
  skill('FEATURE_USAGE_AUDIT','META_COGNITION','LEARNING_MEMORY','Measure whether features contribute unique information or are present but behaviorally ignored.','CORE'),
  skill('ASSUMPTION_FRESHNESS','META_COGNITION','LEARNING_MEMORY','Find assumptions that have not been challenged, falsified or revalidated recently.','CORE'),
  skill('ERROR_RECURRENCE_DETECTION','META_COGNITION','LEARNING_MEMORY','Cluster repeated reasoning failures across independent episodes and policies.','CORE'),
  skill('BLIND_SPOT_DISCOVERY','META_COGNITION','LEARNING_MEMORY','Search residual errors and abstention clusters for missing variables, missing skills or missing evidence.','CORE'),
  skill('REASONING_DIVERSITY_AUDIT','META_COGNITION','LEARNING_MEMORY','Detect model, source or hypothesis monoculture that creates false confidence.','RESEARCH'),
  skill('SELF_CALIBRATION_MONITOR','META_COGNITION','LEARNING_MEMORY','Compare claimed confidence with realized calibration by capability, regime and decision type.','FOUNDATION'),

  skill('VERSIONED_CANDIDATES','PROMOTION_GOVERNANCE','PROMOTION_LADDER','Every improvement receives a version and immutable candidate identity.','FOUNDATION',['model-candidate-registry.mjs']),
  skill('FORWARD_SHADOW_PROMOTION','PROMOTION_GOVERNANCE','PROMOTION_LADDER','Require prospective shadow evidence before higher trust.','FOUNDATION',['model-promotion-ladder.mjs']),
  skill('STRESS_PROMOTION','PROMOTION_GOVERNANCE','PROMOTION_LADDER','Require robustness, cost, winner-removal and concentration tests.','FOUNDATION',['model-promotion-ladder.mjs']),
  skill('EDGE_DECAY_DEMOTION','PROMOTION_GOVERNANCE','PROMOTION_LADDER','Demote capabilities when forward evidence decays.','CORE',['strategy-edge-decay.mjs']),
  skill('ROLLBACK','PROMOTION_GOVERNANCE','PROMOTION_LADDER','Rollback a promoted candidate without rewriting historical evidence.','FOUNDATION',['model-candidate-registry.mjs']),

  skill('SCIENTIFIC_GUARD_ORCHESTRATION','PROMOTION_GOVERNANCE','PROMOTION_LADDER','Require the complete scientific guard set appropriate to each candidate before promotion.','FOUNDATION',['scientific-validity.mjs']),
  skill('MULTIPLE_TESTING_BUDGET','PROMOTION_GOVERNANCE','PROMOTION_LADDER','Control challenger proliferation and false discovery from repeated experimentation.','CORE'),
  skill('REPRODUCIBLE_PROMOTION_AUDIT','PROMOTION_GOVERNANCE','PROMOTION_LADDER','Reproduce the exact evidence, versions, tests and decision behind every promotion or demotion.','FOUNDATION',['model-governance-audit.mjs']),

  skill('CONSTITUTION_ENFORCEMENT','HUMAN_OVERSIGHT_CONTROL','PROMOTION_LADDER','Enforce immutable SHADOW_ONLY, no-live-order and epistemic boundaries across all subsystems.','FOUNDATION',['biggj-trading-policy.mjs']),
  skill('HUMAN_APPROVAL_GATE','HUMAN_OVERSIGHT_CONTROL','PROMOTION_LADDER','Require explicit operator approval for governed transitions that policy marks as human-controlled.','FOUNDATION'),
  skill('EMERGENCY_FREEZE','HUMAN_OVERSIGHT_CONTROL','PROMOTION_LADDER','Allow the operator to freeze experiments, promotions or shadow activity without deleting evidence.','FOUNDATION'),
  skill('PERMISSION_BOUNDARIES','HUMAN_OVERSIGHT_CONTROL','PROMOTION_LADDER','Define which actors may propose, test, promote, freeze or inspect each system object.','CORE'),
  skill('CHANGE_REVIEW','HUMAN_OVERSIGHT_CONTROL','PROMOTION_LADDER','Expose material policy, model, data-source and infrastructure changes before governed promotion.','CORE'),
  skill('OPERATOR_OVERRIDE_AUDIT','HUMAN_OVERSIGHT_CONTROL','PROMOTION_LADDER','Record every human override with reason, scope, time and affected versions; overrides may tighten safety but never silently bypass science.','CORE'),
  skill('MISSION_CONSTRAINT_MONITOR','HUMAN_OVERSIGHT_CONTROL','PROMOTION_LADDER','Detect when local optimization conflicts with capital preservation, calibration, scalability or knowledge gain.','CORE'),

  skill('SERVICE_HEALTH_OBSERVABILITY','RELIABILITY_SECURITY_OPERATIONS','OPERATOR_INTERFACES','Measure data freshness, latency, queue health, error budgets and dependency health continuously.','FOUNDATION',['observability.mjs']),
  skill('DETERMINISTIC_REPRODUCIBILITY','RELIABILITY_SECURITY_OPERATIONS','OPERATOR_INTERFACES','Reproduce research outputs from frozen inputs, versions and configuration.','FOUNDATION',['deterministic-replay.mjs']),
  skill('CRASH_RECOVERY_STATE_INTEGRITY','RELIABILITY_SECURITY_OPERATIONS','OPERATOR_INTERFACES','Recover after process failure without duplicating, losing or silently rewriting research state.','FOUNDATION',['persistence-contracts.mjs']),
  skill('FAIL_CLOSED_DEGRADATION','RELIABILITY_SECURITY_OPERATIONS','OPERATOR_INTERFACES','Degrade to ABSTAIN or read-only research when critical dependencies become stale, unavailable or inconsistent.','FOUNDATION',['operational-readiness.mjs']),
  skill('DATA_POISONING_DETECTION','RELIABILITY_SECURITY_OPERATIONS','OPERATOR_INTERFACES','Detect malformed, adversarial, impossible or distribution-shifted inputs before they contaminate evidence.','CORE'),
  skill('SECRET_SUPPLY_CHAIN_SECURITY','RELIABILITY_SECURITY_OPERATIONS','OPERATOR_INTERFACES','Protect credentials and dependency integrity; prevent untrusted components from becoming research authority.','CORE'),
  skill('RESOURCE_BUDGETING','RELIABILITY_SECURITY_OPERATIONS','OPERATOR_INTERFACES','Bound compute, memory, storage, provider calls and research fan-out so reliability does not collapse under self-expansion.','CORE'),
  skill('CHAOS_RECOVERY_TESTING','RELIABILITY_SECURITY_OPERATIONS','OPERATOR_INTERFACES','Continuously test recovery from dependency loss, stale data, storage faults and partial service failure.','RESEARCH',['chaos-engineering.mjs']),

  skill('LIVING_THESIS','EXPLAINABILITY_OPERATOR','OPERATOR_INTERFACES','Explain the current thesis, counter-thesis and what changed.','CORE',['biggj-visual-intelligence.mjs']),
  skill('WHY_NOW','EXPLAINABILITY_OPERATOR','OPERATOR_INTERFACES','Explain why the current state warrants a decision now.','CORE',['biggj-visual-intelligence.mjs']),
  skill('WHY_NOT_TRADE','EXPLAINABILITY_OPERATOR','OPERATOR_INTERFACES','Expose blockers and unknowns behind ABSTAIN.','CORE'),
  skill('RESEARCH_TRACE_VIEW','EXPLAINABILITY_OPERATOR','OPERATOR_INTERFACES','Expose data-to-claim-to-mechanism-to-forecast lineage.','CORE',['research-trace.mjs']),
  skill('SKILL_TREE_VIEW','EXPLAINABILITY_OPERATOR','OPERATOR_INTERFACES','Show what BIGGJ knows, is learning, is testing, distrusts and wants to research next.')
]);

function assertUnique(rows){
  const seen=new Set();
  for(const x of rows){
    if(seen.has(x.id)) throw new Error('duplicate capability id '+x.id);
    seen.add(x.id);
  }
}

export function biggjCapabilityMap(){
  assertUnique([...BIGGJ_CAPABILITY_ROOTS,...BIGGJ_SEED_CAPABILITIES]);
  const rootIds=new Set(BIGGJ_CAPABILITY_ROOTS.map(x=>x.id));
  for(const x of BIGGJ_CAPABILITY_ROOTS){
    if(!x.plane) throw new Error('capability root missing architecture plane '+x.id);
  }
  const planeIds=new Set(BIGGJ_ARCHITECTURE_PLANES.map(x=>x.id));
  for(const x of BIGGJ_CAPABILITY_ROOTS){
    if(!planeIds.has(x.plane)) throw new Error('unknown architecture plane '+x.plane);
  }
  for(const x of BIGGJ_SEED_CAPABILITIES){
    if(!rootIds.has(x.parentId)) throw new Error('unknown capability root '+x.parentId);
    if(!x.plane||!planeIds.has(x.plane)) throw new Error('capability missing architecture plane '+x.id);
  }
  const core={
    version:BIGGJ_CAPABILITY_MAP_VERSION,
    canonVersion:TCX_RESEARCH_OS_CANON_VERSION,
    architecturePlanes:BIGGJ_ARCHITECTURE_PLANES.map(x=>({...x})),
    roots:BIGGJ_CAPABILITY_ROOTS.map(x=>({...x})),
    capabilities:BIGGJ_SEED_CAPABILITIES.map(x=>({...x,moduleHints:[...(x.moduleHints||[])]})),
    mission:{
      externalTargetCapital:100000,
      externalTargetCurrency:'EUR',
      externalTargetDate:'2027-12-25',
      guarantee:false,
      directTargetChasingForbidden:true,
      internalObjective:'SUSTAINED_RISK_ADJUSTED_EXPECTANCY_CAPITAL_PRESERVATION_CALIBRATION_AND_KNOWLEDGE_GAIN'
    },
    invariants:{
      pointInTime:true,
      abstainFirst:true,
      silentPrimaryMutation:false,
      challengerBeforePromotion:true,
      epistemicClasses:['OBSERVED','INFERRED','MODELLED','ASSUMED'],
      execution:'SHADOW_ONLY',
      canExecuteLive:false
    }
  };
  return deepFreeze({...core,fingerprint:sha256(core)});
}

export function capabilityIdsByRoot(rootId){
  const id=String(rootId||'').toUpperCase();
  return deepFreeze(BIGGJ_SEED_CAPABILITIES.filter(x=>x.parentId===id).map(x=>x.id));
}


export function rootIdsByArchitecturePlane(planeId){
  const id=String(planeId||'').toUpperCase();
  return deepFreeze(BIGGJ_CAPABILITY_ROOTS.filter(x=>x.plane===id).map(x=>x.id));
}
