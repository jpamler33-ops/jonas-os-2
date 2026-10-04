import { Worker } from 'node:worker_threads';

export const FORECAST_SHADOW_EVALUATION_WORKER_VERSION='TCX_FORECAST_SHADOW_EVALUATION_WORKER_V1';

export const FORECAST_SHADOW_EVALUATION_ADMISSION_VERSION='TCX_FORECAST_SHADOW_EVALUATION_ADMISSION_V3';

export const AUTOLEARN_MEMORY_ADMISSION_VERSION='TCX_AUTOLEARN_MEMORY_ADMISSION_V2';

export function evaluateAutoLearnMemoryAdmission({
  phase='ISSUE',
  heapUsedMb=0,
  rssMb=0,
  externalMb=0,
  issueHeapMb=320,
  issueRssMb=720,
  issueExternalMb=64,
  resumeHeapMb=300,
  resumeRssMb=620,
  resumeExternalMb=48
}={}){
  const normalized=String(phase||'ISSUE').trim().toUpperCase()==='RESUME'?'RESUME':'ISSUE';
  const memory={
    heapUsedMb:Math.max(0,Number(heapUsedMb)||0),
    rssMb:Math.max(0,Number(rssMb)||0),
    externalMb:Math.max(0,Number(externalMb)||0)
  };
  const issue={
    heapUsedMb:Math.max(1,Number(issueHeapMb)||320),
    rssMb:Math.max(1,Number(issueRssMb)||720),
    externalMb:Math.max(1,Number(issueExternalMb)||64)
  };
  const resume={
    heapUsedMb:Math.min(issue.heapUsedMb,Math.max(1,Number(resumeHeapMb)||280)),
    rssMb:Math.min(issue.rssMb,Math.max(1,Number(resumeRssMb)||620)),
    externalMb:Math.min(issue.externalMb,Math.max(1,Number(resumeExternalMb)||48))
  };
  const limits=normalized==='RESUME'?resume:issue;
  const exceeded=[];
  if(memory.heapUsedMb>=limits.heapUsedMb) exceeded.push('HEAP');
  if(memory.rssMb>=limits.rssMb) exceeded.push('RSS');
  if(memory.externalMb>=limits.externalMb) exceeded.push('EXTERNAL');
  return {
    allowed:exceeded.length===0,
    phase:normalized,
    reason:exceeded.length?'MEMORY_PRESSURE':'MEMORY_HEADROOM_AVAILABLE',
    exceeded,
    memory,
    limits
  };
}

export function evaluateShadowWorkerAdmission({
  mode='AUTO',
  heapUsedMb=0,
  rssMb=0,
  externalMb=0,
  autoHeapMb=260,
  autoRssMb=620,
  autoExternalMb=96,
  hardHeapMb=300,
  hardRssMb=900,
  hardExternalMb=160
}={}){
  const normalized=String(mode||'AUTO').trim().toUpperCase();
  const effectiveMode=['0','OFF','FALSE','DISABLED'].includes(normalized)
    ?'OFF'
    :['1','ON','TRUE','ENABLED'].includes(normalized)
      ?'ON'
      :'AUTO';
  const memory={
    heapUsedMb:Math.max(0,Number(heapUsedMb)||0),
    rssMb:Math.max(0,Number(rssMb)||0),
    externalMb:Math.max(0,Number(externalMb)||0)
  };
  const limits={
    autoHeapMb:Math.max(1,Number(autoHeapMb)||260),
    autoRssMb:Math.max(1,Number(autoRssMb)||620),
    autoExternalMb:Math.max(1,Number(autoExternalMb)||96),
    hardHeapMb:Math.max(1,Number(hardHeapMb)||300),
    hardRssMb:Math.max(1,Number(hardRssMb)||900),
    hardExternalMb:Math.max(1,Number(hardExternalMb)||160)
  };

  if(effectiveMode==='OFF'){
    return {allowed:false,mode:effectiveMode,reason:'DISABLED',memory,limits};
  }
  if(
    memory.heapUsedMb>=limits.hardHeapMb||
    memory.rssMb>=limits.hardRssMb||
    memory.externalMb>=limits.hardExternalMb
  ){
    return {allowed:false,mode:effectiveMode,reason:'HARD_MEMORY_PRESSURE',memory,limits};
  }
  if(effectiveMode==='AUTO'&&(
    memory.heapUsedMb>=limits.autoHeapMb||
    memory.rssMb>=limits.autoRssMb||
    memory.externalMb>=limits.autoExternalMb
  )){
    return {allowed:false,mode:effectiveMode,reason:'ADAPTIVE_MEMORY_PRESSURE',memory,limits};
  }
  return {allowed:true,mode:effectiveMode,reason:'MEMORY_HEADROOM_AVAILABLE',memory,limits};
}

