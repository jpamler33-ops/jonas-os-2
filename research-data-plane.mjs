import path from 'node:path';
import { createReadStream } from 'node:fs';
import { mkdir, open as openFile, stat, readFile, writeFile, rename } from 'node:fs/promises';
import readline from 'node:readline';

import { canonicalJson, sha256 } from './institutional-kernel.mjs';

export const RESEARCH_DATA_PLANE_VERSION='TCX_RESEARCH_DATA_PLANE_V1';
export const RESEARCH_DATA_PLANE_SCHEMA_VERSION=1;
export const RDP_COMPACTION_ANCHOR_VERSION='TCX_RDP_COMPACTION_ANCHOR_V1';

const GENESIS='0'.repeat(64);
const FINALITY=new Set(['OBSERVED','PROVISIONAL','CONFIRMED','FINALIZED']);
const RDP_MUTATION_TAILS=new Map();

export async function withResearchDataPlaneMutationLock(filePath,task){
  if(typeof task!=='function') throw new Error('RDP_MUTATION_TASK_REQUIRED');
  const key=path.resolve(String(filePath||''));
  const previous=RDP_MUTATION_TAILS.get(key)||Promise.resolve();
  let tail;
  const run=previous.then(()=>task(),()=>task());
  tail=run.then(
    ()=>undefined,
    ()=>undefined
  ).finally(()=>{
    if(RDP_MUTATION_TAILS.get(key)===tail) RDP_MUTATION_TAILS.delete(key);
  });
  RDP_MUTATION_TAILS.set(key,tail);
  return run;
}

function finite(v){
  const n=Number(v);
  return Number.isFinite(n)?n:null;
}
function bounded01(v,name){
  const n=finite(v);
  if(n==null||n<0||n>1) throw new Error(name+' must be in [0,1]');
  return n;
}
function nonEmpty(v,name,max=160){
  const s=String(v??'').trim();
  if(!s) throw new Error(name+' is required');
  if(s.length>max) throw new Error(name+' too long');
  return s;
}
function cleanFeatureRows(rows){
  const out=[];
  const seen=new Set();
  for(const row of Array.isArray(rows)?rows:[]){
    const id=String(row?.id??'').trim();
    const value=finite(row?.value);
    if(!id||id.length>160||!/^[A-Za-z0-9._:-]+$/.test(id)||value==null) continue;
    if(seen.has(id)) continue;
    seen.add(id);
    out.push(Object.freeze({id,value}));
  }
  return out.sort((a,b)=>a.id.localeCompare(b.id));
}
function cleanQuality(input={}){
  return Object.freeze({
    completeness:bounded01(input?.completeness??0,'quality.completeness'),
    sourceCount:Number.isFinite(Number(input?.sourceCount))?Math.max(0,Math.floor(Number(input.sourceCount))):null,
    expectedSourceCount:Number.isFinite(Number(input?.expectedSourceCount))?Math.max(0,Math.floor(Number(input.expectedSourceCount))):null,
    status:String(input?.status||'OBSERVED').slice(0,80)
  });
}
function cleanProvenance(input={}){
  const value=input&&typeof input==='object'?structuredClone(input):{};
  return JSON.parse(canonicalJson(value));
}
function payloadCore(input){
  const core={
    domain:input.domain,
    source:input.source,
    sourceVersion:input.sourceVersion,
    finality:input.finality,
    quality:input.quality,
    features:input.features,
    provenance:input.provenance
  };
  if(input?.governance!=null) core.governance=input.governance;
  return core;
}
function recordCore({seq,prevHash,input}){
  const payloadHash=sha256(payloadCore(input));
  return {
    schemaVersion:RESEARCH_DATA_PLANE_SCHEMA_VERSION,
    version:RESEARCH_DATA_PLANE_VERSION,
    seq,
    prevHash,
    recordType:'FEATURE_SNAPSHOT',
    streamKey:input.streamKey,
    domain:input.domain,
    source:input.source,
    sourceVersion:input.sourceVersion,
    sourceEventId:input.sourceEventId,
    eventTime:input.eventTime,
    availableAt:input.availableAt,
    validUntil:input.validUntil,
    ingestedAt:input.ingestedAt,
    finality:input.finality,
    quality:input.quality,
    features:input.features,
    provenance:input.provenance,
    ...(input?.governance!=null?{governance:input.governance}:{}),
    payloadHash
  };
}
function sourceEventPayloadHash(record){
  return sha256({
    domain:record?.domain,
    source:record?.source,
    sourceVersion:record?.sourceVersion,
    finality:record?.finality,
    quality:record?.quality,
    features:record?.features,
    provenance:record?.provenance
  });
}
function dedupeKey(record){
  return sha256({
    streamKey:record.streamKey,
    domain:record.domain,
    source:record.source,
    sourceEventId:record.sourceEventId,
    sourceEventPayloadHash:sourceEventPayloadHash(record)
  });
}

