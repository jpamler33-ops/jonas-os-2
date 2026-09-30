import { sha256 } from './institutional-kernel.mjs';

export const BIGGJ_SIGNAL_LAB_VERSION='TCX_BIGGJ_SIGNAL_LAB_V1';
export const BIGGJ_PROOF_FEED_VERSION='TCX_BIGGJ_PROOF_FEED_V1';

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

function horizonFor(issuance,horizonId){
  const hs=arr(issuance?.forecast?.horizons);
  if(!hs.length)return null;
  const wanted=String(horizonId||'').toLowerCase();
  return hs.find(x=>String(x?.horizonId||'').toLowerCase()===wanted)||hs[0];
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
    mode:String(mode||'FULL').toUpperCase(),
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
    supportReasons:supports,
    counterReasons:counters,
    semantics:{
      watchIsNotOrderAuthorization:true,
      probabilityOnlyWhenCalibrationGatePasses:true,
      diagnosticEvidenceScoreIsNotProbability:true,
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

function proofRow(row){
  const r=row?.resolution||{};
  const beforeHash=proofCommitment(row);
  const outcomeCore={
    beforeHash,
    resolvedAt:r?.resolvedAt,
    resolvedPrice:r?.resolvedPrice,
    actualReturn:r?.actualReturn,
    actualDirection:r?.actualDirection,
    topCorrect:r?.topCorrect===true,
    intervalMiss:r?.intervalMiss===true
  };
  return freeze({
    proofId:'proof:'+sha256({id:row?.id,beforeHash,resolvedAt:r?.resolvedAt}).slice(0,28),
    forecastId:String(row?.id||'UNKNOWN'),
    symbol:String(row?.symbol||'UNKNOWN').toUpperCase(),
    horizonId:String(row?.horizonId||'UNKNOWN'),
    issuedAsOf:finite(row?.asOf),
    dueAt:finite(row?.dueAt),
    startPrice:finite(row?.startPrice),
    predictedDirection:String(row?.direction||'UNKNOWN').toUpperCase(),
    expectedReturn:finite(row?.expectedReturn),
    intervalQ10:finite(row?.interval?.q10),
    intervalQ90:finite(row?.interval?.q90),
    forecastGate:String(row?.gate||'UNKNOWN').toUpperCase(),
    resolvedAt:finite(r?.resolvedAt),
    resolvedPrice:finite(r?.resolvedPrice),
    actualReturn:finite(r?.actualReturn),
    actualDirection:String(r?.actualDirection||'UNKNOWN').toUpperCase(),
    directionalHit:r?.topCorrect===true,
    intervalHit:r?.intervalMiss===false,
    beforeHash,
    outcomeHash:sha256(outcomeCore),
    semantics:'Internal deterministic commitment hash. Not an external timestamp, blockchain proof, or independent attestation.'
  });
}

export function buildBiggjProofFeed(entries=[],{
  symbol=null,
  limit=12,
  asOf=Date.now()
}={}){
  const target=symbol?String(symbol).toUpperCase():null;
  const resolved=arr(entries)
    .filter(x=>x?.status==='RESOLVED'&&x?.resolution)
    .filter(x=>!target||String(x?.symbol||'').toUpperCase()===target)
    .filter(x=>finite(x?.resolution?.resolvedAt)!=null&&finite(x?.resolution?.resolvedAt)<=finite(asOf,Date.now()))
    .sort((a,b)=>finite(b?.resolution?.resolvedAt,0)-finite(a?.resolution?.resolvedAt,0))
    .slice(0,Math.max(1,Math.min(50,Math.floor(finite(limit,12)))))
    .map(proofRow);
  const hits=resolved.filter(x=>x.directionalHit).length;
  const misses=resolved.length-hits;
  const core={
    version:BIGGJ_PROOF_FEED_VERSION,
    generatedAt:finite(asOf,Date.now()),
    symbol:target,
    rows:resolved,
    counts:{resolved:resolved.length,hits,misses},
    policy:{
      includesWins:true,
      includesLosses:true,
      selection:'MOST_RECENT_RESOLVED_WITHIN_REQUESTED_SCOPE',
      retrospectiveEditingAllowed:false,
      probabilityDisplaySuppressed:true
    },
    semantics:{
      beforeHashCommitsForecastFields:true,
      outcomeHashBindsResolutionToBeforeHash:true,
      hashesAreInternalNotIndependentAttestation:true,
      resolvedOutcomeDoesNotProveCausalityOrFutureProfitability:true
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
  if(value?.policy?.probabilityDisplaySuppressed!==true)reasons.push('PROBABILITY_POLICY_INVALID');
  const {fingerprint,...core}=value||{};
  if(fingerprint!==sha256(core))reasons.push('FINGERPRINT_MISMATCH');
  return {ok:reasons.length===0,reasons};
}

export function renderBiggjProofFeed(feed={}){
  const rows=arr(feed?.rows);
  const lines=[
    'BIGGJ // PROOF FEED'+(feed?.symbol?' · '+String(feed.symbol).replace('USDT','/USDT'):''),
    '━━━━━━━━━━━━━━━━━━━━',
    'FORECAST BEFORE → OUTCOME AFTER',
    '',
    'Resolved '+String(feed?.counts?.resolved||0)+' · Hits '+String(feed?.counts?.hits||0)+' · Misses '+String(feed?.counts?.misses||0),
    ''
  ];
  if(!rows.length)lines.push('Noch keine aufgelösten Forecasts im gewählten Scope.');
  for(const row of rows.slice(0,10)){
    lines.push(
      (row.directionalHit?'✓ HIT':'✕ MISS')+' · '+row.symbol.replace('USDT','/')+' · '+row.horizonId.toUpperCase(),
      'Before  '+directionLabel(row.predictedDirection)+' · Expected '+signedPct(row.expectedReturn)+' · Range '+signedPct(row.intervalQ10)+' → '+signedPct(row.intervalQ90),
      'After   '+directionLabel(row.actualDirection)+' · Return '+signedPct(row.actualReturn)+' · Range '+(row.intervalHit?'HIT':'MISS'),
      'As-of   '+iso(row.issuedAsOf)+' · Resolved '+iso(row.resolvedAt),
      'Hash    '+String(row.beforeHash).slice(0,12)+'… → '+String(row.outcomeHash).slice(0,12)+'…',
      ''
    );
  }
  lines.push(
    'Feed zeigt Gewinne UND Fehler; keine Cherry-Pick-Policy.',
    'Hashes sind interne deterministische Commitments, keine unabhängige externe Beglaubigung.',
    'Vergangene Treffer beweisen keine zukünftige Profitabilität.',
    'SHADOW_ONLY · REAL ORDERS BLOCKED'
  );
  return lines.join('\n').slice(0,4096);
}

export function signalLabKeyboard(symbol,horizonId='1h'){
  const s=String(symbol||'BTCUSDT').toUpperCase();
  const active=String(horizonId||'1h').toLowerCase();
  const b=(h)=>({text:(active===h?'● ':'')+h.toUpperCase(),callback_data:'signallab:'+s+':'+h});
  return {inline_keyboard:[
    [b('5m'),b('15m'),b('1h'),b('4h')],
    [
      {text:'🧠 SUPERCHART',callback_data:'superchart:'+s+':PRO:5m'},
      {text:'◇ EVIDENCE',callback_data:'evidence:'+s}
    ],
    [
      {text:'▣ PROOF FEED',callback_data:'proof:'+s},
      {text:'↻ REFRESH',callback_data:'signallab:'+s+':'+active}
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
      ...(s?[{text:'SIGNAL',callback_data:'signallab:'+s+':1h'}]:[])
    ],
    [{text:'⌂ HOME',callback_data:'home'}]
  ]};
}
