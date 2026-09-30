import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createBiggjSkillTree,
  proposeBiggjChildSkill,
  recordBiggjSkillEvidence,
  evaluateBiggjSkillProgress,
  applyBiggjSkillStatusTransition
} from './biggj-skill-tree.mjs';
import {
  evaluateBiggjResearchSkillValidation,
  buildBiggjResearchValidationHarness,
  biggjResearchValidationSummary
} from './biggj-research-validation-harness.mjs';

function discoveredTree(){
  const tree=createBiggjSkillTree({asOf:1000});
  return proposeBiggjChildSkill(tree,{
    parentSkillId:'seed:EVIDENCE_INDEPENDENCE',
    title:'WITNESS_STABILITY_RESEARCH',
    purpose:'Research witness persistence.',
    question:'Which witness failures persist?',
    hypothesis:'Persistent witness failures form reproducible classes.',
    falsifier:'Separated forward episodes do not reproduce the classes.',
    dependencies:[
      'seed:SOURCE_TRUST',
      'seed:DISAGREEMENT_ENGINE',
      'seed:COMMON_CAUSE_GUARD'
    ],
    strategicImpact:.9,
    uncertainty:1,
    asOf:1100,
    proposedBy:'ASSUMPTION_PERSISTENCE_RUNTIME_V1'
  });
}

function discoveredSkillId(tree){
  return tree.nodes.find(x=>x.kind==='DISCOVERED_SKILL').skillId;
}

function evidence(tree,skillId,{
  n,
  episode,
  audit=false,
  science=false,
  forward=true,
  outcome='NEUTRAL',
  chronology=false,
  cost=false,
  concentration=false,
  winner=false
}={}){
  const at=2000+n;
  return recordBiggjSkillEvidence(tree,{
    skillId,
    epistemicClass:'INFERRED',
    asOf:at,
    availableAt:at,
    sourceId:'TEST_FORWARD_RESEARCH',
    independentEpisodeId:episode??null,
    statement:'Prospective validation evidence '+n,
    outcome,
    forwardShadow:forward,
    pointInTime:true,
    futureLeakage:false,
    auditReady:audit,
    scientificGuardsPassed:science,
    chronologicalStable:chronology,
    costStressPassed:cost,
    concentrationPassed:concentration,
    winnerRemovalPassed:winner,
    provenance:[{n}]
  });
}

test('new discovered skill receives a concrete validation plan but no execution authority',()=>{
  const tree=discoveredTree();
  const id=discoveredSkillId(tree);
  const review=evaluateBiggjResearchSkillValidation(tree,id);
  assert.equal(review.currentStatus,'DISCOVERING');
  assert.equal(review.validationPhase,'DISCOVERY_EVIDENCE');
  assert.equal(review.manualTransitionReviewEligible,false);
  assert.ok(review.blockers.some(x=>x.id==='TOTAL_EVIDENCE'));
  assert.ok(review.blockers.some(x=>x.id==='INDEPENDENT_EPISODES'));
  assert.equal(review.nextExperiment.experimentId,'TOTAL_EVIDENCE');
  assert.equal(review.nextExperiment.automaticLaunchAllowed,false);
  assert.equal(review.automaticStatusTransitionAllowed,false);
  assert.equal(review.automaticPromotionAllowed,false);
  assert.equal(review.canInfluencePrimary,false);
  assert.equal(review.canExecuteLive,false);
});

test('three PIT rows across two conservative episodes make only a manual learning review eligible',()=>{
  let tree=discoveredTree();
  const id=discoveredSkillId(tree);
  tree=evidence(tree,id,{n:1,episode:'episode:A'});
  tree=evidence(tree,id,{n:2,episode:'episode:A'});
  tree=evidence(tree,id,{n:3,episode:'episode:B'});

  const before=tree.fingerprint;
  const review=evaluateBiggjResearchSkillValidation(tree,id);
  assert.equal(review.recommendedStatus,'LEARNING');
  assert.equal(review.manualTransitionReviewEligible,true);
  assert.equal(review.blockers.length,0);
  assert.equal(review.evidence.total,3);
  assert.equal(review.evidence.independentEpisodes,2);
  assert.equal(review.automaticStatusTransitionAllowed,false);
  assert.equal(tree.fingerprint,before);
  assert.equal(tree.nodes.find(x=>x.skillId===id).status,'DISCOVERING');
});

