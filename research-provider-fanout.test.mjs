import test from 'node:test';
import assert from 'node:assert/strict';
import { runResearchProviderFanout } from './research-provider-fanout.mjs';

test('research provider fanout starts independent tasks concurrently',{timeout:1000},async()=>{
  let started=0;
  let release;
  const gate=new Promise(resolve=>{release=resolve;});
  const tasks=['a','b','c'].map(id=>({
    id,
    async run(){
      started++;
      if(started===3) release();
      await gate;
      return id.toUpperCase();
    }
  }));
  const result=await runResearchProviderFanout(tasks);
  assert.equal(started,3);
  assert.equal(result.fulfilled,3);
  assert.equal(result.rejected,0);
  assert.equal(result.results.a.value,'A');
  assert.equal(result.results.b.value,'B');
  assert.equal(result.results.c.value,'C');
});

test('research provider fanout isolates provider failure',async()=>{
  const result=await runResearchProviderFanout([
    {id:'ok',run:async()=>({ok:true})},
    {id:'bad',run:async()=>{throw new Error('provider down');}}
  ]);
  assert.equal(result.taskCount,2);
  assert.equal(result.fulfilled,1);
  assert.equal(result.rejected,1);
  assert.equal(result.results.ok.status,'FULFILLED');
  assert.equal(result.results.bad.status,'REJECTED');
  assert.match(result.results.bad.error,/provider down/);
});

test('research provider fanout rejects duplicate task ids',async()=>{
  await assert.rejects(
    ()=>runResearchProviderFanout([
      {id:'same',run:async()=>1},
      {id:'same',run:async()=>2}
    ]),
    /RESEARCH_FANOUT_DUPLICATE_ID/
  );
});
