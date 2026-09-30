import { sha256, findAuditRecordIdentity } from './institutional-kernel.mjs';

export const BIGGJ_SIGNAL_LAB_VERSION='TCX_BIGGJ_SIGNAL_LAB_V3';
export const BIGGJ_PROOF_FEED_VERSION='TCX_BIGGJ_PROOF_FEED_V3';
export const BIGGJ_SIGNAL_LAB_MODES=Object.freeze(['FULL','STRUCTURE','FLOW','LIQUIDITY','MACRO']);

const arr=v=>Array.isArray(v)?v:[];
const finite=(v,f=null)=>Number.isFinite(Number(v))?Number(v):f;
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,finite(v,0)));
const freeze=v=>{
  if(v&&typeof v==='object'&&!Object.isFrozen(v)){
    Object.freeze(v);
    for(const x of Object.values(v))freeze(x);
  }
  return v;
};
const pct=(v,d=1)=>{
  const n=finite(v);
  return n==null?'—':(n*100).toFixed(d)+'%';
};
const signedPct=(v,d=2)=>{
  const n=finite(v);
  if(n==null)return '—';
  return (n>=0?'+':'')+(n*100).toFixed(d)+'%';
};
const price=v=>{
  const n=finite(v);
  if(n==null)return '—';
  return n.toLocaleString('de-DE',{maximumFractionDigits:Math.abs(n)<1?6:2});
};
const iso=v=>{
  const n=finite(v);
  if(n==null)return '—';
  try{return new Date(n).toISOString();}catch{return '—';}
};
const directionLabel=v=>{
  const x=String(v||'UNKNOWN').toUpperCase();
  if(x==='UP')return '↗ UP';
  if(x==='DOWN')return '↘ DOWN';
  if(x==='FLAT'||x==='SIDEWAYS'||x==='NEUTRAL')return '→ SIDEWAYS';
  return '—';
};

const MODE_KEYWORDS=Object.freeze({
  STRUCTURE:['structure','trend','break','breakout','support','resistance','swing','hh','hl','lh','ll','regime','mtf','candle'],
  FLOW:['flow','cvd','funding','open interest','open_interest','oi','volume','spot','futures','orderbook','order book','bid','ask','whale'],
  LIQUIDITY:['liquidation','liquidity','heatmap','cluster','stop','sweep','imbalance','depth','book'],
  MACRO:['macro','fed','fomc','rate','rates','cpi','ppi','jobs','payroll','treasury','yield','dxy','dollar','ecb','inflation','gdp','etf']
});
function normalizeMode(value){
  const x=String(value||'FULL').toUpperCase();
  return BIGGJ_SIGNAL_LAB_MODES.includes(x)?x:'FULL';
}
function compactText(value,max=180){
  const x=String(value==null?'':value).replace(/\s+/g,' ').trim();
  return x.length<=max?x:x.slice(0,max-1)+'…';
}
function flattenEvidenceText(value,{prefix='',depth=0,maxDepth=2}={}){
  if(value==null||depth>maxDepth)return [];
  if(['string','number','boolean'].includes(typeof value)){
    const text=compactText((prefix?prefix+' ':'')+String(value));
    return text?[text]:[];
  }
  if(Array.isArray(value))return value.slice(0,10).flatMap((x,i)=>flattenEvidenceText(x,{prefix:prefix?prefix+'.'+i:String(i),depth:depth+1,maxDepth}));
  if(typeof value==='object'){
    return Object.entries(value).slice(0,20).flatMap(([k,v])=>
      flattenEvidenceText(v,{prefix:prefix?prefix+'.'+k:k,depth:depth+1,maxDepth})
    );
  }
  return [];
}
function buildModeLens({mode,issuance,horizon,setup,risk}={}){
  const selected=normalizeMode(mode);
  const rows=[];
  for(const x of arr(horizon?.reasons))rows.push({source:'FORECAST_REASON',text:compactText(x)});
  for(const x of arr(horizon?.warnings))rows.push({source:'FORECAST_WARNING',text:compactText(x)});
  for(const x of arr(setup?.eventRows)){
    rows.push({
      source:'STRUCTURE_EVENT',
      text:compactText([x?.type,x?.label,x?.state,x?.detail].filter(Boolean).join(' · '))
    });
  }
  for(const x of arr(risk?.reasons))rows.push({source:'RISK_REASON',text:compactText(x)});
  for(const x of arr(issuance?.trace?.evidence)){
    for(const text of flattenEvidenceText(x,{prefix:'trace'}))rows.push({source:'TRACE_EVIDENCE',text});
  }
  for(const x of arr(issuance?.trace?.contradictions)){
    for(const text of flattenEvidenceText(x,{prefix:'contradiction'}))rows.push({source:'TRACE_CONTRADICTION',text});
  }
  const seen=new Set();
  const unique=rows.filter(row=>{
    if(!row.text)return false;
    const key=row.source+'|'+row.text.toLowerCase();
    if(seen.has(key))return false;
    seen.add(key);
    return true;
  });
  const keywords=MODE_KEYWORDS[selected]||[];
  const filtered=selected==='FULL'
    ?unique
    :unique.filter(row=>{
      if(selected==='STRUCTURE'&&row.source==='STRUCTURE_EVENT')return true;
      const text=row.text.toLowerCase();
      return keywords.some(k=>text.includes(k));
    });
  return freeze({
    mode:selected,
    available:filtered.length>0,
    items:filtered.slice(0,8),
    sourceCount:new Set(filtered.map(x=>x.source)).size,
    semantics:'Evidence lens only. It does not recompute, override or strengthen the canonical forecast.'
  });
}

