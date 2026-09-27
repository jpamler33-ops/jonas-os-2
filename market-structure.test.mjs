import test from 'node:test';
import assert from 'node:assert/strict';
import { candleFromKline, candlesFromKlines, closedCandles, analyzeStructure, breakRetestState } from './market-structure.mjs';

function row(t,o,h,l,c,closeTime=t+59999){ return [t,String(o),String(h),String(l),String(c),'10',closeTime,'0']; }

test('PIT firewall excludes active/future-close candle from structure',()=>{
  const asOf=1_000_000;
  const rows=[];
  for(let i=0;i<30;i++) rows.push(row(i*60_000,100+i,101+i,99+i,100.5+i,i*60_000+59_999));
  rows.push(row(30*60_000,500,600,400,550,asOf+60_000));
  const candles=candlesFromKlines(rows,asOf);
  assert.equal(candles.at(-1).closed,false);
  assert.equal(closedCandles(candles).length,16);
  const a=analyzeStructure(candles);
  assert.notEqual(a.lastClose,550);
});

test('classifies a bullish swing structure',()=>{
  const asOf=10_000_000;
  const closes=[10,11,13,11,12,14,12,13,15,13,14,16,14,15,17];
  const candles=closes.map((c,i)=>candleFromKline(row(i*60_000,c-0.2,c+0.6,c-0.6,c,i*60_000+59_999),asOf));
  const a=analyzeStructure(candles,{window:1});
  assert.equal(a.trend,'BULLISH');
  assert.ok(a.classifiedPivots.some(p=>p.label==='HH'));
  assert.ok(a.classifiedPivots.some(p=>p.label==='HL'));
});

test('detects break and retest only on closed candles',()=>{
  const asOf=100_000_000;
  const xs=[];
  for(let i=0;i<22;i++) xs.push(candleFromKline(row(i*60_000,100,101,99,100,i*60_000+59_999),asOf));
  xs.push(candleFromKline(row(22*60_000,100,103,100,102,22*60_000+59_999),asOf));
  xs.push(candleFromKline(row(23*60_000,102,102.2,100.8,101.5,23*60_000+59_999),asOf));
  xs.push(candleFromKline(row(24*60_000,101.5,103,101.4,102.5,24*60_000+59_999),asOf));
  const p=breakRetestState(xs,'LONG',{lookback:16,searchBars:6});
  assert.equal(p?.stage,'BREAK_RETEST_CONFIRMED');
});

test('multi-timeframe bias is derived from closed swing trends only', async () => {
  const asOf=20_000_000;
  const makeBull=()=>{
    const closes=[10,11,12,14,12,11,12,13,15,13,12,13,14,16,14,13,14,15,17,15,14,15,16];
    return closes.map((c,i)=>candleFromKline(row(i*60_000,c-0.2,c+0.5,c-0.5,c,i*60_000+59_999),asOf));
  };
  const { analyzeMultiTimeframe } = await import('./market-structure.mjs');
  const r=analyzeMultiTimeframe({'4h':makeBull(),'1h':makeBull(),'15m':makeBull(),'5m':makeBull()});
  assert.equal(r.bias,'BULLISH');
  assert.equal(r.biasScore,6);
});
