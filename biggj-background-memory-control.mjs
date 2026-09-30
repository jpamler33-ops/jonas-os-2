export const BIGGJ_BACKGROUND_MEMORY_CONTROL_VERSION='BIGGJ_BACKGROUND_MEMORY_CONTROL_V1';

const mb=n=>Math.round((Number(n)||0)/1024/1024);

export function memoryUsageMb(value){
  const m=value||{};
  return Object.freeze({
    heapUsedMb:mb(m.heapUsed),
    heapTotalMb:mb(m.heapTotal),
    rssMb:mb(m.rss),
    externalMb:mb(m.external),
    arrayBuffersMb:mb(m.arrayBuffers)
  });
}

export function attemptBackgroundGc({
  gc=globalThis.gc,
  readMemory=()=>process.memoryUsage(),
  now=()=>Date.now(),
  reason='BACKGROUND_MEMORY_PRESSURE'
}={}){
  const before=memoryUsageMb(readMemory());
  if(typeof gc!=='function'){
    return Object.freeze({
      attempted:false,
      available:false,
      reason:String(reason),
      durationMs:0,
      before,
      after:before,
      freedHeapMb:0,
      freedRssMb:0,
      freedExternalMb:0
    });
  }
  const started=Number(now());
  gc();
  const after=memoryUsageMb(readMemory());
  return Object.freeze({
    attempted:true,
    available:true,
    reason:String(reason),
    durationMs:Math.max(0,Number(now())-started),
    before,
    after,
    freedHeapMb:Math.max(0,before.heapUsedMb-after.heapUsedMb),
    freedRssMb:Math.max(0,before.rssMb-after.rssMb),
    freedExternalMb:Math.max(0,before.externalMb-after.externalMb)
  });
}
