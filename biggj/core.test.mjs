import test from 'node:test';
import assert from 'node:assert/strict';
import { evidenceRecord, pointInTime, independentEvidence, buildWorldState, causalHypothesis, evaluateHypothesis, worldBranches, reactionSurprise, knowledgeState, shadowDecision, autopsy, scientificMemoryEntry } from './core.mjs';

const a=evidenceRecord({source:'market',eventTime:'2026-09-29T10:00:00Z',availableAt:'2026-09-29T10:00:01Z',confidence:.9,independenceGroup:'price',payload:{price:100}});
const copy=evidenceRecord({source:'news-copy',eventTime:'2026-09-29T10:00:00Z',availableAt:'2026-09-29T10:00:02Z',confidence:.7,independenceGroup:'price',payload:{price:100}});
const future=evidenceRecord({source:'future',eventTime:'2026-09-29T10:05:00Z',availableAt:'2026-09-29T10:05:01Z',payload:{price:110}});

test('PIT guard excludes unavailable evidence',()=>assert.deepEqual(pointInTime([a,future],'2026-09-29T10:01:00Z').map(x=>x.id),[a.id]));
test('independence guard prevents duplicate evidence votes',()=>assert.equal(independentEvidence([a,copy]).length,1));

test('causal loop preserves PIT lineage and creates normalized worlds',()=>{
 const world=buildWorldState({asOf:'2026-09-29T10:01:00Z',evidence:[a,copy,future]});
 assert.deepEqual(world.evidenceIds,[a.id]);
 const h1=evaluateHypothesis(causalHypothesis({world,claim:'observed pressure persists',direction:1,confidence:.6,evidenceIds:[a.id]}),{support:.9});
 const h2=evaluateHypothesis(causalHypothesis({world,claim:'pressure reverses',direction:-1,confidence:.4,evidenceIds:[a.id]}),{support:.5});
 const branches=worldBranches({world,hypotheses:[h1,h2]});
 assert.ok(Math.abs(branches.reduce((s,b)=>s+b.probability,0)-1)<1e-12);
 assert.throws(()=>causalHypothesis({world,claim:'leak',evidenceIds:[future.id]}),/FUTURE_OR_FOREIGN/);
});

test('reaction surprise feeds immutable scientific memory while execution stays shadow-only',()=>{
 const world=buildWorldState({asOf:'2026-09-29T10:01:00Z',evidence:[a]});
 const h=evaluateHypothesis(causalHypothesis({world,claim:'up',direction:1,confidence:.8,evidenceIds:[a.id]}),{support:1});
 const knowledge=knowledgeState({world,hypotheses:[h]});
 const decision=shadowDecision({world,knowledge,directionalEdge:1});
 assert.equal(decision.canExecuteLive,false); assert.equal(decision.mode,'SHADOW_ONLY');
 const surprise=reactionSurprise({expectedReturnPct:.01,actualReturnPct:-.02,scalePct:.01});
 assert.equal(surprise.modelSurprise,true);
 const report=autopsy({decision,outcome:{returnPct:-.02},surprise});
 const memory=scientificMemoryEntry({world,hypothesis:h,decision,autopsy:report,surprise});
 assert.equal(memory.immutable,true); assert.equal(memory.result.modelSurprise,true); assert.equal(report.liveExecutionOccurred,false);
});
