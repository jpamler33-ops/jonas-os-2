import test from 'node:test';
import assert from 'node:assert/strict';
import {forecastIssuanceToChartOverlay,forecastOverlaySummary,forecastHorizonForChartInterval,forecastIssuancesToChartMoments} from './forecast-chart-overlay.mjs';

test('converts canonical issuance path and intervals into chart overlay',()=>{
  const issuance={
    forecast:{
      asOf:1000,price:100,
      path:{
        status:'ACTIVE',coherence:'COHERENT',dominantArchetype:'TREND_UP',
        scenarios:[
          {id:'UPSIDE_PATH',probability:.5,points:[{horizonId:'5m',horizonMs:300000,targetReturn:.02,targetPrice:102}]},
          {id:'BASE_PATH',probability:.3,points:[{horizonId:'5m',horizonMs:300000,targetReturn:.01,targetPrice:101}]},
          {id:'DOWNSIDE_PATH',probability:.2,points:[{horizonId:'5m',horizonMs:300000,targetReturn:-.02,targetPrice:98}]}
        ]
      },
      horizons:[{
        horizonId:'5m',horizonMs:300000,gate:'PASS',operationalConfidence:.7,
        interval:{q10:-.03,median:.01,q90:.04}
      }]
    }
  };
  const out=forecastIssuanceToChartOverlay(issuance,{now:2000});
  assert.equal(out.status,'ACTIVE');
  assert.equal(out.scenarios.length,3);
  assert.equal(out.horizons[0].lowerPrice,97);
  assert.equal(out.horizons[0].upperPrice,104);
  assert.match(forecastOverlaySummary(out).text,/keine garantierte Kursbahn/);
});

test('stale forecast overlay fails closed',()=>{
  const out=forecastIssuanceToChartOverlay({forecast:{asOf:1,price:100,path:{scenarios:[]},horizons:[]}},{now:10_000_000,maxAgeMs:1000});
  assert.equal(out,null);
});


test('maps chart intervals to a bounded forecast horizon',()=>{
  assert.equal(forecastHorizonForChartInterval('1m'),'5m');
  assert.equal(forecastHorizonForChartInterval('5m'),'15m');
  assert.equal(forecastHorizonForChartInterval('15m'),'1h');
  assert.equal(forecastHorizonForChartInterval('1h'),'3h');
  assert.equal(forecastHorizonForChartInterval('4h'),'3h');
});

test('historical chart moments come only from forecasts issued at that time',()=>{
  const issuances=Array.from({length:8},(_,i)=>({
    symbol:'BTCUSDT',
    forecast:{
      asOf:1_000+i*1_000,
      price:100+i,
      horizons:[
        {horizonId:'15m',horizonMs:900_000,gate:'PASS',operationalConfidence:.6,interval:{q10:-.01,median:.01+i*.001,q90:.03}},
        {horizonId:'1h',horizonMs:3_600_000,gate:'PASS',operationalConfidence:.7,interval:{q10:-.02,median:.02,q90:.05}}
      ]
    }
  }));
  const out=forecastIssuancesToChartMoments(issuances,{
    symbol:'BTCUSDT',startAt:1_000,endAt:9_000,horizonId:'15m',limit:4
  });
  assert.ok(out.length>=1&&out.length<=4);
  assert.ok(out.every(x=>x.horizonId==='15m'&&x.targetAt===x.asOf+900_000));
  assert.ok(out.every(x=>x.medianPrice>x.anchorPrice));
  assert.ok(out.every(x=>x.probabilistic===true&&x.executionMode==='SHADOW_ONLY'));
});

test('historical forecast moments never mix symbols or silently substitute a missing horizon',()=>{
  const rows=[
    {symbol:'BTCUSDT',forecast:{asOf:1000,price:100,horizons:[{horizonId:'5m',horizonMs:300000,interval:{median:.01}}]}},
    {symbol:'ETHUSDT',forecast:{asOf:1100,price:10,horizons:[{horizonId:'1h',horizonMs:3600000,interval:{median:.50}}]}}
  ];
  assert.equal(forecastIssuancesToChartMoments(rows,{symbol:'BTCUSDT',startAt:0,endAt:2000,horizonId:'5m'}).length,1);
  assert.deepEqual(forecastIssuancesToChartMoments(rows,{symbol:'BTCUSDT',startAt:0,endAt:2000,horizonId:'1h'}),[]);
});

test('historical forecast sampler resolves finite bounds when caller omits them',()=>{
  const out=forecastIssuancesToChartMoments([
    {symbol:'BTCUSDT',forecast:{asOf:1000,price:100,horizons:[{horizonId:'5m',horizonMs:300000,interval:{median:.01}}]}},
    {symbol:'BTCUSDT',forecast:{asOf:2000,price:101,horizons:[{horizonId:'5m',horizonMs:300000,interval:{median:-.01}}]}}
  ],{symbol:'BTCUSDT',horizonId:'5m',limit:4});
  assert.equal(out.length,2);
  assert.ok(out.every(x=>Number.isFinite(x.asOf)&&Number.isFinite(x.medianPrice)));
});
