import test from 'node:test';
import assert from 'node:assert/strict';
import { ProbabilisticForecastEngine } from './forecast-runtime/forecast/index.js';

const config={featureIds:['x'],horizons:[{id:'5m',horizonMs:300_000,flatThreshold:.001}]};
const row=i=>({id:`BTC:${i}`,symbol:'BTCUSDT',timestamp:i,availableAt:i,resolvedAt:i+1,horizonMs:300_000,features:{x:i},forwardReturn:0});

test('forecast history retains a bounded rolling window and supports bounded point-in-time copies',()=>{
  const engine=new ProbabilisticForecastEngine(config,{maxHistoryRows:500});
  engine.addHistoryMany(Array.from({length:700},(_,i)=>row(i+1)));
  assert.equal(engine.historySize(),500);
  assert.equal(engine.historySnapshot(Infinity,{limit:3}).length,3);
  assert.deepEqual(engine.historySnapshot(Infinity,{limit:3}).map(x=>x.timestamp),[698,699,700]);
  assert.deepEqual(engine.historySnapshot(699,{limit:3}).map(x=>x.timestamp),[697,698,699]);
  assert.equal(engine.historySnapshot(Infinity,{limit:0}).length,0);
});
