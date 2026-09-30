import { sha256 } from './institutional-kernel.mjs';
import { verifyForecastClaimAssumptionSidecar } from './forecast-claim-assumption-sidecar.mjs';
import { FORECAST_THESIS_DECLARATIONS_VERSION } from './forecast-thesis-declarations.mjs';
import {
  createInitialAssumptionStability,
  observeAssumptionStability,
  verifyAssumptionStability,
  FORECAST_ASSUMPTION_STABILITY_VERSION
} from './forecast-assumption-stability.mjs';

export const LEGACY_FORECAST_THESIS_REVISION_MEMORY_VERSION='TCX_FORECAST_THESIS_REVISION_MEMORY_V1';
export const FORECAST_THESIS_REVISION_MEMORY_VERSION='TCX_FORECAST_THESIS_REVISION_MEMORY_V2';
export const FORECAST_THESIS_REVISION_ARTIFACT_VERSION='TCX_FORECAST_THESIS_REVISION_ARTIFACT_V1';

const deepFreeze=value=>{
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    Object.freeze(value);
    for(const v of Object.values(value)) deepFreeze(v);
  }
  return value;
};
const clone=value=>value==null?value:structuredClone(value);
const finite=(v,name)=>{
  const n=Number(v);
  if(!Number.isFinite(n)) throw new Error(name+' must be finite');
  return n;
};
const text=(v,f='')=>String(v??f).trim();
const uniq=xs=>[...new Set((xs||[]).map(String).filter(Boolean))].sort();
const thesisId=v=>String(v||'').startsWith('THESIS_');

function finalized(core){
  return deepFreeze({...core,fingerprint:sha256(core)});
}
function coreOf(value){
  const {fingerprint,...core}=value||{};
  return core;
}
function supportStateFromDeclaration(row,evidenceMap){
  if(!row) return 'DECLARATION_MISSING';
  const ids=uniq(row.evidenceIds);
  if(ids.length===0) return row.requiresEvidence===true?'REQUIRED_SUPPORT_MISSING':'EXPLICIT_ASSUMPTION';
  return ids.every(id=>evidenceMap.has(id))?'EVIDENCE_LINKED':'EVIDENCE_REFERENCE_MISSING';
}
function supportedState(state){
  return state==='EVIDENCE_LINKED'||state==='EXPLICIT_ASSUMPTION';
}
function assumptionEvidenceDigest(ids,evidenceMap){
  const rows=uniq(ids).map(id=>evidenceMap.get(id)).filter(Boolean).map(row=>({
    evidenceId:String(row.evidenceId),
    classification:String(row.classification||row.epistemicClass||'UNKNOWN'),
    statement:row.statement??null,
    provenanceIds:uniq(row.provenanceIds),
    availableAt:Number(row.availableAt)
  }));
  return rows.length?sha256(rows):null;
}
function evidenceDetails(ids,evidenceMap){
  return uniq(ids).map(id=>evidenceMap.get(id)).filter(Boolean).map(row=>({
    evidenceId:String(row.evidenceId),
    classification:String(row.classification||row.epistemicClass||'UNKNOWN'),
    statement:row.statement??null,
    provenanceIds:uniq(row.provenanceIds),
    availableAt:Number(row.availableAt)
  }));
}
function thesisAssumptionNodes(sidecar){
  return (sidecar?.graph?.nodes||[])
    .filter(x=>x?.type==='ASSUMPTION'&&thesisId(x.assumptionId))
    .sort((a,b)=>String(a.assumptionId).localeCompare(String(b.assumptionId)));
}
function graphEvidenceMap(sidecar){
  return new Map((sidecar?.graph?.nodes||[])
    .filter(x=>x?.type==='EVIDENCE')
    .map(x=>[String(x.evidenceId),x]));
}
function declarationsEvidenceMap(declarations){
  return new Map((declarations?.evidence||[]).map(x=>[String(x.evidenceId),x]));
}
function declarationsAssumptionMap(declarations){
  return new Map((declarations?.assumptions||[])
    .filter(x=>thesisId(x?.assumptionId))
    .map(x=>[String(x.assumptionId),x]));
}

