import { sha256 } from './institutional-kernel.mjs';
import { verifyBiggjSkillTree } from './biggj-skill-tree.mjs';
import { buildBiggjResearchValidationHarness } from './biggj-research-validation-harness.mjs';

export const BIGGJ_OUTCOME_SUPERVISOR_VERSION='TCX_BIGGJ_OUTCOME_SUPERVISOR_V1';

const arr=v=>Array.isArray(v)?v:[];
const finite=(v,f=0)=>Number.isFinite(Number(v))?Number(v):f;
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,finite(v)));
const uniq=xs=>[...new Set(arr(xs).map(String).filter(Boolean))];
const freeze=value=>{
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    Object.freeze(value);
    for(const v of Object.values(value)) freeze(v);
  }
  return value;
};
const finalized=core=>freeze({...core,fingerprint:sha256(core)});

function blockerClass(ids=[]){
  const x=new Set(arr(ids).map(v=>String(v).toUpperCase()));
  if(['QUESTION_DECLARED','HYPOTHESIS_DECLARED','FALSIFIER_DECLARED'].some(k=>x.has(k))) return 'DEFINITION_BLOCK';
  if([...x].some(k=>k.includes('DEPENDENCY_GATE_READY'))) return 'DEPENDENCY_BLOCK';
  if([...x].some(k=>k.includes('PIT_SAFE')||k.includes('AUDIT_READY')||k.includes('SCIENCE_PASSED'))) return 'INTEGRITY_BLOCK';
  if(x.has('INDEPENDENT_EPISODES')) return 'INDEPENDENCE_BLOCK';
  if(x.has('FORWARD_SHADOW')) return 'FORWARD_SHADOW_BLOCK';
  if(x.has('TOTAL_EVIDENCE')) return 'EVIDENCE_VOLUME_BLOCK';
  if([...x].some(k=>k.includes('STABILITY')||k.includes('STRESS')||k.includes('WINNER_REMOVAL'))) return 'ROBUSTNESS_BLOCK';
  return x.size?'OTHER_BLOCK':'NONE';
}

function nextActionFor(review,classification){
  const next=String(review?.nextExperiment?.purpose||'').trim();
  if(next) return next;
  const map={
    DEFINITION_BLOCK:'Research question, hypothesis and falsifier must be explicit before collecting more evidence.',
    DEPENDENCY_BLOCK:'Resolve prerequisite capability evidence before attempting the next maturity transition.',
    INTEGRITY_BLOCK:'Repair or exclude evidence that is not PIT-safe, auditable or science-guard compliant.',
    INDEPENDENCE_BLOCK:'Collect additional conservatively separated independent episodes.',
    FORWARD_SHADOW_BLOCK:'Continue prospective forward-shadow observations.',
    EVIDENCE_VOLUME_BLOCK:'Collect additional point-in-time validation evidence.',
    ROBUSTNESS_BLOCK:'Run the missing chronological/adversarial robustness checks.',
    REVIEW_READY:'Prepare explicit operator review; do not auto-promote.',
    MEASURING:'Continue governed forward measurement.'
  };
  return map[classification]||'Continue governed research measurement.';
}

function classifyReview(review={}){
  const e=review.evidence||{};
  const blockers=arr(review.blockers).map(x=>String(x?.id||x));
  if(review.manualTransitionReviewEligible===true) return 'REVIEW_READY';
  const bc=blockerClass(blockers);
  if(bc!=='NONE') return bc;
  if(finite(e.researchEvidenceTotal)>0&&finite(e.total)===0) return 'NO_VALIDATION_EVIDENCE';
  if(finite(e.total)>0&&finite(e.forwardShadow)===0) return 'NO_FORWARD_SHADOW';
  if(finite(e.total)>0&&finite(e.independentEpisodes)===0) return 'NO_INDEPENDENT_EPISODES';
  return 'MEASURING';
}

function severityFor(classification){
  if(['INTEGRITY_BLOCK','DEFINITION_BLOCK'].includes(classification)) return 1;
  if(['DEPENDENCY_BLOCK','REVIEW_READY'].includes(classification)) return .9;
  if(['NO_VALIDATION_EVIDENCE','NO_FORWARD_SHADOW','NO_INDEPENDENT_EPISODES','INDEPENDENCE_BLOCK','FORWARD_SHADOW_BLOCK'].includes(classification)) return .75;
  if(['ROBUSTNESS_BLOCK','EVIDENCE_VOLUME_BLOCK'].includes(classification)) return .6;
  return .35;
}

