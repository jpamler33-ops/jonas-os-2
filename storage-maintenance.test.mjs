import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, writeFile, readFile, utimes } from 'node:fs/promises';
import { cleanupOrphanedPersistenceArtifacts, classifyStoragePressure, inspectStoragePressure } from './storage-maintenance.mjs';

test('removes only stale known artifacts when canonical exists', async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'tcx-storage-'));
  const canonical=path.join(dir,'tcx-forecast-runtime.json');
  const orphan=canonical+'.corrupt-123';
  const unrelated=path.join(dir,'keep-me.corrupt-123');
  await writeFile(canonical,'{"ok":true}');
  await writeFile(orphan,'waste');
  await writeFile(unrelated,'keep');
  const old=new Date(Date.now()-60*60_000);
  await utimes(orphan,old,old);
  const result=await cleanupOrphanedPersistenceArtifacts({dataDir:dir,minAgeMs:60_000,logger:{info(){}}});
  assert.equal(result.removed.length,1);
  assert.equal(result.removed[0].file,'tcx-forecast-runtime.json.corrupt-123');
  assert.equal(await readFile(canonical,'utf8'),'{"ok":true}');
  assert.equal(await readFile(unrelated,'utf8'),'keep');
});

test('keeps artifact if canonical file is missing', async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'tcx-storage-'));
  const orphan=path.join(dir,'tcx-evidence-history.json.tmp-1');
  await writeFile(orphan,'partial');
  const old=new Date(Date.now()-60*60_000);
  await utimes(orphan,old,old);
  const result=await cleanupOrphanedPersistenceArtifacts({dataDir:dir,minAgeMs:60_000,logger:{info(){}}});
  assert.equal(result.removed.length,0);
  assert.equal(result.skipped[0].reason,'CANONICAL_MISSING');
  assert.equal(await readFile(orphan,'utf8'),'partial');
});


test('classifies filesystem pressure from both free bytes and utilization',()=>{
  const gib=1024*1024*1024;
  const normal=classifyStoragePressure({totalBytes:gib,availableBytes:300*1024*1024});
  assert.equal(normal.state,'NORMAL');

  const warn=classifyStoragePressure({
    totalBytes:gib,availableBytes:90*1024*1024,
    warnFreeBytes:96*1024*1024,criticalFreeBytes:48*1024*1024,
    warnUtilization:.95,criticalUtilization:.99
  });
  assert.equal(warn.state,'WARN');

  const critical=classifyStoragePressure({
    totalBytes:gib,availableBytes:40*1024*1024,
    warnFreeBytes:96*1024*1024,criticalFreeBytes:48*1024*1024,
    warnUtilization:.95,criticalUtilization:.99
  });
  assert.equal(critical.state,'CRITICAL');

  const criticalByRatio=classifyStoragePressure({
    totalBytes:gib,availableBytes:70*1024*1024,
    warnFreeBytes:1,criticalFreeBytes:1,
    warnUtilization:.82,criticalUtilization:.92
  });
  assert.equal(criticalByRatio.state,'CRITICAL');
});

test('inspects a real filesystem without mutating it',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'tcx-storage-pressure-'));
  const pressure=await inspectStoragePressure({dataDir:dir});
  assert.equal(pressure.ok,true);
  assert.ok(pressure.totalBytes>0);
  assert.ok(pressure.availableBytes>=0);
  assert.ok(['NORMAL','WARN','CRITICAL'].includes(pressure.state));
});
