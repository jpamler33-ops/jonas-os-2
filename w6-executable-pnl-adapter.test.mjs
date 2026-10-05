import test from 'node:test';
import assert from 'node:assert/strict';
import {appendW6ExecutableCheckpoint,estimateW6ExecutableClose} from './w6-executable-pnl-adapter.mjs';

const base={openedAt:1_000_000,side:'LONG',entryPrice:1,exposureQuote:100,lastPrice:1,execution:'SHADOW_ONLY',canExecute:false,canExecuteLive:false};

test('adapter appends due checkpoint without mutating input',()=>{
  const p={...base,executableCheckpoints:[]};
  const next=appendW6ExecutableCheckpoint(p,{priceUsd:1.2,marketCap:120000,liquidityUsd:10000},{now:1_061_000});
  assert.notEqual(next,p);
  assert.equal(p.executableCheckpoints.length,0);
  assert.equal(next.executableCheckpoints.length,1);
  assert.equal(next.executableCheckpoints[0].targetSeconds,60);
});

test('adapter does not duplicate a checkpoint',()=>{
  let p={...base,executableCheckpoints:[]};
  p=appendW6ExecutableCheckpoint(p,{priceUsd:1.2,liquidityUsd:10000},{now:1_061_000});
  const again=appendW6ExecutableCheckpoint(p,{priceUsd:1.21,liquidityUsd:10000},{now:1_061_500});
  assert.equal(again.executableCheckpoints.length,1);
});

test('close evidence remains fail-closed when liquidity disappears',()=>{
  const r=estimateW6ExecutableClose(base,{priceUsd:2,marketCap:200000,liquidityUsd:0});
  assert.equal(r.status,'UNFILLABLE');
  assert.equal(r.executable,false);
  assert.equal(r.execution,'SHADOW_ONLY');
  assert.equal(r.canExecute,false);
  assert.equal(r.canExecuteLive,false);
});

test('close evidence exposes executable net pnl under adequate liquidity',()=>{
  const r=estimateW6ExecutableClose(base,{priceUsd:1.5,marketCap:150000,liquidityUsd:10000});
  assert.equal(r.status,'EXECUTABLE');
  assert.ok(r.executableNetPnlQuote < 50);
  assert.ok(r.estimatedImpactPct > 0);
});
