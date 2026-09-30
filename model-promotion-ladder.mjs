import { sha256 } from './institutional-kernel.mjs';
import { verifyScientificValidity } from './scientific-validity.mjs';
import { verifyEpistemicIntegrity } from './science-runtime/epistemic-integrity.mjs';

export const MODEL_PROMOTION_LADDER_VERSION='TCX_MODEL_PROMOTION_LADDER_V1';

export const DEFAULT_PROMOTION_POLICY=Object.freeze({
  minCases:200,
  minIndependentEpisodes:80,
  maxBrierRegression:.005,
  maxLogLossRegression:.01,
  maxHighConfidenceWrongRateRegression:.02,
  maxCoverageErrorRegression:.02,
  minBrierImprovement:.005,
  minLogLossImprovement:.01,
  minCoverageErrorImprovement:.02,
  targetIntervalCoverage:.80
});

function finite(v,name){
  const n=Number(v);
  if(!Number.isFinite(n)) throw new Error(name+' must be finite');
  return n;
}
function hash64(v,name){
  const s=String(v??'');
  if(!/^[a-f0-9]{64}$/i.test(s)) throw new Error(name+' must be sha256');
  return s.toLowerCase();
}
function bool(v){return v===true;}
function normalizedSubject(v){
  return String(v??'').trim().toUpperCase().replace(/^MODEL:/,'');
}
function deepFreeze(v){
  if(v&&typeof v==='object'&&!Object.isFrozen(v)){
    Object.freeze(v);
    for(const x of Object.values(v)) deepFreeze(x);
  }
  return v;
}

function metricBlock(x,prefix){
  return {
    brier:finite(x?.brier,prefix+'.brier'),
    logLoss:finite(x?.logLoss,prefix+'.logLoss'),
    intervalCoverage:finite(x?.intervalCoverage,prefix+'.intervalCoverage'),
    highConfidenceWrongRate:finite(x?.highConfidenceWrongRate,prefix+'.highConfidenceWrongRate')
  };
}

/**
 * Evaluates a versioned candidate. It never mutates the production model.
 * Promotion requires PIT/OOS/replay/science gates plus non-inferiority and at least one real improvement.
 */
