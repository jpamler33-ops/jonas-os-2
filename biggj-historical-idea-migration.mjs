import { sha256 } from './institutional-kernel.mjs';
import {
  BIGGJ_CAPABILITY_ROOTS,
  BIGGJ_SEED_CAPABILITIES
} from './biggj-capability-map.mjs';
import {
  canonicalDependenciesFor,
  canonicalSkillLeverage
} from './biggj-skill-dependency-graph.mjs';
import {
  BIGGJ_HISTORICAL_IDEAS
} from './biggj-historical-idea-catalog.mjs';

export const BIGGJ_HISTORICAL_MIGRATION_VERSION='BIGGJ_HISTORICAL_MIGRATION_V1';

export const BIGGJ_HISTORICAL_ROLES=Object.freeze([
  'CAPABILITY',
  'RESEARCH_METHOD',
  'SCIENTIFIC_GUARD',
  'DATA_SOURCE',
  'OPERATOR_VIEW',
  'INFRASTRUCTURE',
  'GOVERNANCE',
  'SIMULATION_RESEARCH',
  'UNKNOWN'
]);

export const BIGGJ_HISTORICAL_DISPOSITIONS=Object.freeze([
  'ALREADY_CANONICAL',
  'MERGE_INTO_CANON',
  'KEEP_AS_RESEARCH_PROPOSAL',
  'KEEP_AS_OPERATOR_FEATURE',
  'KEEP_AS_INFRASTRUCTURE',
  'SIMULATION_ONLY',
  'RETIRE_FROM_BIGGJ_CORE',
  'NEEDS_REVIEW'
]);

const deepFreeze=value=>{
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    Object.freeze(value);
    for(const v of Object.values(value)) deepFreeze(v);
  }
  return value;
};
const finalized=core=>deepFreeze({...core,fingerprint:sha256(core)});
const norm=value=>String(value||'')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g,'')
  .toUpperCase()
  .replace(/[^A-Z0-9]+/g,' ')
  .trim()
  .replace(/\s+/g,' ');
const token=value=>norm(value).replace(/\s+/g,'_');
const capabilityById=new Map(BIGGJ_SEED_CAPABILITIES.map(x=>[x.id,x]));
const rootById=new Map(BIGGJ_CAPABILITY_ROOTS.map(x=>[x.id,x]));

const mapping=(pattern,capabilityId,role='CAPABILITY',disposition='MERGE_INTO_CANON',rationale='')=>({
  pattern,capabilityId,role,disposition,rationale
});

