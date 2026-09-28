import path from 'node:path';
import { stat, rename, writeFile, readFile } from 'node:fs/promises';
import { sha256, stableStringify } from './institutional-kernel.mjs';
export const MARKET_FABRIC_ROTATION_VERSION='TCX_MARKET_FABRIC_ROTATION_V1';
export async function rotateVerifiedMarketFabric({filePath,maxBytes=220*1024*1024,verification=null,now=Date.now()}={}){
 let meta;try{meta=await stat(filePath);}catch(e){if(e?.code==='ENOENT')return{rotated:false,reason:'MISSING'};throw e;}
 if(meta.size<maxBytes)return{rotated:false,reason:'BELOW_LIMIT',bytes:meta.size};
 if(!verification?.ok||!Number.isInteger(verification.lastSeq)||!verification.tailHash) return{rotated:false,reason:'VERIFICATION_REQUIRED',bytes:meta.size};
 const segment=`${filePath}.segment-${verification.lastSeq}-${now}.jsonl`;
 const checkpointPath=`${filePath}.checkpoint.json`;
 const checkpoint={version:MARKET_FABRIC_ROTATION_VERSION,createdAt:now,archivedSegment:path.basename(segment),archivedBytes:meta.size,lastSeq:verification.lastSeq,tailHash:verification.tailHash};
 checkpoint.fingerprint=sha256(checkpoint);
 await rename(filePath,segment);
 try{await writeFile(checkpointPath,stableStringify(checkpoint)+'\n',{encoding:'utf8',flag:'wx'});}
 catch(err){await rename(segment,filePath);throw err;}
 return{rotated:true,segment,checkpointPath,...checkpoint};
}
export async function readMarketFabricCheckpoint(filePath){
 try{const x=JSON.parse(await readFile(`${filePath}.checkpoint.json`,'utf8'));const fp=x.fingerprint;delete x.fingerprint;if(sha256(x)!==fp)throw new Error('MARKET_FABRIC_CHECKPOINT_FINGERPRINT_MISMATCH');return{...x,fingerprint:fp};}
 catch(e){if(e?.code==='ENOENT')return null;throw e;}
}
