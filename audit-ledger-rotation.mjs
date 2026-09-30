import path from 'node:path';
import { createReadStream, createWriteStream } from 'node:fs';
import { open, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import readline from 'node:readline';
import { createHash } from 'node:crypto';
import { Transform } from 'node:stream';
import { createGzip, createGunzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import {
  AUDIT_LEDGER_CHECKPOINT_VERSION,
  canonicalJson,
  hashLedgerRecord,
  sha256
} from './institutional-kernel.mjs';

export const AUDIT_LEDGER_ROTATION_VERSION='TCX_AUDIT_LEDGER_ROTATION_V1';
const GENESIS='0'.repeat(64);

function checkpointCore(value){
  const core={...value};
  delete core.fingerprint;
  return core;
}

function withFingerprint(core){
  return {...core,fingerprint:sha256(core)};
}

async function atomicJson(file,value){
  const tmp=file+'.tmp';
  await unlink(tmp).catch(err=>{if(err?.code!=='ENOENT')throw err;});
  await writeFile(tmp,canonicalJson(value)+'\n',{encoding:'utf8',flag:'w'});
  const fh=await open(tmp,'r');
  try{await fh.sync();}finally{await fh.close();}
  await rename(tmp,file);
}

export async function readAuditLedgerCheckpoint(filePath){
  try{
    const value=JSON.parse(await readFile(filePath+'.checkpoint.json','utf8'));
    if(value?.version!==AUDIT_LEDGER_CHECKPOINT_VERSION) throw new Error('AUDIT_LEDGER_CHECKPOINT_VERSION_UNSUPPORTED');
    if(value?.fingerprint!==sha256(checkpointCore(value))) throw new Error('AUDIT_LEDGER_CHECKPOINT_FINGERPRINT_MISMATCH');
    return value;
  }catch(err){
    if(err?.code==='ENOENT') return null;
    throw err;
  }
}

async function hashFile(file){
  const h=createHash('sha256');
  let bytes=0;
  for await(const chunk of createReadStream(file)){
    h.update(chunk);
    bytes+=chunk.length;
  }
  return {bytes,sha256:h.digest('hex')};
}

async function verifyRawSegment(file,{
  anchorSeq=0,
  anchorTailHash=GENESIS,
  expectedLastSeq=null,
  expectedTailHash=null
}={}){
  const h=createHash('sha256');
  let bytes=0;
  const input=createReadStream(file,{encoding:'utf8'});
  input.on('data',chunk=>{
    const b=Buffer.from(chunk,'utf8');
    bytes+=b.length;
    h.update(b);
  });
  const rl=readline.createInterface({input,crlfDelay:Infinity});
  let expectedSeq=Number(anchorSeq)+1;
  let prev=String(anchorTailHash||GENESIS);
  let firstSeq=null;
  let count=0;
  for await(const line of rl){
    if(!line.trim())continue;
    const record=JSON.parse(line);
    if(Number(record.seq)!==expectedSeq) throw new Error('AUDIT_ROTATION_SEQ_GAP');
    if(String(record.prevHash)!==prev) throw new Error('AUDIT_ROTATION_PREV_HASH_MISMATCH');
    if(String(record.payloadHash)!==sha256(record.payload)) throw new Error('AUDIT_ROTATION_PAYLOAD_HASH_MISMATCH');
    if(String(record.recordHash)!==hashLedgerRecord(record)) throw new Error('AUDIT_ROTATION_RECORD_HASH_MISMATCH');
    if(firstSeq==null)firstSeq=Number(record.seq);
    prev=String(record.recordHash);
    expectedSeq++;
    count++;
  }
  if(count===0) return {ok:true,count:0,firstSeq:null,lastSeq:Number(anchorSeq),tailHash:prev,bytes,rawSha256:h.digest('hex')};
  const lastSeq=expectedSeq-1;
  if(expectedLastSeq!=null&&lastSeq!==Number(expectedLastSeq)) throw new Error('AUDIT_ROTATION_LAST_SEQ_MISMATCH');
  if(expectedTailHash!=null&&prev!==String(expectedTailHash)) throw new Error('AUDIT_ROTATION_TAIL_HASH_MISMATCH');
  return {ok:true,count,firstSeq,lastSeq,tailHash:prev,bytes,rawSha256:h.digest('hex')};
}

function serializeIdentities(index){
  return [...(index?.values?.()||[])].map(row=>({
    seq:Number(row.seq),
    recordHash:String(row.recordHash||''),
    occurredAt:Number(row.occurredAt),
    kind:String(row.kind||''),
    idField:String(row.idField||''),
    id:String(row.id||'')
  })).sort((a,b)=>a.seq-b.seq||a.kind.localeCompare(b.kind)||a.id.localeCompare(b.id));
}

async function compressVerifiedRaw(raw,gzipPath,expected){
  const tmp=gzipPath+'.tmp';
  await unlink(tmp).catch(err=>{if(err?.code!=='ENOENT')throw err;});
  const h=createHash('sha256');
  let rawBytes=0;
  const audit=new Transform({
    transform(chunk,_enc,cb){
      rawBytes+=chunk.length;
      h.update(chunk);
      cb(null,chunk);
    }
  });
  await pipeline(
    createReadStream(raw),
    audit,
    createGzip({level:9}),
    createWriteStream(tmp,{flags:'wx'})
  );
  const fh=await open(tmp,'r');
  try{await fh.sync();}finally{await fh.close();}
  const rawSha256=h.digest('hex');
  if(rawBytes!==Number(expected.bytes)||rawSha256!==String(expected.rawSha256)){
    await unlink(tmp).catch(()=>{});
    throw new Error('AUDIT_ROTATION_GZIP_RAW_AUDIT_MISMATCH');
  }
  const compressed=await hashFile(tmp);
  await rename(tmp,gzipPath);
  return {rawBytes,rawSha256,compressedBytes:compressed.bytes,compressedSha256:compressed.sha256};
}

function segmentChainOk(segments){
  let seq=0,tail=GENESIS;
  for(const item of Array.isArray(segments)?segments:[]){
    if(Number(item.anchorSeq)!==seq) return false;
    if(String(item.anchorTailHash)!==tail) return false;
    if(Number(item.firstSeq)!==seq+1) return false;
    if(Number(item.lastSeq)<Number(item.firstSeq)) return false;
    seq=Number(item.lastSeq);
    tail=String(item.tailHash);
  }
  return true;
}

export async function verifyAuditLedgerArchive(filePath,{verifyRawContent=true}={}){
  const checkpoint=await readAuditLedgerCheckpoint(filePath);
  if(!checkpoint) return {ok:true,segments:0,lastSeq:0,tailHash:GENESIS};
  const segments=Array.isArray(checkpoint.archivedSegments)?checkpoint.archivedSegments:[];
  if(!segmentChainOk(segments)) return {ok:false,error:'AUDIT_ARCHIVE_SEGMENT_CHAIN_INVALID',segments:segments.length};
  for(const item of segments){
    const local=path.join(path.dirname(filePath),String(item.name||item.sourceName||''));
    let meta;
    try{meta=await stat(local);}catch(err){
      return {ok:false,error:'AUDIT_ARCHIVE_SEGMENT_MISSING',segment:item.name||item.sourceName,detail:err instanceof Error?err.message:String(err)};
    }
    if(String(item.codec)==='gzip'){
      if(meta.size!==Number(item.compressedBytes)) return {ok:false,error:'AUDIT_ARCHIVE_COMPRESSED_BYTES_MISMATCH',segment:item.name};
      const compressed=await hashFile(local);
      if(compressed.sha256!==String(item.compressedSha256)) return {ok:false,error:'AUDIT_ARCHIVE_COMPRESSED_HASH_MISMATCH',segment:item.name};
      if(verifyRawContent){
        const h=createHash('sha256');let bytes=0;
        const audit=new Transform({transform(chunk,_enc,cb){bytes+=chunk.length;h.update(chunk);cb(null,chunk);}});
        await pipeline(createReadStream(local),createGunzip(),audit,new Transform({transform(_c,_e,cb){cb();}}));
        if(bytes!==Number(item.rawBytes)||h.digest('hex')!==String(item.rawSha256)){
          return {ok:false,error:'AUDIT_ARCHIVE_RAW_HASH_MISMATCH',segment:item.name};
        }
      }
    }else{
      const raw=await hashFile(local);
      if(raw.bytes!==Number(item.rawBytes)||raw.sha256!==String(item.rawSha256)){
        return {ok:false,error:'AUDIT_ARCHIVE_RAW_HASH_MISMATCH',segment:item.name};
      }
    }
  }
  const last=segments[segments.length-1]||null;
  if(last&&(Number(last.lastSeq)!==Number(checkpoint.seq)||String(last.tailHash)!==String(checkpoint.tailHash))){
    return {ok:false,error:'AUDIT_ARCHIVE_CHECKPOINT_TAIL_MISMATCH',segments:segments.length};
  }
  return {ok:true,segments:segments.length,lastSeq:Number(checkpoint.seq||0),tailHash:String(checkpoint.tailHash||GENESIS)};
}

export async function rotateVerifiedAuditLedger({
  ledger,
  rotateBytes,
  coldStore=null,
  now=Date.now()
}={}){
  if(!ledger?.healthy) return {rotated:false,reason:'LEDGER_UNHEALTHY'};
  const threshold=Math.max(1,Number(rotateBytes)||Math.floor(Number(ledger.maxFileBytes||64*1024*1024)*0.75));
  if(Number(ledger.fileBytes||0)<threshold) return {rotated:false,reason:'BELOW_LIMIT',bytes:Number(ledger.fileBytes||0),threshold};

  const filePath=String(ledger.filePath||'');
  const checkpoint=await readAuditLedgerCheckpoint(filePath);
  const anchorSeq=Number(checkpoint?.seq||0);
  const anchorTailHash=String(checkpoint?.tailHash||GENESIS);
  const verified=await verifyRawSegment(filePath,{
    anchorSeq,
    anchorTailHash,
    expectedLastSeq:ledger.seq,
    expectedTailHash:ledger.tailHash
  });
  if(!verified.count) return {rotated:false,reason:'EMPTY_ACTIVE_SEGMENT'};

  const segmentName=path.basename(filePath)+'.segment-'+verified.firstSeq+'-'+verified.lastSeq+'-'+String(now)+'.jsonl';
  const rawSegment=path.join(path.dirname(filePath),segmentName);
  await rename(filePath,rawSegment);

  const descriptor={
    sourceName:segmentName,
    name:segmentName,
    codec:'raw',
    anchorSeq,
    anchorTailHash,
    firstSeq:verified.firstSeq,
    lastSeq:verified.lastSeq,
    tailHash:verified.tailHash,
    rawBytes:verified.bytes,
    rawSha256:verified.rawSha256,
    createdAt:Number(now)
  };
  const priorSegments=Array.isArray(checkpoint?.archivedSegments)?checkpoint.archivedSegments:[];
  const checkpointValue=withFingerprint({
    version:AUDIT_LEDGER_CHECKPOINT_VERSION,
    createdAt:Number(now),
    seq:Number(ledger.seq),
    tailHash:String(ledger.tailHash),
    totalRecords:Number(ledger.totalRecords||ledger.seq||0),
    identities:serializeIdentities(ledger.identityIndex),
    retainedRecords:[...(ledger.records||[])],
    archivedSegments:[...priorSegments,descriptor]
  });
  try{
    await atomicJson(filePath+'.checkpoint.json',checkpointValue);
  }catch(err){
    await rename(rawSegment,filePath).catch(()=>{});
    throw err;
  }

  ledger.fileBytes=0;
  ledger.writeBlocked=false;
  ledger.archiveCheckpoint=checkpointValue;
  ledger.verification={
    ok:true,
    count:Number(ledger.totalRecords||ledger.seq||0),
    tailHash:String(ledger.tailHash),
    lastSeq:Number(ledger.seq),
    retainedRecords:Array.isArray(ledger.records)?ledger.records.length:0,
    archivedSegments:checkpointValue.archivedSegments.length
  };

  let archiveError=null;
  let finalDescriptor=descriptor;
  try{
    const gzipName=segmentName+'.gz';
    const gzipPath=path.join(path.dirname(filePath),gzipName);
    const packed=await compressVerifiedRaw(rawSegment,gzipPath,verified);
    finalDescriptor={...descriptor,name:gzipName,codec:'gzip',...packed,compressedAt:Date.now()};
    let nextCheckpoint=withFingerprint({
      ...checkpointCore(checkpointValue),
      archivedSegments:[...priorSegments,finalDescriptor]
    });
    await atomicJson(filePath+'.checkpoint.json',nextCheckpoint);
    ledger.archiveCheckpoint=nextCheckpoint;
    await unlink(rawSegment);

    if(coldStore?.enabled){
      const cold=await coldStore.putVerifiedSegment({item:finalDescriptor,localPath:gzipPath});
      finalDescriptor={...finalDescriptor,cold};
      nextCheckpoint=withFingerprint({
        ...checkpointCore(nextCheckpoint),
        archivedSegments:[...priorSegments,finalDescriptor]
      });
      await atomicJson(filePath+'.checkpoint.json',nextCheckpoint);
      ledger.archiveCheckpoint=nextCheckpoint;
    }
  }catch(err){
    archiveError=err instanceof Error?err.message:String(err);
  }

  return {
    rotated:true,
    version:AUDIT_LEDGER_ROTATION_VERSION,
    firstSeq:verified.firstSeq,
    lastSeq:verified.lastSeq,
    tailHash:verified.tailHash,
    archivedBytes:verified.bytes,
    segment:finalDescriptor.name,
    codec:finalDescriptor.codec,
    cold:finalDescriptor.cold||null,
    archiveError
  };
}
