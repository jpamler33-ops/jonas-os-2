import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OFFICIAL_INTEL_SOURCES,
  createOfficialIntelProvider,
  parseOfficialIntelFeed
} from './official-intel-sources.mjs';

const NOW=Date.parse('2026-09-30T12:00:00Z');

function xml(items){
  return '<?xml version="1.0"?><rss><channel>'+items.map(x=>
    '<item><title><![CDATA['+x.title+']]></title><link>'+x.url+'</link><guid>'+x.id+'</guid><pubDate>'+x.pubDate+'</pubDate></item>'
  ).join('')+'</channel></rss>';
}
function response(body,status=200){return {ok:status>=200&&status<300,status,text:async()=>body};}

test('official catalog covers monetary, regulation, derivatives and labor primary sources',()=>{
  assert.deepEqual(OFFICIAL_INTEL_SOURCES.map(x=>x.id),[
    'FED_PRESS','SEC_PRESS','ECB_PRESS','CFTC_PRESS','BLS_EMPSIT','BLS_CPI','BLS_JOLTS'
  ]);
});

test('official feed uses observation time for PIT availability and rejects future publications',()=>{
  const source=OFFICIAL_INTEL_SOURCES.find(x=>x.id==='FED_PRESS');
  const rows=parseOfficialIntelFeed(xml([
    {id:'fed-1',title:'Federal Reserve announces rate decision',url:'https://www.federalreserve.gov/a',pubDate:'Wed, 30 Sep 2026 10:00:00 GMT'},
    {id:'fed-future',title:'Future release',url:'https://www.federalreserve.gov/future',pubDate:'Thu, 01 Oct 2026 10:00:00 GMT'}
  ]),source,{observedAt:NOW});
  assert.equal(rows.length,1);
  assert.equal(rows[0].publishedAt,Date.parse('2026-09-30T10:00:00Z'));
  assert.equal(rows[0].availableAt,NOW);
  assert.equal(rows[0].observedAt,NOW);
  assert.equal(rows[0].verifiedSource,true);
  assert.equal(rows[0].verified,false);
  assert.equal(rows[0].independentConfirmation,0);
  assert.equal(rows[0].sourceAuthority,'OFFICIAL_PRIMARY');
  assert.equal(rows[0].status,'HIGH_IMPACT');
});

test('official provider isolates one failed authority without losing healthy sources',async()=>{
  const sources=OFFICIAL_INTEL_SOURCES.slice(0,2);
  const fetchImpl=async url=>{
    if(String(url).includes('federalreserve.gov')) return response(xml([
      {id:'fed-1',title:'FOMC rate decision',url:'https://www.federalreserve.gov/a',pubDate:'Wed, 30 Sep 2026 10:00:00 GMT'}
    ]));
    return response('down',503);
  };
  const p=createOfficialIntelProvider({fetchImpl,sources,now:()=>NOW});
  const out=await p.fetchFeed();
  assert.equal(out.ok,true);
  assert.equal(out.events.length,1);
  assert.equal(out.errors.length,1);
  assert.equal(out.healthySourceCount,1);
  assert.equal(out.providerHealth.FED_PRESS.ok,true);
  assert.equal(out.providerHealth.SEC_PRESS.ok,false);
});

test('crypto regulation title is classified as CRYPTO while retaining primary-source semantics',()=>{
  const source=OFFICIAL_INTEL_SOURCES.find(x=>x.id==='SEC_PRESS');
  const rows=parseOfficialIntelFeed(xml([
    {id:'sec-1',title:'SEC proposes new regulation for crypto assets',url:'https://www.sec.gov/a',pubDate:'Wed, 30 Sep 2026 10:00:00 GMT'}
  ]),source,{observedAt:NOW});
  assert.equal(rows[0].family,'CRYPTO');
  assert.ok(rows[0].affectedAssets.includes('CRYPTO'));
  assert.equal(rows[0].sourceAuthority,'OFFICIAL_PRIMARY');
});
