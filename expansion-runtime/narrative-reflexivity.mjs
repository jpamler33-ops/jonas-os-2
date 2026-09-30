import { sha256 } from '../institutional-kernel.mjs';

export const NARRATIVE_REFLEXIVITY_VERSION='TCX_NARRATIVE_REFLEXIVITY_V1';
const GATES=new Set(['PASS','CAUTION','INSUFFICIENT','ABSTAIN']);
function finite(v){const n=Number(v);return Number.isFinite(n)?n:null;}
function clamp01(v){const n=finite(v);return n==null?null:Math.max(0,Math.min(1,n));}
function freeze(v){if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.freeze(v);for(const x of Object.values(v))freeze(x);}return v;}
function gate(v){const x=String(v||'INSUFFICIENT').toUpperCase();return GATES.has(x)?x:'INSUFFICIENT';}

export function buildNarrativeReflexivityEvidence({asOf,topic,observations=[],marketContext={}}={}){
  const t=finite(asOf); if(t==null) throw new Error('asOf must be finite');
  const subject=String(topic||'').trim(); if(!subject) throw new Error('topic required');
  let futureRejected=0,invalidRejected=0;
  const rows=[];
  for(const r of Array.isArray(observations)?observations:[]){
    const availableAt=finite(r?.availableAt), sentiment=finite(r?.sentiment), engagement=Math.max(0,finite(r?.engagement)??0);
    if(availableAt==null||sentiment==null){invalidRejected++;continue;}
    if(availableAt>t){futureRejected++;continue;}
    rows.push({availableAt,sentiment:Math.max(-1,Math.min(1,sentiment)),engagement,
      source:String(r?.source||'PUBLIC_SOURCE'),sourceClass:String(r?.sourceClass||'UNKNOWN'),
      observationId:String(r?.observationId||sha256({subject,availableAt,sentiment,source:r?.source||''})).slice(0,64)});
  }
  const weight=rows.reduce((a,r)=>a+Math.max(1,r.engagement),0);
  const weightedSentiment=weight?rows.reduce((a,r)=>a+r.sentiment*Math.max(1,r.engagement),0)/weight:null;
  const sources=new Set(rows.map(r=>r.source));
  const sourceDiversity=rows.length?sources.size/rows.length:0;
  const priceReturn=finite(marketContext?.priceReturn);
  const attentionChange=finite(marketContext?.attentionChange);
  const disagreement=rows.length>1&&weightedSentiment!=null
    ? rows.reduce((a,r)=>a+Math.abs(r.sentiment-weightedSentiment),0)/rows.length:null;
  const reflexivityDiagnostic=priceReturn!=null&&attentionChange!=null
    ? Math.sign(priceReturn)===Math.sign(attentionChange)&&Math.abs(attentionChange)>.1
    : null;
  const reasons=[];
  if(rows.length<5) reasons.push('NARRATIVE_SAMPLE_INSUFFICIENT');
  if(sourceDiversity<.25) reasons.push('SOURCE_DIVERSITY_LOW');
  if(futureRejected) reasons.push('FUTURE_OBSERVATIONS_REJECTED');
  let evidenceGate=rows.length<5?'INSUFFICIENT':sourceDiversity<.25?'CAUTION':'PASS';
  const core={version:NARRATIVE_REFLEXIVITY_VERSION,asOf:t,topic:subject,evidenceGate:gate(evidenceGate),reasons,
    narrative:{sampleSize:rows.length,weightedSentiment,sourceCount:sources.size,sourceDiversity,disagreement},
    reflexivity:{diagnostic:reflexivityDiagnostic,priceReturn,attentionChange,
      classification:'CO_MOVEMENT_DIAGNOSTIC_NOT_CAUSAL_FEEDBACK_PROOF'},
    audit:{futureRejected,invalidRejected,lastAvailableAt:rows.at(-1)?.availableAt??null},
    lineage:rows.map(({observationId,availableAt,source,sourceClass})=>({observationId,availableAt,source,sourceClass})),
    epistemic:{narrative:'OBSERVED_PUBLIC_DISCOURSE',reflexivity:'HYPOTHESIS_DIAGNOSTIC_NOT_CAUSAL',forecast:'NOT_FORECAST_PROBABILITY'},
    restrictions:{mayExecute:false,mayRouteStrategy:false,mayMutateForecast:false,mayBypassInstitutionalAdmission:false},
    executionMode:'SHADOW_ONLY',action:'ABSTAIN',canExecute:false};
  return freeze({...core,fingerprint:sha256(core)});
}
export function verifyNarrativeReflexivityEvidence(value){
  try{if(value?.version!==NARRATIVE_REFLEXIVITY_VERSION)return{ok:false,reasons:['VERSION_INVALID']};
    const reasons=[];if(value?.executionMode!=='SHADOW_ONLY'||value?.action!=='ABSTAIN'||value?.canExecute!==false)reasons.push('EXECUTION_INVARIANT_INVALID');
    if(value?.restrictions?.mayBypassInstitutionalAdmission!==false)reasons.push('ADMISSION_BYPASS_INVALID');
    const {fingerprint,...core}=value||{};const expected=sha256(core);if(fingerprint!==expected)reasons.push('FINGERPRINT_MISMATCH');
    return{ok:reasons.length===0,reasons,expectedFingerprint:expected};
  }catch(err){return{ok:false,reasons:['NARRATIVE_REFLEXIVITY_INVALID',err instanceof Error?err.message:String(err)]};}
}
