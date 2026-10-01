import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BIGGJ_RESEARCH_ACCELERATOR_VERSION,
  buildOutcomeDeadlinePlan,
  buildResearchResourceBudget,
  buildResearchBundlePlan,
  buildHistoricalReplayPlan,
  buildBiggjResearchAccelerator
} from './biggj-research-accelerator.mjs';

const T0=Date.UTC(2026,8,30,22,0,0);

test('outcome scheduler wakes near the next due forecast instead of fixed polling',()=>{
  const p=buildOutcomeDeadlinePlan([
    {id:'a',symbol:'BTCUSDT',horizonId:'5m',status:'PENDING',asOf:T0-300_000,dueAt:T0+12_000},
    {id:'b',symbol:'ETHUSDT',horizonId:'15m',status:'PENDING',asOf:T0-300_000,dueAt:T0+70_000}
  ],{now:T0,minPollMs:5_000,maxPollMs:60_000});
  assert.equal(p.nextDueAt,T0+12_000);
  assert.equal(p.recommendedDelayMs,12_000);
  assert.equal(p.semantics.deadlineSchedulingDoesNotCreateFutureEvidence,true);
});

test('due forecasts trigger fast but bounded polling',()=>{
  const p=buildOutcomeDeadlinePlan([
    {id:'a',symbol:'BTCUSDT',status:'PENDING',dueAt:T0-1}
  ],{now:T0,minPollMs:5_000,maxPollMs:60_000});
  assert.equal(p.dueNow,1);
  assert.equal(p.recommendedDelayMs,5_000);
  assert.deepEqual(p.dueSymbols,['BTCUSDT']);
});

test('resource budget accelerates only when headroom exists',()=>{
  const fast=buildResearchResourceBudget({
    memory:{heapUsedMb:100,rssMb:300,externalMb:10},
    limits:{heapMb:320,rssMb:720,externalMb:64},
    configuredMaxIssuedPerSweep:3,
    configuredHistoryRows:1200
  });
  assert.equal(fast.mode,'ACCELERATED');
  assert.equal(fast.autoLearnIssueBudget,3);
  assert.equal(fast.shadowReplayHistoryRows,1200);

  const pressured=buildResearchResourceBudget({
    memory:{heapUsedMb:330,rssMb:820,externalMb:70},
    limits:{heapMb:320,rssMb:720,externalMb:64},
    configuredMaxIssuedPerSweep:3,
    configuredHistoryRows:1200
  });
  assert.equal(pressured.mode,'MEMORY_PROTECT');
  assert.equal(pressured.autoLearnIssueBudget,1);
  assert.equal(pressured.shadowReplayHistoryRows,500);
});

test('balanced memory state can use configured sequential issue budget',()=>{
  const balanced=buildResearchResourceBudget({
    memory:{heapUsedMb:285,rssMb:593,externalMb:6},
    limits:{heapMb:380,rssMb:780,externalMb:64},
    configuredMaxIssuedPerSweep:3,
    configuredHistoryRows:1200
  });
  assert.equal(balanced.mode,'BALANCED');
  assert.ok(balanced.pressure>=.64&&balanced.pressure<.82);
  assert.equal(balanced.autoLearnIssueBudget,3);
  assert.equal(balanced.shadowReplayHistoryRows,900);
  assert.equal(balanced.semantics.balancedIssueBudgetReliesOnSequentialAdmissionGuards,true);
});

test('resource planner does not mistake completed persistence ArrayBuffers for live external pressure',()=>{
  const tail=buildResearchResourceBudget({
    memory:{heapUsedMb:277,rssMb:603,externalMb:57,arrayBuffersMb:51},
    limits:{heapMb:380,rssMb:780,externalMb:64},
    configuredMaxIssuedPerSweep:3,
    configuredHistoryRows:1200
  });
  assert.equal(tail.mode,'BALANCED');
  assert.equal(tail.autoLearnIssueBudget,3);
  assert.equal(tail.memory.externalMb,57);
  assert.equal(tail.memory.arrayBuffersMb,51);
  assert.equal(tail.memory.planningExternalMb,6);
  assert.equal(tail.semantics.arrayBufferBackedExternalExcludedFromPlanningPressure,true);
  assert.equal(tail.semantics.perIssueAdmissionMustUseFullExternalMemory,true);

  const realExternal=buildResearchResourceBudget({
    memory:{heapUsedMb:277,rssMb:603,externalMb:57,arrayBuffersMb:0},
    limits:{heapMb:380,rssMb:780,externalMb:64},
    configuredMaxIssuedPerSweep:3,
    configuredHistoryRows:1200
  });
  assert.equal(realExternal.mode,'CAUTIOUS');
  assert.equal(realExternal.autoLearnIssueBudget,1);
});

