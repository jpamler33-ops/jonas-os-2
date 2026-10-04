import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source=readFileSync(new URL('./discord-telegram-bridge.mjs',import.meta.url),'utf8');
const observabilitySource=readFileSync(new URL('./biggj-discord-observability.mjs',import.meta.url),'utf8');
const experienceSource=readFileSync(new URL('./biggj-experience-center.mjs',import.meta.url),'utf8');
const scienceSource=readFileSync(new URL('./biggj-discord-market-science.mjs',import.meta.url),'utf8');

test('BIGGJ Discord V13 is user-first while deep intelligence remains callable',()=>{
  assert.ok(source.includes('BIGGJ_DISCORD_MARKET_SCIENCE_V7'));
  assert.ok(source.includes('BIGGJ_DISCORD_CHANNEL_UX_V13_FOCUSED'));
  assert.ok(source.includes('buildDiscordMemecoinResearchPayload'));
  assert.ok(source.includes('BIGGJ_MEMECOIN_CONTRARIAN_OVERVIEW_V1'));
  assert.ok(source.includes("abgeschlossen **'+String(contra?.samples??0)+'**"));
  assert.ok(source.includes("if(name==='memecoins'){await memecoinResearchCommand(interaction);return;}"));
  assert.ok(source.includes("category:'BIGGJ • HOME'"));
  assert.ok(source.includes("category:'BIGGJ • INTELLIGENCE'"));
  assert.ok(source.includes("category:'BIGGJ • TRADING'"));
  for(const name of ['start-here','progress','market-overview','news-feed','memecoins','longterm-investing','trader-watch','academy','trade-cockpit','live-trades','closed-trades']){
    assert.ok(source.includes("{name:'"+name+"'"),name);
  }
  assert.ok(source.includes("name:'science'"));
  assert.ok(source.includes("name:'worldmodel'"));
  assert.ok(source.includes("name:'lab'"));
  assert.ok(source.includes("name:'research'"));
  assert.ok(source.includes('commandCenterComponents'));
  assert.ok(source.includes('marketActionComponents'));
});
test('BIGGJ V6 keeps execution safety explicit',()=>{
  assert.ok(source.includes('SHADOW_ONLY'));
  assert.ok(source.includes('REAL ORDERS BLOCKED'));
  assert.ok(source.includes('keine echten Orders'));
});

test('BIGGJ V6 contains visual thesis and lifecycle surfaces',()=>{
  for(const required of [
    'buildDiscordPerformancePayload',
    'buildDiscordMarketOverviewPayload',
    'buildDiscordDataHealthPayload',
    'closed-trades',
    'theses',
    'syncHealthAlerts',
    'syncThesisDashboard',
    'ensureTradeThreadVisual',
    'LIVE TRADE VISUAL',
    'FINAL TRADE REPLAY',
    'recentClosed',
    'isStringSelectMenu'
  ]) assert.ok(source.includes(required),required);
});


test('BIGGJ V6 exposes governed operator observability navigation',()=>{
  for(const required of [
    'BIGGJ_DISCORD_OBSERVABILITY_LAYOUT',
    'buildBiggjDiscordObservabilityPanelMap',
    'buildBiggjDiscordObservabilityPayload',
    'refreshBiggjObservabilityPanels',
    "name:'brain'",
    "name:'research'",
    "name:'skills'",
    "name:'reviews'",
    "name:'timeline'",
    "name:'progress'",
    "name:'decisions'",
    'dc6:brain:'
  ]) assert.ok(source.includes(required),required);
  for(const required of [
    'brain-pulse',
    'knowledge',
    'research-queue',
    'hypotheses',
    'changes',
    'experiments',
    'skill-tree',
    'review-queue',
    'learning-timeline',
    'progress',
    'evidence-ledger',
    'decision-trace'
  ]) assert.ok(observabilitySource.includes(required),required);
});


test('BIGGJ Trading Academy remains available on demand without permanent channel clutter',()=>{
  for(const required of [
    'academyLessonPayload',
    'academyLessonComponents',
    'ensureAcademy',
    'dc5:lesson:',
    "name:'academy'",
    "name:'lesson'"
  ]) assert.ok(source.includes(required),required);
  assert.ok(source.includes('PAPER / SHADOW ONLY'));
  assert.ok(source.includes('keine echten Orders'));
  const layout=source.slice(source.indexOf('const SERVER_LAYOUT=Object.freeze(['),source.indexOf('const BIGGJ_TECH_ARCHIVE_CATEGORY='));
  assert.ok(!layout.includes("category:'BIGGJ • TRADING ACADEMY'"));
  assert.ok(!layout.includes("{name:'academy-start'"));
});
test('BIGGJ V6 exposes the unified user experience surfaces',()=>{
  for(const required of [
    'BIGGJ_EXPERIENCE_LAYOUT',
    'biggj-needs',
    'learned-playbook',
    'news-feed',
    'world-watch',
    'trader-watch',
    'trade-cockpit',
    'chart-desk',
    'mobile-app',
    'refreshExperiencePanels',
    'refreshNewsFeed',
    'refreshWorldWatch',
    'refreshMemecoinLab',
    'upsertMarkedAtBottom'
  ]) assert.ok(source.includes(required)||experienceSource.includes(required),required);
  assert.ok(source.includes("BIGGJ_DISCORD_MARKET_SCIENCE_V7"));
  assert.ok(source.includes("science-home"));
  assert.ok(source.includes("world-model"));
  assert.ok(source.includes("science-lab"));
  assert.ok(source.includes("autopilot-supervisor"));
});


