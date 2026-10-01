import test from 'node:test';
import assert from 'node:assert/strict';

import {
  discordComponents,
  decodeDiscordCallbackCustomId,
  encodeDiscordCallbackCustomId
} from './discord-component-ids.mjs';
import { createSerialDedupeQueue, mapWithConcurrency, refreshDueFromTimestamps } from './discord-serial-dedupe-queue.mjs';

test('duplicate Telegram callbacks receive unique reversible Discord custom ids',()=>{
  const action='superchart:BTCUSDT:FULL:5m';
  const markup={inline_keyboard:[
    [
      {text:'CLEAN',callback_data:'superchart:BTCUSDT:CLEAN:5m'},
      {text:'PRO',callback_data:'superchart:BTCUSDT:PRO:5m'},
      {text:'● FULL',callback_data:action}
    ],
    [
      {text:'1M',callback_data:'superchart:BTCUSDT:FULL:1m'},
      {text:'● 5M',callback_data:action},
      {text:'15M',callback_data:'superchart:BTCUSDT:FULL:15m'}
    ],
    [
      {text:'↻ REFRESH',callback_data:action},
      {text:'AUTO',callback_data:'superlive:BTCUSDT:FULL:5m:on'}
    ]
  ]};

  const rows=discordComponents(markup);
  const ids=rows.flatMap(row=>row.components.map(x=>x.custom_id).filter(Boolean));
  assert.equal(new Set(ids).size,ids.length);
  assert.equal(ids.filter(id=>decodeDiscordCallbackCustomId(id)===action).length,3);
  assert.equal(ids.filter(id=>id===action).length,1);
  assert.ok(ids.every(id=>id.length<=100));
});

test('duplicate callback alias round-trips payloads',()=>{
  const raw='alertpreset:BTCUSDT:STRUCTURE';
  const id=encodeDiscordCallbackCustomId(raw,2);
  assert.ok(id.startsWith('tcxd1:2:'));
  assert.equal(decodeDiscordCallbackCustomId(id),raw);
});

test('ordinary Discord ids pass through unchanged',()=>{
  assert.equal(decodeDiscordCallbackCustomId('dc3:market:BTCUSDT'),'dc3:market:BTCUSDT');
});


test('serial dedupe queue bounds work and never runs duplicate keys concurrently',async()=>{
  const q=createSerialDedupeQueue({maxSize:2});
  const order=[];
  let release;
  const blocker=new Promise(resolve=>{release=resolve;});

  assert.equal(q.enqueue('a',async()=>{order.push('a:start');await blocker;order.push('a:end');}),true);
  assert.equal(q.enqueue('a',async()=>{}),false);
  assert.equal(q.enqueue('b',async()=>{order.push('b');}),true);
  assert.equal(q.enqueue('c',async()=>{}),false);

  const first=q.drainOne();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(q.snapshot().runningKey,'a');
  assert.equal(q.enqueue('a',async()=>{}),false);
  assert.equal((await q.drainOne()).reason,'BUSY');

  release();
  const firstResult=await first;
  assert.equal(firstResult.ok,true);
  assert.deepEqual(order,['a:start','a:end']);

  const secondResult=await q.drainOne();
  assert.equal(secondResult.ok,true);
  assert.deepEqual(order,['a:start','a:end','b']);
  assert.equal(q.snapshot().depth,0);
  assert.equal(q.snapshot().completed,2);
});


test('bounded async mapper preserves result order and concurrency cap',async()=>{
  let active=0,maxActive=0;
  const out=await mapWithConcurrency([1,2,3,4,5],2,async value=>{
    active++;maxActive=Math.max(maxActive,active);
    await new Promise(resolve=>setTimeout(resolve,5));
    active--;
    return value*10;
  });
  assert.deepEqual(out,[10,20,30,40,50]);
  assert.ok(maxActive<=2);
  assert.ok(maxActive>=2);
});


test('refresh freshness policy prefers latest known activity',()=>{
  assert.equal(refreshDueFromTimestamps({
    now:120000,intervalMs:60000,lastRefreshedAt:70000,messageEditedAt:50000,messageCreatedAt:1000
  }),false);
  assert.equal(refreshDueFromTimestamps({
    now:130001,intervalMs:60000,lastRefreshedAt:70000,messageEditedAt:50000,messageCreatedAt:1000
  }),true);
  assert.equal(refreshDueFromTimestamps({
    now:100000,intervalMs:60000,messageEditedAt:90000,messageCreatedAt:1000
  }),false);
  assert.equal(refreshDueFromTimestamps({
    now:100000,intervalMs:60000
  }),true);
});