function horizonFor(issuance,horizonId){
  const hs=arr(issuance?.forecast?.horizons);
  if(!hs.length)return null;
  const wanted=String(horizonId||'').toLowerCase();
  if(!wanted)return hs[0];
  return hs.find(x=>String(x?.horizonId||'').toLowerCase()===wanted)||null;
}

function topProbability(horizon){
  const p=horizon?.probabilities||{};
  const values=[
    ['UP',finite(p.up)],
    ['DOWN',finite(p.down)],
    ['FLAT',finite(p.flat)]
  ].filter(([,v])=>v!=null);
  if(!values.length)return null;
  values.sort((a,b)=>b[1]-a[1]);
  return {direction:values[0][0],probability:clamp(values[0][1])};
}

function probabilityAllowed(issuance,horizon,accuracy){
  return Boolean(
    issuance?.probabilityDisplayAllowed===true&&
    horizon?.calibration?.status==='CALIBRATED'&&
    accuracy?.gate?.status==='CALIBRATED'&&
    accuracy?.gate?.passed===true
  );
}

function signalState({issuance,horizon,setup,risk}){
  if(!issuance||!horizon)return 'ABSTAIN';
  if(String(issuance?.executionMode||'SHADOW_ONLY')!=='SHADOW_ONLY')return 'ABSTAIN';
  if(issuance?.canExecute!==false)return 'ABSTAIN';
  const gate=String(horizon?.gate||issuance?.gate||'ABSTAIN').toUpperCase();
  if(!['PASS','CAUTION'].includes(gate))return 'ABSTAIN';
  if(String(setup?.status||'ABSTAIN').toUpperCase()==='ABSTAIN')return 'ABSTAIN';
  if(String(risk?.status||'HIGH').toUpperCase()==='HIGH')return 'ABSTAIN';
  if(gate==='PASS'&&String(setup?.status).toUpperCase()==='READY'&&String(risk?.status).toUpperCase()==='NORMAL')return 'WATCH_STRONG';
  return 'WATCH';
}

export function buildBiggjSignalLab({
  symbol,
  issuance=null,
  setup=null,
  risk=null,
  accuracy=null,
  horizonId='1h',
  mode='FULL',
  asOf=Date.now()
}={}){
  const s=String(symbol||issuance?.symbol||'UNKNOWN').toUpperCase();
  const horizon=horizonFor(issuance,horizonId);
  const top=topProbability(horizon);
  const allowProbability=probabilityAllowed(issuance,horizon,accuracy);
  const state=signalState({issuance,horizon,setup,risk});
  const selectedMode=normalizeMode(mode);
  const modeLens=buildModeLens({mode:selectedMode,issuance,horizon,setup,risk});
  const supports=[
    ...arr(horizon?.reasons),
    ...arr(setup?.eventRows).map(x=>String(x?.type||x?.label||'STRUCTURE_EVENT'))
  ].map(String).filter(Boolean).slice(0,5);
  const counters=[
    ...arr(horizon?.warnings),
    ...arr(risk?.reasons)
  ].map(String).filter(Boolean).slice(0,5);
  const core={
    version:BIGGJ_SIGNAL_LAB_VERSION,
    generatedAt:finite(asOf,Date.now()),
    symbol:s,
    mode:selectedMode,
    requestedHorizon:String(horizonId||'1h').toLowerCase(),
    selectedHorizon:horizon?String(horizon.horizonId||horizonId):null,
    state,
    bias:horizon?String(horizon.direction||setup?.direction||'UNKNOWN').toUpperCase():String(setup?.direction||'UNKNOWN').toUpperCase(),
    forecastGate:String(horizon?.gate||issuance?.gate||'ABSTAIN').toUpperCase(),
    probability:{
      displayAllowed:allowProbability,
      calibrated:allowProbability&&top?top.probability:null,
      topDirection:allowProbability&&top?top.direction:null,
      suppressionReason:allowProbability?null:(
        !issuance?'NO_FORECAST':
        issuance?.probabilityDisplayAllowed!==true?'ISSUANCE_GATE_SUPPRESSED':
        horizon?.calibration?.status!=='CALIBRATED'?'HORIZON_NOT_CALIBRATED':
        accuracy?.gate?.status!=='CALIBRATED'?'FLEET_CALIBRATION_GATE_SUPPRESSED':
        'NOT_DISPLAYABLE'
      )
    },
    forecast:{
      expectedReturn:finite(horizon?.expectedReturn),
      intervalQ10:finite(horizon?.interval?.q10),
      intervalQ90:finite(horizon?.interval?.q90),
      asOf:finite(issuance?.asOf),
      generatedAt:finite(issuance?.generatedAt),
      issuanceId:issuance?.issuanceId??null,
      traceId:issuance?.traceId??null
    },
    diagnostics:{
      evidenceScore:setup?.evidence==null?null:clamp(setup.evidence),
      setupStatus:String(setup?.status||'UNKNOWN'),
      riskStatus:String(risk?.status||'UNKNOWN'),
      accuracyReady:accuracy?.ready===true,
      resolvedAccuracyCases:finite(accuracy?.evaluation?.resolvedCount,0)
    },
    modeLens,
    supportReasons:supports,
    counterReasons:counters,
    semantics:{
      watchIsNotOrderAuthorization:true,
      probabilityOnlyWhenCalibrationGatePasses:true,
      diagnosticEvidenceScoreIsNotProbability:true,
      modeLensDoesNotRecomputeForecast:true,
      noProfitGuarantee:true
    },
    safety:{
      execution:'SHADOW_ONLY',
      action:'ABSTAIN',
      canExecute:false,
      canExecuteLive:false
    }
  };
  return freeze({...core,fingerprint:sha256(core)});
}

