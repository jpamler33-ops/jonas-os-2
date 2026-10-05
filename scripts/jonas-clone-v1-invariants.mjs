import assert from 'node:assert/strict';
import {JONAS_CLONE_V1_POLICY} from '../jonas-clone-v1.mjs';
for(const [k,v] of Object.entries({priority:'P0',execution:'SHADOW_ONLY',canExecute:false,canExecuteLive:false,automaticPrimaryMutation:false})) assert.equal(JONAS_CLONE_V1_POLICY[k],v,k);
console.log('JONAS_CLONE_V1_INVARIANTS_PASS');
