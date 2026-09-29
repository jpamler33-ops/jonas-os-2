import { sha256, auditEngineResult } from './institutional-kernel.mjs';
import { verifyResearchTrace } from './research-trace.mjs';
import { verifyScientificValidity } from './scientific-validity.mjs';
import { verifyEpistemicIntegrity } from './science-runtime/epistemic-integrity.mjs';

export const TCX_RESEARCH_OS_VERSION='TCX_RESEARCH_OS_V1';

export const TCX_EPISTEMIC_CLASSES=Object.freeze([
  'OBSERVED','INFERRED','MODELLED','ASSUMED'
]);

export const TCX_RESEARCH_OS_LAYERS=Object.freeze([
  Object.freeze({id:'TEMPORAL_MARKET_FABRIC',modules:['market-data-fabric.mjs','deterministic-replay.mjs','state-validity.mjs','episode-memory.mjs']}),
  Object.freeze({id:'EVIDENCE_MESH',modules:['research-data-plane.mjs','research-data-governance.mjs','research-dependency-graph.mjs','independent-witness-network.mjs','science-runtime/evidence-lineage-independence.mjs']}),
  Object.freeze({id:'MECHANISM_RIFT',modules:['mechanism-transition-engine.mjs','science-runtime/epistemic-integrity.mjs','scientific-validity.mjs']}),
  Object.freeze({id:'FORECAST_INTELLIGENCE',modules:['institutional-forecast-runtime.mjs','forecast-science-adapter.mjs','forecast-hypothesis-generator.mjs','forecast-learning-center.mjs']}),
  Object.freeze({id:'RESEARCH_TRACE',modules:['research-trace.mjs','institutional-audit-binding.mjs','institutional-kernel.mjs']}),
  Object.freeze({id:'FAILURE_FIRST_KERNEL',modules:['scientific-validity.mjs','science-runtime/research-integrity.mjs','science-runtime/epistemic-integrity.mjs']}),
  Object.freeze({id:'LEARNING_MEMORY',modules:['episode-memory.mjs','setup-performance-memory.mjs','shadow-trade-quality-learner.mjs','biggj-adaptive-learning-core.mjs']}),
  Object.freeze({id:'STRATEGY_CHALLENGERS',modules:['shadow-strategy-league.mjs','learned-challenger-engine.mjs','biggj-style-experiment-engine.mjs','model-candidate-registry.mjs','model-promotion-ladder.mjs']}),
  Object.freeze({id:'SHADOW_OMS_PORTFOLIO',modules:['shadow-oms.mjs','shadow-portfolio-ledger.mjs','portfolio-risk-brain.mjs','shadow-leverage-risk.mjs','multi-venue-shadow-sor.mjs']}),
  Object.freeze({id:'OPERATOR_SURFACE',modules:['telegram-product-ui.mjs','discord-telegram-bridge.mjs']})
]);

const deepFreeze=v=>{
  if(v&&typeof v==='object'&&!Object.isFrozen(v)){
    Object.freeze(v);
    for(const x of Object.values(v)) deepFreeze(x);
  }
  return v;
};
const finite=v=>Number.isFinite(Number(v))?Number(v):null;
const clean=s=>String(s??'').trim();
const unique=xs=>[...new Set(xs)];

export function createTcxEpistemicClaim({
  id,
  statement,
  epistemicClass,
  asOf,
  provenance=[],
  assumptions=[],
  confidence=null,
  invalidation=null
}={}){
  const cls=String(epistemicClass||'').toUpperCase();
  if(!TCX_EPISTEMIC_CLASSES.includes(cls)) throw new Error('invalid epistemic class');
  const t=finite(asOf);
  if(t==null) throw new Error('claim asOf must be finite');
  const claimId=clean(id)||'CLAIM_'+sha256({statement,cls,t}).slice(0,16);
  const text=clean(statement);
  if(!text) throw new Error('claim statement required');
  const prov=Array.isArray(provenance)?structuredClone(provenance):[];
  const assumed=Array.isArray(assumptions)?structuredClone(assumptions):[];
  if(cls==='OBSERVED'&&!prov.length) throw new Error('OBSERVED claim requires provenance');
  if(cls==='INFERRED'&&!prov.length) throw new Error('INFERRED claim requires provenance');
  if(cls==='ASSUMED'&&!assumed.length) throw new Error('ASSUMED claim requires explicit assumptions');
  const conf=confidence==null?null:Math.max(0,Math.min(1,Number(confidence)));
  if(confidence!=null&&!Number.isFinite(Number(confidence))) throw new Error('claim confidence must be finite');
  const core={
    version:'TCX_EPISTEMIC_CLAIM_V1',
    claimId,
    statement:text,
    epistemicClass:cls,
    asOf:t,
    provenance:prov,
    assumptions:assumed,
    confidence:conf,
    invalidation:invalidation==null?null:structuredClone(invalidation)
  };
  return deepFreeze({...core,fingerprint:sha256(core)});
}

