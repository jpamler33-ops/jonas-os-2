# BIGGJ Multi-System Architecture V1

## Objective
Split BIGGJ into fault-contained systems without a big-bang rewrite. Preserve one PIT/evidence truth layer and immutable shadow-only safety.

## Systems
1. **Control Plane** — health, scheduling, budgets, backpressure, incident aggregation.
2. **Data Plane** — acquisition, normalization, provenance, PIT persistence.
3. **Live Brain** — current regime/forecast/shadow decision path; deliberately small hot state.
4. **Research Lab** — replay, hypothesis tests, holdouts, failure mining, evidence generation.
5. **World Lab** — disposable parallel-world jobs with controlled mutations and information-gain scoring.
6. **Wallet Lab** — CONTROL vs EXPERIMENT epochs, LOCK/REJECT research, challenger-only rule isolation.
7. **Experience Plane** — Discord/Telegram/UI/translation. Never blocks core research or forecasting.

## Shared truth
Systems exchange IDs/envelopes and persist evidence through the existing research data plane. They must not create independent competing truth stores.

## Safety invariants
- SHADOW_ONLY
- ABSTAIN enabled
- canExecute=false
- canExecuteLive=false
- automatic production promotion=false

These invariants are asserted at system boundaries.

## Migration order
### Phase 0 — contracts (this change)
Introduce system identities, envelopes, budgets and supervisor. No production routing changes.

### Phase 1 — Research isolation
Move shadow competition, replay and autonomous research factory behind a research worker boundary. Use checkpointed chunks and persistent job state. A worker failure must not interrupt Data Plane or Live Brain.

### Phase 2 — World isolation
Run worlds as disposable jobs. Persist only inputs, mutation, evidence and result. Kill redundant/zero-information worlds early.

### Phase 3 — Experience isolation
Move Discord/translation sync away from the core runtime. 429/timeouts degrade only Experience Plane.

### Phase 4 — Wallet isolation
Wallet epochs consume immutable outcomes and publish challenger research decisions. LOCKs may affect only the challenger lane.

### Phase 5 — Data/Live Brain separation
Keep hot market state and current forecasts in Live Brain; historical data remains warm/cold and demand-loaded from Data Plane.

## Scheduling objective
Prefer work by expected information gain divided by resource cost. Noncritical work with zero expected information gain is not scheduled. Critical Data/Live Brain capacity is protected before Research/World/UI capacity.

## Definition of success
- Research memory pressure cannot stop Live Brain or Data Plane.
- UI/translation failures cannot affect evidence production.
- Every research job is checkpointable/restartable/idempotent.
- One evidence truth layer remains authoritative.
- Per-system memory, queue depth, evidence delta and information gain are observable.
- Safety invariants remain fail-closed across every boundary.
