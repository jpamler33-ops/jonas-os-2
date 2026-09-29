import test from 'node:test';import assert from 'node:assert/strict';import {createTelegramProductDispatcher} from './telegram-product-dispatcher.mjs';
test('deep dive renders without bot monolith dependency',async()=>{const d=createTelegramProductDispatcher();const r=await d('deep:BTCUSDT');assert.match(r.text,/DEEP DIVE/);assert.ok(r.reply_markup.inline_keyboard.flat().some(x=>x.callback_data==='flow:BTCUSDT'));});
test('delegates market route to injected handler',async()=>{const d=createTelegramProductDispatcher({renderMarket:(s)=>({symbol:s})});assert.deepEqual(await d('market:ETHUSDT'),{symbol:'ETHUSDT'});});
test('delegates risk without owning trading logic',async()=>{const d=createTelegramProductDispatcher({renderRisk:(s)=>({risk:s})});assert.deepEqual(await d('terminal:risk:BTCUSDT'),{risk:'BTCUSDT'});});
test('unknown specialist callbacks fall through safely',async()=>{const d=createTelegramProductDispatcher();assert.equal(await d('liqmap:BTCUSDT:5m'),null);});