export function evaluateModelPromotion({
  asOf,
  candidate,
  scientificValidity,
  epistemicIntegrity=null,
  software,
  evaluation,
  policy=DEFAULT_PROMOTION_POLICY
}={}){
  const t=finite(asOf,'asOf');
  const p={...DEFAULT_PROMOTION_POLICY,...policy};

  const candidateId=String(candidate?.candidateId??'').trim();
  if(!candidateId) throw new Error('candidateId required');
  const modelHash=hash64(candidate?.modelHash,'candidate.modelHash');
  const configHash=hash64(candidate?.configHash,'candidate.configHash');
  const createdAt=finite(candidate?.createdAt,'candidate.createdAt');
  if(createdAt>t) throw new Error('candidate createdAt cannot be in the future');
  if(String(candidate?.executionMode??'SHADOW_ONLY').toUpperCase()!=='SHADOW_ONLY'){
    throw new Error('candidate executionMode must remain SHADOW_ONLY');
  }

  const scienceCheck=verifyScientificValidity(scientificValidity);
  const epistemicCheck=epistemicIntegrity?verifyEpistemicIntegrity(epistemicIntegrity):{ok:false,reasons:['REPORT_MISSING']};
  const candidateMetrics=metricBlock(evaluation?.candidate,'evaluation.candidate');
  const incumbentMetrics=metricBlock(evaluation?.incumbent,'evaluation.incumbent');
  const cases=Math.max(0,Math.floor(Number(evaluation?.cases??0)));
  const independentEpisodes=Math.max(0,Math.floor(Number(evaluation?.independentEpisodes??0)));

  const hardFailures=[];
  const holds=[];

  const softwareProofStatus={};
  for(const [name,value] of Object.entries({
    TESTS_PASSED:software?.testsPassed,
    PIT_LEAKAGE_PASSED:software?.pitLeakagePassed,
    TEMPORAL_OOS_PASSED:software?.temporalOosPassed,
    DETERMINISTIC_REPLAY_PASSED:software?.deterministicReplayPassed,
    RELEASE_MANIFEST_BOUND:software?.releaseManifestBound,
    ROLLBACK_READY:software?.rollbackReady
  })){
    if(value===true) softwareProofStatus[name]='PASSED';
    else if(value===false){
      softwareProofStatus[name]='FAILED';
      hardFailures.push(name);
    }else{
      softwareProofStatus[name]='MISSING';
      holds.push(name+'_PROOF_REQUIRED');
    }
  }

  if(!scienceCheck.ok) hardFailures.push('SCIENTIFIC_VALIDITY_INTEGRITY_FAILED');
  else if(scientificValidity.gate!=='PASS') hardFailures.push('SCIENTIFIC_VALIDITY_NOT_PASS');

  if(!epistemicIntegrity){
    holds.push('EPISTEMIC_INTEGRITY_REQUIRED');
  }else if(!epistemicCheck.ok){
    hardFailures.push('EPISTEMIC_INTEGRITY_INTEGRITY_FAILED');
  }else{
    const epistemicAsOf=finite(epistemicIntegrity.asOf,'epistemicIntegrity.asOf');
    const subjectMatches=normalizedSubject(epistemicIntegrity.subjectId)===normalizedSubject(candidateId);
    if(epistemicAsOf>t) hardFailures.push('EPISTEMIC_REPORT_FROM_FUTURE');
    if(epistemicAsOf<createdAt) holds.push('EPISTEMIC_REPORT_PREDATES_CANDIDATE');
    if(!subjectMatches) hardFailures.push('EPISTEMIC_SUBJECT_MISMATCH');
    if(epistemicIntegrity.gate!=='PASS') holds.push('EPISTEMIC_INTEGRITY_NOT_PASS');
    if(epistemicIntegrity.identificationStatus!=='IDENTIFIED') holds.push('EPISTEMIC_IDENTIFICATION_NOT_COMPLETE');
    if(epistemicIntegrity.identity?.status!=='RESOLVED') holds.push('EPISTEMIC_IDENTITY_NOT_RESOLVED');
    if(epistemicIntegrity.trustClosure?.closed!==true) holds.push('EPISTEMIC_TRUST_CHAIN_NOT_CLOSED');
    if(epistemicIntegrity.coverage?.status!=='CALIBRATED') holds.push('EPISTEMIC_COVERAGE_NOT_CALIBRATED');
    if(epistemicIntegrity.discovery?.status!=='INDEPENDENT') holds.push('EPISTEMIC_DISCOVERY_NOT_INDEPENDENT');
  }

  if(cases<p.minCases) holds.push('INSUFFICIENT_EVALUATION_CASES');
  if(independentEpisodes<p.minIndependentEpisodes) holds.push('INSUFFICIENT_INDEPENDENT_EPISODES');

  const brierDelta=candidateMetrics.brier-incumbentMetrics.brier;
  const logLossDelta=candidateMetrics.logLoss-incumbentMetrics.logLoss;
  const hcWrongDelta=candidateMetrics.highConfidenceWrongRate-incumbentMetrics.highConfidenceWrongRate;
  const targetCoverage=Number(p.targetIntervalCoverage);
  const candidateCoverageError=Math.abs(candidateMetrics.intervalCoverage-targetCoverage);
  const incumbentCoverageError=Math.abs(incumbentMetrics.intervalCoverage-targetCoverage);
  const coverageErrorDelta=candidateCoverageError-incumbentCoverageError;

  if(brierDelta>Number(p.maxBrierRegression)) hardFailures.push('BRIER_REGRESSION');
  if(logLossDelta>Number(p.maxLogLossRegression)) hardFailures.push('LOG_LOSS_REGRESSION');
  if(hcWrongDelta>Number(p.maxHighConfidenceWrongRateRegression)) hardFailures.push('HIGH_CONFIDENCE_WRONG_RATE_REGRESSION');
  if(coverageErrorDelta>Number(p.maxCoverageErrorRegression)) hardFailures.push('INTERVAL_COVERAGE_REGRESSION');

  const improvements={
    brier:-brierDelta,
    logLoss:-logLossDelta,
    coverageError:-coverageErrorDelta
  };
  const meaningfulImprovement=
    improvements.brier>=Number(p.minBrierImprovement)||
    improvements.logLoss>=Number(p.minLogLossImprovement)||
    improvements.coverageError>=Number(p.minCoverageErrorImprovement);

  if(!meaningfulImprovement) holds.push('NO_MEANINGFUL_OOS_IMPROVEMENT');

  let decision='PROMOTE_CANDIDATE';
  if(hardFailures.length) decision='REJECT_CANDIDATE';
  else if(holds.length) decision='HOLD_CANDIDATE';

  const core={
    version:MODEL_PROMOTION_LADDER_VERSION,
    asOf:t,
    candidate:{
      candidateId,
      modelHash,
      configHash,
      createdAt,
      parentReleaseId:String(candidate?.parentReleaseId??'UNKNOWN'),
      source:String(candidate?.source??'UNKNOWN'),
      executionMode:'SHADOW_ONLY'
    },
    evaluation:{
      cases,
      independentEpisodes,
      candidate:candidateMetrics,
      incumbent:incumbentMetrics,
      deltas:{
        brier:brierDelta,
        logLoss:logLossDelta,
        highConfidenceWrongRate:hcWrongDelta,
        intervalCoverageError:coverageErrorDelta
      },
      improvements,
      meaningfulImprovement
    },
    software:{
      testsPassed:software?.testsPassed===true,
      pitLeakagePassed:software?.pitLeakagePassed===true,
      temporalOosPassed:software?.temporalOosPassed===true,
      deterministicReplayPassed:software?.deterministicReplayPassed===true,
      releaseManifestBound:software?.releaseManifestBound===true,
      rollbackReady:software?.rollbackReady===true,
      proofStatus:softwareProofStatus
    },
    science:{
      integrity:scienceCheck.ok?'VALID':'INVALID',
      gate:scientificValidity?.gate??'UNKNOWN',
      fingerprint:scientificValidity?.fingerprint??null
    },
    epistemic:{
      integrity:epistemicIntegrity?(epistemicCheck.ok?'VALID':'INVALID'):'MISSING',
      gate:epistemicIntegrity?.gate??'MISSING',
      identificationStatus:epistemicIntegrity?.identificationStatus??'MISSING',
      identityStatus:epistemicIntegrity?.identity?.status??'MISSING',
      trustClosureClosed:epistemicIntegrity?.trustClosure?.closed===true,
      coverageStatus:epistemicIntegrity?.coverage?.status??'MISSING',
      discoveryStatus:epistemicIntegrity?.discovery?.status??'MISSING',
      fingerprint:epistemicIntegrity?.fingerprint??null
    },
    decision,
    hardFailures:[...new Set(hardFailures)],
    holds:[...new Set(holds)],
    promotionReady:decision==='PROMOTE_CANDIDATE',
    invariants:{
      sameSampleSelfFeedbackAllowed:false,
      silentProductionMutationAllowed:false,
      requiresExplicitPromotionRecord:true,
      requiresEpistemicIntegrityPass:true,
      evidencePlanCanClearPromotionBlock:false,
      executionMode:'SHADOW_ONLY',
      action:'ABSTAIN',
      canExecute:false
    }
  };

  return deepFreeze({...core,fingerprint:sha256(core)});
}

