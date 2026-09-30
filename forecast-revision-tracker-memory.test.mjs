import test from 'node:test';
import assert from 'node:assert/strict';
import { ForecastRevisionTracker } from './forecast-runtime/forecast/revision_tracker.js';

function input(i){
  return {
    symbol:'BTCUSDT',
    asOf:1000+i*1000,
    price:100+i,
    regimeId:'TEST',
    features:{x:1},
    dataQuality:1
  };
}
function report(i){
  return {
    forecast:{
      symbol:'BTCUSDT',
      asOf:1000+i*1000,
      forecasts:[{horizonMs:300_000}]
    },
    regimeTransition:{status:'STABLE'}
  };
}

test('revision tracker keeps memory bounded',()=>{
  const t=new ForecastRevisionTracker({maxRecords:100});
  for(let i=0;i<180;i++) t.issue(input(i),report(i));
  assert.equal(t.all().length,100);
  assert.ok(t.get('BTCUSDT:'+(1000+179000)));
});

test('restore also enforces memory bound',()=>{
  const records=Array.from({length:150},(_,i)=>({
    id:'BTCUSDT:'+(1000+i),
    symbol:'BTCUSDT',
    issuedAt:1000+i,
    expiresAt:2000+i,
    issuePrice:100,
    issueRegimeId:'TEST',
    report:{symbol:'BTCUSDT',asOf:1000+i,forecasts:[]},
    transitionAtIssue:{},
    issueState:{},
    revisions:[],
    status:'EXPIRED'
  }));
  const t=new ForecastRevisionTracker({maxRecords:100});
  t.restore({version:1,records});
  assert.equal(t.all().length,100);
});


test('lightweight state index does not clone heavy forecast payloads',()=>{
  const t=new ForecastRevisionTracker({maxRecords:100});
  t.issue(input(0),report(0));
  const id='BTCUSDT:1000';
  t.bindThesis(id,{
    version:'TEST_THESIS',
    issueGraphFingerprint:'g1',
    nested:{large:'x'.repeat(1000)},
    fingerprint:'f1'
  });

  const index=t.stateIndex();
  assert.equal(index.length,1);
  assert.deepEqual(index[0],{
    id,
    status:'ACTIVE',
    revisionCount:0,
    symbol:'BTCUSDT',
    issuedAt:1000,
    expiresAt:301000,
    hasThesisMemory:true
  });
  assert.equal('report' in index[0],false);
  assert.equal('issueState' in index[0],false);
  assert.equal('thesisMemory' in index[0],false);
});

test('thesis memory snapshot clones only thesis memory and remains mutation-safe',()=>{
  const t=new ForecastRevisionTracker({maxRecords:100});
  t.issue(input(0),report(0));
  const id='BTCUSDT:1000';
  t.bindThesis(id,{
    version:'TEST_THESIS',
    issueGraphFingerprint:'g1',
    nested:{value:7},
    fingerprint:'f1'
  });

  const rows=t.thesisMemories();
  assert.equal(rows.length,1);
  assert.equal(rows[0].nested.value,7);
  rows[0].nested.value=99;
  assert.equal(t.get(id).thesisMemory.nested.value,7);
});
