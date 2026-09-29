# BIGGJ Trading Constitution V1

Status: TRADING SUBSYSTEM POLICY  
Parent architecture: **TCX_RESEARCH_OS_CANON_V1**  
Execution: SHADOW_ONLY  
Real-money execution: BLOCKED

This document governs only the downstream trading subsystem. It does not override the TCX Research OS. Market truth, provenance, evidence quality, disagreement, uncertainty, invalidation, audit and promotion are decided by the upstream Research OS contract first.

## 1. Purpose

BIGGJ must not be a collection of independent indicators. It must be one deterministic decision system that can explain:

1. What market state exists?
2. Which strategy family is valid in that state?
3. Why is a trade admitted or rejected?
4. What exactly invalidates the thesis?
5. Why is an open trade held, protected, trailed or exited?
6. Was the decision good independently of the final PnL?
7. What is allowed to change after learning and what must remain frozen?

The central rule is:

**A forecast horizon is a thesis review horizon, not an automatic exit timer.**

A 5m execution chart never implies a 5m holding period.

## 2. Non-negotiable invariants

- Point-in-time data only.
- No future leakage.
- Missing critical evidence means ABSTAIN, never synthetic certainty.
- PRIMARY, RESEARCH_PROBE and CHALLENGER results remain separated.
- Every admission and lifecycle action is reproducible from frozen inputs.
- Every rule change receives a version and forward shadow evaluation.
- No threshold may be promoted only because it improves historical PnL.
- SHADOW_ONLY, canExecuteLive:false, real exchange order submission blocked.

## 3. Timeframe roles

| Layer | Default timeframe | Job |
|---|---:|---|
| Context | 4h | dominant market environment |
| Regime | 1h | trend/chop/volatility/liquidity state |
| Setup | 15m | pullback, range edge, breakout/retest structure |
| Trigger | 5m | actual entry confirmation |
| Micro execution | 1m / order book | fill quality only; never defines the thesis |

The chart displayed in Discord can be 5m while the selected thesis horizon is 1h or 3h.

## 3.1 Trading style is separate from strategy

BIGGJ must choose **how long and how locally it wants to trade** before choosing the setup family.

### SCALP
- Context: 15m / 5m
- Trigger: 1m / 5m
- Typical hold: 3–45 minutes
- Highest weight: spread, executable depth, order-book imbalance, liquidity sweeps, short-term flow
- Valid examples: SCALP + LIQUIDITY_SWEEP_REVERSAL, SCALP + BREAKOUT_RETEST

### INTRADAY
- Context: 1h / 15m
- Trigger: 5m
- Typical hold: 30 minutes–6 hours
- Highest weight: 1h/15m structure, forecast, regime, flow, derivatives context
- Valid examples: INTRADAY + TREND_CONTINUATION, INTRADAY + BREAKOUT_RETEST

### SWING
- Context: 4h / 1h
- Trigger: 15m / 1h
- Typical hold: 4 hours–3 days
- Highest weight: higher-timeframe structure, regime persistence, broader forecast, macro/on-chain context
- Micro order-book noise must not close a swing thesis by itself.
- Valid examples: SWING + TREND_CONTINUATION, SWING + RANGE_MEAN_REVERSION

Breakout, trend continuation, mean reversion and liquidity-sweep reversal are **strategy/setup families**, not holding styles. BIGGJ learns the performance of the pair `style × strategy × regime`.

Before every PRIMARY entry BIGGJ must complete a market preflight:

1. multi-timeframe structure,
2. current regime,
3. nearest support/resistance and swing liquidity,
4. executable order-book depth/spread,
5. likely sweep/stop-liquidity areas,
6. observed liquidation clusters,
7. forecast direction and uncertainty,
8. flow / taker pressure,
9. open-interest/funding context,
10. on-chain / macro context when available,
11. data trust and freshness,
12. portfolio exposure and correlation.

Only after the preflight may BIGGJ choose a style, a strategy family, an entry method and a hold plan.

## 4. Primary strategy families

### TREND_CONTINUATION
Primary when higher-timeframe direction is aligned and the setup timeframe pulls back without invalidating structure.

Required:
- 4h/1h not materially opposed.
- 15m pullback or reclaim into existing trend structure.
- 5m trigger confirms continuation.
- Forecast direction agrees.
- No immediate structural obstacle that destroys minimum R:R.

### BREAKOUT_RETEST
Primary when a meaningful 15m/1h level is broken and retested with confirmation.

Required:
- closed-candle break, not only wick.
- retest holds.
- liquidity is executable.
- forecast and regime do not materially oppose the break.

