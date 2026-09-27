# TCX Institutional v3 — Final Gap Audit

Status: IN PROGRESS / PRE-MERGE
Date: 2026-09-27

This audit evaluates the staged institutional branch against `docs/tcx/INSTITUTIONAL_STANDARD.md`.

## Closed engineering gaps

### Canonical research path
CLOSED.

One staged path now owns:
market truth → ForecastInput → Forecast Intelligence → Scientific Core → Institutional Admission → Forecast Issuance → Research Trace → Audit.

### Point-in-time integrity
CLOSED for the staged forecast/science path.

Future/unmatured observations are rejected or excluded by dedicated tests.

### Probability epistemics
CLOSED.

Uncalibrated or institutionally inadmissible probabilities remain internally auditable but are suppressed from product display.

### Scientific falsification
CLOSED for the current core.

Empirical support, research integrity, linear/nonlinear concept stability, temporal recency, sequential evidence, specification multiverse, transportability and evidence-lineage independence are integrated.

### Durable forecast runtime
CLOSED.

Forecast history, learning journal, revision tracker and issuance state persist under a versioned runtime snapshot.

### Self-correction governance
CLOSED at the staged governance layer.

Candidate creation uses matured data only, target semantics are locked, evaluation is chronological/PIT-safe, promotions are explicit/versioned, software/model release identities are bound and rollback is modeled/audited.

### Backpressure and circuit breakers
CLOSED for public market-data provider I/O.

The request pool is bounded and host-level circuit breakers fail fast.

### Persistence contracts
CLOSED at code-contract level.

Every persistent store has explicit criticality/recovery policy. Critical research corruption blocks readiness. Local-file persistence explicitly forbids multiple replicas.

### Readiness
CLOSED at staged runtime level.

`/health` is liveness/diagnostics. `/ready` is fail-closed institutional readiness and can return 503.

### SLO/observability
CLOSED V1.

Provider and operation success/latency SLOs are explicit and tested.

### Chaos testing
CLOSED V1.

Synthetic corruption/outage/safety scenarios must retain the execution-disabled invariant.

### Deployment packaging
CLOSED V1.

Docker packaging has a syntax check, institutional runtime files are release-hashed, process runs non-root and local state is under `/data`.

## Deployment constraint

Current persistence is local-file based.

Therefore:
- exactly one replica
- no horizontal scaling
- shared transactional persistence is required before multi-replica deployment

## Remaining pre-merge checks

These are release-process checks rather than missing product engines:

1. latest branch CI + PR CI green
2. Docker packaging smoke test green on latest tested head
3. integration branch still `behind_by = 0` versus main
4. final review of PR #2 file diff
5. merge only the tested head
6. perform post-deploy `/ready` + Telegram + matured-outcome smoke test

## Deferred by design

Not required for this main merge:
- shared distributed persistence
- multi-replica runtime
- dependency hypergraph / latent-factor / interventional scientific extensions
- richer Telegram provenance explorer
- autonomous unattended model promotion
- any live trading path

## No-live invariant

```text
executionMode = SHADOW_ONLY
action = ABSTAIN
canExecute = false
authenticated exchange execution path = absent
```

Any future live-execution project would require a separate architecture, security review and explicit product decision. It is not implied by this merge.
