import assert from 'node:assert/strict';
import {JONAS_CLONE_V1_POLICY} from '../jonas-clone-v1.mjs';
assert.equal(JONAS_CLONE_V1_POLICY.version,'JONAS_CLONE_V1');
assert.equal(JONAS_CLONE_V1_POLICY.priority,'P0');
assert.equal(JONAS_CLONE_V1_POLICY.execution,'SHADOW_ONLY');
assert.equal(JONAS_CLONE_V1_POLICY.canExecuteLive,false);
console.log('JONAS_CLONE_V1_REVIEW_READY');
