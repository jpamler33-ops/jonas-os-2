import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { appendFile, mkdtemp } from 'node:fs/promises';

import {
  createResearchFeatureSnapshot,
  openResearchDataPlane,
  appendResearchDataPlane,
  researchFeaturesAsOf,
  researchDataPlaneSummary
} from './research-data-plane.mjs';

async function plane(opts={}){
  const dir=await mkdtemp(path.join(os.tmpdir(),'tcx-rdp-'));
  const file=path.join(dir,'plane.jsonl');
  return openResearchDataPlane(file,{warnBytes:1024*1024,hardBytes:2*1024*1024,...opts});
}

function snap({
  streamKey='ETHUSDT',
  domain='ONCHAIN',
  source='ETHEREUM_PUBLIC_RPC',
  sourceEventId,
  eventTime=1_000_000,
  availableAt=1_001_000,
  ingestedAt=1_001_100,
  ttlMs=60_000,
  finality='OBSERVED',
  completeness=1,
  features=[{id:'research.onchain.eth.baseFeeGwei',value:2}]
}={}){
  return createResearchFeatureSnapshot({
    streamKey,domain,source,sourceVersion:'V1',sourceEventId,
    eventTime,availableAt,ingestedAt,ttlMs,finality,
    quality:{completeness,sourceCount:1,expectedSourceCount:1,status:'OK'},
    features,
    provenance:{provider:'TEST'}
  });
}

test('data plane appends, deduplicates and reopens a verified hash chain',async()=>{
  const p=await plane();
  const input=snap({sourceEventId:'block-100'});
  const first=await appendResearchDataPlane(p,[input]);
  assert.equal(first.appended.length,1);
  const second=await appendResearchDataPlane(p,[input]);
  assert.equal(second.appended.length,0);
  assert.equal(second.duplicates,1);

  const reopened=await openResearchDataPlane(p.filePath,{warnBytes:1024*1024,hardBytes:2*1024*1024});
  assert.equal(reopened.healthy,true);
  assert.equal(reopened.seq,1);
  assert.equal(reopened.totalRecords,1);
  assert.equal(reopened.tailHash,p.tailHash);
});

test('as-of query blocks future knowledge and expired observations',async()=>{
  const p=await plane();
  await appendResearchDataPlane(p,[
    snap({
      sourceEventId:'old',
      eventTime:1_000_000,
      availableAt:1_001_000,
      ttlMs:20_000,
      features:[{id:'research.x',value:1}]
    }),
    snap({
      sourceEventId:'future',
      eventTime:1_030_000,
      availableAt:1_031_000,
      ttlMs:20_000,
      features:[{id:'research.x',value:2}]
    })
  ]);

  const beforeFuture=researchFeaturesAsOf(p,{streamKey:'ETHUSDT',asOf:1_015_000});
  assert.equal(beforeFuture.features.length,1);
  assert.equal(beforeFuture.features[0].value,1);

  const expiredGap=researchFeaturesAsOf(p,{streamKey:'ETHUSDT',asOf:1_025_000});
  assert.equal(expiredGap.features.length,0);

  const afterFuture=researchFeaturesAsOf(p,{streamKey:'ETHUSDT',asOf:1_035_000});
  assert.equal(afterFuture.features.length,1);
  assert.equal(afterFuture.features[0].value,2);
});

test('latest eligible feature wins while preserving finality and plane lineage',async()=>{
  const p=await plane();
  await appendResearchDataPlane(p,[
    snap({
      sourceEventId:'b100',
      availableAt:1_001_000,
      ttlMs:100_000,
      finality:'FINALIZED',
      features:[{id:'research.entityflow.eth.netExternal5m',value:3}]
    }),
    snap({
      sourceEventId:'b101',
      eventTime:1_010_000,
      availableAt:1_011_000,
      ttlMs:100_000,
      finality:'FINALIZED',
      features:[{id:'research.entityflow.eth.netExternal5m',value:7}]
    })
  ]);
  const q=researchFeaturesAsOf(p,{streamKey:'ETHUSDT',asOf:1_012_000});
  assert.equal(q.features.length,1);
  assert.equal(q.features[0].value,7);
  assert.equal(q.features[0].finality,'FINALIZED');
  assert.ok(/^[a-f0-9]{64}$/.test(q.features[0].planeRecordHash));
  assert.equal(q.features[0].planeSeq,2);
});

test('minimum completeness gate excludes weak source snapshots',async()=>{
  const p=await plane();
  await appendResearchDataPlane(p,[
    snap({
      domain:'DERIVATIVES',
      source:'BINANCE_ONLY',
      sourceEventId:'d1',
      completeness:.5,
      features:[{id:'research.derivatives.fundingRate',value:.0001}]
    })
  ]);
  assert.equal(researchFeaturesAsOf(p,{streamKey:'ETHUSDT',asOf:1_010_000,minCompleteness:.75}).features.length,0);
  assert.equal(researchFeaturesAsOf(p,{streamKey:'ETHUSDT',asOf:1_010_000,minCompleteness:.5}).features.length,1);
});

test('snapshot contract rejects future event-time and invalid completeness',()=>{
  assert.throws(()=>snap({eventTime:1_020_000,availableAt:1_001_000}),/eventTime/);
  assert.throws(()=>createResearchFeatureSnapshot({
    streamKey:'ETHUSDT',
    domain:'TEST',
    source:'TEST',
    eventTime:1,
    availableAt:1,
    ingestedAt:1,
    quality:{completeness:1.2},
    features:[{id:'x',value:1}]
  }),/completeness/);
});

test('hard capacity limit fails closed before writing beyond budget',async()=>{
  const p=await plane({warnBytes:4096,hardBytes:8192});
  p.fileBytes=8190;
  await assert.rejects(
    appendResearchDataPlane(p,[snap({sourceEventId:'capacity'})]),
    /RDP_CAPACITY_LIMIT/
  );
  assert.equal(p.capacityState,'WRITE_BLOCKED');
});

test('corrupt persisted record makes the plane unhealthy instead of silently skipping it',async()=>{
  const p=await plane();
  await appendResearchDataPlane(p,[snap({sourceEventId:'good'})]);
  await appendFile(p.filePath,'{"broken":true}\n','utf8');
  const reopened=await openResearchDataPlane(p.filePath);
  assert.equal(reopened.healthy,false);
  assert.match(reopened.error,/RDP_RECORD_INVALID/);
  const summary=researchDataPlaneSummary(reopened);
  assert.equal(summary.healthy,false);
});
