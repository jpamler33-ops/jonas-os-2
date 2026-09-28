import path from 'node:path';
import { readdir,readFile,writeFile,stat,unlink,rename,open } from 'node:fs/promises';
import { createReadStream,createWriteStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { createGzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { canonicalJson,sha256 } from './institutional-kernel.mjs';
export const MARKET_FABRIC_ARCHIVE_VERSION='TCX_MARKET_FABRIC_ARCHIVE_V2';

async function hashFile(file){const h=createHash('sha256');for await(const chunk of createReadStream(file))h.update(chunk);return h.digest('hex');}
async function readLastJsonLine(file){const data=await readFile(file,'utf8');const line=data.trim().split('\n').at(-1);return JSON.parse(line);}
function verifyManifest(m){if(!m||!Array.isArray(m.segments))throw new Error('MARKET_FABRIC_ARCHIVE_MANIFEST_INVALID');if(!m.fingerprint&&m.segments.length===0)return m;const fp=m.fingerprint,core={version:m.version,segments:m.segments};if(sha256(core)!==fp)throw new Error('MARKET_FABRIC_ARCHIVE_MANIFEST_FINGERPRINT_MISMATCH');return m;}
async function atomicManifest(file,value){const tmp=file+'.tmp';await writeFile(tmp,canonicalJson(value)+'\n',{encoding:'utf8',flag:'w'});const fh=await open(tmp,'r');try{await fh.sync();}finally{await fh.close();}await rename(tmp,file);}
export async function archiveMarketFabricSegments({filePath,maxArchivedBytes=120*1024*1024}={}){
 const dir=path.dirname(filePath),base=path.basename(filePath),manifestPath=filePath+'.segments-manifest.json';
 await unlink(manifestPath+'.tmp').catch(e=>{if(e?.code!=='ENOENT')throw e;});
 let manifest={version:MARKET_FABRIC_ARCHIVE_VERSION,segments:[]};
 try{manifest=verifyManifest(JSON.parse(await readFile(manifestPath,'utf8')));}catch(e){if(e?.code!=='ENOENT')throw e;}
 const raws=(await readdir(dir)).filter(n=>n.startsWith(base+'.segment-')&&n.endsWith('.jsonl')).sort();
 for(const name of raws){
  const raw=path.join(dir,name),gz=raw+'.gz',tmp=gz+'.tmp';
  await unlink(tmp).catch(e=>{if(e?.code!=='ENOENT')throw e;});
  const rawMeta=await stat(raw),last=await readLastJsonLine(raw),rawSha256=await hashFile(raw);
  const existing=manifest.segments.find(x=>x.sourceName===name);
  if(existing){
   try{const gzMeta=await stat(gz),gzHash=await hashFile(gz);if(gzHash===existing.compressedSha256){await unlink(raw);continue;}if(gzMeta)throw new Error('MARKET_FABRIC_ARCHIVE_EXISTING_GZIP_MISMATCH');}catch(e){if(e?.code!=='ENOENT')throw e;}
  }
  await pipeline(createReadStream(raw),createGzip({level:9}),createWriteStream(tmp,{flags:'wx'}));
  const fh=await open(tmp,'r');try{await fh.sync();}finally{await fh.close();}
  const compressedBytes=(await stat(tmp)).size,compressedSha256=await hashFile(tmp);
  await rename(tmp,gz);
  const item={name:path.basename(gz),sourceName:name,rawBytes:rawMeta.size,compressedBytes,rawSha256,compressedSha256,firstSeq:Number.isInteger(last.firstSeq)?last.firstSeq:null,lastSeq:last.seq,tailHash:last.eventHash,createdAt:Date.now()};
  const core={version:MARKET_FABRIC_ARCHIVE_VERSION,segments:[...manifest.segments.filter(x=>x.sourceName!==name),item]};
  const next={...core,fingerprint:sha256(core)};
  try{await atomicManifest(manifestPath,next);manifest=next;await unlink(raw);}
  catch(err){throw err;}
 }
 let total=0;for(const x of manifest.segments){try{total+=(await stat(path.join(dir,x.name))).size;}catch{}}
 return{version:MARKET_FABRIC_ARCHIVE_VERSION,manifestPath,segments:manifest.segments.length,archivedBytes:total,budgetBytes:maxArchivedBytes,budgetExceeded:total>maxArchivedBytes,destructiveRetention:false};
}
