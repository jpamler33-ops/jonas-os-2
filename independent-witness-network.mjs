function clamp(x,a=0,b=1){ return Math.max(a,Math.min(b,x)); }
function finite(x,fallback=null){ const n=Number(x); return Number.isFinite(n)?n:fallback; }

function summarizeBook({source,venue,symbol,quote,bids,asks,publishedAt,availableAt,provenance}){
  const cleanBids=(bids||[]).map(x=>[finite(x[0]),finite(x[1])]).filter(x=>x[0]>0&&x[1]>=0).slice(0,10);
  const cleanAsks=(asks||[]).map(x=>[finite(x[0]),finite(x[1])]).filter(x=>x[0]>0&&x[1]>=0).slice(0,10);
  if(!cleanBids.length||!cleanAsks.length) throw new Error(`empty order book: ${source}`);
  const bid=cleanBids[0][0],ask=cleanAsks[0][0];
  if(!(ask>=bid&&bid>0)) throw new Error(`crossed/invalid order book: ${source}`);
  const mid=(bid+ask)/2;
  const spreadBps=mid>0?(ask-bid)/mid*10000:null;
  const bidNotional=cleanBids.reduce((s,[p,q])=>s+p*q,0);
  const askNotional=cleanAsks.reduce((s,[p,q])=>s+p*q,0);
  const total=bidNotional+askNotional;
  const imbalance=total>0?(bidNotional-askNotional)/total:0;
  return {
    source,venue,symbol,quote,bid,ask,mid,spreadBps,imbalance,
    publishedAt:finite(publishedAt),
    availableAt:finite(availableAt,Date.now()),
    provenance:String(provenance||'')
  };
}

export function primaryWitnessFromSnapshot(snapshot){
  return {
    source:'BINANCE',
    venue:'BINANCE_SPOT',
    symbol:String(snapshot.symbol),
    quote:'USDT',
    bid:finite(snapshot.bid),
    ask:finite(snapshot.ask),
    mid:(finite(snapshot.bid)+finite(snapshot.ask))/2,
    spreadBps:finite(snapshot.spreadBps),
    imbalance:finite(snapshot.imbalance,0),
    publishedAt:finite(snapshot.timestamp),
    availableAt:finite(snapshot.availableAt,Date.now()),
    provenance:String(snapshot.provenance||'')
  };
}

export function parseOkxBook(symbol,payload,availableAt=Date.now()){
  if(String(payload?.code)!=='0') throw new Error(`OKX error: ${payload?.code||'UNKNOWN'} ${payload?.msg||''}`);
  const row=payload?.data?.[0];
  if(!row) throw new Error('OKX missing data');
  const ts=finite(row.ts,availableAt);
  return summarizeBook({
    source:'OKX',
    venue:'OKX_SPOT',
    symbol,
    quote:'USDT',
    bids:row.bids,
    asks:row.asks,
    publishedAt:ts,
    availableAt,
    provenance:`OKX /api/v5/market/books ts=${ts}`
  });
}

export function parseKrakenDepth(symbol,payload,availableAt=Date.now()){
  if(Array.isArray(payload?.error)&&payload.error.length) throw new Error(`Kraken error: ${payload.error.join(',')}`);
  const result=payload?.result;
  const key=result&&Object.keys(result)[0];
  const row=key?result[key]:null;
  if(!row) throw new Error('Kraken missing data');
  const times=[...(row.bids||[]),...(row.asks||[])].map(x=>finite(x[2])).filter(Number.isFinite);
  const publishedAt=times.length?Math.max(...times)*1000:availableAt;
  return summarizeBook({
    source:'KRAKEN',
    venue:'KRAKEN_SPOT',
    symbol,
    quote:'USD',
    bids:row.bids,
    asks:row.asks,
    publishedAt,
    availableAt,
    provenance:`Kraken Depth key=${key||'UNKNOWN'}`
  });
}

export function okxInstrument(symbol){
  const base=String(symbol).toUpperCase().replace(/USDT$/,'');
  if(!/^[A-Z0-9]{2,12}$/.test(base)) return null;
  return `${base}-USDT`;
}

