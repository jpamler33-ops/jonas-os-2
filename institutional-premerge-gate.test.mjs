import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { institutionalRuntimeFiles } from './runtime-release-registry.mjs';
import { persistenceContractManifest } from './persistence-contracts.mjs';
import { runChaosSuite } from './chaos-engineering.mjs';

const CRITICAL_ROOT_MODULES=[
  'operational-readiness.mjs',
  'persistence-contracts.mjs',
  'institutional-forecast-runtime.mjs',
  'forecast-input-adapter.mjs',
  'forecast-science-adapter.mjs',
  'forecast-contract.mjs',
  'forecast-product.mjs',
  'scientific-core.mjs',
  'institutional-admission.mjs',
  'institutional-forecast-issuance.mjs',
  'research-trace.mjs',
  'institutional-audit-binding.mjs',
  'forecast-candidate-lab.mjs',
  'model-promotion-ladder.mjs',
  'model-candidate-registry.mjs',
  'model-release-binding.mjs',
  'model-governance-audit.mjs'
];

test('institutional release identity includes every critical root module',()=>{
  const files=new Set(institutionalRuntimeFiles());
  for(const file of CRITICAL_ROOT_MODULES){
    assert.ok(files.has(file),file+' missing from release identity');
  }
});

test('Docker image packages all critical root modules and enforces single-replica default',async()=>{
  const docker=await readFile('Dockerfile','utf8');
  for(const file of CRITICAL_ROOT_MODULES){
    assert.ok(docker.includes(file),file+' missing from Dockerfile');
  }
  assert.match(docker,/USER node/);
  assert.match(docker,/ENV TCX_REPLICA_COUNT=1/);
  assert.match(docker,/TCX_FORECAST_RUNTIME_FILE=\/data\//);
  assert.match(docker,/RUN npm run check/);
});

test('package syntax gate covers critical institutional modules',async()=>{
  const pkg=JSON.parse(await readFile('package.json','utf8'));
  for(const file of CRITICAL_ROOT_MODULES){
    assert.ok(pkg.scripts.check.includes('node --check '+file),file+' missing from package check');
  }
  assert.match(pkg.scripts.test,/science-runtime\/\*\.test\.mjs/);
  assert.match(pkg.scripts.test,/expansion-runtime\/\*\.test\.mjs/);
});

test('persistence contract is explicitly single-replica and critical corruption fail-closed',()=>{
  const manifest=persistenceContractManifest();
  assert.equal(manifest.mode,'LOCAL_FILE_SINGLE_REPLICA');
  assert.equal(manifest.invariants.horizontalScalingAllowed,false);
  assert.equal(manifest.invariants.criticalCorruptionFailsReadiness,true);
  const critical=manifest.stores.filter(x=>x.criticality==='BLOCK');
  assert.ok(critical.some(x=>x.id==='FORECAST_RUNTIME'));
  assert.ok(critical.some(x=>x.id==='AUDIT_LEDGER'));
  assert.ok(critical.some(x=>x.id==='MARKET_DATA_FABRIC'));
  assert.ok(critical.some(x=>x.id==='RELEASE_REGISTRY'));
});

test('synthetic institutional chaos suite is green before merge',()=>{
  const suite=runChaosSuite({now:1_000_000});
  assert.equal(suite.failed,0);
  assert.equal(suite.executionInvariant,true);
});

test('forecast/science/governance core has no authenticated exchange-order primitive',async()=>{
  const files=[
    'institutional-forecast-runtime.mjs',
    'forecast-input-adapter.mjs',
    'forecast-science-adapter.mjs',
    'forecast-contract.mjs',
    'forecast-candidate-lab.mjs',
    'scientific-core.mjs',
    'institutional-admission.mjs',
    'institutional-forecast-issuance.mjs',
    'model-promotion-ladder.mjs',
    'model-candidate-registry.mjs',
    'model-release-binding.mjs',
    'model-governance-audit.mjs'
  ];
  const forbidden=[
    /\bapi[_-]?key\b/i,
    /\bsecret[_-]?key\b/i,
    /\bprivate[_-]?key\b/i,
    /\/api\/v3\/order/i,
    /\bplaceOrder\b/,
    /\bsubmitOrder\b/,
    /\bcreateLiveOrder\b/
  ];
  for(const file of files){
    const source=await readFile(file,'utf8');
    for(const pattern of forbidden){
      assert.equal(pattern.test(source),false,file+' contains forbidden live-order/auth primitive '+pattern);
    }
  }
});
