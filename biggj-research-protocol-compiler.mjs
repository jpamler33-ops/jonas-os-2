import { sha256 } from './institutional-kernel.mjs';
import {
  evaluateBiggjSkillProgress,
  verifyBiggjSkillTree
} from './biggj-skill-tree.mjs';
import { evaluateBiggjSkillDependencyGate } from './biggj-skill-dependency-graph.mjs';

export const BIGGJ_RESEARCH_PROTOCOL_VERSION='TCX_BIGGJ_RESEARCH_PROTOCOL_V1';

export const BIGGJ_RESEARCH_PROTOCOL_POLICY=Object.freeze({
  discoveryToLearning:{
    minEvidence:3,
    minIndependentEpisodes:2
  },
  learningToTesting:{
    minEvidence:10,
    minIndependentEpisodes:5,
    requirePit:true,
    requireAudit:true
  },
  testingToValidation:{
    minForwardShadow:30,
    minIndependentEpisodes:20,
    requirePit:true,
    requireAudit:true,
    requireScientificGuards:true,
    requireChronologicalStability:true,
    requireCostStress:true,
    requireConcentrationStress:true,
    requireWinnerRemoval:true
  },
  familyAlpha:.05,
  multipleTestingAdjustment:'HOLM'
});

const deepFreeze=value=>{
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    Object.freeze(value);
    for(const v of Object.values(value)) deepFreeze(v);
  }
  return value;
};
const uniq=xs=>[...new Set((xs||[]).map(String).filter(Boolean))].sort();
const finite=(v,name)=>{
  const n=Number(v);
  if(!Number.isFinite(n)) throw new Error(name+' must be finite');
  return n;
};
const coreOf=value=>{
  const {fingerprint,...core}=value||{};
  return core;
};
const finalized=core=>deepFreeze({...core,fingerprint:sha256(core)});

function contractCore(skill){
  return {
    skillId:skill.skillId,
    parentSkillId:skill.parentSkillId,
    title:skill.title,
    purpose:skill.purpose,
    question:skill.question,
    hypothesis:skill.hypothesis,
    falsifier:skill.falsifier,
    dependencies:uniq(skill.dependencies),
    createdAt:Number(skill.createdAt),
    discoveredBy:skill.discoveredBy
  };
}

function validateAgenda(skill,agendaItem){
  if(!agendaItem) return;
  if(agendaItem?.researchContract?.question&&
     String(agendaItem.researchContract.question)!==String(skill.question)){
    throw new Error('agenda question differs from frozen skill contract');
  }
  if(agendaItem?.researchContract?.hypothesis&&
     String(agendaItem.researchContract.hypothesis)!==String(skill.hypothesis)){
    throw new Error('agenda hypothesis differs from frozen skill contract');
  }
  if(agendaItem?.researchContract?.falsifier&&
     String(agendaItem.researchContract.falsifier)!==String(skill.falsifier)){
    throw new Error('agenda falsifier differs from frozen skill contract');
  }
}

