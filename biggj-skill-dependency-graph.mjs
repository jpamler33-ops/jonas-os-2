import { sha256 } from './institutional-kernel.mjs';
import {
  BIGGJ_CAPABILITY_ROOTS,
  BIGGJ_SEED_CAPABILITIES
} from './biggj-capability-map.mjs';

export const BIGGJ_DEPENDENCY_GRAPH_VERSION='BIGGJ_DEPENDENCY_GRAPH_V1';

export const BIGGJ_DEPENDENCY_PHASES=Object.freeze([
  'RESEARCH',
  'TESTING',
  'DECISION',
  'TRUST'
]);

export const BIGGJ_DEPENDENCY_RELATIONS=Object.freeze([
  'HARD',
  'SUPPORT',
  'GUARD'
]);

const deepFreeze=value=>{
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    Object.freeze(value);
    for(const v of Object.values(value)) deepFreeze(v);
  }
  return value;
};
const uniq=xs=>[...new Set((xs||[]).map(String))];
const finalized=core=>deepFreeze({...core,fingerprint:sha256(core)});
const STATE_RANK=Object.freeze({
  UNKNOWN:0,
  DISCOVERING:1,
  LEARNING:2,
  TESTING:3,
  VALIDATED:4,
  TRUSTED:5,
  DECAYING:2,
  RETIRED:-1
});
const PHASE_MIN_STATE=Object.freeze({
  RESEARCH:'DISCOVERING',
  TESTING:'LEARNING',
  DECISION:'TESTING',
  TRUST:'VALIDATED'
});
const rootEdge=(consumerRootId,dependencyRootId,relation='HARD',reason='')=>({
  consumerRootId,dependencyRootId,relation,reason
});
const edge=(consumerCapabilityId,dependencyCapabilityId,relation='HARD',reason='')=>({
  consumerCapabilityId,dependencyCapabilityId,relation,reason
});
const member=(capabilityId,minState='TESTING')=>({capabilityId,minState});
const composition=(id,purpose,phase,members)=>({id,purpose,phase,members});

export const BIGGJ_ROOT_DEPENDENCIES=deepFreeze([
  rootEdge('EVIDENCE_INTELLIGENCE','MARKET_TRUTH','HARD','Evidence is meaningless without point-in-time truth.'),
  rootEdge('MULTI_MARKET_INTELLIGENCE','MARKET_TRUTH','HARD','All external modalities require temporal truth.'),
  rootEdge('MULTI_MARKET_INTELLIGENCE','EVIDENCE_INTELLIGENCE','HARD','New modalities must enter through provenance and dependency governance.'),
  rootEdge('WORLD_STATE_MODEL','MARKET_TRUTH','HARD','World state must be reconstructable at the decision time.'),
  rootEdge('WORLD_STATE_MODEL','EVIDENCE_INTELLIGENCE','HARD','State variables require governed evidence and uncertainty.'),
  rootEdge('WORLD_STATE_MODEL','MULTI_MARKET_INTELLIGENCE','SUPPORT','Cross-market modalities improve state coverage but are not mandatory for every state.'),

  rootEdge('MECHANISM_INTELLIGENCE','WORLD_STATE_MODEL','HARD','Mechanisms explain transitions between explicit states.'),
  rootEdge('MECHANISM_INTELLIGENCE','EVIDENCE_INTELLIGENCE','HARD','Mechanism claims require independent evidence and provenance.'),
  rootEdge('PARTICIPANT_GAME_THEORY','WORLD_STATE_MODEL','HARD','Participant inference requires a coherent state representation.'),
  rootEdge('PARTICIPANT_GAME_THEORY','EVIDENCE_INTELLIGENCE','HARD','Hidden participant state must remain inference grounded in evidence.'),
  rootEdge('PARTICIPANT_GAME_THEORY','MECHANISM_INTELLIGENCE','SUPPORT','Participant constraints often explain mechanisms but must not create a causal loop.'),
  rootEdge('FORECAST_INTELLIGENCE','WORLD_STATE_MODEL','HARD','Forecasts start from a defined current state.'),
  rootEdge('FORECAST_INTELLIGENCE','MECHANISM_INTELLIGENCE','SUPPORT','Mechanism information can improve forecast transportability.'),
  rootEdge('FORECAST_INTELLIGENCE','PARTICIPANT_GAME_THEORY','SUPPORT','Strategic participant behavior can improve scenario quality.'),
  rootEdge('FAILURE_UNCERTAINTY','EVIDENCE_INTELLIGENCE','HARD','Uncertainty must reflect evidence quality and disagreement.'),
  rootEdge('FAILURE_UNCERTAINTY','WORLD_STATE_MODEL','HARD','Unknown state variables and transitions are failure sources.'),

  rootEdge('OPPORTUNITY_DECISION','FORECAST_INTELLIGENCE','HARD','A decision needs a probabilistic outcome model.'),
  rootEdge('OPPORTUNITY_DECISION','FAILURE_UNCERTAINTY','HARD','Expected value without uncertainty and abstention is unsafe.'),
  rootEdge('TRADING_STYLE_INTELLIGENCE','WORLD_STATE_MODEL','HARD','Style selection depends on horizon and regime state.'),
  rootEdge('TRADING_STYLE_INTELLIGENCE','OPPORTUNITY_DECISION','HARD','Style is chosen only after deciding an opportunity merits expression.'),
  rootEdge('SETUP_STRATEGY_INTELLIGENCE','MECHANISM_INTELLIGENCE','HARD','Setups should correspond to plausible mechanisms, not shapes alone.'),
  rootEdge('SETUP_STRATEGY_INTELLIGENCE','TRADING_STYLE_INTELLIGENCE','HARD','The same setup differs by expression horizon.'),
  rootEdge('SETUP_STRATEGY_INTELLIGENCE','FORECAST_INTELLIGENCE','HARD','Strategy choice must align with forecast distribution and horizon.'),
  rootEdge('EXECUTION_MICROSTRUCTURE','OPPORTUNITY_DECISION','HARD','Execution is downstream of a justified opportunity.'),
  rootEdge('EXECUTION_MICROSTRUCTURE','SETUP_STRATEGY_INTELLIGENCE','HARD','Entry method depends on the selected setup.'),
  rootEdge('EXECUTION_MICROSTRUCTURE','WORLD_STATE_MODEL','HARD','Executable liquidity is part of current market state.'),
  rootEdge('POSITION_LIFECYCLE','FORECAST_INTELLIGENCE','HARD','Lifecycle reacts to forecast revision and invalidation.'),
  rootEdge('POSITION_LIFECYCLE','FAILURE_UNCERTAINTY','HARD','Hold decisions must react to uncertainty and thesis failure.'),
  rootEdge('POSITION_LIFECYCLE','EXECUTION_MICROSTRUCTURE','HARD','Lifecycle starts from an actual shadow fill state.'),
  rootEdge('PORTFOLIO_RISK','OPPORTUNITY_DECISION','HARD','Portfolio allocation aggregates justified opportunities.'),
  rootEdge('PORTFOLIO_RISK','FAILURE_UNCERTAINTY','HARD','Risk budgets depend on uncertainty and failure modes.'),
  rootEdge('CAPITAL_CAPACITY_ECONOMICS','EXECUTION_MICROSTRUCTURE','HARD','Capacity is constrained by depth, fills, slippage and impact.'),
  rootEdge('CAPITAL_CAPACITY_ECONOMICS','PORTFOLIO_RISK','HARD','Scalability is bounded by portfolio risk and concentration.'),

  rootEdge('LEARNING_REVERSE_ENGINEERING','MARKET_TRUTH','HARD','Learning must replay the original point-in-time state.'),
  rootEdge('LEARNING_REVERSE_ENGINEERING','EVIDENCE_INTELLIGENCE','HARD','Post-hoc learning must preserve provenance and evidence classes.'),
  rootEdge('AUTONOMOUS_RESEARCH','LEARNING_REVERSE_ENGINEERING','HARD','Research questions should originate from measured residuals and failures.'),
  rootEdge('AUTONOMOUS_RESEARCH','FAILURE_UNCERTAINTY','HARD','Knowledge gaps and uncertainty determine research value.'),
  rootEdge('META_COGNITION','LEARNING_REVERSE_ENGINEERING','HARD','Self-observation needs decision and outcome history.'),
  rootEdge('META_COGNITION','AUTONOMOUS_RESEARCH','HARD','Meta-learning evaluates how BIGGJ chooses what to research.'),
  rootEdge('META_COGNITION','EVIDENCE_INTELLIGENCE','HARD','Self-confidence must account for hidden evidence dependence.'),

  rootEdge('PROMOTION_GOVERNANCE','AUTONOMOUS_RESEARCH','HARD','Candidates originate from governed research.'),
  rootEdge('PROMOTION_GOVERNANCE','META_COGNITION','HARD','Promotion should know if model or research monoculture is distorting confidence.'),
  rootEdge('PROMOTION_GOVERNANCE','RELIABILITY_SECURITY_OPERATIONS','GUARD','Promotion evidence must be reproducible and operationally trustworthy.'),
  rootEdge('PROMOTION_GOVERNANCE','HUMAN_OVERSIGHT_CONTROL','GUARD','Governed transitions may require explicit operator authority.'),
  rootEdge('HUMAN_OVERSIGHT_CONTROL','RELIABILITY_SECURITY_OPERATIONS','HARD','Controls and freezes require trustworthy operational state.'),
  rootEdge('EXPLAINABILITY_OPERATOR','EVIDENCE_INTELLIGENCE','HARD','Explanations require provenance rather than narrative reconstruction.'),
  rootEdge('EXPLAINABILITY_OPERATOR','FAILURE_UNCERTAINTY','HARD','Operator views must show blockers, unknowns and invalidation.'),
  rootEdge('EXPLAINABILITY_OPERATOR','META_COGNITION','SUPPORT','Operator surfaces should expose BIGGJ self-observation when available.')
]);

