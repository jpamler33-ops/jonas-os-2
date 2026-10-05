# JONAS_CLONE_V1 — P0

Highest-priority BIGGJ trading-research track until baseline evidence is sufficient.

## Invariants
- SHADOW_ONLY
- canExecuteLive=false
- no automatic mutation of the immutable baseline
- 4 SOL / $10k liquidity is a research hypothesis, not a live-safe sizing rule

## Baseline
Ultra-early trend-feed candidate, <=60s old, >=$99k market cap. Liquidity-proportional research sizing is observed at 4 SOL per $10k liquidity. Normal loss exits are not evaluated before 180s. Every candidate is measured at 1/2/3/4/5/10 minutes with explicit 3/4/5/10 minute exit comparisons.

## Required telemetry
Age, market cap, liquidity, size, entry, fees, price impact, MFE, MAE, liquidity decay, exit liquidity, hold time, gross/net PnL and exit reason.

## Research sequence
1. Reproduce the baseline.
2. Compare autonomous shadow trades against manual ground truth.
3. Quantify simulation-vs-executable slippage/impact gap.
4. Run variants in parallel without modifying baseline.
5. Promote only evidence-backed improvements to a new version; never silently rewrite V1.
