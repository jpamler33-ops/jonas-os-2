import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BIGGJ_HISTORICAL_RESEARCH_CONTRACTS,
  validateBiggjHistoricalResearchContracts,
  biggjHistoricalProposalResearchQueue,
  biggjHistoricalResearchContract
} from './biggj-historical-proposal-research-gate.mjs';

test('all fifteen recovered proposals have complete governed research contracts',()=>{
  const v=validateBiggjHistoricalResearchContracts();
  assert.equal(v.ok,true);
  assert.deepEqual(v.reasons,[]);
  assert.equal(v.recoveredProposalCount,15);
  assert.equal(v.contractCount,15);
  assert.equal(BIGGJ_HISTORICAL_RESEARCH_CONTRACTS.length,15);
  assert.equal(v.execution,'SHADOW_ONLY');
  assert.equal(v.action,'ABSTAIN');
  assert.equal(v.canExecuteLive,false);
});

test('every research contract is falsifiable and explicit about data, PIT, guards and kill criteria',()=>{
  for(const c of BIGGJ_HISTORICAL_RESEARCH_CONTRACTS){
    assert.ok(c.question.length>20,c.title+' question');
    assert.ok(c.hypothesis.length>20,c.title+' hypothesis');
    assert.ok(c.falsifier.length>20,c.title+' falsifier');
    assert.ok(c.forwardShadowDesign.length>20,c.title+' forward shadow');
    for(const field of ['dependencies','requiredData','baselines','pitRequirements','scientificGuards','killCriteria']){
      assert.ok(Array.isArray(c[field]),c.title+' '+field);
      assert.ok(c[field].length>0,c.title+' '+field+' empty');
    }
  }
});

test('research ranking is explicitly a planning heuristic and never evidence or execution authority',()=>{
  const q=biggjHistoricalProposalResearchQueue();
  assert.equal(q.scoringStatus,'MODELLED_RESEARCH_PLANNING_HEURISTIC_NOT_EVIDENCE');
  assert.match(q.formula,/parentLeverage/);
  assert.equal(q.automaticImplementation,false);
  assert.equal(q.automaticPromotion,false);
  assert.equal(q.execution,'SHADOW_ONLY');
  assert.equal(q.action,'ABSTAIN');
  assert.equal(q.canExecuteLive,false);
});

test('claim assumption graph is the first implementation-ready research candidate',()=>{
  const q=biggjHistoricalProposalResearchQueue();
  assert.equal(q.recommendedFirstResearch,'CLAIM_ASSUMPTION_GRAPH');
  assert.equal(q.queue[0].title,'CLAIM_ASSUMPTION_GRAPH');
  assert.equal(q.queue[0].implementationReady,true);
  assert.equal(q.queue[0].parentCapabilityId,'PROVENANCE_CHAIN');
  assert.ok(q.queue[0].parentDependencyLeverage>.8);
  assert.ok(q.queue[0].researchPriority>.85);
});

test('proposal dependency chains block implementation but never block research',()=>{
  const q=biggjHistoricalProposalResearchQueue();
  const expected={
    INTERVENTION_VALUE_MAP:['MECHANISM_POSTERIOR_GRAPH'],
    MECHANISM_POSTERIOR_GRAPH:['MECHANISM_ENSEMBLE'],
    MINIMUM_CASCADE_TRIGGER:['PRICE_TIME_CONSTRAINT_SURFACE'],
    CASCADE_BASIN:['MINIMUM_CASCADE_TRIGGER'],
    ABSORPTION_RESERVE:['CASCADE_BASIN'],
    RESEARCH_POLICY_GENOME:['GOVERNED_EXPERIMENT_BLUEPRINTS']
  };
  for(const [title,deps] of Object.entries(expected)){
    const row=q.queue.find(x=>x.title===title);
    assert.ok(row,title);
    assert.equal(row.researchable,true,title);
    assert.equal(row.implementationReady,false,title);
    assert.deepEqual(row.blockingProposalDependencies,deps,title);
  }
});

test('latent market energy contract prevents semantic overclaim',()=>{
  const c=biggjHistoricalResearchContract('LATENT_MARKET_ENERGY');
  assert.equal(c.epistemicStatus,'RESEARCH_PROPOSAL_NOT_VALIDATED');
  assert.match(c.question,/bounded latent constrained-flow diagnostic/i);
  assert.ok(c.killCriteria.some(x=>/probability/i.test(x)));
  assert.equal(c.canExecuteLive,false);
});

test('mechanism posterior graph cannot outrun mechanism ensemble',()=>{
  const c=biggjHistoricalResearchContract('MECHANISM_POSTERIOR_GRAPH');
  assert.equal(c.implementationReady,false);
  assert.deepEqual(c.blockingProposalDependencies,['MECHANISM_ENSEMBLE']);
  assert.ok(c.scientificGuards.some(x=>/prior sensitivity/i.test(x)));
  assert.ok(c.scientificGuards.some(x=>/posterior overconfidence/i.test(x)));
});

test('governed experiment blueprints prohibit arbitrary autonomous code mutation',()=>{
  const c=biggjHistoricalResearchContract('GOVERNED_EXPERIMENT_BLUEPRINTS');
  assert.equal(c.implementationReady,true);
  assert.ok(c.scientificGuards.some(x=>/unbounded code execution/i.test(x)));
  assert.ok(c.killCriteria.some(x=>/arbitrary code execution/i.test(x)));
  assert.equal(c.automaticImplementation,false);
  assert.equal(c.automaticPromotion,false);
});

test('research policy genome remains downstream of governed experiment blueprints and immutable controls',()=>{
  const c=biggjHistoricalResearchContract('RESEARCH_POLICY_GENOME');
  assert.deepEqual(c.blockingProposalDependencies,['GOVERNED_EXPERIMENT_BLUEPRINTS']);
  assert.ok(c.dependencies.includes('CONSTITUTION_ENFORCEMENT'));
  assert.ok(c.dependencies.includes('REPRODUCIBLE_PROMOTION_AUDIT'));
  assert.ok(c.scientificGuards.some(x=>/guard relaxation/i.test(x)));
  assert.equal(c.execution,'SHADOW_ONLY');
  assert.equal(c.canExecuteLive,false);
});

test('meme integrity research is isolated from momentum and protects against label leakage',()=>{
  const c=biggjHistoricalResearchContract('MEME_RUG_RISK_INTELLIGENCE');
  assert.ok(c.dependencies.includes('MEME_MOMENTUM'));
  assert.ok(c.dependencies.includes('ONCHAIN_INTELLIGENCE'));
  assert.ok(c.scientificGuards.some(x=>/label leakage/i.test(x)));
  assert.ok(c.pitRequirements.some(x=>/no later scam\/rug labels/i.test(x)));
});

test('all proposal priorities remain bounded and all source provenance survives ranking',()=>{
  const q=biggjHistoricalProposalResearchQueue();
  assert.equal(q.queue.length,15);
  for(const row of q.queue){
    assert.ok(row.researchPriority>=0&&row.researchPriority<=1,row.title);
    assert.ok(row.parentDependencyLeverage>=0&&row.parentDependencyLeverage<=1,row.title);
    assert.ok(Array.isArray(row.sourceIdeaIds)&&row.sourceIdeaIds.length>0,row.title);
    assert.ok(Array.isArray(row.sourceTitles)&&row.sourceTitles.length>0,row.title);
  }
});
