
export const BIGGJ_PUBLIC_NEWS_PROVIDER_VERSION='BIGGJ_PUBLIC_NEWS_PROVIDER_V1';

const DEFAULT_GENERAL_QUERY='(bitcoin OR ethereum OR crypto OR markets OR economy OR inflation OR "federal reserve" OR tariffs OR sanctions OR oil OR gold OR AI OR semiconductor)';
const DEFAULT_WORLD_QUERY='(war OR ceasefire OR sanctions OR tariffs OR geopolitics OR "central bank" OR inflation OR oil OR gas OR Taiwan OR China OR Russia OR Ukraine OR "Middle East" OR NATO OR trade)';

const WORLD_KEYWORDS=[
  'war','ceasefire','sanction','tariff','geopolit','military','missile','attack','nato','taiwan',
  'china','russia','ukraine','iran','israel','gaza','middle east','oil','gas','opec','central bank',
  'fed ','federal reserve','ecb','inflation','interest rate','trade war','election','government shutdown'
];
const HIGH_IMPACT_KEYWORDS=[
  'war','attack','missile','ceasefire','sanction','tariff','rate cut','rate hike','emergency',
  'default','bank failure','bankruptcy','hack','exploit','etf approval','etf rejection','regulation',
  'ban ','shutdown','oil shock','supply shock'
];
const DEVELOPING_KEYWORDS=[
  'fed','ecb','inflation','jobs','gdp','tariff','trade','sanction','oil','gold','bitcoin','crypto',
  'ethereum','ai','semiconductor','chip','nvidia','openai','stablecoin','etf','election'
];

function finite(v,f=null){const n=Number(v);return Number.isFinite(n)?n:f;}
function text(v,max=500){const s=String(v??'').replace(/\s+/g,' ').trim();return s.length<=max?s:s.slice(0,max-1)+'…';}
function lower(v){return String(v??'').toLowerCase();}
function uniq(xs){return [...new Set((Array.isArray(xs)?xs:[]).filter(Boolean).map(String))];}
function parseGdeltDate(value){
  const s=String(value||'').trim();
  if(/^\d{14}$/.test(s)){
    const iso=s.slice(0,4)+'-'+s.slice(4,6)+'-'+s.slice(6,8)+'T'+s.slice(8,10)+':'+s.slice(10,12)+':'+s.slice(12,14)+'Z';
    const t=Date.parse(iso);return Number.isFinite(t)?t:null;
  }
  if(/^\d{8}T\d{6}Z$/.test(s)){
    const raw=s.replace(/[TZ]/g,'');
    return parseGdeltDate(raw);
  }
  const t=Date.parse(s);return Number.isFinite(t)?t:null;
}
function normalizeTitle(v){
  return lower(v).replace(/[^a-z0-9äöüß ]+/gi,' ').replace(/\s+/g,' ').trim();
}
function eventFamily(title){
  const x=lower(title);
  if(/bitcoin|ethereum|crypto|stablecoin|token|blockchain|exchange|etf/.test(x))return 'CRYPTO';
  if(/war|ceasefire|sanction|tariff|nato|taiwan|russia|ukraine|iran|israel|gaza|military|missile|geopolit/.test(x))return 'GEOPOLITICS';
  if(/fed|federal reserve|ecb|inflation|interest rate|jobs|gdp|treasury|dollar|central bank/.test(x))return 'MACRO';
  if(/ai|artificial intelligence|semiconductor|chip|nvidia|openai|data center|compute/.test(x))return 'TECHNOLOGY';
  if(/earnings|guidance|merger|acquisition|ipo|bankruptcy|buyback|layoff/.test(x))return 'CORPORATE';
  if(/oil|gas|gold|copper|uranium|commodity|opec/.test(x))return 'COMMODITIES';
  return 'OTHER';
}
function statusFor(title){
  const x=lower(title);
  if(HIGH_IMPACT_KEYWORDS.some(k=>x.includes(k)))return 'HIGH_IMPACT';
  if(DEVELOPING_KEYWORDS.some(k=>x.includes(k)))return 'DEVELOPING';
  return 'WATCH';
}
function affectedAssetsFor(title,family){
  const x=lower(title),assets=[];
  if(/bitcoin|btc/.test(x))assets.push('BTC');
  if(/ethereum|ether|eth/.test(x))assets.push('ETH');
  if(/solana| sol /.test(' '+x+' '))assets.push('SOL');
  if(family==='CRYPTO'&&!assets.length)assets.push('CRYPTO');
  if(/fed|dollar|usd|treasury|inflation|interest rate/.test(x))assets.push('USD','RATES');
  if(/oil|opec/.test(x))assets.push('OIL');
  if(/gold/.test(x))assets.push('GOLD');
  if(/nvidia|semiconductor|chip|ai|openai/.test(x))assets.push('TECH');
  if(family==='GEOPOLITICS')assets.push('RISK');
  return uniq(assets).slice(0,8);
}
function worldRelevant(title){
  const x=lower(title);
  return WORLD_KEYWORDS.some(k=>x.includes(k))||['GEOPOLITICS','MACRO','COMMODITIES'].includes(eventFamily(title));
}
function articleCore(raw,queryClass,now){
  const title=text(raw?.title||raw?.headline,360);
  const url=text(raw?.url||raw?.url_mobile,900);
  if(!title||!url)return null;
  const family=eventFamily(title);
  const parsedAt=parseGdeltDate(raw?.seendate||raw?.seenDate||raw?.publishedAt);
  if(parsedAt!=null&&parsedAt>now+5000)return null;
  const availableAt=parsedAt??now;
  const domain=text(raw?.domain||(()=>{try{return new URL(url).hostname}catch{return ''}})(),160);
  return Object.freeze({
    id:'gdelt:'+Buffer.from(url).toString('base64url').slice(0,72),
    title,
    headline:title,
    url,
    source:domain||'GDELT',
    sourceId:'GDELT_DOC_API',
    domain,
    sourceCountry:text(raw?.sourcecountry||raw?.sourceCountry,80),
    language:text(raw?.language,40),
    availableAt,
    timestamp:availableAt,
    family,
    eventFamily:family,
    status:statusFor(title),
    verified:false,
    independentConfirmation:0,
    affectedAssets:affectedAssetsFor(title,family),
    marketStatus:'AWAITING_MARKET_DATA',
    cryptoImpactStatus:'AWAITING_MARKET_DATA',
    shadowTradeStatus:'NONE',
    queryClass,
    worldRelevant:worldRelevant(title),
    epistemic:'PUBLIC_NEWS_HEADLINE_NOT_INDEPENDENTLY_VERIFIED'
  });
}
function rank(event){
  const status={HIGH_IMPACT:3,DEVELOPING:2,WATCH:1}[event?.status]||0;
  const fam={GEOPOLITICS:4,MACRO:4,CRYPTO:3,COMMODITIES:3,TECHNOLOGY:2,CORPORATE:2,OTHER:1}[event?.family]||1;
  return status*100+fam*10+Math.min(9,(event?.affectedAssets||[]).length);
}
function dedupe(events){
  const byUrl=new Map(),byTitle=new Map();
  for(const e of events){
    if(!e)continue;
    if(byUrl.has(e.url))continue;
    const nt=normalizeTitle(e.title);
    if(nt&&byTitle.has(nt))continue;
    byUrl.set(e.url,e);if(nt)byTitle.set(nt,e);
  }
  return [...byUrl.values()];
}

