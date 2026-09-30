export const OFFICIAL_INTEL_SOURCES_VERSION='TCX_OFFICIAL_INTEL_SOURCES_V2';

const SOURCES=[
  {id:'FED_PRESS',authority:'Federal Reserve',url:'https://www.federalreserve.gov/feeds/press_all.xml',defaultFamily:'MACRO',defaultAssets:['USD','RATES'],worldRelevant:true},
  {id:'SEC_PRESS',authority:'U.S. Securities and Exchange Commission',url:'https://www.sec.gov/news/pressreleases.rss',defaultFamily:'CORPORATE',defaultAssets:['RISK'],worldRelevant:false},
  {id:'ECB_PRESS',authority:'European Central Bank',url:'https://www.ecb.europa.eu/rss/press.html',defaultFamily:'MACRO',defaultAssets:['EUR','RATES'],worldRelevant:true},
  {id:'CFTC_PRESS',authority:'U.S. Commodity Futures Trading Commission',url:'https://www.cftc.gov/RSS/RSSGP/rssgp.xml',defaultFamily:'CORPORATE',defaultAssets:['RISK'],worldRelevant:false},
  {id:'BLS_EMPSIT',authority:'U.S. Bureau of Labor Statistics',url:'https://www.bls.gov/feed/empsit.rss',defaultFamily:'MACRO',defaultAssets:['USD','RATES','RISK'],worldRelevant:true},
  {id:'BLS_CPI',authority:'U.S. Bureau of Labor Statistics',url:'https://www.bls.gov/feed/cpi.rss',defaultFamily:'MACRO',defaultAssets:['USD','RATES','RISK'],worldRelevant:true},
  {id:'BLS_JOLTS',authority:'U.S. Bureau of Labor Statistics',url:'https://www.bls.gov/feed/jolts.rss',defaultFamily:'MACRO',defaultAssets:['USD','RATES','RISK'],worldRelevant:true}
].map(x=>Object.freeze({...x,defaultAssets:Object.freeze([...x.defaultAssets])}));

export const OFFICIAL_INTEL_SOURCES=Object.freeze(SOURCES);

const HIGH_IMPACT=[
  'rate decision','rate cut','rate hike','fomc','consumer price index','cpi','employment situation',
  'payroll','unemployment','job openings','jolts','emergency','financial stability'
];
const DEVELOPING=[
  'crypto','digital asset','token','stablecoin','etf','derivative','swap','market structure','inflation',
  'employment','jobs','interest rate','monetary policy','enforcement','rule','proposal'
];

