# TCX Module Registry

Status: CANONICAL OWNERSHIP / OVERLAP CONTROL
Branch context: integration/tcx-institutional-v3

Purpose: prevent parallel chats from implementing the same capability twice and distinguish MAIN-canonical from integration-staged components.

## Main-canonical runtime modules

| Capability | Canonical module(s) | Status |
|---|---|---|
| Persistent user state | `state-store.mjs` | MAIN CANONICAL |
| Structure / MTF | `market-structure.mjs` | MAIN CANONICAL |
| Chart rendering | `chart-renderer.mjs` | MAIN CANONICAL |
| Dashboard state | `dashboard-state.mjs` | MAIN CANONICAL |
| Episode Memory | `episode-memory.mjs` | MAIN CANONICAL |
| Mechanism Transition Lattice | `mechanism-transition-engine.mjs` | MAIN CANONICAL |
| Independent venue witnesses | `independent-witness-network.mjs` | MAIN CANONICAL |
| Institutional control plane | `institutional-kernel.mjs` | MAIN CANONICAL |
| Market event chain | `market-data-fabric.mjs` | MAIN CANONICAL |
| Point-in-time replay | `deterministic-replay.mjs` | MAIN CANONICAL |
| Runtime release identity | `runtime-release-registry.mjs` | MAIN CANONICAL |
| Observability | `observability.mjs` | MAIN CANONICAL |
| Chaos harness | `chaos-engineering.mjs` | MAIN CANONICAL |
| Shadow OMS | `shadow-oms.mjs` | MAIN CANONICAL |
| Shadow SOR | `multi-venue-shadow-sor.mjs` | MAIN CANONICAL |
| Venue Quality Memory | `venue-quality-memory.mjs` | MAIN CANONICAL |
| Execution Research Lab | `execution-research-lab.mjs` | MAIN CANONICAL |
| Telegram product UI | `telegram-product-ui.mjs` | MAIN CANONICAL |
| Alerts v2 | `alert-engine.mjs` | MAIN CANONICAL |
| Evidence history | `evidence-history.mjs` | MAIN CANONICAL |
| Research validity | `state-validity.mjs` | MAIN CANONICAL |
| Research lifecycle | `research-lifecycle.mjs` | MAIN CANONICAL |
| Exchange/public market I/O | `market-data-provider.mjs` | MAIN CANONICAL |
| Telegram routing | `telegram-command-router.mjs` | MAIN CANONICAL |
| Telegram read commands | `telegram-read-command-handlers.mjs` | MAIN CANONICAL |
| Telegram mutation commands | `telegram-mutation-command-handlers.mjs` | MAIN CANONICAL |

## Institutional-v3 staged modules

These are authoritative only inside the integration branch until promoted to main.

| Capability | Module(s) | Integration status |
|---|---|---|
| Immutable Research Trace | `research-trace.mjs` | STAGED / TESTED |
| Forecast Intelligence runtime | `forecast-runtime/forecast/*` | STAGED / TESTED / NOT PRODUCT-CANONICAL |
| Forecast regression guards | `forecast-intelligence.integration.test.mjs` | STAGED / CI GREEN |
| Scientific validity aggregation | `scientific-validity.mjs` | STAGED / TEST REQUIRED |
| Alpha.30 guard adapters | isolated future `science-runtime/*` | CANDIDATE / NOT YET IMPORTED |

## Forecast Specialist Engine

Owner: TCX Forecast Intelligence
Source branch: `integration/forecast-v2.3.1`
Integration status: STAGED on `integration/tcx-institutional-v3`
Canonical on main: NO

Important correction:
the historical Cloudflare Market Grammar / Market World Model files are no longer active runtime modules on current `main`. They were removed during the transition to the current Node/Railway architecture and therefore are not a second current forecast source of truth.

Forecast Specialist may become the one canonical forecast layer only after:
- canonical input/output contract
- master point-in-time adapter
- institutional admission gate
- calibration/OOD/validity review
- Alpha.30 scientific validity integration
- full CI
- release/replay binding
- product integration through normalized views

## Alpha.30 Scientific Core

Owner candidate: TCX Scientific Validity Core
Source: Alpha.30 master merge bundle
Status: VALIDATED SOURCE CANDIDATE / NOT WHOLE-REPO MERGE
Canonical on main: NO

Keep/adapt:
- empirical support
- concept stability
- nonlinear concept stability
- temporal recency
- sequential evidence/change
- specification multiverse
- transportability
- evidence-lineage independence
- dependency discovery/hypergraph
- latent-factor discovery
- interventional invariance
- research integrity / reality-gap guards

Do not import as competing runtime truth:
- market providers
- Telegram/dashboard UI
- execution stack
- portfolio stack
- deployment shell
- duplicate persistence/audit infrastructure

## Forecast Self-Correction

Status: NOT YET APPROVED FOR AUTONOMOUS PRODUCTION MUTATION

Allowed architecture:
```text
issued immutable forecast
→ matured outcome
→ scoring/calibration/error decomposition
→ drift/scientific guards
→ candidate model or parameter version
→ PIT + temporal OOS validation
→ promotion gate
→ new version
```

Forbidden:
- same-sample self-feedback
- hidden threshold mutation
- silent replacement of canonical production model
- feedback that bypasses Release Registry / Research Trace

## Rule for new parallel work

Before creating a new engine/module:

1. Inspect current `main`.
2. Inspect `integration/tcx-institutional-v3`.
3. Check this registry.
4. Identify the canonical owner.
5. Define a missing capability, not a new name for an existing one.
6. Extend/adapt before duplicating.
7. Preserve point-in-time and epistemic boundaries.
8. Update this registry whenever ownership or promotion state changes.
