# BIGGJ / TCX First-Principles Capability Architecture V2

Status: CANONICAL CAPABILITY TOPOLOGY EXTENSION  
Parent: TCX Research Operating System  
Base: BIGGJ Capability Map + Self-Evolving Skill Tree V1  
Execution: SHADOW_ONLY  
Live execution authority: NONE

## 1. Why V2 exists

V1 correctly established the governed skill tree, scientific promotion path and 15 initial root capability domains.

A first-principles review found a structural issue: the root list mixed different kinds of things:

- epistemic capabilities,
- market cognition,
- trading decision capabilities,
- data-domain adapters,
- operator surfaces,
- governance.

That makes future autonomous skill discovery harder because BIGGJ can confuse "what world do I observe?" with "how do I reason?", "how do I decide?", "how do I learn?" and "how do I keep the system safe and reliable?".

V2 does not discard V1.

It adds a stable macro-topology above the roots and adds only the fundamental capabilities that were missing.

## 2. The six system planes

### Plane A — Reality & Evidence

Question:

> What was actually knowable, from which sources, at what time, and what coherent world state can be reconstructed from it?

Roots:

- MARKET_TRUTH
- EVIDENCE_INTELLIGENCE
- MULTI_MARKET_INTELLIGENCE
- WORLD_STATE_MODEL

This plane is responsible for temporal truth, source contracts, provenance, independence, disagreement, coverage, multi-market sensing and the canonical state representation.

### Plane B — Understanding & Prediction

Question:

> What mechanisms and participants could explain the current state, what can happen next, and how wrong might we be?

Roots:

- MECHANISM_INTELLIGENCE
- PARTICIPANT_GAME_THEORY
- FORECAST_INTELLIGENCE
- FAILURE_UNCERTAINTY

This plane separates observed state from explanatory mechanisms, strategic participant models and probabilistic forecasts.

### Plane C — Decision & Capital

Question:

> Is there an opportunity worth acting on, how should it be expressed, and does it remain economically useful at larger size?

Roots:

- OPPORTUNITY_DECISION
- TRADING_STYLE_INTELLIGENCE
- SETUP_STRATEGY_INTELLIGENCE
- EXECUTION_MICROSTRUCTURE
- POSITION_LIFECYCLE
- PORTFOLIO_RISK
- CAPITAL_CAPACITY_ECONOMICS

The decision object is not "UP or DOWN".

It is:

```
opportunity
× market state
× style
× strategy
× entry method
× lifecycle
× portfolio interaction
× capacity
× uncertainty
```

No-trade remains a first-class benchmark.

### Plane D — Learning & Evolution

Question:

> What did BIGGJ learn, what is still unknown, and what is BIGGJ doing repeatedly that may itself be wrong?

Roots:

- LEARNING_REVERSE_ENGINEERING
- AUTONOMOUS_RESEARCH
- META_COGNITION

This plane contains outcome decomposition, counterfactual learning, research planning, skill discovery and self-observation.

### Plane E — Scientific Governance & Human Control

Question:

> What is allowed to change, what evidence is sufficient, and where must a human remain the authority?

Roots:

- PROMOTION_GOVERNANCE
- HUMAN_OVERSIGHT_CONTROL

No candidate may silently mutate PRIMARY.

Human authority may freeze, reject or tighten safety. It does not convert failed science into valid evidence.

### Plane F — Platform & Operator

Question:

> Can the system be trusted to run, recover, reproduce itself and explain what it is doing?

Roots:

- RELIABILITY_SECURITY_OPERATIONS
- EXPLAINABILITY_OPERATOR

A research system that cannot reproduce its own state or detect corrupted dependencies is not scientifically trustworthy even if its model logic is good.

## 3. Fundamental gaps found in the old 8-block framing

### Gap 1 — World representation

Reality/replay is not enough.

BIGGJ needs a canonical world model that says:

- what state exists,
- at which horizon,
- which variables are observed vs inferred,
- how uncertain each state component is,
- what changed,
- what regime transition may be underway.

Without this, every subsystem can build a slightly different "market state".

Highest-leverage skills:

- CANONICAL_WORLD_STATE
- MULTISCALE_STATE_GRAPH
- STATE_UNCERTAINTY
- REGIME_TRANSITION_MODEL
- CROSS_ASSET_CONTEXT
- STATE_CHANGE_ATTRIBUTION

## 4. Gap 2 — Participants and game theory

Mechanism reasoning without participants is incomplete.

Markets are produced by agents with:

- incentives,
- mandates,
- leverage,
- inventory,
- liquidation constraints,
- funding pressure,
- hedging needs,
- execution constraints,
- strategic reactions to other participants.

