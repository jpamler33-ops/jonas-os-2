export const TELEGRAM_COMMAND_ROUTER_VERSION="TCX_TELEGRAM_COMMAND_ROUTER_V1";

export function parseTelegramCommand(text){
  const raw=String(text??"").trim();
  if(!raw.startsWith("/")) return null;
  const parts=raw.split(/\s+/);
  const command=String(parts[0]||"").split("@")[0].toLowerCase();
  if(!/^\/[a-z0-9_]+$/i.test(command)) return null;
  return {
    raw,
    command,
    args:parts.slice(1),
    parts
  };
}

export function createTelegramCommandRouter({
  handlers={},
  permitted=()=>true,
  onDenied=null,
  onError=null
}={}){
  const table=new Map();
  for(const [name,handler] of Object.entries(handlers||{})){
    const key=String(name||"").toLowerCase();
    if(!key.startsWith("/")||typeof handler!=="function") continue;
    table.set(key,handler);
  }

  return async function routeTelegramCommand(msg){
    const parsed=parseTelegramCommand(msg?.text);
    if(!parsed) return false;
    const chatId=msg?.chat?.id;
    if(!permitted(chatId)){
      if(typeof onDenied==="function") await onDenied({chatId,msg,...parsed});
      return true;
    }
    const handler=table.get(parsed.command);
    if(!handler) return false;
    try{
      await handler({chatId,msg,...parsed});
    }catch(err){
      if(typeof onError==="function"){
        await onError(err,{chatId,msg,...parsed});
      }else{
        throw err;
      }
    }
    return true;
  };
}

export function commandNames(routerHandlers={}){
  return Object.entries(routerHandlers)
    .filter(([name,handler])=>String(name).startsWith("/")&&typeof handler==="function")
    .map(([name])=>String(name).toLowerCase())
    .sort();
}
