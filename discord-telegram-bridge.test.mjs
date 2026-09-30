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


test('BIGGJ Discord V6 operator and experience layers are wired into the bridge',async()=>{
  const fs=await import('node:fs/promises');
  const source=await fs.readFile(new URL('./discord-telegram-bridge.mjs',import.meta.url),'utf8');
  assert.match(source,/BIGGJ_DISCORD_COMMAND_CENTER_V6/);
  assert.match(source,/\.\.\.BIGGJ_DISCORD_OBSERVABILITY_LAYOUT/);
  assert.match(source,/\.\.\.BIGGJ_EXPERIENCE_LAYOUT/);
  assert.match(source,/name:'executive'/);
  assert.match(source,/name:'signal'/);
  assert.match(source,/name:'proof'/);
  assert.match(source,/signalModeOption/);
  assert.match(source,/BIGGJ_DISCORD_CHANNEL_UX_V10/);
  assert.match(source,/Evidence-Linse/);
  assert.match(source,/name:'brain'/);
  assert.match(source,/name:'timeline'/);
  assert.match(source,/name:'needs'/);
  assert.match(source,/name:'learned'/);
  assert.match(source,/name:'traders'/);
  assert.match(source,/name:'cockpit'/);
  assert.match(source,/name:'research'/);
  assert.match(source,/name:'skills'/);
  assert.match(source,/name:'progress'/);
  assert.match(source,/name:'changes'/);
  assert.match(source,/name:'decisions'/);
  assert.match(source,/refreshBiggjObservabilityPanels/);
  assert.match(source,/observabilityPanelDigests/);
  assert.match(source,/experiencePanelDigests/);
  assert.match(source,/refreshExperiencePanels/);
  assert.match(source,/upsertMarkedAtBottom/);
  assert.match(source,/dc6:brain:/);
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

test('channel manager supervisor is wired across all declared channels without runtime dependencies',async()=>{
  const fs=await import('node:fs/promises');
  const bridge=await fs.readFile(new URL('./discord-telegram-bridge.mjs',import.meta.url),'utf8');
  const experience=await fs.readFile(new URL('./biggj-experience-center.mjs',import.meta.url),'utf8');
  const observability=await fs.readFile(new URL('./biggj-discord-observability.mjs',import.meta.url),'utf8');

  const extractLayoutNames=(source,start,end)=>{
    const a=source.indexOf(start),b=source.indexOf(end,a+start.length);
    assert.ok(a>=0&&b>a,start);
    const block=source.slice(a,b);
    return [...block.matchAll(/\{name:'([^']+)'/g)].map(m=>m[1]);
  };

  const direct=extractLayoutNames(bridge,'const SERVER_LAYOUT=Object.freeze([','const CHANNEL_PROFILE_GROUPS=');
  const exp=extractLayoutNames(experience,'export const BIGGJ_EXPERIENCE_LAYOUT=Object.freeze([','export const BIGGJ_EXPERIENCE_MARKERS=');
  const obs=extractLayoutNames(observability,'export const BIGGJ_DISCORD_OBSERVABILITY_LAYOUT=Object.freeze([','export const BIGGJ_DISCORD_OBSERVABILITY_MARKERS=');
  const declared=[...direct,...exp,...obs];
  const unique=[...new Set(declared)];

  assert.equal(unique.length,declared.length);
  assert.ok(unique.length>=49);

  const profileBlock=bridge.slice(
    bridge.indexOf('const CHANNEL_PROFILE_GROUPS='),
    bridge.indexOf('const MARKET_PANELS=',bridge.indexOf('const CHANNEL_PROFILE_GROUPS='))
  );
  for(const name of unique)assert.ok(profileBlock.includes("'"+name+"'"),'missing manager profile: '+name);

  assert.match(bridge,/auditBiggjDiscordChannelLayout/);
  assert.match(bridge,/createBiggjChannelManagerRuntime/);
  assert.match(bridge,/channel-supervisor/);
  assert.match(bridge,/channel-improvements/);
  assert.match(bridge,/DEDUPED LIVE FEED/);
  assert.match(bridge,/eventDriven:true/);
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
