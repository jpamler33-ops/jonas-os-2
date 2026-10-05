import assert from 'node:assert/strict';
import {applyJonasClonePriority} from '../jonas-clone-v1-integration.mjs';
const r=applyJonasClonePriority({tradingResearchPriority:'OTHER',canExecuteLive:true});
assert.equal(r.tradingResearchPriority,'JONAS_CLONE_V1');
assert.equal(r.tradingResearchPriorityLevel,'P0');
assert.equal(r.canExecuteLive,false);
console.log('JONAS_CLONE_P0_PASS');
