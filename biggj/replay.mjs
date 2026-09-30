import { buildWorldState, causalHypothesis, evaluateHypothesis, knowledgeState, shadowDecision, reactionSurprise, autopsy, scientificMemoryEntry } from './core.mjs';

const clamp01=n=>Math.max(0,Math.min(1,Number(n)));

export function brierScore(probability,outcome){const p=clamp01(probability);const y=outcome?1:0;return (p-y)**2;}

export function calibrationSummary(rows,bins=10){
 const buckets=Array.from({length:bins},(_,i)=>({lo:i/bins,hi:(i+1)/bins,n:0,p:0,y:0}));
 for(const r of rows){const p=clamp01(r.probability);const i=Math.min(bins-1,Math.floor(p*bins));const b=buckets[i];b.n++;b.p+=p;b.y+=r.outcome?1:0;}
 return buckets.filter(b=>b.n).map(b=>({range:[b.lo,b.hi],count:b.n,meanProbability:b.p/b.n,observedFrequency:b.y/b.n,calibrationError:Math.abs(b.p/b.n-b.y/b.n)}));
}

export function replayStep({asset='BTC',asOf,evidence,claim,direction,priorConfidence=.5,support=.5,contradiction=0,directionalEdge=direction,expectedReturnPct=0,outcomeReturnPct=0}){
 const world=buildWorldState({asset,asOf,evidence});
 const base=causalHypothesis({world,claim,direction,confidence:priorConfidence,evidenceIds:world.evidenceIds});
 const hypothesis=evaluateHypothesis(base,{support,contradiction});
 const knowledge=knowledgeState({world,hypotheses:[hypothesis]});
 const decision=shadowDecision({world,knowledge,directionalEdge});
 const surprise=reactionSurprise({expectedReturnPct,actualReturnPct:outcomeReturnPct,scalePct:Math.max(.005,Math.abs(expectedReturnPct)||.01)});
 const report=autopsy({decision,outcome:{returnPct:outcomeReturnPct},surprise});
 const memory=scientificMemoryEntry({world,hypothesis,decision,autopsy:report,surprise});
 const predictedDirectionProbability=clamp01(.5+(direction*hypothesis.confidence*.5));
 const actualUp=outcomeReturnPct>0;
 return Object.freeze({world,hypothesis,knowledge,decision,surprise,autopsy:report,memory,calibration:{probability:predictedDirectionProbability,outcome:actualUp,brier:brierScore(predictedDirectionProbability,actualUp)}});
}

export function historicalPitReplay(steps){
 const ordered=[...steps].sort((a,b)=>Date.parse(a.asOf)-Date.parse(b.asOf));
 const seen=new Set(); const results=[];
 for(const step of ordered){if(seen.has(step.asOf)) throw new Error('BIGGJ_REPLAY_DUPLICATE_ASOF');seen.add(step.asOf);results.push(replayStep(step));}
 const rows=results.map(r=>r.calibration);
 const traded=results.filter(r=>r.decision.action!=='ABSTAIN');
 return Object.freeze({count:results.length,trades:traded.length,abstains:results.length-traded.length,meanBrier:rows.length?rows.reduce((s,r)=>s+r.brier,0)/rows.length:null,calibration:calibrationSummary(rows),results});
}
