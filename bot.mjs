import http from 'node:http';
import { loadPersistentState, savePersistentState } from './state-store.mjs';
import { candlesFromKlines, closedCandles, analyzeStructure, analyzeMultiTimeframe } from './market-structure.mjs';
import { renderCandlestickPng } from './chart-renderer.mjs';
import { deriveChartDashboard } from './dashboard-state.mjs';
import { loadEpisodeMemory, saveEpisodeMemory, createEpisode, shouldSampleEpisode, episodeVector, findSimilarEpisodes, summarizeSimilar, matureEpisode } from './episode-memory.mjs';
import { runMechanismTransitionEngine } from './mechanism-transition-engine.mjs';
import { fetchIndependentWitnesses } from './independent-witness-network.mjs';
import { openAuditLedger, appendAuditRecord, auditMarketSnapshot, auditWitnessReport, auditEngineResult, determineSafetyState, buildResearchEnvelope, verifyLedgerRecords, replayEnvelopeIntegrity, ledgerTailSummary, INSTITUTIONAL_KERNEL_VERSION } from './institutional-kernel.mjs';
import { openMarketDataFabric, appendMarketEvents, createMarketEventInput, verifyMarketEventChain, marketFabricSummary, MARKET_DATA_FABRIC_VERSION } from './market-data-fabric.mjs';
import { reconstructInstitutionalState, replaySummary, DETERMINISTIC_REPLAY_VERSION } from './deterministic-replay.mjs';
import { buildRuntimeManifest, openReleaseRegistry, registerRuntimeRelease, verifyReleaseRegistry, releaseRegistrySummary, RELEASE_REGISTRY_VERSION } from './runtime-release-registry.mjs';
import { createObservability, recordProviderCall, recordOperation, recordSafety, recordResearchTelemetry, recordError, observabilitySnapshot, deriveSloHealth, OBSERVABILITY_VERSION } from './observability.mjs';
import { runChaosSuite, runChaosScenario, chaosScenarioNames, CHAOS_ENGINEERING_VERSION } from './chaos-engineering.mjs';
import { loadShadowOms, saveShadowOms, normalizeExecutionBook, createShadowOrder, applyAggTrades, markShadowOrder, cancelShadowOrder, shadowOrderSummary, SHADOW_OMS_VERSION, SHADOW_OMS_CAPABILITIES } from './shadow-oms.mjs';
import { homeText as productHomeText, homeKeyboard as productHomeKeyboard, marketsKeyboard as productMarketsKeyboard, marketProductKeyboard, parseProductCallback } from './telegram-product-ui.mjs';

const token = process.env.TCX_TELEGRAM_BOT_TOKEN;
if (!token) throw new Error('Missing TCX_TELEGRAM_BOT_TOKEN');

const telegramApi = `https://api.telegram.org/bot${token}`;
const configuredBinanceBases = process.env.TCX_BINANCE_REST_BASES || process.env.TCX_BINANCE_REST_BASE || '';
const binanceBases = (configuredBinanceBases
  ? configuredBinanceBases.split(',')
  : ['https://data-api.binance.vision','https://api1.binance.com','https://api.binance.com'])
  .map(x => x.trim().replace(/\/+$/, '')).filter(Boolean);
const okxBase = (process.env.TCX_OKX_REST_BASE || 'https://www.okx.com').replace(/\/+$/,'');
const krakenBase = (process.env.TCX_KRAKEN_REST_BASE || 'https://api.kraken.com').replace(/\/+$/,'');

const refreshMs = Math.max(5000, Number(process.env.TCX_TELEGRAM_REFRESH_MS || 10000));
const alertCheckMs = Math.max(10000, Number(process.env.TCX_TELEGRAM_ALERT_CHECK_MS || 15000));
const episodeSweepMs = Math.max(60000, Number(process.env.TCX_EPISODE_SWEEP_MS || 300000));
const institutionalMarketMaxAgeMs = Math.max(1000, Number(process.env.TCX_INSTITUTIONAL_MARKET_MAX_AGE_MS || 15000));
const shadowWatchMs = Math.max(5000, Number(process.env.TCX_SHADOW_WATCH_MS || 10000));
const shadowDefaultLatencyMs = Math.max(0, Math.min(5000, Number(process.env.TCX_SHADOW_LATENCY_MS || 120)));
const shadowMakerFeeBps = Math.max(0, Number(process.env.TCX_SHADOW_MAKER_FEE_BPS || 10));
const shadowTakerFeeBps = Math.max(0, Number(process.env.TCX_SHADOW_TAKER_FEE_BPS || 10));
const shadowHiddenQueueBufferPct = Math.max(0, Math.min(2, Number(process.env.TCX_SHADOW_HIDDEN_QUEUE_BUFFER_PCT || 0.15)));
const allowedChats = new Set((process.env.TCX_TELEGRAM_ALLOWED_CHATS || '').split(',').map(x => x.trim()).filter(Boolean));
const requestedSymbols = (process.env.TCX_TELEGRAM_SYMBOLS ||
  'BTCUSDT,ETHUSDT,SOLUSDT,BNBUSDT,XRPUSDT,DOGEUSDT,ADAUSDT,LINKUSDT,AVAXUSDT,DOTUSDT,LTCUSDT,TRXUSDT')
  .split(',').map(x => x.trim().toUpperCase()).filter(Boolean);

const MARKET_META = {
  BTCUSDT:['₿','BTC'], ETHUSDT:['Ξ','ETH'], SOLUSDT:['◎','SOL'], BNBUSDT:['🟡','BNB'],
  XRPUSDT:['✕','XRP'], DOGEUSDT:['Ð','DOGE'], ADAUSDT:['₳','ADA'], LINKUSDT:['⬡','LINK'],
  AVAXUSDT:['🔺','AVAX'], DOTUSDT:['●','DOT'], LTCUSDT:['Ł','LTC'], TRXUSDT:['◆','TRX']
};

const markets = requestedSymbols.map(symbol => ({
  symbol,
  icon: MARKET_META[symbol]?.[0] || '•',
  label: MARKET_META[symbol]?.[1] || symbol.replace('USDT','')
}));

const sessions = new Map();
const witnessCache = new Map();
const observability = createObservability({sampleLimit:500});
const stateFile = process.env.TCX_STATE_FILE || '/data/tcx-state.json';
const loadedState = await loadPersistentState(stateFile);
const favorites = loadedState.favorites;
const alerts = loadedState.alerts;
const episodeFile = process.env.TCX_EPISODE_FILE || '/data/tcx-episodes.json';
const loadedEpisodeMemory = await loadEpisodeMemory(episodeFile);
let episodes = loadedEpisodeMemory.episodes;
const auditFile = process.env.TCX_AUDIT_LEDGER_FILE || '/data/tcx-audit-ledger.jsonl';
const auditLedger = await openAuditLedger(auditFile);
const marketFabricFile = process.env.TCX_MARKET_FABRIC_FILE || '/data/tcx-market-events.jsonl';
const marketFabric = await openMarketDataFabric(marketFabricFile);
const releaseRegistryFile = process.env.TCX_RELEASE_REGISTRY_FILE || '/data/tcx-release-registry.jsonl';
const releaseRegistry = await openReleaseRegistry(releaseRegistryFile);
const shadowOmsFile = process.env.TCX_SHADOW_OMS_FILE || '/data/tcx-shadow-oms.json';
const loadedShadowOms = await loadShadowOms(shadowOmsFile);
let shadowOrders = loadedShadowOms.orders;
let shadowOmsHealthy = loadedShadowOms.healthy;
let shadowOmsLastError = loadedShadowOms.error || null;
let shadowOmsPersistenceQueue = Promise.resolve();
let marketFabricAppendQueue = Promise.resolve();
let auditAppendQueue = Promise.resolve();
const institutionalConfig = Object.freeze({
  execution:'SHADOW_ONLY',
  marketMaxAgeMs:institutionalMarketMaxAgeMs,
  primaryProvider:'BINANCE',
  witnessProviders:['OKX','KRAKEN'],
  strictWitnessMinExternal:2,
  mechanismCausalStatus:'NOT_IDENTIFIED',
  orderExecutionPath:false,
  shadowOms:{
    version:SHADOW_OMS_VERSION,
    canExecuteLive:false,
    defaultLatencyMs:shadowDefaultLatencyMs,
    makerFeeBps:shadowMakerFeeBps,
    takerFeeBps:shadowTakerFeeBps,
    hiddenQueueBufferPct:shadowHiddenQueueBufferPct
  }
});

let runtimeManifest=null;
let runtimeReleaseRecord=null;
try {
  runtimeManifest=await buildRuntimeManifest({
    rootDir:'.',
    config:institutionalConfig,
    deployment:{
      gitCommit:process.env.RAILWAY_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA || '',
      gitBranch:process.env.RAILWAY_GIT_BRANCH || process.env.GIT_BRANCH || '',
      service:process.env.RAILWAY_SERVICE_NAME || 'tcx-telegram'
    },
    versions:{
      institutionalKernel:INSTITUTIONAL_KERNEL_VERSION,
      mechanismEngine:'MTL_V1',
      witnessNetwork:'IWN_V1',
      marketDataFabric:MARKET_DATA_FABRIC_VERSION,
      deterministicReplay:DETERMINISTIC_REPLAY_VERSION,
      releaseRegistry:RELEASE_REGISTRY_VERSION,
      observability:OBSERVABILITY_VERSION,
      chaosEngineering:CHAOS_ENGINEERING_VERSION,
      shadowOms:SHADOW_OMS_VERSION
    }
  });
  if(releaseRegistry.healthy){
    const registered=await registerRuntimeRelease(releaseRegistry,runtimeManifest,{registeredAt:Date.now()});
    runtimeReleaseRecord=registered.record;
  }
} catch(err) {
  releaseRegistry.healthy=false;
  releaseRegistry.verification={
    ok:false,
    error:'RUNTIME_RELEASE_REGISTRATION_FAILURE',
    detail:err instanceof Error?err.message:String(err)
  };
  console.error('runtime release registration failure',releaseRegistry.verification.detail);
}
let episodePersistenceHealthy = true;
let episodePersistenceLastError = null;
let episodePersistenceQueue = Promise.resolve();
let persistenceHealthy = true;
let persistenceLastError = null;
let persistenceQueue = Promise.resolve();

async function persistShadowOms(reason='mutation') {
  shadowOmsPersistenceQueue = shadowOmsPersistenceQueue.then(async()=>{
    if(!shadowOmsHealthy) return false;
    try {
      shadowOrders = await saveShadowOms(shadowOmsFile,shadowOrders,{maxOrders:1000});
      shadowOmsLastError=null;
      return true;
    } catch(err) {
      shadowOmsHealthy=false;
      shadowOmsLastError=err instanceof Error?err.message:String(err);
      recordError(observability,{scope:'shadow_oms.persistence',message:shadowOmsLastError});
      console.error('shadow OMS persistence error',reason,shadowOmsLastError);
      return false;
    }
  });
  return shadowOmsPersistenceQueue;
}

async function persistState(reason='mutation') {
  persistenceQueue = persistenceQueue.then(async () => {
    try {
      await savePersistentState(stateFile, { favorites, alerts });
      persistenceHealthy = true;
      persistenceLastError = null;
    } catch (err) {
      persistenceHealthy = false;
      persistenceLastError = err instanceof Error ? err.message : String(err);
      console.error('state persistence error', reason, persistenceLastError);
    }
  });
  await persistenceQueue;
  return persistenceHealthy;
}

async function persistEpisodeMemory(reason='mutation') {
  episodePersistenceQueue = episodePersistenceQueue.then(async () => {
    try {
      episodes = await saveEpisodeMemory(episodeFile,episodes,{maxPerSymbol:2000});
      episodePersistenceHealthy = true;
      episodePersistenceLastError = null;
    } catch (err) {
      episodePersistenceHealthy = false;
      episodePersistenceLastError = err instanceof Error ? err.message : String(err);
      console.error('episode persistence error',reason,episodePersistenceLastError);
    }
  });
  await episodePersistenceQueue;
  return episodePersistenceHealthy;
}

async function appendInstitutionalAudit(kind,payload) {
  auditAppendQueue = auditAppendQueue.then(async()=>{
    if(!auditLedger.healthy) return null;
    try {
      return await appendAuditRecord(auditLedger,{kind,payload,occurredAt:Date.now()});
    } catch(err) {
      auditLedger.healthy=false;
      auditLedger.verification={
        ok:false,
        error:'LEDGER_APPEND_FAILURE',
        detail:err instanceof Error?err.message:String(err)
      };
      console.error('institutional audit append failure',auditLedger.verification.detail);
      return null;
    }
  });
  return auditAppendQueue;
}

async function appendFabricEvents(inputs) {
  marketFabricAppendQueue = marketFabricAppendQueue.then(async()=>{
    if(!marketFabric.healthy) return {appended:[],duplicates:0,skipped:true};
    try {
      return await appendMarketEvents(marketFabric,inputs);
    } catch(err) {
      marketFabric.healthy=false;
      marketFabric.verification={
        ok:false,
        error:'FABRIC_APPEND_FAILURE',
        detail:err instanceof Error?err.message:String(err)
      };
      console.error('market data fabric append failure',marketFabric.verification.detail);
      return {appended:[],duplicates:0,skipped:true};
    }
  });
  return marketFabricAppendQueue;
}

function witnessPayload(report) {
  return {
    availableAt:Date.now(),
    sourceIndependence:String(report?.sourceIndependence||'UNKNOWN'),
    independentWitnessSatisfied:report?.independentWitnessSatisfied===true,
    externalWitnessCount:Number(report?.externalWitnessCount||0),
    venueCount:Number(report?.venueCount||0),
    distinctVenues:[...(report?.distinctVenues||[])].map(String).sort(),
    agreementScore:Number(report?.agreementScore||0),
    flowAgreement:Number(report?.flowAgreement||0),
    liquidityAgreement:Number(report?.liquidityAgreement||0),
    sameQuotePriceAgreement:Number(report?.sameQuotePriceAgreement||0),
    contradictions:[...(report?.contradictions||[])].map(String).sort(),
    caveats:[...(report?.caveats||[])].map(String).sort(),
    witnesses:[...(report?.witnesses||[])].map(w=>({
      source:String(w.source||'UNKNOWN'),
      venue:String(w.venue||'UNKNOWN'),
      quote:String(w.quote||'UNKNOWN'),
      bid:Number(w.bid),
      ask:Number(w.ask),
      mid:Number(w.mid),
      spreadBps:Number(w.spreadBps),
      imbalance:Number(w.imbalance),
      publishedAt:Number(w.publishedAt),
      availableAt:Number(w.availableAt)
    }))
  };
}

