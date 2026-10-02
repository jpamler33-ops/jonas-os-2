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


test('maps chart intervals to a practical forecast horizon',()=>{
  assert.equal(forecastHorizonForChartInterval('1m'),'5m');
  assert.equal(forecastHorizonForChartInterval('5m'),'15m');
  assert.equal(forecastHorizonForChartInterval('15m'),'1h');
  assert.equal(forecastHorizonForChartInterval('1h'),'3h');
  assert.equal(forecastHorizonForChartInterval('4h'),'3h');
});

test('builds bounded historical forecast moments from immutable issuance-time data',()=>{
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
  assert.ok(out.length<=4);
  assert.ok(out.length>=1);
  assert.ok(out.every(x=>x.horizonId==='15m'&&x.targetAt===x.asOf+900_000));
  assert.ok(out.every(x=>x.medianPrice>x.anchorPrice));
  assert.ok(out.every(x=>x.probabilistic===true));
});

test('historical forecast moments never mix another symbol',()=>{
  const out=forecastIssuancesToChartMoments([
    {symbol:'BTCUSDT',forecast:{asOf:1000,price:100,horizons:[{horizonId:'5m',horizonMs:300000,interval:{median:.01}}]}},
    {symbol:'ETHUSDT',forecast:{asOf:1100,price:10,horizons:[{horizonId:'5m',horizonMs:300000,interval:{median:.50}}]}}
  ],{symbol:'BTCUSDT',startAt:0,endAt:2000,horizonId:'5m'});
  assert.equal(out.length,1);
  assert.equal(out[0].anchorPrice,100);
});
