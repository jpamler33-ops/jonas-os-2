export function createSerialDedupeQueue({maxSize=64}={}){
  const pending=new Map();
  const cap=Math.max(1,Math.floor(Number(maxSize)||64));
  let runningKey=null;
  let completed=0;
  let failed=0;
  return {
    enqueue(key,task){
      const k=String(key||'');
      if(!k||typeof task!=='function')return false;
      const depth=pending.size+(runningKey===null?0:1);
      if(runningKey===k||pending.has(k)||depth>=cap)return false;
      pending.set(k,task);
      return true;
    },
    cancel(key){return pending.delete(String(key||''));},
    async drainOne(){
      if(runningKey!==null)return {ran:false,reason:'BUSY'};
      const first=pending.entries().next();
      if(first.done)return {ran:false,reason:'EMPTY'};
      const [key,task]=first.value;
      pending.delete(key);
      runningKey=key;
      try{
        await task();
        completed++;
        return {ran:true,key,ok:true};
      }catch(err){
        failed++;
        return {ran:true,key,ok:false,error:err instanceof Error?err.message:String(err)};
      }finally{
        runningKey=null;
      }
    },
    snapshot(){return {pending:pending.size,runningKey,depth:pending.size+(runningKey===null?0:1),completed,failed,maxSize:cap};}
  };
}


export async function mapWithConcurrency(items,concurrency,worker){
  const rows=Array.isArray(items)?items:[];
  if(typeof worker!=='function')throw new TypeError('worker required');
  const limit=Math.max(1,Math.min(rows.length||1,Math.floor(Number(concurrency)||1)));
  const results=new Array(rows.length);
  let cursor=0;
  async function run(){
    while(true){
      const index=cursor++;
      if(index>=rows.length)return;
      results[index]=await worker(rows[index],index);
    }
  }
  await Promise.all(Array.from({length:limit},()=>run()));
  return results;
}


export function refreshDueFromTimestamps({
  now=Date.now(),
  intervalMs,
  lastRefreshedAt=null,
  messageEditedAt=null,
  messageCreatedAt=null
}={}){
  const interval=Math.max(0,Number(intervalMs)||0);
  if(interval===0)return true;
  const candidates=[lastRefreshedAt,messageEditedAt,messageCreatedAt]
    .map(Number)
    .filter(Number.isFinite);
  if(!candidates.length)return true;
  return Number(now)-Math.max(...candidates)>=interval;
}
