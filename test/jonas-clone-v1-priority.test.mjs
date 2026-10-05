import test from 'node:test';
import assert from 'node:assert/strict';
import { JONAS_CLONE_V1_POLICY, jonasCloneSizeSol, jonasCloneResearchPlan } from '../jonas-clone-v1.mjs';

test('JONAS_CLONE_V1 remains P0 and shadow-only',()=>{
  assert.equal(JONAS_CLONE_V1_POLICY.priority,'P0');
  assert.equal(JONAS_CLONE_V1_POLICY.execution,'SHADOW_ONLY');
  assert.equal(JONAS_CLONE_V1_POLICY.canExecuteLive,false);
  assert.equal(JONAS_CLONE_V1_POLICY.automaticPrimaryMutation,false);
});

test('liquidity sizing hypothesis matches manual reference points',()=>{
  assert.equal(jonasCloneSizeSol(10_000),4);
  assert.equal(jonasCloneSizeSol(20_000),8);
  assert.equal(jonasCloneSizeSol(40_000),16);
});

test('eligible research plan carries required exit comparisons',()=>{
  const plan=jonasCloneResearchPlan({ageSeconds:30,marketCapUsd:120_000,liquidityUsd:20_000,trendFeed:true});
  assert.equal(plan.eligible,true);
  assert.equal(plan.sizeSol,8);
  assert.deepEqual(plan.exitComparisonsSeconds,[180,240,300,600]);
  assert.equal(plan.canExecuteLive,false);
});