function validHash(v){ return typeof v==='string'&&/^[a-f0-9]{64}$/i.test(v); }

export function researchDataPlaneAnchorPath(filePath){
  return String(filePath)+'.anchor.json';
}

export async function loadResearchDataPlaneAnchor(filePath){
  const anchorPath=researchDataPlaneAnchorPath(filePath);
  try{
    const raw=JSON.parse(await readFile(anchorPath,'utf8'));
    if(
      raw?.version!==RDP_COMPACTION_ANCHOR_VERSION||
      !Number.isInteger(Number(raw?.firstSeq))||
      Number(raw.firstSeq)<1||
      !validHash(raw?.anchorPrevHash)||
      !validHash(raw?.firstRecordHash)
    ) return null;
    return Object.freeze({
      version:RDP_COMPACTION_ANCHOR_VERSION,
      firstSeq:Number(raw.firstSeq),
      anchorPrevHash:String(raw.anchorPrevHash),
      firstRecordHash:String(raw.firstRecordHash),
      createdAt:Number(raw.createdAt)||null,
      reason:String(raw.reason||'COMPACTION')
    });
  }catch{
    return null;
  }
}

export async function saveResearchDataPlaneAnchor(filePath,{
  firstSeq,
  anchorPrevHash,
  firstRecordHash,
  createdAt=Date.now(),
  reason='COMPACTION'
}={}){
  const seq=Number(firstSeq);
  if(!Number.isInteger(seq)||seq<1) throw new Error('RDP_ANCHOR_SEQ_INVALID');
  if(!validHash(anchorPrevHash)||!validHash(firstRecordHash)) throw new Error('RDP_ANCHOR_HASH_INVALID');
  const anchorPath=researchDataPlaneAnchorPath(filePath);
  const value={
    version:RDP_COMPACTION_ANCHOR_VERSION,
    firstSeq:seq,
    anchorPrevHash:String(anchorPrevHash),
    firstRecordHash:String(firstRecordHash),
    createdAt:Number(createdAt)||Date.now(),
    reason:String(reason||'COMPACTION')
  };
  const tmp=anchorPath+'.tmp-'+process.pid+'-'+Date.now();
  await writeFile(tmp,JSON.stringify(value,null,2)+'\n',{encoding:'utf8',mode:0o600});
  await rename(tmp,anchorPath);
  return Object.freeze(value);
}

export function hashResearchDataRecord(record){
  const {recordHash,...core}=record||{};
  return sha256(core);
}

export function createResearchFeatureSnapshot({
  streamKey,
  domain,
  source,
  sourceVersion='V1',
  sourceEventId=null,
  eventTime,
  availableAt,
  ingestedAt=Date.now(),
  ttlMs=15*60_000,
  finality='OBSERVED',
  quality={completeness:1},
  features=[],
  provenance={}
}={}){
  const sk=nonEmpty(streamKey,'streamKey',64).toUpperCase();
  const dm=nonEmpty(domain,'domain',80).toUpperCase();
  if(!/^[A-Z0-9_:-]+$/.test(dm)) throw new Error('domain contains unsupported characters');
  const src=nonEmpty(source,'source',160);
  const srcVersion=nonEmpty(sourceVersion,'sourceVersion',120);
  const et=finite(eventTime);
  const aa=finite(availableAt);
  const ia=finite(ingestedAt);
  if(et==null||aa==null||ia==null) throw new Error('research snapshot timestamps must be finite');
  if(et>aa+5000) throw new Error('eventTime cannot materially exceed availableAt');
  if(aa>ia+5000) throw new Error('availableAt cannot materially exceed ingestedAt');
  const ttl=Math.max(1000,Math.floor(Number(ttlMs)||15*60_000));
  const finalityValue=String(finality||'OBSERVED').toUpperCase();
  if(!FINALITY.has(finalityValue)) throw new Error('unsupported finality');
  const cleanFeatures=cleanFeatureRows(features);
  if(!cleanFeatures.length) return null;
  if(cleanFeatures.length>128) throw new Error('too many features in one snapshot');
  const q=cleanQuality(quality);
  const prov=cleanProvenance(provenance);
  const sid=sourceEventId
    ?nonEmpty(sourceEventId,'sourceEventId',200)
    :sha256({
      streamKey:sk,
      domain:dm,
      source:src,
      sourceVersion:srcVersion,
      eventTime:et,
      availableAt:aa,
      features:cleanFeatures,
      provenance:prov
    });
  return Object.freeze({
    streamKey:sk,
    domain:dm,
    source:src,
    sourceVersion:srcVersion,
    sourceEventId:sid,
    eventTime:et,
    availableAt:aa,
    validUntil:aa+ttl,
    ingestedAt:ia,
    finality:finalityValue,
    quality:q,
    features:Object.freeze(cleanFeatures),
    provenance:Object.freeze(prov)
  });
}

