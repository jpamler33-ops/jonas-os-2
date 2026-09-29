import { historicalPitReplay, brierScore } from './replay.mjs';
import { walkForwardCalibration } from './calibration.mjs';
const sign=n=>n>0?1:n<0?-1:0;
const mean=xs=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;
export function benchmarkSteps(steps){
 const biggj=historicalPitReplay(steps);
 const actual=steps.map(s=>s.outcomeReturnPct>0);
 const alwaysUp={name:'ALWAYS_UP',meanBrier:actual.reduce((x,y)=>x+brierScore(1,y),0)/actual.length,hitRate:actual.filter(Boolean).length/actual.length};
 const random={name:'UNINFORMED_50',meanBrier:.25,hitRate:.5};
 const momentumHits=steps.filter(s=>sign(s.direction)===sign(s.outcomeReturnPct)).length;
 const momentum={name:'MOMENTUM_DIRECTION',hitRate:momentumHits/steps.length};
 const shadow=biggj.results.filter(r=>r.decision.action!=='ABSTAIN');
 const shadowHits=shadow.filter(r=>r.autopsy.correctDirection===true).length;
 const rawRows=biggj.results.map(r=>r.calibration);
 const wf=walkForwardCalibration(rawRows,{warmup:Math.min(200,Math.max(30,Math.floor(rawRows.length*.25))),window:1000,bins:10,minSamples:20,shrinkage:50});
 const ready=wf.filter(r=>r.calibrationReady);
 const calibratedBrier=mean(ready.map(r=>brierScore(r.calibratedProbability,r.outcome)));
 const rawComparableBrier=mean(ready.map(r=>brierScore(r.rawProbability,r.outcome)));
 const calibrationV1={samples:ready.length,warmup:wf.length-ready.length,meanBrier:calibratedBrier,rawComparableBrier,deltaBrier:rawComparableBrier==null||calibratedBrier==null?null:rawComparableBrier-calibratedBrier,beatsUninformed50:calibratedBrier!=null?calibratedBrier<.25:null,promoteToCore:calibratedBrier!=null&&calibratedBrier<.25&&calibratedBrier<rawComparableBrier};
 return Object.freeze({n:steps.length,biggj:{meanBrier:biggj.meanBrier,tradeFrequency:shadow.length/steps.length,hitRate:shadow.length?shadowHits/shadow.length:null,abstainRate:biggj.abstains/steps.length},calibrationV1,baselines:{alwaysUp,random,momentum},calibration:biggj.calibration});
}
export function ablationCompare(namedStepSets){
 const entries=Object.entries(namedStepSets).map(([name,steps])=>[name,benchmarkSteps(steps)]);
 const base=entries.find(([n])=>n==='BASE')?.[1];
 return Object.fromEntries(entries.map(([name,r])=>[name,{...r,deltaVsBaseBrier:base?base.biggj.meanBrier-r.biggj.meanBrier:null,deltaVsBaseHitRate:base&&r.biggj.hitRate!=null&&base.biggj.hitRate!=null?r.biggj.hitRate-base.biggj.hitRate:null}]));
}
