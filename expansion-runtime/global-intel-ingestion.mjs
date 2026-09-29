import {sha256} from '../institutional-kernel.mjs';
import {classifyGlobalEvent,buildTransmissionGraph} from './global-transmission-engine.mjs';
import {scoreGlobalEvent,buildCausalImpactMap,makeGlobalEventRecord} from './global-event-radar.mjs';

export const GLOBAL_INTEL_INGESTION_VERSION='TCX_GLOBAL_INTEL_INGESTION_V1';
const clamp=x=>Math.max(0,Math.min(1,Number(x)||0));
const norm=x=>String(x||'').trim().replace(/\s+/g,' ');
export function normalizeIntelItem(raw={},source={}){
 const availableAt=Number(raw.availableAt||raw.publishedAt||Date.now());
 const headline=norm(raw.headline||raw.title).slice(0,500);
 const sourceId=norm(source.id||raw.sourceId||'UNKNOWN').toUpperCase();
 const url=norm(raw.sourceUrl||raw.url).slice(0,1000);
 const id=String(raw.id||sha256({sourceId,url,headline,availableAt}));
 return Object.freeze({id,headline,availableAt,sourceId,sourceUrl:url,actor:norm(raw.actor),topic:norm(raw.topic||raw.eventType||raw.category).toUpperCase(),eventType:norm(raw.eventType||raw.topic||raw.category).toUpperCase(),tags:Array.isArray(raw.tags)?raw.tags:[],novelty:clamp(raw.novelty??.5),independentConfirmation:clamp(raw.independentConfirmation),manipulationRisk:clamp(raw.manipulationRisk),velocity:clamp(raw.velocity),marketConfirmation:clamp(raw.marketConfirmation),severity:clamp(raw.severity),sourceReliability:clamp(source.reliability??raw.sourceReliability??.5)});
}
export function ingestVerifiedIntel(raw,{source={},marketMoves={},cryptoMoves={},asOf=Date.now()}={}){
 const e=normalizeIntelItem(raw,source);
 if(!e.headline||!Number.isFinite(e.availableAt)||e.availableAt>Number(asOf)) return Object.freeze({accepted:false,reason:'INVALID_OR_FUTURE_EVENT'});
 const cls=classifyGlobalEvent(e);
 const score=scoreGlobalEvent(e,{sourceReliability:e.sourceReliability});
 const graph=buildTransmissionGraph(e,{marketMoves,cryptoMoves});
 const impactMap=buildCausalImpactMap(e,{...marketMoves,...cryptoMoves});
 const record=makeGlobalEventRecord(e,score,impactMap,{asOf});
 return Object.freeze({accepted:true,record:Object.freeze({...record,title:e.headline,family:cls.family,eventFamily:cls.family,eventType:cls.type,independentConfirmation:e.independentConfirmation,verified:e.independentConfirmation>=.45,affectedAssets:graph.observedMarkets.map(x=>x.asset),cryptoImpactStatus:graph.cryptoImpactStatus,transmissionFingerprint:graph.fingerprint})});
}
export function appendIntelBounded(store=[],result,{limit=250}={}){
 if(!result?.accepted) return store;
 const r=result.record;
 const without=store.filter(x=>x.fingerprint!==r.fingerprint&&x.id!==r.id);
 return [...without,r].sort((a,b)=>Number(a.availableAt)-Number(b.availableAt)).slice(-Math.max(1,Math.min(1000,Number(limit)||250)));
}
