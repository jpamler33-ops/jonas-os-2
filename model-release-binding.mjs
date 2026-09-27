import { sha256 } from './institutional-kernel.mjs';
import { verifyReleaseRegistry } from './runtime-release-registry.mjs';
import { verifyModelPromotionRecord } from './model-promotion-ladder.mjs';
import { verifyForecastCandidateArtifact } from './forecast-candidate-lab.mjs';

export const MODEL_RELEASE_BINDING_VERSION='TCX_MODEL_RELEASE_BINDING_V1';
export const MODEL_ROLLBACK_DRILL_VERSION='TCX_MODEL_ROLLBACK_DRILL_V1';

function finite(v,name){
  const n=Number(v);
  if(!Number.isFinite(n)) throw new Error(name+' must be finite');
  return n;
}
function deepFreeze(v){
  if(v&&typeof v==='object'&&!Object.isFrozen(v)){
    Object.freeze(v);
    for(const x of Object.values(v)) deepFreeze(x);
  }
  return v;
}
function runtimeRecord(registry,releaseId){
  return registry?.records?.find(r=>String(r.releaseId)===String(releaseId))||null;
}

export function createModelReleaseBinding({
  candidate,
  runtimeReleaseRecord,
  createdAt=Date.now()
}={}){
  const cv=verifyForecastCandidateArtifact(candidate);
  if(!cv.ok) throw new Error('invalid forecast candidate: '+cv.reasons.join(','));
  if(!runtimeReleaseRecord?.manifest||!runtimeReleaseRecord?.releaseId){
    throw new Error('registered runtime release record required');
  }
  if(runtimeReleaseRecord.releaseId!==runtimeReleaseRecord.manifest.releaseId){
    throw new Error('runtime release record/manifest mismatch');
  }
  const boundForecastConfigHash=String(runtimeReleaseRecord.manifest?.versions?.forecastConfigHash??'');
  if(boundForecastConfigHash!==candidate.configHash){
    throw new Error('runtime release is not bound to candidate forecast config hash');
  }
  const at=finite(createdAt,'createdAt');
  if(at<candidate.createdAt) throw new Error('binding cannot predate candidate');

  const core={
    version:MODEL_RELEASE_BINDING_VERSION,
    candidateId:candidate.candidateId,
    modelHash:candidate.modelHash,
    modelConfigHash:candidate.configHash,
    candidateFingerprint:candidate.fingerprint,
    softwareReleaseId:String(runtimeReleaseRecord.releaseId),
    softwareManifestHash:sha256(runtimeReleaseRecord.manifest),
    createdAt:at,
    executionMode:'SHADOW_ONLY',
    action:'ABSTAIN',
    productionMutationPerformed:false,
    canExecute:false
  };
  return deepFreeze({...core,modelReleaseId:sha256(core)});
}

export function verifyModelReleaseBinding(value){
  try{
    if(value?.version!==MODEL_RELEASE_BINDING_VERSION) return {ok:false,reasons:['VERSION_INVALID']};
    if(value?.executionMode!=='SHADOW_ONLY'||value?.action!=='ABSTAIN'||value?.canExecute!==false){
      return {ok:false,reasons:['SAFETY_INVARIANT_INVALID']};
    }
    if(value?.productionMutationPerformed!==false) return {ok:false,reasons:['PRODUCTION_MUTATION_INVALID']};
    const {modelReleaseId,...core}=value;
    const expected=sha256(core);
    return modelReleaseId===expected
      ?{ok:true,reasons:[],expectedModelReleaseId:expected}
      :{ok:false,reasons:['MODEL_RELEASE_ID_MISMATCH'],expectedModelReleaseId:expected};
  }catch(err){
    return {ok:false,reasons:['MODEL_RELEASE_BINDING_INVALID',err instanceof Error?err.message:String(err)]};
  }
}

