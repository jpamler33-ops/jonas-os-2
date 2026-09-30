import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createBiggjSkillTree,
  proposeBiggjChildSkill,
  recordBiggjSkillEvidence
} from './biggj-skill-tree.mjs';
import {
  compileBiggjResearchProtocol,
  verifyBiggjResearchProtocol,
  evaluateBiggjResearchProtocol,
  researchProtocolSummary,
  BIGGJ_RESEARCH_PROTOCOL_VERSION
} from './biggj-research-protocol-compiler.mjs';

function skillTree(createdAt=1000){
  let tree=createBiggjSkillTree({asOf:createdAt});
  tree=proposeBiggjChildSkill(tree,{
    parentSkillId:'seed:EVIDENCE_INDEPENDENCE',
    title:'WITNESS_STABILITY_RESEARCH',
    purpose:'Research persistent witness support failures.',
    question:'Which witness failures persist prospectively?',
    hypothesis:'Persistent witness failures form reproducible pre-outcome patterns.',
    falsifier:'Prospective independent episodes do not reproduce the patterns.',
    dependencies:['seed:SOURCE_TRUST','seed:DISAGREEMENT_ENGINE'],
    strategicImpact:.8,
    uncertainty:1,
    asOf:createdAt,
    proposedBy:'ASSUMPTION_PERSISTENCE_RUNTIME_V1'
  });
  return tree;
}

function discovered(tree){
  return tree.nodes.find(x=>
    x.kind==='DISCOVERED_SKILL'&&
    x.title==='WITNESS_STABILITY_RESEARCH'
  );
}

function agendaItem(skill){
  return {
    assumptionId:'THESIS_WITNESS_SUPPORT_ADEQUATE',
    researchContract:{
      title:skill.title,
      question:skill.question,
      hypothesis:skill.hypothesis,
      falsifier:skill.falsifier
    }
  };
}

function addEvidence(tree,skillId,{
  at,
  episode,
  auditReady=false,
  science=false,
  forwardShadow=true,
  chronological=false,
  cost=false,
  concentration=false,
  winnerRemoval=false
}={}){
  return recordBiggjSkillEvidence(tree,{
    skillId,
    epistemicClass:'INFERRED',
    asOf:at,
    availableAt:at,
    sourceId:'TEST_PROSPECTIVE_RESEARCH',
    independentEpisodeId:episode,
    statement:'Prospective PIT research evidence at '+at,
    outcome:'NEUTRAL',
    metricDelta:null,
    forwardShadow,
    pointInTime:true,
    futureLeakage:false,
    auditReady,
    scientificGuardsPassed:science,
    chronologicalStable:chronological,
    costStressPassed:cost,
    concentrationPassed:concentration,
    winnerRemovalPassed:winnerRemoval,
    provenance:[{kind:'TEST',at}]
  });
}

test('compiler preregisters immutable research-only protocol without launch authority',()=>{
  const tree=skillTree(1000);
  const skill=discovered(tree);
  const protocol=compileBiggjResearchProtocol({
    tree,
    skillId:skill.skillId,
    agendaItem:agendaItem(skill),
    registeredAt:1000
  });
  assert.equal(protocol.version,BIGGJ_RESEARCH_PROTOCOL_VERSION);
  assert.equal(protocol.registeredAt,1000);
  assert.equal(protocol.backfilledForExistingSkill,false);
  assert.equal(protocol.preregistration.confirmatoryEvidenceMustBeKnownAfter,1000);
  assert.equal(protocol.preregistration.retrospectiveConfirmatoryRelabelingForbidden,true);
  assert.equal(protocol.design.mode,'PROSPECTIVE_OBSERVATIONAL_FORWARD_SHADOW');
  assert.equal(protocol.design.unitOfAnalysis,'CONSERVATIVE_RESEARCH_EPISODE');
  assert.equal(protocol.authority.automaticExperimentLaunch,false);
  assert.equal(protocol.authority.automaticSkillStatusTransition,false);
  assert.equal(protocol.authority.automaticPromotion,false);
  assert.equal(protocol.authority.primaryMutationAllowed,false);
  assert.equal(protocol.canInfluencePrimary,false);
  assert.equal(protocol.canExecuteLive,false);
  assert.equal(verifyBiggjResearchProtocol(protocol).ok,true);
});

test('same frozen skill contract and registration time produce deterministic protocol identity',()=>{
  const tree=skillTree(1000);
  const skill=discovered(tree);
  const a=compileBiggjResearchProtocol({
    tree,skillId:skill.skillId,agendaItem:agendaItem(skill),registeredAt:1000
  });
  const b=compileBiggjResearchProtocol({
    tree,skillId:skill.skillId,agendaItem:agendaItem(skill),registeredAt:1000
  });
  assert.equal(a.protocolId,b.protocolId);
  assert.equal(a.fingerprint,b.fingerprint);
});

test('backfilled protocol starts confirmatory clock at registration rather than skill discovery',()=>{
  let tree=skillTree(1000);
  const skill=discovered(tree);
  tree=addEvidence(tree,skill.skillId,{at:1500,episode:'PRE-1'});

  const protocol=compileBiggjResearchProtocol({
    tree,
    skillId:skill.skillId,
    agendaItem:agendaItem(skill),
    registeredAt:2000
  });
  assert.equal(protocol.backfilledForExistingSkill,true);

  const evaluation=evaluateBiggjResearchProtocol(protocol,tree);
  assert.equal(evaluation.state,'AWAITING_PROSPECTIVE_EVIDENCE');
  assert.equal(evaluation.postRegistrationEvidence.total,0);
  assert.equal(evaluation.postRegistrationEvidence.independentEpisodes,0);
  assert.ok(evaluation.reasons.includes('POST_REGISTRATION_EVIDENCE_REQUIRED'));
});