const RULES=Object.freeze([
  mapping(/POINT IN TIME|PIT EVENT|TEMPORAL FIREWALL|PIT TRUST|AVAILABLEAT|EVENT CLOCK/,'PIT_EVENT_CLOCK','SCIENTIFIC_GUARD','ALREADY_CANONICAL','Temporal truth is canonical.'),
  mapping(/DETERMINISTIC REPLAY|REPRODUCIBLE HISTOR|HISTORICAL REPLAY/,'DETERMINISTIC_REPLAY','RESEARCH_METHOD','ALREADY_CANONICAL','Historical reconstruction belongs to deterministic PIT replay.'),
  mapping(/PROVENANCE|LINEAGE FIREWALL|ORIGIN PROVENANCE|REPLY LINEAGE/,'PROVENANCE_CHAIN','SCIENTIFIC_GUARD','MERGE_INTO_CANON','Preserve lineage in the canonical provenance chain.'),
  mapping(/SOURCE TRUST|AUTHORITY|RESOLVER|SENDER AUTHENTICATION|TRUST BOUNDAR/,'SOURCE_TRUST','SCIENTIFIC_GUARD','MERGE_INTO_CANON','Source identity and trust belong to evidence governance.'),
  mapping(/INDEPENDEN|COMMON ANCESTOR|ROOT CAPPED|ROOT AWARE|GENEALOGICAL CONVERGENCE|EFFECTIVE ROOT|EXPOSURE BREAKS|CLEAN RECONSTRUCTION|CONTAMINATION/,'EVIDENCE_INDEPENDENCE','SCIENTIFIC_GUARD','MERGE_INTO_CANON','Independence and contamination are canonical evidence concerns.'),
  mapping(/COMMON CAUSE/,'COMMON_CAUSE_GUARD','SCIENTIFIC_GUARD','ALREADY_CANONICAL','Common-cause control is canonical.'),
  mapping(/DISAGREEMENT|CONTRADICT/,'DISAGREEMENT_ENGINE','CAPABILITY','ALREADY_CANONICAL','Contradictory evidence remains explicit.'),
  mapping(/COVERAGE|LOW COVERAGE/,'COVERAGE_GAP_DETECTION','SCIENTIFIC_GUARD','MERGE_INTO_CANON','Coverage gaps belong to evidence intelligence.'),

  mapping(/WORLD STATE|MARKET STATE ENGINE|STATE REPRESENTATION/,'CANONICAL_WORLD_STATE','CAPABILITY','MERGE_INTO_CANON','Canonical state representation supersedes parallel state concepts.'),
  mapping(/MULTISCALE|CROSS HORIZON/,'MULTISCALE_STATE_GRAPH','CAPABILITY','MERGE_INTO_CANON','Cross-horizon state belongs to the multi-scale state graph.'),
  mapping(/STATE UNCERTAINTY/,'STATE_UNCERTAINTY','CAPABILITY','ALREADY_CANONICAL','Explicit state uncertainty is canonical.'),
  mapping(/CHANGE POINT|CHANGE DETECTION/,'CHANGE_POINT_DETECTION','CAPABILITY','ALREADY_CANONICAL','Change-point detection is canonical.'),
  mapping(/PATTERN HALF LIFE|HALF LIFE/,'PATTERN_HALF_LIFE','CAPABILITY','ALREADY_CANONICAL','Relationship decay is canonical.'),
  mapping(/PATH DEPENDENCY|HISTORICAL PATH/,'REGIME_STATE_MEMORY','CAPABILITY','MERGE_INTO_CANON','Path dependence is represented through state and regime memory.'),
  mapping(/REGIME/,'REGIME_TRANSITION_MODEL','CAPABILITY','MERGE_INTO_CANON','Regime concepts consolidate around state transitions and regime memory.'),
  mapping(/STATE CHANGE ATTRIBUTION/,'STATE_CHANGE_ATTRIBUTION','CAPABILITY','ALREADY_CANONICAL','State-change attribution is canonical.'),

  mapping(/FORCED FLOW|FORCED ACTION|LIQUIDATION CHAIN/,'FORCED_FLOW','CAPABILITY','MERGE_INTO_CANON','Forced behavior belongs to mechanism intelligence.'),
  mapping(/LIQUIDITY ELASTICITY|DEPTH EXHAUSTION|TAIL IMPACT/,'LIQUIDITY_ELASTICITY','CAPABILITY','MERGE_INTO_CANON','Liquidity response is canonical mechanism intelligence.'),
  mapping(/REFLEXIV/,'REFLEXIVITY','CAPABILITY','MERGE_INTO_CANON','Reflexive feedback is canonical.'),
  mapping(/CASCADE DYNAMIC|NONLINEAR CASCADE/,'CASCADE_DYNAMICS','CAPABILITY','MERGE_INTO_CANON','Cascade dynamics are canonical.'),
  mapping(/ABSORPTION(?! RESERVE)/,'ABSORPTION','CAPABILITY','MERGE_INTO_CANON','Absorption is canonical mechanism intelligence.'),
  mapping(/CONSTRAINT FIELD|CONSTRAINT MAP|CONSTRAINT SURFACE/,'CONSTRAINT_MAP','CAPABILITY','MERGE_INTO_CANON','Constraint representations consolidate into the canonical constraint map.'),
  mapping(/IDENTIFIAB|CAUSAL DISCOVERY|CAUSAL PROOF|CAUSAL EFFECT/,'IDENTIFIABILITY','SCIENTIFIC_GUARD','MERGE_INTO_CANON','Causal claims require identifiability rather than narrative certainty.'),

  mapping(/PARTICIPANT SIMULATION|AGENT REGISTRY|AGENT CLASS|PARTICIPANT CLASS/,'PARTICIPANT_CLASSIFICATION','CAPABILITY','MERGE_INTO_CANON','Participant archetypes belong to participant intelligence.'),
  mapping(/INCENTIVE|BINDING CONSTRAINT/,'INCENTIVE_CONSTRAINT_INFERENCE','CAPABILITY','MERGE_INTO_CANON','Incentives and constraints are inferred explicitly.'),
  mapping(/POSITION PRESSURE|CROWDING/,'POSITION_PRESSURE_INFERENCE','CAPABILITY','MERGE_INTO_CANON','Positioning pressure belongs to participant inference.'),
  mapping(/REACTION FUNCTION|THEORY OF MIND/,'REACTION_FUNCTIONS','CAPABILITY','MERGE_INTO_CANON','Participant response models consolidate into reaction functions.'),

  mapping(/MULTI HORIZON FORECAST|CROSS HORIZON INTELLIGENCE|FUTURE INTELLIGENCE/,'MULTI_HORIZON_FORECAST','CAPABILITY','MERGE_INTO_CANON','Future/horizon concepts consolidate into multi-horizon forecasting.'),
  mapping(/CALIBRAT|FORECAST ACCURACY/,'CALIBRATED_PROBABILITY','CAPABILITY','MERGE_INTO_CANON','Calibration belongs to forecast intelligence.'),
  mapping(/PLAUSIBLE PATH|PRICE PATH/,'PLAUSIBLE_PATHS','CAPABILITY','MERGE_INTO_CANON','Path distributions are canonical.'),
  mapping(/FORECAST REVISION|LIVE REVISION/,'FORECAST_REVISION','CAPABILITY','MERGE_INTO_CANON','Forecast revision is canonical.'),
  mapping(/FORECAST INVALIDATION|INVALIDATION/,'FORECAST_INVALIDATION','CAPABILITY','MERGE_INTO_CANON','Forecast invalidation is canonical.'),
  mapping(/ANALOG|SIMILAR EPISODE/,'HISTORICAL_ANALOGUES','RESEARCH_METHOD','MERGE_INTO_CANON','Historical analogues are canonical.'),
  mapping(/COUNTERFACTUAL FORECAST/,'COUNTERFACTUAL_FORECAST','RESEARCH_METHOD','ALREADY_CANONICAL','Counterfactual forecast analysis is canonical.'),

  mapping(/UNCERTAINTY/,'UNCERTAINTY_DECOMPOSITION','CAPABILITY','MERGE_INTO_CANON','Uncertainty should be decomposed explicitly.'),
  mapping(/ABSTAIN|ABSTENTION/,'ABSTAIN_POLICY','SCIENTIFIC_GUARD','MERGE_INTO_CANON','Abstention is a canonical first-class result.'),
  mapping(/FAILURE MEMORY|FAILURE MODE|FALSIFICATION MACHINE/,'FAILURE_MODE_DISCOVERY','RESEARCH_METHOD','MERGE_INTO_CANON','Failure-first research is canonical.'),
  mapping(/UNKNOWN UNKNOWN|BLINDSPOT HUNT/,'UNKNOWN_UNKNOWN_PROBES','RESEARCH_METHOD','MERGE_INTO_CANON','Unknown-unknown probes are canonical.'),
  mapping(/NEGATIVE KNOWLEDGE|NEGATIVE RESULT/,'NEGATIVE_KNOWLEDGE','RESEARCH_METHOD','MERGE_INTO_CANON','Negative knowledge is canonical.'),

  mapping(/OPPORTUNITY DISCOVERY|CHANCEN|LARGE MOVE RADAR/,'OPPORTUNITY_DISCOVERY','CAPABILITY','MERGE_INTO_CANON','Opportunity search belongs to decision intelligence.'),
  mapping(/INFORMATION ADJUSTED EXPECTANCY|EXPECTED UTILITY/,'EXPECTED_UTILITY_DECISION','CAPABILITY','MERGE_INTO_CANON','Information-adjusted expectancy consolidates into expected utility.'),
  mapping(/VALUE OF ABSTENTION/,'VALUE_OF_ABSTENTION','CAPABILITY','ALREADY_CANONICAL','Value of abstention is canonical.'),
  mapping(/OPPORTUNITY COST/,'OPPORTUNITY_COST','CAPABILITY','ALREADY_CANONICAL','Opportunity cost is canonical.'),
  mapping(/NO TRADE|GHOST PORTFOLIO/,'NO_TRADE_BASELINE','RESEARCH_METHOD','MERGE_INTO_CANON','No-trade and ghost baselines remain explicit counterfactuals.'),
  mapping(/STRATEGY ROUTER|STYLE SELECTION/,'STYLE_SELECTION','CAPABILITY','MERGE_INTO_CANON','Routing between trading styles is canonical.'),

  mapping(/TREND CONTINUATION/,'TREND_CONTINUATION','CAPABILITY','ALREADY_CANONICAL','Strategy is canonical.'),
  mapping(/BREAKOUT RETEST/,'BREAKOUT_RETEST','CAPABILITY','ALREADY_CANONICAL','Strategy is canonical.'),
  mapping(/RANGE MEAN REVERSION/,'RANGE_MEAN_REVERSION','CAPABILITY','ALREADY_CANONICAL','Strategy is canonical.'),
  mapping(/LIQUIDITY SWEEP/,'LIQUIDITY_SWEEP_REVERSAL','CAPABILITY','MERGE_INTO_CANON','Sweep reversal belongs to the canonical strategy family.'),
  mapping(/MOMENTUM EXPANSION/,'MOMENTUM_EXPANSION','CAPABILITY','ALREADY_CANONICAL','Strategy is canonical.'),
  mapping(/MEME MOMENTUM/,'MEME_MOMENTUM','CAPABILITY','ALREADY_CANONICAL','Memecoin momentum remains isolated as a research strategy.'),

  mapping(/LIQUIDITY MAP|LIQUIDITY GRAVITY/,'LIQUIDITY_MAP','CAPABILITY','MERGE_INTO_CANON','Liquidity-location ideas consolidate into the canonical map.'),
  mapping(/SWEEP DETECTION/,'SWEEP_DETECTION','CAPABILITY','ALREADY_CANONICAL','Sweep detection is canonical.'),
  mapping(/LIMIT ORDER|LIMIT ENTRY/,'LIMIT_ENTRY_SELECTION','CAPABILITY','MERGE_INTO_CANON','Limit-order intelligence maps to entry selection.'),
  mapping(/CONFIRMATION ENTRY/,'CONFIRMATION_ENTRY','CAPABILITY','ALREADY_CANONICAL','Confirmation entry is canonical.'),
  mapping(/AUTO ROUTING|MULTI VENUE|SLIPPAGE|ROUTING/,'ROUTING_SLIPPAGE','CAPABILITY','MERGE_INTO_CANON','Routing and slippage consolidate into execution realism.'),

  mapping(/ADAPTIVE HOLD/,'ADAPTIVE_HOLD_DURATION','CAPABILITY','ALREADY_CANONICAL','Adaptive holding is canonical.'),
  mapping(/STRUCTURAL INVALIDATION|GAP AWARE STOP/,'STRUCTURAL_INVALIDATION','CAPABILITY','MERGE_INTO_CANON','Exit on thesis invalidation rather than arbitrary timers.'),
  mapping(/PROFIT PROTECTION/,'PROFIT_PROTECTION','CAPABILITY','ALREADY_CANONICAL','Profit protection is canonical.'),
  mapping(/RUNNER/,'RUNNER_MANAGEMENT','CAPABILITY','MERGE_INTO_CANON','Runner management is canonical.'),
  mapping(/EXIT REGRET|REGRET/,'EXIT_REGRET','CAPABILITY','MERGE_INTO_CANON','Exit regret is canonical lifecycle learning.'),

  mapping(/RISK BASED SIZING|SIZING/,'RISK_BASED_SIZING','CAPABILITY','MERGE_INTO_CANON','Sizing belongs to portfolio risk.'),
  mapping(/CORRELATION|CONCENTRATION/,'CORRELATION_CONCENTRATION','CAPABILITY','MERGE_INTO_CANON','Correlation and concentration are canonical.'),
  mapping(/DRAWDOWN/,'DRAWDOWN_CONTROL','CAPABILITY','MERGE_INTO_CANON','Drawdown control is canonical.'),
  mapping(/TAIL STRESS|MONTE CARLO/,'TAIL_STRESS','RESEARCH_METHOD','MERGE_INTO_CANON','Tail stress belongs to portfolio robustness.'),
  mapping(/PORTFOLIO BRAIN|PORTFOLIO AWARE|CAPITAL ALLOCATION/,'EDGE_CAPITAL_ALLOCATION','CAPABILITY','MERGE_INTO_CANON','Portfolio allocation consolidates into edge-based allocation.'),
  mapping(/EDGE CAPACITY|SCALAB|MARKET IMPACT/,'EDGE_CAPACITY_CURVE','CAPABILITY','MERGE_INTO_CANON','Capacity economics is canonical.'),

  mapping(/DERIVATIVE|FUNDING|OPEN INTEREST|\bOI\b/,'DERIVATIVES_INTELLIGENCE','DATA_SOURCE','MERGE_INTO_CANON','Derivatives data belongs to governed multi-market intelligence.'),
  mapping(/LIQUIDATION/,'LIQUIDATION_INTELLIGENCE','DATA_SOURCE','MERGE_INTO_CANON','Liquidation telemetry is canonical.'),
  mapping(/ON CHAIN|ONCHAIN/,'ONCHAIN_INTELLIGENCE','DATA_SOURCE','MERGE_INTO_CANON','On-chain intelligence is canonical.'),
  mapping(/WALLET|ENTITY FLOW|TRADER INTELLIGENCE|ENTITY RESOLUTION/,'ENTITY_FLOW_INTELLIGENCE','DATA_SOURCE','MERGE_INTO_CANON','Wallet/entity ideas consolidate into governed entity-flow intelligence.'),
  mapping(/EVENT TO PRICE|EVENT IMPACT|EVENT INTELLIGENCE/,'EVENT_INTELLIGENCE','DATA_SOURCE','MERGE_INTO_CANON','Event effects belong to event intelligence.'),
  mapping(/NARRATIVE/,'NARRATIVE_INTELLIGENCE','DATA_SOURCE','MERGE_INTO_CANON','Narrative state is canonical research context.'),

  mapping(/REVERSE ENGINEER|FORECAST LEARNING/,'POST_TRADE_REVERSE_ENGINEERING','RESEARCH_METHOD','MERGE_INTO_CANON','Outcome learning belongs to reverse engineering.'),
  mapping(/MFE|MAE/,'MFE_MAE_LEARNING','RESEARCH_METHOD','MERGE_INTO_CANON','MFE/MAE learning is canonical.'),
  mapping(/FACTOR INTERACTION/,'FACTOR_INTERACTION_MEMORY','RESEARCH_METHOD','ALREADY_CANONICAL','Factor interactions are canonical research memory.'),
  mapping(/COUNTERFACTUAL LEARNING|COUNTERFACTUAL TRADE/,'COUNTERFACTUAL_TRADE_REPLAY','RESEARCH_METHOD','MERGE_INTO_CANON','Counterfactual trade replay is canonical.'),
  mapping(/DECISION QUALITY|LUCK|OUTCOME/,'DECISION_QUALITY_VS_OUTCOME','RESEARCH_METHOD','MERGE_INTO_CANON','Process quality is separated from outcome.'),
  mapping(/MISSED OPPORTUNITY|OPPORTUNITY LOSS/,'OPPORTUNITY_LOSS_MEMORY','RESEARCH_METHOD','MERGE_INTO_CANON','Missed opportunities are canonical memory.'),

  mapping(/RESEARCH AUTOPILOT|SELF QUESTION|ADAPTIVE HYPOTHESIS|GAP DRIVEN RESEARCH/,'SELF_QUESTIONING','RESEARCH_METHOD','MERGE_INTO_CANON','Autonomous research begins with self-questioning.'),
  mapping(/HYPOTHESIS/,'HYPOTHESIS_GENERATION','RESEARCH_METHOD','MERGE_INTO_CANON','Hypothesis generation is canonical.'),
  mapping(/EXPERIMENT DESIGN|PREDICTION COMMITMENT|PREREGISTER|PAIRED COUNTERFACTUAL|DISCRIMINAT/,'EXPERIMENT_DESIGN','RESEARCH_METHOD','MERGE_INTO_CANON','Experiment design and preregistration belong to autonomous research.'),
  mapping(/CAPABILITY GAP|DISCOVERY SIGNAL/,'CAPABILITY_GAP_DISCOVERY','RESEARCH_METHOD','MERGE_INTO_CANON','Capability gaps are canonical research triggers.'),
  mapping(/SKILL TREE|TECH TREE|CHILD SKILL/,'CHILD_SKILL_DISCOVERY','CAPABILITY','MERGE_INTO_CANON','Historical skill-tree concepts consolidate into governed child-skill discovery.'),
  mapping(/INFORMATION VALUE|SURPRISE|INFORMATION GAIN|DISCOVERY PRIORITY/,'INFORMATION_VALUE_PRIORITIZATION','RESEARCH_METHOD','MERGE_INTO_CANON','Information value is canonical research prioritization.'),

  mapping(/SELF MODEL|CONSCIOUSNESS LAYER/,'SELF_MODEL','CAPABILITY','MERGE_INTO_CANON','Useful self-model concepts survive without consciousness claims.'),
  mapping(/RULE DOMINANCE/,'RULE_DOMINANCE_AUDIT','SCIENTIFIC_GUARD','ALREADY_CANONICAL','Rule dominance audit is canonical.'),
  mapping(/FEATURE USEFULNESS|FEATURE USAGE/,'FEATURE_USAGE_AUDIT','SCIENTIFIC_GUARD','MERGE_INTO_CANON','Feature usefulness belongs to usage audit.'),
  mapping(/ASSUMPTION FRESHNESS|CLAIM TO ASSUMPTION/,'ASSUMPTION_FRESHNESS','SCIENTIFIC_GUARD','MERGE_INTO_CANON','Assumption state and freshness belong to meta-cognition.'),
  mapping(/ERROR RECURRENCE/,'ERROR_RECURRENCE_DETECTION','CAPABILITY','ALREADY_CANONICAL','Repeated error detection is canonical.'),
  mapping(/BLIND SPOT|BLINDSPOT/,'BLIND_SPOT_DISCOVERY','CAPABILITY','MERGE_INTO_CANON','Blind-spot discovery is canonical.'),
  mapping(/MONOCULTURE|DIVERSITY PRESERVATION|REASONING DIVERSITY/,'REASONING_DIVERSITY_AUDIT','SCIENTIFIC_GUARD','MERGE_INTO_CANON','Method diversity is a canonical self-audit concern.'),
  mapping(/SELF CALIBRATION/,'SELF_CALIBRATION_MONITOR','SCIENTIFIC_GUARD','ALREADY_CANONICAL','Self-calibration is canonical.'),

  mapping(/CHAMPION|CHALLENGER|VERSIONED CANDIDATE/,'VERSIONED_CANDIDATES','GOVERNANCE','MERGE_INTO_CANON','Champion/challenger concepts consolidate into versioned candidates and promotion.'),
  mapping(/FORWARD SHADOW|SHADOW PAPER/,'FORWARD_SHADOW_PROMOTION','GOVERNANCE','MERGE_INTO_CANON','Prospective shadow evidence is canonical.'),
  mapping(/STRESS PROMOTION|REGRESSION GATE|HOLDOUT FAILURE/,'STRESS_PROMOTION','SCIENTIFIC_GUARD','MERGE_INTO_CANON','Stress and regression gates belong to promotion governance.'),
  mapping(/EDGE DECAY/,'EDGE_DECAY_DEMOTION','GOVERNANCE','ALREADY_CANONICAL','Edge decay demotion is canonical.'),
  mapping(/ROLLBACK/,'ROLLBACK','GOVERNANCE','ALREADY_CANONICAL','Rollback is canonical.'),
  mapping(/SCIENTIFIC METHOD|SCIENTIFIC GUARD|EVIDENCE HIERARCHY|EVIDENCE LADDER/,'SCIENTIFIC_GUARD_ORCHESTRATION','SCIENTIFIC_GUARD','MERGE_INTO_CANON','Scientific controls consolidate into guard orchestration.'),
  mapping(/MULTIPLE TEST|SELECTION BIAS|OVERFITTING/,'MULTIPLE_TESTING_BUDGET','SCIENTIFIC_GUARD','MERGE_INTO_CANON','Multiple-testing control belongs to promotion governance.'),
  mapping(/SEALED OOS|SEALED META|HOLDOUT|FINAL META PROMOTION|AUDIT CERTIFICATE|PROMOTION AUDIT/,'REPRODUCIBLE_PROMOTION_AUDIT','SCIENTIFIC_GUARD','MERGE_INTO_CANON','Sealed evaluation and audit concepts consolidate into reproducible promotion audit.'),

  mapping(/REAL MONEY LOCK|INTEGRITY KERNEL|CONSTITUTION/,'CONSTITUTION_ENFORCEMENT','GOVERNANCE','MERGE_INTO_CANON','Immutable mission boundaries belong to constitutional control.'),
  mapping(/HUMAN APPROVAL|SEPARATE AUTHORITY|POLICY BEFORE POPULARITY/,'HUMAN_APPROVAL_GATE','GOVERNANCE','MERGE_INTO_CANON','External authority boundaries are canonical.'),
  mapping(/PERMISSION|SEPARATION OF POWERS/,'PERMISSION_BOUNDARIES','GOVERNANCE','MERGE_INTO_CANON','Authority separation belongs to permission boundaries.'),
  mapping(/CHANGE REVIEW|PEER REVIEW/,'CHANGE_REVIEW','GOVERNANCE','MERGE_INTO_CANON','Material changes require review.'),
  mapping(/MISSION CONSTRAINT|100K|CAPITAL MISSION/,'MISSION_CONSTRAINT_MONITOR','GOVERNANCE','MERGE_INTO_CANON','External mission constraints must not become direct risk optimization.'),

  mapping(/OBSERVABILITY|SYSTEM HEALTH|DATA HEALTH|FEED HEALTH/,'SERVICE_HEALTH_OBSERVABILITY','INFRASTRUCTURE','MERGE_INTO_CANON','Operational health is canonical platform capability.'),
  mapping(/REPRODUCIB|STATE FINGERPRINT/,'DETERMINISTIC_REPRODUCIBILITY','INFRASTRUCTURE','MERGE_INTO_CANON','Reproducibility belongs to platform integrity.'),
  mapping(/RECOVERY STATE|CRASH RECOVERY|SAVE RECOVERY/,'CRASH_RECOVERY_STATE_INTEGRITY','INFRASTRUCTURE','MERGE_INTO_CANON','Recovery state integrity is canonical.'),
  mapping(/FAIL CLOSED/,'FAIL_CLOSED_DEGRADATION','INFRASTRUCTURE','ALREADY_CANONICAL','Fail-closed degradation is canonical.'),
  mapping(/DATA POISON|DATA QUALITY GATE/,'DATA_POISONING_DETECTION','INFRASTRUCTURE','MERGE_INTO_CANON','Data integrity belongs to poisoning/quality controls.'),
  mapping(/SECURITY|CRYPTOGRAPHY|KEY ROTATION/,'SECRET_SUPPLY_CHAIN_SECURITY','INFRASTRUCTURE','MERGE_INTO_CANON','Infrastructure security remains separate from epistemic truth.'),
  mapping(/RESOURCE PRESSURE|RESOURCE BUDGET|ACTIVE DORMANT LAZY/,'RESOURCE_BUDGETING','INFRASTRUCTURE','MERGE_INTO_CANON','Bounded resources are canonical reliability concerns.'),

  mapping(/RESEARCH TRACE|FORECAST LEDGER|EVIDENCE HISTORY|FORECAST HISTORY/,'RESEARCH_TRACE_VIEW','OPERATOR_VIEW','MERGE_INTO_CANON','History/ledger concepts consolidate into auditable research trace.'),
  mapping(/LIVING THESIS/,'LIVING_THESIS','OPERATOR_VIEW','ALREADY_CANONICAL','Living Thesis is canonical.'),
  mapping(/WHY NOW/,'WHY_NOW','OPERATOR_VIEW','ALREADY_CANONICAL','WHY NOW is canonical.'),
  mapping(/WHY NOT TRADE/,'WHY_NOT_TRADE','OPERATOR_VIEW','ALREADY_CANONICAL','WHY NOT TRADE is canonical.'),
  mapping(/COMMAND CENTER|LIVE TERMINAL|LIVE MARKET PANEL|SUPERCHART|DEEP DIVE|GLOBAL INTELLIGENCE|WATCHLIST|ALERT CENTER|ACADEMY|GLOSSARY|CHART TRAINING|TRADING CHALLENGE|LEARNING PROGRESS|RESEARCH ACTIVITY PANEL|PERFORMANCE LAB/,'SKILL_TREE_VIEW','OPERATOR_VIEW','KEEP_AS_OPERATOR_FEATURE','Operator/product ideas stay views over canonical state; they are not research authority.'),

  mapping(/RESEARCH DATA PLANE|AUTO UPDATING FEED|DATA COLLECTOR|HISTORICAL DATA BASE|ARCHIVE|COLD STORAGE/,'PROVENANCE_CHAIN','INFRASTRUCTURE','KEEP_AS_INFRASTRUCTURE','Data-plane/storage ideas remain infrastructure feeding governed evidence.'),

  mapping(/MULTIVERSE|UNIVERSE|INTERVERSE|CIVILIZATION|REALITY GENOME|LIVING WORLD|DYNAMIC EARTH|FREQUENCY NETWORK|SEMANTIC INTERLINGUA|CROSS REALITY|ACTION BRANCH|TOTAL POSSIBILITY|QUEST COUNCIL/ ,null,'SIMULATION_RESEARCH','SIMULATION_ONLY','Synthetic-world machinery is not part of BIGGJ market-core unless a research principle is separately mapped.'),
  mapping(/EMOTION|AUTOBIOGRAPH|PERSONALITY|RELATIONSHIP/ ,null,'SIMULATION_RESEARCH','RETIRE_FROM_BIGGJ_CORE','Anthropomorphic simulation concepts are not needed in the market research core.')
]);