function skillRows(tree){
  if(!verifyBiggjSkillTree(tree).ok) return [];
  const harness=buildBiggjResearchValidationHarness(tree,{limit:200});
  return arr(harness.reviews).map(review=>{
    const classification=classifyReview(review);
    const e=review.evidence||{};
    return freeze({
      skillId:String(review.skillId||'UNKNOWN'),
      title:String(review.title||review.skillId||'UNKNOWN'),
      currentStatus:String(review.currentStatus||'UNKNOWN'),
      recommendedStatus:String(review.recommendedStatus||review.currentStatus||'UNKNOWN'),
      validationPhase:String(review.validationPhase||'UNKNOWN'),
      readinessScore:clamp(review.readinessScore),
      classification,
      severity:severityFor(classification),
      blockers:arr(review.blockers).map(x=>String(x?.id||x)).filter(Boolean),
      nextAction:nextActionFor(review,classification),
      evidence:freeze({
        researchEvidenceTotal:finite(e.researchEvidenceTotal),
        validationEvidenceTotal:finite(e.total),
        forwardShadow:finite(e.forwardShadow),
        independentEpisodes:finite(e.independentEpisodes),
        pitCoverage:e.pitCoverage==null?null:clamp(e.pitCoverage),
        auditCoverage:e.auditCoverage==null?null:clamp(e.auditCoverage),
        scienceCoverage:e.scienceCoverage==null?null:clamp(e.scienceCoverage)
      }),
      manualReviewEligible:review.manualTransitionReviewEligible===true
    });
  });
}

function factoryRows(factory={}){
  return arr(factory?.nextTasks).map(row=>freeze({
    taskId:String(row?.taskId||'UNKNOWN'),
    type:String(row?.type||'UNKNOWN'),
    subject:String(row?.subject||'SYSTEM'),
    stalled:row?.stalled===true,
    stagnantCycles:Math.max(0,finite(row?.stagnantCycles)),
    queueAgeMs:Math.max(0,finite(row?.queueAgeMs)),
    priority:clamp(row?.effectivePriority??row?.priority),
    reason:String(row?.reason||'UNSPECIFIED'),
    nextAction:row?.autoHandler
      ?'Continue with '+String(row.autoHandler)+' under SHADOW_ONLY.'
      :'Requires explicit owner/review before any state-changing action.'
  }));
}

function attentionItems(skills,tasks,reviews={}){
  const rows=[];
  for(const task of tasks.filter(x=>x.stalled)){
    rows.push({
      type:'STALLED_RESEARCH_TASK',
      subject:task.subject,
      severity:1,
      why:'Research task is still queued without measurable progression across repeated factory cycles.',
      nextAction:task.nextAction,
      evidence:{stagnantCycles:task.stagnantCycles,queueAgeMs:task.queueAgeMs,reason:task.reason}
    });
  }
  for(const skill of skills.filter(x=>x.manualReviewEligible)){
    rows.push({
      type:'REVIEW_READY',
      subject:skill.title,
      severity:.95,
      why:'Validation gates are satisfied for a manual maturity-transition review.',
      nextAction:skill.nextAction,
      evidence:{skillId:skill.skillId,from:skill.currentStatus,to:skill.recommendedStatus,readinessScore:skill.readinessScore}
    });
  }
  for(const skill of skills.filter(x=>!x.manualReviewEligible&&x.classification!=='MEASURING')){
    rows.push({
      type:skill.classification,
      subject:skill.title,
      severity:skill.severity,
      why:skill.classification==='NO_VALIDATION_EVIDENCE'
        ?'Research evidence exists but none currently qualifies for the validation denominator.'
        :skill.classification==='NO_FORWARD_SHADOW'
          ?'Validation evidence exists but prospective forward-shadow evidence is still zero.'
          :skill.classification==='NO_INDEPENDENT_EPISODES'
            ?'Validation evidence exists but independent episode coverage is still zero.'
            :'The next maturity gate is blocked by '+(skill.blockers.join(', ')||skill.classification)+'.',
      nextAction:skill.nextAction,
      evidence:{skillId:skill.skillId,classification:skill.classification,...skill.evidence}
    });
  }
  if(finite(reviews?.blocked)>0){
    rows.push({
      type:'REVIEW_QUEUE_BLOCKED',
      subject:'RESEARCH_REVIEW_QUEUE',
      severity:.85,
      why:String(finite(reviews.blocked))+' review protocol(s) are blocked before a manual transition ticket can be created.',
      nextAction:'Inspect blocked review reasons and resolve protocol/contract drift before collecting unrelated evidence.',
      evidence:{blocked:finite(reviews.blocked)}
    });
  }
  return rows.sort((a,b)=>b.severity-a.severity||String(a.subject).localeCompare(String(b.subject))).slice(0,12);
}

function statusFor({invalid,stalled,reviewReady,integrityBlocks,validationEvidence,forwardShadow,skills}){
  if(invalid) return 'STATE_INVALID';
  if(stalled>0||integrityBlocks>0) return 'ACTION_REQUIRED';
  if(reviewReady>0) return 'REVIEW_READY';
  if(skills>0&&validationEvidence===0) return 'RESEARCH_WITHOUT_VALIDATION';
  if(validationEvidence>0&&forwardShadow===0) return 'VALIDATION_WITHOUT_FORWARD_SHADOW';
  if(skills>0) return 'MEASURING';
  return 'IDLE';
}

