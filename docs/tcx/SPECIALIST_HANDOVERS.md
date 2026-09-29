# TCX Specialist Handovers

Status: CANONICAL HANDOVER INDEX

A specialist handover is an integration candidate, not a source of truth.

## Required handover format

Each specialist should provide:

```text
SPECIALIST
MISSION
BASE COMMIT / BASELINE
FILES ADDED
FILES MODIFIED
PUBLIC INTERFACES
DATA CONTRACTS
PERSISTENCE CHANGES
INVARIANTS
TESTS
KNOWN LIMITATIONS
OVERLAP RISKS
INTEGRATION ORDER
OPEN QUESTIONS
RECOMMENDED KEEP / MERGE / REWRITE AREAS
```

Prefer a compact repository state file or merge pack over a giant chat transcript.

## Current specialist candidates

### Forecast Specialist

Mission:
probabilistic multi-horizon forecasting, uncertainty, analogues, calibration, drift, plausible paths, live revision, invalidation and counterfactual explanation.

Status:
`CANDIDATE FOR INTEGRATION`

Important:
current `main` already has forecast-like grammar/world-model/calibration/drift functionality. Integration must therefore be component-level, not a blind copy.

### Forecast Self-Correction

Status:
`NOT YET APPROVED`

Required before approval:
- overlap check
- no-lookahead audit
- calibration semantics review
- lifecycle compatibility
- failure-mode tests

## Integration rule

The master integrator decides per component:

```text
KEEP MASTER
KEEP SPECIALIST
MERGE
REWRITE
DEPRECATE
```

After integration, record the result in `MODULE_REGISTRY.md` and the architectural reason in `DECISIONS.md`.
