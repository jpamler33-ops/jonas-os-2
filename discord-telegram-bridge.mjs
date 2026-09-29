import { Client, GatewayIntentBits, REST, Routes, AttachmentBuilder } from 'discord.js';

export const DISCORD_TELEGRAM_BRIDGE_VERSION='TCX_DISCORD_TELEGRAM_BRIDGE_V1';

const COMMANDS=[
  {name:'start',description:'TCX Command Center öffnen'},
  {name:'help',description:'TCX Befehle anzeigen'},
  {name:'market',description:'Marktübersicht öffnen',options:[symbolOption()]},
  {name:'forecast',description:'TCX Forecast anzeigen',options:[symbolOption()]},
  {name:'chart',description:'Marktchart anzeigen',options:[symbolOption(),{type:3,name:'interval',description:'Zeitrahmen',required:false,choices:['1m','5m','15m','1h','4h'].map(function(x){return {name:x,value:x};})}]},
  {name:'structure',description:'Marktstruktur anzeigen',options:[symbolOption()]},
  {name:'portfolio',description:'Shadow-Portfolio anzeigen'},
  {name:'stats',description:'Shadow-Performance anzeigen',options:[{type:3,name:'period',description:'Zeitraum',required:false,choices:[{name:'Tag',value:'day'},{name:'Woche',value:'week'},{name:'Monat',value:'month'}]}]},
  {name:'why_not_trade',description:'Warum TCX gerade nicht tradet'},
  {name:'data',description:'Daten- und Providerstatus anzeigen'},
  {name:'intelligence',description:'Intelligence-Status für einen Markt',options:[symbolOption()]},
  {name:'memory',description:'Episode Memory für einen Markt',options:[symbolOption()]},
  {name:'evidence',description:'Evidence-Diagnostik für einen Markt',options:[symbolOption()]},
  {name:'validity',description:'Research-Validity für einen Markt',options:[symbolOption()]}
];

function symbolOption(){return {type:3,name:'symbol',description:'z. B. BTC, ETH, SOL',required:true};}
function fakeChatId(guildId,channelId,userId){return 'discord:'+guildId+':'+channelId+':'+userId;}
export function parseDiscordChatId(value){
  const m=/^discord:([^:]+):([^:]+):([^:]+)$/.exec(String(value||''));
  return m?{guildId:m[1],channelId:m[2],userId:m[3]}:null;
}
export function isDiscordChatId(value,guildId){
  const x=parseDiscordChatId(value);
  return Boolean(x&&(!guildId||x.guildId===String(guildId)));
}
function clip(value,max){
  const s=String(value==null?'':value);
  return s.length<=max?s:s.slice(0,max-1)+'…';
}
function splitText(value,max){
  let rest=String(value==null?'':value);
  if(!rest)return [' '];
  const out=[];
  while(rest.length>max){
    let cut=rest.lastIndexOf('\n',max);
    if(cut<max*0.55)cut=rest.lastIndexOf(' ',max);
    if(cut<max*0.55)cut=max;
    out.push(rest.slice(0,cut));
    rest=rest.slice(cut).replace(/^\s+/, '');
  }
  if(rest)out.push(rest);
  return out;
}
function parseMarkup(markup){
  if(typeof markup==='string'){try{return JSON.parse(markup);}catch{return null;}}
  return markup||null;
}
function discordComponents(markup){
  const rows=parseMarkup(markup)?.inline_keyboard;
  if(!Array.isArray(rows))return [];
  const selected=rows.length<=5?rows:rows.slice(0,4).concat(rows.slice(-1));
  return selected.map(function(row){
    const components=(Array.isArray(row)?row:[]).slice(0,5).map(function(b){
      if(b&&b.url)return {type:2,style:5,label:clip(b.text||'Open',80),url:String(b.url)};
      if(b&&b.callback_data)return {type:2,style:2,label:clip(b.text||'Action',80),custom_id:clip(b.callback_data,100)};
      return null;
    }).filter(Boolean);
    return components.length?{type:1,components:components}:null;
  }).filter(Boolean);
}
function commandText(interaction){
  const n=String(interaction.commandName||'').toLowerCase();
  const symbol=interaction.options?.getString('symbol')||'';
  if(n==='market')return '/coin '+symbol;
  if(n==='forecast'||n==='structure'||n==='intelligence'||n==='memory'||n==='evidence'||n==='validity')return '/'+n+' '+symbol;
  if(n==='chart')return '/chart '+symbol+' '+(interaction.options?.getString('interval')||'5m');
  if(n==='stats'){
    const p=interaction.options?.getString('period')||'day';
    return p==='week'?'/weekstats':p==='month'?'/monthstats':'/daystats';
  }
  if(n==='why_not_trade')return '/why_not_trade';
  if(n==='start'||n==='help'||n==='portfolio'||n==='data')return '/'+n;
  return null;
}

