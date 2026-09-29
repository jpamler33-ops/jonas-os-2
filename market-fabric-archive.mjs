import path from 'node:path';
import { readdir,readFile,writeFile,stat,unlink,rename,open } from 'node:fs/promises';
import { createReadStream,createWriteStream } from 'node:fs';
import { Transform } from 'node:stream';
import { createHash } from 'node:crypto';
import { createBrotliCompress,createBrotliDecompress,createGunzip,createGzip,constants as zlibConstants } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { canonicalJson,sha256 } from './institutional-kernel.mjs';

export const MARKET_FABRIC_ARCHIVE_VERSION='TCX_MARKET_FABRIC_ARCHIVE_V3';
const LEGACY_ARCHIVE_VERSION='TCX_MARKET_FABRIC_ARCHIVE_V2';
const LAST_LINE_MAX_BYTES=4*1024*1024;
const BROTLI_QUALITY=11;
const BROTLI_MIN_SAVINGS_RATIO=0.02;

async function hashFile(file){
  const h=createHash('sha256');
  for await(const chunk of createReadStream(file)) h.update(chunk);
  return h.digest('hex');
}

async function readLastJsonLine(file){
  const fh=await open(file,'r');
  try{
    const meta=await fh.stat();
    if(meta.size<=0) throw new Error('MARKET_FABRIC_ARCHIVE_EMPTY_SEGMENT');
    let pos=meta.size;
    let carry=Buffer.alloc(0);
    while(pos>0){
      const len=Math.min(64*1024,pos);
      pos-=len;
      const chunk=Buffer.allocUnsafe(len);
      await fh.read(chunk,0,len,pos);
      carry=Buffer.concat([chunk,carry]);
      if(carry.length>LAST_LINE_MAX_BYTES) throw new Error('MARKET_FABRIC_ARCHIVE_LAST_LINE_TOO_LARGE');
      const text=carry.toString('utf8').trimEnd();
      const idx=text.lastIndexOf('\n');
      if(idx>=0){
        const line=text.slice(idx+1).trim();
        if(line) return JSON.parse(line);
      }
    }
    const line=carry.toString('utf8').trim();
    if(!line) throw new Error('MARKET_FABRIC_ARCHIVE_EMPTY_SEGMENT');
    return JSON.parse(line);
  }finally{
    await fh.close();
  }
}

function verifyManifest(m){
  if(!m||!Array.isArray(m.segments)) throw new Error('MARKET_FABRIC_ARCHIVE_MANIFEST_INVALID');
  if(![LEGACY_ARCHIVE_VERSION,MARKET_FABRIC_ARCHIVE_VERSION].includes(m.version)){
    throw new Error('MARKET_FABRIC_ARCHIVE_MANIFEST_VERSION_UNSUPPORTED');
  }
  if(!m.fingerprint&&m.segments.length===0) return m;
  const fp=m.fingerprint,core={version:m.version,segments:m.segments};
  if(sha256(core)!==fp) throw new Error('MARKET_FABRIC_ARCHIVE_MANIFEST_FINGERPRINT_MISMATCH');
  return m;
}

function manifestValue(segments){
  const core={version:MARKET_FABRIC_ARCHIVE_VERSION,segments};
  return {...core,fingerprint:sha256(core)};
}

async function atomicManifest(file,value){
  const tmp=file+'.tmp';
  await unlink(tmp).catch(e=>{if(e?.code!=='ENOENT')throw e;});
  await writeFile(tmp,canonicalJson(value)+'\n',{encoding:'utf8',flag:'w'});
  const fh=await open(tmp,'r');
  try{await fh.sync();}finally{await fh.close();}
  await rename(tmp,file);
}

function rawAuditTransform(){
  const h=createHash('sha256');
  let bytes=0;
  const stream=new Transform({
    transform(chunk,_enc,cb){
      bytes+=chunk.length;
      h.update(chunk);
      cb(null,chunk);
    }
  });
  return {stream,finish:()=>({bytes,sha256:h.digest('hex')})};
}

function gzipLevel9(){return createGzip({level:9});}
function brotliCandidate(){
  return createBrotliCompress({
    params:{
      [zlibConstants.BROTLI_PARAM_QUALITY]:BROTLI_QUALITY,
      [zlibConstants.BROTLI_PARAM_MODE]:zlibConstants.BROTLI_MODE_TEXT
    }
  });
}

async function durableCompressedFromRaw({raw,tmp,compressor}){
  const audit=rawAuditTransform();
  await pipeline(createReadStream(raw),audit.stream,compressor(),createWriteStream(tmp,{flags:'wx'}));
  const fh=await open(tmp,'r');
  try{await fh.sync();}finally{await fh.close();}
  return audit.finish();
}