export const BIGGJ_SKILL_DEPENDENCIES=deepFreeze([
  edge('DETERMINISTIC_REPLAY','PIT_EVENT_CLOCK','HARD','Replay requires event and availability clocks.'),
  edge('PROVENANCE_CHAIN','PIT_EVENT_CLOCK','HARD','Provenance must preserve temporal availability.'),
  edge('SOURCE_TRUST','PIT_EVENT_CLOCK','HARD','Source quality includes freshness and availability semantics.'),
  edge('SOURCE_TRUST','PROVENANCE_CHAIN','HARD','Trust cannot be detached from source lineage.'),
  edge('EVIDENCE_INDEPENDENCE','PROVENANCE_CHAIN','HARD','Independence requires lineage resolution.'),
  edge('COMMON_CAUSE_GUARD','PROVENANCE_CHAIN','HARD','Common causes are found through lineage.'),
  edge('DISAGREEMENT_ENGINE','PROVENANCE_CHAIN','HARD','Disagreement must retain source identity.'),
  edge('COVERAGE_GAP_DETECTION','SOURCE_TRUST','HARD','Coverage depends on knowing expected and valid source classes.'),

  edge('CANONICAL_WORLD_STATE','PIT_EVENT_CLOCK','HARD','State must be valid at a specific as-of time.'),
  edge('CANONICAL_WORLD_STATE','PROVENANCE_CHAIN','HARD','Every state variable needs lineage.'),
  edge('CANONICAL_WORLD_STATE','EVIDENCE_INDEPENDENCE','GUARD','Independent evidence prevents false state certainty.'),
  edge('MULTISCALE_STATE_GRAPH','CANONICAL_WORLD_STATE','HARD','Multiple horizons must derive from one canonical state contract.'),
  edge('STATE_UNCERTAINTY','CANONICAL_WORLD_STATE','HARD','Uncertainty annotates explicit state variables.'),
  edge('STATE_UNCERTAINTY','COVERAGE_GAP_DETECTION','HARD','Missing modalities must widen state uncertainty.'),
  edge('STATE_UNCERTAINTY','DISAGREEMENT_ENGINE','HARD','Contradiction is a source of state uncertainty.'),
  edge('REGIME_TRANSITION_MODEL','CANONICAL_WORLD_STATE','HARD','Regime transitions are state transitions.'),
  edge('REGIME_TRANSITION_MODEL','CHANGE_POINT_DETECTION','HARD','Transition models require explicit change-point evidence.'),
  edge('REGIME_TRANSITION_MODEL','REGIME_STATE_MEMORY','HARD','Transition estimates require prior state episodes.'),
  edge('STATE_CHANGE_ATTRIBUTION','CANONICAL_WORLD_STATE','HARD','Change attribution compares canonical state snapshots.'),
  edge('STATE_CHANGE_ATTRIBUTION','PROVENANCE_CHAIN','HARD','Attributed changes require evidence lineage.'),

  edge('CONSTRAINT_MAP','CANONICAL_WORLD_STATE','HARD','Constraints act on a defined market state.'),
  edge('CONSTRAINT_MAP','PROVENANCE_CHAIN','HARD','Constraint claims need explicit evidence.'),
  edge('IDENTIFIABILITY','PROVENANCE_CHAIN','HARD','Causal identification requires traceable evidence.'),
  edge('IDENTIFIABILITY','EVIDENCE_INDEPENDENCE','HARD','Correlated witnesses cannot identify separate causes.'),
  edge('IDENTIFIABILITY','COMMON_CAUSE_GUARD','HARD','Identification requires common-cause controls.'),
  edge('FORCED_FLOW','CANONICAL_WORLD_STATE','HARD','Forced flow must explain a state transition.'),
  edge('FORCED_FLOW','CONSTRAINT_MAP','HARD','Forced actions require a binding constraint.'),
  edge('FORCED_FLOW','DERIVATIVES_INTELLIGENCE','SUPPORT','Derivatives telemetry can strengthen forced-flow evidence.'),
  edge('LIQUIDITY_ELASTICITY','CANONICAL_WORLD_STATE','HARD','Elasticity is conditional on current liquidity state.'),
  edge('LIQUIDITY_ELASTICITY','LIQUIDITY_MAP','SUPPORT','Execution-level liquidity maps improve elasticity estimation.'),

  edge('PARTICIPANT_CLASSIFICATION','CANONICAL_WORLD_STATE','HARD','Participant archetypes are inferred from state and behavior.'),
  edge('PARTICIPANT_CLASSIFICATION','PROVENANCE_CHAIN','HARD','Classification evidence must remain inspectable.'),
  edge('INCENTIVE_CONSTRAINT_INFERENCE','PARTICIPANT_CLASSIFICATION','HARD','Incentives belong to an explicit participant hypothesis.'),
  edge('INCENTIVE_CONSTRAINT_INFERENCE','CONSTRAINT_MAP','HARD','Incentive inference must respect binding constraints.'),
  edge('INCENTIVE_CONSTRAINT_INFERENCE','IDENTIFIABILITY','GUARD','Participant explanations must not be promoted as causal without identification checks.'),
  edge('POSITION_PRESSURE_INFERENCE','PARTICIPANT_CLASSIFICATION','HARD','Pressure is conditional on who is plausibly exposed.'),
  edge('POSITION_PRESSURE_INFERENCE','DERIVATIVES_INTELLIGENCE','SUPPORT','Funding and OI provide useful positioning proxies.'),
  edge('REACTION_FUNCTIONS','PARTICIPANT_CLASSIFICATION','HARD','Reactions must be attached to defined participant classes.'),
  edge('REACTION_FUNCTIONS','INCENTIVE_CONSTRAINT_INFERENCE','HARD','Reaction functions depend on incentives and constraints.'),
  edge('REACTION_FUNCTIONS','STATE_CHANGE_ATTRIBUTION','HARD','Responses are learned from state changes.'),
  edge('CROWDING_GAME_DYNAMICS','POSITION_PRESSURE_INFERENCE','HARD','Crowding requires inferred positioning pressure.'),
  edge('CROWDING_GAME_DYNAMICS','REACTION_FUNCTIONS','HARD','Crowding fragility depends on shared reactions.'),
  edge('CROWDING_GAME_DYNAMICS','LIQUIDITY_ELASTICITY','HARD','Crowded exits become dangerous when liquidity is inelastic.'),

  edge('MULTI_HORIZON_FORECAST','CANONICAL_WORLD_STATE','HARD','Forecasts require a defined current state.'),
  edge('MULTI_HORIZON_FORECAST','STATE_UNCERTAINTY','HARD','Forecasts must inherit uncertainty in the initial state.'),
  edge('HISTORICAL_ANALOGUES','DETERMINISTIC_REPLAY','HARD','Analogues must be reconstructed point in time.'),
  edge('HISTORICAL_ANALOGUES','CANONICAL_WORLD_STATE','HARD','Similarity compares canonical state representations.'),
  edge('CALIBRATED_PROBABILITY','MULTI_HORIZON_FORECAST','HARD','Calibration scores issued forecasts.'),
  edge('CALIBRATED_PROBABILITY','DETERMINISTIC_REPLAY','HARD','Calibration outcomes require reproducible historical issuance.'),
  edge('FORECAST_REVISION','MULTI_HORIZON_FORECAST','HARD','Revision requires an original frozen forecast.'),
  edge('FORECAST_REVISION','STATE_CHANGE_ATTRIBUTION','HARD','Revision should explain which state changes caused it.'),
  edge('FORECAST_INVALIDATION','MULTI_HORIZON_FORECAST','HARD','Invalidation is defined relative to a forecast thesis.'),
  edge('FORECAST_INVALIDATION','STATE_CHANGE_ATTRIBUTION','HARD','Invalidation requires observable state change criteria.'),
  edge('COUNTERFACTUAL_FORECAST','MULTI_HORIZON_FORECAST','HARD','Counterfactuals vary assumptions around an issued forecast.'),
  edge('COUNTERFACTUAL_FORECAST','IDENTIFIABILITY','SUPPORT','Identification limits prevent causal overclaiming in counterfactuals.'),

  edge('UNCERTAINTY_DECOMPOSITION','STATE_UNCERTAINTY','HARD','State uncertainty is one uncertainty component.'),
  edge('UNCERTAINTY_DECOMPOSITION','EVIDENCE_INDEPENDENCE','HARD','Evidence dependence must be represented in uncertainty.'),
  edge('UNCERTAINTY_DECOMPOSITION','CALIBRATED_PROBABILITY','HARD','Calibration error is a model uncertainty component.'),
  edge('ABSTAIN_POLICY','UNCERTAINTY_DECOMPOSITION','HARD','Abstention is triggered by unresolved uncertainty.'),
  edge('ABSTAIN_POLICY','FORECAST_INVALIDATION','HARD','Invalid or stale forecasts must force abstention.'),
  edge('FAILURE_MODE_DISCOVERY','DETERMINISTIC_REPLAY','HARD','Failure modes must be reproducible.'),
  edge('FAILURE_MODE_DISCOVERY','UNCERTAINTY_DECOMPOSITION','HARD','Residual uncertainty guides failure search.'),
  edge('UNKNOWN_UNKNOWN_PROBES','FAILURE_MODE_DISCOVERY','HARD','Unknown-unknown probes originate from unexplained failures.'),
  edge('NEGATIVE_KNOWLEDGE','DETERMINISTIC_REPLAY','HARD','No-edge contexts require reproducible comparison.'),
  edge('NEGATIVE_KNOWLEDGE','DECISION_QUALITY_VS_OUTCOME','HARD','Negative knowledge must separate process from realized luck.'),

  edge('NO_TRADE_BASELINE','DETERMINISTIC_REPLAY','HARD','No-trade opportunity cost requires a reproducible baseline.'),
  edge('OPPORTUNITY_DISCOVERY','CANONICAL_WORLD_STATE','HARD','Search requires comparable market states.'),
  edge('OPPORTUNITY_DISCOVERY','MULTI_HORIZON_FORECAST','HARD','Candidates need forecast distributions.'),
  edge('OPPORTUNITY_DISCOVERY','ABSTAIN_POLICY','GUARD','Search must allow the valid result that nothing is actionable.'),
  edge('OPPORTUNITY_COST','OPPORTUNITY_DISCOVERY','HARD','Opportunity cost compares alternatives from the same opportunity set.'),
  edge('OPPORTUNITY_COST','NO_TRADE_BASELINE','HARD','Doing nothing is an explicit alternative.'),
  edge('VALUE_OF_ABSTENTION','ABSTAIN_POLICY','HARD','Abstention value builds on the abstention policy.'),
  edge('VALUE_OF_ABSTENTION','OPPORTUNITY_COST','HARD','Waiting has value only relative to available alternatives.'),
  edge('EXPECTED_UTILITY_DECISION','CALIBRATED_PROBABILITY','HARD','Expected utility needs calibrated probabilities.'),
  edge('EXPECTED_UTILITY_DECISION','UNCERTAINTY_DECOMPOSITION','HARD','Expected utility must penalize unresolved uncertainty.'),
  edge('EXPECTED_UTILITY_DECISION','OPPORTUNITY_COST','HARD','A decision must be compared with alternatives.'),
  edge('EXPECTED_UTILITY_DECISION','NO_TRADE_BASELINE','HARD','No-trade remains the reference action.'),
  edge('EXPECTED_UTILITY_DECISION','ROUTING_SLIPPAGE','SUPPORT','Execution costs improve utility realism.'),
  edge('DECISION_UNDER_DISAGREEMENT','DISAGREEMENT_ENGINE','HARD','The decision layer must preserve contradictory witnesses.'),
  edge('DECISION_UNDER_DISAGREEMENT','UNCERTAINTY_DECOMPOSITION','HARD','Disagreement must translate into uncertainty.'),
  edge('DECISION_UNDER_DISAGREEMENT','EXPECTED_UTILITY_DECISION','HARD','The final action compares utilities under disagreement.'),
  edge('STYLE_SELECTION','CANONICAL_WORLD_STATE','HARD','Style depends on current horizon and regime state.'),
  edge('STYLE_SELECTION','REGIME_TRANSITION_MODEL','HARD','Style must account for likely regime transition.'),
  edge('STYLE_SELECTION','EXPECTED_UTILITY_DECISION','HARD','Style is selected only for justified opportunities.'),

  edge('LIQUIDITY_MAP','CANONICAL_WORLD_STATE','HARD','Liquidity must be time-aligned with the current state.'),
  edge('LIQUIDITY_MAP','LIQUIDATION_INTELLIGENCE','SUPPORT','Observed liquidation flow can enrich liquidity context.'),
  edge('ROUTING_SLIPPAGE','PIT_EVENT_CLOCK','HARD','Fill and slippage estimates require time-valid book state.'),
  edge('ROUTING_SLIPPAGE','LIQUIDITY_MAP','HARD','Routing depends on executable depth.'),
  edge('STRUCTURAL_INVALIDATION','FORECAST_INVALIDATION','HARD','Position invalidation derives from the thesis invalidation contract.'),
  edge('STRUCTURAL_INVALIDATION','STATE_CHANGE_ATTRIBUTION','HARD','Exits require an observed state break, not a timer alone.'),
  edge('ADAPTIVE_HOLD_DURATION','STRUCTURAL_INVALIDATION','HARD','Adaptive hold cannot overrule structural invalidation.'),
  edge('ADAPTIVE_HOLD_DURATION','FORECAST_REVISION','HARD','Hold duration reacts to updated thesis probabilities.'),

  edge('RISK_BASED_SIZING','EXPECTED_UTILITY_DECISION','HARD','Sizing is downstream of a justified opportunity.'),
  edge('RISK_BASED_SIZING','UNCERTAINTY_DECOMPOSITION','HARD','Risk falls as epistemic uncertainty rises.'),
  edge('CORRELATION_CONCENTRATION','CANONICAL_WORLD_STATE','HARD','Exposure correlation depends on current cross-market state.'),
  edge('TAIL_STRESS','CANONICAL_WORLD_STATE','HARD','Stress scenarios start from current state.'),
  edge('TAIL_STRESS','UNCERTAINTY_DECOMPOSITION','HARD','Unknowns and model error shape stress assumptions.'),
  edge('EDGE_CAPITAL_ALLOCATION','RISK_BASED_SIZING','HARD','Allocation aggregates position-level risk budgets.'),
  edge('EDGE_CAPITAL_ALLOCATION','CORRELATION_CONCENTRATION','HARD','Allocation must control duplicated exposure.'),
  edge('EDGE_CAPITAL_ALLOCATION','TAIL_STRESS','GUARD','Capital allocation must survive tail stress.'),

  edge('COST_TURNOVER_ECONOMICS','ROUTING_SLIPPAGE','HARD','Economic drag includes realistic execution cost.'),
  edge('LIQUIDITY_ADJUSTED_SCALABILITY','LIQUIDITY_MAP','HARD','Scalability depends on available depth.'),
  edge('LIQUIDITY_ADJUSTED_SCALABILITY','COST_TURNOVER_ECONOMICS','HARD','Capacity is net of recurring cost.'),
  edge('MARKET_IMPACT_MODEL','LIQUIDITY_ADJUSTED_SCALABILITY','HARD','Impact begins where passive liquidity becomes scarce.'),
  edge('EDGE_CAPACITY_CURVE','LIQUIDITY_ADJUSTED_SCALABILITY','HARD','Capacity curves need liquidity-adjusted size estimates.'),
  edge('EDGE_CAPACITY_CURVE','MARKET_IMPACT_MODEL','HARD','Larger hypothetical size must include market impact.'),
  edge('EDGE_CAPACITY_CURVE','COST_TURNOVER_ECONOMICS','HARD','Expected edge is net of costs.'),
  edge('COMPOUNDING_SURVIVAL','DRAWDOWN_CONTROL','HARD','Compounding fails if drawdowns are not survivable.'),
  edge('COMPOUNDING_SURVIVAL','TAIL_STRESS','HARD','Compounding assumptions must survive tail scenarios.'),
  edge('COMPOUNDING_SURVIVAL','COST_TURNOVER_ECONOMICS','HARD','Compounding uses net, not gross, expectancy.'),

  edge('DECISION_QUALITY_VS_OUTCOME','DETERMINISTIC_REPLAY','HARD','Decision quality must be judged from information available then.'),
  edge('DECISION_QUALITY_VS_OUTCOME','PROVENANCE_CHAIN','HARD','The original decision inputs must remain traceable.'),
  edge('POST_TRADE_REVERSE_ENGINEERING','DECISION_QUALITY_VS_OUTCOME','HARD','Reverse engineering starts by separating process from luck.'),
  edge('POST_TRADE_REVERSE_ENGINEERING','DETERMINISTIC_REPLAY','HARD','The original path must be reproducible.'),
  edge('MFE_MAE_LEARNING','POST_TRADE_REVERSE_ENGINEERING','HARD','MFE/MAE is interpreted inside the original decision context.'),
  edge('COUNTERFACTUAL_TRADE_REPLAY','DETERMINISTIC_REPLAY','HARD','Counterfactual trades require the same PIT event stream.'),
  edge('COUNTERFACTUAL_TRADE_REPLAY','DECISION_QUALITY_VS_OUTCOME','HARD','Alternative actions must not rewrite original decision quality.'),
  edge('OPPORTUNITY_LOSS_MEMORY','COUNTERFACTUAL_TRADE_REPLAY','HARD','Missed value requires alternative action paths.'),
  edge('OPPORTUNITY_LOSS_MEMORY','NO_TRADE_BASELINE','HARD','Abstention and inactivity are explicit counterfactuals.'),

  edge('SELF_QUESTIONING','FAILURE_MODE_DISCOVERY','HARD','Useful questions originate from measured failures and residuals.'),
  edge('SELF_QUESTIONING','DECISION_QUALITY_VS_OUTCOME','HARD','Research should target process errors, not only losses.'),
  edge('HYPOTHESIS_GENERATION','SELF_QUESTIONING','HARD','Hypotheses answer explicit research questions.'),
  edge('HYPOTHESIS_GENERATION','PROVENANCE_CHAIN','HARD','Hypotheses must identify evidence that could support or falsify them.'),
  edge('EXPERIMENT_DESIGN','HYPOTHESIS_GENERATION','HARD','Experiments require a falsifiable hypothesis first.'),
  edge('EXPERIMENT_DESIGN','DETERMINISTIC_REPLAY','HARD','Discovery and replay protocols must be reproducible.'),
  edge('CAPABILITY_GAP_DISCOVERY','SELF_QUESTIONING','HARD','Missing capabilities emerge from unanswered questions.'),
  edge('CHILD_SKILL_DISCOVERY','CAPABILITY_GAP_DISCOVERY','HARD','New child skills require a demonstrated capability gap.'),
  edge('CHILD_SKILL_DISCOVERY','HYPOTHESIS_GENERATION','HARD','A new skill begins as a falsifiable research proposal.'),
  edge('INFORMATION_VALUE_PRIORITIZATION','SELF_QUESTIONING','HARD','Information value ranks explicit questions.'),
  edge('INFORMATION_VALUE_PRIORITIZATION','UNCERTAINTY_DECOMPOSITION','HARD','Research value rises when it can reduce decision-relevant uncertainty.'),
  edge('INFORMATION_VALUE_PRIORITIZATION','OPPORTUNITY_COST','SUPPORT','Research time has an opportunity cost.'),

  edge('RULE_DOMINANCE_AUDIT','SELF_MODEL','HARD','Rule dominance requires a model of actual policy usage.'),
  edge('RULE_DOMINANCE_AUDIT','DECISION_QUALITY_VS_OUTCOME','HARD','Dominant rules must be evaluated against process quality.'),
  edge('FEATURE_USAGE_AUDIT','SELF_MODEL','HARD','Feature usage requires a model of internal decision paths.'),
  edge('FEATURE_USAGE_AUDIT','PROVENANCE_CHAIN','HARD','Feature contribution must remain tied to evidence lineage.'),
  edge('ASSUMPTION_FRESHNESS','SELF_MODEL','HARD','Assumptions must be represented before they can age.'),
  edge('ASSUMPTION_FRESHNESS','PROVENANCE_CHAIN','HARD','Revalidation evidence needs provenance.'),
  edge('ERROR_RECURRENCE_DETECTION','SELF_MODEL','HARD','Repeated failures must map to the responsible system components.'),
  edge('ERROR_RECURRENCE_DETECTION','POST_TRADE_REVERSE_ENGINEERING','HARD','Error clusters require decomposed historical failures.'),
  edge('BLIND_SPOT_DISCOVERY','ERROR_RECURRENCE_DETECTION','HARD','Blind spots emerge from repeated unexplained residuals.'),
  edge('BLIND_SPOT_DISCOVERY','UNKNOWN_UNKNOWN_PROBES','HARD','Unknown-unknown probes search the residual space.'),
  edge('REASONING_DIVERSITY_AUDIT','SELF_MODEL','HARD','Reasoning diversity requires an inventory of models and evidence paths.'),
  edge('REASONING_DIVERSITY_AUDIT','EVIDENCE_INDEPENDENCE','HARD','Apparent model diversity may still share evidence.'),
  edge('SELF_CALIBRATION_MONITOR','SELF_MODEL','HARD','Self-calibration requires capability-level confidence history.'),
  edge('SELF_CALIBRATION_MONITOR','CALIBRATED_PROBABILITY','HARD','Forecast calibration is a major self-calibration input.'),
  edge('SELF_CALIBRATION_MONITOR','DECISION_QUALITY_VS_OUTCOME','HARD','Confidence must be compared with process quality and outcomes.'),

  edge('FORWARD_SHADOW_PROMOTION','VERSIONED_CANDIDATES','HARD','Forward tests require immutable candidate identity.'),
  edge('FORWARD_SHADOW_PROMOTION','EXPERIMENT_DESIGN','HARD','Forward shadow criteria must be pre-specified.'),
  edge('STRESS_PROMOTION','FORWARD_SHADOW_PROMOTION','HARD','Stress validation follows prospective evidence.'),
  edge('STRESS_PROMOTION','TAIL_STRESS','HARD','Promotion stress includes adverse market scenarios.'),
  edge('EDGE_DECAY_DEMOTION','SELF_CALIBRATION_MONITOR','HARD','Demotion should detect forward calibration decay.'),
  edge('EDGE_DECAY_DEMOTION','PATTERN_HALF_LIFE','HARD','Relationship half-life informs decay monitoring.'),
  edge('ROLLBACK','VERSIONED_CANDIDATES','HARD','Rollback requires immutable candidate versions.'),
  edge('SCIENTIFIC_GUARD_ORCHESTRATION','EVIDENCE_INDEPENDENCE','HARD','Scientific guards require independence checks.'),
  edge('SCIENTIFIC_GUARD_ORCHESTRATION','IDENTIFIABILITY','HARD','Causal claims require identifiability guards.'),
  edge('SCIENTIFIC_GUARD_ORCHESTRATION','UNCERTAINTY_DECOMPOSITION','HARD','Scientific validity must expose uncertainty.'),
  edge('SCIENTIFIC_GUARD_ORCHESTRATION','DETERMINISTIC_REPRODUCIBILITY','GUARD','A scientific result must be reproducible.'),
  edge('MULTIPLE_TESTING_BUDGET','VERSIONED_CANDIDATES','HARD','Experiment counts require candidate identity.'),
  edge('MULTIPLE_TESTING_BUDGET','EXPERIMENT_DESIGN','HARD','Testing budgets belong to pre-specified experiments.'),
  edge('REPRODUCIBLE_PROMOTION_AUDIT','SCIENTIFIC_GUARD_ORCHESTRATION','HARD','Promotion records include all required guard outcomes.'),
  edge('REPRODUCIBLE_PROMOTION_AUDIT','DETERMINISTIC_REPRODUCIBILITY','GUARD','Promotion evidence must replay exactly.'),

  edge('PERMISSION_BOUNDARIES','CONSTITUTION_ENFORCEMENT','HARD','Permissions derive from the governing constitution.'),
  edge('CHANGE_REVIEW','VERSIONED_CANDIDATES','HARD','Material changes need immutable versions.'),
  edge('HUMAN_APPROVAL_GATE','CHANGE_REVIEW','HARD','Approval requires an inspectable change.'),
  edge('HUMAN_APPROVAL_GATE','REPRODUCIBLE_PROMOTION_AUDIT','GUARD','Approval cannot substitute for failed scientific evidence.'),
  edge('EMERGENCY_FREEZE','SERVICE_HEALTH_OBSERVABILITY','HARD','Emergency control needs trustworthy health state.'),
  edge('OPERATOR_OVERRIDE_AUDIT','PERMISSION_BOUNDARIES','HARD','Override authority must be explicit.'),
  edge('OPERATOR_OVERRIDE_AUDIT','PROVENANCE_CHAIN','HARD','Override records require immutable provenance.'),
  edge('MISSION_CONSTRAINT_MONITOR','SELF_MODEL','HARD','Mission drift requires visibility into actual system behavior.'),
  edge('MISSION_CONSTRAINT_MONITOR','EDGE_CAPACITY_CURVE','SUPPORT','Capacity economics informs long-horizon mission feasibility.'),

  edge('DETERMINISTIC_REPRODUCIBILITY','PIT_EVENT_CLOCK','HARD','Reproduction requires time-correct inputs.'),
  edge('DETERMINISTIC_REPRODUCIBILITY','PROVENANCE_CHAIN','HARD','Reproduction requires exact input lineage.'),
  edge('CRASH_RECOVERY_STATE_INTEGRITY','DETERMINISTIC_REPRODUCIBILITY','HARD','Recovered state must reproduce canonical results.'),
  edge('FAIL_CLOSED_DEGRADATION','SERVICE_HEALTH_OBSERVABILITY','HARD','Fail-closed behavior needs dependency health.'),
  edge('FAIL_CLOSED_DEGRADATION','ABSTAIN_POLICY','GUARD','Operational uncertainty must resolve to abstention.'),
  edge('DATA_POISONING_DETECTION','SOURCE_TRUST','HARD','Poison detection uses expected source behavior.'),
  edge('DATA_POISONING_DETECTION','COVERAGE_GAP_DETECTION','HARD','Poisoning can appear as impossible coverage or distribution changes.'),
  edge('RESOURCE_BUDGETING','SERVICE_HEALTH_OBSERVABILITY','HARD','Resource limits depend on observed system health.'),
  edge('CHAOS_RECOVERY_TESTING','CRASH_RECOVERY_STATE_INTEGRITY','HARD','Chaos testing verifies state recovery.'),
  edge('CHAOS_RECOVERY_TESTING','FAIL_CLOSED_DEGRADATION','HARD','Chaos tests verify conservative degradation.'),

  edge('RESEARCH_TRACE_VIEW','PROVENANCE_CHAIN','HARD','Trace views expose source-to-decision lineage.'),
  edge('LIVING_THESIS','CANONICAL_WORLD_STATE','HARD','The thesis describes current state.'),
  edge('LIVING_THESIS','FORECAST_REVISION','HARD','The thesis must explain what changed.'),
  edge('LIVING_THESIS','FORECAST_INVALIDATION','HARD','The thesis must expose its failure condition.'),
  edge('WHY_NOW','EXPECTED_UTILITY_DECISION','HARD','WHY NOW explains the current action comparison.'),
  edge('WHY_NOT_TRADE','ABSTAIN_POLICY','HARD','WHY NOT TRADE explains abstention blockers.')
]);

