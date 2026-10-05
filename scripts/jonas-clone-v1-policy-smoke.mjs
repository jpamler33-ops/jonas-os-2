import assert from 'node:assert/strict';
import {JONAS_CLONE_V1_POLICY} from '../jonas-clone-v1.mjs';
assert.equal(JONAS_CLONE_V1_POLICY.discovery.maxAgeSeconds,60);
assert.equal(JONAS_CLONE_V1_POLICY.discovery.minMarketCapUsd,99000);
assert.equal(JONAS_CLONE_V1_POLICY.discovery.requireTrendFeed,true);
assert.equal(JONAS_CLONE_V1_POLICY.sizing.epistemic,'USER_HYPOTHESIS_NOT_LIVE_SAFE_LIMIT');
console.log('JONAS_CLONE_POLICY_PASS');
