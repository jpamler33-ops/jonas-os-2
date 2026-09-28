import path from 'node:path';
import { readdir,readFile,writeFile,stat,unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzip } from 'node:zlib';
import { promisify } from 'node:util';
import { canonicalJson,sha256 } from './institutional-kernel.mjs';
const gzipAsync=promisify(gzip);
export const MARKET_FABRIC_ARCHIVE_VERSION='TCX_MARKET_FABRIC_ARCHIVE_V1';
const fileHash=b=>createHash('sha256').update(b).digest('hex');
export async function archiveMarketFabricSegments({filePath,maxArchivedBytes=120*1024*1024}={}){
 const dir=path.dirname(filePath),base=path.basename(filePath),manifestPath=filePath+'.segments-manifest.json';
 let manifest={version:MARKET_FABRIC_ARCHIVE_VERSION,segments:[]};
 try{manifest=JSON.parse(await readFile(manifestPath,'utf8'));}catch(e){if(e?.code!=='ENOENT')throw e;}
 const entries=await readdir(dir);
 const raws=entries.filter(n=>n.startsWith(base+'.segment-')&&n.endsWith('.jsonl')).sort();
 for(const name of raws){
  const p=path.join(dir,name),raw=await readFile(p),compressed=await gzipAsync(raw,{level:9}),gz=p+'.gz';
  const lastLine=raw.toString('utf8').trim().split('\n').at(-1),last=JSON.parse(lastLine);
  const item={name:path.basename(gz),sourceName:name,rawBytes:raw.length,compressedBytes:compressed.length,rawSha256:fileHash(raw),compressedSha256:fileHash(compressed),lastSeq:last.seq,tailHash:last.eventHash,createdAt:Date.now()};
  const core={...manifest,segments:[...manifest.segments.filter(x=>x.sourceName!==name),item]};core.fingerprint=sha256({version:core.version,segments:core.segments});
  await writeFile(gz,compressed,{flag:'wx'});
  try{await writeFile(manifestPath,canonicalJson(core)+'\n','utf8');await unlink(p);manifest=core;}catch(err){await unlink(gz).catch(()=>{});throw err;}
 }
 const sorted=[...manifest.segments].sort((a,b)=>a.createdAt-b.createdAt);let total=0;for(const x of sorted){try{total+=(await stat(path.join(dir,x.name))).size;}catch{}}
 const retained=[];for(const x of sorted){retained.push(x);}
 // Never auto-delete manifest-tracked evidence in V1. Budget is an alert boundary, not destructive retention.
 return{version:MARKET_FABRIC_ARCHIVE_VERSION,manifestPath,segments:manifest.segments.length,archivedBytes:total,budgetBytes:maxArchivedBytes,budgetExceeded:total>maxArchivedBytes,destructiveRetention:false};
}
