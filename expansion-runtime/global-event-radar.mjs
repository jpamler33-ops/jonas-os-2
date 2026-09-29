import {sha256} from '../institutional-kernel.mjs';

export const GLOBAL_EVENT_RADAR_VERSION='TCX_GLOBAL_EVENT_RADAR_V1';
const clamp=x=>Math.max(0,Math.min(1,Number(x)||0));
const finite=x=>Number.isFinite(Number(x))?Number(x):null;
const ACTOR_RULES=Object.freeze({
  'donald trump':{id:'donald-trump',role:'US_PRESIDENT',topics:['TARIFF','TRADE','SANCTIONS','ENERGY','REGULATION','GEOPOLITICS']},
  'elon musk':{id:'elon-musk',role:'PUBLIC_EXECUTIVE',topics:['TESLA','SPACEX','XAI','X','CRYPTO','DOGE','AI']}
});


const ACTOR_CATALOG=Object.freeze([
 {id:'donald-trump',name:'Donald Trump',role:'US_PRESIDENT',domains:['TRADE','TARIFF','SANCTIONS','ENERGY','REGULATION','GEOPOLITICS','CRYPTO']},
 {id:'xi-jinping',name:'Xi Jinping',role:'CHINA_PRESIDENT',domains:['CHINA','TRADE','TAIWAN','AI','CRITICAL_MINERALS','GEOPOLITICS']},
 {id:'jerome-powell',name:'Jerome Powell',role:'FED_CHAIR',domains:['RATES','INFLATION','LIQUIDITY','USD']},
 {id:'scott-bessent',name:'Scott Bessent',role:'US_TREASURY',domains:['TREASURY','TRADE','FX','SANCTIONS','DEBT']},
 {id:'elon-musk',name:'Elon Musk',role:'PUBLIC_EXECUTIVE',domains:['TESLA','SPACEX','XAI','X','CRYPTO','DOGE','AI']},
 {id:'sam-altman',name:'Sam Altman',role:'AI_EXECUTIVE',domains:['AI','COMPUTE','CHIPS']},
 {id:'jensen-huang',name:'Jensen Huang',role:'SEMICONDUCTOR_EXECUTIVE',domains:['AI','CHIPS','COMPUTE']},
 {id:'tim-cook',name:'Tim Cook',role:'TECH_EXECUTIVE',domains:['APPLE','CHINA','SUPPLY_CHAIN','TECH']},
 {id:'mark-zuckerberg',name:'Mark Zuckerberg',role:'TECH_EXECUTIVE',domains:['META','AI','TECH']},
 {id:'sundar-pichai',name:'Sundar Pichai',role:'TECH_EXECUTIVE',domains:['GOOGLE','AI','TECH']}
]);
export function importantActorCatalog(){return ACTOR_CATALOG.map(x=>structuredClone(x));}
export function buildInteractionEvent({id,participants=[],interactionType='MEETING',topics=[],headline='',sourceId='',availableAt=Date.now()}={}){
 const ps=[...new Set(participants.map(x=>String(x).trim()).filter(Boolean))];
 const known=ps.map(classifyPublicActor);
 const core={id:String(id||''),participants:ps,knownActors:known,interactionType:String(interactionType).toUpperCase(),topics:[...new Set(topics.map(x=>String(x).toUpperCase()))],headline:String(headline).slice(0,500),sourceId:String(sourceId),availableAt:Number(availableAt),eventClass:'PUBLIC_ACTOR_INTERACTION',epistemic:'DOCUMENTED_INTERACTION_NOT_MOTIVE_INFERENCE'};
 return Object.freeze({...core,fingerprint:sha256(core)});
}
export function prioritizeActorEvent(event){
 const actorKnown=Boolean(classifyPublicActor(event?.actor).known);
 const interactionKnown=(event?.participants||[]).some(x=>classifyPublicActor(x).known);
 const marketDomains=new Set(['TARIFF','TRADE','SANCTIONS','ENERGY','RATES','INFLATION','LIQUIDITY','AI','CHIPS','CRYPTO','DOGE','REGULATION','TAIWAN','CRITICAL_MINERALS','GEOPOLITICS']);
 const topics=[event?.topic,...(event?.topics||[])].filter(Boolean).map(x=>String(x).toUpperCase());
 const relevant=topics.some(x=>marketDomains.has(x));
 return Object.freeze({track:actorKnown||interactionKnown,marketRelevant:relevant,notifyEligible:(actorKnown||interactionKnown)&&relevant});
}

export function classifyPublicActor(name=''){
  const key=String(name).trim().toLowerCase();
  const known=ACTOR_RULES[key];
  if(known) return {known:true,...known};
  const catalog=ACTOR_CATALOG.find(x=>x.name.toLowerCase()===key);
  return catalog?{known:true,id:catalog.id,role:catalog.role,topics:catalog.domains}:{known:false,id:null,role:'OTHER',topics:[]};
}

