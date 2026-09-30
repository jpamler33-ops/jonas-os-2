import { sha256 } from './institutional-kernel.mjs';
import {
  verifyBiggjSkillTree,
  evaluateBiggjSkillProgress,
  applyBiggjSkillStatusTransition
} from './biggj-skill-tree.mjs';
import {
  verifyBiggjResearchProtocol,
  evaluateBiggjResearchProtocol
} from './biggj-research-protocol-compiler.mjs';

export const BIGGJ_RESEARCH_REVIEW_QUEUE_VERSION='TCX_BIGGJ_RESEARCH_REVIEW_QUEUE_V1';

const deepFreeze=value=>{
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    Object.freeze(value);
    for(const v of Object.values(value)) deepFreeze(v);
  }
  return value;
};
const clone=value=>value==null?value:structuredClone(value);
const finalized=core=>deepFreeze({...core,fingerprint:sha256(core)});

function proposedStatusFor(skill,protocolEvaluation,progress){
  const current=String(skill?.status||'UNKNOWN').toUpperCase();
  const recommended=String(progress?.recommendedStatus||current).toUpperCase();
  const state=String(protocolEvaluation?.state||'').toUpperCase();

  if(
    current==='DISCOVERING'&&recommended==='LEARNING'&&
    ['LEARNING_REVIEW_EVIDENCE_READY','FORMAL_TESTING_REVIEW_EVIDENCE_READY','VALIDATION_REVIEW_EVIDENCE_READY'].includes(state)
  ) return 'LEARNING';

  if(
    current==='LEARNING'&&recommended==='TESTING'&&
    ['FORMAL_TESTING_REVIEW_EVIDENCE_READY','VALIDATION_REVIEW_EVIDENCE_READY'].includes(state)
  ) return 'TESTING';

  if(
    current==='TESTING'&&recommended==='VALIDATED'&&
    state==='VALIDATION_REVIEW_EVIDENCE_READY'
  ) return 'VALIDATED';

  return null;
}

export function buildBiggjResearchReviewQueue({
  tree,
  protocols=[],
  asOf=Date.now()
}={}){
  const tv=verifyBiggjSkillTree(tree);
  if(!tv.ok) throw new Error('skill tree invalid: '+tv.reasons.join(','));
  const t=Number(asOf);
  if(!Number.isFinite(t)) throw new Error('asOf must be finite');

  const tickets=[];
  const blocked=[];

  for(const protocol of protocols||[]){
    const pv=verifyBiggjResearchProtocol(protocol);
    if(!pv.ok){
      blocked.push({
        protocolId:protocol?.protocolId??null,
        skillId:protocol?.skillId??null,
        reason:'PROTOCOL_INVALID',
        details:[...pv.reasons]
      });
      continue;
    }
    const skill=(tree.nodes||[]).find(x=>x.skillId===protocol.skillId);
    if(!skill){
      blocked.push({
        protocolId:protocol.protocolId,
        skillId:protocol.skillId,
        reason:'SKILL_MISSING',
        details:[]
      });
      continue;
    }
    const evaluation=evaluateBiggjResearchProtocol(protocol,tree);
    if(evaluation.state==='PROTOCOL_INVALIDATED_BY_CONTRACT_DRIFT'){
      blocked.push({
        protocolId:protocol.protocolId,
        skillId:protocol.skillId,
        reason:'PROTOCOL_CONTRACT_DRIFT',
        details:[...(evaluation.reasons||[])]
      });
      continue;
    }
    const progress=evaluateBiggjSkillProgress(tree,skill.skillId);
    const proposedStatus=proposedStatusFor(skill,evaluation,progress);
    if(!proposedStatus) continue;

    const core={
      version:BIGGJ_RESEARCH_REVIEW_QUEUE_VERSION,
      protocolId:protocol.protocolId,
      skillId:skill.skillId,
      fromStatus:String(skill.status),
      proposedStatus,
      createdAt:t,
      protocolEvaluationFingerprint:evaluation.fingerprint,
      skillEvaluationFingerprint:progress.fingerprint,
      evidenceState:evaluation.state,
      postRegistrationEvidence:clone(evaluation.postRegistrationEvidence),
      dependencyGates:clone(progress.dependencyGates),
      reviewPolicy:{
        explicitApprovalRequired:true,
        automaticApply:false,
        trustedTransitionForbidden:true,
        primaryMutationAllowed:false
      },
      execution:'SHADOW_ONLY',
      action:'ABSTAIN',
      canInfluencePrimary:false,
      canExecuteLive:false,
      productionMutationPerformed:false
    };
    tickets.push(deepFreeze({
      ...core,
      ticketId:'review:'+sha256(core).slice(0,28)
    }));
  }

  tickets.sort((a,b)=>
    String(a.skillId).localeCompare(String(b.skillId))||
    String(a.proposedStatus).localeCompare(String(b.proposedStatus))
  );

  return finalized({
    version:BIGGJ_RESEARCH_REVIEW_QUEUE_VERSION,
    builtAt:t,
    tickets,
    blocked,
    ticketCount:tickets.length,
    blockedCount:blocked.length,
    automaticApply:false,
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canInfluencePrimary:false,
    canExecuteLive:false,
    productionMutationPerformed:false
  });
}

