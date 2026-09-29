import test from 'node:test';import assert from 'node:assert/strict';
import {reconstructHistoricalEventReactions,learnHistoricalMoveDrivers,historicalAnalogueEvidence} from './historical-event-reaction-learning.mjs';
test('learns large moves and quiet counterexamples without future leakage',()=>{
 const t=2_000_000,events=[{id:'e1',eventType:'TARIFF',availableAt:1_000_000,assets:['BTC'],regime:'RISK_OFF',sourceQuality:.9,novelty:.8},{id:'future',eventType:'TARIFF',availableAt:3_000_000,assets:['BTC']}];
 const prices=[{asset:'BTC',timestamp:1_000_000,price:100},{asset:'BTC',timestamp:1_300_000,price:110},{asset:'BTC',timestamp:1_900_000,price:102}];
 const rows=reconstructHistoricalEventReactions(events,prices,{asOf:t,horizons:[300000]});
 assert.equal(rows.length,1);assert.equal(rows[0].eventId,'e1');assert.ok(rows[0].returnPct>.09);
 const model=learnHistoricalMoveDrivers(rows,{minSamples:1,largeMoveQuantile:.8});
 const ev=historicalAnalogueEvidence(model,{asset:'BTC',eventType:'TARIFF',horizonMs:300000,regime:'RISK_OFF'});
 assert.equal(ev.status,'LEARNED');assert.equal(ev.samples,1);assert.ok(ev.historicalSupport>0);
});
test('keeps quiet cases as counterevidence',()=>{
 const rows=[1,.01,.02,.03,.04,.05,.06,.07].map((r,i)=>({asset:'ETH',eventType:'IPO',horizonMs:3600000,regime:'ANY',returnPct:r/100,id:String(i)}));
 const m=learnHistoricalMoveDrivers(rows,{minSamples:1,largeMoveQuantile:.8});assert.ok(m.cohorts[0].quietCounterexamples>0);assert.ok(m.cohorts[0].largeMoveRate<1);
});