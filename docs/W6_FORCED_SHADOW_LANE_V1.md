# W6 Forced Shadow Lane V1

## Goal
Collect counterfactual evidence for the observed W6 setup even when normal BIGGJ research/trading gates reject the candidate, without changing those gates and without creating any execution authority.

## Immutable safety
- SHADOW_ONLY
- ABSTAIN remains valid
- canExecute=false
- canExecuteLive=false
- no wallet signing
- no transaction construction/broadcast
- no real orders or real-money execution
- no automatic production promotion
- this lane must never mutate the primary strategy/rulebook

## Candidate flow
For each candidate matching the existing W6 detector, fork evaluation into two lanes:

1. CONTROL: existing BIGGJ Candidate -> Gates -> Shadow path, unchanged.
2. W6_FORCED_SHADOW: record the same candidate and force only creation of a simulated shadow observation, irrespective of CONTROL gate rejection.

A CONTROL rejection is retained as evidence and MUST NOT be rewritten to PASS.

## Required record
Each forced-shadow observation must include:
- candidateId / mint / symbol where available
- detectedAt and simulatedEntryAt
- candidate age at detection
- observed market cap and liquidity
- source/feed provenance
- CONTROL gate decisions and rejection reasons
- W6 detector/rule version
- simulated notional bucket
- observed entry price
- modeled fees and slippage
- fill-quality/confidence flag
- evidence fingerprint and point-in-time cutoff
- lane=W6_FORCED_SHADOW
- canExecute=false / canExecuteLive=false

## Outcome windows
Resolve counterfactual outcomes at 1m, 3m, 5m and 10m where point-in-time data exists. Record PnL after modeled fees/slippage, MFE, MAE, liquidity change, market-cap change, exit fill quality, and invalid/missing-data reasons.

Never fabricate a fill. If entry price/liquidity evidence is insufficient, emit ABSTAIN/UNFILLABLE for that observation.

## Experiment design
Compare CONTROL vs W6_FORCED_SHADOW on identical candidate IDs. Report sample count, fillable count, win rate, expectancy, profit factor, drawdown proxy, MFE/MAE, rejection-reason attribution, and outcomes by notional/liquidity bucket. Win rate alone must never trigger a rule change.

## Promotion isolation
Evidence from this lane is research-only. It may generate a challenger hypothesis but cannot modify CONTROL, primary rules, production thresholds, wallets, or execution permissions. Any later rule change requires the existing independent promotion/evidence process.

## Acceptance tests
- CONTROL behavior is byte-for-byte/semantically unchanged for the same fixture.
- A W6 match rejected by CONTROL still creates a simulated W6_FORCED_SHADOW observation.
- Non-W6 candidates never enter the forced lane.
- No real execution function is reachable from the lane.
- Missing/unsafe fill evidence produces ABSTAIN/UNFILLABLE rather than invented PnL.
- Duplicate candidate IDs are idempotent.
- Outcome resolution is PIT-safe and restart-safe.
- CONTROL rejection reasons remain intact.
- Safety invariants remain false for execution before and after evaluation.
