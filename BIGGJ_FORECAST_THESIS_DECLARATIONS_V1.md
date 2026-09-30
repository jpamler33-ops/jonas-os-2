# BIGGJ Forecast Thesis Declarations V1

Status: LIVE-PIPELINE RESEARCH INSTRUMENT  
Parent challenger: CLAIM_ASSUMPTION_GRAPH  
Execution: SHADOW_ONLY  
PRIMARY influence: NONE

## Purpose

Move the Claim-Assumption Graph from generic forecast scaffolding toward auditing BIGGJ's actual pre-outcome reasoning.

Before each institutional forecast issuance BIGGJ now freezes a thesis composed from:

- derived world state,
- independent witness state,
- mechanism-transition model,
- historical transition lattice,
- evidence/disagreement state,
- research dependency coverage,
- scientific validity.

No later outcome information is available when these declarations are created.

## Epistemic rules

World-state and evidence summaries are INFERRED.

Mechanism and transition-lattice outputs are MODELLED.

The mechanism engine's causal status is preserved verbatim.

V1 does not promote a mechanism correlation into an identified causal explanation.

## Claims

V1 creates four thesis claims:

1. THESIS_WORLD_STATE_CLAIM
2. THESIS_MECHANISM_CLAIM
3. THESIS_EVIDENCE_CLAIM
4. THESIS_SYNTHESIS_CLAIM

The synthesis claim explicitly depends on the material assumptions below.

## Material assumptions

V1 declares eight pre-outcome assumptions:

- THESIS_WORLD_STATE_REPRESENTATIVE
- THESIS_WITNESS_SUPPORT_ADEQUATE
- THESIS_MECHANISM_SUPPORT_ADEQUATE
- THESIS_TRANSITION_ANALOGUES_ADEQUATE
- THESIS_EVIDENCE_ALIGNMENT_ADEQUATE
- THESIS_DEPENDENCY_COVERAGE_ADEQUATE
- THESIS_DISAGREEMENT_WITHIN_TOLERANCE
- THESIS_SCIENTIFIC_GUARDS_ADEQUATE

These assumptions require explicit support.

When support is missing at issuance, the graph records REQUIRED_SUPPORT_MISSING.

The system does not replace missing support with an arbitrary low confidence score.

## Support semantics

Examples:

Independent witness support is present only when the existing witness layer says independent witness requirements are satisfied and at least two external witnesses are available.

Mechanism support is present only when the current mechanism gate is HYPOTHESIS_SUPPORTED or IDENTIFIABILITY_REVIEW.

Transition support is present only when the historical transition lattice is sufficient.

Evidence-alignment support requires both a minimum evidence-index floor and mechanism evidence-strength floor.

Dependency support requires no blocked forecast features and a PASS or CAUTION dependency gate.

Disagreement support requires bounded mechanism contradiction and no non-basis witness contradiction.

Scientific support requires the existing scientific validity layer to remain PASS, CAUTION, or VALID.

These thresholds are research declarations only. They do not modify institutional forecast admission.

## Frozen provenance

The declaration preserves research provenance including:

- input fingerprint,
- state fingerprint,
- regime,
- bias,
- structure,
- flow,
- liquidity,
- pressure,
- witness agreement and contradictions,
- top mechanism channels,
- mechanism gate and causal status,
- transition support/coherence/novelty,
- evidence index and disagreement layers,
- research dependency coverage,
- blocked feature IDs,
- dependency reasons,
- scientific validity fingerprint.

## Dependency topology

Material assumptions are linked rather than treated as independent.

Examples:

- mechanism support depends on world-state representation,
- transition analogues depend on world-state representation,
- evidence alignment and disagreement depend on witness support,
- mechanism and scientific support depend on research dependency coverage.

The graph remains acyclic.

## Outcome attribution

When a forecast horizon later matures, the shadow observation now freezes:

- all THESIS_* assumptions declared for that issuance,
- which of those assumptions had REQUIRED_SUPPORT_MISSING at issuance.

The Research Evaluator can therefore measure, prospectively and per assumption:

- observations declared,
- supported observations,
- unsupported observations,
- direction-failure rate when unsupported,
- direction-failure rate when supported,
- interval-miss rate when unsupported,
- interval-miss rate when supported,
- rate differences with 95% Wilson intervals.

This is prospective association only.

It does not prove that an unsupported assumption caused the later forecast error.

## Why this matters

Before V1, the graph could say that an issuance had audit defects.

After V1, BIGGJ can eventually ask more useful questions such as:

- Do forecast errors cluster when independent witness support is missing?
- Do weak historical analogues precede more interval misses?
- Does mechanism support add information after controlling for ordinary ResearchTrace alerts?
- Are dependency-coverage defects useful or merely noisy?
- Which explicit assumptions add measurable audit value?

## No automatic self-modification

The resulting evidence can inform future challenger research and manual review.

It cannot directly:

- promote a skill,
- retire a skill,
- alter forecast admission,
- loosen scientific guards,
- change trading policy,
- execute orders.

## Invariants

- Point-in-Time only
- no future leakage
- original declarations remain immutable
- outcome does not rewrite the thesis
- outcome does not establish assumption truth
- association is not causation
- SHADOW_ONLY
- ABSTAIN
- canInfluencePrimary:false
- canExecuteLive:false
