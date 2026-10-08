export const RUNTIME_MEMORY_ATTRIBUTION_VERSION='BIGGJ_RUNTIME_MEMORY_ATTRIBUTION_V1';

const mb=n=>Math.round((Number(n||0)/1024/1024)*10)/10;

export function runtimeMemorySnapshot(label='runtime'){
  const m=process.memoryUsage();
  const heapSpaces=typeof process.getActiveResourcesInfo==='function'
    ? process.getActiveResourcesInfo()
    : [];
  const resources={};
  for(const name of heapSpaces) resources[name]=(resources[name]||0)+1;
  return Object.freeze({
    version:RUNTIME_MEMORY_ATTRIBUTION_VERSION,
    label:String(label),
    ts:Date.now(),
    rssMb:mb(m.rss),
    heapTotalMb:mb(m.heapTotal),
    heapUsedMb:mb(m.heapUsed),
    externalMb:mb(m.external),
    arrayBuffersMb:mb(m.arrayBuffers),
    nativeApproxMb:Math.max(0,Math.round((mb(m.rss)-mb(m.heapTotal)-mb(m.external))*10)/10),
    activeResources:resources
  });
}

export function memoryDelta(before,after){
  const d=k=>Math.round((Number(after?.[k]||0)-Number(before?.[k]||0))*10)/10;
  return Object.freeze({
    rssMb:d('rssMb'),heapTotalMb:d('heapTotalMb'),heapUsedMb:d('heapUsedMb'),
    externalMb:d('externalMb'),arrayBuffersMb:d('arrayBuffersMb'),nativeApproxMb:d('nativeApproxMb')
  });
}

export function logMemorySnapshot(label,extra={}){
  const snapshot=runtimeMemorySnapshot(label);
  console.log('[BIGGJ_MEMORY_ATTRIBUTION]',JSON.stringify({...snapshot,...extra}));
  return snapshot;
}

export async function withMemoryAttribution(label,fn,extra={}){
  const before=logMemorySnapshot(label+':before',extra);
  try{
    const value=await fn();
    const after=logMemorySnapshot(label+':after',{...extra,delta:memoryDelta(before,runtimeMemorySnapshot(label+':probe'))});
    return value;
  }catch(error){
    const probe=runtimeMemorySnapshot(label+':error-probe');
    console.error('[BIGGJ_MEMORY_ATTRIBUTION_ERROR]',JSON.stringify({label,...extra,delta:memoryDelta(before,probe),snapshot:probe,error:error instanceof Error?error.message:String(error)}));
    throw error;
  }
}
