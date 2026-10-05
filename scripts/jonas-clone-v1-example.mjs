import {jonasCloneCandidateToShadowIntent} from '../jonas-clone-v1-integration.mjs';
const examples=[10000,20000,30000,40000].map(liquidityUsd=>jonasCloneCandidateToShadowIntent({ageSeconds:30,marketCapUsd:120000,liquidityUsd,trendFeed:true}));
console.log(JSON.stringify(examples,null,2));