BIGGJ must infer these carefully and keep them INFERRED/MODELLED unless directly observed.

Highest-leverage skills:

- PARTICIPANT_CLASSIFICATION
- INCENTIVE_CONSTRAINT_INFERENCE
- POSITION_PRESSURE_INFERENCE
- REACTION_FUNCTIONS
- CROWDING_GAME_DYNAMICS
- ADVERSARIAL_PARTICIPANT_MODEL

## 5. Gap 3 — Opportunity search and decision theory

Forecasting and strategy selection do not answer the same question as decision-making.

A 62% bullish forecast may still be a bad opportunity if:

- payoff is asymmetric against us,
- execution cost is too high,
- a better opportunity exists elsewhere,
- portfolio correlation is already high,
- uncertainty is concentrated in one untested assumption,
- waiting has higher expected value.

Highest-leverage skills:

- OPPORTUNITY_DISCOVERY
- EXPECTED_UTILITY_DECISION
- VALUE_OF_ABSTENTION
- OPPORTUNITY_COST
- EXPLORATION_EXPLOITATION
- DECISION_UNDER_DISAGREEMENT
- NO_TRADE_BASELINE

## 6. Gap 4 — Capital capacity economics

Risk management asks:

> How much can I lose?

Capacity economics additionally asks:

> Does the edge still exist when size, turnover, fees, impact and liquidity increase?

This is essential for the external capital mission.

A high-percentage edge that only works at tiny size can be strategically less important than a lower-frequency edge with stable capacity.

Highest-leverage skills:

- EDGE_CAPACITY_CURVE
- LIQUIDITY_ADJUSTED_SCALABILITY
- MARKET_IMPACT_MODEL
- COST_TURNOVER_ECONOMICS
- CAPITAL_UTILIZATION
- COMPOUNDING_SURVIVAL
- FUNDING_MARGIN_CONSTRAINTS

The external €100k target must never cause direct risk-chasing.

Its legitimate use is to expose capacity bottlenecks and research priorities.

## 7. Gap 5 — Meta-cognition

Autonomous research asks:

> What should I learn?

Meta-cognition asks:

> What is wrong with the way I am currently thinking?

This must be a root capability.

Examples:

- 60% of exits come from one rule code.
- A feature is present everywhere but never changes decisions.
- Three "independent" signals collapse onto one upstream source.
- One assumption has not been falsified for months.
- The system repeatedly predicts direction correctly but enters too early.
- Research proposals increasingly come from one model family.
- Confidence rises while calibration worsens.

Highest-leverage skills:

- SELF_MODEL
- RULE_DOMINANCE_AUDIT
- FEATURE_USAGE_AUDIT
- ASSUMPTION_FRESHNESS
- ERROR_RECURRENCE_DETECTION
- BLIND_SPOT_DISCOVERY
- REASONING_DIVERSITY_AUDIT
- SELF_CALIBRATION_MONITOR

## 8. Gap 6 — Reliability, security and operations

Scientific reasoning depends on infrastructure integrity.

A perfect forecast model is worthless if:

- data is stale,
- state duplicates after restart,
- a queue silently drops events,
- a provider changes schema,
- storage corrupts provenance,
- a dependency is compromised,
- resource use expands without bound,
- replay cannot reproduce the result.

Highest-leverage skills:

- SERVICE_HEALTH_OBSERVABILITY
- DETERMINISTIC_REPRODUCIBILITY
- CRASH_RECOVERY_STATE_INTEGRITY
- FAIL_CLOSED_DEGRADATION
- DATA_POISONING_DETECTION
- SECRET_SUPPLY_CHAIN_SECURITY
- RESOURCE_BUDGETING
- CHAOS_RECOVERY_TESTING

## 9. Gap 7 — Human oversight and constitutional control

Explainability is not governance.

The operator needs explicit control over:

- mission boundaries,
- permissions,
- promotion approval,
- freezing experiments,
- reviewing major changes,
- auditing overrides,
- preventing safety drift.

Highest-leverage skills:

- CONSTITUTION_ENFORCEMENT
- HUMAN_APPROVAL_GATE
- EMERGENCY_FREEZE
- PERMISSION_BOUNDARIES
- CHANGE_REVIEW
- OPERATOR_OVERRIDE_AUDIT
- MISSION_CONSTRAINT_MONITOR

Human intervention may make the system more conservative.

It may not relabel weak evidence as strong evidence or bypass PIT/scientific validity silently.

## 10. Existing roots that remain correct

The following V1 separations remain important and should not be collapsed:

### Trading Style vs Strategy

SCALP, INTRADAY and SWING are expression horizons.

