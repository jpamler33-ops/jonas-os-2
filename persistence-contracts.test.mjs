import test from 'node:test';
import assert from 'node:assert/strict';

import {
  persistenceContractManifest,
  evaluatePersistenceCompatibility,
  persistenceContracts
} from './persistence-contracts.mjs';

function healthyStores(){
  return Object.fromEntries(persistenceContracts().map(x=>[
    x.id,
    {healthy:true,recoveredFromCorrupt:false}
  ]));
}

test('persistence manifest has unique env vars and paths',()=>{
  const m=persistenceContractManifest();
  const envs=m.stores.map(x=>x.env);
  const paths=m.stores.map(x=>x.defaultPath);
  assert.equal(new Set(envs).size,envs.length);
  assert.equal(new Set(paths).size,paths.length);
  assert.equal(m.invariants.horizontalScalingAllowed,false);
});

test('healthy single-replica persistence is compatible',()=>{
  const r=evaluatePersistenceCompatibility({stores:healthyStores(),replicaCount:1});
  assert.equal(r.state,'READY');
  assert.equal(r.compatible,true);
  assert.equal(r.canExecute,false);
});

test('critical forecast corruption blocks readiness',()=>{
  const stores=healthyStores();
  stores.FORECAST_RUNTIME={healthy:true,recoveredFromCorrupt:true};
  const r=evaluatePersistenceCompatibility({stores});
  assert.equal(r.state,'BLOCKED');
  assert.ok(r.hardReasons.includes('FORECAST_RUNTIME_RECOVERED_FROM_CORRUPT'));
});

test('shadow research corruption degrades instead of blocking forecast core',()=>{
  const stores=healthyStores();
  stores.SHADOW_OMS={healthy:true,recoveredFromCorrupt:true};
  const r=evaluatePersistenceCompatibility({stores});
  assert.equal(r.state,'DEGRADED');
  assert.ok(r.warningReasons.includes('SHADOW_OMS_RECOVERED_FROM_CORRUPT'));
});

test('living research corruption degrades only the autonomous research layer',()=>{
  const stores=healthyStores();
  stores.BIGGJ_LIVING_RESEARCH={healthy:true,recoveredFromCorrupt:true};
  const r=evaluatePersistenceCompatibility({stores});
  assert.equal(r.state,'DEGRADED');
  assert.equal(r.compatible,true);
  assert.ok(r.warningReasons.includes('BIGGJ_LIVING_RESEARCH_RECOVERED_FROM_CORRUPT'));
  const detail=r.details.find(x=>x.id==='BIGGJ_LIVING_RESEARCH');
  assert.equal(detail?.status,'DEGRADED');
  assert.equal(detail?.criticality,'DEGRADE');
});

test('supported user-state legacy schema becomes migration warning',()=>{
  const stores=healthyStores();
  stores.USER_STATE={healthy:true,migrationNeeded:true,loadedSchema:1};
  const r=evaluatePersistenceCompatibility({stores});
  assert.equal(r.state,'DEGRADED');
  assert.ok(r.warningReasons.includes('USER_STATE_MIGRATION_PENDING'));
});

test('unsupported schema blocks store compatibility',()=>{
  const stores=healthyStores();
  stores.EPISODE_MEMORY={healthy:true,migrationNeeded:true,loadedSchema:999};
  const r=evaluatePersistenceCompatibility({stores});
  assert.equal(r.state,'BLOCKED');
  assert.ok(r.hardReasons.includes('EPISODE_MEMORY_UNSUPPORTED_SCHEMA'));
});

test('local file persistence rejects multiple replicas',()=>{
  const r=evaluatePersistenceCompatibility({stores:healthyStores(),replicaCount:2});
  assert.equal(r.state,'BLOCKED');
  assert.ok(r.hardReasons.includes('LOCAL_FILE_PERSISTENCE_MULTI_REPLICA_FORBIDDEN'));
});


test('candidate registry corruption degrades serving while promotion remains fail-closed',()=>{
  const stores=healthyStores();
  stores.MODEL_CANDIDATE_REGISTRY={healthy:false,recoveredFromCorrupt:false};
  const r=evaluatePersistenceCompatibility({stores});
  assert.equal(r.state,'DEGRADED');
  assert.equal(r.compatible,true);
  assert.ok(r.warningReasons.includes('MODEL_CANDIDATE_REGISTRY_UNHEALTHY'));
  const detail=r.details.find(x=>x.id==='MODEL_CANDIDATE_REGISTRY');
  assert.equal(detail?.status,'DEGRADED');
  assert.equal(detail?.criticality,'DEGRADE');
});
