import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';

import { sha256 } from './institutional-kernel.mjs';
import { evaluateModelPromotion, createModelPromotionRecord } from './model-promotion-ladder.mjs';
import {
  openModelCandidateRegistry,
  registerModelCandidate,
  recordModelCandidateEvaluation,
  recordModelCandidatePromotion,
  recordModelRollback,
  verifyModelCandidateRegistry,
  modelCandidateRegistrySummary
} from './model-candidate-registry.mjs';

function science(){
  const core={
    version:'TCX_SCIENTIFIC_VALIDITY_V1',asOf:1000,gate:'PASS',coverage:1,
    requiredGuardCount:1,usableRequiredGuardCount:1,guards:[],reasons:[],
    epistemic:'SCIENTIFIC_SUPPORT_DIAGNOSTIC_NOT_FORECAST_PROBABILITY',
    executionMode:'SHADOW_ONLY',action:'ABSTAIN',canExecute:false
  };
  return {...core,fingerprint:sha256(core)};
}

function candidate(){
  return {
    candidateId:'cand-1',
    modelHash:'a'.repeat(64),
    configHash:'b'.repeat(64),
    createdAt:900,
    dataCutoffAt:850,
    parentReleaseId:'release-1',
    source:'OFFLINE_BUILDER',
    executionMode:'SHADOW_ONLY'
  };
}

function promotionEvaluation(){
  return evaluateModelPromotion({
    asOf:1000,
    candidate:{
      ...candidate(),
      source:'OFFLINE_BUILDER'
    },
    scientificValidity:science(),
    software:{
      testsPassed:true,pitLeakagePassed:true,temporalOosPassed:true,
      deterministicReplayPassed:true,releaseManifestBound:true,rollbackReady:true
    },
    evaluation:{
      cases:300,independentEpisodes:120,
      candidate:{brier:.18,logLoss:.56,intervalCoverage:.80,highConfidenceWrongRate:.03},
      incumbent:{brier:.20,logLoss:.59,intervalCoverage:.77,highConfidenceWrongRate:.04}
    }
  });
}

async function fixture(){
  const dir=await mkdtemp(path.join(os.tmpdir(),'tcx-candidates-'));
  return openModelCandidateRegistry(path.join(dir,'registry.jsonl'));
}

test('candidate registry is append-only and idempotent',async()=>{
  const r=await fixture();
  const a=await registerModelCandidate(r,candidate(),{registeredAt:950});
  const b=await registerModelCandidate(r,candidate(),{registeredAt:960});
  assert.equal(a.duplicate,false);
  assert.equal(b.duplicate,true);
  assert.equal(r.seq,1);
  assert.equal(verifyModelCandidateRegistry(r.records).ok,true);
});

test('candidate cannot train on information after creation',async()=>{
  const r=await fixture();
  await assert.rejects(
    registerModelCandidate(r,{...candidate(),dataCutoffAt:901},{registeredAt:950}),
    /dataCutoffAt/
  );
});

test('promotion requires registered candidate and matching ready evaluation',async()=>{
  const r=await fixture();
  await registerModelCandidate(r,candidate(),{registeredAt:950});
  const evaluation=promotionEvaluation();
  const ev=await recordModelCandidateEvaluation(r,evaluation,{recordedAt:1050});
  assert.equal(ev.duplicate,false);

  const promotion=createModelPromotionRecord({
    evaluation,
    promotedAt:1100,
    previousReleaseId:'release-1',
    candidateReleaseId:'release-2'
  });
  const p=await recordModelCandidatePromotion(r,promotion,{recordedAt:1110});
  assert.equal(p.duplicate,false);
  assert.equal(verifyModelCandidateRegistry(r.records).ok,true);
  assert.equal(modelCandidateRegistrySummary(r).candidates[0].status,'PROMOTED');
});

test('duplicate evaluation and promotion are idempotent',async()=>{
  const r=await fixture();
  await registerModelCandidate(r,candidate(),{registeredAt:950});
  const evaluation=promotionEvaluation();
  await recordModelCandidateEvaluation(r,evaluation,{recordedAt:1050});
  const ev2=await recordModelCandidateEvaluation(r,evaluation,{recordedAt:1060});
  assert.equal(ev2.duplicate,true);

  const promotion=createModelPromotionRecord({
    evaluation,promotedAt:1100,previousReleaseId:'release-1',candidateReleaseId:'release-2'
  });
  await recordModelCandidatePromotion(r,promotion,{recordedAt:1110});
  const p2=await recordModelCandidatePromotion(r,promotion,{recordedAt:1120});
  assert.equal(p2.duplicate,true);
});

test('rollback is an audit record and never mutates production itself',async()=>{
  const r=await fixture();
  await registerModelCandidate(r,candidate(),{registeredAt:950});
  const evaluation=promotionEvaluation();
  await recordModelCandidateEvaluation(r,evaluation,{recordedAt:1050});
  const promotion=createModelPromotionRecord({
    evaluation,promotedAt:1100,previousReleaseId:'release-1',candidateReleaseId:'release-2'
  });
  await recordModelCandidatePromotion(r,promotion,{recordedAt:1110});
  const rb=await recordModelRollback(r,{
    candidateId:'cand-1',
    fromReleaseId:'release-2',
    toReleaseId:'release-1',
    reason:'post-promotion regression',
    rolledBackAt:1200
  });
  assert.equal(rb.record.payload.productionMutationPerformed,false);
  assert.equal(modelCandidateRegistrySummary(r).candidates[0].status,'ROLLED_BACK');
});

test('historical candidate-registry tampering is detected',async()=>{
  const r=await fixture();
  await registerModelCandidate(r,candidate(),{registeredAt:950});
  const raw=(await readFile(r.filePath,'utf8')).trim().split('\n').map(JSON.parse);
  raw[0].payload.source='TAMPERED';
  await writeFile(r.filePath,raw.map(JSON.stringify).join('\n')+'\n');
  const reopened=await openModelCandidateRegistry(r.filePath);
  assert.equal(reopened.healthy,false);
  assert.equal(reopened.verification.error,'RECORD_HASH_MISMATCH');
});

test('promotion without matching evaluation is refused',async()=>{
  const r=await fixture();
  await registerModelCandidate(r,candidate(),{registeredAt:950});
  const evaluation=promotionEvaluation();
  const promotion=createModelPromotionRecord({
    evaluation,promotedAt:1100,previousReleaseId:'release-1',candidateReleaseId:'release-2'
  });
  await assert.rejects(
    recordModelCandidatePromotion(r,promotion,{recordedAt:1110}),
    /matching promotion-ready evaluation/
  );
});