async function durableBrotliCandidateFromGzip({gzipFile,tmp}){
  const audit=rawAuditTransform();
  await pipeline(createReadStream(gzipFile),createGunzip(),audit.stream,brotliCandidate(),createWriteStream(tmp,{flags:'wx'}));
  const fh=await open(tmp,'r');
  try{await fh.sync();}finally{await fh.close();}
  return audit.finish();
}

async function durableBrotliCandidateFromBrotli({brotliFile,tmp}){
  const audit=rawAuditTransform();
  await pipeline(createReadStream(brotliFile),createBrotliDecompress(),audit.stream,brotliCandidate(),createWriteStream(tmp,{flags:'wx'}));
  const fh=await open(tmp,'r');
  try{await fh.sync();}finally{await fh.close();}
  return audit.finish();
}

function codecOf(item){
  if(item?.codec) return item.codec;
  if(String(item?.name||'').endsWith('.br')) return 'brotli';
  return 'gzip';
}

async function archivedBytesFromManifest(dir,manifest){
  let total=0;
  for(const item of manifest?.segments||[]){
    try{total+=(await stat(path.join(dir,item.name))).size;}catch{}
  }
  return total;
}

async function tryMigrateOneGzipSegment({dir,manifest,manifestPath}){
  const legacy=manifest.segments.find(x=>codecOf(x)==='gzip'&&!x.cold&&!x.brotliCandidateRejectedAt);
  if(!legacy) return {manifest,attempted:null};
  const source=path.join(dir,legacy.name);
  const sourceMeta=await stat(source);
  const destName=legacy.sourceName+'.br';
  const dest=path.join(dir,destName);
  const tmp=dest+'.tmp';
  await unlink(tmp).catch(e=>{if(e?.code!=='ENOENT')throw e;});

  const audit=await durableBrotliCandidateFromGzip({gzipFile:source,tmp});
  if(legacy.rawSha256&&audit.sha256!==legacy.rawSha256){
    await unlink(tmp).catch(()=>{});
    throw new Error('MARKET_FABRIC_ARCHIVE_MIGRATION_RAW_HASH_MISMATCH');
  }
  if(Number.isFinite(Number(legacy.rawBytes))&&audit.bytes!==Number(legacy.rawBytes)){
    await unlink(tmp).catch(()=>{});
    throw new Error('MARKET_FABRIC_ARCHIVE_MIGRATION_RAW_BYTES_MISMATCH');
  }

  const candidateBytes=(await stat(tmp)).size;
  const requiredMax=Math.floor(sourceMeta.size*(1-BROTLI_MIN_SAVINGS_RATIO));
  if(candidateBytes>=requiredMax){
    await unlink(tmp).catch(()=>{});
    const rejected={
      ...legacy,
      codec:'gzip',
      brotliCandidateRejectedAt:Date.now(),
      brotliCandidateBytes:candidateBytes,
      brotliCandidateQuality:BROTLI_QUALITY
    };
    const next=manifestValue(manifest.segments.map(x=>x.sourceName===legacy.sourceName?rejected:x));
    await atomicManifest(manifestPath,next);
    return {
      manifest:next,
      attempted:{
        accepted:false,
        sourceName:legacy.sourceName,
        fromBytes:sourceMeta.size,
        candidateBytes,
        reclaimedBytes:0
      }
    };
  }

  const compressedSha256=await hashFile(tmp);
  await rename(tmp,dest);
  const nextItem={
    ...legacy,
    name:destName,
    codec:'brotli',
    compressedBytes:candidateBytes,
    compressedSha256,
    migratedAt:Date.now(),
    migrationSourceBytes:sourceMeta.size,
    migrationQuality:BROTLI_QUALITY
  };
  delete nextItem.brotliCandidateRejectedAt;
  delete nextItem.brotliCandidateBytes;
  delete nextItem.brotliCandidateQuality;
  const next=manifestValue(manifest.segments.map(x=>x.sourceName===legacy.sourceName?nextItem:x));
  await atomicManifest(manifestPath,next);
  await unlink(source).catch(e=>{if(e?.code!=='ENOENT')throw e;});
  return {
    manifest:next,
    attempted:{
      accepted:true,
      sourceName:legacy.sourceName,
      fromBytes:sourceMeta.size,
      candidateBytes,
      reclaimedBytes:sourceMeta.size-candidateBytes
    }
  };
}


