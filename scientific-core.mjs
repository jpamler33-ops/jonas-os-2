import { evaluateScientificValidity } from './scientific-validity.mjs';
import { evaluateEmpiricalSupport } from './science-runtime/empirical-support.mjs';
import { evaluateResearchIntegrity } from './science-runtime/research-integrity.mjs';
import { evaluateConceptStability } from './science-runtime/concept-stability.mjs';
import { evaluateNonlinearConceptStability } from './science-runtime/nonlinear-concept-stability.mjs';
import { evaluateTemporalRecency } from './science-runtime/temporal-recency.mjs';
import { evaluateSequentialEvidence } from './science-runtime/sequential-evidence.mjs';
import { evaluateSpecificationMultiverse } from './science-runtime/specification-multiverse.mjs';
import { evaluateTransportability } from './science-runtime/transportability.mjs';
import { evaluateEvidenceLineageIndependence } from './science-runtime/evidence-lineage-independence.mjs';

export const SCIENTIFIC_CORE_VERSION='TCX_SCIENTIFIC_CORE_V1';

export const DEFAULT_SCIENCE_PROFILE=Object.freeze({
  EMPIRICAL_SUPPORT:{required:true},
  RESEARCH_INTEGRITY:{required:true},
  CONCEPT_STABILITY:{required:true},
  NONLINEAR_CONCEPT_STABILITY:{required:false},
  TEMPORAL_RECENCY:{required:true},
  SEQUENTIAL_EVIDENCE:{required:false},
  SPECIFICATION_MULTIVERSE:{required:true},
  TRANSPORTABILITY:{required:true},
  EVIDENCE_LINEAGE_INDEPENDENCE:{required:true}
});

const RUNNERS=Object.freeze({
  EMPIRICAL_SUPPORT:(asOf,rows,options)=>evaluateEmpiricalSupport(asOf,rows,options),
  RESEARCH_INTEGRITY:(asOf,rows,options)=>evaluateResearchIntegrity(asOf,rows,options),
  CONCEPT_STABILITY:(asOf,rows,options)=>evaluateConceptStability(asOf,rows,options),
  NONLINEAR_CONCEPT_STABILITY:(asOf,rows,options)=>evaluateNonlinearConceptStability(asOf,rows,options),
  TEMPORAL_RECENCY:(asOf,rows,options)=>evaluateTemporalRecency(asOf,rows,options),
  SEQUENTIAL_EVIDENCE:(asOf,rows,options)=>evaluateSequentialEvidence(asOf,rows,options),
  SPECIFICATION_MULTIVERSE:(asOf,rows,options)=>evaluateSpecificationMultiverse(asOf,rows,options),
  TRANSPORTABILITY:(asOf,rows,options)=>evaluateTransportability(asOf,rows,options),
  EVIDENCE_LINEAGE_INDEPENDENCE:(asOf,rows,options)=>evaluateEvidenceLineageIndependence(asOf,rows,options)
});

function finite(v,name){
  const n=Number(v);
  if(!Number.isFinite(n)) throw new Error(name+' must be finite');
  return n;
}

/**
 * Single canonical orchestration point for scientific guards.
 * Missing required datasets fail closed through Scientific Validity.
 */
export function runScientificCore({
  asOf,
  inputs={},
  options={},
  profile=DEFAULT_SCIENCE_PROFILE,
  minimumRequiredCoverage=1
}={}){
  const t=finite(asOf,'asOf');
  const guards=[];
  const reports={};

  for(const id of Object.keys(DEFAULT_SCIENCE_PROFILE)){
    const cfg=profile?.[id]??DEFAULT_SCIENCE_PROFILE[id];
    const required=cfg?.required!==false;
    const rows=inputs?.[id];
    let report=null;
    let error=null;

    if(Array.isArray(rows)){
      try{
        report=RUNNERS[id](t,rows,options?.[id]??{});
      }catch(err){
        error=err instanceof Error?err.message:String(err);
      }
    }

    reports[id]=report;
    guards.push({
      id,
      required,
      report,
      orchestrationError:error
    });
  }

  const validity=evaluateScientificValidity({
    asOf:t,
    guards,
    minimumRequiredCoverage
  });

  return Object.freeze({
    version:SCIENTIFIC_CORE_VERSION,
    asOf:t,
    profile:Object.fromEntries(
      Object.keys(DEFAULT_SCIENCE_PROFILE).map(id=>[
        id,
        {required:(profile?.[id]??DEFAULT_SCIENCE_PROFILE[id])?.required!==false}
      ])
    ),
    reports,
    validity,
    executionMode:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecute:false
  });
}
