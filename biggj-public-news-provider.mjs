export const BIGGJ_PUBLIC_NEWS_PROVIDER_VERSION='BIGGJ_PUBLIC_NEWS_PROVIDER_V3';

const DEFAULT_GENERAL_QUERY='(bitcoin OR ethereum OR crypto OR markets OR economy OR inflation OR "federal reserve" OR tariffs OR sanctions OR oil OR gold OR AI OR semiconductor)';
const DEFAULT_WORLD_QUERY='(war OR ceasefire OR sanctions OR tariffs OR geopolitics OR "central bank" OR inflation OR oil OR gas OR Taiwan OR China OR Russia OR Ukraine OR "Middle East" OR NATO OR trade)';
const DEFAULT_GENERAL_FALLBACK_QUERY='(bitcoin OR ethereum OR markets OR inflation OR oil OR AI)';
const DEFAULT_WORLD_FALLBACK_QUERY='(war OR sanctions OR tariffs OR oil OR China OR Russia OR Ukraine)';
const DEFAULT_GENERAL_SECONDARY_QUERY='bitcoin OR ethereum OR inflation OR "Federal Reserve" OR oil OR gold OR AI OR semiconductor';
const DEFAULT_WORLD_SECONDARY_QUERY='war OR ceasefire OR sanctions OR tariffs OR Taiwan OR Ukraine OR "Middle East" OR oil OR "central bank"';

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