export function validateTcxEpistemicClaims(claims,{asOf}={}){
  const t=finite(asOf);
  if(t==null) throw new Error('claims asOf must be finite');
  const reasons=[];
  const rows=[];
  for(const claim of Array.isArray(claims)?claims:[]){
    const cls=String(claim?.epistemicClass||'').toUpperCase();
    const rowReasons=[];
    if(!TCX_EPISTEMIC_CLASSES.includes(cls)) rowReasons.push('CLASS_INVALID');
    const claimAsOf=finite(claim?.asOf);
    if(claimAsOf==null) rowReasons.push('ASOF_INVALID');
    else if(claimAsOf>t) rowReasons.push('CLAIM_FROM_FUTURE');
    if((cls==='OBSERVED'||cls==='INFERRED')&&!(Array.isArray(claim?.provenance)&&claim.provenance.length)) rowReasons.push('PROVENANCE_MISSING');
    if(cls==='ASSUMED'&&!(Array.isArray(claim?.assumptions)&&claim.assumptions.length)) rowReasons.push('ASSUMPTION_MISSING');
    const {fingerprint,...core}=claim||{};
    if(fingerprint!==sha256(core)) rowReasons.push('FINGERPRINT_INVALID');
    rows.push({claimId:claim?.claimId||null,epistemicClass:cls,reasons:rowReasons});
    reasons.push(...rowReasons);
  }
  return deepFreeze({
    ok:reasons.length===0,
    asOf:t,
    count:rows.length,
    rows,
    reasons:unique(reasons)
  });
}

function temporalAudit(input,asOf){
  const reasons=[];
  if(input?.pitSafe!==true) reasons.push('PIT_NOT_CONFIRMED');
  if(input?.futureLeakage===true) reasons.push('FUTURE_LEAKAGE_DETECTED');
  if(input?.fabricHealthy!==true) reasons.push('MARKET_FABRIC_UNHEALTHY');
  const latest=finite(input?.maxInputAvailableAt);
  if(latest==null) reasons.push('MAX_INPUT_AVAILABLE_AT_MISSING');
  else if(latest>asOf) reasons.push('INPUT_FROM_FUTURE');
  const futureCount=Number(input?.futureInputCount||0);
  if(!Number.isFinite(futureCount)||futureCount<0) reasons.push('FUTURE_INPUT_COUNT_INVALID');
  else if(futureCount>0) reasons.push('FUTURE_INPUT_PRESENT');
  return {ok:reasons.length===0,reasons,maxInputAvailableAt:latest};
}

function evidenceAudit(input){
  const reasons=[];
  if(input?.dependencyGraphHealthy!==true) reasons.push('DEPENDENCY_GRAPH_UNHEALTHY');
  if(input?.provenanceComplete!==true) reasons.push('PROVENANCE_INCOMPLETE');
  if(input?.independenceChecked!==true) reasons.push('INDEPENDENCE_NOT_CHECKED');
  if(input?.commonCauseChecked!==true) reasons.push('COMMON_CAUSE_NOT_CHECKED');
  const contradictionCoverage=finite(input?.contradictionCoverage);
  if(contradictionCoverage==null||contradictionCoverage<0||contradictionCoverage>1) reasons.push('CONTRADICTION_COVERAGE_INVALID');
  return {ok:reasons.length===0,reasons,contradictionCoverage};
}

function forecastAudit(input){
  const reasons=[];
  if(input?.present!==true) reasons.push('FORECAST_MISSING');
  if(input?.calibrated!==true) reasons.push('FORECAST_NOT_CALIBRATED');
  if(input?.uncertaintyDefined!==true) reasons.push('UNCERTAINTY_MISSING');
  if(input?.invalidationDefined!==true) reasons.push('INVALIDATION_MISSING');
  if(input?.multiHorizon!==true) reasons.push('MULTI_HORIZON_MISSING');
  return {ok:reasons.length===0,reasons};
}

function learningAudit(input){
  const reasons=[];
  if(input?.versionedChangesOnly!==true) reasons.push('UNVERSIONED_LEARNING_CHANGE');
  if(input?.silentProductionMutation===true) reasons.push('SILENT_PRODUCTION_MUTATION');
  if(input?.challengerIsolation!==true) reasons.push('CHALLENGER_ISOLATION_MISSING');
  return {ok:reasons.length===0,reasons};
}