export function verifyBiggjSignalLab(value){
  const reasons=[];
  if(value?.version!==BIGGJ_SIGNAL_LAB_VERSION)reasons.push('VERSION_INVALID');
  if(value?.safety?.execution!=='SHADOW_ONLY'||value?.safety?.action!=='ABSTAIN'||value?.safety?.canExecute!==false||value?.safety?.canExecuteLive!==false)reasons.push('SAFETY_INVALID');
  if(value?.probability?.displayAllowed!==true&&value?.probability?.calibrated!=null)reasons.push('SUPPRESSED_PROBABILITY_LEAK');
  if(!BIGGJ_SIGNAL_LAB_MODES.includes(String(value?.mode||'')))reasons.push('MODE_INVALID');
  if(value?.modeLens?.mode!==value?.mode)reasons.push('MODE_LENS_MISMATCH');
  const {fingerprint,...core}=value||{};
  if(fingerprint!==sha256(core))reasons.push('FINGERPRINT_MISMATCH');
  return {ok:reasons.length===0,reasons};
}

export function renderBiggjSignalLab(value={}){
  const p=value?.probability||{};
  const f=value?.forecast||{};
  const d=value?.diagnostics||{};
  const lines=[
    'BIGGJ // SIGNAL LAB · '+String(value?.symbol||'').replace('USDT','/USDT'),
    '━━━━━━━━━━━━━━━━━━━━',
    String(value?.selectedHorizon||value?.requestedHorizon||'—').toUpperCase()+' · '+String(value?.mode||'FULL'),
    '',
    'DECISION STATE',
    'Status       '+String(value?.state||'ABSTAIN').replaceAll('_',' '),
    'Bias         '+directionLabel(value?.bias),
    'Forecast     '+String(value?.forecastGate||'ABSTAIN'),
    'Risk         '+String(d.riskStatus||'UNKNOWN'),
    'Evidence     '+(d.evidenceScore==null?'—':Math.round(d.evidenceScore*100)+'/100')+'  (diagnostic)'
  ];
  if(p.displayAllowed===true&&p.calibrated!=null){
    lines.push('Confidence   '+pct(p.calibrated,1)+' calibrated');
  }else{
    lines.push('Confidence   SUPPRESSED · '+String(p.suppressionReason||'CALIBRATION_NOT_READY').replaceAll('_',' '));
  }
  lines.push(
    '',
    'FORECAST',
    'Expected     '+signedPct(f.expectedReturn),
    'Range        '+signedPct(f.intervalQ10)+' → '+signedPct(f.intervalQ90),
    'As-of        '+iso(f.asOf)
  );
  lines.push('','MODE LENS · '+String(value?.mode||'FULL'));
  if(value?.modeLens?.available){
    for(const item of arr(value?.modeLens?.items).slice(0,6))lines.push('• '+String(item?.source||'EVIDENCE')+' · '+compactText(item?.text,170));
  }else{
    lines.push('• Keine mode-spezifische Evidenz im aktuellen strukturierten State. Canonical Forecast bleibt unverändert.');
  }
  lines.push('Lens only · kein zweiter Forecast-Engine-Pfad.');
  lines.push('','WARUM');
  if(arr(value?.supportReasons).length)for(const x of arr(value.supportReasons))lines.push('• '+x);
  else lines.push('• Keine zusätzliche Support-Begründung freigegeben.');
  lines.push('','DAGEGEN');
  if(arr(value?.counterReasons).length)for(const x of arr(value.counterReasons))lines.push('• '+x);
  else lines.push('• Keine zusätzliche Gegen-Evidenz im kompakten View.');
  lines.push(
    '',
    'WATCH = beobachten, nicht ausführen.',
    'ABSTAIN = Evidenz, Kalibrierung oder Risiko reicht nicht.',
    'SHADOW_ONLY · ACTION ABSTAIN · REAL ORDERS BLOCKED'
  );
  return lines.join('\n').slice(0,4096);
}

function proofCommitment(row){
  return sha256({
    id:row?.id,
    symbol:row?.symbol,
    horizonId:row?.horizonId,
    horizonMs:row?.horizonMs,
    asOf:row?.asOf,
    dueAt:row?.dueAt,
    startPrice:row?.startPrice,
    regimeId:row?.regimeId,
    gate:row?.gate,
    direction:row?.direction,
    probabilities:row?.probabilities,
    expectedReturn:row?.expectedReturn,
    interval:row?.interval,
    operationalConfidence:row?.operationalConfidence
  });
}