export function buildBiggjOutcomeSupervisor({
  livingResearchState=null,
  autonomousResearchFactory=null,
  asOf=Date.now()
}={}){
  const tree=livingResearchState?.skillTree;
  const validTree=verifyBiggjSkillTree(tree).ok;
  const skills=validTree?skillRows(tree):[];
  const tasks=factoryRows(autonomousResearchFactory||{});
  const reviewState=livingResearchState?.researchReviewQueue||{};
  const totals=skills.reduce((acc,row)=>{
    acc.researchEvidence+=finite(row.evidence.researchEvidenceTotal);
    acc.validationEvidence+=finite(row.evidence.validationEvidenceTotal);
    acc.forwardShadow+=finite(row.evidence.forwardShadow);
    acc.independentEpisodes+=finite(row.evidence.independentEpisodes);
    if(row.manualReviewEligible)acc.reviewReady++;
    if(row.classification==='INTEGRITY_BLOCK')acc.integrityBlocks++;
    return acc;
  },{researchEvidence:0,validationEvidence:0,forwardShadow:0,independentEpisodes:0,reviewReady:0,integrityBlocks:0});
  const stalled=tasks.filter(x=>x.stalled).length;
  const validationConversion=totals.researchEvidence>0?totals.validationEvidence/totals.researchEvidence:null;
  const forwardConversion=totals.validationEvidence>0?totals.forwardShadow/totals.validationEvidence:null;
  const attention=attentionItems(skills,tasks,{
    blocked:finite(reviewState?.blockedCount),
    open:finite(reviewState?.ticketCount)
  });
  const status=statusFor({
    invalid:!validTree,
    stalled,
    reviewReady:totals.reviewReady,
    integrityBlocks:totals.integrityBlocks,
    validationEvidence:totals.validationEvidence,
    forwardShadow:totals.forwardShadow,
    skills:skills.length
  });
  const core={
    version:BIGGJ_OUTCOME_SUPERVISOR_VERSION,
    generatedAt:finite(asOf,Date.now()),
    status,
    outcomeHealth:{
      discoveredSkills:skills.length,
      researchEvidence:totals.researchEvidence,
      validationEvidence:totals.validationEvidence,
      forwardShadow:totals.forwardShadow,
      independentEpisodes:totals.independentEpisodes,
      reviewReady:totals.reviewReady,
      reviewOpen:finite(reviewState?.ticketCount),
      reviewBlocked:finite(reviewState?.blockedCount),
      stalledResearchTasks:stalled,
      integrityBlocks:totals.integrityBlocks,
      validationConversion:validationConversion==null?null:clamp(validationConversion),
      forwardConversion:forwardConversion==null?null:clamp(forwardConversion),
      semantics:'Diagnostic pipeline conversion only; not a probability, quality score or profitability claim.'
    },
    skills:skills.sort((a,b)=>
      Number(b.manualReviewEligible)-Number(a.manualReviewEligible)||
      b.severity-a.severity||
      b.readinessScore-a.readinessScore||
      a.skillId.localeCompare(b.skillId)
    ).slice(0,30),
    stalledTasks:tasks.filter(x=>x.stalled).sort((a,b)=>b.stagnantCycles-a.stagnantCycles||b.queueAgeMs-a.queueAgeMs).slice(0,12),
    attention,
    executive:{
      headline:status==='ACTION_REQUIRED'
        ?'Research is operating, but one or more outcome bottlenecks require attention.'
        :status==='REVIEW_READY'
          ?'Evidence has reached at least one manual maturity-review gate.'
          :status==='RESEARCH_WITHOUT_VALIDATION'
            ?'Research activity exists, but it has not yet converted into validation-eligible evidence.'
            :status==='VALIDATION_WITHOUT_FORWARD_SHADOW'
              ?'Validation evidence exists, but prospective forward-shadow proof is still missing.'
              :status==='MEASURING'
                ?'Research pipeline is measuring and accumulating governed evidence.'
                :'No active research outcome is currently available.',
      whatMatters:attention.slice(0,5),
      nextAction:attention[0]?.nextAction||'Continue governed measurement and wait for new point-in-time evidence.',
      machineActivityIsNotOutcome:true
    },
    safety:{
      execution:'SHADOW_ONLY',
      canExecuteLive:false,
      automaticPromotion:false,
      automaticSkillTransition:false,
      primaryMutationAllowed:false
    }
  };
  return finalized(core);
}

export function verifyBiggjOutcomeSupervisor(value){
  const reasons=[];
  if(value?.version!==BIGGJ_OUTCOME_SUPERVISOR_VERSION)reasons.push('VERSION_INVALID');
  if(value?.safety?.execution!=='SHADOW_ONLY'||value?.safety?.canExecuteLive!==false)reasons.push('SAFETY_INVALID');
  if(value?.safety?.automaticPromotion!==false||value?.safety?.automaticSkillTransition!==false||value?.safety?.primaryMutationAllowed!==false)reasons.push('AUTHORITY_INVALID');
  const {fingerprint,...core}=value||{};
  if(fingerprint!==sha256(core))reasons.push('FINGERPRINT_MISMATCH');
  return {ok:reasons.length===0,reasons};
}
