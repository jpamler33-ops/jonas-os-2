# Mobile trading visibility

The mobile Trading view deliberately separates primary shadow performance from non-primary research activity.

Research modes are `CHALLENGER`, `ABSTAIN_PROBE`, `COVERAGE_PROBE`, and `EXPLORATION`. Their PnL is shown separately and must not be merged into primary performance.

The Discovery Pipeline surfaces scan, forecast, admission, calibration, candidate, trade, and coverage counts plus the dominant blocker and runtime gates.

Safety invariants remain unchanged: `SHADOW_ONLY`, `ABSTAIN`, `canExecuteLive:false`. No exchange order submission is enabled by this UI change.
