# BIGGJ Assumption Stability & Persistence V1

Status: LIVE-PIPELINE RESEARCH INSTRUMENT  
Parent: Thesis Revision Memory V2  
Execution: SHADOW_ONLY  
PRIMARY influence: NONE

## Purpose

A single missing evidence point must not be confused with durable thesis invalidation.

This layer separates:

1. raw support loss,
2. transient evidence flicker,
3. persistent structural staleness,
4. recovery,
5. initial issue-time unsupported state.

The original forecast issuance and Claim-Assumption Graph remain immutable.

## Stability states

### SUPPORTED_STABLE

The assumption currently has support and no unresolved persistence warning exists.

### TRANSIENT_FLICKER

Support has been lost once, but the loss has not yet satisfied persistence criteria.

One observation can never become persistent stale.

### PERSISTENT_STALE

Support loss has been confirmed by repeated point-in-time observations.

Default confirmation requires at least two unsupported observations and one of:

- minimum elapsed unsupported duration,
- repeated explicit falsifier,
- multiple structurally distinct evidence families.

The evidence-family rule is a structural heuristic, not statistical proof of independence.

### RECOVERING

A previously persistent-stale assumption has regained support, but recovery has not yet satisfied hysteresis.

Default recovery requires two supported observations and minimum recovery duration.

### ISSUE_UNSUPPORTED

The assumption was already unsupported when the forecast was issued.

This state is not called stale because no supported thesis state existed to become stale.

### LEGACY_UNKNOWN

A persisted Thesis Revision Memory V1 object has been migrated to V2.

Historical stability is not reconstructed or invented.

Only new point-in-time observations can establish stability state.

## Explicit falsifiers

Falsifiers are derived only from visible thesis evidence provenance.

Examples:

- world state: UNKNOWN / INSUFFICIENT regime or structure,
- witness support: witness not satisfied, external witness count below two, material witness contradiction,
- mechanism: unsupported mechanism gate or weak evidence strength,
- transition analogues: insufficient transition support,
- evidence alignment: evidence index below threshold or weak mechanism evidence strength,
- dependency coverage: bad dependency gate or blocked forecast features,
- disagreement: contradiction score above tolerance or material witness contradiction,
- science: scientific guard outside PASS / CAUTION / VALID.

These falsifiers are descriptive research signals.

They do not prove causal invalidity.

## Provenance repair

The thesis declaration layer now exposes all inputs used by two material predicates that previously had incomplete graph provenance:

### THESIS_EVIDENCE_ALIGNMENT_ADEQUATE

Support depends on:

- THESIS_EVIDENCE_STATE,
- THESIS_MECHANISM_STATE.

The mechanism evidence strength was already used by the predicate but was not previously attached to the assumption edge.

### THESIS_DISAGREEMENT_WITHIN_TOLERANCE

Support depends on:

- THESIS_EVIDENCE_STATE,
- THESIS_WITNESS_STATE.

THESIS_EVIDENCE_STATE now also records CONTRADICTION_SCORE.

This removes hidden support inputs from the declared graph.

## Hysteresis

A brief loss followed by restored support produces:

SUPPORTED_STABLE
→ TRANSIENT_FLICKER
→ SUPPORTED_STABLE

No persistent-stale event is emitted.

Durable loss produces:

SUPPORTED_STABLE
→ TRANSIENT_FLICKER
→ PERSISTENT_STALE

Recovery produces:

PERSISTENT_STALE
→ RECOVERING
→ SUPPORTED_STABLE

A failed recovery returns to PERSISTENT_STALE.

An initially unsupported assumption uses a separate lifecycle:

ISSUE_UNSUPPORTED
→ RECOVERING
→ SUPPORTED_STABLE

If this attempt fails before stable support is established, it returns to ISSUE_UNSUPPORTED rather than being mislabeled PERSISTENT_STALE.

## Time discipline

The existing four-clock discipline remains:

- decisionAsOf
- issueKnowledgeAt
- currentStateAsOf
- observedAt

Persistence uses only observations known at observedAt.

No later outcome information can affect prior stability state.

## Pre-outcome evaluation

At maturity BIGGJ records both raw and persistence-filtered views.

Raw view:

- first support loss,
- any stale assumption before maturity,
- ordinary forecast WATCH / INVALIDATED state.

Persistence-filtered view:

- transient flicker assumptions,
- persistent-stale assumptions,
- assumptions ever persistent-stale before maturity,
- first persistent-stale timestamp,
- first structural warning,
- structural warning lead time.

This allows direct measurement of whether hysteresis reduces false warnings while retaining useful failure capture.

## Historical immutability

Thesis Revision Memory V1 is migrated without backfilling stability history.

If a forecast horizon matured before the migration timestamp, the pre-outcome representation remains the legacy V1 representation.

The software upgrade therefore does not retroactively change the semantics of already-matured historical observations.

## Persistence

No new truth store is introduced.

Assumption stability is embedded inside the existing thesisMemory object which remains inside the existing ForecastRevisionTracker archive.

Stable unchanged assumptions produce no persistence churn.

Writes occur only when needed for:

- transient sequences,
- persistence confirmation,
- recovery,
- falsifier/evidence-family changes,
- revision events,
- schema migration.

## Research evaluation

The Claim-Assumption Research Evaluator now reports both:

### Raw support-loss metrics

- warning capture,
- false-warning rate,
- stale-vs-never-stale outcome association.

### Persistence-filtered metrics

- structural warning capture,
- structural false-warning rate,
- structural warning lead time,
- persistent-stale vs never-persistent-stale direction-error association,
- persistent-stale vs never-persistent-stale interval-miss association.

Association readiness remains sample-gated.

None of these metrics are causal proof.

## Safety invariants

- Point-in-Time only
- no future leakage
- immutable original issuance
- no retrospective historical stability invention
- no automatic promotion
- no automatic kill
- no forecast-gate mutation
- no trading-policy mutation
- no real orders
- SHADOW_ONLY
- ABSTAIN
- canInfluencePrimary:false
- canExecuteLive:false
