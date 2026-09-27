# TCX Module Registry

Status: CANONICAL OWNERSHIP / OVERLAP CONTROL

Purpose: prevent parallel chats from implementing the same capability twice.

## Canonical runtime modules

| Capability | Canonical module(s) | Status |
|---|---|---|
| Persistent user state | `state-store.mjs` | CANONICAL |
| Structure / MTF | `market-structure.mjs` | CANONICAL |
| Chart rendering | `chart-renderer.mjs` | CANONICAL |
| Dashboard state | `dashboard-state.mjs` | CANONICAL |
| Episode Memory | `episode-memory.mjs` | CANONICAL |
| Mechanism Transition Lattice | `mechanism-transition-engine.mjs` | CANONICAL |
| Independent witnesses | `independent-witness-network.mjs` | CANONICAL |
| Institutional control plane | `institutional-kernel.mjs` | CANONICAL |
| Market event chain | `market-data-fabric.mjs` | CANONICAL |
| Point-in-time replay | `deterministic-replay.mjs` | CANONICAL |
| Runtime release identity | `runtime-release-registry.mjs` | CANONICAL |
| Observability | `observability.mjs` | CANONICAL |
| Chaos harness | `chaos-engineering.mjs` | CANONICAL |
| Shadow OMS | `shadow-oms.mjs` | CANONICAL |
| Shadow SOR | `multi-venue-shadow-sor.mjs` | CANONICAL |
| Venue Quality Memory | `venue-quality-memory.mjs` | CANONICAL |
| Execution Research Lab | `execution-research-lab.mjs` | CANONICAL |
| Telegram product UI | `telegram-product-ui.mjs` | CANONICAL |
| Alerts v2 | `alert-engine.mjs` | CANONICAL |
| Evidence history | `evidence-history.mjs` | CANONICAL |
| Research validity | `state-validity.mjs` | CANONICAL |
| Research lifecycle | `research-lifecycle.mjs` | CANONICAL |
| Exchange/public market I/O | `market-data-provider.mjs` | CANONICAL |
| Telegram routing | `telegram-command-router.mjs` | CANONICAL |
| Telegram read commands | `telegram-read-command-handlers.mjs` | CANONICAL |
| Telegram mutation commands | `telegram-mutation-command-handlers.mjs` | CANONICAL |

## Integration candidates

### Forecast Specialist Engine

Owner: Forecast Specialist
Status: CANDIDATE FOR INTEGRATION
Canonical: NO

Before any merge, compare the candidate against existing main-branch capabilities, especially:

- Market Grammar prediction / surprise / drift
- Market World Model and horizon calibration
- empirical calibration / Brier tracking
- `state-validity.mjs`
- `research-lifecycle.mjs`
- `evidence-history.mjs`
- `execution-research-lab.mjs`
- Telegram product forecast contract

Per component choose exactly one:

```text
KEEP MASTER
KEEP SPECIALIST
MERGE
REWRITE
DEPRECATE
```

### Forecast Self-Correction

Status: NOT YET APPROVED
Reason: overlap and leakage/calibration review required before it becomes canonical.

## Rule for new parallel work

Before creating a new engine/module:

1. Search current `main`.
2. Check this registry.
3. Identify the canonical owner.
4. Define the missing capability, not just a new name.
5. If overlap exists, integrate or extend instead of duplicating.
6. Update this registry when ownership/status changes.
