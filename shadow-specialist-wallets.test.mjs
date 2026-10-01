import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSpecialistWalletState,
  applyPublicTraderCopySnapshot,
  applyMemecoinScoutSnapshot,
  specialistWalletSummary,
  WALLET_3_TRADER_COPY,
  WALLET_4_MEME_SCOUT,
  WALLET_5_MEME_COPY
} from './shadow-specialist-wallets.mjs';

test('wallet 3 copies all visible public trader positions with unlimited virtual capital model',()=>{
  const snap={sourceReady:true,traders:[{
    uniqueCode:'T1',nickname:'Alpha',providerRank:1,
    openPositions:[{id:'P1',instId:'BTC-USDT-SWAP',side:'LONG',leverage:5,markPx:100,openAvgPx:90,openTime:1,protectedFields:false}],
    recentClosed:[]
  }]};
  const x=applyPublicTraderCopySnapshot(createSpecialistWalletState(),snap,{now:1000,wallet3MarginQuote:500});
  const w=x.state.wallets[WALLET_3_TRADER_COPY];
  assert.equal(x.results.openedW3,1);
  assert.equal(w.positions.length,1);
  assert.equal(w.positions[0].entryPrice,100);
  assert.equal(w.positions[0].marginQuote,500);
  assert.equal(w.positions[0].exposureQuote,2500);
  assert.equal(w.capitalLimitQuote,null);
  assert.equal(w.positions[0].canExecuteLive,false);
});

test('wallet 5 copies only known memecoin instruments from public profitable traders',()=>{
  const snap={sourceReady:true,traders:[{
    uniqueCode:'T1',nickname:'Alpha',providerRank:1,recentClosed:[],
    openPositions:[
      {id:'B',instId:'BTC-USDT-SWAP',side:'LONG',leverage:2,markPx:100,openAvgPx:90,openTime:1,protectedFields:false},
      {id:'M',instId:'PEPE-USDT-SWAP',side:'SHORT',leverage:3,markPx:.001,openAvgPx:.0011,openTime:1,protectedFields:false}
    ]
  }]};
  const x=applyPublicTraderCopySnapshot(createSpecialistWalletState(),snap,{now:1000});
  assert.equal(x.results.openedW3,2);
  assert.equal(x.results.openedW5,1);
  assert.equal(x.state.wallets[WALLET_5_MEME_COPY].positions[0].sourceInstId,'PEPE-USDT-SWAP');
});

test('wallet 3 closes only with a public close price instead of inventing one',()=>{
  let x=applyPublicTraderCopySnapshot(createSpecialistWalletState(),{sourceReady:true,traders:[{
    uniqueCode:'T1',nickname:'A',openPositions:[{id:'P1',instId:'BTC-USDT-SWAP',side:'LONG',leverage:2,markPx:100,openAvgPx:90,openTime:1,protectedFields:false}],recentClosed:[]
  }]},{now:1000}).state;
  const pending=applyPublicTraderCopySnapshot(x,{sourceReady:true,traders:[{uniqueCode:'T1',nickname:'A',openPositions:[],recentClosed:[]}]},{now:2000});
  assert.equal(pending.state.wallets[WALLET_3_TRADER_COPY].positions[0].sourceState,'SOURCE_EXIT_PENDING');
  const closed=applyPublicTraderCopySnapshot(pending.state,{sourceReady:true,traders:[{
    uniqueCode:'T1',nickname:'A',openPositions:[],recentClosed:[{id:'P1',instId:'BTC-USDT-SWAP',side:'LONG',closeAvgPx:110,closeTime:3000}]
  }]},{now:3000});
  assert.equal(closed.state.wallets[WALLET_3_TRADER_COPY].positions.length,0);
  assert.equal(closed.state.wallets[WALLET_3_TRADER_COPY].closed.length,1);
  assert.ok(closed.state.wallets[WALLET_3_TRADER_COPY].closed[0].realizedNetPnlQuote>0);
});

test('wallet 4 enters only early liquid shadow candidates and ignores risky thin launches',()=>{
  const now=2_000_000;
  const snap={sourceReady:true,rows:[
    {chainId:'solana',tokenAddress:'GOOD',symbol:'GOOD',priceUsd:.01,liquidityUsd:30_000,pairCreatedAt:now-10_000,
      score:{stage:'NEW_NOW',researchPriorityScore:.72,attentionSignals:['NEW_PROFILE'],riskFlags:['ULTRA_NEW_PAIR']}},
    {chainId:'solana',tokenAddress:'BAD',symbol:'BAD',priceUsd:.01,liquidityUsd:900,pairCreatedAt:now-10_000,
      score:{stage:'RISK_ONLY',researchPriorityScore:.80,attentionSignals:['NEW_BOOST'],riskFlags:['LIQUIDITY_EXTREME_THIN']}}
  ]};
  const x=applyMemecoinScoutSnapshot(createSpecialistWalletState(),snap,{now,minLiquidityUsd:10_000,minScore:.58});
  assert.equal(x.results.opened,1);
  assert.equal(x.state.wallets[WALLET_4_MEME_SCOUT].positions[0].tokenAddress,'GOOD');
  assert.equal(x.state.wallets[WALLET_4_MEME_SCOUT].positions[0].canExecuteLive,false);
});

test('wallet 4 marks and closes a take-profit research episode from later public price',()=>{
  const now=2_000_000;
  let state=applyMemecoinScoutSnapshot(createSpecialistWalletState(),{sourceReady:true,rows:[{
    chainId:'solana',tokenAddress:'GOOD',symbol:'GOOD',priceUsd:1,liquidityUsd:30_000,
    score:{stage:'NEW_NOW',researchPriorityScore:.72,attentionSignals:[],riskFlags:[]}
  }]},{now}).state;
  const next=applyMemecoinScoutSnapshot(state,{sourceReady:true,rows:[{
    chainId:'solana',tokenAddress:'GOOD',symbol:'GOOD',priceUsd:2.6,liquidityUsd:40_000,
    score:{stage:'EARLY',researchPriorityScore:.70,attentionSignals:[],riskFlags:[]}
  }]},{now:now+60_000,takeReturn:1.5});
  assert.equal(next.results.closed,1);
  assert.equal(next.state.wallets[WALLET_4_MEME_SCOUT].positions.length,0);
  assert.equal(next.state.wallets[WALLET_4_MEME_SCOUT].closed[0].closeReason,'MEME_TAKE_PROFIT');
});

test('summary keeps specialist wallets isolated and shadow-only',()=>{
  const s=specialistWalletSummary(createSpecialistWalletState(),{asOf:100});
  assert.ok(s.wallets[WALLET_3_TRADER_COPY]);
  assert.ok(s.wallets[WALLET_4_MEME_SCOUT]);
  assert.ok(s.wallets[WALLET_5_MEME_COPY]);
  assert.equal(s.canExecuteLive,false);
  assert.equal(s.wallets[WALLET_3_TRADER_COPY].capitalLimitQuote,null);
});
