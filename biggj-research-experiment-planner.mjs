import { sha256 } from './institutional-kernel.mjs';
import { verifyBiggjSkillTree } from './biggj-skill-tree.mjs';
import {
  verifyBiggjResearchProtocol,
  evaluateBiggjResearchProtocol
} from './biggj-research-protocol-compiler.mjs';
import {
  buildBiggjResearchValidationHarness
} from './biggj-research-validation-harness.mjs';

export const BIGGJ_RESEARCH_EXPERIMENT_PLANNER_VERSION='TCX_BIGGJ_RESEARCH_EXPERIMENT_PLANNER_V1';

const deepFreeze=value=>{
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    Object.freeze(value);
    for(const v of Object.values(value)) deepFreeze(v);
  }
  return value;
};
const clone=v=>v==null?v:structuredClone(v);
const finite=(v,f=null)=>{
  if(v===null||v===undefined||v==='') return f;
  const n=Number(v);
  return Number.isFinite(n)?n:f;
};
const uniq=xs=>[...new Set((xs||[]).map(String).filter(Boolean))].sort();

const BLOCKER_KIND=Object.freeze({
  QUESTION_DECLARED:'DECLARATION_REPAIR',
  HYPOTHESIS_DECLARED:'DECLARATION_REPAIR',
  FALSIFIER_DECLARED:'DECLARATION_REPAIR',
  TOTAL_EVIDENCE:'PROSPECTIVE_EVIDENCE_COLLECTION',
  INDEPENDENT_EPISODES:'PROSPECTIVE_EVIDENCE_COLLECTION',
  ALL_EVIDENCE_PIT_SAFE:'EVIDENCE_INTEGRITY_REPAIR',
  ALL_EVIDENCE_AUDIT_READY:'EVIDENCE_INTEGRITY_REPAIR',
  TESTING_DEPENDENCY_GATE_READY:'DEPENDENCY_REMEDIATION',
  FORWARD_SHADOW:'PROSPECTIVE_FORWARD_SHADOW',
  ALL_EVIDENCE_SCIENCE_PASSED:'SCIENTIFIC_GUARD_AUDIT',
  CHRONOLOGICAL_STABILITY:'ROBUSTNESS_STRESS',
  COST_STRESS:'ROBUSTNESS_STRESS',
  CONCENTRATION_STRESS:'ROBUSTNESS_STRESS',
  WINNER_REMOVAL:'ROBUSTNESS_STRESS',
  POSITIVE_RATE_GT_50_PERCENT:'PROSPECTIVE_LABELLED_OUTCOME_COLLECTION',
  DECISION_DEPENDENCY_GATE_READY:'DEPENDENCY_REMEDIATION',
  POSITIVE_RATE_GT_52_PERCENT:'PROSPECTIVE_LABELLED_OUTCOME_COLLECTION',
  TRUST_DEPENDENCY_GATE_READY:'DEPENDENCY_REMEDIATION',
  FORWARD_EVIDENCE_NOT_DECAYING:'DECAY_DIAGNOSTIC'
});