export const BIGGJ_SKILL_COMPOSITIONS=deepFreeze([
  composition(
    'PIT_TRUTH_STACK',
    'Reconstruct exactly what was knowable and prove where every input came from.',
    'TESTING',
    [
      member('PIT_EVENT_CLOCK','LEARNING'),
      member('DETERMINISTIC_REPLAY','LEARNING'),
      member('PROVENANCE_CHAIN','LEARNING'),
      member('SOURCE_TRUST','LEARNING'),
      member('EVIDENCE_INDEPENDENCE','LEARNING')
    ]
  ),
  composition(
    'WORLD_STATE_STACK',
    'Create one coherent, uncertainty-aware multi-scale state representation.',
    'TESTING',
    [
      member('CANONICAL_WORLD_STATE','LEARNING'),
      member('MULTISCALE_STATE_GRAPH','LEARNING'),
      member('STATE_UNCERTAINTY','LEARNING'),
      member('STATE_CHANGE_ATTRIBUTION','LEARNING'),
      member('REGIME_TRANSITION_MODEL','LEARNING')
    ]
  ),
  composition(
    'MECHANISM_PARTICIPANT_STACK',
    'Explain state transitions through mechanisms, incentives, constraints and participant reactions.',
    'TESTING',
    [
      member('CONSTRAINT_MAP','LEARNING'),
      member('IDENTIFIABILITY','LEARNING'),
      member('FORCED_FLOW','LEARNING'),
      member('INCENTIVE_CONSTRAINT_INFERENCE','LEARNING'),
      member('REACTION_FUNCTIONS','LEARNING')
    ]
  ),
  composition(
    'FORECAST_SCIENCE_STACK',
    'Issue calibrated, revisable forecasts with explicit uncertainty and invalidation.',
    'DECISION',
    [
      member('MULTI_HORIZON_FORECAST','TESTING'),
      member('CALIBRATED_PROBABILITY','TESTING'),
      member('FORECAST_REVISION','TESTING'),
      member('FORECAST_INVALIDATION','TESTING'),
      member('UNCERTAINTY_DECOMPOSITION','TESTING'),
      member('ABSTAIN_POLICY','TESTING')
    ]
  ),
  composition(
    'SHADOW_DECISION_READINESS_STACK',
    'Choose trade, wait, research or abstain without confusing forecast direction with decision quality.',
    'DECISION',
    [
      member('OPPORTUNITY_DISCOVERY','TESTING'),
      member('NO_TRADE_BASELINE','TESTING'),
      member('OPPORTUNITY_COST','TESTING'),
      member('VALUE_OF_ABSTENTION','TESTING'),
      member('EXPECTED_UTILITY_DECISION','TESTING'),
      member('DECISION_UNDER_DISAGREEMENT','TESTING'),
      member('STYLE_SELECTION','TESTING')
    ]
  ),
  composition(
    'EXECUTION_LIFECYCLE_STACK',
    'Translate a justified shadow opportunity into realistic entry, invalidation and adaptive holding behavior.',
    'DECISION',
    [
      member('LIQUIDITY_MAP','TESTING'),
      member('ROUTING_SLIPPAGE','TESTING'),
      member('STRUCTURAL_INVALIDATION','TESTING'),
      member('ADAPTIVE_HOLD_DURATION','TESTING')
    ]
  ),
  composition(
    'CAPITAL_SCALABILITY_STACK',
    'Measure whether risk-adjusted edge survives costs, concentration, larger hypothetical size and compounding constraints.',
    'DECISION',
    [
      member('RISK_BASED_SIZING','TESTING'),
      member('CORRELATION_CONCENTRATION','TESTING'),
      member('TAIL_STRESS','TESTING'),
      member('EDGE_CAPITAL_ALLOCATION','TESTING'),
      member('COST_TURNOVER_ECONOMICS','TESTING'),
      member('EDGE_CAPACITY_CURVE','TESTING'),
      member('COMPOUNDING_SURVIVAL','TESTING')
    ]
  ),
  composition(
    'LEARNING_EVOLUTION_STACK',
    'Turn every forecast and shadow outcome into governed new knowledge and higher-value research questions.',
    'TESTING',
    [
      member('DECISION_QUALITY_VS_OUTCOME','LEARNING'),
      member('POST_TRADE_REVERSE_ENGINEERING','LEARNING'),
      member('COUNTERFACTUAL_TRADE_REPLAY','LEARNING'),
      member('SELF_QUESTIONING','LEARNING'),
      member('INFORMATION_VALUE_PRIORITIZATION','LEARNING'),
      member('SELF_CALIBRATION_MONITOR','LEARNING'),
      member('RULE_DOMINANCE_AUDIT','LEARNING')
    ]
  ),
  composition(
    'PROMOTION_TRUST_STACK',
    'Require prospective evidence, stress, scientific guards, reproducibility and governed approval before trust.',
    'TRUST',
    [
      member('VERSIONED_CANDIDATES','VALIDATED'),
      member('FORWARD_SHADOW_PROMOTION','VALIDATED'),
      member('STRESS_PROMOTION','VALIDATED'),
      member('SCIENTIFIC_GUARD_ORCHESTRATION','VALIDATED'),
      member('REPRODUCIBLE_PROMOTION_AUDIT','VALIDATED'),
      member('DETERMINISTIC_REPRODUCIBILITY','VALIDATED'),
      member('HUMAN_APPROVAL_GATE','VALIDATED')
    ]
  ),
  composition(
    'SYSTEM_SURVIVAL_STACK',
    'Keep BIGGJ fail-closed, reproducible and recoverable when infrastructure or data becomes unreliable.',
    'DECISION',
    [
      member('SERVICE_HEALTH_OBSERVABILITY','TESTING'),
      member('DETERMINISTIC_REPRODUCIBILITY','TESTING'),
      member('CRASH_RECOVERY_STATE_INTEGRITY','TESTING'),
      member('FAIL_CLOSED_DEGRADATION','TESTING'),
      member('DATA_POISONING_DETECTION','TESTING'),
      member('SECRET_SUPPLY_CHAIN_SECURITY','TESTING'),
      member('RESOURCE_BUDGETING','TESTING')
    ]
  )
]);

