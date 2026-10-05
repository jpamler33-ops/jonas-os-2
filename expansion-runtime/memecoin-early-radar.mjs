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
    signalTrending:true,signalNewPair:true,gmgnExactTrend:false,trendSource:'GECKOTERMINAL_NEW_PAIRS',
    freeTrendSources:['GECKOTERMINAL_NEW_PAIRS'],ultraEarly:true,sourceSetup:'TRENDS_PROXY_RESEARCH',w6TrackingOnly:false,
    ultraSource:'GECKOTERMINAL_NEW_PAIRS'
  };
}

export function createMemecoinEarlyRadarProvider(options={}){
  const base=legacy.createMemecoinEarlyRadarProvider(options);
  const fetchImpl=options.fetchImpl||globalThis.fetch;
  const gecko=String(options.geckoBase||'https://api.geckoterminal.com/api/v2').replace(/\/+$/,'');
  const nowFn=typeof options.now==='function'?options.now:()=>Date.now();
  return Object.freeze({...base,async fetchUltraEarlySolana(args={}){
    const prior=await base.fetchUltraEarlySolana(args);
    if(prior?.exactGmgn===true)return prior;
    const capturedAt=Number(nowFn());
    const maxAge=Math.max(60,Math.min(600,Number(args?.maxAgeSeconds)||180));
    const errors=[...(Array.isArray(prior?.errors)?prior.errors:[])];
    let fresh=[];
    try{
      const res=await fetchImpl(gecko+'/networks/solana/new_pools?include=base_token%2Cquote_token&page=1',{headers:{accept:'application/json','user-agent':'BIGGJ/1.0 W6-new-pair-research'}});
      if(!res?.ok)throw new Error('HTTP_'+String(res?.status??'UNKNOWN'));
      const body=await res.json();
      const included=new Map((Array.isArray(body?.included)?body.included:[]).map(x=>[x?.id,x]));
      fresh=(Array.isArray(body?.data)?body.data:[]).map(x=>normalizeFreshPool(x,included,capturedAt)).filter(Boolean).filter(x=>x.pairCreatedAt!=null&&(capturedAt-x.pairCreatedAt)/1000<=maxAge);
    }catch(err){errors.push('gecko:solana:new-pairs:'+(err instanceof Error?err.message:String(err)));}
    const merged=new Map();
    for(const row of [...fresh,...(Array.isArray(prior?.rows)?prior.rows:[])]){
      const key=String(row?.tokenAddress||'');if(!key)continue;
      const old=merged.get(key);
      if(!old)merged.set(key,row);
      else merged.set(key,{...row,...old,signalNewPair:Boolean(row?.signalNewPair||old?.signalNewPair),freeTrendSources:[...new Set([...(row?.freeTrendSources||[]),...(old?.freeTrendSources||[])])]});
    }
    const rows=[...merged.values()].map(row=>{
      const ageSeconds=row?.pairCreatedAt==null?null:Math.max(0,(capturedAt-Number(row.pairCreatedAt))/1000);
      return Object.freeze({...row,ageSeconds:ageSeconds==null?row?.ageSeconds:Number(ageSeconds.toFixed(3)),score:legacy.scoreEarlyMemecoin(row,{now:capturedAt})});
    }).sort((a,b)=>(finite(a?.ageSeconds)??Infinity)-(finite(b?.ageSeconds)??Infinity));
    const limit=Math.max(1,Math.min(30,Number(args?.limit)||30));
    const selected=rows.filter((x,i)=>x?.w6TrackingOnly===true||x?.candidateTracking===true||i<limit);
    const discoveryRows=selected.filter(x=>x?.w6TrackingOnly!==true).length;
    return Object.freeze({...prior,capturedAt,rows:Object.freeze(selected),errors:Object.freeze(errors),source:'FREE_TRENDS_COMPOSITE_GECKO_DEXSCREENER',sourceReady:selected.length>0||errors.length===0,discoveryRows,candidateTrackingRows:selected.filter(x=>x?.candidateTracking===true).length,trackingRows:selected.filter(x=>x?.w6TrackingOnly===true).length,execution:'SHADOW_ONLY',canExecute:false,canExecuteLive:false});
  }});
}
