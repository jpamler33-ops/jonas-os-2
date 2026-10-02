import test from 'node:test';import assert from 'node:assert/strict';import {buildDerivativesScorecard} from './derivatives-scorecard.mjs';
const mk=(n,signal='CROWDED_LONG_PRESSURE')=>Array.from({length:n},(_,i)=>({signal,evidenceGuards:{qualified:true,fundingUnitsVerified:true},outcomes:{h1:{return:i%3?0.01:-0.01},h4:{return:i%2?0.02:-0.01},h24:{return:i%4?0.03:-0.02}}}));
test('small samples cannot graduate',()=>{const s=buildDerivativesScorecard(mk(10));assert.equal(s.bySignal.CROWDED_LONG_PRESSURE.horizons.h1.gate,'INSUFFICIENT_SAMPLE');assert.equal(s.bySignal.CROWDED_LONG_PRESSURE.horizons.h1.claimAllowed,false);});
test('30 observations become research-ready only',()=>{const s=buildDerivativesScorecard(mk(30));assert.equal(s.bySignal.CROWDED_LONG_PRESSURE.horizons.h1.gate,'RESEARCH_READY');assert.equal(s.canExecuteLive,false);});
test('100 observations become validation-ready but never live-ready',()=>{const s=buildDerivativesScorecard(mk(100));assert.equal(s.bySignal.CROWDED_LONG_PRESSURE.horizons.h24.gate,'VALIDATION_READY');assert.equal(s.bySignal.CROWDED_LONG_PRESSURE.horizons.h24.claimAllowed,false);assert.equal(s.canExecuteLive,false);});
test('abstains are excluded',()=>{const s=buildDerivativesScorecard([...mk(5),...mk(100,'ABSTAIN')]);assert.equal(s.eligibleCases,5);});

test('unit-unverified legacy cases never advance the derivatives scorecard',()=>{
  const rows=mk(100).map(x=>({...x,evidenceGuards:{qualified:true,fundingUnitsVerified:false}}));
  const s=buildDerivativesScorecard(rows);
  assert.equal(s.eligibleCases,0);
  assert.equal(s.excludedCases,100);
  assert.deepEqual(s.bySignal,{});
});
