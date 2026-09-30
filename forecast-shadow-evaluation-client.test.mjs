import test from 'node:test';
import assert from 'node:assert/strict';
import {
  runForecastShadowEvaluationWorker,
  FORECAST_SHADOW_EVALUATION_WORKER_VERSION,
  FORECAST_SHADOW_EVALUATION_ADMISSION_VERSION,
  AUTOLEARN_MEMORY_ADMISSION_VERSION,
  evaluateShadowWorkerAdmission,
  evaluateAutoLearnMemoryAdmission,
  forecastHistoryProgressAt,
  forecastHistoryHasAdvanced,
  shadowWorkerHeadroomRetryPolicy,
  SHADOW_WORKER_HEADROOM_RETRY_POLICY_VERSION
} from './forecast-shadow-evaluation-client.mjs';

test('fixed-size history windows detect newly resolved rows by point-in-time progress',()=>{
  const old=Array.from({length:3},(_,i)=>({timestamp:100+i,availableAt:110+i,resolvedAt:120+i}));
  const newer=[old[1],old[2],{timestamp:104,availableAt:130,resolvedAt:140}];
  assert.equal(forecastHistoryProgressAt(old),122);
  assert.equal(forecastHistoryHasAdvanced(newer,forecastHistoryProgressAt(old)),true);
  assert.equal(forecastHistoryHasAdvanced(old,forecastHistoryProgressAt(old)),false);
});

test('shadow evaluation runs out-of-band and returns bounded state',async()=>{
  const ticks=[];
  const timer=setInterval(()=>ticks.push(Date.now()),1);
  const result=await runForecastShadowEvaluationWorker({
    competitionState:null,
    experimentGovernorState:null,
    historyRows:[],
    incumbentConfig:{featureIds:[],horizons:[]},
    releaseId:'test',
    minSeedRows:40,
    minimumTrainCases:40,
    now:1_000_000
  },{timeoutMs:30_000,maxOldGenerationSizeMb:128});
  clearInterval(timer);

  assert.equal(result.competitionState.status,'WAITING_FOR_SEED_HISTORY');
  assert.equal(result.historyRows,0);
  assert.equal(result.experimentGovernorState,null);
  assert.ok(ticks.length>0);
  assert.equal(FORECAST_SHADOW_EVALUATION_WORKER_VERSION,'TCX_FORECAST_SHADOW_EVALUATION_WORKER_V1');
});


test('adaptive shadow worker admission requires real serving headroom',()=>{
  const healthy=evaluateShadowWorkerAdmission({mode:'AUTO',heapUsedMb:196,rssMb:359,externalMb:4});
  assert.equal(healthy.allowed,true);
  assert.equal(healthy.reason,'MEMORY_HEADROOM_AVAILABLE');

  const adaptiveBlock=evaluateShadowWorkerAdmission({mode:'AUTO',heapUsedMb:270,rssMb:500,externalMb:4});
  assert.equal(adaptiveBlock.allowed,false);
  assert.equal(adaptiveBlock.reason,'ADAPTIVE_MEMORY_PRESSURE');

  const externalBlock=evaluateShadowWorkerAdmission({mode:'AUTO',heapUsedMb:220,rssMb:500,externalMb:110});
  assert.equal(externalBlock.allowed,false);
  assert.equal(externalBlock.reason,'ADAPTIVE_MEMORY_PRESSURE');

  const forcedStillFailsHard=evaluateShadowWorkerAdmission({mode:'ON',heapUsedMb:310,rssMb:500,externalMb:4});
  assert.equal(forcedStillFailsHard.allowed,false);
  assert.equal(forcedStillFailsHard.reason,'HARD_MEMORY_PRESSURE');

  const forcedExternalFailsHard=evaluateShadowWorkerAdmission({
    mode:'ON',heapUsedMb:220,rssMb:500,externalMb:170,hardExternalMb:160
  });
  assert.equal(forcedExternalFailsHard.allowed,false);
  assert.equal(forcedExternalFailsHard.reason,'HARD_MEMORY_PRESSURE');
  assert.equal(forcedExternalFailsHard.limits.hardExternalMb,160);

  assert.equal(evaluateShadowWorkerAdmission({mode:'OFF',heapUsedMb:100,rssMb:200}).allowed,false);
  assert.equal(FORECAST_SHADOW_EVALUATION_ADMISSION_VERSION,'TCX_FORECAST_SHADOW_EVALUATION_ADMISSION_V2');
});


