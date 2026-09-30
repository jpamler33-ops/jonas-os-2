export const BIGGJ_GERMAN_TRANSLATION_VERSION='BIGGJ_GERMAN_TRANSLATION_V1';

const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
const errText=err=>err instanceof Error?err.message:String(err??'UNKNOWN');

export function createGermanTranslationProvider({
  fetchImpl=globalThis.fetch,
  endpoint='https://translate.googleapis.com/translate_a/single',
  timeoutMs=4500,
  cacheTtlMs=24*60*60_000,
  maxCache=1000,
  now=()=>Date.now()
}={}){
  if(typeof fetchImpl!=='function')throw new Error('fetch implementation required');
  const cache=new Map();
  let successes=0,failures=0,lastSuccessAt=null,lastFailureAt=null,lastError=null;

  function cacheGet(key){
    const hit=cache.get(key);
    if(!hit)return null;
    if(Number(now())-hit.at>cacheTtlMs){cache.delete(key);return null;}
    return hit.value;
  }
  function cacheSet(key,value){
    cache.set(key,{at:Number(now()),value});
    while(cache.size>maxCache){
      const first=cache.keys().next().value;
      if(first==null)break;
      cache.delete(first);
    }
  }

  async function translate(value){
    const original=clean(value);
    if(!original)return Object.freeze({ok:true,text:'',original:'',sourceLanguage:'unknown',translated:false,cached:false});
    const key=original;
    const cached=cacheGet(key);
    if(cached)return Object.freeze({...cached,cached:true});

    const u=new URL(endpoint);
    u.searchParams.set('client','gtx');
    u.searchParams.set('sl','auto');
    u.searchParams.set('tl','de');
    u.searchParams.set('dt','t');
    u.searchParams.set('q',original);
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),Math.max(1500,Number(timeoutMs)||4500));
    try{
      const res=await fetchImpl(u.toString(),{
        method:'GET',
        headers:{accept:'application/json,text/plain,*/*','user-agent':'BIGGJ/7.0 german-news-translation'},
        signal:controller.signal
      });
      if(!res?.ok)throw new Error('TRANSLATE_HTTP_'+String(res?.status??'UNKNOWN'));
      const body=await res.json();
      const translated=Array.isArray(body?.[0])?body[0].map(x=>Array.isArray(x)?String(x[0]??''):'').join(''):original;
      const sourceLanguage=String(body?.[2]||'unknown');
      const output=clean(translated)||original;
      const result=Object.freeze({
        ok:true,
        text:output,
        original,
        sourceLanguage,
        translated:output!==original||sourceLanguage!=='de',
        cached:false
      });
      successes++;lastSuccessAt=Number(now());lastError=null;
      cacheSet(key,result);
      return result;
    }catch(err){
      failures++;lastFailureAt=Number(now());lastError=errText(err);
      return Object.freeze({ok:false,text:null,original,sourceLanguage:'unknown',translated:false,cached:false,error:lastError});
    }finally{
      clearTimeout(timer);
    }
  }

  function health(){
    return Object.freeze({
      version:BIGGJ_GERMAN_TRANSLATION_VERSION,
      ok:failures===0||Number(lastSuccessAt||0)>=Number(lastFailureAt||0),
      cacheSize:cache.size,
      successes,
      failures,
      lastSuccessAt,
      lastFailureAt,
      lastError
    });
  }

  return Object.freeze({version:BIGGJ_GERMAN_TRANSLATION_VERSION,translate,health});
}
