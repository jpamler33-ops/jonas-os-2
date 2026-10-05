import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createBiggjAgentAutolearnHook } from './biggj-agent-autolearn-hook.mjs';
import { createBiggjAgentCoordinator } from './biggj-agent-coordinator.mjs';

// Exercise the actual bot adapter without booting network clients, persistence,
// timers or any order path. The prepared hook/coordinator/bus remain real.
const source=readFileSync(new URL('./bot.mjs',import.meta.url),'utf8');
const start=source.indexOf('const biggjAgentRuntimeEnabled=');
const end=source.indexOf('let forecastOutcomeMemoryBackoffUntil=',start);
assert.ok(start>=0&&end>start);
const adapter=source.slice(start,end);

function harness({enabled='1',hookFactory,overrides={}}={}){
  let now=Date.now();
  let pressured=false;
  let summaryCalls=0;
  let timerSequence=0;
  let peakTimers=0;
  const timers=new Map();
  const errors=[];
  const operations=[];
  const summary=state=>{summaryCalls++;return state;};
  const input=Object.freeze({mode:'TEST',dataNeeds:['PIT_COVERAGE'],nextTasks:[]});
  const context={
    Error,
    process:{env:{TCX_AGENT_RUNTIME_ENABLED:enabled}},
    Date:{now:()=>now},
    running:true,
    setTimeout:(fn,delay)=>{
      const timer={id:++timerSequence,unref(){}};
      timers.set(timer,{fn,at:now+delay});
      peakTimers=Math.max(peakTimers,timers.size);
      return timer;
    },
    clearTimeout:timer=>timers.delete(timer),
    createBiggjAgentAutolearnHook:hookFactory||(()=>createBiggjAgentAutolearnHook({coordinator:createBiggjAgentCoordinator({minCycleMs:0})})),
    servingMemoryPressure:()=>({pressured}),
    shadowCompetitionState:input,shadowCompetitionSummary:summary,
    experimentGovernorState:input,experimentGovernorSummary:summary,
    featureResearchState:input,featureResearchSummary:summary,
    indicatorEvolutionHealthy:true,indicatorEvolutionState:input,indicatorEvolutionSummary:summary,
    parallelStrategyWorldsHealthy:true,parallelStrategyWorldsState:input,parallelStrategyWorldsSummary:summary,
    walletResearchManagerHealthy:true,walletResearchManagerState:input,shadowPortfolioLedger:input,
    shadowWalletResearchManagerSummary:summary,walletResearchTargetArmTrades:25,walletResearchMaxEpochMs:60_000,
    shadowResearchActivitySummary:summary,
    autonomousResearchFactoryHealthy:true,autonomousResearchFactoryState:input,autonomousResearchTrainingFactorySummary:summary,
    observability:{},recordError:(_,row)=>errors.push(row),recordOperation:(_,row)=>operations.push(row),
    console:{error:()=>{}},
    ...overrides
  };
  const api=vm.runInNewContext(adapter+'\n({run:afterBiggjAgentAutolearn,snapshot:biggjAgentRuntimeSnapshot,hook:biggjAgentAutolearnHook,pending:()=>biggjAgentPendingRun,stop:()=>{running=false;clearBiggjAgentPendingRun();}})',context);
  function advance(ms){
    const target=now+ms;
    for(;;){
      const due=[...timers].filter(([,x])=>x.at<=target).sort((a,b)=>a[1].at-b[1].at)[0];
      if(!due)break;
      now=due[1].at;
      timers.delete(due[0]);
      due[1].fn();
    }
    now=target;
  }
  return {api,input,errors,operations,advance,pressure:value=>{pressured=value;},summaryCalls:()=>summaryCalls,timerCount:()=>timers.size,peakTimers:()=>peakTimers};
}

