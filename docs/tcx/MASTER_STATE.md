# TCX Master State

Status: CANONICAL CONTINUITY SNAPSHOT

## Canonical repository state

Repository: `jpamler33-ops/jonas-os-2`
Canonical branch: `main`

Institutional v3 merge commit:

```text
331f9f4c93a5a8cff52b9057cdc888b8fdef8c13
Merge TCX Institutional v3
```

That merge passed main GitHub Actions.

Runtime: Node.js `>=22`
Package baseline lineage: `2.6.0`

Always inspect current `main` before editing because this file records continuity, not a permanent head pointer.

## System identity

TCX is a Telegram-based market-research and execution-research operating system.

Core institutional chain:

```text
Point-in-time market truth
→ Research Envelope
→ Forecast Intelligence
→ Scientific Core
→ Institutional Admission
→ Research Trace
→ Audit Ledger
→ Matured Outcome
→ Calibration / Error Decomposition
→ Versioned Candidate
→ Temporal Walk-Forward
→ Explicit Promotion Governance
```

## Canonical capabilities

- Telegram market UI, favorites, alerts and `/forecast`
- chart / multi-timeframe market structure
- Episode Memory
- Mechanism Transition Lattice
- Independent Witness Network across Binance / OKX / Kraken
- Institutional Kernel and fail-closed safety states
- tamper-evident Audit Ledger
- event-sourced Market Data Fabric
- deterministic point-in-time replay
- Runtime Release Registry
- observability, explicit SLOs and chaos testing
- bounded Market Data Provider with backpressure and circuit breakers
- Shadow OMS
- multi-venue Shadow SOR
- Venue Quality Memory
- Execution Research Lab
- Evidence History
- research fingerprint / stale / drift / expiry / invalidation lifecycle
- canonical ForecastInput / ForecastOutput contracts
- durable institutional Forecast Runtime
- calibrated probability display suppression
- Scientific Validity + Scientific Core
- empirical support
- research integrity / adaptive holdout
- linear and nonlinear concept stability
- temporal recency
- sequential evidence / optional-stopping guard
- specification multiverse
- transportability
- evidence-lineage independence
- strictest-wins Institutional Admission
- immutable Research Trace
- forecast issuance / matured-outcome Audit Ledger binding
- candidate/version registry
- matured-data-only candidate builder
- chronological PIT-safe walk-forward evaluation
- explicit model promotion and rollback governance
- model-config → software Runtime Release binding
- explicit persistence contracts
- fail-closed `/ready`
- incident recovery and main-deployment runbooks
- selected V3 Expansion Pack adaptations:
  - Source Intelligence
  - Event Impact Memory
  - Liquidity Intelligence
  - read-only expansion evidence bundle

## Execution boundary

```text
LIVE_EXECUTION = DISABLED
Execution = SHADOW_ONLY
Action = ABSTAIN
canExecute = false
```

Shadow OMS / SOR and all model-governance components are simulation/research only.

No authenticated exchange-order path is part of the canonical institutional forecast/science/governance path.

## Persistence

Current runtime persistence is local-file based under `/data`.

Critical stores include:
- user state
- Episode Memory
- Evidence History
- Forecast Runtime
- Audit Ledger
- Market Data Fabric
- Runtime Release Registry
- Shadow OMS
- Venue Quality Memory

Institutional persistence contracts define which corruption states block readiness versus degrade research capability.

Current deployment rule:

```text
TCX_REPLICA_COUNT = 1
horizontal scaling = forbidden while critical state is local-file backed
```

Shared transactional persistence is required before multi-replica deployment.

## Runtime architecture

Primary boundaries:
- `market-data-provider.mjs`: exchange/public market I/O
- `telegram-command-router.mjs`: parsing / permission / dispatch / isolation
- `telegram-read-command-handlers.mjs`: read/research commands
- `telegram-mutation-command-handlers.mjs`: shadow mutations / alert mutations
- `institutional-forecast-runtime.mjs`: durable forecast issuance / outcome learning
- `scientific-core.mjs`: scientific falsification orchestration
- `institutional-admission.mjs`: strictest-wins research admission
- `research-trace.mjs`: immutable research identity
- `model-promotion-ladder.mjs`: explicit model promotion policy
- `model-candidate-registry.mjs`: append-only candidate/version history
- `operational-readiness.mjs`: fail-closed runtime readiness
- `persistence-contracts.mjs`: persistence compatibility / criticality policy

`bot.mjs` still performs orchestration and can be further decomposed only when that measurably reduces coupling.

## Verification status

Institutional v3 reached:
- integration CI green
- PR CI green
- main merge CI green
- syntax gate green
- root/science/expansion/institutional tests green
- institutional pre-merge gate green
- Docker packaging smoke test green

Code is canonical on `main`.

Live deployment acceptance is a separate step and must not be inferred from GitHub repository state alone.

Required deployment acceptance:
- deploy current main with one replica
- `/ready = 200`
- Runtime Release registered
- Telegram smoke checks pass
- one forecast matures and writes an audited outcome evaluation

## Specialist state

Forecast Specialist v2.3.1 and selected Alpha.30 science concepts are no longer parallel candidates.

They were audited, adapted and promoted into canonical TCX ownership.

No specialist archive or parallel chat may overwrite these owners without a new explicit overlap review.
