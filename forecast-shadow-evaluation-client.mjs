import { Worker } from 'node:worker_threads';

export const FORECAST_SHADOW_EVALUATION_WORKER_VERSION='TCX_FORECAST_SHADOW_EVALUATION_WORKER_V1';

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