### RANGE_MEAN_REVERSION
Primary only in a verified CHOP/RANGE regime.

Required:
- entry near a defined range boundary.
- sweep/rejection or reclaim confirmation.
- target toward range interior/opposite side.
- no active expansion regime.

### LIQUIDITY_REVERSAL
Research/Challenger by default until enough forward evidence exists.

### MEME_MOMENTUM
Separate policy. Requires stronger probability/edge, stricter liquidity and smaller risk budget. It is never allowed to contaminate CORE performance statistics.

## 5. Forecast horizon policy

CORE primary trades:
- minimum eligible horizon: 60m
- maximum selected forecast horizon: 3h
- maximum total hold: 6h

MEME primary trades:
- minimum eligible horizon: 15m
- maximum selected forecast horizon: 1h
- maximum total hold: 2h

Selection:
1. only PASS + CALIBRATED + directional horizons,
2. apply the asset-class horizon window,
3. select the strongest probability edge,
4. tie-break by absolute expected return,
5. tie-break again by the shorter horizon.

If no horizon survives, BIGGJ abstains. It must not fall back to a tiny horizon merely to force a trade.

## 6. Entry admission

### Hard blockers

PRIMARY entry is impossible when any of these applies:

- data safety is not NORMAL,
- critical market data is stale or quarantined,
- no calibrated eligible forecast horizon,
- forecast direction is not UP/DOWN,
- structure has no defined invalidation,
- executable liquidity is insufficient,
- portfolio-risk brain blocks the exposure,
- setup-memory marks the exact cohort DECAYING/AVOID,
- minimum R:R is below 1.5,
- evidence coverage is below 70%.

Initial minimum forecast gates:

CORE:
- directional probability >= 0.58
- probability edge >= 0.10
- absolute expected return >= 0.003

MEME:
- directional probability >= 0.62
- probability edge >= 0.14
- absolute expected return >= 0.005

These are V1 research defaults, not claims of optimality.

### Entry evidence vector

BIGGJ keeps the components visible instead of hiding everything in one confidence number.

Weights:
- forecast edge: 25%
- structure quality: 20%
- regime fit: 15%
- flow confirmation: 10%
- liquidity quality: 10%
- learned setup memory: 10%
- risk/reward quality: 5%
- data trust: 5%

Unknown optional components reduce evidence coverage.

Initial admission:
- score >= 0.70 and coverage >= 0.70 -> PRIMARY candidate
- score 0.58–0.70 -> RESEARCH/CHALLENGER only
- score < 0.58 -> ABSTAIN
- counter-thesis strength > 0.55 -> PRIMARY blocked regardless of score

A setup classified C is research-only. A/B may enter PRIMARY when all hard gates pass.

## 7. Invalidation and stop construction

The stop is not derived only from expected return.

Primary stop distance is based on:
1. structural invalidation level,
2. volatility floor,
3. executable-market constraints.

Conceptually:

stopDistance = max(structureDistance, volatilityFloor)

The candidate is rejected when the required stop is so wide that portfolio/risk constraints or minimum R:R fail.

Hard price stop remains immediate.

Structural thesis invalidation requires either:
- two consecutive closed 5m candles beyond the invalidation level, or
- one closed 15m candle beyond it,

unless the move exceeds a catastrophic threshold where waiting for confirmation would be nonsensical.

## 8. Target construction

Target order:
1. next meaningful structure/liquidity objective,
2. next higher-timeframe level,
3. forecast expected-move zone as secondary reference.

Target is a zone, not a magical exact price.

PRIMARY requires planned R:R >= 1.5 before entry.

Reaching the target does not automatically mean immediate exit if the thesis is still strong; it changes the trade into PROFIT_PROTECTION / RUNNER mode.

## 9. Position lifecycle

Possible actions:

- HOLD
- PROTECT
- TRAIL
- REVIEW
- EXIT
- DATA_FREEZE

Priority is deterministic.

### Immediate EXIT
1. executable hard stop reached,
2. confirmed structural invalidation,
3. thesisHealth <= 0.30 and oppositeThesis >= 0.65,
4. maximum total hold reached.

### Profit protection
- >= 55% of planned target: breakeven protection may activate.
- >= 80% of planned target: profit-lock trail may activate.
- target reached + thesis still strong: TRAIL/RUNNER.
- target reached + thesisHealth < 0.65: EXIT as TARGET_THESIS_EXHAUSTED.
- after target, material MFE giveback is an exit signal.

### Horizon review
At selected forecast horizon:

- thesisHealth >= 0.65 and oppositeThesis <= 0.45 -> HOLD/EXTEND.
- thesisHealth 0.45–0.65 -> REVIEW, tighten protection if profitable.
- thesisHealth < 0.45 -> EXIT if executable.

