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

test('provider retries a compact GDELT query after a primary timeout',async()=>{
  let calls=0;
  const fetchImpl=async url=>{
    calls++;
    const q=new URL(url).searchParams.get('query')||'';
    if(q.includes('crypto OR markets OR economy'))throw new Error('This operation was aborted');
    return jsonResponse({articles:[
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

test('GDELT 429 falls through to Google News RSS and starts cooldown',async()=>{
  let gdeltCalls=0;
  let rssCalls=0;
  const fetchImpl=async url=>{
    const u=new URL(url);
    if(u.hostname==='api.gdeltproject.org'){
      gdeltCalls++;
      return jsonResponse({}, {ok:false,status:429});
    }
    rssCalls++;
    return rssResponse(rss([
      {title:'Bitcoin market update - Example',url:'https://news.google.com/articles/crypto',pubDate:'Wed, 30 Sep 2026 09:55:00 GMT',source:'Example Crypto'},
      {title:'Ceasefire talks affect oil markets - Example',url:'https://news.google.com/articles/world',pubDate:'Wed, 30 Sep 2026 09:54:00 GMT',source:'Example World'}
    ]));
  };
  const p=createBiggjPublicNewsProvider({fetchImpl,now:()=>NOW,gdeltCooldownMs:600_000});
  const out=await p.fetchFeed();
  assert.equal(out.ok,true);
  assert.equal(out.fallbackUsed,true);
  assert.equal(gdeltCalls,2);
  assert.equal(rssCalls,2);
  assert.equal(out.errors.length,0);
  assert.ok(out.gdeltCooldownUntil>NOW);
  assert.ok(out.recoveries.some(x=>x.strategy==='SECONDARY_PROVIDER_FALLBACK'));
  assert.ok(out.events.every(x=>x.sourceId==='GOOGLE_NEWS_RSS'));
});

test('GDELT cooldown bypass prevents repeated rate-limit requests',async()=>{
  let gdeltCalls=0;
  let rssCalls=0;
  const fetchImpl=async url=>{
    const u=new URL(url);
    if(u.hostname==='api.gdeltproject.org'){
      gdeltCalls++;
      return jsonResponse({}, {ok:false,status:429});
    }
    rssCalls++;
    return rssResponse(rss([
      {title:'Oil and inflation update - Example',url:'https://news.google.com/articles/oil',pubDate:'Wed, 30 Sep 2026 09:50:00 GMT',source:'Example'}
    ]));
  };
  const p=createBiggjPublicNewsProvider({fetchImpl,now:()=>NOW,gdeltCooldownMs:600_000});
  await p.fetchFeed({force:true});
  const firstGdelt=gdeltCalls;
  const out=await p.fetchFeed({force:true});
  assert.equal(gdeltCalls,firstGdelt);
  assert.ok(rssCalls>=4);
  assert.ok(out.recoveries.some(x=>x.strategy==='GDELT_COOLDOWN_BYPASS'));
});

test('future-dated RSS articles are rejected by the secondary provider',async()=>{
  const fetchImpl=async url=>{
    const u=new URL(url);
    if(u.hostname==='api.gdeltproject.org')return jsonResponse({}, {ok:false,status:429});
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

test('provider degrades partially when one class exhausts all sources',async()=>{
  const fetchImpl=async url=>{
    const u=new URL(url);
    const q=u.searchParams.get('query')||u.searchParams.get('q')||'';
    if(q.toLowerCase().includes('bitcoin'))throw new Error('GENERAL_SOURCE_DOWN');
    if(u.hostname==='news.google.com')throw new Error('UNEXPECTED_SECONDARY');
    return jsonResponse({articles:[
      {title:'Tariff negotiations affect global trade',url:'https://world.example/tariff',seendate:'20260930T095000Z'}
    ]});
  };
  const p=createBiggjPublicNewsProvider({fetchImpl,now:()=>NOW});
  const out=await p.fetchFeed();
  assert.equal(out.ok,true);
  assert.equal(out.errors.length,1);
  assert.ok(out.events.some(x=>x.url==='https://world.example/tariff'));
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


test('official primary events are merged first and keep provenance over duplicate discovery headlines',async()=>{
  const officialEvent={
    id:'official_fed_press:x',
    title:'Federal Reserve issues FOMC statement',
    headline:'Federal Reserve issues FOMC statement',
    url:'https://www.federalreserve.gov/newsevents/pressreleases/fomc-test.htm',
    source:'Federal Reserve Board',
    sourceId:'FED_PRESS',
    availableAt:NOW-60_000,
    timestamp:NOW-60_000,
    family:'MACRO',
    eventFamily:'MACRO',
    status:'HIGH_IMPACT',
    verified:false,
    independentConfirmation:0,
    primarySource:true,
    publicationAuthenticity:'DIRECT_OFFICIAL_FEED',
    affectedAssets:['USD','RATES'],
    worldRelevant:true,
    epistemic:'OFFICIAL_PRIMARY_SOURCE_PUBLICATION_NOT_INDEPENDENTLY_CORROBORATED'
  };
  const officialProvider={
    fetchFeed:async()=>({
      articleCount:1,
      sourceCount:7,
      healthySourceCount:7,
      failedSourceCount:0,
      events:[officialEvent],
      errors:[],
      providerHealth:{FED_PRESS:{ok:true,rows:1}}
    })
  };
  const fetchImpl=async url=>{
    const u=new URL(url);
    if(u.hostname==='api.gdeltproject.org') return jsonResponse({articles:[
      {title:'Federal Reserve issues FOMC statement',url:'https://aggregator.example/duplicate',domain:'aggregator.example',seendate:'20260930T095900Z'},
      {title:'Bitcoin market update',url:'https://crypto.example/a',domain:'crypto.example',seendate:'20260930T095800Z'}
    ]});
    throw new Error('unexpected '+url);
  };
  const p=createBiggjPublicNewsProvider({fetchImpl,officialProvider,now:()=>NOW});
  const out=await p.fetchFeed();
  assert.equal(out.ok,true);
  assert.ok(out.source.includes('Official primary feeds'));
  assert.equal(out.providerHealth.official.healthySourceCount,7);
  const fed=out.events.find(x=>x.title==='Federal Reserve issues FOMC statement');
  assert.equal(fed.sourceId,'FED_PRESS');
  assert.equal(fed.primarySource,true);
  assert.equal(fed.verified,false);
  assert.equal(fed.independentConfirmation,0);
  assert.equal(out.events.some(x=>x.url==='https://aggregator.example/duplicate'),false);
});