test('bundle plan exposes fan-out without pretending observations are independent',()=>{
  const p=buildResearchBundlePlan({
    leverage:{topBundles:[
      {dataNeed:'POINT_IN_TIME_FORWARD_OBSERVATIONS',taskCount:5,taskIds:['a','b','c','d','e'],subjects:['x','y'],reuseScore:1}
    ]},
    nextTasks:[
      {taskId:'a',stalled:true},
      {taskId:'b',stalled:true},
      {taskId:'c',stalled:false}
    ]
  });
  assert.equal(p.bundleCount,1);
  assert.equal(p.topBundles[0].estimatedFanOut,5);
  assert.equal(p.topBundles[0].stalledTaskCount,2);
  assert.equal(p.stalledFusionCandidates,1);
  assert.equal(p.semantics.fanOutNeverDuplicatesOneObservationIntoIndependentEpisodes,true);
});

test('historical replay runs only on new PIT history and never becomes prospective evidence',()=>{
  const p=buildHistoricalReplayPlan({
    historyRows:900,
    historyProgressAt:T0,
    lastReplayProgressAt:T0-60_000,
    resourceBudget:{shadowReplayHistoryRows:650}
  });
  assert.equal(p.shouldRun,true);
  assert.equal(p.replayWindowRows,650);
  assert.equal(p.semantics.replayDoesNotCountAsProspectiveEvidence,true);

  const stale=buildHistoricalReplayPlan({
    historyRows:900,
    historyProgressAt:T0,
    lastReplayProgressAt:T0,
    resourceBudget:{shadowReplayHistoryRows:650}
  });
  assert.equal(stale.shouldRun,false);
});

test('full accelerator preserves science and execution guards',()=>{
  const a=buildBiggjResearchAccelerator({
    factorySummary:{
      leverage:{topBundles:[{dataNeed:'X',taskCount:4,taskIds:['a','b','c','d'],reuseScore:.75}]},
      nextTasks:[]
    },
    pendingForecasts:[{id:'p',symbol:'BTCUSDT',status:'PENDING',dueAt:T0+10_000}],
    memory:{heapUsedMb:120,rssMb:350,externalMb:12},
    limits:{heapMb:320,rssMb:720,externalMb:64},
    configuredMaxIssuedPerSweep:3,
    configuredHistoryRows:1200,
    historyRows:800,
    historyProgressAt:T0,
    lastReplayProgressAt:T0-1,
    now:T0
  });
  assert.equal(a.version,BIGGJ_RESEARCH_ACCELERATOR_VERSION);
  assert.equal(a.execution,'SHADOW_ONLY');
  assert.equal(a.canExecuteLive,false);
  assert.equal(a.automaticPrimaryMutation,false);
  assert.equal(a.semantics.accelerateEvidenceUseNotScientificThresholds,true);
  assert.ok(a.accelerationPotential>0);
});


test('runtime wiring uses adaptive cadence and bounded budgets',async()=>{
  const fs=await import('node:fs/promises');
  const bot=await fs.readFile(new URL('./bot.mjs',import.meta.url),'utf8');
  const leverage=await fs.readFile(new URL('./biggj-research-leverage-engine.mjs',import.meta.url),'utf8');
  assert.match(bot,/TCX_AUTOLEARN_MAX_ISSUED_PER_SWEEP \|\| 3/);
  assert.match(bot,/TCX_SHADOW_COMPETITION_EVAL_MS \|\| 15\*60_000/);
  assert.match(bot,/effectiveAutoLearnMaxIssuedPerSweep/);
  assert.match(bot,/effectiveShadowCompetitionHistoryRows/);
  assert.match(bot,/buildOutcomeDeadlinePlan/);
  assert.match(bot,/biggjResearchAccelerator/);
  assert.match(leverage,/batchReuse:\.10/);
  assert.match(leverage,/basePriority:\.15/);
});


