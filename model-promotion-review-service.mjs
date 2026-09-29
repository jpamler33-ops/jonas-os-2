import { sha256 } from './institutional-kernel.mjs';
import {
  FORECAST_CANDIDATE_LAB_VERSION,
  verifyForecastCandidateArtifact
} from './forecast-candidate-lab.mjs';
import { evaluateScientificValidity } from './scientific-validity.mjs';
import { evaluateModelPromotion } from './model-promotion-ladder.mjs';
import {
  registerModelCandidate,
  recordModelCandidateEvaluation
} from './model-candidate-registry.mjs';
import { appendModelPromotionEvaluationAudit } from './model-governance-audit.mjs';
import {
  verifyEpistemicIntegrity,
  buildIdentificationEvidencePlan
} from './science-runtime/epistemic-integrity.mjs';

export const MODEL_PROMOTION_REVIEW_SERVICE_VERSION='TCX_MODEL_PROMOTION_REVIEW_SERVICE_V1';

const REVIEW_STATUSES=new Set(['PROMOTION_REVIEW_REQUIRED','PROMOTION_CANDIDATE']);

function finite(v,name){
  const n=Number(v);
  if(!Number.isFinite(n)) throw new Error(name+' must be finite');
  return n;
}
function clone(v){return structuredClone(v);}
function deepFreeze(v){
  if(v&&typeof v==='object'&&!Object.isFrozen(v)){
    Object.freeze(v);
    for(const x of Object.values(v)) deepFreeze(x);
  }
  return v;
}
function proofValue(v){
  if(v&&typeof v==='object'&&Object.hasOwn(v,'value')) return v.value;
  return v;
}
function proofAt(v){
  if(v&&typeof v==='object'){
    const n=Number(v.asOf??v.observedAt??v.availableAt);
    return Number.isFinite(n)?n:null;
  }
  return null;
}
function verifyExperimentEvidence(pack){
  try{
    if(pack?.version!=='TCX_EXPERIMENT_EVIDENCE_V1') return {ok:false,reasons:['VERSION_INVALID']};
    if(pack?.invariants?.executionMode!=='SHADOW_ONLY'||pack?.invariants?.canExecute!==false){
      return {ok:false,reasons:['SAFETY_INVARIANT_INVALID']};
    }
    if(pack?.invariants?.productionMutationAllowed!==false) return {ok:false,reasons:['PRODUCTION_MUTATION_INVARIANT_INVALID']};
    const {evidenceId,...core}=pack;
    return evidenceId===sha256(core)
      ?{ok:true,reasons:[]}
      :{ok:false,reasons:['EVIDENCE_ID_MISMATCH']};
  }catch(err){
    return {ok:false,reasons:['EXPERIMENT_EVIDENCE_INVALID',err instanceof Error?err.message:String(err)]};
  }
}
function verifyWalkForwardEvaluation(value,candidate){
  try{
    if(value?.version!==FORECAST_CANDIDATE_LAB_VERSION) return {ok:false,reasons:['VERSION_INVALID']};
    if(value?.kind!=='TCX_FORECAST_TEMPORAL_WALK_FORWARD') return {ok:false,reasons:['KIND_INVALID']};
    if(value?.executionMode!=='SHADOW_ONLY'||value?.action!=='ABSTAIN'||value?.canExecute!==false){
      return {ok:false,reasons:['SAFETY_INVARIANT_INVALID']};
    }
    if(String(value?.candidateId)!==String(candidate?.candidateId)) return {ok:false,reasons:['CANDIDATE_ID_MISMATCH']};
    if(String(value?.candidateModelHash)!==String(candidate?.modelHash)) return {ok:false,reasons:['CANDIDATE_MODEL_HASH_MISMATCH']};
    const {fingerprint,promotionEvaluationInput,...core}=value;
    if(fingerprint!==sha256(core)) return {ok:false,reasons:['FINGERPRINT_MISMATCH']};
    const expected={
      cases:Number(value?.evaluation?.cases??0),
      independentEpisodes:Number(value?.evaluation?.independentEpisodes??0),
      candidate:value?.evaluation?.candidate??null,
      incumbent:value?.evaluation?.incumbent??null
    };
    if(sha256(promotionEvaluationInput)!==sha256(expected)) return {ok:false,reasons:['PROMOTION_INPUT_MISMATCH']};
    return {ok:true,reasons:[]};
  }catch(err){
    return {ok:false,reasons:['WALK_FORWARD_INVALID',err instanceof Error?err.message:String(err)]};
  }
}
function findReviewCandidate(governorState,competitionState,candidateId){
  const id=String(candidateId??'');
  const participant=(governorState?.participants||[]).find(x=>String(x?.candidateId)===id);
  if(!participant) throw new Error('PROMOTION_REVIEW_PARTICIPANT_NOT_FOUND');
  if(!REVIEW_STATUSES.has(String(participant.status))) throw new Error('PROMOTION_REVIEW_STATUS_NOT_ELIGIBLE');

  const live=(competitionState?.candidates||[]).find(x=>String(x?.artifact?.candidateId)===id);
  if(!live) throw new Error('PROMOTION_REVIEW_CANDIDATE_NOT_FOUND');
  const artifact=live.artifact;
  const artifactCheck=verifyForecastCandidateArtifact(artifact);
  if(!artifactCheck.ok) throw new Error('PROMOTION_REVIEW_CANDIDATE_INVALID:'+artifactCheck.reasons.join(','));
  if(String(participant.artifactFingerprint)!==String(artifact.fingerprint)){
    throw new Error('PROMOTION_REVIEW_FROZEN_ARTIFACT_MISMATCH');
  }
  if(String(participant.modelHash)!==String(artifact.modelHash)||String(participant.configHash)!==String(artifact.configHash)){
    throw new Error('PROMOTION_REVIEW_FROZEN_MODEL_MISMATCH');
  }

  const walkForward=live.lastEvaluation;
  const walkCheck=verifyWalkForwardEvaluation(walkForward,artifact);
  if(!walkCheck.ok) throw new Error('PROMOTION_REVIEW_WALK_FORWARD_INVALID:'+walkCheck.reasons.join(','));

  const evidenceId=String(participant?.decision?.evidenceId??'');
  const experimentEvidence=(governorState?.evidencePacks||[]).find(x=>
    String(x?.evidenceId)===evidenceId&&String(x?.candidateId)===id
  );
  const evidenceCheck=verifyExperimentEvidence(experimentEvidence);
  if(!evidenceCheck.ok) throw new Error('PROMOTION_REVIEW_EXPERIMENT_EVIDENCE_INVALID:'+evidenceCheck.reasons.join(','));
  if(!REVIEW_STATUSES.has(String(experimentEvidence.decision))){
    throw new Error('PROMOTION_REVIEW_EXPERIMENT_DECISION_MISMATCH');
  }
  if(String(experimentEvidence.generationId)!==String(governorState?.generationId)){
    throw new Error('PROMOTION_REVIEW_GENERATION_MISMATCH');
  }
  if(Number(experimentEvidence.trainingCutoffAt)!==Number(artifact.dataCutoffAt)){
    throw new Error('PROMOTION_REVIEW_TRAINING_CUTOFF_ARTIFACT_MISMATCH');
  }
  if(
    Number.isFinite(Number(competitionState?.dataCutoffAt))&&
    Number(experimentEvidence.trainingCutoffAt)!==Number(competitionState.dataCutoffAt)
  ){
    throw new Error('PROMOTION_REVIEW_TRAINING_CUTOFF_COMPETITION_MISMATCH');
  }
  if(
    String(experimentEvidence.championReleaseId)!==String(artifact.parentReleaseId)||
    String(experimentEvidence.championReleaseId)!==String(governorState?.championReleaseId)
  ){
    throw new Error('PROMOTION_REVIEW_CHAMPION_RELEASE_MISMATCH');
  }
  if(
    competitionState?.incumbentConfigHash&&
    String(experimentEvidence.championConfigHash).toLowerCase()!==String(competitionState.incumbentConfigHash).toLowerCase()
  ){
    throw new Error('PROMOTION_REVIEW_CHAMPION_CONFIG_MISMATCH');
  }
  const promotionInput=walkForward?.promotionEvaluationInput||{};
  const evidenceMetrics={
    cases:Number(experimentEvidence.cases??0),
    independentEpisodes:Number(experimentEvidence.independentEpisodes??0),
    candidate:experimentEvidence?.metrics?.candidate??null,
    incumbent:experimentEvidence?.metrics?.incumbent??null
  };
  if(sha256(promotionInput)!==sha256(evidenceMetrics)){
    throw new Error('PROMOTION_REVIEW_EVIDENCE_WALK_FORWARD_MISMATCH');
  }
  if(Number(participant?.decision?.evaluatedAt)!==Number(experimentEvidence.evaluatedAt)){
    throw new Error('PROMOTION_REVIEW_PARTICIPANT_EVIDENCE_TIME_MISMATCH');
  }

  return {participant,live,artifact,walkForward,experimentEvidence};
}
function buildScientificValidity({walkForward,experimentEvidence,asOf}){
  const temporalPassed=walkForward?.diagnostics?.temporalOosPassed===true&&Number(walkForward?.diagnostics?.pitViolations||0)===0;
  return evaluateScientificValidity({
    asOf,
    minimumRequiredCoverage:1,
    guards:[
      {
        id:'TEMPORAL_OOS_AND_PIT',
        required:true,
        report:{
          asOf:Number(walkForward.asOf),
          gate:temporalPassed?'PASS':'ABSTAIN',
          executionMode:'SHADOW_ONLY',
          details:{
            pitViolations:Number(walkForward?.diagnostics?.pitViolations||0),
            blockedFuture:Number(walkForward?.diagnostics?.blockedFuture||0),
            sameSampleFeedbackAllowed:walkForward?.diagnostics?.sameSampleFeedbackAllowed===true
          }
        }
      },
      {
        id:'EXPERIMENT_GOVERNOR_STATISTICS',
        required:true,
        report:{
          asOf:Number(experimentEvidence.decisionLookAt),
          gate:REVIEW_STATUSES.has(String(experimentEvidence.decision))?'PASS':'ABSTAIN',
          executionMode:'SHADOW_ONLY',
          evidenceId:experimentEvidence.evidenceId,
          multipleTestingMethod:experimentEvidence?.statistics?.multipleTestingMethod??null,
          subgroupStable:experimentEvidence?.subgroupStability?.stable===true
        }
      }
    ]
  });
}
function buildSoftwareProofs({artifact,walkForward,governorState,softwareProofs}){
  const supplied=softwareProofs||{};
  const parentRelease=String(artifact?.parentReleaseId??'');
  const governorRelease=String(governorState?.championReleaseId??'');
  return {
    testsPassed:proofValue(supplied.testsPassed),
    pitLeakagePassed:
      walkForward?.diagnostics?.temporalOosPassed===true&&Number(walkForward?.diagnostics?.pitViolations||0)===0
        ?true
        :false,
    temporalOosPassed:walkForward?.diagnostics?.temporalOosPassed===true,
    deterministicReplayPassed:proofValue(supplied.deterministicReplayPassed),
    releaseManifestBound:parentRelease&&governorRelease&&parentRelease!=='UNKNOWN'&&governorRelease!=='UNKNOWN'
      ?parentRelease===governorRelease
      :proofValue(supplied.releaseManifestBound),
    rollbackReady:proofValue(supplied.rollbackReady)
  };
}
function assertReviewPointInTimeBoundary({
  reviewedAt,
  artifact,
  walkForward,
  experimentEvidence,
  epistemicIntegrity,
  softwareProofs
}){
  const t=finite(reviewedAt,'reviewedAt');
  const evidenceTimes=[
    ['ARTIFACT_CREATED_AT',Number(artifact?.createdAt)],
    ['WALK_FORWARD_ASOF',Number(walkForward?.asOf)],
    ['EXPERIMENT_EVALUATED_AT',Number(experimentEvidence?.evaluatedAt)],
    ['EXPERIMENT_DECISION_LOOK_AT',Number(experimentEvidence?.decisionLookAt)]
  ];
  if(epistemicIntegrity){
    evidenceTimes.push(['EPISTEMIC_ASOF',Number(epistemicIntegrity.asOf)]);
  }
  for(const [name,value] of Object.entries(softwareProofs||{})){
    const n=proofAt(value);
    if(n!=null) evidenceTimes.push(['SOFTWARE_PROOF_'+String(name).toUpperCase(),n]);
  }
  const invalid=evidenceTimes.filter(([,n])=>!Number.isFinite(n));
  if(invalid.length){
    throw new Error('PROMOTION_REVIEW_EVIDENCE_TIME_INVALID:'+invalid.map(([name])=>name).join(','));
  }
  const future=evidenceTimes.filter(([,n])=>n>t);
  if(future.length){
    throw new Error('PROMOTION_REVIEW_FUTURE_EVIDENCE:'+future.map(([name])=>name).join(','));
  }
  return t;
}

