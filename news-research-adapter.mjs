import { sha256 } from './institutional-kernel.mjs';
import { createResearchFeatureSnapshot } from './research-data-plane.mjs';

export const NEWS_RESEARCH_ADAPTER_VERSION='TCX_NEWS_RESEARCH_ADAPTER_V1';

const ASSET_SYMBOLS=Object.freeze({BTC:'BTCUSDT',ETH:'ETHUSDT',SOL:'SOLUSDT',DOGE:'DOGEUSDT'});
const FAMILY_CODE=Object.freeze({OTHER:0,CRYPTO:1,GEOPOLITICS:2,MACRO:3,TECHNOLOGY:4,CORPORATE:5,COMMODITIES:6});
const STATUS_SCORE=Object.freeze({WATCH:.25,DEVELOPING:.6,HIGH_IMPACT:1});
const clamp=x=>Math.max(0,Math.min(1,Number(x)||0));
const finite=x=>Number.isFinite(Number(x))?Number(x):null;

function relevantToSymbol(event,symbol){
  const s=String(symbol||'').toUpperCase();
  const assets=new Set((event?.affectedAssets||[]).map(x=>String(x).toUpperCase()));
  const base=s.replace(/USDT$/,'');
  if(assets.has(base)||assets.has('CRYPTO')) return true;
  if(['MACRO','GEOPOLITICS','COMMODITIES'].includes(String(event?.eventFamily||event?.family||'').toUpperCase())) return true;
  if(assets.has('USD')||assets.has('RATES')||assets.has('RISK')) return true;
  return false;
}

function sourceReliability(event){
  const id=String(event?.sourceId||'').toUpperCase();
  if(id==='GDELT_DOC_API') return .65;
  if(id==='GOOGLE_NEWS_RSS') return .55;
  return .45;
}

export function newsEventToResearchSnapshot(event,{symbol,ingestedAt=Date.now(),ttlMs=6*60*60_000}={}){
  if(!event||!relevantToSymbol(event,symbol)) return null;
  const availableAt=finite(event.availableAt??event.timestamp);
  if(availableAt==null||availableAt>Number(ingestedAt)+5000) return null;
  const family=String(event.eventFamily||event.family||'OTHER').toUpperCase();
  const status=String(event.status||'WATCH').toUpperCase();
  const confirmation=clamp(event.independentConfirmation);
  const verified=event.verified===true?1:0;
  const sourceQuality=sourceReliability(event);
  const features=[
    {id:'research.news.present',value:1},
    {id:'research.news.familyCode',value:FAMILY_CODE[family]??0},
    {id:'research.news.impactPriority',value:STATUS_SCORE[status]??.25},
    {id:'research.news.sourceReliability',value:sourceQuality},
    {id:'research.news.independentConfirmation',value:confirmation},
    {id:'research.news.verified',value:verified},
    {id:'research.news.worldRelevant',value:event.worldRelevant===true?1:0},
    {id:'research.news.affectedAssetCount',value:(event.affectedAssets||[]).length}
  ];
  return createResearchFeatureSnapshot({
    streamKey:String(symbol).toUpperCase(),
    domain:'NEWS_EVENT',
    source:String(event.sourceId||event.source||'PUBLIC_NEWS'),
    sourceVersion:NEWS_RESEARCH_ADAPTER_VERSION,
    sourceEventId:String(event.id||sha256({url:event.url,title:event.title,availableAt})),
    eventTime:availableAt,
    availableAt,
    ingestedAt:Number(ingestedAt),
    ttlMs,
    finality:verified?'CONFIRMED':'PROVISIONAL',
    quality:{
      completeness:clamp(.55+.2*confirmation+.25*verified),
      sourceCount:Math.max(1,1+Math.floor(confirmation*3)),
      expectedSourceCount:3,
      status:verified?'VERIFIED_NEWS_EVENT':'UNVERIFIED_NEWS_RESEARCH_ONLY'
    },
    features,
    provenance:{
      adapterVersion:NEWS_RESEARCH_ADAPTER_VERSION,
      headline:String(event.title||event.headline||'').slice(0,500),
      url:String(event.url||'').slice(0,1000),
      eventFamily:family,
      status,
      affectedAssets:[...(event.affectedAssets||[])].map(String).slice(0,12),
      queryClass:String(event.queryClass||'UNKNOWN'),
      upstreamEpistemic:String(event.epistemic||'PUBLIC_NEWS_HEADLINE_NOT_INDEPENDENTLY_VERIFIED'),
      researchOnly:true,
      causalClaim:false,
      productionMutationAllowed:false,
      canExecuteLive:false
    }
  });
}

export function buildNewsResearchSnapshots(feed,{symbols=[],ingestedAt=Date.now(),maxEvents=60}={}){
  const rows=[];
  const events=(feed?.events||[]).slice(0,Math.max(1,Number(maxEvents)||60));
  for(const event of events){
    for(const symbol of symbols){
      const row=newsEventToResearchSnapshot(event,{symbol,ingestedAt});
      if(row) rows.push(row);
    }
  }
  return rows;
}

export function newsResearchSummary(feed,{symbols=[]}={}){
  const events=feed?.events||[];
  return Object.freeze({
    version:NEWS_RESEARCH_ADAPTER_VERSION,
    events:events.length,
    worldEvents:(feed?.world||[]).length,
    symbols:symbols.length,
    highImpact:events.filter(x=>x.status==='HIGH_IMPACT').length,
    developing:events.filter(x=>x.status==='DEVELOPING').length,
    verified:events.filter(x=>x.verified===true).length,
    epistemic:'NEWS_IS_RESEARCH_EVIDENCE_NOT_CAUSAL_OR_EXECUTION_AUTHORITY',
    productionMutationAllowed:false,
    canExecuteLive:false
  });
}