test('manual status transition remains separate from validation harness',()=>{
  let tree=discoveredTree();
  const id=discoveredSkillId(tree);
  tree=evidence(tree,id,{n:1,episode:'episode:A'});
  tree=evidence(tree,id,{n:2,episode:'episode:A'});
  tree=evidence(tree,id,{n:3,episode:'episode:B'});
  const progress=evaluateBiggjSkillProgress(tree,id);
  assert.equal(progress.recommendedStatus,'LEARNING');

  tree=applyBiggjSkillStatusTransition(tree,{
    skillId:id,
    toStatus:'LEARNING',
    evaluation:progress,
    asOf:3000
  });
  const review=evaluateBiggjResearchSkillValidation(tree,id);
  assert.equal(review.currentStatus,'LEARNING');
  assert.equal(review.validationPhase,'LEARNING_AUDIT');
  assert.equal(review.manualTransitionReviewEligible,false);
  assert.ok(review.blockers.some(x=>x.id==='TOTAL_EVIDENCE'));
  assert.ok(review.blockers.some(x=>x.id==='ALL_EVIDENCE_AUDIT_READY'));
  assert.ok(review.blockers.some(x=>x.id==='TESTING_DEPENDENCY_GATE_READY'));
});

test('audit completeness is measured as an explicit evidence-quality dimension',()=>{
  let tree=discoveredTree();
  const id=discoveredSkillId(tree);
  tree=evidence(tree,id,{n:1,episode:'episode:A',audit:true});
  tree=evidence(tree,id,{n:2,episode:'episode:B',audit:false});
  tree=evidence(tree,id,{n:3,episode:'episode:C',audit:true});

  const review=evaluateBiggjResearchSkillValidation(tree,id);
  assert.equal(review.evidence.total,3);
  assert.equal(review.evidence.auditReady,2);
  assert.equal(review.evidence.auditCoverage,2/3);
  assert.ok(review.readinessScore>=0&&review.readinessScore<=1);
});

test('harness is deterministic and side-effect free',()=>{
  let tree=discoveredTree();
  const id=discoveredSkillId(tree);
  tree=evidence(tree,id,{n:1,episode:'episode:A'});
  tree=evidence(tree,id,{n:2,episode:'episode:B'});
  tree=evidence(tree,id,{n:3,episode:'episode:C'});
  const before=tree.fingerprint;

  const a=buildBiggjResearchValidationHarness(tree);
  const b=buildBiggjResearchValidationHarness(tree);
  assert.equal(a.fingerprint,b.fingerprint);
  assert.equal(a.treeFingerprint,before);
  assert.equal(tree.fingerprint,before);
  assert.equal(a.discoveredSkillCount,1);
  assert.equal(a.manualTransitionReviewEligible,1);
  assert.equal(a.invariants.automaticStatusTransitionAllowed,false);
  assert.equal(a.invariants.automaticExperimentLaunchAllowed,false);
  assert.equal(a.invariants.primaryMutationAllowed,false);
});

test('summary exposes only review information and preserves research-only governance',()=>{
  let tree=discoveredTree();
  const id=discoveredSkillId(tree);
  tree=evidence(tree,id,{n:1,episode:'episode:A'});
  tree=evidence(tree,id,{n:2,episode:'episode:B'});
  tree=evidence(tree,id,{n:3,episode:'episode:C'});
  const summary=biggjResearchValidationSummary(tree,{limit:3});
  assert.equal(summary.discoveredSkillCount,1);
  assert.equal(summary.manualTransitionReviewEligible,1);
  assert.equal(summary.topReviews.length,1);
  assert.equal(summary.topReviews[0].recommendedStatus,'LEARNING');
  assert.equal(summary.automaticStatusTransitionAllowed,false);
  assert.equal(summary.automaticExperimentLaunchAllowed,false);
  assert.equal(summary.automaticPromotionAllowed,false);
  assert.equal(summary.automaticKillAllowed,false);
  assert.equal(summary.primaryMutationAllowed,false);
  assert.equal(summary.execution,'SHADOW_ONLY');
  assert.equal(summary.action,'ABSTAIN');
  assert.equal(summary.canExecuteLive,false);
});
