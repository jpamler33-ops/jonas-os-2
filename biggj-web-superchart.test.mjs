import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source=await readFile(new URL('./bot.mjs',import.meta.url),'utf8');

test('web SuperChart reuses the institutional renderer without mutating episode memory',()=>{
  assert.match(source,/async function buildSuperchartAsset/);
  assert.match(source,/buildConfluenceMap/);
  assert.match(source,/buildStructureEventRadar/);
  assert.match(source,/buildForecastAccuracyView/);
  assert.match(source,/buildSuperchartIntel/);
  assert.match(source,/forecastIssuanceToChartOverlay/);
  assert.match(source,/tradeOverlayFromPosition/);
  assert.match(source,/renderCandlestickPng/);
  assert.match(source,/if\(capture\)await captureEpisodeFromState/);
  assert.match(source,/webSuperchartAsset\(symbol,\{mode='FULL',interval='5m'\}/);
  assert.match(source,/buildSuperchartAsset\(symbol,\{mode,interval,capture:false\}\)/);
});

test('web SuperChart is bounded, deduplicated and no-store',()=>{
  assert.match(source,/WEB_SUPERCHART_TTL_MS=20_000/);
  assert.match(source,/WEB_SUPERCHART_CACHE_LIMIT=24/);
  assert.match(source,/webSuperchartInflight/);
  assert.match(source,/\/superchart\.png/);
  assert.match(source,/'content-type':'image\/png'/);
  assert.match(source,/'cache-control':'no-store'/);
  assert.match(source,/INVALID_SUPERCHART_REQUEST/);
  assert.match(source,/SUPERCHART_UNAVAILABLE/);
});

test('web SuperChart cannot grant execution authority',()=>{
  assert.match(source,/'x-biggj-execution':'SHADOW_ONLY'/);
  assert.match(source,/execution:'SHADOW_ONLY',canExecute:false,canExecuteLive:false/);
  assert.match(source,/p\?\.execution==='SHADOW_ONLY'&&p\?\.canExecuteLive===false/);
});


test('mobile SuperChart CSP permits fetched object URLs on iOS',()=>{
  assert.match(source,/img-src 'self' data: blob:/);
});

test('market radar carries observed 24h market fields used by the mobile terminal',()=>{
  assert.match(source,/open:Number\(ctx\.market\?\.open\)/);
  assert.match(source,/high:Number\(ctx\.market\?\.high\)/);
  assert.match(source,/low:Number\(ctx\.market\?\.low\)/);
  assert.match(source,/quoteVolume:Number\(ctx\.market\?\.volumeQuote\)/);
  assert.match(source,/open:Number\(ticker\.openPrice\)/);
});


test('mobile live ticker endpoint returns bounded observed market data only',()=>{
  assert.match(source,/requestPath === '\/market-ticker\.json'/);
  assert.match(source,/INVALID_MARKET_TICKER_REQUEST/);
  assert.match(source,/MARKET_TICKER_UNAVAILABLE/);
  assert.match(source,/mobile_market_ticker/);
  assert.match(source,/change24hPct:Number\.isFinite\(Number\(market\.changePct\)\)/);
  assert.match(source,/quoteVolume:Number\.isFinite\(Number\(market\.volumeQuote\)\)/);
  assert.match(source,/source:market\.source\|\|'BINANCE_PUBLIC_REST'/);
  assert.match(source,/execution:'SHADOW_ONLY',[\s\S]*canExecuteLive:false/);
});

test('mission-control radar serialization keeps observed ticker fields for fallback rendering',()=>{
  assert.match(source,/price:Number\.isFinite\(Number\(r\.price\)\)\?Number\(r\.price\):null/);
  assert.match(source,/open:Number\.isFinite\(Number\(r\.open\)\)\?Number\(r\.open\):null/);
  assert.match(source,/quoteVolume:Number\.isFinite\(Number\(r\.quoteVolume\)\)\?Number\(r\.quoteVolume\):null/);
  assert.match(source,/change24hPct:Number\.isFinite\(Number\(r\.change24hPct\)\)\?Number\(r\.change24hPct\):null/);
});