export function createInitialForecastThesisRevisionMemory({
  forecastId,
  issuance
}={}){
  const sidecar=issuance?.claimAssumptionSidecar;
  const sv=verifyForecastClaimAssumptionSidecar(sidecar);
  if(!sv.ok) throw new Error('claim-assumption sidecar invalid: '+sv.reasons.join(','));
  const id=text(forecastId??issuance?.forecast?.forecastId);
  if(!id) throw new Error('forecastId required');
  const issueEvidence=graphEvidenceMap(sidecar);
  const assumptions=thesisAssumptionNodes(sidecar).map(node=>({
    assumptionId:String(node.assumptionId),
    issueSupportState:String(node.supportState||'UNKNOWN'),
    currentSupportState:String(node.supportState||'UNKNOWN'),
    issueSupported:supportedState(String(node.supportState||'UNKNOWN')),
    currentSupported:supportedState(String(node.supportState||'UNKNOWN')),
    issueEvidenceIds:uniq(node.evidenceIds),
    currentEvidenceIds:uniq(node.evidenceIds),
    issueEvidenceFingerprint:assumptionEvidenceDigest(node.evidenceIds,issueEvidence),
    currentEvidenceFingerprint:assumptionEvidenceDigest(node.evidenceIds,issueEvidence),
    firstSupportLostAt:null,
    firstSupportRestoredAt:null,
    lastSupportChangedAt:null,
    supportTransitionCount:0
  }));
  const core={
    version:FORECAST_THESIS_REVISION_MEMORY_VERSION,
    forecastId:id,
    issuanceId:text(issuance?.issuanceId),
    symbol:text(issuance?.symbol).toUpperCase(),
    decisionAsOf:finite(issuance?.asOf,'issuance.asOf'),
    issueKnowledgeAt:finite(sidecar?.generatedAt,'sidecar.generatedAt'),
    issueGraphFingerprint:text(sidecar?.graphFingerprint),
    issueSidecarFingerprint:text(sidecar?.fingerprint),
    assumptionCount:assumptions.length,
    assumptions,
    lastObservedAt:null,
    lastCurrentDeclarationFingerprint:null,
    lastForecastAssessmentStatus:'ISSUED',
    firstWatchAt:null,
    firstStaleAt:null,
    firstForecastInvalidatedAt:null,
    eventCount:0,
    events:[],
    semantics:{
      immutableIssueState:true,
      revisionEventsAreProspective:true,
      supportLossDoesNotProveForecastFailure:true,
      invalidationAssessmentIsNotCausalProof:true,
      noOutcomeInformationUsed:true
    },
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canInfluencePrimary:false,
    canExecuteLive:false
  };
  return finalized(core);
}

export function verifyForecastThesisRevisionMemory(value){
  try{
    const reasons=[];
    if(value?.version!==FORECAST_THESIS_REVISION_MEMORY_VERSION) reasons.push('VERSION_INVALID');
    if(value?.execution!=='SHADOW_ONLY'||value?.action!=='ABSTAIN'||value?.canInfluencePrimary!==false||value?.canExecuteLive!==false){
      reasons.push('SAFETY_INVARIANT_INVALID');
    }
    if(!text(value?.forecastId)) reasons.push('FORECAST_ID_MISSING');
    if(!Number.isFinite(Number(value?.decisionAsOf))) reasons.push('DECISION_ASOF_INVALID');
    if(!Number.isFinite(Number(value?.issueKnowledgeAt))) reasons.push('ISSUE_KNOWLEDGE_AT_INVALID');
    if(Number(value?.issueKnowledgeAt)<Number(value?.decisionAsOf)) reasons.push('ISSUE_TIME_ORDER_INVALID');
    if(!Array.isArray(value?.assumptions)) reasons.push('ASSUMPTIONS_INVALID');
    if(!Array.isArray(value?.events)) reasons.push('EVENTS_INVALID');
    const expected=sha256(coreOf(value));
    if(value?.fingerprint!==expected) reasons.push('FINGERPRINT_MISMATCH');
    return {ok:reasons.length===0,reasons,expectedFingerprint:expected};
  }catch(err){
    return {ok:false,reasons:['THESIS_REVISION_MEMORY_INVALID',err instanceof Error?err.message:String(err)]};
  }
}

