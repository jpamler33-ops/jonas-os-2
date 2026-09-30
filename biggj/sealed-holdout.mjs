import { verifyFrozenRegistry } from './freeze-thresholds.mjs';
import { evaluateFrozenCandidate, costStress } from './discovery-validation.mjs';
const mean=x=>x.length?x.reduce((a,b)=>a+b,0)/x.length:0;
export function matchesFrozen(candidate,row){const [fa,fb]=candidate.features,[ta,tb]=candidate.thresholds,[sa,sb]=candidate.sides;return (sa>0?row.features[fa]>=ta:row.features[fa]<=ta)&&(sb>0?row.features[fb]>=tb:row.features[fb]<=tb);}
export function challengeFrozenRegistry(registry,holdoutRowsByKey,{largeMoveThreshold=.01}={}){
 if(!verifyFrozenRegistry(registry))throw new Error('BIGGJ_FROZEN_REGISTRY_INTEGRITY_FAILED');
 const results=registry.candidates.map(c=>{const rows=holdoutRowsByKey[`${c.interval}:${c.horizon}`]??[];const matched=rows.filter(r=>matchesFrozen(c,r));const baseRate=rows.length?mean(rows.map(r=>r.label.largeMove?1:0)):0;const eventRate=matched.length?mean(matched.map(r=>r.label.largeMove?1:0)):0;const lift=baseRate&&matched.length?eventRate/baseRate:0;const gross=matched.map(r=>r.label.returnPct);const validation=evaluateFrozenCandidate({id:c.id,folds:[{support:matched.length,lift}],minFolds:1,minSupport:50,minPositiveShare:1,minMeanLift:1.1});return {id:c.id,n:rows.length,support:matched.length,baseRate,eventRate,lift,meanReturn:mean(gross),upRate:matched.length?matched.filter(r=>r.label.returnPct>0).length/matched.length:null,costStress:costStress({grossReturns:gross}),validation};});
 return Object.freeze({registrySha256:registry.sha256,trainingCutoff:registry.trainingCutoff,purpose:'RESEARCH_ONLY',mode:'SHADOW_ONLY',canExecuteLive:false,results});
}
