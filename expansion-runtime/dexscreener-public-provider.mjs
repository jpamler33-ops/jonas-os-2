export const DEXSCREENER_PUBLIC_PROVIDER_VERSION='TCX_DEXSCREENER_PUBLIC_PROVIDER_V1';

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
function median(values){
  const xs=(Array.isArray(values)?values:[]).map(finite).filter(x=>x!=null).sort((a,b)=>a-b);
  if(!xs.length) return null;
  const m=Math.floor(xs.length/2);
  return xs.length%2?xs[m]:(xs[m-1]+xs[m])/2;
}

export function dexScreenerTrendingMetasToExtraFeatures(snapshot){
  const rows=Array.isArray(snapshot?.rows)?snapshot.rows:[];
  if(!rows.length) return [];
  const marketCaps=rows.map(x=>finite(x?.marketCap)).filter(x=>x!=null&&x>=0);
  const liquidities=rows.map(x=>finite(x?.liquidity)).filter(x=>x!=null&&x>=0);
  const volumes=rows.map(x=>finite(x?.volume)).filter(x=>x!=null&&x>=0);
  const h1=rows.map(x=>finite(x?.marketCapChange?.h1)).filter(x=>x!=null);
  const h24=rows.map(x=>finite(x?.marketCapChange?.h24)).filter(x=>x!=null);
  const totalMarketCap=marketCaps.reduce((a,b)=>a+b,0);
  const totalLiquidity=liquidities.reduce((a,b)=>a+b,0);
  const totalVolume=volumes.reduce((a,b)=>a+b,0);
  const topLiquidity=liquidities.length?Math.max(...liquidities):null;
  const candidates=[
    ['research.dex.trendingMetaCountLog',log1pNonNegative(rows.length)],
    ['research.dex.trendingMarketCapLog',log1pNonNegative(totalMarketCap)],
    ['research.dex.trendingLiquidityLog',log1pNonNegative(totalLiquidity)],
    ['research.dex.trendingVolumeLog',log1pNonNegative(totalVolume)],
    ['research.dex.trendingVolumeLiquidityRatio',totalLiquidity>0?totalVolume/totalLiquidity:null],
    ['research.dex.trendingTopLiquidityShare',topLiquidity!=null&&totalLiquidity>0?topLiquidity/totalLiquidity:null],
    ['research.dex.trendingH1MedianPct',median(h1)],
    ['research.dex.trendingH24MedianPct',median(h24)]
  ];
  return candidates.filter(([,value])=>finite(value)!=null).map(([id,value])=>({id,value:Number(value)}));
}

function clampInt(v,min,max,fallback){
  const n=Math.floor(Number(v));
  return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback;
}

function bestPair(rows=[]){
  const xs=(Array.isArray(rows)?rows:[]).filter(Boolean);
  if(!xs.length) return null;
  return xs.slice().sort((a,b)=>{
    const la=finite(a?.liquidityUsd ?? a?.liquidity?.usd)??-1;
    const lb=finite(b?.liquidityUsd ?? b?.liquidity?.usd)??-1;
    if(lb!==la) return lb-la;
    const va=finite(a?.volumeH24 ?? a?.volume?.h24)??-1;
    const vb=finite(b?.volumeH24 ?? b?.volume?.h24)??-1;
    return vb-va;
  })[0]||null;
}

function normalizePair(pair){
  if(!pair) return null;
  const h1=pair?.txns?.h1||{};
  return Object.freeze({
    chainId:text(pair.chainId),
    dexId:text(pair.dexId),
    url:text(pair.url),
    pairAddress:text(pair.pairAddress),
    baseToken:Object.freeze({
      address:text(pair?.baseToken?.address),
      name:text(pair?.baseToken?.name),
      symbol:text(pair?.baseToken?.symbol)
    }),
    quoteToken:Object.freeze({
      address:text(pair?.quoteToken?.address),
      name:text(pair?.quoteToken?.name),
      symbol:text(pair?.quoteToken?.symbol)
    }),
    priceUsd:finite(pair.priceUsd),
    liquidityUsd:finite(pair?.liquidity?.usd),
    volumeH1:finite(pair?.volume?.h1),
    volumeH24:finite(pair?.volume?.h24),
    priceChangeH1:finite(pair?.priceChange?.h1),
    priceChangeH24:finite(pair?.priceChange?.h24),
    buysH1:Math.max(0,Math.floor(finite(h1?.buys)??0)),
    sellsH1:Math.max(0,Math.floor(finite(h1?.sells)??0)),
    marketCap:finite(pair.marketCap),
    fdv:finite(pair.fdv),
    pairCreatedAt:finite(pair.pairCreatedAt),
    activeBoosts:Math.max(0,Math.floor(finite(pair?.boosts?.active)??0))
  });
}