export function createForecastThesisRevisionArtifact({
  issuance,
  currentDeclarations,
  observedAt,
  currentInputFingerprint=null,
  forecastRevisionAssessment=null
}={}){
  const sidecar=issuance?.claimAssumptionSidecar;
  const sv=verifyForecastClaimAssumptionSidecar(sidecar);
  if(!sv.ok) throw new Error('claim-assumption sidecar invalid: '+sv.reasons.join(','));
  if(currentDeclarations?.version!==FORECAST_THESIS_DECLARATIONS_VERSION){
    throw new Error('current thesis declarations version invalid');
  }
  const at=finite(observedAt,'observedAt');
  if(at<Number(sidecar.generatedAt)) throw new Error('observedAt cannot predate issue knowledge time');
  if(Number(currentDeclarations.asOf)>at) throw new Error('current declarations cannot be from the future');
  if(Number(currentDeclarations.generatedAt)>at) throw new Error('revision cannot predate declaration knowledge time');

  const issueEvidence=graphEvidenceMap(sidecar);
  const currentEvidence=declarationsEvidenceMap(currentDeclarations);
  const currentAssumptions=declarationsAssumptionMap(currentDeclarations);

  const assumptions=thesisAssumptionNodes(sidecar).map(issue=>{
    const assumptionId=String(issue.assumptionId);
    const current=currentAssumptions.get(assumptionId)||null;
    const issueSupportState=String(issue.supportState||'UNKNOWN');
    const currentSupportState=supportStateFromDeclaration(current,currentEvidence);
    const expectedEvidenceIds=uniq([
      ...uniq(issue.evidenceIds),
      ...uniq(current?.evidenceIds)
    ]);
    const issueEvidenceFingerprint=assumptionEvidenceDigest(expectedEvidenceIds,issueEvidence);
    const currentEvidenceFingerprint=assumptionEvidenceDigest(expectedEvidenceIds,currentEvidence);
    return {
      assumptionId,
      issueSupportState,
      currentSupportState,
      issueSupported:supportedState(issueSupportState),
      currentSupported:currentSupportState==='DECLARATION_MISSING'?null:supportedState(currentSupportState),
      issueEvidenceIds:uniq(issue.evidenceIds),
      currentEvidenceIds:uniq(current?.evidenceIds),
      expectedEvidenceIds,
      issueEvidenceFingerprint,
      currentEvidenceFingerprint,
      evidenceChanged:
        issueEvidenceFingerprint!=null&&
        currentEvidenceFingerprint!=null&&
        issueEvidenceFingerprint!==currentEvidenceFingerprint,
      currentEvidence:evidenceDetails(expectedEvidenceIds,currentEvidence)
    };
  });

  const coverageComplete=assumptions.every(x=>x.currentSupportState!=='DECLARATION_MISSING');
  const currentUnsupportedAssumptionIds=assumptions
    .filter(x=>x.currentSupported===false)
    .map(x=>x.assumptionId)
    .sort();
  const issueUnsupportedAssumptionIds=assumptions
    .filter(x=>x.issueSupported===false)
    .map(x=>x.assumptionId)
    .sort();
  const supportLostSinceIssueIds=assumptions
    .filter(x=>x.issueSupported===true&&x.currentSupported===false)
    .map(x=>x.assumptionId)
    .sort();
  const supportRestoredSinceIssueIds=assumptions
    .filter(x=>x.issueSupported===false&&x.currentSupported===true)
    .map(x=>x.assumptionId)
    .sort();

  const assessmentStatus=text(forecastRevisionAssessment?.status,'UNKNOWN').toUpperCase();
  const assessment={
    status:assessmentStatus,
    score:Number.isFinite(Number(forecastRevisionAssessment?.score))?Number(forecastRevisionAssessment.score):null,
    reasons:uniq(forecastRevisionAssessment?.reasons),
    warnings:uniq(forecastRevisionAssessment?.warnings),
    elapsedMs:Number.isFinite(Number(forecastRevisionAssessment?.elapsedMs))?Number(forecastRevisionAssessment.elapsedMs):null,
    envelopeBreach:Number.isFinite(Number(forecastRevisionAssessment?.envelopeBreach))?Number(forecastRevisionAssessment.envelopeBreach):null,
    regimeChanged:forecastRevisionAssessment?.regimeChanged===true,
    hardGuardActive:forecastRevisionAssessment?.hardGuardActive===true
  };

  const core={
    version:FORECAST_THESIS_REVISION_ARTIFACT_VERSION,
    forecastId:text(issuance?.forecast?.forecastId),
    issuanceId:text(issuance?.issuanceId),
    symbol:text(issuance?.symbol).toUpperCase(),
    decisionAsOf:finite(issuance?.asOf,'issuance.asOf'),
    issueKnowledgeAt:finite(sidecar?.generatedAt,'sidecar.generatedAt'),
    currentStateAsOf:finite(currentDeclarations?.asOf,'currentDeclarations.asOf'),
    observedAt:at,
    issueGraphFingerprint:text(sidecar?.graphFingerprint),
    currentDeclarationFingerprint:text(currentDeclarations?.fingerprint),
    currentInputFingerprint:text(currentInputFingerprint)||null,
    assumptions,
    diagnostics:{
      coverageComplete,
      issueUnsupportedAssumptionIds,
      currentUnsupportedAssumptionIds,
      supportLostSinceIssueIds,
      supportRestoredSinceIssueIds,
      currentUnsupportedCount:currentUnsupportedAssumptionIds.length,
      supportLostSinceIssueCount:supportLostSinceIssueIds.length,
      supportRestoredSinceIssueCount:supportRestoredSinceIssueIds.length
    },
    forecastAssessment:assessment,
    semantics:{
      comparesFrozenIssueStateToLaterPointInTimeState:true,
      currentDeclarationIsNotARewriteOfIssueGraph:true,
      evidenceChangeAloneDoesNotMeanInvalidation:true,
      supportLossIsAResearchWarningNotCausalProof:true,
      noOutcomeInformationUsed:true
    },
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canInfluencePrimary:false,
    canExecuteLive:false
  };
  return finalized(core);
}

