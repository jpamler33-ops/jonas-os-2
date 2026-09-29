import {sha256} from '../institutional-kernel.mjs';

export const GLOBAL_EVENT_RADAR_VERSION='TCX_GLOBAL_EVENT_RADAR_V1';
const clamp=x=>Math.max(0,Math.min(1,Number(x)||0));
const finite=x=>Number.isFinite(Number(x))?Number(x):null;
const ACTOR_RULES=Object.freeze({
  'donald trump':{id:'donald-trump',role:'US_PRESIDENT',topics:['TARIFF','TRADE','SANCTIONS','ENERGY','REGULATION','GEOPOLITICS']},
  'elon musk':{id:'elon-musk',role:'PUBLIC_EXECUTIVE',topics:['TESLA','SPACEX','XAI','X','CRYPTO','DOGE','AI']}
});

export function classifyPublicActor(name=''){
  const key=String(name).trim().toLowerCase();
  const known=ACTOR_RULES[key];
  return known?{known:true,...known}:{known:false,id:null,role:'OTHER',topics:[]};
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