function issuanceIdentityCore(issuance={}){
  return {
    version:issuance?.version,
    symbol:issuance?.symbol,
    asOf:issuance?.asOf,
    generatedAt:issuance?.generatedAt,
    forecastFingerprint:issuance?.forecastFingerprint,
    scienceFingerprint:issuance?.scienceFingerprint,
    admissionFingerprint:issuance?.admissionFingerprint,
    traceId:issuance?.traceId,
    gate:issuance?.gate,
    researchDisposition:issuance?.researchDisposition,
    probabilityDisplayAllowed:issuance?.probabilityDisplayAllowed,
    executionMode:issuance?.executionMode,
    action:issuance?.action,
    canExecute:issuance?.canExecute
  };
}

function journalForecastSubset(row={}){
  return {
    symbol:String(row?.symbol||'UNKNOWN').toUpperCase(),
    horizonId:String(row?.horizonId||'UNKNOWN'),
    horizonMs:finite(row?.horizonMs),
    asOf:finite(row?.asOf),
    dueAt:finite(row?.dueAt),
    startPrice:finite(row?.startPrice),
    gate:String(row?.gate||'UNKNOWN').toUpperCase(),
    direction:String(row?.direction||'UNKNOWN').toUpperCase(),
    probabilities:row?.probabilities??null,
    expectedReturn:finite(row?.expectedReturn),
    interval:{q10:finite(row?.interval?.q10),q90:finite(row?.interval?.q90)},
    operationalConfidence:finite(row?.operationalConfidence)
  };
}

function issuanceForecastSubset(issuance,horizon){
  return {
    symbol:String(issuance?.symbol||issuance?.forecast?.symbol||'UNKNOWN').toUpperCase(),
    horizonId:String(horizon?.horizonId||'UNKNOWN'),
    horizonMs:finite(horizon?.horizonMs),
    asOf:finite(issuance?.asOf??issuance?.forecast?.asOf),
    dueAt:finite(issuance?.asOf??issuance?.forecast?.asOf)+finite(horizon?.horizonMs,0),
    startPrice:finite(issuance?.forecast?.price),
    gate:String(horizon?.gate||'UNKNOWN').toUpperCase(),
    direction:String(horizon?.direction||'UNKNOWN').toUpperCase(),
    probabilities:horizon?.probabilities??null,
    expectedReturn:finite(horizon?.expectedReturn),
    interval:{q10:finite(horizon?.interval?.q10),q90:finite(horizon?.interval?.q90)},
    operationalConfidence:finite(horizon?.diagnostics?.operationalConfidence)
  };
}

function verifiedIssuanceBinding(row,issuances=[]){
  const symbol=String(row?.symbol||'').toUpperCase();
  const asOf=finite(row?.asOf);
  const horizonId=String(row?.horizonId||'').toLowerCase();
  if(!symbol||asOf==null||!horizonId)return null;
  const candidates=arr(issuances).filter(x=>
    String(x?.symbol||'').toUpperCase()===symbol&&finite(x?.asOf)===asOf
  );
  for(const issuance of candidates){
    if(!issuance?.issuanceId||issuance.issuanceId!==sha256(issuanceIdentityCore(issuance)))continue;
    const forecast=issuance?.forecast;
    if(!forecast?.fingerprint)continue;
    const {fingerprint,...forecastCore}=forecast;
    if(fingerprint!==sha256(forecastCore)||issuance.forecastFingerprint!==fingerprint)continue;
    const horizon=arr(forecast?.horizons).find(x=>String(x?.horizonId||'').toLowerCase()===horizonId);
    if(!horizon)continue;
    const expected=issuanceForecastSubset(issuance,horizon);
    const observed=journalForecastSubset(row);
    const journalMatches=sha256(expected)===sha256(observed);
    const commitmentCore={
      kind:'TCX_BIGGJ_AUDIT_BOUND_FORECAST_HORIZON_V1',
      issuanceId:issuance.issuanceId,
      forecastFingerprint:issuance.forecastFingerprint,
      traceId:issuance.traceId,
      symbol:issuance.symbol,
      asOf:issuance.asOf,
      generatedAt:issuance.generatedAt,
      horizon
    };
    return {
      issuance,
      horizon,
      beforeHash:sha256(commitmentCore),
      journalMatches,
      commitmentCore
    };
  }
  return null;
}

