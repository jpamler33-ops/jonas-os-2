import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { appendFile, mkdtemp } from 'node:fs/promises';

import {
  createResearchFeatureSnapshot,
  openResearchDataPlane,
  appendResearchDataPlane,
  preflightResearchDataPlaneInputs,
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
  ingestedAt=null,
  ttlMs=60_000,
  finality='OBSERVED',
  completeness=1,
  features=[{id:'research.onchain.eth.baseFeeGwei',value:2}]
}={}){
  return createResearchFeatureSnapshot({
    streamKey,domain,source,sourceVersion:'V1',sourceEventId,
    eventTime,availableAt,ingestedAt:ingestedAt??availableAt+100,ttlMs,finality,
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
  p.fileBytes=p.hardBytes-10;
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


test('governed quarantine decisions are excluded and current source blocks are respected',async()=>{
  const p=await plane();
  const acceptedBase=snap({
    sourceEventId:'gov-accept',
    features:[{id:'research.x',value:1}]
  });
  const quarantinedBase=snap({
    sourceEventId:'gov-quarantine',
    eventTime:1_010_000,
    availableAt:1_011_000,
    features:[{id:'research.y',value:2}]
  });
  const accepted=Object.freeze({...acceptedBase,governance:Object.freeze({
    version:'TCX_RESEARCH_DATA_GOVERNANCE_V1',
    decision:'ACCEPT',
    sourceKey:'ONCHAIN:ETHEREUM_PUBLIC_RPC',
    sourceStatus:'HEALTHY',
    canExecute:false
  })});
  const quarantined=Object.freeze({...quarantinedBase,governance:Object.freeze({
    version:'TCX_RESEARCH_DATA_GOVERNANCE_V1',
    decision:'QUARANTINE',
    sourceKey:'ONCHAIN:ETHEREUM_PUBLIC_RPC',
    sourceStatus:'QUARANTINED',
    canExecute:false
  })});
  await appendResearchDataPlane(p,[accepted,quarantined]);

  const normal=researchFeaturesAsOf(p,{streamKey:'ETHUSDT',asOf:1_015_000,requireGoverned:true});
  assert.equal(normal.features.length,1);
  assert.equal(normal.features[0].id,'research.x');
  assert.equal(normal.features[0].governanceDecision,'ACCEPT');

  const blocked=researchFeaturesAsOf(p,{
    streamKey:'ETHUSDT',
    asOf:1_015_000,
    requireGoverned:true,
    blockedSourceKeys:['ONCHAIN:ETHEREUM_PUBLIC_RPC']
  });
  assert.equal(blocked.features.length,0);
});


test('explicit unusable governance is excluded even when decision is degraded',async()=>{
  const p=await plane();
  const base=snap({
    sourceEventId:'gov-degraded-unusable',
    features:[{id:'research.z',value:3}]
  });
  const governed=Object.freeze({...base,governance:Object.freeze({
    version:'TCX_RESEARCH_DATA_GOVERNANCE_V1',
    decision:'DEGRADED',
    sourceKey:'ONCHAIN:ETHEREUM_PUBLIC_RPC',
    sourceStatus:'DEGRADED',
    usableForResearch:false,
    canExecute:false
  })});
  await appendResearchDataPlane(p,[governed]);
  const q=researchFeaturesAsOf(p,{streamKey:'ETHUSDT',asOf:1_015_000,requireGoverned:true});
  assert.equal(q.features.length,0);
});


test('same upstream source event with reevaluated governance deduplicates instead of conflicting',async()=>{
  const p=await plane();
  const base=snap({sourceEventId:'same-event-governance'});
  const first=Object.freeze({...base,governance:Object.freeze({
    version:'TCX_RESEARCH_DATA_GOVERNANCE_V1',
    evaluatedAt:1_001_200,
    decision:'ACCEPT',
    sourceKey:'ONCHAIN:ETHEREUM_PUBLIC_RPC',
    sourceStatus:'HEALTHY',
    usableForResearch:true,
    canExecute:false
  })});
  const second=Object.freeze({...base,governance:Object.freeze({
    version:'TCX_RESEARCH_DATA_GOVERNANCE_V1',
    evaluatedAt:1_001_500,
    decision:'DEGRADED',
    sourceKey:'ONCHAIN:ETHEREUM_PUBLIC_RPC',
    sourceStatus:'DEGRADED',
    usableForResearch:true,
    reasons:[{code:'SEMANTIC_DISTRIBUTION_SHIFT_REVIEW'}],
    canExecute:false
  })});
  const a=await appendResearchDataPlane(p,[first]);
  assert.equal(a.appended.length,1);
  const b=await appendResearchDataPlane(p,[second]);
  assert.equal(b.appended.length,0);
  assert.equal(b.duplicates,1);
  assert.equal(p.seq,1);
});

test('same source event id with changed upstream features still fails closed',async()=>{
  const p=await plane();
  await appendResearchDataPlane(p,[snap({
    sourceEventId:'conflicting-source-event',
    features:[{id:'research.onchain.eth.baseFeeGwei',value:2}]
  })]);
  await assert.rejects(
    appendResearchDataPlane(p,[snap({
      sourceEventId:'conflicting-source-event',
      features:[{id:'research.onchain.eth.baseFeeGwei',value:3}]
    })]),
    /SOURCE_EVENT_ID_CONFLICT:conflicting-source-event/
  );
  assert.equal(p.seq,1);
});


test('source event identity survives in-memory record eviction',async()=>{
  const p=await plane();
  const original=snap({
    sourceEventId:'evicted-source-event',
    features:[{id:'research.onchain.eth.baseFeeGwei',value:2}]
  });
  await appendResearchDataPlane(p,[original]);

  // Simulate the hot record ring no longer retaining the original record.
  p.records.length=0;
  p.dedupe.clear();

  const duplicate=await appendResearchDataPlane(p,[original]);
  assert.equal(duplicate.appended.length,0);
  assert.equal(duplicate.duplicates,1);

  await assert.rejects(
    appendResearchDataPlane(p,[snap({
      sourceEventId:'evicted-source-event',
      features:[{id:'research.onchain.eth.baseFeeGwei',value:4}]
    })]),
    /SOURCE_EVENT_ID_CONFLICT:evicted-source-event/
  );
  assert.equal(p.seq,1);
});


test('source-event preflight removes cached duplicates before governance without weakening conflicts',async()=>{
  const p=await plane();
  const original=snap({
    sourceEventId:'cached-source-event',
    availableAt:1_001_000,
    ingestedAt:1_001_100
  });
  await appendResearchDataPlane(p,[original]);

  // A later capture of the same cached upstream event has a newer local
  // ingestedAt, but the upstream event identity/payload is unchanged.
  const cachedAgain=Object.freeze({...original,ingestedAt:1_090_000});
  const duplicate=preflightResearchDataPlaneInputs(p,[cachedAgain]);
  assert.equal(duplicate.duplicates,1);
  assert.equal(duplicate.novel.length,0);

  const changed=snap({
    sourceEventId:'cached-source-event',
    availableAt:1_001_000,
    ingestedAt:1_090_000,
    features:[{id:'research.onchain.eth.baseFeeGwei',value:9}]
  });
  assert.throws(
    ()=>preflightResearchDataPlaneInputs(p,[changed]),
    /SOURCE_EVENT_ID_CONFLICT:cached-source-event/
  );
  assert.equal(p.seq,1);
});

test('source-event preflight deduplicates repeated events inside one capture batch',async()=>{
  const p=await plane();
  const input=snap({sourceEventId:'batch-duplicate'});
  const result=preflightResearchDataPlaneInputs(p,[input,input]);
  assert.equal(result.novel.length,1);
  assert.equal(result.duplicates,1);
});


test('preflight conflictPolicy SKIP preserves first immutable source event and continues batch',async()=>{
  const p=await plane();
  const original=snap({sourceEventId:'immutable-event',features:[{id:'research.x',value:1}]});
  await appendResearchDataPlane(p,[original]);
  const conflict=snap({sourceEventId:'immutable-event',features:[{id:'research.x',value:9}]});
  const novel=snap({sourceEventId:'next-event',features:[{id:'research.x',value:2}]});
  const result=preflightResearchDataPlaneInputs(p,[conflict,novel],{conflictPolicy:'SKIP'});
  assert.equal(result.conflicts.length,1);
  assert.equal(result.conflicts[0].sourceEventId,'immutable-event');
  assert.equal(result.novel.length,1);
  assert.equal(result.novel[0].sourceEventId,'next-event');
  assert.equal(p.seq,1);
});

test('preflight still throws on source-event conflict by default',async()=>{
  const p=await plane();
  const original=snap({sourceEventId:'strict-event',features:[{id:'research.x',value:1}]});
  await appendResearchDataPlane(p,[original]);
  const conflict=snap({sourceEventId:'strict-event',features:[{id:'research.x',value:3}]});
  assert.throws(()=>preflightResearchDataPlaneInputs(p,[conflict]),/SOURCE_EVENT_ID_CONFLICT:strict-event/);
});