export function validateResearchDataRecord(record){
  const errors=[];
  if(record?.schemaVersion!==RESEARCH_DATA_PLANE_SCHEMA_VERSION) errors.push('SCHEMA_VERSION');
  if(record?.version!==RESEARCH_DATA_PLANE_VERSION) errors.push('VERSION');
  if(record?.recordType!=='FEATURE_SNAPSHOT') errors.push('RECORD_TYPE');
  if(!Number.isInteger(Number(record?.seq))||Number(record.seq)<1) errors.push('SEQ');
  if(typeof record?.prevHash!=='string'||!/^[a-f0-9]{64}$/i.test(record.prevHash)) errors.push('PREV_HASH');
  if(!String(record?.streamKey||'').trim()) errors.push('STREAM_KEY');
  if(!String(record?.domain||'').trim()) errors.push('DOMAIN');
  if(!String(record?.source||'').trim()) errors.push('SOURCE');
  if(!String(record?.sourceEventId||'').trim()) errors.push('SOURCE_EVENT_ID');

  const et=finite(record?.eventTime);
  const aa=finite(record?.availableAt);
  const vu=finite(record?.validUntil);
  const ia=finite(record?.ingestedAt);
  if(et==null) errors.push('EVENT_TIME');
  if(aa==null) errors.push('AVAILABLE_AT');
  if(vu==null) errors.push('VALID_UNTIL');
  if(ia==null) errors.push('INGESTED_AT');
  if(et!=null&&aa!=null&&et>aa+5000) errors.push('EVENT_AFTER_AVAILABLE');
  if(aa!=null&&ia!=null&&aa>ia+5000) errors.push('AVAILABLE_AFTER_INGEST');
  if(aa!=null&&vu!=null&&vu<aa) errors.push('VALID_UNTIL_BEFORE_AVAILABLE');

  if(!FINALITY.has(String(record?.finality||''))) errors.push('FINALITY');
  const completeness=finite(record?.quality?.completeness);
  if(completeness==null||completeness<0||completeness>1) errors.push('QUALITY_COMPLETENESS');

  if(record?.governance!=null){
    const decision=String(record.governance?.decision||'');
    if(!['ACCEPT','DEGRADED','QUARANTINE','REJECT'].includes(decision)) errors.push('GOVERNANCE_DECISION');
    const sourceKey=String(record.governance?.sourceKey||'');
    if(sourceKey!==String(record?.domain||'')+':'+String(record?.source||'')) errors.push('GOVERNANCE_SOURCE_KEY');
    if(record.governance?.canExecute!==false) errors.push('GOVERNANCE_EXECUTION_INVARIANT');
    if(record.governance?.usableForResearch!=null&&typeof record.governance.usableForResearch!=='boolean') errors.push('GOVERNANCE_USABILITY');
  }

  const features=Array.isArray(record?.features)?record.features:[];
  if(!features.length||features.length>128) errors.push('FEATURES');
  const ids=new Set();
  for(const row of features){
    if(!String(row?.id||'').trim()||finite(row?.value)==null) errors.push('FEATURE_INVALID');
    if(ids.has(String(row?.id))) errors.push('FEATURE_DUPLICATE');
    ids.add(String(row?.id));
  }

  const expectedPayloadHash=sha256(payloadCore(record));
  if(record?.payloadHash!==expectedPayloadHash) errors.push('PAYLOAD_HASH');
  if(record?.recordHash!==hashResearchDataRecord(record)) errors.push('RECORD_HASH');
  return {ok:errors.length===0,errors};
}

