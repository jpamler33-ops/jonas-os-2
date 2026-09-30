# BIGGJ Research Episode Independence V1

Status: RESEARCH-ONLY RUNTIME INSTRUMENT  
Parent: BIGGJ Living Research Runtime  
Execution: SHADOW_ONLY  
PRIMARY influence: NONE

## Purpose

The Living Research Runtime already binds prospective persistent-thesis cases as research evidence.

Before this layer, those cases deliberately used:

independentEpisodeId:null

That prevented false independence claims, but also meant BIGGJ could never accumulate genuinely separated research episodes.

This resolver adds a conservative common-cause partition so multiple correlated forecasts cannot inflate the independent-episode count.

## Core rule

A forecast case is not treated as an independent research episode merely because:

- it has a different forecastId,
- it is a different symbol,
- it is another trade,
- it is another market,
- it occurs in another callback.

Cross-symbol diversity alone is explicitly insufficient.

## Discovery cohort

Any case already known when the research skill was created remains:

IN_SAMPLE_DISCOVERY

It never receives an independentEpisodeId for forward validation.

This prevents discovery data from being reused as prospective validation.

## Prospective eligibility

A case can only be resolved into a research episode when:

- it was first seen by Living Research after hypothesis creation,
- persistent-stale time is known,
- time order is valid,
- no timestamps come from the future,
- at least one explicit falsifier is recorded.

Cases failing these conditions remain unresolved and contribute zero independent episodes.

## Conservative common-cause clustering

Default policy:

- cases less than 12 hours apart share an episode,
- cases sharing an explicit falsifier within 48 hours share an episode,
- medium-gap cases on the same UTC date remain in one episode,
- after sufficient separation a new episode may be created.

The time policy is intentionally conservative.

Its job is to avoid counting correlated evidence as independent, not to maximize research sample size.

## Episode IDs

Episode IDs are deterministic and derived from:

- assumptionId,
- anchor case,
- episode start time.

All cases assigned to the same common-cause cluster share the same independentEpisodeId.

Therefore ten correlated cases may add ten evidence rows but only one independent episode to the skill evidence summary.

## Interpretation boundary

The field:

independenceResolved:true

means only:

the case has been assigned to a conservative research episode partition.

It does NOT mean:

- statistical independence is proven,
- the falsifier caused the failure,
- different episodes are causally unrelated,
- the hypothesis is validated.

Every episode artifact therefore keeps:

statisticalIndependenceProven:false

## Skill progression

The existing Skill Tree counts unique independentEpisodeId values.

This means:

- discovery evidence cannot advance independentEpisodes,
- correlated prospective cases share one count,
- sufficiently separated prospective episodes can increment the count.

The resolver may cause evaluateBiggjSkillProgress() to recommend a higher research state when evidence thresholds are eventually reached.

It does not apply the transition.

The actual skill status remains unchanged until a separate governed status-transition step occurs.

## Historical behavior

Existing V1 evidence rows with independentEpisodeId:null are not rewritten.

When the resolver is introduced:

- old evidence remains unresolved,
- new prospective evidence uses the resolver,
- new cases may be clustered relative to retained historical case context,
- previous evidence is never retroactively upgraded.

## Runtime observability

Living Research reports:

- conservative episode partitions,
- unresolved research cases,
- evidence-level independent episode counts.

The evidence-level count is authoritative for skill progression.

The raw partition count is diagnostic only because sampling may intentionally omit some cases from skill evidence.

## Safety invariants

- Point-in-Time only
- no future leakage
- discovery cohort never counts as forward independence
- cross-symbol alone never establishes independence
- common-cause clustering is conservative
- statistical independence is never claimed
- no automatic skill transition
- no automatic promotion
- no automatic kill
- no experiment launch
- no trading-policy mutation
- SHADOW_ONLY
- ABSTAIN
- canInfluencePrimary:false
- canExecuteLive:false
