import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildInstitutionalExpansionEvidence,
  verifyInstitutionalExpansionEvidence
} from './institutional-expansion.mjs';

function sourceRows(){
  return Array.from({length:20},(_,i)=>({
    id:'s'+i,eventId:'e'+i,sourceId:'SRC',
    confirmed:i<18,availableAt:100,resolvedAt:200,
    marketImpactPct:.4
  }));
}
function eventRows(){
  return Array.from({length:25},(_,i)=>({
    id:'ev'+i,asset:'BTCUSDT',eventType:'CPI',horizonMs:900000,
    regime:'ANY',returnPct:(i-12)/20,
    availableAt:100,resolvedAt:300,
    sourceQuality:.8,novelty:.6
  }));
}
function book(){
  return {
    bids:[[100,5],[99.9,3]],
    asks:[[100.1,4],[100.2,2]],
    timestamp:990,availableAt:995,source:'TEST',version:'1'
  };
}

test('institutional expansion bundles source event and liquidity evidence read-only',()=>{
  const r=buildInstitutionalExpansionEvidence({
    asOf:1000,
    sourceOutcomes:sourceRows(),
    sourceEvent:{sourceId:'SRC',novelty:.8,independentConfirmation:.8,manipulationRisk:.1},
    eventImpactRows:eventRows(),
    eventImpactQuery:{asset:'BTCUSDT',eventType:'CPI',horizonMs:900000},
    orderBook:book(),
    liquidityOptions:{maxAgeMs:100}
  });
  assert.equal(r.executionMode,'SHADOW_ONLY');
  assert.equal(r.canExecute,false);
  assert.equal(r.restrictions.mayExecute,false);
  assert.equal(r.restrictions.mayBypassInstitutionalAdmission,false);
  assert.equal(r.epistemic.evidenceGate,'EVIDENCE_DIAGNOSTIC_NOT_FORECAST_PROBABILITY');
  assert.equal(verifyInstitutionalExpansionEvidence(r).ok,true);
});

test('unreliable required source dominates bundle gate',()=>{
  const rows=Array.from({length:20},(_,i)=>({
    id:'x'+i,eventId:'e'+i,sourceId:'BAD',
    confirmed:i<2,availableAt:100,resolvedAt:200
  }));
  const r=buildInstitutionalExpansionEvidence({
    asOf:1000,
    sourceOutcomes:rows,
    sourceOptions:{requiredSourceIds:['BAD']},
    eventImpactRows:eventRows()
  });
  assert.equal(r.evidenceGate,'ABSTAIN');
});

test('future order book hard-abstains expansion evidence',()=>{
  const r=buildInstitutionalExpansionEvidence({
    asOf:1000,
    sourceOutcomes:sourceRows(),
    eventImpactRows:eventRows(),
    orderBook:{...book(),availableAt:1001}
  });
  assert.equal(r.evidenceGate,'ABSTAIN');
  assert.ok(r.reasons.some(x=>x.includes('BOOK_FROM_FUTURE')));
});

test('tampering expansion evidence is detected',()=>{
  const r=buildInstitutionalExpansionEvidence({
    asOf:1000,sourceOutcomes:sourceRows(),eventImpactRows:eventRows()
  });
  const x=structuredClone(r);
  x.evidenceGate='ABSTAIN';
  assert.equal(verifyInstitutionalExpansionEvidence(x).ok,false);
});
