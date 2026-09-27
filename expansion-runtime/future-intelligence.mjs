import { sha256 } from '../institutional-kernel.mjs';

export const FUTURE_INTELLIGENCE_VERSION='TCX_FUTURE_INTELLIGENCE_V1';
const GATES=new Set(['PASS','CAUTION','INSUFFICIENT','ABSTAIN']);
function finite(v){const n=Number(v);return Number.isFinite(n)?n:null;}
function clamp01(v){const n=finite(v);return n==null?null:Math.max(0,Math.min(1,n));}
function freeze(v){if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.freeze(v);for(const x of Object.values(v))freeze(x);}return v;}
function gate(v){const x=String(v||'INSUFFICIENT').toUpperCase();return GATES.has(x)?x:'INSUFFICIENT';}

export function buildFutureIntelligenceEvidence({asOf,theme,observations=[],horizonDays=365}={}){
  const t=finite(asOf); if(t==null) throw new Error('asOf must be finite');
  const subject=String(theme||'').trim(); if(!subject) throw new Error('theme required');
  const horizon=Math.max(30,Math.min(3650,Number(horizonDays)||365));
  let futureRejected=0,invalidRejected=0;
  const rows=[];
  for(const r of Array.isArray(observations)?observations:[]){
    const availableAt=finite(r?.availableAt), value=finite(r?.value);
    if(availableAt==null||value==null){invalidRejected++;continue;}
    if(availableAt>t){futureRejected++;continue;}
    const dimension=String(r?.dimension||'UNKNOWN').toUpperCase();
    rows.push({availableAt,value,dimension,source:String(r?.source||'PUBLIC_SOURCE'),
      sourceClass:String(r?.sourceClass||'UNKNOWN'),
      observationId:String(r?.observationId||sha256({subject,availableAt,value,dimension,source:r?.source||''})).slice(0,64)});
  }
  rows.sort((a,b)=>a.availableAt-b.availableAt);
  const dims={};
  for(const r of rows)(dims[r.dimension]??=[]).push(r);
  const dimensionSignals={};
  for(const [name,xs] of Object.entries(dims)){
    const first=xs[0]?.value,last=xs.at(-1)?.value;
    const change=xs.length>1&&first!==0?(last-first)/Math.abs(first):null;
    dimensionSignals[name]={sampleSize:xs.length,latest:last??null,change};
  }
  const sourceCount=new Set(rows.map(r=>r.source)).size;
  const dimensions=Object.keys(dims);
  const required=['ADOPTION','CAPITAL','INFRASTRUCTURE','SUPPLY'];
  const coverage=required.filter(x=>dims[x]?.length).length/required.length;
  const reasons=[];
  if(rows.length<8) reasons.push('SAMPLE_INSUFFICIENT');
  if(sourceCount<3) reasons.push('SOURCE_DIVERSITY_LOW');
  if(coverage<.5) reasons.push('DIMENSION_COVERAGE_LOW');
  if(futureRejected) reasons.push('FUTURE_OBSERVATIONS_REJECTED');
  let evidenceGate=rows.length<4?'INSUFFICIENT':(sourceCount<2||coverage<.25?'INSUFFICIENT':(reasons.length?'CAUTION':'PASS'));
  const core={version:FUTURE_INTELLIGENCE_VERSION,asOf:t,theme:subject,horizonDays:horizon,
    evidenceGate:gate(evidenceGate),reasons,
    dimensions:dimensionSignals,coverage,sourceCount,
    scenarioEvidence:{classification:'SLOW_HORIZON_SCENARIO_EVIDENCE_NOT_PRICE_TARGET',
      positiveDrivers:dimensions.filter(x=>dimensionSignals[x]?.change>0),
      negativeDrivers:dimensions.filter(x=>dimensionSignals[x]?.change<0)},
    audit:{futureRejected,invalidRejected,observationCount:rows.length,lastAvailableAt:rows.at(-1)?.availableAt??null},
    lineage:rows.map(({observationId,availableAt,source,sourceClass,dimension})=>({observationId,availableAt,source,sourceClass,dimension})),
    epistemic:{trend:'DESCRIPTIVE_LONG_HORIZON_EVIDENCE',scenario:'HYPOTHESIS_NOT_FORECAST_PROBABILITY',causality:'NOT_IDENTIFIED'},
    restrictions:{mayExecute:false,mayRouteStrategy:false,mayMutateFastForecast:false,mayBypassInstitutionalAdmission:false},
    executionMode:'SHADOW_ONLY',action:'ABSTAIN',canExecute:false};
  return freeze({...core,fingerprint:sha256(core)});
}
export function verifyFutureIntelligenceEvidence(value){
  try{if(value?.version!==FUTURE_INTELLIGENCE_VERSION)return{ok:false,reasons:['VERSION_INVALID']};
    const reasons=[];if(value?.executionMode!=='SHADOW_ONLY'||value?.action!=='ABSTAIN'||value?.canExecute!==false)reasons.push('EXECUTION_INVARIANT_INVALID');
    if(value?.restrictions?.mayMutateFastForecast!==false)reasons.push('FAST_FORECAST_BOUNDARY_INVALID');
    if(value?.restrictions?.mayBypassInstitutionalAdmission!==false)reasons.push('ADMISSION_BYPASS_INVALID');
    const {fingerprint,...core}=value||{};const expected=sha256(core);if(fingerprint!==expected)reasons.push('FINGERPRINT_MISMATCH');
    return{ok:reasons.length===0,reasons,expectedFingerprint:expected};
  }catch(err){return{ok:false,reasons:['FUTURE_INTELLIGENCE_INVALID',err instanceof Error?err.message:String(err)]};}
}
