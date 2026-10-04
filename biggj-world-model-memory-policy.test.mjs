import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveWorldModelRefreshPlan, BIGGJ_WORLD_MODEL_MEMORY_POLICY_VERSION } from './biggj-world-model-memory-policy.mjs';

const thresholds={heapUsedMb:380,rssMb:780,externalMb:64};

test('normal memory selects bounded FULL mode',()=>{
  const p=deriveWorldModelRefreshPlan({pressured:false,heapUsedMb:320,rssMb:610,externalMb:4,thresholds},{maxSymbols:12});
  assert.equal(p.version,BIGGJ_WORLD_MODEL_MEMORY_POLICY_VERSION);
  assert.equal(p.mode,'FULL');
  assert.equal(p.symbolLimit,12);
  assert.equal(p.fetchConcurrency,4);
  assert.equal(p.retryMs,null);
});

test('mild heap-only pressure degrades instead of dropping world model refresh',()=>{
  const p=deriveWorldModelRefreshPlan({pressured:true,heapUsedMb:412,rssMb:692,externalMb:4,thresholds},{maxSymbols:12});
  assert.equal(p.mode,'COMPACT');
  assert.equal(p.reason,'MILD_HEAP_PRESSURE');
  assert.equal(p.symbolLimit,6);
  assert.equal(p.klineRows,96);
  assert.equal(p.fetchConcurrency,2);
  assert.equal(p.journalRowsPerSymbol,250);
});

test('hard heap pressure still fails closed and requests a fast retry',()=>{
  const p=deriveWorldModelRefreshPlan({pressured:true,heapUsedMb:480,rssMb:700,externalMb:4,thresholds});
  assert.equal(p.mode,'DEFERRED');
  assert.equal(p.reason,'HEAP_HARD_PRESSURE');
  assert.equal(p.retryMs,30_000);
});

test('rss or external guard is never weakened by compact mode',()=>{
  assert.equal(deriveWorldModelRefreshPlan({pressured:true,heapUsedMb:390,rssMb:780,externalMb:4,thresholds}).mode,'DEFERRED');
  assert.equal(deriveWorldModelRefreshPlan({pressured:true,heapUsedMb:390,rssMb:700,externalMb:64,thresholds}).mode,'DEFERRED');
});
