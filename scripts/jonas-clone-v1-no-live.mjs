import assert from 'node:assert/strict';
import {applyJonasClonePriority,jonasCloneCandidateToShadowIntent} from '../jonas-clone-v1-integration.mjs';
assert.equal(applyJonasClonePriority({canExecuteLive:true}).canExecuteLive,false);
assert.equal(jonasCloneCandidateToShadowIntent({ageSeconds:1,marketCapUsd:100000,liquidityUsd:10000,trendFeed:true}).canExecuteLive,false);
console.log('JONAS_CLONE_NO_LIVE_PASS');
