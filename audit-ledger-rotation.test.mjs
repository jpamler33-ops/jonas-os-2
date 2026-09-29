import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import {
  openAuditLedger,
  appendAuditRecord,
  findAuditRecordIdentity
} from './institutional-kernel.mjs';
import {
  rotateVerifiedAuditLedger,
  readAuditLedgerCheckpoint,
  readAuditLedgerArchiveManifest
} from './audit-ledger-rotation.mjs';

async function fixture(){
  const dir=await mkdtemp(path.join(os.tmpdir(),'tcx-audit-rotation-'));
  return {dir,file:path.join(dir,'audit.jsonl')};
}

test('verified audit rotation preserves global sequence, tail and historical identity',async()=>{
  const {file}=await fixture();
  const ledger=await openAuditLedger(file,{maxInMemoryRecords:5,maxFileBytes:1024*1024});
  const issued=await appendAuditRecord(ledger,{
    kind:'TCX_INSTITUTIONAL_FORECAST_ISSUED',
    payload:{issuanceId:'issue-before-rotation',symbol:'BTCUSDT'},
    occurredAt:1
  });
  for(let i=2;i<=12;i++){
    await appendAuditRecord(ledger,{kind:'TEST',payload:{i,blob:'x'.repeat(64)},occurredAt:i});
  }

  const rotated=await rotateVerifiedAuditLedger({ledger,rotateBytes:1,now:1000});
  assert.equal(rotated.rotated,true);
  assert.equal(rotated.segment.firstSeq,1);
  assert.equal(rotated.segment.lastSeq,12);
  assert.equal(rotated.segment.tailHash,ledger.tailHash);
  assert.equal(ledger.fileBytes,0);
  assert.equal(ledger.healthy,true);

  const checkpoint=await readAuditLedgerCheckpoint(file);
  assert.equal(checkpoint.lastSeq,12);
  assert.equal(checkpoint.tailHash,ledger.tailHash);
  assert.ok(checkpoint.identities.length>=1);
  const manifest=await readAuditLedgerArchiveManifest(file);
  assert.equal(manifest.segments.length,1);

  const reopened=await openAuditLedger(file,{maxInMemoryRecords:5,maxFileBytes:1024*1024});
  assert.equal(reopened.healthy,true);
  assert.equal(reopened.seq,12);
  assert.equal(reopened.tailHash,checkpoint.tailHash);
  assert.deepEqual(reopened.records.map(x=>x.seq),[8,9,10,11,12]);

  const historical=findAuditRecordIdentity(reopened,{
    kind:'TCX_INSTITUTIONAL_FORECAST_ISSUED',
    idField:'issuanceId',
    id:'issue-before-rotation'
  });
  assert.equal(historical.seq,issued.seq);
  assert.equal(historical.recordHash,issued.recordHash);

  const next=await appendAuditRecord(reopened,{kind:'TEST',payload:{i:13},occurredAt:13});
  assert.equal(next.seq,13);
  assert.equal(next.prevHash,checkpoint.tailHash);

  const reopenedAgain=await openAuditLedger(file,{maxInMemoryRecords:5,maxFileBytes:1024*1024});
  assert.equal(reopenedAgain.healthy,true);
  assert.equal(reopenedAgain.seq,13);
  assert.deepEqual(reopenedAgain.records.map(x=>x.seq),[9,10,11,12,13]);
});

test('multiple audit rotations preserve checkpoint chain and identities from older segments',async()=>{
  const {file}=await fixture();
  let ledger=await openAuditLedger(file,{maxInMemoryRecords:4,maxFileBytes:1024*1024});
  const firstIdentity=await appendAuditRecord(ledger,{
    kind:'TCX_RESEARCH_TRACE_EVALUATED',
    payload:{evaluationId:'eval-old'},
    occurredAt:1
  });
  for(let i=2;i<=6;i++)await appendAuditRecord(ledger,{kind:'TEST',payload:{i},occurredAt:i});
  const first=await rotateVerifiedAuditLedger({ledger,rotateBytes:1,now:1000});
  assert.equal(first.rotated,true);

  ledger=await openAuditLedger(file,{maxInMemoryRecords:4,maxFileBytes:1024*1024});
  for(let i=7;i<=11;i++)await appendAuditRecord(ledger,{kind:'TEST',payload:{i},occurredAt:i});
  const second=await rotateVerifiedAuditLedger({ledger,rotateBytes:1,now:2000});
  assert.equal(second.rotated,true);
  assert.equal(second.segment.firstSeq,7);
  assert.equal(second.segment.lastSeq,11);
  assert.equal(second.checkpoint.previousCheckpointFingerprint,first.checkpoint.fingerprint);

  const manifest=await readAuditLedgerArchiveManifest(file);
  assert.equal(manifest.segments.length,2);
  const reopened=await openAuditLedger(file,{maxInMemoryRecords:4,maxFileBytes:1024*1024});
  assert.equal(reopened.seq,11);
  assert.deepEqual(reopened.records.map(x=>x.seq),[8,9,10,11]);
  const old=findAuditRecordIdentity(reopened,{
    kind:'TCX_RESEARCH_TRACE_EVALUATED',
    idField:'evaluationId',
    id:'eval-old'
  });
  assert.equal(old.seq,firstIdentity.seq);
  assert.equal(old.recordHash,firstIdentity.recordHash);
});

test('tampered audit checkpoint fails closed on reopen',async()=>{
  const {file}=await fixture();
  const ledger=await openAuditLedger(file,{maxFileBytes:1024*1024});
  await appendAuditRecord(ledger,{kind:'TEST',payload:{x:1},occurredAt:1});
  await rotateVerifiedAuditLedger({ledger,rotateBytes:1,now:1000});

  const checkpointPath=file+'.checkpoint.json';
  const value=JSON.parse(await readFile(checkpointPath,'utf8'));
  value.tailHash='f'.repeat(64);
  await writeFile(checkpointPath,JSON.stringify(value)+'\n');

  const reopened=await openAuditLedger(file,{maxFileBytes:1024*1024});
  assert.equal(reopened.healthy,false);
  assert.equal(reopened.writeBlocked,true);
  assert.equal(reopened.verification.error,'LEDGER_CHECKPOINT_FAILURE');
});
