import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp } from 'node:fs/promises';

import {
  createExperimentGovernor,
  evaluateExperimentGovernor,
  experimentGovernorSummary,
  loadExperimentGovernor,
  saveExperimentGovernor
} from './forecast-experiment-governor.mjs';

const HASH='a'.repeat(64);

function artifact(id,seed){
  return {
    candidateId:id,
    fingerprint:String(seed).repeat(64).slice(0,64),
    modelHash:String(seed+1).repeat(64).slice(0,64),
    configHash:String(seed+2).repeat(64).slice(0,64)
  };
}

function paired(n,delta,{regime='RANGE',horizonMs=300000}={}){
  return Array.from({length:n},(_,i)=>({
    id:'p'+i,
    symbol:'BTCUSDT',
    timestamp:1_000_000+i*horizonMs,
    resolvedAt:1_000_000+(i+1)*horizonMs,
    horizonMs,
    regimeId:i%2?regime:'TREND',
    candidate:{
      brier:.5+delta,
      logLoss:.7+delta,
      intervalMiss:false,
      topProbability:.7,
      topCorrect:true
    },
    incumbent:{
      brier:.5,
      logLoss:.7,
      intervalMiss:false,
      topProbability:.7,
      topCorrect:true
    },
    deltas:{
      brier:delta,
      logLoss:delta,
      intervalMiss:0,
      topCorrect:0
    }
  }));
}

function candidate(id,label,delta,n=20,seed=1){
  return {
    blueprintId:id,
    label,
    artifact:artifact('FC-'+id,seed),
    lastEvaluation:{
      evaluation:{
        cases:n,
        independentEpisodes:n,
        candidate:{
          brier:.5+delta,
          logLoss:.7+delta,
          intervalCoverage:.8,
          highConfidenceWrongRate:.1
        },
        incumbent:{
          brier:.5,
          logLoss:.7,
          intervalCoverage:.8,
          highConfidenceWrongRate:.1
        },
        deltas:{
          brier:delta,
          logLoss:delta,
          intervalCoverage:0,
          highConfidenceWrongRate:0
        }
      },
      diagnostics:{
        temporalOosPassed:true,
        pairedIndependent:paired(n,delta)
      }
    }
  };
}

function competition(candidates){
  return {
    status:'ACTIVE',
    dataCutoffAt:900_000,
    incumbentConfigHash:HASH,
    candidates
  };
}

function policy(extra={}){
  return {
    minCases:20,
    minIndependentEpisodes:20,
    familyAlpha:.05,
    minBrierImprovement:.01,
    maxLogLossRegression:.02,
    maxHighConfidenceWrongRateRegression:.02,
    maxCoverageErrorRegression:.02,
    targetIntervalCoverage:.8,
    maxSubgroupBrierRegression:.03,
    maxSubgroupLogLossRegression:.06,
    minSubgroupCases:5,
    permutationIterations:512,
    bootstrapIterations:300,
    ...extra
  };
}

test('governor freezes generation participants and cutoff',()=>{
  const comp=competition([
    candidate('STRONG','Strong',-.10,20,1),
    candidate('WEAK','Weak',.01,20,4)
  ]);
  const state=createExperimentGovernor({
    competition:comp,
    championConfigHash:HASH,
    championReleaseId:'R1',
    generationNumber:1,
    now:1_000_000,
    policy:policy()
  });
  assert.equal(state.status,'ACTIVE');
  assert.equal(state.participants.length,2);
  assert.equal(state.dataCutoffAt,comp.dataCutoffAt);
  assert.equal(state.productionMutationPerformed,false);
  assert.ok(state.participants.every(p=>p.status==='SHADOW_TESTING'));
});

