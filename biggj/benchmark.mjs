import { historicalPitReplay, brierScore } from './replay.mjs';
const sign=n=>n>0?1:n<0?-1:0;
export function benchmarkSteps(steps){
 const biggj=historicalPitReplay(steps);
 const actual=steps.map(s=>s.outcomeReturnPct>0);
 const alwaysUp={name:'ALWAYS_UP',meanBrier:actual.reduce((x,y)=>x+brierScore(1,y),0)/actual.length,hitRate:actual.filter(Boolean).length/actual.length};
 const random={name:'UNINFORMED_50',meanBrier:.25,hitRate:.5};
 const momentumHits=steps.filter(s=>sign(s.direction)===sign(s.outcomeReturnPct)).length;
 const momentum={name:'MOMENTUM_DIRECTION',hitRate:momentumHits/steps.length};
 const shadow=biggj.results.filter(r=>r.decision.action!=='ABSTAIN');
 const shadowHits=shadow.filter(r=>r.autopsy.correctDirection===true).length;
 return Object.freeze({n:steps.length,biggj:{meanBrier:biggj.meanBrier,tradeFrequency:shadow.length/steps.length,hitRate:shadow.length?shadowHits/shadow.length:null,abstainRate:biggj.abstains/steps.length},baselines:{alwaysUp,random,momentum},calibration:biggj.calibration});
}
export function ablationCompare(namedStepSets){
 const entries=Object.entries(namedStepSets).map(([name,steps])=>[name,benchmarkSteps(steps)]);
 const base=entries.find(([n])=>n==='BASE')?.[1];
 return Object.fromEntries(entries.map(([name,r])=>[name,{...r,deltaVsBaseBrier:base?base.biggj.meanBrier-r.biggj.meanBrier:null,deltaVsBaseHitRate:base&&r.biggj.hitRate!=null&&base.biggj.hitRate!=null?r.biggj.hitRate-base.biggj.hitRate:null}]));
}
