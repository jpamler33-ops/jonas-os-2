import { sha256 } from './institutional-kernel.mjs';
import { createCanonicalForecast, verifyCanonicalForecast } from './forecast-contract.mjs';
import { verifyScientificValidity } from './scientific-validity.mjs';
import { evaluateInstitutionalAdmission, verifyInstitutionalAdmission } from './institutional-admission.mjs';
import { createResearchTrace, verifyResearchTrace } from './research-trace.mjs';
import {
  createForecastClaimAssumptionSidecar,
  verifyForecastClaimAssumptionSidecar
} from './forecast-claim-assumption-sidecar.mjs';

export const INSTITUTIONAL_FORECAST_ISSUANCE_VERSION='TCX_INSTITUTIONAL_FORECAST_ISSUANCE_V1';

function finite(v,name){
  const n=Number(v);
  if(!Number.isFinite(n)) throw new Error(name+' must be finite');
  return n;
}
function safetyState(v){
  const x=String(v??'UNKNOWN').toUpperCase();
  return ['NORMAL','DEGRADED','SAFE_STOP','UNKNOWN'].includes(x)?x:'UNKNOWN';
}
function validityState(v){
  const x=String(v??'UNKNOWN').toUpperCase();
  return ['VALID','STALE','DRIFTED','EXPIRED','INVALIDATED','UNKNOWN'].includes(x)?x:'UNKNOWN';
}
function cloneList(v){return Array.isArray(v)?structuredClone(v):[];}
function deepFreeze(v){
  if(v&&typeof v==='object'&&!Object.isFrozen(v)){
    Object.freeze(v);
    for(const x of Object.values(v)) deepFreeze(x);
  }
  return v;
}

/**
 * Atomically binds forecast + science + admission + Research Trace into one
 * immutable issuance identity. This is a research artifact only.
 */
export function createInstitutionalForecastIssuance({
  input,
  forecastReport,
  scientificValidity,
  dataSafety,
  researchValidity,
  traceContext,
  generatedAt=Date.now()
}={}){
  const asOf=finite(input?.asOf,'input.asOf');
  const issuedAt=finite(generatedAt,'generatedAt');
  if(issuedAt<asOf) throw new Error('generatedAt cannot predate asOf');

  const scienceVerification=verifyScientificValidity(scientificValidity);
  if(!scienceVerification.ok){
    throw new Error('invalid scientific validity: '+scienceVerification.reasons.join(','));
  }

  const forecast=createCanonicalForecast({
    input,
    report:forecastReport,
    scientificValidity,
    generatedAt:issuedAt
  });
  const fv=verifyCanonicalForecast(forecast);
  if(!fv.ok) throw new Error('canonical forecast verification failed');

  const admission=evaluateInstitutionalAdmission({
    asOf,
    dataSafety,
    researchValidity,
    forecast,
    scientificValidity
  });
  const av=verifyInstitutionalAdmission(admission);
  if(!av.ok) throw new Error('institutional admission verification failed');

  const trace=createResearchTrace({
    symbol:input.symbol,
    asOf,
    generatedAt:issuedAt,
    data:{
      fabricSeq:traceContext?.data?.fabricSeq,
      fabricTailHash:traceContext?.data?.fabricTailHash,
      inputFingerprint:traceContext?.data?.inputFingerprint
    },
    release:{
      releaseId:traceContext?.release?.releaseId,
      configHash:traceContext?.release?.configHash
    },
    researchState:{
      fingerprint:traceContext?.researchState?.fingerprint,
      regime:traceContext?.researchState?.regime??input?.regimeId??'UNKNOWN',
      epistemic:traceContext?.researchState?.epistemic??'DERIVED_RESEARCH_STATE'
    },
    evidence:cloneList(traceContext?.evidence),
    contradictions:cloneList(traceContext?.contradictions),
    expansion:traceContext?.expansion==null?null:structuredClone(traceContext.expansion),
    forecast,
    science:scientificValidity,
    safety:{
      state:safetyState(dataSafety?.state??dataSafety?.gate),
      reasons:[...new Set([
        ...cloneList(dataSafety?.hardReasons),
        ...cloneList(dataSafety?.softReasons),
        ...cloneList(dataSafety?.reasons),
        ...cloneList(dataSafety?.errors),
        ...cloneList(dataSafety?.warnings),
        ...admission.reasons.filter(x=>x.startsWith('DATA_'))
      ].map(String))],
      execution:'SHADOW_ONLY',
      canExecute:false
    },
    validity:{
      state:validityState(researchValidity?.status??researchValidity?.state),
      reasons:[
        ...cloneList(researchValidity?.hardReasons),
        ...cloneList(researchValidity?.reasons),
        ...admission.reasons.filter(x=>x.startsWith('RESEARCH_'))
      ]
    },
    provenance:{
      source:traceContext?.provenance?.source??'TCX_INSTITUTIONAL_FORECAST_ISSUANCE',
      version:traceContext?.provenance?.version??INSTITUTIONAL_FORECAST_ISSUANCE_VERSION
    }
  });

  const tv=verifyResearchTrace(trace);
  if(!tv.ok) throw new Error('research trace verification failed');

  const canonicalInputFingerprint=input?.inputFingerprint??traceContext?.data?.inputFingerprint;
  if(
    input?.inputFingerprint!=null&&
    traceContext?.data?.inputFingerprint!=null&&
    String(input.inputFingerprint)!==String(traceContext.data.inputFingerprint)
  ){
    throw new Error('forecast input fingerprint mismatch between input and trace context');
  }

  const claimAssumptionSidecar=createForecastClaimAssumptionSidecar({
    input:{...input,inputFingerprint:canonicalInputFingerprint},
    forecast,
    scientificValidity,
    admission,
    traceId:trace.traceId,
    generatedAt:issuedAt,
    declarations:traceContext?.claimAssumptionDeclarations??null
  });
  const cav=verifyForecastClaimAssumptionSidecar(claimAssumptionSidecar);
  if(!cav.ok) throw new Error('claim-assumption sidecar verification failed: '+cav.reasons.join(','));

  const core={
    version:INSTITUTIONAL_FORECAST_ISSUANCE_VERSION,
    symbol:String(input.symbol).toUpperCase(),
    asOf,
    generatedAt:issuedAt,
    forecastFingerprint:forecast.fingerprint,
    scienceFingerprint:scientificValidity.fingerprint,
    admissionFingerprint:admission.fingerprint,
    traceId:trace.traceId,
    gate:admission.gate,
    researchDisposition:admission.researchDisposition,
    probabilityDisplayAllowed:admission.probabilityDisplayAllowed,
    executionMode:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecute:false
  };

  return deepFreeze({
    ...core,
    issuanceId:sha256(core),
    forecast,
    scientificValidity:structuredClone(scientificValidity),
    admission,
    trace,
    claimAssumptionSidecar
  });
}

