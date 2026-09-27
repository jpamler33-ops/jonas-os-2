export const DERIVATIVES_PUBLIC_PROVIDER_VERSION='TCX_DERIVATIVES_PUBLIC_PROVIDER_V1';

function finite(v){
  const n=Number(v);
  return Number.isFinite(n)?n:null;
}
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
function safeRatio(a,b){
  const x=finite(a),y=finite(b);
  return x!=null&&y!=null&&Math.abs(y)>1e-12?x/y:null;
}
function symbolToOkx(symbol){
  const s=String(symbol||'').toUpperCase();
  if(!s.endsWith('USDT')) return null;
  return s.slice(0,-4)+'-USDT-SWAP';
}
function latest(xs){
  return Array.isArray(xs)&&xs.length?xs.at(-1):null;
}

export function derivativesSnapshotToExtraFeatures(snapshot){
  if(!snapshot||snapshot.ok!==true) return [];
  const t=finite(snapshot.availableAt);
  if(t==null) return [];
  const rows=[];
  const add=(id,value,source)=>{
    const n=finite(value);
    if(n==null) return;
    rows.push({id,value:n,availableAt:t,source});
  };
  const b=snapshot.binance||{};
  add('research.derivatives.fundingRate',b.fundingRate,'BINANCE_USDM_PUBLIC');
  add('research.derivatives.premiumPct',b.premiumPct,'BINANCE_USDM_PUBLIC');
  add('research.derivatives.openInterestUsd',b.openInterestUsd,'BINANCE_USDM_PUBLIC');
  add('research.derivatives.openInterestDelta5m',b.openInterestDelta5m,'BINANCE_USDM_PUBLIC');
  add('research.derivatives.globalLongShortRatio',b.globalLongShortRatio,'BINANCE_USDM_PUBLIC');
  add('research.derivatives.takerBuySellRatio',b.takerBuySellRatio,'BINANCE_USDM_PUBLIC');

  const o=snapshot.okx||{};
  add('research.derivatives.okxFundingRate',o.fundingRate,'OKX_PUBLIC');
  add('research.derivatives.okxOpenInterestUsd',o.openInterestUsd,'OKX_PUBLIC');

  if(finite(b.fundingRate)!=null&&finite(o.fundingRate)!=null){
    add('research.derivatives.fundingRateVenueSpread',Number(b.fundingRate)-Number(o.fundingRate),'BINANCE_OKX_DERIVED');
  }
  return rows;
}

