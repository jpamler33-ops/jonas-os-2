import path from 'node:path';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGzip, createGunzip } from 'node:zlib';
import { canonicalJson, sha256 } from './institutional-kernel.mjs';

export const FORECAST_COLD_ARCHIVE_VERSION='TCX_FORECAST_COLD_ARCHIVE_V1';
const MANIFEST_VERSION='TCX_FORECAST_COLD_ARCHIVE_MANIFEST_V1';

function finite(v,fallback=0){
  const n=Number(v);
  return Number.isFinite(n)?n:fallback;
}

function issuanceAt(row){
  return finite(row?.generatedAt,finite(row?.asOf,0));
}

function trackerAt(row){
  return finite(row?.issuedAt,finite(row?.report?.asOf,0));
}

function* arrayBuffers(rows){
  yield Buffer.from('[','utf8');
  let first=true;
  for(const row of Array.isArray(rows)?rows:[]){
    const serialized=JSON.stringify(row);
    yield Buffer.from((first?'':',')+(serialized===undefined?'null':serialized),'utf8');
    first=false;
  }
  yield Buffer.from(']','utf8');
}

function* segmentBuffers({issuances,trackerRecords}){
  yield Buffer.from('{"version":'+JSON.stringify(FORECAST_COLD_ARCHIVE_VERSION)+',"issuances":','utf8');
  yield* arrayBuffers(issuances);
  yield Buffer.from(',"trackerRecords":','utf8');
  yield* arrayBuffers(trackerRecords);
  yield Buffer.from('}','utf8');
}

async function writeCompressedSegment(filePath,payload){
  const hash=createHash('sha256');
  let logicalBytes=0;
  const audit=new Transform({
    transform(chunk,_encoding,callback){
      logicalBytes+=chunk.length;
      hash.update(chunk);
      callback(null,chunk);
    }
  });
  await pipeline(
    Readable.from(segmentBuffers(payload)),
    audit,
    createGzip({level:1}),
    createWriteStream(filePath,{flags:'wx',mode:0o600})
  );
  return {
    sha256:hash.digest('hex'),
    logicalBytes,
    storageBytes:(await stat(filePath)).size
  };
}

function manifestCore(segments){
  return {version:MANIFEST_VERSION,segments};
}

function manifestValue(segments){
  const core=manifestCore(segments);
  return {...core,fingerprint:sha256(core)};
}

function verifyManifest(value){
  if(!value||value.version!==MANIFEST_VERSION||!Array.isArray(value.segments)){
    throw new Error('FORECAST_COLD_ARCHIVE_MANIFEST_INVALID');
  }
  const fp=value.fingerprint;
  const core=manifestCore(value.segments);
  if(fp!==sha256(core)) throw new Error('FORECAST_COLD_ARCHIVE_MANIFEST_FINGERPRINT_MISMATCH');
  return value;
}

async function loadManifest(dir){
  const file=path.join(dir,'manifest.json');
  try{
    return {file,value:verifyManifest(JSON.parse(await readFile(file,'utf8')))};
  }catch(err){
    if(err?.code!=='ENOENT') throw err;
    return {file,value:manifestValue([])};
  }
}

async function writeManifest(file,value){
  const tmp=file+'.tmp-'+process.pid;
  await rm(tmp,{force:true}).catch(()=>{});
  await writeFile(tmp,canonicalJson(value)+'\n',{encoding:'utf8',mode:0o600,flag:'wx'});
  await rename(tmp,file);
}

