import test from 'node:test';
import assert from 'node:assert/strict';
import {forecastIssuanceToChartOverlay,forecastOverlaySummary} from './forecast-chart-overlay.mjs';

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
