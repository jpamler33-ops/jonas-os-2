import crypto from 'node:crypto';

export const EvidenceClass = Object.freeze({ OBSERVED:'OBSERVED', INFERRED:'INFERRED', MODELLED:'MODELLED', HYPOTHESIS:'HYPOTHESIS', UNKNOWN:'UNKNOWN' });
const clamp01=n=>Math.max(0,Math.min(1,Number(n)));
const id=(p,x)=>`${p}_${crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex').slice(0,16)}`;

export function evidenceRecord(input){
 if(!input?.source||!input?.eventTime||!input?.availableAt) throw new Error('BIGGJ_EVIDENCE_INVALID');
 if(Date.parse(input.availableAt)<Date.parse(input.eventTime)) throw new Error('BIGGJ_TIME_INVALID');
 const r={kind:EvidenceClass.OBSERVED,source:input.source,eventTime:input.eventTime,availableAt:input.availableAt,observedAt:input.observedAt??input.availableAt,independenceGroup:input.independenceGroup??input.source,confidence:clamp01(input.confidence??1),payload:input.payload??{},version:input.version??1};
 return Object.freeze({id:id('ev',r),...r});
}
export const pointInTime=(records,asOf)=>records.filter(r=>Date.parse(r.availableAt)<=Date.parse(asOf));
export function independentEvidence(records){const m=new Map();for(const r of records){const k=r.independenceGroup??r.source;if(!m.has(k)||m.get(k).confidence<r.confidence)m.set(k,r);}return [...m.values()];}
export function buildWorldState({asset='BTC',asOf,evidence=[]}){const v=independentEvidence(pointInTime(evidence,asOf));const known=v.length?Math.min(1,v.reduce((s,x)=>s+x.confidence,0)/Math.max(3,v.length)):0;return Object.freeze({id:id('world',{asset,asOf,evidence:v.map(x=>x.id)}),asset,asOf,evidenceIds:v.map(x=>x.id),independentEvidenceCount:v.length,knownness:known,unknownness:1-known});}

export function causalHypothesis({world,claim,direction=0,confidence=.5,evidenceIds=[]}){
 const allowed=new Set(world.evidenceIds); if(evidenceIds.some(x=>!allowed.has(x))) throw new Error('BIGGJ_HYPOTHESIS_FUTURE_OR_FOREIGN_EVIDENCE');
 const h={kind:EvidenceClass.HYPOTHESIS,worldId:world.id,claim:String(claim),direction:Math.max(-1,Math.min(1,Number(direction))),confidence:clamp01(confidence),evidenceIds:[...new Set(evidenceIds)],status:'PROPOSED'};
 return Object.freeze({id:id('hyp',h),...h});
}
export function evaluateHypothesis(h,{support=0,contradiction=0}){const net=clamp01((Number(support)-Number(contradiction)+1)/2);return Object.freeze({...h,confidence:clamp01((h.confidence+net)/2),status:net>=.65?'SUPPORTED':net<=.35?'REJECTED':'CONTESTED'});}

export function worldBranches({world,hypotheses=[],maxBranches=5}){
 const ranked=[...hypotheses].sort((a,b)=>b.confidence-a.confidence).slice(0,maxBranches);
 const branches=ranked.map(h=>Object.freeze({id:id('branch',{world:world.id,h:h.id}),worldId:world.id,hypothesisId:h.id,direction:h.direction,probability:h.confidence,kind:EvidenceClass.MODELLED}));
 const total=branches.reduce((s,b)=>s+b.probability,0)||1;
 return branches.map(b=>Object.freeze({...b,probability:b.probability/total}));
}

export function reactionSurprise({expectedReturnPct=0,actualReturnPct=0,scalePct=.01}){const residual=Number(actualReturnPct)-Number(expectedReturnPct);const magnitude=clamp01(Math.abs(residual)/Math.max(.000001,Math.abs(scalePct)));return Object.freeze({expectedReturnPct:Number(expectedReturnPct),actualReturnPct:Number(actualReturnPct),residual,magnitude,modelSurprise:magnitude>=.75});}

export function knowledgeState({world,hypotheses=[]}){const s=hypotheses.filter(h=>h.status==='SUPPORTED');const answer=s.length?clamp01(Math.max(...s.map(h=>h.confidence??0))):0;const kc=clamp01(world.knownness*(1-Math.min(.5,hypotheses.length?1/(hypotheses.length+1):.5)));return Object.freeze({answerConfidence:answer,knowledgeConfidence:kc,selfDoubt:clamp01(answer-kc),unknownness:world.unknownness,status:world.unknownness>.65?EvidenceClass.UNKNOWN:'PARTIALLY_KNOWN'});}
export function shadowDecision({world,knowledge,directionalEdge=0}){const edge=Math.max(-1,Math.min(1,Number(directionalEdge)));const conviction=Math.abs(edge)*knowledge.knowledgeConfidence*(1-knowledge.unknownness);let action='ABSTAIN';if(conviction>=.12)action=edge>0?'SHADOW_LONG':'SHADOW_SHORT';return Object.freeze({id:id('decision',{world:world.id,edge,conviction,action}),asset:world.asset,asOf:world.asOf,action,conviction,canExecuteLive:false,mode:'SHADOW_ONLY',evidenceIds:world.evidenceIds});}
export function autopsy({decision,outcome,surprise=null}){const direction=outcome?.returnPct===0?0:Math.sign(outcome?.returnPct??0);const expected=decision.action==='SHADOW_LONG'?1:decision.action==='SHADOW_SHORT'?-1:0;return Object.freeze({decisionId:decision.id,correctDirection:expected===0?null:expected===direction,realizedReturnPct:Number(outcome?.returnPct??0),learningRequired:expected!==0&&expected!==direction,modelSurprise:Boolean(surprise?.modelSurprise),liveExecutionOccurred:false});}

export function scientificMemoryEntry({world,hypothesis,decision,autopsy:report,surprise}){
 const entry={worldId:world.id,hypothesisId:hypothesis?.id??null,decisionId:decision.id,evidenceIds:[...decision.evidenceIds],result:{correctDirection:report.correctDirection,realizedReturnPct:report.realizedReturnPct,modelSurprise:Boolean(surprise?.modelSurprise)},createdFromAsOf:world.asOf};
 return Object.freeze({id:id('memory',entry),...entry,immutable:true});
}
