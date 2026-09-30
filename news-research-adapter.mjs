import { sha256 } from './institutional-kernel.mjs';
import { createResearchFeatureSnapshot } from './research-data-plane.mjs';

export const NEWS_RESEARCH_ADAPTER_VERSION='TCX_NEWS_RESEARCH_ADAPTER_V3';

const FAMILY_CODE=Object.freeze({
  OTHER:0,
  CRYPTO:1,
  GEOPOLITICS:2,
  MACRO:3,
  TECHNOLOGY:4,
  CORPORATE:5,
  COMMODITIES:6
});
const STATUS_SCORE=Object.freeze({WATCH:.25,DEVELOPING:.6,HIGH_IMPACT:1});

function finite(v){
  if(v==null||v==='') return null;
  const n=Number(v);
  return Number.isFinite(n)?n:null;
}
function clamp01(v){
  const n=finite(v);
  return n==null?0:Math.max(0,Math.min(1,n));
}
function eventFamily(event){
  const x=String(event?.eventFamily||event?.family||'OTHER').toUpperCase();
  return Object.hasOwn(FAMILY_CODE,x)?x:'OTHER';
}
function sourceClass(event){
  if(event?.primarySource===true||event?.sourceAuthority==='OFFICIAL_PRIMARY'||event?.publicationAuthenticity==='DIRECT_OFFICIAL_FEED') return 2;
  const id=String(event?.sourceId||'').toUpperCase();
  if(id==='GDELT_DOC_API'||id==='GOOGLE_NEWS_RSS') return 1;
  return 0;
}
function relevantToSymbol(event,symbol){
  const s=String(symbol||'').toUpperCase();
  const base=s.replace(/USDT$/,'');
  const family=eventFamily(event);
  const assets=new Set((Array.isArray(event?.affectedAssets)?event.affectedAssets:[]).map(x=>String(x).toUpperCase()));
  if(assets.has(base)||assets.has('CRYPTO')) return true;
  if(['MACRO','GEOPOLITICS','COMMODITIES'].includes(family)) return true;
  if(assets.has('USD')||assets.has('EUR')||assets.has('RATES')||assets.has('RISK')) return true;
  return false;
}
function sourceEventId(event){
  const explicit=String(event?.id||'').trim();
  if(explicit) return explicit.slice(0,200);
  return sha256({
    source:String(event?.sourceId||event?.source||'PUBLIC_NEWS'),
    url:String(event?.url||''),
    headline:String(event?.title||event?.headline||''),
    publishedAt:finite(event?.publishedAt??event?.availableAt??event?.timestamp)
  });
}

export function newsResearchSnapshotKey(snapshot){
  if(!snapshot) return '';
  return [
    String(snapshot.streamKey||''),
    String(snapshot.domain||''),
    String(snapshot.source||''),
    String(snapshot.sourceEventId||'')
  ].join('\u0000');
}

export function filterPreviouslyObservedNewsSnapshots(plane,snapshots=[]){
  const sourcePayload=plane?.sourcePayload;
  const rows=(Array.isArray(snapshots)?snapshots:[]).filter(Boolean);
  const candidates=[];
  const seenBatch=new Set();
  let previouslyObserved=0;
  let batchDuplicates=0;
  for(const snapshot of rows){
    const key=newsResearchSnapshotKey(snapshot);
    if(key&&sourcePayload&&typeof sourcePayload.has==='function'&&sourcePayload.has(key)){
      previouslyObserved++;
      continue;
    }
    if(key&&seenBatch.has(key)){
      batchDuplicates++;
      continue;
    }
    if(key) seenBatch.add(key);
    candidates.push(snapshot);
  }
  return Object.freeze({candidates:Object.freeze(candidates),previouslyObserved,batchDuplicates});
}

