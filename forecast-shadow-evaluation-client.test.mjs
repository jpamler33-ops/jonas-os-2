import test from 'node:test';
import assert from 'node:assert/strict';
import {
  runForecastShadowEvaluationWorker,
  FORECAST_SHADOW_EVALUATION_WORKER_VERSION,
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
