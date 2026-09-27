import { sha256 } from '../institutional-kernel.mjs';

export const SOURCE_INTELLIGENCE_VERSION='TCX_SOURCE_INTELLIGENCE_V1';

const DEFAULTS=Object.freeze({
  minResolved:12,
  cautionReliabilityLowerBound:.45,
  hardReliabilityLowerBound:.25,
  priorAlpha:2,
  priorBeta:2
});

const clamp01=x=>Math.max(0,Math.min(1,Number(x)||0));

function finite(v){
  const n=Number(v);
  return Number.isFinite(n)?n:null;
}

function validRow(r){
  const availableAt=finite(r?.availableAt);
  const resolvedAt=finite(r?.resolvedAt);
  return Boolean(r?.id&&r?.sourceId&&r?.eventId)&&
    availableAt!=null&&resolvedAt!=null&&
    availableAt<=resolvedAt&&
    typeof r?.confirmed==='boolean';
}

function wilson(successes,n,z=1.96){
  if(n<=0) return {lower:0,upper:1,center:.5};
  const p=successes/n;
  const z2=z*z;
  const denom=1+z2/n;
  const center=(p+z2/(2*n))/denom;
  const margin=z*Math.sqrt((p*(1-p)+z2/(4*n))/n)/denom;
  return {
    lower:clamp01(center-margin),
    upper:clamp01(center+margin),
    center:clamp01(center)
  };
}

function uniqueById(rows){
  const seen=new Map();
  let duplicates=0;
  let conflicts=0;
  for(const r of rows){
    const id=String(r.id);
    if(!seen.has(id)){
      seen.set(id,r);
      continue;
    }
    duplicates++;
    if(sha256(seen.get(id))!==sha256(r)) conflicts++;
  }
  return {rows:[...seen.values()],duplicates,conflicts};
}

export function evaluateSourceReliability(asOf,observations,options={}){
  const t=finite(asOf);
  if(t==null) throw new Error('asOf must be finite');
  if(!Array.isArray(observations)) throw new Error('observations must be an array');

  const cfg={...DEFAULTS,...options};
  const invalidRows=observations.filter(r=>!validRow(r)).length;
  const valid=observations.filter(validRow);
  const futureAvailable=valid.filter(r=>Number(r.availableAt)>t).length;
  const unresolvedAtAsOf=valid.filter(r=>Number(r.availableAt)<=t&&Number(r.resolvedAt)>t).length;
  const matured=valid.filter(r=>Number(r.availableAt)<=t&&Number(r.resolvedAt)<=t);
  const dedup=uniqueById(matured);

  const required=new Set((options.requiredSourceIds||[]).map(String));
  const sourceIds=[...new Set(dedup.rows.map(r=>String(r.sourceId)))];

  const sources=sourceIds.map(sourceId=>{
    const xs=dedup.rows.filter(r=>String(r.sourceId)===sourceId);
    const confirmed=xs.filter(r=>r.confirmed===true).length;
    const n=xs.length;
    const posteriorMean=(confirmed+Number(cfg.priorAlpha))/(n+Number(cfg.priorAlpha)+Number(cfg.priorBeta));
    const interval=wilson(confirmed,n);
    const impacts=xs.map(r=>finite(r.marketImpactPct)).filter(x=>x!=null).map(Math.abs);
    const influence=impacts.length?impacts.reduce((a,b)=>a+b,0)/impacts.length:0;
    const falseAlarmRate=n?(n-confirmed)/n:null;

    let status='RELIABLE';
    const reasons=[];
    if(n<Number(cfg.minResolved)){
      status='INSUFFICIENT';
      reasons.push('too few resolved source outcomes');
    }else if(interval.lower<Number(cfg.hardReliabilityLowerBound)){
      status='UNRELIABLE';
      reasons.push('resolved confirmation lower bound is below hard reliability threshold');
    }else if(interval.lower<Number(cfg.cautionReliabilityLowerBound)){
      status='FRAGILE';
      reasons.push('source reliability remains weak after uncertainty adjustment');
    }

    return {
      sourceId,
      required:required.has(sourceId),
      resolvedEvents:n,
      confirmedEvents:confirmed,
      falseAlarmRate,
      posteriorReliability:clamp01(posteriorMean),
      reliabilityLowerBound:interval.lower,
      reliabilityUpperBound:interval.upper,
      meanAbsoluteMarketImpactPct:influence,
      status,
      reasons,
      epistemic:{
        reliability:'EMPIRICAL_POST_OUTCOME_SOURCE_RELIABILITY',
        influence:'EMPIRICAL_POST_OUTCOME_MARKET_IMPACT_NOT_RELIABILITY'
      }
    };
  });

  let gate='PASS';
  const reasons=[];
  if(!sources.length||sources.every(s=>s.status==='INSUFFICIENT')){
    gate='INSUFFICIENT';
    reasons.push('no source has sufficient resolved outcome history');
  }else if(sources.some(s=>s.required&&s.status==='UNRELIABLE')){
    gate='ABSTAIN';
    reasons.push('required source is empirically unreliable');
  }else if(sources.some(s=>s.status!=='RELIABLE')){
    gate='CAUTION';
    reasons.push('one or more sources are fragile, unreliable, or insufficient');
  }

  if(dedup.conflicts){
    gate='ABSTAIN';
    reasons.push('conflicting duplicate source outcome records');
  }
  if(futureAvailable) reasons.push(futureAvailable+' future source record(s) blocked');
  if(unresolvedAtAsOf) reasons.push(unresolvedAtAsOf+' unresolved source record(s) excluded');
  if(invalidRows) reasons.push(invalidRows+' invalid source record(s) rejected');

  const core={
    version:SOURCE_INTELLIGENCE_VERSION,
    asOf:t,
    gate,
    sources,
    usableResolvedEvents:dedup.rows.length,
    blockedFuture:futureAvailable,
    unresolvedAtAsOf,
    invalidRows,
    duplicateRows:dedup.duplicates,
    conflictingDuplicates:dedup.conflicts,
    reasons,
    epistemic:'SOURCE_RELIABILITY_FROM_RESOLVED_EVENTS_NOT_POPULARITY',
    executionMode:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecute:false
  };

  return Object.freeze({...core,fingerprint:sha256(core)});
}

