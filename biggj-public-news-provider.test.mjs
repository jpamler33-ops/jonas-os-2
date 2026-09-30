
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BIGGJ_PUBLIC_NEWS_PROVIDER_VERSION,
  createBiggjPublicNewsProvider
} from './biggj-public-news-provider.mjs';

const NOW=Date.parse('2026-09-30T10:00:00Z');

function response(body,{ok=true,status=200}={}){
  return {ok,status,json:async()=>body};
}

test('public news provider normalizes live general + world events without claiming verification',async()=>{
  let calls=0;
  const fetchImpl=async url=>{
    calls++;
    const u=new URL(url);
    const q=u.searchParams.get('query')||'';
    if(q.includes('war OR ceasefire')){
      return response({articles:[
        {title:'Ceasefire talks shift oil risk premium',url:'https://world.example/a',domain:'world.example',seendate:'20260930T095500Z'},
        {title:'ECB inflation outlook changes',url:'https://macro.example/b',domain:'macro.example',seendate:'20260930T095000Z'}
      ]});
    }
    return response({articles:[
      {title:'Bitcoin ETF flows rise as crypto markets move',url:'https://crypto.example/a',domain:'crypto.example',seendate:'20260930T094500Z'},
      {title:'Nvidia AI chip demand expands',url:'https://tech.example/a',domain:'tech.example',seendate:'20260930T094000Z'}
    ]});
  };
  const p=createBiggjPublicNewsProvider({fetchImpl,now:()=>NOW,cacheTtlMs:60_000});
  const out=await p.fetchFeed();
  assert.equal(out.version,BIGGJ_PUBLIC_NEWS_PROVIDER_VERSION);
  assert.equal(out.ok,true);
  assert.equal(calls,2);
  assert.ok(out.events.some(x=>x.family==='CRYPTO'));
  assert.ok(out.events.some(x=>x.family==='TECHNOLOGY'));
  assert.ok(out.world.some(x=>x.family==='GEOPOLITICS'||x.family==='MACRO'||x.family==='COMMODITIES'));
  assert.ok(out.events.every(x=>x.verified===false));
  assert.ok(out.events.every(x=>x.epistemic==='PUBLIC_NEWS_HEADLINE_NOT_INDEPENDENTLY_VERIFIED'));
  assert.ok(out.events.every(x=>x.availableAt<=NOW));
});

test('future-dated articles are rejected to preserve point-in-time semantics',async()=>{
  const fetchImpl=async()=>response({articles:[
    {title:'Future headline',url:'https://future.example/a',seendate:'20261001T120000Z'},
    {title:'Observed headline',url:'https://now.example/a',seendate:'20260930T095500Z'}
  ]});
  const p=createBiggjPublicNewsProvider({fetchImpl,now:()=>NOW});
  const out=await p.fetchFeed();
  assert.equal(out.events.some(x=>x.title==='Future headline'),false);
  assert.equal(out.events.some(x=>x.title==='Observed headline'),true);
});

test('provider degrades partially when one discovery query and its retry fail',async()=>{
  const fetchImpl=async url=>{
    const q=new URL(url).searchParams.get('query')||'';
    if(q.includes('bitcoin'))throw new Error('SOURCE_DOWN');
    return response({articles:[
      {title:'Tariff negotiations affect global trade',url:'https://world.example/tariff',seendate:'20260930T095000Z'}
    ]});
  };
  const p=createBiggjPublicNewsProvider({fetchImpl,now:()=>NOW});
  const out=await p.fetchFeed();
  assert.equal(out.ok,true);
  assert.equal(out.errors.length,1);
  assert.equal(out.events.length,1);
});

test('provider retries a compact query after a primary timeout without surfacing a hard error',async()=>{
  let calls=0;
  const fetchImpl=async url=>{
    calls++;
    const q=new URL(url).searchParams.get('query')||'';
    if(q.includes('crypto OR markets OR economy'))throw new Error('This operation was aborted');
    return response({articles:[
      {title:'Bitcoin market update after inflation data',url:'https://crypto.example/recovered',seendate:'20260930T095000Z'}
    ]});
  };
  const p=createBiggjPublicNewsProvider({fetchImpl,now:()=>NOW});
  const out=await p.fetchFeed();
  assert.equal(out.ok,true);
  assert.equal(out.errors.length,0);
  assert.ok(out.recoveries.some(x=>x.queryClass==='GENERAL'&&x.strategy==='COMPACT_QUERY_RETRY'));
  assert.ok(out.events.some(x=>x.url==='https://crypto.example/recovered'));
  assert.ok(calls>=3);
});

test('provider caches the normalized feed inside its TTL',async()=>{
  let calls=0;
  const fetchImpl=async()=>{
    calls++;
    return response({articles:[
      {title:'Bitcoin market update',url:'https://crypto.example/cache',seendate:'20260930T095000Z'}
    ]});
  };
  const p=createBiggjPublicNewsProvider({fetchImpl,now:()=>NOW,cacheTtlMs:120_000});
  const a=await p.fetchFeed();
  const b=await p.fetchFeed();
  assert.equal(calls,2);
  assert.strictEqual(a,b);
});