function endpointFor(blockerId){
  const map={
    QUESTION_DECLARED:['DECLARED_RESEARCH_QUESTION'],
    HYPOTHESIS_DECLARED:['DECLARED_FALSIFIABLE_HYPOTHESIS'],
    FALSIFIER_DECLARED:['DECLARED_FALSIFIER'],
    TOTAL_EVIDENCE:['VALIDATION_ELIGIBLE_EVIDENCE_COUNT'],
    INDEPENDENT_EPISODES:['CONSERVATIVE_INDEPENDENT_EPISODE_COUNT'],
    ALL_EVIDENCE_PIT_SAFE:['POINT_IN_TIME_EVIDENCE_COVERAGE'],
    ALL_EVIDENCE_AUDIT_READY:['AUDIT_READY_EVIDENCE_COVERAGE'],
    TESTING_DEPENDENCY_GATE_READY:['TESTING_DEPENDENCY_GATE'],
    FORWARD_SHADOW:['VALIDATION_FORWARD_SHADOW_COUNT'],
    ALL_EVIDENCE_SCIENCE_PASSED:['SCIENTIFIC_GUARD_PASS_COVERAGE'],
    CHRONOLOGICAL_STABILITY:['CHRONOLOGICAL_STABILITY_PASS_COUNT'],
    COST_STRESS:['COST_STRESS_PASS_COUNT'],
    CONCENTRATION_STRESS:['CONCENTRATION_STRESS_PASS_COUNT'],
    WINNER_REMOVAL:['WINNER_REMOVAL_PASS_COUNT'],
    POSITIVE_RATE_GT_50_PERCENT:['FORWARD_VALIDATION_POSITIVE_RATE'],
    DECISION_DEPENDENCY_GATE_READY:['DECISION_DEPENDENCY_GATE'],
    POSITIVE_RATE_GT_52_PERCENT:['REPLICATED_FORWARD_VALIDATION_POSITIVE_RATE'],
    TRUST_DEPENDENCY_GATE_READY:['TRUST_DEPENDENCY_GATE'],
    FORWARD_EVIDENCE_NOT_DECAYING:['RECENT_FORWARD_NEGATIVE_RATE','FORWARD_EVIDENCE_DECAY_STATE']
  };
  return map[blockerId]||['BLOCKER_RESOLUTION'];
}

function interventionFor(kind,blockerId){
  const byKind={
    DECLARATION_REPAIR:'Freeze the missing research declaration before collecting any additional confirmatory evidence.',
    PROSPECTIVE_EVIDENCE_COLLECTION:'Collect new point-in-time evidence after protocol registration without changing the frozen hypothesis or falsifier.',
    EVIDENCE_INTEGRITY_REPAIR:'Repair, exclude, or re-collect evidence that does not satisfy the required integrity property; do not relabel old rows as compliant.',
    DEPENDENCY_REMEDIATION:'Resolve the blocking prerequisite capability and re-evaluate the dependency gate without weakening the required state.',
    PROSPECTIVE_FORWARD_SHADOW:'Continue prospective forward-shadow observation under the frozen protocol and incumbent baseline.',
    SCIENTIFIC_GUARD_AUDIT:'Run the scientific guard suite over validation-eligible evidence and exclude rows that fail rather than weakening the guard.',
    ROBUSTNESS_STRESS:'Run the specified robustness stress against the same frozen evidence set and protocol; record both passes and failures.',
    PROSPECTIVE_LABELLED_OUTCOME_COLLECTION:'Collect additional labelled prospective outcomes under the frozen protocol until the evidence requirement is met or the hypothesis is falsified.',
    DECAY_DIAGNOSTIC:'Investigate recent negative forward evidence as a prospective decay question without retaining trust by default.'
  };
  return byKind[kind]||('Resolve validation blocker '+String(blockerId)+'.');
}

function stoppingRule(review,protocol,kind){
  const blocker=review?.nextExperiment||{};
  const rules=[
    'STOP_WHEN_TARGET_BLOCKER_SATISFIED',
    'STOP_IF_FROZEN_SKILL_CONTRACT_DRIFTS',
    'STOP_IF_PROTOCOL_IS_INVALIDATED',
    'STOP_IF_DECLARED_FALSIFIER_IS_MET',
    'STOP_ON_MANUAL_CANCELLATION'
  ];
  if(kind==='PROSPECTIVE_EVIDENCE_COLLECTION'||kind==='PROSPECTIVE_FORWARD_SHADOW'||kind==='PROSPECTIVE_LABELLED_OUTCOME_COLLECTION'){
    rules.push('DO_NOT_USE_DISCOVERY_COHORT_TO_FILL_CONFIRMATORY_REQUIREMENT');
    rules.push('UNRESOLVED_EPISODE_INDEPENDENCE_COUNTS_AS_ZERO');
  }
  return {
    rules,
    targetCurrent:blocker.targetCurrent??null,
    targetRequired:blocker.targetRequired??null,
    requiredAdditional:
      finite(blocker.targetCurrent)!=null&&finite(blocker.targetRequired)!=null
        ?Math.max(0,Number(blocker.targetRequired)-Number(blocker.targetCurrent))
        :null,
    noOptionalStoppingOnPositiveResult:true,
    negativeAndNullResultsMustBeRetained:true,
    protocolRegisteredAt:protocol?.registeredAt??null
  };
}

