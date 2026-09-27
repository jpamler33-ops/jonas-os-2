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

## Latest verified gate

```text
commit: ee245b99ebf87abd8e59187c29fc62847534a0f3
push CI: SUCCESS
PR CI: SUCCESS
syntax: PASS
root tests + science-runtime tests: PASS
```

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

Nothing on this branch is canonical on `main` until the runtime/deployment migration is complete and the final integration PR is reviewed.

Current missing production path:
1. durable candidate/version registry
2. offline candidate builder from matured outcomes
3. temporal walk-forward evaluation driver
4. actual bot orchestration through the new adapter/science/admission/trace path
5. persistence/deployment packaging for staged modules
6. Telegram forecast views
7. rollback drill + final institutional gap audit

## Next highest-leverage work

Finish the versioned learning/promotion pipeline before UI expansion. Then wire the gated institutional forecast service into the bot and expose only normalized, admissible views.
