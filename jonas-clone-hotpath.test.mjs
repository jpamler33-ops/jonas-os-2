import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {applyJonasCloneSnapshot} from './jonas-clone-v1-integration.mjs';
import {createSpecialistWalletState,saveSpecialistWalletState,loadSpecialistWalletState,specialistWalletSummary,WALLET_6_USER_99K_60S as W6} from './shadow-specialist-wallets.mjs';

const now=1700000000000;
const row={
  chainId:'solana',tokenAddress:'CLONE',symbol:'CLONE',priceUsd:1,
  marketCap:5000,liquidityUsd:20000,pairAddress:'POOL',
  pairCreatedAt:now-25000,signalTrending:true,gmgnExactTrend:true,
  gmgnTrendInterval:'1m',gmgnDisplayedChangePct:100000,priceChangeSelectedPct:100000
};
const snapshot=(rows,capturedAt=now)=>({sourceReady:true,capturedAt,exactGmgn:true,trendInterval:'1m',rows});
const apply=(state,rows,time=now)=>applyJonasCloneSnapshot(state,snapshot(rows,time),{now:time,solPriceUsd:120});

test('production adapter opens only exact GMGN 1m >=99k% and market cap is irrelevant',()=>{
  const original=createSpecialistWalletState(),x=apply(original,[row]),p=x.state.wallets[W6].positions[0];
  assert.equal(x.results.opened,1);
  assert.equal(p.strategyVersion,'JONAS_CLONE_V1');
  assert.equal(p.strategyContract,'GMGN_NEW_PAIR_1M_GREEN_99K_HOLD_4M_V1');
  assert.equal(p.entryThresholdMode,'GMGN_GREEN_PERCENT');
  assert.equal(p.entryGreenPercent,100000);
  assert.equal(p.entryMarketCapUsd,5000);
  assert.equal(p.entryNotionalSol,8);
  assert.equal(p.exposureQuote,960);
  assert.equal(p.targetHoldSeconds,240);
  assert.equal(p.canExecuteLive,false);
  assert.deepEqual(x.state.wallets.W4_MEME_SCOUT,original.wallets.W4_MEME_SCOUT);
  assert.equal(apply(x.state,[row]).results.opened,0);
  assert.equal(original.wallets[W6].positions.length,0);
});

test('strict entry contract rejects old, below-threshold, non-GMGN and non-current-trend rows',()=>{
  for(const patch of [
    {pairCreatedAt:now-120000},
    {pairCreatedAt:now-120001},
    {gmgnDisplayedChangePct:98999,priceChangeSelectedPct:98999},
    {gmgnExactTrend:false},
    {signalTrending:false}
  ]){
    assert.equal(apply(createSpecialistWalletState(),[{...row,...patch}]).results.opened,0);
  }
  for(const age of [60,75,90,119.999]){
    const x=applyJonasCloneSnapshot(
      createSpecialistWalletState(),
      snapshot([{...row,pairCreatedAt:now-age*1000,marketCap:1,gmgnDisplayedChangePct:99000,priceChangeSelectedPct:99000}]),
      {now,solPriceUsd:120,maxAgeSeconds:60,minMarketCapUsd:999999999,minGreenChangePct:1}
    );
    assert.equal(x.results.opened,1);
    assert.equal(x.state.wallets[W6].positions[0].canExecuteLive,false);
  }
});

test('missing liquidity or stale/unready source cannot fabricate a sized shadow entry',()=>{
  for(const patch of [{liquidityUsd:null},{pairCreatedAt:null},{pairCreatedAt:now+1},{w6TrackingOnly:true}]){
    assert.equal(apply(createSpecialistWalletState(),[{...row,...patch}]).results.opened,0);
  }
  assert.equal(applyJonasCloneSnapshot(createSpecialistWalletState(),{...snapshot([row]),sourceReady:false},{now,solPriceUsd:120}).results.opened,0);
  for(const capturedAt of [now-16000,now+1,null]){
    assert.equal(applyJonasCloneSnapshot(createSpecialistWalletState(),snapshot([row],capturedAt),{now,solPriceUsd:120}).results.opened,0);
  }
});

