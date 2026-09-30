# BIGGJ Historical Proposal Research Gate V1

Status: GOVERNED RESEARCH PLANNING  
Parent: BIGGJ Historical Idea Migration V1  
Execution: SHADOW_ONLY  
Live execution authority: NONE

## 1. Purpose

The historical migration recovered 344 source ideas and reduced them to 151 semantic targets.

Most historical ideas are already represented by the current architecture, belong to operator/infrastructure surfaces, are simulation-only, or are retired from BIGGJ market core.

Fifteen ideas remain genuinely distinct enough to preserve as new research proposals.

This gate turns those fifteen ideas into explicit scientific contracts before any implementation begins.

The gate answers:

> What exactly would this idea need to demonstrate before BIGGJ should spend engineering and forward-shadow capacity on it?

## 2. No automatic promotion

A historical idea is not evidence.

A high research-priority score is not evidence.

A proposal with strong architectural leverage is not evidence.

The output of this module is therefore always:

```
execution: SHADOW_ONLY
action: ABSTAIN
canExecuteLive: false
automaticImplementation: false
automaticPromotion: false
```

## 3. Required research contract

Every surviving historical proposal now requires:

1. research question,
2. falsifiable hypothesis,
3. explicit falsifier,
4. canonical dependencies,
5. proposal-to-proposal dependencies,
6. required data,
7. strong baselines,
8. point-in-time requirements,
9. scientific guards,
10. forward-shadow design,
11. kill criteria,
12. strategic-impact estimate,
13. expected information-value estimate,
14. falsifiability estimate,
15. data-readiness estimate,
16. generality estimate,
17. complexity-cost estimate.

A proposal with no credible falsifier or kill criteria does not qualify as a research program.

## 4. Research-priority heuristic

The planning score is:

```
0.22 × parent dependency leverage
+ 0.22 × information value
+ 0.18 × generality
+ 0.15 × falsifiability
+ 0.13 × data readiness
+ 0.10 × strategic impact
- 0.12 × complexity cost
```

The score is explicitly classified as:

`MODELLED_RESEARCH_PLANNING_HEURISTIC_NOT_EVIDENCE`

The coefficients are planning assumptions.

They are not empirically validated market parameters and must not be interpreted as probabilities.

## 5. Current research order

Implementation-ready proposals are placed before proposals whose prerequisite research proposals are incomplete.

Current order:

| Rank | Proposal | Research priority | Implementation ready | Parent |
|---:|---|---:|---|---|
| 1 | CLAIM_ASSUMPTION_GRAPH | 0.903 | yes | PROVENANCE_CHAIN |
| 2 | LEAVE_ONE_OUT_ROBUSTNESS | 0.731 | yes | SCIENTIFIC_GUARD_ORCHESTRATION |
| 3 | CAUSAL_EPISODE_MEMORY | 0.669 | yes | POST_TRADE_REVERSE_ENGINEERING |
| 4 | GOVERNED_EXPERIMENT_BLUEPRINTS | 0.648 | yes | EXPERIMENT_DESIGN |
| 5 | MECHANISM_ENSEMBLE | 0.632 | yes | IDENTIFIABILITY |
| 6 | PRICE_TIME_CONSTRAINT_SURFACE | 0.594 | yes | CONSTRAINT_MAP |
| 7 | LATENT_MARKET_ENERGY | 0.585 | yes | FORCED_FLOW |
| 8 | REFLEXIVITY_WITNESS_ENSEMBLE | 0.544 | yes | REFLEXIVITY |
| 9 | MEME_RUG_RISK_INTELLIGENCE | 0.461 | yes | MEME_MOMENTUM |
| 10 | INTERVENTION_VALUE_MAP | 0.636 | no | INFORMATION_VALUE_PRIORITIZATION |
| 11 | RESEARCH_POLICY_GENOME | 0.632 | no | VERSIONED_CANDIDATES |
| 12 | MECHANISM_POSTERIOR_GRAPH | 0.582 | no | IDENTIFIABILITY |
| 13 | MINIMUM_CASCADE_TRIGGER | 0.480 | no | CASCADE_DYNAMICS |
| 14 | CASCADE_BASIN | 0.442 | no | CASCADE_DYNAMICS |
| 15 | ABSORPTION_RESERVE | 0.425 | no | ABSORPTION |

The numerical order inside blocked proposals is secondary to their dependency chain.

For example, INTERVENTION_VALUE_MAP has a high raw research score but is not implementation-ready because it depends on MECHANISM_POSTERIOR_GRAPH.

## 6. Recommended first research program — CLAIM_ASSUMPTION_GRAPH

### Why first

This proposal has an asymmetric architecture payoff.

Its parent, PROVENANCE_CHAIN, is one of the highest-leverage capabilities in the entire dependency graph.

A Claim-Assumption Graph can improve:

