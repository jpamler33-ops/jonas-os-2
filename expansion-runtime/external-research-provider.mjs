export const EXTERNAL_RESEARCH_PROVIDER_VERSION='TCX_EXTERNAL_RESEARCH_PROVIDER_V1';

function finite(v){
  const n=Number(v);
  return Number.isFinite(n)?n:null;
}
function freeze(v){
  if(v&&typeof v==='object'&&!Object.isFrozen(v)){
    Object.freeze(v);
    for(const x of Object.values(v)) freeze(x);
  }
  return v;
}
function parseMaybeJson(v,fallback){
  if(v&&typeof v==='object') return v;
  try{return JSON.parse(String(v||''));}catch{return fallback;}
}
function symbolAsset(symbol){
  const base=String(symbol||'').toUpperCase().replace(/USDT$/,'');
  const map={BTC:'btc',ETH:'eth',SOL:'sol',ADA:'ada',XRP:'xrp',DOGE:'doge',LINK:'link',AVAX:'avax',DOT:'dot',LTC:'ltc',TRX:'trx',BNB:'bnb'};
  return map[base]||null;
}
function deribitCurrency(symbol){
  const base=String(symbol||'').toUpperCase().replace(/USDT$/,'');
  return ['BTC','ETH'].includes(base)?base:null;
}
function weightedAverage(rows,valueKey,weightKey='open_interest'){
  let weighted=0,weights=0,plain=0,count=0;
  for(const row of rows||[]){
    const v=finite(row?.[valueKey]);
    if(v==null) continue;
    const w=Math.max(0,finite(row?.[weightKey])||0);
    if(w>0){weighted+=v*w;weights+=w;}
    plain+=v;count++;
  }
  if(weights>0) return weighted/weights;
  return count?plain/count:null;
}
function log1pNonNegative(v){
  const n=finite(v);
  return n!=null&&n>=0?Math.log1p(n):null;
}
function relativeChange(current,previous){
  const a=finite(current),b=finite(previous);
  return a!=null&&b!=null&&Math.abs(b)>1e-12?(a-b)/Math.abs(b):null;
}
function isoDay(ms){return new Date(ms).toISOString().slice(0,10);}

export function coinMetricsSnapshotToExtraFeatures(snapshot){
  if(!snapshot?.ok) return [];
  const m=snapshot.metrics||{};
  const rows=[
    ['research.coinmetrics.activeAddressesLog',log1pNonNegative(m.activeAddresses)],
    ['research.coinmetrics.activeAddressesChange1d',relativeChange(m.activeAddresses,m.previousActiveAddresses)],
    ['research.coinmetrics.newAddressesLog',log1pNonNegative(m.newAddresses)],
    ['research.coinmetrics.txCountLog',log1pNonNegative(m.txCount)],
    ['research.coinmetrics.mvrv',finite(m.mvrv)],
    ['research.coinmetrics.mvrvChange1d',relativeChange(m.mvrv,m.previousMvrv)]
  ];
  return rows.filter(([,value])=>value!=null).map(([id,value])=>({id,value}));
}

export function deribitOptionsSnapshotToExtraFeatures(snapshot){
  if(!snapshot?.ok) return [];
  const m=snapshot.metrics||{};
  const rows=[
    ['research.options.weightedIvPct',finite(m.weightedIvPct)],
    ['research.options.putCallOiRatio',finite(m.putCallOiRatio)],
    ['research.options.openInterestLog',log1pNonNegative(m.totalOpenInterest)],
    ['research.options.volumeUsdLog',log1pNonNegative(m.totalVolumeUsd)],
    ['research.options.putCallIvSkewPct',finite(m.putCallIvSkewPct)]
  ];
  return rows.filter(([,value])=>value!=null).map(([id,value])=>({id,value}));
}

export function macroSnapshotToExtraFeatures(snapshot){
  if(!snapshot?.ok) return [];
  const m=snapshot.metrics||{};
  const rows=[
    ['research.macro.fedFundsPct',finite(m.fedFundsPct)],
    ['research.macro.us10yPct',finite(m.us10yPct)],
    ['research.macro.broadDollarIndex',finite(m.broadDollarIndex)],
    ['research.macro.fedAssetsLog',log1pNonNegative(m.fedAssets)],
    ['research.macro.us10yMinusFedFundsPct',finite(m.us10yPct)!=null&&finite(m.fedFundsPct)!=null?Number(m.us10yPct)-Number(m.fedFundsPct):null]
  ];
  return rows.filter(([,value])=>value!=null).map(([id,value])=>({id,value}));
}

