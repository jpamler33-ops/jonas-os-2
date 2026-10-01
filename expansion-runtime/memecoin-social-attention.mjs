export const MEMECOIN_SOCIAL_ATTENTION_VERSION='BIGGJ_MEMECOIN_SOCIAL_ATTENTION_V2';

function text(v,max=500){const s=String(v??'').replace(/\s+/g,' ').trim();return s.length<=max?s:s.slice(0,max-1)+'…';}
function finite(v){const n=Number(v);return Number.isFinite(n)?n:null;}
function freeze(v){if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.freeze(v);for(const x of Object.values(v))freeze(x);}return v;}
function extractSeeds(body=''){
  const s=String(body||'');
  const evm=[...new Set((s.match(/\b0x[a-fA-F0-9]{40}\b/g)||[]).map(x=>x.toLowerCase()))];
  const sol=[];
  const contextual=/(?:\bCA\b|contract|mint|pump\.fun\/coin\/|dexscreener\.com\/solana\/)[\s:=/-]*([1-9A-HJ-NP-Za-km-z]{32,44})/gi;
  for(const m of s.matchAll(contextual))sol.push(m[1]);
  const cashtags=[...new Set([...s.matchAll(/\$([A-Za-z][A-Za-z0-9_]{1,12})\b/g)].map(m=>m[1].toUpperCase()))];
  return {evmAddresses:evm,solanaAddresses:[...new Set(sol)],cashtags};
}
function xEngagement(post={}){
  const p=post?.public_metrics||{};
  return (finite(p.like_count)||0)+(finite(p.retweet_count)||0)*2+(finite(p.reply_count)||0)+(finite(p.quote_count)||0)*2;
}
function bskyEngagement(post={}){
  return (finite(post?.likeCount)||0)+(finite(post?.repostCount)||0)*2+(finite(post?.replyCount)||0)+(finite(post?.quoteCount)||0)*2;
}
function xQuery(){
  return '(memecoin OR "meme coin" OR "pump.fun" OR pumpfun OR "fair launch" OR "token launch" OR "contract address") -is:retweet lang:en';
}
function aggregateSeeds(posts=[]){
  const grouped=new Map();
  const add=(key,type,value,p)=>{
    if(!key)return;
    const g=grouped.get(key)||{
      key,type,value,posts:0,uniqueAuthors:new Set(),engagement:0,
      maxAuthorFollowers:0,latestAt:null,platforms:new Set()
    };
    g.posts++;
    g.uniqueAuthors.add(String(p.authorId||p.username||p.id||'unknown'));
    g.engagement+=Number(p.engagement||0);
    g.maxAuthorFollowers=Math.max(g.maxAuthorFollowers,finite(p.authorFollowers)||0);
    g.latestAt=Math.max(g.latestAt||0,finite(p.createdAt)||0)||null;
    if(p.platform)g.platforms.add(String(p.platform));
    grouped.set(key,g);
  };
  for(const p of posts){
    for(const a of p.seeds?.evmAddresses||[])add('evm:'+a,'EVM_ADDRESS',a,p);
    for(const a of p.seeds?.solanaAddresses||[])add('solana:'+a,'SOLANA_ADDRESS',a,p);
    for(const sym of p.seeds?.cashtags||[])add('symbol:'+sym,'CASHTAG',sym,p);
  }
  return [...grouped.values()].map(g=>freeze({
    key:g.key,type:g.type,value:g.value,posts:g.posts,uniqueAuthors:g.uniqueAuthors.size,
    engagement:g.engagement,maxAuthorFollowers:g.maxAuthorFollowers,latestAt:g.latestAt,
    platforms:[...g.platforms].sort(),
    attentionBand:g.posts>=4&&g.uniqueAuthors.size>=3?'SPIKING':g.posts>=2?'MULTI_POST':'SINGLE_POST'
  })).sort((a,b)=>
    Number(b.attentionBand==='SPIKING')-Number(a.attentionBand==='SPIKING')||
    b.uniqueAuthors-a.uniqueAuthors||b.engagement-a.engagement
  );
}

