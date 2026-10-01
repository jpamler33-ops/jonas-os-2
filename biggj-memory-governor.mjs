export const BIGGJ_MEMORY_GOVERNOR_VERSION='BIGGJ_MEMORY_GOVERNOR_V2';

const finite=(v,f=0)=>Number.isFinite(Number(v))?Number(v):f;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,finite(v,a)));

export function memorySnapshot(memoryUsage=process.memoryUsage()){
  return Object.freeze({
    heapUsedMb:Math.round(finite(memoryUsage?.heapUsed)/1024/1024),
    heapTotalMb:Math.round(finite(memoryUsage?.heapTotal)/1024/1024),
    rssMb:Math.round(finite(memoryUsage?.rss)/1024/1024),
    externalMb:Math.round(finite(memoryUsage?.external)/1024/1024),
    arrayBuffersMb:Math.round(finite(memoryUsage?.arrayBuffers)/1024/1024)
  });
}

export function shouldCollectGarbage(snapshot,{
  triggerHeapMb=320,
  maxRssMb=880,
  maxExternalMb=128,
  cooldownMs=45_000,
  lastAttemptAt=0,
  now=Date.now()
}={}){
  const heapTrigger=Math.max(128,finite(triggerHeapMb,320));
  const rssCeiling=Math.max(256,finite(maxRssMb,880));
  const externalCeiling=Math.max(16,finite(maxExternalMb,128));
  const cooldown=Math.max(5_000,finite(cooldownMs,45_000));
  const t=finite(now,Date.now());
  const last=Math.max(0,finite(lastAttemptAt,0));
  const cooldownReady=t-last>=cooldown;
  const heapHigh=finite(snapshot?.heapUsedMb)>=heapTrigger;
  const rssSafe=finite(snapshot?.rssMb)<rssCeiling;
  const externalSafe=finite(snapshot?.externalMb)<externalCeiling;
  return Object.freeze({
    shouldCollect:Boolean(cooldownReady&&heapHigh&&rssSafe&&externalSafe),
    cooldownReady,
    heapHigh,
    rssSafe,
    externalSafe,
    limits:Object.freeze({
      triggerHeapMb:heapTrigger,
      maxRssMb:rssCeiling,
      maxExternalMb:externalCeiling,
      cooldownMs:cooldown
    })
  });
}

export function createMemoryGovernor({
  gcFn=typeof globalThis.gc==='function'?globalThis.gc:null,
  memoryUsageFn=()=>process.memoryUsage(),
  cooldownMs=45_000,
  minReclaimedMb=4
}={}){
  let lastAttemptAt=0;
  let attempts=0;
  let executed=0;
  let unavailable=0;
  let totalReclaimedHeapMb=0;
  let lastResult=null;

  function maybeCollect({
    reason='UNSPECIFIED',
    triggerHeapMb=320,
    maxRssMb=880,
    maxExternalMb=128,
    now=Date.now()
  }={}){
    const before=memorySnapshot(memoryUsageFn());
    const decision=shouldCollectGarbage(before,{
      triggerHeapMb,maxRssMb,maxExternalMb,cooldownMs,lastAttemptAt,now
    });
    if(!decision.shouldCollect){
      lastResult=Object.freeze({
        attempted:false,
        executed:false,
        reason:String(reason),
        decision,
        before,
        after:before,
        reclaimedHeapMb:0,
        useful:false
      });
      return lastResult;
    }

    lastAttemptAt=finite(now,Date.now());
    attempts++;
    if(typeof gcFn!=='function'){
      unavailable++;
      lastResult=Object.freeze({
        attempted:true,
        executed:false,
        unavailable:true,
        reason:String(reason),
        decision,
        before,
        after:before,
        reclaimedHeapMb:0,
        useful:false
      });
      return lastResult;
    }

    try{
      gcFn();
      executed++;
      const after=memorySnapshot(memoryUsageFn());
      const reclaimed=Math.max(0,before.heapUsedMb-after.heapUsedMb);
      totalReclaimedHeapMb+=reclaimed;
      lastResult=Object.freeze({
        attempted:true,
        executed:true,
        unavailable:false,
        reason:String(reason),
        decision,
        before,
        after,
        reclaimedHeapMb:reclaimed,
        useful:reclaimed>=Math.max(1,finite(minReclaimedMb,4))
      });
      return lastResult;
    }catch(error){
      lastResult=Object.freeze({
        attempted:true,
        executed:false,
        unavailable:false,
        reason:String(reason),
        decision,
        before,
        after:memorySnapshot(memoryUsageFn()),
        reclaimedHeapMb:0,
        useful:false,
        error:error instanceof Error?error.message:String(error)
      });
      return lastResult;
    }
  }

  function collectThenEvaluate({
    reason='UNSPECIFIED',
    triggerHeapMb=320,
    maxRssMb=880,
    maxExternalMb=128,
    now=Date.now(),
    evaluate=null
  }={}){
    const collection=maybeCollect({
      reason,
      triggerHeapMb,
      maxRssMb,
      maxExternalMb,
      now
    });
    // Always re-sample after the collection attempt. This prevents callers from
    // deferring work based on a stale pre-GC snapshot when GC reclaimed enough
    // headroom to make the operation safe.
    const postCollection=memorySnapshot(memoryUsageFn());
    const admission=typeof evaluate==='function'
      ?evaluate(postCollection)
      :Object.freeze({allowed:true,reason:'NO_ADMISSION_EVALUATOR',memory:postCollection});
    return Object.freeze({collection,postCollection,admission});
  }

  function summary(){
    return Object.freeze({
      version:BIGGJ_MEMORY_GOVERNOR_VERSION,
      gcAvailable:typeof gcFn==='function',
      cooldownMs:Math.max(5_000,finite(cooldownMs,45_000)),
      attempts,
      executed,
      unavailable,
      totalReclaimedHeapMb,
      lastAttemptAt:lastAttemptAt||null,
      lastResult,
      semantics:Object.freeze({
        onlyReclaimsUnreachableRuntimeObjects:true,
        doesNotDeleteResearchHistory:true,
        doesNotRelaxMemoryHardLimits:true,
        stopTheWorldGcRateLimited:true,
        postCollectionAdmissionRemeasured:true
      })
    });
  }

  return Object.freeze({maybeCollect,collectThenEvaluate,summary});
}
