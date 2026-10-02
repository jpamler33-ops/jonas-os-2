import test from 'node:test';import assert from 'node:assert/strict';import {openOutcomeCase,updateOutcomeCase,summarizeOutcomeCases} from './derivatives-outcome-tracker.mjs';
const evidence={asOf:'2026-09-29T08:00:00Z',signal:'CROWDED_LONG_PRESSURE',reason:'TEST',features:{fundingMedian:.001},guards:{qualified:true,fundingUnitsVerified:true},classification:'OBSERVED_DERIVED'};const near=(a,b,eps=1e-12)=>assert.ok(Math.abs(a-b)<=eps,`${a} != ${b}`);
test('records 1h 4h 24h without future leakage',()=>{let c=openOutcomeCase({evidence,price:100});c=updateOutcomeCase(c,{price:101,observedAt:'2026-09-29T09:00:00Z'});near(c.outcomes.h1.return,.01);assert.equal(c.outcomes.h4,undefined);c=updateOutcomeCase(c,{price:98,observedAt:'2026-09-30T08:00:00Z'});assert.equal(c.status,'CLOSED');near(c.outcomes.h24.return,-.02);});
test('abstain excluded from eligible summary',()=>{const a=openOutcomeCase({evidence:{...evidence,signal:'ABSTAIN'},price:100});const s=summarizeOutcomeCases([a]);assert.equal(s.eligibleCases,0);});

test('legacy or unit-unverified directional cases are quarantined from eligible summary',()=>{
  const legacy=openOutcomeCase({
    evidence:{...evidence,guards:{qualified:true,fundingUnitsVerified:false}},
    price:100
  });
  const s=summarizeOutcomeCases([legacy]);
  assert.equal(s.eligibleCases,0);
  assert.equal(s.excludedCases,1);
});