function issuanceAuditBinding(auditLedger,issuance,{cutoff,dueAt}={}){
  if(!auditLedger||!issuance?.issuanceId)return {
    auditBacked:false,status:'MISSING',seq:null,recordHash:null,occurredAt:null,preOutcome:false,indexedIdentity:false
  };
  const record=findAuditRecordIdentity(auditLedger,{
    kind:'TCX_INSTITUTIONAL_FORECAST_ISSUED',
    idField:'issuanceId',
    id:issuance.issuanceId
  });
  if(!record)return {
    auditBacked:false,status:'MISSING',seq:null,recordHash:null,occurredAt:null,preOutcome:false,indexedIdentity:false
  };
  const occurredAt=finite(record?.occurredAt);
  if(occurredAt==null||occurredAt>finite(cutoff,Date.now()))return {
    auditBacked:false,status:'FUTURE_OR_INVALID',seq:finite(record?.seq),recordHash:record?.recordHash??null,occurredAt,preOutcome:false,indexedIdentity:record?.indexedIdentity===true
  };
  const p=record?.payload||{};
  const payloadMismatch=Boolean(
    (p?.issuanceId!=null&&String(p.issuanceId)!==String(issuance.issuanceId))||
    (p?.forecastFingerprint!=null&&String(p.forecastFingerprint)!==String(issuance.forecastFingerprint))||
    (p?.symbol!=null&&String(p.symbol).toUpperCase()!==String(issuance.symbol).toUpperCase())||
    (p?.asOf!=null&&finite(p.asOf)!==finite(issuance.asOf))
  );
  const preOutcome=finite(dueAt)!=null&&occurredAt<=finite(dueAt);
  const recordHash=String(record?.recordHash||'');
  const hashValid=recordHash.length===64;
  const auditBacked=!payloadMismatch&&preOutcome&&hashValid;
  return {
    auditBacked,
    status:payloadMismatch?'PAYLOAD_MISMATCH':!preOutcome?'LATE_AUDIT':!hashValid?'RECORD_HASH_INVALID':record?.indexedIdentity===true?'INDEX_IDENTITY':'FULL_PAYLOAD',
    seq:finite(record?.seq),
    recordHash:hashValid?recordHash:null,
    occurredAt,
    preOutcome,
    indexedIdentity:record?.indexedIdentity===true
  };
}

function learningIncludesResolvedRow(row,learningSummary,cutoff){
  const resolvedAt=finite(row?.resolution?.resolvedAt);
  return Boolean(
    row?.status==='RESOLVED'&&
    resolvedAt!=null&&
    resolvedAt<=cutoff&&
    finite(learningSummary?.generatedAt,null)!=null&&
    Number(learningSummary.generatedAt)>=resolvedAt&&
    finite(learningSummary?.resolvedOutcomes,0)>0
  );
}

function proofLifecycleRow(row,{cutoff,learningSummary,issuances=[],auditLedger=null}={}){
  const r=row?.resolution||null;
  const issuedAsOf=finite(row?.asOf);
  const dueAt=finite(row?.dueAt);
  const issuanceBinding=verifiedIssuanceBinding(row,issuances);
  const auditBinding=issuanceAuditBinding(auditLedger,issuanceBinding?.issuance,{cutoff,dueAt});
  const journalMismatch=issuanceBinding!=null&&issuanceBinding.journalMatches!==true;
  const beforeHash=issuanceBinding?.beforeHash||proofCommitment(row);
  const resolvedAt=finite(r?.resolvedAt);
  const generated=issuedAsOf!=null&&issuedAsOf<=cutoff;
  const resolved=row?.status==='RESOLVED'&&r&&resolvedAt!=null&&resolvedAt<=cutoff;
  // Reconstruct lifecycle strictly as-of the requested cutoff. A row that is
  // RESOLVED today was still LIVE before its historical resolution timestamp.
  const live=generated&&!resolved&&(dueAt==null||cutoff<dueAt);
  const awaitingOutcome=generated&&!resolved&&dueAt!=null&&cutoff>=dueAt;
  const matured=resolved;
  const reviewed=Boolean(
    matured&&
    typeof r?.topCorrect==='boolean'&&
    typeof r?.intervalMiss==='boolean'&&
    finite(r?.actualReturn,null)!=null
  );
  const learned=reviewed&&learningIncludesResolvedRow(row,learningSummary,cutoff);
  const currentStage=
    learned?'LEARNED':
    reviewed?'REVIEWED':
    matured?'MATURED':
    awaitingOutcome?'AWAITING_OUTCOME':
    live?'LIVE':
    generated?'GENERATED':'NOT_YET_VISIBLE';
  const outcomeCore=resolved?{
    beforeHash,
    resolvedAt:r?.resolvedAt,
    resolvedPrice:r?.resolvedPrice,
    actualReturn:r?.actualReturn,
    actualDirection:r?.actualDirection,
    topCorrect:r?.topCorrect===true,
    intervalMiss:r?.intervalMiss===true
  }:null;
  return freeze({
    proofId:'proof:'+sha256({id:row?.id,beforeHash,resolvedAt:r?.resolvedAt??null}).slice(0,28),
    forecastId:String(row?.id||'UNKNOWN'),
    symbol:String(row?.symbol||'UNKNOWN').toUpperCase(),
    horizonId:String(row?.horizonId||'UNKNOWN'),
    issuedAsOf,
    dueAt,
    startPrice:finite(row?.startPrice),
    predictedDirection:String(row?.direction||'UNKNOWN').toUpperCase(),
    expectedReturn:finite(row?.expectedReturn),
    intervalQ10:finite(row?.interval?.q10),
    intervalQ90:finite(row?.interval?.q90),
    forecastGate:String(row?.gate||'UNKNOWN').toUpperCase(),
    resolvedAt,
    resolvedPrice:finite(r?.resolvedPrice),
    actualReturn:finite(r?.actualReturn),
    actualDirection:String(r?.actualDirection||'UNKNOWN').toUpperCase(),
    directionalHit:resolved?r?.topCorrect===true:null,
    intervalHit:resolved?r?.intervalMiss===false:null,
    currentStage,
    milestones:freeze({generated,live,matured,reviewed,learned}),
    beforeHash,
    beforeHashSource:issuanceBinding?'INSTITUTIONAL_ISSUANCE':'JOURNAL_RECONSTRUCTION',
    proofIntegrity:journalMismatch?'BLOCKED_JOURNAL_ISSUANCE_MISMATCH':auditBinding.auditBacked?'AUDIT_BOUND':issuanceBinding?'ISSUANCE_VERIFIED_AUDIT_UNAVAILABLE':'LEGACY_RECONSTRUCTED',
    proofBinding:freeze({
      issuanceId:issuanceBinding?.issuance?.issuanceId??null,
      forecastFingerprint:issuanceBinding?.issuance?.forecastFingerprint??null,
      journalMatchesIssuance:issuanceBinding?issuanceBinding.journalMatches:null,
      auditBacked:auditBinding.auditBacked,
      auditStatus:auditBinding.status,
      auditSeq:auditBinding.seq,
      auditRecordHash:auditBinding.recordHash,
      auditOccurredAt:auditBinding.occurredAt,
      auditPreOutcome:auditBinding.preOutcome,
      auditIndexedIdentity:auditBinding.indexedIdentity
    }),
    outcomeHash:outcomeCore?sha256(outcomeCore):null,
    learningMeaning:learned?'Included in the current aggregate learning summary; not a promoted skill or production-policy mutation.':null,
    semantics:issuanceBinding
      ?'BEFORE hash is derived from a verified immutable institutional issuance. Audit binding is internal hash-chain evidence, not external attestation.'
      :'Legacy journal reconstruction only. No claim of pre-outcome audit binding.'
  });
}

