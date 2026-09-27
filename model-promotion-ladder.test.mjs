import test from 'node:test';
import assert from 'node:assert/strict';
import { sha256 } from './institutional-kernel.mjs';
import { evaluateModelPromotion, createModelPromotionRecord, verifyModelPromotionRecord, verifyModelPromotionEvaluation } from './model-promotion-ladder.mjs';

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
function args(){
  return {
    asOf:1000,
    candidate:{candidateId:'cand-1',modelHash:A,configHash:B,createdAt:900,parentReleaseId:'rel-old',source:'OFFLINE_RETRAIN',executionMode:'SHADOW_ONLY'},
    scientificValidity:science('PASS'),
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
