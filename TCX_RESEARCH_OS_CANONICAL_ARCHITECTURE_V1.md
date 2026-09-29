# TCX Research Operating System — Canonical Architecture V1

Status: CANONICAL SOURCE OF TRUTH  
Execution: SHADOW_ONLY  
Real-money execution: BLOCKED

## Mission

BIGGJ is not a single trading bot and not a collection of loosely coupled bots.

BIGGJ is the operator-facing identity of one canonical **TCX Research Operating System**.

The system exists to answer, reproducibly:

- What was knowable at the decision time?
- Which evidence supports a claim?
- Which sources are actually independent?
- Which observations disagree?
- Which mechanism could explain the move?
- How uncertain is the forecast?
- What would invalidate it?
- When should the system abstain?
- What did the outcome teach us?
- Is a proposed improvement scientifically promotable?

The governing DNA is:

**Point-in-Time Truth → Evidence → Disagreement → Calibrated Uncertainty → Invalidation → ABSTAIN → Audit → Learning**

## Non-negotiable invariants

1. One canonical system state. No hidden parallel bot truth.
2. Point-in-time inputs only. No future leakage.
3. Every material claim is classified exactly as:
   - OBSERVED
   - INFERRED
   - MODELLED
   - ASSUMED
4. OBSERVED is never upgraded to causal proof by interpretation.
5. Mechanisms may be hypothesized; causal identification remains explicit.
6. Contradictions are stored, not averaged away.
7. Missing required evidence fails closed.
8. ABSTAIN is a valid first-class result.
9. Forecasts require uncertainty and invalidation.
10. Every research run is traceable to input fingerprints and release/config hashes.
11. Learning never mutates production silently.
12. Every candidate change is versioned, shadow-tested and promoted through explicit gates.
13. PRIMARY, CHALLENGER, RESEARCH_PROBE and COVERAGE_PROBE results remain separable.
14. Real-money execution is not enabled by the research OS.

## Canonical layers

### 1. Temporal / Market Fabric

Responsibilities:
- append-only point-in-time events
- availableAt / validUntil semantics
- replay and historical state reconstruction
- regime snapshots
- cold archive / deterministic replay
- no future leakage

Canonical modules include:
- market-data-fabric.mjs
- deterministic-replay.mjs
- state-validity.mjs
- episode-memory.mjs
- shadow-regime-brain.mjs

### 2. Evidence Mesh

Responsibilities:
- multi-source observations
- provenance
- source governance
- dependency graph
- independence checks
- common-cause detection
- disagreement preservation
- trust chains

Canonical modules include:
- research-data-plane.mjs
- research-data-governance.mjs
- research-dependency-graph.mjs
- independent-witness-network.mjs
- science-runtime/evidence-lineage-independence.mjs
- evidence-history.mjs

### 3. Mechanism Layer / RIFT

RIFT domains:
- Constraints
- Forced Flow
- Liquidity Elasticity
- Reflexivity
- Cascades
- Absorption
- Identifiability

Responsibilities:
- convert observations into mechanism hypotheses
- preserve competing explanations
- distinguish correlation from identification
- reject causal overclaiming

Canonical modules include:
- mechanism-transition-engine.mjs
- science-runtime/epistemic-integrity.mjs
- scientific-validity.mjs

### 4. Forecast Intelligence

Responsibilities:
- calibrated multi-horizon forecasts
- historical analogues
- effective sample size
- plausible paths
- adaptive intervals
- drift
- live revision
- invalidation
- counterfactual explanations

