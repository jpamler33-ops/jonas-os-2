# BIGGJ Living Research Runtime V1

Status: PRODUCTION RESEARCH RUNTIME  
Execution: SHADOW_ONLY  
PRIMARY authority: NONE

## Purpose

Turn the static BIGGJ capability / dependency / skill architecture into a living research agenda without allowing autonomous production mutation.

The runtime consumes:

- prospective Thesis Revision Memory,
- Assumption Stability / Persistence state,
- persistence-filtered Claim-Assumption research outcomes,
- canonical skill leverage and dependency structure.

It produces:

- assumption-specific research priorities,
- information-value-ranked agenda items,
- deterministic research contracts,
- bounded autonomous discovery of RESEARCH_ONLY child skills,
- operator-visible skill-tree and agenda summaries.

## Core loop

1. Read current persisted thesis memories.
2. Distinguish transient flicker from persistent stale assumptions.
3. Count independent affected forecasts, repeated falsifiers, recovery failures and recurrence.
4. Join prospective association evidence only when the evaluator says it is sample-ready.
5. Map the issue to canonical capabilities.
6. Weight research urgency by persistence + recurrence + falsifier diversity + dependency leverage + optional prospective association strength.
7. Create a RESEARCH_REQUIRED agenda item when the evidence floor is reached.
8. Deterministically create one RESEARCH_ONLY child skill for recurring, well-defined gaps.
9. Persist the skill graph and agenda atomically.
10. Never promote, kill, launch experiments, mutate PRIMARY or execute live orders.

## Automatic discovery gate

A child skill may be created when at least one of these research-only criteria is met:

- persistent staleness has appeared in at least three distinct forecasts,
- recovery has failed repeatedly,
- at least two distinct persistent forecasts exist and mature prospective association evidence is sufficiently strong.

This is discovery, not validation.

New skills start as:

- status: DISCOVERING
- promotionStage: RESEARCH_ONLY
- productionMutationAllowed: false
- execution: SHADOW_ONLY
- canExecuteLive: false

## Assumption → capability routing

- WORLD_STATE_REPRESENTATIVE → STATE_CHANGE_ATTRIBUTION
- WITNESS_SUPPORT_ADEQUATE → EVIDENCE_INDEPENDENCE
- MECHANISM_SUPPORT_ADEQUATE → IDENTIFIABILITY
- TRANSITION_ANALOGUES_ADEQUATE → HISTORICAL_ANALOGUES
- EVIDENCE_ALIGNMENT_ADEQUATE → PROVENANCE_CHAIN
- DEPENDENCY_COVERAGE_ADEQUATE → COVERAGE_GAP_DETECTION
- DISAGREEMENT_WITHIN_TOLERANCE → DISAGREEMENT_ENGINE
- SCIENTIFIC_GUARDS_ADEQUATE → SCIENTIFIC_GUARD_ORCHESTRATION

Each route also declares supporting capabilities and explicit falsification criteria.

## Persistence

Default file:

`/data/tcx-biggj-living-research.json`

Format:

- atomic JSON rename,
- schema: TCX_BIGGJ_LIVING_RESEARCH_RUNTIME_V1,
- corruption policy: backup and rebuild research-only,
- criticality: DEGRADE.

Corruption of this derived research state must not block forecast serving or create execution authority.

## Idempotence

A normalized source fingerprint is built from:

- relevant thesis assumption stability state,
- stability events,
- current falsifier codes,
- Claim-Assumption evaluator fingerprint.

If this source fingerprint is unchanged, the refresh is a no-op.

The same persistent research gap cannot create duplicate child skills because skill identity is deterministic.

## Scientific constraints

Prospective outcome associations may change research priority only.

They may not:

- validate an assumption,
- prove causality,
- rewrite historical thesis state,
- auto-promote a capability,
- auto-kill a hypothesis,
- mutate forecast gates,
- alter trading policy.

## Safety invariants

- Point-in-Time
- future leakage forbidden
- immutable issued forecasts
- autonomous discovery is research-only
- automatic promotion: false
- automatic kill: false
- automatic experiment launch: false
- primaryMutationAllowed: false
- SHADOW_ONLY
- ABSTAIN
- canInfluencePrimary: false
- canExecuteLive: false