export function verifyForecastThesisRevisionArtifact(value){
  try{
    const reasons=[];
    if(value?.version!==FORECAST_THESIS_REVISION_ARTIFACT_VERSION) reasons.push('VERSION_INVALID');
    if(value?.execution!=='SHADOW_ONLY'||value?.action!=='ABSTAIN'||value?.canInfluencePrimary!==false||value?.canExecuteLive!==false){
      reasons.push('SAFETY_INVARIANT_INVALID');
    }
    if(Number(value?.issueKnowledgeAt)<Number(value?.decisionAsOf)) reasons.push('ISSUE_TIME_ORDER_INVALID');
    if(Number(value?.observedAt)<Number(value?.issueKnowledgeAt)) reasons.push('TIME_ORDER_INVALID');
    if(!Array.isArray(value?.assumptions)) reasons.push('ASSUMPTIONS_INVALID');
    const expected=sha256(coreOf(value));
    if(value?.fingerprint!==expected) reasons.push('FINGERPRINT_MISMATCH');
    return {ok:reasons.length===0,reasons,expectedFingerprint:expected};
  }catch(err){
    return {ok:false,reasons:['THESIS_REVISION_ARTIFACT_INVALID',err instanceof Error?err.message:String(err)]};
  }
}

export function applyForecastThesisRevision(memory,artifact,{maxEvents=96}={}){
  const mv=verifyForecastThesisRevisionMemory(memory);
  if(!mv.ok) throw new Error('thesis revision memory invalid: '+mv.reasons.join(','));
  const av=verifyForecastThesisRevisionArtifact(artifact);
  if(!av.ok) throw new Error('thesis revision artifact invalid: '+av.reasons.join(','));
  if(memory.forecastId!==artifact.forecastId||memory.issuanceId!==artifact.issuanceId){
    throw new Error('thesis revision identity mismatch');
  }
  if(Number(artifact.observedAt)<Number(memory.issueKnowledgeAt)) throw new Error('revision predates issue knowledge');

  const priorById=new Map(memory.assumptions.map(x=>[x.assumptionId,x]));
  const supportTransitions=[];
  const missingDeclarationIds=[];
  const nextAssumptions=artifact.assumptions.map(row=>{
    const prior=priorById.get(row.assumptionId);
    if(!prior) throw new Error('revision assumption missing from issue memory: '+row.assumptionId);
    if(row.currentSupported==null){
      missingDeclarationIds.push(row.assumptionId);
      return clone(prior);
    }
    const previous=prior.currentSupported;
    const current=row.currentSupported;
    let transition='UNCHANGED';
    if(previous===true&&current===false) transition='SUPPORT_LOST';
    else if(previous===false&&current===true) transition='SUPPORT_RESTORED';
    if(transition!=='UNCHANGED'){
      supportTransitions.push({
        assumptionId:row.assumptionId,
        transition,
        fromSupportState:prior.currentSupportState,
        toSupportState:row.currentSupportState,
        issueEvidenceFingerprint:prior.issueEvidenceFingerprint,
        previousEvidenceFingerprint:prior.currentEvidenceFingerprint,
        currentEvidenceFingerprint:row.currentEvidenceFingerprint,
        currentEvidence:clone(row.currentEvidence)
      });
    }
    return {
      ...clone(prior),
      currentSupportState:row.currentSupportState,
      currentSupported:current,
      currentEvidenceIds:clone(row.currentEvidenceIds),
      currentEvidenceFingerprint:row.currentEvidenceFingerprint,
      firstSupportLostAt:
        prior.firstSupportLostAt??
        (transition==='SUPPORT_LOST'?artifact.observedAt:null),
      firstSupportRestoredAt:
        prior.firstSupportRestoredAt??
        (transition==='SUPPORT_RESTORED'?artifact.observedAt:null),
      lastSupportChangedAt:transition==='UNCHANGED'?prior.lastSupportChangedAt:artifact.observedAt,
      supportTransitionCount:Number(prior.supportTransitionCount||0)+(transition==='UNCHANGED'?0:1)
    };
  });

  const assessmentStatus=text(artifact?.forecastAssessment?.status,'UNKNOWN').toUpperCase();
  const priorAssessmentStatus=text(memory?.lastForecastAssessmentStatus,'ISSUED').toUpperCase();
  const assessmentChanged=assessmentStatus!==priorAssessmentStatus;
  const meaningfulAssessmentChange=
    assessmentChanged&&
    ['VALID','WATCH','INVALIDATED','INSUFFICIENT'].includes(assessmentStatus);
  const significant=
    supportTransitions.length>0||
    missingDeclarationIds.length>0||
    meaningfulAssessmentChange;

  if(!significant){
    return deepFreeze({
      changed:false,
      memory,
      event:null,
      reasons:['NO_MEANINGFUL_REVISION_TRANSITION']
    });
  }

  const eventCore={
    eventVersion:'TCX_FORECAST_THESIS_REVISION_EVENT_V1',
    forecastId:memory.forecastId,
    issuanceId:memory.issuanceId,
    observedAt:artifact.observedAt,
    currentDeclarationFingerprint:artifact.currentDeclarationFingerprint,
    currentInputFingerprint:artifact.currentInputFingerprint,
    supportTransitions,
    missingDeclarationIds:uniq(missingDeclarationIds),
    forecastAssessmentTransition:{
      from:priorAssessmentStatus,
      to:assessmentStatus,
      changed:assessmentChanged,
      score:artifact.forecastAssessment.score,
      reasons:clone(artifact.forecastAssessment.reasons),
      warnings:clone(artifact.forecastAssessment.warnings),
      regimeChanged:artifact.forecastAssessment.regimeChanged,
      hardGuardActive:artifact.forecastAssessment.hardGuardActive,
      envelopeBreach:artifact.forecastAssessment.envelopeBreach
    },
    currentUnsupportedAssumptionIds:clone(artifact.diagnostics.currentUnsupportedAssumptionIds),
    issueGraphFingerprint:memory.issueGraphFingerprint,
    artifactFingerprint:artifact.fingerprint,
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canInfluencePrimary:false,
    canExecuteLive:false
  };
  const event=deepFreeze({...eventCore,eventId:sha256(eventCore)});
  const supportLostNow=supportTransitions.some(x=>x.transition==='SUPPORT_LOST');
  const firstStaleAt=memory.firstStaleAt??(supportLostNow?artifact.observedAt:null);
  const firstWatchAt=memory.firstWatchAt??(assessmentStatus==='WATCH'?artifact.observedAt:null);
  const firstForecastInvalidatedAt=
    memory.firstForecastInvalidatedAt??
    (assessmentStatus==='INVALIDATED'?artifact.observedAt:null);
  const bounded=[...memory.events,clone(event)].slice(-Math.max(8,Math.floor(Number(maxEvents)||96)));

  const core={
    ...coreOf(memory),
    assumptions:nextAssumptions,
    lastObservedAt:artifact.observedAt,
    lastCurrentDeclarationFingerprint:artifact.currentDeclarationFingerprint,
    lastForecastAssessmentStatus:assessmentStatus,
    firstWatchAt,
    firstStaleAt,
    firstForecastInvalidatedAt,
    eventCount:Number(memory.eventCount||0)+1,
    events:bounded
  };
  return deepFreeze({
    changed:true,
    memory:finalized(core),
    event,
    reasons:[]
  });
}

