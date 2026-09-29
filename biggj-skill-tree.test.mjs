import test from 'node:test';
import assert from 'node:assert/strict';
import {
  biggjCapabilityMap,
  BIGGJ_CAPABILITY_ROOTS,
  BIGGJ_SEED_CAPABILITIES
} from './biggj-capability-map.mjs';
import {
  createBiggjSkillTree,
  proposeBiggjChildSkill,
  recordBiggjSkillEvidence,
  evaluateBiggjSkillProgress,
  applyBiggjSkillStatusTransition,
  buildBiggjResearchQueue,
  biggjCapabilityGapReport,
  biggjSkillTreeSnapshot
} from './biggj-skill-tree.mjs';

test('capability map encodes the 100k mission as an external target, never as a profit guarantee',()=>{
  const map=biggjCapabilityMap();
  assert.equal(map.mission.externalTargetCapital,100000);
  assert.equal(map.mission.externalTargetDate,'2027-12-25');
  assert.equal(map.mission.guarantee,false);
  assert.equal(map.mission.directTargetChasingForbidden,true);
  assert.equal(map.invariants.execution,'SHADOW_ONLY');
  assert.equal(map.invariants.canExecuteLive,false);
  assert.ok(BIGGJ_CAPABILITY_ROOTS.length>=12);
  assert.ok(BIGGJ_SEED_CAPABILITIES.length>=60);
});

test('skill tree seeds every canonical capability without granting trust',()=>{
  const tree=createBiggjSkillTree({asOf:1_000_000});
  assert.equal(tree.execution,'SHADOW_ONLY');
  assert.equal(tree.canExecuteLive,false);
  assert.equal(tree.invariants.silentPrimaryMutation,false);
  assert.equal(tree.nodes.filter(x=>x.kind==='SEEDED_CAPABILITY').length,BIGGJ_SEED_CAPABILITIES.length);
  assert.equal(tree.nodes.filter(x=>x.status==='TRUSTED').length,0);
  assert.ok(tree.nodes.some(x=>x.capabilityId==='SELF_QUESTIONING'));
  assert.ok(tree.nodes.some(x=>x.capabilityId==='ADAPTIVE_HOLD_DURATION'));
});

test('BIGGJ can discover a new child skill only as a falsifiable research proposal',()=>{
  const tree=createBiggjSkillTree({asOf:1_000_000});
  const parent=tree.nodes.find(x=>x.capabilityId==='SWEEP_DETECTION');
  const next=proposeBiggjChildSkill(tree,{
    parentSkillId:parent.skillId,
    title:'SWEEP_OI_RECLAIM',
    purpose:'Test whether OI expansion after a reclaimed sell-side sweep adds information.',
    question:'Does a reclaimed sell-side sweep with expanding OI outperform sweep-only entries?',
    hypothesis:'In bullish 1h regimes, reclaimed sell-side sweeps followed by positive OI expansion have higher forward expectancy than matched sweep-only cases.',
    falsifier:'No positive out-of-sample expectancy lift after costs across independent episodes.',
    dependencies:[
      tree.nodes.find(x=>x.capabilityId==='DERIVATIVES_INTELLIGENCE').skillId
    ],
    strategicImpact:.85,
    uncertainty:.95,
    asOf:1_010_000
  });
  const child=next.nodes.find(x=>x.title==='SWEEP_OI_RECLAIM');
  assert.equal(child.kind,'DISCOVERED_SKILL');
  assert.equal(child.status,'DISCOVERING');
  assert.equal(child.promotionStage,'RESEARCH_ONLY');
  assert.equal(child.productionMutationAllowed,false);
  assert.equal(next.proposals.at(-1).productionMutationPerformed,false);
});

test('new discovered skills require an explicit falsifier',()=>{
  const tree=createBiggjSkillTree({asOf:1_000_000});
  const parent=tree.nodes.find(x=>x.capabilityId==='SELF_QUESTIONING');
  assert.throws(()=>proposeBiggjChildSkill(tree,{
    parentSkillId:parent.skillId,
    title:'BAD_SKILL',
    question:'What happens?',
    hypothesis:'Something useful happens.',
    falsifier:'',
    asOf:1_001_000
  }),/falsifier/);
});

test('future evidence and future leakage are blocked',()=>{
  const tree=createBiggjSkillTree({asOf:1_000_000});
  const skill=tree.nodes.find(x=>x.capabilityId==='STYLE_SELECTION');
  assert.throws(()=>recordBiggjSkillEvidence(tree,{
    skillId:skill.skillId,
    epistemicClass:'OBSERVED',
    asOf:1_010_000,
    availableAt:1_020_000,
    sourceId:'test',
    statement:'future row',
    pointInTime:true
  }),/future evidence blocked/);
  assert.throws(()=>recordBiggjSkillEvidence(tree,{
    skillId:skill.skillId,
    epistemicClass:'OBSERVED',
    asOf:1_010_000,
    availableAt:1_000_000,
    sourceId:'test',
    statement:'leaked row',
    futureLeakage:true
  }),/future leakage blocked/);
});

