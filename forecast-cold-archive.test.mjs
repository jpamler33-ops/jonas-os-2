import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, writeFile } from 'node:fs/promises';
import {
  archiveForecastColdBatch,
  verifyForecastColdSegment,
  forecastColdArchiveSummary,
  planForecastHotCompaction,
  applyForecastHotCompaction
} from './forecast-cold-archive.mjs';

test('cold archive writes immutable verified gzip segment and deduplicates exact replay',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'tcx-cold-'));
  const issuances=[
    {issuanceId:'i1',generatedAt:1000,symbol:'BTCUSDT',payload:'x'.repeat(1000)},
    {issuanceId:'i2',generatedAt:2000,symbol:'ETHUSDT',payload:'y'.repeat(1000)}
  ];
  const trackerRecords=[
    {id:'f1',issuedAt:1000,expiresAt:2000,status:'EXPIRED',revisions:[{at:1500}]}
  ];
  const first=await archiveForecastColdBatch({dir,issuances,trackerRecords,archivedAt:5000});
  assert.equal(first.archived,true);
  assert.equal(first.duplicate,false);
  const verification=await verifyForecastColdSegment(dir,first.segment);
  assert.equal(verification.ok,true);

  const replay=await archiveForecastColdBatch({dir,issuances,trackerRecords,archivedAt:6000});
  assert.equal(replay.archived,true);
  assert.equal(replay.duplicate,true);
  assert.equal(replay.verified,true);

  await writeFile(path.join(dir,first.segment.name),Buffer.from('corrupt'));
  await assert.rejects(
    ()=>archiveForecastColdBatch({dir,issuances,trackerRecords,archivedAt:7000}),
    /EXISTING_SEGMENT_VERIFY_FAILED|incorrect header check|unexpected end of file/
  );

  const summary=await forecastColdArchiveSummary(dir);
  assert.equal(summary.healthy,true);
  assert.equal(summary.segments,1);
  assert.equal(summary.issuances,2);
  assert.equal(summary.trackerRecords,1);
});

test('hot compaction archives only old non-active rows beyond hot buffer',()=>{
  const now=10*60*60_000;
  const issuances=Array.from({length:260},(_,i)=>({
    issuanceId:'i'+i,
    generatedAt:i*60_000,
    forecast:{forecastId:'f'+i}
  }));
  const trackerRecords=new Map(Array.from({length:260},(_,i)=>[
    'f'+i,
    {
      id:'f'+i,
      issuedAt:i*60_000,
      expiresAt:i*60_000+3*60*60_000,
      status:i===0?'ACTIVE':'EXPIRED'
    }
  ]));
  const runtime={issuances,intelligence:{tracker:{records:trackerRecords}}};
  const plan=planForecastHotCompaction(runtime,{
    now,
    maxHotIssuances:100,
    maxHotTracked:100,
    batchThreshold:50,
    minColdAgeMs:60*60_000
  });
  assert.ok(plan.coldIssuances.length>0);
  assert.ok(plan.coldTrackerRecords.length>0);
  assert.equal(plan.coldTrackerRecords.some(x=>x.id==='f0'),false);

  const applied=applyForecastHotCompaction(runtime,plan);
  assert.equal(applied.removedIssuances,plan.coldIssuances.length);
  assert.equal(applied.removedTrackerRecords,plan.coldTrackerRecords.length);
  assert.ok(runtime.issuances.length>=100);
  assert.ok(runtime.intelligence.tracker.records.has('f0'));
});