export function predictionMarketSnapshotToExtraFeatures(snapshot){
  if(!snapshot?.ok) return [];
  const m=snapshot.metrics||{};
  const p=finite(m.yesProbability);
  const rows=[
    ['research.prediction.yesProbability',p],
    ['research.prediction.confidenceFromHalf',p==null?null:Math.abs(p-.5)*2],
    ['research.prediction.liquidityLog',log1pNonNegative(m.liquidity)],
    ['research.prediction.volume24hLog',log1pNonNegative(m.volume24h)]
  ];
  return rows.filter(([,value])=>value!=null).map(([id,value])=>({id,value}));
}

export function createExternalResearchProvider({
  fetchImpl=globalThis.fetch,
  coinMetricsBase='https://community-api.coinmetrics.io/v4',
  deribitBase='https://www.deribit.com/api/v2',
  fredBase='https://api.stlouisfed.org/fred',
  fredApiKey='',
  polymarketBase='https://gamma-api.polymarket.com',
  polymarketMarkets={},
  timeoutMs=8000,
  now=()=>Date.now()
}={}){
  if(typeof fetchImpl!=='function') throw new Error('fetch implementation required');
  const cmBase=String(coinMetricsBase).replace(/\/+$/,'');
  const dBase=String(deribitBase).replace(/\/+$/,'');
  const fBase=String(fredBase).replace(/\/+$/,'');
  const pBase=String(polymarketBase).replace(/\/+$/,'');
  const polyConfig=parseMaybeJson(polymarketMarkets,{});
  const cache=new Map();

  async function fetchJson(url){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),Math.max(1000,Number(timeoutMs)||8000));
    try{
      const res=await fetchImpl(url,{headers:{accept:'application/json','user-agent':'TCX/2.6 SHADOW_ONLY research'},signal:controller.signal});
      if(!res?.ok) throw new Error('HTTP_'+String(res?.status??'UNKNOWN')+':'+new URL(url).host);
      return await res.json();
    }finally{clearTimeout(timer);}
  }
  async function cached(key,ttlMs,fn,{force=false}={}){
    const t=now();
    const hit=cache.get(key);
    if(!force&&hit&&t-hit.at<=Math.max(0,Number(ttlMs)||0)) return structuredClone(hit.value);
    const value=await fn();
    cache.set(key,{at:t,value});
    return structuredClone(value);
  }

  async function fetchCoinMetricsSnapshot(symbol,{force=false}={}){
    const asset=symbolAsset(symbol);
    if(!asset) return freeze({ok:false,source:'COINMETRICS_COMMUNITY_V4',reason:'ASSET_UNMAPPED',symbol:String(symbol||'').toUpperCase(),availableAt:now()});
    return cached('cm:'+asset,15*60_000,async()=>{
      const metrics=['AdrActCnt','AdrNewCnt','TxCnt','CapMVRVCur'];
      const url=cmBase+'/timeseries/asset-metrics?assets='+encodeURIComponent(asset)+'&metrics='+encodeURIComponent(metrics.join(','))+'&frequency=1d&sort=desc&page_size=2';
      const body=await fetchJson(url);
      const rows=Array.isArray(body?.data)?body.data:[];
      const latest=rows[0]||null,previous=rows[1]||null;
      if(!latest) return freeze({ok:false,source:'COINMETRICS_COMMUNITY_V4',reason:'NO_DATA',symbol:String(symbol||'').toUpperCase(),asset,availableAt:now()});
      const availableAt=now();
      const eventTime=Date.parse(String(latest.time||''));
      return freeze({
        version:EXTERNAL_RESEARCH_PROVIDER_VERSION,ok:true,source:'COINMETRICS_COMMUNITY_V4',symbol:String(symbol||'').toUpperCase(),asset,
        eventTime:Number.isFinite(eventTime)?eventTime:availableAt,availableAt,
        metrics:{
          activeAddresses:finite(latest.AdrActCnt),previousActiveAddresses:finite(previous?.AdrActCnt),
          newAddresses:finite(latest.AdrNewCnt),txCount:finite(latest.TxCnt),
          mvrv:finite(latest.CapMVRVCur),previousMvrv:finite(previous?.CapMVRVCur)
        },
        provenance:{endpoint:'/timeseries/asset-metrics',frequency:'1d',communityApi:true,apiKeyRequired:false,researchOnly:true}
      });
    },{force});
  }

  async function fetchDeribitOptionsSnapshot(symbol,{force=false}={}){
    const currency=deribitCurrency(symbol);
    if(!currency) return freeze({ok:false,source:'DERIBIT_PUBLIC_OPTIONS',reason:'UNSUPPORTED_UNDERLYING',symbol:String(symbol||'').toUpperCase(),availableAt:now()});
    return cached('deribit:'+currency,60_000,async()=>{
      const body=await fetchJson(dBase+'/public/get_book_summary_by_currency?currency='+encodeURIComponent(currency)+'&kind=option');
      const rows=Array.isArray(body?.result)?body.result:[];
      if(!rows.length) return freeze({ok:false,source:'DERIBIT_PUBLIC_OPTIONS',reason:'NO_OPTIONS',symbol:String(symbol||'').toUpperCase(),currency,availableAt:now()});
      const puts=rows.filter(r=>String(r?.instrument_name||'').endsWith('-P'));
      const calls=rows.filter(r=>String(r?.instrument_name||'').endsWith('-C'));
      const putOi=puts.reduce((a,r)=>a+(Math.max(0,finite(r?.open_interest)||0)),0);
      const callOi=calls.reduce((a,r)=>a+(Math.max(0,finite(r?.open_interest)||0)),0);
      const totalOpenInterest=putOi+callOi;
      const totalVolumeUsd=rows.reduce((a,r)=>a+(Math.max(0,finite(r?.volume_usd)||0)),0);
      const putIv=weightedAverage(puts,'mark_iv');
      const callIv=weightedAverage(calls,'mark_iv');
      const availableAt=now();
      return freeze({
        version:EXTERNAL_RESEARCH_PROVIDER_VERSION,ok:true,source:'DERIBIT_PUBLIC_OPTIONS',symbol:String(symbol||'').toUpperCase(),currency,eventTime:availableAt,availableAt,
        metrics:{
          weightedIvPct:weightedAverage(rows,'mark_iv'),putIvPct:putIv,callIvPct:callIv,
          putCallIvSkewPct:putIv!=null&&callIv!=null?putIv-callIv:null,
          putCallOiRatio:callOi>0?putOi/callOi:null,totalOpenInterest,totalVolumeUsd,instrumentCount:rows.length
        },
        provenance:{endpoint:'public/get_book_summary_by_currency',kind:'option',publicMarketData:true,researchOnly:true}
      });
    },{force});
  }

  async function fetchFredSeries(seriesId){
    const key=String(fredApiKey||'').trim();
    if(!key) return null;
    const day=isoDay(now());
    const url=fBase+'/series/observations?series_id='+encodeURIComponent(seriesId)+'&api_key='+encodeURIComponent(key)+'&file_type=json&sort_order=desc&limit=2&realtime_start='+day+'&realtime_end='+day;
    const body=await fetchJson(url);
    const rows=(Array.isArray(body?.observations)?body.observations:[]).filter(r=>finite(r?.value)!=null);
    return {seriesId,current:finite(rows[0]?.value),previous:finite(rows[1]?.value),date:rows[0]?.date||null,realtimeStart:rows[0]?.realtime_start||body?.realtime_start||day,realtimeEnd:rows[0]?.realtime_end||body?.realtime_end||day};
  }

  async function fetchMacroSnapshot({force=false}={}){
    if(!String(fredApiKey||'').trim()) return freeze({ok:false,source:'FRED_REALTIME_V1',reason:'FRED_API_KEY_NOT_CONFIGURED',availableAt:now()});
    return cached('fred:macro',15*60_000,async()=>{
      const seriesIds=['DFF','DGS10','DTWEXBGS','WALCL'];
      const settled=await Promise.allSettled(seriesIds.map(fetchFredSeries));
      const byId={};
      const errors=[];
      settled.forEach((r,i)=>{if(r.status==='fulfilled'&&r.value) byId[seriesIds[i]]=r.value; else if(r.status==='rejected') errors.push({seriesId:seriesIds[i],error:r.reason instanceof Error?r.reason.message:String(r.reason)});});
      const availableAt=now();
      const metrics={fedFundsPct:byId.DFF?.current??null,us10yPct:byId.DGS10?.current??null,broadDollarIndex:byId.DTWEXBGS?.current??null,fedAssets:byId.WALCL?.current??null};
      const availableCount=Object.values(metrics).filter(v=>finite(v)!=null).length;
      return freeze({
        version:EXTERNAL_RESEARCH_PROVIDER_VERSION,ok:availableCount>0,source:'FRED_REALTIME_V1',eventTime:availableAt,availableAt,metrics,
        series:byId,errors,quality:{availableCount,expectedCount:4,completeness:availableCount/4},
        provenance:{realtimeMode:'CURRENT_VINTAGE_CAPTURE',pointInTimeArchiveRequired:true,seriesIds,researchOnly:true}
      });
    },{force});
  }

  async function fetchPredictionMarketSnapshot(symbol,{force=false}={}){
    const key=String(symbol||'').toUpperCase();
    const raw=polyConfig?.[key];
    const cfg=typeof raw==='string'?{slug:raw}:(raw&&typeof raw==='object'?raw:null);
    if(!cfg?.slug) return freeze({ok:false,source:'POLYMARKET_GAMMA_CONFIGURED',reason:'MARKET_NOT_CONFIGURED',symbol:key,availableAt:now()});
    return cached('poly:'+key+':'+cfg.slug,60_000,async()=>{
      const body=await fetchJson(pBase+'/markets?slug='+encodeURIComponent(cfg.slug));
      const market=Array.isArray(body)?body[0]:Array.isArray(body?.data)?body.data[0]:body?.market||null;
      if(!market) return freeze({ok:false,source:'POLYMARKET_GAMMA_CONFIGURED',reason:'MARKET_NOT_FOUND',symbol:key,slug:cfg.slug,availableAt:now()});
      const outcomes=parseMaybeJson(market.outcomes,Array.isArray(market.outcomes)?market.outcomes:[]);
      const prices=parseMaybeJson(market.outcomePrices,Array.isArray(market.outcomePrices)?market.outcomePrices:[]);
      const yesLabel=String(cfg.yesOutcome||'Yes').toLowerCase();
      const idx=(Array.isArray(outcomes)?outcomes:[]).findIndex(x=>String(x).toLowerCase()===yesLabel);
      const yesProbability=idx>=0?finite(prices?.[idx]):null;
      const availableAt=now();
      return freeze({
        version:EXTERNAL_RESEARCH_PROVIDER_VERSION,ok:yesProbability!=null&&yesProbability>=0&&yesProbability<=1,source:'POLYMARKET_GAMMA_CONFIGURED',symbol:key,slug:cfg.slug,eventTime:availableAt,availableAt,
        metrics:{yesProbability,liquidity:finite(market.liquidityNum??market.liquidity),volume24h:finite(market.volume24hr??market.volume24h)},
        market:{id:String(market.id||''),question:String(market.question||''),endDate:market.endDate||market.end_date_iso||null},
        provenance:{endpoint:'/markets?slug=',configuredMapping:true,priceInterpretation:'MARKET_IMPLIED_PROBABILITY',researchOnly:true}
      });
    },{force});
  }

  async function fetchBundle(symbol,{force=false}={}){
    const [coinMetrics,deribitOptions,macro,predictionMarket]=await Promise.all([
      fetchCoinMetricsSnapshot(symbol,{force}).catch(error=>({ok:false,source:'COINMETRICS_COMMUNITY_V4',reason:error instanceof Error?error.message:String(error),availableAt:now()})),
      fetchDeribitOptionsSnapshot(symbol,{force}).catch(error=>({ok:false,source:'DERIBIT_PUBLIC_OPTIONS',reason:error instanceof Error?error.message:String(error),availableAt:now()})),
      fetchMacroSnapshot({force}).catch(error=>({ok:false,source:'FRED_REALTIME_V1',reason:error instanceof Error?error.message:String(error),availableAt:now()})),
      fetchPredictionMarketSnapshot(symbol,{force}).catch(error=>({ok:false,source:'POLYMARKET_GAMMA_CONFIGURED',reason:error instanceof Error?error.message:String(error),availableAt:now()}))
    ]);
    const availableAt=now();
    return freeze({version:EXTERNAL_RESEARCH_PROVIDER_VERSION,symbol:String(symbol||'').toUpperCase(),availableAt,coinMetrics,deribitOptions,macro,predictionMarket,restrictions:{researchOnly:true,mayExecute:false,mayMutateProductionForecast:false}});
  }

  return Object.freeze({
    version:EXTERNAL_RESEARCH_PROVIDER_VERSION,
    fetchCoinMetricsSnapshot,fetchDeribitOptionsSnapshot,fetchMacroSnapshot,fetchPredictionMarketSnapshot,fetchBundle,
    coinMetricsSnapshotToExtraFeatures,deribitOptionsSnapshotToExtraFeatures,macroSnapshotToExtraFeatures,predictionMarketSnapshotToExtraFeatures
  });
}
