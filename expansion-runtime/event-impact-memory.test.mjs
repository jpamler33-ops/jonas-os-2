import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildEventImpactMemory,
  estimateEventImpact,
  verifyEventImpactMemory
} from './event-impact-memory.mjs';

function row(i,{ret=.5,availableAt=100,resolvedAt=500,regime='ANY'}={}){
  return {
    id:'r'+i,asset:'BTCUSDT',eventType:'CPI',horizonMs:900000,
    regime,returnPct:ret,availableAt,resolvedAt,
    sourceQuality:.8,novelty:.6
  };
}

test('mature empirical event cohort returns post-outcome distribution',()=>{
  const rows=Array.from({length:25},(_,i)=>row(i,{ret:(i-12)/10}));
  const m=buildEventImpactMemory(1000,rows);
  assert.equal(m.gate,'PASS');
  assert.equal(m.groups[0].status,'MATURE');
  assert.equal(m.groups[0].samples,25);
  assert.equal(m.groups[0].epistemic,'EMPIRICAL_POST_OUTCOME_EVENT_REACTION_NOT_CAUSAL');
  assert.equal(verifyEventImpactMemory(m).ok,true);
});

test('future and unmatured outcomes cannot enter the memory',()=>{
  const rows=[
    ...Array.from({length:10},(_,i)=>row(i)),
    ...Array.from({length:20},(_,i)=>row(100+i,{availableAt:900,resolvedAt:2000}))
  ];
  const m=buildEventImpactMemory(1000,rows,{warmSamples:8,minSamples:20});
  assert.equal(m.usableMaturedOutcomes,10);
  assert.equal(m.unresolvedAtAsOf,20);
  assert.equal(m.groups[0].status,'WARMING');
});

test('estimate is explicitly empirical and never execution permission',()=>{
  const m=buildEventImpactMemory(1000,Array.from({length:25},(_,i)=>row(i)));
  const e=estimateEventImpact(m,{asset:'BTCUSDT',eventType:'CPI',horizonMs:900000});
  assert.equal(e.status,'MATURE');
  assert.ok(Number.isFinite(e.empirical.positiveRate));
  assert.equal(e.epistemic,'EMPIRICAL_POST_OUTCOME_EVENT_REACTION_NOT_CAUSAL');
  assert.equal(e.canExecute,false);
});

test('missing cohort remains insufficient',()=>{
  const m=buildEventImpactMemory(1000,[]);
  const e=estimateEventImpact(m,{asset:'ETHUSDT',eventType:'CPI',horizonMs:900000});
  assert.equal(e.status,'INSUFFICIENT');
  assert.equal(e.empirical,null);
});

test('conflicting duplicate outcome fails closed',()=>{
  const a=row(1,{ret:1});
  const b={...a,returnPct:-5};
  const m=buildEventImpactMemory(1000,[a,b],{warmSamples:1,minSamples:1});
  assert.equal(m.gate,'ABSTAIN');
  assert.equal(m.conflictingDuplicates,1);
});

test('invalid chronology is rejected',()=>{
  const rows=[...Array.from({length:8},(_,i)=>row(i)),row(99,{availableAt:500,resolvedAt:400})];
  const m=buildEventImpactMemory(1000,rows,{warmSamples:8,minSamples:20});
  assert.equal(m.invalidRows,1);
});
