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
