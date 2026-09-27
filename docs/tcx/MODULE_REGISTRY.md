# TCX Module Registry

Status: CANONICAL OWNERSHIP / OVERLAP CONTROL
Canonical branch: `main`

Purpose: prevent duplicate subsystem ownership and make the current source of truth explicit.

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
| Observability / SLOs | `observability.mjs` | MAIN CANONICAL |
| Operational readiness | `operational-readiness.mjs` | MAIN CANONICAL |
| Persistence contracts | `persistence-contracts.mjs` | MAIN CANONICAL |
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

## Forecast / institutional research

| Capability | Canonical module(s) | Status |
|---|---|---|
| Forecast engine/runtime | `forecast-runtime/forecast/*` | MAIN CANONICAL |
| Master → Forecast input | `forecast-input-adapter.mjs` | MAIN CANONICAL |
| Forecast → science adapter | `forecast-science-adapter.mjs` | MAIN CANONICAL |
| Forecast contract | `forecast-contract.mjs` | MAIN CANONICAL |
| Forecast product view | `forecast-product.mjs` | MAIN CANONICAL |
| Durable forecast runtime | `institutional-forecast-runtime.mjs` | MAIN CANONICAL |
| Forecast issuance | `institutional-forecast-issuance.mjs` | MAIN CANONICAL |
| Institutional Admission | `institutional-admission.mjs` | MAIN CANONICAL |
| Research Trace | `research-trace.mjs` | MAIN CANONICAL |
| Trace / issuance audit binding | `institutional-audit-binding.mjs` | MAIN CANONICAL |
| Scientific validity | `scientific-validity.mjs` | MAIN CANONICAL |
| Scientific Core | `scientific-core.mjs` | MAIN CANONICAL |

## Scientific guards

| Capability | Canonical module | Status |
|---|---|---|
| Empirical support | `science-runtime/empirical-support.mjs` | MAIN CANONICAL |
| Research integrity | `science-runtime/research-integrity.mjs` | MAIN CANONICAL |
| Linear concept stability | `science-runtime/concept-stability.mjs` | MAIN CANONICAL |
| Nonlinear concept stability | `science-runtime/nonlinear-concept-stability.mjs` | MAIN CANONICAL |
| Temporal recency | `science-runtime/temporal-recency.mjs` | MAIN CANONICAL |
| Sequential evidence | `science-runtime/sequential-evidence.mjs` | MAIN CANONICAL |
| Specification multiverse | `science-runtime/specification-multiverse.mjs` | MAIN CANONICAL |
| Transportability | `science-runtime/transportability.mjs` | MAIN CANONICAL |
| Evidence-lineage independence | `science-runtime/evidence-lineage-independence.mjs` | MAIN CANONICAL |

## Self-correction / governance

| Capability | Canonical module | Status |
|---|---|---|
| Candidate builder + walk-forward | `forecast-candidate-lab.mjs` | MAIN CANONICAL |
| Promotion ladder | `model-promotion-ladder.mjs` | MAIN CANONICAL |
| Candidate/version registry | `model-candidate-registry.mjs` | MAIN CANONICAL |
| Model/software release binding | `model-release-binding.mjs` | MAIN CANONICAL |
| Promotion / rollback audit | `model-governance-audit.mjs` | MAIN CANONICAL |

## V3 Expansion Pack adaptations

Verified source package:
`TCX_V3_EXPANSION_PACK_INSERTABLE_2026-09-27`

Source package SHA-256:
`e15a7c66bbbdcfcb8c3680842e0071e2728cb872592b455b073fd218681f2180`

| Capability | Canonical module | Status |
|---|---|---|
| Expansion source provenance | `expansion-runtime/provenance.mjs` | MAIN CANONICAL |
| Read-only expansion evidence | `expansion-runtime/institutional-expansion.mjs` | MAIN CANONICAL |
| Source Intelligence | `expansion-runtime/source-intelligence.mjs` | MAIN CANONICAL |
| Event Impact Memory | `expansion-runtime/event-impact-memory.mjs` | MAIN CANONICAL |
| Liquidity Intelligence | `expansion-runtime/liquidity-intelligence.mjs` | MAIN CANONICAL |
| Trader / Wallet Intelligence evidence | `expansion-runtime/trader-wallet-intelligence.mjs` | MAIN CANONICAL V1 |

The original expansion orchestrator, Ghost Portfolio, forecast ledger, duplicate science gates and self-improvement controller are not canonical because TCX already has stronger owners.

## Ownership decisions

### Forecasting

Owner: TCX Forecast Intelligence.

There is one canonical forecast contract and one canonical forecast-runtime path.

Do not create a second user-facing probability truth.

### Scientific validation

Owner: TCX Scientific Core.

Selected Alpha.30 concepts were adapted behind TCX contracts. Alpha.30 is not a competing provider, persistence layer, product shell, execution stack or deployment system.

### Product / Telegram

Owner: TCX Telegram product modules.

Forecast views consume canonical research artifacts; the UI may never manufacture probability or bypass Admission.

### Self-correction

Owner: TCX Candidate Lab + Model Promotion Ladder + Candidate Registry.

Allowed:

```text
immutable forecast
→ matured outcome
→ scoring / calibration / drift
→ versioned candidate
→ PIT + temporal OOS + science + replay gates
→ explicit promotion
→ model/software release identity
→ rollback path
```

Forbidden:
- same-sample self-feedback
- hidden mutable thresholds
- unversioned online learning
- silent production replacement

## Rule for new work

Before creating a new engine/module:

1. inspect current `main`
2. check this registry
3. identify the canonical owner
4. define an actual missing capability
5. extend/adapt before duplicating
6. preserve PIT and epistemic boundaries
7. preserve `SHADOW_ONLY / ABSTAIN / canExecute=false`
8. update this registry whenever ownership changes
