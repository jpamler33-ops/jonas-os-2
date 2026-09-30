export const TELEGRAM_CHAT_LIFECYCLE_VERSION='TCX_TELEGRAM_CHAT_LIFECYCLE_V1';

function finite(v,fallback){
  const n=Number(v);
  return Number.isFinite(n)?n:fallback;
}

export function createTelegramChatLifecycle({
  idleMs=10*60_000,
  maxTrackedUiMessages=24,
  now=()=>Date.now()
}={}){
  const timeoutMs=Math.max(60_000,finite(idleMs,10*60_000));
  const maxTracked=Math.max(1,Math.min(100,Math.floor(finite(maxTrackedUiMessages,24))));
  const chats=new Map();

  function key(chatId){return String(chatId);}

  function ensure(chatId,at=now()){
    const k=key(chatId);
    let s=chats.get(k);
    if(!s){
      s={
        chatId,
        lastActivityAt:Number(at),
        lastResetAt:null,
        resetDone:false,
        resetInFlight:false,
        uiMessageIds:[]
      };
      chats.set(k,s);
    }
    return s;
  }

  function touch(chatId,{at=now()}={}){
    const s=ensure(chatId,at);
    const idleForMs=Math.max(0,Number(at)-Number(s.lastActivityAt||at));
    const wasResetDone=s.resetDone===true;
    const hadExpired=!wasResetDone&&idleForMs>=timeoutMs;
    s.lastActivityAt=Number(at);
    s.resetDone=false;
    s.resetInFlight=false;
    return {
      chatId:s.chatId,
      idleForMs,
      hadExpired,
      wasResetDone,
      trackedUiMessages:s.uiMessageIds.length
    };
  }

  function recordUiMessage(chatId,messageId){
    const id=Number(messageId);
    if(!Number.isInteger(id)||id<=0)return false;
    const s=ensure(chatId);
    s.uiMessageIds=s.uiMessageIds.filter(x=>x!==id);
    s.uiMessageIds.push(id);
    if(s.uiMessageIds.length>maxTracked){
      s.uiMessageIds.splice(0,s.uiMessageIds.length-maxTracked);
    }
    return true;
  }

  function forgetUiMessage(chatId,messageId){
    const s=chats.get(key(chatId));
    if(!s)return false;
    const id=Number(messageId);
    const before=s.uiMessageIds.length;
    s.uiMessageIds=s.uiMessageIds.filter(x=>x!==id);
    return s.uiMessageIds.length!==before;
  }

  function claimExpired({at=now(),limit=50}={}){
    const due=[];
    const cap=Math.max(1,Math.min(500,Math.floor(finite(limit,50))));
    for(const s of chats.values()){
      if(due.length>=cap)break;
      if(s.resetDone||s.resetInFlight)continue;
      const idleForMs=Math.max(0,Number(at)-Number(s.lastActivityAt||at));
      if(idleForMs<timeoutMs)continue;
      s.resetInFlight=true;
      due.push({
        chatId:s.chatId,
        idleForMs,
        uiMessageIds:[...s.uiMessageIds]
      });
    }
    return due;
  }

  function completeReset(chatId,{at=now(),newHomeMessageId=null}={}){
    const s=ensure(chatId,at);
    s.lastResetAt=Number(at);
    s.resetDone=true;
    s.resetInFlight=false;
    s.uiMessageIds=[];
    if(newHomeMessageId!=null)recordUiMessage(chatId,newHomeMessageId);
    return true;
  }

  function failReset(chatId){
    const s=chats.get(key(chatId));
    if(!s)return false;
    s.resetInFlight=false;
    s.resetDone=true;
    s.lastResetAt=now();
    return true;
  }

  function snapshot(){
    const rows=[...chats.values()];
    return Object.freeze({
      version:TELEGRAM_CHAT_LIFECYCLE_VERSION,
      idleMs:timeoutMs,
      maxTrackedUiMessages:maxTracked,
      chats:rows.length,
      active:rows.filter(x=>!x.resetDone).length,
      reset:rows.filter(x=>x.resetDone).length,
      trackedUiMessages:rows.reduce((s,x)=>s+x.uiMessageIds.length,0)
    });
  }

  return Object.freeze({
    idleMs:timeoutMs,
    touch,
    recordUiMessage,
    forgetUiMessage,
    claimExpired,
    completeReset,
    failReset,
    snapshot
  });
}