function matchProtocol(protocols,skillId){
  return (protocols||[])
    .filter(p=>String(p?.skillId)===String(skillId))
    .sort((a,b)=>Number(b?.registeredAt||0)-Number(a?.registeredAt||0)||String(a?.protocolId).localeCompare(String(b?.protocolId)))[0]||null;
}

export function compileBiggjResearchExperimentPlan({
  tree,
  protocol,
  validationReview,
  plannedAt=null
}={}){
  const tv=verifyBiggjSkillTree(tree);
  if(!tv.ok) throw new Error('skill tree invalid: '+tv.reasons.join(','));
  const pv=verifyBiggjResearchProtocol(protocol);
  if(!pv.ok) throw new Error('research protocol invalid: '+pv.reasons.join(','));
  if(String(protocol.skillId)!==String(validationReview?.skillId)) throw new Error('protocol/review skill mismatch');

  const node=(tree.nodes||[]).find(x=>String(x.skillId)===String(protocol.skillId));
  if(!node) throw new Error('skill missing');
  const protocolEval=evaluateBiggjResearchProtocol(protocol,tree);
  const blockerId=String(validationReview?.nextExperiment?.experimentId||'NO_BLOCKING_DEFICIT');
  const kind=BLOCKER_KIND[blockerId]||(
    blockerId==='NO_BLOCKING_DEFICIT'?'NO_BLOCKING_DEFICIT':'UNCLASSIFIED_RESEARCH_DEFICIT'
  );
  const t=finite(plannedAt,finite(tree.asOf,Date.now()));
  const ready=
    blockerId!=='NO_BLOCKING_DEFICIT'&&
    kind!=='DECLARATION_REPAIR'&&
    !String(protocolEval?.state||'').startsWith('PROTOCOL_INVALIDATED');

  const planCore={
    version:BIGGJ_RESEARCH_EXPERIMENT_PLANNER_VERSION,
    plannedAt:t,
    skillId:node.skillId,
    skillTitle:node.title,
    skillStatus:node.status,
    protocolId:protocol.protocolId,
    protocolFingerprint:protocol.fingerprint,
    protocolState:protocolEval.state,
    protocolRegisteredAt:protocol.registeredAt,
    frozenSkillContractFingerprint:protocol.frozenSkillContractFingerprint,
    validationReviewFingerprint:validationReview.fingerprint,
    validationPhase:validationReview.validationPhase,
    readinessScore:validationReview.readinessScore,
    blocker:{
      id:blockerId,
      kind,
      purpose:String(validationReview?.nextExperiment?.purpose||''),
      targetCurrent:validationReview?.nextExperiment?.targetCurrent??null,
      targetRequired:validationReview?.nextExperiment?.targetRequired??null
    },
    design:{
      mode:kind==='NO_BLOCKING_DEFICIT'
        ?'NO_NEW_EXPERIMENT_REQUIRED'
        :'PREREGISTERED_SHADOW_RESEARCH_PLAN',
      intervention:interventionFor(kind,blockerId),
      unitOfAnalysis:protocol?.design?.unitOfAnalysis||'CONSERVATIVE_RESEARCH_EPISODE',
      discoveryPopulation:protocol?.design?.discoveryPopulation||null,
      controlPopulation:clone(protocol?.design?.controlPopulation||[]),
      primaryEndpoints:endpointFor(blockerId),
      protocolPrimaryEndpoints:clone(protocol?.design?.primaryEndpoints||[]),
      secondaryEndpoints:clone(protocol?.design?.secondaryEndpoints||[]),
      negativeControls:clone(protocol?.design?.negativeControls||[]),
      subgroupPlan:clone(protocol?.design?.subgroupPlan||[]),
      stoppingRule:stoppingRule(validationReview,protocol,kind)
    },
    evidencePolicy:clone(protocol.evidencePolicy),
    analysisPolicy:clone(protocol.analysisPolicy),
    dependencySnapshot:clone(protocol.dependencySnapshot),
    frozenResearchContract:clone(protocol.frozenSkillContract),
    planReadyForShadowResearchReview:ready,
    manualLaunchReviewRequired:ready,
    automaticExperimentLaunchAllowed:false,
    automaticSkillStatusTransitionAllowed:false,
    automaticPromotionAllowed:false,
    automaticKillAllowed:false,
    primaryMutationAllowed:false,
    tradingPolicyMutationAllowed:false,
    semantics:{
      planDoesNotLaunchExperiment:true,
      planDoesNotChangeSkillStatus:true,
      planCannotAmendFrozenHypothesis:true,
      planCannotAmendFrozenFalsifier:true,
      discoveryEvidenceCannotBeRelabelledAsConfirmatory:true,
      outcomeAssociationDoesNotEstablishCausation:true,
      readinessScoreIsDiagnosticNotProbability:true
    },
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canInfluencePrimary:false,
    canExecuteLive:false
  };
  const planId='research-plan:'+sha256({
    skillId:planCore.skillId,
    protocolId:planCore.protocolId,
    protocolFingerprint:planCore.protocolFingerprint,
    validationReviewFingerprint:planCore.validationReviewFingerprint,
    blocker:planCore.blocker,
    design:planCore.design
  }).slice(0,28);
  return deepFreeze({...planCore,planId,fingerprint:sha256({...planCore,planId})});
}

