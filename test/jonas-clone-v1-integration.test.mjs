import test from 'node:test';
import assert from 'node:assert/strict';
import {applyJonasClonePriority,jonasCloneCandidateToShadowIntent,JONAS_CLONE_WALLET} from '../jonas-clone-v1-integration.mjs';

test('runtime priority is P0 but cannot execute live',()=>{const r=applyJonasClonePriority({healthy:true});assert.equal(r.tradingResearchPriorityLevel,'P0');assert.equal(r.execution,'SHADOW_ONLY');assert.equal(r.canExecuteLive,false);assert.equal(r.automaticPrimaryMutation,false);});
test('eligible candidate maps to W6 shadow intent',()=>{const i=jonasCloneCandidateToShadowIntent({ageSeconds:25,marketCapUsd:120000,liquidityUsd:20000,trendFeed:true});assert.equal(i.eligible,true);assert.equal(i.walletId,JONAS_CLONE_WALLET);assert.equal(i.sizeSol,8);assert.deepEqual(i.exitComparisonsSeconds,[180,240,300,600]);assert.equal(i.canExecuteLive,false);});
test('ineligible candidate cannot become executable intent',()=>{const i=jonasCloneCandidateToShadowIntent({ageSeconds:90,marketCapUsd:120000,liquidityUsd:20000,trendFeed:true});assert.equal(i.eligible,false);assert.equal(i.canExecuteLive,false);});