export function createDerivativesPublicProvider({
  fetchImpl=globalThis.fetch,
  binanceBase='https://fapi.binance.com',
  okxBase='https://www.okx.com',
  timeoutMs=7000,
  now=()=>Date.now()
}={}){
  if(typeof fetchImpl!=='function') throw new Error('fetchImpl required');
  const bBase=String(binanceBase).replace(/\/+$/,'');
  const oBase=String(okxBase).replace(/\/+$/,'');
  const cache=new Map();

  async function fetchJson(url){
    const ctrl=new AbortController();
    const timer=setTimeout(()=>ctrl.abort(),Math.max(1,Number(timeoutMs)||7000));
    try{
      const res=await fetchImpl(url,{signal:ctrl.signal,headers:{accept:'application/json','user-agent':'TCX-SHADOW-RESEARCH'}});
      const body=await res.text();
      if(!res.ok) throw new Error('HTTP '+res.status+' '+new URL(url).host+': '+String(body).slice(0,160));
      return JSON.parse(body);
    }finally{
      clearTimeout(timer);
    }
  }

  async function fetchBinance(symbol){
    const encoded=encodeURIComponent(symbol);
    const [premium,oi,oiHist,longShort,taker]=await Promise.all([
      fetchJson(bBase+'/fapi/v1/premiumIndex?symbol='+encoded),
      fetchJson(bBase+'/fapi/v1/openInterest?symbol='+encoded),
      fetchJson(bBase+'/futures/data/openInterestHist?symbol='+encoded+'&period=5m&limit=2'),
      fetchJson(bBase+'/futures/data/globalLongShortAccountRatio?symbol='+encoded+'&period=5m&limit=1'),
      fetchJson(bBase+'/futures/data/takerlongshortRatio?symbol='+encoded+'&period=5m&limit=1')
    ]);
    const mark=finite(premium?.markPrice);
    const index=finite(premium?.indexPrice);
    const fundingRate=finite(premium?.lastFundingRate);
    const rawOi=finite(oi?.openInterest);
    const oiUsd=rawOi!=null&&mark!=null?rawOi*mark:null;
    const hist=Array.isArray(oiHist)?oiHist:[];
    const h0=hist.length>=2?hist.at(-2):null;
    const h1=latest(hist);
    const v0=finite(h0?.sumOpenInterestValue);
    const v1=finite(h1?.sumOpenInterestValue);
    const oiDelta=v0!=null&&v1!=null&&Math.abs(v0)>1e-12?(v1/v0-1):null;
    const ls=latest(Array.isArray(longShort)?longShort:[]);
    const tk=latest(Array.isArray(taker)?taker:[]);
    return {
      source:'BINANCE_USDM_PUBLIC',
      fundingRate,
      nextFundingTime:finite(premium?.nextFundingTime),
      markPrice:mark,
      indexPrice:index,
      premiumPct:mark!=null&&index!=null&&index>0?mark/index-1:null,
      openInterest:rawOi,
      openInterestUsd:oiUsd,
      openInterestDelta5m:oiDelta,
      globalLongShortRatio:finite(ls?.longShortRatio),
      takerBuySellRatio:finite(tk?.buySellRatio),
      publishedAt:Math.max(
        finite(premium?.time)||0,
        finite(oi?.time)||0,
        finite(h1?.timestamp)||0,
        finite(ls?.timestamp)||0,
        finite(tk?.timestamp)||0
      )||null
    };
  }

  async function fetchOkx(symbol){
    const instId=symbolToOkx(symbol);
    if(!instId) throw new Error('OKX instrument unavailable');
    const encoded=encodeURIComponent(instId);
    const [funding,oi]=await Promise.all([
      fetchJson(oBase+'/api/v5/public/funding-rate?instId='+encoded),
      fetchJson(oBase+'/api/v5/public/open-interest?instType=SWAP&instId='+encoded)
    ]);
    if(String(funding?.code)!=='0') throw new Error('OKX funding error '+String(funding?.code||'UNKNOWN'));
    if(String(oi?.code)!=='0') throw new Error('OKX open-interest error '+String(oi?.code||'UNKNOWN'));
    const f=funding?.data?.[0]||{};
    const o=oi?.data?.[0]||{};
    return {
      source:'OKX_PUBLIC',
      fundingRate:finite(f?.fundingRate),
      nextFundingTime:finite(f?.nextFundingTime),
      openInterest:finite(o?.oi),
      openInterestUsd:finite(o?.oiUsd),
      publishedAt:Math.max(finite(f?.ts)||0,finite(o?.ts)||0)||null
    };
  }

  async function fetchSnapshot(symbol,{cacheMs=15000}={}){
    const s=String(symbol||'').toUpperCase();
    if(!/^[A-Z0-9]{2,18}USDT$/.test(s)) throw new Error('invalid derivatives symbol');
    const cached=cache.get(s);
    const t0=now();
    if(cached&&t0-cached.cachedAt<=Math.max(0,Number(cacheMs)||0)) return structuredClone(cached.value);

    const [b,o]=await Promise.allSettled([fetchBinance(s),fetchOkx(s)]);
    const availableAt=now();
    const errors=[];
    const binance=b.status==='fulfilled'?b.value:null;
    const okx=o.status==='fulfilled'?o.value:null;
    if(!binance) errors.push({source:'BINANCE_USDM_PUBLIC',error:b.reason instanceof Error?b.reason.message:String(b.reason)});
    if(!okx) errors.push({source:'OKX_PUBLIC',error:o.reason instanceof Error?o.reason.message:String(o.reason)});
    const value=Object.freeze({
      version:DERIVATIVES_PUBLIC_PROVIDER_VERSION,
      symbol:s,
      availableAt,
      ok:Boolean(binance||okx),
      binance,
      okx,
      witness:Object.freeze({
        fundingRateAbsDiff:
          finite(binance?.fundingRate)!=null&&finite(okx?.fundingRate)!=null
            ?Math.abs(Number(binance.fundingRate)-Number(okx.fundingRate))
            :null,
        sourceCount:(binance?1:0)+(okx?1:0)
      }),
      errors:Object.freeze(errors),
      restrictions:Object.freeze({
        researchOnly:true,
        mayExecute:false,
        mayMutateProductionForecast:false
      })
    });
    cache.set(s,{cachedAt:availableAt,value});
    return structuredClone(value);
  }

  return Object.freeze({
    version:DERIVATIVES_PUBLIC_PROVIDER_VERSION,
    fetchSnapshot,
    derivativesSnapshotToExtraFeatures
  });
}