export function compileBiggjResearchProtocol({
  tree,
  skillId,
  agendaItem=null,
  registeredAt=Date.now()
}={}){
  const tv=verifyBiggjSkillTree(tree);
  if(!tv.ok) throw new Error('skill tree invalid: '+tv.reasons.join(','));
  const skill=(tree.nodes||[]).find(x=>String(x.skillId)===String(skillId));
  if(!skill) throw new Error('skill missing');
  if(skill.kind!=='DISCOVERED_SKILL') throw new Error('research protocol requires discovered skill');
  if(skill.promotionStage!=='RESEARCH_ONLY') throw new Error('skill must still be research-only at protocol registration');
  if(skill.productionMutationAllowed!==false||skill.execution!=='SHADOW_ONLY'||skill.canExecuteLive!==false){
    throw new Error('skill research safety invariant invalid');
  }
  const registered=finite(registeredAt,'registeredAt');
  const created=finite(skill.createdAt,'skill.createdAt');
  if(registered<created) throw new Error('protocol cannot predate skill creation');
  validateAgenda(skill,agendaItem);

  const frozenContract=contractCore(skill);
  const researchGate=evaluateBiggjSkillDependencyGate(tree,{skillId:skill.skillId,phase:'RESEARCH'});
  const assumptionId=String(agendaItem?.assumptionId||'UNMAPPED_RESEARCH_ASSUMPTION');
  const protocolCore={
    version:BIGGJ_RESEARCH_PROTOCOL_VERSION,
    protocolId:'protocol:'+sha256({
      skillId:skill.skillId,
      assumptionId,
      frozenContract,
      registeredAt:registered
    }).slice(0,28),
    skillId:skill.skillId,
    assumptionId,
    registeredAt:registered,
    skillCreatedAt:created,
    backfilledForExistingSkill:registered>created,
    frozenSkillContractFingerprint:sha256(frozenContract),
    frozenSkillContract:frozenContract,
    preregistration:{
      confirmatoryEvidenceMustBeKnownAfter:registered,
      discoveryEvidenceAtOrBeforeRegistrationIsInSample:true,
      protocolAmendmentPolicy:'NEW_VERSION_NEW_PROTOCOL_ID',
      outcomePeekingAmendmentsForbidden:true,
      retrospectiveConfirmatoryRelabelingForbidden:true
    },
    design:{
      mode:'PROSPECTIVE_OBSERVATIONAL_FORWARD_SHADOW',
      unitOfAnalysis:'CONSERVATIVE_RESEARCH_EPISODE',
      treatmentOrIntervention:'NONE_OBSERVATIONAL_RESEARCH_ONLY',
      discoveryPopulation:'PERSISTENT_THESIS_ASSUMPTION_FAILURES',
      controlPopulation:[
        'TRANSIENT_FLICKER_CASES',
        'NON_PERSISTENT_COMPARABLE_THESIS_CASES'
      ],
      primaryEndpoints:[
        'PERSISTENT_FALSIFIER_REPRODUCIBILITY_ACROSS_INDEPENDENT_EPISODES',
        'PERSISTENT_VS_TRANSIENT_FALSIFIER_SPECIFICITY'
      ],
      secondaryEndpoints:[
        'DIRECTION_FAILURE_ASSOCIATION',
        'INTERVAL_MISS_ASSOCIATION',
        'RECOVERY_FAILURE_RATE',
        'STRUCTURAL_WARNING_LEAD_TIME'
      ],
      negativeControls:[
        'DISCOVERY_COHORT_EXCLUDED_FROM_CONFIRMATORY_COUNTS',
        'TRANSIENT_FLICKER_WITH_SAME_FALSIFIER',
        'UNRESOLVED_EPISODE_INDEPENDENCE_COUNTS_AS_ZERO_INDEPENDENT_EPISODES'
      ],
      subgroupPlan:[
        'SYMBOL',
        'REGIME',
        'FALSIFIER_CODE',
        'FORECAST_HORIZON_WHEN_AVAILABLE'
      ]
    },
    samplePlan:structuredClone(BIGGJ_RESEARCH_PROTOCOL_POLICY),
    dependencySnapshot:{
      researchReady:researchGate.ready,
      blockers:researchGate.blockers.map(x=>({
        dependencySkillId:x.dependencySkillId,
        dependencyCapabilityId:x.dependencyCapabilityId,
        relation:x.relation,
        requiredState:x.requiredState,
        actualState:x.actualState
      })),
      warnings:researchGate.warnings.map(x=>({
        dependencySkillId:x.dependencySkillId,
        dependencyCapabilityId:x.dependencyCapabilityId,
        relation:x.relation,
        requiredState:x.requiredState,
        actualState:x.actualState
      }))
    },
    evidencePolicy:{
      pointInTimeRequired:true,
      futureLeakageForbidden:true,
      forwardShadowRequiredForValidation:true,
      independentEpisodesResolvedConservatively:true,
      commonCauseCasesMustShareEpisode:true,
      unresolvedIndependenceCannotIncreaseIndependentEpisodeCount:true,
      discoveryEvidenceCannotValidateHypothesis:true,
      outcomeAssociationDoesNotEstablishCausation:true
    },
    analysisPolicy:{
      familyAlpha:BIGGJ_RESEARCH_PROTOCOL_POLICY.familyAlpha,
      multipleTestingAdjustment:BIGGJ_RESEARCH_PROTOCOL_POLICY.multipleTestingAdjustment,
      primaryEndpointChangeRequiresNewProtocol:true,
      falsifierChangeRequiresNewProtocol:true,
      hypothesisChangeRequiresNewProtocol:true,
      reportNullAndNegativeResults:true
    },
    authority:{
      automaticExperimentLaunch:false,
      automaticSkillStatusTransition:false,
      automaticPromotion:false,
      automaticKill:false,
      primaryMutationAllowed:false,
      tradingPolicyMutationAllowed:false
    },
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canInfluencePrimary:false,
    canExecuteLive:false
  };
  return finalized(protocolCore);
}

