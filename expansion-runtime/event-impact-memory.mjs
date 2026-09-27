import { sha256 } from '../institutional-kernel.mjs';

export const EVENT_IMPACT_MEMORY_VERSION='TCX_EVENT_IMPACT_MEMORY_V1';

const DEFAULTS=Object.freeze({
  minSamples:20,
  warmSamples:8
});

const clamp01=x=>Math.max(0,Math.min(1,Number(x)||0));

function finite(v){
  const n=Number(v);
  return Number.isFinite(n)?n:null;
}

function quantile(sorted,p){
  if(!sorted.length) return null;
  const idx=(sorted.length-1)*p;
  const lo=Math.floor(idx),hi=Math.ceil(idx);
  if(lo===hi) return sorted[lo];
  const w=idx-lo;
  return sorted[lo]*(1-w)+sorted[hi]*w;
}

function valid(r){
  const availableAt=finite(r?.availableAt);
  const resolvedAt=finite(r?.resolvedAt);
  const horizonMs=finite(r?.horizonMs);
  const ret=finite(r?.returnPct);
  return Boolean(r?.id&&r?.asset&&r?.eventType)&&
    availableAt!=null&&resolvedAt!=null&&
    availableAt<=resolvedAt&&
    horizonMs!=null&&horizonMs>0&&
    ret!=null;
}

function dedupe(rows){
  const seen=new Map();
  let duplicates=0,conflicts=0;
  for(const r of rows){
    const id=String(r.id);
    if(!seen.has(id)){seen.set(id,r);continue;}
    duplicates++;
    if(sha256(seen.get(id))!==sha256(r)) conflicts++;
  }
  return {rows:[...seen.values()],duplicates,conflicts};
}

function keyOf(r){
  return [
    String(r.asset).toUpperCase(),
    String(r.eventType).toUpperCase(),
    Number(r.horizonMs),
    String(r.regime??'ANY').toUpperCase()
  ].join('|');
}

export function buildEventImpactMemory(asOf,rows,options={}){
  const t=finite(asOf);
  if(t==null) throw new Error('asOf must be finite');
  if(!Array.isArray(rows)) throw new Error('rows must be an array');

  const cfg={...DEFAULTS,...options};
  const invalidRows=rows.filter(r=>!valid(r)).length;
  const validRows=rows.filter(valid);
  const blockedFuture=validRows.filter(r=>Number(r.availableAt)>t).length;
  const unresolvedAtAsOf=validRows.filter(r=>Number(r.availableAt)<=t&&Number(r.resolvedAt)>t).length;
  const matured=validRows.filter(r=>Number(r.availableAt)<=t&&Number(r.resolvedAt)<=t);
  const unique=dedupe(matured);

  const groups=[...new Set(unique.rows.map(keyOf))].map(key=>{
    const xs=unique.rows.filter(r=>keyOf(r)===key);
    const returns=xs.map(r=>Number(r.returnPct)).sort((a,b)=>a-b);
    const n=returns.length;
    const mean=n?returns.reduce((a,b)=>a+b,0)/n:null;
    const positiveRate=n?returns.filter(x=>x>0).length/n:null;
    const sourceQuality=xs.map(r=>finite(r.sourceQuality)).filter(x=>x!=null);
    const novelty=xs.map(r=>finite(r.novelty)).filter(x=>x!=null);

    let status='MATURE';
    if(n<Number(cfg.warmSamples)) status='INSUFFICIENT';
    else if(n<Number(cfg.minSamples)) status='WARMING';

    return {
      key,
      asset:String(xs[0].asset).toUpperCase(),
      eventType:String(xs[0].eventType).toUpperCase(),
      horizonMs:Number(xs[0].horizonMs),
      regime:String(xs[0].regime??'ANY').toUpperCase(),
      samples:n,
      status,
      empirical:{
        meanReturnPct:mean,
        medianReturnPct:quantile(returns,.5),
        q10ReturnPct:quantile(returns,.1),
        q25ReturnPct:quantile(returns,.25),
        q75ReturnPct:quantile(returns,.75),
        q90ReturnPct:quantile(returns,.9),
        positiveRate
      },
      context:{
        meanSourceQuality:sourceQuality.length?sourceQuality.reduce((a,b)=>a+b,0)/sourceQuality.length:null,
        meanNovelty:novelty.length?novelty.reduce((a,b)=>a+b,0)/novelty.length:null
      },
      supportScore:clamp01(1-Math.exp(-n/30)),
      epistemic:'EMPIRICAL_POST_OUTCOME_EVENT_REACTION_NOT_CAUSAL'
    };
  });

  let gate='PASS';
  const reasons=[];
  if(!groups.length||groups.every(g=>g.status==='INSUFFICIENT')){
    gate='INSUFFICIENT';
    reasons.push('no event-impact cohort has enough matured outcomes');
  }else if(groups.some(g=>g.status!=='MATURE')){
    gate='CAUTION';
    reasons.push('one or more event-impact cohorts are still warming or insufficient');
  }
  if(unique.conflicts){
    gate='ABSTAIN';
    reasons.push('conflicting duplicate event-impact outcomes');
  }
  if(blockedFuture) reasons.push(blockedFuture+' future event record(s) blocked');
  if(unresolvedAtAsOf) reasons.push(unresolvedAtAsOf+' unmatured event outcome(s) excluded');
  if(invalidRows) reasons.push(invalidRows+' invalid event-impact row(s) rejected');

  const core={
    version:EVENT_IMPACT_MEMORY_VERSION,
    asOf:t,
    gate,
    groups,
    usableMaturedOutcomes:unique.rows.length,
    blockedFuture,
    unresolvedAtAsOf,
    invalidRows,
    duplicateRows:unique.duplicates,
    conflictingDuplicates:unique.conflicts,
    reasons,
    epistemic:'EMPIRICAL_POST_OUTCOME_MEMORY_NOT_FORECAST_PROBABILITY',
    executionMode:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecute:false
  };

  return Object.freeze({...core,fingerprint:sha256(core)});
}

