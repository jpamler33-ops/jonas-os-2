export const DEFILLAMA_PUBLIC_PROVIDER_VERSION='TCX_DEFILLAMA_PUBLIC_PROVIDER_V1';

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

function stablecoinUsd(row){
  const direct=finite(row?.totalCirculatingUSD);
  if(direct!=null) return direct;
  const x=row?.totalCirculatingUSD;
  if(x&&typeof x==='object'){
    const values=Object.values(x).map(finite).filter(v=>v!=null&&v>=0);
    if(values.length) return values.reduce((a,b)=>a+b,0);
  }
  for(const candidate of [row?.stablecoinsMcap,row?.stablecoinMcap,row?.mcap,row?.total]){
    const n=finite(candidate);
    if(n!=null&&n>=0) return n;
  }
  return null;
}

const SYMBOL_CHAIN=Object.freeze({
  BTCUSDT:'Bitcoin',
  ETHUSDT:'Ethereum',
  SOLUSDT:'Solana'
});

export function defiLlamaSnapshotToExtraFeatures(snapshot){
  if(!snapshot||snapshot.ok!==true) return [];
  const m=snapshot.metrics||{};
  const rows=[];
  const add=(id,value)=>{
    const n=finite(value);
    if(n!=null) rows.push({id,value:n});
  };
  add('research.defi.totalTvlLog',log1pNonNegative(m.totalTvlUsd));
  add('research.defi.chainTvlLog',log1pNonNegative(m.chainTvlUsd));
  add('research.defi.chainTvlShare',m.chainTvlShare);
  add('research.defi.totalStablecoinSupplyLog',log1pNonNegative(m.totalStablecoinSupplyUsd));
  add('research.defi.chainStablecoinSupplyLog',log1pNonNegative(m.chainStablecoinSupplyUsd));
  add('research.defi.chainStablecoinToTvlRatio',m.chainStablecoinToTvlRatio);
  return rows;
}

export function createDefiLlamaPublicProvider({
  fetchImpl=globalThis.fetch,
  chainsBase='https://api.llama.fi',
  stablecoinsBase='https://stablecoins.llama.fi',
  timeoutMs=8000,
  cacheTtlMs=5*60_000,
  now=()=>Date.now()
}={}){
  if(typeof fetchImpl!=='function') throw new Error('fetch implementation required');
  const cBase=String(chainsBase).replace(/\/+$/,'');
  const sBase=String(stablecoinsBase).replace(/\/+$/,'');
  const cache=new Map();

  async function fetchJson(url){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),Math.max(1000,Number(timeoutMs)||8000));
    try{
      const res=await fetchImpl(url,{
        method:'GET',
        headers:{accept:'application/json','user-agent':'TCX/1.0 public-defi-liquidity-research'},
        signal:controller.signal
      });
      if(!res?.ok) throw new Error('DEFILLAMA_HTTP_'+String(res?.status??'UNKNOWN'));
      return await res.json();
    }finally{
      clearTimeout(timer);
    }
  }

  async function cached(key,url,{force=false}={}){
    const t=Number(now());
    const hit=cache.get(key);
    if(!force&&hit&&t-hit.at<cacheTtlMs) return hit.value;
    const value=await fetchJson(url);
    cache.set(key,{at:t,value});
    return value;
  }

  async function fetchLiquiditySnapshot(symbol,{force=false}={}){
    const s=text(symbol).toUpperCase();
    const chainName=SYMBOL_CHAIN[s]||null;
    const capturedAt=Number(now());
    if(!chainName){
      return Object.freeze({
        version:DEFILLAMA_PUBLIC_PROVIDER_VERSION,
        symbol:s,
        ok:false,
        availableAt:capturedAt,
        chainName:null,
        metrics:null,
        source:'DEFILLAMA_PUBLIC_API',
        reason:'CHAIN_LIQUIDITY_NOT_MAPPED',
        errors:Object.freeze([]),
        epistemic:'PUBLIC_DEFI_LIQUIDITY_CONTEXT_NOT_FORECAST_PROBABILITY'
      });
    }

    const [chainsResult,stableResult]=await Promise.allSettled([
      cached('chains',cBase+'/v2/chains',{force}),
      cached('stablecoinchains',sBase+'/stablecoinchains',{force})
    ]);
    const errors=[];
    const chainRows=chainsResult.status==='fulfilled'&&Array.isArray(chainsResult.value)?chainsResult.value:[];
    const stableRows=stableResult.status==='fulfilled'&&Array.isArray(stableResult.value)?stableResult.value:[];
    if(chainsResult.status==='rejected') errors.push({source:'chains',error:chainsResult.reason instanceof Error?chainsResult.reason.message:String(chainsResult.reason)});
    if(stableResult.status==='rejected') errors.push({source:'stablecoinchains',error:stableResult.reason instanceof Error?stableResult.reason.message:String(stableResult.reason)});

    const totalTvlUsd=chainRows.map(x=>finite(x?.tvl)).filter(x=>x!=null&&x>=0).reduce((a,b)=>a+b,0);
    const chainRow=chainRows.find(x=>text(x?.name).toLowerCase()===chainName.toLowerCase())||null;
    const chainTvlUsd=finite(chainRow?.tvl);
    const chainTvlShare=chainTvlUsd!=null&&totalTvlUsd>0?chainTvlUsd/totalTvlUsd:null;

    const stableValues=stableRows.map(x=>stablecoinUsd(x)).filter(x=>x!=null&&x>=0);
    const totalStablecoinSupplyUsd=stableValues.length?stableValues.reduce((a,b)=>a+b,0):null;
    const stableRow=stableRows.find(x=>text(x?.name).toLowerCase()===chainName.toLowerCase())||null;
    const chainStablecoinSupplyUsd=stablecoinUsd(stableRow);
    const chainStablecoinToTvlRatio=chainStablecoinSupplyUsd!=null&&chainTvlUsd!=null&&chainTvlUsd>0
      ?chainStablecoinSupplyUsd/chainTvlUsd
      :null;

    const metrics=Object.freeze({
      totalTvlUsd:totalTvlUsd>0?totalTvlUsd:null,
      chainTvlUsd,
      chainTvlShare,
      totalStablecoinSupplyUsd,
      chainStablecoinSupplyUsd,
      chainStablecoinToTvlRatio
    });
    const availableCount=Object.values(metrics).filter(v=>finite(v)!=null).length;
    return Object.freeze({
      version:DEFILLAMA_PUBLIC_PROVIDER_VERSION,
      symbol:s,
      ok:availableCount>=2,
      availableAt:capturedAt,
      chainName,
      metrics,
      quality:Object.freeze({availableCount,expectedCount:6,completeness:availableCount/6}),
      source:'DEFILLAMA_PUBLIC_API',
      sourceUrls:Object.freeze([cBase+'/v2/chains',sBase+'/stablecoinchains']),
      errors:Object.freeze(errors),
      epistemic:'PUBLIC_DEFI_AND_STABLECOIN_LIQUIDITY_CONTEXT_NOT_FORECAST_PROBABILITY'
    });
  }

  return Object.freeze({
    version:DEFILLAMA_PUBLIC_PROVIDER_VERSION,
    fetchLiquiditySnapshot,
    defiLlamaSnapshotToExtraFeatures
  });
}