export function deriveShadowWorkerReplayPlan({
  mode='AUTO',
  heapUsedMb=0,
  rssMb=0,
  externalMb=0,
  configuredHistoryRows=1200,
  effectiveHistoryRows=1200,
  minHistoryRows=500,
  baseAutoHeapMb=260,
  baseAutoRssMb=620,
  autoExternalMb=64,
  hardExternalMb=160,
  // The serving process now settles around 350-355 MB after guarded GC in production.
  // Keep the strict 370 MB hard gate, but allow the minimum replay window to use
  // a few extra MB of soft headroom instead of starving shadow research forever.
  maxAdaptiveAutoHeapMb=360,
  maxAdaptiveAutoRssMb=720,
  maxAdaptiveHardHeapMb=370,
  hardRssMb=900
}={}){
  const configured=Math.max(1,Math.floor(Number(configuredHistoryRows)||1200));
  const minimum=Math.max(40,Math.min(configured,Math.floor(Number(minHistoryRows)||500)));
  const initial=Math.max(minimum,Math.min(configured,Math.floor(Number(effectiveHistoryRows)||configured)));
  const candidates=[initial];
  if(String(mode||'AUTO').trim().toUpperCase()==='AUTO'){
    for(const ratio of [.80,.65,.50]){
      candidates.push(Math.max(minimum,Math.floor(initial*ratio)));
    }
    candidates.push(minimum);
  }

  const seen=new Set();
  let first=null;
  let last=null;
  for(const rows of candidates){
    if(seen.has(rows)) continue;
    seen.add(rows);
    const replayWindowRatio=Math.max(.25,Math.min(1,rows/configured));
    const adaptiveAutoHeapMb=Math.min(
      Math.max(1,Number(maxAdaptiveAutoHeapMb)||345),
      Math.max(1,Number(baseAutoHeapMb)||260)+Math.round((1-replayWindowRatio)*145)
    );
    const adaptiveAutoRssMb=Math.min(
      Math.max(1,Number(maxAdaptiveAutoRssMb)||720),
      Math.max(1,Number(baseAutoRssMb)||620)+Math.round((1-replayWindowRatio)*140)
    );
    const adaptiveHardHeapMb=Math.min(
      Math.max(1,Number(maxAdaptiveHardHeapMb)||370),
      Math.max(300,adaptiveAutoHeapMb+25)
    );
    const admission=evaluateShadowWorkerAdmission({
      mode,
      heapUsedMb,
      rssMb,
      externalMb,
      autoHeapMb:adaptiveAutoHeapMb,
      autoRssMb:adaptiveAutoRssMb,
      autoExternalMb,
      hardHeapMb:adaptiveHardHeapMb,
      hardRssMb,
      hardExternalMb
    });
    const plan={
      ...admission,
      historyRows:rows,
      configuredHistoryRows:configured,
      replayWindowRatio,
      compacted:rows<initial,
      limits:{
        ...admission.limits,
        effectiveHistoryRows:rows,
        configuredHistoryRows:configured
      }
    };
    if(!first) first=plan;
    last=plan;
    if(admission.allowed){
      return {
        ...plan,
        replayMode:rows<initial?'COMPACT':'FULL',
        initialHistoryRows:initial
      };
    }
    if(admission.reason==='DISABLED'){
      return {
        ...plan,
        replayMode:'DEFERRED',
        initialHistoryRows:initial
      };
    }
    // A candidate replay window can hit its derived hardHeapMb before the
    // absolute serving hard limit is exhausted. In AUTO mode, keep shrinking
    // the replay window so the derived limits can rise toward the bounded
    // maxAdaptiveHardHeapMb. Only genuine absolute hard pressure must stop
    // immediately.
    const absoluteHardPressure=
      memory.heapUsedMb>=Math.max(1,Number(maxAdaptiveHardHeapMb)||370)||
      memory.rssMb>=Math.max(1,Number(hardRssMb)||900)||
      memory.externalMb>=Math.max(1,Number(hardExternalMb)||160);
    if(admission.reason==='HARD_MEMORY_PRESSURE'&&absoluteHardPressure){
      return {
        ...plan,
        replayMode:'DEFERRED',
        initialHistoryRows:initial
      };
    }
  }
  return {
    ...(last||first||evaluateShadowWorkerAdmission({mode,heapUsedMb,rssMb,externalMb})),
    replayMode:'DEFERRED',
    initialHistoryRows:initial,
    historyRows:last?.historyRows??initial,
    configuredHistoryRows:configured,
    compacted:(last?.historyRows??initial)<initial
  };
}

export function forecastHistoryProgressAt(historyRows){
  let latest=0;
  for(const row of Array.isArray(historyRows)?historyRows:[]){
    for(const value of [row?.timestamp,row?.availableAt,row?.resolvedAt]){
      const n=Number(value);
      if(Number.isFinite(n)&&n>latest) latest=n;
    }
  }
  return latest;
}

export function forecastHistoryHasAdvanced(historyRows,previousProgressAt=0){
  return forecastHistoryProgressAt(historyRows)>Math.max(0,Number(previousProgressAt)||0);
}

export function runForecastShadowEvaluationWorker(payload,{
  timeoutMs=8*60_000,
  maxOldGenerationSizeMb=256
}={}){
  return new Promise((resolve,reject)=>{
    const worker=new Worker(new URL('./forecast-shadow-evaluation-worker.mjs',import.meta.url),{
      workerData:payload,
      resourceLimits:{
        maxOldGenerationSizeMb:Math.max(128,Number(maxOldGenerationSizeMb)||256),
        maxYoungGenerationSizeMb:32
      }
    });
    let settled=false;
    const finish=(fn,value)=>{
      if(settled) return;
      settled=true;
      clearTimeout(timer);
      fn(value);
    };
    const timer=setTimeout(()=>{
      worker.terminate().catch(()=>{});
      const e=new Error('FORECAST_SHADOW_WORKER_TIMEOUT');
      e.code='FORECAST_SHADOW_WORKER_TIMEOUT';
      finish(reject,e);
    },Math.max(30_000,Number(timeoutMs)||8*60_000));
    timer.unref?.();

    worker.once('message',message=>{
      worker.terminate().catch(()=>{});
      if(message?.ok===true) finish(resolve,message.result);
      else{
        const e=new Error(String(message?.error||'FORECAST_SHADOW_WORKER_FAILED'));
        if(message?.stack) e.stack=message.stack;
        finish(reject,e);
      }
    });
    worker.once('error',err=>finish(reject,err));
    worker.once('exit',code=>{
      if(!settled&&code!==0) finish(reject,new Error('FORECAST_SHADOW_WORKER_EXIT_'+code));
    });
  });
}
