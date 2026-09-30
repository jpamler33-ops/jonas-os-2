import { sha256 } from './institutional-kernel.mjs';

export const SCIENTIFIC_VALIDITY_VERSION='TCX_SCIENTIFIC_VALIDITY_V1';

export const SCIENTIFIC_GATES=Object.freeze([
  'PASS',
  'CAUTION',
  'INSUFFICIENT',
  'ABSTAIN'
]);

const GATE_RANK=Object.freeze({
  PASS:0,
  CAUTION:1,
  INSUFFICIENT:2,
  ABSTAIN:3
});

function cleanText(value,fallback='UNKNOWN'){
  const s=String(value??'').trim();
  return s||fallback;
}

function normalizeGate(value){
  const gate=String(value??'INSUFFICIENT').toUpperCase();
  return SCIENTIFIC_GATES.includes(gate)?gate:'INSUFFICIENT';
}

function finite(value){
  const n=Number(value);
  return Number.isFinite(n)?n:null;
}

function hasNonFinite(value,seen=new Set()){
  if(typeof value==='number') return !Number.isFinite(value);
  if(value==null||typeof value!=='object') return false;
  if(seen.has(value)) return false;
  seen.add(value);
  if(Array.isArray(value)) return value.some(v=>hasNonFinite(v,seen));
  return Object.values(value).some(v=>hasNonFinite(v,seen));
}

function canonicalSafe(value,seen=new Set()){
  if(value===null||typeof value==='string'||typeof value==='boolean') return value;
  if(typeof value==='number') return Number.isFinite(value)?(Object.is(value,-0)?0:value):null;
  if(value===undefined||typeof value==='function'||typeof value==='symbol') return undefined;
  if(Array.isArray(value)) return value.map(v=>canonicalSafe(v,seen));
  if(typeof value==='object'){
    if(seen.has(value)) return '[CIRCULAR]';
    seen.add(value);
    const out={};
    for(const key of Object.keys(value).sort()){
      const v=canonicalSafe(value[key],seen);
      if(v!==undefined) out[key]=v;
    }
    seen.delete(value);
    return out;
  }
  return String(value);
}

function normalizeGuard(input,asOf){
  const id=cleanText(input?.id);
  const required=input?.required!==false;
  const report=input?.report??null;
  const reportAsOf=finite(report?.asOf);
  const reasons=[];

  if(!report){
    return {
      id,
      required,
      usable:false,
      gate:'INSUFFICIENT',
      sourceGate:null,
      reportAsOf:null,
      futureBlocked:false,
      executionMode:null,
      reasons:['REPORT_MISSING'],
      fingerprint:sha256({id,required,reason:'REPORT_MISSING'})
    };
  }

  if(reportAsOf==null){
    reasons.push('REPORT_ASOF_INVALID');
  } else if(reportAsOf>asOf){
    reasons.push('REPORT_FROM_FUTURE');
  }

  const executionMode=cleanText(report?.executionMode,'UNKNOWN').toUpperCase();
  if(executionMode!=='SHADOW_ONLY') reasons.push('EXECUTION_MODE_INVALID');

  if(hasNonFinite(report)) reasons.push('REPORT_NONFINITE');

  const sourceGate=normalizeGate(report?.gate);
  if(!SCIENTIFIC_GATES.includes(String(report?.gate??'').toUpperCase())){
    reasons.push('SOURCE_GATE_INVALID');
  }

  const futureBlocked=reasons.includes('REPORT_FROM_FUTURE');
  const usable=reasons.length===0;
  const gate=usable?sourceGate:(required?'ABSTAIN':'INSUFFICIENT');

  return {
    id,
    required,
    usable,
    gate,
    sourceGate,
    reportAsOf,
    futureBlocked,
    executionMode,
    reasons,
    fingerprint:sha256({
      id,
      required,
      gate,
      sourceGate,
      reportAsOf,
      executionMode,
      reasons,
      reportFingerprint:sha256(canonicalSafe(report))
    })
  };
}

function strictest(gates){
  let result='PASS';
  for(const gate of gates){
    if((GATE_RANK[gate]??GATE_RANK.INSUFFICIENT)>(GATE_RANK[result]??0)) result=gate;
  }
  return result;
}

/**
 * Aggregates scientific guards without averaging their semantics.
 * A hard ABSTAIN from any usable required guard remains ABSTAIN.
 * Missing/invalid required guards fail closed.
 */
