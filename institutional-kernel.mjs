import crypto from 'node:crypto';
import path from 'node:path';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import readline from 'node:readline';

const LEDGER_SCHEMA=1;
const GENESIS='0'.repeat(64);

const AUDIT_IDENTITY_FIELDS=Object.freeze({
  TCX_INSTITUTIONAL_FORECAST_ISSUED:'issuanceId',
  TCX_RESEARCH_TRACE_EVALUATED:'evaluationId',
  TCX_MODEL_CANDIDATE_EVALUATED:'evaluationFingerprint',
  TCX_MODEL_CANDIDATE_PROMOTED:'promotionId',
  TCX_MODEL_ROLLBACK_DRILL:'drillId'
});

function auditIdentityKey(kind,idField,id){
  return String(kind)+'\u0000'+String(idField)+'\u0000'+String(id);
}

function indexAuditIdentity(index,record){
  const idField=AUDIT_IDENTITY_FIELDS[String(record?.kind||'')];
  if(!idField) return;
  const id=record?.payload?.[idField];
  if(id===undefined||id===null||id==='') return;
  index.set(auditIdentityKey(record.kind,idField,id),{
    seq:Number(record.seq),
    recordHash:String(record.recordHash||''),
    occurredAt:Number(record.occurredAt),
    kind:String(record.kind),
    idField,
    id:String(id)
  });
}

export const AUDIT_LEDGER_CHECKPOINT_VERSION='TCX_AUDIT_LEDGER_CHECKPOINT_V1';

function auditCheckpointCore(value){
  const core={...value};
  delete core.fingerprint;
  return core;
}

async function readAuditLedgerCheckpoint(filePath){
  try{
    const value=JSON.parse(await readFile(filePath+'.checkpoint.json','utf8'));
    if(value?.version!==AUDIT_LEDGER_CHECKPOINT_VERSION) throw new Error('AUDIT_LEDGER_CHECKPOINT_VERSION_UNSUPPORTED');
    if(value?.fingerprint!==sha256(auditCheckpointCore(value))) throw new Error('AUDIT_LEDGER_CHECKPOINT_FINGERPRINT_MISMATCH');
    const seq=Number(value.seq);
    const totalRecords=Number(value.totalRecords);
    if(!Number.isInteger(seq)||seq<0||!Number.isInteger(totalRecords)||totalRecords<seq) throw new Error('AUDIT_LEDGER_CHECKPOINT_SEQUENCE_INVALID');
    if(typeof value.tailHash!=='string'||value.tailHash.length!==64) throw new Error('AUDIT_LEDGER_CHECKPOINT_TAIL_INVALID');
    const tail=Array.isArray(value.retainedRecords)?value.retainedRecords:[];
    if(tail.length){
      let previous=null;
      for(const record of tail){
        if(record.payloadHash!==sha256(record.payload)) throw new Error('AUDIT_LEDGER_CHECKPOINT_PAYLOAD_HASH_MISMATCH');
        if(record.recordHash!==hashLedgerRecord(record)) throw new Error('AUDIT_LEDGER_CHECKPOINT_RECORD_HASH_MISMATCH');
        if(previous&&record.prevHash!==previous.recordHash) throw new Error('AUDIT_LEDGER_CHECKPOINT_TAIL_CHAIN_MISMATCH');
        previous=record;
      }
      const last=tail[tail.length-1];
      if(Number(last.seq)!==seq||String(last.recordHash)!==String(value.tailHash)) throw new Error('AUDIT_LEDGER_CHECKPOINT_TAIL_MISMATCH');
    }else if(seq!==0){
      throw new Error('AUDIT_LEDGER_CHECKPOINT_TAIL_MISSING');
    }
    return value;
  }catch(err){
    if(err?.code==='ENOENT') return null;
    throw err;
  }
}

function seedAuditIdentityIndex(index,rows){
  for(const row of Array.isArray(rows)?rows:[]){
    if(!row?.kind||!row?.idField||row?.id===undefined||row?.id===null) continue;
    index.set(auditIdentityKey(row.kind,row.idField,row.id),{
      seq:Number(row.seq),
      recordHash:String(row.recordHash||''),
      occurredAt:Number(row.occurredAt),
      kind:String(row.kind),
      idField:String(row.idField),
      id:String(row.id)
    });
  }
}