export function createMemecoinSocialAttentionProvider({
  fetchImpl=globalThis.fetch,
  bearerToken='',
  xBaseUrl='https://api.x.com',
  blueskyBaseUrls=['https://api.bsky.app','https://public.api.bsky.app'],
  blueskyEnabled=true,
  blueskyQueries=['memecoin','meme coin','pump.fun'],
  timeoutMs=7000,
  cacheMs=60_000,
  now=()=>Date.now()
}={}){
  if(typeof fetchImpl!=='function')throw new Error('fetch implementation required');
  const token=String(bearerToken||'').trim();
  const xConfigured=Boolean(token);
  let cache=null;

  async function requestJson(url,{headers={}}={}){
    const c=new AbortController();
    const timer=setTimeout(()=>c.abort(),Math.max(1000,Number(timeoutMs)||7000));
    try{
      const res=await fetchImpl(url,{headers:{accept:'application/json','user-agent':'BIGGJ/1.0 meme-social',...headers},signal:c.signal});
      if(!res?.ok)throw new Error('HTTP_'+String(res?.status??'UNKNOWN'));
      return await res.json();
    }finally{clearTimeout(timer);}
  }

  async function fetchX(maxResults){
    if(!xConfigured)return {ok:false,missing:true,posts:[],error:null};
    try{
      const u=new URL(String(xBaseUrl).replace(/\/+$/,'')+'/2/tweets/search/recent');
      u.searchParams.set('query',xQuery());
      u.searchParams.set('max_results',String(Math.max(10,Math.min(100,Number(maxResults)||100))));
      u.searchParams.set('tweet.fields','created_at,public_metrics,author_id,lang,possibly_sensitive');
      u.searchParams.set('expansions','author_id');
      u.searchParams.set('user.fields','username,verified,verified_type,public_metrics,created_at');
      const body=await requestJson(u.toString(),{headers:{authorization:'Bearer '+token}});
      const users=new Map((Array.isArray(body?.includes?.users)?body.includes.users:[]).map(x=>[String(x?.id||''),x]));
      const posts=(Array.isArray(body?.data)?body.data:[]).map(p=>{
        const author=users.get(String(p?.author_id||''))||{};
        return freeze({
          platform:'X',id:String(p?.id||''),createdAt:Date.parse(p?.created_at||'')||null,
          text:text(p?.text,500),authorId:String(p?.author_id||''),username:text(author?.username,80),
          authorFollowers:finite(author?.public_metrics?.followers_count),authorVerified:Boolean(author?.verified),
          engagement:xEngagement(p),possiblySensitive:p?.possibly_sensitive===true,seeds:extractSeeds(p?.text)
        });
      });
      return {ok:true,missing:false,posts,error:null};
    }catch(err){
      return {ok:false,missing:false,posts:[],error:'X_'+(err instanceof Error?err.message:String(err))};
    }
  }

  async function fetchBluesky(maxResults){
    if(!blueskyEnabled)return {ok:false,missing:true,posts:[],error:null,sourceBase:null};
    const bases=(Array.isArray(blueskyBaseUrls)?blueskyBaseUrls:[blueskyBaseUrls]).map(x=>String(x||'').replace(/\/+$/,'')).filter(Boolean);
    const errors=[];
    for(const base of bases){
      const settled=await Promise.allSettled((Array.isArray(blueskyQueries)?blueskyQueries:[]).slice(0,4).map(async q=>{
        const u=new URL(base+'/xrpc/app.bsky.feed.searchPosts');
        u.searchParams.set('q',String(q));
        u.searchParams.set('limit',String(Math.max(10,Math.min(100,Number(maxResults)||100))));
        u.searchParams.set('sort','latest');
        return requestJson(u.toString());
      }));
      const postsById=new Map();
      let successes=0;
      for(const r of settled){
        if(r.status!=='fulfilled'){
          errors.push('BLUESKY_'+new URL(base).hostname+'_'+(r.reason instanceof Error?r.reason.message:String(r.reason)));
          continue;
        }
        successes++;
        for(const p of Array.isArray(r.value?.posts)?r.value.posts:[]){
          const body=p?.record?.text??p?.value?.text??'';
          const created=p?.record?.createdAt??p?.value?.createdAt??p?.indexedAt;
          const author=p?.author||{};
          const normalized=freeze({
            platform:'BLUESKY',id:String(p?.uri||p?.cid||''),createdAt:Date.parse(created||'')||null,
            text:text(body,500),authorId:String(author?.did||author?.handle||''),username:text(author?.handle,120),
            authorFollowers:finite(author?.followersCount),authorVerified:false,
            engagement:bskyEngagement(p),possiblySensitive:false,seeds:extractSeeds(body)
          });
          if(normalized.id)postsById.set(normalized.id,normalized);
        }
      }
      if(successes>0)return {ok:true,missing:false,posts:[...postsById.values()],error:errors.length?errors.join(' | '):null,sourceBase:base};
    }
    return {ok:false,missing:false,posts:[],error:errors.length?errors.join(' | '):'BLUESKY_NO_WORKING_APPVIEW',sourceBase:null};
  }

  async function fetchDiscovery({force=false,maxResults=100}={}){
    const t=Number(now());
    if(!force&&cache&&t-cache.at<Math.max(15_000,Number(cacheMs)||60_000))return cache.value;
    const [x,bsky]=await Promise.all([fetchX(maxResults),fetchBluesky(Math.min(100,maxResults))]);
    const posts=[...x.posts,...bsky.posts]
      .filter((p,i,a)=>a.findIndex(y=>y.platform===p.platform&&y.id===p.id)===i)
      .sort((a,b)=>Number(b.createdAt||0)-Number(a.createdAt||0))
      .slice(0,250);
    const errors=[x.error,bsky.error].filter(Boolean);
    const missingSources=[];
    if(x.missing)missingSources.push('X_BEARER_TOKEN_NOT_CONFIGURED');
    if(bsky.missing)missingSources.push('BLUESKY_DISABLED');
    const sourceReady=x.ok||bsky.ok;
    const source=x.ok&&bsky.ok?'X_RECENT_SEARCH_PLUS_BLUESKY_PUBLIC_SEARCH':x.ok?'X_RECENT_SEARCH':bsky.ok?'BLUESKY_PUBLIC_SEARCH':'NO_DIRECT_SOCIAL_SOURCE';
    const value=freeze({
      version:MEMECOIN_SOCIAL_ATTENTION_VERSION,source,configured:xConfigured||Boolean(blueskyEnabled),
      sourceReady,capturedAt:t,queryClass:'MEME_LAUNCH_DISCOVERY',
      posts,seeds:aggregateSeeds(posts),errors,missingSources,
      x:{configured:xConfigured,sourceReady:x.ok,error:x.error},
      bluesky:{enabled:Boolean(blueskyEnabled),sourceReady:bsky.ok,error:bsky.error,sourceBase:bsky.sourceBase||null},
      epistemic:'PUBLIC_POST_ATTENTION_NOT_PRICE_CAUSALITY'
    });
    cache={at:t,value};
    return value;
  }

  return freeze({version:MEMECOIN_SOCIAL_ATTENTION_VERSION,configured:xConfigured||Boolean(blueskyEnabled),xConfigured,fetchDiscovery});
}

