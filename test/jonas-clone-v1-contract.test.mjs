import test from 'node:test';
import assert from 'node:assert/strict';
import {JONAS_CLONE_V1_POLICY} from '../jonas-clone-v1.mjs';

test('telemetry contains execution realism fields',()=>{
  for(const k of ['priceImpactBps','feesQuote','mfeReturnPct','maeReturnPct','liquidityDecayPct','exitLiquidityUsd','netPnl'])
    assert.ok(JONAS_CLONE_V1_POLICY.telemetry.includes(k));
});

test('baseline stays immutable while variants run parallel',()=>{
  assert.equal(JONAS_CLONE_V1_POLICY.validation.baselineImmutable,true);
  assert.equal(JONAS_CLONE_V1_POLICY.validation.variantsMustRunInParallel,true);
  assert.equal(JONAS_CLONE_V1_POLICY.validation.optimizeOnlyAfterBaselineEvidence,true);
});