function text(v,max=700){
  const s=String(v??'').replace(/\s+/g,' ').trim();
  return s.length<=max?s:s.slice(0,max-1)+'…';
}
function lower(v){return String(v??'').toLowerCase();}
function uniq(xs){return [...new Set((Array.isArray(xs)?xs:[]).filter(Boolean).map(String))];}
function decodeXml(value){
  return String(value??'')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi,'$1')
    .replace(/&amp;/gi,'&')
    .replace(/&quot;/gi,'"')
    .replace(/&#39;|&apos;/gi,"'")
    .replace(/&lt;/gi,'<')
    .replace(/&gt;/gi,'>')
    .replace(/<[^>]+>/g,' ')
    .replace(/\s+/g,' ')
    .trim();
}
function xmlTag(block,tag){
  const m=new RegExp('<'+tag+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/'+tag+'>','i').exec(String(block||''));
  return m?decodeXml(m[1]):'';
}
function atomLink(block){
  const m=/<link\b[^>]*href=["']([^"']+)["'][^>]*>/i.exec(String(block||''));
  return m?decodeXml(m[1]):'';
}
function parseDate(v){
  const t=Date.parse(String(v||'').trim());
  return Number.isFinite(t)?t:null;
}
function familyFor(title,source){
  const x=lower(title);
  if(/bitcoin|ethereum|crypto|digital asset|stablecoin|token|blockchain|etf/.test(x)) return 'CRYPTO';
  if(/oil|gas|commodity|gold|copper/.test(x)) return 'COMMODITIES';
  if(/inflation|consumer price|employment|payroll|unemployment|job openings|jolts|rate|monetary policy|fomc|treasury|dollar|euro/.test(x)) return 'MACRO';
  if(/fraud|enforcement|securities|exchange|market structure|derivative|swap|rule|proposal|issuer|fund/.test(x)) return 'CORPORATE';
  return source.defaultFamily||'OTHER';
}
function statusFor(title,source){
  const x=lower(title);
  if(HIGH_IMPACT.some(k=>x.includes(k))) return 'HIGH_IMPACT';
  if(DEVELOPING.some(k=>x.includes(k))) return 'DEVELOPING';
  if(source.id.startsWith('BLS_')||source.id==='FED_PRESS'||source.id==='ECB_PRESS') return 'DEVELOPING';
  return 'WATCH';
}
function assetsFor(title,family,source){
  const x=lower(title),assets=[...(source.defaultAssets||[])];
  if(/bitcoin|btc/.test(x))assets.push('BTC');
  if(/ethereum|ether|eth/.test(x))assets.push('ETH');
  if(/solana|\bsol\b/.test(x))assets.push('SOL');
  if(family==='CRYPTO'&&!assets.some(a=>['BTC','ETH','SOL'].includes(a)))assets.push('CRYPTO');
  if(/inflation|consumer price|employment|payroll|unemployment|job openings|jolts|fed|fomc|treasury|dollar|interest rate/.test(x))assets.push('USD','RATES');
  if(/ecb|euro/.test(x))assets.push('EUR','RATES');
  if(/oil/.test(x))assets.push('OIL');
  if(/gold/.test(x))assets.push('GOLD');
  return uniq(assets).slice(0,10);
}
function stableId(source,url,title,publishedAt){
  const basis=String(url||title||publishedAt||'unknown');
  let hash=2166136261;
  for(let i=0;i<basis.length;i++){
    hash^=basis.charCodeAt(i);
    hash=Math.imul(hash,16777619);
  }
  return source.id+':'+(hash>>>0).toString(16);
}

export function parseOfficialIntelFeed(xml,source,{observedAt=Date.now(),limit=40}={}){
  if(!source?.id) throw new Error('official source required');
  const now=Number(observedAt);
  if(!Number.isFinite(now)) throw new Error('observedAt must be finite');
  const blocks=String(xml||'').match(/<(?:item|entry)\b[\s\S]*?<\/(?:item|entry)>/gi)||[];
  const rows=[];
  for(const block of blocks.slice(0,Math.max(1,Math.min(100,Number(limit)||40)))){
    const title=text(xmlTag(block,'title'),360);
    const url=text(xmlTag(block,'link')||atomLink(block),1000);
    const publishedAt=parseDate(
      xmlTag(block,'pubDate')||
      xmlTag(block,'published')||
      xmlTag(block,'updated')||
      xmlTag(block,'dc:date')||
      xmlTag(block,'date')
    );
    if(!title||!url) continue;
    if(publishedAt!=null&&publishedAt>now+5000) continue;
    const family=familyFor(title,source);
    rows.push(Object.freeze({
      id:xmlTag(block,'guid')||xmlTag(block,'id')||stableId(source,url,title,publishedAt),
      title,
      headline:title,
      url,
      source:source.authority,
      sourceId:source.id,
      authority:source.authority,
      domain:(()=>{try{return new URL(url).hostname}catch{return ''}})(),
      language:'en',
      publishedAt,
      observedAt:now,
      availableAt:now,
      timestamp:now,
      family,
      eventFamily:family,
      status:statusFor(title,source),
      verified:false,
      verifiedSource:true,
      sourceAuthority:'OFFICIAL_PRIMARY',
      independentConfirmation:0,
      affectedAssets:assetsFor(title,family,source),
      marketStatus:'AWAITING_MARKET_DATA',
      cryptoImpactStatus:'AWAITING_MARKET_DATA',
      shadowTradeStatus:'NONE',
      queryClass:'OFFICIAL_PRIMARY',
      worldRelevant:source.worldRelevant===true||family==='MACRO',
      epistemic:'OFFICIAL_PRIMARY_SOURCE_PUBLICATION_NOT_INDEPENDENTLY_CONFIRMED'
    }));
  }
  return rows;
}

export function createOfficialIntelProvider({
  fetchImpl=globalThis.fetch,
  sources=OFFICIAL_INTEL_SOURCES,
  timeoutMs=8000,
  cacheTtlMs=120000,
  now=()=>Date.now()
}={}){
  if(typeof fetchImpl!=='function') throw new Error('fetch implementation required');
  const cache=new Map();

  async function fetchOne(source,{force=false}={}){
    const t=Number(now());
    const hit=cache.get(source.id);
    if(!force&&hit&&t-hit.at<cacheTtlMs) return hit.value;
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),Math.max(1000,Number(timeoutMs)||8000));
    try{
      const res=await fetchImpl(source.url,{
        method:'GET',
        headers:{
          accept:'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.1',
          'user-agent':'BIGGJ/3.0 official-primary-intel'
        },
        signal:controller.signal
      });
      if(!res?.ok) throw new Error(source.id+'_HTTP_'+String(res?.status??'UNKNOWN'));
      const rows=parseOfficialIntelFeed(await res.text(),source,{observedAt:t});
      const value=Object.freeze({source,rows:Object.freeze(rows),capturedAt:t});
      cache.set(source.id,{at:t,value});
      return value;
    }finally{
      clearTimeout(timer);
    }
  }

  async function fetchFeed({force=false}={}){
    const settled=await Promise.allSettled(sources.map(source=>fetchOne(source,{force})));
    const events=[];
    const errors=[];
    const providerHealth={};
    settled.forEach((result,i)=>{
      const source=sources[i];
      if(result.status==='fulfilled'){
        events.push(...result.value.rows);
        providerHealth[source.id]=Object.freeze({authority:source.authority,rows:result.value.rows.length,ok:true});
      }else{
        const error=result.reason instanceof Error?result.reason.message:String(result.reason);
        errors.push(Object.freeze({sourceId:source.id,authority:source.authority,error}));
        providerHealth[source.id]=Object.freeze({authority:source.authority,rows:0,ok:false,error});
      }
    });
    const seen=new Set();
    const deduped=events.filter(event=>{
      const key=String(event.url||event.id);
      if(seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return Object.freeze({
      version:OFFICIAL_INTEL_SOURCES_VERSION,
      capturedAt:Number(now()),
      ok:deduped.length>0,
      source:'Official primary-source feeds',
      events:Object.freeze(deduped),
      errors:Object.freeze(errors),
      providerHealth:Object.freeze(providerHealth),
      sourceCount:sources.length,
      healthySourceCount:Object.values(providerHealth).filter(x=>x.ok).length,
      epistemic:'PRIMARY_SOURCE_ORIGIN_VERIFIED_CONTENT_NOT_INDEPENDENTLY_CONFIRMED'
    });
  }

  return Object.freeze({version:OFFICIAL_INTEL_SOURCES_VERSION,fetchFeed,fetchOne});
}
