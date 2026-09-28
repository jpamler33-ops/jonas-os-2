import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, writeFile, readFile, utimes } from 'node:fs/promises';
import { cleanupOrphanedPersistenceArtifacts } from './storage-maintenance.mjs';

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
