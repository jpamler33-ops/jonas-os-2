import test from 'node:test';
import assert from 'node:assert/strict';
import { runtimeMemorySnapshot, memoryDelta, withMemoryAttribution } from './runtime-memory-attribution.mjs';

test('memory snapshot separates heap external and array buffers',()=>{
  const s=runtimeMemorySnapshot('test');
  assert.equal(s.label,'test');
  for(const key of ['rssMb','heapTotalMb','heapUsedMb','externalMb','arrayBuffersMb','nativeApproxMb']){
    assert.equal(Number.isFinite(s[key]),true,key);
    assert.equal(s[key]>=0,true,key);
  }
});

test('memory delta is finite',()=>{
  const d=memoryDelta({rssMb:10,heapTotalMb:4,heapUsedMb:3,externalMb:2,arrayBuffersMb:1,nativeApproxMb:4},{rssMb:12,heapTotalMb:5,heapUsedMb:3.5,externalMb:2.2,arrayBuffersMb:1.1,nativeApproxMb:4.8});
  assert.equal(d.rssMb,2);
  assert.equal(d.heapUsedMb,.5);
});

test('attribution wrapper preserves result',async()=>{
  const out=await withMemoryAttribution('unit',async()=>42,{kind:'TEST'});
  assert.equal(out,42);
});