const UNIQUE_RESEARCH=Object.freeze([
  {
    pattern:/MARKET ENERGY|LATENT MARKET ENERGY/,
    proposalTitle:'LATENT_MARKET_ENERGY',
    parentCapabilityId:'FORCED_FLOW',
    purpose:'Research a bounded diagnostic for unreleased constrained flow weighted by proximity, urgency and liquidity impact; never label it physical energy or probability.'
  },
  {
    pattern:/MECHANISM POSTERIOR GRAPH/,
    proposalTitle:'MECHANISM_POSTERIOR_GRAPH',
    parentCapabilityId:'IDENTIFIABILITY',
    purpose:'Represent a posterior distribution over competing mechanism graphs rather than selecting one hidden story.'
  },
  {
    pattern:/REFLEXIVITY WITNESS ENSEMBLE/,
    proposalTitle:'REFLEXIVITY_WITNESS_ENSEMBLE',
    parentCapabilityId:'REFLEXIVITY',
    purpose:'Combine methodologically distinct reflexivity witnesses while preserving method lineage and dependence.'
  },
  {
    pattern:/INTERVENTION VALUE MAP/,
    proposalTitle:'INTERVENTION_VALUE_MAP',
    parentCapabilityId:'INFORMATION_VALUE_PRIORITIZATION',
    purpose:'Rank observations and stress tests by expected reduction in mechanism uncertainty.'
  },
  {
    pattern:/PRICE TIME CONSTRAINT SURFACE/,
    proposalTitle:'PRICE_TIME_CONSTRAINT_SURFACE',
    parentCapabilityId:'CONSTRAINT_MAP',
    purpose:'Represent price, time, latent forced flow and confidence jointly with temporal decay.'
  },
  {
    pattern:/MINIMUM CASCADE TRIGGER/,
    proposalTitle:'MINIMUM_CASCADE_TRIGGER',
    parentCapabilityId:'CASCADE_DYNAMICS',
    purpose:'Estimate the smallest bounded finite shock that reaches a preregistered cascade criterion.'
  },
  {
    pattern:/CASCADE BASIN/,
    proposalTitle:'CASCADE_BASIN',
    parentCapabilityId:'CASCADE_DYNAMICS',
    purpose:'Map shock and liquidity states to absorption, criticality or amplification.'
  },
  {
    pattern:/ABSORPTION RESERVE/,
    proposalTitle:'ABSORPTION_RESERVE',
    parentCapabilityId:'ABSORPTION',
    purpose:'Estimate additional liquidity or counterflow required to keep a defined cascade below a target reproduction level.'
  },
  {
    pattern:/MECHANISM ENSEMBLE|IDENTIFIABILITY TWIN/,
    proposalTitle:'MECHANISM_ENSEMBLE',
    parentCapabilityId:'IDENTIFIABILITY',
    purpose:'Run multiple plausible hidden-mechanism reconstructions and expose robustness, ambiguity and underidentification.'
  },
  {
    pattern:/CAUSAL EPISODE MEMORY/,
    proposalTitle:'CAUSAL_EPISODE_MEMORY',
    parentCapabilityId:'POST_TRADE_REVERSE_ENGINEERING',
    purpose:'Store mechanism episodes with state, constraints, trigger, generations, liquidity reaction and later outcomes.'
  },
  {
    pattern:/LEAVE ONE OUT/,
    proposalTitle:'LEAVE_ONE_OUT_ROBUSTNESS',
    parentCapabilityId:'SCIENTIFIC_GUARD_ORCHESTRATION',
    purpose:'Test whether conclusions survive removal of one evidence lineage, feature family, symbol, regime or winner.'
  },
  {
    pattern:/MEMECOIN.*RUG|RUG STACK/,
    proposalTitle:'MEME_RUG_RISK_INTELLIGENCE',
    parentCapabilityId:'MEME_MOMENTUM',
    purpose:'Keep rug/manipulation/liquidity-fragility research isolated from general memecoin momentum evidence.'
  },
  {
    pattern:/CLAIM TO ASSUMPTION GRAPH/,
    proposalTitle:'CLAIM_ASSUMPTION_GRAPH',
    parentCapabilityId:'PROVENANCE_CHAIN',
    purpose:'Track which claims depend on which explicit assumptions so hidden assumption load is auditable.'
  },
  {
    pattern:/EXPERIMENT BLUEPRINT DSL|RESEARCH PROCESS GENOME/,
    proposalTitle:'GOVERNED_EXPERIMENT_BLUEPRINTS',
    parentCapabilityId:'EXPERIMENT_DESIGN',
    purpose:'Allow bounded declarative experiment/process blueprints without arbitrary code self-modification.'
  },
  {
    pattern:/RESEARCH OPERATING GENOME/,
    proposalTitle:'RESEARCH_POLICY_GENOME',
    parentCapabilityId:'CHILD_SKILL_DISCOVERY',
    purpose:'Represent bounded research-policy candidates as versioned challengers under an immutable integrity kernel.'
  }
]);

