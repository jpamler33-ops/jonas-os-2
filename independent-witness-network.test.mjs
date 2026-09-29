import test from 'node:test';
import assert from 'node:assert/strict';
import { parseOkxBook, parseKrakenDepth, buildWitnessConsensus, okxInstrument, krakenPair } from './independent-witness-network.mjs';

function primary(){
  return {
    source:'BINANCE',venue:'BINANCE_SPOT',symbol:'BTCUSDT',quote:'USDT',
    bid:100,ask:100.02,mid:100.01,spreadBps:1.9998,imbalance:0.25,
    publishedAt:1_000_000,availableAt:1_000_100
  };
}
function witness(source,{quote='USDT',mid=100.01,spreadBps=2,imbalance=0.2,availableAt=1_000_200,publishedAt=1_000_150}={}){
  return {
    source,venue:source+'_SPOT',symbol:'BTCUSDT',quote,
    bid:mid-0.01,ask:mid+0.01,mid,spreadBps,imbalance,publishedAt,availableAt
  };
}

test('maps primary symbols to OKX and Kraken markets',()=>{
  assert.equal(okxInstrument('BTCUSDT'),'BTC-USDT');
  assert.equal(krakenPair('BTCUSDT'),'XBTUSD');
  assert.equal(krakenPair('ETHUSDT'),'ETHUSD');
});

test('parses OKX book and computes imbalance',()=>{
  const w=parseOkxBook('BTCUSDT',{
    code:'0',data:[{ts:'1000100',bids:[['100','2','0','1']],asks:[['100.02','1','0','1']]}]
  },1_000_200);
  assert.equal(w.source,'OKX');
  assert.equal(w.quote,'USDT');
  assert.ok(w.imbalance>0);
  assert.ok(w.spreadBps>0);
});

test('parses Kraken depth and preserves USD quote basis',()=>{
  const w=parseKrakenDepth('BTCUSDT',{
    error:[],result:{XXBTZUSD:{bids:[['100','2',1000]],asks:[['100.04','1',1000]]}}
  },1_000_100);
  assert.equal(w.source,'KRAKEN');
  assert.equal(w.quote,'USD');
  assert.equal(w.publishedAt,1_000_000);
});

test('strict independent witness requires two external venues and same-quote witness',()=>{
  const p=primary();
  const okx=witness('OKX',{quote:'USDT',mid:100.02,imbalance:0.2});
  const kraken=witness('KRAKEN',{quote:'USD',mid:100.03,imbalance:0.18});
  const r=buildWitnessConsensus(p,[okx,kraken],{asOf:1_000_300,maxAgeMs:5000});
  assert.equal(r.externalWitnessCount,2);
  assert.equal(r.sourceIndependence,'MULTI_VENUE_INDEPENDENT');
  assert.equal(r.independentWitnessSatisfied,true);
});

test('flow contradiction blocks strict witness even with live venues',()=>{
  const p=primary();
  const okx=witness('OKX',{quote:'USDT',mid:100.02,imbalance:-0.4});
  const kraken=witness('KRAKEN',{quote:'USD',mid:100.03,imbalance:-0.3});
  const r=buildWitnessConsensus(p,[okx,kraken],{asOf:1_000_300,maxAgeMs:5000});
  assert.equal(r.independentWitnessSatisfied,false);
  assert.ok(r.contradictions.some(x=>x.startsWith('FLOW_DIVERGENCE')));
});

test('stale venue is rejected rather than silently counted',()=>{
  const p=primary();
  const stale=witness('OKX',{publishedAt:900_000,availableAt:1_000_200});
  const r=buildWitnessConsensus(p,[stale],{asOf:1_000_300,maxAgeMs:5000});
  assert.equal(r.externalWitnessCount,0);
  assert.equal(r.rejected[0].reason,'STALE');
});

test('cross-quote witness alone cannot satisfy strict independent witness',()=>{
  const p=primary();
  const kraken=witness('KRAKEN',{quote:'USD',mid:100.03,imbalance:0.2});
  const r=buildWitnessConsensus(p,[kraken],{asOf:1_000_300,maxAgeMs:5000,minExternalWitnesses:1});
  assert.equal(r.independentWitnessSatisfied,false);
  assert.ok(r.caveats.includes('USD_VS_USDT_QUOTE_BASIS'));
});