async function ingestResearchFabric(state,witnessReport) {
  const ingestedAt=Date.now();
  const inputs=[
    createMarketEventInput({
      kind:'PRIMARY_MARKET',
      streamKey:`PRIMARY:${state.symbol}`,
      source:String(state.market.source||'BINANCE'),
      sourceEventId:`${state.symbol}:${state.market.timestamp}:${state.market.availableAt}`,
      eventTime:Number(state.market.timestamp),
      availableAt:Number(state.market.availableAt),
      ingestedAt,
      payload:state.market
    }),
    createMarketEventInput({
      kind:'WITNESS_CONSENSUS',
      streamKey:`WITNESS:${state.symbol}`,
      source:'TCX_IWN',
      sourceEventId:`${state.symbol}:${state.availableAt}`,
      eventTime:Number(state.availableAt),
      availableAt:Number(state.availableAt),
      ingestedAt,
      payload:witnessPayload(witnessReport)
    })
  ];

  for(const tf of state.frames){
    for(const candle of closedCandles(state.byTf[tf])){
      inputs.push(createMarketEventInput({
        kind:'CANDLE_CLOSE',
        streamKey:`CANDLE:${state.symbol}:${tf}`,
        source:'BINANCE_PUBLIC_REST_KLINES',
        sourceEventId:`${state.symbol}:${tf}:${candle.closeTime}`,
        eventTime:Number(candle.closeTime),
        availableAt:Number(state.availableAt),
        ingestedAt,
        payload:{
          openTime:Number(candle.openTime),
          closeTime:Number(candle.closeTime),
          o:Number(candle.o),h:Number(candle.h),l:Number(candle.l),c:Number(candle.c),v:Number(candle.v),
          closed:true,
          interval:tf
        }
      }));
    }
  }
  return appendFabricEvents(inputs);
}

let offset = 0;
let running = true;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const permitted = chatId => allowedChats.size === 0 || allowedChats.has(String(chatId));
const fmt = (n, max=2) => Number(n).toLocaleString('de-DE', { maximumFractionDigits:max });
const symbolOk = symbol => /^[A-Z0-9]{2,18}USDT$/.test(symbol);

function normalizeSymbol(input='') {
  const raw = String(input).trim().toUpperCase().replace(/[^A-Z0-9]/g,'');
  if (!raw) return null;
  const symbol = raw.endsWith('USDT') ? raw : `${raw}USDT`;
  return symbolOk(symbol) ? symbol : null;
}

function symbolLabel(symbol) {
  return MARKET_META[symbol]?.[1] || symbol.replace('USDT','');
}

function symbolIcon(symbol) {
  return MARKET_META[symbol]?.[0] || '•';
}

async function witnessState(symbol,primarySnapshot,{maxAgeMs=5000}={}) {
  const cached=witnessCache.get(symbol);
  const now=Date.now();
  if(cached && now-cached.fetchedAt<=maxAgeMs) return cached.report;
  const report=await fetchIndependentWitnesses({
    symbol,
    primarySnapshot,
    fetchJson,
    okxBase,
    krakenBase
  });
  witnessCache.set(symbol,{fetchedAt:now,report});
  return report;
}

function favoriteSet(chatId) {
  const key = String(chatId);
  if (!favorites.has(key)) favorites.set(key, new Set());
  return favorites.get(key);
}

function alertList(chatId) {
  const key = String(chatId);
  if (!alerts.has(key)) alerts.set(key, []);
  return alerts.get(key);
}

function providerNameFromUrl(url) {
  try {
    const host=new URL(url).host.toLowerCase();
    if(host.includes('binance')) return 'BINANCE';
    if(host.includes('okx')) return 'OKX';
    if(host.includes('kraken')) return 'KRAKEN';
    return host.toUpperCase();
  } catch { return 'UNKNOWN'; }
}
async function fetchJson(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  const started=Date.now();
  const provider=providerNameFromUrl(url);
  let status=null;
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'user-agent':'TCX-v2-SHADOW_ONLY', accept:'application/json' }
    });
    status=res.status;
    const body = await res.text();
    if (!res.ok) {
      const detail = body.slice(0,180).replace(/\s+/g,' ');
      throw new Error(`HTTP ${res.status} ${new URL(url).host}: ${detail}`);
    }
    let parsed;
    try { parsed=JSON.parse(body); }
    catch { throw new Error(`Invalid JSON from ${new URL(url).host}`); }
    recordProviderCall(observability,{provider,ok:true,latencyMs:Date.now()-started,status});
    return parsed;
  } catch(err) {
    const message=err instanceof Error?err.message:String(err);
    recordProviderCall(observability,{provider,ok:false,latencyMs:Date.now()-started,status,error:message});
    recordError(observability,{scope:`provider.${provider}`,message});
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchMarketParts(symbol) {
  const encoded = encodeURIComponent(symbol);
  const errors = [];
  for (const base of binanceBases) {
    try {
      const [ticker, book, depth] = await Promise.all([
        fetchJson(`${base}/api/v3/ticker/24hr?symbol=${encoded}`),
        fetchJson(`${base}/api/v3/ticker/bookTicker?symbol=${encoded}`),
        fetchJson(`${base}/api/v3/depth?symbol=${encoded}&limit=20`)
      ]);
      return { ticker, book, depth, base };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${base}: ${msg}`);
      console.warn('market-data endpoint failed', base, msg);
    }
  }
  throw new Error(`All Binance market-data endpoints failed: ${errors.join(' | ')}`);
}

async function fetchKlines(symbol, interval, limit=30) {
  const encoded = encodeURIComponent(symbol);
  const allowed = new Set(['1m','5m','15m','1h','4h']);
  if (!allowed.has(interval)) throw new Error('Unsupported interval');
  const errors = [];
  for (const base of binanceBases) {
    try {
      const rows = await fetchJson(`${base}/api/v3/klines?symbol=${encoded}&interval=${interval}&limit=${limit}`);
      if (!Array.isArray(rows) || rows.length < 2) throw new Error('Insufficient kline data');
      return { rows, base };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${base}: ${msg}`);
    }
  }
  throw new Error(`Klines unavailable: ${errors.join(' | ')}`);
}

async function fetchExecutionBook(symbol) {
  const encoded=encodeURIComponent(symbol);
  const errors=[];
  for(const base of binanceBases){
    try {
      const depth=await fetchJson(`${base}/api/v3/depth?symbol=${encoded}&limit=100`);
      const availableAt=Date.now();
      return normalizeExecutionBook({
        symbol,
        bids:depth.bids||[],
        asks:depth.asks||[],
        availableAt,
        source:'BINANCE_PUBLIC_REST_DEPTH100',
        provenance:`host=${new URL(base).host}; lastUpdateId=${depth.lastUpdateId??'UNKNOWN'}`
      });
    } catch(err) {
      errors.push(`${base}: ${err instanceof Error?err.message:String(err)}`);
    }
  }
  throw new Error(`Execution book unavailable: ${errors.join(' | ')}`);
}

async function fetchLatestAggTradeId(symbol) {
  const encoded=encodeURIComponent(symbol);
  const errors=[];
  for(const base of binanceBases){
    try {
      const rows=await fetchJson(`${base}/api/v3/aggTrades?symbol=${encoded}&limit=1`);
      const row=Array.isArray(rows)?rows.at(-1):null;
      const id=Number(row?.a);
      if(!Number.isFinite(id)) throw new Error('Missing aggregate trade id');
      return id;
    } catch(err) {
      errors.push(`${base}: ${err instanceof Error?err.message:String(err)}`);
    }
  }
  throw new Error(`Latest aggTrade unavailable: ${errors.join(' | ')}`);
}

async function fetchAggTradesSince(symbol,fromId,{maxPages=3}={}) {
  const start=Number(fromId);
  if(!Number.isFinite(start)||start<0) throw new Error('Invalid aggTrade fromId');
  const encoded=encodeURIComponent(symbol);
  const errors=[];
  for(const base of binanceBases){
    try {
      let next=start;
      const out=[];
      let truncated=false;
      for(let page=0;page<maxPages;page++){
        const rows=await fetchJson(`${base}/api/v3/aggTrades?symbol=${encoded}&fromId=${next}&limit=1000`);
        if(!Array.isArray(rows)) throw new Error('Invalid aggTrades payload');
        for(const r of rows){
          const id=Number(r.a),price=Number(r.p),qty=Number(r.q),time=Number(r.T);
          if(!Number.isFinite(id)||!Number.isFinite(price)||!Number.isFinite(qty)) continue;
          out.push({id,price,qty,time,buyerMaker:r.m===true});
        }
        if(rows.length<1000){ truncated=false; break; }
        const last=Number(rows.at(-1)?.a);
        if(!Number.isFinite(last)||last<next) break;
        next=last+1;
        truncated=page===maxPages-1;
      }
      return {trades:out,truncated,base};
    } catch(err) {
      errors.push(`${base}: ${err instanceof Error?err.message:String(err)}`);
    }
  }
  throw new Error(`aggTrades unavailable: ${errors.join(' | ')}`);
}

function shadowAuditPayload(event,order,extra={}) {
  return {
    event:String(event),
    at:Date.now(),
    order:shadowOrderSummary(order),
    runtimeReleaseId:runtimeManifest?.releaseId||null,
    capabilities:SHADOW_OMS_CAPABILITIES,
    ...extra
  };
}

async function placeShadowOrder({symbol,side,type,notionalQuote,limitPrice=null,latencyMs=shadowDefaultLatencyMs}) {
  if(!shadowOmsHealthy) throw new Error('Shadow OMS unhealthy');
  const started=Date.now();
  const decisionBook=await fetchExecutionBook(symbol);
  const boundedLatency=Math.max(0,Math.min(5000,Number(latencyMs)));
  if(boundedLatency>0) await sleep(boundedLatency);
  const arrivalBook=await fetchExecutionBook(symbol);
  let lastAggTradeId=null;
  try { lastAggTradeId=await fetchLatestAggTradeId(symbol); }
  catch(err) { recordError(observability,{scope:'shadow_oms.trade_cursor',message:err instanceof Error?err.message:String(err)}); }
  const order=createShadowOrder({
    intent:{symbol,side,type,notionalQuote,limitPrice,latencyMs:boundedLatency},
    decisionBook,arrivalBook,createdAt:Date.now(),lastAggTradeId,
    config:{
      makerFeeBps:shadowMakerFeeBps,
      takerFeeBps:shadowTakerFeeBps,
      hiddenQueueBufferPct:shadowHiddenQueueBufferPct
    }
  });
  if(order.liquidity==='MAKER' && lastAggTradeId==null){
    order.dataQuality='DEGRADED_NO_TRADE_CURSOR';
  }
  shadowOrders.push(order);
  await persistShadowOms('placed');
  if(auditLedger.healthy) await appendInstitutionalAudit('TCX_SHADOW_ORDER_EVENT',shadowAuditPayload('PLACED',order));
  recordOperation(observability,{name:'shadow_oms.place',ok:true,latencyMs:Date.now()-started});
  return order;
}