export async function archiveForecastColdBatch({
  dir,
  issuances=[],
  trackerRecords=[],
  archivedAt=Date.now()
}={}){
  if(!dir) throw new Error('FORECAST_COLD_ARCHIVE_DIR_REQUIRED');
  const issueRows=[...issuances].sort((a,b)=>issuanceAt(a)-issuanceAt(b)||String(a?.issuanceId||'').localeCompare(String(b?.issuanceId||'')));
  const trackerRows=[...trackerRecords].sort((a,b)=>trackerAt(a)-trackerAt(b)||String(a?.id||'').localeCompare(String(b?.id||'')));
  if(!issueRows.length&&!trackerRows.length){
    return {archived:false,duplicate:false,issuances:0,trackerRecords:0,segment:null};
  }

  await mkdir(dir,{recursive:true});
  const {file:manifestFile,value:manifest}=await loadManifest(dir);
  const tmp=path.join(dir,'.segment-'+process.pid+'-'+String(archivedAt)+'.tmp');
  await rm(tmp,{force:true}).catch(()=>{});
  let meta;
  try{
    meta=await writeCompressedSegment(tmp,{issuances:issueRows,trackerRecords:trackerRows});
  }catch(err){
    await rm(tmp,{force:true}).catch(()=>{});
    throw err;
  }

  const existing=manifest.segments.find(x=>x.sha256===meta.sha256&&Number(x.logicalBytes)===meta.logicalBytes);
  if(existing){
    await rm(tmp,{force:true}).catch(()=>{});
    const verification=await verifyForecastColdSegment(dir,existing);
    if(!verification.ok) throw new Error('FORECAST_COLD_ARCHIVE_EXISTING_SEGMENT_VERIFY_FAILED');
    return {
      archived:true,duplicate:true,verified:true,
      issuances:issueRows.length,trackerRecords:trackerRows.length,
      segment:existing,manifestFingerprint:manifest.fingerprint
    };
  }

  const allTimes=[
    ...issueRows.map(issuanceAt),
    ...trackerRows.map(trackerAt)
  ].filter(x=>Number.isFinite(x)&&x>0);
  const firstAt=allTimes.length?Math.min(...allTimes):0;
  const lastAt=allTimes.length?Math.max(...allTimes):0;
  const name='segment-'+String(firstAt)+'-'+String(lastAt)+'-'+meta.sha256.slice(0,16)+'.json.gz';
  const target=path.join(dir,name);
  let targetPreexisting=false;
  try{
    await stat(target);
    targetPreexisting=true;
    await rm(tmp,{force:true});
  }catch(err){
    if(err?.code!=='ENOENT'){
      await rm(tmp,{force:true}).catch(()=>{});
      throw err;
    }
    await rename(tmp,target);
  }

  const segment={
    name,
    sha256:meta.sha256,
    logicalBytes:meta.logicalBytes,
    storageBytes:meta.storageBytes,
    issuances:issueRows.length,
    trackerRecords:trackerRows.length,
    firstAt,
    lastAt,
    archivedAt:Number(archivedAt)
  };
  const verification=await verifyForecastColdSegment(dir,segment);
  if(!verification.ok){
    if(!targetPreexisting) await rm(target,{force:true}).catch(()=>{});
    throw new Error('FORECAST_COLD_ARCHIVE_READBACK_VERIFY_FAILED');
  }
  segment.storageBytes=verification.storageBytes;
  const next=manifestValue([...manifest.segments,segment]);
  await writeManifest(manifestFile,next);
  return {
    archived:true,duplicate:false,verified:true,
    issuances:issueRows.length,trackerRecords:trackerRows.length,
    segment,manifestFingerprint:next.fingerprint
  };
}

export async function verifyForecastColdSegment(dir,segment){
  const file=path.join(dir,segment.name);
  const hash=createHash('sha256');
  let logicalBytes=0;
  await pipeline(
    createReadStream(file),
    createGunzip(),
    new Transform({
      transform(chunk,_encoding,callback){
        logicalBytes+=chunk.length;
        hash.update(chunk);
        callback(null,chunk);
      }
    }),
    new Transform({transform(_chunk,_encoding,callback){callback();}})
  );
  const digest=hash.digest('hex');
  return {
    ok:digest===segment.sha256&&logicalBytes===Number(segment.logicalBytes),
    sha256:digest,
    logicalBytes,
    storageBytes:(await stat(file)).size
  };
}

export async function forecastColdArchiveSummary(dir){
  if(!dir) return {healthy:false,segments:0,issuances:0,trackerRecords:0,storageBytes:0};
  try{
    const {value}=await loadManifest(dir);
    return {
      healthy:true,
      version:value.version,
      segments:value.segments.length,
      issuances:value.segments.reduce((n,x)=>n+Number(x.issuances||0),0),
      trackerRecords:value.segments.reduce((n,x)=>n+Number(x.trackerRecords||0),0),
      storageBytes:value.segments.reduce((n,x)=>n+Number(x.storageBytes||0),0),
      fingerprint:value.fingerprint
    };
  }catch(err){
    return {healthy:false,segments:0,issuances:0,trackerRecords:0,storageBytes:0,error:err instanceof Error?err.message:String(err)};
  }
}

