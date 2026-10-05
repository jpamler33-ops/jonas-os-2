import test from 'node:test';
import assert from 'node:assert/strict';
import {JONAS_CLONE_V1_POLICY,jonasCloneSizeSol,jonasCloneEligible,jonasCloneResearchPlan} from '../jonas-clone-v1.mjs';

test('clone remains shadow-only P0',()=>{
  assert.equal(JONAS_CLONE_V1_POLICY.priority,'P0');
  assert.equal(JONAS_CLONE_V1_POLICY.execution,'SHADOW_ONLY');
  assert.equal(JONAS_CLONE_V1_POLICY.canExecuteLive,false);
});

test('liquidity proportional research sizing matches user hypothesis',()=>{
  assert.equal(jonasCloneSizeSol(10000),4);
  assert.equal(jonasCloneSizeSol(20000),8);
  assert.equal(jonasCloneSizeSol(40000),16);
});

test('eligibility requires ultra-early 99k trend candidate',()=>{
  assert.equal(jonasCloneEligible({ageSeconds:60,marketCapUsd:99000,trendFeed:true}),true);
  assert.equal(jonasCloneEligible({ageSeconds:61,marketCapUsd:99000,trendFeed:true}),false);
  assert.equal(jonasCloneEligible({ageSeconds:30,marketCapUsd:98000,trendFeed:true}),false);
  assert.equal(jonasCloneEligible({ageSeconds:30,marketCapUsd:120000,trendFeed:false}),false);
});

test('research plan exposes 3/4/5/10 minute comparisons without live execution',()=>{
  const plan=jonasCloneResearchPlan({ageSeconds:20,marketCapUsd:120000,liquidityUsd:20000,trendFeed:true});
  assert.equal(plan.eligible,true);
  assert.equal(plan.sizeSol,8);
  assert.deepEqual(plan.exitComparisonsSeconds,[180,240,300,600]);
  assert.equal(plan.liquidityDecaySignal,true);
  assert.equal(plan.canExecuteLive,false);
});