async function tryRecompressOneLegacyBrotliSegment({dir,manifest,manifestPath}){
  const legacy=manifest.segments.find(x=>
    codecOf(x)==='brotli'&&
    !x.cold&&
    Number(x?.migrationQuality||0)<BROTLI_QUALITY&&
    !x.brotli11CandidateRejectedAt
  );
  if(!legacy) return {manifest,attempted:null};
  const source=path.join(dir,legacy.name);
  const sourceMeta=await stat(source);
  const destName=legacy.sourceName+'.q11.br';
  const dest=path.join(dir,destName);
  const tmp=dest+'.tmp';
  await unlink(tmp).catch(e=>{if(e?.code!=='ENOENT')throw e;});

  const audit=await durableBrotliCandidateFromBrotli({brotliFile:source,tmp});
  if(legacy.rawSha256&&audit.sha256!==legacy.rawSha256){
    await unlink(tmp).catch(()=>{});
    throw new Error('MARKET_FABRIC_ARCHIVE_REPACK_RAW_HASH_MISMATCH');
  }
  if(Number.isFinite(Number(legacy.rawBytes))&&audit.bytes!==Number(legacy.rawBytes)){
    await unlink(tmp).catch(()=>{});
    throw new Error('MARKET_FABRIC_ARCHIVE_REPACK_RAW_BYTES_MISMATCH');
  }

  const candidateBytes=(await stat(tmp)).size;
  const requiredMax=Math.floor(sourceMeta.size*(1-BROTLI_MIN_SAVINGS_RATIO));
  if(candidateBytes>=requiredMax){
    await unlink(tmp).catch(()=>{});
    const rejected={
      ...legacy,
      brotli11CandidateRejectedAt:Date.now(),
      brotli11CandidateBytes:candidateBytes,
      brotli11CandidateQuality:BROTLI_QUALITY
    };
    const next=manifestValue(manifest.segments.map(x=>x.sourceName===legacy.sourceName?rejected:x));
    await atomicManifest(manifestPath,next);
    return {
      manifest:next,
      attempted:{
        kind:'BROTLI_REPACK',
        accepted:false,
        sourceName:legacy.sourceName,
        fromBytes:sourceMeta.size,
        candidateBytes,
        reclaimedBytes:0
      }
    };
  }

  const compressedSha256=await hashFile(tmp);
  await rename(tmp,dest);
  const nextItem={
    ...legacy,
    name:destName,
    codec:'brotli',
    compressedBytes:candidateBytes,
    compressedSha256,
    recompressedAt:Date.now(),
    recompressionSourceBytes:sourceMeta.size,
    migrationQuality:BROTLI_QUALITY
  };
  delete nextItem.brotli11CandidateRejectedAt;
  delete nextItem.brotli11CandidateBytes;
  delete nextItem.brotli11CandidateQuality;
  const next=manifestValue(manifest.segments.map(x=>x.sourceName===legacy.sourceName?nextItem:x));
  await atomicManifest(manifestPath,next);
  await unlink(source).catch(e=>{if(e?.code!=='ENOENT')throw e;});
  return {
    manifest:next,
    attempted:{
      kind:'BROTLI_REPACK',
      accepted:true,
      sourceName:legacy.sourceName,
      fromBytes:sourceMeta.size,
      candidateBytes,
      reclaimedBytes:sourceMeta.size-candidateBytes
    }
  };
}

