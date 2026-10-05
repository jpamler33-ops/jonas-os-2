import assert from 'node:assert/strict';
import {jonasCloneEligible} from '../jonas-clone-v1.mjs';
assert(jonasCloneEligible({ageSeconds:0,marketCapUsd:99000,trendFeed:true}));
assert(jonasCloneEligible({ageSeconds:60,marketCapUsd:99000,trendFeed:true}));
assert(!jonasCloneEligible({ageSeconds:60.01,marketCapUsd:99000,trendFeed:true}));
console.log('JONAS_CLONE_BOUNDARY_PASS');
