import path from 'node:path';
import { stat, rename, writeFile, readFile, unlink, open } from 'node:fs/promises';
import { sha256, canonicalJson } from './institutional-kernel.mjs';
export const MARKET_FABRIC_ROTATION_VERSION='TCX_MARKET_FABRIC_ROTATION_V3';

async function durableReplaceJson(target,value){
 const tmp=target+'.tmp';
 await writeFile(tmp,canonicalJson(value)+'\n',{encoding:'utf8',flag:'w'});
 await rename(tmp,target);
}

async function readLastMarketEvent(filePath){
 const fh=await open(filePath,'r');
 try{
  const meta=await fh.stat();
  if(meta.size<=0) return null;
  let pos=meta.size,carry=Buffer.alloc(0);
  while(pos>0&&carry.length<=4*1024*1024){
   const len=Math.min(64*1024,pos);pos-=len;
   const chunk=Buffer.allocUnsafe(len);
   await fh.read(chunk,0,len,pos);
   carry=Buffer.concat([chunk,carry]);
   const lines=carry.toString('utf8').split('\n').filter(Boolean);
   if(pos===0||lines.length>=2){
    const raw=lines[lines.length-1];
    try{return JSON.parse(raw);}catch{}
   }
  }
  throw new Error('MARKET_FABRIC_ROTATION_LAST_EVENT_UNREADABLE');
 }finally{await fh.close();}
}

function verifyArchiveManifestForRecovery(value){
 if(!value||!Array.isArray(value.segments)||!value.fingerprint) throw new Error('MARKET_FABRIC_ARCHIVE_MANIFEST_INVALID');
 const core={version:value.version,segments:value.segments};
 if(sha256(core)!==value.fingerprint) throw new Error('MARKET_FABRIC_ARCHIVE_MANIFEST_FINGERPRINT_MISMATCH');
 return value;
}

export async function reconcileMarketFabricCheckpointFromArchive(filePath){
 const checkpoint=await readMarketFabricCheckpoint(filePath);
 if(!checkpoint) return {reconciled:false,reason:'NO_CHECKPOINT'};
 try{
  const active=await stat(filePath);
  if(active.size>0) return {reconciled:false,reason:'ACTIVE_FILE_PRESENT',bytes:active.size};
 }catch(err){if(err?.code!=='ENOENT') throw err;}

 const manifestPath=filePath+'.segments-manifest.json';
 let manifest;
 try{manifest=verifyArchiveManifestForRecovery(JSON.parse(await readFile(manifestPath,'utf8')));}
 catch(err){if(err?.code==='ENOENT') return {reconciled:false,reason:'NO_ARCHIVE_MANIFEST'};throw err;}
 const item=manifest.segments.find(x=>x?.sourceName===checkpoint.archivedSegment);
 if(!item) return {reconciled:false,reason:'CHECKPOINT_SEGMENT_NOT_IN_MANIFEST'};
 const archivedLastSeq=Number(item.lastSeq);
 if(!Number.isInteger(archivedLastSeq)||archivedLastSeq<=Number(checkpoint.lastSeq||0)){
  return {reconciled:false,reason:'CHECKPOINT_CURRENT',lastSeq:Number(checkpoint.lastSeq||0)};
 }
 if(Number(item.rawBytes)!==Number(checkpoint.archivedBytes)){
  throw new Error('MARKET_FABRIC_CHECKPOINT_ARCHIVE_BYTES_MISMATCH');
 }
 if(typeof item.tailHash!=='string'||item.tailHash.length!==64){
  throw new Error('MARKET_FABRIC_CHECKPOINT_ARCHIVE_TAIL_INVALID');
 }
 const core={...checkpoint,lastSeq:archivedLastSeq,tailHash:item.tailHash};
 delete core.fingerprint;
 const repaired={...core,fingerprint:sha256(core)};
 await durableReplaceJson(filePath+'.checkpoint.json',repaired);
 return {
  reconciled:true,
  fromLastSeq:Number(checkpoint.lastSeq||0),
  toLastSeq:archivedLastSeq,
  fromTailHash:checkpoint.tailHash,
  toTailHash:item.tailHash,
  sourceName:item.sourceName,
  manifestFingerprint:manifest.fingerprint,
  checkpointFingerprint:repaired.fingerprint
 };
}
export async function rotateVerifiedMarketFabric({filePath,maxBytes=220*1024*1024,verification=null,now=Date.now()}={}){
 let meta;try{meta=await stat(filePath);}catch(e){if(e?.code==='ENOENT')return{rotated:false,reason:'MISSING'};throw e;}
 if(meta.size<maxBytes)return{rotated:false,reason:'BELOW_LIMIT',bytes:meta.size};
 if(!verification?.ok||!Number.isInteger(verification.lastSeq)||!verification.tailHash)return{rotated:false,reason:'VERIFICATION_REQUIRED',bytes:meta.size};
 const actualTail=await readLastMarketEvent(filePath);
 if(!actualTail||Number(actualTail.seq)!==Number(verification.lastSeq)||actualTail.eventHash!==verification.tailHash){
  return {
   rotated:false,
   reason:'VERIFICATION_STALE',
   bytes:meta.size,
   verificationLastSeq:Number(verification.lastSeq),
   actualLastSeq:Number(actualTail?.seq||0),
   verificationTailHash:verification.tailHash,
   actualTailHash:actualTail?.eventHash||null
  };
 }
 const prior=await readMarketFabricCheckpoint(filePath);
 const firstSeq=Number.isInteger(verification.firstSeq)?verification.firstSeq:(prior?.lastSeq??0)+1;
 const segmentId=String(firstSeq)+'-'+String(verification.lastSeq)+'-'+String(now);
 const segment=filePath+'.segment-'+segmentId+'.jsonl';
 const checkpointPath=filePath+'.checkpoint.json';
 const checkpoint={version:MARKET_FABRIC_ROTATION_VERSION,createdAt:now,segmentId,archivedSegment:path.basename(segment),archivedBytes:meta.size,firstSeq,lastSeq:verification.lastSeq,anchorPrevHash:prior?.tailHash||'GENESIS',tailHash:verification.tailHash,previousCheckpointFingerprint:prior?.fingerprint||null};
 checkpoint.fingerprint=sha256(checkpoint);
 await rename(filePath,segment);
 try{await durableReplaceJson(checkpointPath,checkpoint);}
 catch(err){await rename(segment,filePath).catch(()=>{});throw err;}
 return{rotated:true,segment,checkpointPath,...checkpoint};
}
export async function readMarketFabricCheckpoint(filePath){
 const target=filePath+'.checkpoint.json',tmp=target+'.tmp';
 try{await stat(tmp);await unlink(tmp).catch(()=>{});}catch(e){if(e?.code!=='ENOENT')throw e;}
 try{const x=JSON.parse(await readFile(target,'utf8')),fp=x.fingerprint;const core={...x};delete core.fingerprint;if(sha256(core)!==fp)throw new Error('MARKET_FABRIC_CHECKPOINT_FINGERPRINT_MISMATCH');return{...core,fingerprint:fp};}
 catch(e){if(e?.code==='ENOENT')return null;throw e;}
}