export function createDiscordTelegramBridge({token,applicationId,guildId,handleUpdate,logger=console}={}){
  token=String(token||'').trim(); applicationId=String(applicationId||'').trim(); guildId=String(guildId||'').trim();
  if(!token||!applicationId||!guildId||typeof handleUpdate!=='function')throw new Error('DISCORD_BRIDGE_CONFIG_INVALID');
  const client=new Client({intents:[GatewayIntentBits.Guilds]});
  const rest=new REST({version:'10'}).setToken(token);
  const contexts=new Map();
  const state={registered:false,ready:false,botUser:null,lastReadyAt:null,lastInteractionAt:null,lastError:null,commands:COMMANDS.length};
  function fail(scope,err){state.lastError=scope+': '+(err instanceof Error?err.message:String(err));try{logger.error('[TCX_DISCORD]',state.lastError);}catch{}}
  async function channelFor(chatId){const p=parseDiscordChatId(chatId);if(!p)throw new Error('INVALID_DISCORD_CHAT_ID');const c=await client.channels.fetch(p.channelId);if(!c||!c.isTextBased())throw new Error('DISCORD_CHANNEL_NOT_TEXT');return {p,c};}
  async function sendText(chatId,body){
    const ctx=contexts.get(String(chatId)); const chunks=splitText(body.text,2000); let first=null;
    for(let i=0;i<chunks.length;i++){
      const payload={content:chunks[i],allowedMentions:{parse:[]}};
      if(i===0){const comps=discordComponents(body.reply_markup);if(comps.length)payload.components=comps;}
      let msg;
      if(ctx&&!ctx.responded){msg=await ctx.interaction.editReply(payload);ctx.responded=true;}
      else if(ctx)msg=await ctx.interaction.followUp(payload);
      else{const x=await channelFor(chatId);msg=await x.c.send(payload);}
      if(!first)first=msg;
    }
    return {message_id:first?.id||null,chat:{id:chatId},text:String(body.text||'')};
  }
  async function editText(chatId,body){
    const x=await channelFor(chatId); const msg=await x.c.messages.fetch(String(body.message_id));
    const payload={content:clip(body.text,2000),components:discordComponents(body.reply_markup),allowedMentions:{parse:[]}};
    const edited=await msg.edit(payload); return {message_id:edited.id,chat:{id:chatId},text:String(body.text||'')};
  }
  async function sendPhoto(chatId,fields,fileName,fileBuffer,mime){
    const ctx=contexts.get(String(chatId)); const caption=fields.caption??fields.media?.caption??'';
    const attachment=new AttachmentBuilder(fileBuffer,{name:fileName||'chart.png',description:'TCX chart'});
    const payload={content:clip(caption,2000),files:[attachment],components:discordComponents(fields.reply_markup),allowedMentions:{parse:[]}};
    let msg;
    if(ctx&&!ctx.responded){msg=await ctx.interaction.editReply(payload);ctx.responded=true;}
    else if(ctx)msg=await ctx.interaction.followUp(payload);
    else{const x=await channelFor(chatId);msg=await x.c.send(payload);}
    return {message_id:msg?.id||null,chat:{id:chatId},photo:[{}],caption:String(caption)};
  }
  async function editPhoto(chatId,fields,fileName,fileBuffer,mime){
    const x=await channelFor(chatId); const msg=await x.c.messages.fetch(String(fields.message_id));
    const caption=fields.caption??fields.media?.caption??'';
    const attachment=new AttachmentBuilder(fileBuffer,{name:fileName||'chart.png',description:'TCX chart'});
    const edited=await msg.edit({content:clip(caption,2000),attachments:[],files:[attachment],components:discordComponents(fields.reply_markup),allowedMentions:{parse:[]}});
    return {message_id:edited.id,chat:{id:chatId},photo:[{}],caption:String(caption)};
  }
  function handlesTelegramCall(method,body){
    if(method==='answerCallbackQuery')return String(body?.callback_query_id||'').startsWith('discordcb:');
    return isDiscordChatId(body?.chat_id,guildId);
  }
  async function telegramCall(method,body={}){
    if(method==='answerCallbackQuery')return true;
    if(method==='sendMessage')return sendText(body.chat_id,body);
    if(method==='editMessageText')return editText(body.chat_id,body);
    if(method==='deleteMessage'){const x=await channelFor(body.chat_id);const m=await x.c.messages.fetch(String(body.message_id));await m.delete();return true;}
    throw new Error('DISCORD_TELEGRAM_METHOD_UNSUPPORTED:'+method);
  }
  async function telegramMultipart(method,fields,fileField,fileName,fileBuffer,mime='image/png'){
    if(method==='sendPhoto')return sendPhoto(fields.chat_id,fields,fileName,fileBuffer,mime);
    if(method==='editMessageMedia')return editPhoto(fields.chat_id,fields,fileName,fileBuffer,mime);
    throw new Error('DISCORD_TELEGRAM_MULTIPART_UNSUPPORTED:'+method);
  }
  async function onCommand(interaction){
    const text=commandText(interaction); if(!text){await interaction.reply({content:'Unbekannter TCX-Befehl.',ephemeral:true});return;}
    await interaction.deferReply();
    if(String(interaction.guildId)!==guildId){await interaction.editReply('Dieser TCX-Bot ist für einen anderen Server konfiguriert.');return;}
    const chatId=fakeChatId(interaction.guildId,interaction.channelId,interaction.user.id); const ctx={interaction:interaction,responded:false}; contexts.set(chatId,ctx);
    try{await handleUpdate({update_id:'discord:'+interaction.id,message:{message_id:interaction.id,chat:{id:chatId},from:{id:interaction.user.id,username:interaction.user.username},text:text}});if(!ctx.responded)await interaction.editReply('TCX hat keine Ausgabe erzeugt.');}
    catch(err){fail('command',err);try{await interaction.editReply('TCX Discord konnte den Befehl gerade nicht ausführen.');}catch{}}
    finally{contexts.delete(chatId);}
  }
  async function onButton(interaction){
    await interaction.deferUpdate(); if(String(interaction.guildId)!==guildId)return;
    const chatId=fakeChatId(interaction.guildId,interaction.channelId,interaction.user.id); contexts.set(chatId,{interaction:interaction,responded:true});
    try{await handleUpdate({update_id:'discord:'+interaction.id,callback_query:{id:'discordcb:'+interaction.id,from:{id:interaction.user.id,username:interaction.user.username},data:String(interaction.customId||''),message:{message_id:String(interaction.message.id),chat:{id:chatId},text:String(interaction.message.content||''),...(interaction.message.attachments?.size?{photo:[{}]}:{})}}});}
    catch(err){fail('button',err);try{await interaction.followUp({content:'TCX konnte diese Aktion gerade nicht ausführen.',ephemeral:true});}catch{}}
    finally{contexts.delete(chatId);}
  }
  client.on('ready',function(){state.ready=true;state.botUser=client.user?.tag||client.user?.id||null;state.lastReadyAt=Date.now();state.lastError=null;});
  client.on('error',function(err){fail('client',err);});
  client.on('interactionCreate',function(interaction){state.lastInteractionAt=Date.now();if(interaction.isChatInputCommand())void onCommand(interaction);else if(interaction.isButton())void onButton(interaction);});
  async function start(){await rest.put(Routes.applicationGuildCommands(applicationId,guildId),{body:COMMANDS});state.registered=true;await client.login(token);return snapshot();}
  async function stop(){client.destroy();state.ready=false;}
  function snapshot(){return Object.freeze({version:DISCORD_TELEGRAM_BRIDGE_VERSION,...state,guildId:guildId,applicationId:applicationId,contexts:contexts.size});}
  return Object.freeze({start,stop,snapshot,telegramCall,telegramMultipart,handlesTelegramCall,isChatId:function(v){return isDiscordChatId(v,guildId);}});
}
