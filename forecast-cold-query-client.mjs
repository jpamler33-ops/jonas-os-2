import { Worker } from 'node:worker_threads';

export const FORECAST_COLD_QUERY_WORKER_VERSION='TCX_FORECAST_COLD_QUERY_WORKER_V1';

export function runForecastColdQueryWorker(payload,{
  timeoutMs=60_000,
  maxOldGenerationSizeMb=192
}={}){
  return new Promise((resolve,reject)=>{
    const worker=new Worker(new URL('./forecast-cold-query-worker.mjs',import.meta.url),{
      workerData:payload,
      resourceLimits:{
        maxOldGenerationSizeMb:Math.max(96,Number(maxOldGenerationSizeMb)||192),
        maxYoungGenerationSizeMb:24
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
      const e=new Error('FORECAST_COLD_QUERY_TIMEOUT');
      e.code='FORECAST_COLD_QUERY_TIMEOUT';
      finish(reject,e);
    },Math.max(10_000,Number(timeoutMs)||60_000));
    timer.unref?.();

    worker.once('message',message=>{
      worker.terminate().catch(()=>{});
      if(message?.ok===true) finish(resolve,message.result);
      else{
        const e=new Error(String(message?.error||'FORECAST_COLD_QUERY_FAILED'));
        if(message?.code) e.code=message.code;
        finish(reject,e);
      }
    });
    worker.once('error',err=>finish(reject,err));
    worker.once('exit',code=>{
      if(!settled&&code!==0) finish(reject,new Error('FORECAST_COLD_QUERY_WORKER_EXIT_'+code));
    });
  });
}
