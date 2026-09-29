import {
  AttachmentBuilder,
  ChannelType,
  Client,
  Events,
  GatewayIntentBits,
  PermissionsBitField,
  REST,
  Routes
} from 'discord.js';

export const DISCORD_TELEGRAM_BRIDGE_VERSION='TCX_DISCORD_COMMAND_CENTER_V2';

const SYMBOL_CHOICES=['BTC','ETH','SOL','BNB','XRP','DOGE','ADA','LINK','AVAX','DOT','LTC','TRX','PEPE','SHIB','BONK','WIF','FLOKI'];
function symbolOption(){return {type:3,name:'symbol',description:'z. B. BTC, ETH, SOL',required:true,choices:SYMBOL_CHOICES.slice(0,17).map(x=>({name:x,value:x}))};}
function intervalOption(){return {type:3,name:'interval',description:'Zeitrahmen',required:false,choices:['1m','5m','15m','1h','4h'].map(x=>({name:x,value:x}))};}

const COMMANDS=[
  {name:'start',description:'TCX Command Center öffnen'},
  {name:'help',description:'TCX Befehle anzeigen'},
  {name:'setup',description:'TCX Discord Command Center einrichten'},
  {name:'system',description:'TCX Systemstatus anzeigen'},
  {name:'market',description:'Marktübersicht öffnen',options:[symbolOption()]},
  {name:'forecast',description:'TCX Forecast anzeigen',options:[symbolOption()]},
  {name:'chart',description:'Marktchart anzeigen',options:[symbolOption(),intervalOption()]},
  {name:'superchart',description:'TCX SuperChart öffnen',options:[symbolOption(),intervalOption()]},
  {name:'deep',description:'Deep-Dive Analysezentrum öffnen',options:[symbolOption()]},
  {name:'flow',description:'Flow Radar öffnen',options:[symbolOption()]},
  {name:'liquidations',description:'Liquidation Heatmap öffnen',options:[symbolOption()]},
  {name:'xray',description:'Market X-Ray öffnen',options:[symbolOption()]},
  {name:'events',description:'Structure Events öffnen',options:[symbolOption()]},
  {name:'structure',description:'Marktstruktur anzeigen',options:[symbolOption()]},
  {name:'portfolio',description:'Shadow-Portfolio anzeigen'},
  {name:'performance',description:'Shadow-Performance anzeigen',options:[{type:3,name:'period',description:'Zeitraum',required:false,choices:[{name:'Tag',value:'day'},{name:'Woche',value:'week'},{name:'Monat',value:'month'}]}]},
  {name:'stats',description:'Shadow-Performance anzeigen',options:[{type:3,name:'period',description:'Zeitraum',required:false,choices:[{name:'Tag',value:'day'},{name:'Woche',value:'week'},{name:'Monat',value:'month'}]}]},
  {name:'why_not_trade',description:'Warum TCX gerade nicht tradet'},
  {name:'data',description:'Daten- und Providerstatus anzeigen'},
  {name:'intelligence',description:'Intelligence-Status für einen Markt',options:[symbolOption()]},
  {name:'memory',description:'Episode Memory für einen Markt',options:[symbolOption()]},
  {name:'evidence',description:'Evidence-Diagnostik für einen Markt',options:[symbolOption()]},
  {name:'validity',description:'Research-Validity für einen Markt',options:[symbolOption()]}
];

const SERVER_BLUEPRINT=[
  {category:'🏠 START',channels:[
    ['start-here','Startpunkt, Navigation und wichtigste TCX-Befehle'],
    ['tcx-terminal','Live Command Center und Systemübersicht']
  ]},
  {category:'📊 MARKETS',channels:[
    ['market-overview','Schneller Marktüberblick und Coin-Navigation'],
    ['btc','BTC Research und Analysen'],
    ['eth','ETH Research und Analysen'],
    ['sol','SOL Research und Analysen'],
    ['altcoins','Altcoin Research'],
    ['memecoins','Memecoin Research']
  ]},
  {category:'🧠 INTELLIGENCE',channels:[
    ['forecasts','Forecast-Ausgaben und Revisionen'],
    ['market-regime','Regime- und Strukturwechsel'],
    ['whale-flow','Flow- und Entity-Intelligence'],
    ['liquidations','Liquidation- und Confluence-Ansichten'],
    ['global-events','Globale Markt-Events'],
    ['anomalies','Anomalien und Research-Hinweise']
  ]},
  {category:'👻 SHADOW TRADING',channels:[
    ['live-trades','Neue Shadow-Trades und laufende Positionen'],
    ['closed-trades','Abgeschlossene Shadow-Trades'],
    ['performance','Live Performance Panel'],
    ['trade-replay','Trade-Replay und Post-Mortem']
  ]},
  {category:'🧬 LEARNING',channels:[
    ['what-tcx-learned','Neue bestätigte Lernsignale'],
    ['pattern-discovery','Pattern Research'],
    ['failed-predictions','Fehleranalyse und Invalidation'],
    ['experiments','Shadow Experiments und Modelltests']
  ]},
  {category:'🚨 ALERTS',channels:[
    ['critical-alerts','Kritische System- und Datenwarnungen'],
    ['trade-alerts','Shadow Trade Alerts'],
    ['market-alerts','Markt- und Regimealerts']
  ]},
  {category:'⚙️ SYSTEM',channels:[
    ['system-status','TCX Runtime Status'],
    ['data-health','Datenquellen und Research Health'],
    ['errors','Technische Fehler und Diagnose']
  ]}
];

