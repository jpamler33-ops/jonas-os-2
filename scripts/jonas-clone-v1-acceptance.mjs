import assert from 'node:assert/strict';
import {JONAS_CLONE_V1_POLICY} from '../jonas-clone-v1.mjs';
assert.equal(JONAS_CLONE_V1_POLICY.execution,'SHADOW_ONLY');
assert.equal(JONAS_CLONE_V1_POLICY.canExecuteLive,false);
assert.equal(JONAS_CLONE_V1_POLICY.validation.baselineImmutable,true);
assert.equal(JONAS_CLONE_V1_POLICY.observation.trackExitLiquidity,true);
assert.deepEqual(JONAS_CLONE_V1_POLICY.observation.exitComparisonsSeconds,[180,240,300,600]);
console.log('JONAS_CLONE_V1_ACCEPTANCE_CONTRACT_PASS');
