import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createBiggjSkillTree,
  proposeBiggjChildSkill,
  recordBiggjSkillEvidence
} from './biggj-skill-tree.mjs';
import { compileBiggjResearchProtocol } from './biggj-research-protocol-compiler.mjs';
import {
  compileBiggjResearchExperimentPlan,
  verifyBiggjResearchExperimentPlan,
  buildBiggjResearchExperimentPlanner,
  biggjResearchExperimentPlannerSummary
} from './biggj-research-experiment-planner.mjs';

function fixture(){
  let tree=createBiggjSkillTree({asOf:1000});
  tree=proposeBiggjChildSkill(tree,{
    parentSkillId:'seed:EVIDENCE_INDEPENDENCE',
    title:'WITNESS_STABILITY_RESEARCH_TEST',
    purpose:'Test recurring witness support failure.',
    question:'Which witness failures persist across independent episodes?',
    hypothesis:'Persistent witness failures have reproducible pre-outcome signatures.',
    falsifier:'Independent forward episodes do not reproduce the signatures.',
    dependencies:['seed:SOURCE_TRUST','seed:DISAGREEMENT_ENGINE','seed:COMMON_CAUSE_GUARD'],
    strategicImpact:.9,
    uncertainty:1,
    asOf:1100,
    proposedBy:'TEST'
  });
  const skill=tree.nodes.find(x=>x.title==='WITNESS_STABILITY_RESEARCH_TEST');
  const protocol=compileBiggjResearchProtocol({
    tree,
    skillId:skill.skillId,
    agendaItem:{
      assumptionId:'THESIS_WITNESS_SUPPORT_ADEQUATE',
      researchContract:{
        question:skill.question,
        hypothesis:skill.hypothesis,
        falsifier:skill.falsifier
      }
    },
    registeredAt:1200
  });
  return {tree,skill,protocol};
}

test('planner converts the highest validation deficit into a concrete frozen research plan',()=>{
  const {tree,skill,protocol}=fixture();
  const planner=buildBiggjResearchExperimentPlanner({
    tree,
    protocols:[protocol],
    plannedAt:1300
  });
  assert.equal(planner.planCount,1);
  assert.deepEqual(planner.missingProtocolSkillIds,[]);
  const plan=planner.plans[0];
  assert.equal(plan.skillId,skill.skillId);
  assert.equal(plan.protocolId,protocol.protocolId);
  assert.equal(plan.blocker.id,'TOTAL_EVIDENCE');
  assert.equal(plan.blocker.kind,'PROSPECTIVE_EVIDENCE_COLLECTION');
  assert.equal(plan.design.stoppingRule.requiredAdditional,3);
  assert.ok(plan.design.primaryEndpoints.includes('VALIDATION_ELIGIBLE_EVIDENCE_COUNT'));
  assert.ok(plan.design.negativeControls.length>0);
  assert.equal(plan.planReadyForShadowResearchReview,true);
  assert.equal(plan.manualLaunchReviewRequired,true);
  assert.equal(plan.automaticExperimentLaunchAllowed,false);
  assert.equal(plan.automaticSkillStatusTransitionAllowed,false);
  assert.equal(plan.automaticPromotionAllowed,false);
  assert.equal(plan.primaryMutationAllowed,false);
  assert.equal(plan.canExecuteLive,false);
  assert.equal(verifyBiggjResearchExperimentPlan(plan).ok,true);
});

test('planner preserves the frozen hypothesis and falsifier from preregistration',()=>{
  const {tree,skill,protocol}=fixture();
  const planner=buildBiggjResearchExperimentPlanner({tree,protocols:[protocol],plannedAt:1300});
  const plan=planner.plans[0];
  assert.equal(plan.frozenResearchContract.hypothesis,skill.hypothesis);
  assert.equal(plan.frozenResearchContract.falsifier,skill.falsifier);
  assert.equal(plan.semantics.planCannotAmendFrozenHypothesis,true);
  assert.equal(plan.semantics.planCannotAmendFrozenFalsifier,true);
  assert.equal(plan.design.stoppingRule.noOptionalStoppingOnPositiveResult,true);
  assert.equal(plan.design.stoppingRule.negativeAndNullResultsMustBeRetained,true);
});