export async function archiveMarketFabricSegments({
  filePath,
  maxArchivedBytes=120*1024*1024,
  migrateExisting=true,
  maxMigrationsPerRun=1
}={}){
  const dir=path.dirname(filePath),base=path.basename(filePath),manifestPath=filePath+'.segments-manifest.json';
  await unlink(manifestPath+'.tmp').catch(e=>{if(e?.code!=='ENOENT')throw e;});
  let manifest={version:MARKET_FABRIC_ARCHIVE_VERSION,segments:[]};
  try{manifest=verifyManifest(JSON.parse(await readFile(manifestPath,'utf8')));}
  catch(e){if(e?.code!=='ENOENT')throw e;}

  let committedArchivedBytes=await archivedBytesFromManifest(dir,manifest);
  let budgetBlockedSegments=0,budgetBlockedCandidateBytes=0;
  const raws=(await readdir(dir)).filter(n=>n.startsWith(base+'.segment-')&&n.endsWith('.jsonl')).sort();
  for(const name of raws){
    const raw=path.join(dir,name);
    const targetName=name+'.gz';
    const target=path.join(dir,targetName);
    const tmp=target+'.tmp';
    await unlink(tmp).catch(e=>{if(e?.code!=='ENOENT')throw e;});

    const rawMeta=await stat(raw);
    const last=await readLastJsonLine(raw);
    const rawSha256=await hashFile(raw);
    const existing=manifest.segments.find(x=>x.sourceName===name);
    if(existing?.cold){
      if(rawSha256!==String(existing.rawSha256)||rawMeta.size!==Number(existing.rawBytes)){
        throw new Error('MARKET_FABRIC_ARCHIVE_COLD_SOURCE_MISMATCH');
      }
      await unlink(raw);
      continue;
    }
    if(existing){
      const existingPath=path.join(dir,existing.name);
      try{
        const compressedSha256=await hashFile(existingPath);
        if(compressedSha256===existing.compressedSha256){
          await unlink(raw);
          continue;
        }
        throw new Error('MARKET_FABRIC_ARCHIVE_EXISTING_COMPRESSED_MISMATCH');
      }catch(e){
        if(e?.code!=='ENOENT') throw e;
      }
    }

    const audit=await durableCompressedFromRaw({raw,tmp,compressor:gzipLevel9});
    if(audit.sha256!==rawSha256||audit.bytes!==rawMeta.size){
      await unlink(tmp).catch(()=>{});
      throw new Error('MARKET_FABRIC_ARCHIVE_STREAM_AUDIT_MISMATCH');
    }
    const compressedBytes=(await stat(tmp)).size;
    if(committedArchivedBytes+compressedBytes>Math.max(0,Number(maxArchivedBytes)||0)){
      budgetBlockedSegments++;
      budgetBlockedCandidateBytes+=compressedBytes;
      await unlink(tmp).catch(()=>{});
      continue;
    }
    const compressedSha256=await hashFile(tmp);
    await rename(tmp,target);
    const item={
      name:targetName,
      sourceName:name,
      codec:'gzip',
      rawBytes:rawMeta.size,
      compressedBytes,
      rawSha256,
      compressedSha256,
      firstSeq:Number.isInteger(last.firstSeq)?last.firstSeq:null,
      lastSeq:last.seq,
      tailHash:last.eventHash,
      createdAt:Date.now()
    };
    const next=manifestValue([...manifest.segments.filter(x=>x.sourceName!==name),item]);
    await atomicManifest(manifestPath,next);
    manifest=next;
    committedArchivedBytes+=compressedBytes;
    await unlink(raw);
  }

  let migrationAttempts=0,migratedSegments=0,recompressedSegments=0,migrationRejected=0,recompressionRejected=0,reclaimedBytes=0;
  if(migrateExisting){
    const max=Math.max(0,Math.floor(Number(maxMigrationsPerRun)||0));
    for(let i=0;i<max;i++){
      let result=await tryMigrateOneGzipSegment({dir,manifest,manifestPath});
      if(!result.attempted) result=await tryRecompressOneLegacyBrotliSegment({dir,manifest,manifestPath});
      manifest=result.manifest;
      if(!result.attempted) break;
      migrationAttempts++;
      if(result.attempted.accepted){
        reclaimedBytes+=result.attempted.reclaimedBytes;
        if(result.attempted.kind==='BROTLI_REPACK') recompressedSegments++;
        else migratedSegments++;
      }else{
        if(result.attempted.kind==='BROTLI_REPACK') recompressionRejected++;
        else migrationRejected++;
      }
    }
  }

  for(const item of manifest.segments){
    if(codecOf(item)!=='brotli') continue;
    const legacyGzip=path.join(dir,item.sourceName+'.gz');
    await unlink(legacyGzip).catch(e=>{if(e?.code!=='ENOENT')throw e;});
  }

  let total=0;
  const codecBreakdown={brotli:{segments:0,bytes:0},gzip:{segments:0,bytes:0}};
  for(const x of manifest.segments){
    try{
      const size=(await stat(path.join(dir,x.name))).size;
      total+=size;
      const codec=codecOf(x)==='brotli'?'brotli':'gzip';
      codecBreakdown[codec].segments++;
      codecBreakdown[codec].bytes+=size;
    }catch{}
  }
  return {
    version:MARKET_FABRIC_ARCHIVE_VERSION,
    manifestPath,
    segments:manifest.segments.length,
    archivedBytes:total,
    budgetBytes:maxArchivedBytes,
    budgetExceeded:total>maxArchivedBytes,
    budgetBlocked:budgetBlockedSegments>0||total>maxArchivedBytes,
    budgetBlockedSegments,
    budgetBlockedCandidateBytes,
    destructiveRetention:false,
    preferredNewCodec:'gzip-9',
    optionalCandidateCodec:'brotli-11',
    minCandidateSavingsRatio:BROTLI_MIN_SAVINGS_RATIO,
    migrationAttempts,
    migratedSegments,
    recompressedSegments,
    migrationRejected,
    recompressionRejected,
    reclaimedBytes,
    codecBreakdown
  };
}
