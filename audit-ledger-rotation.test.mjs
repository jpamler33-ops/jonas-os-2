import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import {
  appendAuditRecord,
  findAuditRecordIdentity,
  openAuditLedger
} from './institutional-kernel.mjs';
import {
  rotateVerifiedAuditLedger,
  verifyAuditLedgerArchive
} from './audit-ledger-rotation.mjs';

test('audit ledger rotation preserves global chain across restart',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'tcx-audit-rotate-'));
  const file=path.join(dir,'audit.jsonl');
  const ledger=await openAuditLedger(file,{maxInMemoryRecords:5,maxFileBytes:1024*1024});
  const a=await appendAuditRecord(ledger,{kind:'TEST',payload:{x:1},occurredAt:1});
  const b=await appendAuditRecord(ledger,{kind:'TEST',payload:{x:2},occurredAt:2});

  const rotation=await rotateVerifiedAuditLedger({ledger,rotateBytes:1,now:100});
  assert.equal(rotation.rotated,true);
  assert.equal(rotation.firstSeq,1);
  assert.equal(rotation.lastSeq,2);
  assert.equal(rotation.tailHash,b.recordHash);
  assert.equal(ledger.fileBytes,0);
  assert.equal((await verifyAuditLedgerArchive(file)).ok,true);

  const c=await appendAuditRecord(ledger,{kind:'TEST',payload:{x:3},occurredAt:3});
  assert.equal(c.seq,3);
  assert.equal(c.prevHash,b.recordHash);

  const reopened=await openAuditLedger(file,{maxInMemoryRecords:5,maxFileBytes:1024*1024});
  assert.equal(reopened.healthy,true);
  assert.equal(reopened.seq,3);
  assert.equal(reopened.tailHash,c.recordHash);
  assert.equal(reopened.verification.archivedSegments,1);
  assert.deepEqual(reopened.records.map(x=>x.seq),[1,2,3]);

  const d=await appendAuditRecord(reopened,{kind:'TEST',payload:{x:4},occurredAt:4});
  assert.equal(d.seq,4);
  assert.equal(d.prevHash,c.recordHash);
});

test('rotation checkpoint preserves archived audit identities',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'tcx-audit-identity-'));
  const file=path.join(dir,'audit.jsonl');
  const ledger=await openAuditLedger(file,{maxInMemoryRecords:1,maxFileBytes:1024*1024});
  await appendAuditRecord(ledger,{
    kind:'TCX_INSTITUTIONAL_FORECAST_ISSUED',
    payload:{issuanceId:'issue-1'},
    occurredAt:1
  });
  await appendAuditRecord(ledger,{kind:'TEST',payload:{x:2},occurredAt:2});
  await rotateVerifiedAuditLedger({ledger,rotateBytes:1,now:100});
  await appendAuditRecord(ledger,{kind:'TEST',payload:{x:3},occurredAt:3});

  const reopened=await openAuditLedger(file,{maxInMemoryRecords:1,maxFileBytes:1024*1024});
  const hit=findAuditRecordIdentity(reopened,{
    kind:'TCX_INSTITUTIONAL_FORECAST_ISSUED',
    idField:'issuanceId',
    id:'issue-1'
  });
  assert.equal(hit?.seq,1);
  assert.equal(hit?.indexedIdentity,true);
  assert.equal(reopened.records.length,1);
  assert.equal(reopened.records[0].seq,3);
});

test('archive verification fails closed on compressed segment tampering',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'tcx-audit-tamper-'));
  const file=path.join(dir,'audit.jsonl');
  const ledger=await openAuditLedger(file,{maxFileBytes:1024*1024});
  await appendAuditRecord(ledger,{kind:'TEST',payload:{x:1},occurredAt:1});
  const rotation=await rotateVerifiedAuditLedger({ledger,rotateBytes:1,now:100});
  assert.equal(rotation.codec,'gzip');
  assert.equal((await verifyAuditLedgerArchive(file)).ok,true);

  const segment=path.join(dir,rotation.segment);
  const bytes=await readFile(segment);
  bytes[Math.floor(bytes.length/2)]^=0xff;
  await writeFile(segment,bytes);
  const verified=await verifyAuditLedgerArchive(file);
  assert.equal(verified.ok,false);
  assert.equal(verified.error,'AUDIT_ARCHIVE_COMPRESSED_HASH_MISMATCH');
});

test('rotation leaves fail-closed cap semantics intact for active segment',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'tcx-audit-cap-after-rotate-'));
  const file=path.join(dir,'audit.jsonl');
  const ledger=await openAuditLedger(file,{maxFileBytes:1024*1024});
  await appendAuditRecord(ledger,{kind:'TEST',payload:{x:1},occurredAt:1});
  await rotateVerifiedAuditLedger({ledger,rotateBytes:1,now:100});
  ledger.maxFileBytes=1;
  await assert.rejects(
    ()=>appendAuditRecord(ledger,{kind:'TEST',payload:{x:2},occurredAt:2}),
    err=>err?.code==='AUDIT_LEDGER_SIZE_LIMIT'
  );
  assert.equal(ledger.healthy,false);
});
