import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { openMarketDataFabric, appendMarketEvents, createMarketEventInput, verifyMarketEventChain } from './market-data-fabric.mjs';
import { reconstructCandles, reconstructInstitutionalState, verifyNoFutureLeakage, compareReplayStates } from './deterministic-replay.mjs';

function input({kind='PRIMARY_MARKET',streamKey='PRIMARY:BTCUSDT',source='TEST',sourceEventId='1',eventTime=1000,availableAt=1100,ingestedAt=1100,payload={x:1}}={}){
  return createMarketEventInput({kind,streamKey,source,sourceEventId,eventTime,availableAt,ingestedAt,payload});
}

test('market data fabric appends fsynced hash-chained events and verifies',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'tcx-fabric-'));
  const file=path.join(dir,'events.jsonl');
  const fabric=await openMarketDataFabric(file);
  const r=await appendMarketEvents(fabric,[input(),input({sourceEventId:'2',eventTime:1200,availableAt:1300,ingestedAt:1300,payload:{x:2}})]);
  assert.equal(r.appended.length,2);
  assert.equal(fabric.seq,2);
  assert.equal(verifyMarketEventChain(fabric.events).ok,true);
  const reopened=await openMarketDataFabric(file);
  assert.equal(reopened.healthy,true);
  assert.equal(reopened.seq,2);
});

test('exact duplicate event is deduplicated without changing chain',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'tcx-fabric-'));
  const file=path.join(dir,'events.jsonl');
  const fabric=await openMarketDataFabric(file);
  await appendMarketEvents(fabric,[input()]);
  const r=await appendMarketEvents(fabric,[input()]);
  assert.equal(r.appended.length,0);
  assert.equal(r.duplicates,1);
  assert.equal(fabric.seq,1);
});

test('tampering with fabric payload fails verification',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'tcx-fabric-'));
  const file=path.join(dir,'events.jsonl');
  const fabric=await openMarketDataFabric(file);
  await appendMarketEvents(fabric,[input()]);
  const rows=(await readFile(file,'utf8')).trim().split('\n').map(JSON.parse);
  rows[0].payload.x=999;
  await writeFile(file,rows.map(JSON.stringify).join('\n')+'\n');
  const reopened=await openMarketDataFabric(file);
  assert.equal(reopened.healthy,false);
});

test('backfilled candle is invisible before its actual ingestion availableAt',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'tcx-fabric-'));
  const file=path.join(dir,'events.jsonl');
  const fabric=await openMarketDataFabric(file);
  await appendMarketEvents(fabric,[input({
    kind:'CANDLE_CLOSE',
    streamKey:'CANDLE:BTCUSDT:5m',
    sourceEventId:'BTCUSDT:5m:1000',
    eventTime:1000,
    availableAt:5000,
    ingestedAt:5000,
    payload:{openTime:700,closeTime:1000,o:99,h:101,l:98,c:100,v:10,closed:true}
  })]);
  assert.equal(reconstructCandles(fabric.events,{symbol:'BTCUSDT',interval:'5m',asOf:4999}).length,0);
  assert.equal(reconstructCandles(fabric.events,{symbol:'BTCUSDT',interval:'5m',asOf:5000}).length,1);
});

test('replay chooses latest correction only when correction was available',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'tcx-fabric-'));
  const file=path.join(dir,'events.jsonl');
  const fabric=await openMarketDataFabric(file);
  await appendMarketEvents(fabric,[
    input({kind:'CANDLE_CLOSE',streamKey:'CANDLE:BTCUSDT:5m',sourceEventId:'bar1',eventTime:1000,availableAt:1100,ingestedAt:1100,payload:{c:100,closed:true}}),
    input({kind:'CANDLE_CLOSE',streamKey:'CANDLE:BTCUSDT:5m',sourceEventId:'bar1',eventTime:1000,availableAt:2100,ingestedAt:2100,payload:{c:101,closed:true}})
  ]);
  assert.equal(reconstructCandles(fabric.events,{symbol:'BTCUSDT',interval:'5m',asOf:1500})[0].c,100);
  assert.equal(reconstructCandles(fabric.events,{symbol:'BTCUSDT',interval:'5m',asOf:2500})[0].c,101);
});

test('institutional replay is deterministic and future-leak free',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'tcx-fabric-'));
  const file=path.join(dir,'events.jsonl');
  const fabric=await openMarketDataFabric(file);
  await appendMarketEvents(fabric,[
    input({kind:'PRIMARY_MARKET',streamKey:'PRIMARY:BTCUSDT',sourceEventId:'p1',eventTime:1000,availableAt:1100,ingestedAt:1100,payload:{availableAt:1100,price:100}}),
    input({kind:'WITNESS_CONSENSUS',streamKey:'WITNESS:BTCUSDT',sourceEventId:'w1',eventTime:1000,availableAt:1150,ingestedAt:1150,payload:{agreementScore:0.8}}),
    input({kind:'CANDLE_CLOSE',streamKey:'CANDLE:BTCUSDT:5m',sourceEventId:'bar1',eventTime:900,availableAt:1200,ingestedAt:1200,payload:{c:100,closed:true}}),
    input({kind:'PRIMARY_MARKET',streamKey:'PRIMARY:BTCUSDT',sourceEventId:'future',eventTime:2000,availableAt:5000,ingestedAt:5000,payload:{availableAt:5000,price:999}})
  ]);
  const a=reconstructInstitutionalState(fabric.events,{symbol:'BTCUSDT',asOf:1300});
  const b=reconstructInstitutionalState(fabric.events,{symbol:'BTCUSDT',asOf:1300});
  assert.equal(a.primary.price,100);
  assert.equal(a.candles['5m'].length,1);
  assert.equal(verifyNoFutureLeakage(a).ok,true);
  assert.equal(compareReplayStates(a,b).identical,true);
});