export function findAuditRecordIdentity(ledger,{kind,idField,id}={}){
  if(id===undefined||id===null||id==='') return null;
  const retained=(ledger?.records||[]).find(r=>r?.kind===kind&&r?.payload?.[idField]===id);
  if(retained) return retained;
  const hit=ledger?.identityIndex?.get?.(auditIdentityKey(kind,idField,id));
  if(!hit) return null;
  return {
    seq:hit.seq,
    recordHash:hit.recordHash,
    occurredAt:hit.occurredAt,
    kind:hit.kind,
    payload:{[hit.idField]:hit.id},
    indexedIdentity:true
  };
}

function finite(x){ const n=Number(x); return Number.isFinite(n)?n:null; }
function clamp(x,a=0,b=1){ return Math.max(a,Math.min(b,x)); }

export function canonicalize(value){
  if(value===null || typeof value==='string' || typeof value==='boolean') return value;
  if(typeof value==='number'){
    if(!Number.isFinite(value)) throw new Error('Non-finite number in canonical payload');
    return Object.is(value,-0)?0:value;
  }
  if(Array.isArray(value)) return value.map(canonicalize);
  if(typeof value==='object'){
    const out={};
    for(const key of Object.keys(value).sort()){
      const v=value[key];
      if(v===undefined || typeof v==='function' || typeof v==='symbol') continue;
      out[key]=canonicalize(v);
    }
    return out;
  }
  throw new Error(`Unsupported canonical type: ${typeof value}`);
}

export function canonicalJson(value){
  return JSON.stringify(canonicalize(value));
}

