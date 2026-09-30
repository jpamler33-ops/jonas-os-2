# BIGGJ Research Validation Harness V1

Status: RESEARCH REVIEW INSTRUMENT  
Execution: SHADOW_ONLY  
Automatic status transitions: FORBIDDEN  
Automatic experiment launch: FORBIDDEN  
PRIMARY influence: NONE

## Purpose

The Living Research Runtime can discover research-only skills and attach real point-in-time context from persistent thesis failures.

That is not the same as validation.

The Research Validation Harness converts each discovered skill into a reproducible review package that answers:

- What maturity phase is this skill in?
- Which evidence gates are already satisfied?
- Which exact validation deficits remain?
- Which dependency gates block the next phase?
- What is the next validation experiment that should be run?
- Is a manual skill-status transition review justified?

The harness is diagnostic only. It does not mutate the skill tree.

## Critical maturity firewall

Research evidence is separated into two roles.

### Research-context evidence

Research-context evidence explains why a hypothesis exists or why it remains worth investigating.

Examples:

- discovery cohort,
- prospective persistent thesis cases,
- persistence-filtered association snapshots.

These objects remain visible in the skill history.

They may increase research priority and explain recurrence.

They cannot unlock maturity.

They are explicitly stored with:

validationEligible:false

Legacy rows without this field are classified from provenance. Known context provenance kinds remain excluded without rewriting the original evidence record.

### Validation-eligible evidence

Validation evidence is evidence explicitly eligible for maturity gates.

Only this denominator can satisfy:

- evidence-count thresholds,
- independent-episode thresholds,
- audit completeness,
- scientific-guard completeness,
- forward-shadow requirements,
- chronology robustness,
- cost stress,
- concentration stress,
- winner-removal stress,
- positive-forward-evidence thresholds.

Normal pre-existing evidence callers remain validation-eligible by default for backward compatibility unless they are recognized research-context rows.

## Why the split is required

Without the split, discovery evidence creates two opposite failure modes.

First, recurrence evidence could inflate maturity simply because the same phenomenon that caused the hypothesis kept recurring.

Second, discovery and association rows intentionally marked auditReady:false or scientificGuardsPassed:false would permanently poison an all-evidence validation denominator.

The V1 harness avoids both errors.

Research context remains preserved.

Validation maturity uses only validation-eligible evidence.

## Phases

### DISCOVERY_EVIDENCE

Checks:

- question declared,
- hypothesis declared,
- falsifier declared,
- at least 3 validation-eligible evidence rows,
- at least 2 validation-eligible independent episodes,
- all validation evidence Point-in-Time safe.

A satisfied phase may justify a manual DISCOVERING → LEARNING review.

### LEARNING_AUDIT

Checks:

- at least 10 validation evidence rows,
- at least 5 independent validation episodes,
- Point-in-Time completeness,
- audit completeness,
- testing dependency gate.

A satisfied phase may justify a manual LEARNING → TESTING review.

### FORWARD_STRESS

Checks:

- at least 30 validation forward-shadow rows,
- at least 20 independent validation episodes,
- all validation evidence PIT-safe,
- all validation evidence audit-ready,
- all validation evidence scientific-guard-passed,
- chronology stability,
- cost stress,
- concentration stress,
- winner removal,
- positive-rate threshold above 50%,
- decision dependency gate.

A satisfied phase may justify a manual TESTING → VALIDATED review.

### TRUST_REPLICATION

Checks:

- at least 60 validation forward-shadow rows,
- at least 40 independent validation episodes,
- complete PIT/audit/science coverage,
- at least 40 chronology/cost/concentration/winner-removal passes,
- positive-rate threshold above 52%,
- trust dependency gate.

TRUSTED still requires the existing versioned promotion record.

### TRUST_MONITORING

Checks:

- trust dependency gate remains healthy,
- forward validation evidence has not entered material negative decay.

The harness may surface a review requirement but does not demote automatically.

## Next-experiment planner

The first unresolved gate is translated into an explicit research action.

Examples:

- collect additional separated episodes,
- repair PIT provenance,
- complete audit review,
- run scientific guards,
- run chronological split / walk-forward checks,
- cost stress,
- concentration stress,
- winner-removal stress,
- resolve dependency blockers.

The planner never launches the experiment itself.

automaticExperimentLaunchAllowed:false

## Independent episodes

An independentEpisodeId is a conservative common-cause partition produced by the existing Research Episode Resolver.

It is not proof of statistical independence.

The validation harness preserves this limitation explicitly.

## Readiness score

The harness exposes a bounded readiness score based on:

- fraction of validation gates satisfied,
- validation evidence integrity,
- independent validation episode depth.

This score is a diagnostic prioritization value.

It is not:

- a probability that the hypothesis is true,
- a probability of profit,
- a promotion score,
- trading confidence.

## Persisted-state compatibility

Existing skill-tree evidence is not rewritten.

Validation summaries are derived from the evidence rows at evaluation time.

This means old persisted trees with cached evidenceSummary objects from before the validation-denominator split are interpreted under the new rules without mutating their historical evidence.

## Governance

The harness may produce:

manualTransitionReviewEligible:true

That means only that the existing evidence and dependency rules support human review of the next skill status.

It does not perform the transition.

The existing status-transition API remains separate.

TRUSTED still requires an explicit versioned promotion record.

## Safety invariants

- immutable evidence history
- Point-in-Time only
- future leakage forbidden
- research context cannot unlock maturity
- outcome association does not prove causality
- automaticStatusTransitionAllowed:false
- automaticExperimentLaunchAllowed:false
- automaticPromotionAllowed:false
- automaticKillAllowed:false
- primaryMutationAllowed:false
- SHADOW_ONLY
- ABSTAIN
- canInfluencePrimary:false
- canExecuteLive:false