export function estimateEventImpact(memory,{
  asset,
  eventType,
  horizonMs,
  regime='ANY'
}={}){
  const key=[
    String(asset??'').toUpperCase(),
    String(eventType??'').toUpperCase(),
    Number(horizonMs),
    String(regime??'ANY').toUpperCase()
  ].join('|');

  let group=memory?.groups?.find(g=>g.key===key)??null;
  if(!group&&String(regime??'ANY').toUpperCase()!=='ANY'){
    const fallback=[
      String(asset??'').toUpperCase(),
      String(eventType??'').toUpperCase(),
      Number(horizonMs),
      'ANY'
    ].join('|');
    group=memory?.groups?.find(g=>g.key===fallback)??null;
  }

  if(!group){
    return Object.freeze({
      status:'INSUFFICIENT',
      samples:0,
      empirical:null,
      supportScore:0,
      epistemic:'NO_EMPIRICAL_EVENT_REACTION_AVAILABLE',
      executionMode:'SHADOW_ONLY',
      action:'ABSTAIN',
      canExecute:false
    });
  }

  return Object.freeze({
    status:group.status,
    samples:group.samples,
    empirical:structuredClone(group.empirical),
    supportScore:group.supportScore,
    cohort:{
      asset:group.asset,
      eventType:group.eventType,
      horizonMs:group.horizonMs,
      regime:group.regime
    },
    epistemic:'EMPIRICAL_POST_OUTCOME_EVENT_REACTION_NOT_CAUSAL',
    executionMode:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecute:false
  });
}

export function verifyEventImpactMemory(memory){
  try{
    if(memory?.version!==EVENT_IMPACT_MEMORY_VERSION) return {ok:false,reasons:['VERSION_INVALID']};
    if(memory?.executionMode!=='SHADOW_ONLY'||memory?.canExecute!==false) return {ok:false,reasons:['EXECUTION_INVARIANT_INVALID']};
    const {fingerprint,...core}=memory;
    const expected=sha256(core);
    return fingerprint===expected?{ok:true,reasons:[],expectedFingerprint:expected}:{ok:false,reasons:['FINGERPRINT_MISMATCH'],expectedFingerprint:expected};
  }catch(err){
    return {ok:false,reasons:['EVENT_IMPACT_MEMORY_INVALID',err instanceof Error?err.message:String(err)]};
  }
}