export function buildModelPromotionReview({
  governorState,
  competitionState,
  candidateId,
  epistemicIntegrity=null,
  softwareProofs={},
  policy,
  reviewedAt=Date.now()
}={}){
  const {participant,live,artifact,walkForward,experimentEvidence}=findReviewCandidate(
    governorState,competitionState,candidateId
  );
  const asOf=assertReviewPointInTimeBoundary({
    reviewedAt,
    artifact,
    walkForward,
    experimentEvidence,
    epistemicIntegrity,
    softwareProofs
  });

  const scientificValidity=buildScientificValidity({walkForward,experimentEvidence,asOf});
  const software=buildSoftwareProofs({artifact,walkForward,governorState,softwareProofs});
  const evaluation=evaluateModelPromotion({
    asOf,
    candidate:artifact,
    scientificValidity,
    epistemicIntegrity,
    software,
    evaluation:walkForward.promotionEvaluationInput,
    ...(policy?{policy}:{})
  });

  let evidencePlan=null;
  if(epistemicIntegrity){
    const check=verifyEpistemicIntegrity(epistemicIntegrity);
    if(check.ok&&Array.isArray(epistemicIntegrity.obligations)&&epistemicIntegrity.obligations.length){
      evidencePlan=buildIdentificationEvidencePlan(epistemicIntegrity);
    }
  }

  const missingProofs=Object.entries(evaluation?.software?.proofStatus||{})
    .filter(([,status])=>status==='MISSING')
    .map(([name])=>name);
  const core={
    version:MODEL_PROMOTION_REVIEW_SERVICE_VERSION,
    reviewedAt:asOf,
    generationId:String(governorState?.generationId??''),
    sourceEvidenceId:experimentEvidence.evidenceId,
    candidateId:artifact.candidateId,
    artifactFingerprint:artifact.fingerprint,
    walkForwardFingerprint:walkForward.fingerprint,
    scientificValidityFingerprint:scientificValidity.fingerprint,
    epistemicIntegrityFingerprint:epistemicIntegrity?.fingerprint??null,
    evaluation,
    evidencePlan,
    missingProofs,
    nextAction:
      evaluation.decision==='PROMOTE_CANDIDATE'
        ?'EXPLICIT_PROMOTION_RECORD_REVIEW_REQUIRED'
        :evaluation.decision==='REJECT_CANDIDATE'
          ?'REJECT_AND_RESEARCH_NEW_CANDIDATE'
          :'ACQUIRE_MISSING_PROOF_AND_REVIEW_AGAIN',
    automaticProductionMutation:false,
    executionMode:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecute:false
  };
  return deepFreeze({...core,fingerprint:sha256(core)});
}

