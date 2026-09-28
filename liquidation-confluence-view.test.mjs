import test from 'node:test';
import assert from 'node:assert/strict';
import {buildObservedLiquidationHeatmap,buildConfluenceMap} from './liquidation-confluence-view.mjs';

test('heatmap renders observed liquidation clusters without future-level claim',()=>{
  const out=buildObservedLiquidationHeatmap({
    symbol:'BTCUSDT',referencePrice:100,window:'5m',live:true,
    liquidation:{
      ready5m:true,
      window5m:{totalUsd:300000,longShare:.7,count:8},
      clusters5m:[
        {price:99.8,distanceBps:-20,totalUsd:200000,longShare:.8},
        {price:100.3,distanceBps:30,totalUsd:100000,longShare:.2}
      ]
    }
  });
  assert.match(out.text,/LIQUIDATION HEATMAP/);
  assert.match(out.text,/LONG LIQS/);
  assert.match(out.text,/SHORT LIQS/);
  assert.match(out.text,/KEINE Zukunfts-Liquidationslevel/);
  assert.equal(out.futureLiquidationLevels,false);
});

test('confluence map merges nearby structure book and liquidation evidence',()=>{
  const out=buildConfluenceMap({
    symbol:'ETHUSDT',
    currentPrice:100,
    analysis:{
      support:99.8,resistance:102,
      classifiedPivots:[{kind:'L',label:'HL',price:99.85},{kind:'H',label:'HH',price:102}]
    },
    book:{
      bids:[[99.82,100],[99.7,10]],
      asks:[[102.02,90],[102.2,10]]
    },
    liquidation:{
      clusters15m:[
        {price:99.81,totalUsd:50000,longShare:.8},
        {price:102.01,totalUsd:45000,longShare:.2}
      ]
    },
    intelligenceFeatures:[
      {id:'research.intelligence.squeezeRisk',value:.7},
      {id:'research.intelligence.optionsDownsidePressure',value:.3},
      {id:'research.intelligence.crossDomainStress',value:.5}
    ]
  });
  assert.ok(out.zones.length>=2);
  assert.ok(out.zones[0].sources.length>=2);
  assert.match(out.text,/STRUCTURE/);
  assert.match(out.text,/ORDERBOOK/);
  assert.match(out.text,/LIQUIDATION/);
  assert.match(out.text,/KEINE Trefferwahrscheinlichkeit/);
  assert.equal(out.scoreIsProbability,false);
});
