import test from 'node:test';
import assert from 'node:assert/strict';

import {
  evaluateSourceReliability,
  classifySourceEvent,
  verifySourceReliability
} from './source-intelligence.mjs';

function row(i,{sourceId='A',confirmed=true,availableAt=100,resolvedAt=200,impact=.4}={}){
  return {
    id:'r'+i,eventId:'e'+i,sourceId,confirmed,
    availableAt,resolvedAt,marketImpactPct:impact
  };
}

test('resolved reliable source passes and influence stays separate',()=>{
  const rows=Array.from({length:20},(_,i)=>row(i,{confirmed:i<18,impact:5}));
  const r=evaluateSourceReliability(1000,rows,{minResolved:12});
  assert.equal(r.gate,'PASS');
  assert.equal(r.sources[0].status,'RELIABLE');
  assert.equal(r.sources[0].meanAbsoluteMarketImpactPct,5);
  assert.ok(r.sources[0].posteriorReliability<1);
  assert.equal(verifySourceReliability(r).ok,true);
});

test('future and unresolved evidence cannot improve source reliability',()=>{
  const rows=[
    ...Array.from({length:12},(_,i)=>row(i,{confirmed:i<8})),
    ...Array.from({length:50},(_,i)=>row(100+i,{confirmed:true,availableAt:900,resolvedAt:2000}))
  ];
  const r=evaluateSourceReliability(1000,rows,{minResolved:12});
  assert.equal(r.usableResolvedEvents,12);
  assert.equal(r.unresolvedAtAsOf,50);
});

test('required empirically unreliable source forces abstain',()=>{
  const rows=Array.from({length:20},(_,i)=>row(i,{sourceId:'BAD',confirmed:i<2}));
  const r=evaluateSourceReliability(1000,rows,{requiredSourceIds:['BAD']});
  assert.equal(r.gate,'ABSTAIN');
  assert.equal(r.sources[0].status,'UNRELIABLE');
});

test('conflicting duplicate outcome fails closed',()=>{
  const a=row(1,{confirmed:true});
  const b={...a,confirmed:false};
  const r=evaluateSourceReliability(1000,[a,b],{minResolved:1});
  assert.equal(r.conflictingDuplicates,1);
  assert.equal(r.gate,'ABSTAIN');
});

test('event classification labels information quality as heuristic not probability',()=>{
  const rows=Array.from({length:20},(_,i)=>row(i,{confirmed:i<18}));
  const r=evaluateSourceReliability(1000,rows);
  const e=classifySourceEvent({
    sourceId:'A',novelty:.8,independentConfirmation:.9,manipulationRisk:.1
  },r);
  assert.equal(e.gate,'PASS');
  assert.equal(e.epistemic.informationQuality,'DERIVED_HEURISTIC_NOT_PROBABILITY');
  assert.equal(e.canExecute,false);
});

test('high manipulation risk hard-abstains even from reliable source',()=>{
  const rows=Array.from({length:20},(_,i)=>row(i,{confirmed:true}));
  const r=evaluateSourceReliability(1000,rows);
  const e=classifySourceEvent({
    sourceId:'A',novelty:1,independentConfirmation:1,manipulationRisk:.95
  },r);
  assert.equal(e.gate,'ABSTAIN');
});

test('invalid chronology row is rejected',()=>{
  const rows=[...Array.from({length:12},(_,i)=>row(i)),row(99,{availableAt:300,resolvedAt:200})];
  const r=evaluateSourceReliability(1000,rows,{minResolved:12});
  assert.equal(r.invalidRows,1);
});
