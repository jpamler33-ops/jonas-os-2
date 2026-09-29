import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, writeFile } from 'node:fs/promises';

import {
  REQUIRED_BUILD_TEST_SCRIPTS,
  createBuildTestAttestation,
  verifyBuildTestAttestation
} from './build-attestation.mjs';

async function fixture(){
  const dir=await mkdtemp(path.join(os.tmpdir(),'tcx-build-attestation-'));
  const scripts=Object.fromEntries(REQUIRED_BUILD_TEST_SCRIPTS.map(name=>[name,'node -e "process.exit(0)"']));
  await writeFile(path.join(dir,'package.json'),JSON.stringify({name:'x',version:'1',scripts})+'\n');
  await writeFile(path.join(dir,'a.txt'),'alpha\n');
  return dir;
}

test('post-test build attestation binds source files and test contract',async()=>{
  const dir=await fixture();
  const a=await createBuildTestAttestation({
    rootDir:dir,
    files:['package.json','a.txt'],
    generatedAt:1000
  });
  const v=await verifyBuildTestAttestation(a,{rootDir:dir});
  assert.equal(v.ok,true);
  assert.equal(a.testsPassed,true);
  assert.equal(a.testScripts.length,REQUIRED_BUILD_TEST_SCRIPTS.length);
  assert.equal(a.canExecute,false);
});

test('source mutation invalidates build attestation',async()=>{
  const dir=await fixture();
  const a=await createBuildTestAttestation({
    rootDir:dir,
    files:['package.json','a.txt'],
    generatedAt:1000
  });
  await writeFile(path.join(dir,'a.txt'),'tampered\n');
  const v=await verifyBuildTestAttestation(a,{rootDir:dir});
  assert.equal(v.ok,false);
  assert.ok(v.reasons.some(x=>x.startsWith('SOURCE_FINGERPRINT_MISMATCH')||x.startsWith('FILE_HASH_MISMATCH')));
});

test('attestation cannot silently shrink required test contract',async()=>{
  const dir=await fixture();
  const a=structuredClone(await createBuildTestAttestation({
    rootDir:dir,
    files:['package.json','a.txt'],
    generatedAt:1000
  }));
  a.testScripts=a.testScripts.slice(0,-1);
  const v=await verifyBuildTestAttestation(a,{rootDir:dir});
  assert.equal(v.ok,false);
  assert.ok(v.reasons.includes('FINGERPRINT_MISMATCH'));
  assert.ok(v.reasons.includes('TEST_CONTRACT_MISMATCH'));
});