export function verifyBiggjResearchReviewQueue(value){
  try{
    const reasons=[];
    if(value?.version!==BIGGJ_RESEARCH_REVIEW_QUEUE_VERSION) reasons.push('VERSION_INVALID');
    if(value?.execution!=='SHADOW_ONLY'||value?.action!=='ABSTAIN'||value?.canInfluencePrimary!==false||value?.canExecuteLive!==false){
      reasons.push('SAFETY_INVARIANT_INVALID');
    }
    if(value?.automaticApply!==false||value?.productionMutationPerformed!==false){
      reasons.push('AUTHORITY_INVARIANT_INVALID');
    }
    if(!Array.isArray(value?.tickets)) reasons.push('TICKETS_INVALID');
    if(!Array.isArray(value?.blocked)) reasons.push('BLOCKED_INVALID');
    const {fingerprint,...core}=value||{};
    if(fingerprint!==sha256(core)) reasons.push('FINGERPRINT_MISMATCH');
    const ids=new Set();
    for(const ticket of value?.tickets||[]){
      if(ticket?.version!==BIGGJ_RESEARCH_REVIEW_QUEUE_VERSION) reasons.push('TICKET_VERSION_INVALID');
      if(ids.has(ticket?.ticketId)) reasons.push('TICKET_ID_DUPLICATE');
      ids.add(ticket?.ticketId);
      if(ticket?.reviewPolicy?.explicitApprovalRequired!==true||ticket?.reviewPolicy?.automaticApply!==false){
        reasons.push('TICKET_AUTHORITY_INVALID');
      }
      if(ticket?.canExecuteLive!==false||ticket?.canInfluencePrimary!==false){
        reasons.push('TICKET_SAFETY_INVALID');
      }
    }
    return {ok:reasons.length===0,reasons};
  }catch(err){
    return {ok:false,reasons:['REVIEW_QUEUE_INVALID',err instanceof Error?err.message:String(err)]};
  }
}

export function applyBiggjResearchReviewDecision({
  tree,
  ticket,
  approved,
  asOf=Date.now(),
  reviewer='OPERATOR'
}={}){
  const tv=verifyBiggjSkillTree(tree);
  if(!tv.ok) throw new Error('skill tree invalid: '+tv.reasons.join(','));
  if(ticket?.version!==BIGGJ_RESEARCH_REVIEW_QUEUE_VERSION) throw new Error('review ticket version invalid');
  const t=Number(asOf);
  if(!Number.isFinite(t)) throw new Error('asOf must be finite');
  const skill=(tree.nodes||[]).find(x=>x.skillId===ticket.skillId);
  if(!skill) throw new Error('review skill missing');
  if(String(skill.status)!==String(ticket.fromStatus)) throw new Error('review ticket stale: skill status changed');
  if(String(ticket.proposedStatus)==='TRUSTED') throw new Error('trusted transition requires versioned promotion path');

  if(approved!==true){
    return deepFreeze({
      changed:false,
      tree,
      decision:finalized({
        version:BIGGJ_RESEARCH_REVIEW_QUEUE_VERSION,
        ticketId:ticket.ticketId,
        skillId:ticket.skillId,
        decision:'REJECTED',
        reviewer:String(reviewer||'OPERATOR'),
        decidedAt:t,
        productionMutationPerformed:false,
        execution:'SHADOW_ONLY',
        action:'ABSTAIN',
        canExecuteLive:false
      })
    });
  }

  const evaluation=evaluateBiggjSkillProgress(tree,ticket.skillId);
  if(String(evaluation.recommendedStatus)!==String(ticket.proposedStatus)){
    throw new Error('review ticket stale: recommendation changed');
  }
  if(evaluation.fingerprint!==ticket.skillEvaluationFingerprint){
    throw new Error('review ticket stale: evaluation changed');
  }

  const next=applyBiggjSkillStatusTransition(tree,{
    skillId:ticket.skillId,
    toStatus:ticket.proposedStatus,
    evaluation,
    asOf:t,
    promotionRecordId:null
  });

  return deepFreeze({
    changed:true,
    tree:next,
    decision:finalized({
      version:BIGGJ_RESEARCH_REVIEW_QUEUE_VERSION,
      ticketId:ticket.ticketId,
      skillId:ticket.skillId,
      decision:'APPROVED',
      fromStatus:ticket.fromStatus,
      toStatus:ticket.proposedStatus,
      reviewer:String(reviewer||'OPERATOR'),
      decidedAt:t,
      productionMutationPerformed:false,
      execution:'SHADOW_ONLY',
      action:'ABSTAIN',
      canExecuteLive:false
    })
  });
}