function capabilityIdSet(){
  return new Set(BIGGJ_SEED_CAPABILITIES.map(x=>x.id));
}
function rootIdSet(){
  return new Set(BIGGJ_CAPABILITY_ROOTS.map(x=>x.id));
}
function stateRank(state){
  return STATE_RANK[String(state||'UNKNOWN').toUpperCase()]??-1;
}
function stateSatisfies(state,minState,phase){
  const s=String(state||'UNKNOWN').toUpperCase();
  if(s==='RETIRED') return false;
  if(s==='DECAYING'&&phase!=='RESEARCH') return false;
  return stateRank(s)>=stateRank(minState);
}
function phaseMinState(phase){
  const p=String(phase||'TESTING').toUpperCase();
  if(!BIGGJ_DEPENDENCY_PHASES.includes(p)) throw new Error('invalid dependency phase '+p);
  return PHASE_MIN_STATE[p];
}
function relationBlocks(relation,phase){
  const r=String(relation||'HARD').toUpperCase();
  const p=String(phase||'TESTING').toUpperCase();
  if(p==='RESEARCH') return false;
  if(r==='SUPPORT') return false;
  if(r==='GUARD') return p==='DECISION'||p==='TRUST';
  return true;
}
function findCapabilityNode(tree,capabilityId){
  return (tree?.nodes||[]).find(x=>String(x.capabilityId)===String(capabilityId)&&x.kind!=='ROOT')||null;
}
function cycleCheck(nodes,edges,consumerKey,dependencyKey){
  const adjacency=new Map(nodes.map(x=>[x,[]]));
  for(const e of edges){
    const a=e[consumerKey],b=e[dependencyKey];
    if(adjacency.has(a)) adjacency.get(a).push(b);
  }
  const visiting=new Set(),visited=new Set(),stack=[];
  function dfs(id){
    if(visiting.has(id)){
      const at=stack.indexOf(id);
      return [...stack.slice(at),id];
    }
    if(visited.has(id)) return null;
    visiting.add(id);
    stack.push(id);
    for(const d of adjacency.get(id)||[]){
      const cycle=dfs(d);
      if(cycle) return cycle;
    }
    stack.pop();
    visiting.delete(id);
    visited.add(id);
    return null;
  }
  for(const id of nodes){
    const cycle=dfs(id);
    if(cycle) return cycle;
  }
  return null;
}