export function verifyBiggjResearchProtocol(protocol){
  try{
    const reasons=[];
    if(protocol?.version!==BIGGJ_RESEARCH_PROTOCOL_VERSION) reasons.push('VERSION_INVALID');
    if(!String(protocol?.protocolId||'').startsWith('protocol:')) reasons.push('PROTOCOL_ID_INVALID');
    if(!String(protocol?.skillId||'')) reasons.push('SKILL_ID_MISSING');
    if(!Number.isFinite(Number(protocol?.registeredAt))) reasons.push('REGISTERED_AT_INVALID');
    if(Number(protocol?.registeredAt)<Number(protocol?.skillCreatedAt)) reasons.push('TIME_ORDER_INVALID');
    if(protocol?.execution!=='SHADOW_ONLY'||protocol?.action!=='ABSTAIN'||
       protocol?.canInfluencePrimary!==false||protocol?.canExecuteLive!==false){
      reasons.push('SAFETY_INVARIANT_INVALID');
    }
    if(protocol?.authority?.automaticExperimentLaunch!==false||
       protocol?.authority?.automaticSkillStatusTransition!==false||
       protocol?.authority?.automaticPromotion!==false||
       protocol?.authority?.automaticKill!==false||
       protocol?.authority?.primaryMutationAllowed!==false||
       protocol?.authority?.tradingPolicyMutationAllowed!==false){
      reasons.push('AUTHORITY_INVARIANT_INVALID');
    }
    if(protocol?.preregistration?.retrospectiveConfirmatoryRelabelingForbidden!==true){
      reasons.push('PREREGISTRATION_INVARIANT_INVALID');
    }
    const expected=sha256(coreOf(protocol));
    if(protocol?.fingerprint!==expected) reasons.push('FINGERPRINT_MISMATCH');
    return {ok:reasons.length===0,reasons,expectedFingerprint:expected};
  }catch(err){
    return {
      ok:false,
      reasons:['RESEARCH_PROTOCOL_INVALID',err instanceof Error?err.message:String(err)],
      expectedFingerprint:null
    };
  }
}

function evidenceAfterProtocol(skill,protocol){
  return (skill?.evidence||[]).filter(e=>
    Number(e?.availableAt)>Number(protocol.registeredAt)&&
    e?.pointInTime===true&&
    e?.futureLeakage===false
  );
}

