import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { canonicalJson } from './institutional-kernel.mjs';
import { atomicWriteCanonicalObjectWithArray } from './streaming-json-persistence.mjs';

test('stream writer preserves exact canonical document bytes',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'tcx-stream-json-'));
  const file=path.join(dir,'state.json');
  try{
    const doc={
      version:'V1',
      updatedAt:123,
      items:[
        {z:2,a:1,nested:{b:true,a:'x'}},
        {id:'two',values:[3,2,1]}
      ],
      execution:'SHADOW_ONLY',
      canExecuteLive:false
    };
    const result=await atomicWriteCanonicalObjectWithArray(file,doc,{arrayKey:'items',chunkBytes:1024});
    const raw=await readFile(file,'utf8');
    assert.equal(raw,canonicalJson(doc));
    assert.equal(result.itemCount,2);
    assert.equal(result.atomic,true);
  }finally{
    await rm(dir,{recursive:true,force:true});
  }
});

test('stream writer bounds buffered document memory',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'tcx-stream-json-'));
  const file=path.join(dir,'large.json');
  try{
    const items=Array.from({length:500},(_,i)=>({id:i,payload:'x'.repeat(900)}));
    const doc={items,kind:'TEST',version:1};
    const result=await atomicWriteCanonicalObjectWithArray(file,doc,{arrayKey:'items',chunkBytes:4096});
    assert.ok(result.writes>10);
    assert.ok(result.maxBufferedBytes<=4096);
    const parsed=JSON.parse(await readFile(file,'utf8'));
    assert.equal(parsed.items.length,500);
  }finally{
    await rm(dir,{recursive:true,force:true});
  }
});

test('stream writer keeps previous file when serialization fails',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'tcx-stream-json-'));
  const file=path.join(dir,'state.json');
  try{
    await writeFile(file,'{"stable":true}','utf8');
    await assert.rejects(
      ()=>atomicWriteCanonicalObjectWithArray(file,{items:[{bad:NaN}],version:2},{arrayKey:'items',chunkBytes:1024}),
      /Non-finite number/
    );
    assert.equal(await readFile(file,'utf8'),'{"stable":true}');
  }finally{
    await rm(dir,{recursive:true,force:true});
  }
});