- evidence audits,
- forecast explanations,
- counter-thesis construction,
- assumption freshness,
- invalidation,
- mechanism identifiability,
- research trace quality,
- promotion audits,
- failure analysis.

It does not require speculative market physics.

It can be evaluated using research artifacts BIGGJ already produces.

Its engineering complexity is comparatively low.

### Research question

> Does explicitly linking material claims to assumptions expose hidden assumption load and improve audit/revision quality beyond a flat provenance trace?

### Hypothesis

A claim-to-assumption graph will detect unsupported or stale assumption dependence earlier and reduce unresolved audit defects versus a provenance-only baseline.

### Falsifier

Reject or simplify the proposal if preregistered replay and forward-shadow audits show no material lift in:

- unsupported-assumption detection,
- stale-assumption detection,
- revision precision,
- audit reproducibility,

after accounting for added complexity.

### Required inputs

- frozen decision traces,
- claims,
- explicit assumptions,
- evidence lineage,
- later revisions and invalidations.

### PIT rule

The original decision trace cannot be rewritten after the outcome.

Later-discovered assumptions may be added as retrospective findings, but they must not be backdated into the original state.

### Baselines

At minimum compare against:

- current flat provenance chain,
- manual assumption list.

### Kill criteria

Stop or simplify if:

- no incremental audit defects are found,
- false-positive assumption links are high,
- research/operator overhead exceeds measurable information gain,
- chronology cannot be preserved reliably.

## 7. Proposal dependency chains

Some historical ideas are scientifically meaningful but should not be implemented yet.

### Mechanism intelligence chain

```
MECHANISM_ENSEMBLE
      ↓
MECHANISM_POSTERIOR_GRAPH
      ↓
INTERVENTION_VALUE_MAP
```

Reason:

You cannot rationally ask which observation best discriminates mechanism uncertainty before you have explicit competing mechanisms and a representation of uncertainty over them.

### Cascade research chain

```
PRICE_TIME_CONSTRAINT_SURFACE
      ↓
MINIMUM_CASCADE_TRIGGER
      ↓
CASCADE_BASIN
      ↓
ABSORPTION_RESERVE
```

Reason:

A reserve estimate is meaningless if the cascade region and activation threshold have not first been defined and tested.

### Meta-research chain

```
GOVERNED_EXPERIMENT_BLUEPRINTS
      ↓
RESEARCH_POLICY_GENOME
```

Reason:

BIGGJ should not evolve research-policy candidates before the experiment/process representation itself is bounded, versioned and auditable.

## 8. Semantic safeguards on risky historical concepts

### LATENT_MARKET_ENERGY

"Energy" is only a model diagnostic.

It is not:

- physical energy,
- a probability,
- hidden observable capital,
- causal truth.

The diagnostic must show incremental OOS information beyond its component features.

### MECHANISM_POSTERIOR_GRAPH

A posterior over model stories is not a posterior over reality unless the model class is adequate.

Required guards include:

- prior sensitivity,
- shared-model ancestry,
- likelihood leakage,
- posterior overconfidence,
- model misspecification.

### MEME_RUG_RISK_INTELLIGENCE

No later "rug/scam" label may leak backward into features.

Unverified entity identities remain unverified.

The research lane remains separate from general meme-momentum evidence.

### GOVERNED_EXPERIMENT_BLUEPRINTS

The permitted concept is:

> bounded declarative experiment definitions.

The rejected concept is:

> arbitrary autonomous code self-modification.

### RESEARCH_POLICY_GENOME

The optimization surface may include bounded research scheduling/policy parameters.

It may not include:

- disabling PIT,
- weakening scientific guards,
- enabling live orders,
- removing audit,
- silently mutating PRIMARY.

## 9. Kill-before-build principle

The purpose of these contracts is not to make every historical idea survive.

A strong research system should be able to kill attractive ideas cheaply.

Preferred sequence:

```
Define
→ Baseline
→ Falsifier
→ Cheap replay
→ Failure analysis
→ Forward shadow
→ only then deeper implementation
```

If the cheapest credible test already kills the idea, BIGGJ should preserve the negative result and stop.

## 10. What comes next

The first implementation candidate is:

`CLAIM_ASSUMPTION_GRAPH`

But it should enter as:

```
DISCOVERING
→ LEARNING
→ TESTING
→ VALIDATED
→ TRUSTED
```

under the existing dependency and promotion system.

The implementation must initially be an audit/research component only.

It must not alter PRIMARY decisions automatically.

## 11. Invariants

Unchanged:

- PIT truth
- no future leakage
- provenance required
- OBSERVED / INFERRED / MODELLED / ASSUMED separation
- disagreement preserved
- explicit uncertainty
- explicit invalidation
- ABSTAIN valid
- no silent PRIMARY mutation
- versioned challengers
- forward shadow before trust
- SHADOW_ONLY
- canExecute:false
- canExecuteLive:false