export async function openResearchDataPlane(filePath,{
  maxInMemoryRecords=50000,
  warnBytes=120*1024*1024,
  hardBytes=160*1024*1024
}={}){
  await mkdir(path.dirname(filePath),{recursive:true});
  const keep=Math.max(1000,Math.floor(Number(maxInMemoryRecords)||50000));
  const retained=new Array(keep);
  let total=0,retainedCount=0,ringPos=0;
  let prev=GENESIS,expectedSeq=1,healthy=true,error=null;
  const countsByDomain={},countsBySource={},countsByFinality={};
  const sourcePayload=new Map();
  let fileBytes=0;
  const persistedAnchor=await loadResearchDataPlaneAnchor(filePath);
  let anchorMode='GENESIS';
  let legacyAnchorRecovered=false;
  let firstRetainedSeq=null;
  let firstRetainedPrevHash=null;
  let firstRetainedRecordHash=null;
  let firstRecord=true;

  try{
    const info=await stat(filePath);
    fileBytes=Number(info.size||0);
    const input=createReadStream(filePath,{encoding:'utf8'});
    const rl=readline.createInterface({input,crlfDelay:Infinity});
    for await(const line of rl){
      if(!line.trim()) continue;
      let record;
      try{record=JSON.parse(line);}
      catch(err){
        healthy=false;
        error='RDP_PARSE_FAILURE:'+String(err instanceof Error?err.message:err);
        break;
      }
      const shape=validateResearchDataRecord(record);
      if(!shape.ok){
        healthy=false;
        error='RDP_RECORD_INVALID:'+shape.errors.join(',');
        break;
      }

      if(firstRecord){
        firstRecord=false;
        firstRetainedSeq=Number(record.seq);
        firstRetainedPrevHash=String(record.prevHash);
        firstRetainedRecordHash=String(record.recordHash);
        if(firstRetainedSeq===1&&firstRetainedPrevHash===GENESIS){
          expectedSeq=1;
          prev=GENESIS;
          anchorMode='GENESIS';
        }else if(
          persistedAnchor&&
          firstRetainedSeq===persistedAnchor.firstSeq&&
          firstRetainedPrevHash===persistedAnchor.anchorPrevHash&&
          firstRetainedRecordHash===persistedAnchor.firstRecordHash
        ){
          expectedSeq=firstRetainedSeq;
          prev=firstRetainedPrevHash;
          anchorMode='CHECKPOINT';
        }else if(!persistedAnchor&&firstRetainedSeq>1&&validHash(firstRetainedPrevHash)){
          // One-time migration for files produced by the legacy tail-copy compactor.
          // We only accept the existing first record as an anchor; every record
          // after it still has to pass full record/hash/sequence validation.
          expectedSeq=firstRetainedSeq;
          prev=firstRetainedPrevHash;
          anchorMode='LEGACY_RECOVERY';
          legacyAnchorRecovered=true;
        }else{
          healthy=false;
          error='RDP_COMPACTION_ANCHOR_MISMATCH:'+firstRetainedSeq;
          break;
        }
      }

      if(Number(record.seq)!==expectedSeq){
        healthy=false;
        error='RDP_SEQ_GAP:'+record.seq+':'+expectedSeq;
        break;
      }
      if(record.prevHash!==prev){
        healthy=false;
        error='RDP_PREV_HASH_MISMATCH:'+record.seq;
        break;
      }
      const sourceKey=record.streamKey+'\u0000'+record.domain+'\u0000'+record.source+'\u0000'+record.sourceEventId;
      const sourceHash=sourceEventPayloadHash(record);
      const priorSourceHash=sourcePayload.get(sourceKey);
      if(priorSourceHash&&priorSourceHash!==sourceHash){
        healthy=false;
        error='RDP_SOURCE_EVENT_ID_CONFLICT:'+record.sourceEventId;
        break;
      }
      if(!priorSourceHash) sourcePayload.set(sourceKey,sourceHash);

      prev=record.recordHash;
      expectedSeq++;
      total++;
      countsByDomain[record.domain]=(countsByDomain[record.domain]||0)+1;
      countsBySource[record.source]=(countsBySource[record.source]||0)+1;
      countsByFinality[record.finality]=(countsByFinality[record.finality]||0)+1;
      if(retainedCount<keep){
        retained[retainedCount++]=record;
      }else{
        retained[ringPos]=record;
        ringPos=(ringPos+1)%keep;
      }
    }
  }catch(err){
    if(err?.code!=='ENOENT'){
      healthy=false;
      error='RDP_READ_FAILURE:'+String(err instanceof Error?err.message:err);
    }
  }

  if(
    healthy&&
    legacyAnchorRecovered&&
    firstRetainedSeq!=null&&
    firstRetainedPrevHash&&
    firstRetainedRecordHash
  ){
    try{
      await saveResearchDataPlaneAnchor(filePath,{
        firstSeq:firstRetainedSeq,
        anchorPrevHash:firstRetainedPrevHash,
        firstRecordHash:firstRetainedRecordHash,
        reason:'LEGACY_TAIL_COMPACTION_RECOVERY'
      });
    }catch(err){
      healthy=false;
      error='RDP_ANCHOR_RECOVERY_WRITE_FAILED:'+String(err instanceof Error?err.message:err);
    }
  }

  let records;
  if(total<=keep){
    records=retained.slice(0,retainedCount);
  }else{
    records=[...retained.slice(ringPos),...retained.slice(0,ringPos)];
  }

  const dedupe=new Set(records.map(dedupeKey));

  const hard=Math.max(8*1024*1024,Number(hardBytes)||160*1024*1024);
  const warn=Math.min(hard,Math.max(4*1024*1024,Number(warnBytes)||120*1024*1024));
  return {
    version:RESEARCH_DATA_PLANE_VERSION,
    filePath,
    healthy,
    error,
    seq:healthy?expectedSeq-1:0,
    tailHash:healthy?prev:GENESIS,
    totalRecords:healthy?total:0,
    records:healthy?records:[],
    maxInMemoryRecords:keep,
    dedupe:healthy?dedupe:new Set(),
    sourcePayload:healthy?sourcePayload:new Map(),
    countsByDomain:healthy?countsByDomain:{},
    countsBySource:healthy?countsBySource:{},
    countsByFinality:healthy?countsByFinality:{},
    anchorMode:healthy?anchorMode:'INVALID',
    compactedHead:healthy&&firstRetainedSeq!=null&&firstRetainedSeq>1,
    legacyAnchorRecovered:healthy&&legacyAnchorRecovered,
    firstRetainedSeq:healthy?firstRetainedSeq:null,
    anchor:persistedAnchor,
    fileBytes,
    warnBytes:warn,
    hardBytes:hard,
    capacityState:fileBytes>=hard?'WRITE_BLOCKED':fileBytes>=warn?'NEAR_LIMIT':'NORMAL'
  };
}