export async function persistModelPromotionReview({
  registry,
  auditLedger,
  review,
  competitionState
}={}){
  if(review?.version!==MODEL_PROMOTION_REVIEW_SERVICE_VERSION) throw new Error('promotion review version invalid');
  const {fingerprint,...reviewCore}=review;
  if(fingerprint!==sha256(reviewCore)) throw new Error('promotion review integrity invalid');
  const live=(competitionState?.candidates||[]).find(x=>String(x?.artifact?.candidateId)===String(review.candidateId));
  if(!live?.artifact) throw new Error('promotion review candidate unavailable for registration');

  const registered=await registerModelCandidate(registry,live.artifact,{registeredAt:review.reviewedAt});
  const evaluated=await recordModelCandidateEvaluation(registry,review.evaluation,{recordedAt:review.reviewedAt});
  const audited=await appendModelPromotionEvaluationAudit(auditLedger,review.evaluation,{occurredAt:review.reviewedAt});
  return deepFreeze({
    version:MODEL_PROMOTION_REVIEW_SERVICE_VERSION,
    candidateId:review.candidateId,
    evaluationFingerprint:review.evaluation.fingerprint,
    decision:review.evaluation.decision,
    registeredDuplicate:registered.duplicate===true,
    evaluationDuplicate:evaluated.duplicate===true,
    auditDuplicate:audited.duplicate===true,
    productionMutationPerformed:false,
    executionMode:'SHADOW_ONLY',
    canExecute:false
  });
}

