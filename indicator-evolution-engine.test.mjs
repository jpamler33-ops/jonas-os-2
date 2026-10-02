import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import {
  INDICATOR_EVOLUTION_ENGINE_VERSION,
  createIndicatorEvolutionState,
  refreshIndicatorEvolutionEngine,
  indicatorEvolutionSummary,
  loadIndicatorEvolutionState,
  saveIndicatorEvolutionState
} from './indicator-evolution-engine.mjs';

const H=300000;
const EXPERIMENTS=[
  {id:'TA_5M_Z',label:'Synthetic Z · 5M',family:'Z',timeframe:'5m',featureIds:['research.ta.5m.z'],representativeFeatureId:'research.ta.5m.z',source:'TEST'},
  {id:'TA_5M_CONST',label:'Synthetic Constant · 5M',family:'CONST',timeframe:'5m',featureIds:['research.ta.5m.const'],representativeFeatureId:'research.ta.5m.const',source:'TEST'}
];

function config(extra={}){
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
    pathMinSimilarity:.01,
    ...extra
  };
}
function entry(i,{start=1_000_000}={}){
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
    features:{x,y,'research.ta.5m.z':z,'research.ta.5m.const':1},
    status:'RESOLVED',
    resolution:{resolvedAt:asOf+H+1000,actualReturn:ret,actualDirection:ret>.001?'UP':ret<-.001?'DOWN':'FLAT'}
  };
}
function policy(extra={}){
  return {
    minSeedRows:20,
    minOosCases:12,
    minIndependentEpisodes:10,
    minNewOosCasesPerDecision:10,
    minBrierImprovement:.001,
    familyFdrQ:.20,
    maxLogLossRegression:.2,
    maxHighConfidenceWrongRateRegression:.2,
    maxCoverageErrorRegression:.2,
    permutationIterations:300,
    bootstrapIterations:250,
    supportMilestonesForCore:2,
    failuresBeforeRetire:2,
    minIndependentEpisodesForRetire:10,
    contextMinSamples:8,
    contextMinBrierImprovement:.001,
    contextSupportMilestones:2,
    redundancyAbsSpearman:.95,
    redundancyMinRows:20,
    reactivationNewOosCases:12,
    maxEvaluationsPerCycle:2,
    maxEvidenceEventsPerIndicator:20,
    ...extra
  };
}

test('engine starts every indicator in probation and never gains execution authority',()=>{
  const s=createIndicatorEvolutionState({experiments:EXPERIMENTS,incumbentConfig:config(),now:1});
  assert.equal(s.version,INDICATOR_EVOLUTION_ENGINE_VERSION);
  assert.equal(s.indicators.length,2);
  assert.ok(s.indicators.every(x=>x.status==='PROBATION'&&x.active===true));
  assert.equal(s.canExecuteLive,false);
  assert.equal(s.automaticProductionMutation,false);
  assert.equal(s.automaticPromotion,false);
});

test('seed is frozen before any walk-forward indicator evaluation begins',()=>{
  let s=createIndicatorEvolutionState({experiments:EXPERIMENTS,incumbentConfig:config(),now:1});
  const seed=Array.from({length:24},(_,i)=>entry(i));
  const r=refreshIndicatorEvolutionEngine(s,{
    journalEntries:seed,incumbentConfig:config(),experiments:EXPERIMENTS,
    asOf:seed.at(-1).resolution.resolvedAt+1,policy:policy()
  });
  s=r.state;
  assert.equal(r.delta.seeded,2);
  assert.ok(s.indicators.every(x=>x.seedCutoffAt!=null));
  assert.ok(s.indicators.every(x=>x.status==='VALIDATING'));
  assert.ok(s.indicators.every(x=>x.lastEvaluation==null));
});

test('fresh OOS rows trigger bounded evaluations with PIT diagnostics and FDR fields',()=>{
  let s=createIndicatorEvolutionState({experiments:EXPERIMENTS,incumbentConfig:config(),now:1});
  const seed=Array.from({length:24},(_,i)=>entry(i));
  s=refreshIndicatorEvolutionEngine(s,{
    journalEntries:seed,incumbentConfig:config(),experiments:EXPERIMENTS,
    asOf:seed.at(-1).resolution.resolvedAt+1,policy:policy()
  }).state;
  const futureStart=seed.at(-1).resolution.resolvedAt+20*60_000;
  const future=Array.from({length:36},(_,i)=>entry(100+i,{start:futureStart}));
  const r=refreshIndicatorEvolutionEngine(s,{
    journalEntries:[...seed,...future],incumbentConfig:config(),experiments:EXPERIMENTS,
    asOf:future.at(-1).resolution.resolvedAt+1,policy:policy()
  });
  assert.equal(r.delta.evaluated,2);
  for(const x of r.state.indicators){
    assert.ok(x.lastEvaluation);
    assert.equal(x.lastEvaluation.temporalOosPassed,true);
    assert.equal(x.lastEvaluation.pitViolations,0);
    assert.ok(Number.isFinite(x.lastEvaluation.rawP));
    assert.ok(Number.isFinite(x.lastEvaluation.q));
    assert.ok(x.independentEpisodes>=10);
  }
  const summary=indicatorEvolutionSummary(r.state);
  assert.equal(summary.canExecuteLive,false);
  assert.equal(summary.catalogSize,2);
});

