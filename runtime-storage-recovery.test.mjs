import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { recoverRuntimeStorage, RUNTIME_STORAGE_RECOVERY_VERSION } from './runtime-storage-recovery.mjs';

test('runtime storage recovery compacts research plane under forced recovery',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'tcx-recovery-'));
  try{
    const rows=Array.from({length:4000},(_,i)=>JSON.stringify({i,payload:'x'.repeat(4096)})).join('\n')+'\n';
    await writeFile(path.join(dir,'tcx-research-data-plane.jsonl'),rows);
    const out=await recoverRuntimeStorage({dataDir:dir,force:true,warnFreeBytes:1,criticalFreeBytes:1,logger:{info(){}}});
    assert.equal(out.version,RUNTIME_STORAGE_RECOVERY_VERSION);
    assert.equal(out.research.ok,true);
    assert.equal(out.research.compacted,true);
    assert.ok(out.research.afterBytes<out.research.beforeBytes);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('forecast hot rows are only removed after verified archive',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'tcx-recovery-'));
  try{
    const now=Date.now();
    const issuances=Array.from({length:520},(_,i)=>({issuanceId:'i'+i,generatedAt:now-(520-i)*60*60_000}));
    const records=new Map(Array.from({length:520},(_,i)=>['f'+i,{id:'f'+i,status:'CLOSED',issuedAt:now-(520-i)*60*60_000,expiresAt:now-(520-i)*60*60_000}]));
    const runtime={issuances,intelligence:{tracker:{records}}};
    const out=await recoverRuntimeStorage({dataDir:dir,forecastRuntime:runtime,force:true,warnFreeBytes:1,criticalFreeBytes:1,logger:{info(){}}});
    assert.equal(out.forecast.archived.verified,true);
    assert.ok(out.forecast.compaction.removedIssuances>0);
    assert.ok(out.forecast.compaction.removedTrackerRecords>0);
  }finally{await rm(dir,{recursive:true,force:true});}
});