function promotionAudit(input){
  const reasons=[];
  if(input?.productionMutationPerformed===true) reasons.push('PRODUCTION_MUTATION_PERFORMED');
  if(input?.promotionGateBypassed===true) reasons.push('PROMOTION_GATE_BYPASSED');
  if(input?.candidateVersioned!==true) reasons.push('CANDIDATE_NOT_VERSIONED');
  return {ok:reasons.length===0,reasons};
}

export function evaluateTcxResearchOperatingState({
  asOf,
  temporal,
  evidence,
  claims=[],
  mechanism,
  scientificValidity,
  epistemicIntegrity,
  researchTrace,
  forecast,
  learning,
  promotion
}={}){
  const t=finite(asOf);
  if(t==null) throw new Error('TCX OS asOf must be finite');

  const temporalResult=temporalAudit(temporal||{},t);
  const evidenceResult=evidenceAudit(evidence||{});
  const claimResult=validateTcxEpistemicClaims(claims,{asOf:t});
  const mechanismResult=mechanism?auditEngineResult(mechanism):{ok:false,errors:['MECHANISM_MISSING'],warnings:[]};
  const scienceResult=scientificValidity?verifyScientificValidity(scientificValidity):{ok:false,reasons:['SCIENTIFIC_VALIDITY_MISSING']};
  const epistemicResult=epistemicIntegrity?verifyEpistemicIntegrity(epistemicIntegrity):{ok:false,reasons:['EPISTEMIC_INTEGRITY_MISSING']};
  const traceResult=researchTrace?verifyResearchTrace(researchTrace):{ok:false,reasons:['RESEARCH_TRACE_MISSING']};
  const forecastResult=forecastAudit(forecast||{});
  const learningResult=learningAudit(learning||{});
  const promotionResult=promotionAudit(promotion||{});

  const hardReasons=[
    ...temporalResult.reasons,
    ...evidenceResult.reasons,
    ...claimResult.reasons,
    ...(mechanismResult.errors||[]),
    ...(scienceResult.ok?[]:scienceResult.reasons||['SCIENTIFIC_VALIDITY_INVALID']),
    ...(epistemicResult.ok?[]:epistemicResult.reasons||['EPISTEMIC_INTEGRITY_INVALID']),
    ...(traceResult.ok?[]:traceResult.reasons||['RESEARCH_TRACE_INVALID']),
    ...forecastResult.reasons,
    ...learningResult.reasons,
    ...promotionResult.reasons
  ];

  if(scientificValidity?.gate&&String(scientificValidity.gate).toUpperCase()!=='PASS'){
    hardReasons.push('SCIENTIFIC_GATE_'+String(scientificValidity.gate).toUpperCase());
  }

  const uniqueReasons=unique(hardReasons);
  const operatingState=uniqueReasons.length?'ABSTAIN':'RESEARCH_READY';
  const core={
    version:TCX_RESEARCH_OS_VERSION,
    asOf:t,
    operatingState,
    canonicalDna:[
      'POINT_IN_TIME_TRUTH',
      'EVIDENCE',
      'DISAGREEMENT',
      'CALIBRATED_UNCERTAINTY',
      'INVALIDATION',
      'ABSTAIN',
      'AUDIT',
      'LEARNING'
    ],
    checks:{
      temporal:temporalResult,
      evidence:evidenceResult,
      claims:claimResult,
      mechanism:{ok:mechanismResult.ok,errors:mechanismResult.errors||[],warnings:mechanismResult.warnings||[]},
      scientific:{ok:scienceResult.ok,gate:scientificValidity?.gate||null,reasons:scienceResult.reasons||[]},
      epistemic:{ok:epistemicResult.ok,reasons:epistemicResult.reasons||[]},
      trace:{ok:traceResult.ok,reasons:traceResult.reasons||[]},
      forecast:forecastResult,
      learning:learningResult,
      promotion:promotionResult
    },
    reasons:uniqueReasons,
    invariants:{
      execution:'SHADOW_ONLY',
      action:'ABSTAIN',
      canExecuteLive:false,
      silentSelfModification:false,
      epistemicClasses:[...TCX_EPISTEMIC_CLASSES]
    }
  };
  return deepFreeze({...core,fingerprint:sha256(core)});
}

export function tcxResearchOsManifest(){
  const core={
    version:TCX_RESEARCH_OS_VERSION,
    layers:TCX_RESEARCH_OS_LAYERS,
    epistemicClasses:[...TCX_EPISTEMIC_CLASSES],
    execution:'SHADOW_ONLY',
    canExecuteLive:false
  };
  return deepFreeze({...core,fingerprint:sha256(core)});
}
