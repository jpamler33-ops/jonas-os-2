export function normalizeMarketSymbol(market){
  if(typeof market==='string') return market.toUpperCase();
  const symbol=String(market?.symbol||'').trim().toUpperCase();
  if(!symbol) throw new Error('market symbol required');
  return symbol;
}

export function buildCommandMarketRows(markets,command,{symbolLabel=(s)=>s,limit=12}={}){
  const rows=[];
  const buttons=(Array.isArray(markets)?markets:[]).slice(0,limit).map(m=>{
    const symbol=normalizeMarketSymbol(m);
    return {
      text:String(symbolLabel(symbol)),
      callback_data:'cmdrun:'+String(command)+':'+symbol
    };
  });
  for(let i=0;i<buttons.length;i+=2) rows.push(buttons.slice(i,i+2));
  rows.push([
    {text:'⬅️ Funktionen',callback_data:'commands'},
    {text:'🏠 Start',callback_data:'home'}
  ]);
  return rows;
}

export function isTelegramTextEditFallbackError(err){
  const msg=err instanceof Error?err.message:String(err);
  return (
    msg.includes('there is no text in the message to edit') ||
    msg.includes('message to edit not found') ||
    msg.includes("message can't be edited")
  );
}

export async function deliverTelegramTextCard(tg,chatId,messageId,payload){
  if(typeof tg!=='function') throw new Error('tg function required');
  const base={...payload,chat_id:chatId};
  if(!messageId) return tg('sendMessage',base);
  try{
    return await tg('editMessageText',{...base,message_id:messageId});
  }catch(err){
    if(isTelegramTextEditFallbackError(err)) return tg('sendMessage',base);
    throw err;
  }
}
