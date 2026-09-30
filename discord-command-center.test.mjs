import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source=readFileSync(new URL('./discord-telegram-bridge.mjs',import.meta.url),'utf8');
const observabilitySource=readFileSync(new URL('./biggj-discord-observability.mjs',import.meta.url),'utf8');
const experienceSource=readFileSync(new URL('./biggj-experience-center.mjs',import.meta.url),'utf8');

test('BIGGJ Discord V6 is release-bound and interactive',()=>{
  assert.ok(source.includes('BIGGJ_DISCORD_COMMAND_CENTER_V6'));
  assert.ok(source.includes('dc3:market-select'));
  assert.ok(source.includes('dc4:thesis:'));
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


test('BIGGJ Trading Academy is provisioned with curriculum and practice routing',()=>{
  for(const required of [
    'BIGGJ • TRADING ACADEMY',
    'academy-start',
    'academy-roadmap',
    'academy-lessons',
    'academy-chart-training',
    'academy-challenges',
    'academy-glossary',
    'academy-progress',
    'academy-questions',
    'academyLessonPayload',
    'academyLessonComponents',
    'ensureAcademy',
    'dc5:lesson:',
    "name:'academy'",
    "name:'lesson'"
  ]) assert.ok(source.includes(required),required);
  assert.ok(source.includes('PAPER / SHADOW ONLY'));
  assert.ok(source.includes('keine echten Orders'));
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
  assert.ok(source.includes("BIGGJ_DISCORD_COMMAND_CENTER_V6"));
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


test('BIGGJ V6.1 exposes one-tap user commands',()=>{
  for(const required of [
    "name:'signal'",
    "name:'proof'",
    "signalModeOption",
    "LIQUIDITY",
    "MACRO",
    "name:'charts'",
    "name:'news'",
    "name:'world'",
    "name:'memecoins'",
    "name:'app'",
    "liveSurfaceCallbacks",
    "charts:'chart-desk'",
    "app:'mobile-app'",
    'BIGGJ_DISCORD_CHANNEL_UX_V10'
  ]) assert.ok(source.includes(required),required);
});

test('BIGGJ V8 channel managers cover every Discord surface and supervise themselves',()=>{
  for(const required of [
    'BIGGJ_DISCORD_CHANNEL_UX_V10',
    'BIGGJ • OPERATIONS',
    'channel-supervisor',
    'channel-improvements',
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


test('BIGGJ V7 exposes the canonical rulebook as a managed Discord surface',()=>{
  for(const required of [
    "name:'rulebook'",
    "category:'BIGGJ • OPERATIONS'",
    "{name:'rulebook',topic:",
    "rulebook:'BIGGJ_RULEBOOK_PANEL_V1'",
    'buildRulebookPayload',
    'refreshRulebookPanel',
    "if(name==='rulebook')",
    "addTimer(refreshRulebookPanel,60000)"
  ]) assert.ok(source.includes(required),required);
});

test('BIGGJ trade cards expose primary lane and virtual size explicitly',()=>{
  for(const required of ['tradeLaneLabel','virtualTradeSize','VIRTUAL SIZE','Nur abgeschlossene PRIMARY Shadow-Trades']) assert.ok(source.includes(required),required);
});

test('BIGGJ Discord exposes isolated NORMAL and LAB wallet economics',()=>{
  for(const required of ['DUAL WALLET PERFORMANCE','NORMAL PnL','LAB PnL','LAB Recovery Debt','∞ VIRTUAL','LAB bleibt getrennt']) assert.ok(source.includes(required),required);
});
