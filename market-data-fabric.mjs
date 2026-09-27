import path from 'node:path';
import { mkdir, open as openFile, readFile } from 'node:fs/promises';
import { canonicalJson, sha256 } from './institutional-kernel.mjs';

const GENESIS='0'.repeat(64);
const SCHEMA_VERSION=1;

function finite(x){ const n=Number(x); return Number.isFinite(n)?n:null; }

function eventCore({seq,prevHash,kind,streamKey,source,sourceEventId,eventTime,availableAt,ingestedAt,payload}){
  const canonicalPayload=JSON.parse(canonicalJson(payload));
  const payloadHash=sha256(canonicalPayload);
  return {
    schemaVersion:SCHEMA_VERSION,
    seq,
    prevHash,
    kind:String(kind),
    streamKey:String(streamKey),
    source:String(source),
    sourceEventId:String(sourceEventId),
    eventTime:Number(eventTime),
    availableAt:Number(availableAt),
    ingestedAt:Number(ingestedAt),
    payloadHash,
    payload:canonicalPayload
  };
}

export function hashMarketEvent(event){
  const {eventHash,...without}=event;
  return sha256(without);
}

export function validateMarketEventShape(event){
  const errors=[];
  if(event?.schemaVersion!==SCHEMA_VERSION) errors.push('SCHEMA_VERSION');
  if(!Number.isInteger(Number(event?.seq))||Number(event.seq)<1) errors.push('SEQ');
  if(typeof event?.prevHash!=='string'||event.prevHash.length!==64) errors.push('PREV_HASH');
  if(!event?.kind) errors.push('KIND');
  if(!event?.streamKey) errors.push('STREAM_KEY');
  if(!event?.source) errors.push('SOURCE');
  if(!event?.sourceEventId) errors.push('SOURCE_EVENT_ID');
  const eventTime=finite(event?.eventTime),availableAt=finite(event?.availableAt),ingestedAt=finite(event?.ingestedAt);
  if(eventTime==null) errors.push('EVENT_TIME');
  if(availableAt==null) errors.push('AVAILABLE_AT');
  if(ingestedAt==null) errors.push('INGESTED_AT');
  if(availableAt!=null&&ingestedAt!=null&&availableAt>ingestedAt+2500) errors.push('AVAILABLE_AFTER_INGEST_FUTURE');
  if(event?.payloadHash!==sha256(event?.payload)) errors.push('PAYLOAD_HASH');
  if(event?.eventHash!==hashMarketEvent(event)) errors.push('EVENT_HASH');
  return {ok:errors.length===0,errors};
}

export function verifyMarketEventChain(events){
  let prev=GENESIS;
  let seq=1;
  for(const event of events){
    const shape=validateMarketEventShape(event);
    if(!shape.ok) return {ok:false,error:shape.errors[0],seq:event?.seq,errors:shape.errors};
    if(Number(event.seq)!==seq) return {ok:false,error:'SEQ_GAP',seq:event.seq,expected:seq};
    if(event.prevHash!==prev) return {ok:false,error:'PREV_HASH_MISMATCH',seq:event.seq};
    prev=event.eventHash;
    seq++;
  }
  return {ok:true,count:events.length,lastSeq:seq-1,tailHash:prev};
}

function dedupeKeyOf(event){
  return sha256({
    kind:event.kind,
    streamKey:event.streamKey,
    source:event.source,
    sourceEventId:event.sourceEventId,
    payloadHash:event.payloadHash
  });
}

export async function openMarketDataFabric(filePath){
  await mkdir(path.dirname(filePath),{recursive:true});
  let events=[];
  try{
    const raw=await readFile(filePath,'utf8');
    const lines=raw.split(/\r?\n/).filter(Boolean);
    events=lines.map((line,i)=>{
      try{return JSON.parse(line);}
      catch{throw new Error(`Invalid market-event JSON at line ${i+1}`);}
    });
  }catch(err){
    if(err?.code!=='ENOENT'){
      return {
        filePath,healthy:false,
        verification:{ok:false,error:'FABRIC_READ_OR_PARSE_FAILURE',detail:err instanceof Error?err.message:String(err)},
        seq:0,tailHash:GENESIS,events:[],dedupe:new Set()
      };
    }
  }
  const verification=verifyMarketEventChain(events);
  return {
    filePath,
    healthy:verification.ok,
    verification,
    seq:verification.ok?verification.lastSeq:0,
    tailHash:verification.ok?verification.tailHash:GENESIS,
    events,
    dedupe:new Set(events.map(dedupeKeyOf))
  };
}

export function createMarketEventInput({
  kind,streamKey,source,sourceEventId,eventTime,availableAt=Date.now(),ingestedAt=Date.now(),payload
}){
  const et=finite(eventTime),aa=finite(availableAt),ia=finite(ingestedAt);
  if(et==null||aa==null||ia==null) throw new Error('Invalid market event timestamp');
  if(aa>ia+2500) throw new Error('availableAt cannot be materially after ingestedAt');
  return {
    kind:String(kind),streamKey:String(streamKey),source:String(source),sourceEventId:String(sourceEventId),
    eventTime:et,availableAt:aa,ingestedAt:ia,payload
  };
}

export async function appendMarketEvents(fabric,inputs){
  if(!fabric?.healthy) throw new Error('Market Data Fabric unhealthy: fail closed');
  if(!Array.isArray(inputs)||inputs.length===0) return {appended:[],duplicates:0};

  const prepared=[];
  let prev=fabric.tailHash;
  let seq=fabric.seq;
  let duplicates=0;
  const localSeen=new Set();

  for(const input of inputs){
    const core=eventCore({
      seq:seq+1,
      prevHash:prev,
      kind:input.kind,
      streamKey:input.streamKey,
      source:input.source,
      sourceEventId:input.sourceEventId,
      eventTime:input.eventTime,
      availableAt:input.availableAt,
      ingestedAt:input.ingestedAt,
      payload:input.payload
    });
    const event={...core,eventHash:sha256(core)};
    const key=dedupeKeyOf(event);
    if(fabric.dedupe.has(key)||localSeen.has(key)){
      duplicates++;
      continue;
    }
    prepared.push({event,key});
    localSeen.add(key);
    seq=event.seq;
    prev=event.eventHash;
  }

  if(!prepared.length) return {appended:[],duplicates};

  let fh;
  try{
    fh=await openFile(fabric.filePath,'a',0o600);
    const data=prepared.map(x=>canonicalJson(x.event)+'\n').join('');
    await fh.write(data,null,'utf8');
    await fh.sync();
  }catch(err){
    fabric.healthy=false;
    fabric.verification={ok:false,error:'FABRIC_APPEND_FAILURE',detail:err instanceof Error?err.message:String(err)};
    throw err;
  }finally{
    if(fh) await fh.close();
  }

  for(const {event,key} of prepared){
    fabric.events.push(event);
    fabric.dedupe.add(key);
    fabric.seq=event.seq;
    fabric.tailHash=event.eventHash;
  }

  return {appended:prepared.map(x=>x.event),duplicates};
}

export function marketFabricSummary(fabric){
  const counts={};
  for(const e of fabric?.events||[]) counts[e.kind]=(counts[e.kind]||0)+1;
  return {
    healthy:fabric?.healthy===true,
    seq:Number(fabric?.seq||0),
    tailHash:String(fabric?.tailHash||GENESIS),
    eventCount:Array.isArray(fabric?.events)?fabric.events.length:0,
    counts,
    filePath:String(fabric?.filePath||'')
  };
}

export const MARKET_DATA_FABRIC_VERSION='MDF_V1';
