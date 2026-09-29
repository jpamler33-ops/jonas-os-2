import { sha256 } from './institutional-kernel.mjs';
import { TCX_RESEARCH_OS_CANON_VERSION } from './tcx-research-os-contract.mjs';

export const BIGGJ_CAPABILITY_MAP_VERSION='BIGGJ_CAPABILITY_MAP_V1';

const deepFreeze=v=>{
  if(v&&typeof v==='object'&&!Object.isFrozen(v)){
    Object.freeze(v);
    for(const x of Object.values(v)) deepFreeze(x);
  }
  return v;
};

const root=(id,layer,purpose,priority='CORE')=>({id,parentId:null,layer,purpose,priority,kind:'ROOT'});
const skill=(id,parentId,layer,purpose,priority='CORE',moduleHints=[])=>({id,parentId,layer,purpose,priority,kind:'CAPABILITY',moduleHints});

export const BIGGJ_CAPABILITY_ROOTS=deepFreeze([
  root('MARKET_TRUTH','TEMPORAL_MARKET_FABRIC','Reconstruct exactly what was knowable at decision time.'),
  root('EVIDENCE_INTELLIGENCE','EVIDENCE_MESH','Know which evidence exists, where it came from, how independent it is, and where sources disagree.'),
  root('MECHANISM_INTELLIGENCE','MECHANISM_RIFT','Explain market motion through constraints, forced flow, liquidity, reflexivity, cascades and absorption without overstating causality.'),
  root('FORECAST_INTELLIGENCE','FORECAST_INTELLIGENCE','Produce calibrated multi-horizon probabilistic forecasts, paths, revisions, invalidations and counterfactuals.'),
  root('FAILURE_UNCERTAINTY','FAILURE_FIRST_KERNEL','Search for failure conditions first and abstain when uncertainty or invalidation is unresolved.'),
  root('TRADING_STYLE_INTELLIGENCE','SHADOW_DECISION_CONSUMERS','Choose whether SCALP, INTRADAY, SWING or no trade fits the current market.'),
  root('SETUP_STRATEGY_INTELLIGENCE','STRATEGY_CHALLENGERS','Learn which setup family works in which regime and trading style.'),
  root('EXECUTION_MICROSTRUCTURE','SHADOW_DECISION_CONSUMERS','Choose entry method, limit zones, confirmation, routing and executable liquidity assumptions.'),
  root('POSITION_LIFECYCLE','SHADOW_DECISION_CONSUMERS','Adapt hold duration, protection, trailing and exit to the live thesis instead of fixed timers.'),
  root('PORTFOLIO_RISK','SHADOW_DECISION_CONSUMERS','Allocate capital by edge, stability, liquidity, correlation, drawdown and epistemic quality.'),
  root('MULTI_MARKET_INTELLIGENCE','EVIDENCE_MESH','Combine spot, derivatives, liquidations, on-chain, memecoins, entities, events and alternative data under governed contracts.'),
  root('LEARNING_REVERSE_ENGINEERING','LEARNING_MEMORY','Learn from each forecast and trade, including missed opportunity, timing, MFE/MAE and counterfactual outcomes.'),
  root('AUTONOMOUS_RESEARCH','LEARNING_MEMORY','Detect knowledge gaps, ask useful questions, form falsifiable hypotheses and design shadow experiments.'),
  root('PROMOTION_GOVERNANCE','PROMOTION_LADDER','Version, test, compare, promote, demote and roll back changes without silent self-modification.'),
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

  skill('FORCED_FLOW','MECHANISM_INTELLIGENCE','MECHANISM_RIFT','Model mechanically forced buying/selling.','CORE',['mechanism-transition-engine.mjs']),
  skill('LIQUIDITY_ELASTICITY','MECHANISM_INTELLIGENCE','MECHANISM_RIFT','Model how price responds to changing executable liquidity.'),
  skill('REFLEXIVITY','MECHANISM_INTELLIGENCE','MECHANISM_RIFT','Model feedback between price, positioning and participant behavior.'),
  skill('CASCADE_DYNAMICS','MECHANISM_INTELLIGENCE','MECHANISM_RIFT','Model liquidation and stop cascades.'),
  skill('ABSORPTION','MECHANISM_INTELLIGENCE','MECHANISM_RIFT','Detect when aggressive flow fails to move price.'),
  skill('CONSTRAINT_MAP','MECHANISM_INTELLIGENCE','MECHANISM_RIFT','Represent participant and venue constraints that can force actions.'),
  skill('IDENTIFIABILITY','MECHANISM_INTELLIGENCE','MECHANISM_RIFT','Distinguish mechanism hypothesis from identified causal effect.','FOUNDATION',['science-runtime/epistemic-integrity.mjs']),

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

  skill('VERSIONED_CANDIDATES','PROMOTION_GOVERNANCE','PROMOTION_LADDER','Every improvement receives a version and immutable candidate identity.','FOUNDATION',['model-candidate-registry.mjs']),
  skill('FORWARD_SHADOW_PROMOTION','PROMOTION_GOVERNANCE','PROMOTION_LADDER','Require prospective shadow evidence before higher trust.','FOUNDATION',['model-promotion-ladder.mjs']),
  skill('STRESS_PROMOTION','PROMOTION_GOVERNANCE','PROMOTION_LADDER','Require robustness, cost, winner-removal and concentration tests.','FOUNDATION',['model-promotion-ladder.mjs']),
  skill('EDGE_DECAY_DEMOTION','PROMOTION_GOVERNANCE','PROMOTION_LADDER','Demote capabilities when forward evidence decays.','CORE',['strategy-edge-decay.mjs']),
  skill('ROLLBACK','PROMOTION_GOVERNANCE','PROMOTION_LADDER','Rollback a promoted candidate without rewriting historical evidence.','FOUNDATION',['model-candidate-registry.mjs']),

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
  for(const x of BIGGJ_SEED_CAPABILITIES){
    if(!rootIds.has(x.parentId)) throw new Error('unknown capability root '+x.parentId);
  }
  const core={
    version:BIGGJ_CAPABILITY_MAP_VERSION,
    canonVersion:TCX_RESEARCH_OS_CANON_VERSION,
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
