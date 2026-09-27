import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNarrativeReflexivityEvidence, verifyNarrativeReflexivityEvidence } from './narrative-reflexivity.mjs';

test('narrative evidence is PIT-safe and does not claim causality',()=>{
 const x=buildNarrativeReflexivityEvidence({asOf:1000,topic:'AI',
  observations:[
   {availableAt:900,sentiment:.8,engagement:10,source:'A'},{availableAt:910,sentiment:.6,engagement:5,source:'B'},
   {availableAt:920,sentiment:.7,engagement:4,source:'C'},{availableAt:930,sentiment:.5,engagement:3,source:'D'},
   {availableAt:940,sentiment:.4,engagement:2,source:'E'},{availableAt:1100,sentiment:1,source:'F'}],
  marketContext:{priceReturn:.1,attentionChange:.2}});
 assert.equal(x.narrative.sampleSize,5);
 assert.equal(x.audit.futureRejected,1);
 assert.equal(x.reflexivity.diagnostic,true);
 assert.equal(x.epistemic.reflexivity,'HYPOTHESIS_DIAGNOSTIC_NOT_CAUSAL');
 assert.equal(x.canExecute,false);
 assert.equal(verifyNarrativeReflexivityEvidence(x).ok,true);
});

test('thin narrative evidence stays insufficient',()=>{
 const x=buildNarrativeReflexivityEvidence({asOf:1000,topic:'meme',observations:[{availableAt:900,sentiment:.5,source:'A'}]});
 assert.equal(x.evidenceGate,'INSUFFICIENT');
});

test('fingerprint detects mutation',()=>{
 const obs=Array.from({length:5},(_,i)=>({availableAt:900+i,sentiment:.1*i,source:'S'+i}));
 const x=buildNarrativeReflexivityEvidence({asOf:1000,topic:'x',observations:obs});
 const y=structuredClone(x);y.narrative.sampleSize=99;
 assert.equal(verifyNarrativeReflexivityEvidence(y).ok,false);
});
