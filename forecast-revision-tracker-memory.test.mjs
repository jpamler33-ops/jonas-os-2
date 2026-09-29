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