export function validateBiggjDependencyGraph(){
  const capabilityIds=capabilityIdSet();
  const rootIds=rootIdSet();
  const reasons=[];
  const rootSeen=new Set();
  for(const e of BIGGJ_ROOT_DEPENDENCIES){
    const key=e.consumerRootId+'>'+e.dependencyRootId+'>'+e.relation;
    if(rootSeen.has(key)) reasons.push('DUPLICATE_ROOT_EDGE:'+key);
    rootSeen.add(key);
    if(!rootIds.has(e.consumerRootId)) reasons.push('UNKNOWN_ROOT_CONSUMER:'+e.consumerRootId);
    if(!rootIds.has(e.dependencyRootId)) reasons.push('UNKNOWN_ROOT_DEPENDENCY:'+e.dependencyRootId);
    if(e.consumerRootId===e.dependencyRootId) reasons.push('SELF_ROOT_DEPENDENCY:'+e.consumerRootId);
    if(!BIGGJ_DEPENDENCY_RELATIONS.includes(e.relation)) reasons.push('UNKNOWN_ROOT_RELATION:'+e.relation);
  }
  const skillSeen=new Set();
  for(const e of BIGGJ_SKILL_DEPENDENCIES){
    const key=e.consumerCapabilityId+'>'+e.dependencyCapabilityId+'>'+e.relation;
    if(skillSeen.has(key)) reasons.push('DUPLICATE_SKILL_EDGE:'+key);
    skillSeen.add(key);
    if(!capabilityIds.has(e.consumerCapabilityId)) reasons.push('UNKNOWN_SKILL_CONSUMER:'+e.consumerCapabilityId);
    if(!capabilityIds.has(e.dependencyCapabilityId)) reasons.push('UNKNOWN_SKILL_DEPENDENCY:'+e.dependencyCapabilityId);
    if(e.consumerCapabilityId===e.dependencyCapabilityId) reasons.push('SELF_SKILL_DEPENDENCY:'+e.consumerCapabilityId);
    if(!BIGGJ_DEPENDENCY_RELATIONS.includes(e.relation)) reasons.push('UNKNOWN_SKILL_RELATION:'+e.relation);
  }
  for(const c of BIGGJ_SKILL_COMPOSITIONS){
    for(const m of c.members){
      if(!capabilityIds.has(m.capabilityId)) reasons.push('UNKNOWN_COMPOSITION_MEMBER:'+c.id+':'+m.capabilityId);
      if(stateRank(m.minState)<0) reasons.push('UNKNOWN_COMPOSITION_MIN_STATE:'+c.id+':'+m.minState);
    }
  }
  const rootCycle=cycleCheck([...rootIds],BIGGJ_ROOT_DEPENDENCIES.filter(x=>x.relation!=='SUPPORT'),'consumerRootId','dependencyRootId');
  if(rootCycle) reasons.push('ROOT_DEPENDENCY_CYCLE:'+rootCycle.join('>'));
  const skillCycle=cycleCheck([...capabilityIds],BIGGJ_SKILL_DEPENDENCIES.filter(x=>x.relation!=='SUPPORT'),'consumerCapabilityId','dependencyCapabilityId');
  if(skillCycle) reasons.push('SKILL_DEPENDENCY_CYCLE:'+skillCycle.join('>'));

  return finalized({
    version:BIGGJ_DEPENDENCY_GRAPH_VERSION,
    ok:reasons.length===0,
    reasons:uniq(reasons),
    rootEdgeCount:BIGGJ_ROOT_DEPENDENCIES.length,
    skillEdgeCount:BIGGJ_SKILL_DEPENDENCIES.length,
    compositionCount:BIGGJ_SKILL_COMPOSITIONS.length,
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecuteLive:false
  });
}

