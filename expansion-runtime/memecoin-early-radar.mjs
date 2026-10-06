import * as legacy from './memecoin-early-radar-legacy.mjs';

export const MEMECOIN_EARLY_RADAR_VERSION=legacy.MEMECOIN_EARLY_RADAR_VERSION;
export const W6_ULTRA_EARLY_FEED_VERSION=legacy.W6_ULTRA_EARLY_FEED_VERSION;
export const scoreEarlyMemecoin=legacy.scoreEarlyMemecoin;
export const applyExternalMemecoinAttention=legacy.applyExternalMemecoinAttention;

function finite(v){const n=Number(v);return v==null||v===''||!Number.isFinite(n)?null:n;}
function tokenAttrs(included,id){return included.get(id)?.attributes||{};}
function normalizeFreshPool(row,included,now){
  const a=row?.attributes||{},rel=row?.relationships||{};
  const base=tokenAttrs(included,rel?.base_token?.data?.id);
  const created=Date.parse(a?.pool_created_at||'');
  const m5=a?.transactions?.m5||{},h1=a?.transactions?.h1||{};
  const tokenAddress=String(base?.address||rel?.base_token?.data?.id||'').replace(/^solana_/,'');
  if(!tokenAddress)return null;
  const pairCreatedAt=Number.isFinite(created)?created:null;
  return {
    chainId:'solana',tokenAddress,pairAddress:String(a?.address||row?.id||''),
    symbol:String(base?.symbol||''),name:String(base?.name||''),priceUsd:finite(a?.base_token_price_usd),
    liquidityUsd:finite(a?.reserve_in_usd),volumeM5:finite(a?.volume_usd?.m5),volumeH1:finite(a?.volume_usd?.h1),volumeH24:finite(a?.volume_usd?.h24),
    buysM5:Math.max(0,Math.floor(finite(m5?.buys)??0)),sellsM5:Math.max(0,Math.floor(finite(m5?.sells)??0)),
    buysH1:Math.max(0,Math.floor(finite(h1?.buys)??0)),sellsH1:Math.max(0,Math.floor(finite(h1?.sells)??0)),
    priceChangeM5:finite(a?.price_change_percentage?.m5),priceChangeH1:finite(a?.price_change_percentage?.h1),
    marketCap:finite(a?.market_cap_usd),fdv:finite(a?.fdv_usd),pairCreatedAt,firstSeenAt:now,
    signalTrending:false,signalNewPair:true,gmgnExactTrend:false,trendSource:'GECKOTERMINAL_NEW_PAIRS',
    freeTrendSources:['GECKOTERMINAL_NEW_PAIRS'],ultraEarly:true,sourceSetup:'TRENDS_PROXY_RESEARCH',w6TrackingOnly:false,
    ultraSource:'GECKOTERMINAL_NEW_PAIRS'
  };
}

function normalizeDexSupplement(pair){
  const m5=pair?.txns?.m5||{},h1=pair?.txns?.h1||{};
  return {
    chainId:String(pair?.chainId||''),tokenAddress:String(pair?.baseToken?.address||''),
    pairAddress:String(pair?.pairAddress||''),symbol:String(pair?.baseToken?.symbol||''),name:String(pair?.baseToken?.name||''),
    priceUsd:finite(pair?.priceUsd),liquidityUsd:finite(pair?.liquidity?.usd),
    marketCap:finite(pair?.marketCap),fdv:finite(pair?.fdv),pairCreatedAt:finite(pair?.pairCreatedAt),
    volumeM5:finite(pair?.volume?.m5),volumeH1:finite(pair?.volume?.h1),volumeH24:finite(pair?.volume?.h24),
    buysM5:Math.max(0,finite(m5.buys)??0),sellsM5:Math.max(0,finite(m5.sells)??0),
    buysH1:Math.max(0,finite(h1.buys)??0),sellsH1:Math.max(0,finite(h1.sells)??0),
    priceChangeM5:finite(pair?.priceChange?.m5),priceChangeH1:finite(pair?.priceChange?.h1)
  };
}