function directCapabilityMatch(title){
  const n=token(title);
  const exact=BIGGJ_SEED_CAPABILITIES.find(x=>x.id===n);
  if(exact) return {
    capabilityId:exact.id,
    role:'CAPABILITY',
    disposition:'ALREADY_CANONICAL',
    rationale:'Historical title matches a current canonical capability.'
  };
  return null;
}

function researchProposal(title){
  const n=norm(title);
  for(const x of UNIQUE_RESEARCH){
    if(x.pattern.test(n)) return x;
  }
  return null;
}

function classifyIdea(idea){
  const title=norm(idea.title);
  const direct=directCapabilityMatch(idea.title);
  if(direct) return direct;

  const unique=researchProposal(idea.title);
  if(unique){
    return {
      capabilityId:unique.parentCapabilityId,
      role:'CAPABILITY',
      disposition:'KEEP_AS_RESEARCH_PROPOSAL',
      rationale:unique.purpose,
      proposedChildSkill:{
        title:unique.proposalTitle,
        parentCapabilityId:unique.parentCapabilityId,
        purpose:unique.purpose
      }
    };
  }

  for(const rule of RULES){
    rule.pattern.lastIndex=0;
    if(rule.pattern.test(title)){
      return {
        capabilityId:rule.capabilityId,
        role:rule.role,
        disposition:rule.disposition,
        rationale:rule.rationale
      };
    }
  }

  return {
    capabilityId:null,
    role:'UNKNOWN',
    disposition:'NEEDS_REVIEW',
    rationale:'No sufficiently specific canonical mapping rule matched.'
  };
}