Trend Continuation, Breakout Retest, Range Mean Reversion, Liquidity Sweep Reversal, Momentum Expansion and Meme Momentum are strategy/setup families.

Therefore:

```
SWING × TREND_CONTINUATION
```

is a different learned capability from:

```
SCALP × LIQUIDITY_SWEEP_REVERSAL
```

### Execution vs Position Lifecycle

Entry quality and exit/hold quality are different failure channels.

A correct thesis can still lose from:

- poor fill,
- bad confirmation timing,
- excessive slippage,
- premature exit,
- stale hold,
- wrong structural invalidation.

They remain separate roots.

### Portfolio Risk vs Capacity Economics

Portfolio risk controls concentration and downside.

Capacity economics controls whether a proven edge can absorb more hypothetical capital without disappearing.

They are related but not the same problem.

## 11. Cross-cutting invariants

Every plane must preserve:

- PIT truth,
- OBSERVED / INFERRED / MODELLED / ASSUMED,
- immutable original decision trace,
- disagreement preservation,
- explicit uncertainty,
- explicit invalidation,
- ABSTAIN as a valid outcome,
- challenger isolation,
- no silent PRIMARY mutation,
- forward shadow validation,
- reproducible promotion audit,
- SHADOW_ONLY,
- canExecute:false,
- canExecuteLive:false.

## 12. Highest-leverage architecture skills

Across all roots, the most central skills are:

1. CANONICAL_WORLD_STATE
2. DETERMINISTIC_REPLAY
3. EVIDENCE_INDEPENDENCE
4. STATE_CHANGE_ATTRIBUTION
5. INCENTIVE_CONSTRAINT_INFERENCE
6. IDENTIFIABILITY
7. CALIBRATED_PROBABILITY
8. UNCERTAINTY_DECOMPOSITION
9. EXPECTED_UTILITY_DECISION
10. VALUE_OF_ABSTENTION
11. EDGE_CAPACITY_CURVE
12. COUNTERFACTUAL_TRADE_REPLAY
13. INFORMATION_VALUE_PRIORITIZATION
14. RULE_DOMINANCE_AUDIT
15. SELF_CALIBRATION_MONITOR
16. SCIENTIFIC_GUARD_ORCHESTRATION
17. DETERMINISTIC_REPRODUCIBILITY
18. FAIL_CLOSED_DEGRADATION
19. HUMAN_APPROVAL_GATE
20. RESEARCH_TRACE_VIEW

These are leverage skills because they improve many downstream strategies instead of optimizing one setup.

## 13. Dependency logic

The intended dependency direction is:

```
Reality
  ↓
Evidence
  ↓
World State
  ↓
Mechanisms + Participants
  ↓
Forecast + Failure/Uncertainty
  ↓
Opportunity Decision
  ↓
Style + Strategy
  ↓
Execution + Lifecycle
  ↓
Portfolio + Capacity
  ↓
Outcomes
  ↓
Learning
  ↓
Autonomous Research
  ↓
Meta-Cognition
  ↓
Challengers
  ↓
Scientific Governance
```

Reliability/security and human oversight wrap the entire graph.

No downstream trade result may become upstream truth without an explicit new evidence object and PIT-safe provenance.

## 14. What BIGGJ should eventually ask itself

Examples of mature self-directed questions:

- Which state variable currently contributes most to decision uncertainty?
- What participant constraint would explain this move better than my current mechanism?
- Which observation would most strongly distinguish two competing mechanisms?
- Is my forecast accurate but economically unusable after costs and capacity?
- Which opportunities am I never scanning because my current universe is path-dependent?
- Which strategy appears good only because one regime dominates the sample?
- Which rule controls too much behavior?
- Which assumption has become doctrine because nobody tests it anymore?
- Which evidence source can fail and silently invalidate multiple downstream skills?
- Is my research queue optimizing knowledge gain or merely generating more experiments?
- Is the best action a trade, an abstention, or a new measurement?
- What capability is missing that prevents me from answering this question?

## 15. Definition of architectural success

V2 is successful if BIGGJ increasingly becomes able to:

- reconstruct what was knowable,
- represent what state the world was in,
- distinguish observation from inference,
- reason about mechanisms and strategic participants,
- forecast distributions rather than one path,
- know when it is uncertain,
- compare opportunities rather than force trades,
- measure whether edge scales,
- separate decision quality from outcome,
- detect flaws in its own reasoning process,
- propose falsifiable new skills,
- survive operational failures without corrupting science,
- remain under explicit human and scientific governance.

Only after this topology is stable should the historical ~150 ideas be reconstructed and mapped into it.