export function verifyBiggjResearchExperimentPlan(value){
  try{
    const reasons=[];
    if(value?.version!==BIGGJ_RESEARCH_EXPERIMENT_PLANNER_VERSION) reasons.push('VERSION_INVALID');
    if(!String(value?.planId||'').startsWith('research-plan:')) reasons.push('PLAN_ID_INVALID');
    if(value?.execution!=='SHADOW_ONLY'||value?.action!=='ABSTAIN'||value?.canInfluencePrimary!==false||value?.canExecuteLive!==false){
      reasons.push('SAFETY_INVARIANT_INVALID');
    }
    for(const key of [
      'automaticExperimentLaunchAllowed',
      'automaticSkillStatusTransitionAllowed',
      'automaticPromotionAllowed',
      'automaticKillAllowed',
      'primaryMutationAllowed',
      'tradingPolicyMutationAllowed'
    ]){
      if(value?.[key]!==false) reasons.push('AUTHORITY_INVALID:'+key);
    }
    if(value?.semantics?.planDoesNotLaunchExperiment!==true) reasons.push('PLAN_LAUNCH_SEMANTIC_INVALID');
    if(value?.semantics?.planCannotAmendFrozenHypothesis!==true) reasons.push('HYPOTHESIS_FREEZE_INVALID');
    if(value?.semantics?.planCannotAmendFrozenFalsifier!==true) reasons.push('FALSIFIER_FREEZE_INVALID');
    const {fingerprint,...core}=value||{};
    const expected=sha256(core);
    if(fingerprint!==expected) reasons.push('FINGERPRINT_MISMATCH');
    return {ok:reasons.length===0,reasons,expectedFingerprint:expected};
  }catch(err){
    return {ok:false,reasons:['RESEARCH_EXPERIMENT_PLAN_INVALID',err instanceof Error?err.message:String(err)]};
  }
}

