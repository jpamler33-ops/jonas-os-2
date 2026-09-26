const KRAKEN_ANALYTICS_BASE="https://futures.kraken.com/api/charts/v1/analytics";
const KRAKEN_SYMBOL="PI_XBTUSD";

function lastValue(x) {
  if(Array.isArray(x)) {
    for(let i=x.length-1;i>=0;i--) {
      const n=Number(x[i]);
      if(Number.isFinite(n)) return n;
    }
  }
  const n=Number(x);
  return Number.isFinite(n)?n:null;
}

function pick(obj,...keys) {
  for(const k of keys) {
    if(obj && Object.prototype.hasOwnProperty.call(obj,k)) {
      const v=lastValue(obj[k]);
      if(v!==null) return v;
    }
  }
  return null;
}

async function fetchAnalytics(type, interval=300, lookbackSec=3600) {
  const now=Math.floor(Date.now()/1000);
  const url=`${KRAKEN_ANALYTICS_BASE}/${KRAKEN_SYMBOL}/${type}?since=${now-lookbackSec}&to=${now}&interval=${interval}`;
  const r=await fetch(url,{headers:{"accept":"application/json","user-agent":"BTC-Trading-Center/1.0"}});
  if(!r.ok) throw new Error(`Kraken analytics ${type} HTTP ${r.status}`);
  const j=await r.json();
  const result=j?.result||j;
  if(!result || typeof result!=="object") throw new Error(`Kraken analytics ${type}: malformed response`);
  return result;
}

function sideMetrics(side) {
  return {
    bestPrice:pick(side,"best_price","bestPrice"),
    liquidity005:pick(side,"liquidity_005","liquidity005"),
    liquidity01:pick(side,"liquidity_01","liquidity01"),
    liquidity025:pick(side,"liquidity_025","liquidity025"),
    liquidity05:pick(side,"liquidity_05","liquidity05"),
    liquidity10:pick(side,"liquidity_10","liquidity10"),
    liquidity100:pick(side,"liquidity_100","liquidity100"),
    slippage1k:pick(side,"slippage_1k","slippage1k"),
    slippage10k:pick(side,"slippage_10k","slippage10k"),
    slippage100k:pick(side,"slippage_100k","slippage100k"),
    slippage1m:pick(side,"slippage_1m","slippage1m")
  };
}

export async function fetchKrakenMicrostructure() {
  const [orderbook,cvd,basis]=await Promise.all([
    fetchAnalytics("orderbook"),
    fetchAnalytics("cvd"),
    fetchAnalytics("future-basis")
  ]);
  const ob=orderbook?.data||{};
  const cd=cvd?.data||{};
  const bd=basis?.data||{};
  const ts=lastValue(orderbook?.timestamp)||lastValue(cvd?.timestamp)||Math.floor(Date.now()/1000);
  const bid=sideMetrics(ob?.bid||{});
  const ask=sideMetrics(ob?.ask||{});
  const buyVolume=pick(cd,"buyVolume","buy_volume");
  const sellVolume=pick(cd,"sellVolume","sell_volume");
  const cvdValue=pick(cd,"cvd");
  const futureBasis=pick(bd,"basis");

  return {
    ts:Number(ts)<10_000_000_000?Number(ts)*1000:Number(ts),
    bid,ask,buyVolume,sellVolume,cvd:cvdValue,futureBasis,
    source:"kraken_futures_analytics"
  };
}

export { KRAKEN_ANALYTICS_BASE, KRAKEN_SYMBOL };
