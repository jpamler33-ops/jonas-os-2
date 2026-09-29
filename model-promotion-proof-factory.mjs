import { sha256 } from './institutional-kernel.mjs';
import {
  evaluateForecastCandidateWalkForward,
  verifyForecastCandidateArtifact
} from './forecast-candidate-lab.mjs';
import { verifyReleaseRegistry } from './runtime-release-registry.mjs';

export const MODEL_PROMOTION_PROOF_FACTORY_VERSION='TCX_MODEL_PROMOTION_PROOF_FACTORY_V1';
export const CANDIDATE_REPLAY_PROOF_VERSION='TCX_CANDIDATE_DETERMINISTIC_REPLAY_PROOF_V1';
export const ROLLBACK_PREFLIGHT_VERSION='TCX_MODEL_ROLLBACK_PREFLIGHT_V1';

function deepFreeze(v){
  if(v&&typeof v==='object'&&!Object.isFrozen(v)){
    Object.freeze(v);
    for(const x of Object.values(v)) deepFreeze(x);
  }
  return v;
}
function finite(v,name){
  const n=Number(v);
  if(!Number.isFinite(n)) throw new Error(name+' must be finite');
  return n;
}
function clone(v){return structuredClone(v);}

export function createCandidateDeterministicReplayProof({
  historyRows,
  incumbentConfig,
  candidate,
  asOf,
  minimumTrainCases=40
}={}){
  const cv=verifyForecastCandidateArtifact(candidate);
  if(!cv.ok) throw new Error('invalid candidate for replay: '+cv.reasons.join(','));
  const t=finite(asOf,'asOf');
  const rows=Array.isArray(historyRows)?historyRows:[];
  const first=evaluateForecastCandidateWalkForward({
    historyRows:rows,
    incumbentConfig,
    candidate,
    asOf:t,
    minimumTrainCases
  });
  const second=evaluateForecastCandidateWalkForward({
    historyRows:rows,
    incumbentConfig,
    candidate,
    asOf:t,
    minimumTrainCases
  });

  const identical=
    first.fingerprint===second.fingerprint&&
    sha256(first.promotionEvaluationInput)===sha256(second.promotionEvaluationInput);
  const pitPassed=
    first?.diagnostics?.temporalOosPassed===true&&
    second?.diagnostics?.temporalOosPassed===true&&
    Number(first?.diagnostics?.pitViolations||0)===0&&
    Number(second?.diagnostics?.pitViolations||0)===0;
  const passed=identical&&pitPassed;
  const eligibleRows=rows.filter(r=>Number(r?.resolvedAt)<=t&&Number(r?.availableAt)<=t);

  const core={
    version:CANDIDATE_REPLAY_PROOF_VERSION,
    generatedAt:t,
    candidateId:String(candidate.candidateId),
    candidateFingerprint:String(candidate.fingerprint),
    incumbentConfigHash:sha256(incumbentConfig),
    historyFingerprint:sha256(eligibleRows),
    historyRows:eligibleRows.length,
    firstEvaluationFingerprint:first.fingerprint,
    secondEvaluationFingerprint:second.fingerprint,
    firstPromotionInputHash:sha256(first.promotionEvaluationInput),
    secondPromotionInputHash:sha256(second.promotionEvaluationInput),
    checks:{
      deterministicEvaluation:identical,
      pitLeakagePassed:pitPassed,
      candidateIdentityStable:first.candidateId===candidate.candidateId&&second.candidateId===candidate.candidateId
    },
    passed,
    executionMode:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecute:false
  };
  return deepFreeze({...core,fingerprint:sha256(core)});
}

export function verifyCandidateDeterministicReplayProof(value){
  try{
    const reasons=[];
    if(value?.version!==CANDIDATE_REPLAY_PROOF_VERSION) reasons.push('VERSION_INVALID');
    if(value?.executionMode!=='SHADOW_ONLY'||value?.action!=='ABSTAIN'||value?.canExecute!==false){
      reasons.push('SAFETY_INVARIANT_INVALID');
    }
    const deterministic=
      value?.firstEvaluationFingerprint===value?.secondEvaluationFingerprint&&
      value?.firstPromotionInputHash===value?.secondPromotionInputHash;
    if(value?.checks?.deterministicEvaluation!==deterministic) reasons.push('DETERMINISM_CHECK_INCONSISTENT');
    const expectedPassed=
      deterministic&&
      value?.checks?.pitLeakagePassed===true&&
      value?.checks?.candidateIdentityStable===true;
    if(value?.passed!==expectedPassed) reasons.push('PASSED_FLAG_INCONSISTENT');
    const {fingerprint,...core}=value||{};
    if(fingerprint!==sha256(core)) reasons.push('FINGERPRINT_MISMATCH');
    return {ok:reasons.length===0,reasons,passed:expectedPassed};
  }catch(err){
    return {ok:false,reasons:['REPLAY_PROOF_INVALID',err instanceof Error?err.message:String(err)],passed:false};
  }
}

