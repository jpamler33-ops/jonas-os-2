import path from 'node:path';
import { readdir,readFile,writeFile,stat,unlink,rename,open } from 'node:fs/promises';
import { createReadStream,createWriteStream } from 'node:fs';
import { Transform } from 'node:stream';
import { createHash } from 'node:crypto';
import { createBrotliCompress,createGunzip,constants as zlibConstants } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { canonicalJson,sha256 } from './institutional-kernel.mjs';

export const MARKET_FABRIC_ARCHIVE_VERSION='TCX_MARKET_FABRIC_ARCHIVE_V3';
const LEGACY_ARCHIVE_VERSION='TCX_MARKET_FABRIC_ARCHIVE_V2';
const COLD_CODEC='brotli';
const BROTLI_QUALITY=7;
const LAST_LINE_MAX_BYTES=4*1024*1024;

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
  return {
    stream,
    finish:()=>({bytes,sha256:h.digest('hex')})
  };
}

function brotli(){
  return createBrotliCompress({
    params:{
      [zlibConstants.BROTLI_PARAM_QUALITY]:BROTLI_QUALITY,
      [zlibConstants.BROTLI_PARAM_MODE]:zlibConstants.BROTLI_MODE_TEXT
    }
  });
}

async function durableBrotliFromRaw({raw,tmp}){
  const audit=rawAuditTransform();
  await pipeline(
    createReadStream(raw),
    audit.stream,
    brotli(),
    createWriteStream(tmp,{flags:'wx'})
  );
  const fh=await open(tmp,'r');
  try{await fh.sync();}finally{await fh.close();}
  return audit.finish();
}

async function durableBrotliFromGzip({gzipFile,tmp}){
  const audit=rawAuditTransform();
  await pipeline(
    createReadStream(gzipFile),
    createGunzip(),
    audit.stream,
    brotli(),
    createWriteStream(tmp,{flags:'wx'})
  );
  const fh=await open(tmp,'r');
  try{await fh.sync();}finally{await fh.close();}
  return audit.finish();
}

function codecOf(item){
  if(item?.codec) return item.codec;
  if(String(item?.name||'').endsWith('.br')) return 'brotli';
  return 'gzip';
}

async function migrateOneLegacySegment({dir,manifest,manifestPath}){
  const legacy=manifest.segments.find(x=>codecOf(x)==='gzip');
  if(!legacy) return {manifest,migrated:null};
  const source=path.join(dir,legacy.name);
  const destName=legacy.sourceName+'.br';
  const dest=path.join(dir,destName);
  const tmp=dest+'.tmp';
  await unlink(tmp).catch(e=>{if(e?.code!=='ENOENT')throw e;});

  const audit=await durableBrotliFromGzip({gzipFile:source,tmp});
  if(legacy.rawSha256&&audit.sha256!==legacy.rawSha256){
    await unlink(tmp).catch(()=>{});
    throw new Error('MARKET_FABRIC_ARCHIVE_MIGRATION_RAW_HASH_MISMATCH');
  }
  if(Number.isFinite(Number(legacy.rawBytes))&&audit.bytes!==Number(legacy.rawBytes)){
    await unlink(tmp).catch(()=>{});
    throw new Error('MARKET_FABRIC_ARCHIVE_MIGRATION_RAW_BYTES_MISMATCH');
  }
  const compressedBytes=(await stat(tmp)).size;
  const compressedSha256=await hashFile(tmp);
  await rename(tmp,dest);

  const nextItem={
    ...legacy,
    name:destName,
    codec:COLD_CODEC,
    compressedBytes,
    compressedSha256,
    migratedAt:Date.now()
  };
  const segments=manifest.segments.map(x=>x.sourceName===legacy.sourceName?nextItem:x);
  const next=manifestValue(segments);
  await atomicManifest(manifestPath,next);
  await unlink(source).catch(e=>{if(e?.code!=='ENOENT')throw e;});
  return {
    manifest:next,
    migrated:{
      sourceName:legacy.sourceName,
      fromBytes:Number(legacy.compressedBytes)||null,
      toBytes:compressedBytes,
      reclaimedBytes:Math.max(0,(Number(legacy.compressedBytes)||compressedBytes)-compressedBytes)
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

  const raws=(await readdir(dir)).filter(n=>n.startsWith(base+'.segment-')&&n.endsWith('.jsonl')).sort();
  for(const name of raws){
    const raw=path.join(dir,name);
    const targetName=name+'.br';
    const target=path.join(dir,targetName);
    const tmp=target+'.tmp';
    await unlink(tmp).catch(e=>{if(e?.code!=='ENOENT')throw e;});

    const rawMeta=await stat(raw);
    const last=await readLastJsonLine(raw);
    const rawSha256=await hashFile(raw);
    const existing=manifest.segments.find(x=>x.sourceName===name);
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

    const audit=await durableBrotliFromRaw({raw,tmp});
    if(audit.sha256!==rawSha256||audit.bytes!==rawMeta.size){
      await unlink(tmp).catch(()=>{});
      throw new Error('MARKET_FABRIC_ARCHIVE_STREAM_AUDIT_MISMATCH');
    }
    const compressedBytes=(await stat(tmp)).size;
    const compressedSha256=await hashFile(tmp);
    await rename(tmp,target);
    const item={
      name:targetName,
      sourceName:name,
      codec:COLD_CODEC,
      rawBytes:rawMeta.size,
      compressedBytes,
      rawSha256,
      compressedSha256,
      firstSeq:Number.isInteger(last.firstSeq)?last.firstSeq:null,
      lastSeq:last.seq,
      tailHash:last.eventHash,
      createdAt:Date.now()
    };
    const segments=[...manifest.segments.filter(x=>x.sourceName!==name),item];
    const next=manifestValue(segments);
    await atomicManifest(manifestPath,next);
    manifest=next;
    await unlink(raw);
  }

  let migratedSegments=0,reclaimedBytes=0;
  if(migrateExisting){
    const max=Math.max(0,Math.floor(Number(maxMigrationsPerRun)||0));
    for(let i=0;i<max;i++){
      const migrated=await migrateOneLegacySegment({dir,manifest,manifestPath});
      manifest=migrated.manifest;
      if(!migrated.migrated) break;
      migratedSegments++;
      reclaimedBytes+=migrated.migrated.reclaimedBytes;
    }
  }

  // If a manifest already points at Brotli, any old gzip is now only an orphan
  // left behind by a crash between manifest commit and source cleanup.
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
    destructiveRetention:false,
    coldCodec:COLD_CODEC,
    migratedSegments,
    reclaimedBytes,
    codecBreakdown
  };
}
