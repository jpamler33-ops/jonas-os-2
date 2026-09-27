# TCX Open Work

Status: CANONICAL NEXT-WORK QUEUE

Priorities are ordered by dependency/risk, not novelty.

## P0 · Continuity system

Status: IMPLEMENTED BY THIS DOC SET

Acceptance:
- new chat can recover project state from GitHub
- no need to carry hundreds of old chat messages
- module ownership and open work are explicit

## P1 · Forecast Specialist integration review

Status: NEXT

Input: latest Forecast Specialist handover/archive/branch.

Required procedure:

1. Inventory every candidate file and capability.
2. Inspect current `main` first.
3. Build an overlap matrix against:
   - existing Market Grammar forecasts
   - Market World Model / rollout calibration
   - empirical calibration / Brier tracking
   - Research Validity / drift / expiry
   - Evidence History / lifecycle
   - Execution Research Lab
   - Telegram forecast/product contract
4. For each component choose:
   - KEEP MASTER
   - KEEP SPECIALIST
   - MERGE
   - REWRITE
   - DEPRECATE
5. Reject any future leakage, uncalibrated probability or duplicated source of truth.
6. Preserve SHADOW_ONLY / ABSTAIN invariants.
7. Add/adjust tests before canonicalizing the merged design.
8. Update MASTER_STATE, MODULE_REGISTRY, DECISIONS and this file after integration.

## P2 · Verify product-spec vs runtime gap

Canonical spec: `docs/TCX_TELEGRAM_PRODUCT_SPEC.md`

Audit current runtime against its P0–P6 product roadmap and mark each item:

```text
DONE
PARTIAL
MISSING
BLOCKED
```

Do not reimplement already-shipped features under new names.

## P3 · Continue bot modularization

The command router and provider boundary are already extracted.

Next modularization should be driven by measurable coupling/testability problems in `bot.mjs`, not folder aesthetics.

Likely candidates:
- view-model assembly
- session/live-view lifecycle
- research orchestration service
- persistence coordination

## P4 · Test / deployment verification after material integration

Run the repository's current syntax/test path and verify Railway packaging/release hashing includes all new runtime-relevant modules.

## Stop condition

Do not start a new speculative subsystem while P1 has unresolved overlap with canonical forecast/calibration/drift components.
