# TCX Research Operating System — Canon V1

Status: CANONICAL ARCHITECTURE  
Product identity: BIGGJ / TCX Research OS  
Execution: SHADOW_ONLY  
Live execution: BLOCKED

## 1. Purpose

BIGGJ is not a collection of trading bots.

BIGGJ is the operator-facing identity of one canonical **TCX Research Operating System** that collects point-in-time evidence, reasons about market mechanisms, produces calibrated forecasts, measures uncertainty, explains decisions, learns under scientific controls, and preserves a reproducible audit trail.

Trading is one downstream consumer of research. It is not the system's center.

The canonical DNA is:

> **Point-in-Time Truth → Evidence → Disagreement → calibrated Uncertainty → Invalidation → ABSTAIN → Audit → Learning**

Every subsystem must preserve this order.

## 2. Canonical knowledge flow

```
PUBLIC / OBSERVED DATA
        ↓
TEMPORAL + MARKET FABRIC
        ↓
EVIDENCE MESH + PROVENANCE
        ↓
DISAGREEMENT / COMMON-CAUSE / TRUST
        ↓
MECHANISM LAYER / RIFT
        ↓
FORECAST INTELLIGENCE
        ↓
UNCERTAINTY + INVALIDATION
        ↓
FAILURE-FIRST KERNEL
        ↓
ABSTAIN / RESEARCH DECISION
        ↓
SHADOW STRATEGY / PORTFOLIO CONSUMERS
        ↓
OUTCOMES + COUNTERFACTUALS
        ↓
AUDIT + LEARNING MEMORY
        ↓
CHALLENGERS
        ↓
PROMOTION LADDER
        └──────────────→ only then can PRIMARY policy change
```

No trading subsystem may bypass the research chain and convert raw market telemetry directly into a PRIMARY action.

## 3. Epistemic classes

Every material state, feature, explanation, forecast and decision must remain explicitly classed as one of:

- **OBSERVED** — directly captured from a source at a known availability time.
- **INFERRED** — derived from observed information using explicit deterministic logic.
- **MODELLED** — model output with version, calibration and uncertainty.
- **ASSUMED** — explicit assumption that is not observed.

These classes may not be silently collapsed into a generic confidence score.

## 4. Canonical layers

### A. Temporal / Market Fabric

Responsibilities:

- immutable event ingestion,
- `eventTime`, `availableAt`, `ingestedAt`,
- point-in-time reconstruction,
- deterministic replay,
- market-state snapshots,
- regime snapshots,
- historical state retrieval,
- correction append instead of historical rewrite.

Hard rule:

> Information is usable at historical `asOf` only if it was actually available to TCX at or before that time.

### B. Evidence Mesh

Responsibilities:

- multi-source evidence,
- feature provenance,
- source governance,
- source independence,
- dependency graph,
- common-cause detection,
- trust chains,
- contradiction/disagreement measurement,
- coverage diagnostics.

Agreement from multiple features produced by the same underlying source must not be counted as independent confirmation.

### C. Mechanism Layer / RIFT

Responsibilities include hypotheses around:

- forced flow,
- liquidity elasticity,
- reflexivity,
- cascades,
- absorption,
- balance-sheet / positioning constraints,
- boundary compression,
- crowding,
- structural dislocations.

Mechanism hypotheses are not upgraded to causal truth merely because they correlate with price.

Identifiability and witness quality remain explicit.

### D. Forecast Intelligence

Responsibilities:

- multi-horizon forecasts,
- calibrated probabilities,
- historical analogues,
- effective sample size,
- plausible paths,
- prediction intervals,
- drift monitoring,
- forecast revision,
- invalidation,
- counterfactual paths,
- uncertainty decomposition.

A single point estimate is insufficient.

Forecast output must expose what would make it stale, invalid or untrustworthy.

### E. Research Trace

Every meaningful claim must be traceable through:

```
Source
→ Observation
→ Feature
→ Factor
→ Assumption / Mechanism hypothesis
→ Forecast
→ Uncertainty
→ Invalidation
→ Decision
```

A research result without a valid trace is not promotable.

### F. Failure-First Kernel

The default question is not:

> Why should this trade work?

The default questions are:

- Which input may be stale?
- Which witnesses disagree?
- Which dependencies share a common source?
- Which mechanism is not identifiable?
- Which forecast is uncalibrated?
- Which regime may have shifted?
- Which assumption is doing too much work?
- Which data is missing?
- Which opposite hypothesis is still plausible?

When critical uncertainty remains unresolved, the correct output is **ABSTAIN**.

### G. Learning / Memory

The system stores and versions:

- forecasts,
- forecast revisions,
- forecast outcomes,
- mechanism states,
- regimes,
- entry decisions,
- rejected decisions,
- shadow trades,
- MFE / MAE,
- decision quality,
- exit quality,
- counterfactual hold durations,
- evidence failures,
- strategy/style cohorts,
- model versions,
- policy versions.

