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

Status: DONE / NOT YET MAIN-CANONICAL

Completed:
- full v2.3.1 forecast runtime staged
- PIT hardening staged
- integration regression suite added
- root CI enabled on integration branches
- CI green after staging

Still required before main promotion:
- canonical ForecastInput / ForecastOutput contracts
- normalized master adapter
- Institutional Kernel admission
- Runtime Release hash inclusion
- Research Trace binding
- Telegram view integration only after gates

## P2 · TCX Research Trace

Status: DONE V1 / INTEGRATION-STAGED

Completed:
- immutable deterministic trace identity
- data-fabric/release/state references
- evidence / contradiction / forecast / science references
- SHADOW_ONLY / ABSTAIN hard locks
- separate immutable outcome evaluation
- tamper tests
- CI green

Next:
- bind actual forecast issuance to Research Trace
- bind trace/evaluations into audit ledger
- bind trace module into runtime release manifest

## P3 · Alpha.30 Scientific Validity extraction

Status: NEXT

Do NOT merge Alpha.30 wholesale.

Order:
1. define strict scientific-validity aggregation contract
2. adapt empirical-support guard
3. adapt research-integrity guard
4. adapt concept-stability / nonlinear-stability guards
5. adapt temporal recency + sequential evidence/change
6. adapt specification multiverse
7. adapt transportability
8. adapt evidence-lineage independence
9. defer dependency/hypergraph/interventional layers until the core admission path is stable

Requirements for every adapted guard:
- point-in-time filtering
- future rows counted and blocked
- invalid rows rejected
- explicit PASS / CAUTION / ABSTAIN / INSUFFICIENT
- no probability fabrication
- SHADOW_ONLY
- deterministic tests
- no duplicate market-data truth

## P4 · Unified admission gate

Status: BLOCKED BY P3 CORE

Target:
combine without averaging:
- data safety
- research-state validity
- forecast gate
- scientific validity

Strictest applicable hard state wins.
No downstream layer may weaken an upstream block.

## P5 · Forecast self-correction / promotion ladder

Status: BLOCKED BY P4

Implement only as:
immutable forecast → outcome → score → diagnostics → candidate version → temporal OOS/PIT/science validation → promotion.

No silent production mutation.

## P6 · Product integration

Status: BLOCKED BY P4

Only after contracts/gates are stable:
- Forecast card
- uncertainty/calibration
- paths
- revisions
- invalidation
- scientific-support state
- Research Trace / provenance drill-down

## P7 · Institutional gap audit

Status: AFTER CORE MERGE

Audit:
- schema/version contracts
- migrations
- idempotency
- backpressure
- circuit breakers
- distributed persistence prerequisites
- rollback
- release hashing
- observability/SLOs
- incident recovery

## Stop condition

Do not start speculative new engines while P3/P4 are incomplete.
