# TCX Target Architecture v3 — Institutional Research OS

Status: TARGET FOR `integration/tcx-institutional-v3`

## North-star flow

```text
PUBLIC OBSERVATIONS
        ↓
TCX TEMPORAL FABRIC
(data quality + provenance + availableAt + immutable event truth)
        ↓
NORMALIZED RESEARCH STATE
        ├─────────────┬─────────────────┐
        ↓             ↓                 ↓
EVIDENCE MESH    FORECAST CORE    SCIENTIFIC VALIDITY CORE
        ↓             ↓                 ↓
 disagreement     probabilities       support/falsification
 witness map      intervals           stability
 memory           paths               transportability
 novelty          revisions           multiverse/sequential
        └─────────────┴─────────────────┘
                      ↓
             TCX CONTROL PLANE
         Institutional Kernel / gates
                      ↓
                  ABSTAIN
                    or
              admissible research
                      ↓
              TCX RESEARCH TRACE
                      ↓
              PRODUCT / TELEGRAM
```

No layer can bypass the control plane.

## Plane 1 — Temporal/Data

Canonical owners:
- `market-data-provider.mjs`
- `market-data-fabric.mjs`
- `deterministic-replay.mjs`

Required invariant:
every historical input is governed by knowledge availability, not hindsight timestamps.

## Plane 2 — Evidence Mesh

Canonical owners:
- `episode-memory.mjs`
- `mechanism-transition-engine.mjs`
- `independent-witness-network.mjs`
- `evidence-history.mjs`

Future addition:
lineage-based evidence-independence diagnostics adapted from Alpha.30.

## Plane 3 — Forecast Intelligence

Candidate owner:
`forecast-runtime/forecast/*`

Target contract:

```text
ForecastInput
- schemaVersion
- symbol
- asOf
- price
- features
- featureConfidence
- regime
- dataQuality
- upstreamGuards
- provenance
- releaseId

ForecastOutput
- schemaVersion
- forecastId
- generatedAt
- asOf
- horizons[]
  - P(UP/DOWN/FLAT)
  - expectedReturn
  - interval
  - support
  - calibration
  - disagreement
  - gate
- path distribution
- OOD/support
- validity
- execution=SHADOW_ONLY
```

The forecast engine does not own Telegram or master safety.

## Plane 4 — Scientific Validity Core

Source candidate:
Alpha.30 `src/science/*`

Initial promoted families:
- empirical support
- concept stability
- nonlinear concept stability
- temporal recency
- sequential evidence/change
- specification multiverse
- transportability
- independent evidence lineage
- dependency discovery/hypergraph
- latent-factor discovery
- interventional invariance
- research integrity / reality-gap guards

Output is a scientific-support decision, not trade direction.

## Plane 5 — Control

Canonical owner:
`institutional-kernel.mjs` plus specialized validity services.

Target unified gate:

```text
DATA
  PASS/CAUTION/ABSTAIN/SAFE_STOP
RESEARCH_STATE
  VALID/STALE/DRIFTED/EXPIRED/INVALIDATED
FORECAST
  PASS/CAUTION/INSUFFICIENT/ABSTAIN
SCIENCE
  PASS/CAUTION/INSUFFICIENT/ABSTAIN

effective result = strictest applicable state
```

No downstream module can weaken an upstream hard block.

## TCX Research Trace v1

Every issued forecast/research conclusion gets one immutable trace identity.

Required fields:
- traceId
- schemaVersion
- symbol
- asOf
- generatedAt
- dataFabricSeq / tailHash
- runtimeReleaseId
- inputFingerprint
- researchStateFingerprint
- evidence references
- contradiction references
- forecast reference
- scientific validity references
- safety state
- validity state
- audit record
- later outcome links

This becomes the bridge between replay, forecasting, calibration and scientific validation.

## Self-correction architecture

```text
ISSUED TRACE
   ↓
OUTCOME MATURITY
   ↓
SCORING
   ├─ Brier/log loss
   ├─ interval coverage
   ├─ calibration
   ├─ error decomposition
   └─ segment diagnostics
   ↓
DRIFT / SUPPORT / SCIENCE GATES
   ↓
CANDIDATE UPDATE
   ↓
TEMPORAL OOS + PIT REPLAY
   ↓
PROMOTION LADDER
   ↓
NEW VERSION
```

Production parameters never mutate invisibly.

## Deployment maturity

A component has two separate dimensions:

1. software maturity
2. scientific maturity

Example:

```text
software: CANONICAL
scientific: RESEARCH_ONLY
```

This prevents reliable code from being mistaken for validated predictive edge.

## Scaling rule

Current file-backed state remains single-replica only.

Before horizontal scale:
- transactional shared state
- migrations
- optimistic/concurrency controls
- idempotent workers
- distributed leases where needed
- durable queues for outcome maturation
- backpressure
- recovery drills

## Definition of institutional-ready

A release is not accepted until:
- root runtime tests pass
- forecast tests pass
- science gate passes
- PIT/no-lookahead tests pass
- safety invariants pass
- persisted-state migration tests pass where schemas changed
- runtime manifest includes every loaded production module
- rollback path exists
- user-facing output exposes uncertainty/validity
