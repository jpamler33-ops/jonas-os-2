# TCX Institutional Standard

Status: CANONICAL DESIGN STANDARD
Purpose: define the quality bar and proprietary architectural character of TCX.

TCX is to be engineered as if it were a core research platform inside a large institutional technology company, while remaining small enough to understand, test and operate.

This is a target standard. It does not imply that every capability below is already implemented.

## 1. TCX identity

TCX is not a pile of indicators and not a generic trading bot.

Its distinctive design is:

1. point-in-time truth before hindsight
2. evidence before conviction
3. disagreement before averaging
4. calibrated uncertainty before confidence
5. invalidation before stale reuse
6. abstention before forced output
7. reproducibility before cleverness
8. simulation before live action
9. explicit provenance before opaque scores
10. one canonical source of truth per capability

The system must be able to answer not only "what does TCX think?" but also:

- what did TCX know at that exact time?
- which data and code produced the view?
- which evidence supported it?
- which evidence contradicted it?
- how calibrated was the system historically?
- what would invalidate the view?
- how did the view change after new evidence arrived?
- can the result be replayed and audited?

## 2. Four-plane architecture

### DATA PLANE

Owns observed information and point-in-time availability.

Canonical responsibilities:
- market provider adapters
- immutable Market Data Fabric
- timestamps and availableAt
- source provenance
- freshness
- schema validation
- deduplication/corrections
- data quality

No forecast logic belongs here.

### INTELLIGENCE PLANE

Transforms observations into research state.

Canonical families:
- market structure
- Episode Memory
- Mechanism Transition Lattice
- Independent Witness Network
- Market Grammar / World Model
- Forecast Intelligence
- calibration
- uncertainty
- novelty / OOD
- contradiction / disagreement
- revision and invalidation

No live exchange-order submission belongs here.

### CONTROL PLANE

Decides whether research output is admissible.

Canonical responsibilities:
- Data Quality Firewall
- epistemic type checking
- safety state machine
- invariant enforcement
- lifecycle / expiry
- runtime release identity
- audit ledger
- replay integrity
- observability
- chaos / failure testing

The control plane may veto intelligence-plane output.

### PRODUCT PLANE

Presents normalized research state.

Canonical responsibilities:
- Telegram Command Center
- MarketViewModel
- Why / disagreement / invalidation views
- Watchlist / Radar / Alerts
- Replay / Performance / System
- simple / advanced / research modes

The product plane must never manufacture research truth.

## 3. Proprietary TCX systems

The following names describe TCX-owned architectural concepts. Existing canonical modules should be reused rather than duplicated.

### TCX Temporal Fabric

Meaning:
the complete point-in-time data and replay discipline.

Built from:
- Market Data Fabric
- availableAt semantics
- deterministic replay
- immutable correction history
- release binding

Goal:
prevent future leakage and make historical state reconstructable.

### TCX Evidence Mesh

Meaning:
a research graph where independent modalities and venues retain their own evidence identity.

Built from:
- Independent Witness Network
- disagreement map
- evidence history
- modality coverage
- contradiction
- novelty

Goal:
surface agreement and disagreement without converting unlike evidence into a fake probability.

### TCX Forecast Intelligence Layer

Meaning:
one canonical forecasting layer after specialist integration.

Required properties:
- multi-horizon probabilistic forecasts
- calibrated uncertainty
- path distributions, not one deterministic line
- historical analogues
- forecast lifetime
- live revision
- invalidation
- counterfactual explanation
- calibration diagnostics
- drift detection
- OOD / insufficient-support abstention

There must be only one canonical forecast contract after integration.

### TCX Research Trace

Every important research result should ultimately be traceable as one immutable logical unit containing or referencing:

- traceId
- symbol / market
- generatedAt
- asOf / availableAt
- input data references
- evidence set
- contradiction set
- model/module versions
- config/release identity
- forecast or research state
- uncertainty
- calibration state
- validity / expiry
- safety status
- hash / audit reference

Goal:
make every serious TCX conclusion reproducible and inspectable.

### TCX Promotion Ladder

New capabilities must move through explicit maturity states:

```text
EXPERIMENTAL
→ RESEARCH
→ SHADOW
→ VALIDATED
→ CANONICAL
```

