import path from 'node:path';
import { open as openFile, mkdir, readFile } from 'node:fs/promises';
import { canonicalJson, sha256 } from './institutional-kernel.mjs';
import { verifyModelPromotionEvaluation, verifyModelPromotionRecord } from './model-promotion-ladder.mjs';

export const MODEL_CANDIDATE_REGISTRY_VERSION='TCX_MODEL_CANDIDATE_REGISTRY_V1';

const GENESIS='0'.repeat(64);

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
function nonEmpty(v,name){
  const s=String(v??'').trim();
  if(!s) throw new Error(name+' is required');
  return s;
}

function recordCore({seq,prevHash,kind,recordedAt,payload}){
  return {
    version:MODEL_CANDIDATE_REGISTRY_VERSION,
    seq,
    prevHash,
    kind,
    recordedAt:Number(recordedAt),
    payload
  };
}

export function hashCandidateRegistryRecord(record){
  const {recordHash,...core}=record;
  return sha256(core);
}

export function verifyModelCandidateRegistry(records){
  let seq=1,prev=GENESIS;
  const registered=new Map();
  const evaluations=new Map();
  const promotions=new Map();

  for(const record of records||[]){
    if(record?.version!==MODEL_CANDIDATE_REGISTRY_VERSION){
      return {ok:false,error:'VERSION_INVALID',seq:record?.seq};
    }
    if(Number(record.seq)!==seq) return {ok:false,error:'SEQ_GAP',seq:record.seq,expected:seq};
    if(record.prevHash!==prev) return {ok:false,error:'PREV_HASH_MISMATCH',seq:record.seq};
    if(record.recordHash!==hashCandidateRegistryRecord(record)) return {ok:false,error:'RECORD_HASH_MISMATCH',seq:record.seq};

    const p=record.payload||{};
    if(record.kind==='CANDIDATE_REGISTERED'){
      if(registered.has(p.candidateId)) return {ok:false,error:'CANDIDATE_DUPLICATE_REGISTRATION',seq:record.seq};
      registered.set(p.candidateId,p);
    }else if(record.kind==='CANDIDATE_EVALUATED'){
      if(!registered.has(p.candidateId)) return {ok:false,error:'UNKNOWN_CANDIDATE_EVALUATION',seq:record.seq};
      const v=verifyModelPromotionEvaluation(p.evaluation);
      if(!v.ok) return {ok:false,error:'PROMOTION_EVALUATION_INVALID',seq:record.seq};
      if(p.evaluation.candidate.candidateId!==p.candidateId) return {ok:false,error:'EVALUATION_CANDIDATE_MISMATCH',seq:record.seq};
      evaluations.set(p.candidateId,p.evaluation);
    }else if(record.kind==='CANDIDATE_PROMOTED'){
      if(!registered.has(p.candidateId)) return {ok:false,error:'UNKNOWN_CANDIDATE_PROMOTION',seq:record.seq};
      const e=evaluations.get(p.candidateId);
      if(!e||e.decision!=='PROMOTE_CANDIDATE') return {ok:false,error:'PROMOTION_WITHOUT_READY_EVALUATION',seq:record.seq};
      const v=verifyModelPromotionRecord(p.promotion);
      if(!v.ok) return {ok:false,error:'PROMOTION_RECORD_INVALID',seq:record.seq};
      if(p.promotion.candidateId!==p.candidateId) return {ok:false,error:'PROMOTION_CANDIDATE_MISMATCH',seq:record.seq};
      if(p.promotion.evaluationFingerprint!==e.fingerprint) return {ok:false,error:'PROMOTION_EVALUATION_MISMATCH',seq:record.seq};
      if(promotions.has(p.candidateId)) return {ok:false,error:'CANDIDATE_DUPLICATE_PROMOTION',seq:record.seq};
      promotions.set(p.candidateId,p.promotion);
    }else if(record.kind==='CANDIDATE_ROLLED_BACK'){
      const promotion=promotions.get(p.candidateId);
      if(!promotion) return {ok:false,error:'ROLLBACK_WITHOUT_PROMOTION',seq:record.seq};
      if(p.fromReleaseId!==promotion.candidateReleaseId) return {ok:false,error:'ROLLBACK_RELEASE_MISMATCH',seq:record.seq};
    }else{
      return {ok:false,error:'KIND_INVALID',seq:record.seq};
    }

    prev=record.recordHash;
    seq++;
  }

  return {
    ok:true,
    count:seq-1,
    lastSeq:seq-1,
    tailHash:prev,
    registered:registered.size,
    evaluated:evaluations.size,
    promoted:promotions.size
  };
}