test('BIGGJ V6 news channels are append-only deduplicated event streams',()=>{
  for(const required of [
    'BIGGJ_NEWS_EVENT:',
    'syncNewsChannel',
    'newsEventKey',
    'newsEventPayload',
    'noch nicht unabhängig verifiziert',
    "syncNewsChannel('news-feed'",
    "syncNewsChannel('world-watch'"
  ]) assert.ok(source.includes(required),required);
});

test('BIGGJ V6 academy keeps the current panel at the bottom and lesson actions contextual',()=>{
  assert.ok(source.includes('upsertMarkedAtBottom'));
  assert.ok(source.includes('academyLessonComponents(topic)'));
  assert.ok(source.includes("const practical={"));
  assert.ok(source.includes("structure:["));
  assert.ok(source.includes("journal:["));
  assert.ok(source.includes("const actions=practical[String(topic||'').toLowerCase()]||null"));
});


test('BIGGJ V13 keeps one-tap commands and SuperCharts available on demand',()=>{
  for(const required of [
    "name:'signal'",
    "name:'proof'",
    "name:'charts'",
    "name:'news'",
    "name:'world'",
    "name:'memecoins'",
    "name:'app'",
    "liveSurfaceCallbacks",
    "charts:'chart-desk'",
    "app:'mobile-app'",
    'BIGGJ_DISCORD_CHANNEL_UX_V13_FOCUSED',
    'BTC SuperChart',
    'ETH SuperChart',
    'SOL SuperChart'
  ]) assert.ok(source.includes(required),required);
});
test('BIGGJ V13 manages only eleven curated visible surfaces and keeps deep supervisors on demand',()=>{
  const layoutBlock=source.slice(
    source.indexOf('const SERVER_LAYOUT=Object.freeze(['),
    source.indexOf('const BIGGJ_LEGACY_TECH_ARCHIVE_CATEGORY=')
  );
  const visible=[...layoutBlock.matchAll(/\{name:'([^']+)'/g)].map(m=>m[1]);
  assert.equal(visible.length,11);
  assert.equal(new Set(visible).size,visible.length);
  for(const required of ['progress','market-overview','memecoins','longterm-investing','trader-watch','academy','trade-cockpit'])assert.ok(visible.includes(required));
  for(const hidden of ['chart-desk','performance','mobile-app','alerts','channel-supervisor','channel-improvements','errors','rulebook','science-home','research-queue'])assert.ok(!visible.includes(hidden),hidden);
  for(const required of [
    'createBiggjChannelManagerRuntime',
    'refreshChannelSupervisor',
    'repairManagerProblem',
    "name:'supervisor'",
    "name:'improvements'",
    'buildSignalLabDeskPayload',
    'buildProofFeedDeskPayload',
    'buildForecastDeskPayload',
    'buildAnomalyWatchPayload',
    'buildReplayDeskPayload',
    'buildErrorDeskPayload'
  ]) assert.ok(source.includes(required)||scienceSource.includes(required),required);
});
test('BIGGJ exposes long-term future investment research without turning it into a buy signal',()=>{
  for(const required of [
    "name:'longterm-investing'",
    "name:'longterm'",
    'buildDiscordLongTermInvestingPayload',
    'BIGGJ_LONGTERM_INVESTING_V1',
    'FUTURE THEME WATCH',
    'INVESTMENT GATE',
    'THEME ≠ BUY',
    'NO BUY TIMING',
    'canExecuteLive:false'
  ]) assert.ok(source.includes(required),required);
});

test('BIGGJ V7 incoming news is German-first and strict on translation failure',()=>{
  for(const required of [
    'createGermanTranslationProvider',
    'TCX_DISCORD_STRICT_GERMAN_NEWS',
    'WELTLAGE //',
    'noch nicht unabhängig verifiziert',
    'Automatisch ins Deutsche übersetzt',
    'BIGGJ_GERMAN_NEWS'
  ]) assert.ok(source.includes(required),required);
});


test('BIGGJ V12 keeps rulebook available on demand but out of the permanent user dashboard',()=>{
  for(const required of [
    "name:'rulebook'",
    'buildRulebookPayload',
    'refreshRulebookPanel',
    "if(name==='rulebook')"
  ]) assert.ok(source.includes(required),required);
  const layout=source.slice(source.indexOf('const SERVER_LAYOUT=Object.freeze(['),source.indexOf('const BIGGJ_TECH_ARCHIVE_CATEGORY='));
  assert.ok(!layout.includes("{name:'rulebook'"));
});
test('BIGGJ trade cards expose primary lane and virtual size explicitly',()=>{
  for(const required of ['tradeLaneLabel','virtualTradeSize','VIRTUAL SIZE','Abgeschlossene PRIMARY Shadow-Trades']) assert.ok(source.includes(required),required);
});


test('Discord shows the central memecoin BUY gate and world-model operating mode',()=>{
  for(const required of [
    'Meme Entry Gate',
    'World Model',
    'W4 Entry-Regel: Nur 🟢 KAUFEN',
    'Entry Gate · aktuelle Kandidaten',
    'signalController',
    'memeSignal',
    'refreshMode',
    'BUY ',
    'READY ',
    'WATCH ',
    'BLOCKED '
  ]) assert.ok(source.includes(required),required);
  assert.ok(source.includes("W4 öffnet nur bei BUY"));
  assert.ok(source.includes("🟢 KAUFEN"));
  assert.ok(source.includes("⛔ BLOCKIERT"));
});
