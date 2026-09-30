export const TELEGRAM_UPDATE_DISPATCHER_VERSION='TCX_TELEGRAM_UPDATE_DISPATCHER_V1';

function commandName(update){
  const text=String(update?.message?.text||'').trim();
  if(!text.startsWith('/')) return '';
  return text.split(/\s+/)[0].split('@')[0].toLowerCase();
}
function chatKey(update){
  const id=update?.message?.chat?.id??update?.callback_query?.message?.chat?.id;
  return id===undefined||id===null?'GLOBAL':String(id);
}
function timeoutError(ms){
  const e=new Error('TELEGRAM_UPDATE_HANDLER_TIMEOUT_'+ms+'MS');
  e.code='TELEGRAM_UPDATE_HANDLER_TIMEOUT';
  return e;
}
async function withTimeout(promise,ms){
  let timer;
  const timeout=new Promise((_,reject)=>{
    timer=setTimeout(()=>reject(timeoutError(ms)),ms);
  });
  try{return await Promise.race([promise,timeout]);}
  finally{clearTimeout(timer);}
}

export function createTelegramUpdateDispatcher({
  handle,
  timeoutMs=20_000,
  priorityCommands=['/start','/help','/commands'],
  onError=()=>{},
  now=()=>Date.now()
}={}){
  if(typeof handle!=='function') throw new Error('TELEGRAM_HANDLE_REQUIRED');
  const priority=new Set(priorityCommands.map(x=>String(x).toLowerCase()));
  const queues=new Map();
  const state={
    received:0,completed:0,failed:0,timeouts:0,
    inFlight:0,queued:0,
    lastUpdateAt:null,lastCompleteAt:null,lastError:null
  };

  async function run(update){
    state.inFlight++;
    try{
      await withTimeout(Promise.resolve().then(()=>handle(update)),Math.max(10,Number(timeoutMs)||20_000));
      state.completed++;
      state.lastCompleteAt=now();
      return {ok:true};
    }catch(err){
      const message=err instanceof Error?err.message:String(err);
      state.failed++;
      if(err?.code==='TELEGRAM_UPDATE_HANDLER_TIMEOUT') state.timeouts++;
      state.lastError=message;
      try{onError(err,update);}catch{}
      return {ok:false,error:message};
    }finally{
      state.inFlight=Math.max(0,state.inFlight-1);
    }
  }

  function schedule(update){
    state.received++;
    state.lastUpdateAt=now();
    const command=commandName(update);
    if(priority.has(command)) return run(update);

    const key=chatKey(update);
    const previous=queues.get(key)||Promise.resolve();
    state.queued++;
    let next;
    next=previous.catch(()=>{}).then(()=>run(update)).finally(()=>{
      state.queued=Math.max(0,state.queued-1);
      if(queues.get(key)===next) queues.delete(key);
    });
    queues.set(key,next);
    return next;
  }

  async function dispatchBatch(updates){
    const jobs=(Array.isArray(updates)?updates:[]).map(schedule);
    return Promise.allSettled(jobs);
  }

  function snapshot(){
    return Object.freeze({
      version:TELEGRAM_UPDATE_DISPATCHER_VERSION,
      ...state,
      activeChatQueues:queues.size,
      timeoutMs:Math.max(10,Number(timeoutMs)||20_000),
      priorityCommands:[...priority]
    });
  }

  return Object.freeze({dispatchBatch,snapshot});
}