export function sha256(value){
  const bytes=Buffer.isBuffer(value)?value:Buffer.from(typeof value==='string'?value:canonicalJson(value),'utf8');
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

export function auditMarketSnapshot(snapshot,{now=Date.now(),maxAgeMs=15_000,maxFutureSkewMs=2_500,maxSpreadBps=50}={}){
  const errors=[],warnings=[];
  const bid=finite(snapshot?.bid),ask=finite(snapshot?.ask),price=finite(snapshot?.price);
  const availableAt=finite(snapshot?.availableAt),timestamp=finite(snapshot?.timestamp);
  const spreadBps=finite(snapshot?.spreadBps),imbalance=finite(snapshot?.imbalance);

  if(!(bid>0)) errors.push('BID_INVALID');
  if(!(ask>0)) errors.push('ASK_INVALID');
  if(bid!=null&&ask!=null&&ask<bid) errors.push('CROSSED_BOOK');
  if(!(price>0)) errors.push('PRICE_INVALID');
  if(availableAt==null) errors.push('AVAILABLE_AT_MISSING');
  if(timestamp==null) errors.push('TIMESTAMP_MISSING');
  if(availableAt!=null&&availableAt>now+maxFutureSkewMs) errors.push('AVAILABLE_AT_IN_FUTURE');
  if(timestamp!=null&&timestamp>now+maxFutureSkewMs) errors.push('TIMESTAMP_IN_FUTURE');
  const ageMs=availableAt==null?null:Math.max(0,now-availableAt);
  if(ageMs!=null&&ageMs>maxAgeMs) errors.push('PRIMARY_STALE');
  if(spreadBps==null||spreadBps<0) errors.push('SPREAD_INVALID');
  else if(spreadBps>maxSpreadBps) warnings.push('SPREAD_EXTREME');
  if(imbalance==null||imbalance<-1||imbalance>1) errors.push('IMBALANCE_INVALID');
  if(!snapshot?.source) warnings.push('SOURCE_MISSING');
  if(!snapshot?.version) warnings.push('VERSION_MISSING');

  return {
    ok:errors.length===0,
    errors,
    warnings,
    ageMs,
    checks:{
      bid,ask,price,spreadBps,imbalance,availableAt,timestamp
    }
  };
}

export function auditWitnessReport(report){
  const errors=[],warnings=[];
  if(!report || typeof report!=='object'){
    return {ok:false,errors:['WITNESS_REPORT_MISSING'],warnings:[],externalWitnessCount:0,agreementScore:0};
  }
  const external=Number(report.externalWitnessCount||0);
  const agreement=finite(report.agreementScore)??0;
  if(agreement<0||agreement>1) errors.push('WITNESS_AGREEMENT_INVALID');
  if(external===0) warnings.push('NO_EXTERNAL_WITNESS');
  else if(external===1) warnings.push('SINGLE_EXTERNAL_WITNESS');
  if(Array.isArray(report.rejected)&&report.rejected.length) warnings.push('WITNESS_REJECTIONS');
  if(Array.isArray(report.witnessErrors)&&report.witnessErrors.length) warnings.push('WITNESS_PROVIDER_ERRORS');
  if(Array.isArray(report.contradictions)&&report.contradictions.some(x=>String(x).startsWith('PRICE_DISLOCATION_'))) warnings.push('CROSS_VENUE_PRICE_DISLOCATION');
  if(report.independentWitnessSatisfied!==true) warnings.push('STRICT_WITNESS_NOT_SATISFIED');

  return {
    ok:errors.length===0,
    errors,
    warnings,
    externalWitnessCount:external,
    agreementScore:agreement,
    strict:report.independentWitnessSatisfied===true
  };
}

export function auditEngineResult(result){
  const errors=[],warnings=[];
  if(!result||typeof result!=='object') return {ok:false,errors:['ENGINE_RESULT_MISSING'],warnings:[]};
  if(result.execution!=='SHADOW_ONLY') errors.push('EXECUTION_MODE_VIOLATION');
  if(result.action!=='ABSTAIN') errors.push('ACTION_INVARIANT_VIOLATION');
  if(result.hypothesis?.causalStatus!=='NOT_IDENTIFIED') errors.push('CAUSAL_STATUS_VIOLATION');

  const bounded=[
    ['EVIDENCE_STRENGTH',result.hypothesis?.evidenceStrength],
    ['CONTRADICTION',result.audit?.contradictionScore],
    ['MODALITY_COVERAGE',result.audit?.modalityCoverage],
    ['NOVELTY',result.lattice?.novelty],
    ['TRANSITION_ENTROPY',result.lattice?.transitionEntropy],
    ['TRANSITION_COHERENCE',result.lattice?.transitionCoherence]
  ];
  for(const [name,v] of bounded){
    const n=finite(v);
    if(n==null||n<0||n>1) errors.push(`${name}_INVALID`);
  }
  if(Number(result.lattice?.support||0)<5) warnings.push('LOW_TRANSITION_SUPPORT');
  if((finite(result.lattice?.novelty)??1)>0.75) warnings.push('HIGH_NOVELTY');
  if((finite(result.audit?.contradictionScore)??0)>0.25) warnings.push('HIGH_CONTRADICTION');

  return {ok:errors.length===0,errors,warnings};
}

export function determineSafetyState({marketAudit,witnessAudit,engineAudit,ledgerHealthy=true,fabricHealthy=true,registryHealthy=true}){
  const hard=[];
  const soft=[];
  if(!ledgerHealthy) hard.push('AUDIT_LEDGER_UNHEALTHY');
  if(!fabricHealthy) hard.push('MARKET_DATA_FABRIC_UNHEALTHY');
  if(!registryHealthy) hard.push('RELEASE_REGISTRY_UNHEALTHY');
  if(!marketAudit?.ok) hard.push(...(marketAudit?.errors||['PRIMARY_DATA_INVALID']));
  if(!engineAudit?.ok) hard.push(...(engineAudit?.errors||['ENGINE_INVALID']));
  soft.push(...(marketAudit?.warnings||[]),...(witnessAudit?.warnings||[]),...(engineAudit?.warnings||[]));

  let state='NORMAL';
  if(hard.length) state='SAFE_STOP';
  else if(soft.length) state='DEGRADED';

  return {
    state,
    canResearch:state!=='SAFE_STOP',
    canExecute:false,
    executionMode:'SHADOW_ONLY',
    hardReasons:[...new Set(hard)],
    softReasons:[...new Set(soft)]
  };
}

export function buildResearchEnvelope({
  symbol,
  availableAt,
  market,
  witness,
  engine,
  safety,
  config,
  versions={},
  dataFabric={},
  runtimeRelease={}
}){
  const configHash=sha256(config||{});
  const inputs={
    symbol:String(symbol),
    availableAt:Number(availableAt),
    market:{
      source:String(market?.source||'UNKNOWN'),
      version:String(market?.version||'UNKNOWN'),
      timestamp:Number(market?.timestamp),
      availableAt:Number(market?.availableAt),
      price:Number(market?.price),
      bid:Number(market?.bid),
      ask:Number(market?.ask),
      spreadBps:Number(market?.spreadBps),
      imbalance:Number(market?.imbalance),
      provenance:String(market?.provenance||'')
    },
    witness:{
      sourceIndependence:String(witness?.sourceIndependence||'UNKNOWN'),
      independentWitnessSatisfied:witness?.independentWitnessSatisfied===true,
      externalWitnessCount:Number(witness?.externalWitnessCount||0),
      agreementScore:Number(witness?.agreementScore||0),
      venues:[...(witness?.distinctVenues||[])].map(String).sort(),
      contradictions:[...(witness?.contradictions||[])].map(String).sort(),
      rejected:[...(witness?.rejected||[])].map(x=>({source:String(x.source||''),reason:String(x.reason||'')}))
    },
    engine:{
      version:String(engine?.version||'UNKNOWN'),
      action:String(engine?.action||'UNKNOWN'),
      execution:String(engine?.execution||'UNKNOWN'),
      candidate:String(engine?.hypothesis?.candidate||'NONE'),
      gate:String(engine?.hypothesis?.gate||'UNKNOWN'),
      causalStatus:String(engine?.hypothesis?.causalStatus||'UNKNOWN'),
      evidenceStrength:Number(engine?.hypothesis?.evidenceStrength||0),
      contradictionScore:Number(engine?.audit?.contradictionScore||0),
      novelty:Number(engine?.lattice?.novelty||0),
      transitionCoherence:Number(engine?.lattice?.transitionCoherence||0),
      transitionSupport:Number(engine?.lattice?.support||0)
    }
  };
  const inputHash=sha256(inputs);
  const envelope={
    schemaVersion:1,
    kind:'TCX_RESEARCH_ENVELOPE',
    symbol:String(symbol),
    availableAt:Number(availableAt),
    configHash,
    inputHash,
    versions:canonicalize(versions),
    dataFabric:canonicalize(dataFabric),
    runtimeRelease:canonicalize(runtimeRelease),
    safety:canonicalize(safety),
    inputs:canonicalize(inputs)
  };
  return {...envelope,envelopeHash:sha256(envelope)};
}

function recordCore({seq,prevHash,occurredAt,kind,payload}){
  const payloadHash=sha256(payload);
  return {
    schemaVersion:LEDGER_SCHEMA,
    seq,
    prevHash,
    occurredAt,
    kind,
    payloadHash,
    payload:canonicalize(payload)
  };
}

export function hashLedgerRecord(record){
  const {recordHash,...without}=record;
  return sha256(without);
}

export function verifyLedgerRecords(records){
  let prev=GENESIS;
  let expectedSeq=1;
  for(const record of records){
    if(Number(record.seq)!==expectedSeq) return {ok:false,error:'SEQ_GAP',seq:record.seq};
    if(record.prevHash!==prev) return {ok:false,error:'PREV_HASH_MISMATCH',seq:record.seq};
    if(record.payloadHash!==sha256(record.payload)) return {ok:false,error:'PAYLOAD_HASH_MISMATCH',seq:record.seq};
    const expectedHash=hashLedgerRecord(record);
    if(record.recordHash!==expectedHash) return {ok:false,error:'RECORD_HASH_MISMATCH',seq:record.seq};
    prev=record.recordHash;
    expectedSeq++;
  }
  return {ok:true,count:records.length,tailHash:prev,lastSeq:expectedSeq-1};
}

export async function openAuditLedger(filePath,{maxInMemoryRecords=1000,maxFileBytes=64*1024*1024}={}){
  await mkdir(path.dirname(filePath),{recursive:true});
  const keep=Math.max(1,Math.floor(Number(maxInMemoryRecords)||1000));
  const maxBytes=Math.max(1,Math.floor(Number(maxFileBytes)||64*1024*1024));
  const ring=new Array(keep);
  let retainedCount=0,ringPos=0,fileBytes=0;
  const identityIndex=new Map();

  let checkpoint=null;
  try{
    checkpoint=await readAuditLedgerCheckpoint(filePath);
  }catch(err){
    return {
      filePath,
      healthy:false,
      verification:{ok:false,error:'LEDGER_CHECKPOINT_FAILURE',detail:err instanceof Error?err.message:String(err)},
      seq:0,
      tailHash:GENESIS,
      totalRecords:0,
      maxInMemoryRecords:keep,
      maxFileBytes:maxBytes,
      fileBytes:0,
      writeBlocked:true,
      identityIndex,
      records:[],
      archiveCheckpoint:null
    };
  }

  seedAuditIdentityIndex(identityIndex,checkpoint?.identities);
  for(const record of (checkpoint?.retainedRecords||[]).slice(-keep)){
    ring[ringPos]=record;
    ringPos=(ringPos+1)%keep;
    retainedCount=Math.min(retainedCount+1,keep);
  }

  let prev=String(checkpoint?.tailHash||GENESIS);
  let expectedSeq=Number(checkpoint?.seq||0)+1;
  let total=Number(checkpoint?.totalRecords||checkpoint?.seq||0);
  let healthy=true,error=null,detail=null;

  try{
    const input=createReadStream(filePath,{encoding:'utf8'});
    const rl=readline.createInterface({input,crlfDelay:Infinity});
    let lineNo=0;
    for await(const line of rl){
      lineNo++;
      fileBytes+=Buffer.byteLength(line,'utf8')+1;
      if(!line.trim()) continue;
      let record;
      try{record=JSON.parse(line);}
      catch(err){
        healthy=false;
        error='LEDGER_READ_OR_PARSE_FAILURE';
        detail='Invalid ledger JSON at line '+lineNo+': '+String(err instanceof Error?err.message:err);
        break;
      }

      if(Number(record.seq)!==expectedSeq){
        healthy=false;error='SEQ_GAP';detail='seq '+String(record.seq)+' expected '+String(expectedSeq);break;
      }
      if(record.prevHash!==prev){
        healthy=false;error='PREV_HASH_MISMATCH';detail='seq '+String(record.seq);break;
      }
      if(record.payloadHash!==sha256(record.payload)){
        healthy=false;error='PAYLOAD_HASH_MISMATCH';detail='seq '+String(record.seq);break;
      }
      const expectedHash=hashLedgerRecord(record);
      if(record.recordHash!==expectedHash){
        healthy=false;error='RECORD_HASH_MISMATCH';detail='seq '+String(record.seq);break;
      }

      indexAuditIdentity(identityIndex,record);
      ring[ringPos]=record;
      ringPos=(ringPos+1)%keep;
      retainedCount=Math.min(retainedCount+1,keep);
      prev=record.recordHash;
      expectedSeq++;
      total++;
    }
  }catch(err){
    if(err?.code!=='ENOENT'){
      return {
        filePath,
        healthy:false,
        verification:{ok:false,error:'LEDGER_READ_OR_PARSE_FAILURE',detail:err instanceof Error?err.message:String(err)},
        seq:expectedSeq-1,
        tailHash:prev,
        totalRecords:total,
        maxInMemoryRecords:keep,
        maxFileBytes:maxBytes,
        fileBytes,
        writeBlocked:true,
        identityIndex,
        records:[],
        archiveCheckpoint:checkpoint
      };
    }
  }

  if(!healthy){
    return {
      filePath,
      healthy:false,
      verification:{ok:false,error:error||'LEDGER_READ_OR_PARSE_FAILURE',detail},
      seq:expectedSeq-1,
      tailHash:prev,
      totalRecords:total,
      maxInMemoryRecords:keep,
      maxFileBytes:maxBytes,
      fileBytes,
      writeBlocked:true,
      identityIndex,
      records:[],
      archiveCheckpoint:checkpoint
    };
  }

  const records=total<=keep&&Number(checkpoint?.seq||0)===0
    ?ring.slice(0,retainedCount)
    :retainedCount<keep
      ?ring.slice(0,retainedCount)
      :[...ring.slice(ringPos),...ring.slice(0,ringPos)];
  const writeBlocked=fileBytes>=maxBytes;
  return {
    filePath,
    healthy:!writeBlocked,
    verification:writeBlocked
      ?{ok:false,error:'LEDGER_SIZE_LIMIT',detail:'audit ledger reached configured active-segment byte cap',count:total,tailHash:prev,lastSeq:expectedSeq-1,retainedRecords:records.length}
      :{ok:true,count:total,tailHash:prev,lastSeq:expectedSeq-1,retainedRecords:records.length,archivedSegments:Number(checkpoint?.archivedSegments?.length||0)},
    seq:expectedSeq-1,
    tailHash:prev,
    totalRecords:total,
    maxInMemoryRecords:keep,
    maxFileBytes:maxBytes,
    fileBytes,
    writeBlocked,
    identityIndex,
    records,
    archiveCheckpoint:checkpoint
  };
}

export async function appendAuditRecord(ledger,{kind,payload,occurredAt=Date.now()}){
  if(!ledger?.healthy) throw new Error('Audit ledger unhealthy: fail closed');
  const core=recordCore({
    seq:ledger.seq+1,
    prevHash:ledger.tailHash,
    occurredAt:Number(occurredAt),
    kind:String(kind),
    payload
  });
  const record={...core,recordHash:sha256(core)};
  const serialized=canonicalJson(record)+'\n';
  const nextFileBytes=Math.max(0,Number(ledger.fileBytes)||0)+Buffer.byteLength(serialized,'utf8');
  const maxFileBytes=Math.max(1,Number(ledger.maxFileBytes)||64*1024*1024);
  if(nextFileBytes>maxFileBytes){
    ledger.healthy=false;
    ledger.writeBlocked=true;
    ledger.verification={
      ok:false,
      error:'LEDGER_SIZE_LIMIT',
      detail:'audit ledger byte cap would be exceeded',
      count:Number(ledger.seq||0),
      lastSeq:Number(ledger.seq||0),
      tailHash:String(ledger.tailHash||GENESIS),
      retainedRecords:Array.isArray(ledger.records)?ledger.records.length:0
    };
    const err=new Error('AUDIT_LEDGER_SIZE_LIMIT');
    err.code='AUDIT_LEDGER_SIZE_LIMIT';
    throw err;
  }
  await appendFile(ledger.filePath,serialized,{encoding:'utf8',mode:0o600});
  ledger.fileBytes=nextFileBytes;
  ledger.writeBlocked=false;
  ledger.seq=record.seq;
  ledger.tailHash=record.recordHash;
  if(!ledger.identityIndex) ledger.identityIndex=new Map();
  indexAuditIdentity(ledger.identityIndex,record);
  ledger.records.push(record);
  const keep=Math.max(1,Math.floor(Number(ledger.maxInMemoryRecords)||1000));
  while(ledger.records.length>keep) ledger.records.shift();
  ledger.totalRecords=ledger.seq;
  ledger.verification={
    ok:true,
    count:ledger.seq,
    lastSeq:ledger.seq,
    tailHash:ledger.tailHash,
    retainedRecords:ledger.records.length
  };
  return record;
}

export function replayEnvelopeIntegrity(envelope){
  if(!envelope||envelope.kind!=='TCX_RESEARCH_ENVELOPE') return {ok:false,error:'NOT_RESEARCH_ENVELOPE'};
  const {envelopeHash,...without}=envelope;
  const hashOk=envelopeHash===sha256(without);
  const inputOk=envelope.inputHash===sha256(envelope.inputs);
  return {
    ok:hashOk&&inputOk,
    envelopeHashOk:hashOk,
    inputHashOk:inputOk,
    configHash:String(envelope.configHash||'')
  };
}

export function ledgerTailSummary(ledger){
  return {
    healthy:ledger?.healthy===true,
    seq:Number(ledger?.seq||0),
    tailHash:String(ledger?.tailHash||GENESIS),
    filePath:String(ledger?.filePath||''),
    fileBytes:Number(ledger?.fileBytes||0),
    maxFileBytes:Number(ledger?.maxFileBytes||0),
    writeBlocked:ledger?.writeBlocked===true
  };
}

export const INSTITUTIONAL_KERNEL_VERSION='IK_V1';
