import test from 'node:test';
import assert from 'node:assert/strict';
import { sha256 } from './institutional-kernel.mjs';
import { evaluateModelPromotion, createModelPromotionRecord, verifyModelPromotionRecord, verifyModelPromotionEvaluation } from './model-promotion-ladder.mjs';
import { evaluateEpistemicIntegrity } from './science-runtime/epistemic-integrity.mjs';

const A='a'.repeat(64),B='b'.repeat(64);

function science(gate='PASS'){
  const core={
    version:'TCX_SCIENTIFIC_VALIDITY_V1',asOf:1000,gate,coverage:1,
    requiredGuardCount:1,usableRequiredGuardCount:1,guards:[],reasons:[],
    epistemic:'SCIENTIFIC_SUPPORT_DIAGNOSTIC_NOT_FORECAST_PROBABILITY',
    executionMode:'SHADOW_ONLY',action:'ABSTAIN',canExecute:false
  };
  return {...core,fingerprint:sha256(core)};
}

function epistemic(candidateId='cand-1'){
  return evaluateEpistemicIntegrity({
    asOf:1000,
    subjectId:'MODEL:'+String(candidateId).toUpperCase(),
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
function args(){
  return {
    asOf:1000,
    candidate:{candidateId:'cand-1',modelHash:A,configHash:B,createdAt:900,parentReleaseId:'rel-old',source:'OFFLINE_RETRAIN',executionMode:'SHADOW_ONLY'},
    scientificValidity:science('PASS'),
    epistemicIntegrity:epistemic(),
    software:{testsPassed:true,pitLeakagePassed:true,temporalOosPassed:true,deterministicReplayPassed:true,releaseManifestBound:true,rollbackReady:true},
    evaluation:{
      cases:500,independentEpisodes:180,
      candidate:{brier:.18,logLoss:.62,intervalCoverage:.80,highConfidenceWrongRate:.12},
      incumbent:{brier:.20,logLoss:.66,intervalCoverage:.78,highConfidenceWrongRate:.13}
    }
  };
}

test('candidate promotes only after software science and OOS gates pass',()=>{
  const r=evaluateModelPromotion(args());
  assert.equal(r.decision,'PROMOTE_CANDIDATE');
  assert.equal(r.promotionReady,true);
  assert.equal(r.invariants.canExecute,false);
  assert.equal(verifyModelPromotionEvaluation(r).ok,true);
});

test('science abstain rejects candidate regardless of performance',()=>{
  const a=args();
  a.scientificValidity=science('ABSTAIN');
  const r=evaluateModelPromotion(a);
  assert.equal(r.decision,'REJECT_CANDIDATE');
  assert.ok(r.hardFailures.includes('SCIENTIFIC_VALIDITY_NOT_PASS'));
});

test('PIT leakage failure rejects candidate',()=>{
  const a=args();
  a.software.pitLeakagePassed=false;
  const r=evaluateModelPromotion(a);
  assert.equal(r.decision,'REJECT_CANDIDATE');
  assert.ok(r.hardFailures.includes('PIT_LEAKAGE_PASSED'));
});

test('insufficient OOS sample holds instead of promotes',()=>{
  const a=args();
  a.evaluation.cases=40;
  const r=evaluateModelPromotion(a);
  assert.equal(r.decision,'HOLD_CANDIDATE');
  assert.ok(r.holds.includes('INSUFFICIENT_EVALUATION_CASES'));
});

test('material calibration regression rejects candidate',()=>{
  const a=args();
  a.evaluation.candidate.brier=.24;
  const r=evaluateModelPromotion(a);
  assert.equal(r.decision,'REJECT_CANDIDATE');
  assert.ok(r.hardFailures.includes('BRIER_REGRESSION'));
});

test('statistically uninteresting parity is held',()=>{
  const a=args();
  a.evaluation.candidate={...a.evaluation.incumbent};
  const r=evaluateModelPromotion(a);
  assert.equal(r.decision,'HOLD_CANDIDATE');
  assert.ok(r.holds.includes('NO_MEANINGFUL_OOS_IMPROVEMENT'));
});

test('promotion record is immutable metadata, not a production mutation',()=>{
  const evaluation=evaluateModelPromotion(args());
  const record=createModelPromotionRecord({
    evaluation,promotedAt:1100,previousReleaseId:'rel-old',candidateReleaseId:'rel-new'
  });
  assert.equal(record.productionMutationPerformed,false);
  assert.equal(record.executionMode,'SHADOW_ONLY');
  assert.equal(record.canExecute,false);
});

test('non-ready candidate cannot receive promotion record',()=>{
  const a=args();
  a.evaluation.cases=10;
  const evaluation=evaluateModelPromotion(a);
  assert.throws(()=>createModelPromotionRecord({
    evaluation,promotedAt:1100,previousReleaseId:'a',candidateReleaseId:'b'
  }),/not promotion-ready/);
});

test('tampered promotion evaluation fails verification',()=>{
  const r=structuredClone(evaluateModelPromotion(args()));
  r.decision='REJECT_CANDIDATE';
  assert.equal(verifyModelPromotionEvaluation(r).ok,false);
});


test('promotion record verifier detects tampering',()=>{
  const evaluation=evaluateModelPromotion({
    asOf:1000,
    candidate:{
      candidateId:'cand-verify',
      modelHash:'a'.repeat(64),
      configHash:'b'.repeat(64),
      createdAt:900,
      parentReleaseId:'r1',
      source:'TEST',
      executionMode:'SHADOW_ONLY'
    },
    scientificValidity:science('PASS'),
    epistemicIntegrity:epistemic('cand-verify'),
    software:{
      testsPassed:true,
      pitLeakagePassed:true,
      temporalOosPassed:true,
      deterministicReplayPassed:true,
      releaseManifestBound:true,
      rollbackReady:true
    },
    evaluation:{
      cases:300,
      independentEpisodes:120,
      candidate:{brier:.18,logLoss:.56,intervalCoverage:.80,highConfidenceWrongRate:.03},
      incumbent:{brier:.20,logLoss:.59,intervalCoverage:.77,highConfidenceWrongRate:.04}
    }
  });
  const record=createModelPromotionRecord({
    evaluation,
    promotedAt:1100,
    previousReleaseId:'r1',
    candidateReleaseId:'r2'
  });
  assert.equal(verifyModelPromotionRecord(record).ok,true);
  const tampered={...record,candidateReleaseId:'r3'};
  assert.equal(verifyModelPromotionRecord(tampered).ok,false);
});


test('missing epistemic integrity holds candidate instead of promoting',()=>{
  const a=args();
  delete a.epistemicIntegrity;
  const r=evaluateModelPromotion(a);
  assert.equal(r.decision,'HOLD_CANDIDATE');
  assert.ok(r.holds.includes('EPISTEMIC_INTEGRITY_REQUIRED'));
  assert.equal(r.promotionReady,false);
});

test('epistemic ABSTAIN holds candidate even when metrics improve',()=>{
  const a=args();
  const bad=structuredClone(a.epistemicIntegrity);
  bad.gate='ABSTAIN';
  bad.fingerprint=sha256((({fingerprint,...core})=>core)(bad));
  a.epistemicIntegrity=bad;
  const r=evaluateModelPromotion(a);
  assert.equal(r.decision,'HOLD_CANDIDATE');
  assert.ok(r.holds.includes('EPISTEMIC_INTEGRITY_NOT_PASS'));
  assert.equal(r.promotionReady,false);
});

test('tampered epistemic integrity rejects candidate',()=>{
  const a=args();
  a.epistemicIntegrity=structuredClone(a.epistemicIntegrity);
  a.epistemicIntegrity.identity.status='AMBIGUOUS';
  const r=evaluateModelPromotion(a);
  assert.equal(r.decision,'REJECT_CANDIDATE');
  assert.ok(r.hardFailures.includes('EPISTEMIC_INTEGRITY_INTEGRITY_FAILED'));
});