test('runtime separates lightweight outcome resolution from heavy AutoLearn memory gate',async()=>{
  const fs=await import('node:fs/promises');
  const bot=await fs.readFile(new URL('./bot.mjs',import.meta.url),'utf8');
  assert.match(bot,/forecastOutcomeMemoryBackoffUntil/);
  assert.match(bot,/issueHeapMb:forecastPersistenceHeapHeadroomMb/);
  assert.match(bot,/forecastOutcomeMemoryBackoffUntil=Date\.now\(\)\+30_000/);
  assert.match(bot,/adaptiveShadowAutoHeapMb/);
  assert.match(bot,/adaptiveShadowAutoRssMb/);
  assert.match(bot,/effectiveShadowCompetitionHistoryRows/);
});


test('runtime throughput tuning uses lightweight pending rows and bounded adaptive replay memory',async()=>{
  const fs=await import('node:fs/promises');
  const bot=await fs.readFile(new URL('./bot.mjs',import.meta.url),'utf8');
  assert.match(bot,/TCX_AUTOLEARN_HEAP_HEADROOM_MB \|\| 350/);
  assert.match(bot,/function pendingForecastOutcomeRows\(\)/);
  assert.match(bot,/pendingForecasts:pendingForecastOutcomeRows\(\)/);
  assert.match(bot,/arrayBuffersMb:Math\.round\(\(memory\.arrayBuffers\|\|0\)\/1024\/1024\)/);
  assert.match(bot,/const pending=pendingForecastOutcomeRows\(\)/);
  assert.match(bot,/adaptiveShadowHardHeapMb/);
  assert.match(bot,/effectiveShadowWorkerHeapMb/);
  assert.match(bot,/maxOldGenerationSizeMb:effectiveShadowWorkerHeapMb/);
  assert.match(bot,/maxAutoHeapMb:345/);
  assert.match(bot,/maxHardHeapMb:370/);
  assert.match(bot,/minWorkerHeapMb:128/);
});


test('successful issuance heap spikes use bounded settle instead of full memory-failure backoff',async()=>{
  const fs=await import('node:fs/promises');
  const bot=await fs.readFile(new URL('./bot.mjs',import.meta.url),'utf8');
  assert.match(bot,/TCX_AUTOLEARN_POST_ISSUE_SETTLE_MS \|\| 45000/);
  assert.match(bot,/let transientPostIssuePressure=false/);
  assert.match(bot,/postAdmission\.exceeded\.every\(x=>String\(x\)==='HEAP'\)/);
  assert.match(bot,/autolearn transient post-issue settle/);
  assert.match(bot,/reason:'SUCCESSFUL_ISSUANCE_HEAP_SPIKE'/);
  assert.match(bot,/nextAction:'GC_GUARDED_RECHECK'/);
  assert.match(bot,/if\(transientPostIssuePressure&&!memoryPressure\)/);
});


test('runtime gives heavy research GC priority after shared-slot waits',async()=>{
  const fs=await import('node:fs/promises');
  const bot=await fs.readFile(new URL('./bot.mjs',import.meta.url),'utf8');
  assert.match(bot,/SHADOW_REPLAY_POST_WAIT/);
  assert.match(bot,/cooldownBypassOverageMb:30/);
  assert.match(bot,/triggerHeapMb:forecastPersistenceHeapHeadroomMb/);
  assert.doesNotMatch(bot,/triggerHeapMb:Math\.max\(280,forecastPersistenceHeapHeadroomMb-10\)/);
});


test('autolearn resource budget is measured after bounded GC precheck',async()=>{
  const fs=await import('node:fs/promises');
  const bot=await fs.readFile(new URL('./bot.mjs',import.meta.url),'utf8');
  const gcAt=bot.indexOf("AUTOLEARN_BUDGET_PRECHECK");
  const budgetAt=bot.indexOf("researchAcceleration=currentResearchAccelerator(Date.now())");
  assert.ok(gcAt>=0);
  assert.ok(budgetAt>gcAt);
  assert.match(bot,/Math\.floor\(autoLearnHeapHeadroomMb\*0\.80\)/);
  assert.match(bot,/triggerHeapMb:autoLearnBudgetGcTriggerMb/);
  assert.match(bot,/cooldownBypassOverageMb:10/);
  assert.match(bot,/budgetGcExecuted/);
  assert.match(bot,/budgetGcReclaimedMb/);
  assert.match(bot,/Math\.min\(autoLearnMaxIssuedPerSweep,researchAcceleration\.resource\.autoLearnIssueBudget\)/);
});
