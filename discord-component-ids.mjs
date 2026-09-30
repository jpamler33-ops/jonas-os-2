export const DISCORD_COMPONENT_IDS_VERSION='TCX_DISCORD_COMPONENT_IDS_V1';

function clip(value,max){
  const s=String(value==null?'':value);
  return s.length<=max?s:s.slice(0,max-1)+'…';
}
function parseMarkup(markup){
  if(typeof markup==='string'){
    try{return JSON.parse(markup);}catch{return null;}
  }
  return markup||null;
}

export function encodeDiscordCallbackCustomId(callbackData,duplicateIndex=0){
  const raw=String(callbackData||'');
  if(!raw)return null;
  if(Number(duplicateIndex)<=0)return raw.length<=100?raw:null;
  const encoded=Buffer.from(raw,'utf8').toString('base64url');
  const id='tcxd1:'+Math.max(1,Math.floor(Number(duplicateIndex)||1))+':'+encoded;
  return id.length<=100?id:null;
}

export function decodeDiscordCallbackCustomId(value){
  const s=String(value||'');
  const m=/^tcxd1:\d+:([A-Za-z0-9_-]+)$/.exec(s);
  if(!m)return s;
  try{return Buffer.from(m[1],'base64url').toString('utf8');}catch{return s;}
}

export function discordComponents(markup){
  const rows=parseMarkup(markup)?.inline_keyboard;
  if(!Array.isArray(rows))return [];
  const selected=rows.length<=5?rows:rows.slice(0,4).concat(rows.slice(-1));
  const counts=new Map(),usedIds=new Set();
  return selected.map(function(row){
    const components=(Array.isArray(row)?row:[]).slice(0,5).map(function(button){
      if(button&&button.url)return {type:2,style:5,label:clip(button.text||'Open',80),url:String(button.url)};
      if(button&&button.callback_data){
        const raw=String(button.callback_data);
        let occurrence=counts.get(raw)||0;
        let customId=encodeDiscordCallbackCustomId(raw,occurrence);
        while(customId&&usedIds.has(customId)){
          occurrence++;
          customId=encodeDiscordCallbackCustomId(raw,occurrence);
        }
        counts.set(raw,occurrence+1);
        if(!customId)return null;
        usedIds.add(customId);
        return {type:2,style:2,label:clip(button.text||'Action',80),custom_id:customId};
      }
      return null;
    }).filter(Boolean);
    return components.length?{type:1,components}:null;
  }).filter(Boolean);
}
