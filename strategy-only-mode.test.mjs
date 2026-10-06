import test from 'node:test';
import assert from 'node:assert/strict';
import {strategyOnlyModeFromEnv,allowStrategyOnlySubsystem,strategyOnlySafetyInvariant} from './strategy-only-mode.mjs';

test('strategy-only defaults to W6 and preserves fail-closed execution',()=>{
  const p=strategyOnlyModeFromEnv({});
  assert.equal(p.enabled,true);
  assert.equal(p.activeStrategy,'W6_USER_99K_60S');
  assert.equal(p.execution,'SHADOW_ONLY');
  assert.equal(p.canExecute,false);
  assert.equal(p.canExecuteLive,false);
  assert.equal(p.automaticProductionPromotion,false);
  assert.equal(strategyOnlySafetyInvariant(p),true);
});

test('strategy-only blocks competing research/trading subsystems',()=>{
  const p=strategyOnlyModeFromEnv({TCX_STRATEGY_ONLY_MODE:'true'});
  for(const name of p.disabledWhenEnabled)assert.equal(allowStrategyOnlySubsystem(name,p),false,name);
  assert.equal(allowStrategyOnlySubsystem('W6_USER_99K_60S',p),true);
  assert.equal(allowStrategyOnlySubsystem('W6_DISCOVERY_FEEDS',p),true);
});

test('explicit off restores full-stack eligibility without changing safety policy',()=>{
  const p=strategyOnlyModeFromEnv({TCX_STRATEGY_ONLY_MODE:'false'});
  assert.equal(p.enabled,false);
  assert.equal(allowStrategyOnlySubsystem('PARALLEL_STRATEGY_WORLDS',p),true);
  assert.equal(strategyOnlySafetyInvariant(p),true);
});