Canonical modules include:
- institutional-forecast-runtime.mjs
- forecast-runtime/*
- forecast-science-adapter.mjs
- forecast-hypothesis-generator.mjs
- forecast-chart-overlay.mjs
- forecast-learning-center.mjs

### 5. Research Trace

Every material output must be reconstructible:

**Data → Observation → Feature → Factor → Assumption → Mechanism → Forecast → Decision**

Canonical modules:
- research-trace.mjs
- research-dependency-graph.mjs
- institutional-audit-binding.mjs
- institutional-kernel.mjs

### 6. Failure-First Kernel

Order of operations:

1. Look for invalid or future data.
2. Look for missing provenance.
3. Look for dependent evidence presented as independent.
4. Look for contradictions and common causes.
5. Look for leakage / confounding / selection bias.
6. Check identifiability.
7. Check calibration / coverage.
8. Check explicit invalidation.
9. Only then permit a research conclusion.
10. If any required gate fails: ABSTAIN.

### 7. Learning / Memory

Responsibilities:
- store forecast outcomes
- preserve regime and mechanism context
- learn failure cohorts
- learn timing / hold-duration associations
- record counterfactuals
- separate decision quality from realized PnL
- never overwrite history silently

Canonical modules include:
- episode-memory.mjs
- setup-performance-memory.mjs
- shadow-trade-quality-learner.mjs
- biggj-adaptive-learning-core.mjs

### 8. Strategy League / Challenger System

Responsibilities:
- test alternative models, strategies and trading styles
- keep challengers isolated from PRIMARY
- evaluate forward, point-in-time performance
- promote only after scientific and software gates

Canonical modules include:
- shadow-strategy-league.mjs
- learned-challenger-engine.mjs
- biggj-style-experiment-engine.mjs
- forecast-shadow-competition.mjs
- forecast-experiment-governor.mjs
- model-candidate-registry.mjs
- model-promotion-ladder.mjs

### 9. Shadow OMS / Portfolio

Responsibilities:
- virtual positions only
- multiple simultaneous markets
- lifecycle and exposure
- structure-aware stops and targets
- adaptive hold review
- portfolio concentration
- stress
- daily / weekly statistics

Canonical modules include:
- shadow-oms.mjs
- shadow-portfolio-ledger.mjs
- portfolio-risk-brain.mjs
- shadow-leverage-risk.mjs
- multi-venue-shadow-sor.mjs
- trade-lifecycle-v2.mjs

### 10. Multi-Market Intelligence

Domains:
- spot
- derivatives
- liquidation flow
- order book / execution liquidity
- on-chain
- memecoins
- entity flow
- macro / global events
- future alternative data

All domains enter through governed evidence contracts, never direct ad-hoc feature injection.

### 11. BIGGJ Operator Surface

Telegram / Discord / Command Center are views over canonical TCX state.

They do not own:
- forecast logic
- strategy logic
- learning logic
- portfolio truth
- promotion truth

They only expose:
Market State → Forecast → Evidence → Mechanism → Uncertainty → Invalidation → Risk → Decision → Trace.

### 12. Promotion Ladder

A proposed improvement moves:

IDEA
→ RESEARCH
→ CHALLENGER
→ SHADOW_VALIDATED
→ PROMOTION_REVIEW
→ APPROVED

Required evidence includes:
- versioned candidate
- PIT safety
- no leakage
- sufficient independent episodes
- calibration
- robustness
- cost stress
- concentration checks
- regression checks
- reproducible software tests
- explicit promotion record

No hidden self-modification is permitted.

## Trading as one subsystem

Trading is a consumer of TCX research state, not the system itself.

The trading sequence is:

TCX canonical market state
→ choose trading style
→ choose strategy family
→ derive entry thesis
→ define invalidation / target / risk
→ create frozen decision trace
→ SHADOW OMS
→ lifecycle review
→ post-trade reverse engineering
→ learning memory
→ challenger experiments
→ promotion gates

Supported style families may include:
- SCALP
- INTRADAY
- SWING

Supported strategy families may include:
- TREND_CONTINUATION
- BREAKOUT_RETEST
- RANGE_MEAN_REVERSION
- LIQUIDITY_SWEEP_REVERSAL
- MOMENTUM_EXPANSION
- MEME_MOMENTUM

A style and a strategy are different dimensions.

Example:
SWING + TREND_CONTINUATION
is distinct from
SCALP + LIQUIDITY_SWEEP_REVERSAL.

## Canonical rule for learning

Post-hoc analysis may discover associations but may not promote them as causal laws.

Every discovered rule must state:
- what was observed,
- what was inferred,
- what was modelled,
- what was assumed,
- sample size,
- regime,
- uncertainty,
- known confounders,
- whether it is only retrospective,
- what forward test would falsify it.

Only forward shadow evidence can move a discovered rule toward promotion.

## Definition of success

TCX is successful when it increasingly knows:

- what it knows,
- why it knows it,
- how strongly it knows it,
- what contradicts it,
- what would falsify it,
- when it should abstain,
- what changed after an outcome,
- whether a new idea truly improves the system.

The target is not maximum trade count.

The target is **high-integrity, calibrated, reproducible decision intelligence**.