export function verifyInstitutionalForecastIssuance(value){
  try{
    if(value?.version!==INSTITUTIONAL_FORECAST_ISSUANCE_VERSION) return {ok:false,reasons:['VERSION_INVALID']};
    const reasons=[];
    if(value?.executionMode!=='SHADOW_ONLY') reasons.push('EXECUTION_MODE_INVALID');
    if(value?.action!=='ABSTAIN') reasons.push('ACTION_INVALID');
    if(value?.canExecute!==false) reasons.push('CAN_EXECUTE_INVALID');

    const fv=verifyCanonicalForecast(value?.forecast);
    const sv=verifyScientificValidity(value?.scientificValidity);
    const av=verifyInstitutionalAdmission(value?.admission);
    const tv=verifyResearchTrace(value?.trace);
    if(!fv.ok) reasons.push('FORECAST_INVALID');
    if(!sv.ok) reasons.push('SCIENCE_INVALID');
    if(!av.ok) reasons.push('ADMISSION_INVALID');
    if(!tv.ok) reasons.push('TRACE_INVALID');

    if(value?.claimAssumptionSidecar!=null){
      const cv=verifyForecastClaimAssumptionSidecar(value.claimAssumptionSidecar);
      if(!cv.ok) reasons.push('CLAIM_ASSUMPTION_SIDECAR_INVALID');
      if(value.claimAssumptionSidecar.forecastFingerprint!==value?.forecast?.fingerprint) reasons.push('CLAIM_ASSUMPTION_FORECAST_LINK_MISMATCH');
      if(value.claimAssumptionSidecar.scienceFingerprint!==value?.scientificValidity?.fingerprint) reasons.push('CLAIM_ASSUMPTION_SCIENCE_LINK_MISMATCH');
      if(value.claimAssumptionSidecar.admissionFingerprint!==value?.admission?.fingerprint) reasons.push('CLAIM_ASSUMPTION_ADMISSION_LINK_MISMATCH');
      if(value.claimAssumptionSidecar.traceId!==value?.trace?.traceId) reasons.push('CLAIM_ASSUMPTION_TRACE_LINK_MISMATCH');
    }

    if(value?.forecastFingerprint!==value?.forecast?.fingerprint) reasons.push('FORECAST_FINGERPRINT_LINK_MISMATCH');
    if(value?.scienceFingerprint!==value?.scientificValidity?.fingerprint) reasons.push('SCIENCE_FINGERPRINT_LINK_MISMATCH');
    if(value?.admissionFingerprint!==value?.admission?.fingerprint) reasons.push('ADMISSION_FINGERPRINT_LINK_MISMATCH');
    if(value?.traceId!==value?.trace?.traceId) reasons.push('TRACE_ID_LINK_MISMATCH');

    const core={
      version:value?.version,
      symbol:value?.symbol,
      asOf:value?.asOf,
      generatedAt:value?.generatedAt,
      forecastFingerprint:value?.forecastFingerprint,
      scienceFingerprint:value?.scienceFingerprint,
      admissionFingerprint:value?.admissionFingerprint,
      traceId:value?.traceId,
      gate:value?.gate,
      researchDisposition:value?.researchDisposition,
      probabilityDisplayAllowed:value?.probabilityDisplayAllowed,
      executionMode:value?.executionMode,
      action:value?.action,
      canExecute:value?.canExecute
    };
    const expected=sha256(core);
    if(value?.issuanceId!==expected) reasons.push('ISSUANCE_ID_MISMATCH');

    return {ok:reasons.length===0,reasons,expectedIssuanceId:expected};
  }catch(err){
    return {ok:false,reasons:['ISSUANCE_INVALID',err instanceof Error?err.message:String(err)]};
  }
}
