import crypto from 'node:crypto';
const q=(xs,p)=>{const a=[...xs].filter(Number.isFinite).sort((a,b)=>a-b);return a[Math.min(a.length-1,Math.floor((a.length-1)*p))];};
const canonical=x=>JSON.stringify(x,Object.keys(x).sort());
export function fitCandidateThresholds(spec,trainRows){
 const [fa,fb]=spec.features,[sa,sb]=spec.sides;let best=null;
 for(const qa of [.2,.35,.5,.65,.8])for(const qb of [.2,.35,.5,.65,.8]){const ta=q(trainRows.map(r=>r.features[fa]),qa),tb=q(trainRows.map(r=>r.features[fb]),qb);const hit=trainRows.filter(r=>(sa>0?r.features[fa]>=ta:r.features[fa]<=ta)&&(sb>0?r.features[fb]>=tb:r.features[fb]<=tb));if(hit.length<25)continue;const base=trainRows.filter(r=>r.label.largeMove).length/trainRows.length;const rate=hit.filter(r=>r.label.largeMove).length/hit.length;const lift=base?rate/base:0;const score=lift*Math.log1p(hit.length);if(!best||score>best.score)best={thresholds:[ta,tb],quantiles:[qa,qb],support:hit.length,trainLift:lift,score};}
 if(!best)throw new Error(`BIGGJ_NO_THRESHOLD_${spec.id}`);return {...spec,...best};
}
export function createFrozenRegistry(specs,trainRowsByKey,{trainingCutoff,sourceRun}={}){
 const candidates=specs.map(s=>fitCandidateThresholds(s,trainRowsByKey[`${s.interval}:${s.horizon}`]??[]));const payload={version:1,purpose:'RESEARCH_ONLY',canExecuteLive:false,sourceRun,trainingCutoff,candidates};const hash=crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');return Object.freeze({...payload,sha256:hash});
}
export function verifyFrozenRegistry(registry){const {sha256,...payload}=registry;return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex')===sha256;}
