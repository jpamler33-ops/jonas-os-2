import { sha256 } from './institutional-kernel.mjs';

export const SHADOW_COVERAGE_CURRICULUM_VERSION='TCX_SHADOW_COVERAGE_CURRICULUM_V2';

export const DEFAULT_COVERAGE_HORIZONS=Object.freeze([
  Object.freeze({id:'5m',horizonMs:5*60_000,label:'5 Min.'}),
  Object.freeze({id:'15m',horizonMs:15*60_000,label:'15 Min.'}),
  Object.freeze({id:'1h',horizonMs:60*60_000,label:'60 Min.'}),
  Object.freeze({id:'3h',horizonMs:3*60*60_000,label:'180 Min.'})
]);

function finite(v,fallback=null){
  if(v===null||v===undefined||v==='') return fallback;
  const n=Number(v);
  return Number.isFinite(n)?n:fallback;
}
function freeze(v){
  if(v&&typeof v==='object'&&!Object.isFrozen(v)){
    Object.freeze(v);
    for(const x of Object.values(v)) freeze(x);
  }
  return v;
}
function normalizeProbabilities(h){
  const p=h?.display?.probabilities||h?.probabilities||{};
  const up=Math.max(0,finite(p.up,0));
  const down=Math.max(0,finite(p.down,0));
  const flat=Math.max(0,finite(p.flat,0));
  const total=up+down+flat;
  if(total<=1e-12) return null;
  return {up:up/total,down:down/total,flat:flat/total};
}
function sideFor(h,p){
  const direction=String(h?.direction||'').toUpperCase();
  if(direction==='UP') return 'BUY';
  if(direction==='DOWN') return 'SELL';
  const expected=finite(h?.expectedReturn,0);
  if(Math.abs(expected)>1e-12) return expected>=0?'BUY':'SELL';
  return p.up>=p.down?'BUY':'SELL';
}
function horizonMap(issuance){
  const map=new Map();
  for(const h of Array.isArray(issuance?.forecast?.horizons)?issuance.forecast.horizons:[]){
    map.set(String(h?.horizonId||''),h);
  }
  return map;
}
function slotStart(now,horizonMs){
  return Math.floor(Number(now)/Number(horizonMs))*Number(horizonMs);
}

function bestEffectiveSampleDeficit(calibration){
  const topTarget=finite(calibration?.targetEffectiveSamples);
  if(topTarget==null||topTarget<=0) return null;
  let best=null;
  for(const klass of ['up','down','flat']){
    const row=calibration?.perClass?.[klass];
    if(!row||typeof row!=='object') continue;
    const effectiveSamples=finite(row.effectiveSamples);
    const targetEffectiveSamples=finite(row.targetEffectiveSamples,topTarget);
    const probability=finite(row.raw);
    const probabilityBinLo=finite(row.probabilityBinLo);
    const probabilityBinHi=finite(row.probabilityBinHi);
    const probabilityBinIndex=Number(row.probabilityBinIndex);
    if(
      effectiveSamples==null||
      targetEffectiveSamples==null||targetEffectiveSamples<=0||
      probability==null||
      probabilityBinLo==null||probabilityBinHi==null||
      !Number.isInteger(probabilityBinIndex)||probabilityBinIndex<0
    ) continue;
    const effectiveSampleDeficit=Math.max(0,targetEffectiveSamples-effectiveSamples);
    const effectiveSampleDeficitRatio=effectiveSampleDeficit/targetEffectiveSamples;
    const candidate={
      class:klass.toUpperCase(),
      probability,
      probabilityBinIndex,
      probabilityBinLo,
      probabilityBinHi,
      effectiveSamples,
      targetEffectiveSamples,
      effectiveSampleDeficit,
      effectiveSampleDeficitRatio
    };
    if(
      !best||
      candidate.effectiveSampleDeficitRatio>best.effectiveSampleDeficitRatio||
      (
        candidate.effectiveSampleDeficitRatio===best.effectiveSampleDeficitRatio&&
        candidate.effectiveSampleDeficit>best.effectiveSampleDeficit
      )||
      (
        candidate.effectiveSampleDeficitRatio===best.effectiveSampleDeficitRatio&&
        candidate.effectiveSampleDeficit===best.effectiveSampleDeficit&&
        candidate.effectiveSamples<best.effectiveSamples
      )
    ) best=candidate;
  }
  return best;
}

