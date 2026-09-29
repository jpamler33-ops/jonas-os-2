# BIGGJ Forecast Claim-Assumption Sidecar V1

Status: FORWARD-SHADOW RESEARCH INSTRUMENT  
Parent challenger: CLAIM_ASSUMPTION_GRAPH  
Execution: SHADOW_ONLY  
PRIMARY influence: NONE  
Live execution authority: NONE

## Purpose

Every new institutional forecast now receives an immutable research sidecar that declares the model thesis in explicit claim/assumption form.

The sidecar is not part of the trading decision gate and does not change the canonical forecast.

It exists to make future research measurable.

## Issuance flow

```
Canonical Forecast Input
        ↓
Forecast Engine
        ↓
Canonical Forecast
        ↓
Scientific Validity
        ↓
Institutional Admission
        ↓
Research Trace
        ↓
Claim-Assumption Sidecar
```

The sidecar is linked to:

- forecast fingerprint,
- input fingerprint,
- scientific-validity fingerprint,
- admission fingerprint,
- Research Trace hash.

It is independently fingerprinted and verified.

## Baseline declarations

For every forecast horizon V1 declares three core assumptions:

1. STATE_REPRESENTATIVE  
   The PIT state remains sufficiently representative for the forecast horizon.

2. REGIME_ADEQUACY  
   The regime representation / modeled transition remains sufficiently informative.

3. MODEL_TRANSPORTABILITY  
   Historical model relationships remain sufficiently transportable to the current horizon.

If the probability layer is calibrated, V1 adds:

4. CALIBRATION_TRANSFER  
   Historical calibration remains sufficiently applicable to the current horizon.

These are explicitly marked ASSUMED.

They are research scaffolding, not truth.

## Horizon claims

Each horizon produces explicit MODELLED claims for:

- direction + expected return,
- conditional interval,
- internal probability vector.

The probability claim remains explicit even when probability display is suppressed.

Calibration status remains visible in the claim.

## Partial coverage

V1 explicitly states:

`declarationCoverage = PARTIAL_DECLARATIVE_BASELINE`

and:

`hiddenAssumptionsMayRemain = true`

This is important.

The module does not claim that the automatically declared assumptions are complete.

## Custom thesis declarations

Future strategy/mechanism layers can add:

- claims,
- assumptions,
- evidence,
- assumption dependencies

through `traceContext.claimAssumptionDeclarations`.

Custom records must obey PIT chronology.

No custom record can be backdated past issuance.

## Duplicate issuance invariant

Forecast issuance identity intentionally remains backward compatible.

Therefore the sidecar is not inserted into the historical issuance-ID hash.

To prevent silent research-history mutation:

> same issuanceId + different sidecar fingerprint = fail closed.

A repeated identical issuance is idempotent.

A repeated issuance with different custom assumptions is rejected.

## Persistence model

No new independent truth store is added.

The sidecar persists inside the existing forecast issuance store.

The later realized forecast outcome already persists in the existing Forecast Learning Journal.

Therefore a forward-shadow dataset can be reconstructed as:

```
Persisted Issuance Sidecar
       +
Persisted Matured Journal Outcome
       ↓
Claim-Assumption Shadow Observation
```

This avoids another mutable database of truth.

## Shadow observations

When a horizon matures, BIGGJ links:

- sidecar fingerprint,
- graph fingerprint,
- forecast fingerprint,
- Research Trace ID,
- horizon,
- issuance audit state,
- Research Trace Evaluation ID.

The observation explicitly says:

- forwardShadowMeasurementOnly:true
- doesNotInferAssumptionTruthFromOutcome:true
- doesNotRewriteIssuanceGraph:true
- doesNotChangeForecastEvaluation:true

A wrong forecast does not automatically prove an assumption was wrong.

A correct forecast does not automatically validate an assumption.

## Reconstructible research dataset

`forecastClaimAssumptionShadowDataset(runtime)`

rebuilds the prospective dataset from persisted artifacts.

It exposes:

- observation count,
- linked historical sidecars,
- horizon outcomes,
- original graph audit state.

The dataset remains:

- SHADOW_ONLY
- ABSTAIN
- canInfluencePrimary:false
- canExecuteLive:false

## Research objective

This creates the data necessary to test the historical research hypothesis:

> Does explicit claim/assumption topology reveal useful audit information beyond the existing Research Trace and provenance model?

Future evaluation should compare:

- assumption-defect detection,
- stale-assumption detection,
- revision precision,
- duplicate/false-positive findings,
- research/operator overhead,
- downstream error recurrence.

Until that evaluation exists, CLAIM_ASSUMPTION_GRAPH remains a research challenger rather than a validated skill.

## Invariants

- PIT required
- no future leakage
- no retrospective mutation
- no inference of assumption truth from outcome alone
- no automatic PRIMARY changes
- no live order authority
- no probability reinterpretation
- no causal claim from graph structure alone