export function canonicalDependenciesFor(capabilityId){
  const id=String(capabilityId||'').toUpperCase();
  return deepFreeze(BIGGJ_SKILL_DEPENDENCIES.filter(x=>x.consumerCapabilityId===id).map(x=>({...x})));
}

export function canonicalDependentsOf(capabilityId,{includeSupport=true}={}){
  const id=String(capabilityId||'').toUpperCase();
  return deepFreeze(BIGGJ_SKILL_DEPENDENCIES
    .filter(x=>x.dependencyCapabilityId===id&&(includeSupport||x.relation!=='SUPPORT'))
    .map(x=>({...x})));
}

export function evaluateBiggjSkillDependencyGate(tree,{skillId,phase='TESTING'}={}){
  const p=String(phase||'TESTING').toUpperCase();
  const minState=phaseMinState(p);
  const node=(tree?.nodes||[]).find(x=>String(x.skillId)===String(skillId));
  if(!node) throw new Error('skill missing');
  const dependencies=[];

  for(const e of canonicalDependenciesFor(node.capabilityId)){
    const dependency=findCapabilityNode(tree,e.dependencyCapabilityId);
    const state=dependency?.status||'MISSING';
    const satisfied=Boolean(dependency)&&stateSatisfies(state,minState,p);
    dependencies.push({
      source:'CANONICAL',
      dependencySkillId:dependency?.skillId||null,
      dependencyCapabilityId:e.dependencyCapabilityId,
      relation:e.relation,
      requiredState:minState,
      actualState:state,
      satisfied,
      blocks:relationBlocks(e.relation,p)&&!satisfied,
      reason:e.reason
    });
  }

  for(const dependencySkillId of uniq(node.dependencies||[])){
    const dependency=(tree?.nodes||[]).find(x=>String(x.skillId)===String(dependencySkillId));
    const state=dependency?.status||'MISSING';
    const satisfied=Boolean(dependency)&&stateSatisfies(state,minState,p);
    dependencies.push({
      source:'DISCOVERED_SKILL',
      dependencySkillId,
      dependencyCapabilityId:dependency?.capabilityId||null,
      relation:'HARD',
      requiredState:minState,
      actualState:state,
      satisfied,
      blocks:p!=='RESEARCH'&&!satisfied,
      reason:'Explicit dependency declared by the discovered skill.'
    });
  }

  const blockers=dependencies.filter(x=>x.blocks);
  const warnings=dependencies.filter(x=>!x.satisfied&&!x.blocks);
  return finalized({
    version:BIGGJ_DEPENDENCY_GRAPH_VERSION,
    skillId:node.skillId,
    capabilityId:node.capabilityId,
    phase:p,
    ready:blockers.length===0,
    requiredState:minState,
    dependencies,
    blockers,
    warnings,
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecuteLive:false
  });
}

