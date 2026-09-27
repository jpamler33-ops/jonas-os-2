# TCX Open Work

Status: CANONICAL NEXT-WORK QUEUE FOR INSTITUTIONAL V3
Branch: `integration/tcx-institutional-v3`

All material work must satisfy:
`docs/tcx/INSTITUTIONAL_STANDARD.md`

## P0 · Continuity + institutional architecture

Status: DONE

Completed:
- GitHub continuity system
- institutional engineering standard
- Master / Forecast / Alpha.30 overlap audit
- target architecture v3
- module ownership registry

## P1 · Forecast Specialist staging

Status: PRE-MERGE ENGINEERING COMPLETE / MAIN MERGE PENDING

Completed:
- full v2.3.1 forecast runtime staged
- PIT hardening staged
- forecast integration regression suite
- canonical ForecastOutput contract
- canonical Master Research Envelope → ForecastInput adapter
- unified Institutional admission gate
- staged Runtime Release file identity
- Research Trace binding
- audit-ledger binding
- root CI on integration branch + PR

Completed runtime/product path:
- durable forecast runtime service + atomic persistence
- actual bot orchestration behind the admission gate
- Telegram /forecast + command-center Forecast entry point
- deployment packaging for staged institutional modules
- Docker packaging smoke test
- matured-outcome watcher with audited Research Trace evaluations

Still required before main promotion:
- merge PR #2 only while latest checks remain green and branch is not behind main
- deploy single-replica runtime
- post-deploy readiness / Telegram / matured-outcome acceptance

## P2 · TCX Research Trace

Status: DONE V1 / INTEGRATION-STAGED

Completed:
- immutable deterministic trace identity
- data-fabric/release/state references
- evidence / contradiction / forecast / science references
- SHADOW_ONLY / ABSTAIN hard locks
- separate immutable outcome evaluation
- forecast issuance → Research Trace binding
- issuance/evaluation → append-only audit ledger binding
- idempotent audit events
- staged release-manifest inclusion
- tamper tests + CI green

## P3 · Alpha.30 Scientific Validity extraction

Status: CORE DONE

Completed:
1. strict Scientific Validity aggregation
2. empirical support
3. research integrity / adaptive holdout reuse
4. linear concept stability
5. nonlinear concept stability
6. temporal recency
7. sequential evidence / optional-stopping risk
8. specification multiverse
9. transportability
10. evidence-lineage independence
11. one canonical Scientific Core orchestrator

Every adapted guard:
- filters point-in-time
- blocks/counts future rows
- rejects invalid rows
- emits PASS / CAUTION / ABSTAIN / INSUFFICIENT
- does not fabricate forecast probability
- remains SHADOW_ONLY
- has deterministic tests

Deferred research-only extensions:
- dependency discovery / hypergraph
- latent-factor discovery
- interventional invariance

These remain deferred until the canonical runtime path is stable; they must not become a competing market-data or forecast truth.

## P4 · Unified admission gate

Status: DONE / INTEGRATION-STAGED

Implemented:
- data safety gate
- research-state validity gate
- canonical forecast gate
- scientific-validity gate
- strictest-wins semantics
- future-knowledge rejection
- integrity verification of forecast/science artifacts
- probability-display suppression
- SHADOW_ONLY / canExecute=false invariants

No downstream layer can weaken an upstream hard block.

## P5 · Forecast self-correction / promotion ladder

Status: CORE DONE / GOVERNANCE-STAGED

Completed:
- immutable issuance → matured outcome audit chain
- fail-closed model promotion ladder
- PIT leakage gate
- temporal OOS gate
- deterministic replay gate
- scientific-validity PASS requirement
- non-inferiority checks against incumbent
- minimum OOS sample / independent episode requirements
- explicit promotion record
- no silent production mutation
- durable append-only candidate-version registry
- offline candidate builder using matured outcomes only
- locked forecast target semantics across candidates
- chronological point-in-time walk-forward evaluation
- promotion evaluation / promotion / rollback audit binding
- model release → registered software runtime release binding
- rollback metadata + rollback drill
- candidate/governance Docker packaging + CI

Next:
1. merge/deploy acceptance
2. decide explicit operational trigger for offline candidate evaluation after main merge
3. keep all promotion actions explicit and versioned; no unattended production mutation

Forbidden:
- same-sample self-feedback
- hidden threshold mutation
- silent production replacement
- unversioned online learning

## P5A · V3 Expansion Pack

Status: CORE SELECTIVE INTEGRATION DONE / RUNTIME WIRING PENDING

Verified source package:
`3.0.0-alpha.insertable.1`
SHA-256:
`e15a7c66bbbdcfcb8c3680842e0071e2728cb872592b455b073fd218681f2180`

Completed:
- package verification: 36 files / 30 modules / SHADOW_ONLY / no live execution
- original pack tests: 9/9 PASS
- capability-by-capability duplicate audit
- Source Intelligence institutional adaptation
- Event Impact Memory institutional adaptation
- Liquidity Intelligence institutional adaptation
- expansion evidence bundle
- provenance hashing
- Runtime Release Registry inclusion
- integration tests + CI green

Deferred intentionally:
- Memecoin Intelligence until real on-chain safety/provenance inputs exist
- Trader Intelligence until wallet/entity resolution + survivorship controls exist
- Future Intelligence as a separate slow-timescale research layer
- Narrative/Psychology/Reflexivity until empirical validation replaces heuristic confidence
- Portfolio Brain until canonical shadow portfolio wiring
- causal graph only as hypothesis graph, never causal truth
- original expansion orchestrator, Ghost Portfolio, forecast ledger and science gates because canonical TCX owners already exist

Next:
- bind expansion evidence into canonical Research Trace / evidence references
- map permitted expansion evidence into ForecastInput only through explicit typed features
- add product drill-down only after runtime orchestration is stable

## P6 · Product integration

Status: V1 DONE / DRILL-DOWN FOLLOW-UP

Implemented:
- /forecast read command
- Forecast button on market command center
- institutional forecast card
- calibrated probability only when forecast + science + admission + audit gates permit display
- uncertainty intervals + path coherence
- scientific support state
- admission state
- Research Trace / issuance identifiers
- runtime learning summary

Follow-up after final merge review:
- richer revision/invalidation drill-down
- deeper Research Trace provenance explorer

Do not expose raw internal probabilities when calibration/science/admission/audit suppresses them.

## P7 · Institutional gap audit

Status: DONE / PRE-MERGE ENGINEERING GATE PASSED

Closed:
- schema/version contracts
- persistence migrations/contracts
- idempotency
- bounded backpressure
- circuit breakers
- single-replica persistence prerequisite
- rollback governance + drill
- release hashing
- observability/SLOs
- incident recovery runbook
- fail-closed /ready endpoint
- deployment packaging
- automated institutional pre-merge gate
- main-branch migration plan

Release-process work remaining:
- merge tested PR head
- deploy
- post-deploy acceptance

## Stop condition

Do not start speculative new prediction engines. Finish the canonical runtime, persistence, promotion, product and deployment path first.