export function createModelRollbackPreflight({
  candidate,
  incumbentConfig,
  releaseRegistry,
  asOf=Date.now()
}={}){
  const cv=verifyForecastCandidateArtifact(candidate);
  if(!cv.ok) throw new Error('invalid candidate for rollback preflight: '+cv.reasons.join(','));
  const t=finite(asOf,'asOf');
  const registryVerification=verifyReleaseRegistry(releaseRegistry?.records||[]);
  const parentReleaseId=String(candidate.parentReleaseId||'');
  const parentRecord=(releaseRegistry?.records||[]).find(r=>String(r?.releaseId)===parentReleaseId)||null;
  const incumbentConfigHash=sha256(incumbentConfig);
  const manifestConfigHash=String(parentRecord?.manifest?.versions?.forecastConfigHash||'');

  const checks={
    registryHealthy:releaseRegistry?.healthy===true&&registryVerification.ok===true,
    parentReleaseRegistered:Boolean(parentRecord),
    parentReleaseMatchesCandidate:Boolean(parentRecord)&&parentReleaseId===String(parentRecord.releaseId),
    incumbentConfigBoundToParent:Boolean(parentRecord)&&manifestConfigHash===incumbentConfigHash,
    incumbentConfigSnapshotAvailable:Boolean(incumbentConfig&&typeof incumbentConfig==='object'),
    candidateCreatedAfterParent:Boolean(parentRecord)&&Number(candidate.createdAt)>=Number(parentRecord.registeredAt||0),
    productionMutationPerformed:false
  };
  const passed=Object.values(checks).every(v=>v===true);
  const restoreConfig=clone(incumbentConfig);
  const core={
    version:ROLLBACK_PREFLIGHT_VERSION,
    generatedAt:t,
    candidateId:String(candidate.candidateId),
    candidateFingerprint:String(candidate.fingerprint),
    candidateConfigHash:String(candidate.configHash),
    parentReleaseId,
    parentReleaseRecordHash:parentRecord?.recordHash??null,
    parentManifestHash:parentRecord?.manifestHash??null,
    rollbackTarget:{
      softwareReleaseId:parentRecord?.releaseId??null,
      forecastConfigHash:incumbentConfigHash,
      configSnapshot:restoreConfig,
      configSnapshotHash:sha256(restoreConfig)
    },
    checks,
    result:passed?'ROLLBACK_PREFLIGHT_READY':'ROLLBACK_PREFLIGHT_BLOCKED',
    passed,
    executionMode:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecute:false
  };
  return deepFreeze({...core,fingerprint:sha256(core)});
}

export function verifyModelRollbackPreflight(value){
  try{
    const reasons=[];
    if(value?.version!==ROLLBACK_PREFLIGHT_VERSION) reasons.push('VERSION_INVALID');
    if(value?.executionMode!=='SHADOW_ONLY'||value?.action!=='ABSTAIN'||value?.canExecute!==false){
      reasons.push('SAFETY_INVARIANT_INVALID');
    }
    if(value?.checks?.productionMutationPerformed!==false) reasons.push('PRODUCTION_MUTATION_INVALID');
    if(value?.rollbackTarget?.configSnapshotHash!==sha256(value?.rollbackTarget?.configSnapshot)){
      reasons.push('ROLLBACK_CONFIG_HASH_MISMATCH');
    }
    const expectedPassed=Object.values(value?.checks||{}).every(v=>v===true);
    if(value?.passed!==expectedPassed) reasons.push('PASSED_FLAG_INCONSISTENT');
    if(value?.result!==(expectedPassed?'ROLLBACK_PREFLIGHT_READY':'ROLLBACK_PREFLIGHT_BLOCKED')){
      reasons.push('RESULT_INCONSISTENT');
    }
    const {fingerprint,...core}=value||{};
    if(fingerprint!==sha256(core)) reasons.push('FINGERPRINT_MISMATCH');
    return {ok:reasons.length===0,reasons,passed:expectedPassed};
  }catch(err){
    return {ok:false,reasons:['ROLLBACK_PREFLIGHT_INVALID',err instanceof Error?err.message:String(err)],passed:false};
  }
}

export function buildPromotionSoftwareProofs({
  buildAttestationVerification=null,
  replayProof=null,
  rollbackPreflight=null
}={}){
  const replay= replayProof?verifyCandidateDeterministicReplayProof(replayProof):null;
  const rollback= rollbackPreflight?verifyModelRollbackPreflight(rollbackPreflight):null;
  const buildOk=buildAttestationVerification?.ok===true;
  const buildFailed=buildAttestationVerification&&buildAttestationVerification.ok===false;

  return deepFreeze({
    version:MODEL_PROMOTION_PROOF_FACTORY_VERSION,
    testsPassed:buildAttestationVerification
      ?{value:buildOk,asOf:Number(buildAttestationVerification.generatedAt||0)||Date.now()}
      :undefined,
    deterministicReplayPassed:replay
      ?{value:replay.ok&&replay.passed,asOf:Number(replayProof.generatedAt)}
      :undefined,
    rollbackReady:rollback
      ?{value:rollback.ok&&rollback.passed,asOf:Number(rollbackPreflight.generatedAt)}
      :undefined,
    evidence:{
      buildAttestation:{
        present:Boolean(buildAttestationVerification),
        verified:buildOk,
        failed:buildFailed,
        sourceFingerprint:buildAttestationVerification?.sourceFingerprint??null,
        testContractFingerprint:buildAttestationVerification?.testContractFingerprint??null
      },
      deterministicReplay:replayProof?{
        fingerprint:replayProof.fingerprint,
        verified:replay?.ok===true,
        passed:replay?.passed===true
      }:null,
      rollbackPreflight:rollbackPreflight?{
        fingerprint:rollbackPreflight.fingerprint,
        verified:rollback?.ok===true,
        passed:rollback?.passed===true
      }:null
    },
    executionMode:'SHADOW_ONLY',
    canExecute:false
  });
}
