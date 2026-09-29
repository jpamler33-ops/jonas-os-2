import { sha256 } from './institutional-kernel.mjs';

export const TCX_RESEARCH_OS_CANON_VERSION='TCX_RESEARCH_OS_CANON_V1';

const deepFreeze=value=>{
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    Object.freeze(value);
    for(const v of Object.values(value)) deepFreeze(v);
  }
  return value;
};

export const TCX_EPISTEMIC_CLASSES=deepFreeze(['OBSERVED','INFERRED','MODELLED','ASSUMED']);

export const TCX_RESEARCH_OS_DNA=deepFreeze([
  'POINT_IN_TIME_TRUTH',
  'EVIDENCE',
  'DISAGREEMENT',
  'CALIBRATED_UNCERTAINTY',
  'INVALIDATION',
  'ABSTAIN',
  'AUDIT',
  'LEARNING'
]);

export const TCX_RESEARCH_OS_LAYERS=deepFreeze([
  {id:'TEMPORAL_MARKET_FABRIC',rank:10,upstream:[]},
  {id:'EVIDENCE_MESH',rank:20,upstream:['TEMPORAL_MARKET_FABRIC']},
  {id:'MECHANISM_RIFT',rank:30,upstream:['EVIDENCE_MESH']},
  {id:'FORECAST_INTELLIGENCE',rank:40,upstream:['EVIDENCE_MESH','MECHANISM_RIFT']},
  {id:'RESEARCH_TRACE',rank:50,upstream:['TEMPORAL_MARKET_FABRIC','EVIDENCE_MESH','MECHANISM_RIFT','FORECAST_INTELLIGENCE']},
  {id:'FAILURE_FIRST_KERNEL',rank:60,upstream:['RESEARCH_TRACE']},
  {id:'SHADOW_DECISION_CONSUMERS',rank:70,upstream:['FAILURE_FIRST_KERNEL']},
  {id:'LEARNING_MEMORY',rank:80,upstream:['SHADOW_DECISION_CONSUMERS','RESEARCH_TRACE']},
  {id:'STRATEGY_CHALLENGERS',rank:90,upstream:['LEARNING_MEMORY']},
  {id:'PROMOTION_LADDER',rank:100,upstream:['STRATEGY_CHALLENGERS','RESEARCH_TRACE']},
  {id:'OPERATOR_INTERFACES',rank:110,upstream:['FAILURE_FIRST_KERNEL','SHADOW_DECISION_CONSUMERS','LEARNING_MEMORY']}
]);

export const TCX_PROMOTION_STAGES=deepFreeze([
  'IDEA',
  'RESEARCH_ONLY',
  'CHALLENGER',
  'FORWARD_SHADOW',
  'STRESS_VALIDATED',
  'CALIBRATED',
  'PROMOTION_REVIEW',
  'PRIMARY'
]);

export const TCX_RESEARCH_OS_INVARIANTS=deepFreeze({
  execution:'SHADOW_ONLY',
  canExecuteLive:false,
  primaryActionDefault:'ABSTAIN',
  pointInTimeRequired:true,
  futureLeakageAllowed:false,
  silentPrimarySelfModificationAllowed:false,
  scientificGuardRelaxationForTradeCountAllowed:false,
  provenanceRequired:true,
  auditRequired:true,
  uncertaintyRequired:true,
  invalidationRequired:true,
  epistemicClassSeparationRequired:true
});

function cleanArray(xs){return Array.isArray(xs)?xs.map(String):[];}

export function tcxResearchOsContract(){
  const core={
    version:TCX_RESEARCH_OS_CANON_VERSION,
    dna:[...TCX_RESEARCH_OS_DNA],
    epistemicClasses:[...TCX_EPISTEMIC_CLASSES],
    layers:TCX_RESEARCH_OS_LAYERS.map(x=>({...x,upstream:[...x.upstream]})),
    promotionStages:[...TCX_PROMOTION_STAGES],
    invariants:{...TCX_RESEARCH_OS_INVARIANTS}
  };
  return deepFreeze({...core,fingerprint:sha256(core)});
}

