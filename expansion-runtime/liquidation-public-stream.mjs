export const LIQUIDATION_PUBLIC_STREAM_VERSION='TCX_LIQUIDATION_PUBLIC_STREAM_V1';

function finite(v){
  const n=Number(v);
  return Number.isFinite(n)?n:null;
}
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }

export function liquidationSnapshotToExtraFeatures(snapshot){
  if(!snapshot||snapshot.ready5m!==true) return [];
  const t=finite(snapshot.availableAt);
  if(t==null) return [];
  const rows=[];
  const add=(id,value)=>{
    const n=finite(value);
    if(n==null) return;
    rows.push({id,value:n,availableAt:t,source:'BYBIT_PUBLIC_ALL_LIQUIDATION'});
  };
  const w5=snapshot.window5m||{};
  add('research.liquidation.logUsd5m',Math.log1p(Math.max(0,Number(w5.totalUsd||0))));
  add('research.liquidation.imbalance5m',w5.imbalance);
  add('research.liquidation.longShare5m',w5.longShare);
  add('research.liquidation.concentration5m',w5.largestShare);
  add('research.liquidation.logCount5m',Math.log1p(Math.max(0,Number(w5.count||0))));
  if(snapshot.ready15m===true){
    const w15=snapshot.window15m||{};
    add('research.liquidation.logUsd15m',Math.log1p(Math.max(0,Number(w15.totalUsd||0))));
    add('research.liquidation.imbalance15m',w15.imbalance);
  }
  return rows;
}

function aggregate(events,from,to){
  const xs=(events||[]).filter(e=>e.eventTime>=from&&e.eventTime<=to);
  let longUsd=0,shortUsd=0,largest=0;
  for(const e of xs){
    const usd=Math.max(0,Number(e.usdNotional)||0);
    if(e.positionSide==='LONG') longUsd+=usd;
    else if(e.positionSide==='SHORT') shortUsd+=usd;
    largest=Math.max(largest,usd);
  }
  const totalUsd=longUsd+shortUsd;
  return Object.freeze({
    count:xs.length,
    totalUsd,
    longLiquidatedUsd:longUsd,
    shortLiquidatedUsd:shortUsd,
    imbalance:totalUsd>0?(longUsd-shortUsd)/totalUsd:0,
    longShare:totalUsd>0?longUsd/totalUsd:.5,
    largestUsd:largest,
    largestShare:totalUsd>0?largest/totalUsd:0
  });
}

