import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp } from 'node:fs/promises';

import {
  buildShadowCandidateBlueprints,
  createShadowCompetition,
  refreshShadowCompetitionHypotheses,
  evaluateShadowCompetition,
  shadowCompetitionSummary,
  loadShadowCompetition,
  saveShadowCompetition
} from './forecast-shadow-competition.mjs';

const MIN=60_000;
const H5=5*MIN;

function config(){
  return {
    featureIds:['trend','pressure'],
    horizons:[
      {id:'5m',horizonMs:H5,flatThreshold:.001,topK:80,minSimilarity:.05,analogBandwidth:1.5,independenceWindowMs:H5}
    ],
    minTrainingCases:8,
    minRegimeCases:4,
    minAnalogCount:4,
    minAnalogEffectiveSamples:2,
    minAnalogIndependentEpisodes:2,
    minDataQuality:.5,
    minRegimeConfidence:.2,
    calibrationMinCases:500,
    reliabilityMinCases:500,
    intervalCalibrationMinCases:500,
    driftRecentCases:20,
    driftBaselineCases:40,
    pathMinCompleteTrajectories:4,
    pathMinEffectiveSamples:2,
    pathTopK:40,
    pathMinSimilarity:.05,
    recencyHalfLifeMs:30*24*60*60_000,
    ridgeLambda:1
  };
}

function row(i,{start=100_000}={}){
  const ts=start+i*10*MIN;
  const trend=Math.sin(i/5)*.7;
  const pressure=.5*trend+.1*Math.cos(i);
  return {
    id:'r'+start+'-'+i,
    symbol:'BTCUSDT',
    timestamp:ts,
    availableAt:ts,
    resolvedAt:ts+H5,
    horizonMs:H5,
    features:{trend,pressure},
    regimeId:trend>.2?'TREND_UP':trend<-.2?'TREND_DOWN':'RANGE',
    forwardReturn:.004*trend+.001*pressure,
    quality:1
  };
}

test('candidate blueprints preserve target semantics',()=>{
  const base=config();
  const blueprints=buildShadowCandidateBlueprints(base);
  assert.equal(blueprints.length,4);
  for(const b of blueprints){
    assert.deepEqual(b.config.featureIds,base.featureIds);
    assert.deepEqual(
      b.config.horizons.map(h=>[h.id,h.horizonMs,h.flatThreshold]),
      base.horizons.map(h=>[h.id,h.horizonMs,h.flatThreshold])
    );
  }
});

test('competition waits until seed history is large enough',()=>{
  const base=config();
  const history=Array.from({length:10},(_,i)=>row(i));
  const s=createShadowCompetition({
    historyRows:history,
    incumbentConfig:base,
    parentReleaseId:'R1',
    now:history.at(-1).resolvedAt+1,
    minSeedRows:40
  });
  assert.equal(s.status,'WAITING_FOR_SEED_HISTORY');
  assert.equal(s.candidates.length,0);
});

test('competition creates fixed plus controlled hypotheses and waits for OOS',()=>{
  const base=config();
  const history=Array.from({length:50},(_,i)=>row(i));
  const now=history.at(-1).resolvedAt+1000;
  const s=createShadowCompetition({
    historyRows:history,
    incumbentConfig:base,
    parentReleaseId:'R1',
    now,
    minSeedRows:40
  });
  assert.equal(s.status,'ACTIVE');
  assert.ok(s.candidates.length>=4);
  assert.ok(s.candidates.some(c=>c.blueprintId.startsWith('HYP_')));
  assert.ok(s.candidates.every(c=>c.status==='WAITING_FOR_OOS'));
  assert.ok(s.candidates.every(c=>c.artifact.executionMode==='SHADOW_ONLY'));
  assert.equal(s.productionMutationPerformed,false);

  const e=evaluateShadowCompetition(s,{historyRows:history,incumbentConfig:base,asOf:now});
  assert.equal(e.competition.oosRows,0);
  assert.equal(e.competition.evaluatedCandidates,0);
});

test('new out-of-sample history is walk-forward evaluated against incumbent',()=>{
  const base=config();
  const training=Array.from({length:50},(_,i)=>row(i));
  const createdAt=training.at(-1).resolvedAt+1000;
  const state=createShadowCompetition({
    historyRows:training,
    incumbentConfig:base,
    parentReleaseId:'R1',
    now:createdAt,
    minSeedRows:40
  });
  const futureStart=state.dataCutoffAt+10*MIN;
  const future=Array.from({length:20},(_,i)=>row(i,{start:futureStart}));
  const all=[...training,...future];
  const asOf=future.at(-1).resolvedAt+1000;
  const evaluated=evaluateShadowCompetition(state,{
    historyRows:all,
    incumbentConfig:base,
    asOf,
    minimumTrainCases:8,
    promotionPolicy:{minCases:200,minIndependentEpisodes:80}
  });
  const summary=shadowCompetitionSummary(evaluated);
  assert.equal(summary.status,'ACTIVE');
  assert.ok(summary.candidates.length>=4);
  assert.ok(summary.candidates.some(c=>c.cases>0));
  assert.equal(evaluated.productionMutationPerformed,false);
});

test('competition state survives persistence round trip',async()=>{
  const base=config();
  const history=Array.from({length:50},(_,i)=>row(i));
  const now=history.at(-1).resolvedAt+1000;
  const state=createShadowCompetition({historyRows:history,incumbentConfig:base,parentReleaseId:'R1',now,minSeedRows:40});
  const dir=await mkdtemp(path.join(os.tmpdir(),'tcx-shadow-competition-'));
  const file=path.join(dir,'state.json');
  await saveShadowCompetition(file,state);
  const loaded=await loadShadowCompetition(file);
  assert.equal(loaded.version,state.version);
  assert.equal(loaded.dataCutoffAt,state.dataCutoffAt);
  assert.equal(loaded.candidates.length,state.candidates.length);
});


test('refresh adds controlled hypotheses to a legacy fixed-only competition without changing cutoff',()=>{
  const base=config();
  const history=Array.from({length:50},(_,i)=>row(i));
  const now=history.at(-1).resolvedAt+1000;
  const current=createShadowCompetition({historyRows:history,incumbentConfig:base,parentReleaseId:'R1',now,minSeedRows:40});
  const legacy={...current,candidates:current.candidates.filter(c=>!c.blueprintId.startsWith('HYP_')),hypothesisGenerator:null};
  const cutoff=legacy.dataCutoffAt;
  const refreshed=refreshShadowCompetitionHypotheses(legacy,{
    historyRows:history,
    incumbentConfig:base,
    asOf:now+1000,
    maxGeneratedHypotheses:4
  });
  assert.equal(refreshed.dataCutoffAt,cutoff);
  assert.ok(refreshed.candidates.length>legacy.candidates.length);
  assert.ok(refreshed.candidates.some(c=>c.blueprintId.startsWith('HYP_')));
  assert.equal(refreshed.productionMutationPerformed,false);
});
