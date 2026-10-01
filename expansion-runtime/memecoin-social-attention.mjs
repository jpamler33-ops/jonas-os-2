export const MEMECOIN_SOCIAL_ATTENTION_VERSION='BIGGJ_MEMECOIN_SOCIAL_ATTENTION_V1';

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
function engagement(post={}){
  const p=post?.public_metrics||{};
  return (finite(p.like_count)||0)+(finite(p.retweet_count)||0)*2+(finite(p.reply_count)||0)+(finite(p.quote_count)||0)*2;
}
function buildQuery(){
  return '(memecoin OR "meme coin" OR "pump.fun" OR pumpfun OR "fair launch" OR "token launch" OR "contract address") -is:retweet lang:en';
}

export function createMemecoinSocialAttentionProvider({
  fetchImpl=globalThis.fetch,
  bearerToken='',
  baseUrl='https://api.x.com',
  timeoutMs=7000,
  cacheMs=60_000,
  now=()=>Date.now()
}={}){
  if(typeof fetchImpl!=='function')throw new Error('fetch implementation required');
  const token=String(bearerToken||'').trim();
  const configured=Boolean(token);
  let cache=null;
  async function fetchDiscovery({force=false,maxResults=100}={}){
    const t=Number(now());
    if(!configured)return freeze({
      version:MEMECOIN_SOCIAL_ATTENTION_VERSION,source:'X_RECENT_SEARCH',configured:false,sourceReady:false,capturedAt:t,
      posts:[],seeds:[],errors:['X_BEARER_TOKEN_NOT_CONFIGURED'],epistemic:'NO_DIRECT_X_DATA'
    });
    if(!force&&cache&&t-cache.at<Math.max(15_000,Number(cacheMs)||60_000))return cache.value;
    const u=new URL(String(baseUrl).replace(/\/+$/,'')+'/2/tweets/search/recent');
    u.searchParams.set('query',buildQuery());
    u.searchParams.set('max_results',String(Math.max(10,Math.min(100,Number(maxResults)||100))));
    u.searchParams.set('tweet.fields','created_at,public_metrics,author_id,lang,possibly_sensitive');
    u.searchParams.set('expansions','author_id');
    u.searchParams.set('user.fields','username,verified,verified_type,public_metrics,created_at');
    const c=new AbortController();
    const timer=setTimeout(()=>c.abort(),Math.max(1000,Number(timeoutMs)||7000));
    try{
      const res=await fetchImpl(u.toString(),{headers:{accept:'application/json',authorization:'Bearer '+token,'user-agent':'BIGGJ/1.0 meme-social'},signal:c.signal});
      if(!res?.ok)throw new Error('X_HTTP_'+String(res?.status??'UNKNOWN'));
      const body=await res.json();
      const users=new Map((Array.isArray(body?.includes?.users)?body.includes.users:[]).map(x=>[String(x?.id||''),x]));
      const posts=(Array.isArray(body?.data)?body.data:[]).map(p=>{
        const author=users.get(String(p?.author_id||''))||{};
        const seeds=extractSeeds(p?.text);
        return freeze({
          id:String(p?.id||''),createdAt:Date.parse(p?.created_at||'')||null,
          text:text(p?.text,500),authorId:String(p?.author_id||''),username:text(author?.username,80),
          authorFollowers:finite(author?.public_metrics?.followers_count),authorVerified:Boolean(author?.verified),
          engagement:engagement(p),possiblySensitive:p?.possibly_sensitive===true,seeds
        });
      });
      const grouped=new Map();
      const add=(key,type,value,p)=>{
        if(!key)return;
        const g=grouped.get(key)||{key,type,value,posts:0,uniqueAuthors:new Set(),engagement:0,maxAuthorFollowers:0,latestAt:null};
        g.posts++;g.uniqueAuthors.add(p.authorId);g.engagement+=p.engagement;
        g.maxAuthorFollowers=Math.max(g.maxAuthorFollowers,finite(p.authorFollowers)||0);
        g.latestAt=Math.max(g.latestAt||0,finite(p.createdAt)||0)||null;grouped.set(key,g);
      };
      for(const p of posts){
        for(const a of p.seeds.evmAddresses)add('evm:'+a,'EVM_ADDRESS',a,p);
        for(const a of p.seeds.solanaAddresses)add('solana:'+a,'SOLANA_ADDRESS',a,p);
        for(const sym of p.seeds.cashtags)add('symbol:'+sym,'CASHTAG',sym,p);
      }
      const seeds=[...grouped.values()].map(g=>freeze({
        key:g.key,type:g.type,value:g.value,posts:g.posts,uniqueAuthors:g.uniqueAuthors.size,
        engagement:g.engagement,maxAuthorFollowers:g.maxAuthorFollowers,latestAt:g.latestAt,
        attentionBand:g.posts>=4&&g.uniqueAuthors.size>=3?'SPIKING':g.posts>=2?'MULTI_POST':'SINGLE_POST'
      })).sort((a,b)=>
        Number(b.attentionBand==='SPIKING')-Number(a.attentionBand==='SPIKING')||
        b.uniqueAuthors-a.uniqueAuthors||b.engagement-a.engagement
      );
      const value=freeze({
        version:MEMECOIN_SOCIAL_ATTENTION_VERSION,source:'X_RECENT_SEARCH',configured:true,sourceReady:true,capturedAt:t,
        queryClass:'MEME_LAUNCH_DISCOVERY',posts,seeds,errors:[],
        epistemic:'PUBLIC_POST_ATTENTION_NOT_PRICE_CAUSALITY'
      });
      cache={at:t,value};
      return value;
    }finally{clearTimeout(timer);}
  }
  return freeze({version:MEMECOIN_SOCIAL_ATTENTION_VERSION,configured,fetchDiscovery});
}