export function createModelPromotionRecord({
  evaluation,
  promotedAt,
  previousReleaseId,
  candidateReleaseId
}={}){
  if(evaluation?.version!==MODEL_PROMOTION_LADDER_VERSION) throw new Error('promotion evaluation version invalid');
  const {fingerprint,...evalCore}=evaluation;
  if(fingerprint!==sha256(evalCore)) throw new Error('promotion evaluation integrity invalid');
  if(evaluation.decision!=='PROMOTE_CANDIDATE'||evaluation.promotionReady!==true){
    throw new Error('candidate is not promotion-ready');
  }

  const t=finite(promotedAt,'promotedAt');
  if(t<evaluation.asOf) throw new Error('promotedAt cannot predate evaluation');
  const previous=String(previousReleaseId??'').trim();
  const next=String(candidateReleaseId??'').trim();
  if(!previous||!next) throw new Error('release ids required');
  if(previous===next) throw new Error('candidate release must differ from previous release');

  const core={
    version:'TCX_MODEL_PROMOTION_RECORD_V1',
    promotedAt:t,
    evaluationFingerprint:evaluation.fingerprint,
    candidateId:evaluation.candidate.candidateId,
    modelHash:evaluation.candidate.modelHash,
    configHash:evaluation.candidate.configHash,
    previousReleaseId:previous,
    candidateReleaseId:next,
    action:'REGISTER_PROMOTION_ONLY',
    productionMutationPerformed:false,
    executionMode:'SHADOW_ONLY',
    canExecute:false
  };
  return deepFreeze({...core,promotionId:sha256(core)});
}

export function verifyModelPromotionEvaluation(value){
  try{
    if(value?.version!==MODEL_PROMOTION_LADDER_VERSION) return {ok:false,reasons:['VERSION_INVALID']};
    if(value?.invariants?.executionMode!=='SHADOW_ONLY') return {ok:false,reasons:['EXECUTION_MODE_INVALID']};
    if(value?.invariants?.canExecute!==false) return {ok:false,reasons:['CAN_EXECUTE_INVALID']};
    const {fingerprint,...core}=value;
    const expected=sha256(core);
    return fingerprint===expected
      ? {ok:true,reasons:[],expectedFingerprint:expected}
      : {ok:false,reasons:['FINGERPRINT_MISMATCH'],expectedFingerprint:expected};
  }catch(err){
    return {ok:false,reasons:['PROMOTION_EVALUATION_INVALID',err instanceof Error?err.message:String(err)]};
  }
}


export function verifyModelPromotionRecord(value){
  try{
    if(value?.version!=='TCX_MODEL_PROMOTION_RECORD_V1') return {ok:false,reasons:['VERSION_INVALID']};
    if(value?.executionMode!=='SHADOW_ONLY') return {ok:false,reasons:['EXECUTION_MODE_INVALID']};
    if(value?.canExecute!==false) return {ok:false,reasons:['CAN_EXECUTE_INVALID']};
    if(value?.productionMutationPerformed!==false) return {ok:false,reasons:['PRODUCTION_MUTATION_INVALID']};
    if(value?.action!=='REGISTER_PROMOTION_ONLY') return {ok:false,reasons:['ACTION_INVALID']};
    const {promotionId,...core}=value;
    const expected=sha256(core);
    return promotionId===expected
      ? {ok:true,reasons:[],expectedPromotionId:expected}
      : {ok:false,reasons:['PROMOTION_ID_MISMATCH'],expectedPromotionId:expected};
  }catch(err){
    return {ok:false,reasons:['PROMOTION_RECORD_INVALID',err instanceof Error?err.message:String(err)]};
  }
}
