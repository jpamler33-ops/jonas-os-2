export const OFFICIAL_INTEL_SOURCES_VERSION='TCX_OFFICIAL_INTEL_SOURCES_V1';
export const OFFICIAL_INTEL_SOURCES=Object.freeze([
 Object.freeze({id:'FED_PRESS',authority:'Federal Reserve',url:'https://www.federalreserve.gov/feeds/press_all.xml',reliability:.98,defaultTags:['CENTRAL_BANK','RATES','LIQUIDITY']}),
 Object.freeze({id:'SEC_PRESS',authority:'U.S. SEC',url:'https://www.sec.gov/news/pressreleases.rss',reliability:.98,defaultTags:['REGULATION','CAPITAL_MARKETS']}),
 Object.freeze({id:'ECB_PRESS',authority:'European Central Bank',url:'https://www.ecb.europa.eu/rss/press.html',reliability:.98,defaultTags:['CENTRAL_BANK','RATES','FX']})
]);
const clean=s=>String(s||'').replace(/<!\[CDATA\[|\]\]>/g,'').replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\s+/g,' ').trim();
const field=(block,name)=>{const m=block.match(new RegExp('<'+name+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/'+name+'>','i'));return clean(m?.[1]);};
export function parseOfficialFeed(xml,source,{now=Date.now(),limit=30}={}){
 const blocks=String(xml||'').match(/<(?:item|entry)(?:\s[^>]*)?>[\s\S]*?<\/(?:item|entry)>/gi)||[];
 return blocks.slice(0,Math.max(1,Math.min(100,Number(limit)||30))).map((b,i)=>{
  const title=field(b,'title'); const link=field(b,'link')||((b.match(/<link[^>]+href=["']([^"']+)/i)||[])[1]||'');
  const ds=field(b,'pubDate')||field(b,'published')||field(b,'updated'); const ts=Date.parse(ds);
  return {id:field(b,'guid')||field(b,'id')||source.id+':'+i+':'+title,title,headline:title,url,sourceUrl:link,availableAt:Number.isFinite(ts)?ts:now,sourceId:source.id,tags:source.defaultTags};
 }).filter(x=>x.title&&x.availableAt<=now);
}
export async function fetchOfficialIntelSource(source,{fetchImpl=fetch,now=Date.now(),timeoutMs=8000}={}){
 const res=await fetchImpl(source.url,{headers:{'user-agent':'TCX-Global-Intel/1.0'},signal:AbortSignal.timeout(timeoutMs)});
 if(!res.ok) throw new Error(source.id+'_HTTP_'+res.status);
 return parseOfficialFeed(await res.text(),source,{now});
}
