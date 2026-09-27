# TCX Institutional Integration Status

Branch: `integration/tcx-institutional-v3`

## Staged

- institutional standard and target architecture
- master/forecast/Alpha.30 merge audit
- Forecast Specialist v2.3.1 runtime imported through staging PR #1
- Episode Memory PIT maturity hardening from forecast integration
- forecast integration regression guards
- integration-branch / PR CI trigger

## Not yet canonical on main

Nothing on this branch is production-canonical until the integration gate passes and the branch is reviewed for merge to `main`.

## Next

1. obtain green root + forecast integration CI
2. introduce canonical forecast contracts/adapters
3. stage Alpha.30 scientific-validity core behind isolated interfaces
4. build unified Research Trace
5. only then expose forecast views in Telegram