async function tg(method, body) {
  const res = await fetch(`${telegramApi}/${method}`, {
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({ ok:false, description:`HTTP ${res.status}` }));
  if (!res.ok || !data.ok) {
    const msg = String(data?.description || `Telegram HTTP ${res.status}`);
    if (method === 'editMessageText' && msg.includes('message is not modified')) return null;
    throw new Error(msg);
  }
  return data.result;
}

async function tgMultipart(method, fields, fileField, fileName, fileBuffer, mime="image/png") {
  const form = new FormData();
  for (const [key,value] of Object.entries(fields)) {
    form.append(key, typeof value === "string" ? value : JSON.stringify(value));
  }
  form.append(fileField, new Blob([fileBuffer], { type:mime }), fileName);
  const res = await fetch(`${telegramApi}/${method}`, { method:"POST", body:form });
  const data = await res.json().catch(() => ({ ok:false, description:`HTTP ${res.status}` }));
  if (!res.ok || !data.ok) throw new Error(String(data?.description || `Telegram HTTP ${res.status}`));
  return data.result;
}

function startKeyboard() {
  const rows = [];
  for (let i=0;i<markets.length;i+=2) {
    rows.push(markets.slice(i,i+2).map(m => ({
      text:`${m.icon} ${m.label}`,
      callback_data:`market:${m.symbol}`
    })));
  }
  rows.push([
    { text:'⭐ Favoriten', callback_data:'favorites' },
    { text:'🔎 Suche', callback_data:'searchhelp' }
  ]);
  return { inline_keyboard: rows };
}

function marketKeyboard(chatId, symbol, live) {
  const isFav = favoriteSet(chatId).has(symbol);
  return { inline_keyboard:[
    [
      { text:'🔄 Aktualisieren', callback_data:`refresh:${symbol}` },
      { text:live?'⏸ Live aus':'⚡ Live an', callback_data:`live:${symbol}:${live?'off':'on'}` }
    ],
    [
      { text:'1m', callback_data:`tf:${symbol}:1m` },
      { text:'5m', callback_data:`tf:${symbol}:5m` },
      { text:'15m', callback_data:`tf:${symbol}:15m` },
      { text:'1h', callback_data:`tf:${symbol}:1h` }
    ],
    [
      { text:'📈 Chart', callback_data:`chart:${symbol}:5m` },
      { text:'🧭 Struktur', callback_data:`structure:${symbol}` },
      { text:'🧬 Memory', callback_data:`memory:${symbol}` }
    ],
    [
      { text:'🧪 MTL Engine', callback_data:`engine:${symbol}` },
      { text:'🛰 Witness', callback_data:`witness:${symbol}` }
    ],
    [
      { text:isFav?'★ Favorit':'☆ Favorit', callback_data:`fav:${symbol}` },
      { text:'🔔 Alarm', callback_data:`alerthelp:${symbol}` },
      { text:'🧠 TCX', callback_data:`tcx:${symbol}` }
    ],
    [{ text:'⬅️ Zurück', callback_data:'back' }]
  ]};
}

function tcxKeyboard(symbol, live) {
  return { inline_keyboard:[
    [{ text:'📊 Markt', callback_data:`refresh:${symbol}` }],
    [
      { text:live?'⏸ Live aus':'⚡ Live an', callback_data:`live:${symbol}:${live?'off':'on'}` },
      { text:'⬅️ Zurück', callback_data:'back' }
    ]
  ]};
}

function timeframeKeyboard(symbol) {
  return { inline_keyboard:[
    [
      { text:'1m', callback_data:`tf:${symbol}:1m` },
      { text:'5m', callback_data:`tf:${symbol}:5m` },
      { text:'15m', callback_data:`tf:${symbol}:15m` },
      { text:'1h', callback_data:`tf:${symbol}:1h` }
    ],
    [
      { text:'📈 Chart', callback_data:`chart:${symbol}:5m` },
      { text:'🧭 Struktur', callback_data:`structure:${symbol}` },
      { text:'🧬 Memory', callback_data:`memory:${symbol}` }
    ],
    [
      { text:'📊 Markt', callback_data:`refresh:${symbol}` },
      { text:'🧠 TCX', callback_data:`tcx:${symbol}` }
    ],
    [{ text:'⬅️ Zurück', callback_data:'back' }]
  ]};
}

function chartKeyboard(symbol, interval) {
  return { inline_keyboard:[
    [
      { text:"1m", callback_data:`chart:${symbol}:1m` },
      { text:"5m", callback_data:`chart:${symbol}:5m` },
      { text:"15m", callback_data:`chart:${symbol}:15m` },
      { text:"1h", callback_data:`chart:${symbol}:1h` },
      { text:"4h", callback_data:`chart:${symbol}:4h` }
    ],
    [
      { text:"🧭 Struktur", callback_data:`structure:${symbol}` },
      { text:"🧬 Memory", callback_data:`memory:${symbol}` },
      { text:"🧪 MTL", callback_data:`engine:${symbol}` },
      { text:"🛰 Witness", callback_data:`witness:${symbol}` },
      { text:"📊 Markt", callback_data:`refresh:${symbol}` }
    ]
  ]};
}

function structureKeyboard(symbol) {
  return { inline_keyboard:[
    [
      { text:"📈 5m Chart", callback_data:`chart:${symbol}:5m` },
      { text:"📈 1h Chart", callback_data:`chart:${symbol}:1h` }
    ],
    [
      { text:"📊 Markt", callback_data:`refresh:${symbol}` },
      { text:"🧬 Memory", callback_data:`memory:${symbol}` },
      { text:"🧪 MTL", callback_data:`engine:${symbol}` },
      { text:"🛰 Witness", callback_data:`witness:${symbol}` },
      { text:"🧠 TCX", callback_data:`tcx:${symbol}` }
    ]
  ]};
}

function memoryKeyboard(symbol) {
  return { inline_keyboard:[
    [
      { text:"📈 5m Chart", callback_data:`chart:${symbol}:5m` },
      { text:"🧭 Struktur", callback_data:`structure:${symbol}` },
      { text:"🧪 MTL", callback_data:`engine:${symbol}` },
      { text:"🛰 Witness", callback_data:`witness:${symbol}` }
    ],
    [
      { text:"📊 Markt", callback_data:`refresh:${symbol}` },
      { text:"🧠 TCX", callback_data:`tcx:${symbol}` }
    ]
  ]};
}

function favoritesKeyboard(chatId) {
  const syms = [...favoriteSet(chatId)];
  const rows = [];
  for (let i=0;i<syms.length;i+=2) {
    rows.push(syms.slice(i,i+2).map(symbol => ({
      text:`${symbolIcon(symbol)} ${symbolLabel(symbol)}`,
      callback_data:`market:${symbol}`
    })));
  }
  rows.push([{ text:'⬅️ Zurück', callback_data:'back' }]);
  return { inline_keyboard: rows };
}

async function snapshot(symbol) {
  const started = Date.now();
  const { ticker, book, depth, base } = await fetchMarketParts(symbol);
  const bids = (depth.bids || []).slice(0,10).map(([p,q]) => [Number(p),Number(q)]);
  const asks = (depth.asks || []).slice(0,10).map(([p,q]) => [Number(p),Number(q)]);
  const bid = Number(book.bidPrice);
  const ask = Number(book.askPrice);
  const mid = (bid + ask) / 2;
  const spreadBps = mid > 0 ? (ask - bid) / mid * 10000 : 0;
  const bidNotional = bids.reduce((s,[p,q]) => s + p*q, 0);
  const askNotional = asks.reduce((s,[p,q]) => s + p*q, 0);
  const total = bidNotional + askNotional;
  const imbalance = total > 0 ? (bidNotional - askNotional) / total : 0;
  const now = Date.now();
  return {
    symbol,
    price:Number(ticker.lastPrice),
    changePct:Number(ticker.priceChangePercent),
    high:Number(ticker.highPrice),
    low:Number(ticker.lowPrice),
    volumeQuote:Number(ticker.quoteVolume),
    bid, ask, spreadBps, imbalance,
    timestamp:now,
    availableAt:now,
    source:'BINANCE_PUBLIC_REST',
    version:'v3',
    provenance:`ticker24hr+bookTicker+depth20; host=${new URL(base).host}; fetched_ms=${now-started}`
  };
}

async function timeframeSnapshot(symbol, interval) {
  const started = Date.now();
  const { rows, base } = await fetchKlines(symbol, interval, 30);
  const availableAt = Date.now();
  const candles = candlesFromKlines(rows, availableAt);
  const closed = closedCandles(candles);
  if (closed.length < 2) throw new Error("Insufficient closed kline data");
  const firstOpen = closed[0].o;
  const lastClose = closed.at(-1).c;
  const high = Math.max(...closed.map(c => c.h));
  const low = Math.min(...closed.map(c => c.l));
  const quoteVolume = rows.slice(0,closed.length).reduce((s,r) => s + Number(r[7] || 0), 0);
  const movePct = firstOpen > 0 ? (lastClose-firstOpen)/firstOpen*100 : 0;
  const rangePct = firstOpen > 0 ? (high-low)/firstOpen*100 : 0;
  return {
    symbol, interval, bars:closed.length, firstOpen, lastClose, high, low, quoteVolume, movePct, rangePct,
    timestamp:closed.at(-1).closeTime,
    availableAt,
    source:"BINANCE_PUBLIC_REST_KLINES",
    version:"v3",
    provenance:`closed_klines; interval=${interval}; host=${new URL(base).host}; fetched_ms=${availableAt-started}`
  };
}

function startText() {
  return [
    '🧠 TCX v2 · Live Market','',
    'Wähle eine Währung oder nutze /coin BTC.','',
    'Live-Daten: Binance · Execution: SHADOW_ONLY',
    'Keine Order-Ausführung.'
  ].join('\n');
}

function helpText() {
  return [
    '🧠 TCX Bot · Befehle','',
    '/start – Hauptmenü',
    '/coin BTC – Coin direkt öffnen',
    '/chart BTC 5m – Candlestick-Chart',
    '/structure BTC – 4H/1H/15m/5m Struktur',
    '/memory BTC – ähnliche historische TCX-Episoden',
    '/engine BTC – Mechanism Transition Lattice',
    '/witness BTC – Binance vs OKX vs Kraken Witness Audit',
    '/audit – Institutional Kernel / Ledger-Integrität',
    '/fabric – Event-Sourced Market Data Fabric',
    '/replay BTC [ISO-Zeit] – Point-in-Time Replay',
    '/release – Runtime Release & Configuration Registry',
    '/obs – Institutional Observability / SLOs',
    '/chaos [SCENARIO] – synthetischer Fail-Closed-Test',
    '/oms – Shadow OMS / Microstructure Simulator',
    '/shadow BTC BUY 100 MARKET [latencyMs] – virtuelle Market-Order',
    '/shadow BTC BUY 100 LIMIT 65000 [latencyMs] – virtuelle Limit-Order',
    '/shadoworders [BTC] – Shadow-Orders',
    '/shadowcancel ORDER_ID – virtuelle Order abbrechen',
    '/favorites – Favoriten',
    '/alert BTC 70000 – einmaliger Preisalarm',
    '/alerts – aktive Preisalarme',
    '/clearalerts – alle Alarme löschen','',
    'Favoriten und Alarme werden persistent gespeichert, wenn Railway ein Volume auf /data gemountet hat.',
    'Execution bleibt SHADOW_ONLY.'
  ].join('\n');
}

function renderMarket(s, live) {
  const dir = s.changePct >= 0 ? '▲' : '▼';
  const im = s.imbalance > 0.12 ? 'Bid-lastig' : s.imbalance < -0.12 ? 'Ask-lastig' : 'ausgeglichen';
  return [
    `📊 ${s.symbol.replace('USDT','/USDT')} · Binance`,'',
    `💰 ${fmt(s.price, s.price < 1 ? 6 : 2)} USDT`,
    `${dir} 24h: ${s.changePct >= 0 ? '+' : ''}${fmt(s.changePct,2)} %`,
    `↕️ 24h: ${fmt(s.low,2)} – ${fmt(s.high,2)}`,
    `📦 Quote-Volumen: ${fmt(s.volumeQuote,0)} USDT`,'',
    `📖 Bid / Ask: ${fmt(s.bid, s.bid<1?6:2)} / ${fmt(s.ask, s.ask<1?6:2)}`,
    `↔️ Spread: ${fmt(s.spreadBps,3)} bps`,
    `⚖️ Depth-Imbalance: ${fmt(s.imbalance*100,1)} % (${im})`,'',
    live ? `⚡ LIVE · Auto-Refresh ${Math.round(refreshMs/1000)}s` : '⏸ Live aus',
    '🧪 TCX: SHADOW_ONLY'
  ].join('\n');
}

function renderTimeframe(t) {
  const dir = t.movePct >= 0 ? '▲' : '▼';
  return [
    `🕯 ${t.symbol.replace('USDT','/USDT')} · ${t.interval}`,'',
    `${dir} 30 Kerzen: ${t.movePct >= 0 ? '+' : ''}${fmt(t.movePct,2)} %`,
    `Start: ${fmt(t.firstOpen,t.firstOpen<1?6:2)}`,
    `Letzter Close: ${fmt(t.lastClose,t.lastClose<1?6:2)}`,
    `High / Low: ${fmt(t.high,t.high<1?6:2)} / ${fmt(t.low,t.low<1?6:2)}`,
    `Range: ${fmt(t.rangePct,2)} %`,
    `Quote-Volumen: ${fmt(t.quoteVolume,0)} USDT`,'',
    'Status: OBSERVED / DERIVED',
    'Execution: SHADOW_ONLY'
  ].join('\n');
}

function renderTcx(s) {
  const liquidity = s.spreadBps < 1 ? 'TIGHT' : s.spreadBps < 4 ? 'NORMAL' : 'WIDE';
  const flow = s.imbalance > 0.15 ? 'BID_PRESSURE' : s.imbalance < -0.15 ? 'ASK_PRESSURE' : 'BALANCED';
  const move = Math.abs(s.changePct) < 1 ? 'LOW' : Math.abs(s.changePct) < 4 ? 'MEDIUM' : 'HIGH';
  return [
    `🧠 TCX · ${s.symbol.replace('USDT','/USDT')}`,'',
    'OBSERVED',
    `• Liquidity: ${liquidity}`,
    `• Orderbook flow: ${flow}`,
    `• 24h move magnitude: ${move}`,
    `• Spread: ${fmt(s.spreadBps,3)} bps`,
    `• Depth imbalance: ${fmt(s.imbalance*100,1)} %`,'',
    'EPISTEMIC STATUS',
    '• Market snapshot: OBSERVED',
    '• Mechanism attribution: NOT INFERRED HERE',
    '• Trading action: ABSTAIN / SHADOW_ONLY','',
    `timestamp: ${new Date(s.timestamp).toISOString()}`,
    `availableAt: ${new Date(s.availableAt).toISOString()}`,
    `source: ${s.source}`,
    `version: ${s.version}`
  ].join('\n');
}

async function ack(id, text) {
  try { await tg('answerCallbackQuery', { callback_query_id:id, text, show_alert:false }); } catch {}
}

async function showStart(chatId, messageId) {
  sessions.delete(String(chatId));
  const payload = {
    chat_id:chatId,
    text:productHomeText({marketCount:markets.length,systemStatus:'ONLINE'}),
    reply_markup:productHomeKeyboard()
  };
  if (messageId) await tg('editMessageText', { ...payload, message_id:messageId });
  else await tg('sendMessage', payload);
}

function homeBackKeyboard(extra=[]) {
  return { inline_keyboard:[
    ...extra,
    [{ text:'📊 Märkte', callback_data:'home:markets' }, { text:'🏠 Home', callback_data:'home' }]
  ]};
}

async function showMarkets(chatId,messageId) {
  const payload={
    chat_id:chatId,
    text:[
      '📊 TCX Märkte','',
      'Wähle einen Markt. Jeder Coin öffnet die Live-Marktkarte.',
      'Research-Status bleibt ABSTAIN / SHADOW_ONLY.'
    ].join('\n'),
    reply_markup:productMarketsKeyboard(markets,favoriteSet(chatId).size)
  };
  if(messageId) await tg('editMessageText',{...payload,message_id:messageId});
  else await tg('sendMessage',payload);
}

async function showHomeSection(chatId,messageId,section) {
  if(section==='MARKETS') return showMarkets(chatId,messageId);
  if(section==='WATCHLIST') return showFavorites(chatId,messageId);

  let text='';
  if(section==='ALERTS') {
    const list=alertList(chatId);
    text=list.length
      ? ['🔔 TCX Alerts','',...list.map((a,i)=>`${i+1}. ${symbolLabel(a.symbol)} ${a.direction==='ABOVE'?'≥':'≤'} ${fmt(a.target,a.target<1?6:2)} USDT`),'','Neue Preisalarme: /alert BTC 70000','TCX-native Alerts folgen auf dieser Basis.'].join('\n')
      : ['🔔 TCX Alerts','','Keine aktiven Preisalarme.','Neue Preisalarme: /alert BTC 70000','','Nächste Ausbaustufe: Struktur-, Regime-, Witness- und Composite-Alerts.'].join('\n');
  } else if(section==='RADAR') {
    const lines=requestedSymbols.map(symbol=>{
      const own=episodes.filter(e=>e.symbol===symbol);
      const mature=own.filter(e=>e.outcomes?.['12']).length;
      return `${symbolLabel(symbol)} · Memory ${own.length} · mature 1h ${mature}`;
    });
    text=['🧠 TCX RADAR · Research Coverage','',
      'Kein Trade-Ranking. Der Radar zeigt aktuell reale Forschungsabdeckung aus Episode Memory.','',
      ...lines,'',
      'Nächster Layer: Data Quality + Witness + Novelty + Regime Change in einer gemeinsamen Radaransicht.'
    ].join('\n');
  } else if(section==='SYSTEM') {
    text=[
      '🩺 TCX SYSTEM','',
      `Audit ledger: ${auditLedger.healthy?'OK':'DEGRADED'} · seq ${auditLedger.seq}`,
      `Market fabric: ${marketFabric.healthy?'OK':'DEGRADED'} · events ${marketFabric.events.length}`,
      `Release registry: ${releaseRegistry.healthy?'OK':'DEGRADED'} · seq ${releaseRegistry.seq}`,
      `State persistence: ${persistenceHealthy?'OK':'DEGRADED'}`,
      `Episode persistence: ${episodePersistenceHealthy?'OK':'DEGRADED'}`,
      `Witness cache: ${witnessCache.size}`,
      `Active sessions: ${sessions.size}`,'',
      'Execution: SHADOW_ONLY',
      'canExecute: false'
    ].join('\n');
  } else if(section==='PERFORMANCE') {
    const total=episodes.length;
    const mature15=episodes.filter(e=>e.outcomes?.['3']).length;
    const mature1h=episodes.filter(e=>e.outcomes?.['12']).length;
    const mature3h=episodes.filter(e=>e.outcomes?.['36']).length;
    const activeAlerts=[...alerts.values()].reduce((n,x)=>n+x.length,0);
    text=[
      '📈 TCX PERFORMANCE · Measured only','',
      `Episodes total: ${total}`,
      `Mature 15m: ${mature15}`,
      `Mature 1h: ${mature1h}`,
      `Mature 3h: ${mature3h}`,
      `Active alerts: ${activeAlerts}`,
      `Tracked markets: ${markets.length}`,'',
      'Noch keine künstliche Winrate und keine erfundenen Forecast-Scores.',
      'Brier/Calibration/Coverage kommen erst mit einem validierten Forecast-Modul.'
    ].join('\n');
  } else if(section==='SETTINGS') {
    text=[
      '⚙️ TCX SETTINGS · Runtime','',
      `Live refresh: ${Math.round(refreshMs/1000)} s`,
      `Alert check: ${Math.round(alertCheckMs/1000)} s`,
      `Episode sweep: ${Math.round(episodeSweepMs/1000)} s`,
      `Markets: ${markets.length}`,
      `Chat whitelist: ${allowedChats.size?'ON':'OFF'}`,
      `State file: ${stateFile}`,'',
      'Execution: SHADOW_ONLY',
      'Telegram-spezifische User-Settings werden als eigener persistenter Layer ergänzt.'
    ].join('\n');
  } else {
    text='TCX Bereich noch nicht verfügbar.';
  }

  const payload={chat_id:chatId,text:text.slice(0,4096),reply_markup:homeBackKeyboard()};
  if(messageId) await tg('editMessageText',{...payload,message_id:messageId});
  else await tg('sendMessage',payload);
}

async function showWhy(chatId,messageId,symbol) {
  const state=await researchState(symbol,'5m');
  const witness=await witnessState(symbol,state.market).catch(()=>null);
  const stored=episodes.filter(e=>e.symbol===symbol).length;
  const mature=episodes.filter(e=>e.symbol===symbol && e.outcomes?.['12']).length;
  const contradictions=witness?.contradictions?.length
    ? witness.contradictions.slice(0,4).join(', ')
    : 'keine harte Cross-Venue-Contradiction im aktuellen Audit';
  const pattern=state.analysis?.pattern
    ? `${state.analysis.pattern.stage}/${state.analysis.pattern.side}`
    : 'kein frisches Break/Retest-Muster';
  const text=[
    `❓ WARUM? · ${symbol.replace('USDT','/USDT')}`,'',
    'AKTUELL BEOBACHTET / ABGELEITET',
    `• MTF Bias: ${state.dashboard.bias} (${state.dashboard.biasScore>=0?'+':''}${state.dashboard.biasScore})`,
    `• Regime: ${state.dashboard.regime}`,
    `• Flow: ${state.dashboard.flow}`,
    `• Liquidity: ${state.dashboard.liquidity}`,
    `• RIFT pressure proxy: ${Math.round(state.dashboard.pressureScore)}/100 · ${state.dashboard.pressureBand}`,
    `• 5m Structure: ${state.analysis?.trend||'INSUFFICIENT'} · ${pattern}`,
    `• Memory: ${stored} gespeichert · ${mature} mit 1h-Outcome`,
    `• Witness agreement: ${witness?Math.round((witness.agreementScore||0)*100)+'%':'nicht verfügbar'}`,'',
    'WIDERSPRUCH / UNSICHERHEIT',
    `• ${contradictions}`,'',
    'WAS WÜRDE DIE AKTUELLE SICHT ÄNDERN?',
    '• neuer Strukturzustand / Break-Retest-Wechsel',
    '• Regime-Transition',
    '• deutlicher Cross-Venue-Konflikt',
    '• veraltete oder fehlerhafte Daten',
    '• aktuell historisch neuartiger Zustand','',
    'Kein Buy/Sell-Signal. Mechanism posterior: NOT_IDENTIFIED.',
    'Action: ABSTAIN / SHADOW_ONLY'
  ].join('\n');
  await tg('editMessageText',{
    chat_id:chatId,message_id:messageId,text:text.slice(0,4096),
    reply_markup:marketProductKeyboard(symbol,{live:false,isFavorite:favoriteSet(chatId).has(symbol)})
  });
}

async function showRegime(chatId,messageId,symbol) {
  const state=await researchState(symbol,'5m');
  const mtf=state.mtf;
  const rows=['4h','1h','15m','5m'].map(tf=>{
    const a=mtf?.analyses?.[tf];
    return `${tf}: ${a?.trend||'INSUFFICIENT'} · EMA20 ${priceText(a?.ema20)} · EMA50 ${priceText(a?.ema50)}`;
  });
  const text=[
    `🧬 REGIME · ${symbol.replace('USDT','/USDT')}`,'',
    `Local regime: ${state.dashboard.regime}`,
    `MTF Bias: ${state.dashboard.bias} · Score ${state.dashboard.biasScore}`,
    `Flow: ${state.dashboard.flow}`,
    `Liquidity: ${state.dashboard.liquidity}`,
    `RIFT: ${Math.round(state.dashboard.pressureScore)}/100 · ${state.dashboard.pressureBand}`,'',
    ...rows,'',
    'Status: DERIVED_HEURISTIC',
    'Causal mechanism: NOT_IDENTIFIED',
    'Action: ABSTAIN / SHADOW_ONLY',
    `availableAt: ${new Date(state.availableAt).toISOString()}`
  ].join('\n');
  await tg('editMessageText',{
    chat_id:chatId,message_id:messageId,text:text.slice(0,4096),
    reply_markup:marketProductKeyboard(symbol,{live:false,isFavorite:favoriteSet(chatId).has(symbol)})
  });
}

async function showFavorites(chatId, messageId) {
  const syms = [...favoriteSet(chatId)];
  const text = syms.length
    ? `⭐ Favoriten\n\n${syms.map(s => `• ${symbolLabel(s)}/USDT`).join('\n')}`
    : '⭐ Noch keine Favoriten.\n\nÖffne einen Coin und tippe auf ☆ Favorit.';
  const payload = { chat_id:chatId, text, reply_markup:favoritesKeyboard(chatId) };
  if (messageId) await tg('editMessageText', { ...payload, message_id:messageId });
  else await tg('sendMessage', payload);
}

async function showMarket(chatId, messageId, symbol, live) {
  const s = await snapshot(symbol);
  const text = renderMarket(s,live);
  const reply_markup = marketProductKeyboard(symbol,{live,isFavorite:favoriteSet(chatId).has(symbol)});
  if (messageId) {
    await tg('editMessageText', { chat_id:chatId, message_id:messageId, text, reply_markup });
    sessions.set(String(chatId), { chatId, messageId, symbol, live, view:'MARKET', lastRefresh:Date.now() });
  } else {
    const sent = await tg('sendMessage', { chat_id:chatId, text, reply_markup });
    sessions.set(String(chatId), { chatId, messageId:sent.message_id, symbol, live, view:'MARKET', lastRefresh:Date.now() });
  }
}

async function showTimeframe(chatId, messageId, symbol, interval) {
  const t = await timeframeSnapshot(symbol, interval);
  await tg('editMessageText', {
    chat_id:chatId,
    message_id:messageId,
    text:renderTimeframe(t),
    reply_markup:timeframeKeyboard(symbol)
  });
  const live = sessions.get(String(chatId))?.live === true;
  sessions.set(String(chatId), { chatId, messageId, symbol, live, view:'TIMEFRAME', interval, lastRefresh:Date.now() });
}

async function showTcx(chatId, messageId, symbol) {
  const s = await snapshot(symbol);
  const live = sessions.get(String(chatId))?.live === true;
  await tg('editMessageText', {
    chat_id:chatId,
    message_id:messageId,
    text:renderTcx(s),
    reply_markup:tcxKeyboard(symbol,live)
  });
  sessions.set(String(chatId), { chatId, messageId, symbol, live, view:'TCX', lastRefresh:Date.now() });
}

function priceText(v) {
  if (!Number.isFinite(v)) return "—";
  return fmt(v,Math.abs(v)<1?6:2);
}

function chartCaption(symbol, interval, analysis, candles, availableAt, host, dashboard) {
  const recent=(analysis.classifiedPivots||[]).slice(-4).map(p=>`${p.label} ${priceText(p.price)}`).join(" · ")||"keine bestätigten Swings";
  const pattern=analysis.pattern?`${analysis.pattern.stage} · ${analysis.pattern.side} @ ${priceText(analysis.pattern.level)}`:"kein frisches Break/Retest-Muster";
  const activeVisible=candles.some(c=>c.closed===false);
  return [
    `📈 ${symbol.replace("USDT","/USDT")} · ${interval}`,
    `MTF Bias: ${dashboard.bias} (${dashboard.biasScore>=0?"+":""}${dashboard.biasScore}) · Regime: ${dashboard.regime}`,
    `RIFT pressure proxy: ${Math.round(dashboard.pressureScore)}/100 ${dashboard.pressureBand} · ${dashboard.dominantPressure}`,
    `Flow: ${dashboard.flow} · Liquidity: ${dashboard.liquidity} · Spread ${dashboard.spreadBps.toFixed(2)} bps`,
    `Swings: ${recent}`,
    `EMA20 / EMA50: ${priceText(analysis.ema20)} / ${priceText(analysis.ema50)}`,
    `Support / Resistance: ${priceText(analysis.support)} / ${priceText(analysis.resistance)}`,
    `Pattern: ${pattern}`,
    activeVisible?"Live-Kerze sichtbar; Struktur nutzt nur geschlossene Kerzen.":"Alle dargestellten Kerzen geschlossen.",
    "",
    "OBSERVED: OHLCV/Orderbook · DERIVED_HEURISTIC: Struktur/Regime/RIFT pressure",
    "Mechanism posterior: NOT_IDENTIFIED · Action: ABSTAIN / SHADOW_ONLY",
    `availableAt: ${new Date(availableAt).toISOString()} · source: ${host}`
  ].join("\n").slice(0,1024);
}

async function researchState(symbol,interval="5m") {
  const availableAt=Date.now();
  const frames=[...new Set(["4h","1h","15m","5m",interval])];
  const [market,...fetched]=await Promise.all([
    snapshot(symbol),
    ...frames.map(tf=>fetchKlines(symbol,tf,tf==="5m"?500:180))
  ]);
  const byTf={};
  frames.forEach((tf,i)=>{byTf[tf]=candlesFromKlines(fetched[i].rows,availableAt);});
  const analysis=analyzeStructure(byTf[interval]);
  const mtf=analyzeMultiTimeframe({
    "4h":byTf["4h"],
    "1h":byTf["1h"],
    "15m":byTf["15m"],
    "5m":byTf["5m"]
  });
  const dashboard=deriveChartDashboard(byTf[interval],analysis,mtf,market);
  const memoryAnalysis=interval==="5m"?analysis:analyzeStructure(byTf["5m"]);
  const memoryDashboard=interval==="5m"?dashboard:deriveChartDashboard(byTf["5m"],memoryAnalysis,mtf,market);
  return {symbol,interval,availableAt,frames,fetched,market,byTf,analysis,mtf,dashboard,memoryAnalysis,memoryDashboard};
}

function latestSymbolEpisode(symbol) {
  for(let i=episodes.length-1;i>=0;i--) if(episodes[i].symbol===symbol) return episodes[i];
  return null;
}

async function captureEpisodeFromState(state,{persist=true}={}) {
  const closed5=closedCandles(state.byTf["5m"]);
  const anchor=closed5.at(-1)?.closeTime;
  if(!Number.isFinite(anchor)) return null;
  const lastEpisode=latestSymbolEpisode(state.symbol);
  const decision=shouldSampleEpisode({
    anchorCloseTime:anchor,
    analysis:state.memoryAnalysis,
    dashboard:state.memoryDashboard,
    lastEpisode
  });
  if(!decision.capture) return null;
  const id=`${state.symbol}:5m:${anchor}`;
  const existing=episodes.find(e=>e.id===id);
  if(existing) return existing;
  const episode=createEpisode({
    symbol:state.symbol,
    interval:"5m",
    anchorCloseTime:anchor,
    availableAt:state.availableAt,
    analysis:state.memoryAnalysis,
    dashboard:state.memoryDashboard,
    market:state.market,
    samplingReason:decision.reason
  });
  episodes.push(episode);
  if(persist) await persistEpisodeMemory("capture");
  return episode;
}

function matureSymbolEpisodes(symbol,candles) {
  let changed=false;
  for(const e of episodes) {
    if(e.symbol!==symbol) continue;
    if(matureEpisode(e,candles)) changed=true;
  }
  return changed;
}

function statLine(label,s) {
  if(!s||s.n<3) return `${label}: n=${s?.n||0} · noch zu wenig gereifte Episoden`;
  const r=s.returnPct,up=s.maxRisePct,down=s.maxFallPct;
  return `${label}: n=${s.n} · Sim ${fmt(s.medianSimilarity,0)}% · End ${fmt(r.median,2)}% [IQR ${fmt(r.q25,2)}..${fmt(r.q75,2)}] · Rise ${fmt(up.median,2)}% · Fall ${fmt(down.median,2)}%`;
}

async function showMemory(chatId,symbol) {
  const state=await researchState(symbol,"5m");
  await captureEpisodeFromState(state,{persist:false});
  const matured=matureSymbolEpisodes(symbol,state.byTf["5m"]);
  if(matured) await persistEpisodeMemory("manual-maturity");
  const vector=episodeVector({analysis:state.memoryAnalysis,dashboard:state.memoryDashboard});
  const m3=findSimilarEpisodes(vector,episodes,{symbol,k:8,requireMatured:true,horizonBars:3});
  const m12=findSimilarEpisodes(vector,episodes,{symbol,k:8,requireMatured:true,horizonBars:12});
  const m36=findSimilarEpisodes(vector,episodes,{symbol,k:8,requireMatured:true,horizonBars:36});
  const s3=summarizeSimilar(m3,3),s12=summarizeSimilar(m12,12),s36=summarizeSimilar(m36,36);
  const stored=episodes.filter(e=>e.symbol===symbol).length;
  const text=[
    `🧬 TCX Episode Memory · ${symbol.replace("USDT","/USDT")}`,
    "",
    `Aktuell: ${state.memoryDashboard.regime} · ${state.memoryDashboard.flow} · RIFT ${Math.round(state.memoryDashboard.pressureScore)}/100`,
    `Gespeicherte Episoden: ${stored}`,
    "",
    "Ähnlichkeit = Zustand/Mechanik-Telemetrie, NICHT Chartform.",
    statLine("15m",s3),
    statLine("1h",s12),
    statLine("3h",s36),
    "",
    "Outcomes: historisch beobachtete Endbewegung + maximale Auf-/Abwärtsbewegung.",
    "Keine Trefferquote, keine Prognose, kein Trade-Signal.",
    "Mechanism posterior: NOT_IDENTIFIED",
    "Action: ABSTAIN / SHADOW_ONLY"
  ].join("\n");
  return tg("sendMessage",{chat_id:chatId,text,reply_markup:memoryKeyboard(symbol)});
}

async function showChart(chatId, symbol, interval="5m") {
  const state=await researchState(symbol,interval);
  await captureEpisodeFromState(state,{persist:true});
  const png=renderCandlestickPng(state.byTf[interval],state.analysis,{width:1100,height:760,dashboard:state.dashboard});
  const host=new URL(state.fetched[state.frames.indexOf(interval)].base).host;
  return tgMultipart("sendPhoto",{
    chat_id:String(chatId),
    caption:chartCaption(symbol,interval,state.analysis,state.byTf[interval],state.availableAt,host,state.dashboard),
    reply_markup:JSON.stringify(chartKeyboard(symbol,interval))
  },"photo",`${symbol}-${interval}.png`,png,"image/png");
}

function structureText(symbol, result, availableAt) {
  const lines=[`🧭 TCX Structure · ${symbol.replace("USDT","/USDT")}`,""];
  for (const tf of ["4h","1h","15m","5m"]) {
    const a=result.analyses[tf];
    const p=a?.pattern ? `${a.pattern.stage}/${a.pattern.side}` : "—";
    lines.push(`${tf}: ${a?.trend || "INSUFFICIENT"} · EMA20 ${priceText(a?.ema20)} · EMA50 ${priceText(a?.ema50)} · Pattern ${p}`);
  }
  lines.push("",`MTF Bias: ${result.bias} · Score ${result.biasScore}`);
  const five=result.analyses["5m"];
  lines.push(`5m Support / Resistance: ${priceText(five?.support)} / ${priceText(five?.resistance)}`);
  lines.push("","EPISTEMIC STATUS","• OHLCV: OBSERVED","• Pivots/EMA/Bias/Break-Retest: DERIVED HEURISTIC","• Causal mechanism: NOT INFERRED","• Trading action: ABSTAIN / SHADOW_ONLY",`availableAt: ${new Date(availableAt).toISOString()}`);
  return lines.join("\n");
}

async function showStructure(chatId, symbol) {
  const frames=["4h","1h","15m","5m"];
  const availableAt=Date.now();
  const fetched=await Promise.all(frames.map(tf => fetchKlines(symbol,tf,220)));
  const byTf={};
  frames.forEach((tf,i) => { byTf[tf]=candlesFromKlines(fetched[i].rows,availableAt); });
  const result=analyzeMultiTimeframe(byTf);
  return tg("sendMessage",{
    chat_id:chatId,
    text:structureText(symbol,result,availableAt),
    reply_markup:structureKeyboard(symbol)
  });
}

function witnessLine(w) {
  const age=Math.max(0,Date.now()-Number(w.publishedAt||w.availableAt||Date.now()));
  return `• ${w.source} ${w.quote}: mid ${priceText(w.mid)} · spread ${fmt(w.spreadBps,2)} bps · imbalance ${fmt(w.imbalance*100,1)}% · age ${Math.round(age/1000)}s`;
}

function witnessSummary(report) {
  const usable=report.witnesses||[];
  const errors=report.witnessErrors||[];
  return [
    `Venues: ${report.venueCount} · external ${report.externalWitnessCount}`,
    `Agreement: ${pct01(report.agreementScore)}% · flow ${pct01(report.flowAgreement)}% · liquidity ${pct01(report.liquidityAgreement)}%`,
    `Same-quote price agreement: ${pct01(report.sameQuotePriceAgreement)}%`,
    `Independent witness gate: ${report.independentWitnessSatisfied?"SATISFIED":"NOT SATISFIED"}`,
    `Source independence: ${report.sourceIndependence}`,
    "",
    "VENUE SNAPSHOTS",
    witnessLine(report.primary),
    ...usable.map(witnessLine),
    ...(errors.length?["","Unavailable: "+errors.map(e=>`${e.source}(${e.error})`).join(" · ")]:[]),
    ...(report.contradictions?.length?["","Contradictions/caveats: "+report.contradictions.join(", ")]:[])
  ].join("\n");
}

async function showWitness(chatId,symbol) {
  const primary=await snapshot(symbol);
  const report=await witnessState(symbol,primary,{maxAgeMs:2000});
  const text=[
    `🛰 TCX Independent Witness Network · ${symbol.replace("USDT","/USDT")}`,
    "",
    witnessSummary(report),
    "",
    "EPISTEMIC STATUS",
    "• Binance / OKX / Kraken: independent venue observations",
    "• Cross-venue agreement: evidence audit, not causality",
    "• USD vs USDT: quote-basis caveat where Kraken is used",
    "• Mechanism: NOT_IDENTIFIED",
    "• Action: ABSTAIN / SHADOW_ONLY"
  ].join("\n");
  return tg("sendMessage",{chat_id:chatId,text:text.slice(0,4096),reply_markup:memoryKeyboard(symbol)});
}

async function showAudit(chatId) {
  const verification=verifyLedgerRecords(auditLedger.records);
  const tail=ledgerTailSummary(auditLedger);
  const last=auditLedger.records.at(-1);
  const replay=last?.kind==='TCX_RESEARCH_ENVELOPE'?replayEnvelopeIntegrity(last.payload):null;
  const text=[
    '🛡 TCX Institutional Kernel',
    '',
    `Kernel: ${INSTITUTIONAL_KERNEL_VERSION}`,
    `Ledger health: ${auditLedger.healthy&&verification.ok?'HEALTHY':'UNHEALTHY / SAFE_STOP'}`,
    `Records: ${tail.seq}`,
    `Tail hash: ${tail.tailHash.slice(0,20)}…`,
    `File: ${tail.filePath}`,
    '',
    `Chain verification: ${verification.ok?'PASS':'FAIL '+(verification.error||'UNKNOWN')}`,
    replay?`Last envelope replay integrity: ${replay.ok?'PASS':'FAIL'}`:'Last envelope replay integrity: n/a',
    last?`Last record: #${last.seq} · ${last.kind}`:'Last record: none',
    last?.payload?.symbol?`Last symbol: ${last.payload.symbol}`:'',
    last?.payload?.safety?.state?`Last safety state: ${last.payload.safety.state}`:'',
    '',
    'INVARIANTS',
    '• Execution path: DISABLED',
    '• canExecute: FALSE',
    '• Mode: SHADOW_ONLY',
    '• Ledger corruption => SAFE_STOP',
    '• Invalid/stale primary data => SAFE_STOP'
  ].filter(Boolean).join('\n');
  return tg('sendMessage',{chat_id:chatId,text:text.slice(0,4096)});
}

function parseReplayTime(raw) {
  if(!raw) return Date.now();
  const n=Number(raw);
  if(Number.isFinite(n) && n>0) return n;
  const t=Date.parse(raw);
  return Number.isFinite(t)?t:null;
}

async function showRelease(chatId) {
  const verification=verifyReleaseRegistry(releaseRegistry.records);
  const s=releaseRegistrySummary(releaseRegistry,runtimeManifest);
  const text=[
    '🧬 TCX Runtime Release Registry',
    '',
    `Registry: ${RELEASE_REGISTRY_VERSION}`,
    `Health: ${releaseRegistry.healthy&&verification.ok?'HEALTHY':'UNHEALTHY / SAFE_STOP'}`,
    `Releases: ${s.releases} · seq ${s.seq}`,
    `Tail hash: ${s.tailHash.slice(0,20)}…`,
    `Current registered: ${s.currentRegistered?'YES':'NO'}`,
    `Current release: ${s.currentReleaseId?s.currentReleaseId.slice(0,20)+'…':'UNAVAILABLE'}`,
    `Registry record: ${s.currentRegistrySeq??'n/a'}`,
    '',
    runtimeManifest?`Package: ${runtimeManifest.package.name} ${runtimeManifest.package.version}`:'Package: unavailable',
    runtimeManifest?`Node: ${runtimeManifest.runtime.node} · ${runtimeManifest.runtime.platform}/${runtimeManifest.runtime.arch}`:'Runtime: unavailable',
    runtimeManifest?`Config hash: ${runtimeManifest.configHash.slice(0,20)}…`:'Config hash: unavailable',
    runtimeManifest?`Components hashed: ${Object.keys(runtimeManifest.componentHashes||{}).length}`:'Components hashed: 0',
    '',
    `Chain verification: ${verification.ok?'PASS':'FAIL '+(verification.error||'UNKNOWN')}`,
    'Secrets werden nicht in die Release Registry aufgenommen.',
    'Execution: SHADOW_ONLY'
  ].join('\n');
  return tg('sendMessage',{chat_id:chatId,text:text.slice(0,4096)});
}

function fmtMetric(v,d=0) {
  return Number.isFinite(Number(v))?fmt(Number(v),d):'n/a';
}

async function showObservability(chatId) {
  const s=observabilitySnapshot(observability);
  const slo=deriveSloHealth(s);
  const providers=Object.entries(s.providers);
  const text=[
    '📡 TCX Institutional Observability',
    '',
    `Version: ${OBSERVABILITY_VERSION}`,
    `Uptime: ${fmtMetric(s.uptimeMs/1000,0)}s`,
    `Safety: ${s.safety.current}`,
    `SLO: ${slo.ok?'PASS':'BREACH'}`,
    ...(slo.breaches.length?[`Breaches: ${slo.breaches.join(', ')}`]:[]),
    '',
    'PROVIDERS',
    ...(providers.length?providers.map(([name,p])=>
      `• ${name}: ${p.calls} calls · success ${p.successRate==null?'n/a':fmtMetric(p.successRate*100,1)+'%'} · p95 ${fmtMetric(p.latency.p95Ms,0)}ms`
    ):['• no samples yet']),
    '',
    'RESEARCH TELEMETRY',
    `• evidence mean: ${fmtMetric((s.research.evidence.mean??NaN)*100,1)}%`,
    `• novelty p95: ${fmtMetric((s.research.novelty.p95??NaN)*100,1)}%`,
    `• contradiction p95: ${fmtMetric((s.research.contradiction.p95??NaN)*100,1)}%`,
    `• witness agreement mean: ${fmtMetric((s.research.witnessAgreement.mean??NaN)*100,1)}%`,
    `• primary age p95: ${fmtMetric(s.research.primaryAgeMs.p95,0)}ms`,
    '',
    `Safety transitions: ${s.safety.transitions.length}`,
    `Recent errors: ${s.recentErrors.length}`,
    'Execution: SHADOW_ONLY'
  ].join('\n');
  return tg('sendMessage',{chat_id:chatId,text:text.slice(0,4096)});
}

async function showChaos(chatId,scenario=null) {
  const started=Date.now();
  let report;
  if(scenario){
    const name=String(scenario).toUpperCase();
    if(!chaosScenarioNames().includes(name)){
      const names=chaosScenarioNames().join(', ');
      await tg('sendMessage',{chat_id:chatId,text:`Unbekanntes Chaos-Szenario. Verfügbar: ${names}`.slice(0,4096)});
      return;
    }
    const r=runChaosScenario(name);
    report={
      version:CHAOS_ENGINEERING_VERSION,
      mode:'SYNTHETIC_SIDE_EFFECT_FREE',
      total:1,
      passed:r.pass?1:0,
      failed:r.pass?0:1,
      passRate:r.pass?1:0,
      executionInvariant:r.invariantOk,
      results:[r]
    };
  } else {
    report=runChaosSuite();
  }
  recordOperation(observability,{
    name:'chaos_suite',
    ok:report.failed===0,
    latencyMs:Date.now()-started,
    error:report.failed?String(report.failed)+' failed':null
  });
  if(auditLedger.healthy) await appendInstitutionalAudit('TCX_CHAOS_REPORT',report);
  const text=[
    '🧨 TCX Chaos Engineering',
    '',
    `Version: ${report.version}`,
    `Mode: ${report.mode}`,
    `Result: ${report.passed}/${report.total} PASS`,
    `Execution invariant: ${report.executionInvariant?'PASS':'FAIL'}`,
    '',
    ...report.results.map(r=>
      `${r.pass?'PASS':'FAIL'} · ${r.name}: expected ${r.expectedState} / actual ${r.actualState} · execute=${r.canExecute?'YES':'NO'}`
    ),
    '',
    'Keine echten Provider, Orders, Fabric-Events oder Marktstates werden manipuliert.',
    'Execution: SHADOW_ONLY'
  ].join('\n');
  return tg('sendMessage',{chat_id:chatId,text:text.slice(0,4096)});
}
function shadowOrderLine(order) {
  const s=shadowOrderSummary(order);
  const fill=`${fmt(Number(s.fillRatio||0)*100,1)}%`;
  const px=s.avgFillPrice?priceText(s.avgFillPrice):'—';
  return `${s.id} · ${s.symbol.replace('USDT','/USDT')} · ${s.side} ${s.type} · ${s.status} · fill ${fill} · avg ${px}`;
}

function shadowOrderDetail(order) {
  const s=shadowOrderSummary(order);
  const lines=[
    `🧾 TCX Shadow Order · ${s.symbol.replace('USDT','/USDT')}`,
    '',
    `ID: ${s.id}`,
    `Intent: ${s.side} ${s.type} · ${fmt(s.notionalQuote,2)} USDT`,
    ...(s.limitPrice?[`Limit: ${priceText(s.limitPrice)}`]:[]),
    `Status: ${s.status}`,
    `Fill: ${fmt(s.fillRatio*100,1)}% · avg ${s.avgFillPrice?priceText(s.avgFillPrice):'—'}`,
    `Slippage vs arrival mid: ${Number.isFinite(s.slippageBps)?fmt(s.slippageBps,2)+' bps':'—'}`,
    `Latency move: ${Number.isFinite(s.latencyMoveBps)?fmt(s.latencyMoveBps,2)+' bps':'—'}`,
    `Fees (assumption): ${fmt(s.feesQuote,4)} USDT`,
    ...(s.queueAheadBase!=null?[`Queue ahead proxy: ${fmt(s.queueAheadBase,8)} base · uncertainty ${order.queue?.uncertainty||'UNKNOWN'}`]:[]),
    ...(order.depthExhausted?[`Visible L2 depth exhausted: YES · remaining intent was NOT fabricated as filled.`]:[]),
    `Data quality: ${s.dataQuality}`,
    '',
    'MARKOUT / ADVERSE SELECTION',
    ...['60000','300000','900000'].map(k=>{
      const m=s.markouts?.[k];
      const label=k==='60000'?'1m':k==='300000'?'5m':'15m';
      return m?`• ${label}: signed ${fmt(m.signedMarkoutBps,2)} bps · adverse ${fmt(m.adverseSelectionBps,2)} bps`:`• ${label}: pending`;
    }),
    '',
    'Execution adapter: NONE',
    'Exchange order ID: NONE',
    'Mode: SHADOW_ONLY'
  ];
  return lines.join('\n').slice(0,4096);
}

async function showOms(chatId) {
  const counts={};
  for(const o of shadowOrders) counts[o.status]=(counts[o.status]||0)+1;
  const active=shadowOrders.filter(o=>['ACTIVE','PARTIALLY_FILLED'].includes(o.status)).length;
  const text=[
    '🧾 TCX Shadow OMS + Microstructure Simulator',
    '',
    `Version: ${SHADOW_OMS_VERSION}`,
    `Health: ${shadowOmsHealthy?'HEALTHY':'UNHEALTHY / OMS DISABLED'}`,
    `Orders: ${shadowOrders.length} · active ${active}`,
    `Filled: ${counts.FILLED||0} · partial ${counts.PARTIALLY_FILLED||0} · cancelled ${counts.CANCELLED||0}`,
    '',
    'ASSUMPTIONS',
    `• default latency: ${shadowDefaultLatencyMs}ms`,
    `• maker fee: ${shadowMakerFeeBps} bps`,
    `• taker fee: ${shadowTakerFeeBps} bps`,
    `• hidden queue buffer: ${fmt(shadowHiddenQueueBufferPct*100,1)}%`,
    `• watcher: ${Math.round(shadowWatchMs/1000)}s`,
    '',
    'CAPABILITIES',
    `• canExecuteLive: ${SHADOW_OMS_CAPABILITIES.canExecuteLive?'YES':'NO'}`,
    `• exchangeOrderAdapter: ${SHADOW_OMS_CAPABILITIES.exchangeOrderAdapter?'YES':'NO'}`,
    `• networkOrderSubmission: ${SHADOW_OMS_CAPABILITIES.networkOrderSubmission?'YES':'NO'}`,
    '',
    'Market/marketable limit: observed L2 walk.',
    'Passive limit: price-time queue proxy + observed aggTrades.',
    'No real order submission exists in this runtime.'
  ].join('\n');
  return tg('sendMessage',{chat_id:chatId,text:text.slice(0,4096)});
}

async function showShadowOrders(chatId,symbol=null) {
  const xs=shadowOrders
    .filter(o=>!symbol||o.symbol===symbol)
    .slice(-12)
    .reverse();
  const text=xs.length
    ? ['🧾 TCX Shadow Orders','',...xs.map(shadowOrderLine),'','Nutze /shadowcancel ORDER_ID für aktive virtuelle Orders.','Mode: SHADOW_ONLY'].join('\n')
    : '🧾 Keine passenden Shadow-Orders vorhanden.';
  return tg('sendMessage',{chat_id:chatId,text:text.slice(0,4096)});
}

async function showPlacedShadowOrder(chatId,order) {
  return tg('sendMessage',{chat_id:chatId,text:shadowOrderDetail(order)});
}

async function showFabric(chatId) {
  const verification=verifyMarketEventChain(marketFabric.events);
  const s=marketFabricSummary(marketFabric);
  const text=[
    '🧱 TCX Market Data Fabric',
    '',
    `Version: ${MARKET_DATA_FABRIC_VERSION}`,
    `Health: ${marketFabric.healthy&&verification.ok?'HEALTHY':'UNHEALTHY / SAFE_STOP'}`,
    `Events: ${s.eventCount} · seq ${s.seq}`,
    `Tail hash: ${s.tailHash.slice(0,20)}…`,
    `File: ${s.filePath}`,
    '',
    `PRIMARY_MARKET: ${s.counts.PRIMARY_MARKET||0}`,
    `WITNESS_CONSENSUS: ${s.counts.WITNESS_CONSENSUS||0}`,
    `CANDLE_CLOSE: ${s.counts.CANDLE_CLOSE||0}`,
    '',
    `Chain verification: ${verification.ok?'PASS':'FAIL '+(verification.error||'UNKNOWN')}`,
    'Backfill rule: availableAt = tatsächliche TCX-Ingestion, nicht historischer Candle-Close.',
    'Execution: SHADOW_ONLY'
  ].join('\n');
  return tg('sendMessage',{chat_id:chatId,text:text.slice(0,4096)});
}

async function showReplay(chatId,symbol,asOf) {
  const state=reconstructInstitutionalState(marketFabric.events,{symbol,asOf});
  const s=replaySummary(state);
  const primary=state.primary;
  const witness=state.witness;
  const text=[
    `⏪ TCX Deterministic Replay · ${symbol.replace('USDT','/USDT')}`,
    '',
    `Replay: ${DETERMINISTIC_REPLAY_VERSION}`,
    `asOf: ${new Date(asOf).toISOString()}`,
    `Hash: ${s.replayHash.slice(0,20)}…`,
    `Future leakage: ${s.leakage.ok?'PASS':'FAIL '+s.leakage.violations.join(', ')}`,
    '',
    `Primary: ${primary?`${priceText(primary.price)} · ${primary.source||'UNKNOWN'}`:'not available'}`,
    `Witness: ${witness?`${fmt(Number(witness.agreementScore||0)*100,0)}% agreement · external ${witness.externalWitnessCount||0}`:'not available'}`,
    '',
    'CANDLES KNOWN AT asOf',
    ...Object.entries(s.candleCounts).map(([tf,n])=>`• ${tf}: ${n}`),
    '',
    'Replay nutzt ausschließlich Events mit event.availableAt <= asOf.',
    'Action: ABSTAIN / SHADOW_ONLY'
  ].join('\n');
  return tg('sendMessage',{chat_id:chatId,text:text.slice(0,4096)});
}

function pct01(x){ return fmt(Number(x)*100,0); }

function transitionLine(label,lattice){
  if(!lattice.sufficient){
    return `${label}: n=${lattice.support} · insufficient evidence · novelty ${pct01(lattice.novelty)}%`;
  }
  const top=lattice.states[0];
  const topText=top?`${top.state.replaceAll("|"," → ")} · ${fmt(top.share*100,0)}%`:"—";
  return `${label}: n=${lattice.support} · coherence ${pct01(lattice.transitionCoherence)}% · entropy ${pct01(lattice.transitionEntropy)}% · top ${topText}`;
}

async function showEngine(chatId,symbol){
  const engineStarted=Date.now();
  const state=await researchState(symbol,"5m");
  await captureEpisodeFromState(state,{persist:false});
  if(matureSymbolEpisodes(symbol,state.byTf["5m"])) await persistEpisodeMemory("engine-maturity");
  const witnessReport=await witnessState(symbol,state.market,{maxAgeMs:3000});

  const r15=runMechanismTransitionEngine({
    analysis:state.memoryAnalysis,dashboard:state.memoryDashboard,episodes,symbol,horizonMinutes:15,witnessReport
  });
  const r60=runMechanismTransitionEngine({
    analysis:state.memoryAnalysis,dashboard:state.memoryDashboard,episodes,symbol,horizonMinutes:60,witnessReport
  });
  const r180=runMechanismTransitionEngine({
    analysis:state.memoryAnalysis,dashboard:state.memoryDashboard,episodes,symbol,horizonMinutes:180,witnessReport
  });

  const fabricWrite=await ingestResearchFabric(state,witnessReport);
  const fabricSummary=marketFabricSummary(marketFabric);

  const marketAudit=auditMarketSnapshot(state.market,{
    now:Date.now(),
    maxAgeMs:institutionalMarketMaxAgeMs
  });
  const witnessAudit=auditWitnessReport(witnessReport);
  const engineAudit=auditEngineResult(r15);
  let safety=determineSafetyState({
    marketAudit,
    witnessAudit,
    engineAudit,
    ledgerHealthy:auditLedger.healthy,
    fabricHealthy:marketFabric.healthy,
    registryHealthy:releaseRegistry.healthy && Boolean(runtimeReleaseRecord)
  });
  let envelope=buildResearchEnvelope({
    symbol,
    availableAt:state.availableAt,
    market:state.market,
    witness:witnessReport,
    engine:r15,
    safety,
    config:institutionalConfig,
    versions:{
      institutionalKernel:INSTITUTIONAL_KERNEL_VERSION,
      mechanismEngine:r15.version,
      episodeMemory:'V3',
      witnessNetwork:'IWN_V1',
      marketDataFabric:MARKET_DATA_FABRIC_VERSION,
      deterministicReplay:DETERMINISTIC_REPLAY_VERSION
    },
    dataFabric:{
      version:MARKET_DATA_FABRIC_VERSION,
      seq:fabricSummary.seq,
      tailHash:fabricSummary.tailHash,
      healthy:fabricSummary.healthy
    },
    runtimeRelease:{
      registryVersion:RELEASE_REGISTRY_VERSION,
      releaseId:runtimeManifest?.releaseId||'UNAVAILABLE',
      registrySeq:runtimeReleaseRecord?.seq??null,
      registryTailHash:releaseRegistry.tailHash,
      registryHealthy:releaseRegistry.healthy
    }
  });
  const auditRecord=await appendInstitutionalAudit('TCX_RESEARCH_ENVELOPE',envelope);
  if(!auditLedger.healthy){
    safety=determineSafetyState({
      marketAudit,
      witnessAudit,
      engineAudit,
      ledgerHealthy:false,
      fabricHealthy:marketFabric.healthy,
      registryHealthy:releaseRegistry.healthy && Boolean(runtimeReleaseRecord)
    });
    envelope=buildResearchEnvelope({
      symbol,
      availableAt:state.availableAt,
      market:state.market,
      witness:witnessReport,
      engine:r15,
      safety,
      config:institutionalConfig,
      versions:{
        institutionalKernel:INSTITUTIONAL_KERNEL_VERSION,
        mechanismEngine:r15.version,
        episodeMemory:'V3',
        witnessNetwork:'IWN_V1',
        marketDataFabric:MARKET_DATA_FABRIC_VERSION,
        deterministicReplay:DETERMINISTIC_REPLAY_VERSION
      },
      dataFabric:{
        version:MARKET_DATA_FABRIC_VERSION,
        seq:marketFabric.seq,
        tailHash:marketFabric.tailHash,
        healthy:marketFabric.healthy
      },
      runtimeRelease:{
        registryVersion:RELEASE_REGISTRY_VERSION,
        releaseId:runtimeManifest?.releaseId||'UNAVAILABLE',
        registrySeq:runtimeReleaseRecord?.seq??null,
        registryTailHash:releaseRegistry.tailHash,
        registryHealthy:releaseRegistry.healthy
      }
    });
  }

  recordSafety(observability,safety.state,{
    hardReasons:safety.hardReasons,
    softReasons:safety.softReasons
  });
  recordResearchTelemetry(observability,{
    evidenceStrength:r15.hypothesis.evidenceStrength,
    novelty:r15.lattice.novelty,
    contradiction:r15.audit.contradictionScore,
    witnessAgreement:witnessReport.agreementScore,
    primaryAgeMs:marketAudit.ageMs
  });
  recordOperation(observability,{
    name:'engine',
    ok:safety.state!=='SAFE_STOP',
    latencyMs:Date.now()-engineStarted,
    error:safety.state==='SAFE_STOP'?safety.hardReasons.join(','):null
  });
  const ch=Object.entries(r15.channels).sort((a,b)=>b[1]-a[1]);
  const strongest=ch[0]||["NONE",0];
  const text=[
    `🧪 TCX Mechanism Transition Lattice · ${symbol.replace("USDT","/USDT")}`,
    "",
    `Candidate channel: ${strongest[0]} · ${pct01(strongest[1])}%`,
    `Gate: ${r15.hypothesis.gate}`,
    `Evidence strength: ${pct01(r15.hypothesis.evidenceStrength)}%`,
    `Modality coverage: ${pct01(r15.audit.modalityCoverage)}%`,
    `Contradiction: ${pct01(r15.audit.contradictionScore)}%`,
    `Independent witness: ${r15.audit.independentWitnessSatisfied?"YES":"NO"} · venues ${witnessReport.venueCount}`,
    `Witness agreement: ${pct01(witnessReport.agreementScore)}% · external ${witnessReport.externalWitnessCount}`,
    "",
    "PRESSURE CHANNELS",
    ...ch.map(([k,v])=>`• ${k}: ${pct01(v)}%`),
    "",
    "TRANSITION LATTICE",
    transitionLine("15m",r15.lattice),
    transitionLine("1h",r60.lattice),
    transitionLine("3h",r180.lattice),
    "",
    `Conflicts: ${r15.audit.conflictFlags.length?r15.audit.conflictFlags.join(", "):"none detected"}`,
    `Source independence: ${r15.audit.sourceIndependence}`,
    `Witness caveats: ${witnessReport.caveats?.join(", ")||"none"}`,
    "",
    "INSTITUTIONAL CONTROL PLANE",
    `Safety state: ${safety.state}`,
    `Primary data: ${marketAudit.ok?"PASS":"FAIL"} · age ${marketAudit.ageMs==null?"n/a":Math.round(marketAudit.ageMs)+"ms"}`,
    `Witness audit: ${witnessAudit.ok?"PASS":"FAIL"} · external ${witnessAudit.externalWitnessCount}`,
    `Engine invariants: ${engineAudit.ok?"PASS":"FAIL"}`,
    `Audit ledger: ${auditLedger.healthy?"HEALTHY":"UNHEALTHY"} · seq ${auditLedger.seq}`,
    `Market Fabric: ${marketFabric.healthy?"HEALTHY":"UNHEALTHY"} · seq ${marketFabric.seq} · +${fabricWrite.appended?.length||0} events`,
    `Fabric tail: ${marketFabric.tailHash.slice(0,16)}…`,
    `Runtime release: ${runtimeManifest?.releaseId?runtimeManifest.releaseId.slice(0,16)+'…':'UNAVAILABLE'}`,
    `Release Registry: ${releaseRegistry.healthy?"HEALTHY":"UNHEALTHY"} · seq ${releaseRegistry.seq}`,
    `Envelope: ${envelope.envelopeHash.slice(0,16)}…`,
    `Audit record: ${auditRecord?"#"+auditRecord.seq:"NOT WRITTEN"}`,
    `canResearch: ${safety.canResearch?"YES":"NO"} · canExecute: NO`,
    ...(safety.hardReasons.length?[`HARD: ${safety.hardReasons.join(", ")}`]:[]),
    ...(safety.softReasons.length?[`DEGRADED: ${safety.softReasons.join(", ")}`]:[]),
    "",
    "STATUS",
    "• Transition evidence: OBSERVATIONAL",
    "• Mechanism channel: HYPOTHESIS",
    "• Causal status: NOT_IDENTIFIED",
    "• Action: ABSTAIN / SHADOW_ONLY"
  ].join("\n");

  return tg("sendMessage",{chat_id:chatId,text:text.slice(0,4096),reply_markup:memoryKeyboard(symbol)});
}

function parseAction(data='') {
  const product=parseProductCallback(data);
  if(product.kind!=='UNKNOWN') return product;
  if (data === 'back') return { kind:'BACK' };
  if (data === 'favorites') return { kind:'FAVORITES' };
  if (data === 'searchhelp') return { kind:'SEARCH_HELP' };
  const p = String(data).split(':');
  if (p[0] === 'market' && p[1]) return { kind:'MARKET', symbol:p[1] };
  if (p[0] === 'refresh' && p[1]) return { kind:'REFRESH', symbol:p[1] };
  if (p[0] === 'tcx' && p[1]) return { kind:'TCX', symbol:p[1] };
  if (p[0] === 'fav' && p[1]) return { kind:'FAV', symbol:p[1] };
  if (p[0] === 'alerthelp' && p[1]) return { kind:'ALERT_HELP', symbol:p[1] };
  if (p[0] === 'tf' && p[1] && ['1m','5m','15m','1h'].includes(p[2])) return { kind:'TIMEFRAME', symbol:p[1], interval:p[2] };
  if (p[0] === 'chart' && p[1] && ['1m','5m','15m','1h','4h'].includes(p[2])) return { kind:'CHART', symbol:p[1], interval:p[2] };
  if (p[0] === 'structure' && p[1]) return { kind:'STRUCTURE', symbol:p[1] };
  if (p[0] === 'memory' && p[1]) return { kind:'MEMORY', symbol:p[1] };
  if (p[0] === 'engine' && p[1]) return { kind:'ENGINE', symbol:p[1] };
  if (p[0] === 'witness' && p[1]) return { kind:'WITNESS', symbol:p[1] };
  if (p[0] === 'live' && p[1] && (p[2] === 'on' || p[2] === 'off')) return { kind:'LIVE', symbol:p[1], enabled:p[2] === 'on' };
  return { kind:'UNKNOWN' };
}

async function handleCommand(msg) {
  const chatId = msg.chat.id;
  if (!permitted(chatId)) return true;
  const parts = msg.text.trim().split(/\s+/);
  const command = parts[0].split('@')[0].toLowerCase();

  if (command === '/start') {
    await showStart(chatId);
    return true;
  }

  if (command === '/help') {
    await tg('sendMessage',{ chat_id:chatId, text:helpText() });
    return true;
  }

  if (command === '/favorites') {
    await showFavorites(chatId);
    return true;
  }

  if (command === '/coin') {
    const symbol = normalizeSymbol(parts[1] || '');
    if (!symbol) {
      await tg('sendMessage',{ chat_id:chatId, text:'Beispiel: /coin BTC' });
      return true;
    }
    try {
      await showMarket(chatId,null,symbol,false);
    } catch {
      await tg('sendMessage',{ chat_id:chatId, text:`Kein Binance-USDT-Markt für ${parts[1] || symbol} gefunden.` });
    }
    return true;
  }

  if (command === "/chart") {
    const symbol = normalizeSymbol(parts[1] || "");
    const interval = ["1m","5m","15m","1h","4h"].includes(parts[2]) ? parts[2] : "5m";
    if (!symbol) {
      await tg("sendMessage",{ chat_id:chatId, text:"Beispiel: /chart BTC 5m" });
      return true;
    }
    try { await showChart(chatId,symbol,interval); }
    catch (err) {
      console.error("chart command error",err instanceof Error ? err.message : String(err));
      await tg("sendMessage",{ chat_id:chatId, text:"Chart-Daten gerade nicht verfügbar." });
    }
    return true;
  }

  if (command === "/structure") {
    const symbol = normalizeSymbol(parts[1] || "");
    if (!symbol) {
      await tg("sendMessage",{ chat_id:chatId, text:"Beispiel: /structure BTC" });
      return true;
    }
    try { await showStructure(chatId,symbol); }
    catch (err) {
      console.error("structure command error",err instanceof Error ? err.message : String(err));
      await tg("sendMessage",{ chat_id:chatId, text:"Struktur-Daten gerade nicht verfügbar." });
    }
    return true;
  }


  if (command === "/obs") {
    try { await showObservability(chatId); }
    catch(err){
      recordError(observability,{scope:'command.obs',message:err instanceof Error?err.message:String(err)});
      await tg("sendMessage",{chat_id:chatId,text:"Observability gerade nicht verfügbar."});
    }
    return true;
  }

  if (command === "/chaos") {
    try { await showChaos(chatId,parts[1]||null); }
    catch(err){
      recordError(observability,{scope:'command.chaos',message:err instanceof Error?err.message:String(err)});
      await tg("sendMessage",{chat_id:chatId,text:"Chaos Harness gerade nicht verfügbar."});
    }
    return true;
  }
  if (command === "/oms") {
    try { await showOms(chatId); }
    catch(err){
      recordError(observability,{scope:'command.oms',message:err instanceof Error?err.message:String(err)});
      await tg("sendMessage",{chat_id:chatId,text:"Shadow OMS gerade nicht verfügbar."});
    }
    return true;
  }

  if (command === "/shadoworders") {
    const symbol=parts[1]?normalizeSymbol(parts[1]):null;
    if(parts[1] && !symbol){
      await tg("sendMessage",{chat_id:chatId,text:"Beispiel: /shadoworders BTC"});
      return true;
    }
    await showShadowOrders(chatId,symbol);
    return true;
  }

  if (command === "/shadowcancel") {
    const ref=String(parts[1]||"").trim();
    if(!ref){
      await tg("sendMessage",{chat_id:chatId,text:"Beispiel: /shadowcancel sh_..."});
      return true;
    }
    const matches=shadowOrders.filter(o=>o.id===ref || (ref.length>=8 && o.id.startsWith(ref)));
    if(matches.length!==1){
      await tg("sendMessage",{chat_id:chatId,text:matches.length?"Order-ID nicht eindeutig.":"Shadow-Order nicht gefunden."});
      return true;
    }
    const idx=shadowOrders.findIndex(o=>o.id===matches[0].id);
    const before=shadowOrders[idx];
    const after=cancelShadowOrder(before,{at:Date.now()});
    if(after.status===before.status){
      await tg("sendMessage",{chat_id:chatId,text:`Order ${before.id} ist nicht mehr aktiv (${before.status}).`});
      return true;
    }
    shadowOrders[idx]=after;
    await persistShadowOms("cancelled");
    if(auditLedger.healthy) await appendInstitutionalAudit("TCX_SHADOW_ORDER_EVENT",shadowAuditPayload("CANCELLED",after));
    await showPlacedShadowOrder(chatId,after);
    return true;
  }

  if (command === "/shadow") {
    const symbol=normalizeSymbol(parts[1]||"");
    const side=String(parts[2]||"").toUpperCase();
    const notional=Number(String(parts[3]||"").replace(",","."));
    const type=String(parts[4]||"").toUpperCase();
    const limitPrice=type==="LIMIT"?Number(String(parts[5]||"").replace(",",".")):null;
    const latencyRaw=type==="LIMIT"?parts[6]:parts[5];
    const latencyMs=latencyRaw==null?shadowDefaultLatencyMs:Number(latencyRaw);
    const valid=symbol && ["BUY","SELL"].includes(side) && ["MARKET","LIMIT"].includes(type) && Number.isFinite(notional) && notional>0 && notional<=1_000_000_000 && Number.isFinite(latencyMs) && latencyMs>=0 && latencyMs<=5000 && (type!=="LIMIT" || (Number.isFinite(limitPrice)&&limitPrice>0));
    if(!valid){
      await tg("sendMessage",{chat_id:chatId,text:["Syntax:","/shadow BTC BUY 100 MARKET [latencyMs]","/shadow BTC BUY 100 LIMIT 65000 [latencyMs]","","Das erzeugt ausschließlich eine virtuelle Shadow-Order."].join("\n")});
      return true;
    }
    if(!shadowOmsHealthy){
      await tg("sendMessage",{chat_id:chatId,text:`Shadow OMS ist fail-closed deaktiviert: ${shadowOmsLastError||"state unhealthy"}`.slice(0,4096)});
      return true;
    }
    try {
      const order=await placeShadowOrder({symbol,side,type,notionalQuote:notional,limitPrice,latencyMs});
      await showPlacedShadowOrder(chatId,order);
    } catch(err){
      const msg=err instanceof Error?err.message:String(err);
      recordError(observability,{scope:'command.shadow',message:msg});
      recordOperation(observability,{name:"shadow_oms.place",ok:false,latencyMs:0,error:msg});
      await tg("sendMessage",{chat_id:chatId,text:`Shadow-Order konnte nicht simuliert werden: ${msg}`.slice(0,4096)});
    }
    return true;
  }
  if (command === "/release") {
    try { await showRelease(chatId); }
    catch(err){
      console.error("release command error",err instanceof Error?err.message:String(err));
      await tg("sendMessage",{chat_id:chatId,text:"Release Registry gerade nicht verfügbar."});
    }
    return true;
  }

  if (command === "/fabric") {
    try { await showFabric(chatId); }
    catch(err){
      console.error("fabric command error",err instanceof Error?err.message:String(err));
      await tg("sendMessage",{chat_id:chatId,text:"Market Data Fabric gerade nicht verfügbar."});
    }
    return true;
  }

  if (command === "/replay") {
    const symbol=normalizeSymbol(parts[1]||"");
    const asOf=parseReplayTime(parts.slice(2).join(" "));
    if(!symbol || asOf==null){
      await tg("sendMessage",{chat_id:chatId,text:"Beispiel: /replay BTC 2026-09-27T14:30:00Z"});
      return true;
    }
    try { await showReplay(chatId,symbol,asOf); }
    catch(err){
      console.error("replay command error",err instanceof Error?err.message:String(err));
      await tg("sendMessage",{chat_id:chatId,text:"PIT-Replay gerade nicht verfügbar."});
    }
    return true;
  }

  if (command === "/audit") {
    try { await showAudit(chatId); }
    catch(err){
      console.error("audit command error",err instanceof Error?err.message:String(err));
      await tg("sendMessage",{chat_id:chatId,text:"Institutional Kernel Audit gerade nicht verfügbar."});
    }
    return true;
  }

  if (command === "/witness") {
    const symbol=normalizeSymbol(parts[1]||"");
    if(!symbol){
      await tg("sendMessage",{chat_id:chatId,text:"Beispiel: /witness BTC"});
      return true;
    }
    try { await showWitness(chatId,symbol); }
    catch(err){
      console.error("witness command error",err instanceof Error?err.message:String(err));
      await tg("sendMessage",{chat_id:chatId,text:"Independent Witness Network gerade nicht verfügbar."});
    }
    return true;
  }

  if (command === "/engine") {
    const symbol=normalizeSymbol(parts[1]||"");
    if(!symbol){
      await tg("sendMessage",{chat_id:chatId,text:"Beispiel: /engine BTC"});
      return true;
    }
    try { await showEngine(chatId,symbol); }
    catch(err){
      console.error("engine command error",err instanceof Error?err.message:String(err));
      await tg("sendMessage",{chat_id:chatId,text:"MTL Engine gerade nicht verfügbar."});
    }
    return true;
  }

  if (command === "/memory") {
    const symbol=normalizeSymbol(parts[1]||"");
    if(!symbol){
      await tg("sendMessage",{chat_id:chatId,text:"Beispiel: /memory BTC"});
      return true;
    }
    try { await showMemory(chatId,symbol); }
    catch(err){
      console.error("memory command error",err instanceof Error?err.message:String(err));
      await tg("sendMessage",{chat_id:chatId,text:"Episode Memory gerade nicht verfügbar."});
    }
    return true;
  }

  if (command === '/alert') {
    const symbol = normalizeSymbol(parts[1] || '');
    const target = Number(String(parts[2] || '').replace(',','.'));
    if (!symbol || !Number.isFinite(target) || target <= 0) {
      await tg('sendMessage',{ chat_id:chatId, text:'Beispiel: /alert BTC 70000' });
      return true;
    }
    try {
      const s = await snapshot(symbol);
      const direction = target >= s.price ? 'ABOVE' : 'BELOW';
      const list = alertList(chatId);
      if (list.length >= 20) {
        await tg('sendMessage',{ chat_id:chatId, text:'Maximal 20 aktive Alarme pro Chat.' });
        return true;
      }
      list.push({ symbol, target, direction, createdAt:Date.now() });
      const persisted = await persistState('alert-added');
      await tg('sendMessage',{
        chat_id:chatId,
        text:[
          `🔔 Alarm gesetzt: ${symbolLabel(symbol)}/USDT`,
          `Ziel: ${fmt(target,target<1?6:2)} USDT`,
          `Aktuell: ${fmt(s.price,s.price<1?6:2)} USDT`,
          `Richtung: ${direction === 'ABOVE' ? 'erreicht/übersteigt Ziel' : 'erreicht/unterschreitet Ziel'}`,'',
          persisted ? '💾 Persistent gespeichert.' : '⚠️ Nur temporär gespeichert – State-Volume prüfen.'
        ].join('\n')
      });
    } catch {
      await tg('sendMessage',{ chat_id:chatId, text:'Coin oder Live-Daten nicht verfügbar.' });
    }
    return true;
  }

  if (command === '/alerts') {
    const list = alertList(chatId);
    const text = list.length
      ? ['🔔 Aktive Alarme','',...list.map((a,i) => `${i+1}. ${symbolLabel(a.symbol)} ${a.direction === 'ABOVE' ? '≥' : '≤'} ${fmt(a.target,a.target<1?6:2)} USDT`)].join('\n')
      : '🔔 Keine aktiven Alarme.';
    await tg('sendMessage',{ chat_id:chatId, text });
    return true;
  }

  if (command === '/clearalerts') {
    alerts.set(String(chatId),[]);
    const persisted = await persistState('alerts-cleared');
    await tg('sendMessage',{
      chat_id:chatId,
      text:persisted ? '🔕 Alle Preisalarme gelöscht.' : '🔕 Alarme gelöscht, aber State-Volume ist nicht schreibbar.'
    });
    return true;
  }

  return false;
}

async function handle(update) {
  const msg = update?.message;
  if (msg?.chat?.id !== undefined && typeof msg.text === 'string' && msg.text.trim().startsWith('/')) {
    if (await handleCommand(msg)) return;
  }

  const q = update?.callback_query;
  if (!q?.id || q?.message?.chat?.id === undefined || q?.message?.message_id === undefined) return;
  const chatId = q.message.chat.id;
  const messageId = q.message.message_id;

  if (!permitted(chatId)) {
    await ack(q.id,'Nicht freigegeben');
    return;
  }

  const a = parseAction(q.data);
  try {
    if (a.kind === 'HOME') {
      await showStart(chatId,messageId);
      await ack(q.id);
      return;
    }
    if (a.kind === 'HOME_SECTION') {
      await showHomeSection(chatId,messageId,a.section);
      await ack(q.id);
      return;
    }
    if (a.kind === 'WHY') {
      if(!symbolOk(a.symbol)) { await ack(q.id,'Unbekannter Markt'); return; }
      await showWhy(chatId,messageId,a.symbol);
      await ack(q.id,'Evidence geladen');
      return;
    }
    if (a.kind === 'REGIME') {
      if(!symbolOk(a.symbol)) { await ack(q.id,'Unbekannter Markt'); return; }
      await showRegime(chatId,messageId,a.symbol);
      await ack(q.id,'Regime geladen');
      return;
    }
    if (a.kind === 'BACK') {
      await showStart(chatId,messageId);
      await ack(q.id);
      return;
    }
    if (a.kind === 'FAVORITES') {
      await showFavorites(chatId,messageId);
      await ack(q.id);
      return;
    }
    if (a.kind === 'SEARCH_HELP') {
      await ack(q.id,'Schreibe z. B. /coin BTC');
      return;
    }
    if (a.kind === 'UNKNOWN' || (a.symbol && !symbolOk(a.symbol))) {
      await ack(q.id,'Unbekannte Aktion');
      return;
    }
    if (a.kind === 'MARKET' || a.kind === 'REFRESH') {
      await showMarket(chatId,messageId,a.symbol,sessions.get(String(chatId))?.live === true);
      await ack(q.id);
      return;
    }
    if (a.kind === 'LIVE') {
      await showMarket(chatId,messageId,a.symbol,a.enabled);
      await ack(q.id,a.enabled?'Live aktiviert':'Live deaktiviert');
      return;
    }
    if (a.kind === 'TCX') {
      await showTcx(chatId,messageId,a.symbol);
      await ack(q.id);
      return;
    }
    if (a.kind === 'TIMEFRAME') {
      await showTimeframe(chatId,messageId,a.symbol,a.interval);
      await ack(q.id);
      return;
    }
    if (a.kind === "CHART") {
      await showChart(chatId,a.symbol,a.interval);
      await ack(q.id,`Chart ${a.interval}`);
      return;
    }
    if (a.kind === "STRUCTURE") {
      await showStructure(chatId,a.symbol);
      await ack(q.id,"Struktur geladen");
      return;
    }


    if (a.kind === "WITNESS") {
      await showWitness(chatId,a.symbol);
      await ack(q.id,"Witness Audit geladen");
      return;
    }

    if (a.kind === "ENGINE") {
      await showEngine(chatId,a.symbol);
      await ack(q.id,"MTL Engine geladen");
      return;
    }

    if (a.kind === "MEMORY") {
      await showMemory(chatId,a.symbol);
      await ack(q.id,"Episode Memory geladen");
      return;
    }

    if (a.kind === 'FAV') {
      const set = favoriteSet(chatId);
      if (set.has(a.symbol)) set.delete(a.symbol); else set.add(a.symbol);
      const persisted = await persistState('favorite-toggled');
      await showMarket(chatId,messageId,a.symbol,sessions.get(String(chatId))?.live === true);
      await ack(
        q.id,
        persisted
          ? (set.has(a.symbol)?'Favorit gespeichert':'Favorit entfernt')
          : 'Favorit nur temporär – State-Volume prüfen'
      );
      return;
    }
    if (a.kind === 'ALERT_HELP') {
      await ack(q.id,`Nutze /alert ${symbolLabel(a.symbol)} PREIS`);
      return;
    }
  } catch (err) {
    console.error('callback error', err instanceof Error ? err.message : String(err));
    await ack(q.id,'Live-Daten gerade nicht verfügbar');
  }
}

async function poll() {
  while (running) {
    try {
      const updates = await tg('getUpdates',{
        offset,
        timeout:25,
        allowed_updates:['message','callback_query']
      }) || [];
      for (const u of updates) {
        offset = Math.max(offset,Number(u.update_id)+1);
        await handle(u);
      }
    } catch (err) {
      console.error('poll error', err instanceof Error ? err.message : String(err));
      await sleep(1500);
    }
  }
}

async function refresher() {
  while (running) {
    await sleep(1000);
    const now = Date.now();
    for (const [key,s] of [...sessions]) {
      if (!s.live || now - s.lastRefresh < refreshMs) continue;
      try {
        if (s.view === 'TCX') await showTcx(s.chatId,s.messageId,s.symbol);
        else if (s.view === 'TIMEFRAME') await showTimeframe(s.chatId,s.messageId,s.symbol,s.interval || '5m');
        else await showMarket(s.chatId,s.messageId,s.symbol,true);
      } catch (err) {
        console.error('refresh error', err instanceof Error ? err.message : String(err));
        const cur = sessions.get(key);
        if (cur) cur.lastRefresh = now;
      }
    }
  }
}

async function alertWatcher() {
  while (running) {
    await sleep(alertCheckMs);
    const grouped = new Map();
    for (const [chatKey,list] of alerts) {
      for (const alert of list) {
        if (!grouped.has(alert.symbol)) grouped.set(alert.symbol,[]);
        grouped.get(alert.symbol).push({ chatKey, alert });
      }
    }

    for (const [symbol,items] of grouped) {
      let s;
      try { s = await snapshot(symbol); }
      catch (err) {
        console.error('alert snapshot error',symbol,err instanceof Error ? err.message : String(err));
        continue;
      }

      for (const { chatKey, alert } of items) {
        const hit = alert.direction === 'ABOVE' ? s.price >= alert.target : s.price <= alert.target;
        if (!hit) continue;

        let delivered = false;
        try {
          await tg('sendMessage',{
            chat_id:chatKey,
            text:[
              `🔔 PREISALARM · ${symbolLabel(symbol)}/USDT`,
              `Ziel: ${fmt(alert.target,alert.target<1?6:2)} USDT`,
              `Aktuell: ${fmt(s.price,s.price<1?6:2)} USDT`,'',
              'TCX Execution: SHADOW_ONLY'
            ].join('\n')
          });
          delivered = true;
        } catch (err) {
          console.error('alert send error',err instanceof Error ? err.message : String(err));
        }

        if (delivered) {
          const current = alertList(chatKey);
          alerts.set(chatKey,current.filter(x => x !== alert));
          await persistState('alert-delivered');
        }
      }
    }
  }
}

async function episodeWatcher() {
  while(running) {
    let changed=false;
    for(const symbol of requestedSymbols) {
      if(!running) break;
      try {
        const state=await researchState(symbol,"5m");
        const before=episodes.length;
        await captureEpisodeFromState(state,{persist:false});
        if(episodes.length!==before) changed=true;
        if(matureSymbolEpisodes(symbol,state.byTf["5m"])) changed=true;
      } catch(err) {
        console.error("episode watcher error",symbol,err instanceof Error?err.message:String(err));
      }
      await sleep(250);
    }
    if(changed) await persistEpisodeMemory("sweep");
    await sleep(episodeSweepMs);
  }
}

const port = Number(process.env.PORT || 8080);
const server = http.createServer((req,res) => {
  if (req.url === '/health' || req.url === '/') {
    const activeAlerts = [...alerts.values()].reduce((n,x) => n+x.length,0);
    res.writeHead(200,{'content-type':'application/json'});
    res.end(JSON.stringify({
      ok:true,
      service:'TCX Telegram',
      execution:'SHADOW_ONLY',
      markets:markets.map(x => x.symbol),
      sessions:sessions.size,
      favorites:[...favorites.values()].reduce((n,x) => n+x.size,0),
      alerts:activeAlerts,
      institutionalKernel:{
        version:INSTITUTIONAL_KERNEL_VERSION,
        ledgerHealthy:auditLedger.healthy,
        ledgerSeq:auditLedger.seq,
        ledgerTailHash:auditLedger.tailHash,
        canExecute:false,
        execution:'SHADOW_ONLY'
      },
      releaseRegistry:{
        version:RELEASE_REGISTRY_VERSION,
        healthy:releaseRegistry.healthy,
        seq:releaseRegistry.seq,
        tailHash:releaseRegistry.tailHash,
        currentReleaseId:runtimeManifest?.releaseId||null,
        currentRegistered:Boolean(runtimeReleaseRecord),
        file:releaseRegistryFile
      },
      marketDataFabric:{
        version:MARKET_DATA_FABRIC_VERSION,
        healthy:marketFabric.healthy,
        seq:marketFabric.seq,
        tailHash:marketFabric.tailHash,
        events:marketFabric.events.length,
        file:marketFabricFile
      },
      deterministicReplay:{
        version:DETERMINISTIC_REPLAY_VERSION
      },
      observability:{
        version:OBSERVABILITY_VERSION,
        snapshot:observabilitySnapshot(observability),
        slo:deriveSloHealth(observabilitySnapshot(observability))
      },
      chaosEngineering:{
        version:CHAOS_ENGINEERING_VERSION,
        mode:'SYNTHETIC_SIDE_EFFECT_FREE'
      },
      witnessNetwork:{
        cacheEntries:witnessCache.size,
        providers:["BINANCE","OKX","KRAKEN"]
      },
      episodeMemory:{
        file:episodeFile,
        total:episodes.length,
        mature1h:episodes.filter(e=>e.outcomes?.["12"]).length,
        healthy:episodePersistenceHealthy,
        lastError:episodePersistenceLastError,
        recoveredFromCorrupt:loadedEpisodeMemory.recoveredFromCorrupt
      },
      persistence:{
        file:stateFile,
        healthy:persistenceHealthy,
        lastError:persistenceLastError,
        recoveredFromCorrupt:loadedState.recoveredFromCorrupt
      }
    }));
    return;
  }
  res.writeHead(404);
  res.end('not found');
});

server.listen(port,'0.0.0.0',() => console.log(`health server :${port}`));

let shuttingDown = false;
async function gracefulShutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  running = false;
  console.log('shutdown', signal);
  await persistState(`shutdown:${signal}`);
  await persistEpisodeMemory(`shutdown:${signal}`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0),5000).unref();
}
process.on('SIGINT',() => void gracefulShutdown('SIGINT'));
process.on('SIGTERM',() => void gracefulShutdown('SIGTERM'));

