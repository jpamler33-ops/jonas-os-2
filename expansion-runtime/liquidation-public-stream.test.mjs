import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createLiquidationPublicStream,
  liquidationSnapshotToExtraFeatures
} from './liquidation-public-stream.mjs';

class FakeWebSocket{
  static instances=[];
  constructor(url){
    this.url=url;
    this.listeners=new Map();
    this.sent=[];
    FakeWebSocket.instances.push(this);
  }
  addEventListener(type,fn){
    const xs=this.listeners.get(type)||[];
    xs.push(fn);
    this.listeners.set(type,xs);
  }
  emit(type,payload={}){
    for(const fn of this.listeners.get(type)||[]) fn(payload);
  }
  send(msg){ this.sent.push(msg); }
  close(){ this.emit('close',{}); }
}

test('stream subscribes to all-liquidation topics and aggregates USD flow',()=>{
  let t=1_000_000;
  FakeWebSocket.instances=[];
  const p=createLiquidationPublicStream({
    symbols:['BTCUSDT','ETHUSDT'],
    WebSocketImpl:FakeWebSocket,
    now:()=>t,
    pingMs:999999,
    reconnectMs:999999
  });
  p.start();
  const ws=FakeWebSocket.instances[0];
  ws.emit('open',{});
  const sub=JSON.parse(ws.sent[0]);
  assert.deepEqual(sub.args,['allLiquidation.BTCUSDT','allLiquidation.ETHUSDT']);

  t+=5*60_000+1;
  ws.emit('message',{data:JSON.stringify({
    topic:'allLiquidation.BTCUSDT',
    ts:t,
    data:[
      {T:t-1000,s:'BTCUSDT',S:'Buy',v:'2',p:'100'},
      {T:t-500,s:'BTCUSDT',S:'Sell',v:'1',p:'100'}
    ]
  })});
  const s=p.snapshot('BTCUSDT',{asOf:t});
  assert.equal(s.ready5m,true);
  assert.equal(s.window5m.totalUsd,300);
  assert.equal(s.window5m.longLiquidatedUsd,200);
  assert.equal(s.window5m.shortLiquidatedUsd,100);
  assert.ok(Math.abs(s.window5m.imbalance-(1/3))<1e-12);
  p.stop();
});

test('features are withheld until a full live 5m coverage window exists',()=>{
  let t=1_000_000;
  FakeWebSocket.instances=[];
  const p=createLiquidationPublicStream({
    symbols:['BTCUSDT'],
    WebSocketImpl:FakeWebSocket,
    now:()=>t,
    pingMs:999999,
    reconnectMs:999999
  });
  p.start();
  const ws=FakeWebSocket.instances[0];
  ws.emit('open',{});
  t+=4*60_000;
  const s=p.snapshot('BTCUSDT',{asOf:t});
  assert.equal(s.ready5m,false);
  assert.deepEqual(liquidationSnapshotToExtraFeatures(s),[]);
  p.stop();
});

test('snapshot converts finite rolling metrics to research-only features',()=>{
  let t=1_000_000;
  FakeWebSocket.instances=[];
  const p=createLiquidationPublicStream({
    symbols:['BTCUSDT'],
    WebSocketImpl:FakeWebSocket,
    now:()=>t,
    pingMs:999999,
    reconnectMs:999999
  });
  p.start();
  const ws=FakeWebSocket.instances[0];
  ws.emit('open',{});
  t+=15*60_000+1;
  ws.emit('message',{data:JSON.stringify({
    topic:'allLiquidation.BTCUSDT',
    ts:t,
    data:[
      {T:t-60_000,s:'BTCUSDT',S:'Buy',v:'3',p:'100'},
      {T:t-30_000,s:'BTCUSDT',S:'Sell',v:'1',p:'100'}
    ]
  })});
  const s=p.snapshot('BTCUSDT',{asOf:t});
  const rows=liquidationSnapshotToExtraFeatures(s);
  const byId=new Map(rows.map(x=>[x.id,x]));
  assert.ok(byId.has('research.liquidation.logUsd5m'));
  assert.ok(byId.has('research.liquidation.imbalance5m'));
  assert.ok(byId.has('research.liquidation.logUsd15m'));
  assert.ok(rows.every(x=>Number.isFinite(x.value)));
  p.stop();
});

test('duplicate liquidation payload does not double count',()=>{
  let t=1_000_000;
  FakeWebSocket.instances=[];
  const p=createLiquidationPublicStream({
    symbols:['BTCUSDT'],
    WebSocketImpl:FakeWebSocket,
    now:()=>t,
    pingMs:999999,
    reconnectMs:999999
  });
  p.start();
  const ws=FakeWebSocket.instances[0];
  ws.emit('open',{});
  t+=5*60_000+1;
  const payload={
    topic:'allLiquidation.BTCUSDT',
    ts:t,
    data:[{T:t-1000,s:'BTCUSDT',S:'Buy',v:'2',p:'100'}]
  };
  ws.emit('message',{data:JSON.stringify(payload)});
  ws.emit('message',{data:JSON.stringify(payload)});
  const s=p.snapshot('BTCUSDT',{asOf:t});
  assert.equal(s.window5m.count,1);
  assert.equal(s.window5m.totalUsd,200);
  p.stop();
});


test('snapshot exposes observed liquidation price clusters around reference price',()=>{
  let t=1_000_000;
  FakeWebSocket.instances=[];
  const p=createLiquidationPublicStream({
    symbols:['BTCUSDT'],
    WebSocketImpl:FakeWebSocket,
    now:()=>t,
    pingMs:999999,
    reconnectMs:999999
  });
  p.start();
  const ws=FakeWebSocket.instances[0];
  ws.emit('open',{});
  t+=15*60_000+1;
  ws.emit('message',{data:JSON.stringify({
    topic:'allLiquidation.BTCUSDT',
    ts:t,
    data:[
      {T:t-30_000,s:'BTCUSDT',S:'Buy',v:'5',p:'100.10'},
      {T:t-25_000,s:'BTCUSDT',S:'Buy',v:'4',p:'100.12'},
      {T:t-20_000,s:'BTCUSDT',S:'Sell',v:'2',p:'99.80'}
    ]
  })});
  const s=p.snapshot('BTCUSDT',{asOf:t,referencePrice:100,clusterBinBps:25,maxClusters:8});
  assert.equal(s.restrictions.clustersAreObservedPastEvents,true);
  assert.equal(s.restrictions.futureLiquidationLevels,false);
  assert.ok(s.clusters5m.length>=2);
  assert.ok(s.clusters5m[0].totalUsd>0);
  assert.ok(Number.isFinite(s.clusters5m[0].distanceBps));
  assert.equal(s.clusterReferencePrice,100);
  p.stop();
});