export function forecastThesisPreOutcomeRevisionState(memory,{maturedAt}={}){
  const mv=verifyForecastThesisRevisionMemory(memory);
  if(!mv.ok) throw new Error('thesis revision memory invalid: '+mv.reasons.join(','));
  const maturity=finite(maturedAt,'maturedAt');
  const events=(memory.events||[])
    .filter(x=>Number(x.observedAt)<=maturity)
    .sort((a,b)=>Number(a.observedAt)-Number(b.observedAt)||String(a.eventId).localeCompare(String(b.eventId)));

  const stale=new Set();
  const everStale=new Set();
  let firstStaleAt=null;
  let firstWatchAt=null;
  let firstInvalidatedAt=null;

  for(const event of events){
    for(const t of event.supportTransitions||[]){
      if(t.transition==='SUPPORT_LOST'){
        stale.add(t.assumptionId);
        everStale.add(t.assumptionId);
        if(firstStaleAt==null) firstStaleAt=Number(event.observedAt);
      }else if(t.transition==='SUPPORT_RESTORED'){
        stale.delete(t.assumptionId);
      }
    }
    const status=String(event.forecastAssessmentTransition?.to||'UNKNOWN').toUpperCase();
    if(status==='WATCH'&&firstWatchAt==null) firstWatchAt=Number(event.observedAt);
    if(status==='INVALIDATED'&&firstInvalidatedAt==null) firstInvalidatedAt=Number(event.observedAt);
  }

  const warningTimes=[firstStaleAt,firstWatchAt,firstInvalidatedAt].filter(Number.isFinite);
  const firstWarningAt=warningTimes.length?Math.min(...warningTimes):null;
  return deepFreeze({
    version:FORECAST_THESIS_REVISION_MEMORY_VERSION,
    forecastId:memory.forecastId,
    maturedAt:maturity,
    eventsBeforeMaturity:events.length,
    staleAssumptionIdsAtMaturity:[...stale].sort(),
    everStaleAssumptionIdsBeforeMaturity:[...everStale].sort(),
    firstStaleAt,
    firstWatchAt,
    firstForecastInvalidatedAt:firstInvalidatedAt,
    firstWarningAt,
    warningAvailableBeforeMaturity:firstWarningAt!=null&&firstWarningAt<=maturity,
    warningLeadMs:firstWarningAt==null?null:Math.max(0,maturity-firstWarningAt),
    forecastInvalidatedBeforeMaturity:firstInvalidatedAt!=null,
    semantics:{
      preOutcomeOnly:true,
      warningIsNotProofForecastWouldFail:true,
      leadTimeIsDescriptiveNotCounterfactualCausation:true
    },
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canInfluencePrimary:false,
    canExecuteLive:false
  });
}

export function forecastThesisRevisionMemorySummary(memory){
  const v=verifyForecastThesisRevisionMemory(memory);
  return deepFreeze({
    version:FORECAST_THESIS_REVISION_MEMORY_VERSION,
    forecastId:memory?.forecastId??null,
    integrity:v.ok?'VALID':'INVALID',
    assumptionCount:Array.isArray(memory?.assumptions)?memory.assumptions.length:0,
    eventCount:Number(memory?.eventCount||0),
    firstWatchAt:memory?.firstWatchAt??null,
    firstStaleAt:memory?.firstStaleAt??null,
    firstForecastInvalidatedAt:memory?.firstForecastInvalidatedAt??null,
    lastForecastAssessmentStatus:memory?.lastForecastAssessmentStatus??'UNKNOWN',
    currentStaleAssumptionIds:(memory?.assumptions||[])
      .filter(x=>x.issueSupported===true&&x.currentSupported===false)
      .map(x=>x.assumptionId)
      .sort(),
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canInfluencePrimary:false,
    canExecuteLive:false
  });
}
