import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { buildRuntimeManifest, openReleaseRegistry, registerRuntimeRelease, verifyReleaseRegistry, institutionalRuntimeFiles, INSTITUTIONAL_STAGED_RUNTIME_FILES } from './runtime-release-registry.mjs';

async function fixture(){
  const dir=await mkdtemp(path.join(os.tmpdir(),'tcx-release-'));
  await writeFile(path.join(dir,'a.mjs'),'export const a=1;\n');
  await writeFile(path.join(dir,'b.mjs'),'export const b=2;\n');
  return dir;
}

test('runtime manifest is deterministic for same source and config',async()=>{
  const dir=await fixture();
  const args={
    rootDir:dir,files:['a.mjs','b.mjs'],
    config:{mode:'SHADOW_ONLY',threshold:0.5},
    packageInfo:{name:'tcx',version:'1.0.0'},
    deployment:{gitCommit:'abcdef1234567',gitBranch:'main'},
    versions:{kernel:'IK_V1'}
  };
  const a=await buildRuntimeManifest(args);
  const b=await buildRuntimeManifest(args);
  assert.equal(a.releaseId,b.releaseId);
  assert.deepEqual(a.componentHashes,b.componentHashes);
});

test('source or config mutation changes release id',async()=>{
  const dir=await fixture();
  const base={rootDir:dir,files:['a.mjs','b.mjs'],config:{x:1},packageInfo:{name:'tcx',version:'1'}};
  const a=await buildRuntimeManifest(base);
  await writeFile(path.join(dir,'a.mjs'),'export const a=2;\n');
  const b=await buildRuntimeManifest(base);
  const c=await buildRuntimeManifest({...base,config:{x:2}});
  assert.notEqual(a.releaseId,b.releaseId);
  assert.notEqual(b.releaseId,c.releaseId);
});

test('deployment metadata is sanitized and never reads arbitrary environment secrets',async()=>{
  const dir=await fixture();
  const m=await buildRuntimeManifest({
    rootDir:dir,files:['a.mjs'],
    deployment:{gitCommit:'not-a-sha',gitBranch:'main',service:'tcx',secret:'DO_NOT_STORE'},
    config:{safe:true}
  });
  assert.equal(m.deployment.gitCommit,null);
  assert.equal('secret' in m.deployment,false);
});

test('release registry registers once and deduplicates identical runtime',async()=>{
  const dir=await fixture();
  const file=path.join(dir,'registry.jsonl');
  const registry=await openReleaseRegistry(file);
  const manifest=await buildRuntimeManifest({rootDir:dir,files:['a.mjs','b.mjs'],config:{x:1}});
  const a=await registerRuntimeRelease(registry,manifest,{registeredAt:1});
  const b=await registerRuntimeRelease(registry,manifest,{registeredAt:2});
  assert.equal(a.duplicate,false);
  assert.equal(b.duplicate,true);
  assert.equal(registry.seq,1);
  assert.equal(verifyReleaseRegistry(registry.records).ok,true);
});

test('release registry detects historical manifest tampering',async()=>{
  const dir=await fixture();
  const file=path.join(dir,'registry.jsonl');
  const registry=await openReleaseRegistry(file);
  const manifest=await buildRuntimeManifest({rootDir:dir,files:['a.mjs'],config:{x:1}});
  await registerRuntimeRelease(registry,manifest,{registeredAt:1});
  const rows=(await readFile(file,'utf8')).trim().split('\n').map(JSON.parse);
  rows[0].manifest.configHash='0'.repeat(64);
  await writeFile(file,rows.map(JSON.stringify).join('\n')+'\n');
  const reopened=await openReleaseRegistry(file);
  assert.equal(reopened.healthy,false);
  assert.equal(reopened.verification.error,'MANIFEST_HASH_MISMATCH');
});

