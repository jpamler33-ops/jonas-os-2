import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';

import { sha256 } from './institutional-kernel.mjs';
import { evaluateModelPromotion, createModelPromotionRecord } from './model-promotion-ladder.mjs';
import { evaluateEpistemicIntegrity } from './science-runtime/epistemic-integrity.mjs';
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

function epistemic(){
  return evaluateEpistemicIntegrity({
    asOf:1000,
    subjectId:'MODEL:CAND-1',
    authorities:[
      {authorityId:'AUTH-1',canonicalControllerId:'AUTH-CONTROL-1',observedAt:700,availableAt:710},
      {authorityId:'AUTH-2',canonicalControllerId:'AUTH-CONTROL-2',observedAt:705,availableAt:715}
    ],
    resolverClaims:[
      {
        canonicalControllerId:'CTRL-1',resolverId:'RESOLVER-1',authorityId:'AUTH-1',
        operatorDomain:'OP-1',trustDomain:'TRUST-1',controlDomain:'CONTROL-1',
        signed:true,signatureValid:true,observedAt:800,availableAt:810,provenanceIds:['L1']
      },
      {
        canonicalControllerId:'CTRL-1',resolverId:'RESOLVER-2',authorityId:'AUTH-2',
        operatorDomain:'OP-2',trustDomain:'TRUST-2',controlDomain:'CONTROL-2',
        signed:true,signatureValid:true,observedAt:820,availableAt:830,provenanceIds:['L2']
      }
    ],
    claims:[{claimId:'CLAIM-1',assumptionIds:['A1'],evidenceIds:['E1','E2'],required:true}],
    assumptions:[{assumptionId:'A1'}],
    dependencies:[],
    lineageFacts:[
      {id:'L1',classification:'OBSERVED',parentIds:[],observedAt:600,availableAt:610},
      {id:'L2',classification:'OBSERVED',parentIds:[],observedAt:620,availableAt:630}
    ],
    discoveryChannels:[
      {channelId:'DISC-1',controllerId:'DISC-CONTROL-1',lineageIds:['L1'],observedAt:850,availableAt:860},
      {channelId:'DISC-2',controllerId:'DISC-CONTROL-2',lineageIds:['L2'],observedAt:855,availableAt:865}
    ],
    evidence:[
      {evidenceId:'E1',classification:'OBSERVED',observedAt:700,availableAt:720,provenanceIds:['L1']},
      {evidenceId:'E2',classification:'OBSERVED',observedAt:730,availableAt:740,provenanceIds:['L2']},
      {evidenceId:'ECAL',classification:'OBSERVED',observedAt:750,availableAt:760,provenanceIds:['L1','L2']}
    ],
    coverage:{observedLineages:2,expectedLineages:2,minimumCoverage:.8,calibrated:true,calibrationEvidenceId:'ECAL'}
  });
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
    epistemicIntegrity:epistemic(),
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
