export const BIGGJ_OFFICIAL_INTEL_PROVIDER_VERSION='BIGGJ_OFFICIAL_INTEL_PROVIDER_V1';

export const OFFICIAL_INTEL_SOURCES=Object.freeze([
  Object.freeze({id:'FED_PRESS',authority:'Federal Reserve Board',url:'https://www.federalreserve.gov/feeds/press_all.xml',country:'US',defaultFamily:'MACRO',defaultAssets:Object.freeze(['USD','RATES'])}),
  Object.freeze({id:'SEC_PRESS',authority:'U.S. Securities and Exchange Commission',url:'https://www.sec.gov/news/pressreleases.rss',country:'US',defaultFamily:'OTHER',defaultAssets:Object.freeze([])}),
  Object.freeze({id:'ECB_PRESS',authority:'European Central Bank',url:'https://www.ecb.europa.eu/rss/press.html',country:'EU',defaultFamily:'MACRO',defaultAssets:Object.freeze(['EUR','RATES'])}),
  Object.freeze({id:'CFTC_PRESS',authority:'U.S. Commodity Futures Trading Commission',url:'https://www.cftc.gov/RSS/RSSGP/rssgp.xml',country:'US',defaultFamily:'OTHER',defaultAssets:Object.freeze([])}),
  Object.freeze({id:'BLS_EMPSIT',authority:'U.S. Bureau of Labor Statistics',url:'https://www.bls.gov/feed/empsit.rss',country:'US',defaultFamily:'MACRO',defaultAssets:Object.freeze(['USD','RATES'])}),
  Object.freeze({id:'BLS_CPI',authority:'U.S. Bureau of Labor Statistics',url:'https://www.bls.gov/feed/cpi.rss',country:'US',defaultFamily:'MACRO',defaultAssets:Object.freeze(['USD','RATES'])}),
  Object.freeze({id:'BLS_JOLTS',authority:'U.S. Bureau of Labor Statistics',url:'https://www.bls.gov/feed/jolts.rss',country:'US',defaultFamily:'MACRO',defaultAssets:Object.freeze(['USD','RATES'])})
]);

