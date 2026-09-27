import { sha256 } from './institutional-kernel.mjs';

export const RESEARCH_TRACE_VERSION='TCX_RESEARCH_TRACE_V1';

const SYMBOL_RE=/^[A-Z0-9]{2,18}USDT$/;
const SAFETY_STATES=new Set(['NORMAL','DEGRADED','SAFE_STOP','UNKNOWN']);
const VALIDITY_STATES=new Set(['VALID','STALE','DRIFTED','EXPIRED','INVALIDATED','UNKNOWN']);

function finite(v,name){
  const n=Number(v);
  if(!Number.isFinite(n)) throw new Error(`${name} must be finite`);
  return n;
}

function hash64(v,name){
  const s=String(v??'');
  if(!/^[a-f0-9]{64}$/i.test(s)) throw new Error(`${name} must be a sha256 hex string`);
  return s.toLowerCase();
}

function nonEmpty(v,name){
  const s=String(v??'').trim();
  if(!s) throw new Error(`${name} is required`);
  return s;
}

function cleanList(xs){
  if(!Array.isArray(xs)) return [];
  return xs.filter(x=>x!=null).map(x=>structuredClone(x));
}

function deepFreeze(value){
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    Object.freeze(value);
    for(const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

function traceCore(input){
  const symbol=String(input?.symbol??'').toUpperCase();
  if(!SYMBOL_RE.test(symbol)) throw new Error('invalid research trace symbol');

  const asOf=finite(input?.asOf,'asOf');
  const generatedAt=finite(input?.generatedAt,'generatedAt');
  if(generatedAt<asOf) throw new Error('generatedAt cannot predate asOf');

  const fabricSeq=Number(input?.data?.fabricSeq);
  if(!Number.isInteger(fabricSeq)||fabricSeq<0) throw new Error('data.fabricSeq must be a non-negative integer');

  const safetyState=String(input?.safety?.state??'UNKNOWN').toUpperCase();
  if(!SAFETY_STATES.has(safetyState)) throw new Error('unsupported safety state');

  const validityState=String(input?.validity?.state??'UNKNOWN').toUpperCase();
  if(!VALIDITY_STATES.has(validityState)) throw new Error('unsupported validity state');

  const canExecute=Boolean(input?.safety?.canExecute);
  if(canExecute) throw new Error('TCX research trace cannot enable execution');

  const execution=String(input?.safety?.execution??'SHADOW_ONLY').toUpperCase();
  if(execution!=='SHADOW_ONLY') throw new Error('research trace execution must remain SHADOW_ONLY');

  return {
    schemaVersion:RESEARCH_TRACE_VERSION,
    symbol,
    asOf,
    generatedAt,
    data:{
      fabricSeq,
      fabricTailHash:hash64(input?.data?.fabricTailHash,'data.fabricTailHash'),
      inputFingerprint:hash64(input?.data?.inputFingerprint,'data.inputFingerprint')
    },
    release:{
      releaseId:nonEmpty(input?.release?.releaseId,'release.releaseId'),
      configHash:hash64(input?.release?.configHash,'release.configHash')
    },
    researchState:{
      fingerprint:hash64(input?.researchState?.fingerprint,'researchState.fingerprint'),
      regime:String(input?.researchState?.regime??'UNKNOWN'),
      epistemic:String(input?.researchState?.epistemic??'DERIVED_RESEARCH_STATE')
    },
    evidence:cleanList(input?.evidence),
    contradictions:cleanList(input?.contradictions),
    forecast:input?.forecast==null?null:structuredClone(input.forecast),
    science:input?.science==null?null:structuredClone(input.science),
    safety:{
      state:safetyState,
      reasons:cleanList(input?.safety?.reasons),
      execution:'SHADOW_ONLY',
      action:'ABSTAIN',
      canExecute:false
    },
    validity:{
      state:validityState,
      reasons:cleanList(input?.validity?.reasons)
    },
    provenance:{
      source:nonEmpty(input?.provenance?.source??'TCX','provenance.source'),
      version:nonEmpty(input?.provenance?.version??RESEARCH_TRACE_VERSION,'provenance.version')
    }
  };
}

export function createResearchTrace(input){
  const core=traceCore(input);
  const traceId=sha256(core);
  return deepFreeze({...core,traceId});
}

export function verifyResearchTrace(trace){
  try{
    if(trace?.schemaVersion!==RESEARCH_TRACE_VERSION) return {ok:false,reasons:['SCHEMA_VERSION_INVALID']};
    const expected=sha256(traceCore(trace));
    const actual=String(trace?.traceId??'');
    const reasons=[];
    if(actual!==expected) reasons.push('TRACE_HASH_MISMATCH');
    if(trace?.safety?.execution!=='SHADOW_ONLY') reasons.push('EXECUTION_INVARIANT_VIOLATION');
    if(trace?.safety?.action!=='ABSTAIN') reasons.push('ACTION_INVARIANT_VIOLATION');
    if(trace?.safety?.canExecute!==false) reasons.push('CAN_EXECUTE_INVARIANT_VIOLATION');
    return {ok:reasons.length===0,reasons,expectedTraceId:expected};
  }catch(err){
    return {ok:false,reasons:['TRACE_INVALID',err instanceof Error?err.message:String(err)]};
  }
}

export function createResearchTraceEvaluation(trace,{
  horizonId,
  maturedAt,
  observedAt,
  outcome,
  metrics={},
  provenance={}
}={}){
  const verification=verifyResearchTrace(trace);
  if(!verification.ok) throw new Error('cannot evaluate invalid research trace');

  const m=finite(maturedAt,'maturedAt');
  const o=finite(observedAt,'observedAt');
  if(m<trace.asOf) throw new Error('outcome maturity cannot predate trace asOf');
  if(o<m) throw new Error('outcome cannot be observed before maturity');

  const core={
    schemaVersion:'TCX_RESEARCH_TRACE_EVALUATION_V1',
    traceId:trace.traceId,
    symbol:trace.symbol,
    horizonId:nonEmpty(horizonId,'horizonId'),
    maturedAt:m,
    observedAt:o,
    outcome:structuredClone(outcome??{}),
    metrics:structuredClone(metrics??{}),
    provenance:{
      source:nonEmpty(provenance?.source??'TCX_OUTCOME_MATURITY','provenance.source'),
      version:nonEmpty(provenance?.version??'V1','provenance.version')
    }
  };
  return deepFreeze({...core,evaluationId:sha256(core)});
}

export function verifyResearchTraceEvaluation(evaluation,trace){
  try{
    const verification=verifyResearchTrace(trace);
    if(!verification.ok) return {ok:false,reasons:['TRACE_INVALID',...verification.reasons]};
    if(evaluation?.traceId!==trace.traceId) return {ok:false,reasons:['TRACE_ID_MISMATCH']};
    const {evaluationId,...core}=evaluation||{};
    const expected=sha256(core);
    return evaluationId===expected
      ? {ok:true,reasons:[],expectedEvaluationId:expected}
      : {ok:false,reasons:['EVALUATION_HASH_MISMATCH'],expectedEvaluationId:expected};
  }catch(err){
    return {ok:false,reasons:['EVALUATION_INVALID',err instanceof Error?err.message:String(err)]};
  }
}

export function researchTraceSummary(trace){
  const verification=verifyResearchTrace(trace);
  return {
    version:RESEARCH_TRACE_VERSION,
    traceId:trace?.traceId??null,
    symbol:trace?.symbol??null,
    asOf:trace?.asOf??null,
    generatedAt:trace?.generatedAt??null,
    safety:trace?.safety?.state??'UNKNOWN',
    validity:trace?.validity?.state??'UNKNOWN',
    forecastPresent:Boolean(trace?.forecast),
    sciencePresent:Boolean(trace?.science),
    evidenceCount:Array.isArray(trace?.evidence)?trace.evidence.length:0,
    contradictionCount:Array.isArray(trace?.contradictions)?trace.contradictions.length:0,
    integrity:verification.ok?'VALID':'INVALID',
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecute:false
  };
}
