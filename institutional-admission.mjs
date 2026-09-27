import { sha256 } from './institutional-kernel.mjs';
import { verifyCanonicalForecast } from './forecast-contract.mjs';
import { verifyScientificValidity } from './scientific-validity.mjs';

export const INSTITUTIONAL_ADMISSION_VERSION='TCX_INSTITUTIONAL_ADMISSION_V1';

const RANK=Object.freeze({PASS:0,CAUTION:1,INSUFFICIENT:2,ABSTAIN:3});
const GATES=Object.keys(RANK);

function normGate(v){
  const x=String(v??'INSUFFICIENT').toUpperCase();
  return GATES.includes(x)?x:'INSUFFICIENT';
}
function strictest(xs){
  return xs.reduce((a,b)=>RANK[normGate(b)]>RANK[a]?normGate(b):a,'PASS');
}
function finite(v){
  const n=Number(v);
  return Number.isFinite(n)?n:null;
}

function dataGate(data){
  if(!data) return {gate:'ABSTAIN',reasons:['DATA_SAFETY_MISSING']};
  const raw=String(data.gate??data.state??'UNKNOWN').toUpperCase();
  if(['SAFE_STOP','INVALID','FAILED','ABSTAIN'].includes(raw)) return {gate:'ABSTAIN',reasons:['DATA_'+raw]};
  if(['DEGRADED','CAUTION','STALE'].includes(raw)) return {gate:'CAUTION',reasons:['DATA_'+raw]};
  if(['NORMAL','PASS','HEALTHY','VALID'].includes(raw)) return {gate:'PASS',reasons:[]};
  if(['INSUFFICIENT','UNKNOWN'].includes(raw)) return {gate:'INSUFFICIENT',reasons:['DATA_'+raw]};
  return {gate:'INSUFFICIENT',reasons:['DATA_STATE_UNRECOGNIZED']};
}

function researchGate(validity){
  if(!validity) return {gate:'ABSTAIN',reasons:['RESEARCH_VALIDITY_MISSING']};
  const raw=String(validity.status??validity.state??'UNKNOWN').toUpperCase();
  if(['INVALIDATED','EXPIRED','ABSTAIN'].includes(raw)) return {gate:'ABSTAIN',reasons:['RESEARCH_'+raw]};
  if(['STALE','DRIFTED','CAUTION','BASELINE'].includes(raw)) return {gate:'CAUTION',reasons:['RESEARCH_'+raw]};
  if(['VALID','PASS'].includes(raw)) return {gate:'PASS',reasons:[]};
  if(['INSUFFICIENT','UNKNOWN'].includes(raw)) return {gate:'INSUFFICIENT',reasons:['RESEARCH_'+raw]};
  return {gate:'INSUFFICIENT',reasons:['RESEARCH_STATE_UNRECOGNIZED']};
}

function componentTimeReasons(asOf,name,report){
  // asOf/availableAt define what information was knowable at the research point.
  // generatedAt may legitimately be later than asOf because computation takes time.
  const times=[
    ['asOf',finite(report?.asOf)],
    ['availableAt',finite(report?.availableAt)]
  ].filter(([,v])=>v!=null);
  return times.filter(([,v])=>v>asOf).map(([k])=>name+'_'+k.toUpperCase()+'_FROM_FUTURE');
}

/**
 * One-way institutional admission gate.
 * Downstream components can make the result stricter, never looser.
 */
export function evaluateInstitutionalAdmission({
  asOf,
  dataSafety,
  researchValidity,
  forecast,
  scientificValidity
}={}){
  const t=finite(asOf);
  if(t==null) throw new Error('admission asOf must be finite');

  const data=dataGate(dataSafety);
  const research=researchGate(researchValidity);

  const forecastVerification=forecast?verifyCanonicalForecast(forecast):{ok:false,reasons:['FORECAST_MISSING']};
  const forecastGate=forecastVerification.ok?normGate(forecast.overallGate):'ABSTAIN';

  const scienceVerification=scientificValidity?verifyScientificValidity(scientificValidity):{ok:false,reasons:['SCIENCE_MISSING']};
  const scienceGate=scienceVerification.ok?normGate(scientificValidity.gate):'ABSTAIN';

  const temporalReasons=[
    ...componentTimeReasons(t,'DATA',dataSafety),
    ...componentTimeReasons(t,'FORECAST',forecast),
    ...componentTimeReasons(t,'SCIENCE',scientificValidity)
  ];

  let gate=strictest([data.gate,research.gate,forecastGate,scienceGate]);
  const reasons=[
    ...data.reasons,
    ...research.reasons,
    ...(!forecastVerification.ok?forecastVerification.reasons.map(x=>'FORECAST_'+x):[]),
    ...(!scienceVerification.ok?scienceVerification.reasons.map(x=>'SCIENCE_'+x):[]),
    ...temporalReasons
  ];

  if(temporalReasons.length){
    gate='ABSTAIN';
  }

  const researchDisposition=
    gate==='PASS'?'ADMIT_RESEARCH':
    gate==='CAUTION'?'ADMIT_WITH_CAUTION':
    'ABSTAIN';

  const probabilityDisplayAllowed=
    (gate==='PASS'||gate==='CAUTION')&&
    Boolean(forecast?.horizons?.length)&&
    forecast.horizons.every(h=>h?.display?.probabilityDisplayAllowed===true);

  const components={
    data:{gate:data.gate,state:String(dataSafety?.state??dataSafety?.gate??'UNKNOWN')},
    research:{gate:research.gate,state:String(researchValidity?.status??researchValidity?.state??'UNKNOWN')},
    forecast:{gate:forecastGate,integrity:forecastVerification.ok?'VALID':'INVALID',fingerprint:forecast?.fingerprint??null},
    science:{gate:scienceGate,integrity:scienceVerification.ok?'VALID':'INVALID',fingerprint:scientificValidity?.fingerprint??null}
  };

  const core={
    version:INSTITUTIONAL_ADMISSION_VERSION,
    asOf:t,
    gate,
    components,
    reasons:[...new Set(reasons)],
    researchDisposition,
    researchAdmitted:researchDisposition!=='ABSTAIN',
    probabilityDisplayAllowed,
    invariants:{
      strictestWins:true,
      downstreamCanWeakenHardBlock:false,
      executionMode:'SHADOW_ONLY',
      action:'ABSTAIN',
      canExecute:false
    }
  };

  return Object.freeze({...core,fingerprint:sha256(core)});
}

export function verifyInstitutionalAdmission(value){
  try{
    if(value?.version!==INSTITUTIONAL_ADMISSION_VERSION) return {ok:false,reasons:['VERSION_INVALID']};
    if(value?.invariants?.executionMode!=='SHADOW_ONLY') return {ok:false,reasons:['EXECUTION_MODE_INVALID']};
    if(value?.invariants?.action!=='ABSTAIN') return {ok:false,reasons:['ACTION_INVALID']};
    if(value?.invariants?.canExecute!==false) return {ok:false,reasons:['CAN_EXECUTE_INVALID']};
    const {fingerprint,...core}=value;
    const expected=sha256(core);
    return fingerprint===expected
      ? {ok:true,reasons:[],expectedFingerprint:expected}
      : {ok:false,reasons:['FINGERPRINT_MISMATCH'],expectedFingerprint:expected};
  }catch(err){
    return {ok:false,reasons:['ADMISSION_INVALID',err instanceof Error?err.message:String(err)]};
  }
}
