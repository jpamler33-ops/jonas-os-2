import assert from 'node:assert/strict';
import {JONAS_CLONE_V1_POLICY} from '../jonas-clone-v1.mjs';
assert.deepEqual(JONAS_CLONE_V1_POLICY.observation.checkpointsSeconds,[60,120,180,240,300,600]);
assert.deepEqual(JONAS_CLONE_V1_POLICY.observation.exitComparisonsSeconds,[180,240,300,600]);
assert.equal(JONAS_CLONE_V1_POLICY.observation.minimumNormalLossExitSeconds,180);
console.log('JONAS_CLONE_CHECKPOINTS_PASS');
