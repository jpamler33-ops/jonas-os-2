export const MEMECOIN_EARLY_RADAR_VERSION='BIGGJ_MEMECOIN_EARLY_RADAR_V1';
export const W6_ULTRA_EARLY_FEED_VERSION='BIGGJ_W6_ULTRA_EARLY_FEED_V1';

function finite(v){
  if(v==null||v==='')return null;
  const n=Number(v);
  return Number.isFinite(n)?n:null;
}
function text(v,max=500){
  const s=String(v??'')
    .replace(/[\u0000-\u001F\u007F-\u009F\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/g,'')
    .replace(/\s+/g,' ')
    .trim();
  return s.length<=max?s:s.slice(0,max-1)+'…';
}
function clamp(v,a=0,b=1){return Math.max(a,Math.min(b,Number(v)||0));}
function normChain(v){
  const x=String(v||'').trim().toLowerCase();
  if(x==='ethereum'||x==='eth')return 'ethereum';
  if(x==='base')return 'base';
  if(x==='solana'||x==='sol')return 'solana';
  return x;
}
function geckoNetwork(chain){
  const c=normChain(chain);
  return c==='ethereum'?'eth':c;
}
const OBVIOUS_NON_MEME_SYMBOLS=new Set([
  'USDC','USDT','DAI','USDE','FDUSD','USDS','TUSD','PYUSD',
  'WETH','ETH','WBTC','BTC','WSOL','SOL','WBNB','BNB','WAVAX','AVAX',
  'STETH','WSTETH','CBETH','WEETH','EZETH','RETH'
]);
function obviousNonMeme(row={}){
  const symbol=String(row?.symbol||'').toUpperCase();
  if(OBVIOUS_NON_MEME_SYMBOLS.has(symbol))return true;
  const name=String(row?.name||'').toLowerCase();
  return /^(wrapped |bridged |tether usd|usd coin|dai stablecoin|wrapped bitcoin|wrapped ether|wrapped sol|liquid staked)/.test(name);
}
function tokenKey(chain,address){
  const c=normChain(chain),a=String(address||'').trim();
  if(!c||!a)return '';
  return c+':'+(c==='solana'?a:a.toLowerCase());
}
function ratio(a,b){return Number.isFinite(Number(a))&&Number(b)>0?Number(a)/Number(b):null;}
function compactLinks(links=[]){
  return (Array.isArray(links)?links:[]).map(x=>({
    type:text(x?.type,30).toLowerCase(),
    label:text(x?.label,60),
    url:text(x?.url,500)
  })).filter(x=>x.url).slice(0,12);
}
function xLinked(links=[]){
  return compactLinks(links).some(x=>x.type==='twitter'||x.type==='x'||/https?:\/\/(?:www\.)?(?:x\.com|twitter\.com)\//i.test(x.url));
}
function websiteLinked(links=[]){
  return compactLinks(links).some(x=>!/(?:x\.com|twitter\.com|t\.me|telegram\.me|discord\.gg)/i.test(x.url));
}
function ageMinutes(createdAt,now){
  const t=finite(createdAt);
  return t==null?null:Math.max(0,(now-t)/60_000);
}
function recencyScore(ageMin){
  if(ageMin==null)return .25;
  if(ageMin<=5)return 1;
  if(ageMin<=15)return .95;
  if(ageMin<=60)return .80;
  if(ageMin<=360)return .55;
  if(ageMin<=1440)return .25;
  return .05;
}
function liquidityScore(liq){
  const x=finite(liq);
  if(x==null||x<=0)return 0;
  if(x<2_000)return .05;
  if(x<5_000)return .18;
  if(x<10_000)return .32;
  if(x<25_000)return .50;
  if(x<75_000)return .72;
  if(x<250_000)return .88;
  return 1;
}
function microcapScore(mcap,fdv){
  const x=finite(mcap)??finite(fdv);
  if(x==null)return .45;
  if(x<20_000)return .30;
  if(x<=2_000_000)return 1;
  if(x<=10_000_000)return .65;
  if(x<=50_000_000)return .35;
  return .10;
}
function momentumScore(pct){
  const x=finite(pct);
  if(x==null)return .35;
  if(x<-35)return .05;
  if(x<0)return .25;
  if(x<=10)return .55+x/10*.15;
  if(x<=40)return .70+(x-10)/30*.20;
  if(x<=100)return .90-(x-40)/60*.20;
  return .45;
}
function activityScore(buys,sells){
  const n=Math.max(0,finite(buys)??0)+Math.max(0,finite(sells)??0);
  return clamp(Math.log1p(n)/Math.log(61));
}
function buyPressureScore(buys,sells){
  const b=Math.max(0,finite(buys)??0),s=Math.max(0,finite(sells)??0),n=b+s;
  if(n<3)return .35;
  const imbalance=(b-s)/n;
  return clamp(.5+.5*imbalance);
}
function volumeLiquidityScore(volume,liquidity){
  const r=ratio(volume,liquidity);
  return r==null?0:clamp(r/.50);
}
function riskFlags(row,ageMin){
  const liq=finite(row?.liquidityUsd);
  const buys=Math.max(0,finite(row?.buysM5)??0),sells=Math.max(0,finite(row?.sellsM5)??0);
  const fdv=finite(row?.fdv),mcap=finite(row?.marketCap);
  const v5=finite(row?.volumeM5),p5=finite(row?.priceChangeM5);
  const out=[];
  if(liq==null||liq<=0)out.push('LIQUIDITY_UNKNOWN');
  else if(liq<3_000)out.push('LIQUIDITY_EXTREME_THIN');
  else if(liq<10_000)out.push('LIQUIDITY_VERY_THIN');
  else if(liq<25_000)out.push('LIQUIDITY_THIN');
  if(buys+sells<3)out.push('LOW_M5_ACTIVITY');
  if(buys>=8&&sells===0)out.push('ONE_SIDED_NO_SELLS_OBSERVED');
  if(liq>0&&fdv!=null&&fdv/liq>120)out.push('FDV_LIQUIDITY_STRETCHED');
  if(liq>0&&mcap!=null&&mcap/liq>120)out.push('MCAP_LIQUIDITY_STRETCHED');
  if(liq>0&&mcap!=null&&mcap>0&&(liq/mcap>=20||(liq>=250_000&&mcap<10_000)))out.push('DATA_ANOMALY_MCAP_LIQUIDITY');
  if(liq>0&&fdv!=null&&fdv>0&&liq/fdv>=20)out.push('DATA_ANOMALY_FDV_LIQUIDITY');
  if(p5!=null&&p5<=-80)out.push('M5_CRASH_EXTREME');
  else if(p5!=null&&p5<=-50)out.push('M5_DRAWDOWN_SEVERE');
  if(p5!=null&&p5>100)out.push('M5_CHASE_RISK');
  if(v5!=null&&liq>0&&v5/liq>4)out.push('EXTREME_TURNOVER');
  if(ageMin!=null&&ageMin<10)out.push('ULTRA_NEW_PAIR');
  return out;
}
function attentionSignals(row){
  const s=[];
  if(row?.signalNewPool)s.push('NEW_POOL');
  if(row?.signalProfile)s.push('NEW_PROFILE');
  if(row?.signalBoost)s.push('NEW_BOOST');
  if(row?.signalTakeover)s.push('COMMUNITY_TAKEOVER');
  if(row?.signalAd)s.push('DEX_AD');
  if(row?.xLinked)s.push('X_LINKED_PROFILE');
  if(row?.websiteLinked)s.push('WEBSITE');
  if(Number(row?.externalAttentionCount||0)>0)s.push('EXTERNAL_MENTION');
  if(Number(row?.directSocialAttention?.posts||0)>0)s.push('SOCIAL_POSTS_RECENT');
  if(String(row?.directSocialAttention?.attentionBand||'')==='SPIKING')s.push('SOCIAL_ATTENTION_SPIKE');
  if(Number(row?.directSocialAttention?.maxAuthorFollowers||0)>=10_000)s.push('SOCIAL_HIGH_REACH_AUTHOR');
  const platforms=Array.isArray(row?.directSocialAttention?.platforms)?row.directSocialAttention.platforms:[];
  if(platforms.includes('X'))s.push('X_DIRECT_POST');
  if(platforms.includes('BLUESKY'))s.push('BLUESKY_DIRECT_POST');
  return s;
}
function attentionScore(row){
  let s=0;
  if(row?.signalNewPool)s+=.08;
  if(row?.signalProfile)s+=.22;
  if(row?.signalBoost)s+=.26;
  if(row?.signalTakeover)s+=.22;
  if(row?.signalAd)s+=.10;
  if(row?.xLinked)s+=.12;
  if(row?.websiteLinked)s+=.04;
  if(Number(row?.externalAttentionCount||0)>0)s+=Math.min(.16,.05*Number(row.externalAttentionCount));
  const xp=Math.max(0,Number(row?.directSocialAttention?.posts||0));
  const xa=Math.max(0,Number(row?.directSocialAttention?.uniqueAuthors||0));
  const xe=Math.max(0,Number(row?.directSocialAttention?.engagement||0));
  if(xp>0)s+=Math.min(.22,.05*xp+.025*xa+Math.min(.07,Math.log1p(xe)/100));
  if(String(row?.directSocialAttention?.attentionBand||'')==='SPIKING')s+=.10;
  return clamp(s);
}

export function scoreEarlyMemecoin(row,{now=Date.now()}={}){
  const ageMin=ageMinutes(row?.pairCreatedAt,now);
  const components={
    recency:recencyScore(ageMin),
    attention:attentionScore(row),
    activity:activityScore(row?.buysM5,row?.sellsM5),
    buyPressure:buyPressureScore(row?.buysM5,row?.sellsM5),
    volumeLiquidity:volumeLiquidityScore(row?.volumeM5,row?.liquidityUsd),
    momentum:momentumScore(row?.priceChangeM5),
    liquidity:liquidityScore(row?.liquidityUsd),
    microcap:microcapScore(row?.marketCap,row?.fdv)
  };
  const flags=riskFlags(row,ageMin);
  let penalty=0;
  for(const f of flags){
    if(f==='LIQUIDITY_EXTREME_THIN'||f==='LIQUIDITY_UNKNOWN')penalty+=.26;
    else if(f==='LIQUIDITY_VERY_THIN')penalty+=.16;
    else if(f==='LIQUIDITY_THIN')penalty+=.07;
    else if(f==='ONE_SIDED_NO_SELLS_OBSERVED')penalty+=.16;
    else if(f==='FDV_LIQUIDITY_STRETCHED'||f==='MCAP_LIQUIDITY_STRETCHED')penalty+=.08;
    else if(f==='DATA_ANOMALY_MCAP_LIQUIDITY'||f==='DATA_ANOMALY_FDV_LIQUIDITY')penalty+=.30;
    else if(f==='M5_CRASH_EXTREME')penalty+=.35;
    else if(f==='M5_DRAWDOWN_SEVERE')penalty+=.15;
    else if(f==='M5_CHASE_RISK')penalty+=.08;
    else if(f==='LOW_M5_ACTIVITY')penalty+=.05;
  }
  const raw=
    .24*components.recency+
    .19*components.attention+
    .17*components.activity+
    .12*components.buyPressure+
    .09*components.volumeLiquidity+
    .08*components.momentum+
    .07*components.liquidity+
    .04*components.microcap;
  const score=clamp(raw-penalty);
  let stage='WATCH';
  if(ageMin!=null&&ageMin<=60&&score>=.56)stage='NEW_NOW';
  else if(ageMin!=null&&ageMin<=360&&score>=.46)stage='EARLY';
  else if(components.attention>=.45&&score>=.38)stage='ATTENTION';
  const hardRiskFlags=new Set([
    'LIQUIDITY_EXTREME_THIN','LIQUIDITY_UNKNOWN','M5_CRASH_EXTREME',
    'DATA_ANOMALY_MCAP_LIQUIDITY','DATA_ANOMALY_FDV_LIQUIDITY'
  ]);
  if(flags.some(f=>hardRiskFlags.has(f)))stage='RISK_ONLY';
  return Object.freeze({
    researchPriorityScore:Number(score.toFixed(4)),
    stage,
    ageMinutes:ageMin==null?null:Number(ageMin.toFixed(1)),
    components:Object.freeze(Object.fromEntries(Object.entries(components).map(([k,v])=>[k,Number(v.toFixed(4))]))),
    attentionSignals:Object.freeze(attentionSignals(row)),
    riskFlags:Object.freeze(flags),
    epistemic:'RESEARCH_PRIORITY_NOT_PROFIT_PROBABILITY'
  });
}

function normalizeDexPair(pair={}){
  const m5=pair?.txns?.m5||{},h1=pair?.txns?.h1||{};
  const socials=(Array.isArray(pair?.info?.socials)?pair.info.socials:[]).map(x=>({
    type:text(x?.platform||x?.type,30).toLowerCase(),
    label:text(x?.handle||x?.label,80),
    url:text(x?.url||(
      String(x?.platform||'').toLowerCase()==='twitter'&&x?.handle?'https://x.com/'+String(x.handle).replace(/^@/,''):''
    ),500)
  })).filter(x=>x.url||x.label);
  const websites=(Array.isArray(pair?.info?.websites)?pair.info.websites:[]).map(x=>({type:'website',label:'website',url:text(x?.url,500)})).filter(x=>x.url);
  return {
    chainId:normChain(pair?.chainId),
    tokenAddress:text(pair?.baseToken?.address,200),
    pairAddress:text(pair?.pairAddress,200),
    dexId:text(pair?.dexId,80),
    url:text(pair?.url,500),
    symbol:text(pair?.baseToken?.symbol,80),
    name:text(pair?.baseToken?.name,120),
    quoteSymbol:text(pair?.quoteToken?.symbol,80),
    priceUsd:finite(pair?.priceUsd),
    liquidityUsd:finite(pair?.liquidity?.usd),
    volumeM5:finite(pair?.volume?.m5),
    volumeH1:finite(pair?.volume?.h1),
    volumeH24:finite(pair?.volume?.h24),
    buysM5:Math.max(0,Math.floor(finite(m5?.buys)??0)),
    sellsM5:Math.max(0,Math.floor(finite(m5?.sells)??0)),
    buysH1:Math.max(0,Math.floor(finite(h1?.buys)??0)),
    sellsH1:Math.max(0,Math.floor(finite(h1?.sells)??0)),
    priceChangeM5:finite(pair?.priceChange?.m5),
    priceChangeH1:finite(pair?.priceChange?.h1),
    marketCap:finite(pair?.marketCap),
    fdv:finite(pair?.fdv),
    pairCreatedAt:finite(pair?.pairCreatedAt),
    links:[...socials,...websites],
    xLinked:xLinked([...socials,...websites]),
    websiteLinked:websiteLinked([...socials,...websites])
  };
}

function normalizeGeckoPool(row={},includedMap=new Map(),network=''){
  const a=row?.attributes||{};
  const rel=row?.relationships||{};
  const baseId=rel?.base_token?.data?.id;
  const quoteId=rel?.quote_token?.data?.id;
  const base=includedMap.get(baseId)?.attributes||{};
  const quote=includedMap.get(quoteId)?.attributes||{};
  const tx5=a?.transactions?.m5||{},tx1=a?.transactions?.h1||{};
  const created=Date.parse(a?.pool_created_at||'');
  return {
    chainId:normChain(network),
    tokenAddress:text(base?.address||baseId?.split('_').slice(1).join('_'),200),
    pairAddress:text(a?.address||row?.id?.split('_').slice(1).join('_'),200),
    dexId:text(rel?.dex?.data?.id,80),
    url:'',
    symbol:text(base?.symbol||a?.name?.split(' / ')[0],80),
    name:text(base?.name||a?.name?.split(' / ')[0],120),
    quoteSymbol:text(quote?.symbol||a?.name?.split(' / ')[1],80),
    priceUsd:finite(a?.base_token_price_usd),
    liquidityUsd:finite(a?.reserve_in_usd),
    volumeM5:finite(a?.volume_usd?.m5),
    volumeH1:finite(a?.volume_usd?.h1),
    volumeH24:finite(a?.volume_usd?.h24),
    buysM5:Math.max(0,Math.floor(finite(tx5?.buys)??0)),
    sellsM5:Math.max(0,Math.floor(finite(tx5?.sells)??0)),
    buysH1:Math.max(0,Math.floor(finite(tx1?.buys)??0)),
    sellsH1:Math.max(0,Math.floor(finite(tx1?.sells)??0)),
    priceChangeM5:finite(a?.price_change_percentage?.m5),
    priceChangeH1:finite(a?.price_change_percentage?.h1),
    marketCap:finite(a?.market_cap_usd),
    fdv:finite(a?.fdv_usd),
    pairCreatedAt:Number.isFinite(created)?created:null,
    links:[],
    xLinked:false,
    websiteLinked:false
  };
}

function unixMs(v){
  const n=finite(v);
  if(n==null)return null;
  return n<10_000_000_000?n*1000:n;
}
function normalizeGmgnTrend(row={},rank=null){
  const links=[
    row?.twitter_username?{type:'x',label:text(row.twitter_username,80),url:'https://x.com/'+String(row.twitter_username).replace(/^@/,'')}:null,
    row?.website?{type:'website',label:'website',url:text(row.website,500)}:null,
    row?.telegram?{type:'telegram',label:'telegram',url:text(row.telegram,500)}:null
  ].filter(Boolean);
  const gmgnAgeAt=unixMs(row?.open_timestamp)??unixMs(row?.creation_timestamp)??unixMs(row?.pool_creation_timestamp);
  return {
    chainId:'solana',
    tokenAddress:text(row?.address,200),
    pairAddress:text(row?.pool_address||row?.pair_address||'',200),
    dexId:'gmgn',
    url:row?.address?'https://gmgn.ai/sol/token/'+encodeURIComponent(String(row.address)):'',
    symbol:text(row?.symbol,80),
    name:text(row?.name||row?.symbol,120),
    quoteSymbol:'SOL',
    priceUsd:finite(row?.price),
    liquidityUsd:finite(row?.liquidity),
    volumeM5:finite(row?.volume),
    volumeH1:finite(row?.volume_1h??row?.volume),
    volumeH24:finite(row?.volume_24h),
    buysM5:Math.max(0,Math.floor(finite(row?.buys)??0)),
    sellsM5:Math.max(0,Math.floor(finite(row?.sells)??0)),
    buysH1:Math.max(0,Math.floor(finite(row?.buys_1h??row?.buys)??0)),
    sellsH1:Math.max(0,Math.floor(finite(row?.sells_1h??row?.sells)??0)),
    priceChangeM5:finite(row?.price_change_percent5m),
    priceChangeH1:finite(row?.price_change_percent1h),
    priceChangeSelectedPct:finite(row?.price_change_percent),
    marketCap:finite(row?.market_cap),
    fdv:finite(row?.fdv),
    pairCreatedAt:gmgnAgeAt,
    gmgnOpenTimestamp:unixMs(row?.open_timestamp),
    gmgnPoolCreationTimestamp:unixMs(row?.creation_timestamp)??unixMs(row?.pool_creation_timestamp),
    holderCount:finite(row?.holder_count),
    smartBuy24h:finite(row?.smart_buy_24h),
    smartSell24h:finite(row?.smart_sell_24h),
    links,
    xLinked:xLinked(links),
    websiteLinked:websiteLinked(links),
    signalTrending:true,
    signalNewPair:false,
    gmgnExactTrend:true,
    trendRank:rank==null?null:Number(rank),
    trendSource:'GMGN_OPENAPI_TRENDS'
  };
}

function mergeCandidate(base={},extra={}){
  const pick=(a,b)=>a!=null&&a!==''?a:b;
  return {
    ...base,
    ...extra,
    chainId:pick(extra.chainId,base.chainId),
    tokenAddress:pick(extra.tokenAddress,base.tokenAddress),
    pairAddress:pick(extra.pairAddress,base.pairAddress),
    symbol:pick(extra.symbol,base.symbol),
    name:pick(extra.name,base.name),
    priceUsd:pick(extra.priceUsd,base.priceUsd),
    liquidityUsd:pick(extra.liquidityUsd,base.liquidityUsd),
    volumeM5:pick(extra.volumeM5,base.volumeM5),
    volumeH1:pick(extra.volumeH1,base.volumeH1),
    volumeH24:pick(extra.volumeH24,base.volumeH24),
    buysM5:pick(extra.buysM5,base.buysM5),
    sellsM5:pick(extra.sellsM5,base.sellsM5),
    buysH1:pick(extra.buysH1,base.buysH1),
    sellsH1:pick(extra.sellsH1,base.sellsH1),
    priceChangeM5:pick(extra.priceChangeM5,base.priceChangeM5),
    priceChangeH1:pick(extra.priceChangeH1,base.priceChangeH1),
    priceChangeSelectedPct:pick(extra.priceChangeSelectedPct,base.priceChangeSelectedPct),
    marketCap:pick(extra.marketCap,base.marketCap),
    fdv:pick(extra.fdv,base.fdv),
    pairCreatedAt:pick(extra.pairCreatedAt,base.pairCreatedAt),
    links:[...compactLinks(base.links),...compactLinks(extra.links)].filter((x,i,a)=>a.findIndex(y=>y.url===x.url)===i).slice(0,12),
    xLinked:Boolean(base.xLinked||extra.xLinked),
    websiteLinked:Boolean(base.websiteLinked||extra.websiteLinked),
    signalNewPool:Boolean(base.signalNewPool||extra.signalNewPool),
    signalProfile:Boolean(base.signalProfile||extra.signalProfile),
    signalBoost:Boolean(base.signalBoost||extra.signalBoost),
    signalTakeover:Boolean(base.signalTakeover||extra.signalTakeover),
    signalAd:Boolean(base.signalAd||extra.signalAd)
  };
}

export function applyExternalMemecoinAttention(snapshot,events=[]){
  const rows=(Array.isArray(snapshot?.rows)?snapshot.rows:[]).map(row=>{
    const symbol=String(row?.symbol||'').trim();
    const name=String(row?.name||'').trim();
    const needles=[
      name.length>=5?name.toLowerCase():null,
      symbol.length>=4?'$'+symbol.toLowerCase():null
    ].filter(Boolean);
    const matches=(Array.isArray(events)?events:[]).filter(event=>{
      const hay=(String(event?.title||'')+' '+String(event?.summary||event?.description||'')).toLowerCase();
      return needles.some(n=>hay.includes(n));
    }).slice(-5);
    const enriched={...row,externalAttentionCount:matches.length,externalAttention:matches.map(x=>({
      title:text(x?.title,180),url:text(x?.url,500),source:text(x?.source,80),availableAt:finite(x?.availableAt||x?.timestamp)
    }))};
    return Object.freeze({...enriched,score:scoreEarlyMemecoin(enriched,{now:snapshot?.capturedAt||Date.now()})});
  }).sort((a,b)=>Number(b?.score?.researchPriorityScore||0)-Number(a?.score?.researchPriorityScore||0));
  return Object.freeze({...snapshot,rows:Object.freeze(rows)});
}

export function createMemecoinEarlyRadarProvider({
  fetchImpl=globalThis.fetch,
  dexBase='https://api.dexscreener.com',
  geckoBase='https://api.geckoterminal.com/api/v2',
  gmgnBase='https://gmgn.ai',
  gmgnOpenApiBase='https://openapi.gmgn.ai',
  gmgnApiKey='gmgn_solbscbaseethmonadtron',
  timeoutMs=7000,
  dexCacheMs=15000,
  geckoCacheMs=60000,
  ultraGeckoCacheMs=5000,
  ultraDexCacheMs=5000,
  gmgnTrendCacheMs=5000,
  gmgnTrendInterval='1m',
  gmgnTrendOrderBy='default',
  gmgnTrendMinPriceChangePct=null,
  networks=['solana','base','ethereum'],
  pairLookupLimit=10,
  now=()=>Date.now()
}={}){
  if(typeof fetchImpl!=='function')throw new Error('fetch implementation required');
  const cache=new Map();
  const firstSeen=new Map();
  const dex=String(dexBase).replace(/\/+$/,'');
  const gecko=String(geckoBase).replace(/\/+$/,'');
  const gmgn=String(gmgnBase).replace(/\/+$/,'');
  const gmgnOpenApi=String(gmgnOpenApiBase).replace(/\/+$/,'');
  const gmgnReadApiKey=String(gmgnApiKey||'').trim();
  const allowedGmgnTrendIntervals=new Set(['1m','5m','1h','6h','24h']);
  const gmgnTrendWindow=allowedGmgnTrendIntervals.has(String(gmgnTrendInterval||'').trim())
    ?String(gmgnTrendInterval).trim()
    :'1h';
  const gmgnTrendWindowLabel=gmgnTrendWindow.toUpperCase();
  const gmgnTrendSort=String(gmgnTrendOrderBy||'default').trim()||'default';
  const gmgnTrendMinChange=finite(gmgnTrendMinPriceChangePct);

  async function getJson(url,{headers={}}={}){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),Math.max(1000,Number(timeoutMs)||7000));
    try{
      const res=await fetchImpl(url,{headers:{accept:'application/json','user-agent':'BIGGJ/1.0 early-memecoin-research',...headers},signal:controller.signal});
      if(!res?.ok)throw new Error('HTTP_'+String(res?.status??'UNKNOWN')+' '+url);
      return await res.json();
    }finally{clearTimeout(timer);}
  }
  async function cached(key,ttl,fn,{force=false}={}){
    const t=Number(now()),hit=cache.get(key);
    if(!force&&hit&&t-hit.at<ttl)return hit.value;
    const value=await fn();
    cache.set(key,{at:t,value});
    return value;
  }
  async function dexList(path,{force=false}={}){
    return cached('dex:'+path,dexCacheMs,async()=>{
      const body=await getJson(dex+path);
      return Array.isArray(body)?body:[];
    },{force});
  }
  async function dexPairs(chain,address,{force=false}={}){
    return cached('pair:'+tokenKey(chain,address),dexCacheMs,async()=>{
      const body=await getJson(dex+'/token-pairs/v1/'+encodeURIComponent(chain)+'/'+encodeURIComponent(address));
      return (Array.isArray(body)?body:[]).map(normalizeDexPair);
    },{force});
  }
  async function geckoNewPools(network,{force=false}={}){
    const n=geckoNetwork(network);
    return cached('gecko:'+n,geckoCacheMs,async()=>{
      const body=await getJson(gecko+'/networks/'+encodeURIComponent(n)+'/new_pools?include=base_token%2Cquote_token&page=1');
      const included=new Map((Array.isArray(body?.included)?body.included:[]).map(x=>[x?.id,x]));
      return (Array.isArray(body?.data)?body.data:[]).map(x=>normalizeGeckoPool(x,included,network)).filter(x=>x.tokenAddress);
    },{force});
  }
  async function geckoTrendingPoolsUltraSolana({force=false}={}){
    return cached('ultra:gecko:solana:trending',Math.max(1000,Number(ultraGeckoCacheMs)||5000),async()=>{
      const body=await getJson(gecko+'/networks/solana/trending_pools?include=base_token%2Cquote_token&page=1');
      const included=new Map((Array.isArray(body?.included)?body.included:[]).map(x=>[x?.id,x]));
      return (Array.isArray(body?.data)?body.data:[]).map((x,i)=>({
        ...normalizeGeckoPool(x,included,'solana'),
        signalTrending:true,
        trendRank:i+1
      })).filter(x=>x.tokenAddress);
    },{force});
  }
  async function geckoNewPairsUltraSolana({force=false}={}){
    return cached('ultra:gecko:solana:new-pairs',Math.max(10_000,Number(ultraGeckoCacheMs)||30_000),async()=>{
      const body=await getJson(gecko+'/networks/solana/new_pools?include=base_token%2Cquote_token&page=1');
      const included=new Map((Array.isArray(body?.included)?body.included:[]).map(x=>[x?.id,x]));
      return (Array.isArray(body?.data)?body.data:[]).map((x,i)=>({
        ...normalizeGeckoPool(x,included,'solana'),
        signalTrending:true,
        signalNewPair:true,
        trendRank:i+1,
        trendSource:'GECKOTERMINAL_NEW_PAIRS'
      })).filter(x=>x.tokenAddress);
    },{force});
  }


  async function dexTopBoostsUltraSolana({force=false}={}){
    return cached('ultra:dex:solana:top-boosts',Math.max(3000,Number(ultraDexCacheMs)||5000),async()=>{
      const body=await getJson(dex+'/token-boosts/top/v1');
      const boosts=(Array.isArray(body)?body:[])
        .filter(x=>String(x?.chainId||'').toLowerCase()==='solana'&&String(x?.tokenAddress||'').trim())
        .slice(0,30);
      if(!boosts.length)return [];
      const dexRows=await dexBatchTokens('solana',boosts.map(x=>String(x.tokenAddress)),{force});
      const byToken=new Map();
      for(const row of dexRows){
        const key=tokenKey('solana',row?.tokenAddress);
        if(!key)continue;
        const prior=byToken.get(key);
        if(!prior||(finite(row?.liquidityUsd)??-1)>(finite(prior?.liquidityUsd)??-1))byToken.set(key,row);
      }
      return boosts.map((boost,i)=>{
        const row=byToken.get(tokenKey('solana',boost?.tokenAddress));
        if(!row)return null;
        return {
          ...row,
          signalTrending:true,
          signalBoost:true,
          trendRank:i+1,
          trendSource:'DEXSCREENER_TOP_BOOSTS',
          freeTrendSources:['DEXSCREENER_TOP_BOOSTS'],
          boostAmount:finite(boost?.amount),
          boostTotalAmount:finite(boost?.totalAmount)
        };
      }).filter(Boolean);
    },{force});
  }

  async function freeTrendingCompositeSolana({force=false}={}){
    const settled=await Promise.allSettled([
      geckoTrendingPoolsUltraSolana({force}),
      dexTopBoostsUltraSolana({force})
    ]);
    const sourceErrors=[];
    const sources=[];
    if(settled[0].status==='fulfilled')sources.push(['GECKOTERMINAL_TRENDING',settled[0].value]);
    else sourceErrors.push('gecko:solana:trending:'+(settled[0].reason instanceof Error?settled[0].reason.message:String(settled[0].reason)));
    if(settled[1].status==='fulfilled')sources.push(['DEXSCREENER_TOP_BOOSTS',settled[1].value]);
    else sourceErrors.push('dex:solana:top-boosts:'+(settled[1].reason instanceof Error?settled[1].reason.message:String(settled[1].reason)));

    const merged=new Map();
    for(const [sourceName,rows] of sources){
      for(const row of Array.isArray(rows)?rows:[]){
        const key=tokenKey('solana',row?.tokenAddress);
        if(!key)continue;
        const prior=merged.get(key);
        if(!prior){
          merged.set(key,{
            ...row,
            signalTrending:true,
            signalNewPair:false,
            gmgnExactTrend:false,
            freeTrendSources:[sourceName],
            trendSource:'FREE_TRENDS_COMPOSITE_GECKO_DEXSCREENER'
          });
          continue;
        }
        const priorSources=new Set([...(prior?.freeTrendSources||[]),sourceName]);
        const priorCreated=finite(prior?.pairCreatedAt),rowCreated=finite(row?.pairCreatedAt);
        merged.set(key,{
          ...mergeCandidate(prior,row),
          pairCreatedAt:priorCreated!=null&&rowCreated!=null?Math.min(priorCreated,rowCreated):(priorCreated??rowCreated),
          signalTrending:true,
          signalNewPair:false,
          gmgnExactTrend:false,
          freeTrendSources:[...priorSources],
          trendRank:Math.min(finite(prior?.trendRank)??Infinity,finite(row?.trendRank)??Infinity),
          trendSource:'FREE_TRENDS_COMPOSITE_GECKO_DEXSCREENER'
        });
      }
    }
    const rows=[...merged.values()].sort((a,b)=>{
      const sourceDelta=(b?.freeTrendSources?.length||0)-(a?.freeTrendSources?.length||0);
      if(sourceDelta)return sourceDelta;
      return (finite(a?.trendRank)??999)-(finite(b?.trendRank)??999);
    });
    return {rows,errors:sourceErrors};
  }
  async function gmgnTrendingUltraSolana({force=false}={}){
    return cached('ultra:gmgn:openapi:solana:trending:'+gmgnTrendWindow+':default',Math.max(1000,Number(gmgnTrendCacheMs)||5000),async()=>{
      if(!gmgnReadApiKey)throw new Error('GMGN_API_KEY_MISSING');
      const timestamp=Math.floor(Number(now())/1000);
      const clientId=globalThis.crypto?.randomUUID?.()||('biggj-'+String(Number(now()))+'-'+Math.random().toString(16).slice(2));
      const demoKey=gmgnReadApiKey==='gmgn_solbscbaseethmonadtron';
      const qs=new URLSearchParams({
        chain:'sol',
        interval:gmgnTrendWindow,
        limit:demoKey?'3':'100',
        timestamp:String(timestamp),
        client_id:String(clientId)
      });
      // Mirror the official GMGN CLI: when the requested sort is "default",
      // omit order_by/direction entirely. Some OpenAPI tiers return data:null
      // for an explicit order_by=default even though the same request works
      // when those optional parameters are absent.
      if(gmgnTrendSort!=='default'){
        qs.set('order_by',gmgnTrendSort);
        qs.set('direction','desc');
      }
      // Keep discovery independent from the W6 strategy threshold. Sending the
      // extreme green-% threshold to GMGN can make a healthy rank endpoint
      // return data:null when nothing currently matches, which looks identical
      // to a broken source and prevents us from observing threshold crossings.
      // Fetch the rank feed unfiltered and let the W6 point-in-time gate apply
      // gmgnTrendMinChange locally to the observed GMGN value.
      const body=await getJson(gmgnOpenApi+'/v1/market/rank?'+qs.toString(),{
        headers:{
          'X-APIKEY':gmgnReadApiKey,
          'Content-Type':'application/json',
          'user-agent':'gmgn-cli/1.6.6'
        }
      });
      if(body?.code!=null&&Number(body.code)!==0)throw new Error('GMGN_OPENAPI_CODE_'+String(body.code)+'_'+text(body?.message||body?.msg||body?.error,120));
      const payload=body?.data??body;
      const raw=
        Array.isArray(payload?.rank)?payload.rank:
        Array.isArray(payload?.list)?payload.list:
        Array.isArray(payload?.tokens)?payload.tokens:
        Array.isArray(payload)?payload:
        [];
      if(!raw.length){
        const shape=payload&&typeof payload==='object'&&!Array.isArray(payload)?Object.keys(payload).slice(0,12).join(','):(Array.isArray(payload)?'ARRAY_0':typeof payload);
        const reason=text(body?.reason||body?.message||body?.msg||body?.error||'NO_REASON',180).replace(/\s+/g,'_');
        throw new Error('GMGN_OPENAPI_TREND_EMPTY_SHAPE_'+text(shape||'NONE',120)+'_REASON_'+reason);
      }
      return raw.map((x,i)=>({...normalizeGmgnTrend(x,i+1),trendSource:'GMGN_OPENAPI_TRENDS_'+gmgnTrendWindowLabel+'_DEFAULT'})).filter(x=>x.tokenAddress);
    },{force});
  }
  async function gmgnPublicTrendingUltraSolana({force=false}={}){
    return cached('ultra:gmgn:public:solana:trending:'+gmgnTrendWindow+':default',Math.max(1000,Number(gmgnTrendCacheMs)||5000),async()=>{
      const url=gmgn+'/defi/quotation/v1/rank/sol/swaps/'+encodeURIComponent(gmgnTrendWindow)+'?orderby='+encodeURIComponent(gmgnTrendSort)+'&direction=desc';
      const body=await getJson(url,{
        headers:{
          accept:'application/json, text/plain, */*',
          'accept-language':'en-US,en;q=0.9',
          'user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          referer:'https://gmgn.ai/trend',
          origin:'https://gmgn.ai'
        }
      });
      const raw=Array.isArray(body?.data?.rank)?body.data.rank:[];
      if(body?.code!=null&&Number(body.code)!==0)throw new Error('GMGN_PUBLIC_CODE_'+String(body.code)+'_'+text(body?.msg,120));
      if(!raw.length)throw new Error('GMGN_PUBLIC_TREND_EMPTY');
      return raw.map((x,i)=>({...normalizeGmgnTrend(x,i+1),trendSource:'GMGN_PUBLIC_TRENDS_'+gmgnTrendWindowLabel+'_DEFAULT'})).filter(x=>x.tokenAddress);
    },{force});
  }

  async function dexBatchTokens(chain,addresses,{force=false}={}){
    const xs=[...new Set((Array.isArray(addresses)?addresses:[]).map(x=>String(x||'').trim()).filter(Boolean))].slice(0,30);
    if(!xs.length)return [];
    const key='ultra:dex:'+normChain(chain)+':'+xs.join(',');
    return cached(key,Math.max(1000,Number(ultraDexCacheMs)||5000),async()=>{
      const body=await getJson(dex+'/tokens/v1/'+encodeURIComponent(normChain(chain))+'/'+xs.map(encodeURIComponent).join(','));
      const raw=Array.isArray(body)?body:(Array.isArray(body?.pairs)?body.pairs:[]);
      return raw.map(normalizeDexPair).filter(x=>x.tokenAddress);
    },{force});
  }

  async function fetchTokenSnapshot(chainId,tokenAddress,{force=false}={}){
    const capturedAt=Number(now());
    const pairs=await dexPairs(chainId,tokenAddress,{force});
    const best=pairs.slice().sort((a,b)=>{
      const la=finite(a?.liquidityUsd)??-1,lb=finite(b?.liquidityUsd)??-1;
      if(lb!==la)return lb-la;
      return (finite(b?.volumeM5)??-1)-(finite(a?.volumeM5)??-1);
    })[0]||null;
    if(!best)return null;
    const key=tokenKey(chainId,tokenAddress);
    if(!firstSeen.has(key))firstSeen.set(key,capturedAt);
    const row={...best,firstSeenAt:firstSeen.get(key),signalProfile:false,signalBoost:false,signalTakeover:false,signalAd:false};
    return Object.freeze({...row,score:scoreEarlyMemecoin(row,{now:capturedAt})});
  }

  async function fetchUltraEarlySolana({limit=30,maxAgeSeconds=180,trackTokenAddresses=[],candidateRows=[],force=false}={}){
    const capturedAt=Number(now());
    const maxAge=Math.max(60,Math.min(600,Number(maxAgeSeconds)||180));
    const errors=[];
    let pools=[];
    const hasAnyGmgnKey=Boolean(gmgnReadApiKey);
    let trendSource=hasAnyGmgnKey?'GMGN_OPENAPI_TRENDS_'+gmgnTrendWindowLabel+'_DEFAULT':'GMGN_PUBLIC_TRENDS_'+gmgnTrendWindowLabel+'_DEFAULT';
    let exactGmgn=false;
    // Railway's public gmgn.ai Trends endpoint can return HTTP 403. Prefer
    // openapi.gmgn.ai whenever any configured key is available, including the
    // built-in read-only demo key, and only then try the public web endpoint.
    if(hasAnyGmgnKey){
      try{
        pools=await gmgnTrendingUltraSolana({force});
        exactGmgn=true;
      }catch(err){
        errors.push('gmgn:openapi:solana:trending:'+(err instanceof Error?err.message:String(err)));
      }
    }
    // Preserve the user's exact GMGN Trends semantics before any independent
    // fallback. If OpenAPI is unavailable, try the public Trends endpoint; if
    // both fail we may enrich/monitor from free sources, but exactGmgn stays
    // false so the W6 green-% entry gate remains fail-closed.
    if(!pools.length){
      trendSource='GMGN_PUBLIC_TRENDS_'+gmgnTrendWindowLabel+'_DEFAULT';
      try{
        pools=await gmgnPublicTrendingUltraSolana({force});
        exactGmgn=true;
      }catch(publicErr){
        errors.push('gmgn:public:solana:trending:'+(publicErr instanceof Error?publicErr.message:String(publicErr)));
      }
    }
    if(!pools.length){
      trendSource='FREE_TRENDS_COMPOSITE_GECKO_DEXSCREENER';
      exactGmgn=false;
      const free=await freeTrendingCompositeSolana({force});
      pools=free.rows;
      errors.push(...free.errors);
    }
    const fresh=pools.filter(row=>{
      const created=finite(row?.pairCreatedAt);
      if(created==null)return false;
      const age=Math.max(0,(capturedAt-created)/1000);
      return age<=maxAge;
    }).sort((a,b)=>(finite(b?.pairCreatedAt)??0)-(finite(a?.pairCreatedAt)??0)).slice(0,30);

    const tracked=[...new Set((Array.isArray(trackTokenAddresses)?trackTokenAddresses:[]).map(x=>String(x||'').trim()).filter(Boolean))];
    const candidateMap=new Map();
    for(const row of Array.isArray(candidateRows)?candidateRows:[]){
      const address=String(row?.tokenAddress||'').trim();
      if(!address)continue;
      candidateMap.set(tokenKey('solana',address),row);
    }
    const candidateAddresses=[...candidateMap.values()].map(x=>String(x?.tokenAddress||'')).filter(Boolean);
    const allAddresses=[...new Set([...fresh.map(x=>x.tokenAddress),...candidateAddresses,...tracked])];
    const chunks=[];
    for(let i=0;i<allAddresses.length;i+=30)chunks.push(allAddresses.slice(i,i+30));
    const dexRows=[];
    if(chunks.length){
      const settled=await Promise.allSettled(chunks.map(xs=>dexBatchTokens('solana',xs,{force})));
      settled.forEach((r,i)=>{
        if(r.status==='fulfilled')dexRows.push(...r.value);
        else errors.push('dex:batch:'+i+':'+(r.reason instanceof Error?r.reason.message:String(r.reason)));
      });
    }
    const byToken=new Map();
    for(const row of dexRows){
      const key=tokenKey('solana',row?.tokenAddress);
      if(!key)continue;
      const prior=byToken.get(key);
      if(!prior){
        byToken.set(key,row);
        continue;
      }
      const priorLiq=finite(prior?.liquidityUsd)??-1,rowLiq=finite(row?.liquidityUsd)??-1;
      if(rowLiq>priorLiq)byToken.set(key,row);
    }

    const freshRows=fresh.map(pool=>{
      const key=tokenKey('solana',pool.tokenAddress);
      const dexRow=byToken.get(key)||null;
      const merged=dexRow?mergeCandidate(pool,dexRow):pool;
      const created=finite(pool?.pairCreatedAt);
      if(!firstSeen.has(key))firstSeen.set(key,capturedAt);
      return {
        ...merged,
        chainId:'solana',
        tokenAddress:pool.tokenAddress,
        pairAddress:pool.pairAddress||merged.pairAddress,
        pairCreatedAt:created,
        firstSeenAt:firstSeen.get(key),
        signalNewPool:false,
        signalTrending:true,
        signalNewPair:false,
        gmgnExactTrend:pool?.gmgnExactTrend===true,
        trendSource:text(pool?.trendSource||trendSource,80),
        trendRank:finite(pool?.trendRank),
        ultraEarly:true,
        sourceSetup:pool?.gmgnExactTrend===true?'GMGN_TRENDS_1M':'TRENDS_PROXY_RESEARCH',
        w6TrackingOnly:false,
        ultraSource:dexRow?(text(pool?.trendSource||trendSource,80)+'_PLUS_DEXSCREENER_BATCH'):text(pool?.trendSource||trendSource,80)
      };
    });
    const freshKeys=new Set(freshRows.map(x=>tokenKey('solana',x.tokenAddress)));
    const candidateTrackingRows=[...candidateMap.entries()].map(([key,candidate])=>{
      if(freshKeys.has(key))return null;
      const dexRow=byToken.get(key);
      if(!dexRow)return null;
      if(!firstSeen.has(key))firstSeen.set(key,finite(candidate?.firstSeenAt)??capturedAt);
      const merged=mergeCandidate(candidate,dexRow);
      return {
        ...merged,
        chainId:'solana',
        tokenAddress:String(candidate?.tokenAddress||dexRow?.tokenAddress||''),
        pairAddress:String(candidate?.pairAddress||merged?.pairAddress||''),
        pairCreatedAt:finite(candidate?.pairCreatedAt)??finite(dexRow?.pairCreatedAt),
        firstSeenAt:finite(candidate?.firstSeenAt)??firstSeen.get(key),
        signalNewPool:false,
        signalTrending:false,
        signalNewPair:false,
        wasTrending:true,
        gmgnExactTrend:candidate?.gmgnExactTrend===true,
        trendSource:text(candidate?.trendSource||'W6_TREND_MEMORY',80),
        ultraEarly:true,
        candidateTracking:true,
        w6TrackingOnly:false,
        ultraSource:'W6_TREND_CANDIDATE_MEMORY_PLUS_DEXSCREENER_BATCH'
      };
    }).filter(Boolean);
    const candidateKeys=new Set(candidateTrackingRows.map(x=>tokenKey('solana',x.tokenAddress)));
    const trackingRows=tracked.map(address=>{
      const key=tokenKey('solana',address);
      if(freshKeys.has(key)||candidateKeys.has(key))return null;
      const dexRow=byToken.get(key);
      if(!dexRow)return null;
      if(!firstSeen.has(key))firstSeen.set(key,capturedAt);
      return {
        ...dexRow,
        firstSeenAt:firstSeen.get(key),
        ultraEarly:false,
        signalTrending:false,
        signalNewPair:false,
        candidateTracking:false,
        w6TrackingOnly:true,
        ultraSource:'DEXSCREENER_BATCH_POSITION_TRACKING'
      };
    }).filter(Boolean);

    const rows=[...freshRows,...candidateTrackingRows,...trackingRows].filter(row=>!obviousNonMeme(row)).map(row=>{
      const created=finite(row?.pairCreatedAt);
      const ageSeconds=created==null?null:Math.max(0,(capturedAt-created)/1000);
      return Object.freeze({...row,ageSeconds:ageSeconds==null?null:Number(ageSeconds.toFixed(3)),score:scoreEarlyMemecoin(row,{now:capturedAt})});
    }).sort((a,b)=>{
      if(Boolean(a?.w6TrackingOnly)!==Boolean(b?.w6TrackingOnly))return a?.w6TrackingOnly?1:-1;
      return (finite(a?.ageSeconds)??Infinity)-(finite(b?.ageSeconds)??Infinity);
    });
    const discoveryCount=rows.filter(x=>x?.w6TrackingOnly!==true).length;
    const selected=rows.filter(x=>x?.w6TrackingOnly===true||x?.candidateTracking===true||rows.indexOf(x)<Math.max(1,Math.min(30,Number(limit)||30)));

    return Object.freeze({
      version:W6_ULTRA_EARLY_FEED_VERSION,
      capturedAt,
      rows:Object.freeze(selected),
      errors:Object.freeze(errors),
      source:trendSource,
      exactGmgn,
      trendInterval:gmgnTrendWindow,
      trendOrderBy:gmgnTrendSort,
      minPriceChangePct:gmgnTrendMinChange,
      setup:exactGmgn?'GMGN_TRENDS_1M':'TRENDS_PROXY_RESEARCH',
      sourceReady:errors.length===0||selected.length>0,
      discoveryRows:discoveryCount,
      candidateTrackingRows:selected.filter(x=>x?.candidateTracking===true).length,
      trackingRows:selected.filter(x=>x?.w6TrackingOnly===true).length,
      pollTargetSeconds:Number((Math.max(1000,Number(ultraGeckoCacheMs)||5000)/1000).toFixed(1)),
      maxAgeSeconds:maxAge,
      execution:'SHADOW_ONLY',
      canExecute:false,
      canExecuteLive:false
    });
  }


  async function fetchEarlyRadar({limit=12,force=false}={}){
    const capturedAt=Number(now());
    const [profilesR,boostsR,takeoversR,adsR,...poolRs]=await Promise.allSettled([
      dexList('/token-profiles/latest/v1',{force}),
      dexList('/token-boosts/latest/v1',{force}),
      dexList('/community-takeovers/latest/v1',{force}),
      dexList('/ads/latest/v1',{force}),
      ...networks.map(n=>geckoNewPools(n,{force}))
    ]);
    const errors=[];
    const map=new Map();
    const put=(chain,address,patch)=>{
      const key=tokenKey(chain,address);if(!key)return;
      if(!firstSeen.has(key))firstSeen.set(key,capturedAt);
      map.set(key,mergeCandidate(map.get(key)||{
        chainId:normChain(chain),tokenAddress:String(address),firstSeenAt:firstSeen.get(key),
        signalProfile:false,signalBoost:false,signalTakeover:false,signalAd:false,links:[]
      },patch));
    };
    const consumeDex=(result,type)=>{
      if(result.status!=='fulfilled'){errors.push(type+':'+(result.reason instanceof Error?result.reason.message:String(result.reason)));return;}
      for(const x of result.value){
        const chain=normChain(x?.chainId),address=text(x?.tokenAddress,200);
        if(!networks.map(normChain).includes(chain)||!address)continue;
        const links=compactLinks(x?.links);
        put(chain,address,{
          description:text(x?.description,500),
          links,
          xLinked:xLinked(links),
          websiteLinked:websiteLinked(links),
          signalProfile:type==='profile',
          signalBoost:type==='boost',
          signalTakeover:type==='takeover',
          signalAd:type==='ad',
          boostAmount:type==='boost'?finite(x?.amount):null,
          boostTotalAmount:type==='boost'?finite(x?.totalAmount):null,
          takeoverClaimDate:type==='takeover'?text(x?.claimDate,80):'',
          adDate:type==='ad'?text(x?.date,80):''
        });
      }
    };
    consumeDex(profilesR,'profile');
    consumeDex(boostsR,'boost');
    consumeDex(takeoversR,'takeover');
    consumeDex(adsR,'ad');

    poolRs.forEach((r,i)=>{
      if(r.status!=='fulfilled'){
        errors.push('gecko:'+String(networks[i])+':'+(r.reason instanceof Error?r.reason.message:String(r.reason)));
        return;
      }
      for(const pool of r.value)put(pool.chainId,pool.tokenAddress,{...pool,signalNewPool:true});
    });

    const signalCandidates=[...map.values()]
      .filter(x=>x.signalProfile||x.signalBoost||x.signalTakeover||x.signalAd)
      .sort((a,b)=>Number(b.firstSeenAt||0)-Number(a.firstSeenAt||0))
      .slice(0,Math.max(1,Math.min(20,Number(pairLookupLimit)||10)));
    const pairSettled=await Promise.allSettled(signalCandidates.map(async x=>{
      const pairs=await dexPairs(x.chainId,x.tokenAddress,{force});
      const best=pairs.slice().sort((a,b)=>{
        const aa=finite(a?.pairCreatedAt)??Infinity,bb=finite(b?.pairCreatedAt)??Infinity;
        const ageA=Math.abs(capturedAt-aa),ageB=Math.abs(capturedAt-bb);
        const scoreA=(ageA<=24*60*60_000?1:0)+(finite(a?.liquidityUsd)??0)/1e7;
        const scoreB=(ageB<=24*60*60_000?1:0)+(finite(b?.liquidityUsd)??0)/1e7;
        return scoreB-scoreA;
      })[0];
      return {key:tokenKey(x.chainId,x.tokenAddress),pair:best};
    }));
    pairSettled.forEach((r,i)=>{
      if(r.status==='fulfilled'&&r.value?.pair){
        const prior=map.get(r.value.key)||{};
        map.set(r.value.key,mergeCandidate(prior,r.value.pair));
      }else if(r.status==='rejected'){
        errors.push('pair:'+String(signalCandidates[i]?.tokenAddress||'')+':'+(r.reason instanceof Error?r.reason.message:String(r.reason)));
      }
    });

    const rows=[...map.values()].filter(row=>!obviousNonMeme(row)).map(row=>{
      const links=compactLinks(row.links);
      const normalized={...row,links,xLinked:Boolean(row.xLinked||xLinked(links)),websiteLinked:Boolean(row.websiteLinked||websiteLinked(links))};
      return Object.freeze({...normalized,score:scoreEarlyMemecoin(normalized,{now:capturedAt})});
    }).filter(x=>{
      const age=x?.score?.ageMinutes;
      return age==null||age<=48*60;
    }).sort((a,b)=>{
      const stageRank={NEW_NOW:4,EARLY:3,ATTENTION:2,WATCH:1,RISK_ONLY:0};
      const d=(stageRank[b?.score?.stage]??0)-(stageRank[a?.score?.stage]??0);
      return d||Number(b?.score?.researchPriorityScore||0)-Number(a?.score?.researchPriorityScore||0);
    }).slice(0,Math.max(1,Math.min(30,Number(limit)||12)));

    return Object.freeze({
      version:MEMECOIN_EARLY_RADAR_VERSION,
      capturedAt,
      rows:Object.freeze(rows),
      errors:Object.freeze(errors),
      source:'DEXSCREENER_PLUS_GECKOTERMINAL_KEYLESS',
      sourceReady:rows.length>0,
      ranking:'EARLY_RESEARCH_PRIORITY_NOT_MARKET_CAP',
      safety:Object.freeze({
        honeypotVerified:false,
        holderConcentrationVerified:false,
        mintFreezeAuthorityVerified:false,
        lpLockVerified:false
      }),
      execution:'SHADOW_ONLY',
      canExecute:false,
      canExecuteLive:false
    });
  }

  return Object.freeze({version:MEMECOIN_EARLY_RADAR_VERSION,fetchEarlyRadar,fetchUltraEarlySolana,fetchTokenSnapshot});
}
