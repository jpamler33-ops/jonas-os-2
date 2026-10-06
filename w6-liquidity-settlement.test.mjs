import test from 'node:test';
import assert from 'node:assert/strict';
import {createSpecialistWalletState,applyUser99k60sStrategySnapshot,recordUser99k60sExitObservation,WALLET_6_USER_99K_60S} from './shadow-specialist-wallets.mjs';
const now=40_000_000;
const row={chainId:'solana',tokenAddress:'SETTLE',symbol:'SET',priceUsd:1,marketCap:130_000,liquidityUsd:100_000,pairAddress:'POOL',pairCreatedAt:now-20_000};
const wallet=s=>s.wallets[WALLET_6_USER_99K_60S];
const open=()=>applyUser99k60sStrategySnapshot(createSpecialistWalletState(),{sourceReady:true,capturedAt:now,rows:[row]},{now}).state;
const update=(s,changes={},opts={})=>applyUser99k60sStrategySnapshot(s,{sourceReady:true,capturedAt:now+1000,rows:[{...row,...changes}],...opts},{now:now+1000});
const sell=s=>recordUser99k60sExitObservation(s,{positionKey:wallet(s).positions[0].positionKey,reason:'USER_PROFIT_ENOUGH',now:now+1000,priceUsd:wallet(s).positions[0].lastPrice});
test('W6 booked PnL equals liquidity-backed proceeds minus stake and entry fee',()=>{
 const s=update(open(),{priceUsd:2}).state,x=sell(s),p=x.closed;
 assert.equal(x.recorded,true);assert.equal(p.settlementStatus,'MODELLED_LIQUIDITY_BACKED_EXIT');
 assert.ok(p.exitProceedsQuote>100);assert.ok(p.exitProceedsQuote<50000);
 assert.equal(p.realizedNetPnlQuote,p.exitProceedsQuote-p.exposureQuote-p.exitExecutionMark.entryFeeQuote);
 assert.ok(p.observedRealizedNetPnlQuote>p.realizedNetPnlQuote);assert.equal(p.canExecuteLive,false);
});
test('W6 huge chart gain cannot book profit beyond a depleted reserve',()=>{
 const x=sell(update(open(),{priceUsd:1000,liquidityUsd:100}).state),p=x.closed;
 assert.equal(x.recorded,true);assert.ok(p.exitProceedsQuote<=50);assert.ok(p.realizedNetPnlQuote<0);assert.ok(p.observedRealizedNetPnlQuote>0);
});
test('W6 confirmed pool death closes immediately even without a price and cannot close twice',()=>{
 const x=update(open(),{priceUsd:0,liquidityUsd:0}),p=wallet(x.state).closed[0];
 assert.equal(x.results.liquidityExit,1);assert.equal(wallet(x.state).positions.length,0);
 assert.equal(p.closeReason,'W6_LIQUIDITY_GONE');assert.equal(p.exitProceedsQuote,0);assert.equal(p.realizedNetPnlQuote,-100.3);assert.equal(p.exitFilled,false);
 const repeat=update(x.state,{priceUsd:0,liquidityUsd:0});assert.equal(repeat.results.closed,0);assert.equal(wallet(repeat.state).closed.length,1);
});
for(const [name,changes,opts] of [
 ['unknown liquidity',{liquidityUsd:null},{}],['negative invalid liquidity',{liquidityUsd:-10},{}],
 ['different pool',{liquidityUsd:0,pairAddress:'OTHER'},{}],['unverified pool',{liquidityUsd:0,pairAddress:null},{}],
 ['stale snapshot',{liquidityUsd:0},{capturedAt:now-20000}],['failed provider',{liquidityUsd:0},{sourceReady:false}]
])test(`W6 ${name} cannot cause a write-off or realized PnL`,()=>{
 const x=update(open(),changes,opts);assert.equal(x.results.closed,0);assert.equal(wallet(x.state).positions.length,1);
 const y=sell(x.state);assert.equal(y.recorded,false);assert.equal(y.error,'EXIT_UNFILLABLE');assert.equal(wallet(y.state).closed.length,0);
});
test('W6 stale manual exit waits for a fresh valid liquidity observation',()=>{
 let s=open();const key=wallet(s).positions[0].positionKey;
 const stale=recordUser99k60sExitObservation(s,{positionKey:key,reason:'USER_PROFIT_ENOUGH',priceUsd:2,now:now+20000});
 assert.equal(stale.recorded,false);assert.equal(wallet(stale.state).closed.length,0);
 s=update(stale.state,{priceUsd:2}).state;assert.equal(sell(s).recorded,true);
});
