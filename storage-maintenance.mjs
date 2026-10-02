import path from 'node:path';
import { access, readdir, stat, statfs, unlink } from 'node:fs/promises';

const DEFAULT_CANONICAL_FILES = Object.freeze([
  'tcx-forecast-runtime.json',
  'tcx-evidence-history.json',
  'tcx-episodes.json',
  'tcx-shadow-oms.json',
  'tcx-shadow-portfolio.json',
  'tcx-release-registry.jsonl'
]);

const ARTIFACT_MARKERS = Object.freeze(['.tmp-', '.corrupt-', '.truncated-tail-', '.oversized-']);
const GENERIC_TEMP_PATTERNS = Object.freeze([/\.tmp$/,/\.tmp-\d+$/]);

function storageCategory(name) {
  if (name==='tcx-market-events.jsonl') return 'marketFabricActive';
  if (name.startsWith('tcx-market-events.jsonl.segment-')) return 'marketFabricArchive';
  if (name.startsWith('tcx-market-events.jsonl.')) return 'marketFabricMetadata';
  if (name.startsWith('tcx-forecast-runtime')) return 'forecastPersistence';
  if (name.startsWith('tcx-research-data-plane')) return 'researchDataPlane';
  if (name.startsWith('tcx-episodes')) return 'episodeMemory';
  if (name.startsWith('tcx-shadow-')) return 'shadowState';
  if (name.startsWith('tcx-evidence-history')) return 'evidenceHistory';
  if (name.startsWith('tcx-release-registry')) return 'releaseRegistry';
  return 'other';
}

async function exists(filePath) {
  try { await access(filePath); return true; } catch { return false; }
}

function artifactOwner(name, canonicalFiles) {
  for (const canonical of canonicalFiles) {
    if (!name.startsWith(canonical)) continue;
    if (ARTIFACT_MARKERS.some(marker => name.startsWith(canonical + marker))) return canonical;
  }
  return null;
}

export async function cleanupOrphanedPersistenceArtifacts({
  dataDir='/data',
  canonicalFiles=DEFAULT_CANONICAL_FILES,
  minAgeMs=5*60_000,
  now=Date.now(),
  logger=console
}={}) {
  const result={scanned:0,removed:[],skipped:[],freedBytes:0,errors:[]};
  let entries;
  try { entries=await readdir(dataDir,{withFileTypes:true}); }
  catch(err) {
    if (err?.code==='ENOENT') return result;
    result.errors.push({file:dataDir,error:err instanceof Error?err.message:String(err)});
    return result;
  }

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const canonical=artifactOwner(entry.name,canonicalFiles);
    const genericTemp=GENERIC_TEMP_PATTERNS.some(re=>re.test(entry.name));
    if (!canonical&&!genericTemp) continue;
    result.scanned++;
    const artifactPath=path.join(dataDir,entry.name);
    try {
      if (canonical) {
        const canonicalPath=path.join(dataDir,canonical);
        if (!(await exists(canonicalPath))) {
          result.skipped.push({file:entry.name,reason:'CANONICAL_MISSING'});
          continue;
        }
      }
      const meta=await stat(artifactPath);
      const ageMs=Math.max(0,Number(now)-Number(meta.mtimeMs));
      if (ageMs<minAgeMs) {
        result.skipped.push({file:entry.name,reason:'TOO_RECENT',ageMs});
        continue;
      }
      await unlink(artifactPath);
      result.removed.push({file:entry.name,bytes:Number(meta.size)||0});
      result.freedBytes+=Number(meta.size)||0;
    } catch(err) {
      result.errors.push({file:entry.name,error:err instanceof Error?err.message:String(err)});
    }
  }

  if (result.removed.length || result.errors.length) {
    logger.info?.('persistence artifact cleanup',JSON.stringify({
      removed:result.removed.length,
      freedBytes:result.freedBytes,
      skipped:result.skipped.length,
      errors:result.errors
    }));
  }
  return result;
}

