# TCX Institutional Incident Recovery Runbook

Status: CANONICAL PRE-MERGE OPERATIONS RUNBOOK
Scope: `integration/tcx-institutional-v3` and later main deployments

TCX remains `SHADOW_ONLY`. Incident recovery restores research/runtime integrity; it never enables live exchange execution.

## 1. Health model

Two HTTP checks are intentionally different:

- `/health` = process liveness / diagnostics. It may return 200 while the runtime is institutionally NOT_READY.
- `/ready` = fail-closed readiness. It returns 200 only when the critical institutional path is usable and 503 when a hard readiness invariant is violated.

Deployment automation should use `/ready`, not `/health`, as the release gate.

## 2. First response to a 503 readiness result

1. Freeze promotion activity.
2. Do not delete or overwrite any `.corrupt-*` backup.
3. Record:
   - current Git commit
   - runtime release ID
   - readiness hard reasons
   - audit-ledger tail hash / seq
   - market-fabric tail hash / seq
   - release-registry tail hash / seq
4. Keep replica count at one while local-file persistence is active.
5. Repair the failed subsystem or restore a verified snapshot.
6. Restart the exact versioned runtime.
7. Require `/ready = 200` before resuming institutional forecast issuance.
8. Verify deterministic replay and audit continuity after recovery.

## 3. Corruption classes

### Audit Ledger / Market Data Fabric / Release Registry

Policy: FAIL CLOSED.

Do not create a replacement chain over the damaged file and pretend continuity exists.

Recovery:
1. stop the process
2. preserve the original file
3. restore last verified chain snapshot, if available
4. verify sequence and hash linkage
5. restart
6. verify current Runtime Release is registered
7. run replay/integrity checks
8. require readiness green

### Forecast Runtime

A corrupt runtime snapshot is backed up separately.

Policy: institutional forecast readiness remains blocked after corruption recovery until the operator validates the reset/restored state.

Required checks:
- backup exists
- configured forecast model hash matches the Runtime Release
- Episode Memory seeding is PIT-clean
- pending forecast/outcome state is understood
- Research Trace / Audit Ledger remains intact

### Episode Memory / Evidence History

Policy: critical research history. Corruption blocks readiness.

Do not silently accept an empty replacement as equivalent history.

### User State

Favorites/alerts can be recovered cleanly. This degrades readiness but does not represent loss of scientific truth.

### Shadow OMS / Venue Quality Memory

These are research-only subsystems. Corruption degrades their research capability and must not grant any live execution permission.

## 4. Provider outage / circuit breaker

If a provider circuit opens:
- do not bypass the circuit breaker
- keep provider fallback and Independent Witness semantics intact
- inspect provider success/latency SLOs
- allow only the safety state permitted by the canonical control plane

A saturated bounded request queue is a NOT_READY condition. Do not replace bounded backpressure with an unbounded queue.

## 5. Model rollback

A model rollback is a versioned governance event.

Required artifacts:
- candidate model release binding
- previous model release binding
- promotion record
- rollback drill / rollback record
- registered software runtime releases

Rollback procedure:
1. freeze new candidate issuance
2. choose the known previous model release
3. restore its versioned forecast config
4. bind the model config hash to the software Runtime Release
5. restart the single-replica runtime
6. verify deterministic replay / persistence / audit
7. require readiness green
8. resume SHADOW_ONLY research

No rollback path is allowed to mutate an unversioned model silently.

## 6. Software rollback

Rollback the deployment to a previously registered Runtime Release.

After restart confirm:
- release ID matches expected code + config hash
- release registry knows the release
- persistence contract is compatible
- audit/fabric chains verify
- forecast runtime is healthy
- `/ready = 200`
- Telegram read paths work
- execution remains `SHADOW_ONLY`

## 7. Multi-replica rule

Current persistence uses local files under `/data`.

Therefore:
```text
TCX_REPLICA_COUNT = 1
horizontal scaling = FORBIDDEN
```

Horizontal scaling requires a deliberate migration to transactional shared persistence first.

## 8. Recovery completion criteria

An incident is not closed merely because the process starts.

Required:
- `/ready = 200`
- no critical recovery/corruption hard reason
- current Runtime Release registered
- no persistence compatibility block
- critical chains verified
- forecast runtime healthy
- model configuration hash bound to release identity
- CI/replay checks green for the restored version
- incident cause and recovery action recorded
