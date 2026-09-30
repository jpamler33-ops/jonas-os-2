import test from 'node:test';
import assert from 'node:assert/strict';
import { buildForecastScienceInputs, FORECAST_RUNTIME_SCIENCE_PROFILE } from './forecast-science-adapter.mjs';

function engine(rows){
  return {historySnapshot:(asOf)=>rows.filter(r=>r.timestamp<=asOf&&r.availableAt<=asOf)};
}
function history(n=80){
  return Array.from({length:n},(_,i)=>({
    id:'r'+i,symbol:'BTCUSDT',timestamp:100+i,availableAt:110+i,resolvedAt:120+i,
    horizonMs:300000,features:{x:i/10,y:(i%7)/7},forwardReturn:(i%5-2)/100
  }));
}
function witnesses(){
  return {
    primary:{source:'BINANCE',venue:'BINANCE_SPOT',publishedAt:900,availableAt:910,provenance:'direct'},
    witnesses:[
      {source:'OKX',venue:'OKX_SPOT',publishedAt:905,availableAt:915,provenance:'direct'},
      {source:'KRAKEN',venue:'KRAKEN_SPOT',publishedAt:906,availableAt:916,provenance:'direct'}
    ]
  };
}

test('adapter builds PIT science rows from matured forecast history',()=>{
  const r=buildForecastScienceInputs({engine:engine(history()),asOf:1000,symbol:'BTCUSDT',witnessReport:witnesses()});
  assert.equal(r.historyRows,80);
  assert.equal(r.inputs.CONCEPT_STABILITY.length,80);
  assert.equal(r.inputs.TEMPORAL_RECENCY.length,80);
  assert.equal(r.inputs.EMPIRICAL_SUPPORT.length,160);
  assert.equal(r.inputs.EVIDENCE_LINEAGE_INDEPENDENCE.length,3);
  assert.equal(r.canExecute,false);
});

test('future unresolved history is excluded',()=>{
  const rows=history();
  rows.push({id:'future',symbol:'BTCUSDT',timestamp:900,availableAt:900,resolvedAt:2000,horizonMs:300000,features:{x:1,y:1},forwardReturn:1});
  const r=buildForecastScienceInputs({engine:engine(rows),asOf:1000,symbol:'BTCUSDT'});
  assert.equal(r.historyRows,80);
});

test('runtime science profile separates deployment admission from promotion-only guards',()=>{
  assert.equal(FORECAST_RUNTIME_SCIENCE_PROFILE.EMPIRICAL_SUPPORT.required,true);
  assert.equal(FORECAST_RUNTIME_SCIENCE_PROFILE.CONCEPT_STABILITY.required,true);
  assert.equal(FORECAST_RUNTIME_SCIENCE_PROFILE.TEMPORAL_RECENCY.required,true);
  assert.equal(FORECAST_RUNTIME_SCIENCE_PROFILE.EVIDENCE_LINEAGE_INDEPENDENCE.required,true);
  assert.equal(FORECAST_RUNTIME_SCIENCE_PROFILE.RESEARCH_INTEGRITY.required,false);
  assert.equal(FORECAST_RUNTIME_SCIENCE_PROFILE.SPECIFICATION_MULTIVERSE.required,false);
  assert.equal(FORECAST_RUNTIME_SCIENCE_PROFILE.TRANSPORTABILITY.required,false);
});

test('current witness lineage requires actual distinct current venue rows',()=>{
  const w=witnesses();
  w.witnesses[1].availableAt=2000;
  const r=buildForecastScienceInputs({engine:engine(history()),asOf:1000,symbol:'BTCUSDT',witnessReport:w});
  assert.equal(r.inputs.EVIDENCE_LINEAGE_INDEPENDENCE.length,2);
});


test('empirical rows keep feature-specific ids while sharing forecast sample identity',()=>{
  const r=buildForecastScienceInputs({engine:engine(history(2)),asOf:1000,symbol:'BTCUSDT'});
  const xs=r.inputs.EMPIRICAL_SUPPORT.filter(x=>x.sampleId==='r0');
  assert.equal(xs.length,2);
  assert.equal(new Set(xs.map(x=>x.id)).size,2);
  assert.deepEqual(new Set(xs.map(x=>x.sampleId)),new Set(['r0']));
});

test('cold-start diagnostics are explicit and do not throw',()=>{
  const r=buildForecastScienceInputs({engine:engine([]),asOf:1000,symbol:'BTCUSDT',witnessReport:witnesses()});
  assert.equal(r.historyRows,0);
  assert.equal(r.diagnostics.coldStart,true);
  assert.equal(r.inputs.EMPIRICAL_SUPPORT.length,0);
  assert.equal(r.canExecute,false);
});