export function verifyPromotionReleaseLink({
  promotion,
  binding,
  releaseRegistry
}={}){
  const pv=verifyModelPromotionRecord(promotion);
  const bv=verifyModelReleaseBinding(binding);
  const rv=verifyReleaseRegistry(releaseRegistry?.records||[]);
  const reasons=[];
  if(!pv.ok) reasons.push('PROMOTION_INVALID');
  if(!bv.ok) reasons.push('MODEL_RELEASE_BINDING_INVALID');
  if(!releaseRegistry?.healthy||!rv.ok) reasons.push('RUNTIME_RELEASE_REGISTRY_INVALID');

  if(promotion?.candidateId!==binding?.candidateId) reasons.push('CANDIDATE_ID_MISMATCH');
  if(promotion?.modelHash!==binding?.modelHash) reasons.push('MODEL_HASH_MISMATCH');
  if(promotion?.configHash!==binding?.modelConfigHash) reasons.push('MODEL_CONFIG_HASH_MISMATCH');
  if(promotion?.candidateReleaseId!==binding?.modelReleaseId) reasons.push('MODEL_RELEASE_ID_MISMATCH');

  const software=runtimeRecord(releaseRegistry,binding?.softwareReleaseId);
  if(!software) reasons.push('SOFTWARE_RELEASE_NOT_REGISTERED');
  else {
    if(sha256(software.manifest)!==binding.softwareManifestHash) reasons.push('SOFTWARE_MANIFEST_HASH_MISMATCH');
    if(String(software.manifest?.versions?.forecastConfigHash??'')!==String(binding?.modelConfigHash??'')){
      reasons.push('SOFTWARE_FORECAST_CONFIG_HASH_MISMATCH');
    }
  }

  return deepFreeze({
    version:MODEL_RELEASE_BINDING_VERSION,
    ok:reasons.length===0,
    reasons,
    candidateId:promotion?.candidateId??binding?.candidateId??null,
    modelReleaseId:binding?.modelReleaseId??null,
    softwareReleaseId:binding?.softwareReleaseId??null,
    executionMode:'SHADOW_ONLY',
    canExecute:false
  });
}

export function createModelRollbackDrill({
  promotion,
  candidateBinding,
  previousBinding,
  drilledAt=Date.now()
}={}){
  const pv=verifyModelPromotionRecord(promotion);
  const cv=verifyModelReleaseBinding(candidateBinding);
  const bv=verifyModelReleaseBinding(previousBinding);
  if(!pv.ok||!cv.ok||!bv.ok) throw new Error('valid promotion and release bindings required');
  if(promotion.candidateReleaseId!==candidateBinding.modelReleaseId){
    throw new Error('candidate promotion/release mismatch');
  }
  if(promotion.previousReleaseId!==previousBinding.modelReleaseId){
    throw new Error('previous release mismatch');
  }
  const at=finite(drilledAt,'drilledAt');
  if(at<promotion.promotedAt) throw new Error('rollback drill cannot predate promotion');

  const core={
    version:MODEL_ROLLBACK_DRILL_VERSION,
    drilledAt:at,
    promotionId:promotion.promotionId,
    candidateId:promotion.candidateId,
    fromModelReleaseId:candidateBinding.modelReleaseId,
    toModelReleaseId:previousBinding.modelReleaseId,
    fromSoftwareReleaseId:candidateBinding.softwareReleaseId,
    toSoftwareReleaseId:previousBinding.softwareReleaseId,
    checks:{
      candidateBindingValid:true,
      previousBindingValid:true,
      promotionLinkValid:true,
      rollbackTargetKnown:true,
      productionMutationPerformed:false
    },
    steps:[
      'freeze new candidate issuance',
      'restore previous versioned model configuration',
      'rebind software/model release identity',
      'restart single-replica runtime',
      'verify deterministic replay and audit continuity',
      'resume SHADOW_ONLY research only after health gates pass'
    ],
    result:'ROLLBACK_READY',
    executionMode:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecute:false
  };
  return deepFreeze({...core,drillId:sha256(core)});
}

export function verifyModelRollbackDrill(value){
  try{
    if(value?.version!==MODEL_ROLLBACK_DRILL_VERSION) return {ok:false,reasons:['VERSION_INVALID']};
    if(value?.result!=='ROLLBACK_READY') return {ok:false,reasons:['RESULT_INVALID']};
    if(value?.checks?.productionMutationPerformed!==false) return {ok:false,reasons:['PRODUCTION_MUTATION_INVALID']};
    if(value?.executionMode!=='SHADOW_ONLY'||value?.action!=='ABSTAIN'||value?.canExecute!==false){
      return {ok:false,reasons:['SAFETY_INVARIANT_INVALID']};
    }
    const {drillId,...core}=value;
    const expected=sha256(core);
    return drillId===expected
      ?{ok:true,reasons:[],expectedDrillId:expected}
      :{ok:false,reasons:['DRILL_ID_MISMATCH'],expectedDrillId:expected};
  }catch(err){
    return {ok:false,reasons:['ROLLBACK_DRILL_INVALID',err instanceof Error?err.message:String(err)]};
  }
}
