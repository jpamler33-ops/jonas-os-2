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
| Forecast Intelligence runtime | `forecast-runtime/forecast/*` | STAGED / TESTED |
| Master → Forecast input adapter | `forecast-input-adapter.mjs` | STAGED / TESTED / CI GREEN |
| Canonical forecast output contract | `forecast-contract.mjs` | STAGED / TESTED / CI GREEN |
| Forecast issuance bundle | `institutional-forecast-issuance.mjs` | STAGED / TESTED / CI GREEN |
| Unified admission gate | `institutional-admission.mjs` | STAGED / TESTED / CI GREEN |
| Immutable Research Trace | `research-trace.mjs` | STAGED / TESTED / CI GREEN |
| Trace/issuance audit binding | `institutional-audit-binding.mjs` | STAGED / TESTED / CI GREEN |
| Scientific validity aggregation | `scientific-validity.mjs` | STAGED / TESTED / CI GREEN |
| Scientific core orchestrator | `scientific-core.mjs` | STAGED / TESTED / CI GREEN |
| Empirical support | `science-runtime/empirical-support.mjs` | STAGED / TESTED / CI GREEN |
| Research integrity | `science-runtime/research-integrity.mjs` | STAGED / TESTED / CI GREEN |
| Linear concept stability | `science-runtime/concept-stability.mjs` | STAGED / TESTED / CI GREEN |
| Nonlinear concept stability | `science-runtime/nonlinear-concept-stability.mjs` | STAGED / TESTED / CI GREEN |
| Temporal recency | `science-runtime/temporal-recency.mjs` | STAGED / TESTED / CI GREEN |
| Sequential evidence | `science-runtime/sequential-evidence.mjs` | STAGED / TESTED / CI GREEN |
| Specification multiverse | `science-runtime/specification-multiverse.mjs` | STAGED / TESTED / CI GREEN |
| Transportability | `science-runtime/transportability.mjs` | STAGED / TESTED / CI GREEN |
| Evidence lineage independence | `science-runtime/evidence-lineage-independence.mjs` | STAGED / TESTED / CI GREEN |
| Model promotion ladder | `model-promotion-ladder.mjs` | STAGED / TESTED / CI GREEN |
| Institutional release file set | `runtime-release-registry.mjs` | STAGED / TESTED / CI GREEN |

## Ownership decisions

### Forecasting

Owner: TCX Forecast Intelligence
Source candidate: Forecast Specialist v2.3.1
Status: one candidate forecast layer; no second forecast bot.

Historical Cloudflare Market Grammar / Market World Model files are not active current-main runtime truth.

### Scientific validation

Owner: TCX Scientific Core
Source candidate: selected Alpha.30 scientific guards
Status: core extraction complete.

Do not import Alpha.30 as a competing:
- market provider
- persistence layer
- dashboard/Telegram product
- execution stack
- portfolio stack
- deployment shell

### Product / Telegram

Owner remains current TCX Telegram product modules.
Forecast Specialist Telegram adapters are not canonical product ownership.

### Self-correction

Owner: TCX Model Promotion Ladder + future candidate registry.

Allowed:
```text
immutable issued forecast
→ matured outcome
→ scoring/calibration/error decomposition
→ versioned candidate
→ PIT + temporal OOS + science + replay gates
→ explicit promotion record
→ new release identity
```

Forbidden:
- same-sample self-feedback
- hidden mutable calibration
- unversioned online learning
- silent production replacement

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
