# BIGGJ Skill Dependency + Composition Architecture V1

Status: CANONICAL RESEARCH DEPENDENCY MODEL  
Parent: BIGGJ / TCX First-Principles Capability Architecture V2  
Execution: SHADOW_ONLY  
Live execution authority: NONE

## 1. Why this layer exists

The capability map answers:

> What must BIGGJ eventually be able to do?

The dependency graph answers:

> What must BIGGJ understand first before a capability may be trusted for testing, decision influence or promotion?

Without this layer, a flat skill tree has a dangerous failure mode:

- BIGGJ discovers an advanced capability,
- that capability accumulates some evidence,
- but its foundations are immature,
- the advanced skill appears stronger than the knowledge underneath it.

V1 therefore introduces explicit prerequisite structure, maturity gates, dependency leverage and skill compositions.

## 2. Core rule

A missing dependency must never prevent BIGGJ from researching a question.

It may prevent the result from being used too early.

The maturity phases are:

```
RESEARCH
→ TESTING
→ DECISION
→ TRUST
```

Default prerequisite thresholds:

```
RESEARCH  → DISCOVERING
TESTING   → LEARNING
DECISION  → TESTING
TRUST     → VALIDATED
```

Research is intentionally fail-open for discovery.

Testing, decision influence and trust fail closed.

## 3. Dependency relations

Important distinction:

This graph describes **research maturity and prerequisite readiness**. It is not a runtime import graph and it does not override the TCX truth-flow rules.

A downstream trading, learning or operator component cannot become an upstream truth source merely because a maturity edge exists. Any information that flows back into research must re-enter as a new PIT-safe, provenance-preserving evidence object under the normal TCX scientific controls.

### HARD

A structural prerequisite.

Example:

```
CALIBRATED_PROBABILITY
depends on
MULTI_HORIZON_FORECAST
```

A calibration system cannot be mature if no reproducible forecast was issued first.

### SUPPORT

Useful information that can improve a capability but should not make the entire capability impossible.

Example:

```
FORCED_FLOW
is supported by
DERIVATIVES_INTELLIGENCE
```

Forced flow can sometimes be reasoned about from other evidence, so derivatives are not a universal hard dependency.

### GUARD

A scientific or safety prerequisite.

A GUARD does not block early research/testing, but blocks decision influence or trust if immature.

Example:

```
CANONICAL_WORLD_STATE
guarded by
EVIDENCE_INDEPENDENCE
```

BIGGJ may research a world-state representation before full independence validation, but it cannot treat that state as decision-ready while false confirmation remains unresolved.

## 4. Root dependency topology

The high-level flow is now machine-readable:

```
MARKET_TRUTH
  ↓
EVIDENCE_INTELLIGENCE
  ↓
WORLD_STATE_MODEL
  ↓
MECHANISM_INTELLIGENCE + PARTICIPANT_GAME_THEORY
  ↓
FORECAST_INTELLIGENCE + FAILURE_UNCERTAINTY
  ↓
OPPORTUNITY_DECISION
  ↓
TRADING_STYLE_INTELLIGENCE + SETUP_STRATEGY_INTELLIGENCE
  ↓
EXECUTION_MICROSTRUCTURE + POSITION_LIFECYCLE
  ↓
PORTFOLIO_RISK + CAPITAL_CAPACITY_ECONOMICS
  ↓
LEARNING_REVERSE_ENGINEERING
  ↓
AUTONOMOUS_RESEARCH
  ↓
META_COGNITION
  ↓
PROMOTION_GOVERNANCE
```

RELIABILITY_SECURITY_OPERATIONS and HUMAN_OVERSIGHT_CONTROL act as cross-cutting guards.

EXPLAINABILITY_OPERATOR remains downstream of truth and uncertainty rather than becoming a source of truth.

## 5. Dependency leverage

Not all skills are equal.

A skill is high leverage when improving it unlocks many other skills.

The graph computes:

- direct downstream unlocks,
- transitive downstream unlocks,
- composition membership,
- normalized dependency leverage.

Initial static analysis identifies unusually central capabilities such as:

- PROVENANCE_CHAIN
- PIT_EVENT_CLOCK
- CANONICAL_WORLD_STATE
- EVIDENCE_INDEPENDENCE
- DETERMINISTIC_REPLAY
- MULTI_HORIZON_FORECAST
- UNCERTAINTY_DECOMPOSITION
- SOURCE_TRUST
- STATE_UNCERTAINTY
- CALIBRATED_PROBABILITY

