import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateOperationalReadiness } from './operational-readiness.mjs';

function healthy(extra={}){
  return {
    auditLedger:{healthy:true},
    marketFabric:{healthy:true},
    releaseRegistry:{healthy:true},
    runtimeReleaseRecord:{seq:1},
    forecastRuntime:{healthy:true},
    persistence:{healthy:true},
    episodePersistence:{healthy:true},
    evidenceHistory:{healthy:true},
    providerHealth:{circuits:{},pending:0,maxPending:100},
    slo:{ok:true,breaches:[]},
    localFilePersistence:true,
    replicaCount:1,
    ...extra
  };
}

test('healthy single-replica runtime is ready',()=>{
  const r=evaluateOperationalReadiness(healthy());
  assert.equal(r.ready,true);
  assert.equal(r.state,'READY');
  assert.equal(r.httpStatus,200);
  assert.equal(r.canExecute,false);
});

test('critical persistence failure is fail-closed not ready',()=>{
  const r=evaluateOperationalReadiness(healthy({forecastRuntime:{healthy:false}}));
  assert.equal(r.ready,false);
  assert.equal(r.httpStatus,503);
  assert.ok(r.hardReasons.includes('FORECAST_RUNTIME_UNHEALTHY'));
});

test('local file persistence rejects horizontal scaling',()=>{
  const r=evaluateOperationalReadiness(healthy({replicaCount:2}));
  assert.equal(r.ready,false);
  assert.ok(r.hardReasons.includes('LOCAL_FILE_STATE_REQUIRES_SINGLE_REPLICA'));
});

test('provider circuit and slo breach degrade but do not fabricate hard failure',()=>{
  const r=evaluateOperationalReadiness(healthy({
    providerHealth:{circuits:{a:{open:true}},pending:90,maxPending:100},
    slo:{ok:false,breaches:['PROVIDER_SUCCESS_BINANCE']}
  }));
  assert.equal(r.ready,true);
  assert.equal(r.state,'DEGRADED');
  assert.ok(r.warningReasons.some(x=>x.startsWith('PROVIDER_CIRCUIT_OPEN_')));
  assert.ok(r.warningReasons.includes('PROVIDER_BACKPRESSURE_HIGH'));
});


test('critical research-state corruption blocks readiness',()=>{
  const r=evaluateOperationalReadiness(healthy({
    forecastRuntime:{healthy:true,recoveredFromCorrupt:true},
    episodePersistence:{healthy:true,recoveredFromCorrupt:false},
    evidenceHistory:{healthy:true,recoveredFromCorrupt:false}
  }));
  assert.equal(r.ready,false);
  assert.ok(r.hardReasons.includes('FORECAST_RUNTIME_RECOVERED_FROM_CORRUPT'));
});

test('oversized legacy forecast snapshot recovers into degraded readiness',()=>{
  const r=evaluateOperationalReadiness(healthy({
    forecastRuntime:{healthy:true,recoveredFromCorrupt:false,recoveredFromOversizedSnapshot:true}
  }));
  assert.equal(r.ready,true);
  assert.equal(r.state,'DEGRADED');
  assert.ok(r.warningReasons.includes('FORECAST_RUNTIME_OVERSIZED_SNAPSHOT_RECOVERED'));
});

test('user-state corruption is degraded but does not impersonate research corruption',()=>{
  const r=evaluateOperationalReadiness(healthy({
    persistence:{healthy:true,recoveredFromCorrupt:true}
  }));
  assert.equal(r.ready,true);
  assert.equal(r.state,'DEGRADED');
  assert.ok(r.warningReasons.includes('USER_STATE_RECOVERED_FROM_CORRUPT'));
});

test('provider queue saturation is not ready',()=>{
  const r=evaluateOperationalReadiness(healthy({
    providerHealth:{circuits:{},pending:100,maxPending:100}
  }));
  assert.equal(r.ready,false);
  assert.ok(r.hardReasons.includes('PROVIDER_BACKPRESSURE_SATURATED'));
});


test('persistence contract block is a hard readiness failure',()=>{
  const r=evaluateOperationalReadiness(healthy({
    persistenceCompatibility:{
      version:'TEST',
      state:'BLOCKED',
      compatible:false,
      hardReasons:['FORECAST_RUNTIME_RECOVERED_FROM_CORRUPT'],
      warningReasons:[],
      fingerprint:'x'
    }
  }));
  assert.equal(r.ready,false);
  assert.ok(r.hardReasons.includes('PERSISTENCE_CONTRACT_BLOCKED'));
  assert.ok(r.hardReasons.includes('PERSISTENCE_FORECAST_RUNTIME_RECOVERED_FROM_CORRUPT'));
});

test('persistence contract degradation becomes readiness warning',()=>{
  const r=evaluateOperationalReadiness(healthy({
    persistenceCompatibility:{
      version:'TEST',
      state:'DEGRADED',
      compatible:true,
      hardReasons:[],
      warningReasons:['USER_STATE_MIGRATION_PENDING'],
      fingerprint:'x'
    }
  }));
  assert.equal(r.ready,true);
  assert.equal(r.state,'DEGRADED');
  assert.ok(r.warningReasons.includes('PERSISTENCE_USER_STATE_MIGRATION_PENDING'));
});