function coveragePriority(calibrationStatus,horizonGate,horizonMs,calibrationEvidence=null){
  const calibration=String(calibrationStatus||'UNKNOWN').toUpperCase();
  const gate=String(horizonGate||'UNKNOWN').toUpperCase();
  const target=bestEffectiveSampleDeficit(calibrationEvidence);
  let tier=0,reason='CALIBRATION_COVERAGE_SUFFICIENT';
  if(target&&target.effectiveSampleDeficit>0){
    tier=5;reason='EFFECTIVE_SAMPLE_DEFICIT';
  }else if(['INSUFFICIENT','UNCALIBRATED','UNKNOWN','COLD_START'].includes(calibration)){
    tier=4;reason='CALIBRATION_DEFICIT';
  }else if(calibration==='WATCH'){
    tier=3;reason='CALIBRATION_WATCH';
  }else if(calibration==='CALIBRATED'&&['ABSTAIN','INSUFFICIENT'].includes(gate)){
    tier=2;reason='NON_CALIBRATION_BLOCKER_RESEARCH';
  }
  const deficitScore=target
    ?Math.round(target.effectiveSampleDeficitRatio*1_000_000_000)+Math.round(target.effectiveSampleDeficit*1_000)
    :0;
  return {
    tier,
    score:tier*1_000_000_000_000+deficitScore+Math.max(0,Number(horizonMs)||0),
    reason,
    target
  };
}

