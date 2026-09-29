import { appendAuditRecord } from './institutional-kernel.mjs';
import { verifyModelPromotionEvaluation, verifyModelPromotionRecord } from './model-promotion-ladder.mjs';
import { verifyModelReleaseBinding, verifyModelRollbackDrill } from './model-release-binding.mjs';

export const MODEL_GOVERNANCE_AUDIT_VERSION='TCX_MODEL_GOVERNANCE_AUDIT_V1';

function existing(ledger,kind,idField,id){
  return ledger?.records?.find(r=>r?.kind===kind&&r?.payload?.[idField]===id)||null;
}
async function appendIdempotent(ledger,{kind,idField,id,payload,occurredAt}){
  if(!ledger?.healthy) throw new Error('Audit ledger unhealthy: fail closed');
  const prior=existing(ledger,kind,idField,id);
  if(prior) return {record:prior,duplicate:true};
  const record=await appendAuditRecord(ledger,{kind,payload,occurredAt});
  return {record,duplicate:false};
}

export async function appendModelPromotionEvaluationAudit(ledger,evaluation,{occurredAt=evaluation?.asOf??Date.now()}={}){
  const v=verifyModelPromotionEvaluation(evaluation);
  if(!v.ok) throw new Error('invalid model promotion evaluation');
  return appendIdempotent(ledger,{
    kind:'TCX_MODEL_CANDIDATE_EVALUATED',
    idField:'evaluationFingerprint',
    id:evaluation.fingerprint,
    occurredAt,
    payload:{
      version:MODEL_GOVERNANCE_AUDIT_VERSION,
      candidateId:evaluation.candidate.candidateId,
      evaluationFingerprint:evaluation.fingerprint,
      decision:evaluation.decision,
      promotionReady:evaluation.promotionReady,
      hardFailures:evaluation.hardFailures,
      holds:evaluation.holds,
      executionMode:'SHADOW_ONLY',
      action:'ABSTAIN',
      canExecute:false
    }
  });
}

export async function appendModelPromotionAudit(ledger,promotion,binding,{occurredAt=promotion?.promotedAt??Date.now()}={}){
  const pv=verifyModelPromotionRecord(promotion);
  const bv=verifyModelReleaseBinding(binding);
  if(!pv.ok) throw new Error('invalid model promotion record');
  if(!bv.ok) throw new Error('invalid model release binding');
  if(promotion.candidateReleaseId!==binding.modelReleaseId) throw new Error('promotion/release binding mismatch');

  return appendIdempotent(ledger,{
    kind:'TCX_MODEL_CANDIDATE_PROMOTED',
    idField:'promotionId',
    id:promotion.promotionId,
    occurredAt,
    payload:{
      version:MODEL_GOVERNANCE_AUDIT_VERSION,
      promotionId:promotion.promotionId,
      candidateId:promotion.candidateId,
      evaluationFingerprint:promotion.evaluationFingerprint,
      modelHash:promotion.modelHash,
      modelConfigHash:promotion.configHash,
      modelReleaseId:binding.modelReleaseId,
      softwareReleaseId:binding.softwareReleaseId,
      productionMutationPerformed:false,
      executionMode:'SHADOW_ONLY',
      action:'ABSTAIN',
      canExecute:false
    }
  });
}

export async function appendModelRollbackDrillAudit(ledger,drill,{occurredAt=drill?.drilledAt??Date.now()}={}){
  const v=verifyModelRollbackDrill(drill);
  if(!v.ok) throw new Error('invalid model rollback drill');
  return appendIdempotent(ledger,{
    kind:'TCX_MODEL_ROLLBACK_DRILL',
    idField:'drillId',
    id:drill.drillId,
    occurredAt,
    payload:{
      version:MODEL_GOVERNANCE_AUDIT_VERSION,
      drillId:drill.drillId,
      promotionId:drill.promotionId,
      candidateId:drill.candidateId,
      fromModelReleaseId:drill.fromModelReleaseId,
      toModelReleaseId:drill.toModelReleaseId,
      result:drill.result,
      executionMode:'SHADOW_ONLY',
      action:'ABSTAIN',
      canExecute:false
    }
  });
}
