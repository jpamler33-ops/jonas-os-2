import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createBiggjSkillTree,
  proposeBiggjChildSkill,
  recordBiggjSkillEvidence
} from './biggj-skill-tree.mjs';
import {
  compileBiggjResearchProtocol
} from './biggj-research-protocol-compiler.mjs';
import {
  buildBiggjResearchReviewQueue,
  applyBiggjResearchReviewDecision,
  verifyBiggjResearchReviewQueue
} from './biggj-research-review-queue.mjs';

function setup(){
  let tree=createBiggjSkillTree({asOf:1000});
  const parent=tree.nodes.find(x=>x.capabilityId==='SELF_QUESTIONING');
  tree=proposeBiggjChildSkill(tree,{
    parentSkillId:parent.skillId,
    title:'REVIEW_QUEUE_TEST_SKILL',
    question:'Does prospective evidence reproduce this research hypothesis?',
    hypothesis:'The effect is reproducible across independent forward episodes.',
    falsifier:'Independent forward episodes fail to reproduce the effect.',
    dependencies:[],
    asOf:1100
  });
  const skill=tree.nodes.find(x=>x.title==='REVIEW_QUEUE_TEST_SKILL');
  const protocol=compileBiggjResearchProtocol({
    tree,
    skillId:skill.skillId,
    agendaItem:{
      assumptionId:'THESIS_TEST',
      researchContract:{
        question:skill.question,
        hypothesis:skill.hypothesis,
        falsifier:skill.falsifier
      }
    },
    registeredAt:1200
  });
  return {tree,skillId:skill.skillId,protocol};
}

function addEvidence(tree,skillId,index,{
  auditReady=true,
  science=true,
  stress=true,
  outcome='POSITIVE'
}={}){
  return recordBiggjSkillEvidence(tree,{
    skillId,
    epistemicClass:'INFERRED',
    asOf:2000+index,
    availableAt:2000+index,
    sourceId:'REVIEW_QUEUE_TEST',
    independentEpisodeId:'episode-'+Math.floor(index/2),
    statement:'Prospective review evidence '+index,
    outcome,
    forwardShadow:true,
    pointInTime:true,
    auditReady,
    scientificGuardsPassed:science,
    chronologicalStable:stress,
    costStressPassed:stress,
    concentrationPassed:stress,
    winnerRemovalPassed:stress
  });
}

test('review queue opens LEARNING ticket but never applies it automatically',()=>{
  let {tree,skillId,protocol}=setup();
  for(let i=0;i<3;i++) tree=addEvidence(tree,skillId,i);
  const queue=buildBiggjResearchReviewQueue({tree,protocols:[protocol],asOf:5000});
  assert.equal(verifyBiggjResearchReviewQueue(queue).ok,true);
  assert.equal(queue.ticketCount,1);
  const ticket=queue.tickets[0];
  assert.equal(ticket.fromStatus,'DISCOVERING');
  assert.equal(ticket.proposedStatus,'LEARNING');
  assert.equal(ticket.reviewPolicy.explicitApprovalRequired,true);
  assert.equal(ticket.reviewPolicy.automaticApply,false);
  assert.equal(tree.nodes.find(x=>x.skillId===skillId).status,'DISCOVERING');
  assert.equal(queue.canInfluencePrimary,false);
  assert.equal(queue.canExecuteLive,false);
});

test('explicit rejection records a decision and leaves status unchanged',()=>{
  let {tree,skillId,protocol}=setup();
  for(let i=0;i<3;i++) tree=addEvidence(tree,skillId,i);
  const ticket=buildBiggjResearchReviewQueue({tree,protocols:[protocol],asOf:5000}).tickets[0];
  const out=applyBiggjResearchReviewDecision({
    tree,ticket,approved:false,asOf:5100,reviewer:'TEST_OPERATOR'
  });
  assert.equal(out.changed,false);
  assert.equal(out.tree.nodes.find(x=>x.skillId===skillId).status,'DISCOVERING');
  assert.equal(out.decision.decision,'REJECTED');
  assert.equal(out.decision.productionMutationPerformed,false);
});

test('explicit approvals can advance research stages but only one reviewed stage at a time',()=>{
  let {tree,skillId,protocol}=setup();

  for(let i=0;i<3;i++) tree=addEvidence(tree,skillId,i);
  let queue=buildBiggjResearchReviewQueue({tree,protocols:[protocol],asOf:5000});
  let out=applyBiggjResearchReviewDecision({
    tree,ticket:queue.tickets[0],approved:true,asOf:5100,reviewer:'TEST_OPERATOR'
  });
  tree=out.tree;
  assert.equal(tree.nodes.find(x=>x.skillId===skillId).status,'LEARNING');
  assert.equal(out.decision.toStatus,'LEARNING');

  for(let i=3;i<10;i++) tree=addEvidence(tree,skillId,i);
  queue=buildBiggjResearchReviewQueue({tree,protocols:[protocol],asOf:7000});
  assert.equal(queue.ticketCount,1);
  assert.equal(queue.tickets[0].fromStatus,'LEARNING');
  assert.equal(queue.tickets[0].proposedStatus,'TESTING');
  out=applyBiggjResearchReviewDecision({
    tree,ticket:queue.tickets[0],approved:true,asOf:7100,reviewer:'TEST_OPERATOR'
  });
  tree=out.tree;
  assert.equal(tree.nodes.find(x=>x.skillId===skillId).status,'TESTING');

  for(let i=10;i<40;i++) tree=addEvidence(tree,skillId,i);
  queue=buildBiggjResearchReviewQueue({tree,protocols:[protocol],asOf:12000});
  assert.equal(queue.ticketCount,1);
  assert.equal(queue.tickets[0].fromStatus,'TESTING');
  assert.equal(queue.tickets[0].proposedStatus,'VALIDATED');
  assert.equal(queue.tickets[0].evidenceState,'VALIDATION_REVIEW_EVIDENCE_READY');

  out=applyBiggjResearchReviewDecision({
    tree,ticket:queue.tickets[0],approved:true,asOf:12100,reviewer:'TEST_OPERATOR'
  });
  tree=out.tree;
  assert.equal(tree.nodes.find(x=>x.skillId===skillId).status,'VALIDATED');
  assert.equal(out.decision.productionMutationPerformed,false);

  const after=buildBiggjResearchReviewQueue({tree,protocols:[protocol],asOf:12200});
  assert.equal(after.ticketCount,0,'TRUSTED is not auto-routed through this review queue');
});

test('contract drift blocks review instead of creating a transition ticket',()=>{
  let {tree,skillId,protocol}=setup();
  for(let i=0;i<3;i++) tree=addEvidence(tree,skillId,i);
  const mutated=structuredClone(tree);
  const skill=mutated.nodes.find(x=>x.skillId===skillId);
  skill.hypothesis='Retrospectively changed hypothesis.';
  const {fingerprint,...core}=mutated;
  mutated.fingerprint=(await import('./institutional-kernel.mjs')).sha256(core);
  const queue=buildBiggjResearchReviewQueue({tree:mutated,protocols:[protocol],asOf:5000});
  assert.equal(queue.ticketCount,0);
  assert.equal(queue.blockedCount,1);
  assert.equal(queue.blocked[0].reason,'PROTOCOL_CONTRACT_DRIFT');
});
