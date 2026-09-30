import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BIGGJ_OFFICIAL_INTEL_PROVIDER_VERSION,
  OFFICIAL_INTEL_SOURCES,
  createBiggjOfficialIntelProvider,
  parseOfficialIntelFeed
} from './biggj-official-intel-provider.mjs';

const NOW=Date.parse('2026-09-30T10:00:00Z');

function response(xml,{ok=true,status=200}={}){
  return {ok,status,text:async()=>xml};
}
function rss(items){
  return '<?xml version="1.0"?><rss><channel>'+
    items.map(x=>'<item><title><![CDATA['+x.title+']]></title><link>'+x.url+'</link><guid>'+x.id+'</guid><pubDate>'+x.date+'</pubDate></item>').join('')+
    '</channel></rss>';
}

test('official source catalog contains direct central-bank regulatory and labor feeds',()=>{
  assert.deepEqual(OFFICIAL_INTEL_SOURCES.map(x=>x.id),[
    'FED_PRESS','SEC_PRESS','ECB_PRESS','CFTC_PRESS','BLS_EMPSIT','BLS_CPI','BLS_JOLTS'
  ]);
  assert.ok(OFFICIAL_INTEL_SOURCES.every(x=>/^https:\/\//.test(x.url)));
});

test('official feed parser preserves direct provenance without claiming independent verification',()=>{
  const source=OFFICIAL_INTEL_SOURCES.find(x=>x.id==='FED_PRESS');
  const rows=parseOfficialIntelFeed(rss([
    {id:'fed-1',title:'Federal Reserve issues FOMC statement on interest rates',url:'https://www.federalreserve.gov/newsevents/pressreleases/monetary20260930a.htm',date:'Wed, 30 Sep 2026 09:30:00 GMT'}
  ]),source,{now:NOW});
  assert.equal(rows.length,1);
  const x=rows[0];
  assert.equal(x.sourceId,'FED_PRESS');
  assert.equal(x.primarySource,true);
  assert.equal(x.publicationAuthenticity,'DIRECT_OFFICIAL_FEED');
  assert.equal(x.verified,false);
  assert.equal(x.independentConfirmation,0);
  assert.equal(x.family,'MACRO');
  assert.ok(x.affectedAssets.includes('RATES'));
  assert.equal(x.epistemic,'OFFICIAL_PRIMARY_SOURCE_PUBLICATION_NOT_INDEPENDENTLY_CORROBORATED');
});

test('official parser handles Atom links and rejects future publications',()=>{
  const source=OFFICIAL_INTEL_SOURCES.find(x=>x.id==='ECB_PRESS');
  const xml='<?xml version="1.0"?><feed>'+
    '<entry><title>ECB monetary policy update</title><link href="https://www.ecb.europa.eu/press/a.html"/><id>ecb-1</id><updated>2026-09-30T09:00:00Z</updated></entry>'+
    '<entry><title>Future ECB item</title><link href="https://www.ecb.europa.eu/press/future.html"/><id>ecb-2</id><updated>2026-10-01T09:00:00Z</updated></entry>'+
    '</feed>';
  const rows=parseOfficialIntelFeed(xml,source,{now:NOW});
  assert.equal(rows.length,1);
  assert.equal(rows[0].url,'https://www.ecb.europa.eu/press/a.html');
  assert.equal(rows[0].sourceId,'ECB_PRESS');
});

test('one failed official feed does not block healthy primary sources',async()=>{
  const sources=[
    {id:'FED_PRESS',authority:'Federal Reserve Board',url:'https://fed.test/rss',country:'US',defaultFamily:'MACRO',defaultAssets:['USD','RATES']},
    {id:'SEC_PRESS',authority:'SEC',url:'https://sec.test/rss',country:'US',defaultFamily:'OTHER',defaultAssets:[]}
  ];
  const fetchImpl=async url=>{
    if(String(url).includes('fed.test')) return response(rss([
      {id:'fed-1',title:'Federal Reserve publishes monetary policy statement',url:'https://fed.test/a',date:'Wed, 30 Sep 2026 09:30:00 GMT'}
    ]));
    return response('',{ok:false,status:503});
  };
  const p=createBiggjOfficialIntelProvider({fetchImpl,sources,now:()=>NOW});
  const out=await p.fetchFeed();
  assert.equal(out.version,BIGGJ_OFFICIAL_INTEL_PROVIDER_VERSION);
  assert.equal(out.ok,true);
  assert.equal(out.articleCount,1);
  assert.equal(out.healthySourceCount,1);
  assert.equal(out.failedSourceCount,1);
  assert.equal(out.errors[0].sourceId,'SEC_PRESS');
  assert.equal(out.providerHealth.FED_PRESS.ok,true);
  assert.equal(out.providerHealth.SEC_PRESS.ok,false);
});
