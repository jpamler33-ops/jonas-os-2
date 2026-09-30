
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BIGGJ_GOVERNANCE_TRIAGE_VERSION,
  buildBiggjGovernanceTriage,
  biggjGovernanceTriageSummary
} from './biggj-governance-triage.mjs';

test('skill transitions remain explicit human approvals',()=>{
  const triage=buildBiggjGovernanceTriage({
    livingResearchState:{
      researchReviewQueue:{
        tickets:[{
          ticketId:'review:1',
          skillId:'skill:x',
          fromStatus:'LEARNING',
          proposedStatus:'TESTING',
          validationReadinessScore:.94,
          evidenceState:'FORMAL_TESTING_REVIEW_EVIDENCE_READY',
          validationPhase:'LEARNING_AUDIT',
          createdAt:1000
        }],
        blocked:[]
      }
    },
    asOf:2000
  });
  assert.equal(triage.version,BIGGJ_GOVERNANCE_TRIAGE_VERSION);
  assert.equal(triage.counts.humanApprovals,1);
  assert.equal(triage.counts.skillApprovals,1);
  assert.equal(triage.humanApprovals[0].kind,'SKILL_TRANSITION');
  assert.equal(triage.automaticSkillTransition,false);
  assert.equal(triage.canExecuteLive,false);
});

test('only PROMOTE_CANDIDATE becomes a human model approval',()=>{
  const triage=buildBiggjGovernanceTriage({
    livingResearchState:{researchReviewQueue:{tickets:[],blocked:[]}},
    modelPromotionReviewSummary:{
      decisions:[
        {candidateId:'promote',ok:true,decision:'PROMOTE_CANDIDATE',nextAction:'EXPLICIT_PROMOTION_RECORD_REVIEW_REQUIRED',missingProofs:[]},
        {candidateId:'hold',ok:true,decision:'HOLD_CANDIDATE',nextAction:'ACQUIRE_MISSING_PROOF_AND_REVIEW_AGAIN',missingProofs:['testsPassed']},
        {candidateId:'reject',ok:true,decision:'REJECT_CANDIDATE',nextAction:'REJECT_AND_RESEARCH_NEW_CANDIDATE',missingProofs:[]}
      ]
    },
    asOf:2000
  });
  assert.equal(triage.counts.modelPromotionApprovals,1);
  assert.equal(triage.counts.modelHolds,1);
  assert.equal(triage.counts.modelRejects,1);
  assert.equal(triage.counts.humanApprovals,1);
  assert.equal(triage.humanApprovals[0].candidateId,'promote');
  assert.equal(triage.autoTriaged.some(x=>x.candidateId==='hold'),true);
  assert.equal(triage.autoTriaged.some(x=>x.candidateId==='reject'),true);
});

test('failed model review is auto-triaged for retry instead of presented as approval',()=>{
  const triage=buildBiggjGovernanceTriage({
    livingResearchState:{researchReviewQueue:{tickets:[],blocked:[]}},
    modelPromotionReviewSummary:{
      decisions:[{candidateId:'bad-review',ok:false,error:'TEMPORARY_REVIEW_FAILURE'}]
    },
    asOf:2000
  });
  assert.equal(triage.counts.humanApprovals,0);
  assert.equal(triage.counts.modelReviewRetries,1);
  assert.equal(triage.humanJobRemaining,'NONE');
  assert.equal(triage.autoTriaged[0].class,'AUTO_REVIEW_RETRY');
});

test('blocked research protocols remain repair work, not operator approvals',()=>{
  const triage=buildBiggjGovernanceTriage({
    livingResearchState:{
      researchReviewQueue:{
        tickets:[],
        blocked:[{protocolId:'p1',skillId:'s1',reason:'PROTOCOL_CONTRACT_DRIFT',details:['fingerprint changed']}]
      }
    },
    asOf:2000
  });
  const summary=biggjGovernanceTriageSummary(triage);
  assert.equal(summary.counts.humanApprovals,0);
  assert.equal(summary.counts.autoTriaged,1);
  assert.equal(summary.autoTriaged[0].class,'AUTO_RESEARCH_REPAIR');
  assert.equal(summary.automaticPromotion,false);
  assert.equal(summary.canExecuteLive,false);
});
