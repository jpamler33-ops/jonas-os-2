import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,stat,readFile,writeFile} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {openMarketDataFabric,appendMarketEvents,createMarketEventInput} from './market-data-fabric.mjs';import {rotateVerifiedMarketFabric,readMarketFabricCheckpoint,reconcileMarketFabricCheckpointFromArchive} from './market-fabric-rotation.mjs';import {archiveMarketFabricSegments} from './market-fabric-archive.mjs';import {sha256,canonicalJson} from './institutional-kernel.mjs';
test('verified rotation preserves seq and hash lineage across segment boundary',async()=>{const dir=await mkdtemp(path.join(os.tmpdir(),'tcx-rotate-')),file=path.join(dir,'events.jsonl');let f=await openMarketDataFabric(file);await appendMarketEvents(f,[createMarketEventInput({kind:'X',streamKey:'S',source:'T',sourceEventId:'1',eventTime:1,payload:{a:1}})]);f=await openMarketDataFabric(file);const oldHash=f.tailHash,r=await rotateVerifiedMarketFabric({filePath:file,maxBytes:1,verification:f.verification,now:123});assert.equal(r.rotated,true);f=await openMarketDataFabric(file);assert.equal(f.seq,1);assert.equal(f.tailHash,oldHash);await appendMarketEvents(f,[createMarketEventInput({kind:'X',streamKey:'S',source:'T',sourceEventId:'2',eventTime:2,payload:{a:2}})]);f=await openMarketDataFabric(file);assert.equal(f.seq,2);assert.equal(f.healthy,true);assert.equal(f.events.at(-1).prevHash,oldHash);assert.ok((await stat(r.segment)).size>0);});
test('supports repeated verified rotations with chained checkpoints',async()=>{const dir=await mkdtemp(path.join(os.tmpdir(),'tcx-rotate2-')),file=path.join(dir,'events.jsonl');let f=await openMarketDataFabric(file);await appendMarketEvents(f,[createMarketEventInput({kind:'X',streamKey:'S',source:'T',sourceEventId:'1',eventTime:1,payload:{n:1}})]);f=await openMarketDataFabric(file);const r1=await rotateVerifiedMarketFabric({filePath:file,maxBytes:1,verification:f.verification,now:100});f=await openMarketDataFabric(file);await appendMarketEvents(f,[createMarketEventInput({kind:'X',streamKey:'S',source:'T',sourceEventId:'2',eventTime:2,payload:{n:2}})]);f=await openMarketDataFabric(file);const r2=await rotateVerifiedMarketFabric({filePath:file,maxBytes:1,verification:f.verification,now:200});assert.equal(r2.rotated,true);assert.equal(r2.previousCheckpointFingerprint,r1.fingerprint);const cp=await readMarketFabricCheckpoint(file);assert.equal(cp.lastSeq,2);assert.equal(cp.previousCheckpointFingerprint,r1.fingerprint);f=await openMarketDataFabric(file);assert.equal(f.seq,2);await appendMarketEvents(f,[createMarketEventInput({kind:'X',streamKey:'S',source:'T',sourceEventId:'3',eventTime:3,payload:{n:3}})]);f=await openMarketDataFabric(file);assert.equal(f.seq,3);assert.equal(f.healthy,true);});
test('rotation refuses unverified fabric',async()=>{const dir=await mkdtemp(path.join(os.tmpdir(),'tcx-rotate-')),file=path.join(dir,'events.jsonl');const f=await openMarketDataFabric(file),r=await rotateVerifiedMarketFabric({filePath:file,maxBytes:0,verification:{ok:false}});assert.equal(r.rotated,false);});

test('rotation rejects stale verification instead of archiving appended tail under an old checkpoint',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'tcx-rotate-stale-')),file=path.join(dir,'events.jsonl');
 const f=await openMarketDataFabric(file);
 await appendMarketEvents(f,[createMarketEventInput({kind:'X',streamKey:'S',source:'T',sourceEventId:'1',eventTime:1,payload:{n:1}})]);
 const stale={...f.verification};
 await appendMarketEvents(f,[createMarketEventInput({kind:'X',streamKey:'S',source:'T',sourceEventId:'2',eventTime:2,payload:{n:2}})]);
 assert.equal(f.verification.lastSeq,2);
 const blocked=await rotateVerifiedMarketFabric({filePath:file,maxBytes:1,verification:stale,now:300});
 assert.equal(blocked.rotated,false);
 assert.equal(blocked.reason,'VERIFICATION_STALE');
 assert.equal(blocked.verificationLastSeq,1);
 assert.equal(blocked.actualLastSeq,2);
 assert.ok((await stat(file)).size>0);
 const ok=await rotateVerifiedMarketFabric({filePath:file,maxBytes:1,verification:f.verification,now:301});
 assert.equal(ok.rotated,true);
 assert.equal(ok.lastSeq,2);
});

test('startup reconciliation repairs a stale checkpoint from a fingerprinted archive when active log is absent',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'tcx-reconcile-')),file=path.join(dir,'events.jsonl');
 const f=await openMarketDataFabric(file);
 await appendMarketEvents(f,[
  createMarketEventInput({kind:'X',streamKey:'S',source:'T',sourceEventId:'1',eventTime:1,payload:{n:1}}),
  createMarketEventInput({kind:'X',streamKey:'S',source:'T',sourceEventId:'2',eventTime:2,payload:{n:2}})
 ]);
 const firstHash=f.events[0].eventHash;
 const finalHash=f.tailHash;
 const rotated=await rotateVerifiedMarketFabric({filePath:file,maxBytes:1,verification:f.verification,now:400});
 assert.equal(rotated.rotated,true);
 await archiveMarketFabricSegments({filePath:file,migrateExisting:false,maxArchivedBytes:1024*1024});
 const current=await readMarketFabricCheckpoint(file);
 const staleCore={...current,lastSeq:1,tailHash:firstHash};delete staleCore.fingerprint;
 await writeFile(file+'.checkpoint.json',canonicalJson({...staleCore,fingerprint:sha256(staleCore)})+'\n');
 const repaired=await reconcileMarketFabricCheckpointFromArchive(file);
 assert.equal(repaired.reconciled,true);
 assert.equal(repaired.fromLastSeq,1);
 assert.equal(repaired.toLastSeq,2);
 const checkpoint=await readMarketFabricCheckpoint(file);
 assert.equal(checkpoint.lastSeq,2);
 assert.equal(checkpoint.tailHash,finalHash);
 const reopened=await openMarketDataFabric(file);
 assert.equal(reopened.healthy,true);
 assert.equal(reopened.seq,2);
 assert.equal(reopened.tailHash,finalHash);
});
