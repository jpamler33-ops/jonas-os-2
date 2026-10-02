import test from 'node:test';
import assert from 'node:assert/strict';
import { runBiggjHealthAudit,auditWalletResearch,auditParallelWorlds } from './biggj-health-audit.mjs';

test('safety invariants fail closed',()=>{
  const r=runBiggjHealthAudit({safety:{execution:'LIVE',canExecute:true,canExecuteLive:true,action:'EXECUTE'}});
  assert.equal(r.status,'CRITICAL');
  assert.equal(r.canExecute,false);
  assert.equal(r.canExecuteLive,false);
  assert.equal(r.action,'ABSTAIN');
});

test('detects wallet imbalance and misleading winrate',()=>{
  const f=auditWalletResearch({control:{trades:20,winRate:.4,expectancyReturn:.01,profitFactor:1.4,maxDrawdownPct:.1},experiment:{trades:5,winRate:.6,expectancyReturn:-.01,profitFactor:.7,maxDrawdownPct:.2}});
  assert.ok(f.some(x=>x.code==='WALLET_ARM_IMBALANCE'));
  assert.ok(f.some(x=>x.code==='WINRATE_UP_QUALITY_DOWN'));
});

test('detects stalled and redundant worlds',()=>{
  const now=10_000_000;
  const worlds=[
    {worldId:'A',generation:1,currentGenome:{createdAt:0,profile:{x:1},evidence:{closed:0}}},
    {worldId:'B',generation:1,currentGenome:{createdAt:0,profile:{x:1},evidence:{closed:0}}}
  ];
  const f=auditParallelWorlds({worlds,now,staleMs:1000});
  assert.ok(f.some(x=>x.code==='WORLD_STALLED_NO_EVIDENCE'));
  assert.ok(f.some(x=>x.code==='WORLD_REDUNDANT_GENOME'));
});
