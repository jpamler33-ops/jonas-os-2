# TCX Master State

Status: CANONICAL CONTINUITY SNAPSHOT

## Baseline

Repository: `jpamler33-ops/jonas-os-2`
Canonical branch: `main`
Baseline code commit inspected before continuity files were added:

```text
a9c36688861a3f94fd314fe21c5d648dad129185
Test that missed markouts cannot contaminate calibration
```

Package version at that baseline: `2.6.0`
Runtime: Node.js `>=22`

This document records a baseline, not an immutable head pointer. A new chat must inspect current `main` before editing.

## Current system shape

TCX is a Telegram-based market-research and execution-research system with no live order execution path.

Verified runtime capabilities include:

- Telegram market UI, favorites and alerts
- chart/market structure stack
- Episode Memory
- Mechanism Transition Lattice
- Independent Witness Network across Binance / OKX / Kraken
- Institutional Kernel and fail-closed safety states
- tamper-evident audit ledger
- event-sourced Market Data Fabric
- deterministic point-in-time replay
- runtime release/configuration registry
- observability and chaos engineering
- Shadow OMS
- multi-venue Shadow SOR
- Venue Quality Memory
- Execution Research Lab
- Evidence History
- research state fingerprinting, drift, stale/expiry/invalidation lifecycle
- modular Market Data Provider
- modular Telegram command router with read and mutation handlers
- canonical Telegram product architecture in `docs/TCX_TELEGRAM_PRODUCT_SPEC.md`

## Execution boundary

```text
LIVE_EXECUTION = DISABLED
Execution = SHADOW_ONLY
Action = ABSTAIN
canExecute = false
```

The Shadow OMS and Shadow SOR are simulation/research components only.

## Persistence

Current file-backed persistence uses Railway-mounted `/data` paths for state such as:

- favorites / alerts
- Episode Memory
- Evidence History
- Audit Ledger
- Market Data Fabric
- Runtime Release Registry
- Shadow OMS
- Venue Quality Memory

The service should remain at one Railway replica while critical mutable state is local-volume file backed.

## Runtime architecture status

The runtime has already moved away from a pure command/provider monolith:

- `market-data-provider.mjs` owns exchange I/O
- `telegram-command-router.mjs` owns parsing/permission/dispatch/error isolation
- `telegram-read-command-handlers.mjs` owns read/research commands
- `telegram-mutation-command-handlers.mjs` owns Shadow OMS/SOR and alert mutations
- `bot.mjs` still performs substantial orchestration and remains a future modularization target

## Test status

The repository contains extensive Node test files and recent commits added regression coverage for Execution Research Lab calibration and missed markouts.

This continuity update did not execute CI or the full test suite. A new code-changing chat should verify current tests before and after material changes.

## Specialist state

Forecast Specialist output shown in the prior working chat is not yet canonical merely because it exists as a handover/archive.

Current status:

```text
Forecast Engine candidate: REVIEW BEFORE INTEGRATION
Forecast Self-Correction: NOT APPROVED
Overlap check: REQUIRED
```

Reason: current `main` already contains forecast-like Market Grammar / Market World Model / calibration / drift capabilities plus Research Validity and Execution Research Lab. Any specialist forecast package must be compared component-by-component before merge.
