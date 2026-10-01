import { sha256 } from './institutional-kernel.mjs';

export const FORECAST_CONTRACT_VERSION='TCX_FORECAST_CONTRACT_V1';

const GATES=Object.freeze(['PASS','CAUTION','INSUFFICIENT','ABSTAIN']);
const GATE_RANK=Object.freeze({PASS:0,CAUTION:1,INSUFFICIENT:2,ABSTAIN:3});
const SYMBOL_RE=/^[A-Z0-9]{2,18}USDT$/;

function finite(v,name){
  const n=Number(v);
  if(!Number.isFinite(n)) throw new Error(name+' must be finite');
  return n;
}
function finiteOrNull(v){
  const n=Number(v);
  return Number.isFinite(n)?n:null;
}
function gate(v){
  const g=String(v??'INSUFFICIENT').toUpperCase();
  if(!GATES.includes(g)) throw new Error('unsupported forecast gate: '+g);
  return g;
}
function strictest(xs){
  let result='PASS';
  for(const x of xs){
    const g=gate(x);
    if(GATE_RANK[g]>GATE_RANK[result]) result=g;
  }
  return result;
}
function probabilityVector(p,name){
  const out={
    up:finite(p?.up,name+'.up'),
    down:finite(p?.down,name+'.down'),
    flat:finite(p?.flat,name+'.flat')
  };
  for(const [k,v] of Object.entries(out)){
    if(v<0||v>1) throw new Error(name+'.'+k+' outside [0,1]');
  }
  const sum=out.up+out.down+out.flat;
  if(Math.abs(sum-1)>1e-6) throw new Error(name+' must sum to 1');
  return out;
}
function interval(x,name){
  const out={
    q10:finite(x?.q10,name+'.q10'),
    q25:finite(x?.q25,name+'.q25'),
    median:finite(x?.median,name+'.median'),
    q75:finite(x?.q75,name+'.q75'),
    q90:finite(x?.q90,name+'.q90')
  };
  if(!(out.q10<=out.q25&&out.q25<=out.median&&out.median<=out.q75&&out.q75<=out.q90)){
    throw new Error(name+' quantiles are not monotonic');
  }
  return out;
}
function safeArray(v){return Array.isArray(v)?structuredClone(v):[];}
function calibrationClassAudit(x){
  if(!x||typeof x!=='object') return null;
  const idx=Number(x.probabilityBinIndex);
  return {
    raw:finiteOrNull(x.raw),
    calibrated:finiteOrNull(x.calibrated),
    empirical:finiteOrNull(x.empirical),
    meanPredicted:finiteOrNull(x.meanPredicted),
    calibrationGap:finiteOrNull(x.calibrationGap),
    sampleCount:Number(x.sampleCount??0),
    effectiveSamples:finiteOrNull(x.effectiveSamples),
    probabilityBinIndex:Number.isInteger(idx)&&idx>=0?idx:null,
    probabilityBinLo:finiteOrNull(x.probabilityBinLo),
    probabilityBinHi:finiteOrNull(x.probabilityBinHi),
    targetEffectiveSamples:finiteOrNull(x.targetEffectiveSamples),
    effectiveSampleDeficit:finiteOrNull(x.effectiveSampleDeficit)
  };
}