This is not a claim that they are already mature.

It means research effort on them can unlock more of the graph.

## 6. Skill compositions

Individual skills are not enough.

Many useful BIGGJ abilities exist only when several skills work together.

V1 defines ten canonical compositions.

### PIT_TRUTH_STACK

Purpose:

Reconstruct exactly what was knowable and prove where every input came from.

Contains:

- PIT_EVENT_CLOCK
- DETERMINISTIC_REPLAY
- PROVENANCE_CHAIN
- SOURCE_TRUST
- EVIDENCE_INDEPENDENCE

### WORLD_STATE_STACK

Purpose:

Create one coherent, uncertainty-aware, multi-scale state representation.

Contains:

- CANONICAL_WORLD_STATE
- MULTISCALE_STATE_GRAPH
- STATE_UNCERTAINTY
- STATE_CHANGE_ATTRIBUTION
- REGIME_TRANSITION_MODEL

### MECHANISM_PARTICIPANT_STACK

Purpose:

Explain state transitions through mechanisms, incentives, constraints and participant reactions.

Contains:

- CONSTRAINT_MAP
- IDENTIFIABILITY
- FORCED_FLOW
- INCENTIVE_CONSTRAINT_INFERENCE
- REACTION_FUNCTIONS

### FORECAST_SCIENCE_STACK

Purpose:

Issue calibrated, revisable forecasts with explicit uncertainty and invalidation.

Contains:

- MULTI_HORIZON_FORECAST
- CALIBRATED_PROBABILITY
- FORECAST_REVISION
- FORECAST_INVALIDATION
- UNCERTAINTY_DECOMPOSITION
- ABSTAIN_POLICY

### SHADOW_DECISION_READINESS_STACK

Purpose:

Choose trade, wait, research or abstain without confusing forecast direction with decision quality.

Contains:

- OPPORTUNITY_DISCOVERY
- NO_TRADE_BASELINE
- OPPORTUNITY_COST
- VALUE_OF_ABSTENTION
- EXPECTED_UTILITY_DECISION
- DECISION_UNDER_DISAGREEMENT
- STYLE_SELECTION

### EXECUTION_LIFECYCLE_STACK

Purpose:

Translate a justified shadow opportunity into realistic entry, invalidation and adaptive hold behavior.

Contains:

- LIQUIDITY_MAP
- ROUTING_SLIPPAGE
- STRUCTURAL_INVALIDATION
- ADAPTIVE_HOLD_DURATION

### CAPITAL_SCALABILITY_STACK

Purpose:

Measure whether an edge survives realistic costs, concentration, larger hypothetical size and compounding constraints.

Contains:

- RISK_BASED_SIZING
- CORRELATION_CONCENTRATION
- TAIL_STRESS
- EDGE_CAPITAL_ALLOCATION
- COST_TURNOVER_ECONOMICS
- EDGE_CAPACITY_CURVE
- COMPOUNDING_SURVIVAL

### LEARNING_EVOLUTION_STACK

Purpose:

Turn outcomes into governed knowledge and higher-value questions.

Contains:

- DECISION_QUALITY_VS_OUTCOME
- POST_TRADE_REVERSE_ENGINEERING
- COUNTERFACTUAL_TRADE_REPLAY
- SELF_QUESTIONING
- INFORMATION_VALUE_PRIORITIZATION
- SELF_CALIBRATION_MONITOR
- RULE_DOMINANCE_AUDIT

### PROMOTION_TRUST_STACK

Purpose:

Require prospective evidence, scientific guards, stress, reproducibility and governed approval before trust.

Contains:

- VERSIONED_CANDIDATES
- FORWARD_SHADOW_PROMOTION
- STRESS_PROMOTION
- SCIENTIFIC_GUARD_ORCHESTRATION
- REPRODUCIBLE_PROMOTION_AUDIT
- DETERMINISTIC_REPRODUCIBILITY
- HUMAN_APPROVAL_GATE

### SYSTEM_SURVIVAL_STACK

Purpose:

Keep BIGGJ fail-closed, reproducible and recoverable under operational failure.

Contains:

- SERVICE_HEALTH_OBSERVABILITY
- DETERMINISTIC_REPRODUCIBILITY
- CRASH_RECOVERY_STATE_INTEGRITY
- FAIL_CLOSED_DEGRADATION
- DATA_POISONING_DETECTION
- SECRET_SUPPLY_CHAIN_SECURITY
- RESOURCE_BUDGETING

## 7. Dependency-aware research planning

The BIGGJ research queue now exposes:

- dependency leverage,
- direct unlock count,
- transitive unlock count,
- whether testing dependencies are ready,
- concrete testing blockers.

This changes the research question from:

> Which skill looks interesting?

to:

> Which research item gives the largest reduction in critical uncertainty and unlocks the most important downstream capabilities?

A downstream skill may still remain in the research queue while blocked.

Its blocker is explicit instead of silently ignored.

## 8. Bottleneck detection

BIGGJ can now ask:

- Which immature prerequisite blocks the most skills?
- Which missing foundation sits on the largest number of critical paths?
- Are we repeatedly researching consumers instead of their shared prerequisite?
- Which dependency has become a single point of epistemic failure?

The bottleneck report groups blocked capabilities by prerequisite and weights them by dependency leverage.

This creates a practical form of architectural self-awareness.

## 9. Example: expected utility

EXPECTED_UTILITY_DECISION depends on:

- CALIBRATED_PROBABILITY
- UNCERTAINTY_DECOMPOSITION
- OPPORTUNITY_COST
- NO_TRADE_BASELINE

ROUTING_SLIPPAGE is a SUPPORT dependency.

Meaning:

BIGGJ may research decision theory early.

It should not treat expected utility as decision-ready until probability, uncertainty and alternatives are themselves sufficiently mature.

This prevents the common failure mode:

```
forecast confidence
→ disguised as
decision confidence
```

## 10. Example: canonical world state

CANONICAL_WORLD_STATE has hard dependencies on:

- PIT_EVENT_CLOCK
- PROVENANCE_CHAIN

and a GUARD dependency on:

- EVIDENCE_INDEPENDENCE

Therefore:

- early research can proceed,
- testing can proceed once temporal truth and provenance are sufficiently learned,
- decision influence remains blocked until evidence independence is mature enough.

This separates experimentation from trust.

## 11. Decay propagation

A dependency marked DECAYING is not considered ready for TESTING, DECISION or TRUST.

This matters because a trusted downstream skill must not continue operating as if its foundations were still healthy.

Future extension:

When a central prerequisite enters DECAYING, BIGGJ should generate a dependency-impact event describing:

- directly affected skills,
- transitive affected skills,
- affected compositions,
- affected promotion candidates,
- whether any research decision must fall back to ABSTAIN.

## 12. Discovered skills

Autonomously discovered skills already declare dependencies.

Those dependencies now use the same maturity gates as canonical skills.

A discovered child skill can therefore:

- exist,
- be researched,
- gather early evidence,

while still being prevented from premature testing or trust if its declared prerequisites are immature.

## 13. Scientific boundary

The dependency graph must never become a way to manufacture certainty.

It may:

- expose prerequisites,
- expose bottlenecks,
- prioritize research,
- block premature maturity,
- describe composition readiness.

It may not:

- automatically promote a skill,
- convert dependency maturity into causal proof,
- hide disagreement,
- bypass PIT,
- weaken scientific guards,
- enable live execution.

All outputs remain:

```
execution: SHADOW_ONLY
action: ABSTAIN
canExecuteLive: false
```

## 14. Why this matters before importing the old ~150 ideas

The historical ideas should now be mapped not only to a root capability.

Each idea can also be classified as:

- prerequisite,
- dependent capability,
- support signal,
- scientific guard,
- composition member,
- challenger,
- operator surface,
- redundant implementation,
- obsolete idea.

This prevents the 150 ideas from becoming another flat feature backlog.

Instead, each idea enters a dependency-aware research graph.

## 15. Next architecture step

After this dependency/composition layer is stable, the next useful step is:

### Historical Idea Migration Engine

For each old idea:

1. recover the original concept,
2. identify the problem it attempted to solve,
3. map it to a V2 root,
4. map it to a canonical seed capability or proposed child skill,
5. identify prerequisites,
6. identify duplicate/overlapping ideas,
7. classify evidence/data/UI/guard/challenger role,
8. assign strategic leverage,
9. assign uncertainty,
10. preserve source/history,
11. produce a deduplicated migration queue.

Only after that should implementation priority be decided.