test('shadow worker adaptive pressure gets bounded retry without changing admission thresholds',()=>{
  const adaptive=evaluateShadowWorkerAdmission({
    mode:'AUTO',
    heapUsedMb:274,
    rssMb:488,
    externalMb:5,
    autoHeapMb:260,
    autoRssMb:620,
    autoExternalMb:64,
    hardHeapMb:300,
    hardRssMb:900,
    hardExternalMb:160
  });
  assert.equal(adaptive.allowed,false);
  assert.equal(adaptive.reason,'ADAPTIVE_MEMORY_PRESSURE');

  const first=shadowWorkerHeadroomRetryPolicy(adaptive,{
    attempt:0,
    elapsedMs:0,
    maxAttempts:8,
    maxWaitMs:20_000,
    pollMs:2_500
  });
  assert.equal(first.retry,true);
  assert.equal(first.delayMs,2500);
  assert.equal(first.terminalReason,'WAIT_FOR_NATURAL_HEADROOM');
  assert.equal(first.thresholdsUnchanged,true);

  const exhausted=shadowWorkerHeadroomRetryPolicy(adaptive,{
    attempt:8,
    elapsedMs:20_000,
    maxAttempts:8,
    maxWaitMs:20_000,
    pollMs:2_500
  });
  assert.equal(exhausted.retry,false);
  assert.equal(exhausted.terminalReason,'ADAPTIVE_WINDOW_EXHAUSTED');
  assert.equal(SHADOW_WORKER_HEADROOM_RETRY_POLICY_VERSION,'TCX_SHADOW_WORKER_HEADROOM_RETRY_POLICY_V1');
});

test('hard memory pressure and disabled worker never enter headroom retry loop',()=>{
  const hard=evaluateShadowWorkerAdmission({
    mode:'AUTO',
    heapUsedMb:305,
    rssMb:500,
    externalMb:5
  });
  const hardPolicy=shadowWorkerHeadroomRetryPolicy(hard,{attempt:0,elapsedMs:0,maxWaitMs:20_000});
  assert.equal(hard.reason,'HARD_MEMORY_PRESSURE');
  assert.equal(hardPolicy.retry,false);
  assert.equal(hardPolicy.terminalReason,'HARD_MEMORY_PRESSURE');

  const disabled=evaluateShadowWorkerAdmission({mode:'OFF',heapUsedMb:200,rssMb:400,externalMb:5});
  const disabledPolicy=shadowWorkerHeadroomRetryPolicy(disabled,{attempt:0,elapsedMs:0,maxWaitMs:20_000});
  assert.equal(disabledPolicy.retry,false);
  assert.equal(disabledPolicy.terminalReason,'DISABLED');
});

test('recovered headroom ends retry immediately',()=>{
  const healthy=evaluateShadowWorkerAdmission({
    mode:'AUTO',
    heapUsedMb:257,
    rssMb:512,
    externalMb:7,
    autoHeapMb:260,
    autoRssMb:620,
    autoExternalMb:64
  });
  const policy=shadowWorkerHeadroomRetryPolicy(healthy,{attempt:3,elapsedMs:7500,maxWaitMs:20_000});
  assert.equal(healthy.allowed,true);
  assert.equal(policy.retry,false);
  assert.equal(policy.terminalReason,'HEADROOM_AVAILABLE');
});

test('autolearn admission blocks external-memory pressure even when heap and rss look safe',()=>{
  const r=evaluateAutoLearnMemoryAdmission({
    phase:'ISSUE',
    heapUsedMb:240,
    rssMb:610,
    externalMb:69,
    issueHeapMb:320,
    issueRssMb:720,
    issueExternalMb:64
  });
  assert.equal(r.allowed,false);
  assert.deepEqual(r.exceeded,['EXTERNAL']);
  assert.equal(r.reason,'MEMORY_PRESSURE');
  assert.equal(AUTOLEARN_MEMORY_ADMISSION_VERSION,'TCX_AUTOLEARN_MEMORY_ADMISSION_V1');
});

test('autolearn resume uses lower hysteresis thresholds',()=>{
  const issue=evaluateAutoLearnMemoryAdmission({
    phase:'ISSUE',
    heapUsedMb:270,
    rssMb:610,
    externalMb:45,
    issueHeapMb:320,
    issueRssMb:720,
    issueExternalMb:64,
    resumeHeapMb:280,
    resumeRssMb:620,
    resumeExternalMb:48
  });
  assert.equal(issue.allowed,true);

  const resume=evaluateAutoLearnMemoryAdmission({
    phase:'RESUME',
    heapUsedMb:281,
    rssMb:610,
    externalMb:45,
    issueHeapMb:320,
    issueRssMb:720,
    issueExternalMb:64,
    resumeHeapMb:280,
    resumeRssMb:620,
    resumeExternalMb:48
  });
  assert.equal(resume.allowed,false);
  assert.deepEqual(resume.exceeded,['HEAP']);
});
