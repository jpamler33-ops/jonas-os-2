import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL('./'+path,import.meta.url),'utf8');

test('critical BIGGJ runtime files contain no live-execution escape hatch',async()=>{
  const files=[
    'bot.mjs',
    'biggj-autonomous-operator.mjs',
    'biggj-governance-triage.mjs',
    'biggj-trading-policy.mjs',
    'autonomous-shadow-trader.mjs',
    'event-shadow-trade-gate.mjs',
    'shadow-training-supervisor.mjs',
    'institutional-admission.mjs'
  ];
  for(const path of files){
    const source=await read(path);
    assert.doesNotMatch(source,/canExecuteLive\s*:\s*true\b/,path+' enables canExecuteLive');
    assert.doesNotMatch(source,/canExecute\s*:\s*true\b/,path+' enables canExecute');
    assert.doesNotMatch(source,/execution\s*:\s*['"]LIVE['"]/,path+' enables LIVE execution');
  }
});

test('shadow order admission is bound to the canonical BIGGJ rulebook',async()=>{
  const source=await read('bot.mjs');
  const start=source.indexOf('async function placeShadowOrder');
  const end=source.indexOf('async function maybePlaceAutonomousShadowTrade',start);
  assert.ok(start>=0&&end>start);
  const block=source.slice(start,end);
  assert.match(block,/assertBiggjRulebookAdmission/);
  assert.match(block,/operation:'SHADOW_ORDER_ADMISSION'/);
  assert.match(block,/order\.rulebook=/);
  assert.match(block,/canExecuteLive:false/);
});

test('rulebook is a release-bound runtime component and production surface',async()=>{
  const [registry,pkg,bridge,bot,rulebook]=await Promise.all([
    read('runtime-release-registry.mjs'),
    read('package.json'),
    read('discord-telegram-bridge.mjs'),
    read('bot.mjs'),
    read('biggj-rulebook.mjs')
  ]);
  assert.match(registry,/'biggj-rulebook\.mjs'/);
  assert.match(pkg,/test:rulebook/);
  assert.match(bridge,/name:'rulebook'/);
  assert.match(bridge,/BIGGJ_RULEBOOK_PANEL_V1/);
  assert.match(bridge,/refreshRulebookPanel/);
  assert.match(bot,/\/rulebook\.json/);
  assert.match(bot,/\/rulebook\.md/);
  assert.match(rulebook,/BIGGJ_INTERNAL_RULEBOOK_V1/);
});

test('rulebook definition is fail-fast verified before serving',async()=>{
  const source=await read('bot.mjs');
  assert.match(source,/const biggjRulebookVerification=verifyBiggjRulebook\(\)/);
  assert.match(source,/BIGGJ_RULEBOOK_INVALID/);
  assert.match(source,/currentOperationalReadiness\(\)[\s\S]*RULEBOOK_/);
});
