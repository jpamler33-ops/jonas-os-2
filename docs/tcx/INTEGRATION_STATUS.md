# TCX Institutional Integration Status

Branch: `integration/tcx-institutional-v3`

## Staged and green

- institutional standard and target architecture
- Master / Forecast / Alpha.30 merge audit
- Forecast Specialist v2.3.1 runtime
- Episode Memory PIT maturity hardening
- forecast integration regression guards
- canonical `forecast-contract.mjs`
- immutable `research-trace.mjs`
- strict `scientific-validity.mjs`
- Alpha.30 empirical-support guard adaptation
- Alpha.30 research-integrity / adaptive-holdout guard adaptation
- cross-guard scientific-core integration tests
- integration-branch / PR CI

Latest verified integration gate:
```text
commit: 8ef07028b0934034d70eced19f3ad51fdf3df20a
GitHub Actions: SUCCESS
root tests + science-runtime tests: PASS
syntax gate: PASS
```

## Important boundary

Nothing on this branch is production-canonical on `main` yet.

The branch is intentionally acting as an institutional staging environment so forecast/science changes cannot destabilize the running canonical master before their contracts and gates are complete.

## Current architecture achieved

```text
MASTER TEMPORAL / SAFETY TRUTH
        ↓
Forecast Specialist Runtime
        ↓
Canonical Forecast Contract
        ↘
          Scientific Validity Aggregator
        ↗
Alpha.30 Support + Research Integrity
        ↓
Research Trace
        ↓
future Institutional admission + product views
```

## Next

1. adapt Alpha.30 concept-stability + nonlinear-stability guards
2. adapt temporal-recency + sequential-evidence guards
3. add unified Institutional admission gate
4. bind canonical forecast + scientific validity to Research Trace
5. include staged modules in Runtime Release Registry
6. expose forecast UI only after the admission path is fully gated