test('repeated non-useful evidence retires rather than deletes an indicator, then permits later reactivation trial',()=>{
  const only=[EXPERIMENTS[1]];
  let s=createIndicatorEvolutionState({experiments:only,incumbentConfig:config(),now:1});
  const seed=Array.from({length:24},(_,i)=>entry(i));
  s=refreshIndicatorEvolutionEngine(s,{
    journalEntries:seed,incumbentConfig:config(),experiments:only,
    asOf:seed.at(-1).resolution.resolvedAt+1,
    policy:policy({minBrierImprovement:.5,maxEvaluationsPerCycle:1})
  }).state;

  const start1=seed.at(-1).resolution.resolvedAt+20*60_000;
  const f1=Array.from({length:20},(_,i)=>entry(100+i,{start:start1}));
  s=refreshIndicatorEvolutionEngine(s,{
    journalEntries:[...seed,...f1],incumbentConfig:config(),experiments:only,
    asOf:f1.at(-1).resolution.resolvedAt+1,
    policy:policy({minBrierImprovement:.5,maxEvaluationsPerCycle:1})
  }).state;
  assert.equal(s.indicators[0].failureMilestones,1);

  const start2=f1.at(-1).resolution.resolvedAt+20*60_000;
  const f2=Array.from({length:20},(_,i)=>entry(200+i,{start:start2}));
  s=refreshIndicatorEvolutionEngine(s,{
    journalEntries:[...seed,...f1,...f2],incumbentConfig:config(),experiments:only,
    asOf:f2.at(-1).resolution.resolvedAt+1,
    policy:policy({minBrierImprovement:.5,maxEvaluationsPerCycle:1})
  }).state;
  assert.equal(s.indicators[0].status,'RETIRED');
  assert.equal(s.indicators[0].active,false);
  assert.ok(s.indicators[0].evidence.length>=2);

  const start3=f2.at(-1).resolution.resolvedAt+20*60_000;
  const f3=Array.from({length:20},(_,i)=>entry(300+i,{start:start3}));
  const r3=refreshIndicatorEvolutionEngine(s,{
    journalEntries:[...seed,...f1,...f2,...f3],incumbentConfig:config(),experiments:only,
    asOf:f3.at(-1).resolution.resolvedAt+1,
    policy:policy({minBrierImprovement:.5,maxEvaluationsPerCycle:1,reactivationNewOosCases:12})
  });
  assert.equal(r3.delta.reactivated,1);
  assert.equal(r3.state.indicators[0].reactivationCount,1);
});

test('baseline config changes force reseed instead of mixing incomparable evidence',()=>{
  let s=createIndicatorEvolutionState({experiments:EXPERIMENTS,incumbentConfig:config(),now:1});
  const seed=Array.from({length:24},(_,i)=>entry(i));
  s=refreshIndicatorEvolutionEngine(s,{
    journalEntries:seed,incumbentConfig:config(),experiments:EXPERIMENTS,
    asOf:seed.at(-1).resolution.resolvedAt+1,policy:policy()
  }).state;
  const changed=config({ridgeLambda:2});
  const r=refreshIndicatorEvolutionEngine(s,{
    journalEntries:seed,incumbentConfig:changed,experiments:EXPERIMENTS,
    asOf:seed.at(-1).resolution.resolvedAt+2,policy:policy()
  });
  assert.equal(r.state.baselineGeneration,2);
  assert.ok(r.state.indicators.every(x=>x.lastEvaluation==null));
  assert.ok(r.state.indicators.every(x=>x.evidence.some(e=>e.kind==='BASELINE_CHANGED_RESEED')));
});

test('indicator evolution state persists and reloads',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'biggj-indicator-evolution-'));
  const file=path.join(dir,'state.json');
  const s=createIndicatorEvolutionState({experiments:EXPERIMENTS,incumbentConfig:config(),now:1});
  await saveIndicatorEvolutionState(file,s);
  const loaded=await loadIndicatorEvolutionState(file,{incumbentConfig:config(),experiments:EXPERIMENTS,now:2});
  assert.equal(loaded.healthy,true);
  assert.equal(loaded.state.indicators.length,2);
  assert.equal(loaded.state.canExecuteLive,false);
});