function transitiveDependents(capabilityId,{includeSupport=false}={}){
  const seen=new Set();
  const queue=[String(capabilityId||'').toUpperCase()];
  while(queue.length){
    const current=queue.shift();
    for(const e of BIGGJ_SKILL_DEPENDENCIES){
      if(e.dependencyCapabilityId!==current) continue;
      if(!includeSupport&&e.relation==='SUPPORT') continue;
      if(!seen.has(e.consumerCapabilityId)){
        seen.add(e.consumerCapabilityId);
        queue.push(e.consumerCapabilityId);
      }
    }
  }
  seen.delete(String(capabilityId||'').toUpperCase());
  return [...seen];
}

function compositionMemberships(capabilityId){
  const id=String(capabilityId||'').toUpperCase();
  return BIGGJ_SKILL_COMPOSITIONS.filter(c=>c.members.some(m=>m.capabilityId===id)).map(c=>c.id);
}

let LEVERAGE_INDEX_CACHE=null;
function leverageIndex(){
  if(LEVERAGE_INDEX_CACHE) return LEVERAGE_INDEX_CACHE;
  const allIds=BIGGJ_SEED_CAPABILITIES.map(x=>x.id);
  const raw=allIds.map(id=>({
    id,
    direct:canonicalDependentsOf(id,{includeSupport:false}).length,
    transitive:transitiveDependents(id,{includeSupport:false}).length,
    compositions:compositionMemberships(id)
  }));
  const maxDirect=Math.max(1,...raw.map(x=>x.direct));
  const maxTransitive=Math.max(1,...raw.map(x=>x.transitive));
  const maxCompositions=Math.max(1,...raw.map(x=>x.compositions.length));
  LEVERAGE_INDEX_CACHE=new Map(raw.map(row=>{
    const score=
      .25*(row.direct/maxDirect)+
      .55*(row.transitive/maxTransitive)+
      .20*(row.compositions.length/maxCompositions);
    return [row.id,deepFreeze({
      capabilityId:row.id,
      score:Math.max(0,Math.min(1,score)),
      directUnlocks:row.direct,
      transitiveUnlocks:row.transitive,
      compositionCount:row.compositions.length,
      compositions:[...row.compositions]
    })];
  }));
  return LEVERAGE_INDEX_CACHE;
}