function normalizeSymbol(value){
  const raw=String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  if(!raw)return null;
  return raw.endsWith('USDT')?raw:raw+'USDT';
}
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
    return components.length?{type:1,components}:null;
  }).filter(Boolean);
}
function quickRows(){
  return [
    {type:1,components:[
      {type:2,style:1,label:'BTC',custom_id:'market:BTCUSDT'},
      {type:2,style:1,label:'ETH',custom_id:'market:ETHUSDT'},
      {type:2,style:1,label:'SOL',custom_id:'market:SOLUSDT'}
    ]},
    {type:1,components:[
      {type:2,style:2,label:'Portfolio',custom_id:'home:portfolio'},
      {type:2,style:2,label:'Performance',custom_id:'home:stats_day'},
      {type:2,style:2,label:'Global Intel',custom_id:'home:news'},
      {type:2,style:2,label:'System',custom_id:'home:more'}
    ]}
  ];
}
function deepRows(symbol){
  const s=normalizeSymbol(symbol);
  return [
    {type:1,components:[
      {type:2,style:1,label:'SuperChart',custom_id:'superchart:'+s+':PRO:5m'},
      {type:2,style:2,label:'Forecast',custom_id:'forecast:'+s},
      {type:2,style:2,label:'Flow',custom_id:'flow:'+s}
    ]},
    {type:1,components:[
      {type:2,style:2,label:'Liquidations',custom_id:'liqmap:'+s+':5m'},
      {type:2,style:2,label:'X-Ray',custom_id:'xray:'+s},
      {type:2,style:2,label:'Events',custom_id:'events:'+s}
    ]}
  ];
}
function number(value,digits=2){
  const n=Number(value);
  return Number.isFinite(n)?n.toLocaleString('de-DE',{maximumFractionDigits:digits}):'—';
}
function pct(value,digits=2){
  const n=Number(value);
  return Number.isFinite(n)?(n*100).toLocaleString('de-DE',{maximumFractionDigits:digits})+'%':'—';
}
function systemPanel(snapshot={}){
  const h=snapshot.health||{},p=snapshot.portfolio||{},d=snapshot.discovery||{};
  const op=h.operationalReadiness||{},forecast=h.institutionalForecastRuntime||{},discord=h.discordBridge||{};
  const ready=op.ready===true||String(op.state||op.status||'').toUpperCase()==='READY';
  return [
    'TCX // DISCORD COMMAND CENTER',
    '━━━━━━━━━━━━━━━━━━━━',
    'SYSTEM        '+(ready?'● ONLINE':'◐ CHECK'),
    'DISCORD       '+(discord.ready===true?'● CONNECTED':'● ACTIVE'),
    'MODE          SHADOW_ONLY',
    '',
    'OPEN TRADES   '+number(p.openPositions,0),
    'CLOSED        '+number(p.closedTrades,0),
    'EQUITY        '+number(p.equityQuote,2)+' USDT',
    'NET PNL       '+number(p.netPnlQuote,2)+' USDT',
    'WIN RATE      '+pct(p.winRate,1),
    '',
    'FORECASTS     '+number(forecast.journalStore?.count??forecast.journalEntries,0),
    'EPISODES      '+number(h.episodeMemory?.total,0),
    'EVIDENCE      '+number(h.evidenceHistory?.total,0),
    'SCAN COINS    '+number(d.checkedCoins,0),
    '',
    'MARKET → FORECAST → WHY → RISK → DEEP DIVE',
    'REAL ORDERS BLOCKED',
    '',
    'Updated <t:'+Math.floor(Date.now()/1000)+':R>'
  ].join('\n');
}
function performancePanel(snapshot={}){
  const p=snapshot.portfolio||{};
  return [
    'TCX // SHADOW PERFORMANCE',
    '━━━━━━━━━━━━━━━━━━━━',
    'Equity        '+number(p.equityQuote,2)+' USDT',
    'Net PnL       '+number(p.netPnlQuote,2)+' USDT',
    'Return        '+pct(p.returnPct,2),
    'Open          '+number(p.openPositions,0),
    'Closed        '+number(p.closedTrades,0),
    'Wins/Losses   '+number(p.wins,0)+' / '+number(p.losses,0),
    'Winrate       '+pct(p.winRate,1),
    'Profit Factor '+number(p.profitFactor,2),
    'Expectancy    '+number(p.expectancyQuote,2)+' USDT',
    'Max Drawdown  '+pct(p.maxDrawdownPct,2),
    '',
    'Research / simulation only · SHADOW_ONLY',
    'Updated <t:'+Math.floor(Date.now()/1000)+':R>'
  ].join('\n');
}
function systemHealthPanel(snapshot={}){
  const h=snapshot.health||{},op=h.operationalReadiness||{},fabric=h.marketDataFabric||{},oms=h.shadowOms||{};
  return [
    'TCX // SYSTEM STATUS',
    '━━━━━━━━━━━━━━━━━━━━',
    'Readiness       '+String(op.state||op.status||(op.ready?'READY':'CHECK')),
    'Audit Ledger    '+(h.institutionalKernel?.ledgerHealthy?'HEALTHY':'CHECK'),
    'Market Fabric   '+(fabric.healthy?'HEALTHY':'CHECK'),
    'Shadow OMS      '+(oms.healthy?'HEALTHY':'CHECK'),
    'Episode Memory  '+(h.episodeMemory?.healthy?'HEALTHY':'CHECK'),
    'Evidence Store  '+(h.evidenceHistory?.healthy?'HEALTHY':'CHECK'),
    'Discord         '+(h.discordBridge?.ready?'CONNECTED':'ACTIVE'),
    'Telegram        '+(h.telegramPolling?.lastPollError?'CHECK':'ACTIVE'),
    '',
    'Execution       SHADOW_ONLY',
    'canExecuteLive  false',
    'Updated <t:'+Math.floor(Date.now()/1000)+':R>'
  ].join('\n');
}
function startPanel(){
  return [
    'TCX // START HERE',
    '━━━━━━━━━━━━━━━━━━━━',
    'Discord ist das TCX Command Center. Telegram bleibt der schnelle Mobile Controller.',
    '',
    'SCHNELLSTART',
    '/market BTC      Marktkarte',
    '/forecast BTC    Forecast',
    '/superchart BTC  Vollchart',
    '/deep BTC        Analysezentrum',
    '/portfolio       Shadow-Positionen',
    '/performance     Performance',
    '/system          Runtime-Status',
    '',
    'Alle Trading-Aktionen bleiben Simulation/Research.',
    'SHADOW_ONLY · REAL ORDERS BLOCKED'
  ].join('\n');
}
function marketOverviewPanel(){
  return [
    'TCX // MARKET CENTER',
    '━━━━━━━━━━━━━━━━━━━━',
    'Wähle einen Markt oder nutze /market, /forecast, /superchart und /deep.',
    '',
    'Core Märkte: BTC · ETH · SOL',
    'Weitere Märkte: BNB · XRP · DOGE · ADA · LINK · AVAX · DOT · LTC · TRX',
    'Memecoins: PEPE · SHIB · BONK · WIF · FLOKI',
    '',
    'Daten werden erst bei Abruf/Research ausgewertet. Keine erfundenen Live-Werte.',
    'SHADOW_ONLY'
  ].join('\n');
}
function commandText(interaction){
  const n=String(interaction.commandName||'').toLowerCase();
  const symbol=interaction.options?.getString('symbol')||'';
  if(n==='market')return '/coin '+symbol;
  if(n==='forecast'||n==='structure'||n==='intelligence'||n==='memory'||n==='evidence'||n==='validity')return '/'+n+' '+symbol;
  if(n==='chart')return '/chart '+symbol+' '+(interaction.options?.getString('interval')||'5m');
  if(n==='performance'||n==='stats'){
    const p=interaction.options?.getString('period')||'day';
    return p==='week'?'/weekstats':p==='month'?'/monthstats':'/daystats';
  }
  if(n==='why_not_trade')return '/why_not_trade';
  if(n==='start'||n==='help'||n==='portfolio'||n==='data')return '/'+n;
  return null;
}
function callbackCommand(interaction){
  const n=String(interaction.commandName||'').toLowerCase();
  const s=normalizeSymbol(interaction.options?.getString('symbol'));
  if(!s)return null;
  if(n==='superchart')return 'superchart:'+s+':PRO:'+(interaction.options?.getString('interval')||'5m');
  if(n==='deep')return 'deep:'+s;
  if(n==='flow')return 'flow:'+s;
  if(n==='liquidations')return 'liqmap:'+s+':5m';
  if(n==='xray')return 'xray:'+s;
  if(n==='events')return 'events:'+s;
  return null;
}

