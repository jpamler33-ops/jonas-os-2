import test from 'node:test';
import assert from 'node:assert/strict';
import {applyJonasClonePriority,jonasCloneCandidateToShadowIntent} from '../jonas-clone-v1-integration.mjs';

test('hostile runtime input cannot turn clone live',()=>{
  const r=applyJonasClonePriority({execution:'LIVE',canExecute:true,canExecuteLive:true,automaticPrimaryMutation:true});
  assert.equal(r.execution,'SHADOW_ONLY');
  assert.equal(r.canExecute,false);
  assert.equal(r.canExecuteLive,false);
  assert.equal(r.automaticPrimaryMutation,false);
});

test('intent never exposes live execution',()=>{
  const x=jonasCloneCandidateToShadowIntent({ageSeconds:1,marketCapUsd:999999,liquidityUsd:20000,trendFeed:true});
  assert.equal(x.execution,'SHADOW_ONLY');
  assert.equal(x.canExecute,false);
  assert.equal(x.canExecuteLive,false);
});
