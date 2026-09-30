import test from 'node:test';
import assert from 'node:assert/strict';

import { createBiggjSkillTree, recordBiggjSkillEvidence } from './biggj-skill-tree.mjs';
import { buildBiggjOutcomeSupervisor, verifyBiggjOutcomeSupervisor } from './biggj-outcome-supervisor.mjs';

function baseTree(){
  return createBiggjSkillTree({asOf:1_000});
}

test('outcome supervisor distinguishes research activity from validation evidence',()=>{
  let tree=baseTree();
  const root=tree.nodes.find(x=>x.kind!=='ROOT');
  assert.ok(root);
  tree=recordBiggjSkillEvidence(tree,{
    skillId:root.skillId,
    epistemicClass:'OBSERVED',
    asOf:1_500,
    availableAt:1_400,
    sourceId:'TEST_SOURCE',
    statement:'research context',
    outcome:'NEUTRAL',
    pointInTime:true,
    futureLeakage:false,
    auditReady:false,
    scientificGuardsPassed:false,
    forwardShadow:false,
    validationEligible:false,
    provenance:[{kind:'TEST'}]
  });
  const out=buildBiggjOutcomeSupervisor({
    livingResearchState:{skillTree:tree,researchReviewQueue:{ticketCount:0,blockedCount:0}},
    autonomousResearchFactory:{nextTasks:[]},
    asOf:2_000
  });
  assert.equal(out.outcomeHealth.researchEvidence>=out.outcomeHealth.validationEvidence,true);
  assert.equal(out.safety.automaticPromotion,false);
  assert.equal(verifyBiggjOutcomeSupervisor(out).ok,true);
});

test('stalled autonomous research becomes executive attention without changing authority',()=>{
  const tree=baseTree();
  const out=buildBiggjOutcomeSupervisor({
    livingResearchState:{skillTree:tree,researchReviewQueue:{ticketCount:0,blockedCount:0}},
    autonomousResearchFactory:{nextTasks:[{
      taskId:'t1',type:'COLLECT_FORWARD_DATA',subject:'EVIDENCE_INDEPENDENCE',
      stalled:true,stagnantCycles:8,queueAgeMs:7200000,effectivePriority:.9,
      reason:'MORE_FORWARD_POINT_IN_TIME_EVIDENCE_REQUIRED',
      autoHandler:'AUTOLEARN_AND_COVERAGE_CURRICULUM'
    }]},
    asOf:2_000
  });
  assert.equal(out.status,'ACTION_REQUIRED');
  assert.equal(out.outcomeHealth.stalledResearchTasks,1);
  assert.equal(out.attention[0].type,'STALLED_RESEARCH_TASK');
  assert.equal(out.safety.primaryMutationAllowed,false);
});

test('invalid tree fails closed into STATE_INVALID',()=>{
  const out=buildBiggjOutcomeSupervisor({
    livingResearchState:{skillTree:{bad:true},researchReviewQueue:{}},
    autonomousResearchFactory:{nextTasks:[]},
    asOf:2_000
  });
  assert.equal(out.status,'STATE_INVALID');
  assert.equal(out.skills.length,0);
  assert.equal(verifyBiggjOutcomeSupervisor(out).ok,true);
});