export function createDiscordTelegramBridge({
  token,
  applicationId,
  guildId,
  handleUpdate,
  getMissionControl=null,
  logger=console,
  autoSetup=true,
  panelRefreshMs=60_000
}={}){
  token=String(token||'').trim();
  applicationId=String(applicationId||'').trim();
  guildId=String(guildId||'').trim();
  if(!token||!applicationId||!guildId||typeof handleUpdate!=='function')throw new Error('DISCORD_BRIDGE_CONFIG_INVALID');

  const client=new Client({intents:[GatewayIntentBits.Guilds]});
  const rest=new REST({version:'10'}).setToken(token);
  const contexts=new Map();
  const channelIds=new Map();
  let panelTimer=null;
  let tradeStateInitialized=false;
  const knownOpen=new Set();
  const knownClosed=new Set();

  const state={
    registered:false,
    ready:false,
    botUser:null,
    lastReadyAt:null,
    lastInteractionAt:null,
    lastError:null,
    commands:COMMANDS.length,
    setupState:'NOT_RUN',
    setupError:null,
    channelsCreated:0,
    panelsUpdated:0,
    lastPanelSyncAt:null,
    tradeFeedInitialized:false
  };

  function fail(scope,err){
    const message=err instanceof Error?err.message:String(err);
    state.lastError=scope+': '+message;
    try{logger.error('[TCX_DISCORD]',state.lastError);}catch{}
  }
  async function guild(){
    return client.guilds.cache.get(guildId)||client.guilds.fetch(guildId);
  }
  async function channelFor(chatId){
    const p=parseDiscordChatId(chatId);
    if(!p)throw new Error('INVALID_DISCORD_CHAT_ID');
    const c=await client.channels.fetch(p.channelId);
    if(!c||!c.isTextBased())throw new Error('DISCORD_CHANNEL_NOT_TEXT');
    return {p,c};
  }
  async function sendText(chatId,body){
    const ctx=contexts.get(String(chatId));
    const chunks=splitText(body.text,2000);
    let first=null;
    for(let i=0;i<chunks.length;i++){
      const payload={content:chunks[i],allowedMentions:{parse:[]}};
      if(i===0){
        const comps=discordComponents(body.reply_markup);
        if(comps.length)payload.components=comps;
      }
      let msg;
      if(ctx&&!ctx.responded){
        msg=await ctx.interaction.editReply(payload);
        ctx.responded=true;
        ctx.outputCount=(ctx.outputCount||0)+1;
      }else if(ctx){
        msg=await ctx.interaction.followUp(payload);
        ctx.outputCount=(ctx.outputCount||0)+1;
      }else{
        const x=await channelFor(chatId);
        msg=await x.c.send(payload);
      }
      if(!first)first=msg;
    }
    return {message_id:first?.id||null,chat:{id:chatId},text:String(body.text||'')};
  }
  async function editText(chatId,body){
    const x=await channelFor(chatId);
    const msg=await x.c.messages.fetch(String(body.message_id));
    const payload={content:clip(body.text,2000),components:discordComponents(body.reply_markup),allowedMentions:{parse:[]}};
    const edited=await msg.edit(payload);
    const ctx=contexts.get(String(chatId));
    if(ctx&&String(body.message_id)===String(ctx.placeholderId)){
      ctx.editedOriginal=true;
      ctx.outputCount=(ctx.outputCount||0)+1;
    }
    return {message_id:edited.id,chat:{id:chatId},text:String(body.text||'')};
  }
  async function sendPhoto(chatId,fields,fileName,fileBuffer,mime){
    const ctx=contexts.get(String(chatId));
    const caption=fields.caption??fields.media?.caption??'';
    const attachment=new AttachmentBuilder(fileBuffer,{name:fileName||'chart.png',description:'TCX chart'});
    const payload={content:clip(caption,2000),files:[attachment],components:discordComponents(fields.reply_markup),allowedMentions:{parse:[]}};
    let msg;
    if(ctx&&!ctx.responded){
      msg=await ctx.interaction.editReply(payload);
      ctx.responded=true;
      ctx.editedOriginal=true;
      ctx.outputCount=(ctx.outputCount||0)+1;
    }else if(ctx){
      msg=await ctx.interaction.followUp(payload);
      ctx.outputCount=(ctx.outputCount||0)+1;
    }else{
      const x=await channelFor(chatId);
      msg=await x.c.send(payload);
    }
    return {message_id:msg?.id||null,chat:{id:chatId},photo:[{}],caption:String(caption)};
  }
  async function editPhoto(chatId,fields,fileName,fileBuffer,mime){
    const x=await channelFor(chatId);
    const msg=await x.c.messages.fetch(String(fields.message_id));
    const caption=fields.caption??fields.media?.caption??'';
    const attachment=new AttachmentBuilder(fileBuffer,{name:fileName||'chart.png',description:'TCX chart'});
    const edited=await msg.edit({content:clip(caption,2000),attachments:[],files:[attachment],components:discordComponents(fields.reply_markup),allowedMentions:{parse:[]}});
    const ctx=contexts.get(String(chatId));
    if(ctx&&String(fields.message_id)===String(ctx.placeholderId)){
      ctx.editedOriginal=true;
      ctx.outputCount=(ctx.outputCount||0)+1;
    }
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
    if(method==='deleteMessage'){
      const x=await channelFor(body.chat_id);
      const m=await x.c.messages.fetch(String(body.message_id));
      await m.delete();
      return true;
    }
    throw new Error('DISCORD_TELEGRAM_METHOD_UNSUPPORTED:'+method);
  }
  async function telegramMultipart(method,fields,fileField,fileName,fileBuffer,mime='image/png'){
    if(method==='sendPhoto')return sendPhoto(fields.chat_id,fields,fileName,fileBuffer,mime);
    if(method==='editMessageMedia')return editPhoto(fields.chat_id,fields,fileName,fileBuffer,mime);
    throw new Error('DISCORD_TELEGRAM_MULTIPART_UNSUPPORTED:'+method);
  }

  async function ensureServerStructure(){
    const g=await guild();
    const me=g.members.me||await g.members.fetchMe();
    if(!me.permissions.has(PermissionsBitField.Flags.ManageChannels)){
      state.setupState='BLOCKED';
      state.setupError='BOT_NEEDS_MANAGE_CHANNELS';
      return {ok:false,reason:'BOT_NEEDS_MANAGE_CHANNELS',created:0,found:0};
    }
    const all=await g.channels.fetch();
    let created=0,found=0;
    for(const group of SERVER_BLUEPRINT){
      let category=all.find(c=>c&&c.type===ChannelType.GuildCategory&&c.name===group.category);
      if(!category){
        category=await g.channels.create({name:group.category,type:ChannelType.GuildCategory,reason:'TCX Discord Command Center V2 setup'});
        all.set(category.id,category);
        created++;
      }else found++;
      for(const [name,topic] of group.channels){
        let ch=all.find(c=>c&&c.type===ChannelType.GuildText&&c.name===name);
        if(!ch){
          ch=await g.channels.create({name,type:ChannelType.GuildText,parent:category.id,topic,reason:'TCX Discord Command Center V2 setup'});
          all.set(ch.id,ch);
          created++;
        }else{
          found++;
          if(ch.parentId!==category.id){
            try{await ch.setParent(category.id,{lockPermissions:false,reason:'TCX Discord Command Center V2 organize'});}catch{}
          }
        }
        channelIds.set(name,ch.id);
      }
    }
    state.channelsCreated+=created;
    state.setupState='READY';
    state.setupError=null;
    return {ok:true,created,found,total:channelIds.size};
  }
  async function refreshChannelMap(){
    const g=await guild();
    const all=await g.channels.fetch();
    for(const group of SERVER_BLUEPRINT){
      for(const [name] of group.channels){
        const ch=all.find(c=>c&&c.type===ChannelType.GuildText&&c.name===name);
        if(ch)channelIds.set(name,ch.id);
      }
    }
    return channelIds.size;
  }
  async function namedChannel(name){
    let id=channelIds.get(name);
    if(!id){await refreshChannelMap();id=channelIds.get(name);}
    if(!id)return null;
    const ch=await client.channels.fetch(id).catch(()=>null);
    return ch&&ch.isTextBased()?ch:null;
  }
  async function upsertPanel(channelName,marker,content,components=[]){
    const ch=await namedChannel(channelName);
    if(!ch)return false;
    let target=null;
    try{
      const recent=await ch.messages.fetch({limit:50});
      target=recent.find(m=>m.author?.id===client.user?.id&&String(m.content||'').startsWith(marker))||null;
    }catch{}
    const payload={content:clip(content,2000),components,allowedMentions:{parse:[]}};
    if(target)await target.edit(payload);
    else await ch.send(payload);
    state.panelsUpdated++;
    return true;
  }
  async function postTradeOpen(position){
    const ch=await namedChannel('live-trades');
    if(!ch)return;
    const id=String(position.positionId||'shadow');
    const message=await ch.send({
      content:[
        'TCX // SHADOW TRADE OPEN',
        '━━━━━━━━━━━━━━━━━━━━',
        String(position.symbol||'—').replace('USDT','/USDT')+' · '+String(position.side||'—'),
        'Entry       '+number(position.entryPrice,8),
        'Setup       '+String(position.setupType||'UNKNOWN'),
        'Horizon     '+String(position.horizonId||'—'),
        'Mode        '+String(position.entryMode||'STANDARD'),
        '',
        'Position ID '+id,
        'SHADOW_ONLY · REAL ORDERS BLOCKED'
      ].join('\n'),
      components:position.symbol?deepRows(position.symbol):[],
      allowedMentions:{parse:[]}
    });
    try{
      const thread=await message.startThread({name:clip(String(position.symbol||'TRADE')+' '+String(position.side||'')+' · '+id.slice(-8),100),autoArchiveDuration:60,reason:'TCX Shadow Trade thread'});
      await thread.send('Automatischer TCX Research-Thread für '+id+'.');
    }catch{}
  }
  async function postTradeClosed(position){
    const ch=await namedChannel('closed-trades');
    if(!ch)return;
    const pnl=Number(position.realizedNetPnlQuote);
    const ret=Number(position.realizedReturnPct);
    await ch.send({
      content:[
        'TCX // SHADOW TRADE CLOSED',
        '━━━━━━━━━━━━━━━━━━━━',
        String(position.symbol||'—').replace('USDT','/USDT')+' · '+String(position.side||'—'),
        'Entry       '+number(position.entryPrice,8),
        'Exit        '+number(position.exitPrice??position.lastMark?.price,8),
        'Net PnL     '+(Number.isFinite(pnl)?number(pnl,3)+' USDT':'—'),
        'Return      '+(Number.isFinite(ret)?pct(ret,2):'—'),
        'Reason      '+String(position.closeReason||'UNKNOWN'),
        'Setup       '+String(position.setupType||'UNKNOWN'),
        '',
        'Position ID '+String(position.positionId||'—'),
        'SHADOW_ONLY'
      ].join('\n'),
      allowedMentions:{parse:[]}
    });
  }
  async function syncTradeFeed(snapshot){
    const open=(snapshot?.portfolio?.positions||[]).filter(Boolean);
    const closed=(snapshot?.portfolio?.recentClosed||[]).filter(Boolean);
    if(!tradeStateInitialized){
      open.forEach(p=>knownOpen.add(String(p.positionId||'')));
      closed.forEach(p=>knownClosed.add(String(p.positionId||'')));
      tradeStateInitialized=true;
      state.tradeFeedInitialized=true;
      return;
    }
    for(const p of open){
      const id=String(p.positionId||'');
      if(id&&!knownOpen.has(id)){
        knownOpen.add(id);
        await postTradeOpen(p);
      }
    }
    for(const p of closed){
      const id=String(p.positionId||'');
      if(id&&!knownClosed.has(id)){
        knownClosed.add(id);
        await postTradeClosed(p);
      }
    }
    const liveIds=new Set(open.map(p=>String(p.positionId||'')));
    for(const id of [...knownOpen])if(id&&!liveIds.has(id))knownOpen.delete(id);
    if(knownClosed.size>500){
      const keep=new Set(closed.slice(0,200).map(p=>String(p.positionId||'')));
      knownClosed.clear();
      keep.forEach(x=>knownClosed.add(x));
    }
  }
  async function syncPanels(){
    if(typeof getMissionControl!=='function')return {ok:false,reason:'NO_MISSION_CONTROL'};
    const snapshot=await Promise.resolve(getMissionControl());
    await upsertPanel('tcx-terminal','TCX // DISCORD COMMAND CENTER',systemPanel(snapshot),quickRows());
    await upsertPanel('performance','TCX // SHADOW PERFORMANCE',performancePanel(snapshot),[
      {type:1,components:[
        {type:2,style:2,label:'Tag',custom_id:'home:stats_day'},
        {type:2,style:2,label:'Woche',custom_id:'home:stats_week'},
        {type:2,style:2,label:'Monat',custom_id:'home:stats_month'},
        {type:2,style:2,label:'Portfolio',custom_id:'home:portfolio'}
      ]}
    ]);
    await upsertPanel('system-status','TCX // SYSTEM STATUS',systemHealthPanel(snapshot),[
      {type:1,components:[
        {type:2,style:2,label:'Data Health',custom_id:'home:data'},
        {type:2,style:2,label:'System',custom_id:'home:more'}
      ]}
    ]);
    await syncTradeFeed(snapshot);
    state.lastPanelSyncAt=Date.now();
    return {ok:true};
  }
  async function seedPanels(){
    await upsertPanel('start-here','TCX // START HERE',startPanel(),quickRows());
    await upsertPanel('market-overview','TCX // MARKET CENTER',marketOverviewPanel(),quickRows());
    await syncPanels();
  }

  async function runSetup(interaction){
    if(!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild)&&!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)){
      await interaction.reply({content:'Für /setup brauchst du Server verwalten.',ephemeral:true});
      return;
    }
    await interaction.deferReply({ephemeral:true});
    try{
      const result=await ensureServerStructure();
      if(!result.ok){
        await interaction.editReply('TCX V2 ist bereit, aber der Bot braucht einmal die Discord-Berechtigung **Kanäle verwalten**, damit ich die komplette Serverstruktur automatisch anlegen kann.');
        return;
      }
      await seedPanels();
      await interaction.editReply('TCX Discord Command Center V2 eingerichtet: '+result.total+' TCX-Channels erkannt, '+result.created+' neu erstellt. Live-Panels sind aktiv.');
    }catch(err){
      fail('setup',err);
      await interaction.editReply('Setup fehlgeschlagen: '+clip(err instanceof Error?err.message:String(err),500));
    }
  }
  async function showSystem(interaction){
    await interaction.deferReply();
    try{
      const snapshot=typeof getMissionControl==='function'?await Promise.resolve(getMissionControl()):{};
      await interaction.editReply({content:systemPanel(snapshot),components:quickRows(),allowedMentions:{parse:[]}});
    }catch(err){
      fail('system',err);
      await interaction.editReply('TCX Systemstatus gerade nicht verfügbar.');
    }
  }
  async function runTextCommand(interaction,text){
    await interaction.deferReply();
    if(String(interaction.guildId)!==guildId){
      await interaction.editReply('Dieser TCX-Bot ist für einen anderen Server konfiguriert.');
      return;
    }
    const chatId=fakeChatId(interaction.guildId,interaction.channelId,interaction.user.id);
    const ctx={interaction,responded:false,outputCount:0,editedOriginal:false};
    contexts.set(chatId,ctx);
    try{
      await handleUpdate({update_id:'discord:'+interaction.id,message:{message_id:interaction.id,chat:{id:chatId},from:{id:interaction.user.id,username:interaction.user.username},text}});
      if(!ctx.responded)await interaction.editReply('TCX hat keine Ausgabe erzeugt.');
    }catch(err){
      fail('command',err);
      try{await interaction.editReply('TCX Discord konnte den Befehl gerade nicht ausführen.');}catch{}
    }finally{
      contexts.delete(chatId);
    }
  }
  async function runCallbackCommand(interaction,data){
    await interaction.deferReply();
    if(String(interaction.guildId)!==guildId){
      await interaction.editReply('Dieser TCX-Bot ist für einen anderen Server konfiguriert.');
      return;
    }
    const placeholder=await interaction.editReply({content:'TCX lädt Analyse …',components:[],allowedMentions:{parse:[]}});
    const chatId=fakeChatId(interaction.guildId,interaction.channelId,interaction.user.id);
    const ctx={interaction,responded:true,placeholderId:String(placeholder.id),editedOriginal:false,outputCount:0};
    contexts.set(chatId,ctx);
    try{
      await handleUpdate({
        update_id:'discord:'+interaction.id,
        callback_query:{
          id:'discordcb:'+interaction.id,
          from:{id:interaction.user.id,username:interaction.user.username},
          data:String(data),
          message:{message_id:String(placeholder.id),chat:{id:chatId},text:String(placeholder.content||'')}
        }
      });
      if(!ctx.editedOriginal&&ctx.outputCount>0){
        try{await interaction.deleteReply();}catch{}
      }else if(!ctx.editedOriginal&&ctx.outputCount===0){
        await interaction.editReply('TCX hat keine Ausgabe erzeugt.');
      }
    }catch(err){
      fail('callback-command',err);
      try{await interaction.editReply('TCX konnte diese Analyse gerade nicht laden.');}catch{}
    }finally{
      contexts.delete(chatId);
    }
  }
  async function onCommand(interaction){
    state.lastInteractionAt=Date.now();
    const name=String(interaction.commandName||'').toLowerCase();
    if(name==='setup')return runSetup(interaction);
    if(name==='system')return showSystem(interaction);
    const callback=callbackCommand(interaction);
    if(callback)return runCallbackCommand(interaction,callback);
    const text=commandText(interaction);
    if(!text){
      await interaction.reply({content:'Unbekannter TCX-Befehl.',ephemeral:true});
      return;
    }
    return runTextCommand(interaction,text);
  }
  async function onButton(interaction){
    state.lastInteractionAt=Date.now();
    await interaction.deferUpdate();
    if(String(interaction.guildId)!==guildId)return;
    const chatId=fakeChatId(interaction.guildId,interaction.channelId,interaction.user.id);
    contexts.set(chatId,{interaction,responded:true,placeholderId:String(interaction.message.id),editedOriginal:false,outputCount:0});
    try{
      await handleUpdate({
        update_id:'discord:'+interaction.id,
        callback_query:{
          id:'discordcb:'+interaction.id,
          from:{id:interaction.user.id,username:interaction.user.username},
          data:String(interaction.customId||''),
          message:{
            message_id:String(interaction.message.id),
            chat:{id:chatId},
            text:String(interaction.message.content||''),
            ...(interaction.message.attachments?.size?{photo:[{}]}:{})
          }
        }
      });
    }catch(err){
      fail('button',err);
      try{await interaction.followUp({content:'TCX konnte diese Aktion gerade nicht ausführen.',ephemeral:true});}catch{}
    }finally{
      contexts.delete(chatId);
    }
  }

  client.once(Events.ClientReady,async function(){
    state.ready=true;
    state.botUser=client.user?.tag||client.user?.id||null;
    state.lastReadyAt=Date.now();
    state.lastError=null;
    try{
      await refreshChannelMap();
      if(autoSetup){
        const result=await ensureServerStructure();
        if(result.ok)await seedPanels();
      }else if(channelIds.size)await seedPanels();
    }catch(err){fail('auto-setup',err);}
    if(panelTimer)clearInterval(panelTimer);
    panelTimer=setInterval(()=>{void syncPanels().catch(err=>fail('panel-sync',err));},Math.max(30_000,Number(panelRefreshMs)||60_000));
    panelTimer.unref?.();
  });
  client.on('error',err=>fail('client',err));
  client.on(Events.InteractionCreate,function(interaction){
    if(interaction.isChatInputCommand())void onCommand(interaction);
    else if(interaction.isButton())void onButton(interaction);
  });

  async function start(){
    await rest.put(Routes.applicationGuildCommands(applicationId,guildId),{body:COMMANDS});
    state.registered=true;
    await client.login(token);
    return snapshot();
  }
  async function stop(){
    if(panelTimer)clearInterval(panelTimer);
    panelTimer=null;
    client.destroy();
    state.ready=false;
  }
  function snapshot(){
    return Object.freeze({
      version:DISCORD_TELEGRAM_BRIDGE_VERSION,
      ...state,
      guildId,
      applicationId,
      contexts:contexts.size,
      managedChannels:channelIds.size,
      autoSetup:Boolean(autoSetup),
      panelRefreshMs:Math.max(30_000,Number(panelRefreshMs)||60_000)
    });
  }
  return Object.freeze({
    start,
    stop,
    snapshot,
    telegramCall,
    telegramMultipart,
    handlesTelegramCall,
    ensureServerStructure,
    syncPanels,
    isChatId:v=>isDiscordChatId(v,guildId)
  });
}
