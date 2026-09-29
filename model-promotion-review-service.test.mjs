import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp } from 'node:fs/promises';

import { sha256, openAuditLedger } from './institutional-kernel.mjs';
import { FORECAST_CANDIDATE_LAB_VERSION } from './forecast-candidate-lab.mjs';
import { openModelCandidateRegistry } from './model-candidate-registry.mjs';
import { evaluateEpistemicIntegrity } from './science-runtime/epistemic-integrity.mjs';
import {
  MODEL_PROMOTION_REVIEW_SERVICE_VERSION,
  buildModelPromotionReview,
  persistModelPromotionReview,
  processGovernorPromotionReviews
} from './model-promotion-review-service.mjs';

function artifact(){
  const config={featureIds:['x'],horizons:[{id:'1h'}],ridgeLambda:1};
  const configHash=sha256(config);
  const coreModel={
    version:FORECAST_CANDIDATE_LAB_VERSION,
    kind:'TCX_FORECAST_MODEL_CANDIDATE',
    targetSemanticHash:sha256('target'),
    trainingEvidenceHash:sha256(['training']),
    configHash,
    dataCutoffAt:900,
    objective:'FORECAST_CALIBRATION_AND_ACCURACY_NOT_PNL'
  };
  const modelHash=sha256(coreModel);
  const core={
    ...coreModel,
    candidateId:'FC-'+modelHash.slice(0,20).toUpperCase(),
    modelHash,
    config,
    createdAt:950,
    parentReleaseId:'rel-1',
    source:'TCX_AUTOMATIC_SHADOW_COMPETITION',
    trainingCases:300,
    executionMode:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecute:false
  };
  return {...core,fingerprint:sha256(core)};
}
function walkForward(a){
  const candidateMetrics={brier:.18,logLoss:.56,intervalCoverage:.80,highConfidenceWrongRate:.03};
  const incumbentMetrics={brier:.20,logLoss:.59,intervalCoverage:.77,highConfidenceWrongRate:.04};
  const core={
    version:FORECAST_CANDIDATE_LAB_VERSION,
    kind:'TCX_FORECAST_TEMPORAL_WALK_FORWARD',
    asOf:1200,
    candidateId:a.candidateId,
    candidateModelHash:a.modelHash,
    targetSemanticHash:a.targetSemanticHash,
    evaluation:{
      cases:300,
      independentEpisodes:120,
      candidate:candidateMetrics,
      incumbent:incumbentMetrics,
      deltas:{
        brier:-.02,logLoss:-.03,intervalCoverage:.03,highConfidenceWrongRate:-.01
      }
    },
    diagnostics:{
      candidateGateCounts:{PASS:300},
      incumbentGateCounts:{PASS:300},
      skippedWarmup:0,
      blockedFuture:12,
      pitViolations:0,
      temporalOosPassed:true,
      pairedIndependentTotal:120,
      pairedIndependent:[],
      sameSampleFeedbackAllowed:false
    },
    objective:'FORECAST_CALIBRATION_AND_ACCURACY_NOT_PNL',
    executionMode:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecute:false
  };
  return {
    ...core,
    fingerprint:sha256(core),
    promotionEvaluationInput:{
      cases:300,
      independentEpisodes:120,
      candidate:candidateMetrics,
      incumbent:incumbentMetrics
    }
  };
}
function fixture(){
  const a=artifact();
  const wf=walkForward(a);
  const evidenceCore={
    version:'TCX_EXPERIMENT_EVIDENCE_V1',
    generationId:'EXP-1',
    generationNumber:1,
    candidateId:a.candidateId,
    blueprintId:'STRONG',
    label:'Strong',
    championConfigHash:sha256({incumbent:true}),
    championReleaseId:'rel-1',
    trainingCutoffAt:900,
    evaluatedAt:1200,
    decisionLookAt:1200,
    cases:300,
    independentEpisodes:120,
    metrics:{
      candidate:wf.evaluation.candidate,
      incumbent:wf.evaluation.incumbent
    },
    statistics:{
      meanBrierDelta:-.02,
      meanLogLossDelta:-.03,
      brierCi95:{lower:-.03,upper:-.01},
      rawPermutationP:.01,
      holmAdjustedP:.02,
      multipleTestingMethod:'HOLM_BONFERRONI',
      familyAlpha:.05
    },
    subgroupStability:{stable:true},
    decision:'PROMOTION_REVIEW_REQUIRED',
    reasons:[],
    invariants:{
      participantFrozenBeforeOos:true,
      sameSampleRetuningAllowed:false,
      repeatedDecisionPeekingAllowed:false,
      productionMutationAllowed:false,
      executionMode:'SHADOW_ONLY',
      canExecute:false
    }
  };
  const evidence={...evidenceCore,evidenceId:sha256(evidenceCore)};
  const participant={
    blueprintId:'STRONG',
    label:'Strong',
    candidateId:a.candidateId,
    artifactFingerprint:a.fingerprint,
    modelHash:a.modelHash,
    configHash:a.configHash,
    source:a.source,
    status:'PROMOTION_REVIEW_REQUIRED',
    frozenAt:1000,
    decision:{evaluatedAt:1200,evidenceId:evidence.evidenceId,reasons:[]}
  };
  return {
    a,wf,evidence,
    competitionState:{
      status:'ACTIVE',
      dataCutoffAt:900,
      incumbentConfigHash:sha256({incumbent:true}),
      parentReleaseId:'rel-1',
      candidates:[{blueprintId:'STRONG',artifact:a,lastEvaluation:wf}]
    },
    governorState:{
      version:'TCX_FORECAST_EXPERIMENT_GOVERNOR_V1',
      status:'COMPLETE_PROMOTION_REVIEW_REQUIRED',
      generationId:'EXP-1',
      championReleaseId:'rel-1',
      participants:[participant],
      evidencePacks:[evidence],
      executionMode:'SHADOW_ONLY',
      canExecute:false,
      productionMutationPerformed:false
    }
  };
}
function epistemic(candidateId){
  return evaluateEpistemicIntegrity({
    asOf:1200,
    subjectId:'MODEL:'+candidateId,
    authorities:[
      {authorityId:'AUTH-1',canonicalControllerId:'AUTH-C1',observedAt:700,availableAt:710},
      {authorityId:'AUTH-2',canonicalControllerId:'AUTH-C2',observedAt:705,availableAt:715}
    ],
    resolverClaims:[
      {
        canonicalControllerId:'CTRL-1',resolverId:'R1',authorityId:'AUTH-1',
        operatorDomain:'OP-1',trustDomain:'TRUST-1',controlDomain:'CONTROL-1',
        signed:true,signatureValid:true,observedAt:800,availableAt:810,provenanceIds:['L1']
      },
      {
        canonicalControllerId:'CTRL-1',resolverId:'R2',authorityId:'AUTH-2',
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
      {channelId:'D1',controllerId:'DISC-1',lineageIds:['L1'],observedAt:850,availableAt:860},
      {channelId:'D2',controllerId:'DISC-2',lineageIds:['L2'],observedAt:855,availableAt:865}
    ],
    evidence:[
      {evidenceId:'E1',classification:'OBSERVED',observedAt:700,availableAt:720,provenanceIds:['L1']},
      {evidenceId:'E2',classification:'OBSERVED',observedAt:730,availableAt:740,provenanceIds:['L2']},
      {evidenceId:'ECAL',classification:'OBSERVED',observedAt:750,availableAt:760,provenanceIds:['L1','L2']}
    ],
    coverage:{
      observedLineages:2,expectedLineages:2,minimumCoverage:.8,
      calibrated:true,calibrationEvidenceId:'ECAL'
    }
  });
}

test('review bridge holds when real proofs are absent',()=>{
  const f=fixture();
  const review=buildModelPromotionReview({
    governorState:f.governorState,
    competitionState:f.competitionState,
    candidateId:f.a.candidateId
  });
  assert.equal(review.version,MODEL_PROMOTION_REVIEW_SERVICE_VERSION);
  assert.equal(review.evaluation.decision,'HOLD_CANDIDATE');
  assert.ok(review.evaluation.holds.includes('EPISTEMIC_INTEGRITY_REQUIRED'));
  assert.ok(review.missingProofs.includes('TESTS_PASSED'));
  assert.ok(review.missingProofs.includes('DETERMINISTIC_REPLAY_PASSED'));
  assert.ok(review.missingProofs.includes('ROLLBACK_READY'));
  assert.equal(review.automaticProductionMutation,false);
  assert.equal(review.canExecute,false);
});

test('explicit failed software proof rejects instead of looking missing',()=>{
  const f=fixture();
  const review=buildModelPromotionReview({
    governorState:f.governorState,
    competitionState:f.competitionState,
    candidateId:f.a.candidateId,
    softwareProofs:{testsPassed:false}
  });
  assert.equal(review.evaluation.decision,'REJECT_CANDIDATE');
  assert.ok(review.evaluation.hardFailures.includes('TESTS_PASSED'));
  assert.equal(review.evaluation.software.proofStatus.TESTS_PASSED,'FAILED');
});

test('complete evidence can become promotion-ready but never auto-promotes',()=>{
  const f=fixture();
  const review=buildModelPromotionReview({
    governorState:f.governorState,
    competitionState:f.competitionState,
    candidateId:f.a.candidateId,
    epistemicIntegrity:epistemic(f.a.candidateId),
    softwareProofs:{
      testsPassed:true,
      deterministicReplayPassed:true,
      rollbackReady:true
    }
  });
  assert.equal(review.evaluation.decision,'PROMOTE_CANDIDATE');
  assert.equal(review.evaluation.promotionReady,true);
  assert.equal(review.nextAction,'EXPLICIT_PROMOTION_RECORD_REVIEW_REQUIRED');
  assert.equal(review.automaticProductionMutation,false);
  assert.equal(review.canExecute,false);
});

test('tampered governor evidence is refused before model evaluation',()=>{
  const f=fixture();
  f.governorState.evidencePacks[0]={...f.evidence,decision:'REJECTED'};
  assert.throws(()=>buildModelPromotionReview({
    governorState:f.governorState,
    competitionState:f.competitionState,
    candidateId:f.a.candidateId
  }),/EXPERIMENT_EVIDENCE_INVALID/);
});

test('review persistence is append-only and idempotent for same evidence state',async()=>{
  const f=fixture();
  const dir=await mkdtemp(path.join(os.tmpdir(),'tcx-promotion-review-'));
  const registry=await openModelCandidateRegistry(path.join(dir,'candidates.jsonl'));
  const audit=await openAuditLedger(path.join(dir,'audit.jsonl'));

  const review=buildModelPromotionReview({
    governorState:f.governorState,
    competitionState:f.competitionState,
    candidateId:f.a.candidateId
  });
  const first=await persistModelPromotionReview({
    registry,auditLedger:audit,review,competitionState:f.competitionState
  });
  const second=await persistModelPromotionReview({
    registry,auditLedger:audit,review,competitionState:f.competitionState
  });

  assert.equal(first.registeredDuplicate,false);
  assert.equal(first.evaluationDuplicate,false);
  assert.equal(second.registeredDuplicate,true);
  assert.equal(second.evaluationDuplicate,true);
  assert.equal(second.auditDuplicate,true);
  assert.equal(registry.seq,2);
  assert.equal(audit.seq,1);
});

test('queue processes review-required candidates and keeps them shadow-only',async()=>{
  const f=fixture();
  const dir=await mkdtemp(path.join(os.tmpdir(),'tcx-promotion-queue-'));
  const registry=await openModelCandidateRegistry(path.join(dir,'candidates.jsonl'));
  const audit=await openAuditLedger(path.join(dir,'audit.jsonl'));
  const out=await processGovernorPromotionReviews({
    governorState:f.governorState,
    competitionState:f.competitionState,
    registry,
    auditLedger:audit
  });
  assert.equal(out.candidates,1);
  assert.equal(out.reviewed,1);
  assert.equal(out.holds,1);
  assert.equal(out.promotionReady,0);
  assert.equal(out.failed,0);
  assert.equal(out.productionMutationPerformed,false);
  assert.equal(out.canExecute,false);
});


test('future-dated Alpha.76 evidence cannot move the review boundary forward',()=>{
  const f=fixture();
  const future=epistemic(f.a.candidateId);
  const tampered=structuredClone(future);
  tampered.asOf=1301;
  const {fingerprint,...rest}=tampered;
  tampered.fingerprint=sha256(rest);
  assert.throws(()=>buildModelPromotionReview({
    governorState:f.governorState,
    competitionState:f.competitionState,
    candidateId:f.a.candidateId,
    epistemicIntegrity:tampered,
    reviewedAt:1300
  }),/PROMOTION_REVIEW_FUTURE_EVIDENCE:EPISTEMIC_ASOF/);
});

test('future-dated software proof is rejected before canonical evaluation',()=>{
  const f=fixture();
  assert.throws(()=>buildModelPromotionReview({
    governorState:f.governorState,
    competitionState:f.competitionState,
    candidateId:f.a.candidateId,
    reviewedAt:1300,
    softwareProofs:{
      testsPassed:{value:true,asOf:1301},
      deterministicReplayPassed:{value:true,asOf:1250},
      rollbackReady:{value:true,asOf:1250}
    }
  }),/PROMOTION_REVIEW_FUTURE_EVIDENCE:SOFTWARE_PROOF_TESTSPASSED/);
});

test('governor evidence must be bound to the exact walk-forward metrics',()=>{
  const f=fixture();
  const original=f.governorState.evidencePacks[0];
  const core={
    ...original,
    metrics:{
      ...original.metrics,
      candidate:{...original.metrics.candidate,brier:.01}
    }
  };
  delete core.evidenceId;
  const changed={...core,evidenceId:sha256(core)};
  f.governorState.evidencePacks[0]=changed;
  f.governorState.participants[0].decision.evidenceId=changed.evidenceId;
  assert.throws(()=>buildModelPromotionReview({
    governorState:f.governorState,
    competitionState:f.competitionState,
    candidateId:f.a.candidateId,
    reviewedAt:1300
  }),/PROMOTION_REVIEW_EVIDENCE_WALK_FORWARD_MISMATCH/);
});

test('experiment cutoff and champion lineage must match the frozen candidate lineage',()=>{
  const f=fixture();
  const original=f.governorState.evidencePacks[0];
  const core={...original,championReleaseId:'different-release'};
  delete core.evidenceId;
  const changed={...core,evidenceId:sha256(core)};
  f.governorState.evidencePacks[0]=changed;
  f.governorState.participants[0].decision.evidenceId=changed.evidenceId;
  assert.throws(()=>buildModelPromotionReview({
    governorState:f.governorState,
    competitionState:f.competitionState,
    candidateId:f.a.candidateId,
    reviewedAt:1300
  }),/PROMOTION_REVIEW_CHAMPION_RELEASE_MISMATCH/);
});

test('complete evidence still passes when all proof times are inside review boundary',()=>{
  const f=fixture();
  const review=buildModelPromotionReview({
    governorState:f.governorState,
    competitionState:f.competitionState,
    candidateId:f.a.candidateId,
    epistemicIntegrity:epistemic(f.a.candidateId),
    reviewedAt:1300,
    softwareProofs:{
      testsPassed:{value:true,asOf:1250},
      deterministicReplayPassed:{value:true,asOf:1255},
      rollbackReady:{value:true,asOf:1260}
    }
  });
  assert.equal(review.reviewedAt,1300);
  assert.equal(review.evaluation.decision,'PROMOTE_CANDIDATE');
  assert.equal(review.automaticProductionMutation,false);
  assert.equal(review.canExecute,false);
});
