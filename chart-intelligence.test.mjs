import test from 'node:test';
import assert from 'node:assert/strict';
import {buildChartIntelligence} from './chart-intelligence.mjs';

const pivots=[
  {i:1,kind:'H',price:100,label:'HH'},
  {i:2,kind:'L',price:90,label:'HL'},
  {i:3,kind:'H',price:110,label:'HH'},
  {i:4,kind:'L',price:95,label:'HL'}
];

test('builds beginner-readable bullish chart intelligence',()=>{
  const out=buildChartIntelligence({
    symbol:'BTCUSDT',interval:'5m',
    analysis:{trend:'BULLISH',classifiedPivots:pivots,support:95,resistance:110,ema20:103,ema50:99,lastClose:105,pattern:{side:'LONG',stage:'BREAK_CLOSE',level:110}},
    dashboard:{flow:'BUY',pressureScore:68,realizedVolPct:.55,atrPct:.8,volumeRatio:1.4,spreadBps:1.2},
    mtf:{analyses:{'4h':{trend:'BULLISH'},'1h':{trend:'BULLISH'},'15m':{trend:'BULLISH'},'5m':{trend:'BULLISH'}}},
    candles:[{closed:true},{closed:false}],
    live:true,now:123
  });
  assert.match(out.caption,/HH → HL → HH → HL/);
  assert.match(out.caption,/HH höheres Hoch/);
  assert.match(out.caption,/Support 95\.000 · Resistance 110\.00/);
  assert.match(out.caption,/BULLISH ALIGNMENT/);
  assert.match(out.caption,/Laufende Kerze zählt NICHT/);
  assert.equal(out.lastPivot.label,'HL');
  assert.equal(out.researchOnly,true);
  assert.ok(out.caption.length<=1024);
});

test('bearish structure explains LH and LL without inventing missing pattern',()=>{
  const out=buildChartIntelligence({
    symbol:'ETHUSDT',interval:'1h',
    analysis:{trend:'BEARISH',classifiedPivots:[
      {kind:'H',price:2100,label:'LH'},{kind:'L',price:2000,label:'LL'}
    ],support:2000,resistance:2100,ema20:2020,ema50:2060},
    dashboard:{flow:'SELL',pressureScore:72},
    mtf:{analyses:{}},candles:[{closed:true}],live:false
  });
  assert.match(out.caption,/LH → LL/);
  assert.match(out.caption,/tiefere Hochs \+ tiefere Tiefs/);
  assert.match(out.caption,/kein aktiver Break\/Retest/);
  assert.match(out.caption,/EMA20 < EMA50/);
});

test('caption remains finite and safe with sparse inputs',()=>{
  const out=buildChartIntelligence({symbol:'SOLUSDT',analysis:{classifiedPivots:[]},candles:[]});
  assert.ok(out.caption.length<=1024);
  assert.match(out.caption,/noch nicht genug Swings/);
});
