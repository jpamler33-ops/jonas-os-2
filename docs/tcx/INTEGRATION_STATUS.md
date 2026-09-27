# TCX Institutional Integration Status

Status: MAIN-CANONICAL CODE / DEPLOYMENT ACCEPTANCE PENDING
Canonical branch: `main`
Merge PR: #2 — merged 2026-09-27
Canonical merge commit: `331f9f4c93a5a8cff52b9057cdc888b8fdef8c13`

## Canonical institutional path

```text
MASTER MARKET / TEMPORAL TRUTH
        ↓
TCX Research Envelope
        ↓
Canonical ForecastInput Adapter
        ↓
Forecast Intelligence Runtime
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
Calibration / Reliability / Drift
        ↓
Candidate Lab + Temporal Walk-Forward
        ↓
Versioned Promotion Governance
```

## Canonical capabilities

- durable institutional forecast runtime
- Forecast Specialist v2.3.1 adapted behind canonical TCX contracts
- canonical Master → Forecast input adapter
- canonical forecast output contract
- immutable Research Trace and outcome evaluation
- Scientific Validity + Scientific Core
- empirical support
- research integrity / adaptive holdout
- linear + nonlinear concept stability
- temporal recency
- sequential evidence / optional-stopping guard
- specification multiverse
- transportability
- evidence-lineage independence
- strictest-wins Institutional Admission
- issuance / outcome → Audit Ledger binding
- calibrated probability display suppression
- Telegram `/forecast` + command-center Forecast entry
- matured-outcome feedback loop
- PIT-safe offline candidate builder
- chronological walk-forward evaluation
- append-only candidate/version registry
- model promotion / rollback governance
- model config → Runtime Release identity binding
- explicit persistence contracts
- fail-closed `/ready`
- bounded provider backpressure + circuit breakers
- provider / operation SLOs
- deterministic chaos tests
- incident recovery runbook
- deployment / rollback plan
- selected V3 Expansion Pack institutional adaptations

## Latest verified code gate

```text
merge commit: 331f9f4c93a5a8cff52b9057cdc888b8fdef8c13
main GitHub Actions: SUCCESS
integration / PR CI: SUCCESS
syntax gate: PASS
root + science-runtime + expansion-runtime + institutional tests: PASS
institutional pre-merge gate: PASS
Docker institutional packaging smoke test: PASS
```

## Hard invariants

```text
executionMode = SHADOW_ONLY
action = ABSTAIN
canExecute = false
same-sample self-feedback = forbidden
silent production mutation = forbidden
future knowledge = blocked
uncalibrated / inadmissible probability = suppressed from product display
local-file horizontal scaling = forbidden
```

## Deployment status

The code is canonical on `main`.

A live Railway deployment has not been independently verified from repository state alone. Production acceptance still requires:

1. deploy the merged main release with `TCX_REPLICA_COUNT=1`
2. require `GET /ready = 200`
3. verify Runtime Release registration
4. verify Telegram `/start`, market view, `/forecast BTC`, `/system`, evidence/validity
5. allow a forecast to mature and verify an audited outcome evaluation
6. use `docs/tcx/INCIDENT_RECOVERY_RUNBOOK.md` on any readiness failure

Do not treat process liveness alone as deployment acceptance.