test('governor waits for the precommitted decision sample',()=>{
  const comp=competition([candidate('A','A',-.10,8,1)]);
  const state=createExperimentGovernor({
    competition:comp,
    championConfigHash:HASH,
    now:1_000_000,
    policy:policy()
  });
  const next=evaluateExperimentGovernor(state,{competition:comp,now:2_000_000});
  assert.equal(next.status,'ACTIVE');
  assert.equal(next.participants[0].status,'MEASURING');
  assert.equal(next.evidencePacks.length,0);
});

test('Holm-controlled decision promotes only statistically supported candidate',()=>{
  const strong=candidate('STRONG','Strong',-.10,20,1);
  const weak=candidate('WEAK','Weak',.01,20,4);
  const comp=competition([strong,weak]);
  const state=createExperimentGovernor({
    competition:comp,
    championConfigHash:HASH,
    now:1_000_000,
    policy:policy()
  });
  const next=evaluateExperimentGovernor(state,{competition:comp,now:2_000_000});
  const byId=new Map(next.participants.map(p=>[p.blueprintId,p]));
  assert.equal(next.status,'COMPLETE_PROMOTION_REVIEW_REQUIRED');
  assert.equal(byId.get('STRONG').status,'PROMOTION_CANDIDATE');
  assert.equal(byId.get('WEAK').status,'REJECTED');
  assert.ok(byId.get('STRONG').decision.holmAdjustedP<=.05);
  assert.ok(byId.get('STRONG').decision.brierCi95.upper<0);
  assert.equal(next.productionMutationPerformed,false);
  assert.equal(next.canExecute,false);
  assert.equal(next.evidencePacks.length,2);
});

test('terminal generation cannot be re-peeked or rewritten by later outcomes',()=>{
  const strong=candidate('STRONG','Strong',-.10,20,1);
  const comp=competition([strong]);
  const state=createExperimentGovernor({
    competition:comp,
    championConfigHash:HASH,
    now:1_000_000,
    policy:policy()
  });
  const decided=evaluateExperimentGovernor(state,{competition:comp,now:2_000_000});
  const changed=competition([candidate('STRONG','Strong',.20,100,1)]);
  const again=evaluateExperimentGovernor(decided,{competition:changed,now:3_000_000});
  assert.deepEqual(again,decided);
});

test('participant fingerprint changes trigger fail-closed integrity hold',()=>{
  const c=candidate('A','A',-.10,20,1);
  const comp=competition([c]);
  const state=createExperimentGovernor({
    competition:comp,
    championConfigHash:HASH,
    now:1_000_000,
    policy:policy()
  });
  const tampered=structuredClone(comp);
  tampered.candidates[0].artifact.fingerprint='f'.repeat(64);
  const next=evaluateExperimentGovernor(state,{competition:tampered,now:2_000_000});
  assert.equal(next.status,'ACTIVE');
  assert.equal(next.participants[0].status,'INTEGRITY_HOLD');
});

test('summary exposes lifecycle counts without granting execution',()=>{
  const comp=competition([candidate('A','A',-.10,8,1)]);
  const state=createExperimentGovernor({competition:comp,championConfigHash:HASH,now:1_000_000,policy:policy()});
  const next=evaluateExperimentGovernor(state,{competition:comp,now:2_000_000});
  const s=experimentGovernorSummary(next);
  assert.equal(s.counts.MEASURING,1);
  assert.equal(s.executionMode,'SHADOW_ONLY');
  assert.equal(s.productionMutationPerformed,false);
});

test('governor state survives persistence round trip',async()=>{
  const comp=competition([candidate('A','A',-.10,8,1)]);
  const state=createExperimentGovernor({competition:comp,championConfigHash:HASH,now:1_000_000,policy:policy()});
  const dir=await mkdtemp(path.join(os.tmpdir(),'tcx-governor-'));
  const file=path.join(dir,'state.json');
  await saveExperimentGovernor(file,state);
  const loaded=await loadExperimentGovernor(file);
  assert.equal(loaded.generationId,state.generationId);
  assert.equal(loaded.participants.length,1);
  assert.equal(loaded.productionMutationPerformed,false);
});