export async function inspectPersistenceStorage({
  dataDir='/data',
  topN=20,
  logger=console
}={}) {
  const result={
    dataDir,
    totalBytes:0,
    fileCount:0,
    categories:{},
    topFiles:[],
    errors:[]
  };
  let entries;
  try { entries=await readdir(dataDir,{withFileTypes:true}); }
  catch(err) {
    result.errors.push({file:dataDir,error:err instanceof Error?err.message:String(err)});
    return result;
  }
  const files=[];
  for(const entry of entries) {
    if(!entry.isFile()) continue;
    try{
      const meta=await stat(path.join(dataDir,entry.name));
      const bytes=Number(meta.size)||0;
      const category=storageCategory(entry.name);
      result.totalBytes+=bytes;
      result.fileCount++;
      result.categories[category]=(result.categories[category]||0)+bytes;
      files.push({file:entry.name,bytes,category,mtimeMs:Number(meta.mtimeMs)||null});
    }catch(err){
      result.errors.push({file:entry.name,error:err instanceof Error?err.message:String(err)});
    }
  }
  result.topFiles=files.sort((a,b)=>b.bytes-a.bytes).slice(0,Math.max(1,Math.floor(Number(topN)||20)));
  logger.info?.('[TCX_STORAGE_INVENTORY]',JSON.stringify({
    totalBytes:result.totalBytes,
    fileCount:result.fileCount,
    categories:result.categories,
    topFiles:result.topFiles,
    errors:result.errors
  }));
  return result;
}


export function classifyStoragePressure({
  totalBytes,
  availableBytes,
  warnFreeBytes=96*1024*1024,
  criticalFreeBytes=48*1024*1024,
  warnUtilization=0.82,
  criticalUtilization=0.92
}={}){
  const total=Math.max(0,Number(totalBytes)||0);
  const available=Math.max(0,Number(availableBytes)||0);
  const used=Math.max(0,total-available);
  const utilization=total>0?used/total:null;
  const warnFree=Math.max(0,Number(warnFreeBytes)||0);
  const criticalFree=Math.max(0,Math.min(warnFree,Number(criticalFreeBytes)||0));
  const warnUtil=Math.max(0,Math.min(1,Number(warnUtilization)||0.82));
  const criticalUtil=Math.max(warnUtil,Math.min(1,Number(criticalUtilization)||0.92));
  const critical=available<=criticalFree||(utilization!=null&&utilization>=criticalUtil);
  const warning=!critical&&(available<=warnFree||(utilization!=null&&utilization>=warnUtil));
  return {
    state:critical?'CRITICAL':warning?'WARN':'NORMAL',
    totalBytes:total,
    usedBytes:used,
    availableBytes:available,
    utilization,
    thresholds:{
      warnFreeBytes:warnFree,
      criticalFreeBytes:criticalFree,
      warnUtilization:warnUtil,
      criticalUtilization:criticalUtil
    }
  };
}

export function classifyStorageWriteAdmission(pressure,{scope='HIGH_VOLUME'}={}){
  const state=String(pressure?.state||'UNKNOWN').toUpperCase();
  const highVolume=String(scope||'HIGH_VOLUME').toUpperCase();
  const highVolumeScope=['HIGH_VOLUME','MARKET_FABRIC','RESEARCH_DATA_PLANE'].includes(highVolume);
  if((state==='CRITICAL'||state==='WARN')&&highVolumeScope){
    return {
      allowed:false,
      state,
      scope:highVolume,
      reason:state==='CRITICAL'?'STORAGE_CRITICAL_FAIL_CLOSED':'STORAGE_WARN_BACKPRESSURE',
      availableBytes:Number.isFinite(Number(pressure?.availableBytes))?Number(pressure.availableBytes):null,
      utilization:Number.isFinite(Number(pressure?.utilization))?Number(pressure.utilization):null
    };
  }
  return {
    allowed:true,
    state,
    scope:highVolume,
    reason:state==='WARN'?'STORAGE_WARN_MONITOR':'STORAGE_WRITE_ALLOWED',
    availableBytes:Number.isFinite(Number(pressure?.availableBytes))?Number(pressure.availableBytes):null,
    utilization:Number.isFinite(Number(pressure?.utilization))?Number(pressure.utilization):null
  };
}

