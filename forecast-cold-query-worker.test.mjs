import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { archiveForecastColdBatch } from './forecast-cold-archive.mjs';
import { runForecastColdQueryWorker } from './forecast-cold-query-client.mjs';

test('cold query worker returns bounded verified symbol/time results',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'tcx-cold-query-'));
  await archiveForecastColdBatch({
    dir,
    archivedAt:10_000,
    issuances:[
      {issuanceId:'b1',symbol:'BTCUSDT',generatedAt:1000,forecast:{forecastId:'fb1'}},
      {issuanceId:'e1',symbol:'ETHUSDT',generatedAt:2000,forecast:{forecastId:'fe1'}},
      {issuanceId:'b2',symbol:'BTCUSDT',generatedAt:3000,forecast:{forecastId:'fb2'}}
    ],
    trackerRecords:[
      {id:'fb1',symbol:'BTCUSDT',issuedAt:1000,status:'EXPIRED'},
      {id:'fb2',symbol:'BTCUSDT',issuedAt:3000,status:'EXPIRED'}
    ]
  });

  const result=await runForecastColdQueryWorker({
    dir,
    query:{symbol:'BTCUSDT',fromAt:500,toAt:3500,limit:10}
  },{timeoutMs:20_000,maxOldGenerationSizeMb:96});

  assert.equal(result.scannedSegments,1);
  assert.deepEqual(result.issuances.map(x=>x.issuanceId),['b2','b1']);
  assert.deepEqual(result.trackerRecords.map(x=>x.id),['fb2','fb1']);
  assert.ok(result.verifiedLogicalBytes>0);
});

test('cold query worker enforces result bounds',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'tcx-cold-query-bound-'));
  await archiveForecastColdBatch({
    dir,
    archivedAt:10_000,
    issuances:Array.from({length:20},(_,i)=>({issuanceId:'i'+i,symbol:'BTCUSDT',generatedAt:1000+i}))
  });
  const result=await runForecastColdQueryWorker({
    dir,
    query:{symbol:'BTCUSDT',limit:3,includeTracker:false}
  },{timeoutMs:20_000,maxOldGenerationSizeMb:96});
  assert.equal(result.issuances.length,3);
  assert.equal(result.trackerRecords.length,0);
});
