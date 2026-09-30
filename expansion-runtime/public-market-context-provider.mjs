export const PUBLIC_MARKET_CONTEXT_PROVIDER_VERSION='TCX_PUBLIC_MARKET_CONTEXT_V3';

function finite(v){
  if(v==null||v==='') return null;
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
function share(part,total){
  const p=finite(part),t=finite(total);
  return p!=null&&t!=null&&t>0?Math.max(0,Math.min(1,p/t)):null;
}
function stablecoinUsd(row){
  const direct=finite(row?.totalCirculatingUSD);
  if(direct!=null&&direct>=0) return direct;
  const raw=row?.totalCirculatingUSD;
  if(raw&&typeof raw==='object'){
    const values=Object.values(raw).map(finite).filter(v=>v!=null&&v>=0);
    if(values.length) return values.reduce((a,b)=>a+b,0);
  }
  for(const candidate of [row?.stablecoinsMcap,row?.stablecoinMcap,row?.mcap,row?.total]){
    const n=finite(candidate);
    if(n!=null&&n>=0) return n;
  }
  return null;
}

export function publicMarketContextToExtraFeatures(context){
  const s=context?.sentiment||null;
  const g=context?.global||null;
  const d=context?.defi||null;
  const st=context?.stablecoins||null;
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
  if(d){
    add('research.defi.totalTvlLog',log1pNonNegative(d.totalTvlUsd));
    add('research.defi.chainCountLog',log1pNonNegative(d.chainCount));
    add('research.defi.ethereumTvlShare',share(d.ethereumTvlUsd,d.totalTvlUsd));
    add('research.defi.solanaTvlShare',share(d.solanaTvlUsd,d.totalTvlUsd));
    add('research.defi.bitcoinTvlShare',share(d.bitcoinTvlUsd,d.totalTvlUsd));
    add('research.defi.top10TvlShare',d.top10TvlShare);
  }
  if(st){
    add('research.stablecoin.totalSupplyLog',log1pNonNegative(st.totalSupplyUsd));
    add('research.stablecoin.chainCountLog',log1pNonNegative(st.chainCount));
    add('research.stablecoin.ethereumSupplyShare',share(st.ethereumSupplyUsd,st.totalSupplyUsd));
    add('research.stablecoin.tronSupplyShare',share(st.tronSupplyUsd,st.totalSupplyUsd));
    add('research.stablecoin.solanaSupplyShare',share(st.solanaSupplyUsd,st.totalSupplyUsd));
    add('research.stablecoin.baseSupplyShare',share(st.baseSupplyUsd,st.totalSupplyUsd));
    add('research.stablecoin.top5SupplyShare',st.top5SupplyShare);
    add('research.stablecoin.supplyToDefiTvlRatio',
      finite(st.totalSupplyUsd)!=null&&finite(d?.totalTvlUsd)>0?Number(st.totalSupplyUsd)/Number(d.totalTvlUsd):null);
  }
  return rows;
}

export function createPublicMarketContextProvider({
  fetchImpl=globalThis.fetch,
  alternativeBase='https://api.alternative.me',
  defiLlamaBase='https://api.llama.fi',
  stablecoinBase='https://stablecoins.llama.fi',
  timeoutMs=8000,
  cacheTtlMs=300000
}={}){
  if(typeof fetchImpl!=='function') throw new Error('fetch implementation required');
  const altBase=String(alternativeBase).replace(/\/+$/,'');
  const llamaBase=String(defiLlamaBase).replace(/\/+$/,'');
  const stableBase=String(stablecoinBase).replace(/\/+$/,'');
  const cache=new Map();

  async function fetchJson(base,path,errorPrefix){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),Math.max(1000,Number(timeoutMs)||8000));
    try{
      const res=await fetchImpl(base+path,{
        method:'GET',
        headers:{accept:'application/json','user-agent':'TCX/1.0 public-market-context'},
        signal:controller.signal
      });
      if(!res?.ok) throw new Error(String(errorPrefix||'PUBLIC_CONTEXT')+'_HTTP_'+String(res?.status??'UNKNOWN'));
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
      const body=await fetchJson(altBase,'/fng/?limit=2&format=json','ALTERNATIVE');
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
      const body=await fetchJson(altBase,'/v2/global/','ALTERNATIVE');
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

  async function fetchDefi({force=false}={}){
    return cached('defi-chains',async()=>{
      const body=await fetchJson(llamaBase,'/v2/chains','DEFILLAMA');
      const rows=(Array.isArray(body)?body:[]).map(x=>({
        name:text(x?.name),
        tvl:finite(x?.tvl)
      })).filter(x=>x.name&&x.tvl!=null&&x.tvl>=0);
      if(!rows.length) throw new Error('DEFILLAMA_CHAIN_TVL_MISSING');
      const totalTvlUsd=rows.reduce((sum,x)=>sum+x.tvl,0);
      const byName=new Map(rows.map(x=>[x.name.toLowerCase(),x.tvl]));
      const top10TvlUsd=rows.slice().sort((a,b)=>b.tvl-a.tvl).slice(0,10).reduce((sum,x)=>sum+x.tvl,0);
      return Object.freeze({
        totalTvlUsd,
        chainCount:rows.length,
        ethereumTvlUsd:byName.get('ethereum')??null,
        solanaTvlUsd:byName.get('solana')??null,
        bitcoinTvlUsd:byName.get('bitcoin')??null,
        top10TvlShare:totalTvlUsd>0?top10TvlUsd/totalTvlUsd:null,
        source:'DefiLlama Public API',
        endpoint:'/v2/chains',
        epistemic:'CURRENT_DEFI_TVL_SNAPSHOT_NOT_FLOW_OR_FORECAST'
      });
    },{force});
  }

  async function fetchStablecoins({force=false}={}){
    return cached('stablecoin-chains',async()=>{
      const body=await fetchJson(stableBase,'/stablecoinchains','DEFILLAMA_STABLECOINS');
      const rows=(Array.isArray(body)?body:[]).map(x=>({
        name:text(x?.name),
        supplyUsd:stablecoinUsd(x)
      })).filter(x=>x.name&&x.supplyUsd!=null&&x.supplyUsd>=0);
      if(!rows.length) throw new Error('DEFILLAMA_STABLECOIN_SUPPLY_MISSING');
      const totalSupplyUsd=rows.reduce((sum,x)=>sum+x.supplyUsd,0);
      const byName=new Map(rows.map(x=>[x.name.toLowerCase(),x.supplyUsd]));
      const top5SupplyUsd=rows.slice().sort((a,b)=>b.supplyUsd-a.supplyUsd).slice(0,5).reduce((sum,x)=>sum+x.supplyUsd,0);
      return Object.freeze({
        totalSupplyUsd,
        chainCount:rows.length,
        ethereumSupplyUsd:byName.get('ethereum')??null,
        tronSupplyUsd:byName.get('tron')??null,
        solanaSupplyUsd:byName.get('solana')??null,
        baseSupplyUsd:byName.get('base')??null,
        top5SupplyShare:totalSupplyUsd>0?top5SupplyUsd/totalSupplyUsd:null,
        source:'DefiLlama Stablecoins Public API',
        endpoint:'/stablecoinchains',
        epistemic:'CURRENT_STABLECOIN_SUPPLY_SNAPSHOT_NOT_FLOW_OR_FORECAST'
      });
    },{force});
  }

  async function fetchContext({force=false}={}){
    const [sentiment,global,defi,stablecoins]=await Promise.allSettled([
      fetchFearGreed({force}),
      fetchGlobal({force}),
      fetchDefi({force}),
      fetchStablecoins({force})
    ]);
    return Object.freeze({
      version:PUBLIC_MARKET_CONTEXT_PROVIDER_VERSION,
      capturedAt:Date.now(),
      sentiment:sentiment.status==='fulfilled'?sentiment.value:null,
      global:global.status==='fulfilled'?global.value:null,
      defi:defi.status==='fulfilled'?defi.value:null,
      stablecoins:stablecoins.status==='fulfilled'?stablecoins.value:null,
      errors:Object.freeze([
        ...(sentiment.status==='rejected'?[{source:'fear-greed',error:sentiment.reason instanceof Error?sentiment.reason.message:String(sentiment.reason)}]:[]),
        ...(global.status==='rejected'?[{source:'global',error:global.reason instanceof Error?global.reason.message:String(global.reason)}]:[]),
        ...(defi.status==='rejected'?[{source:'defi',error:defi.reason instanceof Error?defi.reason.message:String(defi.reason)}]:[]),
        ...(stablecoins.status==='rejected'?[{source:'stablecoins',error:stablecoins.reason instanceof Error?stablecoins.reason.message:String(stablecoins.reason)}]:[])
      ])
    });
  }

  return Object.freeze({
    version:PUBLIC_MARKET_CONTEXT_PROVIDER_VERSION,
    fetchFearGreed,
    fetchGlobal,
    fetchDefi,
    fetchStablecoins,
    fetchContext
  });
}
