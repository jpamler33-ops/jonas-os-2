import { compactResearchDataPlane, cleanupResearchCompactionArtifacts } from './research-data-plane-maintenance.mjs';
import { inspectStoragePressure } from './storage-maintenance.mjs';

export const BIGGJ_MEMORY_GOVERNOR_VERSION='BIGGJ_MEMORY_GOVERNOR_V3';

const finite=(v,f=0)=>Number.isFinite(Number(v))?Number(v):f;

export function memorySnapshot(memoryUsage=process.memoryUsage()){
  return Object.freeze({heapUsedMb:Math.round(finite(memoryUsage?.heapUsed)/1048576),heapTotalMb:Math.round(finite(memoryUsage?.heapTotal)/1048576),rssMb:Math.round(finite(memoryUsage?.rss)/1048576),externalMb:Math.round(finite(memoryUsage?.external)/1048576),arrayBuffersMb:Math.round(finite(memoryUsage?.arrayBuffers)/1048576)});
}

export function shouldCollectGarbage(snapshot,{triggerHeapMb=320,maxRssMb=880,maxExternalMb=128,cooldownMs=45_000,cooldownBypassOverageMb=null,lastAttemptAt=0,now=Date.now()}={}){
  const heapTrigger=Math.max(128,finite(triggerHeapMb,320));
  const rssCeiling=Math.max(256,finite(maxRssMb,880));
  const externalCeiling=Math.max(16,finite(maxExternalMb,128));
  const cooldown=Math.max(5_000,finite(cooldownMs,45_000));
  const t=finite(now,Date.now()),last=Math.max(0,finite(lastAttemptAt,0));
  const cooldownReady=t-last>=cooldown,heapUsed=finite(snapshot?.heapUsedMb),heapHigh=heapUsed>=heapTrigger;
  const rssSafe=finite(snapshot?.rssMb)<rssCeiling,externalSafe=finite(snapshot?.externalMb)<externalCeiling;
  const bypassDelta=cooldownBypassOverageMb!=null&&Number.isFinite(Number(cooldownBypassOverageMb))?Math.max(5,Number(cooldownBypassOverageMb)):null;
  const cooldownBypassed=!cooldownReady&&bypassDelta!=null&&heapUsed>=heapTrigger+bypassDelta&&rssSafe&&externalSafe;
  return Object.freeze({shouldCollect:Boolean((cooldownReady||cooldownBypassed)&&heapHigh&&rssSafe&&externalSafe),cooldownReady,cooldownBypassed,heapHigh,rssSafe,externalSafe,limits:Object.freeze({triggerHeapMb:heapTrigger,maxRssMb:rssCeiling,maxExternalMb:externalCeiling,cooldownMs:cooldown,cooldownBypassOverageMb:bypassDelta})});
}

export function createMemoryGovernor({gcFn=typeof globalThis.gc==='function'?globalThis.gc:null,memoryUsageFn=()=>process.memoryUsage(),cooldownMs=45_000,minReclaimedMb=4}={}){
  let lastAttemptAt=0,attempts=0,executed=0,unavailable=0,totalReclaimedHeapMb=0,lastResult=null;
  function maybeCollect({reason='UNSPECIFIED',triggerHeapMb=320,maxRssMb=880,maxExternalMb=128,cooldownBypassOverageMb=null,now=Date.now()}={}){
    const before=memorySnapshot(memoryUsageFn());
    const decision=shouldCollectGarbage(before,{triggerHeapMb,maxRssMb,maxExternalMb,cooldownMs,cooldownBypassOverageMb,lastAttemptAt,now});
    if(!decision.shouldCollect)return lastResult=Object.freeze({attempted:false,executed:false,reason:String(reason),decision,before,after:before,reclaimedHeapMb:0,useful:false});
    lastAttemptAt=finite(now,Date.now());attempts++;
    if(typeof gcFn!=='function'){unavailable++;return lastResult=Object.freeze({attempted:true,executed:false,unavailable:true,reason:String(reason),decision,before,after:before,reclaimedHeapMb:0,useful:false});}
    try{gcFn();executed++;const after=memorySnapshot(memoryUsageFn());const reclaimed=Math.max(0,before.heapUsedMb-after.heapUsedMb);totalReclaimedHeapMb+=reclaimed;return lastResult=Object.freeze({attempted:true,executed:true,unavailable:false,reason:String(reason),decision,before,after,reclaimedHeapMb:reclaimed,useful:reclaimed>=Math.max(1,finite(minReclaimedMb,4))});}
    catch(error){return lastResult=Object.freeze({attempted:true,executed:false,unavailable:false,reason:String(reason),decision,before,after:memorySnapshot(memoryUsageFn()),reclaimedHeapMb:0,useful:false,error:error instanceof Error?error.message:String(error)});}
  }
  function summary(){return Object.freeze({version:BIGGJ_MEMORY_GOVERNOR_VERSION,gcAvailable:typeof gcFn==='function',cooldownMs:Math.max(5_000,finite(cooldownMs,45_000)),attempts,executed,unavailable,totalReclaimedHeapMb,lastAttemptAt:lastAttemptAt||null,lastResult,semantics:Object.freeze({onlyReclaimsUnreachableRuntimeObjects:true,doesNotDeleteResearchHistory:true,doesNotRelaxMemoryHardLimits:true,stopTheWorldGcRateLimited:true})});}
  return Object.freeze({maybeCollect,summary});
}

let researchMaintenanceInstalled=false,researchMaintenanceRunning=false;

export function installResearchDataPlaneMaintenance({dataDir=process.env.RAILWAY_VOLUME_MOUNT_PATH||process.env.TCX_DATA_DIR||'/data',intervalMs=Math.max(15_000,finite(process.env.TCX_RDP_COMPACTION_CHECK_MS,30_000)),triggerBytes=Math.max(32*1048576,finite(process.env.TCX_RDP_COMPACTION_TRIGGER_BYTES,64*1048576)),targetBytes=Math.max(8*1048576,finite(process.env.TCX_RDP_COMPACTION_TARGET_BYTES,24*1048576)),minFreeBytes=Math.max(64*1048576,finite(process.env.TCX_RDP_MIN_FREE_BYTES,128*1048576)),logger=console}={}){
  if(researchMaintenanceInstalled)return false;researchMaintenanceInstalled=true;
  const run=async phase=>{if(researchMaintenanceRunning)return;researchMaintenanceRunning=true;try{
    await cleanupResearchCompactionArtifacts({dataDir});
    const pressure=await inspectStoragePressure({dataDir});
    const result=await compactResearchDataPlane({dataDir,triggerBytes,targetBytes,minFreeBytes,pressure,logger});
    if(result?.compacted)logger.info?.('[TCX_RDP_RUNTIME_MAINTENANCE]',JSON.stringify({...result,phase,storagePressure:pressure?.state||'UNKNOWN',availableBytes:pressure?.availableBytes??null}));
  }catch(error){logger.error?.('[TCX_RDP_RUNTIME_MAINTENANCE_FAILED]',JSON.stringify({phase,error:error instanceof Error?error.message:String(error),destructiveRetention:false}));}finally{researchMaintenanceRunning=false;}};
  void run('startup');const timer=setInterval(()=>void run('interval'),intervalMs);timer.unref?.();return true;
}

if(String(process.env.TCX_RDP_AUTO_COMPACTION_ENABLED||'1')!=='0')installResearchDataPlaneMaintenance();