export function evaluateScientificValidity({
  asOf,
  guards=[],
  minimumRequiredCoverage=1
}={}){
  const t=finite(asOf);
  if(t==null) throw new Error('scientific validity asOf must be finite');
  if(!Array.isArray(guards)) throw new Error('scientific validity guards must be an array');

  const normalized=guards.map(g=>normalizeGuard(g,t));
  const required=normalized.filter(g=>g.required);
  const usableRequired=required.filter(g=>g.usable);
  const coverage=required.length?usableRequired.length/required.length:0;
  const minCoverage=Math.max(0,Math.min(1,Number(minimumRequiredCoverage)||0));

  const reasons=[];
  let gate;

  if(!required.length){
    gate='INSUFFICIENT';
    reasons.push('NO_REQUIRED_SCIENTIFIC_GUARDS');
  } else if(required.some(g=>!g.usable)){
    gate='ABSTAIN';
    reasons.push('REQUIRED_SCIENTIFIC_GUARD_INVALID_OR_MISSING');
  } else if(coverage<minCoverage){
    gate='ABSTAIN';
    reasons.push('REQUIRED_SCIENTIFIC_COVERAGE_BELOW_MINIMUM');
  } else {
    gate=strictest(required.map(g=>g.gate));
    if(gate==='ABSTAIN') reasons.push('SCIENTIFIC_GUARD_ABSTAIN');
    else if(gate==='INSUFFICIENT') reasons.push('SCIENTIFIC_EVIDENCE_INSUFFICIENT');
    else if(gate==='CAUTION') reasons.push('SCIENTIFIC_EVIDENCE_CAUTION');
  }

  const optional=normalized.filter(g=>!g.required);
  const optionalGate=optional.length?strictest(optional.filter(g=>g.usable).map(g=>g.gate)):'PASS';
  if(optional.some(g=>!g.usable)) reasons.push('OPTIONAL_SCIENTIFIC_GUARD_UNAVAILABLE');
  if(optionalGate==='ABSTAIN' && gate!=='ABSTAIN'){
    gate='CAUTION';
    reasons.push('OPTIONAL_SCIENTIFIC_GUARD_ABSTAIN');
  } else if(optionalGate==='CAUTION' && gate==='PASS'){
    gate='CAUTION';
    reasons.push('OPTIONAL_SCIENTIFIC_GUARD_CAUTION');
  }

  const resultCore={
    version:SCIENTIFIC_VALIDITY_VERSION,
    asOf:t,
    gate,
    coverage,
    requiredGuardCount:required.length,
    usableRequiredGuardCount:usableRequired.length,
    guards:normalized,
    reasons:[...new Set(reasons)],
    epistemic:'SCIENTIFIC_SUPPORT_DIAGNOSTIC_NOT_FORECAST_PROBABILITY',
    executionMode:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecute:false
  };

  return Object.freeze({
    ...resultCore,
    fingerprint:sha256(resultCore)
  });
}

export function verifyScientificValidity(result){
  try{
    if(result?.version!==SCIENTIFIC_VALIDITY_VERSION) return {ok:false,reasons:['VERSION_INVALID']};
    if(result?.executionMode!=='SHADOW_ONLY') return {ok:false,reasons:['EXECUTION_MODE_INVALID']};
    if(result?.action!=='ABSTAIN') return {ok:false,reasons:['ACTION_INVALID']};
    if(result?.canExecute!==false) return {ok:false,reasons:['CAN_EXECUTE_INVALID']};
    if(!SCIENTIFIC_GATES.includes(result?.gate)) return {ok:false,reasons:['GATE_INVALID']};
    const {fingerprint,...core}=result;
    const expected=sha256(core);
    return fingerprint===expected
      ? {ok:true,reasons:[],expectedFingerprint:expected}
      : {ok:false,reasons:['FINGERPRINT_MISMATCH'],expectedFingerprint:expected};
  }catch(err){
    return {ok:false,reasons:['SCIENTIFIC_VALIDITY_INVALID',err instanceof Error?err.message:String(err)]};
  }
}

export function scientificValiditySummary(result){
  const integrity=verifyScientificValidity(result);
  return {
    version:SCIENTIFIC_VALIDITY_VERSION,
    gate:result?.gate??'INSUFFICIENT',
    coverage:Number(result?.coverage??0),
    requiredGuardCount:Number(result?.requiredGuardCount??0),
    usableRequiredGuardCount:Number(result?.usableRequiredGuardCount??0),
    reasons:Array.isArray(result?.reasons)?[...result.reasons]:[],
    integrity:integrity.ok?'VALID':'INVALID',
    executionMode:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecute:false
  };
}