function addEvidence(tree,skillId,count,{
  start=2_000_000,
  outcome='POSITIVE',
  forwardShadow=true,
  allValidation=true
}={}){
  let t=tree;
  for(let i=0;i<count;i++){
    t=recordBiggjSkillEvidence(t,{
      skillId,
      epistemicClass:'OBSERVED',
      asOf:start+i*1000,
      availableAt:start+i*1000-1,
      sourceId:'SHADOW:'+i,
      independentEpisodeId:'EP:'+i,
      statement:'Forward point-in-time observation '+i,
      outcome,
      metricDelta:outcome==='POSITIVE'?.002:-.002,
      forwardShadow,
      pointInTime:true,
      auditReady:true,
      scientificGuardsPassed:allValidation,
      chronologicalStable:allValidation,
      costStressPassed:allValidation,
      concentrationPassed:allValidation,
      winnerRemovalPassed:allValidation
    });
  }
  return t;
}

test('skill maturity advances through evidence gates and never mutates PRIMARY directly',()=>{
  let tree=createBiggjSkillTree({asOf:1_000_000});
  const seed=tree.nodes.find(x=>x.capabilityId==='LIQUIDITY_SWEEP_REVERSAL');
  tree=addEvidence(tree,seed.skillId,3,{start:2_000_000});
  let eval1=evaluateBiggjSkillProgress(tree,seed.skillId);
  assert.equal(eval1.recommendedStatus,'LEARNING');
  assert.equal(eval1.automaticPrimaryMutationAllowed,false);
  tree=applyBiggjSkillStatusTransition(tree,{
    skillId:seed.skillId,toStatus:'LEARNING',evaluation:eval1,asOf:2_100_000
  });

  tree=addEvidence(tree,seed.skillId,7,{start:3_000_000});
  let eval2=evaluateBiggjSkillProgress(tree,seed.skillId);
  assert.equal(eval2.recommendedStatus,'TESTING');
  tree=applyBiggjSkillStatusTransition(tree,{
    skillId:seed.skillId,toStatus:'TESTING',evaluation:eval2,asOf:3_100_000
  });

  tree=addEvidence(tree,seed.skillId,20,{start:4_000_000});
  let eval3=evaluateBiggjSkillProgress(tree,seed.skillId);
  assert.equal(eval3.recommendedStatus,'VALIDATED');
  tree=applyBiggjSkillStatusTransition(tree,{
    skillId:seed.skillId,toStatus:'VALIDATED',evaluation:eval3,asOf:4_100_000
  });

  tree=addEvidence(tree,seed.skillId,30,{start:5_000_000});
  const eval4=evaluateBiggjSkillProgress(tree,seed.skillId);
  assert.equal(eval4.recommendedStatus,'TRUSTED');
  assert.equal(eval4.requiresVersionedPromotion,true);
  assert.throws(()=>applyBiggjSkillStatusTransition(tree,{
    skillId:seed.skillId,toStatus:'TRUSTED',evaluation:eval4,asOf:5_100_000
  }),/promotion record/);
  tree=applyBiggjSkillStatusTransition(tree,{
    skillId:seed.skillId,toStatus:'TRUSTED',evaluation:eval4,asOf:5_100_000,promotionRecordId:'promotion_test_1'
  });
  assert.equal(tree.nodes.find(x=>x.skillId===seed.skillId).status,'TRUSTED');
  assert.equal(tree.promotions.at(-1).productionMutationPerformed,false);
});

test('research queue asks what BIGGJ should learn next instead of forcing trades',()=>{
  const tree=createBiggjSkillTree({asOf:1_000_000});
  const queue=buildBiggjResearchQueue(tree,{limit:12});
  assert.equal(queue.queue.length,12);
  assert.ok(queue.queue.every(x=>typeof x.question==='string'&&x.question.length>10));
  assert.ok(queue.queue.every(x=>x.status!=='RETIRED'));
  assert.equal(queue.action,'ABSTAIN');
  assert.equal(queue.canExecuteLive,false);
});

test('capability gap report exposes weak roots and uncertainty',()=>{
  const tree=createBiggjSkillTree({asOf:1_000_000});
  const gaps=biggjCapabilityGapReport(tree);
  assert.ok(gaps.roots.length>=12);
  assert.ok(gaps.weakestRoots.length>0);
  assert.ok(gaps.weakestRoots.every(x=>x.coverage>=0&&x.coverage<=1));
  assert.ok(gaps.weakestRoots.every(x=>x.meanUncertainty>=0&&x.meanUncertainty<=1));
});

test('skill tree snapshot is an operator-facing research state, not an execution authority',()=>{
  const tree=createBiggjSkillTree({asOf:1_000_000});
  const snap=biggjSkillTreeSnapshot(tree);
  assert.equal(snap.silentPrimaryMutation,false);
  assert.equal(snap.execution,'SHADOW_ONLY');
  assert.equal(snap.action,'ABSTAIN');
  assert.equal(snap.canExecuteLive,false);
  assert.ok(snap.researchQueue.length>0);
  assert.ok(snap.capabilityGaps.length>0);
});
