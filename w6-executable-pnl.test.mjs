import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateW6ExecutableExit, captureW6ExecutableCheckpoint, W6_EXECUTABLE_PNL_VERSION } from './w6-executable-pnl.mjs';

test('unknown liquidity is fail-closed UNFILLABLE',()=>{
  const r=estimateW6ExecutableExit({entryPrice:1,markPrice:2,exposureQuote:100,liquidityUsd:null});
  assert.equal(r.version,W6_EXECUTABLE_PNL_VERSION);
  assert.equal(r.executable,false);
  assert.equal(r.status,'UNFILLABLE');
});

test('oversized exit is UNFILLABLE rather than inventing profit',()=>{
  const r=estimateW6ExecutableExit({entryPrice:1,markPrice:2,exposureQuote:1000,liquidityUsd:4000,maxPoolFraction:0.25});
  assert.equal(r.executable,false);
  assert.equal(r.reason,'EXIT_TOO_LARGE_FOR_POOL');
});

test('executable pnl is below naive chart pnl when liquidity impact exists',()=>{
  const exposure=100;
  const r=estimateW6ExecutableExit({entryPrice:1,markPrice:1.5,exposureQuote:exposure,liquidityUsd:10000,feeBps:10});
  assert.equal(r.status,'EXECUTABLE');
  assert.equal(r.executable,true);
  assert.ok(r.executableNetPnlQuote < 50);
  assert.ok(r.estimatedImpactPct > 0);
  assert.ok(r.feesQuote > 0);
});

test('checkpoint emits each due target once',()=>{
  const position={openedAt:1_000_000,side:'LONG',entryPrice:1,exposureQuote:100,executableCheckpoints:[]};
  const market={priceUsd:1.2,liquidityUsd:10000,marketCapUsd:120000};
  const first=captureW6ExecutableCheckpoint(position,market,{now:1_061_000});
  assert.equal(first.targetSeconds,60);
  position.executableCheckpoints.push(first);
  assert.equal(captureW6ExecutableCheckpoint(position,market,{now:1_061_000}),null);
  const second=captureW6ExecutableCheckpoint(position,market,{now:1_121_000});
  assert.equal(second.targetSeconds,120);
});

test('checkpoint becomes UNFILLABLE when exit liquidity disappears',()=>{
  const position={openedAt:1_000_000,side:'LONG',entryPrice:1,exposureQuote:100,executableCheckpoints:[]};
  const r=captureW6ExecutableCheckpoint(position,{priceUsd:3,liquidityUsd:0,marketCapUsd:300000},{now:1_301_000});
  assert.equal(r.targetSeconds,60);
  assert.equal(r.status,'UNFILLABLE');
  assert.equal(r.executable,false);
});