function normalizeHorizon(h,asOf,scienceGate){
  const horizonGate=gate(h?.gate);
  const auditAsOf=finite(h?.audit?.asOf,'horizon.audit.asOf');
  if(auditAsOf!==asOf) throw new Error('forecast horizon audit asOf mismatch');

  const probs=probabilityVector(h?.probabilities,'horizon.probabilities');
  const intv=interval(h?.interval,'horizon.interval');
  const calibrationStatus=String(h?.calibration?.status??'INSUFFICIENT').toUpperCase();
  const displayAllowed=
    calibrationStatus==='CALIBRATED'&&
    !['INSUFFICIENT','ABSTAIN'].includes(horizonGate)&&
    !['INSUFFICIENT','ABSTAIN'].includes(scienceGate);

  let probabilityEpistemic='MODEL_PROBABILITY_UNCALIBRATED';
  if(calibrationStatus==='CALIBRATED') probabilityEpistemic='CALIBRATED_PROBABILITY';
  else if(calibrationStatus==='WATCH') probabilityEpistemic='MODEL_PROBABILITY_CALIBRATION_WATCH';

  const blockedFutureCases=Number(h?.audit?.blockedFutureCases??0);
  const invalidCases=Number(h?.audit?.invalidCases??0);
  if(!Number.isInteger(blockedFutureCases)||blockedFutureCases<0) throw new Error('invalid blockedFutureCases');
  if(!Number.isInteger(invalidCases)||invalidCases<0) throw new Error('invalid invalidCases');

  return {
    horizonId:String(h?.horizonId??''),
    horizonMs:finite(h?.horizonMs,'horizon.horizonMs'),
    gate:horizonGate,
    direction:String(h?.direction??'UNKNOWN'),
    expectedReturn:finite(h?.expectedReturn,'horizon.expectedReturn'),
    // Preserve the model's PIT direction threshold. Coverage probes need the
    // exact threshold later to turn a matured outcome into a calibration label.
    flatThreshold:finiteOrNull(h?.flatThreshold),
    probabilities:probs,
    interval:intv,
    scenarios:safeArray(h?.scenarios),
    calibration:{
      status:calibrationStatus,
      method:String(h?.calibration?.method??'UNKNOWN'),
      sampleCount:Number(h?.calibration?.sampleCount??0),
      effectiveSamples:finiteOrNull(h?.calibration?.effectiveSamples),
      multiclassBrier:finiteOrNull(h?.calibration?.multiclassBrier),
      logLoss:finiteOrNull(h?.calibration?.logLoss),
      maxClassGap:finiteOrNull(h?.calibration?.maxClassGap),
      targetEffectiveSamples:finiteOrNull(h?.calibration?.targetEffectiveSamples),
      bins:Number.isInteger(Number(h?.calibration?.bins))?Number(h.calibration.bins):null,
      perClass:{
        up:calibrationClassAudit(h?.calibration?.perClass?.up),
        down:calibrationClassAudit(h?.calibration?.perClass?.down),
        flat:calibrationClassAudit(h?.calibration?.perClass?.flat)
      }
    },
    reliability:{
      status:String(h?.localReliability?.status??'UNKNOWN'),
      effectiveSamples:finiteOrNull(h?.localReliability?.effectiveSamples),
      localBrier:finiteOrNull(h?.localReliability?.brierScore)
    },
    drift:{
      status:String(h?.drift?.status??'UNKNOWN'),
      score:finiteOrNull(h?.drift?.score)
    },
    support:{
      analogCount:Number(h?.analogs?.count??0),
      effectiveSamples:finiteOrNull(h?.analogs?.effectiveSamples),
      independentEpisodes:Number(h?.analogs?.independentEpisodes??0),
      episodeEffectiveSamples:finiteOrNull(h?.analogs?.episodeEffectiveSamples),
      nearestSimilarity:finiteOrNull(h?.analogs?.maxSimilarity),
      oodScore:finiteOrNull(h?.analogs?.oodScore)
    },
    diagnostics:{
      modelDispersion:finiteOrNull(h?.modelDispersion),
      probabilityDisagreement:finiteOrNull(h?.probabilityDisagreement),
      directionalEntropy:finiteOrNull(h?.directionalEntropy),
      operationalConfidence:finiteOrNull(h?.operationalConfidence)
    },
    reasons:safeArray(h?.reasons),
    warnings:safeArray(h?.warnings),
    audit:{
      asOf:auditAsOf,
      usableTrainingCases:Number(h?.audit?.usableTrainingCases??0),
      blockedFutureCases,
      invalidCases,
      featureCoverage:finiteOrNull(h?.audit?.featureCoverage),
      executionMode:String(h?.audit?.executionMode??'UNKNOWN')
    },
    display:{
      probabilityDisplayAllowed:displayAllowed,
      probabilityEpistemic,
      probabilities:displayAllowed?probs:null,
      suppressionReasons:[
        ...(calibrationStatus!=='CALIBRATED'?['CALIBRATION_'+calibrationStatus]:[]),
        ...(['INSUFFICIENT','ABSTAIN'].includes(horizonGate)?['FORECAST_GATE_'+horizonGate]:[]),
        ...(['INSUFFICIENT','ABSTAIN'].includes(scienceGate)?['SCIENCE_GATE_'+scienceGate]:[])
      ]
    }
  };
}

