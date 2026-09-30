import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryUsageMb, attemptBackgroundGc, BIGGJ_BACKGROUND_MEMORY_CONTROL_VERSION } from './biggj-background-memory-control.mjs';

test('memory usage converts node byte counters to bounded MB diagnostics',()=>{
  const m=memoryUsageMb({
    heapUsed:350*1024*1024,
    heapTotal:400*1024*1024,
    rss:620*1024*1024,
    external:48*1024*1024,
    arrayBuffers:40*1024*1024
  });
  assert.equal(m.heapUsedMb,350);
  assert.equal(m.rssMb,620);
  assert.equal(m.arrayBuffersMb,40);
});

test('background gc is a no-op when node was not started with expose-gc',()=>{
  const x=attemptBackgroundGc({
    gc:null,
    readMemory:()=>({heapUsed:100*1024*1024,rss:200*1024*1024,external:10*1024*1024,arrayBuffers:5*1024*1024}),
    now:()=>1
  });
  assert.equal(x.attempted,false);
  assert.equal(x.available,false);
  assert.equal(x.freedHeapMb,0);
});

test('background gc reports reclaimed memory and never invents negative savings',()=>{
  let reads=0;
  let gcCalls=0;
  const snapshots=[
    {heapUsed:360*1024*1024,rss:640*1024*1024,external:50*1024*1024,arrayBuffers:45*1024*1024},
    {heapUsed:310*1024*1024,rss:620*1024*1024,external:52*1024*1024,arrayBuffers:45*1024*1024}
  ];
  let clock=100;
  const x=attemptBackgroundGc({
    gc:()=>{gcCalls++;},
    readMemory:()=>snapshots[Math.min(reads++,1)],
    now:()=>clock+=4,
    reason:'TEST_PRESSURE'
  });
  assert.equal(BIGGJ_BACKGROUND_MEMORY_CONTROL_VERSION,'BIGGJ_BACKGROUND_MEMORY_CONTROL_V1');
  assert.equal(gcCalls,1);
  assert.equal(x.attempted,true);
  assert.equal(x.freedHeapMb,50);
  assert.equal(x.freedRssMb,20);
  assert.equal(x.freedExternalMb,0);
  assert.equal(x.durationMs,4);
});