test('post-registration evidence alone can reach learning review threshold',()=>{
  let tree=skillTree(1000);
  const skill=discovered(tree);
  tree=addEvidence(tree,skill.skillId,{at:1500,episode:'PRE-1'});
  const protocol=compileBiggjResearchProtocol({
    tree,
    skillId:skill.skillId,
    agendaItem:agendaItem(skill),
    registeredAt:2000
  });

  tree=addEvidence(tree,skill.skillId,{at:3000,episode:'POST-1'});
  tree=addEvidence(tree,skill.skillId,{at:4000,episode:'POST-2'});
  tree=addEvidence(tree,skill.skillId,{at:5000,episode:'POST-2'});

  const evaluation=evaluateBiggjResearchProtocol(protocol,tree);
  assert.equal(evaluation.state,'LEARNING_REVIEW_EVIDENCE_READY');
  assert.equal(evaluation.postRegistrationEvidence.total,3);
  assert.equal(evaluation.postRegistrationEvidence.independentEpisodes,2);
  assert.equal(evaluation.authority.reviewOnly,true);
  assert.equal(evaluation.authority.automaticSkillStatusTransition,false);
});

test('formal testing review requires prospective audit-ready sample gate',()=>{
  let tree=skillTree(1000);
  const skill=discovered(tree);
  const protocol=compileBiggjResearchProtocol({
    tree,
    skillId:skill.skillId,
    agendaItem:agendaItem(skill),
    registeredAt:1000
  });

  for(let i=0;i<10;i++){
    tree=addEvidence(tree,skill.skillId,{
      at:2000+i,
      episode:'EP-'+(i%5),
      auditReady:true
    });
  }
  const evaluation=evaluateBiggjResearchProtocol(protocol,tree);
  assert.equal(evaluation.state,'FORMAL_TESTING_REVIEW_EVIDENCE_READY');
  assert.equal(evaluation.postRegistrationEvidence.total,10);
  assert.equal(evaluation.postRegistrationEvidence.independentEpisodes,5);
  assert.equal(evaluation.postRegistrationEvidence.auditReady,10);
});

test('validation review target remains review-only even with strong forward sample',()=>{
  let tree=skillTree(1000);
  const skill=discovered(tree);
  const protocol=compileBiggjResearchProtocol({
    tree,
    skillId:skill.skillId,
    agendaItem:agendaItem(skill),
    registeredAt:1000
  });

  for(let i=0;i<30;i++){
    tree=addEvidence(tree,skill.skillId,{
      at:2000+i,
      episode:'EP-'+(i%20),
      auditReady:true,
      science:true,
      forwardShadow:true,
      chronological:i<20,
      cost:i<20,
      concentration:i<20,
      winnerRemoval:i<20
    });
  }
  const evaluation=evaluateBiggjResearchProtocol(protocol,tree);
  assert.equal(evaluation.state,'VALIDATION_REVIEW_EVIDENCE_READY');
  assert.equal(evaluation.postRegistrationEvidence.forwardShadow,30);
  assert.equal(evaluation.postRegistrationEvidence.independentEpisodes,20);
  assert.equal(evaluation.authority.automaticPromotion,false);
  assert.equal(evaluation.authority.automaticExperimentLaunch,false);
  assert.equal(evaluation.canExecuteLive,false);
});

test('agenda contract mismatch is rejected rather than silently changing hypothesis',()=>{
  const tree=skillTree(1000);
  const skill=discovered(tree);
  const agenda=agendaItem(skill);
  agenda.researchContract.hypothesis='Retrospectively changed hypothesis.';
  assert.throws(()=>compileBiggjResearchProtocol({
    tree,
    skillId:skill.skillId,
    agendaItem:agenda,
    registeredAt:1000
  }),/agenda hypothesis differs/);
});

test('tampering invalidates protocol fingerprint',()=>{
  const tree=skillTree(1000);
  const skill=discovered(tree);
  const protocol=compileBiggjResearchProtocol({
    tree,skillId:skill.skillId,agendaItem:agendaItem(skill),registeredAt:1000
  });
  const tampered=structuredClone(protocol);
  tampered.authority.automaticExperimentLaunch=true;
  const v=verifyBiggjResearchProtocol(tampered);
  assert.equal(v.ok,false);
  assert.ok(v.reasons.includes('AUTHORITY_INVARIANT_INVALID'));
  assert.ok(v.reasons.includes('FINGERPRINT_MISMATCH'));
});

test('summary remains compact and explicitly non-executing',()=>{
  const tree=skillTree(1000);
  const skill=discovered(tree);
  const protocol=compileBiggjResearchProtocol({
    tree,skillId:skill.skillId,agendaItem:agendaItem(skill),registeredAt:1000
  });
  const summary=researchProtocolSummary(protocol,tree);
  assert.equal(summary.integrity,'VALID');
  assert.equal(summary.state,'AWAITING_PROSPECTIVE_EVIDENCE');
  assert.equal(summary.automaticExperimentLaunch,false);
  assert.equal(summary.automaticSkillStatusTransition,false);
  assert.equal(summary.automaticPromotion,false);
  assert.equal(summary.primaryMutationAllowed,false);
  assert.equal(summary.execution,'SHADOW_ONLY');
  assert.equal(summary.canExecuteLive,false);
});
