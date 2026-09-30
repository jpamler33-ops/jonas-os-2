# BIGGJ Research Lifecycle Review Queue V1

Status: GOVERNED RESEARCH CONTROL  
Parent: Living Research Runtime + Preregistered Research Protocols  
Execution: SHADOW_ONLY  
PRIMARY influence: NONE

## Purpose

BIGGJ already discovers research-only skills, preregisters their hypotheses, binds prospective evidence and resolves independent research episodes conservatively.

The missing transition was lifecycle governance.

Evidence readiness must not silently mutate a skill from research into a more mature status.

V1 therefore creates deterministic review tickets instead of automatic status transitions.

## Review flow

A ticket can be created only when the frozen research protocol and current skill evaluation agree.

Supported review transitions are:

- DISCOVERING -> LEARNING
- LEARNING -> TESTING
- TESTING -> VALIDATED

TRUSTED is deliberately excluded.

TRUSTED continues to require the separate versioned promotion path and promotion record.

## Evidence gates

### DISCOVERING -> LEARNING

Requires the preregistered protocol to reach at least LEARNING_REVIEW_EVIDENCE_READY and the skill evaluator to recommend LEARNING.

### LEARNING -> TESTING

Requires FORMAL_TESTING_REVIEW_EVIDENCE_READY or stronger and the skill evaluator to recommend TESTING.

### TESTING -> VALIDATED

Requires VALIDATION_REVIEW_EVIDENCE_READY and the skill evaluator to recommend VALIDATED.

The protocol compiler remains authoritative for post-registration evidence counts, independent episodes, PIT safety, audit readiness and stress requirements.

## Ticket snapshot

Each ticket freezes:

- protocol ID,
- skill ID,
- current status,
- proposed status,
- protocol evaluation fingerprint,
- skill evaluation fingerprint,
- protocol evidence state,
- post-registration evidence counts,
- dependency-gate snapshot,
- explicit approval requirement.

A ticket becomes stale if the skill status or evaluation changes before review.

## Contract drift

If the preregistered hypothesis, falsifier, dependencies or other frozen skill-contract fields drift, no transition ticket is created.

The case is surfaced as PROTOCOL_CONTRACT_DRIFT.

Research cannot retrospectively rewrite the contract and still call later evidence confirmatory.

## Explicit decision

The review API requires an explicit approved=true or rejection.

Approval re-evaluates the skill immediately before transition.

If the current recommendation fingerprint differs from the ticket, the decision fails closed.

Rejection leaves the skill tree unchanged.

## Persistence migration

The queue and review decisions live inside the existing Living Research Runtime state.

No new truth store is introduced.

Existing persisted Living Research Runtime files that predate the queue are migrated in place:

- the existing skill tree is retained,
- evidence is not rewritten,
- protocols are not rewritten,
- skill status is not rewritten,
- a new queue is derived from current frozen state,
- prior state is not treated as corrupt.

## Why this matters

BIGGJ can now autonomously:

1. find a recurring weakness,
2. create a falsifiable research skill,
3. preregister the research design,
4. collect prospective evidence,
5. resolve independent episodes conservatively,
6. detect that the next research stage is evidence-ready,
7. create a review ticket.

It still cannot decide that evidence is sufficient to change its own maturity status without an explicit review decision.

This preserves a hard separation between autonomous research and autonomous self-authorization.

## Safety invariants

- SHADOW_ONLY
- ABSTAIN
- no automatic ticket application
- no automatic experiment launch
- no automatic promotion
- no automatic kill
- no automatic TRUSTED transition
- no PRIMARY mutation
- no trading-policy mutation
- no real orders
- no future leakage
- preregistration remains immutable
- canInfluencePrimary:false
- canExecuteLive:false
