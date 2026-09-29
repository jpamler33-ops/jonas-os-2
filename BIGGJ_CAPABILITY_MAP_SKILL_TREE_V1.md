# BIGGJ Capability Map + Self-Evolving Skill Tree V1

Status: CANONICAL RESEARCH FOUNDATION  
Parent architecture: TCX Research Operating System  
Execution: SHADOW_ONLY  
Live execution authority: NONE

## 1. Mission

The external mission is to build a system capable of supporting a path toward **€100,000 by 25 December 2027**.

This is not a profit guarantee and it is not the optimization function.

Starting capital, future liquidity, market regime and achievable return are not assumed. Therefore BIGGJ must not chase the target by increasing risk when evidence is weak.

The internal optimization objective is:

**sustained risk-adjusted expectancy + capital preservation + calibration + controlled scalability + knowledge gain**

The €100k target is a mission constraint used to ask:
- Which capabilities are missing?
- Which edges can scale?
- Which edges are too capacity-limited?
- Which risks can destroy compounding?
- Which research has the highest expected information value?

## 2. The key change

BIGGJ must not merely optimize parameters inside rules written by us.

It must be able to ask whether a rule is wrong.

Example:

A fixed rule closes trades after two candles.

BIGGJ observes:
- many trades are closed by the same timer,
- thesis health is still high,
- MFE frequently occurs later,
- alternative point-in-time hold paths outperform,
- the same failure repeats across independent episodes.

The correct response is not:
> execute the timer more accurately.

The correct response is:
> the current exit policy may be systematically destroying information and expectancy. Create a falsifiable adaptive-hold challenger.

That challenger remains isolated until forward shadow evidence supports promotion.

## 3. Skill-tree states

Every capability or discovered skill lives in one state:

**UNKNOWN → DISCOVERING → LEARNING → TESTING → VALIDATED → TRUSTED**

A skill can also become:

**DECAYING → revalidate / demote / retire**

TRUSTED does not mean causal truth or permanent edge. It means the skill has passed the current evidence and promotion standard.

No skill can jump directly from discovery to production behavior.

## 4. What a skill node contains

A discovered skill requires:

- parent skill,
- research question,
- falsifiable hypothesis,
- explicit falsifier,
- dependencies,
- strategic impact,
- uncertainty,
- epistemic evidence,
- independent episode count,
- point-in-time status,
- audit status,
- scientific guard status,
- forward-shadow samples,
- cost stress,
- winner-removal stress,
- chronological stability,
- concentration checks,
- promotion history,
- decay state.

A new child node is a **research proposal**, not a trading rule.

## 5. Root capability domains

### Market Truth
Can BIGGJ reconstruct exactly what was knowable at the time?

Skills include PIT clocks, replay, regime memory, change points and pattern half-life.

### Evidence Intelligence
Can BIGGJ identify provenance, dependence, trust, contradictions and missing coverage?

Skills include provenance chains, source trust, independence, common-cause guards, disagreement and coverage gaps.

### Mechanism Intelligence
Can BIGGJ form mechanisms rather than treating correlation as explanation?

Skills include forced flow, liquidity elasticity, reflexivity, cascades, absorption, constraints and identifiability.

### Forecast Intelligence
Can BIGGJ produce calibrated, revisable, falsifiable forecasts?

Skills include multi-horizon forecasts, calibration, plausible paths, adaptive intervals, analogues, revision and counterfactuals.

### Failure / Uncertainty
Can BIGGJ know when it should not trust itself?

Skills include uncertainty decomposition, ABSTAIN, failure discovery, unknown-unknown probes and negative knowledge.

### Trading Style Intelligence
Can BIGGJ decide how this market should be traded, if at all?

Initial styles:
- SCALP
- INTRADAY
- SWING

Styles are not strategies.

### Setup / Strategy Intelligence
Can BIGGJ choose the actual mechanism/setup inside a style?

Initial families:
- Trend Continuation
- Breakout Retest
- Range Mean Reversion
- Liquidity Sweep Reversal
- Momentum Expansion
- Meme Momentum

The unit of learning is often:

style × strategy × regime × asset class × evidence state

not merely strategy.

### Execution / Microstructure
Can BIGGJ decide where and how a shadow entry should occur?

Skills include liquidity maps, sweeps, limit entries, confirmation entries, routing, slippage and toxicity.

### Position Lifecycle
Can BIGGJ decide whether the thesis deserves more or less time?

Skills include adaptive hold duration, structural invalidation, profit protection, runner management and exit regret.

### Portfolio / Risk
Can BIGGJ scale only what deserves capital?

Skills include risk-based sizing, correlation, drawdown control, tail stress and edge-based allocation.

### Multi-Market Intelligence
Can BIGGJ combine distinct market domains without destroying provenance?

Domains include derivatives, liquidations, on-chain, verified entity flow, macro/events and narratives.

### Learning / Reverse Engineering
Can BIGGJ learn from every result without rewriting history?

Skills include post-trade reverse engineering, MFE/MAE, factor interactions, counterfactual replay, decision quality vs outcome and opportunity-loss memory.

