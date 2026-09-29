import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeMarketSymbol,
  buildCommandMarketRows,
  isTelegramTextEditFallbackError,
  deliverTelegramTextCard
} from './telegram-ui-runtime.mjs';

test('command market rows always use symbol strings from market objects',()=>{
  const markets=[
    {symbol:'BTCUSDT',label:'BTC'},
    {symbol:'ETHUSDT',label:'ETH'}
  ];
  const rows=buildCommandMarketRows(markets,'forecast',{symbolLabel:s=>s.replace('USDT','')});
  assert.equal(rows[0][0].callback_data,'cmdrun:forecast:BTCUSDT');
  assert.equal(rows[0][1].callback_data,'cmdrun:forecast:ETHUSDT');
  assert.equal(rows[0][0].text,'BTC');
});

test('string market symbols remain supported',()=>{
  assert.equal(normalizeMarketSymbol('solusdt'),'SOLUSDT');
});

test('invalid market objects fail loudly instead of becoming object strings',()=>{
  assert.throws(()=>normalizeMarketSymbol({label:'BTC'}),/market symbol required/);
});

test('photo/chart message edit falls back to a new text message',async()=>{
  const calls=[];
  const tg=async(method,payload)=>{
    calls.push({method,payload});
    if(method==='editMessageText') throw new Error('Bad Request: there is no text in the message to edit');
    return {ok:true};
  };
  const result=await deliverTelegramTextCard(tg,123,55,{text:'Forecast'});
  assert.deepEqual(result,{ok:true});
  assert.equal(calls.length,2);
  assert.equal(calls[0].method,'editMessageText');
  assert.equal(calls[1].method,'sendMessage');
  assert.equal(calls[1].payload.chat_id,123);
  assert.equal(calls[1].payload.text,'Forecast');
});

test('normal text message edit stays in-place',async()=>{
  const calls=[];
  const tg=async(method,payload)=>{
    calls.push({method,payload});
    return {ok:true,method};
  };
  const result=await deliverTelegramTextCard(tg,123,55,{text:'Forecast'});
  assert.equal(result.method,'editMessageText');
  assert.equal(calls.length,1);
});

test('unrelated Telegram errors are not swallowed',async()=>{
  const tg=async()=>{throw new Error('Forbidden: bot was blocked by the user');};
  await assert.rejects(
    ()=>deliverTelegramTextCard(tg,123,55,{text:'Forecast'}),
    /bot was blocked/
  );
});

test('fallback matcher only catches edit incompatibility',()=>{
  assert.equal(isTelegramTextEditFallbackError(new Error('Bad Request: there is no text in the message to edit')),true);
  assert.equal(isTelegramTextEditFallbackError(new Error('Network timeout')),false);
});
