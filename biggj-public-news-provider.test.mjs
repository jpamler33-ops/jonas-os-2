import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BIGGJ_PUBLIC_NEWS_PROVIDER_VERSION,
  createBiggjPublicNewsProvider
} from './biggj-public-news-provider.mjs';

const NOW=Date.parse('2026-09-30T10:00:00Z');

function jsonResponse(body,{ok=true,status=200}={}){
  return {ok,status,json:async()=>body,text:async()=>JSON.stringify(body)};
}
function rssResponse(xml,{ok=true,status=200}={}){
  return {ok,status,text:async()=>xml,json:async()=>({})};
}
function rss(items){
  return '<?xml version="1.0"?><rss><channel>'+
    items.map(x=>'<item><title><![CDATA['+x.title+']]></title><link>'+x.url+'</link><pubDate>'+x.pubDate+'</pubDate><source>'+x.source+'</source></item>').join('')+
    '</channel></rss>';
}

test('public news provider normalizes live general + world events without claiming verification',async()=>{
  let calls=0;
  const fetchImpl=async url=>{
    calls++;
    const u=new URL(url);
    const q=u.searchParams.get('query')||'';
    if(q.includes('war OR ceasefire')){
      return jsonResponse({articles:[
        {title:'Ceasefire talks shift oil risk premium',url:'https://world.example/a',domain:'world.example',seendate:'20260930T095500Z'},
        {title:'ECB inflation outlook changes',url:'https://macro.example/b',domain:'macro.example',seendate:'20260930T095000Z'}
      ]});
    }
    return jsonResponse({articles:[
      {title:'Bitcoin ETF flows rise as crypto markets move',url:'https://crypto.example/a',domain:'crypto.example',seendate:'20260930T094500Z'},
      {title:'Nvidia AI chip demand expands',url:'https://tech.example/a',domain:'tech.example',seendate:'20260930T094000Z'}
    ]});
  };
  const p=createBiggjPublicNewsProvider({fetchImpl,now:()=>NOW,cacheTtlMs:60_000});
  const out=await p.fetchFeed();
  assert.equal(out.version,BIGGJ_PUBLIC_NEWS_PROVIDER_VERSION);
  assert.equal(out.ok,true);
  assert.equal(calls,2);
  assert.equal(out.fallbackUsed,false);
  assert.ok(out.events.some(x=>x.family==='CRYPTO'));
  assert.ok(out.events.some(x=>x.family==='TECHNOLOGY'));
  assert.ok(out.world.some(x=>x.family==='GEOPOLITICS'||x.family==='MACRO'||x.family==='COMMODITIES'));
  assert.ok(out.events.every(x=>x.verified===false));
  assert.ok(out.events.every(x=>x.epistemic==='PUBLIC_NEWS_HEADLINE_NOT_INDEPENDENTLY_VERIFIED'));
  assert.ok(out.events.every(x=>x.availableAt<=NOW));
});

test('future-dated GDELT articles are rejected to preserve point-in-time semantics',async()=>{
  const fetchImpl=async()=>jsonResponse({articles:[
    {title:'Future headline',url:'https://future.example/a',seendate:'20261001T120000Z'},
    {title:'Observed headline',url:'https://now.example/a',seendate:'20260930T095500Z'}
  ]});
  const p=createBiggjPublicNewsProvider({fetchImpl,now:()=>NOW});
  const out=await p.fetchFeed();
  assert.equal(out.events.some(x=>x.title==='Future headline'),false);
  assert.equal(out.events.some(x=>x.title==='Observed headline'),true);
});

test('provider falls back to Google News RSS when GDELT times out',async()=>{
  let gdeltCalls=0;
  let rssCalls=0;
  const fetchImpl=async url=>{
    const u=new URL(url);
    if(u.hostname==='api.gdeltproject.org'){
      gdeltCalls++;
      throw new Error('GDELT_TIMEOUT');
    }
    rssCalls++;
    return rssResponse(rss([
      {title:'Bitcoin market update - Example',url:'https://news.google.com/articles/crypto',pubDate:'Wed, 30 Sep 2026 09:55:00 GMT',source:'Example Crypto'},
      {title:'Ceasefire talks affect oil markets - Example',url:'https://news.google.com/articles/world',pubDate:'Wed, 30 Sep 2026 09:54:00 GMT',source:'Example World'}
    ]));
  };
  const p=createBiggjPublicNewsProvider({fetchImpl,now:()=>NOW});
  const out=await p.fetchFeed();
  assert.equal(out.ok,true);
  assert.equal(out.fallbackUsed,true);
  assert.equal(gdeltCalls,2);
  assert.equal(rssCalls,2);
  assert.equal(out.errors.length,0);
  assert.equal(out.warnings.length,2);
  assert.ok(out.events.every(x=>x.sourceId==='GOOGLE_NEWS_RSS'));
  assert.ok(out.events.some(x=>x.family==='CRYPTO'));
  assert.ok(out.world.some(x=>x.family==='GEOPOLITICS'||x.family==='COMMODITIES'));
});

test('future-dated RSS articles are rejected by fallback too',async()=>{
  const fetchImpl=async url=>{
    const u=new URL(url);
    if(u.hostname==='api.gdeltproject.org')throw new Error('PRIMARY_DOWN');
    return rssResponse(rss([
      {title:'Future RSS headline',url:'https://news.google.com/articles/future',pubDate:'Thu, 01 Oct 2026 12:00:00 GMT',source:'Example'},
      {title:'Observed RSS headline about oil',url:'https://news.google.com/articles/now',pubDate:'Wed, 30 Sep 2026 09:50:00 GMT',source:'Example'}
    ]));
  };
  const p=createBiggjPublicNewsProvider({fetchImpl,now:()=>NOW});
  const out=await p.fetchFeed();
  assert.equal(out.events.some(x=>x.title.includes('Future RSS headline')),false);
  assert.equal(out.events.some(x=>x.title.includes('Observed RSS headline')),true);
  assert.ok(out.events.every(x=>x.availableAt<=NOW));
});

test('provider reports class errors only when both primary and fallback fail',async()=>{
  const fetchImpl=async url=>{
    const u=new URL(url);
    if(u.hostname==='api.gdeltproject.org')throw new Error('PRIMARY_DOWN');
    throw new Error('FALLBACK_DOWN');
  };
  const p=createBiggjPublicNewsProvider({fetchImpl,now:()=>NOW});
  const out=await p.fetchFeed();
  assert.equal(out.ok,false);
  assert.equal(out.events.length,0);
  assert.equal(out.errors.length,2);
  assert.equal(out.warnings.length,2);
});

test('provider caches the normalized feed inside its TTL',async()=>{
  let calls=0;
  const fetchImpl=async()=>{
    calls++;
    return jsonResponse({articles:[
      {title:'Bitcoin market update',url:'https://crypto.example/cache',seendate:'20260930T095000Z'}
    ]});
  };
  const p=createBiggjPublicNewsProvider({fetchImpl,now:()=>NOW,cacheTtlMs:120_000});
  const a=await p.fetchFeed();
  const b=await p.fetchFeed();
  assert.equal(calls,2);
  assert.strictEqual(a,b);
});
