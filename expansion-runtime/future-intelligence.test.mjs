import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFutureIntelligenceEvidence, verifyFutureIntelligenceEvidence } from './future-intelligence.mjs';

test('future intelligence is slow-horizon, PIT-safe and non-executable',()=>{
 const observations=[
  ['ADOPTION',10,900,'A'],['ADOPTION',12,910,'B'],['CAPITAL',20,920,'C'],['CAPITAL',18,930,'A'],
  ['INFRASTRUCTURE',5,940,'B'],['INFRASTRUCTURE',8,950,'C'],['SUPPLY',30,960,'A'],['SUPPLY',25,970,'B']
 ].map(([dimension,value,availableAt,source])=>({dimension,value,availableAt,source}));
 observations.push({dimension:'ADOPTION',value:999,availableAt:1100,source:'FUTURE'});
 const x=buildFutureIntelligenceEvidence({asOf:1000,theme:'AI_CHIPS',observations,horizonDays:730});
 assert.equal(x.audit.observationCount,8);
 assert.equal(x.audit.futureRejected,1);
 assert.equal(x.coverage,1);
 assert.equal(x.scenarioEvidence.classification,'SLOW_HORIZON_SCENARIO_EVIDENCE_NOT_PRICE_TARGET');
 assert.equal(x.restrictions.mayMutateFastForecast,false);
 assert.equal(x.canExecute,false);
 assert.equal(verifyFutureIntelligenceEvidence(x).ok,true);
});

test('thin evidence stays insufficient',()=>{
 const x=buildFutureIntelligenceEvidence({asOf:1000,theme:'MAGNETS',observations:[{dimension:'SUPPLY',value:1,availableAt:900,source:'A'}]});
 assert.equal(x.evidenceGate,'INSUFFICIENT');
});

test('fingerprint catches mutation',()=>{
 const rows=Array.from({length:8},(_,i)=>({dimension:['ADOPTION','CAPITAL','INFRASTRUCTURE','SUPPLY'][i%4],value:i+1,availableAt:900+i,source:'S'+(i%3)}));
 const x=buildFutureIntelligenceEvidence({asOf:1000,theme:'X',observations:rows});
 const y=structuredClone(x);y.coverage=0;
 assert.equal(verifyFutureIntelligenceEvidence(y).ok,false);
});