export function buildBiggjProofFeed(entries=[],{
  symbol=null,
  limit=12,
  liveLimit=5,
  asOf=Date.now(),
  learningSummary=null,
  issuances=[],
  auditLedger=null
}={}){
  const target=symbol?String(symbol).toUpperCase():null;
  const take=Math.max(1,Math.min(50,Math.floor(finite(limit,12))));
  const liveTake=Math.max(1,Math.min(20,Math.floor(finite(liveLimit,5))));
  const cutoff=finite(asOf,Date.now());
  const learningGeneratedAt=finite(learningSummary?.generatedAt,null);
  const effectiveLearningSummary=learningGeneratedAt!=null&&learningGeneratedAt<=cutoff?learningSummary:null;
  const scoped=arr(entries).filter(row=>{
    const issued=finite(row?.asOf);
    if(issued==null||issued>cutoff)return false;
    if(target&&String(row?.symbol||'').toUpperCase()!==target)return false;
    return true;
  });
  const lifecycle=scoped.map(row=>proofLifecycleRow(row,{cutoff,learningSummary:effectiveLearningSummary,issuances,auditLedger}));
  const allResolved=lifecycle
    .filter(x=>['MATURED','REVIEWED','LEARNED'].includes(x.currentStage))
    .sort((a,b)=>finite(b.resolvedAt,0)-finite(a.resolvedAt,0)||String(a.forecastId).localeCompare(String(b.forecastId)));
  const resolved=allResolved.slice(0,take);
  const allLive=lifecycle
    .filter(x=>['GENERATED','LIVE','AWAITING_OUTCOME'].includes(x.currentStage))
    .sort((a,b)=>finite(b.issuedAsOf,0)-finite(a.issuedAsOf,0)||String(a.forecastId).localeCompare(String(b.forecastId)));
  const live=allLive.slice(0,liveTake);
  const hits=allResolved.filter(x=>x.directionalHit===true&&x.proofIntegrity!=='BLOCKED_JOURNAL_ISSUANCE_MISMATCH').length;
  const misses=allResolved.filter(x=>x.directionalHit===false&&x.proofIntegrity!=='BLOCKED_JOURNAL_ISSUANCE_MISMATCH').length;
  const counts={
    scoped:lifecycle.length,
    generated:lifecycle.filter(x=>x.milestones.generated).length,
    live:lifecycle.filter(x=>x.currentStage==='LIVE').length,
    awaitingOutcome:lifecycle.filter(x=>x.currentStage==='AWAITING_OUTCOME').length,
    resolved:allResolved.length,
    displayedResolved:resolved.length,
    displayedLive:live.length,
    hits,
    misses,
    reviewed:lifecycle.filter(x=>x.milestones.reviewed).length,
    learned:lifecycle.filter(x=>x.milestones.learned).length,
    auditBacked:lifecycle.filter(x=>x?.proofBinding?.auditBacked===true).length,
    issuanceVerified:lifecycle.filter(x=>x.beforeHashSource==='INSTITUTIONAL_ISSUANCE').length,
    legacyReconstructed:lifecycle.filter(x=>x.beforeHashSource==='JOURNAL_RECONSTRUCTION').length,
    integrityBlocked:lifecycle.filter(x=>x.proofIntegrity==='BLOCKED_JOURNAL_ISSUANCE_MISMATCH').length
  };
  const core={
    version:BIGGJ_PROOF_FEED_VERSION,
    generatedAt:cutoff,
    symbol:target,
    liveRows:live,
    rows:resolved,
    counts,
    learning:{
      phase:String(effectiveLearningSummary?.phase||'UNKNOWN'),
      generatedAt:finite(effectiveLearningSummary?.generatedAt),
      resolvedOutcomes:finite(effectiveLearningSummary?.resolvedOutcomes,0),
      futureSummarySuppressed:learningGeneratedAt!=null&&learningGeneratedAt>cutoff,
      meaning:'LEARNED means included in the current aggregate learning summary; it does not mean skill promotion or production-policy mutation.'
    },
    policy:{
      includesWins:true,
      includesLosses:true,
      includesOpenCommitments:true,
      selection:'MOST_RECENT_LIVE_AND_RESOLVED_WITHIN_REQUESTED_SCOPE',
      retrospectiveEditingAllowed:false,
      probabilityDisplaySuppressed:true,
      auditBoundWhenAvailable:true,
      aggregateCountsUseFullScopedSet:true
    },
    semantics:{
      beforeHashCommitsForecastFields:true,
      auditBoundBeforeHashUsesVerifiedInstitutionalIssuance:true,
      auditRecordMustPredateForecastDueTime:true,
      liveCommitmentExistsBeforeOutcome:true,
      outcomeHashBindsResolutionToBeforeHash:true,
      hashesAreInternalNotIndependentAttestation:true,
      resolvedOutcomeDoesNotProveCausalityOrFutureProfitability:true,
      lifecycleStagesAreDerivedFromStoredJournalState:true,
      futureLearningSummaryIsSuppressed:true
    },
    safety:{
      execution:'SHADOW_ONLY',
      action:'ABSTAIN',
      canExecuteLive:false
    }
  };
  return freeze({...core,fingerprint:sha256(core)});
}