export function canonicalSkillLeverage(capabilityId){
  const id=String(capabilityId||'').toUpperCase();
  return leverageIndex().get(id)||deepFreeze({
    capabilityId:id,
    score:0,
    directUnlocks:0,
    transitiveUnlocks:0,
    compositionCount:0,
    compositions:[]
  });
}

export function biggjDependencyLeverageReport({limit=25}={}){
  const rows=BIGGJ_SEED_CAPABILITIES.map(x=>({
    ...canonicalSkillLeverage(x.id),
    rootId:x.parentId,
    plane:x.plane,
    priority:x.priority
  })).sort((a,b)=>b.score-a.score||b.transitiveUnlocks-a.transitiveUnlocks||a.capabilityId.localeCompare(b.capabilityId));
  return finalized({
    version:BIGGJ_DEPENDENCY_GRAPH_VERSION,
    totalCapabilities:rows.length,
    rows:rows.slice(0,Math.max(1,Number(limit)||25)),
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecuteLive:false
  });
}

export function evaluateBiggjComposition(tree,compositionId){
  const id=String(compositionId||'').toUpperCase();
  const c=BIGGJ_SKILL_COMPOSITIONS.find(x=>x.id===id);
  if(!c) throw new Error('composition missing');
  const members=[];
  const dependencyBlockers=[];

  for(const spec of c.members){
    const node=findCapabilityNode(tree,spec.capabilityId);
    const actualState=node?.status||'MISSING';
    const stateReady=Boolean(node)&&stateSatisfies(actualState,spec.minState,c.phase);
    const gate=node?evaluateBiggjSkillDependencyGate(tree,{skillId:node.skillId,phase:c.phase}):null;
    members.push({
      capabilityId:spec.capabilityId,
      skillId:node?.skillId||null,
      requiredState:spec.minState,
      actualState,
      stateReady,
      dependencyReady:gate?.ready===true
    });
    if(gate&&!gate.ready) dependencyBlockers.push(...gate.blockers.map(x=>({
      memberCapabilityId:spec.capabilityId,
      ...x
    })));
  }
  const memberBlockers=members.filter(x=>!x.stateReady);
  return finalized({
    version:BIGGJ_DEPENDENCY_GRAPH_VERSION,
    compositionId:c.id,
    purpose:c.purpose,
    phase:c.phase,
    ready:memberBlockers.length===0&&dependencyBlockers.length===0,
    members,
    memberBlockers,
    dependencyBlockers,
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecuteLive:false
  });
}

export function biggjCompositionReadiness(tree){
  const rows=BIGGJ_SKILL_COMPOSITIONS.map(x=>evaluateBiggjComposition(tree,x.id));
  return finalized({
    version:BIGGJ_DEPENDENCY_GRAPH_VERSION,
    ready:rows.filter(x=>x.ready).map(x=>x.compositionId),
    blocked:rows.filter(x=>!x.ready).map(x=>({
      compositionId:x.compositionId,
      phase:x.phase,
      memberBlockers:x.memberBlockers.length,
      dependencyBlockers:x.dependencyBlockers.length
    })),
    compositions:rows,
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecuteLive:false
  });
}

export function biggjDependencyBottleneckReport(tree,{phase='TESTING',limit=25}={}){
  const p=String(phase||'TESTING').toUpperCase();
  phaseMinState(p);
  const missing=new Map();
  const blocked=[];
  for(const node of tree?.nodes||[]){
    if(node.kind==='ROOT'||node.status==='RETIRED') continue;
    const gate=evaluateBiggjSkillDependencyGate(tree,{skillId:node.skillId,phase:p});
    if(gate.ready) continue;
    blocked.push({
      skillId:node.skillId,
      capabilityId:node.capabilityId,
      status:node.status,
      blockers:gate.blockers.map(x=>x.dependencyCapabilityId||x.dependencySkillId)
    });
    for(const b of gate.blockers){
      const key=b.dependencyCapabilityId||b.dependencySkillId;
      const prev=missing.get(key)||{dependencyId:key,blockedCapabilities:new Set(),weight:0};
      prev.blockedCapabilities.add(node.capabilityId);
      const leverage=b.dependencyCapabilityId?canonicalSkillLeverage(b.dependencyCapabilityId).score:0;
      prev.weight+=1+leverage;
      missing.set(key,prev);
    }
  }
  const bottlenecks=[...missing.values()].map(x=>({
    dependencyId:x.dependencyId,
    blockedCapabilityCount:x.blockedCapabilities.size,
    blockedCapabilities:[...x.blockedCapabilities].sort(),
    bottleneckScore:x.weight
  })).sort((a,b)=>b.bottleneckScore-a.bottleneckScore||b.blockedCapabilityCount-a.blockedCapabilityCount||a.dependencyId.localeCompare(b.dependencyId));

  return finalized({
    version:BIGGJ_DEPENDENCY_GRAPH_VERSION,
    phase:p,
    blockedSkillCount:blocked.length,
    bottlenecks:bottlenecks.slice(0,Math.max(1,Number(limit)||25)),
    blocked,
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecuteLive:false
  });
}
