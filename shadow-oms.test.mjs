import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import {
  normalizeExecutionBook,simulateImmediateExecution,initializePassiveQueue,createShadowOrder,
  applyAggTrades,markShadowOrder,cancelShadowOrder,loadShadowOms,saveShadowOms,
  SHADOW_OMS_CAPABILITIES
} from './shadow-oms.mjs';

function book(){
  return normalizeExecutionBook({
    symbol:'BTCUSDT',
    bids:[[99.99,1],[99.98,2],[99.97,3]],
    asks:[[100.01,1],[100.02,2],[100.03,3]],
    availableAt:1000,
    source:'TEST'
  });
}
function intent(x={}){
  return {symbol:'BTCUSDT',side:'BUY',type:'MARKET',notionalQuote:150,latencyMs:0,...x};
}

test('shadow OMS has no live execution capability',()=>{
  assert.equal(SHADOW_OMS_CAPABILITIES.execution,'SHADOW_ONLY');
  assert.equal(SHADOW_OMS_CAPABILITIES.canExecuteLive,false);
  assert.equal(SHADOW_OMS_CAPABILITIES.exchangeOrderAdapter,false);
  assert.equal(SHADOW_OMS_CAPABILITIES.networkOrderSubmission,false);
});

test('market buy walks ask depth and computes VWAP/slippage/fees',()=>{
  const b=book();
  const r=simulateImmediateExecution(intent(),b,{takerFeeBps:10});
  assert.ok(r.filledQuote>149.99);
  assert.ok(r.avgFillPrice>=100.01);
  assert.ok(r.slippageBps>0);
  assert.ok(r.feeQuote>0);
  assert.equal(r.liquidity,'TAKER');
});

test('market order becomes partial when visible depth is insufficient',()=>{
  const b=book();
  const r=simulateImmediateExecution(intent({notionalQuote:1_000_000}),b);
  assert.equal(r.depthExhausted,true);
  assert.ok(r.fillRatio<1);
});

test('marketable limit respects limit price cap',()=>{
  const b=book();
  const order=intent({type:'LIMIT',limitPrice:100.01,notionalQuote:300});
  const r=simulateImmediateExecution(order,b);
  assert.ok(r.filledQuote<=100.01*1+1e-9);
  assert.ok(r.fillRatio<1);
});

test('passive limit starts behind visible queue plus hidden-liquidity buffer',()=>{
  const b=book();
  const q=initializePassiveQueue(intent({type:'LIMIT',limitPrice:99.99,notionalQuote:100}),b,{hiddenQueueBufferPct:0.1});
  assert.ok(q.queueAheadBase>1);
  assert.equal(q.queueVisibility,'VISIBLE_LEVEL_PLUS_BUFFER');
  assert.equal(q.uncertainty,'MEDIUM');
});

test('maker trade depletes queue before filling order',()=>{
  const b=book();
  let o=createShadowOrder({
    intent:intent({type:'LIMIT',limitPrice:99.99,notionalQuote:99.99}),
    decisionBook:b,arrivalBook:b,createdAt:1000,lastAggTradeId:10,
    config:{makerFeeBps:10,hiddenQueueBufferPct:0}
  });
  assert.equal(o.status,'ACTIVE');
  let r=applyAggTrades(o,[{id:11,price:99.99,qty:0.5,buyerMaker:true,time:1100}],{at:1100});
  assert.equal(r.order.fillBase,0);
  assert.ok(r.order.queue.queueAheadBase<1);
  r=applyAggTrades(r.order,[{id:12,price:99.99,qty:1.2,buyerMaker:true,time:1200}],{at:1200});
  assert.ok(r.order.fillBase>0);
  assert.equal(r.order.status,'PARTIALLY_FILLED');
});

test('wrong aggressor side cannot fill passive buy',()=>{
  const b=book();
  const o=createShadowOrder({
    intent:intent({type:'LIMIT',limitPrice:99.99,notionalQuote:99.99}),
    decisionBook:b,arrivalBook:b,createdAt:1000,lastAggTradeId:10,
    config:{hiddenQueueBufferPct:0}
  });
  const r=applyAggTrades(o,[{id:11,price:99.99,qty:5,buyerMaker:false,time:1100}],{at:1100});
  assert.equal(r.order.fillBase,0);
});

test('markout signs adverse selection correctly for buy fills',()=>{
  const b=book();
  const o=createShadowOrder({intent:intent(),decisionBook:b,arrivalBook:b,createdAt:1000});
  const marked=markShadowOrder(o,{mid:o.avgFillPrice*0.99,at:61_000});
  assert.ok(marked.markouts['60000'].adverseSelectionBps>0);
});

test('cancellation never turns into live execution',()=>{
  const b=book();
  const o=createShadowOrder({
    intent:intent({type:'LIMIT',limitPrice:99.99}),
    decisionBook:b,arrivalBook:b,createdAt:1000
  });
  const c=cancelShadowOrder(o,{at:2000});
  assert.equal(c.status,'CANCELLED');
  assert.equal(c.canExecuteLive,false);
  assert.equal(c.execution,'SHADOW_ONLY');
});

test('shadow OMS persists and reloads execution-disabled orders',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'tcx-shadow-'));
  const file=path.join(dir,'oms.json');
  const b=book();
  const o=createShadowOrder({intent:intent(),decisionBook:b,arrivalBook:b,createdAt:1000});
  await saveShadowOms(file,[o]);
  const loaded=await loadShadowOms(file);
  assert.equal(loaded.orders.length,1);
  assert.equal(loaded.orders[0].canExecuteLive,false);
  assert.equal(loaded.orders[0].execution,'SHADOW_ONLY');
});
