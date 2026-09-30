# BIGGJ Claim-Assumption Graph V1

Status: RESEARCH-ONLY AUDIT CHALLENGER  
Historical proposal: CLAIM_ASSUMPTION_GRAPH  
Parent capability: PROVENANCE_CHAIN  
Execution: SHADOW_ONLY  
PRIMARY influence: NONE  
Live execution authority: NONE

## 1. Why this exists

TCX already contains explicit claim, assumption, evidence and dependency concepts inside epistemic integrity.

Therefore this module does **not** create a competing epistemic truth system.

It adds the missing audit view:

```
Claim
  ↓ depends on
Assumption
  ↓ may depend on
Assumption
  ↑ supported by
Evidence
```

The purpose is to make hidden assumption load, shared assumptions, expiry, broken references and transitive invalidation inspectable without rewriting the original Research Trace.

## 2. Core scientific boundary

The graph can say:

- this claim explicitly depends on these assumptions,
- this assumption is expired,
- this assumption requires evidence but none is available,
- several claims share the same assumption,
- invalidating one assumption would affect these downstream claims,
- an assumption dependency cycle exists,
- a later graph revision differs from the earlier graph.

The graph may **not** say:

- more assumptions means lower truth,
- a shared assumption is automatically invalid,
- an explicit unsupported assumption is automatically false,
- graph completeness proves causality,
- graph readiness grants a trade,
- later discoveries existed in the original decision state.

## 3. Point-in-time contract

Every material record requires `availableAt`.

Supported records:

- claims,
- assumptions,
- evidence,
- assumption dependencies.

Any record with:

`availableAt > asOf`

is rejected.

If `observedAt` exists:

`observedAt <= availableAt`

must hold.

If `validUntil` exists:

`validUntil >= availableAt`

must hold.

Expired records may remain visible for audit, but their expiry is explicit.

## 4. Graph objects

### Claim

A claim contains:

- claimId,
- statement,
- epistemic class,
- required / optional status,
- explicit assumption IDs,
- evidence IDs,
- availableAt,
- optional observedAt,
- optional validUntil.

Claims with no assumptions are reported as:

`NONE_DECLARED`

This is descriptive, not automatically an error.

### Assumption

An assumption is always epistemically:

`ASSUMED`

It contains:

- assumptionId,
- statement,
- optional evidence links,
- whether evidence is explicitly required,
- availableAt,
- optional observedAt,
- optional validUntil.

An assumption without evidence is allowed when it is honestly declared as an assumption.

If `requiresEvidence:true`, missing valid support becomes an audit defect.

### Evidence

Evidence keeps its explicit class:

- OBSERVED
- INFERRED
- MODELLED
- ASSUMED

The graph does not collapse these into a confidence number.

### Assumption dependency

Semantics:

`A → B`

means:

> assumption A depends on assumption B.

If B is invalidated, A and claims downstream of A may also be affected.

## 5. Audit defects

V1 detects:

- MISSING_ASSUMPTION_DEFINITION
- MISSING_CLAIM_EVIDENCE
- EXPIRED_CLAIM_EVIDENCE
- EXPIRED_ASSUMPTION_USED
- MISSING_ASSUMPTION_EVIDENCE
- EXPIRED_ASSUMPTION_EVIDENCE
- REQUIRED_ASSUMPTION_SUPPORT_MISSING
- MISSING_DEPENDENCY_FROM_ASSUMPTION
- MISSING_DEPENDENCY_TO_ASSUMPTION
- ASSUMPTION_DEPENDENCY_CYCLE

No defect automatically modifies a forecast or strategy.

The output remains research-only.

## 6. Shared assumption fanout

For every assumption the graph computes the claims affected directly or transitively by that assumption.

Example:

```
C1 ─→ A2 ─→ A1
C2 ─→ A2
```

Invalidating A1 can affect:

- A1,
- A2,
- C1,
- C2.

This is useful because one hidden foundational assumption may create apparent agreement across many downstream conclusions.

Important:

> Shared fanout is concentration information, not proof that the assumption is wrong.

## 7. Counterfactual invalidation

`claimAssumptionInvalidationImpact()`

returns:

- affected assumption IDs,
- affected claim IDs,
- affected required claim IDs.

It is explicitly marked:

- counterfactualOnly:true
- mutatesOriginalGraph:false
- canInfluencePrimary:false

This makes it usable for thesis audits without becoming an autonomous exit rule.

## 8. Immutable revisions

A later audit does not rewrite an earlier graph.

`compareClaimAssumptionGraphs(before, after)`

creates a separate revision artifact with:

- added nodes,
- removed nodes,
- changed nodes,
- defect delta,
- newly introduced defects,
- before/after fingerprints,
- before/after asOf.

It states:

`rewritesHistoricalGraph:false`

This preserves the core TCX rule:

> Information learned later cannot be backdated into the original decision state.

## 9. Research Trace binding

The graph can optionally bind to an existing Research Trace.

When used, `sourceTraceId` must be a 64-character SHA-256 identifier.

Free-form text cannot masquerade as a canonical Research Trace.

V1 only binds the identifier.

It does not claim that the graph itself verifies the full Research Trace payload; that remains the responsibility of the existing Research Trace verifier.

## 10. Relationship to existing epistemic integrity

Existing epistemic integrity already handles important scientific questions such as:

- evidence closure,
- resolver independence,
- dependency identification,
- common causes,
- open-world coverage,
- leave-one-out fragility,
- evidence acquisition obligations.

Claim-Assumption Graph V1 complements that layer.

It focuses on:

- explicit assumption topology,
- assumption validity windows,
- assumption support declarations,
- shared assumption exposure,
- transitive invalidation,
- immutable assumption-graph revisions.

Future integration should reference the same canonical claim/assumption IDs rather than copy or fork epistemic truth.

## 11. Current research hypothesis

Research question:

> Does explicitly linking material claims to assumptions expose hidden assumption load and improve audit/revision quality beyond a flat provenance trace?

Hypothesis:

A claim-to-assumption graph will detect unsupported or stale assumption dependence earlier and reduce unresolved audit defects versus a provenance-only baseline.

Falsifier:

Reject or simplify the proposal if preregistered replay and forward-shadow audits show no material lift in:

- unsupported-assumption detection,
- stale-assumption detection,
- revision precision,
- audit reproducibility,

after accounting for added complexity.

## 12. What V1 proves and does not prove

V1 proves only that the research mechanism can:

- build a deterministic PIT-safe audit graph,
- detect specified structural defects,
- compute assumption fanout,
- compute counterfactual invalidation impact,
- compare immutable graph revisions,
- preserve SHADOW_ONLY safety invariants.

V1 does **not** prove that this representation improves forecasting, trading or scientific quality.

That requires prospective research evidence.

## 13. Next validation phase

Next scientific step:

1. adapt a sample of existing frozen Research Traces into explicit claim/assumption declarations,
2. preregister audit-defect definitions,
3. compare Claim-Assumption Graph vs current flat provenance audit,
4. measure incremental defect detection,
5. measure false-positive/duplicate findings,
6. measure revision precision,
7. measure operator/research overhead,
8. run on forward shadow traces,
9. retain negative findings,
10. only then consider skill maturity beyond DISCOVERING/LEARNING.

## 14. Invariants

Always:

- SHADOW_ONLY
- action: ABSTAIN
- canInfluencePrimary:false
- canExecuteLive:false
- no automatic trade changes
- no automatic promotion
- no future records
- no retrospective history rewrite
- no causal proof from graph topology alone