test('refresh budgets are exposed in bridge source',async()=>{
  const fs=await import('node:fs/promises');
  const source=await fs.readFile(new URL('./discord-telegram-bridge.mjs',import.meta.url),'utf8');
  assert.match(source,/TCX_DISCORD_STARTER_REFRESH_BUDGET\|\|4/);
  assert.match(source,/TCX_DISCORD_THESIS_REFRESH_BUDGET\|\|2/);
  assert.match(source,/TCX_DISCORD_THREAD_THESIS_REFRESH_BUDGET\|\|4/);
  assert.match(source,/starterBudgetDeferred/);
  assert.match(source,/threadThesisBudgetDeferred/);
});


test('BIGGJ Discord V13 keeps exactly ten permanent user channels and deep tools on demand',async()=>{
  const fs=await import('node:fs/promises');
  const source=await fs.readFile(new URL('./discord-telegram-bridge.mjs',import.meta.url),'utf8');
  const science=await fs.readFile(new URL('./biggj-discord-market-science.mjs',import.meta.url),'utf8');
  assert.match(source,/BIGGJ_DISCORD_MARKET_SCIENCE_V7/);
  assert.match(source,/BIGGJ_DISCORD_CHANNEL_UX_V13_FOCUSED/);
  const layout=source.slice(source.indexOf('const SERVER_LAYOUT=Object.freeze(['),source.indexOf('const BIGGJ_LEGACY_TECH_ARCHIVE_CATEGORY='));
  assert.doesNotMatch(layout,/\.\.\.BIGGJ_DISCORD_MARKET_SCIENCE_LAYOUT/);
  assert.doesNotMatch(layout,/\.\.\.BIGGJ_DISCORD_OBSERVABILITY_LAYOUT/);
  assert.doesNotMatch(layout,/\.\.\.BIGGJ_EXPERIENCE_LAYOUT/);
  assert.match(layout,/BIGGJ • HOME/);
  assert.match(layout,/BIGGJ • INTELLIGENCE/);
  assert.match(layout,/BIGGJ • TRADING/);
  const names=[...layout.matchAll(/\{name:'([^']+)'/g)].map(m=>m[1]);
  assert.deepEqual(names,[
    'start-here','progress','market-overview','news-feed',
    'memecoins','trader-watch','academy',
    'trade-cockpit','live-trades','closed-trades'
  ]);
  assert.match(source,/name:'science'/);
  assert.match(source,/name:'worldmodel'/);
  assert.match(source,/name:'lab'/);
  assert.match(source,/name:'autopilot'/);
  assert.match(source,/name:'decision_intel'/);
  assert.match(source,/refreshMarketSciencePanels/);
  assert.match(source,/refreshBiggjObservabilityPanels/);
  assert.match(source,/refreshExperiencePanels/);
  assert.match(science,/Trading ist nur eine nachgelagerte Anwendung/);
  assert.match(science,/PnL kann keine Theorie promoten/);
});
test('deduplicated news event stream uses stable markers and separates world families',async()=>{
  const fs=await import('node:fs/promises');
  const source=await fs.readFile(new URL('./discord-telegram-bridge.mjs',import.meta.url),'utf8');
  assert.match(source,/BIGGJ_NEWS_EVENT:/);
  assert.match(source,/messages\.fetch\(\{limit:100\}\)/);
  assert.match(source,/GEOPOLITICS/);
  assert.match(source,/COMMODITIES/);
  assert.match(source,/DISCOVERY_ONLY/);
  assert.match(source,/noch nicht unabhängig verifiziert/);
  assert.match(source,/slice\(0,12\)/);
});

test('channel manager runtime supervises the focused dashboard and prunes obsolete managed Discord surfaces',async()=>{
  const fs=await import('node:fs/promises');
  const bridge=await fs.readFile(new URL('./discord-telegram-bridge.mjs',import.meta.url),'utf8');
  const a=bridge.indexOf('const SERVER_LAYOUT=Object.freeze([');
  const b=bridge.indexOf('const BIGGJ_LEGACY_TECH_ARCHIVE_CATEGORY=',a);
  assert.ok(a>=0&&b>a);
  const block=bridge.slice(a,b);
  const names=[...block.matchAll(/\{name:'([^']+)'/g)].map(m=>m[1]);
  assert.equal(names.length,10);
  assert.equal(new Set(names).size,names.length);
  for(const name of ['start-here','progress','market-overview','news-feed','memecoins','trader-watch','academy','trade-cockpit','live-trades','closed-trades'])assert.ok(names.includes(name),name);
  for(const removed of ['chart-desk','performance','mobile-app','alerts'])assert.ok(!names.includes(removed),removed);
  assert.match(bridge,/BIGGJ • ARCHIVE · TECH/);
  assert.match(bridge,/LEGACY_MANAGED_CHANNEL_NAMES/);
  assert.match(bridge,/channel\.delete\('BIGGJ Discord V13 prune obsolete managed Discord surface/);
  assert.match(bridge,/remove empty legacy category after managed-channel prune/);
  assert.match(bridge,/prunedLegacyChannels/);
  assert.match(bridge,/createBiggjChannelManagerRuntime/);
  assert.match(bridge,/channel-supervisor/);
  assert.match(bridge,/channel-improvements/);
});

test('single academy surface and home exception panel avoid sidebar and message duplication',async()=>{
  const fs=await import('node:fs/promises');
  const source=await fs.readFile(new URL('./discord-telegram-bridge.mjs',import.meta.url),'utf8');
  assert.match(source,/channelCache\.get\('academy'\)/);
  assert.match(source,/Academy Single-Surface bereit/);
  assert.match(source,/channelCache\.get\('start-here'\)/);
  assert.match(source,/upsertMarked\(c,'BIGGJ_AUTOPILOT_ALERT_V1'/);
  assert.match(source,/x===marker\|\|x\.startsWith\(String\(marker\)\+' · '\)/);
});
test('previously empty operational channels now have live builders',async()=>{
  const fs=await import('node:fs/promises');
  const source=await fs.readFile(new URL('./discord-telegram-bridge.mjs',import.meta.url),'utf8');
  for(const required of [
    'buildSignalLabDeskPayload',
    'buildProofFeedDeskPayload',
    'buildForecastDeskPayload',
    'buildAnomalyWatchPayload',
    'buildReplayDeskPayload',
    'buildErrorDeskPayload',
    'refreshAuxiliaryDesks',
    'channel-supervisor',
    'channel-improvements'
  ]) assert.ok(source.includes(required),required);
});


test('German news translation is bounded and concurrent so Discord startup cannot scan the full backlog serially',async()=>{
  const fs=await import('node:fs/promises');
  const source=await fs.readFile(new URL('./discord-telegram-bridge.mjs',import.meta.url),'utf8');
  assert.match(source,/TCX_DISCORD_NEWS_TRANSLATION_CONCURRENCY\|\|4/);
  assert.match(source,/TCX_DISCORD_NEWS_TRANSLATION_ATTEMPT_LIMIT\|\|18/);
  assert.match(source,/mapWithConcurrency\(candidates,newsTranslationConcurrency/);
  assert.match(source,/slice\(0,newsTranslationAttemptLimit\)/);
  assert.match(source,/mutations===0&&candidates\.length>0&&translationFailures>0&&strictGermanNews/);
});


test('legacy English news cards are progressively Germanized without sacrificing bounded startup work',async()=>{
  const fs=await import('node:fs/promises');
  const source=await fs.readFile(new URL('./discord-telegram-bridge.mjs',import.meta.url),'utf8');
  assert.match(source,/existingByKey/);
  assert.match(source,/migration:Boolean/);
  assert.match(source,/DE_V1/);
  assert.match(source,/Bestand germanisiert/);
  assert.match(source,/existing\.message\.edit\(payload\)/);
  assert.match(source,/mapWithConcurrency\(candidates,newsTranslationConcurrency/);
  assert.match(source,/slice\(0,newsTranslationAttemptLimit\)/);
});

test('channel operations expose manager domain director and meta supervision layers',async()=>{
  const fs=await import('node:fs/promises');
  const source=await fs.readFile(new URL('./discord-telegram-bridge.mjs',import.meta.url),'utf8');
  assert.match(source,/Domain-Supervisoren/);
  assert.match(source,/Operations-Director/);
  assert.match(source,/Meta-Supervisor/);
  assert.match(source,/Outcome-Supervisor/);
  assert.match(source,/biggjObservability\?\.outcomeSupervisor/);
  assert.match(source,/finalState\.operationsDirector/);
});


test('trade cards preserve research lane instead of rendering UNKNOWN setup',async()=>{
  const fs=await import('node:fs/promises');
  const source=await fs.readFile(new URL('./discord-telegram-bridge.mjs',import.meta.url),'utf8');
  assert.match(source,/function tradeContextLabel/);
  assert.match(source,/mode&&mode!==['"]UNKNOWN['"]&&mode!==['"]STANDARD['"]/);
  assert.match(source,/SETUP \/ LANE/);
  assert.match(source,/PRIMARY_UNCLASSIFIED/);
});
