import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createBiggjSkillTree,
  proposeBiggjChildSkill,
  buildBiggjResearchQueue,
  biggjSkillTreeSnapshot
} from './biggj-skill-tree.mjs';
import {
  BIGGJ_ROOT_DEPENDENCIES,
  BIGGJ_SKILL_DEPENDENCIES,
  BIGGJ_SKILL_COMPOSITIONS,
  validateBiggjDependencyGraph,
  canonicalDependenciesFor,
  canonicalSkillLeverage,
  biggjDependencyLeverageReport,
  evaluateBiggjSkillDependencyGate,
  evaluateBiggjComposition,
  biggjCompositionReadiness,
  biggjDependencyBottleneckReport
} from './biggj-skill-dependency-graph.mjs';

function mutableTree(){
  return structuredClone(createBiggjSkillTree({asOf:1_000_000}));
}
function setStatus(tree,capabilityId,status){
  const node=tree.nodes.find(x=>x.capabilityId===capabilityId&&x.kind!=='ROOT');
  if(!node) throw new Error('missing test capability '+capabilityId);
  node.status=status;
  return node;
}

test('canonical dependency graph is acyclic, complete and shadow-only',()=>{
  const v=validateBiggjDependencyGraph();
  assert.equal(v.ok,true);
  assert.deepEqual(v.reasons,[]);
  assert.ok(BIGGJ_ROOT_DEPENDENCIES.length>=40);
  assert.ok(BIGGJ_SKILL_DEPENDENCIES.length>=150);
  assert.ok(BIGGJ_SKILL_COMPOSITIONS.length>=10);
  assert.equal(v.execution,'SHADOW_ONLY');
  assert.equal(v.action,'ABSTAIN');
  assert.equal(v.canExecuteLive,false);
});

test('research remains possible while immature prerequisites block testing',()=>{
  const tree=mutableTree();
  const provenance=tree.nodes.find(x=>x.capabilityId==='PROVENANCE_CHAIN');
  const research=evaluateBiggjSkillDependencyGate(tree,{skillId:provenance.skillId,phase:'RESEARCH'});
  const testing=evaluateBiggjSkillDependencyGate(tree,{skillId:provenance.skillId,phase:'TESTING'});
  assert.equal(research.ready,true);
  assert.equal(research.blockers.length,0);
  assert.ok(research.warnings.some(x=>x.dependencyCapabilityId==='PIT_EVENT_CLOCK'));
  assert.equal(testing.ready,false);
  assert.ok(testing.blockers.some(x=>x.dependencyCapabilityId==='PIT_EVENT_CLOCK'));
});

test('testing gate opens when hard prerequisites reach learning maturity',()=>{
  const tree=mutableTree();
  setStatus(tree,'PIT_EVENT_CLOCK','LEARNING');
  const provenance=tree.nodes.find(x=>x.capabilityId==='PROVENANCE_CHAIN');
  const gate=evaluateBiggjSkillDependencyGate(tree,{skillId:provenance.skillId,phase:'TESTING'});
  assert.equal(gate.ready,true);
  assert.equal(gate.blockers.length,0);
});

test('guard dependencies do not prevent research testing but do block decision influence',()=>{
  const tree=mutableTree();
  setStatus(tree,'PIT_EVENT_CLOCK','TESTING');
  setStatus(tree,'PROVENANCE_CHAIN','TESTING');
  const world=tree.nodes.find(x=>x.capabilityId==='CANONICAL_WORLD_STATE');
  const testing=evaluateBiggjSkillDependencyGate(tree,{skillId:world.skillId,phase:'TESTING'});
  assert.equal(testing.ready,true);
  const decision=evaluateBiggjSkillDependencyGate(tree,{skillId:world.skillId,phase:'DECISION'});
  assert.equal(decision.ready,false);
  assert.ok(decision.blockers.some(x=>
    x.dependencyCapabilityId==='EVIDENCE_INDEPENDENCE'&&x.relation==='GUARD'
  ));
});

