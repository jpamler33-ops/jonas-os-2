import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source=readFileSync(new URL('./discord-telegram-bridge.mjs',import.meta.url),'utf8');

test('BIGGJ Discord V4 is release-bound and interactive',()=>{
  assert.ok(source.includes('BIGGJ_DISCORD_COMMAND_CENTER_V4'));
  assert.ok(source.includes('dc3:market-select'));
  assert.ok(source.includes('dc4:thesis:'));
  assert.ok(source.includes('commandCenterComponents'));
  assert.ok(source.includes('marketActionComponents'));
});

test('BIGGJ V4 keeps execution safety explicit',()=>{
  assert.ok(source.includes('SHADOW_ONLY'));
  assert.ok(source.includes('REAL ORDERS BLOCKED'));
  assert.ok(source.includes('keine echten Orders'));
});

test('BIGGJ V4 contains visual thesis and lifecycle surfaces',()=>{
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
