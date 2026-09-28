import path from 'node:path';
import { stat, rename, writeFile, readFile, unlink } from 'node:fs/promises';
import { sha256, canonicalJson } from './institutional-kernel.mjs';
export const MARKET_FABRIC_ROTATION_VERSION='TCX_MARKET_FABRIC_ROTATION_V2';

async function durableReplaceJson(target,value){
 const tmp=target+'.tmp';
 await writeFile(tmp,canonicalJson(value)+'\n',{encoding:'utf8',flag:'w'});
 await rename(tmp,target);
}
export async function rotateVerifiedMarketFabric({filePath,maxBytes=220*1024*1024,verification=null,now=Date.now()}={}){
 let meta;try{meta=await stat(filePath);}catch(e){if(e?.code==='ENOENT')return{rotated:false,reason:'MISSING'};throw e;}
 if(meta.size<maxBytes)return{rotated:false,reason:'BELOW_LIMIT',bytes:meta.size};
 if(!verification?.ok||!Number.isInteger(verification.lastSeq)||!verification.tailHash)return{rotated:false,reason:'VERIFICATION_REQUIRED',bytes:meta.size};
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