test('successful autolearn ingests existing evidence and coordinates six research roles without mutating inputs',()=>{
  const h=harness();
  const silentResult=Object.freeze({ok:true,symbol:'BTCUSDT',dataQuality:.9,issuance:Object.freeze({gate:'ABSTAIN'})});
  const before=JSON.stringify(silentResult);
  h.api.run(silentResult,Object.freeze({ruleCount:2}));
  const s=h.api.snapshot();
  assert.equal(s.enabled,true);
  assert.equal(s.healthy,true);
  assert.equal(s.invocations,1);
  assert.equal(s.coordinator.runtime.cycles,1);
  assert.equal(s.coordinator.runtime.bus.agents.length,6);
  assert.equal(s.coordinator.lastResult.evidence.ingested,9);
  assert.equal(s.coordinator.runtime.bus.queue.completed,5);
  assert.equal(s.execution,'SHADOW_ONLY');
  assert.equal(s.canExecute,false);
  assert.equal(s.canExecuteLive,false);
  assert.equal(s.automaticPrimaryMutation,false);
  assert.equal(JSON.stringify(silentResult),before);
  assert.equal(h.input.nextTasks.length,0);
  const judgement=h.api.hook.coordinator.runtime.bus.audit.find(x=>x.type==='JUDGE_DECISION');
  assert.equal(judgement.data.decision,'MORE_DATA');
  assert.equal(h.operations[0].ok,true);
});

test('unsuccessful or skipped autolearn does not build summaries or run agents',()=>{
  const h=harness();
  for(const value of [null,undefined,{ok:false},{skipped:true}])h.api.run(value);
  assert.equal(h.summaryCalls(),0);
  assert.equal(h.api.snapshot().invocations,0);
});

test('multi-market bursts are throttled before snapshots and resume after one minute',()=>{
  const h=harness();
  h.api.run({ok:true,symbol:'BTCUSDT'});
  const calls=h.summaryCalls();
  const snapshotSize=JSON.stringify(h.api.snapshot()).length;
  for(let i=0;i<1000;i++)h.api.run({ok:true,symbol:'ETHUSDT'});
  assert.equal(h.summaryCalls(),calls);
  assert.equal(h.api.snapshot().invocations,1);
  assert.equal(JSON.stringify(h.api.snapshot()).length,snapshotSize);
  h.advance(60_000);
  h.api.run({ok:true,symbol:'ETHUSDT'});
  assert.equal(h.api.snapshot().invocations,2);
  assert.equal(h.api.snapshot().coordinator.runtime.cycles,2);
});

test('serving memory pressure defers only agents and permits retry on recovery',()=>{
  const h=harness();
  h.pressure(true);
  h.api.run({ok:true});
  assert.equal(h.summaryCalls(),0);
  assert.equal(h.api.snapshot().invocations,0);
  assert.equal(h.api.snapshot().nextEligibleAt,null);
  assert.equal(h.api.snapshot().pending,true);
  assert.equal(h.timerCount(),1);
  h.pressure(false);
  h.advance(7500);
  assert.equal(h.api.snapshot().invocations,1);
  assert.equal(h.api.snapshot().coordinator.runtime.cycles,1);
  assert.equal(h.api.snapshot().pending,false);
  assert.equal(h.timerCount(),0);
  h.advance(120_000);
  assert.equal(h.api.snapshot().invocations,1);
});

test('1000 pressured calls retain only one pending observation and one retry timer',()=>{
  const h=harness();
  h.pressure(true);
  for(let i=0;i<1000;i++)h.api.run({ok:true,symbol:'COIN'+i,issuance:{largeForecast:Array(100).fill('unused')}});
  assert.equal(h.api.snapshot().invocations,0);
  assert.equal(h.api.snapshot().pendingSymbol,'COIN999');
  assert.equal(h.timerCount(),1);
  assert.equal(h.peakTimers(),1);
  assert.equal(h.api.pending().silentResult.issuance,undefined);
  assert.equal(h.summaryCalls(),0);
});

test('newest successful autolearn replaces pending input before exactly one deferred cycle',()=>{
  const h=harness();
  let consumed=null;
  const realRun=h.api.hook.afterAutolearn;
  h.api.hook.afterAutolearn=input=>{consumed=input;return realRun(input);};
  h.pressure(true);
  h.api.run({ok:true,symbol:'BTCUSDT',dataQuality:.5});
  h.api.run({ok:false,symbol:'IGNORED'});
  h.api.run({ok:true,symbol:'ETHUSDT',dataQuality:.9});
  h.pressure(false);
  h.advance(7500);
  assert.equal(consumed.silentResult.symbol,'ETHUSDT');
  assert.equal(consumed.silentResult.dataQuality,.9);
  assert.equal(h.api.snapshot().invocations,1);
  assert.equal(h.api.snapshot().pending,false);
});

