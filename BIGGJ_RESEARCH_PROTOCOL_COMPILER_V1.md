# BIGGJ Research Protocol Compiler V1

Status: RESEARCH GOVERNANCE LAYER  
Execution: SHADOW_ONLY  
Automatic experiment launch: DISABLED  
PRIMARY authority: NONE

## Purpose

Convert a discovered BIGGJ research skill into an immutable prospective research protocol before later evidence may count as confirmatory evidence.

This closes the gap between:

persistent weakness
→ research question
→ discovered skill
→ evidence

by inserting:

persistent weakness
→ research question
→ discovered skill
→ **pre-registered protocol**
→ prospective evidence.

## Why this exists

Without pre-registration, BIGGJ could discover a hypothesis from historical cases and later accidentally treat those same cases as proof.

V1 prevents that.

Evidence known at or before protocol registration remains discovery / in-sample evidence.

Only evidence whose Point-in-Time availability is strictly after protocol registration may contribute to protocol readiness.

## Protocol identity

A protocol is deterministically identified from:

- skill ID,
- mapped thesis assumption,
- frozen skill question,
- frozen hypothesis,
- frozen falsifier,
- dependencies,
- protocol registration time.

Changing the hypothesis, falsifier or primary design requires a new protocol version / protocol ID.

## Backfill rule

Existing research skills created before this layer are not treated as if they had always been pre-registered.

They receive a protocol at the current knowledge time.

This is recorded as:

`backfilledForExistingSkill:true`

All evidence already known before that timestamp remains in-sample.

No retrospective confirmatory relabeling is allowed.

## Design

Default mode:

`PROSPECTIVE_OBSERVATIONAL_FORWARD_SHADOW`

Unit of analysis:

`CONSERVATIVE_RESEARCH_EPISODE`

The existing BIGGJ research episode resolver remains authoritative for episode independence.

Cross-symbol cases alone do not imply independence.

Unresolved independence contributes zero independent episodes.

## Primary endpoints

- reproducibility of persistent falsifiers across independent prospective episodes,
- specificity of persistent-stale evidence versus transient flicker.

## Secondary endpoints

- direction-failure association,
- interval-miss association,
- recovery-failure rate,
- structural-warning lead time.

These are research measurements.

Association is not causation.

## Negative controls

The protocol explicitly preserves:

- discovery cohort excluded from confirmatory counts,
- transient flicker with the same falsifier,
- unresolved common-cause / episode independence counted as zero independent episodes.

## Evidence gates

### Learning review

Requires at least:

- 3 post-registration evidence items,
- 2 independent prospective episodes.

### Formal testing review

Requires at least:

- 10 post-registration evidence items,
- 5 independent prospective episodes,
- complete audit-ready status for the counted sample.

### Validation review

Requires at least:

- 30 forward-shadow observations,
- 20 independent prospective episodes,
- PIT-safe evidence,
- audit readiness,
- scientific guards,
- chronological stability,
- cost stress,
- concentration stress,
- winner-removal stress.

These states are **review readiness**, not automatic status transitions.

## Protocol states

- AWAITING_PROSPECTIVE_EVIDENCE
- COLLECTING_PROSPECTIVE_EVIDENCE
- LEARNING_REVIEW_EVIDENCE_READY
- FORMAL_TESTING_REVIEW_EVIDENCE_READY
- VALIDATION_REVIEW_EVIDENCE_READY
- PROTOCOL_INVALIDATED_BY_CONTRACT_DRIFT

If the frozen skill question / hypothesis / falsifier changes, the old protocol is not silently rewritten.

It becomes invalidated by contract drift.

## Multiple testing

Protocol policy freezes:

- family alpha = 0.05
- multiple-testing adjustment = Holm

Any future endpoint-family change requires a new protocol.

## Living Research integration

The Living Research Runtime stores protocols inside its existing persistent runtime state.

For a newly discovered skill:

1. skill is created,
2. protocol is registered at the same research-cycle knowledge time,
3. evidence binding occurs afterwards.

Evidence created in that same timestamp is still not treated as confirmatory because confirmatory evidence must be known strictly after registration.

For an existing skill without a protocol:

1. the runtime detects the missing protocol even if source data is otherwise unchanged,
2. a backfilled protocol is registered at the current time,
3. existing evidence remains in-sample,
4. only later evidence may satisfy protocol gates.

Repeated refreshes cannot create a duplicate current-version protocol for the same skill.

## Authority boundaries

A protocol may report that evidence is ready for review.

It cannot:

- launch an experiment,
- change a skill status,
- promote a skill,
- kill a skill,
- alter PRIMARY,
- alter trading policy,
- change position sizing,
- execute an order.

The existing governed skill lifecycle remains the only path from research toward trust.

## Safety invariants

- Point-in-Time only
- no future leakage
- no retrospective confirmatory relabeling
- immutable frozen research contract
- conservative episode independence
- discovery evidence is not validation
- association is not causation
- automaticExperimentLaunch:false
- automaticSkillStatusTransition:false
- automaticPromotion:false
- automaticKill:false
- primaryMutationAllowed:false
- tradingPolicyMutationAllowed:false
- SHADOW_ONLY
- ABSTAIN
- canInfluencePrimary:false
- canExecuteLive:false
