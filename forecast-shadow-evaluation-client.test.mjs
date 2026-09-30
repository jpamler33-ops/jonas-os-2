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
  forecastHistoryHasAdvanced
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
  assert.equal(AUTOLEARN_MEMORY_ADMISSION_VERSION,'TCX_AUTOLEARN_MEMORY_ADMISSION_V2');
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


test('autolearn V2 resumes at production idle baseline while retaining issue headroom',()=>{
  const resumed=evaluateAutoLearnMemoryAdmission({
    phase:'RESUME',
    heapUsedMb:283,
    rssMb:559,
    externalMb:7,
    issueHeapMb:320,
    issueRssMb:720,
    issueExternalMb:64
  });
  assert.equal(resumed.allowed,true);
  assert.deepEqual(resumed.exceeded,[]);
  assert.equal(resumed.limits.heapUsedMb,300);

  const hysteresisEdge=evaluateAutoLearnMemoryAdmission({
    phase:'RESUME',
    heapUsedMb:300,
    rssMb:559,
    externalMb:7,
    issueHeapMb:320,
    issueRssMb:720,
    issueExternalMb:64
  });
  assert.equal(hysteresisEdge.allowed,false);
  assert.deepEqual(hysteresisEdge.exceeded,['HEAP']);

  const issueStillProtected=evaluateAutoLearnMemoryAdmission({
    phase:'ISSUE',
    heapUsedMb:320,
    rssMb:559,
    externalMb:7,
    issueHeapMb:320,
    issueRssMb:720,
    issueExternalMb:64
  });
  assert.equal(issueStillProtected.allowed,false);
  assert.deepEqual(issueStillProtected.exceeded,['HEAP']);
});