Promotion requires evidence appropriate to the component.

No feature becomes canonical because it looks sophisticated.

### TCX Failure-First Kernel

Every component defines:
- invalid inputs
- stale inputs
- missing dependencies
- contradictory evidence
- OOD behavior
- timeout behavior
- persistence failure behavior
- safe fallback
- observability signal

Unknown state must not silently become neutral or healthy state.

### TCX Self-Correction Loop

Self-correction means audited learning from forecast errors, not unrestricted self-modifying code.

Allowed loop:

```text
forecast
→ immutable prediction record
→ future outcome matures
→ scoring / calibration
→ error decomposition
→ drift / segment diagnostics
→ candidate parameter/model update
→ backtest + PIT/OOS validation
→ promotion gate
→ new version
```

No same-sample self-feedback.
No hidden parameter mutation.
No promotion without a versioned audit trail.

## 4. Institutional engineering standard

Material modules should have, where applicable:

- explicit input/output contracts
- schema/version identifiers
- deterministic behavior where expected
- bounded memory/state growth
- timeout and cancellation boundaries
- dependency injection for external I/O
- unit tests
- regression tests
- invariant tests
- failure-path tests
- point-in-time/no-lookahead tests
- structured logs/telemetry
- health metrics
- release hashing
- migration strategy for persisted state

Critical paths additionally need:
- idempotency
- deduplication
- corruption detection
- recovery behavior
- rate limits
- circuit breakers
- backpressure strategy
- reproducible fixtures

## 5. Scientific standard

A research capability must separate:

```text
OBSERVED
DERIVED_HEURISTIC
EMPIRICAL_POST_OUTCOME
MODEL_ESTIMATE
CALIBRATED_PROBABILITY
COUNTERFACTUAL_SIMULATION
NOT_IDENTIFIED
```

A number is not a probability merely because it is between 0 and 1.

Forecast evaluation should prefer:
- Brier score
- log loss where valid
- reliability / calibration curves
- interval coverage
- sharpness conditional on calibration
- abstention rate
- OOD performance
- horizon-specific metrics
- segment stability
- walk-forward / temporal OOS performance

Directional hit rate alone is insufficient.

## 6. Operational standard

Target production disciplines:

- CI on every material change
- deterministic test fixtures
- release manifests
- config fingerprints
- rollback-safe deployments
- health/SLO monitoring
- incident-ready diagnostics
- bounded retries
- secret isolation
- access control for Telegram
- no secret logging
- one-replica constraint documented while local mutable persistence remains
- migration to transactional shared persistence before horizontal scaling

## 7. Product standard

TCX should feel like one coherent operating system, not separate research demos.

Every major screen should answer:

1. state now
2. evidence
3. contradiction
4. uncertainty
5. validity
6. what changed
7. what would invalidate the view
8. provenance
9. safety status

User-visible confidence must never exceed measured evidence quality.

## 8. Anti-patterns

Reject:
- duplicate engines with overlapping truth
- giant monoliths
- hidden mutable globals
- arbitrary magic scores
- fake precision
- hindsight contamination
- silent data repair
- unsupported causal language
- silent model changes
- unbounded JSON growth
- "AI" features without measurable value
- UI features that bypass domain contracts
- shipping novelty before integration debt is resolved

## 9. Current priority

The immediate architectural priority is not to invent another subsystem.

It is to merge the current Master, Forecast Specialist and Alpha.30 scientific-core work into one canonical architecture under this standard.

For every overlapping component, decide:

```text
KEEP MASTER
KEEP SPECIALIST
MERGE
REWRITE
DEPRECATE
```

The resulting TCX must have:
- one data truth
- one research contract per capability
- one canonical forecast layer
- one validity/lifecycle model
- one audit/replay chain
- one user-facing product contract

## 10. North-star definition

TCX reaches the intended standard when a technically competent outsider can inspect any important output and reconstruct:

```text
data
→ provenance
→ transformations
→ evidence
→ model/version
→ uncertainty
→ calibration
→ safety gates
→ output
→ later outcome
→ measured error
→ revision history
```

without relying on a chat transcript or undocumented intuition.
