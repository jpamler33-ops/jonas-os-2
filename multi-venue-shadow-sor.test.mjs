import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeVenueBook, buildShadowSmartRoute, summarizeVenueQuality, SHADOW_SOR_CAPABILITIES } from './multi-venue-shadow-sor.mjs';

function venue(name,{bid=99.9,ask=100.1,bidQty=10,askQty=10,feeBps=10,quote='USDT',availableAt=1000,latency=20,toxicityBps=null,toxicityEvidenceN=0}={}){
  return normalizeVenueBook({
    venue:name,source:name,symbol:'BTCUSDT',quote,
    bids:[[bid,bidQty],[bid-0.1,bidQty]],asks:[[ask,askQty],[ask+0.1,askQty]],
    availableAt,fetchLatencyMs:latency,feeBps,toxicityBps,toxicityEvidenceN
  });
}

test('SOR has no live execution capability',()=>{
  assert.equal(SHADOW_SOR_CAPABILITIES.execution,'SHADOW_ONLY');
  assert.equal(SHADOW_SOR_CAPABILITIES.canExecuteLive,false);
  assert.equal(SHADOW_SOR_CAPABILITIES.exchangeOrderAdapter,false);
  assert.equal(SHADOW_SOR_CAPABILITIES.networkOrderSubmission,false);
});

test('buy route splits marginal depth across venues',()=>{
  const a=venue('A',{ask:100,askQty:0.5,feeBps:0});
  const b=venue('B',{ask:100.05,askQty:2,feeBps:0});
  const r=buildShadowSmartRoute({side:'BUY',notionalQuote:150},[a,b],{asOf:1000});
  assert.equal(r.route.fillRatio,1);
  assert.equal(r.route.legs.length,2);
  assert.ok(r.route.legs.some(x=>x.venue==='A'));
  assert.ok(r.route.legs.some(x=>x.venue==='B'));
});

test('fees can make nominally cheaper venue worse',()=>{
  const cheap=venue('CHEAP',{ask:100,feeBps:30});
  const dear=venue('DEAR',{ask:100.1,feeBps:0});
  const r=buildShadowSmartRoute({side:'BUY',notionalQuote:50},[cheap,dear],{asOf:1000});
  assert.equal(r.route.legs[0].venue,'DEAR');
});

test('quote mismatch is excluded rather than silently normalized',()=>{
  const usdt=venue('USDT',{quote:'USDT'});
  const usd=venue('USD',{quote:'USD',ask:90,bid:89});
  const r=buildShadowSmartRoute({side:'BUY',notionalQuote:100},[usdt,usd],{asOf:1000,routeQuote:'USDT'});
  assert.equal(r.route.legs.every(x=>x.venue==='USDT'),true);
  assert.ok(r.route.excluded[0].reasons.some(x=>x.startsWith('QUOTE_MISMATCH')));
});

test('stale venue is excluded',()=>{
  const fresh=venue('FRESH',{availableAt:20_000});
  const stale=venue('STALE',{availableAt:1,ask:1,bid:0.9});
  const r=buildShadowSmartRoute({side:'BUY',notionalQuote:50},[fresh,stale],{asOf:20_000,maxAgeMs:15_000});
  assert.equal(r.route.legs.some(x=>x.venue==='STALE'),false);
  assert.ok(r.route.excluded.find(x=>x.venue==='STALE').reasons.includes('STALE'));
});

test('insufficient aggregate depth yields partial fill without fabrication',()=>{
  const a=venue('A',{askQty:0.1,bidQty:0.1,feeBps:0});
  const r=buildShadowSmartRoute({side:'BUY',notionalQuote:10_000},[a],{asOf:1000});
  assert.ok(r.route.fillRatio<1);
  assert.equal(r.route.depthExhausted,true);
});

test('sell route prefers highest fee-adjusted bid',()=>{
  const a=venue('A',{bid:100,feeBps:20});
  const b=venue('B',{bid:99.9,feeBps:0});
  const r=buildShadowSmartRoute({side:'SELL',notionalQuote:50},[a,b],{asOf:1000});
  assert.equal(r.route.legs[0].venue,'B');
});

test('fragmentation reports concentration and effective venue count',()=>{
  const a=venue('A',{ask:100,askQty:0.5,feeBps:0});
  const b=venue('B',{ask:100,askQty:0.5,feeBps:0});
  const r=buildShadowSmartRoute({side:'BUY',notionalQuote:100},[a,b],{asOf:1000});
  assert.equal(r.route.fragmentation.venueCountUsed,2);
  assert.ok(r.route.fragmentation.hhi>0 && r.route.fragmentation.hhi<=1);
  assert.ok(r.route.fragmentation.effectiveVenues>=1);
});

test('toxicity penalty requires sufficient evidence before affecting route',()=>{
  const toxicLowN=venue('LOW_N',{ask:100,feeBps:0,toxicityBps:50,toxicityEvidenceN:5});
  const clean=venue('CLEAN',{ask:100.1,feeBps:0});
  let r=buildShadowSmartRoute({side:'BUY',notionalQuote:20},[toxicLowN,clean],{asOf:1000,minToxicityEvidenceN:30});
  assert.equal(r.route.legs[0].venue,'LOW_N');
  const toxicHighN=venue('HIGH_N',{ask:100,feeBps:0,toxicityBps:50,toxicityEvidenceN:100});
  r=buildShadowSmartRoute({side:'BUY',notionalQuote:20},[toxicHighN,clean],{asOf:1000,minToxicityEvidenceN:30});
  assert.equal(r.route.legs[0].venue,'CLEAN');
});

test('route is deterministic for identical PIT books',()=>{
  const books=[venue('A'),venue('B',{ask:100.2})];
  const a=buildShadowSmartRoute({side:'BUY',notionalQuote:100},books,{asOf:1000});
  const b=buildShadowSmartRoute({side:'BUY',notionalQuote:100},books,{asOf:1000});
  assert.equal(a.routeHash,b.routeHash);
});

test('venue quality exposes eligibility depth latency and toxicity evidence',()=>{
  const xs=summarizeVenueQuality([venue('A',{toxicityBps:5,toxicityEvidenceN:31})],{asOf:1000});
  assert.equal(xs[0].eligible,true);
  assert.ok(xs[0].askDepthQuote>0);
  assert.equal(xs[0].toxicityPenaltyBps,5);
});
