import test from "node:test";
import assert from "node:assert/strict";
import { createMarketDataProvider, providerNameFromUrl } from "./market-data-provider.mjs";

function response(status,body){
  return {
    status,
    ok:status>=200&&status<300,
    async text(){ return typeof body==="string"?body:JSON.stringify(body); }
  };
}

function provider(fetchImpl,extra={}){
  let now=1000;
  return createMarketDataProvider({
    binanceBases:["https://a.binance.test","https://b.binance.test"],
    okxBase:"https://okx.test",
    krakenBase:"https://kraken.test",
    fetchImpl,
    normalizeExecutionBook:x=>x,
    normalizeVenueBook:x=>x,
    okxInstrument:s=>s==="BTCUSDT"?"BTC-USDT":null,
    krakenPair:s=>s==="BTCUSDT"?"XBTUSD":null,
    sorFees:{BINANCE:1,OKX:2,KRAKEN:3},
    now:()=>++now,
    onProviderCall:()=>{},
    onError:()=>{},
    onOperation:()=>{},
    logger:{warn:()=>{}},
    ...extra
  });
}

test("providerNameFromUrl classifies known venues",()=>{
  assert.equal(providerNameFromUrl("https://api.binance.com/x"),"BINANCE");
  assert.equal(providerNameFromUrl("https://www.okx.com/x"),"OKX");
  assert.equal(providerNameFromUrl("https://api.kraken.com/x"),"KRAKEN");
});

test("market parts fall back to second Binance base",async()=>{
  const seen=[];
  const p=provider(async url=>{
    seen.push(url);
    if(url.includes("a.binance.test")) return response(500,{err:"down"});
    if(url.includes("ticker/24hr")) return response(200,{lastPrice:"100"});
    if(url.includes("bookTicker")) return response(200,{bidPrice:"99",askPrice:"101"});
    return response(200,{bids:[["99","1"]],asks:[["101","1"]]});
  });
  const r=await p.fetchMarketParts("BTCUSDT");
  assert.equal(r.base,"https://b.binance.test");
  assert.ok(seen.some(x=>x.includes("a.binance.test")));
  assert.ok(seen.some(x=>x.includes("b.binance.test")));
});

test("klines reject unsupported intervals before network",async()=>{
  let calls=0;
  const p=provider(async()=>{calls++;return response(200,[]);});
  await assert.rejects(()=>p.fetchKlines("BTCUSDT","2m"),/Unsupported interval/);
  assert.equal(calls,0);
});

test("execution book is normalized with provenance",async()=>{
  const p=provider(async url=>{
    if(url.includes("a.binance.test")) return response(200,{lastUpdateId:42,bids:[["99","2"]],asks:[["101","3"]]});
    return response(500,{});
  });
  const b=await p.fetchExecutionBook("BTCUSDT");
  assert.equal(b.symbol,"BTCUSDT");
  assert.equal(b.source,"BINANCE_PUBLIC_REST_DEPTH100");
  assert.match(b.provenance,/lastUpdateId=42/);
});

test("SOR returns partial success without failing whole collection",async()=>{
  const ops=[];
  const p=provider(async url=>{
    if(url.includes("binance.test")) return response(200,{lastUpdateId:1,bids:[["99","1"]],asks:[["101","1"]]});
    if(url.includes("okx.test")) return response(200,{code:"0",data:[{bids:[["99","1"]],asks:[["101","1"]],ts:"1"}]});
    return response(500,{err:"kraken down"});
  },{onOperation:x=>ops.push(x)});
  const r=await p.fetchSorVenueBooks("BTCUSDT");
  assert.equal(r.books.length,2);
  assert.equal(r.errors.length,1);
  assert.equal(r.errors[0].venue,"KRAKEN");
  assert.equal(ops.at(-1).ok,true);
});

test("agg trade parser preserves buyer-maker flag",async()=>{
  const p=provider(async url=>{
    if(url.includes("aggTrades")) return response(200,[
      {a:7,p:"100.5",q:"2.0",T:123,m:true},
      {a:8,p:"101.0",q:"1.0",T:124,m:false}
    ]);
    return response(500,{});
  });
  const r=await p.fetchAggTradesSince("BTCUSDT",7,{maxPages:1});
  assert.equal(r.trades.length,2);
  assert.equal(r.trades[0].buyerMaker,true);
  assert.equal(r.trades[1].buyerMaker,false);
});
