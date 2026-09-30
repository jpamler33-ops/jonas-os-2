import crypto from 'node:crypto';import {structuralFeatures} from './direction-discovery-v2.mjs';
const q=(xs,p)=>{const a=[...xs].filter(Number.isFinite).sort((a,b)=>a-b);return a.length?a[Math.floor((a.length-1)*p)]:0};
export const DIRECTION_V2_IDENTITIES=Object.freeze([
{id:'DV2_C1',direction:'UP',conditions:[['momentum6',1,.6],['volExpansion',-1,.4],['volumePersistence',1,.6]]},
{id:'DV2_C2',direction:'DOWN',conditions:[['momentum6',1,.6],['volExpansion',-1,.4],['volumeShock',-1,.4]]},
{id:'DV2_C3',direction:'DOWN',conditions:[['momentum6',1,.6],['volExpansion',-1,.4],['volumePersistence',-1,.4]]}
]);
export function freezeDirectionV2(rows,{cutoff='2026-01-01T00:00:00Z'}={}){const base=rows.filter(r=>r.label.largeMove);const candidates=DIRECTION_V2_IDENTITIES.map(x=>({id:x.id,direction:x.direction,conditions:x.conditions.map(([feature,side,p])=>({feature,side,quantile:p,threshold:q(base.map(r=>structuralFeatures(r)[feature]),p)}))}));const payload={schema:'BIGGJ_DIRECTION_V2_REGISTRY',purpose:'RESEARCH_ONLY',mode:'SHADOW_ONLY',canExecuteLive:false,trainingCutoff:cutoff,candidates};const sha256=crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');return Object.freeze({...payload,sha256});}
export function verifyDirectionV2Registry(r){const {sha256,...payload}=r;return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex')===sha256;}