function text(v,max=500){const s=String(v??'').replace(/\s+/g,' ').trim();return s.length<=max?s:s.slice(0,max-1)+'…';}
function lower(v){return String(v??'').toLowerCase();}
function uniq(xs){return [...new Set((Array.isArray(xs)?xs:[]).filter(Boolean).map(String))];}
function errText(err){return err instanceof Error?err.message:String(err);}
function parseNewsDate(value){
  const s=String(value||'').trim();
  if(/^\d{14}$/.test(s)){
    const iso=s.slice(0,4)+'-'+s.slice(4,6)+'-'+s.slice(6,8)+'T'+s.slice(8,10)+':'+s.slice(10,12)+':'+s.slice(12,14)+'Z';
    const t=Date.parse(iso);return Number.isFinite(t)?t:null;
  }
  if(/^\d{8}T\d{6}Z$/.test(s)){
    const raw=s.replace(/[TZ]/g,'');
    return parseNewsDate(raw);
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
function articleCore(raw,queryClass,now,{sourceId='GDELT_DOC_API',providerName='GDELT'}={}){
  const title=text(raw?.title||raw?.headline,360);
  const url=text(raw?.url||raw?.url_mobile,900);
  if(!title||!url)return null;
  const family=eventFamily(title);
  const parsedAt=parseNewsDate(raw?.seendate||raw?.seenDate||raw?.publishedAt||raw?.pubDate);
  if(parsedAt!=null&&parsedAt>now+5000)return null;
  const availableAt=parsedAt??now;
  const domain=text(raw?.domain||raw?.sourceName||(()=>{try{return new URL(url).hostname}catch{return ''}})(),160);
  const prefix=String(sourceId||'PUBLIC_NEWS').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
  return Object.freeze({
    id:prefix+':'+Buffer.from(url).toString('base64url').slice(0,72),
    title,
    headline:title,
    url,
    source:domain||providerName,
    sourceId,
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
function decodeXml(value){
  return String(value??'')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi,'$1')
    .replace(/&amp;/gi,'&')
    .replace(/&quot;/gi,'"')
    .replace(/&#39;|&apos;/gi,"'")
    .replace(/&lt;/gi,'<')
    .replace(/&gt;/gi,'>')
    .trim();
}
function xmlTag(block,tag){
  const re=new RegExp('<'+tag+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/'+tag+'>','i');
  const m=re.exec(String(block||''));
  return m?decodeXml(m[1]):'';
}
function googleNewsRows(xml,queryClass,now){
  const blocks=String(xml||'').match(/<item\b[\s\S]*?<\/item>/gi)||[];
  return blocks.map(block=>articleCore({
    title:xmlTag(block,'title'),
    url:xmlTag(block,'link'),
    publishedAt:xmlTag(block,'pubDate'),
    sourceName:xmlTag(block,'source')||'Google News RSS'
  },queryClass,now,{sourceId:'GOOGLE_NEWS_RSS',providerName:'Google News RSS'})).filter(Boolean);
}

export function createBiggjPublicNewsProvider({
  fetchImpl=globalThis.fetch,
  baseUrl='https://api.gdeltproject.org/api/v2/doc/doc',
  secondaryBaseUrl='https://news.google.com/rss/search',
  timeoutMs=18000,
  secondaryTimeoutMs=8000,
  gdeltCooldownMs=10*60_000,
  cacheTtlMs=120000,
  maxRecords=30,
  generalQuery=DEFAULT_GENERAL_QUERY,
  worldQuery=DEFAULT_WORLD_QUERY,
  generalFallbackQuery=DEFAULT_GENERAL_FALLBACK_QUERY,
  worldFallbackQuery=DEFAULT_WORLD_FALLBACK_QUERY,
  generalSecondaryQuery=DEFAULT_GENERAL_SECONDARY_QUERY,
  worldSecondaryQuery=DEFAULT_WORLD_SECONDARY_QUERY,
  now=()=>Date.now()
}={}){
  if(typeof fetchImpl!=='function')throw new Error('fetch implementation required');
  let cache=null;
  let gdeltCooldownUntil=0;

  async function fetchTimed(url,{accept,timeout}){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),Math.max(1500,Number(timeout)||8000));
    try{
      return await fetchImpl(url,{
        method:'GET',
        headers:{accept,'user-agent':'BIGGJ/3.0 public-news-research'},
        signal:controller.signal
      });
    }finally{clearTimeout(timer);}
  }

  function markGdeltFailure(err){
    const message=errText(err);
    if(/GDELT_HTTP_429/.test(message)){
      gdeltCooldownUntil=Math.max(gdeltCooldownUntil,Number(now())+Math.max(60_000,Number(gdeltCooldownMs)||600_000));
    }
    return message;
  }

  async function queryGdelt(queryText,queryClass,{records=maxRecords,timespan='12h'}={}){
    const u=new URL(baseUrl);
    u.searchParams.set('query',queryText);
    u.searchParams.set('mode','ArtList');
    u.searchParams.set('format','json');
    u.searchParams.set('maxrecords',String(Math.max(10,Math.min(75,Number(records)||30))));
    u.searchParams.set('sort','DateDesc');
    u.searchParams.set('timespan',timespan);
    const res=await fetchTimed(u.toString(),{accept:'application/json',timeout:timeoutMs});
    if(!res?.ok)throw new Error('GDELT_HTTP_'+String(res?.status??'UNKNOWN'));
    const body=await res.json();
    const rows=Array.isArray(body?.articles)?body.articles:Array.isArray(body)?body:[];
    const t=Number(now());
    return rows.map(x=>articleCore(x,queryClass,t,{sourceId:'GDELT_DOC_API',providerName:'GDELT'})).filter(Boolean);
  }

  async function querySecondary(queryText,queryClass){
    const u=new URL(secondaryBaseUrl);
    u.searchParams.set('q',queryText);
    u.searchParams.set('hl','en-US');
    u.searchParams.set('gl','US');
    u.searchParams.set('ceid','US:en');
    const res=await fetchTimed(u.toString(),{
      accept:'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.1',
      timeout:secondaryTimeoutMs
    });
    if(!res?.ok)throw new Error('GOOGLE_NEWS_RSS_HTTP_'+String(res?.status??'UNKNOWN'));
    return googleNewsRows(await res.text(),queryClass,Number(now()));
  }

  async function queryWithFallback(primaryQuery,compactQuery,secondaryQuery,queryClass){
    const recoveries=[];
    let primaryError=null;
    let compactError=null;
    const currentTime=Number(now());

    if(currentTime<gdeltCooldownUntil){
      recoveries.push(Object.freeze({
        queryClass,
        strategy:'GDELT_COOLDOWN_BYPASS',
        provider:'GOOGLE_NEWS_RSS',
        cooldownUntil:gdeltCooldownUntil
      }));
    }else{
      try{
        const rows=await queryGdelt(primaryQuery,queryClass);
        if(rows.length)return {rows,recoveries,provider:'GDELT_DOC_API',fallbackUsed:false};
        primaryError='EMPTY_PRIMARY_RESULT';
      }catch(err){
        primaryError=markGdeltFailure(err);
      }

      const rateLimited=/GDELT_HTTP_429/.test(String(primaryError||''));
      if(!rateLimited&&Number(now())>=gdeltCooldownUntil){
        try{
          const rows=await queryGdelt(compactQuery,queryClass,{records:20,timespan:'6h'});
          if(rows.length){
            recoveries.push(Object.freeze({
              queryClass,
              primaryError,
              strategy:'COMPACT_QUERY_RETRY',
              provider:'GDELT_DOC_API'
            }));
            return {rows,recoveries,provider:'GDELT_DOC_API',fallbackUsed:false};
          }
          compactError='EMPTY_COMPACT_RESULT';
        }catch(err){
          compactError=markGdeltFailure(err);
        }
      }
    }

    try{
      const rows=await querySecondary(secondaryQuery,queryClass);
      if(rows.length){
        recoveries.push(Object.freeze({
          queryClass,
          primaryError,
          compactError,
          strategy:'SECONDARY_PROVIDER_FALLBACK',
          provider:'GOOGLE_NEWS_RSS',
          cooldownUntil:gdeltCooldownUntil>Number(now())?gdeltCooldownUntil:null
        }));
        return {rows,recoveries,provider:'GOOGLE_NEWS_RSS',fallbackUsed:true};
      }
      throw new Error('EMPTY_SECONDARY_RESULT');
    }catch(err){
      const secondaryError=errText(err);
      throw new Error([
        primaryError?'PRIMARY:'+primaryError:null,
        compactError?'COMPACT:'+compactError:null,
        'SECONDARY:'+secondaryError
      ].filter(Boolean).join(' | '));
    }
  }

  async function fetchFeed({force=false}={}){
    const t=Number(now());
    if(!force&&cache&&t-cache.at<cacheTtlMs)return cache.value;
    const settled=await Promise.allSettled([
      queryWithFallback(generalQuery,generalFallbackQuery,generalSecondaryQuery,'GENERAL'),
      queryWithFallback(worldQuery,worldFallbackQuery,worldSecondaryQuery,'WORLD')
    ]);
    const errors=[];
    const recoveries=[];
    const rows=[];
    const providerHealth={};
    settled.forEach((r,i)=>{
      const queryClass=i===0?'GENERAL':'WORLD';
      if(r.status==='fulfilled'){
        rows.push(...r.value.rows);
        recoveries.push(...r.value.recoveries);
        providerHealth[queryClass.toLowerCase()]=Object.freeze({
          provider:r.value.provider,
          rows:r.value.rows.length,
          fallbackUsed:r.value.fallbackUsed
        });
      }else{
        errors.push({queryClass,error:errText(r.reason)});
        providerHealth[queryClass.toLowerCase()]=Object.freeze({
          provider:'NONE',
          rows:0,
          fallbackUsed:true
        });
      }
    });
    const all=dedupe(rows).sort((a,b)=>rank(b)-rank(a)||Number(b.availableAt)-Number(a.availableAt)).slice(0,120);
    const world=all.filter(x=>x.worldRelevant).slice(0,60);
    const sourceIds=uniq(all.map(x=>x.sourceId));
    const source=sourceIds.length===1
      ?(sourceIds[0]==='GDELT_DOC_API'?'GDELT DOC 2.1':'Google News RSS')
      :sourceIds.length>1?'GDELT DOC 2.1 + Google News RSS':'GDELT DOC 2.1 / Google News RSS';
    const value=Object.freeze({
      version:BIGGJ_PUBLIC_NEWS_PROVIDER_VERSION,
      capturedAt:t,
      ok:all.length>0,
      source,
      sourceUrl:'https://www.gdeltproject.org/',
      secondarySourceUrl:'https://news.google.com/',
      articleCount:all.length,
      worldCount:world.length,
      events:Object.freeze(all),
      world:Object.freeze(world),
      errors:Object.freeze(errors),
      recoveries:Object.freeze(recoveries),
      fallbackUsed:recoveries.some(x=>x.strategy==='SECONDARY_PROVIDER_FALLBACK'||x.strategy==='GDELT_COOLDOWN_BYPASS'),
      gdeltCooldownUntil:gdeltCooldownUntil||null,
      providerHealth:Object.freeze(providerHealth),
      epistemic:'PUBLIC_NEWS_DISCOVERY_NOT_FACT_VERIFICATION'
    });
    cache={at:t,value};
    return value;
  }

  return Object.freeze({version:BIGGJ_PUBLIC_NEWS_PROVIDER_VERSION,fetchFeed});
}