export function deriveCoverageCurriculumCandidates(issuance,{
  now=Date.now(),
  notionalQuote=5,
  horizons=DEFAULT_COVERAGE_HORIZONS,
  existingCoverageKeys=[],
  assetClass='CORE'
}={}){
  const safety=String(issuance?.trace?.safety?.state||'UNKNOWN').toUpperCase();
  if(
    !issuance||
    issuance.executionMode!=='SHADOW_ONLY'||
    issuance.action!=='ABSTAIN'||
    issuance.canExecute!==false
  ){
    return freeze({
      version:SHADOW_COVERAGE_CURRICULUM_VERSION,
      candidates:[],reason:'ISSUANCE_SAFETY_INVARIANT_INVALID',
      execution:'SHADOW_ONLY',action:'ABSTAIN',canExecuteLive:false
    });
  }
  if(safety!=='NORMAL'){
    return freeze({
      version:SHADOW_COVERAGE_CURRICULUM_VERSION,
      candidates:[],reason:'DATA_SAFETY_NOT_NORMAL',
      execution:'SHADOW_ONLY',action:'ABSTAIN',canExecuteLive:false
    });
  }

  const generatedAt=finite(issuance.generatedAt);
  const t=finite(now);
  if(generatedAt==null||t==null||t<generatedAt||t-generatedAt>10*60_000){
    return freeze({
      version:SHADOW_COVERAGE_CURRICULUM_VERSION,
      candidates:[],reason:'FORECAST_STALE_OR_INVALID',
      execution:'SHADOW_ONLY',action:'ABSTAIN',canExecuteLive:false
    });
  }

  const forecastAsOf=finite(issuance?.forecast?.asOf,finite(issuance?.asOf,generatedAt));
  const referencePrice=finite(issuance?.forecast?.price,finite(issuance?.price));
  const existing=new Set((existingCoverageKeys||[]).map(String));
  const byHorizon=horizonMap(issuance);
  const candidates=[];
  let missingCalibrationMetadata=0;
  for(const policy of horizons){
    const h=byHorizon.get(policy.id);
    if(!h) continue;
    const calibrationStatus=String(h?.calibration?.status||'UNKNOWN').toUpperCase();
    const horizonGate=String(h?.gate||'UNKNOWN').toUpperCase();
    const p=normalizeProbabilities(h);
    const expectedReturn=finite(h?.expectedReturn);
    const flatThreshold=finite(h?.flatThreshold);
    if(!p||expectedReturn==null) continue;
    // A probe that cannot later be labelled is wasted research. Fail closed
    // before spending a coverage slot when PIT calibration metadata is absent.
    if(flatThreshold==null||forecastAsOf==null||referencePrice==null||referencePrice<=0){
      missingCalibrationMetadata++;
      continue;
    }

    const start=slotStart(t,policy.horizonMs);
    const keyCore={
      version:SHADOW_COVERAGE_CURRICULUM_VERSION,
      symbol:String(issuance.symbol||'').toUpperCase(),
      horizonId:policy.id,
      slotStart:start
    };
    const coverageKey='cc_'+sha256(keyCore).slice(0,24);
    if(existing.has(coverageKey)) continue;

    const priority=coveragePriority(calibrationStatus,horizonGate,policy.horizonMs,h?.calibration);
    if(priority.tier<=0) continue;

    const side=sideFor(h,p);
    const directionalProbability=side==='BUY'?p.up:p.down;
    const oppositeProbability=side==='BUY'?p.down:p.up;
    const core={
      coverageKey,
      symbol:String(issuance.symbol||'').toUpperCase(),
      horizonId:policy.id,
      horizonMs:Number(policy.horizonMs),
      slotStart:start,
      slotEnd:start+Number(policy.horizonMs),
      side,
      expectedReturn,
      directionalProbability,
      probabilityEdge:directionalProbability-oppositeProbability,
      probabilityVector:p,
      flatThreshold,
      admissionGate:String(issuance.admission?.gate||'ABSTAIN').toUpperCase(),
      horizonGate,
      calibrationStatus,
      regimeId:String(issuance?.trace?.researchState?.regime||issuance?.trace?.regimeId||issuance?.regimeId||'UNKNOWN'),
      coverageEvidenceTier:
        calibrationStatus==='CALIBRATED'&&['PASS','CAUTION'].includes(horizonGate)
          ?'CALIBRATED'
          :'BOOTSTRAP_RAW_FORECAST',
      coveragePriorityTier:priority.tier,
      coveragePriorityScore:priority.score,
      coveragePriorityReason:priority.reason,
      coverageTargetClass:priority.target?.class??null,
      coverageTargetProbability:priority.target?.probability??null,
      coverageTargetProbabilityBinIndex:priority.target?.probabilityBinIndex??null,
      coverageTargetProbabilityBinLo:priority.target?.probabilityBinLo??null,
      coverageTargetProbabilityBinHi:priority.target?.probabilityBinHi??null,
      coverageTargetEffectiveSamples:priority.target?.effectiveSamples??null,
      coverageTargetEffectiveSamplesGoal:priority.target?.targetEffectiveSamples??null,
      coverageTargetEffectiveSampleDeficit:priority.target?.effectiveSampleDeficit??null,
      coverageTargetEffectiveSampleDeficitRatio:priority.target?.effectiveSampleDeficitRatio??null,
      assetClass:String(assetClass||'CORE').toUpperCase(),
      dataSafety:safety,
      issuanceId:String(issuance.issuanceId||''),
      forecastFingerprint:String(issuance.forecastFingerprint||issuance.forecast?.fingerprint||''),
      referencePrice,
      forecastAsOf,
      generatedAt
    };
    candidates.push(freeze({
      ...core,
      decisionKey:sha256(core),
      notionalQuote:Math.max(1,Number(notionalQuote)||5),
      entryMode:'COVERAGE_PROBE',
      role:'COVERAGE_PROBE_ENTRY',
      horizonOnlyExit:true,
      purpose:'SYSTEMATIC_MARKET_STRUCTURE_AND_HORIZON_COVERAGE',
      execution:'SHADOW_ONLY',
      action:'ABSTAIN',
      canExecuteLive:false
    }));
  }

  candidates.sort((a,b)=>
    Number(b.coveragePriorityScore||0)-Number(a.coveragePriorityScore||0)||
    String(a.horizonId).localeCompare(String(b.horizonId))
  );

  return freeze({
    version:SHADOW_COVERAGE_CURRICULUM_VERSION,
    candidates,
    reason:candidates.length
      ?'COVERAGE_SLOTS_DUE'
      :(missingCalibrationMetadata?'FORECAST_CALIBRATION_METADATA_MISSING':'CALIBRATION_COVERAGE_SUFFICIENT'),
    missingCalibrationMetadata,
    execution:'SHADOW_ONLY',action:'ABSTAIN',canExecuteLive:false
  });
}