export function buildBiggjResearchExperimentPlanner({
  tree,
  protocols=[],
  limit=50,
  plannedAt=null
}={}){
  const tv=verifyBiggjSkillTree(tree);
  if(!tv.ok) throw new Error('skill tree invalid: '+tv.reasons.join(','));
  const harness=buildBiggjResearchValidationHarness(tree,{limit:Math.max(50,Number(limit)||50)});
  const plans=[];
  const missingProtocolSkillIds=[];

  for(const review of harness.reviews){
    const protocol=matchProtocol(protocols,review.skillId);
    if(!protocol){
      missingProtocolSkillIds.push(review.skillId);
      continue;
    }
    plans.push(compileBiggjResearchExperimentPlan({
      tree,
      protocol,
      validationReview:review,
      plannedAt:finite(plannedAt,tree.asOf)
    }));
  }

  plans.sort((a,b)=>
    Number(b.manualLaunchReviewRequired)-Number(a.manualLaunchReviewRequired)||
    Number(b.readinessScore)-Number(a.readinessScore)||
    String(a.skillId).localeCompare(String(b.skillId))
  );

  const limited=plans.slice(0,Math.max(1,Math.floor(Number(limit)||50)));
  const core={
    version:BIGGJ_RESEARCH_EXPERIMENT_PLANNER_VERSION,
    plannedAt:finite(plannedAt,tree.asOf),
    treeFingerprint:tree.fingerprint,
    protocolCount:(protocols||[]).length,
    discoveredSkillCount:harness.discoveredSkillCount,
    missingProtocolSkillIds:uniq(missingProtocolSkillIds),
    planCount:plans.length,
    manualLaunchReviewRequired:plans.filter(x=>x.manualLaunchReviewRequired).length,
    plans:limited,
    invariants:{
      automaticExperimentLaunchAllowed:false,
      automaticSkillStatusTransitionAllowed:false,
      automaticPromotionAllowed:false,
      automaticKillAllowed:false,
      primaryMutationAllowed:false,
      tradingPolicyMutationAllowed:false
    },
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canInfluencePrimary:false,
    canExecuteLive:false
  };
  return deepFreeze({...core,fingerprint:sha256(core)});
}

export function biggjResearchExperimentPlannerSummary({
  tree,
  protocols=[],
  limit=5,
  plannedAt=null
}={}){
  const planner=buildBiggjResearchExperimentPlanner({
    tree,
    protocols,
    limit:Math.max(20,Number(limit)||5),
    plannedAt
  });
  return deepFreeze({
    version:planner.version,
    plannedAt:planner.plannedAt,
    planCount:planner.planCount,
    manualLaunchReviewRequired:planner.manualLaunchReviewRequired,
    missingProtocolSkillIds:planner.missingProtocolSkillIds,
    topPlans:planner.plans.slice(0,Math.max(1,Number(limit)||5)).map(p=>({
      planId:p.planId,
      skillId:p.skillId,
      skillTitle:p.skillTitle,
      validationPhase:p.validationPhase,
      readinessScore:p.readinessScore,
      blockerId:p.blocker.id,
      blockerKind:p.blocker.kind,
      requiredAdditional:p.design.stoppingRule.requiredAdditional,
      primaryEndpoints:p.design.primaryEndpoints,
      protocolState:p.protocolState,
      planReadyForShadowResearchReview:p.planReadyForShadowResearchReview,
      manualLaunchReviewRequired:p.manualLaunchReviewRequired
    })),
    automaticExperimentLaunchAllowed:false,
    automaticSkillStatusTransitionAllowed:false,
    automaticPromotionAllowed:false,
    automaticKillAllowed:false,
    primaryMutationAllowed:false,
    tradingPolicyMutationAllowed:false,
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canInfluencePrimary:false,
    canExecuteLive:false
  });
}
