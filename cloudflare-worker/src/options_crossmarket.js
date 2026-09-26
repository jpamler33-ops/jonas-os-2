const DERIBIT_BASE="https://www.deribit.com/api/v2";
const COINBASE_EXCHANGE="https://api.exchange.coinbase.com";

async function getJson(url, headers={}) {
  const r=await fetch(url,{
    headers:{
      "accept":"application/json",
      "user-agent":"BTC-Trading-Center-CrossMarket/1.0",
      ...headers
    }
  });
  if(!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  const j=await r.json();
  if(j?.error) throw new Error(`API error: ${j.error?.message||JSON.stringify(j.error)}`);
  return j;
}

function median(xs) {
  const v=(xs||[]).map(Number).filter(Number.isFinite).sort((a,b)=>a-b);
  if(!v.length) return null;
  const i=Math.floor(v.length/2);
  return v.length%2?v[i]:(v[i-1]+v[i])/2;
}

function parseInstrument(name) {
  const m=String(name||"").match(/^BTC-(\d{1,2}[A-Z]{3}\d{2})-([0-9.]+)-([CP])$/);
  if(!m) return null;
  const months={JAN:0,FEB:1,MAR:2,APR:3,MAY:4,JUN:5,JUL:6,AUG:7,SEP:8,OCT:9,NOV:10,DEC:11};
  const dm=m[1].match(/^(\d{1,2})([A-Z]{3})(\d{2})$/);
  if(!dm || months[dm[2]]===undefined) return null;
  const expiry=Date.UTC(2000+Number(dm[3]),months[dm[2]],Number(dm[1]),8,0,0);
  return {expiryTs:expiry,strike:Number(m[2]),optionType:m[3]==="C"?"CALL":"PUT"};
}

function summarizeExpiry(rows, expiryTs, now) {
  const xs=rows.filter(x=>x.expiryTs===expiryTs);
  if(!xs.length) return null;
  const underlying=median(xs.map(x=>x.underlyingPrice));
  if(!(underlying>0)) return null;
  const days=(expiryTs-now)/86400000;

  const withM=xs.map(x=>({
    ...x,
    logMoneyness:Math.log(x.strike/underlying)
  }));

  const atm=withM.filter(x=>Math.abs(x.logMoneyness)<=0.03 && x.markIv>0);
  const otmCalls=withM.filter(x=>
    x.optionType==="CALL" &&
    x.logMoneyness>=Math.log(1.03) &&
    x.logMoneyness<=Math.log(1.08) &&
    x.markIv>0
  );
  const otmPuts=withM.filter(x=>
    x.optionType==="PUT" &&
    x.logMoneyness<=Math.log(0.97) &&
    x.logMoneyness>=Math.log(0.92) &&
    x.markIv>0
  );

  const atmIv=median(atm.map(x=>x.markIv));
  const callWingIv=median(otmCalls.map(x=>x.markIv));
  const putWingIv=median(otmPuts.map(x=>x.markIv));
  const skew=putWingIv!==null&&callWingIv!==null ? putWingIv-callWingIv : null;

  return {
    expiryTs,
    daysToExpiry:days,
    underlying,
    atmIv,
    putWingIv,
    callWingIv,
    putCallSkewIvPoints:skew,
    quotes:xs.length,
    atmQuotes:atm.length,
    putWingQuotes:otmPuts.length,
    callWingQuotes:otmCalls.length,
    openInterest:xs.reduce((s,x)=>s+Number(x.openInterest||0),0),
    volume24hUsd:xs.reduce((s,x)=>s+Number(x.volumeUsd||0),0)
  };
}

function nearestTenor(expiries,targetDays) {
  const usable=(expiries||[]).filter(x=>x.daysToExpiry>0 && x.atmIv!==null);
  if(!usable.length) return null;
  return [...usable].sort((a,b)=>Math.abs(a.daysToExpiry-targetDays)-Math.abs(b.daysToExpiry-targetDays))[0];
}

export async function fetchDeribitOptionsContext() {
  const url=`${DERIBIT_BASE}/public/get_book_summary_by_currency?currency=BTC&kind=option`;
  const j=await getJson(url);
  const summaries=Array.isArray(j?.result)?j.result:[];
  const now=Date.now();

  const rows=[];
  for(const s of summaries) {
    const p=parseInstrument(s.instrument_name);
    if(!p || p.expiryTs<=now) continue;
    const markIv=Number(s.mark_iv);
    const underlyingPrice=Number(s.underlying_price);
    if(!Number.isFinite(markIv)||!Number.isFinite(underlyingPrice)||!(underlyingPrice>0)) continue;
    rows.push({
      ...p,
      instrumentName:s.instrument_name,
      markIv,
      underlyingPrice,
      openInterest:Number(s.open_interest||0),
      volumeUsd:Number(s.volume_usd||0),
      bidPrice:Number(s.bid_price),
      askPrice:Number(s.ask_price)
    });
  }

  const expirySet=[...new Set(rows.map(x=>x.expiryTs))].sort((a,b)=>a-b);
  const expiries=expirySet.map(ts=>summarizeExpiry(rows,ts,now)).filter(Boolean);
  const t7=nearestTenor(expiries,7);
  const t30=nearestTenor(expiries,30);
  const t90=nearestTenor(expiries,90);

  return {
    ts:now,
    source:"deribit",
    contracts:rows.length,
    expiryCount:expiries.length,
    tenor7d:t7,
    tenor30d:t30,
    tenor90d:t90,
    termSlope30m7:t30?.atmIv!==null&&t30?.atmIv!==undefined&&t7?.atmIv!==null&&t7?.atmIv!==undefined
      ? t30.atmIv-t7.atmIv:null,
    termSlope90m30:t90?.atmIv!==null&&t90?.atmIv!==undefined&&t30?.atmIv!==null&&t30?.atmIv!==undefined
      ? t90.atmIv-t30.atmIv:null,
    expiries:expiries.slice(0,12)
  };
}

export async function fetchCoinbasePremium(referencePrice) {
  const j=await getJson(`${COINBASE_EXCHANGE}/products/BTC-USD/trades?limit=1`);
  const trade=Array.isArray(j)?j[0]:null;
  const price=Number(trade?.price);
  const ref=Number(referencePrice);
  if(!(price>0)||!(ref>0)) throw new Error("Coinbase BTC-USD latest trade unavailable");
  return {
    ts:Date.now(),
    coinbasePrice:price,
    referencePrice:ref,
    premiumBps:(price-ref)/ref*10000,
    tradeTime:trade?.time||null,
    tradeId:trade?.trade_id??null,
    source:"coinbase_exchange"
  };
}

export { DERIBIT_BASE, COINBASE_EXCHANGE };
