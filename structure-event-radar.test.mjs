import test from 'node:test';
import assert from 'node:assert/strict';
import {deriveStructureEvents,buildStructureEventRadar} from './structure-event-radar.mjs';

function candles(n){
  return Array.from({length:n},(_,i)=>({openTime:i+1,closed:true,c:100}));
}

test('detects new swing and broken HL from closed structure',()=>{
  const analysis={
    lastClose:94,
    classifiedPivots:[
      {i:6,openTime:7,kind:'H',label:'HH',price:110},
      {i:8,openTime:9,kind:'L',label:'HL',price:95}
    ]
  };
  const events=deriveStructureEvents({timeframe:'5m',analysis,candles:candles(10)});
  assert.ok(events.some(x=>x.type==='NEW_HL'));
  assert.ok(events.some(x=>x.type==='HL_BROKEN'));
});

test('detects BOS and retest from confirmed pattern',()=>{
  const bos=deriveStructureEvents({
    timeframe:'15m',
    candles:candles(20),
    analysis:{lastClose:120,classifiedPivots:[],pattern:{side:'LONG',stage:'BREAK_CLOSE',level:115,breakIndex:19}}
  });
  assert.ok(bos.some(x=>x.type==='BOS_UP'));
  const rt=deriveStructureEvents({
    timeframe:'1h',
    candles:candles(20),
    analysis:{lastClose:110,classifiedPivots:[],pattern:{side:'SHORT',stage:'BREAK_RETEST_CONFIRMED',level:112,breakIndex:15,retestIndex:18}}
  });
  assert.ok(rt.some(x=>x.type==='RETEST_DOWN'));
});

test('radar creates deterministic structure event key',()=>{
  const r=buildStructureEventRadar({
    symbol:'BTCUSDT',
    analyses:{'5m':{lastClose:94,classifiedPivots:[{i:8,openTime:9,kind:'L',label:'HL',price:95}]}},
    candlesByTf:{'5m':candles(10)}
  });
  assert.match(r.text,/STRUCTURE EVENT RADAR/);
  assert.match(r.text,/HL BROKEN/);
  assert.notEqual(r.structureEventKey,'NONE');
});