const me = await tg('getMe',{});
console.log(JSON.stringify({
  service:'TCX Telegram UI',
  botUsername:me?.username || 'UNKNOWN',
  markets:markets.map(x=>x.symbol),
  refreshMs,
  alertCheckMs,
  episodeSweepMs,
  institutionalKernel:INSTITUTIONAL_KERNEL_VERSION,
  auditLedger:{file:auditFile,healthy:auditLedger.healthy,seq:auditLedger.seq,tailHash:auditLedger.tailHash},
  releaseRegistry:{
    version:RELEASE_REGISTRY_VERSION,
    file:releaseRegistryFile,
    healthy:releaseRegistry.healthy,
    seq:releaseRegistry.seq,
    tailHash:releaseRegistry.tailHash,
    currentReleaseId:runtimeManifest?.releaseId||null,
    currentRegistrySeq:runtimeReleaseRecord?.seq??null
  },
  marketDataFabric:{
    version:MARKET_DATA_FABRIC_VERSION,
    file:marketFabricFile,
    healthy:marketFabric.healthy,
    seq:marketFabric.seq,
    tailHash:marketFabric.tailHash
  },
  deterministicReplay:DETERMINISTIC_REPLAY_VERSION,
  observability:OBSERVABILITY_VERSION,
  chaosEngineering:CHAOS_ENGINEERING_VERSION,
  execution:'SHADOW_ONLY',
  allowedChats:allowedChats.size || 'ALL',
  recommendedReplicas:1,
  marketDataHosts:binanceBases.map(x => new URL(x).host),
  witnessProviders:{
    okx:new URL(okxBase).host,
    kraken:new URL(krakenBase).host
  },
  persistence:{
    file:stateFile,
    healthy:persistenceHealthy,
    recoveredFromCorrupt:loadedState.recoveredFromCorrupt,
    loadedFavorites:[...favorites.values()].reduce((n,x) => n+x.size,0),
    loadedAlerts:[...alerts.values()].reduce((n,x) => n+x.length,0)
  },
  episodeMemory:{
    file:episodeFile,
    loaded:episodes.length,
    recoveredFromCorrupt:loadedEpisodeMemory.recoveredFromCorrupt
  }
},null,2));

await tg('deleteWebhook',{ drop_pending_updates:false });
await Promise.all([poll(),refresher(),alertWatcher(),episodeWatcher()]);
