# BIGGJ Thesis Revision & Stale-Assumption Memory V1

Status: LIVE-PIPELINE RESEARCH INSTRUMENT  
Parent: Forecast Thesis Declarations V1  
Execution: SHADOW_ONLY  
PRIMARY influence: NONE

## Mission

Preserve how a forecast thesis changes after issuance without rewriting the original claim-assumption graph.

The system must answer:

- Which thesis assumption first lost support?
- When was that loss actually known?
- Which later evidence snapshot exposed it?
- Did support later return?
- Did the ordinary forecast invalidation engine enter WATCH or INVALIDATED?
- Was any warning available before the forecast horizon matured?
- How much lead time existed before outcome maturity?

## Time model

Two issue-time clocks are preserved:

- decisionAsOf: market state timestamp used by the forecast.
- issueKnowledgeAt: time the issued thesis artifact became known.

Every revision also preserves:

- currentStateAsOf: market timestamp represented by the new state.
- observedAt: time the new revision evidence became known.

No revision may be backdated before issueKnowledgeAt or before its own declaration knowledge time.

## Storage architecture

No separate truth store is created.

Revision memory is attached to the existing ForecastRevisionTracker record and is persisted inside the existing tracker archive.

The existing immutable issuance remains unchanged.

Tracker state contains:

- issue graph fingerprint,
- issue support state per THESIS_* assumption,
- current support state,
- first support-loss timestamp,
- first restoration timestamp,
- transition count,
- first WATCH timestamp,
- first stale timestamp,
- first forecast invalidation timestamp,
- bounded immutable revision events.

## Revision event policy

A new event is stored only for meaningful transitions:

- SUPPORT_LOST
- SUPPORT_RESTORED
- current declaration missing
- forecast assessment changes among VALID / WATCH / INVALIDATED / INSUFFICIENT

Evidence changing while support state remains unchanged is not sufficient by itself to create event spam.

Each transition stores the relevant current evidence objects and provenance fingerprints.

## Staleness semantics

A stale thesis assumption means:

the assumption had explicit evidence-linked support at issue time and later loses that support in a later point-in-time declaration.

This is a research warning.

It does not prove:

- that the original assumption was false,
- that the forecast will fail,
- that the support loss caused a later failure.

## Forecast invalidation

The existing forecast invalidation engine remains authoritative for its own path/regime/safety assessment.

Thesis staleness does not replace it.

The memory records both channels independently:

- thesis support transitions,
- forecast WATCH / INVALIDATED transitions.

This allows later research to determine whether one channel adds incremental information over the other.

## Outcome binding

When a horizon matures, the forward-shadow observation receives only revision events with observedAt <= maturedAt.

The outcome artifact can therefore expose:

- stale assumptions at maturity,
- assumptions that were ever stale before maturity,
- first stale time,
- first WATCH time,
- first forecast invalidation time,
- first warning time,
- warning lead milliseconds,
- whether invalidation existed before maturity.

Later events are excluded.

Outcome information never rewrites earlier revision memory.

## Research evaluation

The Claim-Assumption Research Evaluator can now measure:

- failure capture rate of pre-outcome warnings,
- false-warning rate on correct forecasts,
- mean and median warning lead time,
- per-assumption direction-error rate when stale vs not stale,
- per-assumption interval-miss rate when stale vs not stale.

These remain prospective associations, not causal claims.

## Migration

Older tracker records remain readable.

If a prior forecast already has a thesis sidecar but no revision memory, the first later eligible observation initializes revision memory from the immutable issuance before applying the new observation.

Forecasts predating THESIS_* declarations may have zero thesis assumptions and remain legacy-compatible.

## Safety invariants

- immutable original issuance
- Point-in-Time only
- no future leakage
- no backdated knowledge
- no automatic promotion
- no automatic kill
- no forecast-gate mutation
- no trading-policy mutation
- no real orders
- SHADOW_ONLY
- ABSTAIN
- canInfluencePrimary:false
- canExecuteLive:false