export function createBiggjPublicNewsProvider({
  fetchImpl=globalThis.fetch,
  baseUrl='https://api.gdeltproject.org/api/v2/doc/doc',
  timeoutMs=9000,
  cacheTtlMs=120000,
  maxRecords=50,
  generalQuery=DEFAULT_GENERAL_QUERY,
  worldQuery=DEFAULT_WORLD_QUERY,
  now=()=>Date.now()
}={}){
  if(typeof fetchImpl!=='function')throw new Error('fetch implementation required');
  let cache=null;

  async function query(queryText,queryClass){
    const u=new URL(baseUrl);
    u.searchParams.set('query',queryText);
    u.searchParams.set('mode','ArtList');
    u.searchParams.set('format','json');
    u.searchParams.set('maxrecords',String(Math.max(10,Math.min(100,Number(maxRecords)||50))));
    u.searchParams.set('sort','HybridRel');
    u.searchParams.set('timespan','24h');
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),Math.max(1500,Number(timeoutMs)||9000));
    try{
      const res=await fetchImpl(u.toString(),{
        method:'GET',
        headers:{accept:'application/json','user-agent':'BIGGJ/1.0 public-news-research'},
        signal:controller.signal
      });
      if(!res?.ok)throw new Error('GDELT_HTTP_'+String(res?.status??'UNKNOWN'));
      const body=await res.json();
      const rows=Array.isArray(body?.articles)?body.articles:Array.isArray(body)?body:[];
      const t=Number(now());
      return rows.map(x=>articleCore(x,queryClass,t)).filter(Boolean);
    }finally{clearTimeout(timer);}
  }

  async function fetchFeed({force=false}={}){
    const t=Number(now());
    if(!force&&cache&&t-cache.at<cacheTtlMs)return cache.value;
    const settled=await Promise.allSettled([
      query(generalQuery,'GENERAL'),
      query(worldQuery,'WORLD')
    ]);
    const errors=[];
    const rows=[];
    settled.forEach((r,i)=>{
      if(r.status==='fulfilled')rows.push(...r.value);
      else errors.push({
        queryClass:i===0?'GENERAL':'WORLD',
        error:r.reason instanceof Error?r.reason.message:String(r.reason)
      });
    });
    const all=dedupe(rows).sort((a,b)=>rank(b)-rank(a)||Number(b.availableAt)-Number(a.availableAt)).slice(0,120);
    const world=all.filter(x=>x.worldRelevant).slice(0,60);
    const value=Object.freeze({
      version:BIGGJ_PUBLIC_NEWS_PROVIDER_VERSION,
      capturedAt:t,
      ok:all.length>0,
      source:'GDELT DOC 2.1',
      sourceUrl:'https://www.gdeltproject.org/',
      articleCount:all.length,
      worldCount:world.length,
      events:Object.freeze(all),
      world:Object.freeze(world),
      errors:Object.freeze(errors),
      epistemic:'PUBLIC_NEWS_DISCOVERY_NOT_FACT_VERIFICATION'
    });
    cache={at:t,value};
    return value;
  }

  return Object.freeze({version:BIGGJ_PUBLIC_NEWS_PROVIDER_VERSION,fetchFeed});
}