export function planForecastHotCompaction(runtime,{
  now=Date.now(),
  maxHotIssuances=400,
  maxHotTracked=400,
  batchThreshold=100,
  minColdAgeMs=6*60*60_000
}={}){
  const hotI=Math.max(100,Math.floor(Number(maxHotIssuances)||400));
  const hotT=Math.max(100,Math.floor(Number(maxHotTracked)||400));
  const batch=Math.max(10,Math.floor(Number(batchThreshold)||100));
  const cutoff=Number(now)-Math.max(60*60_000,Number(minColdAgeMs)||6*60*60_000);

  const issuances=Array.isArray(runtime?.issuances)?runtime.issuances:[];
  const trackerRows=[...(runtime?.intelligence?.tracker?.records?.values?.()??[])];

  const newestIssueIds=new Set(
    [...issuances]
      .sort((a,b)=>issuanceAt(b)-issuanceAt(a))
      .slice(0,hotI)
      .map(x=>String(x?.issuanceId||''))
      .filter(Boolean)
  );
  const activeForecastIds=new Set(
    trackerRows
      .filter(x=>String(x?.status||'').toUpperCase()==='ACTIVE')
      .map(x=>String(x?.id||''))
      .filter(Boolean)
  );

  let coldIssuances=[];
  if(issuances.length>hotI+batch){
    coldIssuances=issuances.filter(row=>{
      const issuanceId=String(row?.issuanceId||'');
      const forecastId=String(row?.forecast?.forecastId||row?.forecastId||'');
      if(newestIssueIds.has(issuanceId)) return false;
      if(forecastId&&activeForecastIds.has(forecastId)) return false;
      return issuanceAt(row)>0&&issuanceAt(row)<cutoff;
    });
  }

  const newestTrackerIds=new Set(
    [...trackerRows]
      .sort((a,b)=>trackerAt(b)-trackerAt(a))
      .slice(0,hotT)
      .map(x=>String(x?.id||''))
      .filter(Boolean)
  );
  let coldTrackerRecords=[];
  if(trackerRows.length>hotT+batch){
    coldTrackerRecords=trackerRows.filter(row=>{
      const id=String(row?.id||'');
      if(newestTrackerIds.has(id)) return false;
      if(String(row?.status||'').toUpperCase()==='ACTIVE') return false;
      const expiresAt=finite(row?.expiresAt,trackerAt(row));
      return expiresAt>0&&expiresAt<cutoff;
    });
  }

  return {
    now:Number(now),cutoff,
    before:{issuances:issuances.length,trackerRecords:trackerRows.length},
    coldIssuances,
    coldTrackerRecords,
    removableIssuanceIds:new Set(coldIssuances.map(x=>String(x?.issuanceId||'')).filter(Boolean)),
    removableTrackerIds:new Set(coldTrackerRecords.map(x=>String(x?.id||'')).filter(Boolean)),
    configured:{maxHotIssuances:hotI,maxHotTracked:hotT,batchThreshold:batch,minColdAgeMs:Number(minColdAgeMs)}
  };
}

export function applyForecastHotCompaction(runtime,plan){
  const issueIds=plan?.removableIssuanceIds instanceof Set?plan.removableIssuanceIds:new Set();
  const trackerIds=plan?.removableTrackerIds instanceof Set?plan.removableTrackerIds:new Set();

  const beforeIssuances=Array.isArray(runtime?.issuances)?runtime.issuances.length:0;
  if(Array.isArray(runtime?.issuances)&&issueIds.size){
    runtime.issuances=runtime.issuances.filter(x=>!issueIds.has(String(x?.issuanceId||'')));
  }
  const trackerMap=runtime?.intelligence?.tracker?.records;
  let removedTracker=0;
  if(trackerMap?.delete&&trackerIds.size){
    for(const id of trackerIds) if(trackerMap.delete(id)) removedTracker++;
  }

  return {
    removedIssuances:beforeIssuances-(runtime?.issuances?.length||0),
    removedTrackerRecords:removedTracker,
    after:{
      issuances:runtime?.issuances?.length||0,
      trackerRecords:runtime?.intelligence?.tracker?.records?.size||0
    }
  };
}
