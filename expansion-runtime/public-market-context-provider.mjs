export const PUBLIC_MARKET_CONTEXT_PROVIDER_VERSION='TCX_PUBLIC_MARKET_CONTEXT_V1';

function finite(v){
  const n=Number(v);
  return Number.isFinite(n)?n:null;
}

function text(v){
  return String(v??'').trim();
}
function log1pNonNegative(v){
  const n=finite(v);
  return n!=null&&n>=0?Math.log1p(n):null;
}

export function publicMarketContextToExtraFeatures(context){
  const s=context?.sentiment||null;
  const g=context?.global||null;
  const rows=[];
  const add=(id,value)=>{
    const n=finite(value);
    if(n!=null) rows.push({id,value:n});
  };
  if(s){
    add('research.sentiment.fearGreedLevel',finite(s.value)==null?null:Number(s.value)/100);
    add('research.sentiment.fearGreedCentered',finite(s.value)==null?null:(Number(s.value)-50)/50);
    add('research.sentiment.fearGreedDelta',finite(s.delta)==null?null:Number(s.delta)/100);
  }
  if(g){
    add('research.marketContext.bitcoinDominancePct',g.bitcoinDominancePct);
    add('research.marketContext.totalMarketCapLog',log1pNonNegative(g.totalMarketCapUsd));
    add('research.marketContext.totalVolume24hLog',log1pNonNegative(g.totalVolume24hUsd));
    add('research.marketContext.volumeToCapRatio',
      finite(g.totalMarketCapUsd)>0&&finite(g.totalVolume24hUsd)!=null?Number(g.totalVolume24hUsd)/Number(g.totalMarketCapUsd):null);
    add('research.marketContext.activeCryptocurrenciesLog',log1pNonNegative(g.activeCryptocurrencies));
    add('research.marketContext.activeMarketsLog',log1pNonNegative(g.activeMarkets));
  }
  return rows;
}

export function createPublicMarketContextProvider({
  fetchImpl=globalThis.fetch,
  alternativeBase='https://api.alternative.me',
  timeoutMs=8000,
  cacheTtlMs=300000
}={}){
  if(typeof fetchImpl!=='function') throw new Error('fetch implementation required');
  const base=String(alternativeBase).replace(/\/+$/,'');
  const cache=new Map();

  async function fetchJson(path){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),Math.max(1000,Number(timeoutMs)||8000));
    try{
      const res=await fetchImpl(base+path,{
        method:'GET',
        headers:{accept:'application/json','user-agent':'TCX/1.0 public-market-context'},
        signal:controller.signal
      });
      if(!res?.ok) throw new Error('ALTERNATIVE_HTTP_'+String(res?.status??'UNKNOWN'));
      return await res.json();
    }finally{
      clearTimeout(timer);
    }
  }

  async function cached(key,fn,{force=false}={}){
    const now=Date.now();
    const hit=cache.get(key);
    if(!force&&hit&&now-hit.at<cacheTtlMs) return hit.value;
    const value=await fn();
    cache.set(key,{at:now,value});
    return value;
  }

  async function fetchFearGreed({force=false}={}){
    return cached('fear-greed',async()=>{
      const body=await fetchJson('/fng/?limit=2&format=json');
      const rows=Array.isArray(body?.data)?body.data:[];
      const current=rows[0]||null;
      const previous=rows[1]||null;
      const value=finite(current?.value);
      const previousValue=finite(previous?.value);
      if(value==null) throw new Error('FEAR_GREED_VALUE_MISSING');
      return Object.freeze({
        value,
        classification:text(current?.value_classification)||'Unknown',
        previousValue,
        delta:previousValue==null?null:value-previousValue,
        timestamp:finite(current?.timestamp)==null?null:Number(current.timestamp)*1000,
        nextUpdateSeconds:finite(current?.time_until_update),
        source:'Alternative.me Fear & Greed Index',
        attributionRequired:true,
        epistemic:'MARKET_SENTIMENT_INDEX_NOT_FORECAST_PROBABILITY'
      });
    },{force});
  }

  async function fetchGlobal({force=false}={}){
    return cached('global',async()=>{
      const body=await fetchJson('/v2/global/');
      const d=body?.data||{};
      return Object.freeze({
        activeCryptocurrencies:finite(d?.active_cryptocurrencies),
        activeMarkets:finite(d?.active_markets),
        bitcoinDominancePct:finite(d?.bitcoin_percentage_of_market_cap),
        totalMarketCapUsd:finite(d?.quotes?.USD?.total_market_cap),
        totalVolume24hUsd:finite(d?.quotes?.USD?.total_volume_24h),
        lastUpdated:finite(d?.last_updated)==null?null:Number(d.last_updated)*1000,
        source:'Alternative.me Crypto API',
        epistemic:'GLOBAL_MARKET_SNAPSHOT_NOT_FORECAST_PROBABILITY'
      });
    },{force});
  }

  async function fetchContext({force=false}={}){
    const [sentiment,global]=await Promise.allSettled([
      fetchFearGreed({force}),
      fetchGlobal({force})
    ]);
    return Object.freeze({
      version:PUBLIC_MARKET_CONTEXT_PROVIDER_VERSION,
      capturedAt:Date.now(),
      sentiment:sentiment.status==='fulfilled'?sentiment.value:null,
      global:global.status==='fulfilled'?global.value:null,
      errors:Object.freeze([
        ...(sentiment.status==='rejected'?[{source:'fear-greed',error:sentiment.reason instanceof Error?sentiment.reason.message:String(sentiment.reason)}]:[]),
        ...(global.status==='rejected'?[{source:'global',error:global.reason instanceof Error?global.reason.message:String(global.reason)}]:[])
      ])
    });
  }

  return Object.freeze({
    version:PUBLIC_MARKET_CONTEXT_PROVIDER_VERSION,
    fetchFearGreed,
    fetchGlobal,
    fetchContext
  });
}
