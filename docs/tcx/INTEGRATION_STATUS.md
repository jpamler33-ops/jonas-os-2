# TCX Institutional Integration Status

Branch: `integration/tcx-institutional-v3`
PR: #2 — TCX Institutional v3 — Forecast + Scientific Validity Integration

## Current staged core

The integration branch now contains one joined institutional path:

```text
MASTER MARKET / TEMPORAL TRUTH
        ↓
TCX Research Envelope
        ↓
Canonical ForecastInput Adapter
        ↓
Forecast Specialist v2.3.1 Core
        ↓
Canonical Forecast Contract
        ↘
          Scientific Core
        ↗
Alpha.30-derived falsification guards
        ↓
Unified Institutional Admission
        ↓
Institutional Forecast Issuance
        ↓
Immutable Research Trace
        ↓
Append-only Audit Ledger
        ↓
Matured Outcome
        ↓
Model Promotion Ladder
```

## Staged and tested

- Forecast Specialist v2.3.1 runtime
- canonical Master → Forecast input adapter
- canonical forecast output contract
- immutable Research Trace
- Scientific Validity aggregator
- canonical Scientific Core orchestrator
- empirical support
- adaptive research-integrity / holdout guard
- linear + nonlinear concept stability
- temporal recency
- sequential evidence / optional-stopping guard
- specification multiverse
- transportability
- evidence-lineage independence
- strictest-wins Institutional admission gate
- atomic forecast/science/admission/trace issuance identity
- issuance + outcome audit-ledger binding
- staged institutional runtime release file identity
- fail-closed model promotion ladder
- append-only model candidate/version registry
- V3 Expansion Pack selective institutional adaptations:
  - Source Intelligence
  - Event Impact Memory
  - Liquidity Intelligence
  - read-only expansion evidence bundle
  - cryptographic expansion-pack provenance

## Latest verified gate

```text
commit: 73ff2f6797a9bdced0254dd052e9bfc81a0d965d
GitHub Actions: SUCCESS
PR CI: SUCCESS
syntax: PASS
root + science-runtime + expansion-runtime + forecast candidate/governance tests: PASS
Docker institutional packaging smoke test: PASS
```

The verified branch now includes the durable forecast runtime, Telegram forecast product,
matured-outcome feedback, candidate builder, chronological walk-forward evaluation,
promotion/audit binding, model-to-runtime release binding, and rollback drill.

Expansion source package SHA-256:
`e15a7c66bbbdcfcb8c3680842e0071e2728cb872592b455b073fd218681f2180`

The uploaded `(2)` expansion archive is byte-identical to the previously inspected `(1)` archive.

## Hard invariants

```text
executionMode = SHADOW_ONLY
action = ABSTAIN
canExecute = false
same-sample self-feedback = forbidden
silent production mutation = forbidden
future knowledge = blocked
uncalibrated/suppressed probability = not user-displayable
```

## Not yet production-canonical

Nothing on this branch is canonical on `main` until PR #2 passes the final institutional gap audit and is merged.

Completed production-path staging:
1. durable forecast runtime persistence
2. canonical bot orchestration through adapter → science → admission → Research Trace
3. Telegram forecast command + market-card entry point
4. calibrated-probability suppression and audit fail-closed display
5. matured-outcome feedback into calibration/reliability/drift memories
6. offline candidate builder from matured outcomes only
7. chronological PIT-safe walk-forward evaluation
8. append-only candidate/version registry
9. promotion/evaluation audit binding
10. model release → registered software release binding
11. rollback metadata + deterministic rollback drill
12. Docker packaging + smoke test

## Next highest-leverage work

Run the final institutional gap audit on persistence migrations, operational failure modes,
release/rollback procedure, observability, and main-branch migration. Do not start another
prediction engine before this review is closed.
