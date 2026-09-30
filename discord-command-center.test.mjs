import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source=readFileSync(new URL('./discord-telegram-bridge.mjs',import.meta.url),'utf8');

test('BIGGJ Discord V5 is release-bound and interactive',()=>{
  assert.ok(source.includes('BIGGJ_DISCORD_COMMAND_CENTER_V5'));
  assert.ok(source.includes('dc3:market-select'));
  assert.ok(source.includes('dc4:thesis:'));
  assert.ok(source.includes('commandCenterComponents'));
  assert.ok(source.includes('marketActionComponents'));
});

test('BIGGJ V5 keeps execution safety explicit',()=>{
  assert.ok(source.includes('SHADOW_ONLY'));
  assert.ok(source.includes('REAL ORDERS BLOCKED'));
  assert.ok(source.includes('keine echten Orders'));
});

test('BIGGJ V5 contains visual thesis and lifecycle surfaces',()=>{
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


test('BIGGJ V5 exposes governed operator observability navigation',()=>{
  for(const required of [
    'BIGGJ_DISCORD_OBSERVABILITY_LAYOUT',
    'buildBiggjDiscordObservabilityPanelMap',
    'buildBiggjDiscordObservabilityPayload',
    'refreshBiggjObservabilityPanels',
    'brain-pulse',
    'research-queue',
    'hypotheses',
    'changes',
    'experiments',
    'skill-tree',
    'evidence-ledger',
    'decision-trace',
    "name:'brain'",
    "name:'research'",
    "name:'skills'",
    "name:'progress'",
    "name:'decisions'",
    'dc6:brain:'
  ]) assert.ok(source.includes(required),required);
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
