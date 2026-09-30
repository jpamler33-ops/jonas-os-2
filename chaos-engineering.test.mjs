import test from 'node:test';
import assert from 'node:assert/strict';

import {
  chaosScenarioNames,
  runChaosScenario,
  runChaosSuite
} from './chaos-engineering.mjs';

test('complete chaos suite preserves SHADOW_ONLY execution invariant',()=>{
  const suite=runChaosSuite({now:1_000_000});
  assert.equal(suite.failed,0);
  assert.equal(suite.executionInvariant,true);
  assert.equal(suite.passRate,1);
  assert.ok(suite.total>=10);
});

test('every chaos scenario is deterministic and fail-safe',()=>{
  for(const name of chaosScenarioNames()){
    const a=runChaosScenario(name,{now:1_000_000});
    const b=runChaosScenario(name,{now:1_000_000});
    assert.deepEqual(a,b,name);
    assert.equal(a.pass,true,name);
    assert.equal(a.canExecute,false,name);
    assert.equal(a.invariantOk,true,name);
  }
});

test('corrupt institutional state produces SAFE_STOP',()=>{
  for(const name of ['AUDIT_LEDGER_CORRUPTION','MARKET_FABRIC_CORRUPTION','RELEASE_REGISTRY_CORRUPTION','MULTI_SYSTEM_FAILURE']){
    const r=runChaosScenario(name,{now:1_000_000});
    assert.equal(r.actualState,'SAFE_STOP',name);
    assert.equal(r.canExecute,false,name);
  }
});
