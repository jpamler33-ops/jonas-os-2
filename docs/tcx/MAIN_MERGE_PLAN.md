# TCX Institutional v3 — Main Merge & Deployment Plan

Status: PRE-MERGE CANONICAL PLAN
PR: #2
Source: `integration/tcx-institutional-v3`
Target: `main`

## Preconditions

Do not merge unless all are true:

- integration branch is not behind main
- PR CI is green
- root/science/expansion/institutional tests are green
- Docker packaging smoke test is green
- institutional pre-merge gate is green
- chaos suite is green
- no critical persistence compatibility block
- Runtime Release identity includes every institutional module
- `SHADOW_ONLY / ABSTAIN / canExecute=false` invariants remain intact

## Persistence backup before deployment

Preserve a deployment snapshot of the current `/data` volume, including at minimum:

- `tcx-state.json`
- `tcx-episodes.json`
- `tcx-evidence-history.json`
- `tcx-audit-ledger.jsonl`
- `tcx-market-events.jsonl`
- `tcx-release-registry.jsonl`
- `tcx-shadow-oms.json`
- `tcx-venue-quality-memory.json`
- `tcx-forecast-runtime.json`

Do not manually rewrite hash-chain files.

## Merge

Current integration strategy is one canonical PR.

Before merge:
1. re-read current main SHA
2. verify integration branch has `behind_by = 0`
3. verify PR checks against the current head
4. merge only the tested head
5. record merged main SHA

## Deployment

Required environment:
```text
TCX_REPLICA_COUNT=1
```

Deploy the merged main release.

The startup must:
- build the institutional Runtime Release manifest
- register the release
- load/verify persistence
- keep no-live invariants
- expose `/health` and `/ready`

## Post-deploy acceptance

1. `GET /health` responds.
2. `GET /ready` returns 200.
3. Runtime Release ID is present and registered.
4. Audit Ledger / Market Fabric / Release Registry are healthy.
5. Forecast Runtime is healthy and not recovered from unexplained corruption.
6. Telegram:
   - `/start`
   - market view
   - `/forecast BTC`
   - `/system`
   - validity/evidence drill-down
7. Forecast probability stays suppressed whenever its calibration/science/admission/audit gate does not permit display.
8. No authenticated exchange-order capability exists.
9. Allow at least one forecast to mature and confirm an audited outcome evaluation is written.

## Rollback trigger

Rollback if any of these occur:
- readiness remains 503
- persistence compatibility is BLOCKED
- release identity mismatch
- hash-chain verification failure
- forecast config hash mismatch
- forecast runtime cannot recover deterministically
- no-live invariant regression
- material Telegram/runtime regression that prevents safe operation

Use the Incident Recovery Runbook. Do not repair production state by deleting critical history.

## After stabilization

Only after a stable main deployment:
- decide explicit cadence/trigger for offline candidate evaluation
- keep model promotion explicit and versioned
- add richer Telegram provenance/revision drill-down
- plan shared transactional persistence before any multi-replica scaling
