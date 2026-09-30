import test from 'node:test';
import assert from 'node:assert/strict';
import { buildForecastLearningSummary } from './forecast-learning-center.mjs';

function runtime(entries=[],issuances=[]){
  return {
    journal:{all:()=>structuredClone(entries)},
    issuances:structuredClone(issuances)
  };
}

function resolved(i,{horizonId='5m',horizonMs=300000,correct=true}={}){
  return {
    id:'x'+i,
    symbol:'BTCUSDT',
    horizonId,
    horizonMs,
    asOf:i*horizonMs,
    status:'RESOLVED',
    resolution:{
      topCorrect:correct,
      brier:correct?.2:.9,
      logLoss:correct?.3:1.2,
      intervalMiss:!correct,
      absoluteReturnError:correct?.001:.01
    }
  };
}

test('learning metrics stay hidden until minimum sample count',()=>{
  const entries=Array.from({length:10},(_,i)=>resolved(i));
  const s=buildForecastLearningSummary(runtime(entries),{minDisplaySamples:30});
  assert.equal(s.phase,'LEARNING');
  assert.equal(s.horizons[0].metricsReady,false);
  assert.equal(s.horizons[0].metrics.directionalAccuracy,null);
});

test('learning metrics become available after enough resolved outcomes',()=>{
  const entries=Array.from({length:30},(_,i)=>resolved(i,{correct:i<21}));
  const s=buildForecastLearningSummary(runtime(entries),{minDisplaySamples:30});
  assert.equal(s.phase,'MEASURING');
  assert.equal(s.horizons[0].metricsReady,true);
  assert.equal(s.horizons[0].metrics.directionalAccuracy,0.7);
  assert.ok(Number.isFinite(s.horizons[0].metrics.meanBrier));
});

test('promotion data gate requires both cases and independent episodes',()=>{
  const entries=Array.from({length:8},(_,i)=>resolved(i));
  const s=buildForecastLearningSummary(runtime(entries),{
    promotionPolicy:{minCases:8,minIndependentEpisodes:8}
  });
  assert.equal(s.promotion.dataReady,true);
  assert.equal(s.phase,'CANDIDATE_READY');
  assert.equal(s.promotion.productionMutationAllowed,false);
});

test('pending and expired outcomes are counted separately',()=>{
  const entries=[
    resolved(1),
    {id:'p',symbol:'BTCUSDT',horizonId:'5m',horizonMs:300000,asOf:600000,status:'PENDING'},
    {id:'e',symbol:'BTCUSDT',horizonId:'5m',horizonMs:300000,asOf:900000,status:'EXPIRED'}
  ];
  const s=buildForecastLearningSummary(runtime(entries));
  assert.equal(s.resolvedOutcomes,1);
  assert.equal(s.pendingOutcomes,1);
  assert.equal(s.expiredOutcomes,1);
});
