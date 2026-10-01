import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BIGGJ_MEMORY_GOVERNOR_VERSION,
  memorySnapshot,
  shouldCollectGarbage,
  createMemoryGovernor
} from './biggj-memory-governor.mjs';

test('memory snapshot normalizes byte counters into MB',()=>{
  const x=memorySnapshot({
    heapUsed:320*1024*1024,
    heapTotal:400*1024*1024,
    rss:650*1024*1024,
    external:12*1024*1024,
    arrayBuffers:3*1024*1024
  });
  assert.deepEqual(x,{heapUsedMb:320,heapTotalMb:400,rssMb:650,externalMb:12,arrayBuffersMb:3});
});

test('GC request requires high heap, safe RSS/external and cooldown',()=>{
  const yes=shouldCollectGarbage(
    {heapUsedMb:355,rssMb:650,externalMb:8},
    {triggerHeapMb:330,maxRssMb:880,maxExternalMb:128,cooldownMs:45_000,lastAttemptAt:0,now:100_000}
  );
  assert.equal(yes.shouldCollect,true);

  const rssBlocked=shouldCollectGarbage(
    {heapUsedMb:355,rssMb:900,externalMb:8},
    {triggerHeapMb:330,maxRssMb:880,maxExternalMb:128,cooldownMs:45_000,lastAttemptAt:0,now:100_000}
  );
  assert.equal(rssBlocked.shouldCollect,false);
  assert.equal(rssBlocked.rssSafe,false);

  const cooldownBlocked=shouldCollectGarbage(
    {heapUsedMb:355,rssMb:650,externalMb:8},
    {triggerHeapMb:330,maxRssMb:880,maxExternalMb:128,cooldownMs:45_000,lastAttemptAt:80_000,now:100_000}
  );
  assert.equal(cooldownBlocked.shouldCollect,false);
  assert.equal(cooldownBlocked.cooldownReady,false);
});

test('governor executes bounded GC without deleting state',()=>{
  let calls=0;
  let afterGc=false;
  const memoryUsageFn=()=>({
    heapUsed:(afterGc?300:360)*1024*1024,
    heapTotal:400*1024*1024,
    rss:650*1024*1024,
    external:8*1024*1024,
    arrayBuffers:2*1024*1024
  });
  const governor=createMemoryGovernor({
    gcFn:()=>{calls++;afterGc=true;},
    memoryUsageFn,
    cooldownMs:5_000,
    minReclaimedMb:1
  });
  const first=governor.maybeCollect({
    reason:'TEST',
    triggerHeapMb:330,
    maxRssMb:900,
    maxExternalMb:128,
    now:10_000
  });
  assert.equal(first.attempted,true);
  assert.equal(first.executed,true);
  assert.equal(calls,1);

  const second=governor.maybeCollect({
    reason:'TEST_COOLDOWN',
    triggerHeapMb:330,
    maxRssMb:900,
    maxExternalMb:128,
    now:12_000
  });
  assert.equal(second.executed,false);
  assert.equal(calls,1);

  const summary=governor.summary();
  assert.equal(summary.version,BIGGJ_MEMORY_GOVERNOR_VERSION);
  assert.equal(summary.semantics.doesNotDeleteResearchHistory,true);
  assert.equal(summary.semantics.doesNotRelaxMemoryHardLimits,true);
});

test('governor fails safe when explicit GC is unavailable',()=>{
  const governor=createMemoryGovernor({
    gcFn:null,
    memoryUsageFn:()=>({
      heapUsed:360*1024*1024,
      heapTotal:400*1024*1024,
      rss:650*1024*1024,
      external:8*1024*1024,
      arrayBuffers:2*1024*1024
    }),
    cooldownMs:5_000
  });
  const x=governor.maybeCollect({
    reason:'NO_GC',
    triggerHeapMb:330,
    maxRssMb:900,
    maxExternalMb:128,
    now:10_000
  });
  assert.equal(x.attempted,true);
  assert.equal(x.executed,false);
  assert.equal(x.unavailable,true);
  assert.equal(governor.summary().gcAvailable,false);
});


test('heavy research can bypass cooldown only after a bounded heap overage',()=>{
  const blocked=shouldCollectGarbage(
    {heapUsedMb:345,rssMb:600,externalMb:8},
    {triggerHeapMb:330,maxRssMb:900,maxExternalMb:128,cooldownMs:45_000,cooldownBypassOverageMb:30,lastAttemptAt:90_000,now:100_000}
  );
  assert.equal(blocked.cooldownReady,false);
  assert.equal(blocked.cooldownBypassed,false);
  assert.equal(blocked.shouldCollect,false);

  const bypass=shouldCollectGarbage(
    {heapUsedMb:372,rssMb:600,externalMb:8},
    {triggerHeapMb:330,maxRssMb:900,maxExternalMb:128,cooldownMs:45_000,cooldownBypassOverageMb:30,lastAttemptAt:90_000,now:100_000}
  );
  assert.equal(bypass.cooldownReady,false);
  assert.equal(bypass.cooldownBypassed,true);
  assert.equal(bypass.shouldCollect,true);

  const rssUnsafe=shouldCollectGarbage(
    {heapUsedMb:400,rssMb:920,externalMb:8},
    {triggerHeapMb:330,maxRssMb:900,maxExternalMb:128,cooldownMs:45_000,cooldownBypassOverageMb:30,lastAttemptAt:90_000,now:100_000}
  );
  assert.equal(rssUnsafe.shouldCollect,false);
});