export function verifyBiggjProofFeed(value){
  const reasons=[];
  if(value?.version!==BIGGJ_PROOF_FEED_VERSION)reasons.push('VERSION_INVALID');
  if(value?.safety?.execution!=='SHADOW_ONLY'||value?.safety?.action!=='ABSTAIN'||value?.safety?.canExecuteLive!==false)reasons.push('SAFETY_INVALID');
  if(value?.policy?.includesWins!==true||value?.policy?.includesLosses!==true)reasons.push('SELECTION_BIAS_POLICY_INVALID');
  if(value?.policy?.includesOpenCommitments!==true)reasons.push('OPEN_COMMITMENT_POLICY_INVALID');
  if(value?.policy?.probabilityDisplaySuppressed!==true)reasons.push('PROBABILITY_POLICY_INVALID');
  if(value?.policy?.aggregateCountsUseFullScopedSet!==true)reasons.push('AGGREGATE_COUNT_POLICY_INVALID');
  for(const row of arr(value?.liveRows)){
    if(row?.outcomeHash!=null)reasons.push('LIVE_OUTCOME_HASH_LEAK');
    if(!['GENERATED','LIVE','AWAITING_OUTCOME'].includes(String(row?.currentStage)))reasons.push('LIVE_STAGE_INVALID');
  }
  for(const row of [...arr(value?.liveRows),...arr(value?.rows)]){
    if(row?.proofBinding?.auditBacked===true){
      if(row?.beforeHashSource!=='INSTITUTIONAL_ISSUANCE')reasons.push('AUDIT_BINDING_SOURCE_INVALID');
      if(row?.proofBinding?.auditPreOutcome!==true)reasons.push('AUDIT_BINDING_LATE');
      if(String(row?.proofBinding?.auditRecordHash||'').length!==64)reasons.push('AUDIT_RECORD_HASH_INVALID');
      if(row?.proofBinding?.journalMatchesIssuance!==true)reasons.push('AUDIT_JOURNAL_LINK_INVALID');
    }
  }
  const {fingerprint,...core}=value||{};
  if(fingerprint!==sha256(core))reasons.push('FINGERPRINT_MISMATCH');
  return {ok:reasons.length===0,reasons};
}

