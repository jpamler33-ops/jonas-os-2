# BIGGJ Claim-Assumption Research Evaluator V1

Status: FORWARD-SHADOW EVALUATOR  
Proposal: CLAIM_ASSUMPTION_GRAPH  
Execution: SHADOW_ONLY  
PRIMARY influence: NONE  
Automatic promotion: FORBIDDEN  
Automatic kill: FORBIDDEN

## Question

Does the explicit Claim-Assumption Graph add measurable audit information beyond the existing ResearchTrace baseline?

## Design

The evaluator uses a paired prospective design.

Each matured forecast supplies both:

1. the existing ResearchTrace audit state,
2. the Claim-Assumption Graph audit state.

Both are evaluated against the same later outcome.

This avoids a randomized traffic split and controls for symbol, timestamp, horizon and market regime at the observation level.

## Primary endpoint

DIRECTION_TOP_ERROR

A primary failure occurs when the forecast's top direction is not the realized direction.

The evaluator compares whether the Challenger and the existing baseline had raised an audit alert before the outcome matured.

## Secondary endpoint

INTERVAL_MISS

A secondary failure occurs when the later realized return falls outside the forecast interval.

## Paired comparison

For each endpoint the evaluator records:

- both alerted,
- Challenger only,
- baseline only,
- neither alerted.

The exact two-sided McNemar/binomial test is applied to discordant pairs.

This tests whether one representation detects materially more failures on the exact same observations.

## False alerts

The same paired method is applied to non-failure outcomes.

Therefore extra detection cannot be treated as useful merely because the Challenger produces more warnings.

A Challenger that catches more errors but also produces materially more false alerts is classified as MIXED_SIGNAL.

## Confidence intervals

Alert rate, recall, precision and false-positive rate use 95% Wilson intervals.

Continuous metrics are descriptive only:

- Brier score,
- log loss,
- absolute return error.

Differences between graph-alert and graph-no-alert cohorts are explicitly association-only, not causal evidence.

## Coverage gates

Default research-readiness floors:

- 200 matured observations,
- 40 primary failures,
- 20 Challenger alerts,
- 20 Challenger non-alerts,
- 30 observations with custom declarations.

The custom-declaration gate prevents BIGGJ from declaring the experiment finished while only the generic baseline scaffolding has been exercised.

## Conclusive floor

A stronger review floor begins at 800 observations.

Even then the evaluator does not auto-promote or auto-kill.

It can only mark a manual review as eligible.

## Possible research states

- COLLECTING_FORWARD_SHADOW
- COLLECTING_ALERT_VARIATION
- INCONCLUSIVE
- PROMISING_INCREMENTAL_AUDIT_SIGNAL
- MIXED_SIGNAL
- FALSE_POSITIVE_BURDEN
- EVIDENCE_AGAINST_INCREMENTAL_VALUE
- NO_INCREMENTAL_FAILURE_DETECTION_OBSERVED
- DATA_INTEGRITY_BLOCKED

## Kill-review logic

A kill review can become eligible only after sufficient evidence when, for example:

- the baseline detects significantly more primary failures,
- the Challenger produces significantly more false alerts without failure-detection gain,
- a conclusive-size sample produces no Challenger-only primary failure catches.

This is a review trigger, not an automatic deletion or retirement.

## Promotion-review logic

A manual review can become eligible when:

- paired primary failure detection is significantly better,
- the Challenger produces more Challenger-only failure catches than baseline-only catches,
- there is no statistically significant increase in paired false-alert burden,
- all sample/coverage gates are satisfied.

This still does not create a TRUSTED skill or mutate PRIMARY.

## Data integrity

Any invalid fingerprinted shadow observation blocks the research conclusion.

Invalid observations are not silently discarded.

## Overhead

The evaluator tracks serialized research-artifact overhead:

- graph node count,
- graph edge count,
- graph bytes,
- ResearchTrace bytes,
- full sidecar bytes,
- sidecar/trace byte ratio.

This is storage/representation overhead only.

CPU/runtime overhead is not yet measured.

## Not yet measured

V1 does not yet claim evidence for:

- graph revision precision,
- stale-assumption detection,
- assumption-level truth/falsity,
- causal mechanism correctness,
- runtime CPU cost.

Those require additional prospective streams.

## Invariants

- Point-in-Time chronology
- no future leakage
- no outcome-driven mutation of the original issuance graph
- outcome does not validate an individual assumption
- paired association is not causation
- SHADOW_ONLY
- ABSTAIN
- canInfluencePrimary:false
- canExecuteLive:false