export async function openModelCandidateRegistry(filePath){
  await mkdir(path.dirname(filePath),{recursive:true});
  let records=[];
  try{
    const raw=await readFile(filePath,'utf8');
    records=raw.split(/\r?\n/).filter(Boolean).map((line,i)=>{
      try{return JSON.parse(line);}
      catch{throw new Error('Invalid candidate-registry JSON at line '+(i+1));}
    });
  }catch(err){
    if(err?.code!=='ENOENT'){
      return {
        filePath,
        healthy:false,
        verification:{ok:false,error:'REGISTRY_READ_OR_PARSE_FAILURE',detail:err instanceof Error?err.message:String(err)},
        records:[],
        seq:0,
        tailHash:GENESIS
      };
    }
  }

  const verification=verifyModelCandidateRegistry(records);
  return {
    filePath,
    healthy:verification.ok,
    verification,
    records,
    seq:verification.ok?verification.lastSeq:0,
    tailHash:verification.ok?verification.tailHash:GENESIS
  };
}

async function append(registry,kind,payload,recordedAt){
  if(!registry?.healthy) throw new Error('Model Candidate Registry unhealthy: fail closed');
  const core=recordCore({
    seq:registry.seq+1,
    prevHash:registry.tailHash,
    kind,
    recordedAt,
    payload
  });
  const record={...core,recordHash:sha256(core)};

  let fh;
  try{
    fh=await openFile(registry.filePath,'a',0o600);
    await fh.write(canonicalJson(record)+'\n',null,'utf8');
    await fh.sync();
  }catch(err){
    registry.healthy=false;
    registry.verification={ok:false,error:'REGISTRY_APPEND_FAILURE',detail:err instanceof Error?err.message:String(err)};
    throw err;
  }finally{
    if(fh) await fh.close();
  }

  registry.records.push(record);
  registry.seq=record.seq;
  registry.tailHash=record.recordHash;
  return record;
}

function existing(registry,kind,idField,id){
  return registry?.records?.find(r=>r.kind===kind&&r.payload?.[idField]===id)||null;
}

export async function registerModelCandidate(registry,candidate,{registeredAt=Date.now()}={}){
  const candidateId=nonEmpty(candidate?.candidateId,'candidateId');
  const prior=existing(registry,'CANDIDATE_REGISTERED','candidateId',candidateId);
  if(prior){
    const incoming={
      candidateId,
      modelHash:hash64(candidate?.modelHash,'candidate.modelHash'),
      configHash:hash64(candidate?.configHash,'candidate.configHash'),
      createdAt:finite(candidate?.createdAt,'candidate.createdAt'),
      dataCutoffAt:finite(candidate?.dataCutoffAt,'candidate.dataCutoffAt'),
      parentReleaseId:nonEmpty(candidate?.parentReleaseId,'candidate.parentReleaseId'),
      source:nonEmpty(candidate?.source??'UNKNOWN','candidate.source'),
      executionMode:'SHADOW_ONLY',
      canExecute:false
    };
    if(sha256(prior.payload)===sha256(incoming)) return {record:prior,duplicate:true};
    throw new Error('candidateId already registered with different payload');
  }

  const createdAt=finite(candidate?.createdAt,'candidate.createdAt');
  const dataCutoffAt=finite(candidate?.dataCutoffAt,'candidate.dataCutoffAt');
  const at=finite(registeredAt,'registeredAt');
  if(dataCutoffAt>createdAt) throw new Error('candidate dataCutoffAt cannot exceed createdAt');
  if(createdAt>at) throw new Error('candidate createdAt cannot exceed registration time');
  if(String(candidate?.executionMode??'SHADOW_ONLY').toUpperCase()!=='SHADOW_ONLY'){
    throw new Error('candidate executionMode must remain SHADOW_ONLY');
  }

  const payload={
    candidateId,
    modelHash:hash64(candidate?.modelHash,'candidate.modelHash'),
    configHash:hash64(candidate?.configHash,'candidate.configHash'),
    createdAt,
    dataCutoffAt,
    parentReleaseId:nonEmpty(candidate?.parentReleaseId,'candidate.parentReleaseId'),
    source:nonEmpty(candidate?.source??'UNKNOWN','candidate.source'),
    executionMode:'SHADOW_ONLY',
    canExecute:false
  };

  return {record:await append(registry,'CANDIDATE_REGISTERED',payload,at),duplicate:false};
}