export function createCanonicalForecast({
  forecastId,
  input,
  report,
  scientificValidity=null,
  generatedAt=Date.now()
}={}){
  const symbol=String(input?.symbol??'').toUpperCase();
  if(!SYMBOL_RE.test(symbol)) throw new Error('invalid forecast symbol');

  const asOf=finite(input?.asOf,'input.asOf');
  const price=finite(input?.price,'input.price');
  if(price<=0) throw new Error('input.price must be positive');

  if(report?.executionMode!=='SHADOW_ONLY'||report?.forecast?.executionMode!=='SHADOW_ONLY'){
    throw new Error('forecast report must remain SHADOW_ONLY');
  }
  if(report?.forecast?.symbol!==symbol) throw new Error('forecast symbol mismatch');
  if(Number(report?.forecast?.asOf)!==asOf) throw new Error('forecast asOf mismatch');

  const scienceGate=scientificValidity?gate(scientificValidity.gate):'INSUFFICIENT';
  if(scientificValidity&&scientificValidity.executionMode!=='SHADOW_ONLY'){
    throw new Error('scientific validity must remain SHADOW_ONLY');
  }

  const rawHorizons=report?.forecast?.forecasts;
  if(!Array.isArray(rawHorizons)||!rawHorizons.length) throw new Error('forecast horizons required');
  const horizons=rawHorizons.map(h=>normalizeHorizon(h,asOf,scienceGate));
  const overallGate=strictest([...horizons.map(h=>h.gate),scienceGate]);

  const core={
    schemaVersion:FORECAST_CONTRACT_VERSION,
    forecastId:String(forecastId??(symbol+':'+asOf)),
    symbol,
    generatedAt:finite(generatedAt,'generatedAt'),
    asOf,
    price,
    overallGate,
    scienceGate,
    horizons,
    path:structuredClone(report?.forecast?.path??null),
    regimeTransition:structuredClone(report?.regimeTransition??null),
    inputQuality:{
      dataQuality:finiteOrNull(input?.dataQuality),
      regimeConfidence:finiteOrNull(input?.regimeConfidence),
      featureCount:Object.keys(input?.features??{}).length
    },
    epistemic:{
      probabilities:'PER_HORIZON_SEE_DISPLAY_EPISTEMIC',
      operationalConfidence:'DIAGNOSTIC_NOT_PROBABILITY',
      scenarios:'MODEL_CONDITIONAL_SCENARIOS_NOT_GUARANTEED_PATH',
      causality:'NOT_IDENTIFIED'
    },
    executionMode:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecute:false
  };

  return Object.freeze({...core,fingerprint:sha256(core)});
}

export function verifyCanonicalForecast(value){
  try{
    if(value?.schemaVersion!==FORECAST_CONTRACT_VERSION) return {ok:false,reasons:['VERSION_INVALID']};
    if(value?.executionMode!=='SHADOW_ONLY') return {ok:false,reasons:['EXECUTION_MODE_INVALID']};
    if(value?.action!=='ABSTAIN') return {ok:false,reasons:['ACTION_INVALID']};
    if(value?.canExecute!==false) return {ok:false,reasons:['CAN_EXECUTE_INVALID']};
    const {fingerprint,...core}=value;
    const expected=sha256(core);
    return fingerprint===expected
      ? {ok:true,reasons:[],expectedFingerprint:expected}
      : {ok:false,reasons:['FINGERPRINT_MISMATCH'],expectedFingerprint:expected};
  }catch(err){
    return {ok:false,reasons:['FORECAST_CONTRACT_INVALID',err instanceof Error?err.message:String(err)]};
  }
}
