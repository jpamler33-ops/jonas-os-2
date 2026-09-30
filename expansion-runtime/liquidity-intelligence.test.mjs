import test from 'node:test';
import assert from 'node:assert/strict';

import {
  analyzeLiquiditySnapshot,
  buildLiquidityMap,
  inferLiquidityReaction,
  verifyLiquiditySnapshot
} from './liquidity-intelligence.mjs';

function book(extra={}){
  return {
    bids:[[100,5],[99.9,3],[99.8,2]],
    asks:[[100.1,4],[100.2,3],[100.3,2]],
    timestamp:990,availableAt:995,source:'TEST',version:'1',
    ...extra
  };
}

test('fresh valid book produces observed microstructure diagnostics',()=>{
  const r=analyzeLiquiditySnapshot(1000,book(),{maxAgeMs:100});
  assert.equal(r.gate,'PASS');
  assert.equal(r.status,'OK');
  assert.equal(r.visibleLevels[0].evidenceType,'OBSERVED_ORDER_BOOK');
  assert.ok(r.caveats.includes('VISIBLE_LIQUIDITY_IS_NOT_COMMITMENT'));
  assert.equal(verifyLiquiditySnapshot(r).ok,true);
});

test('future book snapshot fails closed',()=>{
  const r=analyzeLiquiditySnapshot(1000,book({availableAt:1001}));
  assert.equal(r.gate,'ABSTAIN');
  assert.ok(r.reasons.includes('BOOK_FROM_FUTURE'));
});

test('stale book snapshot fails closed',()=>{
  const r=analyzeLiquiditySnapshot(1000,book({availableAt:100}),{maxAgeMs:100});
  assert.equal(r.gate,'ABSTAIN');
  assert.ok(r.reasons.includes('BOOK_STALE'));
});

test('crossed book fails closed',()=>{
  const r=analyzeLiquiditySnapshot(1000,book({bids:[[101,1]],asks:[[100,1]]}),{maxAgeMs:100});
  assert.equal(r.gate,'ABSTAIN');
  assert.ok(r.reasons.includes('CROSSED_BOOK'));
});

test('liquidity map preserves epistemic type per zone',()=>{
  const r=analyzeLiquiditySnapshot(1000,book(),{maxAgeMs:100});
  const m=buildLiquidityMap({
    snapshot:r,
    swings:[{price:98,type:'SWING_LOW'}],
    roundNumbers:[100],
    liquidationClusters:[{price:102,strength:.8,evidenceType:'MODEL_ESTIMATE'}]
  });
  assert.ok(m.zones.some(z=>z.evidenceType==='OBSERVED_ORDER_BOOK'));
  assert.ok(m.zones.some(z=>z.evidenceType==='DERIVED_STRUCTURE'));
  assert.ok(m.zones.some(z=>z.evidenceType==='HEURISTIC'));
  assert.ok(m.zones.some(z=>z.evidenceType==='MODEL_ESTIMATE'));
});

test('reaction scores are explicitly heuristics not probabilities',()=>{
  const x=inferLiquidityReaction({
    aggressiveFlow:.8,priceResponse:.01,visibleBarrierStrength:.7,approachVelocity:.4
  });
  assert.equal(x.epistemic,'DERIVED_HEURISTIC_NOT_PROBABILITY');
  assert.equal(x.canExecute,false);
});

test('empty side is insufficient not fabricated neutral',()=>{
  const r=analyzeLiquiditySnapshot(1000,book({asks:[]}),{maxAgeMs:100});
  assert.equal(r.gate,'INSUFFICIENT');
  assert.equal(r.status,'INSUFFICIENT');
});