test('clone stays open before 240s, records checkpoints, then exits at 240s against liquidity',async()=>{
  let x=apply(createSpecialistWalletState(),[row]);
  for(const seconds of [60,120,180,239]){
    x=apply(x.state,[{...row,w6TrackingOnly:true,priceUsd:seconds===60?.95:1.1}],now+seconds*1000);
    assert.equal(x.state.wallets[W6].positions.length,1);
  }
  const p=x.state.wallets[W6].positions[0];
  assert.deepEqual(p.jonasClone.checkpoints.map(c=>c.targetSeconds),[60,120,180]);
  assert.ok(p.jonasClone.maeReturnPct<0);
  const dir=await mkdtemp(path.join(tmpdir(),'clone-state-'));
  try{
    const file=path.join(dir,'state.json');
    await saveSpecialistWalletState(file,x.state);
    const loaded=await loadSpecialistWalletState(file);
    assert.equal(loaded.healthy,true);
    assert.deepEqual(loaded.state.wallets[W6].positions[0].jonasClone,p.jonasClone);
  }finally{await rm(dir,{recursive:true,force:true});}

  x=apply(x.state,[{...row,w6TrackingOnly:true,priceUsd:1.1}],now+240000);
  assert.equal(x.state.wallets[W6].positions.length,0);
  const closed=x.state.wallets[W6].closed[0];
  assert.equal(closed.closeReason,'W6_HOLD_4M_EXIT');
  assert.equal(closed.targetHoldSeconds,240);
  assert.equal(closed.actualHoldSeconds,240);
  assert.equal(closed.exitRequestLagSeconds,0);
  assert.equal(closed.settlementStatus,'MODELLED_LIQUIDITY_BACKED_EXIT');
  assert.ok(Number.isFinite(closed.realizedNetPnlQuote));
  assert.deepEqual(closed.jonasClone.checkpoints.map(c=>c.targetSeconds),[60,120,180,240]);
});

test('4m exit never invents realized PnL when exit liquidity is unknown; closes on next executable mark',()=>{
  let x=apply(createSpecialistWalletState(),[row]);
  x=apply(x.state,[{...row,w6TrackingOnly:true,priceUsd:1.2,liquidityUsd:null}],now+240000);
  assert.equal(x.results.closed,0);
  assert.equal(x.results.unfillableExits,1);
  assert.equal(x.state.wallets[W6].closed.length,0);
  assert.equal(x.state.wallets[W6].positions[0].pendingExit.reason,'W6_HOLD_4M_EXIT');
  x=apply(x.state,[{...row,w6TrackingOnly:true,priceUsd:1.2,liquidityUsd:20000}],now+245000);
  const closed=x.state.wallets[W6].closed[0];
  assert.equal(closed.closeReason,'W6_HOLD_4M_EXIT');
  assert.equal(closed.actualHoldSeconds,245);
  assert.equal(closed.exitRequestLagSeconds,5);
  assert.equal(closed.settlementStatus,'MODELLED_LIQUIDITY_BACKED_EXIT');
});

test('confirmed liquidity death closes immediately with zero recovery before 4m',()=>{
  let x=apply(createSpecialistWalletState(),[row]);
  x=apply(x.state,[{...row,w6TrackingOnly:true,priceUsd:1.2,liquidityUsd:0}],now+100000);
  const closed=x.state.wallets[W6].closed[0];
  assert.equal(x.state.wallets[W6].positions.length,0);
  assert.equal(closed.closeReason,'W6_LIQUIDITY_GONE');
  assert.equal(closed.exitProceedsQuote,0);
  assert.equal(closed.settlementStatus,'ZERO_RECOVERY_WRITE_OFF');
  assert.equal(closed.exitFilled,false);
  assert.equal(closed.jonasClone.liquidityDeath.observedAt,now+100000);
});

test('pre-correction market-cap JONAS positions are legacy and never forced into the new 240s contract',()=>{
  const state=structuredClone(createSpecialistWalletState());
  state.wallets[W6].positions.push({
    walletId:W6,positionKey:'legacy',chainId:'solana',tokenAddress:'OLD',
    entryPrice:1,lastPrice:1,openedAt:now-300000,exposureQuote:100,marginQuote:100,
    initialExposureQuote:100,initialMarginQuote:100,status:'OPEN',side:'LONG',
    strategy:'JONAS_CLONE_V1',strategyVersion:'JONAS_CLONE_V1',
    entryThresholdMode:'MARKET_CAP_USD',entryMarketCapUsd:120000,
    entryLiquidityUsd:20000,entryPoolAddress:'OLDPOOL',entryDexId:null
  });
  const x=apply(state,[{...row,tokenAddress:'OLD',symbol:'OLD',w6TrackingOnly:true,priceUsd:1.1,liquidityUsd:20000,pairAddress:'OLDPOOL'}],now+300000);
  assert.equal(x.state.wallets[W6].positions.length,1);
  assert.equal(x.state.wallets[W6].closed.length,0);
  const summary=specialistWalletSummary(x.state,{asOf:now+300000}).wallets[W6];
  assert.equal(summary.strategy.openPositions,0);
  assert.equal(summary.legacy.openPositions,1);
  assert.equal(summary.strategy.active.length,0);
  assert.equal(summary.legacy.active[0].entryThresholdMode,'MARKET_CAP_USD');
});