export function createLiquidationPublicStream({
  symbols=[],
  WebSocketImpl=globalThis.WebSocket,
  url='wss://stream.bybit.com/v5/public/linear',
  now=()=>Date.now(),
  pingMs=20000,
  reconnectMs=5000,
  retentionMs=4*60*60_000,
  maxEventsPerSymbol=5000,
  logger=console
}={}){
  if(typeof WebSocketImpl!=='function') throw new Error('WebSocket implementation required');
  const wanted=[...new Set((Array.isArray(symbols)?symbols:[]).map(x=>String(x).toUpperCase()).filter(x=>/^[A-Z0-9]{2,18}USDT$/.test(x)))];
  if(!wanted.length) throw new Error('at least one liquidation symbol required');

  const events=new Map(wanted.map(s=>[s,[]]));
  const dedupe=new Set();
  let ws=null;
  let running=false;
  let connected=false;
  let connectedSince=null;
  let lastMessageAt=null;
  let lastError=null;
  let reconnectTimer=null;
  let pingTimer=null;
  let generation=0;

  function cleanup(t=now()){
    const cutoff=t-Math.max(60_000,Number(retentionMs)||4*60*60_000);
    for(const symbol of wanted){
      const xs=(events.get(symbol)||[]).filter(e=>e.eventTime>=cutoff).slice(-Math.max(100,Number(maxEventsPerSymbol)||5000));
      events.set(symbol,xs);
    }
    if(dedupe.size>50_000){
      dedupe.clear();
      for(const xs of events.values()) for(const e of xs) dedupe.add(e.id);
    }
  }

  function ingest(payload,receivedAt=now()){
    if(!payload||typeof payload!=='object') return 0;
    const topic=String(payload.topic||'');
    if(!topic.startsWith('allLiquidation.')) return 0;
    const rows=Array.isArray(payload.data)?payload.data:[];
    let added=0;
    for(const raw of rows){
      const symbol=String(raw?.s||'').toUpperCase();
      if(!events.has(symbol)) continue;
      const eventTime=finite(raw?.T);
      const qty=finite(raw?.v);
      const price=finite(raw?.p);
      const side=String(raw?.S||'');
      if(eventTime==null||qty==null||price==null||qty<0||price<=0) continue;
      if(eventTime>receivedAt+5000) continue;
      const positionSide=side==='Buy'?'LONG':side==='Sell'?'SHORT':null;
      if(!positionSide) continue;
      const id=[symbol,eventTime,side,qty,price].join(':');
      if(dedupe.has(id)) continue;
      dedupe.add(id);
      const e=Object.freeze({
        id,
        symbol,
        eventTime,
        availableAt:Math.max(eventTime,finite(payload.ts)||receivedAt),
        positionSide,
        qty,
        price,
        usdNotional:qty*price,
        source:'BYBIT_PUBLIC_ALL_LIQUIDATION'
      });
      const xs=events.get(symbol)||[];
      xs.push(e);
      xs.sort((a,b)=>a.eventTime-b.eventTime||a.id.localeCompare(b.id));
      events.set(symbol,xs.slice(-Math.max(100,Number(maxEventsPerSymbol)||5000)));
      added++;
    }
    if(added){
      lastMessageAt=receivedAt;
      cleanup(receivedAt);
    }
    return added;
  }

  function clearTimers(){
    if(reconnectTimer){ clearTimeout(reconnectTimer); reconnectTimer=null; }
    if(pingTimer){ clearInterval(pingTimer); pingTimer=null; }
  }

  function scheduleReconnect(){
    if(!running||reconnectTimer) return;
    reconnectTimer=setTimeout(()=>{
      reconnectTimer=null;
      connect();
    },Math.max(1000,Number(reconnectMs)||5000));
  }

  function connect(){
    if(!running) return;
    clearTimers();
    generation++;
    const localGeneration=generation;
    try{
      ws=new WebSocketImpl(url);
    }catch(err){
      lastError=err instanceof Error?err.message:String(err);
      connected=false;
      connectedSince=null;
      scheduleReconnect();
      return;
    }

    const onOpen=()=>{
      if(localGeneration!==generation) return;
      connected=true;
      connectedSince=now();
      lastError=null;
      logger?.info?.('liquidation stream connected',JSON.stringify({url,symbols:wanted.length}));
      try{
        ws.send(JSON.stringify({
          op:'subscribe',
          args:wanted.map(s=>'allLiquidation.'+s)
        }));
      }catch(err){
        lastError=err instanceof Error?err.message:String(err);
      }
      pingTimer=setInterval(()=>{
        if(!running||!connected) return;
        try{ ws.send(JSON.stringify({op:'ping'})); }catch{}
      },Math.max(5000,Number(pingMs)||20000));
    };
    const onMessage=event=>{
      if(localGeneration!==generation) return;
      try{
        const raw=typeof event?.data==='string'?event.data:String(event?.data??'');
        const payload=JSON.parse(raw);
        ingest(payload,now());
        lastMessageAt=now();
      }catch(err){
        lastError=err instanceof Error?err.message:String(err);
      }
    };
    const onClose=()=>{
      if(localGeneration!==generation) return;
      connected=false;
      connectedSince=null;
      logger?.warn?.('liquidation stream disconnected');
      if(pingTimer){clearInterval(pingTimer);pingTimer=null;}
      scheduleReconnect();
    };
    const onError=event=>{
      if(localGeneration!==generation) return;
      lastError=String(event?.message||'websocket error');
    };

    if(typeof ws.addEventListener==='function'){
      ws.addEventListener('open',onOpen);
      ws.addEventListener('message',onMessage);
      ws.addEventListener('close',onClose);
      ws.addEventListener('error',onError);
    }else{
      ws.onopen=onOpen;
      ws.onmessage=onMessage;
      ws.onclose=onClose;
      ws.onerror=onError;
    }
  }

  function start(){
    if(running) return;
    running=true;
    connect();
  }

  function stop(){
    running=false;
    generation++;
    clearTimers();
    connected=false;
    connectedSince=null;
    try{ ws?.close?.(); }catch{}
    ws=null;
  }

  function snapshot(symbol,{asOf=now()}={}){
    const s=String(symbol||'').toUpperCase();
    const t=finite(asOf);
    if(t==null) throw new Error('asOf must be finite');
    const xs=events.get(s)||[];
    const coverageMs=connected&&connectedSince!=null?Math.max(0,t-connectedSince):0;
    const ready5m=connected&&coverageMs>=5*60_000;
    const ready15m=connected&&coverageMs>=15*60_000;
    return Object.freeze({
      version:LIQUIDATION_PUBLIC_STREAM_VERSION,
      symbol:s,
      availableAt:t,
      connected,
      connectedSince,
      coverageMs,
      ready5m,
      ready15m,
      window5m:ready5m?aggregate(xs,t-5*60_000,t):null,
      window15m:ready15m?aggregate(xs,t-15*60_000,t):null,
      lastMessageAt,
      bufferedEvents:xs.length,
      restrictions:Object.freeze({
        researchOnly:true,
        mayExecute:false,
        mayMutateProductionForecast:false
      })
    });
  }

  function health(){
    return Object.freeze({
      version:LIQUIDATION_PUBLIC_STREAM_VERSION,
      running,
      connected,
      connectedSince,
      lastMessageAt,
      lastError,
      symbols:Object.freeze(wanted.map(symbol=>({symbol,bufferedEvents:(events.get(symbol)||[]).length})))
    });
  }

  return Object.freeze({
    version:LIQUIDATION_PUBLIC_STREAM_VERSION,
    start,
    stop,
    snapshot,
    health,
    ingest,
    liquidationSnapshotToExtraFeatures
  });
}