export function prioritizeCoverageCurriculumCandidates(candidates,{limit=1}={}){
  const max=Math.max(1,Math.floor(Number(limit)||1));
  const seen=new Set();
  const rows=[];
  for(const candidate of Array.isArray(candidates)?candidates:[]){
    if(
      !candidate||
      candidate.entryMode!=='COVERAGE_PROBE'||
      candidate.execution!=='SHADOW_ONLY'||
      candidate.canExecuteLive!==false
    ) continue;
    const key=String(candidate.coverageKey||'');
    if(!key||seen.has(key)) continue;
    seen.add(key);
    rows.push(candidate);
  }
  rows.sort((a,b)=>
    Number(b.coveragePriorityScore||0)-Number(a.coveragePriorityScore||0)||
    Number(b.coverageTargetEffectiveSampleDeficitRatio||0)-Number(a.coverageTargetEffectiveSampleDeficitRatio||0)||
    Number(b.coverageTargetEffectiveSampleDeficit||0)-Number(a.coverageTargetEffectiveSampleDeficit||0)||
    String(a.symbol||'').localeCompare(String(b.symbol||''))||
    String(a.horizonId||'').localeCompare(String(b.horizonId||''))
  );
  return freeze({
    version:SHADOW_COVERAGE_CURRICULUM_VERSION,
    candidates:rows.slice(0,max),
    eligible:rows.length,
    limit:max,
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecuteLive:false,
    meaning:'GLOBAL_COIN_HORIZON_PROBABILITY_BIN_CLASS_ESS_PRIORITY'
  });
}

export function coverageCurriculumSummary(ledger,{symbols=[],horizons=DEFAULT_COVERAGE_HORIZONS}={}){
  const rows=(ledger?.positions||[]).filter(p=>
    String(p?.entryMode||'').toUpperCase()==='COVERAGE_PROBE'&&
    p?.execution==='SHADOW_ONLY'&&p?.canExecuteLive===false
  );
  const byHorizon={};
  for(const h of horizons){
    const xs=rows.filter(p=>String(p.horizonId)===h.id);
    byHorizon[h.id]={
      total:xs.length,
      open:xs.filter(p=>p.status==='OPEN').length,
      closed:xs.filter(p=>p.status==='CLOSED').length,
      symbols:new Set(xs.map(p=>p.symbol)).size
    };
  }
  const bySymbol={};
  for(const symbol of symbols){
    const xs=rows.filter(p=>p.symbol===symbol);
    bySymbol[symbol]={
      total:xs.length,
      open:xs.filter(p=>p.status==='OPEN').length,
      closed:xs.filter(p=>p.status==='CLOSED').length,
      horizons:new Set(xs.map(p=>p.horizonId)).size
    };
  }
  const core={
    version:SHADOW_COVERAGE_CURRICULUM_VERSION,
    total:rows.length,
    open:rows.filter(p=>p.status==='OPEN').length,
    closed:rows.filter(p=>p.status==='CLOSED').length,
    coveredSymbols:new Set(rows.map(p=>p.symbol)).size,
    targetSymbols:symbols.length,
    byHorizon,
    bySymbol,
    active:rows.filter(p=>p.status==='OPEN').slice(-12).map(p=>({
      positionId:p.positionId,
      symbol:p.symbol,
      side:p.side,
      horizonId:p.horizonId,
      openedAt:p.openedAt,
      plannedExitAt:p.plannedExitAt,
      coverageKey:p.coverageKey,
      unrealizedNetPnlQuote:finite(p.lastMark?.unrealizedNetPnlQuote)
    })),
    execution:'SHADOW_ONLY',action:'ABSTAIN',canExecuteLive:false,
    meaning:'SYSTEMATIC_SHADOW_COVERAGE_EXCLUDED_FROM_PRIMARY_PERFORMANCE'
  };
  return freeze({...core,fingerprint:sha256(core)});
}
