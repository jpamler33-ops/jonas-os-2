
import { sha256 } from './institutional-kernel.mjs';

export const BIGGJ_GOVERNANCE_TRIAGE_VERSION='TCX_BIGGJ_GOVERNANCE_TRIAGE_V1';

const arr=v=>Array.isArray(v)?v:[];
const finite=(v,f=0)=>{
  const n=Number(v);
  return Number.isFinite(n)?n:f;
};
const clone=v=>v==null?v:structuredClone(v);

function finalized(core){
  return Object.freeze({...core,fingerprint:sha256(core)});
}

function modelDecisionRow(row={}){
  const ok=row?.ok===true;
  const review=row?.review||{};
  const evaluation=review?.evaluation||{};
  const decision=String(evaluation?.decision||row?.decision||'UNAVAILABLE');
  const candidateId=String(row?.candidateId||review?.candidateId||'UNKNOWN_CANDIDATE');
  const nextAction=String(review?.nextAction||'UNAVAILABLE');
  const missingProofs=arr(review?.missingProofs).map(String);

  let className='AUTO_REVIEW_PREPARATION';
  let humanApprovalRequired=false;
  let autoDisposition='REVIEW_NOT_READY';
  if(!ok){
    className='AUTO_REVIEW_RETRY';
    autoDisposition='REVIEW_PIPELINE_RETRY';
  }else if(decision==='PROMOTE_CANDIDATE'){
    className='HUMAN_APPROVAL_REQUIRED';
    humanApprovalRequired=true;
    autoDisposition='AWAIT_EXPLICIT_PROMOTION_APPROVAL';
  }else if(decision==='REJECT_CANDIDATE'){
    className='AUTO_REJECT_SHADOW_CANDIDATE';
    autoDisposition='REJECT_AND_RESEARCH_NEW_CANDIDATE';
  }else if(decision==='HOLD_CANDIDATE'){
    className='AUTO_HOLD_AND_RESEARCH';
    autoDisposition=missingProofs.length
      ?'ACQUIRE_MISSING_PROOF_AND_REVIEW_AGAIN'
      :'CONTINUE_SHADOW_RESEARCH';
  }

  return Object.freeze({
    kind:'MODEL_REVIEW',
    candidateId,
    ok,
    decision,
    class:className,
    humanApprovalRequired,
    autoDisposition,
    nextAction,
    missingProofs,
    reviewedAt:finite(review?.reviewedAt,null),
    generationId:review?.generationId??null,
    error:ok?null:String(row?.error||'UNKNOWN_REVIEW_ERROR'),
    productionMutationAllowed:false,
    canExecuteLive:false
  });
}

function skillDecisionRow(ticket={}){
  return Object.freeze({
    kind:'SKILL_TRANSITION',
    ticketId:String(ticket?.ticketId||'UNKNOWN_TICKET'),
    skillId:String(ticket?.skillId||'UNKNOWN_SKILL'),
    fromStatus:String(ticket?.fromStatus||'UNKNOWN'),
    proposedStatus:String(ticket?.proposedStatus||'UNKNOWN'),
    validationReadinessScore:finite(ticket?.validationReadinessScore,0),
    evidenceState:String(ticket?.evidenceState||'UNKNOWN'),
    validationPhase:String(ticket?.validationPhase||'UNKNOWN'),
    class:'HUMAN_APPROVAL_REQUIRED',
    humanApprovalRequired:true,
    autoDisposition:'AWAIT_EXPLICIT_SKILL_TRANSITION_APPROVAL',
    createdAt:finite(ticket?.createdAt,null),
    productionMutationAllowed:false,
    canExecuteLive:false
  });
}

export function buildBiggjGovernanceTriage({
  livingResearchState=null,
  modelPromotionReviewSummary=null,
  asOf=Date.now()
}={}){
  const t=finite(asOf,Date.now());
  const skillRows=arr(livingResearchState?.researchReviewQueue?.tickets)
    .map(skillDecisionRow)
    .sort((a,b)=>b.validationReadinessScore-a.validationReadinessScore||a.skillId.localeCompare(b.skillId));

  const modelRows=arr(modelPromotionReviewSummary?.decisions)
    .map(modelDecisionRow)
    .sort((a,b)=>
      Number(b.humanApprovalRequired)-Number(a.humanApprovalRequired)||
      a.candidateId.localeCompare(b.candidateId)
    );

  const blockedSkillReviews=arr(livingResearchState?.researchReviewQueue?.blocked).map(row=>Object.freeze({
    protocolId:row?.protocolId??null,
    skillId:row?.skillId??null,
    reason:String(row?.reason||'UNKNOWN'),
    details:arr(row?.details).map(String),
    class:'AUTO_RESEARCH_REPAIR',
    humanApprovalRequired:false
  }));

  const humanApprovals=[...skillRows,...modelRows].filter(x=>x.humanApprovalRequired===true);
  const autoTriaged=[...modelRows.filter(x=>x.humanApprovalRequired!==true),...blockedSkillReviews];

  const core={
    version:BIGGJ_GOVERNANCE_TRIAGE_VERSION,
    generatedAt:t,
    skillReviews:skillRows,
    modelReviews:modelRows,
    blockedSkillReviews,
    humanApprovals,
    autoTriaged,
    counts:{
      humanApprovals:humanApprovals.length,
      skillApprovals:skillRows.length,
      modelPromotionApprovals:modelRows.filter(x=>x.humanApprovalRequired===true).length,
      modelHolds:modelRows.filter(x=>x.decision==='HOLD_CANDIDATE').length,
      modelRejects:modelRows.filter(x=>x.decision==='REJECT_CANDIDATE').length,
      modelReviewRetries:modelRows.filter(x=>x.ok===false).length,
      autoTriaged:autoTriaged.length
    },
    humanJobRemaining:humanApprovals.length?'GOVERNANCE_APPROVALS_ONLY':'NONE',
    automaticProductionMutation:false,
    automaticSkillTransition:false,
    automaticPromotion:false,
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecute:false,
    canExecuteLive:false
  };
  return finalized(core);
}

export function biggjGovernanceTriageSummary(value={}){
  return Object.freeze({
    version:BIGGJ_GOVERNANCE_TRIAGE_VERSION,
    generatedAt:finite(value?.generatedAt,null),
    counts:clone(value?.counts||{}),
    humanJobRemaining:String(value?.humanJobRemaining||'UNKNOWN'),
    humanApprovals:arr(value?.humanApprovals).slice(0,12).map(row=>({
      kind:row.kind,
      ticketId:row.ticketId??null,
      candidateId:row.candidateId??null,
      skillId:row.skillId??null,
      fromStatus:row.fromStatus??null,
      proposedStatus:row.proposedStatus??null,
      decision:row.decision??null,
      validationReadinessScore:finite(row.validationReadinessScore,null),
      missingProofs:arr(row.missingProofs).slice(0,8)
    })),
    autoTriaged:arr(value?.autoTriaged).slice(0,12).map(row=>({
      kind:row.kind??'SKILL_REPAIR',
      candidateId:row.candidateId??null,
      skillId:row.skillId??null,
      decision:row.decision??null,
      class:row.class??null,
      autoDisposition:row.autoDisposition??row.reason??null
    })),
    execution:'SHADOW_ONLY',
    canExecute:false,
    canExecuteLive:false,
    automaticProductionMutation:false,
    automaticSkillTransition:false,
    automaticPromotion:false
  });
}
