import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { createEpisode, episodeDistance, findSimilarEpisodes, computeOutcome, matureEpisode, summarizeSimilar, saveEpisodeMemory, loadEpisodeMemory } from './episode-memory.mjs';

function baseEpisode(overrides={}){
  return createEpisode({
    symbol:'BTCUSDT',interval:'5m',anchorCloseTime:1_000_000,availableAt:1_000_100,
    analysis:{lastClose:100,ema20:101,ema50:100,support:98,resistance:103,trend:'BULLISH',pattern:null},
    dashboard:{biasScore:4,pressureScore:45,spreadBps:1,imbalance:0.2,atrPct:0.5,realizedVolPct:0.2,volumeRatio:1.3,regime:'TREND_ORDERLY',localTrend:'BULLISH',liquidity:'NORMAL',flow:'BID_PRESSURE',dominantPressure:'FLOW_SKEW'},
    market:{source:'TEST',version:'v1',availableAt:1090},samplingReason:'CADENCE',...overrides
  });
}

test('episode capture rejects future anchor PIT leakage',()=>{
  assert.throws(()=>createEpisode({symbol:'BTCUSDT',anchorCloseTime:2_000_000,availableAt:1_000_000,analysis:{},dashboard:{},market:{}}),/PIT/);
});

test('similarity is mechanism/state based and prefers closer vector',()=>{
  const e=baseEpisode();
  const close=JSON.parse(JSON.stringify(e));close.id='close';close.vector.pressureScore=47;
  const far=JSON.parse(JSON.stringify(e));far.id='far';far.vector.pressureScore=95;far.vector.regime='STRESS';far.vector.flow='ASK_PRESSURE';
  close.outcomes['12']={returnPct:1,maxRisePct:2,maxFallPct:-0.5,realizedRangePct:2.5};
  far.outcomes['12']={returnPct:-2,maxRisePct:0.3,maxFallPct:-3,realizedRangePct:3.3};
  const m=findSimilarEpisodes(e.vector,[far,close],{symbol:'BTCUSDT',k:2});
  assert.equal(m[0].episode.id,'close');
  assert.ok(episodeDistance(e.vector,close.vector)<episodeDistance(e.vector,far.vector));
});

test('outcome does not mature before complete future horizon',()=>{
  const e=baseEpisode();
  const candles=[1,2].map(i=>({closeTime:1000+i*300,closed:true,h:101+i,l:99,c:100+i}));
  assert.equal(computeOutcome(e,candles,3),null);
});

test('outcome stores neutral forward mechanics after maturity',()=>{
  const e=baseEpisode();
  const candles=[
    {closeTime:1_300_000,closed:true,h:102,l:99,c:101},
    {closeTime:1_600_000,closed:true,h:104,l:98,c:103},
    {closeTime:1_900_000,closed:true,h:105,l:97,c:104}
  ];
  const o=computeOutcome(e,candles,3);
  assert.equal(o.returnPct,4);
  assert.equal(o.maxRisePct,5);
  assert.equal(o.maxFallPct,-3);
  assert.equal(o.realizedRangePct,8);
});

test('matureEpisode never uses active future candle',()=>{
  const e=baseEpisode();
  const candles=[
    {closeTime:1_300_000,closed:true,h:101,l:99,c:100.5},
    {closeTime:1_600_000,closed:true,h:102,l:98,c:101},
    {closeTime:1_900_000,closed:false,h:999,l:1,c:500},
    {closeTime:1_900_000,closed:true,h:103,l:97,c:102}
  ];
  matureEpisode(e,candles);
  assert.equal(e.outcomes['3'].endClose,102);
  assert.equal(e.outcomes['3'].maxRisePct,3);
});

test('summary reports robust historical distribution, not win probability',()=>{
  const a=baseEpisode();a.id='a';a.outcomes['12']={returnPct:1,maxRisePct:2,maxFallPct:-1,realizedRangePct:3};
  const b=baseEpisode();b.id='b';b.outcomes['12']={returnPct:3,maxRisePct:4,maxFallPct:-2,realizedRangePct:6};
  const s=summarizeSimilar([{episode:a,similarity:0.9},{episode:b,similarity:0.8}],12);
  assert.equal(s.n,2);assert.equal(s.returnPct.median,2);assert.ok(Math.abs(s.medianSimilarity-85)<1e-9);
  assert.equal('probability' in s,false);
});

test('episode memory persists and reloads',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'tcx-episodes-'));
  const file=path.join(dir,'episodes.json');
  await saveEpisodeMemory(file,[baseEpisode()]);
  const loaded=await loadEpisodeMemory(file);
  assert.equal(loaded.episodes.length,1);
  assert.equal(loaded.episodes[0].symbol,'BTCUSDT');
});

test('outcome remains unknown when immediate future bars are missing',()=>{
  const e=baseEpisode();
  const candles=[
    {closeTime:1_900_000,closed:true,h:103,l:97,c:102},
    {closeTime:2_200_000,closed:true,h:104,l:96,c:103},
    {closeTime:2_500_000,closed:true,h:105,l:95,c:104}
  ];
  assert.equal(computeOutcome(e,candles,3),null);
});


test('matured outcome records actual observation time',()=>{
  const e=baseEpisode();
  const candles=[
    {closeTime:1_300_000,closed:true,h:102,l:99,c:101},
    {closeTime:1_600_000,closed:true,h:104,l:98,c:103},
    {closeTime:1_900_000,closed:true,h:105,l:97,c:104}
  ];
  const observedAt=2_000_000;
  assert.equal(matureEpisode(e,candles,{observedAt}),true);
  assert.equal(e.outcomes['3'].maturedAt,1_900_000);
  assert.equal(e.outcomes['3'].observedAt,observedAt);
});

test('episode outcome cannot be observed before it matures',()=>{
  const e=baseEpisode();
  const candles=[
    {closeTime:1_300_000,closed:true,h:102,l:99,c:101},
    {closeTime:1_600_000,closed:true,h:104,l:98,c:103},
    {closeTime:1_900_000,closed:true,h:105,l:97,c:104}
  ];
  assert.throws(
    ()=>matureEpisode(e,candles,{observedAt:1_800_000}),
    /PIT violation/
  );
});