export function renderBiggjProofFeed(feed={}){
  const rows=arr(feed?.rows);
  const live=arr(feed?.liveRows);
  const lines=[
    'BIGGJ // PROOF FEED'+(feed?.symbol?' · '+String(feed.symbol).replace('USDT','/USDT'):''),
    '━━━━━━━━━━━━━━━━━━━━',
    'FORECAST BEFORE → OUTCOME AFTER → LEARNING',
    '',
    'Live '+String(feed?.counts?.live||0)+' · Awaiting '+String(feed?.counts?.awaitingOutcome||0)+' · Resolved '+String(feed?.counts?.resolved||0)+' · Learned '+String(feed?.counts?.learned||0),
    'Hits '+String(feed?.counts?.hits||0)+' · Misses '+String(feed?.counts?.misses||0),
    'Audit-backed '+String(feed?.counts?.auditBacked||0)+' · Issuance-verified '+String(feed?.counts?.issuanceVerified||0)+' · Legacy '+String(feed?.counts?.legacyReconstructed||0)+' · Integrity-blocked '+String(feed?.counts?.integrityBlocked||0),
    ''
  ];
  if(live.length){
    lines.push('LIVE COMMITMENTS');
    for(const row of live.slice(0,4)){
      lines.push(
        '◐ '+row.currentStage.replaceAll('_',' ')+' · '+row.symbol.replace('USDT','/USDT')+' · '+row.horizonId.toUpperCase(),
        'Before  '+directionLabel(row.predictedDirection)+' · Expected '+signedPct(row.expectedReturn)+' · Range '+signedPct(row.intervalQ10)+' → '+signedPct(row.intervalQ90),
        'As-of   '+iso(row.issuedAsOf)+' · Due '+iso(row.dueAt),
        'Proof   '+(row?.proofBinding?.auditBacked?'AUDIT #'+String(row.proofBinding.auditSeq)+' · '+String(row.proofBinding.auditRecordHash).slice(0,12)+'…':row.beforeHashSource==='INSTITUTIONAL_ISSUANCE'?'ISSUANCE VERIFIED · audit '+String(row?.proofBinding?.auditStatus||'unavailable'):'LEGACY · journal reconstruction'),
        'Hash    '+String(row.beforeHash).slice(0,16)+'…',
        ''
      );
    }
  }else{
    lines.push('LIVE COMMITMENTS','Keine offenen Forecast-Commitments im gewählten Scope.','');
  }
  lines.push('RESOLVED PROOFS');
  if(!rows.length)lines.push('Noch keine aufgelösten Forecasts im gewählten Scope.');
  for(const row of rows.slice(0,8)){
    lines.push(
      (row.directionalHit?'✓ HIT':'✕ MISS')+' · '+row.currentStage+' · '+row.symbol.replace('USDT','/USDT')+' · '+row.horizonId.toUpperCase(),
      'Before  '+directionLabel(row.predictedDirection)+' · Expected '+signedPct(row.expectedReturn)+' · Range '+signedPct(row.intervalQ10)+' → '+signedPct(row.intervalQ90),
      'After   '+directionLabel(row.actualDirection)+' · Return '+signedPct(row.actualReturn)+' · Range '+(row.intervalHit?'HIT':'MISS'),
      'As-of   '+iso(row.issuedAsOf)+' · Resolved '+iso(row.resolvedAt),
      'Proof   '+(row.proofIntegrity==='BLOCKED_JOURNAL_ISSUANCE_MISMATCH'?'INTEGRITY BLOCKED':row?.proofBinding?.auditBacked?'AUDIT #'+String(row.proofBinding.auditSeq)+' · pre-outcome':'LEGACY / unaudited'),
      'Hash    '+String(row.beforeHash).slice(0,12)+'… → '+String(row.outcomeHash||'').slice(0,12)+'…',
      ''
    );
  }
  lines.push(
    'Lifecycle: GENERATED → LIVE → MATURED → REVIEWED → LEARNED.',
    'LEARNED = im aktuellen Learning-Aggregat enthalten; keine Skill-Promotion und keine PRIMARY-Änderung.',
    'Feed zeigt Gewinne UND Fehler; keine Cherry-Pick-Policy. Aggregate zählen den vollständigen gewählten Scope, nicht nur die sichtbaren letzten Rows.',
    'AUDIT = Forecast-Issuance war vor Fälligkeit im internen hash-verketteten Ledger gebunden.',
    'LEGACY = nur aus gespeichertem Journal rekonstruiert; keine Behauptung eines vorherigen Audit-Commitments.',
    'Hashes/Audit sind interne Integritätsbelege, keine unabhängige externe Beglaubigung.',
    'Vergangene Treffer beweisen keine zukünftige Profitabilität.',
    'SHADOW_ONLY · REAL ORDERS BLOCKED'
  );
  return lines.join('\n').slice(0,4096);
}

export function signalLabKeyboard(symbol,horizonId='1h',mode='FULL'){
  const s=String(symbol||'BTCUSDT').toUpperCase();
  const active=String(horizonId||'1h').toLowerCase();
  const activeMode=normalizeMode(mode);
  const h=(id)=>({text:(active===id?'● ':'')+id.toUpperCase(),callback_data:'signallab:'+s+':'+id+':'+activeMode});
  const m=(id,label=id)=>({text:(activeMode===id?'● ':'')+label,callback_data:'signallab:'+s+':'+active+':'+id});
  return {inline_keyboard:[
    [h('5m'),h('15m'),h('1h'),h('4h')],
    [m('FULL','FULL'),m('STRUCTURE','STRUCT'),m('FLOW','FLOW'),m('LIQUIDITY','LIQ'),m('MACRO','MACRO')],
    [
      {text:'🧠 SUPERCHART',callback_data:'superchart:'+s+':PRO:5m'},
      {text:'◇ EVIDENCE',callback_data:'evidence:'+s}
    ],
    [
      {text:'▣ PROOF FEED',callback_data:'proof:'+s},
      {text:'↻ REFRESH',callback_data:'signallab:'+s+':'+active+':'+activeMode}
    ],
    [{text:'⌂ HOME',callback_data:'home'}]
  ]};
}

export function proofFeedKeyboard(symbol=null){
  const s=symbol?String(symbol).toUpperCase():null;
  return {inline_keyboard:[
    [
      {text:'BTC',callback_data:'proof:BTCUSDT'},
      {text:'ETH',callback_data:'proof:ETHUSDT'},
      {text:'SOL',callback_data:'proof:SOLUSDT'}
    ],
    [
      {text:'ALLE',callback_data:'proof:ALL'},
      ...(s?[{text:'SIGNAL',callback_data:'signallab:'+s+':1h:FULL'}]:[])
    ],
    [{text:'⌂ HOME',callback_data:'home'}]
  ]};
}
