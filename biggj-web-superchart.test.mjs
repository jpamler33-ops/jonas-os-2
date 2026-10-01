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