export async function processGovernorPromotionReviews({
  governorState,
  competitionState,
  registry,
  auditLedger,
  epistemicByCandidate={},
  softwareProofsByCandidate={},
  policy,
  reviewedAt=Date.now()
}={}){
  const candidates=(governorState?.participants||[])
    .filter(x=>REVIEW_STATUSES.has(String(x?.status)))
    .map(x=>String(x.candidateId));
  const results=[];
  for(const candidateId of candidates){
    try{
      const review=buildModelPromotionReview({
        governorState,
        competitionState,
        candidateId,
        epistemicIntegrity:epistemicByCandidate?.[candidateId]??null,
        softwareProofs:softwareProofsByCandidate?.[candidateId]??{},
        policy,
        reviewedAt
      });
      const persisted=await persistModelPromotionReview({
        registry,auditLedger,review,competitionState
      });
      results.push({candidateId,ok:true,review,persisted});
    }catch(err){
      results.push({
        candidateId,
        ok:false,
        error:err instanceof Error?err.message:String(err)
      });
    }
  }

  return deepFreeze({
    version:MODEL_PROMOTION_REVIEW_SERVICE_VERSION,
    generationId:String(governorState?.generationId??''),
    candidates:candidates.length,
    reviewed:results.filter(x=>x.ok).length,
    holds:results.filter(x=>x.ok&&x.review.evaluation.decision==='HOLD_CANDIDATE').length,
    rejected:results.filter(x=>x.ok&&x.review.evaluation.decision==='REJECT_CANDIDATE').length,
    promotionReady:results.filter(x=>x.ok&&x.review.evaluation.decision==='PROMOTE_CANDIDATE').length,
    failed:results.filter(x=>!x.ok).length,
    results,
    productionMutationPerformed:false,
    executionMode:'SHADOW_ONLY',
    canExecute:false
  });
}
