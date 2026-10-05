import assert from 'node:assert/strict';
import {jonasCloneEligible} from '../jonas-clone-v1.mjs';
assert.equal(jonasCloneEligible({ageSeconds:60,marketCapUsd:99000,trendFeed:true}),true);
assert.equal(jonasCloneEligible({ageSeconds:61,marketCapUsd:99000,trendFeed:true}),false);
assert.equal(jonasCloneEligible({ageSeconds:60,marketCapUsd:98999,trendFeed:true}),false);
assert.equal(jonasCloneEligible({ageSeconds:60,marketCapUsd:99000,trendFeed:false}),false);
console.log('JONAS_CLONE_V1_ELIGIBILITY_PASS');