test('continued pressure backs off with bounded delay and never grows the timer queue',()=>{
  const h=harness();
  h.pressure(true);
  h.api.run({ok:true,symbol:'BTCUSDT'});
  h.advance(7500);
  assert.equal(h.api.snapshot().retryAttempts,2);
  h.advance(15_000);
  assert.equal(h.api.snapshot().retryAttempts,3);
  h.advance(300_000);
  assert.equal(h.api.snapshot().retryAttempts,3);
  assert.equal(h.timerCount(),1);
  assert.equal(h.peakTimers(),1);
  assert.equal(h.api.snapshot().invocations,0);
  h.pressure(false);
  h.advance(30_000);
  assert.equal(h.api.snapshot().invocations,1);
  assert.equal(h.timerCount(),0);
});

test('deferred cycle preserves PRIMARY inputs, SHADOW_ONLY and no live authority',()=>{
  const h=harness();
  const forecast=Object.freeze({ok:true,symbol:'BTCUSDT',issuance:Object.freeze({primaryPolicy:'UNCHANGED',canExecuteLive:false})});
  const before=JSON.stringify(forecast);
  h.pressure(true);
  h.api.run(forecast);
  h.pressure(false);
  h.advance(7500);
  const s=h.api.snapshot();
  assert.equal(JSON.stringify(forecast),before);
  assert.equal(s.execution,'SHADOW_ONLY');
  assert.equal(s.canExecute,false);
  assert.equal(s.canExecuteLive,false);
  assert.equal(s.automaticPrimaryMutation,false);
  assert.equal(s.coordinator.runtime.lastCycle.automaticPrimaryMutation,false);
});

test('shutdown clears the pending run and cancels its timer',()=>{
  const h=harness();
  h.pressure(true);
  h.api.run({ok:true});
  h.api.stop();
  h.pressure(false);
  h.advance(60_000);
  assert.equal(h.api.snapshot().invocations,0);
  assert.equal(h.api.snapshot().pending,false);
  assert.equal(h.timerCount(),0);
});

test('summary errors are contained and exposed without changing the forecast result',()=>{
  const h=harness({overrides:{shadowCompetitionSummary:()=>{throw new Error('SUMMARY_FAILED');}}});
  const result=Object.freeze({ok:true,symbol:'BTCUSDT'});
  assert.doesNotThrow(()=>h.api.run(result));
  assert.equal(result.ok,true);
  assert.equal(h.api.snapshot().healthy,false);
  assert.equal(h.api.snapshot().lastError,'SUMMARY_FAILED');
  assert.equal(h.errors[0].scope,'biggj_agent_runtime');
});

test('coordinator errors are visible and a later successful cycle clears the error',()=>{
  const hook=createBiggjAgentAutolearnHook({coordinator:createBiggjAgentCoordinator({minCycleMs:0})});
  const realRun=hook.afterAutolearn;
  hook.afterAutolearn=()=>({status:'ERROR',error:'AGENT_CYCLE_FAILED'});
  const h=harness({hookFactory:()=>hook});
  assert.doesNotThrow(()=>h.api.run({ok:true}));
  assert.equal(h.api.snapshot().lastError,'AGENT_CYCLE_FAILED');
  assert.equal(h.operations[0].ok,false);
  hook.afterAutolearn=realRun;
  h.advance(60_000);
  h.api.run({ok:true});
  assert.equal(h.api.snapshot().healthy,true);
  assert.equal(h.api.snapshot().lastError,null);
});

test('disabled integration never invokes agents',()=>{
  const h=harness({enabled:'0'});
  h.api.run({ok:true});
  assert.equal(h.api.snapshot().enabled,false);
  assert.equal(h.api.snapshot().invocations,0);
  assert.equal(h.summaryCalls(),0);
});

test('bot invokes the adapter only for successful silent autolearn and exposes read-only status',()=>{
  assert.match(source,/if\(issuanceSource==='TCX_AUTOLEARN_V1'\)afterBiggjAgentAutolearn\(silentResult,learnedChallengerRun\?\.lab\|\|null\);\s*return silentResult;/);
  assert.equal((source.match(/biggjAgentRuntime:biggjAgentRuntimeSnapshot\(\)/g)||[]).length,3);
});

test('ABSTAIN remains a valid forecast outcome instead of poisoning AutoLearn SLO success',()=>{
  assert.match(source,/name:silent\?'institutional_forecast_autolearn':'institutional_forecast',[\s\S]{0,220}ok:auditHealthyAfter,/);
  assert.doesNotMatch(source,/ok:auditHealthyAfter&&issuance\.gate!=='ABSTAIN'/);
});