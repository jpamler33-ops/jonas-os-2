import test from 'node:test';
import assert from 'node:assert/strict';

import {
  discordComponents,
  decodeDiscordCallbackCustomId,
  encodeDiscordCallbackCustomId
} from './discord-component-ids.mjs';

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
