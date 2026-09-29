import { sha256 } from './institutional-kernel.mjs';
import { verifyForecastCandidateArtifact } from './forecast-candidate-lab.mjs';

export const MODEL_PROMOTION_REVIEW_BRIDGE_VERSION='TCX_MODEL_PROMOTION_REVIEW_BRIDGE_V1';

function finite(v){const n=Number(v);return Number.isFinite(n)?n:null;}
function clean(v){return String(v??'').trim();}
function clone(v){return structuredClone(v);}
function same(a,b){return sha256(a)===sha256(b);}
function deepFreeze(v){
  if(v&&typeof v==='object'&&!Object.isFrozen(v)){
    Object.freeze(v);
    for(const x of Object.values(v)) deepFreeze(x);
  }
  return v;
}
function reviewStatus(v){
  return ['PROMOTION_REVIEW_REQUIRED','PROMOTION_CANDIDATE'].includes(String(v||''));
}

export function buildCanonicalPromotionReviewQueue({
  governor,
  competition,
  now=Date.now()
}={}){
  const t=finite(now);
  if(t==null) throw new Error('now must be finite');
  const accepted=[];
  const rejected=[];

  const participants=Array.isArray(governor?.participants)?governor.participants:[];
  const packs=Array.isArray(governor?.evidencePacks)?governor.evidencePacks:[];
  const candidates=Array.isArray(competition?.candidates)?competition.candidates:[];
  const packById=new Map(packs.map(x=>[clean(x?.evidenceId),x]).filter(([id])=>id));
  const candidateById=new Map(candidates.map(x=>[clean(x?.artifact?.candidateId),x]).filter(([id])=>id));

  for(const participant of participants.filter(x=>reviewStatus(x?.status))){
    const candidateId=clean(participant?.candidateId);
    const evidenceId=clean(participant?.decision?.evidenceId);
    const reasons=[];
    const candidate=candidateById.get(candidateId)||null;
    const pack=packById.get(evidenceId)||null;
    const artifact=candidate?.artifact||null;
    const evaluation=candidate?.lastEvaluation?.evaluation||null;

    const artifactVerification=artifact?verifyForecastCandidateArtifact(artifact):{ok:false,reasons:['ARTIFACT_MISSING']};
    if(!candidateId) reasons.push('CANDIDATE_ID_MISSING');
    if(!evidenceId) reasons.push('GOVERNOR_EVIDENCE_ID_MISSING');
    if(!candidate) reasons.push('COMPETITION_CANDIDATE_MISSING');
    if(!pack) reasons.push('GOVERNOR_EVIDENCE_PACK_MISSING');
    if(!artifactVerification.ok) reasons.push('CANDIDATE_ARTIFACT_INVALID');
    if(artifact&&participant?.artifactFingerprint!==artifact.fingerprint) reasons.push('PARTICIPANT_ARTIFACT_FINGERPRINT_MISMATCH');
    if(pack&&clean(pack.candidateId)!==candidateId) reasons.push('EVIDENCE_CANDIDATE_MISMATCH');
    if(pack&&!reviewStatus(pack.decision)) reasons.push('EVIDENCE_NOT_REVIEW_REQUIRED');
    if(pack&&finite(pack.evaluatedAt)>t) reasons.push('EVIDENCE_FROM_FUTURE');
    if(pack&&finite(pack.trainingCutoffAt)!==finite(artifact?.dataCutoffAt)) reasons.push('TRAINING_CUTOFF_ARTIFACT_MISMATCH');
    if(pack&&finite(pack.trainingCutoffAt)!==finite(competition?.dataCutoffAt)) reasons.push('TRAINING_CUTOFF_COMPETITION_MISMATCH');
    if(pack&&clean(pack.championConfigHash).toLowerCase()!==clean(competition?.incumbentConfigHash).toLowerCase()){
      reasons.push('CHAMPION_CONFIG_MISMATCH');
    }
    if(pack&&clean(pack.championReleaseId)!==clean(competition?.parentReleaseId)) reasons.push('CHAMPION_RELEASE_MISMATCH');
    if(pack&&evaluation){
      const expectedMetrics={candidate:evaluation.candidate,incumbent:evaluation.incumbent};
      if(!same(pack.metrics,expectedMetrics)) reasons.push('EVALUATION_METRICS_MISMATCH');
      if(Number(pack.cases)!==Number(evaluation.cases)) reasons.push('EVALUATION_CASES_MISMATCH');
      if(Number(pack.independentEpisodes)!==Number(evaluation.independentEpisodes)) reasons.push('EVALUATION_EPISODES_MISMATCH');
    }else if(pack){
      reasons.push('CANDIDATE_EVALUATION_MISSING');
    }

    if(reasons.length){
      rejected.push(deepFreeze({
        candidateId:candidateId||null,
        evidenceId:evidenceId||null,
        reasons:[...new Set(reasons)],
        action:'ABSTAIN',
        executionMode:'SHADOW_ONLY',
        canExecute:false
      }));
      continue;
    }

    const candidateRegistration={
      candidateId:artifact.candidateId,
      modelHash:artifact.modelHash,
      configHash:artifact.configHash,
      createdAt:Number(artifact.createdAt),
      dataCutoffAt:Number(artifact.dataCutoffAt),
      parentReleaseId:String(artifact.parentReleaseId),
      source:String(artifact.source),
      executionMode:'SHADOW_ONLY'
    };
    const reviewCore={
      version:MODEL_PROMOTION_REVIEW_BRIDGE_VERSION,
      candidateId,
      evidenceId,
      governorGenerationId:clean(governor?.generationId),
      governorGenerationNumber:Number(governor?.generationNumber||0),
      participantArtifactFingerprint:String(participant.artifactFingerprint),
      artifactFingerprint:String(artifact.fingerprint),
      trainingCutoffAt:Number(pack.trainingCutoffAt),
      evaluatedAt:Number(pack.evaluatedAt),
      statisticalDecision:String(pack.decision),
      metrics:clone(pack.metrics),
      statistics:clone(pack.statistics),
      subgroupStability:clone(pack.subgroupStability),
      candidateRegistration,
      requiredCanonicalGates:Object.freeze([
        'SCIENTIFIC_VALIDITY_PASS',
        'ALPHA76_EPISTEMIC_INTEGRITY_PASS',
        'SOFTWARE_RELEASE_GATES_PASS',
        'MODEL_PROMOTION_LADDER_PASS'
      ]),
      state:'AWAITING_CANONICAL_PROMOTION_EVIDENCE',
      productionMutationPerformed:false,
      executionMode:'SHADOW_ONLY',
      action:'ABSTAIN',
      canExecute:false
    };
    accepted.push(deepFreeze({...reviewCore,reviewFingerprint:sha256(reviewCore)}));
  }

  const core={
    version:MODEL_PROMOTION_REVIEW_BRIDGE_VERSION,
    asOf:t,
    generationId:governor?.generationId??null,
    reviewRequired:accepted,
    rejected,
    counts:{
      accepted:accepted.length,
      rejected:rejected.length,
      total:accepted.length+rejected.length
    },
    semantics:'STATISTICAL_REVIEW_IS_NOT_MODEL_PROMOTION',
    productionMutationPerformed:false,
    executionMode:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecute:false
  };
  return deepFreeze({...core,fingerprint:sha256(core)});
}

export function verifyPromotionReviewPacket(packet){
  try{
    if(packet?.version!==MODEL_PROMOTION_REVIEW_BRIDGE_VERSION) return {ok:false,reasons:['VERSION_INVALID']};
    if(packet?.executionMode!=='SHADOW_ONLY'||packet?.action!=='ABSTAIN'||packet?.canExecute!==false){
      return {ok:false,reasons:['SAFETY_INVARIANT_INVALID']};
    }
    if(packet?.productionMutationPerformed!==false) return {ok:false,reasons:['PRODUCTION_MUTATION_INVALID']};
    if(packet?.state!=='AWAITING_CANONICAL_PROMOTION_EVIDENCE') return {ok:false,reasons:['STATE_INVALID']};
    const {reviewFingerprint,...core}=packet;
    const expected=sha256(core);
    return reviewFingerprint===expected
      ?{ok:true,reasons:[],expectedFingerprint:expected}
      :{ok:false,reasons:['FINGERPRINT_MISMATCH'],expectedFingerprint:expected};
  }catch(err){
    return {ok:false,reasons:['PROMOTION_REVIEW_PACKET_INVALID',err instanceof Error?err.message:String(err)]};
  }
}