export function krakenPair(symbol){
  const base=String(symbol).toUpperCase().replace(/USDT$/,'');
  if(!/^[A-Z0-9]{2,12}$/.test(base)) return null;
  const mapped=base==='BTC'?'XBT':base;
  return `${mapped}USD`;
}

function flowClass(x,threshold=0.08){
  const n=finite(x,0);
  return n>threshold?'BID_PRESSURE':n<-threshold?'ASK_PRESSURE':'BALANCED';
}
function liquidityClass(spreadBps){
  const x=finite(spreadBps,999);
  return x<1?'TIGHT':x<4?'NORMAL':'WIDE';
}
function relativeBps(a,b){
  if(!Number.isFinite(a)||!Number.isFinite(b)||a<=0||b<=0) return null;
  return (a-b)/b*10000;
}
function median(xs){
  const s=xs.filter(Number.isFinite).sort((a,b)=>a-b);
  if(!s.length)return null;
  const m=Math.floor(s.length/2);
  return s.length%2?s[m]:(s[m-1]+s[m])/2;
}

export function buildWitnessConsensus(primary,witnesses,{
  asOf=Date.now(),
  maxAgeMs=15_000,
  maxCaptureSkewMs=12_000,
  sameQuotePriceToleranceBps=25,
  crossQuotePriceToleranceBps=120,
  minExternalWitnesses=2
}={}){
  const usable=[];
  const rejected=[];
  for(const w of witnesses||[]){
    if(!w){ continue; }
    const age=Math.max(0,asOf-finite(w.publishedAt,w.availableAt));
    const captureSkew=Math.abs(finite(w.availableAt,asOf)-finite(primary.availableAt,asOf));
    if(age>maxAgeMs){
      rejected.push({source:w.source,reason:'STALE',ageMs:age});
      continue;
    }
    if(captureSkew>maxCaptureSkewMs){
      rejected.push({source:w.source,reason:'CAPTURE_SKEW',captureSkewMs:captureSkew});
      continue;
    }
    usable.push({...w,ageMs:age,captureSkewMs:captureSkew});
  }

  const all=[primary,...usable];
  const primaryFlow=flowClass(primary.imbalance);
  const primaryLiq=liquidityClass(primary.spreadBps);
  const flowMatches=usable.filter(w=>flowClass(w.imbalance)===primaryFlow).length;
  const liquidityMatches=usable.filter(w=>liquidityClass(w.spreadBps)===primaryLiq).length;
  const sameQuote=usable.filter(w=>w.quote===primary.quote);
  const crossQuote=usable.filter(w=>w.quote!==primary.quote);

  const sameQuoteDislocations=sameQuote.map(w=>({
    source:w.source,bps:relativeBps(w.mid,primary.mid)
  })).filter(x=>Number.isFinite(x.bps));
  const crossQuoteDislocations=crossQuote.map(w=>({
    source:w.source,bps:relativeBps(w.mid,primary.mid)
  })).filter(x=>Number.isFinite(x.bps));

  const sameQuotePriceAgreement=sameQuoteDislocations.length
    ? sameQuoteDislocations.filter(x=>Math.abs(x.bps)<=sameQuotePriceToleranceBps).length/sameQuoteDislocations.length
    : 0;
  const crossQuotePriceAgreement=crossQuoteDislocations.length
    ? crossQuoteDislocations.filter(x=>Math.abs(x.bps)<=crossQuotePriceToleranceBps).length/crossQuoteDislocations.length
    : 0;

  const externalCount=usable.length;
  const flowAgreement=externalCount?flowMatches/externalCount:0;
  const liquidityAgreement=externalCount?liquidityMatches/externalCount:0;
  const freshnessScore=externalCount
    ? mean(usable.map(w=>clamp(1-w.ageMs/maxAgeMs)))
    : 0;
  const priceAgreement=sameQuote.length
    ? sameQuotePriceAgreement
    : crossQuotePriceAgreement*0.5;

  const agreementScore=clamp(
    0.40*flowAgreement+
    0.25*priceAgreement+
    0.15*liquidityAgreement+
    0.20*freshnessScore
  );

  const contradictions=[];
  for(const w of usable){
    if(flowClass(w.imbalance)!==primaryFlow) contradictions.push(`FLOW_DIVERGENCE_${w.source}`);
    const bps=relativeBps(w.mid,primary.mid);
    const tol=w.quote===primary.quote?sameQuotePriceToleranceBps:crossQuotePriceToleranceBps;
    if(Number.isFinite(bps)&&Math.abs(bps)>tol) contradictions.push(`PRICE_DISLOCATION_${w.source}`);
    if(w.quote!==primary.quote) contradictions.push(`QUOTE_BASIS_RISK_${w.source}`);
  }
  for(const r of rejected) contradictions.push(`${r.reason}_${r.source}`);

  const hasSameQuoteWitness=sameQuote.length>=1;
  const strictSatisfied=
    externalCount>=minExternalWitnesses &&
    hasSameQuoteWitness &&
    sameQuotePriceAgreement>=1 &&
    flowAgreement>=0.5 &&
    agreementScore>=0.58;

  return {
    primary,
    witnesses:usable,
    rejected,
    externalWitnessCount:externalCount,
    venueCount:1+externalCount,
    distinctVenues:[...new Set(all.map(x=>x.venue))],
    sameQuoteWitnesses:sameQuote.map(x=>x.source),
    crossQuoteWitnesses:crossQuote.map(x=>x.source),
    flowAgreement,
    liquidityAgreement,
    sameQuotePriceAgreement,
    crossQuotePriceAgreement,
    sameQuoteDislocations,
    crossQuoteDislocations,
    freshnessScore,
    agreementScore,
    contradictions:[...new Set(contradictions)],
    sourceIndependence:externalCount>=2?'MULTI_VENUE_INDEPENDENT':externalCount===1?'PARTIAL_INDEPENDENT_WITNESS':'SINGLE_PROVIDER_MULTI_MODALITY',
    independentWitnessSatisfied:strictSatisfied,
    epistemic:'INDEPENDENT_VENUE_WITNESS_AUDIT',
    caveats:[
      ...(crossQuote.length?['USD_VS_USDT_QUOTE_BASIS']:[]),
      'ORDERBOOK_IMBALANCE_IS_VENUE_LOCAL',
      'CROSS_VENUE_AGREEMENT_DOES_NOT_PROVE_CAUSALITY'
    ]
  };
}