function rootForCapability(capabilityId){
  const cap=capabilityById.get(capabilityId);
  return cap?.parentId||null;
}

function semanticKey(row){
  if(row.proposedChildSkill?.title) return 'PROPOSAL:'+row.proposedChildSkill.title;
  if(row.capabilityId) return 'CAP:'+row.capabilityId+':'+row.role;
  return 'TITLE:'+token(row.title);
}

export function migrateBiggjHistoricalIdeas({ideas=BIGGJ_HISTORICAL_IDEAS}={}){
  const migrated=ideas.map(idea=>{
    const classification=classifyIdea(idea);
    const capability=classification.capabilityId?capabilityById.get(classification.capabilityId):null;
    const rootId=classification.capabilityId?rootForCapability(classification.capabilityId):null;
    const leverage=classification.capabilityId?canonicalSkillLeverage(classification.capabilityId):null;
    const dependencies=classification.capabilityId
      ?canonicalDependenciesFor(classification.capabilityId).map(x=>({
        dependencyCapabilityId:x.dependencyCapabilityId,
        relation:x.relation
      }))
      :[];
    const core={
      ...idea,
      normalizedTitle:norm(idea.title),
      role:classification.role,
      disposition:classification.disposition,
      rootId,
      capabilityId:classification.capabilityId||null,
      capabilityPlane:capability?.plane||null,
      capabilityPriority:capability?.priority||null,
      rationale:classification.rationale,
      proposedChildSkill:classification.proposedChildSkill||null,
      canonicalDependencies:dependencies,
      dependencyLeverage:leverage?.score||0,
      transitiveUnlocks:leverage?.transitiveUnlocks||0
    };
    return {...core,semanticKey:semanticKey(core)};
  });

  const groups=new Map();
  for(const row of migrated){
    const arr=groups.get(row.semanticKey)||[];
    arr.push(row.historicalIdeaId);
    groups.set(row.semanticKey,arr);
  }

  const withDuplicates=migrated.map(row=>({
    ...row,
    duplicateGroupSize:groups.get(row.semanticKey)?.length||1,
    duplicateHistoricalIdeaIds:[...(groups.get(row.semanticKey)||[])]
  }));

  const counts={};
  for(const disposition of BIGGJ_HISTORICAL_DISPOSITIONS){
    counts[disposition]=withDuplicates.filter(x=>x.disposition===disposition).length;
  }

  return finalized({
    version:BIGGJ_HISTORICAL_MIGRATION_VERSION,
    sourceIdeaCount:withDuplicates.length,
    mappedCount:withDuplicates.filter(x=>x.capabilityId).length,
    uniqueSemanticTargets:groups.size,
    dispositions:counts,
    ideas:withDuplicates,
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecuteLive:false
  });
}

