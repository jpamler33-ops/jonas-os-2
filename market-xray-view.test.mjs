import test from 'node:test';
import assert from 'node:assert/strict';
import {buildMarketXray,buildMtfMatrix} from './market-xray-view.mjs';

test('market xray ranks visible walls and explains liquidation pressure',()=>{
  const x=buildMarketXray({
    symbol:'BTCUSDT',
    book:{
      mid:100,spreadBps:2,
      bids:[[99.9,10],[99.8,50],[99.7,5]],
      asks:[[100.1,2],[100.2,4],[100.3,20]]
    },
    liquidation:{
      connected:true,ready5m:true,ready15m:true,
      window5m:{totalUsd:100000,longShare:.7,largestShare:.4},
      window15m:{totalUsd:250000,longShare:.6}
    },
    market:{price:100,changePct:2},
    dashboard:{flow:'BUY',pressureScore:65},
    live:true
  });
  assert.match(x.text,/MARKET X-RAY/);
  assert.match(x.text,/99\.800/);
  assert.match(x.text,/LONGS HIT/);
  assert.ok(x.topBidWalls[0].notional>x.topBidWalls[1].notional);
  assert.equal(x.researchOnly,true);
});

test('mtf matrix summarizes alignment and levels',()=>{
  const a=tf=>({trend:'BULLISH',classifiedPivots:[{label:'HL',price:95}],ema20:101,ema50:99,support:95,resistance:110});
  const m=buildMtfMatrix({
    symbol:'ETHUSDT',
    analyses:{'1m':a(),'5m':a(),'15m':a(),'1h':a(),'4h':a()},
    dashboard:{regime:'TREND',flow:'BUY',pressureScore:70}
  });
  assert.equal(m.alignment,'STRONG BULL ALIGNMENT');
  assert.match(m.text,/1m/);
  assert.match(m.text,/4h/);
  assert.match(m.text,/HL 95\.000/);
  assert.match(m.text,/S 95\.000 · R 110\.00/);
});
