import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const bot=await fs.readFile(new URL('./bot.mjs',import.meta.url),'utf8');
const discord=await fs.readFile(new URL('./discord-telegram-bridge.mjs',import.meta.url),'utf8');
const registry=await fs.readFile(new URL('./runtime-release-registry.mjs',import.meta.url),'utf8');

test('rulebook is a startup-validated runtime dependency, not documentation only',()=>{
  for(const required of [
    "from './biggj-rulebook.mjs'",
    'verifyBiggjRulebook()',
    'BIGGJ_RULEBOOK_INVALID',
    'currentBiggjRulebookAssessment',
    'evaluateBiggjRuntimeRulebook',
    'health.biggjRulebook',
    "req.url === '/rulebook.md'",
    "req.url === '/rulebook.json'"
  ]) assert.ok(bot.includes(required),required);
});

test('shadow order admission is constitution-gated and auditable',()=>{
  const start=bot.indexOf('async function placeShadowOrder(');
  assert.ok(start>=0);
  const block=bot.slice(start,start+5000);
  assert.match(block,/assertBiggjRulebookAdmission/);
  assert.match(block,/SHADOW_ORDER_ADMISSION/);
  assert.match(block,/order\.rulebook=/);
  assert.match(block,/admissionFingerprint/);
});

test('HARD rulebook violations can make operational readiness fail closed',()=>{
  const start=bot.indexOf('function currentOperationalReadiness()');
  assert.ok(start>=0);
  const block=bot.slice(start,start+5000);
  assert.match(block,/rulebook\.state!=='BLOCKED'/);
  assert.match(block,/RULEBOOK_/);
  assert.match(block,/httpStatus:503/);
  assert.match(block,/ready:false/);
});

test('Discord exposes and manages the rulebook as a first-class channel',()=>{
  for(const required of [
    "name:'rulebook'",
    "{name:'rulebook',topic:",
    "'channel-supervisor','channel-improvements','rulebook'",
    "rulebook:'BIGGJ_RULEBOOK_PANEL_V1'",
    'buildRulebookPayload',
    'refreshRulebookPanel',
    "if(name==='rulebook')",
    'addTimer(refreshRulebookPanel,60000)',
    "name==='rulebook'"
  ]) assert.ok(discord.includes(required),required);
});

test('rulebook is release-bound; Docker packaging is verified by the CI smoke build',()=>{
  assert.match(registry,/'biggj-rulebook\.mjs'/);
});