export function createDexScreenerPublicProvider({
  fetchImpl=globalThis.fetch,
  baseUrl='https://api.dexscreener.com',
  timeoutMs=8000,
  cacheTtlMs=30000
}={}){
  if(typeof fetchImpl!=='function') throw new Error('fetch implementation required');
  const base=String(baseUrl).replace(/\/+$/,'');
  const cache=new Map();

  async function fetchJson(path){
    const url=base+path;
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),Math.max(1000,Number(timeoutMs)||8000));
    try{
      const res=await fetchImpl(url,{
        method:'GET',
        headers:{accept:'application/json','user-agent':'TCX/1.0 public-market-intelligence'},
        signal:controller.signal
      });
      if(!res?.ok) throw new Error('DEXSCREENER_HTTP_'+String(res?.status??'UNKNOWN'));
      return await res.json();
    }finally{
      clearTimeout(timer);
    }
  }

  async function cached(key,ttl,fn,{force=false}={}){
    const now=Date.now();
    const hit=cache.get(key);
    if(!force&&hit&&now-hit.at<ttl) return hit.value;
    const value=await fn();
    cache.set(key,{at:now,value});
    return value;
  }

  async function fetchTopBoosts({limit=8,chainIds=['solana','base','ethereum'],force=false}={}){
    const max=clampInt(limit,1,20,8);
    const allowed=new Set((Array.isArray(chainIds)?chainIds:[]).map(x=>String(x).toLowerCase()));
    return cached('boosts:'+max+':'+[...allowed].sort().join(','),cacheTtlMs,async()=>{
      const body=await fetchJson('/token-boosts/top/v1');
      const rows=(Array.isArray(body)?body:[]).filter(x=>{
        const chain=String(x?.chainId||'').toLowerCase();
        return text(x?.tokenAddress)&&(!allowed.size||allowed.has(chain));
      });
      const seen=new Set();
      const out=[];
      for(const x of rows){
        const chainId=text(x.chainId);
        const tokenAddress=text(x.tokenAddress);
        const id=chainId.toLowerCase()+':'+tokenAddress.toLowerCase();
        if(seen.has(id)) continue;
        seen.add(id);
        out.push(Object.freeze({
          chainId,
          tokenAddress,
          url:text(x.url),
          description:text(x.description),
          amount:finite(x.amount),
          totalAmount:finite(x.totalAmount),
          links:Array.isArray(x.links)?x.links.map(y=>({type:text(y?.type),label:text(y?.label),url:text(y?.url)})):[]
        }));
        if(out.length>=max) break;
      }
      return Object.freeze(out);
    },{force});
  }

  async function fetchTokenPairs(chainId,tokenAddress,{force=false}={}){
    const chain=text(chainId), address=text(tokenAddress);
    if(!chain||!address) throw new Error('chainId and tokenAddress required');
    const key='pairs:'+chain.toLowerCase()+':'+address.toLowerCase();
    return cached(key,cacheTtlMs,async()=>{
      const body=await fetchJson('/token-pairs/v1/'+encodeURIComponent(chain)+'/'+encodeURIComponent(address));
      return Object.freeze((Array.isArray(body)?body:[]).map(normalizePair).filter(Boolean));
    },{force});
  }

  async function fetchMemecoinRadar({limit=6,chainIds=['solana','base','ethereum'],force=false}={}){
    const max=clampInt(limit,1,10,6);
    const boosts=await fetchTopBoosts({limit:max,chainIds,force});
    const settled=await Promise.allSettled(boosts.map(async boost=>{
      const pairs=await fetchTokenPairs(boost.chainId,boost.tokenAddress,{force});
      const pair=bestPair(pairs);
      return Object.freeze({
        chainId:boost.chainId,
        tokenAddress:boost.tokenAddress,
        boost:Object.freeze({
          amount:boost.amount,
          totalAmount:boost.totalAmount,
          url:boost.url
        }),
        pair,
        capturedAt:Date.now(),
        source:'DEXSCREENER_PUBLIC_API'
      });
    }));
    const rows=[];
    const errors=[];
    settled.forEach((r,i)=>{
      if(r.status==='fulfilled') rows.push(r.value);
      else errors.push({chainId:boosts[i]?.chainId||'',tokenAddress:boosts[i]?.tokenAddress||'',error:r.reason instanceof Error?r.reason.message:String(r.reason)});
    });
    return Object.freeze({
      version:DEXSCREENER_PUBLIC_PROVIDER_VERSION,
      capturedAt:Date.now(),
      rows:Object.freeze(rows),
      errors:Object.freeze(errors),
      source:'DEXSCREENER_PUBLIC_API',
      epistemic:'LIVE_DEX_ACTIVITY_NOT_PRICE_PROBABILITY'
    });
  }

  async function fetchTrendingMetas({limit=8,force=false}={}){
    const max=clampInt(limit,1,20,8);
    return cached('metas:'+max,Math.max(cacheTtlMs,60000),async()=>{
      const body=await fetchJson('/metas/trending/v1');
      const rows=(Array.isArray(body)?body:[]).slice(0,max).map(x=>Object.freeze({
        name:text(x?.name),
        slug:text(x?.slug),
        description:text(x?.description),
        marketCap:finite(x?.marketCap),
        liquidity:finite(x?.liquidity),
        volume:finite(x?.volume),
        tokenCount:Math.max(0,Math.floor(finite(x?.tokenCount)??0)),
        marketCapChange:Object.freeze({
          m5:finite(x?.marketCapChange?.m5),
          h1:finite(x?.marketCapChange?.h1),
          h6:finite(x?.marketCapChange?.h6),
          h24:finite(x?.marketCapChange?.h24)
        })
      }));
      return Object.freeze({
        version:DEXSCREENER_PUBLIC_PROVIDER_VERSION,
        capturedAt:Date.now(),
        rows:Object.freeze(rows),
        source:'DEXSCREENER_PUBLIC_API',
        epistemic:'TRENDING_META_ACTIVITY_NOT_SOCIAL_SENTIMENT_OR_FORECAST'
      });
    },{force});
  }

  return Object.freeze({
    version:DEXSCREENER_PUBLIC_PROVIDER_VERSION,
    fetchTopBoosts,
    fetchTokenPairs,
    fetchMemecoinRadar,
    fetchTrendingMetas
  });
}
