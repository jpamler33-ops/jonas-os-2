import test from 'node:test';
import assert from 'node:assert/strict';
import {applyJonasClonePriority,jonasCloneCandidateToShadowIntent} from '../jonas-clone-v1-integration.mjs';

test('P0 priority cannot enable execution',()=>{
  const r=applyJonasClonePriority({canExecuteLive:true,execution:'LIVE'});
  assert.equal(r.tradingResearchPriority,'JONAS_CLONE_V1');
  assert.equal(r.tradingResearchPriorityLevel,'P0');
  assert.equal(r.execution,'SHADOW_ONLY');
  assert.equal(r.canExecuteLive,false);
});

test('eligible candidate becomes W6 shadow intent',()=>{
  const x=jonasCloneCandidateToShadowIntent({ageSeconds:25,marketCapUsd:120000,liquidityUsd:20000,trendFeed:true});
  assert.equal(x.eligible,true);
  assert.equal(x.walletId,'W6_USER_99K_60S');
  assert.equal(x.sizeSol,8);
  assert.equal(x.priority,'P0');
  assert.equal(x.canExecuteLive,false);
});
