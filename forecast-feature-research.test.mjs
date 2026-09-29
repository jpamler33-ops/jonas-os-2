import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp } from 'node:fs/promises';

import {
  createFeatureResearchRound,
  advanceFeatureResearchRound,
  featureResearchSummary,
  featureResearchRowsFromJournal,
  loadFeatureResearch,
  saveFeatureResearch
} from './forecast-feature-research.mjs';

const H=300000;
const featureDef=[{id:'Z_SIGNAL',label:'Z Signal',featureIds:['research.z']}];

function config(){
  return {
    featureIds:['x','y'],
    horizons:[{id:'5m',horizonMs:H,flatThreshold:.001,topK:80,minSimilarity:.01,analogBandwidth:2,independenceWindowMs:H}],
    ridgeLambda:1,
    recencyHalfLifeMs:30*24*60*60_000,
    minTrainingCases:8,
    minRegimeCases:4,
    minAnalogCount:4,
    minAnalogEffectiveSamples:2,
    minAnalogIndependentEpisodes:2,
    minDataQuality:.5,
    minRegimeConfidence:.2,
    minNearestSimilarity:.01,
    calibrationMinCases:500,
    reliabilityMinCases:500,
    intervalCalibrationMinCases:500,
    driftRecentCases:20,
    driftBaselineCases:40,
    pathMinCompleteTrajectories:4,
    pathMinEffectiveSamples:2,
    pathTopK:40,
    pathMinSimilarity:.01
  };
}

function entry(i,{start=1_000_000,withZ=true}={}){
  const asOf=start+i*10*60_000;
  const z=Math.sin(i/3);
  const x=Math.sin(i/17)*.05;
  const y=Math.cos(i/19)*.05;
  const ret=.012*z+.0003*x;
  return {
    id:'BTCUSDT:'+asOf+':5m',
    symbol:'BTCUSDT',
    horizonId:'5m',
    horizonMs:H,
    asOf,
    dueAt:asOf+H,
    regimeId:i%2?'RANGE':'TREND',
    dataQuality:1,
    features:withZ?{x,y,'research.z':z}:{x,y},
    status:'RESOLVED',
    resolution:{
      resolvedAt:asOf+H+1000,
      actualReturn:ret,
      actualDirection:ret>.001?'UP':ret<-.001?'DOWN':'FLAT'
    }
  };
}

function policy(extra={}){
  return {
    minSeedRows:20,
    minCases:12,
    minIndependentEpisodes:12,
    familyAlpha:.10,
    minBrierImprovement:.001,
    maxLogLossRegression:.1,
    maxHighConfidenceWrongRateRegression:.1,
    maxCoverageErrorRegression:.1,
    targetIntervalCoverage:.8,
    permutationIterations:300,
    bootstrapIterations:250,
    ...extra
  };
}

test('journal rows preserve point-in-time feature values and resolved outcomes',()=>{
  const rows=featureResearchRowsFromJournal([entry(1),entry(2,{withZ:false})]);
  assert.equal(rows.length,2);
  assert.equal(rows[0].features['research.z']!==undefined,true);
  assert.equal(rows[1].features['research.z']===undefined,true);
  assert.ok(Number.isFinite(rows[0].forwardReturn));
});

test('feature round waits until enough seed observations exist',()=>{
  const s=createFeatureResearchRound({
    journalEntries:Array.from({length:10},(_,i)=>entry(i)),
    incumbentConfig:config(),
    features:featureDef,
    now:20_000_000,
    policy:policy()
  });
  assert.equal(s.status,'COLLECTING_SEED');
  assert.equal(s.coverage[0].cases,10);
  assert.equal(s.productionMutationPerformed,false);
});

test('feature round freezes cutoff and evaluates only later OOS rows',()=>{
  const seed=Array.from({length:24},(_,i)=>entry(i));
  const base=config();
  const s=createFeatureResearchRound({
    journalEntries:seed,
    incumbentConfig:base,
    features:featureDef,
    now:30_000_000,
    policy:policy()
  });
  assert.equal(s.status,'ACTIVE');
  const cutoff=s.dataCutoffAt;
  const futureStart=cutoff+20*60_000;
  const future=Array.from({length:30},(_,i)=>entry(i+100,{start:futureStart}));
  const next=advanceFeatureResearchRound(s,{
    journalEntries:[...seed,...future],
    incumbentConfig:base,
    now:future.at(-1).resolution.resolvedAt+1000,
    minimumTrainCases:8
  });
  assert.equal(next.dataCutoffAt,cutoff);
  assert.ok(['COMPLETE_SUPPORTED_FEATURES','COMPLETE_NO_SUPPORTED_FEATURES'].includes(next.status));
  assert.ok(['SUPPORTED','REJECTED'].includes(next.experiments[0].status));
  assert.ok(next.experiments[0].decision?.evidenceId);
  assert.equal(next.productionMutationPerformed,false);
  const summary=featureResearchSummary(next);
  assert.equal(summary.executionMode,'SHADOW_ONLY');
});

test('feature state survives persistence round trip',async()=>{
  const state=createFeatureResearchRound({
    journalEntries:Array.from({length:24},(_,i)=>entry(i)),
    incumbentConfig:config(),
    features:featureDef,
    now:30_000_000,
    policy:policy()
  });
  const dir=await mkdtemp(path.join(os.tmpdir(),'tcx-feature-research-'));
  const file=path.join(dir,'state.json');
  await saveFeatureResearch(file,state);
  const loaded=await loadFeatureResearch(file);
  assert.equal(loaded.version,state.version);
  assert.equal(loaded.dataCutoffAt,state.dataCutoffAt);
  assert.equal(loaded.experiments.length,1);
});