function mean(xs){ return xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:0; }

export async function fetchIndependentWitnesses({
  symbol,
  primarySnapshot,
  fetchJson,
  okxBase='https://www.okx.com',
  krakenBase='https://api.kraken.com'
}){
  const primary=primaryWitnessFromSnapshot(primarySnapshot);
  const tasks=[];
  const okx=okxInstrument(symbol);
  if(okx){
    tasks.push((async()=>{
      try{
        const availableAt=Date.now();
        const payload=await fetchJson(`${okxBase}/api/v5/market/books?instId=${encodeURIComponent(okx)}&sz=10`);
        return parseOkxBook(symbol,payload,availableAt);
      }catch(err){
        return {source:'OKX',error:err instanceof Error?err.message:String(err)};
      }
    })());
  }
  const kp=krakenPair(symbol);
  if(kp){
    tasks.push((async()=>{
      try{
        const availableAt=Date.now();
        const payload=await fetchJson(`${krakenBase}/0/public/Depth?pair=${encodeURIComponent(kp)}&count=10`);
        return parseKrakenDepth(symbol,payload,availableAt);
      }catch(err){
        return {source:'KRAKEN',error:err instanceof Error?err.message:String(err)};
      }
    })());
  }

  const raw=await Promise.all(tasks);
  const witnessErrors=raw.filter(x=>x?.error);
  const witnesses=raw.filter(x=>!x?.error);
  const consensus=buildWitnessConsensus(primary,witnesses,{asOf:Date.now()});
  return {...consensus,witnessErrors};
}
