import test from 'node:test';
import assert from 'node:assert/strict';
import {candlePayload,chartRequest,normalizeChartInterval,normalizeChartSymbol} from './biggj-superchart-api.mjs';

test('normalizes chart request inputs',()=>{
  assert.equal(normalizeChartSymbol('btc-usdt'),'BTCUSDT');
  assert.equal(normalizeChartSymbol('../bad'),'BTCUSDT');
  assert.equal(normalizeChartInterval('4h'),'4h');
  assert.equal(normalizeChartInterval('7m'),'1m');
  assert.deepEqual(chartRequest('/market-candles.json?symbol=ETHUSDT&interval=15m'),{symbol:'ETHUSDT',interval:'15m'});
});

test('builds finite point-in-time candle payload',()=>{
  const p=candlePayload([[1000,'10','12','9','11','20'],[2000,'11','13','10','12','30']],{symbol:'BTCUSDT',interval:'1m',observedAt:3000,source:'TEST'});
  assert.equal(p.symbol,'BTCUSDT');
  assert.equal(p.observedAt,3000);
  assert.equal(p.candles.length,2);
  assert.deepEqual(p.candles[1],{t:2000,o:11,h:13,l:10,c:12,v:30});
});

test('rejects malformed impossible candles',()=>{
  const p=candlePayload([[1,10,9,11,10,1],[2,'x',12,9,10,1],[3,10,12,9,11,2]],{});
  assert.equal(p.candles.length,1);
  assert.equal(p.candles[0].t,3);
});
