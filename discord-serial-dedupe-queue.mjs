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