export function biggjHistoricalMigrationQueue({limit=100}={}){
  const report=migrateBiggjHistoricalIdeas();
  const rank={
    KEEP_AS_RESEARCH_PROPOSAL:6,
    NEEDS_REVIEW:5,
    MERGE_INTO_CANON:4,
    KEEP_AS_INFRASTRUCTURE:3,
    KEEP_AS_OPERATOR_FEATURE:2,
    ALREADY_CANONICAL:1,
    SIMULATION_ONLY:0,
    RETIRE_FROM_BIGGJ_CORE:0
  };
  const rows=report.ideas
    .filter(x=>!['SIMULATION_ONLY','RETIRE_FROM_BIGGJ_CORE'].includes(x.disposition))
    .sort((a,b)=>
      (rank[b.disposition]??0)-(rank[a.disposition]??0)||
      b.dependencyLeverage-a.dependencyLeverage||
      b.transitiveUnlocks-a.transitiveUnlocks||
      b.duplicateGroupSize-a.duplicateGroupSize||
      a.historicalIdeaId.localeCompare(b.historicalIdeaId)
    )
    .slice(0,Math.max(1,Number(limit)||100));

  return finalized({
    version:BIGGJ_HISTORICAL_MIGRATION_VERSION,
    queue:rows,
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecuteLive:false
  });
}