function text(v,max=800){
  const s=String(v??'').replace(/\s+/g,' ').trim();
  return s.length<=max?s:s.slice(0,max-1)+'…';
}
function lower(v){return String(v??'').toLowerCase();}
function uniq(xs){return [...new Set((Array.isArray(xs)?xs:[]).filter(Boolean).map(String))];}
function errText(err){return err instanceof Error?err.message:String(err);}
function decodeXml(value){
  return String(value??'')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi,'$1')
    .replace(/&amp;/gi,'&')
    .replace(/&quot;/gi,'"')
    .replace(/&#39;|&apos;/gi,"'")
    .replace(/&lt;/gi,'<')
    .replace(/&gt;/gi,'>')
    .replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n)||32))
    .trim();
}
function xmlTag(block,tag){
  const escaped=String(tag).replace(/[-/\\^$*+?.()|[\]{}]/g,'\\$&');
  const re=new RegExp('<'+escaped+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/'+escaped+'>','i');
  const m=re.exec(String(block||''));
  return m?text(decodeXml(m[1])):'';
}
function xmlLink(block){
  const direct=xmlTag(block,'link');
  if(direct&&!direct.startsWith('<')) return direct;
  const m=String(block||'').match(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*\/?\s*>/i);
  return m?text(decodeXml(m[1]),1000):direct;
}
function parseDate(value){
  const t=Date.parse(String(value||'').trim());
  return Number.isFinite(t)?t:null;
}
function familyFor(title,source){
  const x=lower(title);
  if(/bitcoin|ethereum|crypto|stablecoin|token|blockchain|digital asset|spot etf|crypto asset/.test(x)) return 'CRYPTO';
  if(/inflation|consumer price|employment|unemployment|payroll|job openings|labor market|interest rate|monetary policy|fomc|federal funds|central bank|treasury|gdp/.test(x)) return 'MACRO';
  if(/oil|gas|gold|copper|commodity|energy/.test(x)) return 'COMMODITIES';
  if(/merger|acquisition|bankruptcy|issuer|securities offering|market structure|broker|dealer|fund adviser|enforcement|fraud/.test(x)) return 'CORPORATE';
  return source?.defaultFamily||'OTHER';
}
function statusFor(title,family){
  const x=lower(title);
  if(/emergency|rate cut|rate hike|interest rate decision|fomc statement|consumer price index|employment situation|sanction|market disruption|trading halt/.test(x)) return 'HIGH_IMPACT';
  if(family==='MACRO'||/crypto|digital asset|enforcement|rule|regulation|proposal|jobs|inflation/.test(x)) return 'DEVELOPING';
  return 'WATCH';
}
function assetsFor(title,family,source){
  const x=lower(title);
  const assets=[...(source?.defaultAssets||[])];
  if(/bitcoin|btc/.test(x)) assets.push('BTC');
  if(/ethereum|ether|eth/.test(x)) assets.push('ETH');
  if(/solana|\bsol\b/.test(x)) assets.push('SOL');
  if(family==='CRYPTO'&&!assets.some(a=>['BTC','ETH','SOL'].includes(a))) assets.push('CRYPTO');
  if(/dollar|usd|treasury|inflation|employment|payroll|job openings|federal reserve|fomc|interest rate/.test(x)) assets.push('USD','RATES');
  if(/euro|ecb|european central bank/.test(x)) assets.push('EUR','RATES');
  if(/oil|energy/.test(x)) assets.push('OIL');
  if(/gold/.test(x)) assets.push('GOLD');
  return uniq(assets).slice(0,10);
}
function worldRelevant(family,assets){
  return ['MACRO','COMMODITIES','GEOPOLITICS'].includes(family)||assets.includes('RATES');
}
function eventId(source,rawId,url,title,publishedAt){
  const seed=text(rawId,500)||url||title+':'+String(publishedAt||'');
  return 'official_'+String(source.id).toLowerCase()+':'+Buffer.from(seed).toString('base64url').slice(0,96);
}

export function parseOfficialIntelFeed(xml,source,{now=Date.now(),limit=30}={}){
  if(!source?.id) throw new Error('official source definition required');
  const blocks=String(xml||'').match(/<(?:item|entry)\b[\s\S]*?<\/(?:item|entry)>/gi)||[];
  const out=[];
  const max=Math.max(1,Math.min(100,Math.floor(Number(limit)||30)));
  for(const block of blocks.slice(0,max)){
    const title=text(xmlTag(block,'title'),360);
    const url=text(xmlLink(block),1000);
    const rawId=xmlTag(block,'guid')||xmlTag(block,'id');
    const rawDate=xmlTag(block,'pubDate')||xmlTag(block,'published')||xmlTag(block,'updated')||xmlTag(block,'dc:date');
    const publishedAt=parseDate(rawDate);
    if(!title||!url) continue;
    if(publishedAt!=null&&publishedAt>Number(now)+5000) continue;
    const observedAt=Number(now);
    const family=familyFor(title,source);
    const affectedAssets=assetsFor(title,family,source);
    let domain='';
    try{domain=new URL(url).hostname;}catch{}
    out.push(Object.freeze({
      id:eventId(source,rawId,url,title,publishedAt),
      title,
      headline:title,
      url,
      source:source.authority,
      sourceId:source.id,
      domain,
      sourceCountry:source.country||'',
      language:'en',
      // Knowledge-time safety: BIGGJ only owns the publication once this
      // polling cycle actually observed it. Keep publisher time separately.
      availableAt:observedAt,
      timestamp:observedAt,
      publishedAt,
      observedAt,
      family,
      eventFamily:family,
      status:statusFor(title,family),
      verified:false,
      independentConfirmation:0,
      primarySource:true,
      publicationAuthenticity:'DIRECT_OFFICIAL_FEED',
      authority:source.authority,
      affectedAssets,
      marketStatus:'AWAITING_MARKET_DATA',
      cryptoImpactStatus:'AWAITING_MARKET_DATA',
      shadowTradeStatus:'NONE',
      queryClass:'OFFICIAL',
      worldRelevant:worldRelevant(family,affectedAssets),
      epistemic:'OFFICIAL_PRIMARY_SOURCE_PUBLICATION_NOT_INDEPENDENTLY_CORROBORATED'
    }));
  }
  return Object.freeze(out);
}

export function createBiggjOfficialIntelProvider({
  fetchImpl=globalThis.fetch,
  sources=OFFICIAL_INTEL_SOURCES,
  timeoutMs=8000,
  cacheTtlMs=120000,
  maxItemsPerSource=30,
  userAgent='BIGGJ/1.0 official-primary-source-research',
  now=()=>Date.now()
}={}){
  if(typeof fetchImpl!=='function') throw new Error('fetch implementation required');
  const configured=Object.freeze((Array.isArray(sources)?sources:[]).filter(x=>x?.id&&x?.url).map(x=>Object.freeze({...x})));
  let cache=null;

  async function fetchSource(source){
    const ctrl=new AbortController();
    const timer=setTimeout(()=>ctrl.abort(),Math.max(1500,Number(timeoutMs)||8000));
    try{
      const res=await fetchImpl(source.url,{
        method:'GET',
        headers:{
          accept:'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.1',
          'user-agent':userAgent
        },
        signal:ctrl.signal
      });
      if(!res?.ok) throw new Error(source.id+'_HTTP_'+String(res?.status??'UNKNOWN'));
      const xml=await res.text();
      const rows=parseOfficialIntelFeed(xml,source,{now:Number(now()),limit:maxItemsPerSource});
      return Object.freeze({sourceId:source.id,authority:source.authority,rows});
    }finally{
      clearTimeout(timer);
    }
  }

  async function fetchFeed({force=false}={}){
    const capturedAt=Number(now());
    if(!force&&cache&&capturedAt-cache.at<cacheTtlMs) return cache.value;
    const settled=await Promise.allSettled(configured.map(fetchSource));
    const rows=[];
    const errors=[];
    const providerHealth={};
    settled.forEach((result,i)=>{
      const source=configured[i];
      if(result.status==='fulfilled'){
        rows.push(...result.value.rows);
        providerHealth[source.id]=Object.freeze({authority:source.authority,ok:true,rows:result.value.rows.length,url:source.url});
      }else{
        const error=errText(result.reason);
        errors.push(Object.freeze({sourceId:source.id,authority:source.authority,error}));
        providerHealth[source.id]=Object.freeze({authority:source.authority,ok:false,rows:0,url:source.url,error});
      }
    });
    const seen=new Set();
    const deduped=[];
    for(const row of rows.sort((a,b)=>Number(b.availableAt)-Number(a.availableAt))){
      const key=String(row.url||row.id);
      if(seen.has(key)) continue;
      seen.add(key);
      deduped.push(row);
    }
    const healthySourceCount=Object.values(providerHealth).filter(x=>x.ok).length;
    const value=Object.freeze({
      version:BIGGJ_OFFICIAL_INTEL_PROVIDER_VERSION,
      capturedAt,
      ok:deduped.length>0||healthySourceCount>0,
      source:'OFFICIAL_PRIMARY_RSS',
      sourceCount:configured.length,
      healthySourceCount,
      failedSourceCount:configured.length-healthySourceCount,
      articleCount:deduped.length,
      events:Object.freeze(deduped),
      errors:Object.freeze(errors),
      providerHealth:Object.freeze(providerHealth),
      epistemic:'DIRECT_OFFICIAL_PUBLICATIONS_NOT_INDEPENDENT_CORROBORATION'
    });
    cache={at:capturedAt,value};
    return value;
  }

  return Object.freeze({version:BIGGJ_OFFICIAL_INTEL_PROVIDER_VERSION,sources:configured,fetchFeed});
}
