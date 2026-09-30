export const RESEARCH_PROVIDER_FANOUT_VERSION='TCX_RESEARCH_PROVIDER_FANOUT_V1';

function errorMessage(err){
  return err instanceof Error?err.message:String(err);
}

export async function runResearchProviderFanout(tasks,{now=()=>Date.now()}={}){
  if(!Array.isArray(tasks)) throw new Error('RESEARCH_FANOUT_TASKS_REQUIRED');
  const rows=tasks.filter(Boolean).map((task,index)=>{
    if(typeof task?.run!=='function') throw new Error('RESEARCH_FANOUT_RUN_REQUIRED:'+index);
    const id=String(task.id||'').trim();
    if(!id) throw new Error('RESEARCH_FANOUT_ID_REQUIRED:'+index);
    return {id,run:task.run};
  });
  const ids=new Set();
  for(const task of rows){
    if(ids.has(task.id)) throw new Error('RESEARCH_FANOUT_DUPLICATE_ID:'+task.id);
    ids.add(task.id);
  }

  const startedAt=Number(now());
  const settled=await Promise.all(rows.map(async task=>{
    const taskStartedAt=Number(now());
    try{
      const value=await task.run();
      const finishedAt=Number(now());
      return {
        id:task.id,
        status:'FULFILLED',
        value,
        error:null,
        startedAt:taskStartedAt,
        finishedAt,
        durationMs:Math.max(0,finishedAt-taskStartedAt)
      };
    }catch(err){
      const finishedAt=Number(now());
      return {
        id:task.id,
        status:'REJECTED',
        value:null,
        error:errorMessage(err),
        startedAt:taskStartedAt,
        finishedAt,
        durationMs:Math.max(0,finishedAt-taskStartedAt)
      };
    }
  }));
  const finishedAt=Number(now());
  const results={};
  let fulfilled=0,rejected=0;
  for(const row of settled){
    results[row.id]=row;
    if(row.status==='FULFILLED') fulfilled++;
    else rejected++;
  }
  return Object.freeze({
    version:RESEARCH_PROVIDER_FANOUT_VERSION,
    startedAt,
    finishedAt,
    durationMs:Math.max(0,finishedAt-startedAt),
    taskCount:settled.length,
    fulfilled,
    rejected,
    results:Object.freeze(results)
  });
}