export function verifyTcxResearchOsDecisionEnvelope(envelope={}){
  const reasons=[];
  const epistemic=String(envelope.epistemicClass||'').toUpperCase();
  const execution=String(envelope.execution||'').toUpperCase();
  const action=String(envelope.action||'').toUpperCase();

  if(execution!=='SHADOW_ONLY') reasons.push('EXECUTION_INVARIANT');
  if(envelope.canExecuteLive!==false) reasons.push('LIVE_EXECUTION_INVARIANT');
  if(envelope.pointInTime!==true) reasons.push('POINT_IN_TIME_REQUIRED');
  if(envelope.futureLeakage===true) reasons.push('FUTURE_LEAKAGE_BLOCK');
  if(!TCX_EPISTEMIC_CLASSES.includes(epistemic)) reasons.push('EPISTEMIC_CLASS_REQUIRED');
  if(envelope.provenanceReady!==true) reasons.push('PROVENANCE_REQUIRED');
  if(envelope.auditReady!==true) reasons.push('AUDIT_REQUIRED');
  if(envelope.uncertaintyReady!==true) reasons.push('UNCERTAINTY_REQUIRED');
  if(envelope.invalidationReady!==true) reasons.push('INVALIDATION_REQUIRED');

  const criticalDisagreement=Boolean(envelope.criticalDisagreement);
  const criticalUnknowns=cleanArray(envelope.criticalUnknowns);
  const safetyBlocked=reasons.length>0||criticalDisagreement||criticalUnknowns.length>0;
  if(safetyBlocked&&action!=='ABSTAIN') reasons.push('FAILURE_FIRST_REQUIRES_ABSTAIN');

  return deepFreeze({
    version:TCX_RESEARCH_OS_CANON_VERSION,
    ok:reasons.length===0,
    gate:reasons.length?'ABSTAIN':'PASS',
    reasons:Object.freeze([...new Set(reasons)]),
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecuteLive:false
  });
}

export function verifyTcxPromotionCandidate(candidate={}){
  const reasons=[];
  const stage=String(candidate.stage||'').toUpperCase();
  const stageIndex=TCX_PROMOTION_STAGES.indexOf(stage);
  if(stageIndex<0) reasons.push('UNKNOWN_PROMOTION_STAGE');

  if(candidate.pointInTimeSafe!==true) reasons.push('PIT_SAFETY_REQUIRED');
  if(candidate.futureLeakageDetected===true) reasons.push('FUTURE_LEAKAGE_DETECTED');
  if(candidate.auditReproducible!==true) reasons.push('AUDIT_REPRODUCIBILITY_REQUIRED');
  if(candidate.scientificGuardsPassed!==true) reasons.push('SCIENTIFIC_GUARDS_REQUIRED');

  if(stage==='PRIMARY'){
    if(candidate.forwardShadowPassed!==true) reasons.push('FORWARD_SHADOW_REQUIRED');
    if(candidate.calibrationPassed!==true) reasons.push('CALIBRATION_REQUIRED');
    if(candidate.stressPassed!==true) reasons.push('STRESS_VALIDATION_REQUIRED');
    if(candidate.chronologicalStabilityPassed!==true) reasons.push('CHRONOLOGICAL_STABILITY_REQUIRED');
    if(candidate.concentrationChecksPassed!==true) reasons.push('CONCENTRATION_CHECKS_REQUIRED');
    if(candidate.edgeDecayClear!==true) reasons.push('EDGE_DECAY_CLEARANCE_REQUIRED');
  }

  return deepFreeze({
    version:TCX_RESEARCH_OS_CANON_VERSION,
    stage,
    promotable:reasons.length===0,
    reasons:Object.freeze(reasons),
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecuteLive:false
  });
}

export function assertTcxResearchOsLayerDependency({consumerLayer,dependencyLayer}={}){
  const byId=new Map(TCX_RESEARCH_OS_LAYERS.map(x=>[x.id,x]));
  const consumer=byId.get(String(consumerLayer||'').toUpperCase());
  const dependency=byId.get(String(dependencyLayer||'').toUpperCase());
  if(!consumer||!dependency){
    return deepFreeze({
      ok:false,
      reason:'UNKNOWN_LAYER',
      execution:'SHADOW_ONLY',
      action:'ABSTAIN',
      canExecuteLive:false
    });
  }
  const ok=dependency.rank<consumer.rank;
  return deepFreeze({
    ok,
    consumerLayer:consumer.id,
    dependencyLayer:dependency.id,
    reason:ok?'UPSTREAM_DEPENDENCY_VALID':'DOWNSTREAM_OR_PEER_TRUTH_DEPENDENCY_BLOCKED',
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecuteLive:false
  });
}