export function applyDirectSocialAttention(snapshot,social){
  const seeds=Array.isArray(social?.seeds)?social.seeds:[];
  const rows=(Array.isArray(snapshot?.rows)?snapshot.rows:[]).map(row=>{
    const address=String(row?.tokenAddress||'').toLowerCase();
    const symbol=String(row?.symbol||'').toUpperCase();
    const matches=seeds.filter(s=>{
      if(s.type==='SOLANA_ADDRESS')return String(row?.chainId||'').toLowerCase()==='solana'&&String(s.value||'')===String(row?.tokenAddress||'');
      if(s.type==='EVM_ADDRESS')return ['ethereum','base'].includes(String(row?.chainId||'').toLowerCase())&&String(s.value||'').toLowerCase()===address;
      if(s.type==='CASHTAG')return symbol.length>=2&&String(s.value||'').toUpperCase()===symbol;
      return false;
    });
    const agg={
      posts:matches.reduce((a,x)=>a+Number(x.posts||0),0),
      uniqueAuthors:matches.reduce((a,x)=>a+Number(x.uniqueAuthors||0),0),
      engagement:matches.reduce((a,x)=>a+Number(x.engagement||0),0),
      maxAuthorFollowers:matches.reduce((a,x)=>Math.max(a,Number(x.maxAuthorFollowers||0)),0),
      latestAt:matches.reduce((a,x)=>Math.max(a,Number(x.latestAt||0)),0)||null,
      attentionBand:matches.some(x=>x.attentionBand==='SPIKING')?'SPIKING':matches.length?'OBSERVED':'NONE'
    };
    return freeze({...row,xDirectAttention:agg});
  });
  return freeze({...snapshot,rows,socialAttention:{
    version:MEMECOIN_SOCIAL_ATTENTION_VERSION,configured:social?.configured===true,sourceReady:social?.sourceReady===true,
    capturedAt:social?.capturedAt||null,source:social?.source||'X_RECENT_SEARCH',errors:social?.errors||[]
  }});
}
