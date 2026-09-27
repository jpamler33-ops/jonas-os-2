import test from 'node:test';
import assert from 'node:assert/strict';
import { createObservability, recordProviderCall, recordOperation, recordSafety, recordResearchTelemetry, observabilitySnapshot, deriveSloHealth } from './observability.mjs';
import { runChaosScenario, runChaosSuite, chaosScenarioNames } from './chaos-engineering.mjs';

test('observability aggregates provider success and latency percentiles',()=>{
  const o=createObservability({sampleLimit:20});
  for(const ms of [10,20,30,40,50]) recordProviderCall(o,{provider:'BINANCE',ok:true,latencyMs:ms});
  recordProviderCall(o,{provider:'BINANCE',ok:false,latencyMs:60,status:500,error:'x'});
  const s=observabilitySnapshot(o,{now:o.startedAt+1000});
  assert.equal(s.providers.BINANCE.calls,6);
  assert.equal(s.providers.BINANCE.failure,1);
  assert.ok(s.providers.BINANCE.latency.p95Ms>=50);
});

test('observability records safety transitions and bounded research telemetry',()=>{
  const o=createObservability({sampleLimit:10});
  recordSafety(o,'NORMAL');
  recordSafety(o,'DEGRADED',{softReasons:['NO_EXTERNAL_WITNESS']});
  recordSafety(o,'SAFE_STOP',{hardReasons:['PRIMARY_STALE']});
  recordResearchTelemetry(o,{evidenceStrength:0.8,novelty:0.2,contradiction:0.1,witnessAgreement:0.7,primaryAgeMs:100});
  const s=observabilitySnapshot(o);
  assert.equal(s.safety.current,'SAFE_STOP');
  assert.equal(s.safety.transitions.length,3);
  assert.equal(s.research.evidence.n,1);
});

test('SLO health flags low provider success and high latency',()=>{
  const o=createObservability({sampleLimit:20});
  for(let i=0;i<5;i++) recordProviderCall(o,{provider:'OKX',ok:i===0,latencyMs:4000});
  for(let i=0;i<5;i++) recordOperation(o,{name:'engine',ok:true,latencyMs:6000});
  const h=deriveSloHealth(observabilitySnapshot(o));
  assert.equal(h.ok,false);
  assert.ok(h.breaches.some(x=>x.startsWith('PROVIDER_SUCCESS_OKX')));
  assert.ok(h.breaches.some(x=>x.startsWith('OPERATION_LATENCY_engine')));
});

test('all named chaos scenarios preserve execution-disabled invariant',()=>{
  for(const name of chaosScenarioNames()){
    const r=runChaosScenario(name);
    assert.equal(r.invariantOk,true,name);
    assert.equal(r.canExecute,false,name);
  }
});

test('stale primary, crossed book and engine violations hard-stop',()=>{
  for(const name of ['PRIMARY_STALE','CROSSED_BOOK','ENGINE_EXECUTION_VIOLATION','ENGINE_ACTION_VIOLATION','CAUSAL_STATUS_VIOLATION']){
    const r=runChaosScenario(name);
    assert.equal(r.pass,true,name);
    assert.equal(r.actualState,'SAFE_STOP',name);
  }
});

test('witness outage and disagreement degrade rather than fabricate certainty',()=>{
  for(const name of ['OKX_KRAKEN_OUTAGE','CROSS_VENUE_DISAGREEMENT']){
    const r=runChaosScenario(name);
    assert.equal(r.pass,true,name);
    assert.equal(r.actualState,'DEGRADED',name);
    assert.equal(r.canResearch,true,name);
  }
});

test('integrity subsystem corruption hard-stops',()=>{
  for(const name of ['AUDIT_LEDGER_CORRUPTION','MARKET_FABRIC_CORRUPTION','RELEASE_REGISTRY_CORRUPTION','MULTI_SYSTEM_FAILURE']){
    const r=runChaosScenario(name);
    assert.equal(r.pass,true,name);
    assert.equal(r.actualState,'SAFE_STOP',name);
  }
});

test('full chaos suite passes every declared institutional expectation',()=>{
  const suite=runChaosSuite();
  assert.equal(suite.failed,0);
  assert.equal(suite.executionInvariant,true);
  assert.equal(suite.passRate,1);
});
