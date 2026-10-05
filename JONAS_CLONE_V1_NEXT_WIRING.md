# P0 runtime wiring sequence

1. Existing W6 candidate scheduler calls `jonasCloneCandidateToShadowIntent(candidate)` before lower-priority research paths.
2. Eligible intents open/observe W6 shadow positions only; no live execution path may consume the intent.
3. Runtime tick persistence records 1/2/3/4/5/10 minute checkpoints plus fees, impact, MFE/MAE, liquidity decay and exit liquidity.
4. Close evaluator records comparable hypothetical exits at 3/4/5/10 minutes while preserving the baseline path.
5. Metrics compare autonomous clone cohorts with manually supplied ground-truth trades.
6. Other research remains secondary and cannot mutate V1 baseline parameters.