test('release registry preserves a damaged tail and resumes from verified history',async()=>{
  const dir=await fixture();
  const file=path.join(dir,'registry.jsonl');
  const registry=await openReleaseRegistry(file);
  const first=await buildRuntimeManifest({rootDir:dir,files:['a.mjs'],config:{x:1}});
  await registerRuntimeRelease(registry,first,{registeredAt:1});
  await writeFile(file,'{"seq":2,"manifest":', {flag:'a'});

  const reopened=await openReleaseRegistry(file);
  assert.equal(reopened.healthy,true);
  assert.equal(reopened.recoveredFromTruncatedTail,true);
  assert.match(reopened.backupPath,/\.truncated-tail-/);
  assert.equal(verifyReleaseRegistry(reopened.records).ok,true);
  assert.match(await readFile(reopened.backupPath,'utf8'),/"seq":2,"manifest":$/);

  const second=await buildRuntimeManifest({rootDir:dir,files:['a.mjs'],config:{x:2}});
  const appended=await registerRuntimeRelease(reopened,second,{registeredAt:2});
  assert.equal(appended.record.seq,2);
  assert.equal(verifyReleaseRegistry(reopened.records).ok,true);
});


test('institutional staged release set hashes forecast, science, admission and trace code',()=>{
  const files=institutionalRuntimeFiles();
  for(const required of [
    'operational-readiness.mjs',
    'persistence-contracts.mjs',
    'forecast-contract.mjs',
    'scientific-validity.mjs',
    'institutional-admission.mjs',
    'research-trace.mjs',
    'claim-assumption-graph.mjs',
    'forecast-claim-assumption-sidecar.mjs',
    'claim-assumption-research-evaluator.mjs',
    'forecast-thesis-declarations.mjs',
    'forecast-thesis-revision-memory.mjs',
    'forecast-assumption-stability.mjs',
    'biggj-capability-map.mjs',
    'biggj-skill-dependency-graph.mjs',
    'biggj-skill-tree.mjs',
    'biggj-living-research-runtime.mjs',
    'biggj-research-validation-harness.mjs',
    'biggj-research-protocol-compiler.mjs',
    'biggj-research-review-queue.mjs',
    'biggj-research-episode-resolver.mjs',
    'tcx-research-os-contract.mjs',
    'institutional-forecast-issuance.mjs',
    'institutional-forecast-runtime.mjs',
    'forecast-product.mjs',
    'forecast-candidate-lab.mjs',
    'forecast-runtime/forecast/engine.js',
    'forecast-runtime/forecast/calibration.js',
    'science-runtime/empirical-support.mjs',
    'science-runtime/specification-multiverse.mjs',
    'science-runtime/evidence-lineage-independence.mjs',
    'science-runtime/epistemic-integrity.mjs',
    'expansion-runtime/provenance.mjs',
    'expansion-runtime/institutional-expansion.mjs',
    'expansion-runtime/source-intelligence.mjs',
    'expansion-runtime/event-impact-memory.mjs',
    'expansion-runtime/liquidity-intelligence.mjs',
    'biggj-public-trader-watch.mjs',
    'shadow-specialist-wallets.mjs',
    'memecoin-trade-learner.mjs',
    'expansion-runtime/memecoin-early-radar.mjs',
    'expansion-runtime/memecoin-security-provider.mjs',
    'expansion-runtime/memecoin-security-outcome-tracker.mjs',
    'expansion-runtime/memecoin-evidence-factory.mjs',
    'expansion-runtime/memecoin-social-attention.mjs'
  ]){
    assert.ok(files.includes(required),required+' missing from institutional release identity');
  }
  assert.equal(files.some(x=>x.endsWith('.test.mjs')),false);
  assert.equal(new Set(files).size,files.length);
  assert.ok(INSTITUTIONAL_STAGED_RUNTIME_FILES.length>=20);
});


test('runtime release identity is transitively closed over local source imports',async()=>{
  const files=new Set(institutionalRuntimeFiles());
  const missing=[];
  for(const file of [...files].filter(x=>/\.(?:mjs|js)$/.test(x))){
    const source=await readFile(new URL('./'+file,import.meta.url),'utf8');
    const specs=[
      ...[...source.matchAll(/from\s+['"](\.\.?\/[^'"]+)['"]/g)].map(m=>m[1]),
      ...[...source.matchAll(/import\s+['"](\.\.?\/[^'"]+)['"]/g)].map(m=>m[1]),
      ...[...source.matchAll(/import\s*\(\s*['"](\.\.?\/[^'"]+)['"]/g)].map(m=>m[1])
    ];
    for(const spec of new Set(specs)){
      const resolved=path.posix.normalize(path.posix.join(path.posix.dirname(file),spec));
      if(/\.(?:mjs|js|json)$/.test(resolved)&&!files.has(resolved)){
        missing.push(file+' -> '+resolved);
      }
    }
  }
  assert.deepEqual(missing.sort(),[]);
});