### Autonomous Research
Can BIGGJ discover what it needs to learn next?

Skills include self-questioning, hypothesis generation, experiment design, capability-gap discovery, child-skill discovery and information-value prioritization.

### Promotion / Governance
Can BIGGJ improve without silently mutating itself?

Skills include versioned candidates, forward shadow promotion, robustness tests, decay demotion and rollback.

### Explainability / Operator
Can a human inspect what BIGGJ knows, does not know and is testing?

Skills include Living Thesis, WHY NOW, WHY NOT TRADE, research trace and Skill Tree views.

## 6. Autonomous research loop

The research loop is:

1. Observe current evidence and outcomes.
2. Compare actual outcome with forecast and decision trace.
3. Measure residual error.
4. Detect repeated failure, contradiction, opportunity loss or unexplained variance.
5. Ask a research question.
6. Determine whether the question belongs to an existing skill.
7. If not, propose a child skill.
8. Form a falsifiable hypothesis.
9. Define the falsifier before testing.
10. Identify required data and dependencies.
11. Run replay only for discovery.
12. Create a forward-shadow challenger.
13. Accumulate independent episodes.
14. Stress costs, chronology, concentration and winner dependence.
15. Validate or reject.
16. Promote only through versioned governance.
17. Continue monitoring for decay.

This loop never grants itself permission to modify PRIMARY directly.

## 7. Self-questioning examples

BIGGJ should be able to generate questions such as:

- Why did my 5m trigger correctly identify direction but my exit captured only 20% of MFE?
- Does a sell-side sweep followed by OI expansion add information beyond the sweep alone?
- Is the apparent edge actually caused by the 1h regime?
- Why does this setup work on BTC but decay on SOL?
- Is order-book imbalance useful for swing trades or only noise?
- Does waiting for a limit improve expectancy after fees, or merely reduce fill rate?
- Why are high-confidence forecasts wrong specifically during volatility transitions?
- Are two evidence sources actually the same upstream feed?
- Did a new feature improve calibration or only increase trade count?
- Which missing observation would reduce uncertainty the most?
- What evidence would make me abandon this strategy entirely?

## 8. Research priority

BIGGJ should not research everything equally.

Priority should increase with:

- strategic impact,
- uncertainty,
- evidence deficit,
- repeated failure,
- opportunity loss,
- dependency centrality,
- potential to falsify a major assumption,
- expected information gain.

Priority should decrease with:

- redundant information,
- weak scalability,
- excessive data cost,
- low decision impact,
- already mature evidence.

The research planner may recommend work. It may not bypass the promotion system.

## 9. Reverse engineering

Every closed trade and matured forecast should generate a retrospective audit.

Questions include:

- What did BIGGJ know before the decision?
- What did it infer?
- What did it model?
- What did it assume?
- Which prediction was correct?
- Which prediction was wrong?
- Was direction wrong, timing wrong, or lifecycle wrong?
- Which counter-evidence existed but was underweighted?
- What changed first?
- What would have happened at alternative hold horizons?
- Would a limit entry have improved the result?
- Did the trade experience large MFE before losing?
- Was the loss caused by thesis failure or execution?
- Did the same factor combination occur in earlier episodes?
- Is the relationship still present prospectively?

Retrospective findings remain post-hoc until forward validated.

## 10. The 150-idea migration

The historical ~150 BIGGJ ideas should not be restored as a flat backlog.

Each idea will be imported as one of:

- root capability,
- seeded capability,
- discovered child skill,
- research question,
- evidence source,
- scientific guard,
- challenger experiment,
- operator view,
- redundant idea to merge,
- obsolete idea to retire.

For every idea we will record:

- target capability,
- dependency,
- current implementation,
- missing pieces,
- maturity,
- evidence,
- priority,
- whether it is required for the €100k mission,
- whether another idea already solves the same problem.

This converts the historical idea list into a living architecture instead of another feature checklist.

## 11. Safety boundary

BIGGJ can autonomously:

- identify gaps,
- ask questions,
- generate hypotheses,
- propose new skills,
- design experiments,
- run shadow challengers,
- analyze results,
- recommend promotion,
- detect decay.

BIGGJ cannot autonomously:

- rewrite historical evidence,
- relabel assumptions as observations,
- bypass PIT,
- disable scientific guards to create more trades,
- silently alter PRIMARY,
- skip forward validation,
- claim causal certainty from post-hoc association,
- enable live-money execution.

## 12. Definition of progress

Progress is not measured by number of features or trades.

Progress means that over time BIGGJ has:

- fewer unexplained errors,
- better calibrated forecasts,
- lower avoidable opportunity loss,
- clearer negative knowledge,
- better regime-specific strategy selection,
- more reproducible decisions,
- stronger forward evidence,
- fewer hidden dependencies,
- better uncertainty estimates,
- more stable risk-adjusted expectancy,
- a larger set of validated skills,
- a smaller set of critical unknowns.

That is the intended self-evolving TCX skill tree.
