import path from 'node:path';
import { open, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { canonicalJson, sha256 } from './institutional-kernel.mjs';

export const MARKET_FABRIC_COLD_TIER_VERSION='TCX_MARKET_FABRIC_COLD_TIER_V1';

function verifyManifest(value){
  if(!value||!Array.isArray(value.segments)||!value.version) throw new Error('TCX_COLD_MANIFEST_INVALID');
  const core={version:value.version,segments:value.segments};
  if(value.fingerprint!==sha256(core)) throw new Error('TCX_COLD_MANIFEST_FINGERPRINT_MISMATCH');
  return value;
}

function manifestValue(version,segments){
  const core={version,segments};
  return {...core,fingerprint:sha256(core)};
}

async function atomicManifest(file,value){
  const tmp=file+'.tmp';
  await unlink(tmp).catch(err=>{if(err?.code!=='ENOENT') throw err;});
  await writeFile(tmp,canonicalJson(value)+'\n',{encoding:'utf8',flag:'w'});
  const fh=await open(tmp,'r');
  try{await fh.sync();}finally{await fh.close();}
  await rename(tmp,file);
}

async function localEntry(dir,item){
  try{
    const info=await stat(path.join(dir,item.name));
    return {item,path:path.join(dir,item.name),bytes:info.size};
  }catch(err){
    if(err?.code==='ENOENT') return null;
    throw err;
  }
}

function assertDescriptor(item,descriptor){
  if(!descriptor||!descriptor.key) throw new Error('TCX_COLD_DESCRIPTOR_INVALID');
  if(Number(descriptor.compressedBytes)!==Number(item.compressedBytes)) throw new Error('TCX_COLD_DESCRIPTOR_COMPRESSED_BYTES_MISMATCH');
  if(String(descriptor.compressedSha256)!==String(item.compressedSha256)) throw new Error('TCX_COLD_DESCRIPTOR_COMPRESSED_HASH_MISMATCH');
  if(Number(descriptor.rawBytes)!==Number(item.rawBytes)) throw new Error('TCX_COLD_DESCRIPTOR_RAW_BYTES_MISMATCH');
  if(String(descriptor.rawSha256)!==String(item.rawSha256)) throw new Error('TCX_COLD_DESCRIPTOR_RAW_HASH_MISMATCH');
}

export async function offloadMarketFabricArchive({
  filePath,
  coldStore,
  maxLocalBytes=80*1024*1024,
  targetLocalBytes=Math.min(32*1024*1024,maxLocalBytes),
  maxSegmentsPerRun=2,
  now=Date.now()
}={}){
  const manifestPath=filePath+'.segments-manifest.json';
  if(!coldStore?.enabled){
    return {enabled:false,status:'DISABLED',offloadedSegments:0,offloadedBytes:0};
  }
  let manifest;
  try{manifest=verifyManifest(JSON.parse(await readFile(manifestPath,'utf8')));}
  catch(err){
    if(err?.code==='ENOENT') return {enabled:true,status:'NO_MANIFEST',offloadedSegments:0,offloadedBytes:0};
    throw err;
  }

  const dir=path.dirname(filePath);
  const locals=[];
  for(const item of manifest.segments){
    const entry=await localEntry(dir,item);
    if(entry) locals.push(entry);
  }
  locals.sort((a,b)=>Number(a.item.createdAt||0)-Number(b.item.createdAt||0)||Number(a.item.lastSeq||0)-Number(b.item.lastSeq||0));
  let localBytes=locals.reduce((sum,x)=>sum+x.bytes,0);
  const target=Math.max(0,Math.min(Number(maxLocalBytes)||0,Number(targetLocalBytes)||0));
  const limit=Math.max(0,Math.floor(Number(maxSegmentsPerRun)||0));
  let offloadedSegments=0,offloadedBytes=0,verifiedExisting=0;

  for(const entry of locals){
    if(localBytes<=target||offloadedSegments>=limit) break;
    const item=entry.item;
    let descriptor;
    if(item.cold){
      const checked=await coldStore.verifySegment({item,descriptor:item.cold});
      if(!checked?.ok) throw new Error('TCX_COLD_REMOTE_REVERIFY_FAILED');
      descriptor=checked.descriptor||item.cold;
      verifiedExisting++;
    }else{
      descriptor=await coldStore.putVerifiedSegment({item,localPath:entry.path});
    }
    assertDescriptor(item,descriptor);

    const nextItem={
      ...item,
      cold:{
        ...descriptor,
        recoveryVerified:true,
        verifiedAt:Number(descriptor.verifiedAt||now)
      }
    };
    const next=manifestValue(
      manifest.version,
      manifest.segments.map(x=>x.sourceName===item.sourceName?nextItem:x)
    );

    // Fail closed: persist + mirror the manifest before deleting the local copy.
    await atomicManifest(manifestPath,next);
    if(typeof coldStore.mirrorManifest==='function'){
      await coldStore.mirrorManifest({manifest:next});
    }
    await unlink(entry.path);
    manifest=next;
    localBytes-=entry.bytes;
    offloadedSegments++;
    offloadedBytes+=entry.bytes;
  }

  const coldSegments=manifest.segments.filter(x=>x.cold).length;
  const coldBytes=manifest.segments.filter(x=>x.cold).reduce((sum,x)=>sum+Number(x.compressedBytes||0),0);
  return {
    enabled:true,
    status:localBytes<=Number(maxLocalBytes||0)?'HEALTHY':'LOCAL_BUDGET_EXCEEDED',
    manifestPath,
    localBytes,
    maxLocalBytes:Number(maxLocalBytes||0),
    targetLocalBytes:target,
    offloadedSegments,
    offloadedBytes,
    verifiedExisting,
    coldSegments,
    coldBytes,
    totalSegments:manifest.segments.length,
    provider:coldStore.summary?.()||null
  };
}

export async function restoreMarketFabricColdSegment({
  filePath,
  coldStore,
  sourceName
}={}){
  if(!coldStore?.enabled) throw new Error('TCX_COLD_STORE_DISABLED');
  const manifestPath=filePath+'.segments-manifest.json';
  const manifest=verifyManifest(JSON.parse(await readFile(manifestPath,'utf8')));
  const item=manifest.segments.find(x=>x.sourceName===sourceName);
  if(!item) throw new Error('TCX_COLD_SEGMENT_NOT_FOUND');
  if(!item.cold) return {restored:false,reason:'NOT_COLD',path:path.join(path.dirname(filePath),item.name)};
  const targetPath=path.join(path.dirname(filePath),item.name);
  try{
    const info=await stat(targetPath);
    if(info.size===Number(item.compressedBytes)) return {restored:false,reason:'ALREADY_LOCAL',path:targetPath};
  }catch(err){if(err?.code!=='ENOENT') throw err;}
  const restored=await coldStore.restoreVerifiedSegment({item,descriptor:item.cold,targetPath});
  return {...restored,sourceName:item.sourceName};
}
