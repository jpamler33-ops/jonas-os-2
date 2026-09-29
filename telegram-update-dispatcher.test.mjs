import test from 'node:test';
import assert from 'node:assert/strict';
import { createTelegramUpdateDispatcher } from './telegram-update-dispatcher.mjs';

const sleep=ms=>new Promise(r=>setTimeout(r,ms));

test('priority /start is not blocked by slow update in same chat',async()=>{
  const seen=[];
  const d=createTelegramUpdateDispatcher({
    timeoutMs:80,
    handle:async u=>{
      const text=u?.message?.text||'';
      if(text==='/slow') await sleep(60);
      seen.push(text);
    }
  });
  const p=d.dispatchBatch([
    {update_id:1,message:{chat:{id:1},text:'/slow'}},
    {update_id:2,message:{chat:{id:1},text:'/start'}}
  ]);
  await sleep(10);
  assert.ok(seen.includes('/start'));
  await p;
  assert.deepEqual(new Set(seen),new Set(['/slow','/start']));
});

test('slow handler times out instead of freezing batch forever',async()=>{
  const d=createTelegramUpdateDispatcher({
    timeoutMs:20,
    handle:async()=>new Promise(()=>{})
  });
  const started=Date.now();
  const out=await d.dispatchBatch([{update_id:1,message:{chat:{id:1},text:'/forecast BTC'}}]);
  assert.ok(Date.now()-started<200);
  assert.equal(out.length,1);
  const s=d.snapshot();
  assert.equal(s.timeouts,1);
  assert.equal(s.failed,1);
  assert.equal(s.inFlight,0);
});

test('ordinary updates stay ordered per chat',async()=>{
  const seen=[];
  const d=createTelegramUpdateDispatcher({
    timeoutMs:100,
    handle:async u=>{
      const text=u.message.text;
      if(text==='a') await sleep(20);
      seen.push(text);
    },
    priorityCommands:[]
  });
  await d.dispatchBatch([
    {update_id:1,message:{chat:{id:7},text:'a'}},
    {update_id:2,message:{chat:{id:7},text:'b'}}
  ]);
  assert.deepEqual(seen,['a','b']);
});