test('same frozen tree and protocol yield deterministic plan identity',()=>{
  const {tree,protocol}=fixture();
  const a=buildBiggjResearchExperimentPlanner({tree,protocols:[protocol],plannedAt:1300});
  const b=buildBiggjResearchExperimentPlanner({tree,protocols:[protocol],plannedAt:1300});
  assert.equal(a.fingerprint,b.fingerprint);
  assert.equal(a.plans[0].planId,b.plans[0].planId);
  assert.equal(a.plans[0].fingerprint,b.plans[0].fingerprint);
});

test('discovered skill without protocol is explicitly blocked rather than silently planned',()=>{
  const {tree,skill}=fixture();
  const planner=buildBiggjResearchExperimentPlanner({tree,protocols:[],plannedAt:1300});
  assert.equal(planner.planCount,0);
  assert.deepEqual(planner.missingProtocolSkillIds,[skill.skillId]);
  assert.equal(planner.manualLaunchReviewRequired,0);
});

test('research context evidence does not erase the validation deficit',()=>{
  let {tree,skill,protocol}=fixture();
  tree=recordBiggjSkillEvidence(tree,{
    skillId:skill.skillId,
    epistemicClass:'INFERRED',
    asOf:1400,
    availableAt:1400,
    sourceId:'DISCOVERY_CONTEXT',
    independentEpisodeId:null,
    statement:'Discovery context only.',
    outcome:'POSITIVE',
    forwardShadow:false,
    pointInTime:true,
    futureLeakage:false,
    auditReady:false,
    scientificGuardsPassed:false,
    chronologicalStable:false,
    costStressPassed:false,
    concentrationPassed:false,
    winnerRemovalPassed:false,
    validationEligible:false,
    provenance:[{kind:'DISCOVERY_CONTEXT'}]
  });
  protocol=compileBiggjResearchProtocol({
    tree,
    skillId:skill.skillId,
    agendaItem:{
      assumptionId:'THESIS_WITNESS_SUPPORT_ADEQUATE',
      researchContract:{
        question:skill.question,
        hypothesis:skill.hypothesis,
        falsifier:skill.falsifier
      }
    },
    registeredAt:1500
  });
  const planner=buildBiggjResearchExperimentPlanner({tree,protocols:[protocol],plannedAt:1600});
  assert.equal(planner.plans[0].blocker.id,'TOTAL_EVIDENCE');
  assert.equal(planner.plans[0].design.stoppingRule.requiredAdditional,3);
});

test('tampering with execution authority invalidates the plan fingerprint and safety contract',()=>{
  const {tree,protocol}=fixture();
  const planner=buildBiggjResearchExperimentPlanner({tree,protocols:[protocol],plannedAt:1300});
  const tampered=structuredClone(planner.plans[0]);
  tampered.automaticExperimentLaunchAllowed=true;
  const v=verifyBiggjResearchExperimentPlan(tampered);
  assert.equal(v.ok,false);
  assert.ok(v.reasons.includes('AUTHORITY_INVALID:automaticExperimentLaunchAllowed'));
});

test('summary exposes concrete next experiments without launch authority',()=>{
  const {tree,protocol}=fixture();
  const summary=biggjResearchExperimentPlannerSummary({
    tree,
    protocols:[protocol],
    plannedAt:1300,
    limit:5
  });
  assert.equal(summary.planCount,1);
  assert.equal(summary.manualLaunchReviewRequired,1);
  assert.equal(summary.topPlans[0].blockerId,'TOTAL_EVIDENCE');
  assert.equal(summary.topPlans[0].requiredAdditional,3);
  assert.equal(summary.topPlans[0].planReadyForShadowResearchReview,true);
  assert.equal(summary.automaticExperimentLaunchAllowed,false);
  assert.equal(summary.canExecuteLive,false);
});

test('direct compilation rejects protocol/review mismatch',()=>{
  const {tree,protocol}=fixture();
  assert.throws(()=>compileBiggjResearchExperimentPlan({
    tree,
    protocol,
    validationReview:{
      skillId:'different-skill',
      nextExperiment:{experimentId:'TOTAL_EVIDENCE'}
    },
    plannedAt:1300
  }),/mismatch/);
});