export function preflightResearchDataPlaneInputs(plane,inputs,{conflictPolicy='THROW'}={}){
  if(!plane?.healthy) throw new Error('Research Data Plane unhealthy: fail closed');
  const novel=[];
  const conflicts=[];
  let duplicates=0;
  const localSourcePayload=new Map();
  const policy=String(conflictPolicy||'THROW').toUpperCase();

  for(const input of Array.isArray(inputs)?inputs:[]){
    if(!input) continue;
    const sourceKey=String(input.streamKey)+'\u0000'+String(input.domain)+'\u0000'+String(input.source)+'\u0000'+String(input.sourceEventId);
    const payloadHash=sourceEventPayloadHash(input);
    const priorPayload=plane.sourcePayload.get(sourceKey)||localSourcePayload.get(sourceKey);
    if(priorPayload){
      if(priorPayload!==payloadHash){
        const conflict=Object.freeze({
          streamKey:String(input.streamKey||''),
          domain:String(input.domain||''),
          source:String(input.source||''),
          sourceEventId:String(input.sourceEventId||'')
        });
        if(policy==='SKIP'){
          conflicts.push(conflict);
          continue;
        }
        throw new Error('SOURCE_EVENT_ID_CONFLICT:'+String(input.sourceEventId));
      }
      duplicates++;
      continue;
    }
    localSourcePayload.set(sourceKey,payloadHash);
    novel.push(input);
  }

  return Object.freeze({
    novel:Object.freeze(novel),
    duplicates,
    conflicts:Object.freeze(conflicts)
  });
}

