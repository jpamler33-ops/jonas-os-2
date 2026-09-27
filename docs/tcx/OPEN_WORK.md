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

Status: CORE DONE / NOT YET MAIN-CANONICAL

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

Still required before main promotion:
- durable forecast runtime service/persistence wiring
- actual bot orchestration behind the admission gate
- Telegram forecast views only after runtime wiring is proven
- deployment packaging for staged institutional modules
- final main-merge migration/rollback review

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

Status: IN PROGRESS

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

Next:
1. durable candidate-version registry — DONE
2. offline candidate builder from matured outcomes only
3. temporal walk-forward evaluation driver
4. promotion record → audit ledger binding
5. release-registry linkage for promoted candidate version
6. rollback metadata + rollback drill

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

Status: NEXT AFTER RUNTIME WIRING

Required product views:
- forecast card
- calibrated probability only when display gate allows it
- uncertainty interval + path scenarios
- revisions / invalidation
- scientific support state
- admission state
- Research Trace / provenance drill-down

Do not expose raw internal probabilities when calibration/science/admission suppresses them.

## P7 · Institutional gap audit

Status: READY AFTER P5 CORE

Audit:
- schema/version contracts
- persistence migrations
- idempotency
- backpressure
- circuit breakers
- distributed persistence prerequisites
- rollback
- release hashing
- observability/SLOs
- incident recovery
- deployment packaging
- main-branch migration

## Stop condition

Do not start speculative new prediction engines. Finish the canonical runtime, persistence, promotion, product and deployment path first.
