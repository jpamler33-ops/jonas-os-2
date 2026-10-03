export const MARKET_DATA_PROVIDER_VERSION="TCX_MARKET_DATA_PROVIDER_V2";

export function providerNameFromUrl(url){
  try{
    const host=new URL(url).host.toLowerCase();
    if(host.includes("binance")) return "BINANCE";
    if(host.includes("okx")) return "OKX";
    if(host.includes("kraken")) return "KRAKEN";
    return host.toUpperCase();
  }catch{return "UNKNOWN";}
}

function defaultNow(){ return Date.now(); }
function noop(){}
const finite=v=>Number.isFinite(Number(v))?Number(v):null;

export function createMarketDataProvider({
  binanceBases,okxBase,krakenBase,fetchImpl=globalThis.fetch,
  normalizeExecutionBook,normalizeVenueBook,okxInstrument,krakenPair,
  sorFees={},timeoutMs=8000,maxConcurrentRequests=12,maxPendingRequests=100,
  circuitFailureThreshold=5,circuitOpenMs=15000,userAgent="TCX-v2-SHADOW_ONLY",
  now=defaultNow,onProviderCall=noop,onError=noop,onOperation=noop,logger=console
}={}){
  if(typeof fetchImpl!=="function") throw new Error("fetchImpl required");
  if(typeof normalizeExecutionBook!=="function") throw new Error("normalizeExecutionBook required");
  if(typeof normalizeVenueBook!=="function") throw new Error("normalizeVenueBook required");
  if(typeof okxInstrument!=="function") throw new Error("okxInstrument required");
  if(typeof krakenPair!=="function") throw new Error("krakenPair required");

  const binance=(Array.isArray(binanceBases)?binanceBases:[]).map(x=>String(x||"").trim().replace(/\/+$/,"" )).filter(Boolean);
  if(!binance.length) throw new Error("at least one Binance base required");
  const okx=String(okxBase||"").replace(/\/+$/,"" );
  const kraken=String(krakenBase||"").replace(/\/+$/,"" );
  const fees={BINANCE:Math.max(0,Number(sorFees.BINANCE||0)),OKX:Math.max(0,Number(sorFees.OKX||0)),KRAKEN:Math.max(0,Number(sorFees.KRAKEN||0))};
  const requestedMaxConcurrent=Number(maxConcurrentRequests),requestedMaxPending=Number(maxPendingRequests);
  const capacity={maxConcurrent:Math.max(1,Math.floor(Number.isFinite(requestedMaxConcurrent)?requestedMaxConcurrent:12)),maxPending:Math.max(0,Math.floor(Number.isFinite(requestedMaxPending)?requestedMaxPending:100)),inFlight:0,pending:[]};
  const breaker=new Map();

  function breakerKey(url){try{return new URL(url).host.toLowerCase();}catch{return "unknown";}}
  function breakerState(url){const key=breakerKey(url);if(!breaker.has(key)) breaker.set(key,{failures:0,openUntil:0,lastError:null,lastFailureAt:null});return {key,state:breaker.get(key)};}
  function assertCircuitClosed(url){const {key,state}=breakerState(url),t=now();if(state.openUntil>t){const err=new Error("TCX_PROVIDER_CIRCUIT_OPEN "+key);err.code="TCX_PROVIDER_CIRCUIT_OPEN";throw err;}if(state.openUntil&&state.openUntil<=t){state.openUntil=0;state.failures=0;}}
  function recordCircuitSuccess(url){const {state}=breakerState(url);state.failures=0;state.openUntil=0;state.lastError=null;}
  function recordCircuitFailure(url,message){const {state}=breakerState(url);state.failures++;state.lastError=String(message||"").slice(0,240);state.lastFailureAt=now();if(state.failures>=Math.max(1,Number(circuitFailureThreshold)||5)) state.openUntil=state.lastFailureAt+Math.max(1000,Number(circuitOpenMs)||15000);}
  function releaseCapacity(){capacity.inFlight=Math.max(0,capacity.inFlight-1);const next=capacity.pending.shift();if(next){capacity.inFlight++;next();}}
  function withCapacity(fn){return new Promise((resolve,reject)=>{const run=()=>Promise.resolve().then(fn).then(resolve,reject).finally(releaseCapacity);if(capacity.inFlight<capacity.maxConcurrent){capacity.inFlight++;run();return;}if(capacity.pending.length>=capacity.maxPending){const err=new Error("TCX_PROVIDER_BACKPRESSURE");err.code="TCX_PROVIDER_BACKPRESSURE";reject(err);return;}capacity.pending.push(run);});}
  function providerHealth(){const circuits={};for(const [host,state] of breaker) circuits[host]={failures:state.failures,open:state.openUntil>now(),openUntil:state.openUntil||null,lastError:state.lastError,lastFailureAt:state.lastFailureAt};return {version:MARKET_DATA_PROVIDER_VERSION,inFlight:capacity.inFlight,pending:capacity.pending.length,maxConcurrent:capacity.maxConcurrent,maxPending:capacity.maxPending,circuits};}

  async function fetchJson(url){return withCapacity(async()=>{assertCircuitClosed(url);const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),Math.max(1,Number(timeoutMs)||8000));const started=now(),provider=providerNameFromUrl(url);let status=null;try{const res=await fetchImpl(url,{signal:ctrl.signal,headers:{"user-agent":userAgent,accept:"application/json"}});status=Number(res?.status);const body=await res.text();if(!res.ok){const detail=String(body||"").slice(0,180).replace(/\s+/g," ");throw new Error("HTTP "+status+" "+new URL(url).host+": "+detail);}let parsed;try{parsed=JSON.parse(body);}catch{throw new Error("Invalid JSON from "+new URL(url).host);}recordCircuitSuccess(url);onProviderCall({provider,ok:true,latencyMs:now()-started,status});return parsed;}catch(err){const message=err instanceof Error?err.message:String(err);recordCircuitFailure(url,message);onProviderCall({provider,ok:false,latencyMs:now()-started,status,error:message});onError({scope:"provider."+provider,message});throw err;}finally{clearTimeout(timer);}});}

  async function fetchMarketParts(symbol){const encoded=encodeURIComponent(symbol),errors=[];for(const base of binance){try{const [ticker,book,depth]=await Promise.all([fetchJson(base+"/api/v3/ticker/24hr?symbol="+encoded),fetchJson(base+"/api/v3/ticker/bookTicker?symbol="+encoded),fetchJson(base+"/api/v3/depth?symbol="+encoded+"&limit=20")]);return {ticker,book,depth,base};}catch(err){const msg=err instanceof Error?err.message:String(err);errors.push(base+": "+msg);logger?.warn?.("market-data endpoint failed",base,msg);}}throw new Error("All Binance market-data endpoints failed: "+errors.join(" | "));}

  function normalizeOkxCandle(r){if(!Array.isArray(r)||r.length<6) return null;const t=finite(r[0]),o=finite(r[1]),h=finite(r[2]),l=finite(r[3]),c=finite(r[4]),v=finite(r[5]);if([t,o,h,l,c,v].some(x=>x==null)) return null;return [t,String(o),String(h),String(l),String(c),String(v),t,0,0,0,0,0];}
  function normalizeKrakenCandle(r){if(!Array.isArray(r)||r.length<7) return null;const t=finite(r[0]),o=finite(r[1]),h=finite(r[2]),l=finite(r[3]),c=finite(r[4]),v=finite(r[6]);if([t,o,h,l,c,v].some(x=>x==null)) return null;const ms=t*1000;return [ms,String(o),String(h),String(l),String(c),String(v),ms,0,0,0,0,0];}

  async function fetchKlines(symbol,interval,limit=30,{endTime=null}={}){
    const allowed=new Set(["1m","5m","15m","1h","4h"]);if(!allowed.has(interval)) throw new Error("Unsupported interval");
    const safeLimit=Math.max(2,Math.min(300,Math.floor(Number(limit)||30))),encoded=encodeURIComponent(symbol),errors=[];
    for(const base of binance){try{const end=endTime!=null&&endTime!==""&&Number.isFinite(Number(endTime))?"&endTime="+Math.floor(Number(endTime)):"";const rows=await fetchJson(base+"/api/v3/klines?symbol="+encoded+"&interval="+interval+"&limit="+safeLimit+end);if(!Array.isArray(rows)||rows.length<2) throw new Error("Insufficient kline data");return {rows,base,provider:"BINANCE",degraded:false};}catch(err){errors.push("BINANCE "+base+": "+(err instanceof Error?err.message:String(err)));}}

    const instId=okxInstrument(symbol);const okxBars={"1m":"1m","5m":"5m","15m":"15m","1h":"1H","4h":"4H"};
    if(okx&&instId){try{const before=endTime!=null&&Number.isFinite(Number(endTime))?"&before="+Math.floor(Number(endTime)):"";const payload=await fetchJson(okx+"/api/v5/market/candles?instId="+encodeURIComponent(instId)+"&bar="+okxBars[interval]+"&limit="+safeLimit+before);if(String(payload?.code)!=="0") throw new Error("OKX error "+(payload?.code||"UNKNOWN")+" "+(payload?.msg||""));const rows=(Array.isArray(payload?.data)?payload.data:[]).map(normalizeOkxCandle).filter(Boolean).sort((a,b)=>a[0]-b[0]);if(rows.length<2) throw new Error("Insufficient OKX kline data");onOperation({name:"market.klines_failover",ok:true,provider:"OKX",symbol,interval});return {rows,base:okx,provider:"OKX",degraded:true,failoverErrors:errors.slice()};}catch(err){errors.push("OKX: "+(err instanceof Error?err.message:String(err)));}}

    const pair=krakenPair(symbol);const krakenIntervals={"1m":1,"5m":5,"15m":15,"1h":60,"4h":240};
    if(kraken&&pair){try{const minutes=krakenIntervals[interval];let since="";if(endTime!=null&&Number.isFinite(Number(endTime))){const spanMs=minutes*60_000*(safeLimit+2);since="&since="+Math.max(0,Math.floor((Number(endTime)-spanMs)/1000));}const payload=await fetchJson(kraken+"/0/public/OHLC?pair="+encodeURIComponent(pair)+"&interval="+minutes+since);if(Array.isArray(payload?.error)&&payload.error.length) throw new Error("Kraken error "+payload.error.join(","));const result=payload?.result||{};const key=Object.keys(result).find(k=>k!=="last");let rows=(key&&Array.isArray(result[key])?result[key]:[]).map(normalizeKrakenCandle).filter(Boolean);if(endTime!=null&&Number.isFinite(Number(endTime))) rows=rows.filter(r=>r[0]<=Number(endTime));rows=rows.slice(-safeLimit);if(rows.length<2) throw new Error("Insufficient Kraken kline data");onOperation({name:"market.klines_failover",ok:true,provider:"KRAKEN",symbol,interval});return {rows,base:kraken,provider:"KRAKEN",degraded:true,failoverErrors:errors.slice()};}catch(err){errors.push("KRAKEN: "+(err instanceof Error?err.message:String(err)));}}
    onOperation({name:"market.klines_failover",ok:false,symbol,interval,error:errors.join(" | ")});throw new Error("Klines unavailable across BINANCE/OKX/KRAKEN: "+errors.join(" | "));
  }

  async function fetchExecutionBook(symbol){const encoded=encodeURIComponent(symbol),errors=[];for(const base of binance){try{const depth=await fetchJson(base+"/api/v3/depth?symbol="+encoded+"&limit=100"),availableAt=now();return normalizeExecutionBook({symbol,bids:depth.bids||[],asks:depth.asks||[],availableAt,source:"BINANCE_PUBLIC_REST_DEPTH100",provenance:"host="+new URL(base).host+"; lastUpdateId="+(depth.lastUpdateId??"UNKNOWN")});}catch(err){errors.push(base+": "+(err instanceof Error?err.message:String(err)));}}throw new Error("Execution book unavailable: "+errors.join(" | "));}
  async function fetchBinanceSorBook(symbol){const encoded=encodeURIComponent(symbol),errors=[];for(const base of binance){const started=now();try{const depth=await fetchJson(base+"/api/v3/depth?symbol="+encoded+"&limit=100"),availableAt=now();return normalizeVenueBook({venue:"BINANCE",source:"BINANCE_PUBLIC_REST_DEPTH100",symbol,quote:"USDT",bids:depth.bids||[],asks:depth.asks||[],availableAt,fetchLatencyMs:availableAt-started,feeBps:fees.BINANCE,provenance:"host="+new URL(base).host+"; lastUpdateId="+(depth.lastUpdateId??"UNKNOWN")});}catch(err){errors.push(base+": "+(err instanceof Error?err.message:String(err)));}}throw new Error("Binance SOR book unavailable: "+errors.join(" | "));}
  async function fetchOkxSorBook(symbol){const instId=okxInstrument(symbol);if(!instId) throw new Error("OKX instrument unavailable");const started=now(),payload=await fetchJson(okx+"/api/v5/market/books?instId="+encodeURIComponent(instId)+"&sz=100");if(String(payload?.code)!=="0") throw new Error("OKX error "+(payload?.code||"UNKNOWN")+" "+(payload?.msg||""));const row=payload?.data?.[0];if(!row) throw new Error("OKX missing book");const availableAt=now();return normalizeVenueBook({venue:"OKX",source:"OKX_PUBLIC_BOOKS100",symbol,quote:"USDT",bids:row.bids||[],asks:row.asks||[],availableAt,fetchLatencyMs:availableAt-started,feeBps:fees.OKX,provenance:"OKX /api/v5/market/books instId="+instId+"; exchangeTs="+(row.ts||"UNKNOWN")});}
  async function fetchKrakenSorBook(symbol){const pair=krakenPair(symbol);if(!pair) throw new Error("Kraken pair unavailable");const started=now(),payload=await fetchJson(kraken+"/0/public/Depth?pair="+encodeURIComponent(pair)+"&count=100");if(Array.isArray(payload?.error)&&payload.error.length) throw new Error("Kraken error "+payload.error.join(","));const result=payload?.result,key=result&&Object.keys(result)[0],row=key?result[key]:null;if(!row) throw new Error("Kraken missing book");const availableAt=now();return normalizeVenueBook({venue:"KRAKEN",source:"KRAKEN_PUBLIC_DEPTH100",symbol,quote:"USD",bids:row.bids||[],asks:row.asks||[],availableAt,fetchLatencyMs:availableAt-started,feeBps:fees.KRAKEN,provenance:"Kraken /0/public/Depth pair="+(key||pair)});}
  async function fetchSorVenueBooks(symbol){const started=now(),results=await Promise.allSettled([fetchBinanceSorBook(symbol),fetchOkxSorBook(symbol),fetchKrakenSorBook(symbol)]),books=[],errors=[],names=["BINANCE","OKX","KRAKEN"];results.forEach((r,i)=>{if(r.status==="fulfilled") books.push(r.value);else errors.push({venue:names[i],error:r.reason instanceof Error?r.reason.message:String(r.reason)});});onOperation({name:"shadow_sor.books",ok:books.length>0,latencyMs:now()-started,error:books.length?null:errors.map(x=>x.venue+":"+x.error).join(" | ")});return {books,errors,capturedAt:now()};}
  async function fetchLatestAggTradeId(symbol){const encoded=encodeURIComponent(symbol),errors=[];for(const base of binance){try{const rows=await fetchJson(base+"/api/v3/aggTrades?symbol="+encoded+"&limit=1"),row=Array.isArray(rows)?rows.at(-1):null,id=Number(row?.a);if(!Number.isFinite(id)) throw new Error("Missing aggregate trade id");return id;}catch(err){errors.push(base+": "+(err instanceof Error?err.message:String(err)));}}throw new Error("Latest aggTrade unavailable: "+errors.join(" | "));}
  async function fetchAggTradesSince(symbol,fromId,{maxPages=3}={}){const start=Number(fromId);if(!Number.isFinite(start)||start<0) throw new Error("Invalid aggTrade fromId");const encoded=encodeURIComponent(symbol),errors=[];for(const base of binance){try{let next=start;const out=[];let truncated=false;for(let page=0;page<maxPages;page++){const rows=await fetchJson(base+"/api/v3/aggTrades?symbol="+encoded+"&fromId="+next+"&limit=1000");if(!Array.isArray(rows)) throw new Error("Invalid aggTrades payload");for(const r of rows){const id=Number(r.a),price=Number(r.p),qty=Number(r.q),time=Number(r.T);if(!Number.isFinite(id)||!Number.isFinite(price)||!Number.isFinite(qty)) continue;out.push({id,price,qty,time,buyerMaker:r.m===true});}if(rows.length<1000){truncated=false;break;}const last=Number(rows.at(-1)?.a);if(!Number.isFinite(last)||last<next) break;next=last+1;truncated=page===maxPages-1;}return {trades:out,truncated,base};}catch(err){errors.push(base+": "+(err instanceof Error?err.message:String(err)));}}throw new Error("aggTrades unavailable: "+errors.join(" | "));}

  return Object.freeze({version:MARKET_DATA_PROVIDER_VERSION,fetchJson,fetchMarketParts,fetchKlines,fetchExecutionBook,fetchBinanceSorBook,fetchOkxSorBook,fetchKrakenSorBook,fetchSorVenueBooks,fetchLatestAggTradeId,fetchAggTradesSince,providerHealth});
}