async function appendResearchDataPlaneUnlocked(plane,inputs){
  if(!plane?.healthy) throw new Error('Research Data Plane unhealthy: fail closed');
  if(!Array.isArray(inputs)||!inputs.length) return {appended:[],duplicates:0};
  const prepared=[];
  let seq=plane.seq;
  let prev=plane.tailHash;
  let duplicates=0;
  const localDedupe=new Set();
  const localSourcePayload=new Map();

  for(const input of inputs){
    if(!input) continue;
    const core=recordCore({seq:seq+1,prevHash:prev,input});
    const record={...core,recordHash:sha256(core)};
    const shape=validateResearchDataRecord(record);
    if(!shape.ok) throw new Error('Invalid research data record: '+shape.errors.join(','));
    const key=dedupeKey(record);
    const sourceKey=record.streamKey+'\u0000'+record.domain+'\u0000'+record.source+'\u0000'+record.sourceEventId;
    const sourcePayloadHash=sourceEventPayloadHash(record);
    const priorPayload=plane.sourcePayload.get(sourceKey)||localSourcePayload.get(sourceKey);
    if(priorPayload){
      if(priorPayload!==sourcePayloadHash){
        throw new Error('SOURCE_EVENT_ID_CONFLICT:'+record.sourceEventId);
      }
      duplicates++;
      continue;
    }
    if(plane.dedupe.has(key)||localDedupe.has(key)){
      duplicates++;
      continue;
    }
    prepared.push({record,key,sourceKey});
    localDedupe.add(key);
    localSourcePayload.set(sourceKey,sourcePayloadHash);
    seq=record.seq;
    prev=record.recordHash;
  }
  if(!prepared.length) return {appended:[],duplicates};

  const data=prepared.map(x=>canonicalJson(x.record)+'\n').join('');
  const bytes=Buffer.byteLength(data);
  if(plane.fileBytes+bytes>plane.hardBytes){
    plane.capacityState='WRITE_BLOCKED';
    throw new Error('RDP_CAPACITY_LIMIT');
  }

  let fh;
  try{
    fh=await openFile(plane.filePath,'a',0o600);
    await fh.write(data,null,'utf8');
    await fh.sync();
  }catch(err){
    plane.healthy=false;
    plane.error='RDP_APPEND_FAILURE:'+String(err instanceof Error?err.message:err);
    throw err;
  }finally{
    if(fh) await fh.close();
  }

  for(const {record,key,sourceKey} of prepared){
    plane.seq=record.seq;
    plane.tailHash=record.recordHash;
    plane.totalRecords++;
    plane.fileBytes+=Buffer.byteLength(canonicalJson(record)+'\n');
    plane.dedupe.add(key);
    plane.sourcePayload.set(sourceKey,sourceEventPayloadHash(record));
    plane.records.push(record);
    if(plane.records.length>plane.maxInMemoryRecords){
      const removed=plane.records.shift();
      plane.dedupe.delete(dedupeKey(removed));
    }
    plane.countsByDomain[record.domain]=(plane.countsByDomain[record.domain]||0)+1;
    plane.countsBySource[record.source]=(plane.countsBySource[record.source]||0)+1;
    plane.countsByFinality[record.finality]=(plane.countsByFinality[record.finality]||0)+1;
  }
  plane.capacityState=plane.fileBytes>=plane.hardBytes?'WRITE_BLOCKED':plane.fileBytes>=plane.warnBytes?'NEAR_LIMIT':'NORMAL';
  return {appended:prepared.map(x=>x.record),duplicates};
}

export async function appendResearchDataPlane(plane,inputs){
  if(!plane?.filePath) return appendResearchDataPlaneUnlocked(plane,inputs);
  return withResearchDataPlaneMutationLock(
    plane.filePath,
    ()=>appendResearchDataPlaneUnlocked(plane,inputs)
  );
}