export function classifySourceEvent(event,reliabilityReport,{
  minInformationQuality=.55,
  hardManipulationRisk=.8
}={}){
  const sourceId=String(event?.sourceId??'');
  const source=reliabilityReport?.sources?.find(x=>x.sourceId===sourceId)??null;
  const novelty=clamp01(event?.novelty);
  const independentConfirmation=clamp01(event?.independentConfirmation);
  const manipulationRisk=clamp01(event?.manipulationRisk);
  const sourceReliability=source?.posteriorReliability??.5;

  const informationQuality=clamp01(
    .35*sourceReliability+
    .25*novelty+
    .25*independentConfirmation+
    .15*(1-manipulationRisk)
  );

  let gate='PASS';
  const reasons=[];
  if(!source||source.status==='INSUFFICIENT'){
    gate='CAUTION';
    reasons.push('source reliability history insufficient');
  }
  if(source?.status==='UNRELIABLE'){
    gate='ABSTAIN';
    reasons.push('source has poor resolved reliability');
  }
  if(manipulationRisk>=Number(hardManipulationRisk)){
    gate='ABSTAIN';
    reasons.push('event manipulation risk above hard threshold');
  }else if(informationQuality<Number(minInformationQuality)&&gate==='PASS'){
    gate='CAUTION';
    reasons.push('event information-quality heuristic is weak');
  }

  return Object.freeze({
    version:'TCX_SOURCE_EVENT_CLASSIFICATION_V1',
    asOf:Number(reliabilityReport?.asOf),
    sourceId,
    gate,
    sourceStatus:source?.status??'UNKNOWN',
    sourceReliability,
    sourceInfluence:source?.meanAbsoluteMarketImpactPct??0,
    novelty,
    independentConfirmation,
    manipulationRisk,
    informationQuality,
    reasons,
    epistemic:{
      informationQuality:'DERIVED_HEURISTIC_NOT_PROBABILITY',
      sourceReliability:'EMPIRICAL_POST_OUTCOME'
    },
    executionMode:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecute:false
  });
}

export function verifySourceReliability(report){
  try{
    if(report?.version!==SOURCE_INTELLIGENCE_VERSION) return {ok:false,reasons:['VERSION_INVALID']};
    if(report?.executionMode!=='SHADOW_ONLY'||report?.canExecute!==false) return {ok:false,reasons:['EXECUTION_INVARIANT_INVALID']};
    const {fingerprint,...core}=report;
    const expected=sha256(core);
    return fingerprint===expected?{ok:true,reasons:[],expectedFingerprint:expected}:{ok:false,reasons:['FINGERPRINT_MISMATCH'],expectedFingerprint:expected};
  }catch(err){
    return {ok:false,reasons:['SOURCE_INTELLIGENCE_INVALID',err instanceof Error?err.message:String(err)]};
  }
}