export function evaluateBiggjResearchProtocol(protocol,tree){
  const pv=verifyBiggjResearchProtocol(protocol);
  if(!pv.ok) throw new Error('research protocol invalid: '+pv.reasons.join(','));
  const tv=verifyBiggjSkillTree(tree);
  if(!tv.ok) throw new Error('skill tree invalid: '+tv.reasons.join(','));
  const skill=(tree.nodes||[]).find(x=>x.skillId===protocol.skillId);
  if(!skill) throw new Error('protocol skill missing');
  const frozen=sha256(contractCore(skill));
  const contractDrift=frozen!==protocol.frozenSkillContractFingerprint;
  const evidence=evidenceAfterProtocol(skill,protocol);
  const independentEpisodes=new Set(
    evidence.map(x=>x.independentEpisodeId).filter(Boolean)
  ).size;
  const forwardShadow=evidence.filter(x=>x.forwardShadow===true).length;
  const auditReady=evidence.filter(x=>x.auditReady===true).length;
  const sciencePassed=evidence.filter(x=>x.scientificGuardsPassed===true).length;
  const chronologicalStable=evidence.filter(x=>x.chronologicalStable===true).length;
  const costStress=evidence.filter(x=>x.costStressPassed===true).length;
  const concentration=evidence.filter(x=>x.concentrationPassed===true).length;
  const winnerRemoval=evidence.filter(x=>x.winnerRemovalPassed===true).length;
  const progress=evaluateBiggjSkillProgress(tree,skill.skillId);

  const learningReady=
    evidence.length>=BIGGJ_RESEARCH_PROTOCOL_POLICY.discoveryToLearning.minEvidence&&
    independentEpisodes>=BIGGJ_RESEARCH_PROTOCOL_POLICY.discoveryToLearning.minIndependentEpisodes;
  const testingEvidenceReady=
    evidence.length>=BIGGJ_RESEARCH_PROTOCOL_POLICY.learningToTesting.minEvidence&&
    independentEpisodes>=BIGGJ_RESEARCH_PROTOCOL_POLICY.learningToTesting.minIndependentEpisodes&&
    auditReady===evidence.length;
  const validationEvidenceReady=
    forwardShadow>=BIGGJ_RESEARCH_PROTOCOL_POLICY.testingToValidation.minForwardShadow&&
    independentEpisodes>=BIGGJ_RESEARCH_PROTOCOL_POLICY.testingToValidation.minIndependentEpisodes&&
    auditReady===evidence.length&&
    sciencePassed===evidence.length&&
    chronologicalStable>=Math.min(20,forwardShadow)&&
    costStress>=Math.min(20,forwardShadow)&&
    concentration>=Math.min(20,forwardShadow)&&
    winnerRemoval>=Math.min(20,forwardShadow);

  let state='AWAITING_PROSPECTIVE_EVIDENCE';
  const reasons=[];
  if(contractDrift){
    state='PROTOCOL_INVALIDATED_BY_CONTRACT_DRIFT';
    reasons.push('FROZEN_SKILL_CONTRACT_CHANGED');
  }else if(validationEvidenceReady){
    state='VALIDATION_REVIEW_EVIDENCE_READY';
  }else if(testingEvidenceReady){
    state='FORMAL_TESTING_REVIEW_EVIDENCE_READY';
  }else if(learningReady){
    state='LEARNING_REVIEW_EVIDENCE_READY';
  }else if(evidence.length>0){
    state='COLLECTING_PROSPECTIVE_EVIDENCE';
  }else{
    reasons.push('POST_REGISTRATION_EVIDENCE_REQUIRED');
  }

  return finalized({
    version:BIGGJ_RESEARCH_PROTOCOL_VERSION,
    protocolId:protocol.protocolId,
    skillId:skill.skillId,
    evaluatedAt:Math.max(Number(protocol.registeredAt),...evidence.map(x=>Number(x.availableAt)||0)),
    state,
    contractDrift,
    postRegistrationEvidence:{
      total:evidence.length,
      forwardShadow,
      independentEpisodes,
      auditReady,
      sciencePassed,
      chronologicalStable,
      costStress,
      concentration,
      winnerRemoval
    },
    currentSkillProgress:{
      currentStatus:progress.currentStatus,
      recommendedStatus:progress.recommendedStatus,
      reasons:[...(progress.reasons||[])]
    },
    reasons,
    authority:{
      reviewOnly:true,
      automaticSkillStatusTransition:false,
      automaticPromotion:false,
      automaticExperimentLaunch:false,
      primaryMutationAllowed:false
    },
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canInfluencePrimary:false,
    canExecuteLive:false
  });
}

export function researchProtocolSummary(protocol,tree=null){
  const v=verifyBiggjResearchProtocol(protocol);
  const evaluation=tree&&v.ok?evaluateBiggjResearchProtocol(protocol,tree):null;
  return deepFreeze({
    version:protocol?.version??BIGGJ_RESEARCH_PROTOCOL_VERSION,
    protocolId:protocol?.protocolId??null,
    skillId:protocol?.skillId??null,
    assumptionId:protocol?.assumptionId??null,
    registeredAt:protocol?.registeredAt??null,
    backfilledForExistingSkill:protocol?.backfilledForExistingSkill===true,
    integrity:v.ok?'VALID':'INVALID',
    state:evaluation?.state??'NOT_EVALUATED',
    postRegistrationEvidence:evaluation?.postRegistrationEvidence??null,
    automaticExperimentLaunch:false,
    automaticSkillStatusTransition:false,
    automaticPromotion:false,
    primaryMutationAllowed:false,
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canInfluencePrimary:false,
    canExecuteLive:false
  });
}