test('discovered child-skill dependencies use the same maturity gates',()=>{
  let tree=createBiggjSkillTree({asOf:1_000_000});
  const parent=tree.nodes.find(x=>x.capabilityId==='SELF_QUESTIONING');
  const pit=tree.nodes.find(x=>x.capabilityId==='PIT_EVENT_CLOCK');
  tree=proposeBiggjChildSkill(tree,{
    parentSkillId:parent.skillId,
    title:'TEMPORAL_ANOMALY_RESEARCH',
    question:'Do recurring temporal anomalies explain a measurable residual forecast error?',
    hypothesis:'A defined temporal anomaly cohort has reproducible forward forecast-error differences.',
    falsifier:'No out-of-sample difference after PIT-safe matching and scientific guards.',
    dependencies:[pit.skillId],
    asOf:1_001_000
  });
  const child=tree.nodes.find(x=>x.title==='TEMPORAL_ANOMALY_RESEARCH');
  assert.equal(evaluateBiggjSkillDependencyGate(tree,{skillId:child.skillId,phase:'RESEARCH'}).ready,true);
  assert.equal(evaluateBiggjSkillDependencyGate(tree,{skillId:child.skillId,phase:'TESTING'}).ready,false);
});

test('dependency leverage identifies foundation skills that unlock many downstream capabilities',()=>{
  const provenance=canonicalSkillLeverage('PROVENANCE_CHAIN');
  const isolated=canonicalSkillLeverage('SECRET_SUPPLY_CHAIN_SECURITY');
  assert.ok(provenance.directUnlocks>=10);
  assert.ok(provenance.transitiveUnlocks>=50);
  assert.ok(provenance.score>isolated.score);
  const report=biggjDependencyLeverageReport({limit:20});
  assert.ok(report.rows.some(x=>x.capabilityId==='PROVENANCE_CHAIN'));
  assert.ok(report.rows.some(x=>x.capabilityId==='CANONICAL_WORLD_STATE'));
  assert.equal(report.canExecuteLive,false);
});

test('canonical dependency lookup exposes why a skill is blocked',()=>{
  const deps=canonicalDependenciesFor('EXPECTED_UTILITY_DECISION');
  const ids=new Set(deps.map(x=>x.dependencyCapabilityId));
  assert.ok(ids.has('CALIBRATED_PROBABILITY'));
  assert.ok(ids.has('UNCERTAINTY_DECOMPOSITION'));
  assert.ok(ids.has('OPPORTUNITY_COST'));
  assert.ok(ids.has('NO_TRADE_BASELINE'));
});

test('composition readiness fails closed until the stack is mature',()=>{
  const tree=mutableTree();
  const decision=evaluateBiggjComposition(tree,'SHADOW_DECISION_READINESS_STACK');
  assert.equal(decision.ready,false);
  assert.ok(decision.memberBlockers.length>0);
  assert.equal(decision.execution,'SHADOW_ONLY');
  assert.equal(decision.action,'ABSTAIN');
  assert.equal(decision.canExecuteLive,false);

  const all=biggjCompositionReadiness(tree);
  assert.equal(all.ready.length,0);
  assert.ok(all.blocked.length>=10);
});

test('dependency bottleneck report surfaces shared prerequisites rather than forcing downstream work',()=>{
  const tree=mutableTree();
  const report=biggjDependencyBottleneckReport(tree,{phase:'TESTING',limit:20});
  assert.ok(report.blockedSkillCount>0);
  assert.ok(report.bottlenecks.length>0);
  assert.ok(report.bottlenecks.some(x=>x.dependencyId==='PIT_EVENT_CLOCK'||x.dependencyId==='PROVENANCE_CHAIN'));
  assert.equal(report.canExecuteLive,false);
});

test('research queue includes dependency leverage and concrete testing blockers',()=>{
  const tree=createBiggjSkillTree({asOf:1_000_000});
  const queue=buildBiggjResearchQueue(tree,{limit:40}).queue;
  assert.ok(queue.length>0);
  assert.ok(queue.every(x=>Number.isFinite(x.dependencyLeverage)));
  assert.ok(queue.every(x=>Array.isArray(x.testingBlockers)));
  assert.ok(queue.some(x=>x.transitiveUnlocks>0));
  assert.ok(queue.some(x=>x.testingDependencyReady===false));
});

test('operator skill-tree snapshot exposes bottlenecks and composition readiness without execution authority',()=>{
  const tree=createBiggjSkillTree({asOf:1_000_000});
  const snap=biggjSkillTreeSnapshot(tree);
  assert.ok(Array.isArray(snap.dependencyBottlenecks));
  assert.ok(snap.dependencyBottlenecks.length>0);
  assert.ok(Array.isArray(snap.compositionReadiness));
  assert.ok(snap.compositionReadiness.length>0);
  assert.equal(snap.silentPrimaryMutation,false);
  assert.equal(snap.execution,'SHADOW_ONLY');
  assert.equal(snap.action,'ABSTAIN');
  assert.equal(snap.canExecuteLive,false);
});