export function scoreGlobalEvent(event,{sourceReliability=.5}={}){
  const actor=classifyPublicActor(event?.actor);
  const novelty=clamp(event?.novelty), confirmation=clamp(event?.independentConfirmation);
  const manipulationRisk=clamp(event?.manipulationRisk), velocity=clamp(event?.velocity);
  const marketConfirmation=clamp(event?.marketConfirmation);
  const source=clamp(sourceReliability);
  const quality=clamp(.24*source+.20*novelty+.20*confirmation+.16*(1-manipulationRisk)+.10*velocity+.10*marketConfirmation);
  const severity=clamp(event?.severity);
  const impact=clamp(.55*quality+.30*marketConfirmation+.15*severity);
  let status='WATCH';
  if(manipulationRisk>=.8||confirmation<.2) status='UNVERIFIED';
  else if(impact>=.72&&marketConfirmation>=.45) status='HIGH_IMPACT';
  else if(impact>=.52) status='DEVELOPING';
  return Object.freeze({version:GLOBAL_EVENT_RADAR_VERSION,actor,topic:String(event?.topic||'OTHER').toUpperCase(),quality,impact,status,inputs:{sourceReliability:source,novelty,confirmation,manipulationRisk,velocity,marketConfirmation,severity},epistemic:'HEURISTIC_EVENT_PRIORITY_NOT_CAUSAL_PROOF'});
}

export function buildCausalImpactMap(event,marketMoves={}){
  const topic=String(event?.topic||'OTHER').toUpperCase();
  const templates={
    ENERGY:['ENERGY_PRICE','INFLATION_EXPECTATIONS','RATES','RISK_APPETITE'],
    TARIFF:['TRADE_COSTS','INFLATION_EXPECTATIONS','GROWTH_EXPECTATIONS','RISK_APPETITE'],
    SANCTIONS:['SUPPLY_CONSTRAINTS','COMMODITIES','INFLATION_EXPECTATIONS','RISK_APPETITE'],
    REGULATION:['REGULATORY_EXPECTATIONS','SECTOR_RISK_PREMIUM','AFFECTED_ASSETS'],
    DOGE:['SOCIAL_ATTENTION','SPECULATIVE_FLOW','DOGE'],
    AI:['AI_EXPECTATIONS','SEMICONDUCTORS','TECH_RISK_APPETITE']
  };
  const chain=templates[topic]||['INFORMATION_SHOCK','RISK_APPETITE','AFFECTED_ASSETS'];
  const observed=Object.entries(marketMoves).filter(([,v])=>finite(v)!=null).map(([asset,v])=>({asset:String(asset).toUpperCase(),movePct:Number(v)}));
  return Object.freeze({topic,chain,observed,meaning:'HYPOTHESIZED_MECHANISM_PLUS_OBSERVED_MARKET_RESPONSE_NOT_CAUSAL_PROOF'});
}

export function shouldNotifyGlobalEvent(score,{previousStatus=null}={}){
  if(!score||!['DEVELOPING','HIGH_IMPACT'].includes(score.status)) return false;
  if(previousStatus===score.status) return false;
  if(previousStatus==='HIGH_IMPACT') return false;
  return true;
}

export function makeGlobalEventRecord(event,score,impactMap,{asOf=Date.now()}={}){
  const core={version:GLOBAL_EVENT_RADAR_VERSION,id:String(event?.id||''),asOf:Number(asOf),availableAt:Number(event?.availableAt??asOf),sourceId:String(event?.sourceId||''),actor:score.actor,topic:score.topic,status:score.status,quality:score.quality,impact:score.impact,impactMap,headline:String(event?.headline||'').slice(0,500),sourceUrl:String(event?.sourceUrl||'').slice(0,1000),epistemic:'POINT_IN_TIME_PUBLIC_EVENT_RECORD'};
  return Object.freeze({...core,fingerprint:sha256(core)});
}

export function renderGlobalEventAlert(record){
  const pct=x=>Math.round(clamp(x)*100)+'%';
  const a=record?.actor?.known?record.actor.id.replaceAll('-',' '):'global event';
  const observed=(record?.impactMap?.observed||[]).slice(0,5).map(x=>x.asset+' '+(x.movePct>=0?'+':'')+x.movePct.toFixed(2)+'%').join(' · ');
  return ['🌐 GLOBAL EVENT · '+String(record?.status||'WATCH').replace('_',' '),String(a).toUpperCase()+' · '+String(record?.topic||'OTHER'),String(record?.headline||'').slice(0,220),'Impact '+pct(record?.impact)+' · Source quality '+pct(record?.quality),observed?('Market: '+observed):'Market reaction: awaiting confirmation','Mechanism: '+(record?.impactMap?.chain||[]).join(' → ')].join('\n').slice(0,4096);
}
