import assert from 'node:assert/strict';
import {applyJonasClonePriority} from '../jonas-clone-v1-integration.mjs';
const r=applyJonasClonePriority({execution:'LIVE',canExecute:true,canExecuteLive:true,automaticPrimaryMutation:true});
assert.deepEqual([r.execution,r.canExecute,r.canExecuteLive,r.automaticPrimaryMutation],['SHADOW_ONLY',false,false,false]);
console.log('JONAS_CLONE_RELEASE_SAFETY_PASS');