export async function recordModelCandidateEvaluation(registry,evaluation,{recordedAt=Date.now()}={}){
  const v=verifyModelPromotionEvaluation(evaluation);
  if(!v.ok) throw new Error('invalid model promotion evaluation');
  const candidateId=evaluation.candidate.candidateId;
  if(!existing(registry,'CANDIDATE_REGISTERED','candidateId',candidateId)) throw new Error('candidate not registered');

  const prior=registry.records.find(r=>
    r.kind==='CANDIDATE_EVALUATED'&&
    r.payload?.candidateId===candidateId&&
    r.payload?.evaluation?.fingerprint===evaluation.fingerprint
  );
  if(prior) return {record:prior,duplicate:true};

  const at=finite(recordedAt,'recordedAt');
  if(at<evaluation.asOf) throw new Error('evaluation record time cannot predate evaluation asOf');
  return {
    record:await append(registry,'CANDIDATE_EVALUATED',{
      candidateId,
      evaluation:structuredClone(evaluation)
    },at),
    duplicate:false
  };
}

export async function recordModelCandidatePromotion(registry,promotion,{recordedAt=Date.now()}={}){
  const v=verifyModelPromotionRecord(promotion);
  if(!v.ok) throw new Error('invalid model promotion record');
  const candidateId=promotion.candidateId;
  if(!existing(registry,'CANDIDATE_REGISTERED','candidateId',candidateId)) throw new Error('candidate not registered');

  const ready=registry.records.find(r=>
    r.kind==='CANDIDATE_EVALUATED'&&
    r.payload?.candidateId===candidateId&&
    r.payload?.evaluation?.fingerprint===promotion.evaluationFingerprint&&
    r.payload?.evaluation?.decision==='PROMOTE_CANDIDATE'
  );
  if(!ready) throw new Error('promotion has no matching promotion-ready evaluation');

  const prior=existing(registry,'CANDIDATE_PROMOTED','candidateId',candidateId);
  if(prior){
    if(prior.payload?.promotion?.promotionId===promotion.promotionId) return {record:prior,duplicate:true};
    throw new Error('candidate already promoted with different promotion');
  }

  const at=finite(recordedAt,'recordedAt');
  if(at<promotion.promotedAt) throw new Error('promotion record time cannot predate promotedAt');
  return {
    record:await append(registry,'CANDIDATE_PROMOTED',{
      candidateId,
      promotion:structuredClone(promotion)
    },at),
    duplicate:false
  };
}

export async function recordModelRollback(registry,{
  candidateId,
  fromReleaseId,
  toReleaseId,
  reason,
  rolledBackAt=Date.now()
}={}){
  const id=nonEmpty(candidateId,'candidateId');
  const promotion=existing(registry,'CANDIDATE_PROMOTED','candidateId',id);
  if(!promotion) throw new Error('candidate has not been promoted');

  const from=nonEmpty(fromReleaseId,'fromReleaseId');
  const to=nonEmpty(toReleaseId,'toReleaseId');
  if(from!==promotion.payload.promotion.candidateReleaseId) throw new Error('rollback fromReleaseId does not match promoted release');
  if(from===to) throw new Error('rollback target must differ from promoted release');

  const prior=existing(registry,'CANDIDATE_ROLLED_BACK','candidateId',id);
  if(prior) return {record:prior,duplicate:true};

  const at=finite(rolledBackAt,'rolledBackAt');
  if(at<promotion.payload.promotion.promotedAt) throw new Error('rollback cannot predate promotion');

  return {
    record:await append(registry,'CANDIDATE_ROLLED_BACK',{
      candidateId:id,
      fromReleaseId:from,
      toReleaseId:to,
      reason:nonEmpty(reason,'reason'),
      productionMutationPerformed:false,
      executionMode:'SHADOW_ONLY',
      canExecute:false
    },at),
    duplicate:false
  };
}

export function modelCandidateRegistrySummary(registry){
  const candidates=new Map();
  for(const r of registry?.records||[]){
    const id=r.payload?.candidateId;
    if(!id) continue;
    const state=candidates.get(id)??{candidateId:id,status:'UNKNOWN'};
    if(r.kind==='CANDIDATE_REGISTERED') Object.assign(state,{status:'REGISTERED',registered:r.payload});
    if(r.kind==='CANDIDATE_EVALUATED') Object.assign(state,{status:r.payload.evaluation.decision,evaluationFingerprint:r.payload.evaluation.fingerprint});
    if(r.kind==='CANDIDATE_PROMOTED') Object.assign(state,{status:'PROMOTED',promotionId:r.payload.promotion.promotionId,releaseId:r.payload.promotion.candidateReleaseId});
    if(r.kind==='CANDIDATE_ROLLED_BACK') Object.assign(state,{status:'ROLLED_BACK',rollback:r.payload});
    candidates.set(id,state);
  }

  return {
    healthy:registry?.healthy===true,
    seq:Number(registry?.seq??0),
    tailHash:String(registry?.tailHash??GENESIS),
    candidates:[...candidates.values()],
    executionMode:'SHADOW_ONLY',
    canExecute:false
  };
}