Learning must distinguish:

- information available before the decision,
- information learned during the trade,
- information visible only after the outcome.

Post-hoc explanation may generate a hypothesis but may not rewrite the original decision trace.

### H. Strategy League / Challenger System

New trading styles, strategies, features, thresholds and models enter as research challengers.

Examples:

- SCALP × LIQUIDITY_SWEEP_REVERSAL,
- INTRADAY × BREAKOUT_RETEST,
- SWING × TREND_CONTINUATION,
- alternative forecast ensembles,
- alternative lifecycle rules,
- alternative evidence weighting.

Challengers run in isolated shadow lanes.

They cannot modify PRIMARY behavior simply because their historical PnL is higher.

### I. Shadow OMS / Portfolio

Responsibilities:

- virtual order simulation,
- executable-book realism,
- multiple simultaneous markets,
- partial fills,
- fees / slippage,
- position lifecycle,
- exposure,
- concentration,
- correlation,
- stress,
- drawdown,
- daily / weekly / monthly statistics.

Trading is a scientific measurement layer for research hypotheses.

### J. Multi-Market Intelligence

Current and future evidence domains may include:

- spot,
- derivatives,
- funding,
- open interest,
- liquidations,
- order books,
- entity / exchange flows,
- on-chain,
- memecoin-specific telemetry,
- macro events,
- narratives / public attention,
- options,
- other alternative data.

Every new source enters through source contracts, governance, provenance and dependency mapping.

### K. Operator Interfaces

Telegram, Discord and future dashboards are views over the same canonical state.

They must not implement independent research or trading logic.

Typical navigation:

```
Market
→ Live State
→ Structure / Regime
→ Mechanisms
→ Forecast
→ Evidence
→ Uncertainty
→ Invalidation
→ Why / Why Not
→ Shadow Position
→ Replay / Learning
```

### L. Promotion Ladder

A candidate must progress through explicit stages:

```
IDEA
→ RESEARCH_ONLY
→ CHALLENGER
→ FORWARD_SHADOW
→ STRESS_VALIDATED
→ CALIBRATED
→ PROMOTION_REVIEW
→ PRIMARY
```

Promotion requires evidence such as:

- point-in-time correctness,
- no detected future leakage,
- sufficient forward samples,
- chronological stability,
- calibration,
- cost/slippage stress,
- winner-removal stress,
- regime concentration checks,
- symbol concentration checks,
- no material edge decay,
- reproducible audit record.

Demotion is allowed when evidence decays.

### M. Scientific Guards

Guards include:

- future leakage,
- selection bias,
- survivorship bias,
- confounding,
- common-cause false independence,
- coverage gaps,
- identifiability failure,
- calibration failure,
- stale inputs,
- source drift,
- policy drift,
- regime concentration,
- winner dependence,
- multiple-testing / challenger proliferation.

Scientific guards may make the system more conservative. They may never be loosened solely to generate more trades.

## 5. BIGGJ trading subsystem position

The BIGGJ Trading Constitution is subordinate to this Research OS canon.

Its flow is:

```
Research OS state
→ market preflight
→ trading-style selection
→ strategy-family selection
→ entry admission
→ shadow execution
→ adaptive lifecycle
→ post-trade analysis
→ learning evidence
→ challenger generation
```

It may **consume**:

- forecast intelligence,
- market structure,
- RIFT/mechanism state,
- Evidence Mesh,
- derivatives,
- liquidations,
- order books,
- on-chain,
- events,
- memory.

It may not independently declare those inputs true.

## 6. Self-improvement boundary

BIGGJ may autonomously:

- collect observations,
- update memories,
- evaluate forecasts,
- measure outcomes,
- generate challenger hypotheses,
- run shadow experiments,
- rank evidence,
- identify failure cohorts,
- propose policy changes.

BIGGJ may not autonomously and silently:

- rewrite PRIMARY policy,
- change scientific guards,
- relabel MODELLED evidence as OBSERVED,
- remove ABSTAIN gates,
- promote an unvalidated model,
- introduce a live order path,
- modify historical point-in-time truth.

Every improvement is versioned, tested, compared, audited and explicitly promoted.

## 7. Success objective

The system objective is not maximum trade count and not raw PnL.

The objective is to improve the reliability of:

1. knowledge-state accuracy,
2. uncertainty calibration,
3. invalidation quality,
4. decision quality,
5. risk-adjusted shadow expectancy,
6. stability across time/regimes,
7. reproducibility,
8. failure detection.

The desired end state is:

> A system that knows as precisely as possible what it knows, why it knows it, what it does not know, what could make it wrong, and what evidence would justify changing its mind.

## 8. Canonical rule

If two modules disagree about system truth, the upstream research/audit layer wins over the downstream trading/UI layer.

There is one TCX Research OS.

There are many research modules, strategies, styles, models and interfaces — but no independent competing bots.