export function biggjHistoricalResearchProposals(){
  const report=migrateBiggjHistoricalIdeas();
  const byTitle=new Map();
  for(const row of report.ideas){
    if(row.disposition!=='KEEP_AS_RESEARCH_PROPOSAL'||!row.proposedChildSkill) continue;
    const key=row.proposedChildSkill.title;
    const existing=byTitle.get(key)||{
      ...row.proposedChildSkill,
      sourceIdeaIds:[],
      sourceTitles:[],
      recoveryConfidence:[]
    };
    existing.sourceIdeaIds.push(row.historicalIdeaId);
    existing.sourceTitles.push(row.title);
    existing.recoveryConfidence.push(row.recoveryConfidence);
    byTitle.set(key,existing);
  }
  return finalized({
    version:BIGGJ_HISTORICAL_MIGRATION_VERSION,
    proposals:[...byTitle.values()].sort((a,b)=>a.title.localeCompare(b.title)),
    automaticSkillCreation:false,
    automaticPromotion:false,
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecuteLive:false
  });
}

export function biggjHistoricalMigrationSummary(){
  const report=migrateBiggjHistoricalIdeas();
  const proposals=biggjHistoricalResearchProposals().proposals;
  const review=report.ideas.filter(x=>x.disposition==='NEEDS_REVIEW');
  const simulationOnly=report.ideas.filter(x=>x.disposition==='SIMULATION_ONLY');
  const topLeverage=report.ideas
    .filter(x=>x.capabilityId&&!['SIMULATION_ONLY','RETIRE_FROM_BIGGJ_CORE'].includes(x.disposition))
    .sort((a,b)=>b.dependencyLeverage-a.dependencyLeverage||b.transitiveUnlocks-a.transitiveUnlocks)
    .slice(0,25);

  return finalized({
    version:BIGGJ_HISTORICAL_MIGRATION_VERSION,
    sourceIdeaCount:report.sourceIdeaCount,
    mappedCount:report.mappedCount,
    uniqueSemanticTargets:report.uniqueSemanticTargets,
    dispositions:report.dispositions,
    researchProposalCount:proposals.length,
    proposals,
    needsReviewCount:review.length,
    needsReview:review.map(x=>({
      historicalIdeaId:x.historicalIdeaId,
      source:x.source,
      sourceRef:x.sourceRef,
      title:x.title
    })),
    simulationOnlyCount:simulationOnly.length,
    topLeverage:topLeverage.map(x=>({
      historicalIdeaId:x.historicalIdeaId,
      title:x.title,
      capabilityId:x.capabilityId,
      disposition:x.disposition,
      dependencyLeverage:x.dependencyLeverage,
      transitiveUnlocks:x.transitiveUnlocks
    })),
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecuteLive:false
  });
}
