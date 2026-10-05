import assert from 'node:assert/strict';
import {jonasCloneCandidateToShadowIntent} from '../jonas-clone-v1-integration.mjs';
for(const [liq,sol] of [[10000,4],[20000,8],[30000,12],[40000,16]]){
 const x=jonasCloneCandidateToShadowIntent({ageSeconds:30,marketCapUsd:120000,liquidityUsd:liq,trendFeed:true});
 assert.equal(x.sizeSol,sol);
 assert.equal(x.execution,'SHADOW_ONLY');
 assert.equal(x.canExecuteLive,false);
}
console.log('JONAS_CLONE_V1_REVIEW_SMOKE_PASS');