export function classifyBoundedResearchDataPlaneWrite(pressure,plane,{
  criticalFreeBytes=48*1024*1024,
  reserveAboveCriticalBytes=24*1024*1024
}={}){
  const base=classifyStorageWriteAdmission(pressure,{scope:'RESEARCH_DATA_PLANE'});
  if(base.allowed||base.state!=='WARN')return base;
  const available=Number(pressure?.availableBytes);
  const fileBytes=Number(plane?.fileBytes);
  const warnBytes=Number(plane?.warnBytes);
  const hardBytes=Number(plane?.hardBytes);
  const critical=Math.max(0,Number(criticalFreeBytes)||0);
  const reserve=Math.max(8*1024*1024,Number(reserveAboveCriticalBytes)||0);
  const freeFloor=critical+reserve;
  const hasFilesystemHeadroom=Number.isFinite(available)&&available>freeFloor;
  const withinPlaneWarnBudget=Number.isFinite(fileBytes)&&Number.isFinite(warnBytes)&&fileBytes<warnBytes;
  const belowHardLimit=Number.isFinite(fileBytes)&&Number.isFinite(hardBytes)&&fileBytes<hardBytes;
  if(hasFilesystemHeadroom&&withinPlaneWarnBudget&&belowHardLimit){
    return {
      ...base,
      allowed:true,
      reason:'STORAGE_WARN_BOUNDED_RDP_HEADROOM',
      fileBytes,
      warnBytes,
      hardBytes,
      freeFloorBytes:freeFloor,
      remainingPlaneWarnBytes:Math.max(0,warnBytes-fileBytes),
      remainingFilesystemHeadroomBytes:Math.max(0,available-freeFloor)
    };
  }
  return {
    ...base,
    fileBytes:Number.isFinite(fileBytes)?fileBytes:null,
    warnBytes:Number.isFinite(warnBytes)?warnBytes:null,
    hardBytes:Number.isFinite(hardBytes)?hardBytes:null,
    freeFloorBytes:freeFloor
  };
}

export async function inspectStoragePressure({
  dataDir='/data',
  warnFreeBytes=96*1024*1024,
  criticalFreeBytes=48*1024*1024,
  warnUtilization=0.82,
  criticalUtilization=0.92
}={}){
  try{
    const fs=await statfs(dataDir,{bigint:true});
    const blockSize=Number(fs.bsize||fs.frsize||4096n);
    const totalBytes=Number(fs.blocks)*blockSize;
    const availableBytes=Number(fs.bavail)*blockSize;
    return {
      ok:true,
      dataDir,
      ...classifyStoragePressure({
        totalBytes,availableBytes,warnFreeBytes,criticalFreeBytes,warnUtilization,criticalUtilization
      })
    };
  }catch(err){
    return {
      ok:false,
      dataDir,
      state:'UNKNOWN',
      error:err instanceof Error?err.message:String(err),
      totalBytes:null,
      usedBytes:null,
      availableBytes:null,
      utilization:null,
      thresholds:{
        warnFreeBytes:Number(warnFreeBytes)||0,
        criticalFreeBytes:Number(criticalFreeBytes)||0,
        warnUtilization:Number(warnUtilization)||0.82,
        criticalUtilization:Number(criticalUtilization)||0.92
      }
    };
  }
}

export const STORAGE_MAINTENANCE_VERSION='TCX_STORAGE_MAINTENANCE_V4';
