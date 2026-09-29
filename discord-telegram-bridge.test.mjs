import test from 'node:test';
import assert from 'node:assert/strict';

import {
  discordComponents,
  decodeDiscordCallbackCustomId,
  encodeDiscordCallbackCustomId
} from './discord-component-ids.mjs';
import { createSerialDedupeQueue } from './discord-telegram-bridge.mjs';

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