export function createMemecoinEarlyRadarProvider(options={}){
  const base=legacy.createMemecoinEarlyRadarProvider(options);
  const fetchImpl=options.fetchImpl||globalThis.fetch;
  const gecko=String(options.geckoBase||'https://api.geckoterminal.com/api/v2').replace(/\/+$/,'');
  const nowFn=typeof options.now==='function'?options.now:()=>Date.now();
  const dex=String(options.dexBase||'https://api.dexscreener.com').replace(/\/+$/,'');
  const cache=new Map(),pending=new Map();
  const timeoutMs=Math.max(1000,Math.min(10000,Number(options.timeoutMs)||7000));
  const geckoCacheMs=Math.max(1000,Math.min(300000,Number(options.ultraGeckoCacheMs)||30000));
  const dexCacheMs=Math.max(1000,Math.min(60000,Number(options.ultraDexCacheMs)||5000));
  async function cachedJson(url,ttl){
    const t=Number(nowFn()),hit=cache.get(url);
    if(hit&&t<hit.until){if(hit.error)throw new Error(hit.error);return hit.body;}
    if(pending.has(url))return pending.get(url);
    const job=(async()=>{
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
      try{
        const res=await Promise.resolve().then(()=>fetchImpl(url,{headers:{accept:'application/json','user-agent':'BIGGJ/1.0 W6-multifeed-research'},signal:controller.signal}));
        if(!res?.ok){
          const error='HTTP_'+String(res?.status??'UNKNOWN');
          const retry=Number(res?.headers?.get?.('retry-after'));
          const wait=res?.status===429?Math.max(60000,Math.min(300000,Number.isFinite(retry)&&retry>0?retry*1000:60000)):10000;
          cache.set(url,{until:Number(nowFn())+wait,error});throw new Error(error);
        }
        const body=await res.json();cache.set(url,{until:Number(nowFn())+ttl,body});return body;
      }catch(err){
        if(!cache.get(url)?.error||cache.get(url).until<=Number(nowFn()))cache.set(url,{until:Number(nowFn())+10000,error:err instanceof Error?err.message:String(err)});
        throw err;
      }finally{
        clearTimeout(timer);pending.delete(url);
        while(cache.size>64)cache.delete(cache.keys().next().value);
      }
    })();pending.set(url,job);return job;
  }
  return Object.freeze({...base,async fetchUltraEarlySolana(args={}){
    const prior=await base.fetchUltraEarlySolana(args);
    if(prior?.exactGmgn===true)return prior;
    const capturedAt=Number(nowFn());
    const maxAge=Math.max(60,Math.min(600,Number(args?.maxAgeSeconds)||180));
    const errors=[...(Array.isArray(prior?.errors)?prior.errors:[])];
    let fresh=[];
    const feedStatus={};
    const sourceSpecs=[
      ['geckoNew',gecko+'/networks/solana/new_pools?include=base_token%2Cquote_token&page=1',geckoCacheMs],
      ['dexLatestBoosts',dex+'/token-boosts/latest/v1',dexCacheMs],
      ['dexLatestProfiles',dex+'/token-profiles/latest/v1',Math.max(dexCacheMs,30000)]
    ];
    const settled=await Promise.allSettled(sourceSpecs.map(([,url,ttl])=>cachedJson(url,ttl)));
    for(let i=0;i<settled.length;i++){
      const [name]=sourceSpecs[i],r=settled[i];
      feedStatus[name]={ok:r.status==='fulfilled',error:r.status==='rejected'?String(r.reason?.message||r.reason):null};
      if(r.status==='rejected')errors.push(name+':'+feedStatus[name].error);
    }
    if(settled[0].status==='fulfilled'){
      const body=settled[0].value;
      const included=new Map((Array.isArray(body?.included)?body.included:[]).map(x=>[x?.id,x]));
      fresh=(Array.isArray(body?.data)?body.data:[]).map(x=>normalizeFreshPool(x,included,capturedAt)).filter(Boolean)
        .filter(x=>x.pairCreatedAt!=null&&x.pairCreatedAt<=capturedAt&&(capturedAt-x.pairCreatedAt)/1000<=maxAge);
    }
    const seeds=new Map();
    for(const row of fresh)seeds.set(row.tokenAddress,row);
    for(let i=1;i<settled.length;i++){
      if(settled[i].status!=='fulfilled')continue;
      const list=Array.isArray(settled[i].value)?settled[i].value:[];
      for(const row of list.filter(x=>x?.chainId==='solana'&&String(x?.tokenAddress||'').trim()&&(i!==1||(finite(x.amount)??finite(x.totalAmount)??0)>0)).slice(0,30)){
        const address=String(row.tokenAddress),old=seeds.get(address)||{};
        const isBoost=i===1;
        seeds.set(address,{...old,chainId:'solana',tokenAddress:address,
          signalBoost:old.signalBoost===true||isBoost,signalProfile:old.signalProfile===true||i===2,
          boostAmount:isBoost?finite(row.amount):old.boostAmount,
          signalTrending:old.signalTrending===true||isBoost,
          trendSource:isBoost?'DEXSCREENER_LATEST_BOOSTS':old.trendSource||'DEXSCREENER_LATEST_PROFILES',
          attentionSemantics:isBoost?'PAID_BOOST_ATTENTION_PROXY':old.attentionSemantics||'PROFILE_DISCOVERY_ONLY'});
      }
    }
    const addresses=[...seeds.keys()].slice(0,60),dexPairs=[];
    for(let offset=0;offset<addresses.length;offset+=30){
      const batch=addresses.slice(offset,offset+30);
      try{
        const body=await cachedJson(dex+'/tokens/v1/solana/'+batch.map(encodeURIComponent).join(','),dexCacheMs);
        for(const raw of Array.isArray(body)?body:(Array.isArray(body?.pairs)?body.pairs:[])){
          const row=normalizeDexSupplement(raw);
          if(row.chainId==='solana'&&batch.includes(row.tokenAddress))dexPairs.push(row);
        }
        feedStatus.dexEnrichment={ok:true};
      }catch(err){errors.push('dex:enrichment:'+String(err?.message||err));feedStatus.dexEnrichment={ok:false,error:String(err?.message||err)};}
    }
    const bestPairs=new Map();
    for(const row of dexPairs){
      const old=bestPairs.get(row.tokenAddress);
      if(!old||(row.liquidityUsd??-1)>(old.liquidityUsd??-1))bestPairs.set(row.tokenAddress,row);
    }
    fresh=[...seeds.values()].map(seed=>{
      const pair=bestPairs.get(seed.tokenAddress);
      const row={...seed};
      if(pair){
        for(const [k,v] of Object.entries(pair))if(v!=null&&v!=='')row[k]=v;
        const times=[seed.pairCreatedAt,pair.pairCreatedAt].filter(x=>finite(x)!=null).map(Number);
        row.pairCreatedAt=times.length?Math.min(...times):null;
        row.marketCapSource=pair.marketCap!=null?'DEXSCREENER':'GECKOTERMINAL';
        row.ultraSource='W6_MULTI_FEED_PLUS_DEXSCREENER_BATCH';
      }
      row.marketCap=finite(row.marketCap);
      row.fdv=finite(row.fdv);
      row.firstSeenAt=seed.firstSeenAt??capturedAt;
      row.gmgnExactTrend=false;row.sourceSetup='TRENDS_PROXY_RESEARCH';row.w6TrackingOnly=false;
      row.freeTrendSources=[seed.trendSource].filter(Boolean);
      return row;
    }).filter(x=>x.pairCreatedAt!=null&&x.pairCreatedAt<=capturedAt&&(capturedAt-x.pairCreatedAt)/1000<=maxAge);
    const merged=new Map();
    for(const row of [...fresh,...(Array.isArray(prior?.rows)?prior.rows:[])]){
      const key=String(row?.tokenAddress||'');if(!key)continue;
      const old=merged.get(key);
      if(!old)merged.set(key,row);
      else {
        const pairCreatedTimes=[row?.pairCreatedAt,old?.pairCreatedAt].filter(x=>finite(x)!=null).map(Number);
        merged.set(key,{...row,...old,
          pairCreatedAt:pairCreatedTimes.length?Math.min(...pairCreatedTimes):null,
          signalTrending:row?.signalTrending===true||old?.signalTrending===true,
          signalNewPair:Boolean(row?.signalNewPair||old?.signalNewPair),
          signalBoost:Boolean(row?.signalBoost||old?.signalBoost),
          signalProfile:Boolean(row?.signalProfile||old?.signalProfile),
          attentionSemantics:row?.attentionSemantics||old?.attentionSemantics,
          freeTrendSources:[...new Set([...(row?.freeTrendSources||[]),...(old?.freeTrendSources||[])])]});
      }
    }
    const rows=[...merged.values()].map(row=>{
      const ageSeconds=row?.pairCreatedAt==null?null:Math.max(0,(capturedAt-Number(row.pairCreatedAt))/1000);
      return Object.freeze({...row,ageSeconds:ageSeconds==null?row?.ageSeconds:Number(ageSeconds.toFixed(3)),score:legacy.scoreEarlyMemecoin(row,{now:capturedAt})});
    }).sort((a,b)=>(finite(a?.ageSeconds)??Infinity)-(finite(b?.ageSeconds)??Infinity));
    const limit=Math.max(1,Math.min(30,Number(args?.limit)||30));
    const selected=rows.filter((x,i)=>x?.w6TrackingOnly===true||x?.candidateTracking===true||i<limit);
    const discoveryRows=selected.filter(x=>x?.w6TrackingOnly!==true).length;
    return Object.freeze({...prior,capturedAt,feedStatus,rows:Object.freeze(selected),errors:Object.freeze(errors),source:'FREE_TRENDS_COMPOSITE_GECKO_DEXSCREENER',sourceReady:selected.length>0||errors.length===0,discoveryRows,candidateTrackingRows:selected.filter(x=>x?.candidateTracking===true).length,trackingRows:selected.filter(x=>x?.w6TrackingOnly===true).length,execution:'SHADOW_ONLY',canExecute:false,canExecuteLive:false});
  }});
}