**There is no unconditional HORIZON_EXIT for PRIMARY trades.**

Coverage probes may continue to use exact horizon exits because their scientific purpose is fixed-horizon measurement.

## 10. Thesis health

Thesis health is recalculated from point-in-time evidence only.

Core components:
- forecast still aligned,
- structure still valid,
- regime still compatible,
- flow has not materially reversed,
- liquidity remains healthy,
- counter-thesis strength,
- distance from invalidation,
- target progress.

Re-evaluation cadence:
- lightweight check on each closed 5m candle,
- full thesis refresh on each closed 15m candle,
- mandatory full review at the selected forecast horizon.

One noisy 5m candle must not close a 1h thesis by itself.

## 11. Risk budget

V1 PRIMARY should be scientifically clean.

Baseline:
- CORE shadow risk budget: 0.35% of shadow equity per trade.
- MEME shadow risk budget: 0.20%.
- quality, drawdown and portfolio-concentration multipliers may only reduce or modestly increase within explicit caps.
- position notional is derived from risk budget / stop distance.
- portfolio caps remain enforced after sizing.

Leverage:
- PRIMARY baseline starts at 1x.
- leverage experiments belong in separate challenger/counterfactual lanes until forward evidence is sufficient.
- leverage results must never be mixed with the unlevered baseline when measuring strategy edge.

## 12. Data degradation behavior

No fresh trusted data:
- block new entries,
- do not invent a new thesis,
- preserve the last verified thesis state,
- continue only risk controls that can be evaluated from a trusted executable book,
- if exit liquidity is not verifiable, fail closed and do not fabricate an exit price.

## 12.1 Mandatory decision rationale and reverse engineering

Every PRIMARY trade freezes a decision record at entry containing:

- selected trading style,
- selected strategy family,
- market state and timeframe alignment,
- preferred entry method (limit/retest vs confirmation),
- expected liquidity-sweep path,
- invalidation,
- target,
- expected hold range,
- evidence supporting entry,
- counter-evidence known at entry,
- data-source availability,
- policy/model fingerprints.

After exit BIGGJ must reverse-engineer the trade without rewriting history:

- What did it predict correctly?
- What did it predict incorrectly?
- Which known factors were associated with similar wins/losses before this trade?
- Which factors only became visible after entry?
- Did MFE/MAE indicate poor timing?
- Did it exit too early or give back too much MFE?
- Would a shorter or longer hold have performed better using point-in-time executable marks?
- Was the strategy wrong, or was the style/horizon wrong?
- Did the entry rationale ignore counter-evidence?
- Is the observed pattern repeatable enough to create a challenger?

Post-hoc association is not causal proof. A newly discovered rule cannot alter PRIMARY policy directly. It becomes a **CHALLENGER_ONLY** experiment and needs forward samples, chronological stability, cost stress, winner-removal stress and concentration checks before promotion.

## 13. Learning loop

After every closed PRIMARY trade, store:

- strategy family,
- all entry evidence components,
- selected horizon and why,
- frozen invalidation and target,
- regime fingerprint,
- forecast fingerprint,
- lifecycle actions over time,
- MFE / MAE,
- realized result,
- decision quality,
- exit reason,
- counterfactual outcomes for alternative horizons.

Learning questions:
- Was the entry wrong?
- Was the thesis right but timing poor?
- Was the stop too tight?
- Was the exit premature?
- Was a profitable trade held too long?
- Did a specific regime/strategy cohort decay?

Outcome and decision quality must remain separate.

## 14. Promotion rules

A new rule starts as CHALLENGER.

It can influence PRIMARY only after:
- minimum forward samples,
- chronological stability,
- positive recent expectancy,
- cost stress,
- winner-removal stress,
- symbol/regime concentration checks,
- no material edge decay.

A rule is demoted when recent forward evidence degrades.

## 15. Immediate implementation order

Phase 1:
- central BIGGJ trading policy module,
- proper primary horizon selection,
- remove unconditional PRIMARY HORIZON_EXIT,
- preserve fixed-horizon exits for coverage probes,
- lifecycle reason codes and tests.

Phase 2:
- strategy-family router,
- structural invalidation engine,
- thesis-health recomputation,
- structure/volatility stop and target engine.

Phase 3:
- risk-based sizing,
- exact lifecycle timeline,
- Discord visual explanation for every HOLD/PROTECT/TRAIL/EXIT.

Phase 4:
- forward evaluation, challenger promotion and policy versioning.

This constitution is the source of truth for future BIGGJ trading changes.