export function applyDirectSocialAttention(snapshot,social){
  const seeds=Array.isArray(social?.seeds)?social.seeds:[];
  const rows=(Array.isArray(snapshot?.rows)?snapshot.rows:[]).map(row=>{
    const address=String(row?.tokenAddress||'').toLowerCase();
    const symbol=String(row?.symbol||'').toUpperCase();
    const matches=seeds.filter(s=>{
      if(s.type==='SOLANA_ADDRESS')return String(row?.chainId||'').toLowerCase()==='solana'&&String(s.value||'')===String(row?.tokenAddress||'');
      if(s.type==='EVM_ADDRESS')return ['ethereum','base'].includes(String(row?.chainId||'').toLowerCase())&&String(s.value||'').toLowerCase()===address;
      if(s.type==='CASHTAG'){
        const strongEnough=Number(s?.uniqueAuthors||0)>=2||Number(s?.engagement||0)>=20;
        return strongEnough&&symbol.length>=2&&String(s.value||'').toUpperCase()===symbol;
      }
      return false;
    });
    const platforms=[...new Set(matches.flatMap(x=>Array.isArray(x.platforms)?x.platforms:[]))].sort();
    const agg={
      posts:matches.reduce((a,x)=>a+Number(x.posts||0),0),
      uniqueAuthors:matches.reduce((a,x)=>a+Number(x.uniqueAuthors||0),0),
      engagement:matches.reduce((a,x)=>a+Number(x.engagement||0),0),
      maxAuthorFollowers:matches.reduce((a,x)=>Math.max(a,Number(x.maxAuthorFollowers||0)),0),
      latestAt:matches.reduce((a,x)=>Math.max(a,Number(x.latestAt||0)),0)||null,
      attentionBand:matches.some(x=>x.attentionBand==='SPIKING')?'SPIKING':matches.some(x=>x.attentionBand==='MULTI_POST')?'MULTI_POST':matches.length?'SINGLE_POST':'NONE',
      platforms
    };
    return freeze({...row,directSocialAttention:agg});
  });
  return freeze({...snapshot,rows,socialAttention:{
    version:MEMECOIN_SOCIAL_ATTENTION_VERSION,configured:social?.configured===true,sourceReady:social?.sourceReady===true,
    capturedAt:social?.capturedAt||null,source:social?.source||'NO_DIRECT_SOCIAL_SOURCE',
    errors:social?.errors||[],missingSources:social?.missingSources||[],x:social?.x||null,bluesky:social?.bluesky||null
  }});
}