export function researchFeaturesAsOf(plane,{
  streamKey,
  asOf,
  domains=null,
  minCompleteness=0,
  requireGoverned=false,
  blockedSourceKeys=[]
}={}){
  if(!plane?.healthy) return {
    ok:false,
    reason:'RDP_UNHEALTHY',
    features:[],
    planeSeq:Number(plane?.seq||0),
    tailHash:String(plane?.tailHash||GENESIS)
  };
  const sk=String(streamKey||'').toUpperCase();
  const t=finite(asOf);
  if(!sk||t==null) throw new Error('streamKey and asOf required');
  const allowed=Array.isArray(domains)&&domains.length?new Set(domains.map(x=>String(x).toUpperCase())):null;
  const threshold=Math.max(0,Math.min(1,Number(minCompleteness)||0));
  const blocked=new Set((Array.isArray(blockedSourceKeys)?blockedSourceKeys:[]).map(String));
  const found=new Map();
  let recordsConsidered=0;
  for(let i=plane.records.length-1;i>=0;i--){
    const record=plane.records[i];
    if(record.streamKey!==sk) continue;
    if(allowed&&!allowed.has(record.domain)) continue;
    if(record.availableAt>t||record.validUntil<t) continue;
    if(Number(record.quality?.completeness||0)<threshold) continue;
    const governance=record.governance||null;
    if(requireGoverned&&!governance) continue;
    if(governance&&['QUARANTINE','REJECT'].includes(String(governance.decision||''))) continue;
    if(governance?.usableForResearch===false) continue;
    const sourceKey=governance?.sourceKey||String(record.domain)+':'+String(record.source);
    if(blocked.has(sourceKey)) continue;
    recordsConsidered++;
    for(const row of record.features){
      if(found.has(row.id)) continue;
      found.set(row.id,Object.freeze({
        id:row.id,
        value:Number(row.value),
        availableAt:Number(record.availableAt),
        source:'RDP:'+record.domain+':'+record.source,
        domain:record.domain,
        finality:record.finality,
        completeness:Number(record.quality.completeness),
        planeSeq:Number(record.seq),
        planeRecordHash:record.recordHash,
        sourceEventId:record.sourceEventId,
        governanceDecision:record.governance?.decision||'LEGACY_UNGOVERNED',
        governanceVersion:record.governance?.version||null,
        governanceSourceStatus:record.governance?.sourceStatus||null
      }));
    }
  }
  const features=[...found.values()].sort((a,b)=>a.id.localeCompare(b.id));
  let earliestRetainedAvailableAt=null;
  for(const record of plane.records){
    const at=finite(record?.availableAt);
    if(at==null) continue;
    earliestRetainedAvailableAt=earliestRetainedAvailableAt==null?at:Math.min(earliestRetainedAvailableAt,at);
  }
  return Object.freeze({
    ok:true,
    streamKey:sk,
    asOf:t,
    features:Object.freeze(features),
    recordsConsidered,
    planeSeq:Number(plane.seq),
    tailHash:String(plane.tailHash),
    inMemoryRecords:plane.records.length,
    totalRecords:Number(plane.totalRecords),
    earliestRetainedAvailableAt
  });
}

export function researchDataPlaneSummary(plane){
  return {
    version:RESEARCH_DATA_PLANE_VERSION,
    healthy:plane?.healthy===true,
    error:plane?.error||null,
    filePath:String(plane?.filePath||''),
    seq:Number(plane?.seq||0),
    tailHash:String(plane?.tailHash||GENESIS),
    totalRecords:Number(plane?.totalRecords||0),
    inMemoryRecords:Array.isArray(plane?.records)?plane.records.length:0,
    maxInMemoryRecords:Number(plane?.maxInMemoryRecords||0),
    fileBytes:Number(plane?.fileBytes||0),
    warnBytes:Number(plane?.warnBytes||0),
    hardBytes:Number(plane?.hardBytes||0),
    capacityState:String(plane?.capacityState||'UNKNOWN'),
    countsByDomain:{...(plane?.countsByDomain||{})},
    countsBySource:{...(plane?.countsBySource||{})},
    countsByFinality:{...(plane?.countsByFinality||{})},
    anchorMode:String(plane?.anchorMode||'UNKNOWN'),
    compactedHead:plane?.compactedHead===true,
    legacyAnchorRecovered:plane?.legacyAnchorRecovered===true,
    firstRetainedSeq:Number.isFinite(Number(plane?.firstRetainedSeq))?Number(plane.firstRetainedSeq):null
  };
}
