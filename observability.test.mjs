import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createObservability,
  recordProviderCall,
  recordOperation,
  observabilitySnapshot,
  deriveSloHealth
} from './observability.mjs';

test('provider success SLO breach is surfaced after minimum sample size',()=>{
  const obs=createObservability({sampleLimit:20});
  for(let i=0;i<5;i++){
    recordProviderCall(obs,{provider:'BINANCE',ok:i<3,latencyMs:100,at:1000+i});
  }
  const slo=deriveSloHealth(observabilitySnapshot(obs,{now:2000}),{
    providerSuccessFloor:.8,
    minimumSamples:5
  });
  assert.equal(slo.ok,false);
  assert.ok(slo.breaches.includes('PROVIDER_SUCCESS_BINANCE'));
});

test('operation failure-rate SLO is independently enforced',()=>{
  const obs=createObservability({sampleLimit:20});
  for(let i=0;i<5;i++){
    recordOperation(obs,{name:'forecast.issue',ok:i<3,latencyMs:100,at:1000+i});
  }
  const slo=deriveSloHealth(observabilitySnapshot(obs,{now:2000}),{
    operationSuccessFloor:.8,
    minimumSamples:5
  });
  assert.equal(slo.ok,false);
  assert.ok(slo.breaches.includes('OPERATION_SUCCESS_forecast.issue'));
});

test('operation latency SLO is surfaced',()=>{
  const obs=createObservability({sampleLimit:20});
  for(let i=0;i<5;i++){
    recordOperation(obs,{name:'research.state',ok:true,latencyMs:6000,at:1000+i});
  }
  const slo=deriveSloHealth(observabilitySnapshot(obs,{now:2000}),{
    operationP95Ms:5000,
    minimumSamples:5
  });
  assert.equal(slo.ok,false);
  assert.ok(slo.breaches.includes('OPERATION_LATENCY_research.state'));
});

test('insufficient samples do not fabricate an SLO breach',()=>{
  const obs=createObservability({sampleLimit:20});
  recordProviderCall(obs,{provider:'BINANCE',ok:false,latencyMs:9999,at:1000});
  const slo=deriveSloHealth(observabilitySnapshot(obs,{now:2000}),{minimumSamples:5});
  assert.equal(slo.ok,true);
  assert.deepEqual(slo.breaches,[]);
});