export function newsEventToResearchSnapshot(event,{
  symbol,
  ingestedAt=Date.now(),
  ttlMs=6*60*60_000,
  maxAgeMs=24*60*60_000
}={}){
  if(!event||!relevantToSymbol(event,symbol)) return null;

  const observedAt=finite(ingestedAt);
  const publishedAt=finite(event?.publishedAt??event?.availableAt??event?.timestamp);
  if(observedAt==null||publishedAt==null) return null;
  if(publishedAt>observedAt+5000) return null;
  if(observedAt-publishedAt>Math.max(60_000,Number(maxAgeMs)||24*60*60_000)) return null;

  const family=eventFamily(event);
  const status=String(event?.status||'WATCH').toUpperCase();
  const primary=sourceClass(event)===2;
  const verified=event?.verified===true;
  const source=String(event?.sourceId||event?.source||'PUBLIC_NEWS').slice(0,160);
  const affectedAssets=Array.isArray(event?.affectedAssets)?event.affectedAssets.map(String).slice(0,16):[];
  const features=[
    {id:'research.news.present',value:1},
    {id:'research.news.familyCode',value:FAMILY_CODE[family]},
    {id:'research.news.impactPriority',value:STATUS_SCORE[status]??.25},
    {id:'research.news.independentConfirmation',value:clamp01(event?.independentConfirmation)},
    {id:'research.news.contentVerified',value:verified?1:0},
    {id:'research.news.worldRelevant',value:event?.worldRelevant===true?1:0},
    {id:'research.news.affectedAssetCount',value:affectedAssets.length},
    {id:'research.news.primarySource',value:primary?1:0},
    {id:'research.news.sourceOriginVerified',value:primary?1:0},
    {id:'research.news.sourceClassCode',value:sourceClass(event)}
  ];

  return createResearchFeatureSnapshot({
    streamKey:String(symbol||'').toUpperCase(),
    domain:'NEWS_EVENT',
    source,
    sourceVersion:NEWS_RESEARCH_ADAPTER_VERSION,
    sourceEventId:sourceEventId(event),
    eventTime:publishedAt,
    // Critical PIT boundary: BIGGJ only owns the event once this ingestion cycle
    // observed it, even if the publisher timestamp is older.
    availableAt:observedAt,
    ingestedAt:observedAt,
    ttlMs,
    finality:verified?'CONFIRMED':'PROVISIONAL',
    quality:{
      completeness:1,
      sourceCount:1,
      expectedSourceCount:1,
      status:primary?'PRIMARY_SOURCE_EVENT':'PUBLIC_DISCOVERY_EVENT'
    },
    features,
    provenance:{
      adapterVersion:NEWS_RESEARCH_ADAPTER_VERSION,
      headline:String(event?.title||event?.headline||'').slice(0,500),
      url:String(event?.url||'').slice(0,1000),
      publishedAt,
      observedAt,
      eventFamily:family,
      status,
      affectedAssets,
      queryClass:String(event?.queryClass||'UNKNOWN'),
      primarySource:primary,
      publicationAuthenticity:String(event?.publicationAuthenticity||''),
      authority:String(event?.authority||event?.source||'').slice(0,200),
      upstreamEpistemic:String(event?.epistemic||'PUBLIC_EVENT_NOT_INDEPENDENTLY_VERIFIED'),
      researchOnly:true,
      causalClaim:false,
      directionalClaim:false,
      productionMutationAllowed:false,
      canExecute:false,
      canExecuteLive:false
    }
  });
}

export function buildNewsResearchSnapshots(feed,{
  symbols=[],
  ingestedAt=Date.now(),
  maxEvents=60,
  maxAgeMs=24*60*60_000
}={}){
  const rows=[];
  const events=Array.isArray(feed?.events)?feed.events.slice(0,Math.max(1,Number(maxEvents)||60)):[];
  const symbolList=[...new Set((Array.isArray(symbols)?symbols:[]).map(x=>String(x).toUpperCase()).filter(Boolean))];
  for(const event of events){
    for(const symbol of symbolList){
      const snapshot=newsEventToResearchSnapshot(event,{symbol,ingestedAt,maxAgeMs});
      if(snapshot) rows.push(snapshot);
    }
  }
  return rows;
}

export function newsResearchSummary(feed,{symbols=[]}={}){
  const events=Array.isArray(feed?.events)?feed.events:[];
  return Object.freeze({
    version:NEWS_RESEARCH_ADAPTER_VERSION,
    events:events.length,
    symbols:Array.isArray(symbols)?symbols.length:0,
    primarySourceEvents:events.filter(x=>x?.primarySource===true).length,
    highImpact:events.filter(x=>x?.status==='HIGH_IMPACT').length,
    developing:events.filter(x=>x?.status==='DEVELOPING').length,
    independentlyVerified:events.filter(x=>x?.verified===true).length,
    epistemic:'NEWS_EVENT_METADATA_FOR_RESEARCH_NOT_DIRECTIONAL_OR_CAUSAL_AUTHORITY',
    execution:'SHADOW_ONLY',
    canExecute:false,
    canExecuteLive:false
  });
}
