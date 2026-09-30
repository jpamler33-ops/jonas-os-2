import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createDerivativesPublicProvider,
  derivativesSnapshotToExtraFeatures
} from './derivatives-public-provider.mjs';

function response(body,{status=200}={}){
  return {
    ok:status>=200&&status<300,
    status,
    async text(){ return JSON.stringify(body); }
  };
}

function fetchMock(url){
  const u=String(url);
  if(u.includes('/fapi/v1/premiumIndex')) return Promise.resolve(response({
    symbol:'BTCUSDT',
    markPrice:'100.5',
    indexPrice:'100',
    lastFundingRate:'0.0001',
    nextFundingTime:'2000000',
    time:'1000000'
  }));
  if(u.includes('/fapi/v1/openInterest')) return Promise.resolve(response({
    symbol:'BTCUSDT',
    openInterest:'1000',
    time:'1000001'
  }));
  if(u.includes('/futures/data/openInterestHist')) return Promise.resolve(response([
    {sumOpenInterestValue:'100000',timestamp:999000},
    {sumOpenInterestValue:'110000',timestamp:1000000}
  ]));
  if(u.includes('/futures/data/globalLongShortAccountRatio')) return Promise.resolve(response([
    {longShortRatio:'1.25',timestamp:1000000}
  ]));
  if(u.includes('/futures/data/takerlongshortRatio')) return Promise.resolve(response([
    {buySellRatio:'1.4',timestamp:1000000}
  ]));
  if(u.includes('/api/v5/public/funding-rate')) return Promise.resolve(response({
    code:'0',
    data:[{fundingRate:'0.00008',nextFundingTime:'2000000',ts:'1000000'}]
  }));
  if(u.includes('/api/v5/public/open-interest')) return Promise.resolve(response({
    code:'0',
    data:[{oi:'900',oiUsd:'105000',ts:'1000000'}]
  }));
  throw new Error('unhandled '+u);
}

test('provider joins public Binance and OKX derivatives context',async()=>{
  let now=2_000_000;
  const p=createDerivativesPublicProvider({
    fetchImpl:fetchMock,
    now:()=>now
  });
  const s=await p.fetchSnapshot('BTCUSDT',{cacheMs:0});
  assert.equal(s.ok,true);
  assert.equal(s.witness.sourceCount,2);
  assert.equal(s.binance.fundingRate,.0001);
  assert.ok(Math.abs(s.binance.premiumPct-.005)<1e-12);
  assert.equal(s.binance.openInterestUsd,100500);
  assert.ok(Math.abs(s.binance.openInterestDelta5m-.1)<1e-12);
  assert.equal(s.binance.globalLongShortRatio,1.25);
  assert.equal(s.binance.takerBuySellRatio,1.4);
  assert.ok(Math.abs(s.witness.fundingRateAbsDiff-.00002)<1e-12);
});

test('snapshot converts only finite observed values into PIT extra features',async()=>{
  const p=createDerivativesPublicProvider({
    fetchImpl:fetchMock,
    now:()=>2_000_000
  });
  const s=await p.fetchSnapshot('BTCUSDT',{cacheMs:0});
  const rows=derivativesSnapshotToExtraFeatures(s);
  const byId=new Map(rows.map(x=>[x.id,x]));
  assert.equal(byId.get('research.derivatives.fundingRate').value,.0001);
  assert.ok(Math.abs(byId.get('research.derivatives.openInterestDelta5m').value-.1)<1e-12);
  assert.equal(byId.get('research.derivatives.fundingRateVenueSpread').availableAt,2_000_000);
  assert.ok(rows.every(x=>Number.isFinite(x.value)));
});

test('one venue may fail without fabricating its fields',async()=>{
  const p=createDerivativesPublicProvider({
    fetchImpl:async url=>{
      if(String(url).includes('okx.com')) return response({code:'500',data:[]});
      return fetchMock(url);
    },
    now:()=>2_000_000
  });
  const s=await p.fetchSnapshot('BTCUSDT',{cacheMs:0});
  assert.equal(s.ok,true);
  assert.equal(s.binance.fundingRate,.0001);
  assert.equal(s.okx,null);
  assert.equal(s.witness.sourceCount,1);
  const ids=derivativesSnapshotToExtraFeatures(s).map(x=>x.id);
  assert.equal(ids.includes('research.derivatives.okxFundingRate'),false);
  assert.equal(ids.includes('research.derivatives.fundingRateVenueSpread'),false);
});

test('both venues failing returns research-unavailable snapshot',async()=>{
  const p=createDerivativesPublicProvider({
    fetchImpl:async()=>response({error:'down'},{status:503}),
    now:()=>2_000_000
  });
  const s=await p.fetchSnapshot('BTCUSDT',{cacheMs:0});
  assert.equal(s.ok,false);
  assert.equal(s.errors.length,2);
  assert.deepEqual(derivativesSnapshotToExtraFeatures(s),[]);
});
