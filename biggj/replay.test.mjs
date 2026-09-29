import test from 'node:test';
import assert from 'node:assert/strict';
import { evidenceRecord } from './core.mjs';
import { brierScore, historicalPitReplay } from './replay.mjs';

const ev=(minute,availableMinute=minute,confidence=.9)=>evidenceRecord({source:`market-${minute}`,eventTime:`2026-09-29T10:${String(minute).padStart(2,'0')}:00Z`,availableAt:`2026-09-29T10:${String(availableMinute).padStart(2,'0')}:01Z`,confidence,independenceGroup:`g-${minute}`,payload:{}});

test('brier score is proper for binary probability',()=>{assert.equal(brierScore(1,true),0);assert.equal(brierScore(0,true),1);});

test('historical replay is deterministic and remains shadow-only',()=>{
 const e0=ev(0),e5=ev(5);
 const steps=[
  {asOf:'2026-09-29T10:01:00Z',evidence:[e0,e5],claim:'pressure up',direction:1,priorConfidence:.8,support:1,directionalEdge:1,expectedReturnPct:.01,outcomeReturnPct:.02},
  {asOf:'2026-09-29T10:06:00Z',evidence:[e0,e5],claim:'pressure down',direction:-1,priorConfidence:.7,support:.8,directionalEdge:-1,expectedReturnPct:-.01,outcomeReturnPct:.01}
 ];
 const a=historicalPitReplay(steps),b=historicalPitReplay(steps);
 assert.equal(a.count,2);assert.equal(a.meanBrier,b.meanBrier);
 assert.deepEqual(a.results.map(x=>x.world.evidenceIds),b.results.map(x=>x.world.evidenceIds));
 assert.deepEqual(a.results[0].world.evidenceIds,[e0.id]);
 assert.ok(a.results.every(x=>x.decision.canExecuteLive===false));
});

test('duplicate replay timestamps fail closed',()=>{
 const e=ev(0);const step={asOf:'2026-09-29T10:01:00Z',evidence:[e],claim:'x',direction:1,outcomeReturnPct:.01};
 assert.throws(()=>historicalPitReplay([step,step]),/DUPLICATE_ASOF/);
});
