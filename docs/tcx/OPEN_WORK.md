# TCX Open Work

Status: CANONICAL NEXT-WORK QUEUE

Priorities are ordered by dependency/risk, not novelty.

All material work must satisfy:
`docs/tcx/INSTITUTIONAL_STANDARD.md`

## P0 · Continuity system

Status: IMPLEMENTED

Acceptance:
- new chat can recover project state from GitHub
- no need to carry hundreds of old chat messages
- module ownership and open work are explicit
- institutional standard is mandatory bootstrap context

## P1 · Master + Forecast Specialist + Alpha.30 integration review

Status: NEXT

Goal:
produce one canonical TCX architecture instead of three partially overlapping systems.

Required procedure:

1. Inventory every candidate file and capability from:
   - current GitHub main
   - Forecast Specialist v2.3.1
   - Alpha.30 scientific core
   - Product/Telegram handover where not already canonical
2. Inspect current `main` first.
3. Build a capability-level overlap matrix against:
   - data/provenance/PIT infrastructure
   - Market Grammar forecasts
   - Market World Model / rollout calibration
   - Forecast Specialist multi-horizon engine
   - Alpha.30 scientific-core systems
   - empirical calibration / Brier tracking
   - drift / OOD / novelty
   - Research Validity / expiry / invalidation
   - Evidence History / lifecycle
   - Independent Witness / disagreement
   - Execution Research Lab
   - Telegram forecast/product contract
4. For each component choose exactly one:
   - KEEP MASTER
   - KEEP SPECIALIST
   - MERGE
   - REWRITE
   - DEPRECATE
5. Define the post-merge canonical contracts before moving code.
6. Reject:
   - future leakage
   - uncalibrated user-facing probabilities
   - duplicated truth
   - same-sample self-feedback
   - hidden mutable calibration
   - modules that bypass institutional safety/replay/provenance
7. Preserve:
   - SHADOW_ONLY
   - ABSTAIN
   - point-in-time integrity
   - deterministic audit/release identity
8. Add/adjust tests before canonicalizing the merged design.
9. Run syntax + complete test suite.
10. Update:
   - MASTER_STATE
   - ARCHITECTURE
   - MODULE_REGISTRY
   - DECISIONS
   - OPEN_WORK
   - specialist handover status

Deliverables:
- overlap matrix
- target architecture
- canonical data contracts
- merge plan ordered by dependency
- list of deleted/deprecated duplicates
- test/validation plan
- migration risks
- final post-merge source-of-truth map

## P2 · Institutional gap audit

Audit current merged design against `INSTITUTIONAL_STANDARD.md`.

Mark each requirement:
```text
DONE
PARTIAL
MISSING
NOT_APPLICABLE
BLOCKED
```

Priority areas:
- Research Trace
- Promotion Ladder
- model/calibration versioning
- schema contracts
- migration strategy
- idempotency/deduplication
- backpressure/circuit breakers
- failure-path observability
- CI/release/rollback discipline

## P3 · Verify product-spec vs runtime gap

Canonical spec: `docs/TCX_TELEGRAM_PRODUCT_SPEC.md`

Audit current runtime against its roadmap and mark each item:

```text
DONE
PARTIAL
MISSING
BLOCKED
```

Do not reimplement already-shipped features under new names.

## P4 · Continue bot modularization

The command router and provider boundary are already extracted.

Next modularization should be driven by measurable coupling/testability problems in `bot.mjs`, not folder aesthetics.

Likely candidates:
- view-model assembly
- session/live-view lifecycle
- research orchestration service
- persistence coordination

## P5 · Test / deployment verification after material integration

Run the repository's current syntax/test path and verify Railway packaging/release hashing includes all new runtime-relevant modules.

## Stop condition

Do not start a new speculative subsystem while P1 has unresolved overlap with canonical forecast/calibration/drift/scientific-core components.
