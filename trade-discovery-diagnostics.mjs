export const TRADE_DISCOVERY_DIAGNOSTICS_VERSION='TCX_TRADE_DISCOVERY_DIAGNOSTICS_V1';

const REASON_TEXT={
  ADMISSION_ABSTAIN:'Forecast has not passed the admission gate',
  ADMISSION_CAUTION:'Admission is cautious; the normal entry thresholds are stricter',
  NO_ADMITTED_DIRECTIONAL_HORIZON:'No calibrated directional horizon passed its forecast gate',
  DATA_SAFETY_NOT_NORMAL:'Data safety is not NORMAL',
  EXPECTED_RETURN_TOO_SMALL:'Expected return is below the normal threshold',
  DIRECTIONAL_PROBABILITY_TOO_LOW:'Directional probability is below the normal threshold',
  PROBABILITY_EDGE_TOO_LOW:'The probability edge is below the normal threshold',
  ACADEMY_RISK_HOLD:'Capital Academy currently holds core entries',
  ACADEMY_MEME_HOLD:'Capital Academy currently holds memecoin entries',
  TRAINING_SUPERVISOR_HOLD:'Training Supervisor has paused entries',
  DISCOVERY_GLOBAL_OPEN_CAP:'The exploration trade limit is full',
  DISCOVERY_SYMBOL_OPEN_CAP:'An exploration trade for this coin is already open',
  DISCOVERY_SYMBOL_COOLDOWN:'This coin is inside its exploration cooldown',
  DISCOVERY_DAILY_SYMBOL_CAP:'This coin reached its daily exploration limit',
  DISCOVERY_RUNTIME_UNHEALTHY:'Audit, OMS, or portfolio health is blocking entries',
  RUNTIME_AUDIT_OR_OMS_UNHEALTHY:'Audit or OMS health is blocking standard entries',
  PROBABILITY_NOT_ADMITTED:'Probability display is not admitted',
  FORECAST_STALE:'The forecast is too old to use',
  MANDATORY_DISCOVERY_DISABLED:'Mandatory Discovery is disabled',
  DATA_SAFETY_NOT_NORMAL:'Data safety is not NORMAL',
  COVERAGE_SLOTS_PLACED:'Only isolated coverage probes were placed',
  NO_SAFE_LEARNABLE_CANDIDATE:'No calibrated, directionally usable exploration candidate was found',
  LEARNING_VALUE_TOO_LOW:'The candidate does not add enough learning value',
  DISCOVERY_RESPECTS_STANDARD_BLOCK_ADMISSION_ABSTAIN:'Discovery correctly respects the ABSTAIN admission block',
  DISCOVERY_RESPECTS_STANDARD_BLOCK_NO_ADMITTED_DIRECTIONAL_HORIZON:'Discovery correctly respects the missing admitted horizon'
};

export function createTradeDiscoveryDiagnostics({maxSymbols=32}={}){
  return {version:TRADE_DISCOVERY_DIAGNOSTICS_VERSION,maxSymbols:Math.max(1,Math.floor(maxSymbols)),symbols:new Map(),lastUpdatedAt:null};
}

export function isMandatoryDiscoveryFallbackReasonAllowed(reason){
  return new Set(['EXPECTED_RETURN_TOO_SMALL','DIRECTIONAL_PROBABILITY_TOO_LOW','PROBABILITY_EDGE_TOO_LOW']).has(String(reason||''));
}

export function countOpenDiscoveryPositions(positions=[]){
  return (Array.isArray(positions)?positions:[]).filter(p=>
    p?.status==='OPEN'&&['EXPLORATION','ABSTAIN_PROBE'].includes(String(p?.entryMode||'').toUpperCase())
  ).length;
}

export function recordTradeDiscoveryScan(state,row){
  if(!state||state.version!==TRADE_DISCOVERY_DIAGNOSTICS_VERSION||!row?.symbol) return false;
  const symbol=String(row.symbol).toUpperCase();
  state.symbols.delete(symbol);
  state.symbols.set(symbol,{...row,symbol,scannedAt:Number(row.scannedAt)||Date.now()});
  while(state.symbols.size>state.maxSymbols) state.symbols.delete(state.symbols.keys().next().value);
  state.lastUpdatedAt=Date.now();
  return true;
}

function increment(map,key){map.set(key,(map.get(key)||0)+1);}
function humanReason(reason){
  const key=String(reason||'UNKNOWN');
  if(REASON_TEXT[key]) return REASON_TEXT[key];
  if(key.startsWith('DISCOVERY_RESPECTS_STANDARD_BLOCK_')) return 'Discovery respects the safety/admission block';
  if(key.startsWith('DISCOVERY_')) return 'Discovery blocked: '+key.replace(/^DISCOVERY_/,'').toLowerCase().replaceAll('_',' ');
  return key.toLowerCase().replaceAll('_',' ');
}

export function summarizeTradeDiscovery(state,{now=Date.now(),runtime={}}={}){
  const rows=[...(state?.symbols?.values?.()||[])];
  const blockers=new Map();
  const count=(fn)=>rows.filter(fn).length;
  for(const row of rows){
    const reasons=new Set([row.mandatoryDiscoveryReason,row.autoShadowTradeReason,row.coverageCurriculumReason]
      .filter(Boolean)
      .filter(x=>!['STANDARD_SHADOW_TRADE_ALREADY_PLACED','COVERAGE_SLOTS_PLACED','NO_SAFE_DUE_COVERAGE_SLOT'].includes(String(x))));
    for(const reason of reasons) increment(blockers,String(reason));
  }
  const topBlockers=[...blockers.entries()].sort((a,b)=>b[1]-a[1]).slice(0,4).map(([reason,count])=>({reason,count,text:humanReason(reason)}));
  const horizonRows=rows.flatMap(x=>Array.isArray(x.horizons)?x.horizons:[]);
  const stateSafety=count(x=>String(x.dataSafety||'UNKNOWN').toUpperCase()==='NORMAL');
  const admitted=count(x=>['PASS','CAUTION'].includes(String(x.admissionGate||'').toUpperCase()));
  const displayAllowed=count(x=>x.probabilityDisplayAllowed===true);
  const latest=rows.slice().sort((a,b)=>Number(b.scannedAt)-Number(a.scannedAt))[0]||null;
  const nextStep=rows.length===0
    ?'Wait for the next AutoLearn scan; no scan result has been recorded yet.'
    :horizonRows.filter(x=>String(x.calibration||'').toUpperCase()==='CALIBRATED').length===0
      ?'Keep collecting forward outcomes for the isolated coverage probes. AutoLearn currently has no calibrated horizon, so a normal or exploration trade cannot pass without weakening calibration.'
      :admitted===0
        ?'Collect more valid, point-in-time evidence until admission moves from ABSTAIN to PASS or CAUTION.'
        :topBlockers[0]?.reason?.includes('CAP')||topBlockers[0]?.reason?.includes('COOLDOWN')
          ?'Let open positions close or the per-coin cooldown expire, then rescan.'
          :'Review the top blocker and gather fresh evidence for the affected horizon.';
  return {
    scannedAt:state?.lastUpdatedAt||null,
    checkedCoins:rows.length,
    forecastAvailable:count(x=>x.forecastAvailable===true),
    standardCandidates:count(x=>x.autoShadowTradeEligible===true),
    standardTrades:count(x=>x.autoShadowTradePlaced===true),
    explorationCandidates:count(x=>x.mandatoryDiscoveryEligible===true),
    explorationTrades:count(x=>x.mandatoryDiscoveryPlaced===true),
    coverageProbes:rows.reduce((s,x)=>s+Number(x.coverageCurriculumPlaced||0),0),
    abstainForecasts:count(x=>String(x.forecastGate||'').toUpperCase()==='ABSTAIN'),
    admittedForecasts:admitted,
    probabilityDisplayAllowed:displayAllowed,
    normalDataSafety:stateSafety,
    totalCalibratedHorizons:horizonRows.filter(x=>String(x.calibration||'').toUpperCase()==='CALIBRATED').length,
    totalHorizons:horizonRows.length,
    horizonPasses:horizonRows.filter(x=>String(x.gate||'').toUpperCase()==='PASS').length,
    expectedReturnPasses:horizonRows.filter(x=>x.expectedReturnPass===true).length,
    directionProbabilityPasses:horizonRows.filter(x=>x.directionProbabilityPass===true).length,
    probabilityEdgePasses:horizonRows.filter(x=>x.probabilityEdgePass===true).length,
    topBlockers,
    latest,
    nextStep,
    runtime:{...runtime,execution:'SHADOW_ONLY',canExecuteLive:false},
    execution:'SHADOW_ONLY',canExecuteLive:false,
    rows
  };
}

export function renderTradeDiscoveryDiagnostics(summary,{timeZone='Europe/Berlin'}={}){
  const fmtTime=value=>{
    if(!value) return 'noch kein Scan';
    return new Intl.DateTimeFormat('de-DE',{timeZone,dateStyle:'short',timeStyle:'medium'}).format(new Date(value));
  };
  const s=summary||summarizeTradeDiscovery(null);
  const blockerText=s.topBlockers.length?s.topBlockers.map(x=>`• ${x.text} (${x.count} Coin${x.count===1?'':'s'})`).join('\n'):'• Noch keine Blocker erfasst';
  const latest=s.latest;
  const latestText=latest
    ?`Letzter Coin: ${latest.symbol} · Forecast ${latest.forecastGate||'unbekannt'} · Admission ${latest.admissionGate||'unbekannt'} · Datensicherheit ${latest.dataSafety||'unbekannt'}\nKalibrierung: ${latest.horizons?.filter(x=>x.calibration==='CALIBRATED').length||0}/${latest.horizons?.length||0} Horizonte · letzter Grund: ${humanReason(latest.mandatoryDiscoveryReason||latest.autoShadowTradeReason||latest.coverageCurriculumReason)}`
    :'AutoLearn hat noch keinen vollständigen Scan erfasst.';
  return [
    '🔎 WARUM KEIN SHADOW-TRADE?',
    '',
    `Letzter Scan: ${fmtTime(s.scannedAt)}`,
    `Geprüfte Coins: ${s.checkedCoins} · Forecasts: ${s.forecastAvailable}`,
    `Kandidaten: normal ${s.standardCandidates} · Exploration ${s.explorationCandidates}`,
    `Eingestellt: normal ${s.standardTrades} · Exploration ${s.explorationTrades} · Coverage-Probes ${s.coverageProbes}`,
    '',
    'GATES',
    `Forecast ABSTAIN: ${s.abstainForecasts}/${s.checkedCoins} · Admission PASS/CAUTION: ${s.admittedForecasts}/${s.checkedCoins}`,
    `Wahrscheinlichkeiten freigegeben: ${s.probabilityDisplayAllowed}/${s.checkedCoins} · Datensicherheit NORMAL: ${s.normalDataSafety}/${s.checkedCoins}`,
    `Kalibrierte Horizonte: ${s.totalCalibratedHorizons}/${s.totalHorizons} · Horizon PASS: ${s.horizonPasses}`,
    `Schwellen erfüllt: Return ${s.expectedReturnPasses} · Richtung ${s.directionProbabilityPasses} · Edge ${s.probabilityEdgePasses}`,
    '',
    'WICHTIGSTE BLOCKER',
    blockerText,
    '',
    latestText,
    '',
    `OMS: ${s.runtime.omsStatus||'unbekannt'} · gefüllt ${s.runtime.omsFilled??'unbekannt'} · aktiv ${s.runtime.omsActive??'unbekannt'}`,
    `Offene normale Positionen: ${s.runtime.openStandardPositions??'unbekannt'} · offene Discovery: ${s.runtime.openDiscoveryPositions??'unbekannt'}/${s.runtime.discoveryOpenCap??'?'}`,
    `Reconciliation: ${s.runtime.reconciliation||'unbekannt'} · zuletzt geprüft ${fmtTime(s.runtime.reconciledAt)}`,
    '',
    'Nächster Lernschritt: '+s.nextStep,
    '',
    'Keine echten Börsenorders · SHADOW_ONLY · canExecuteLive: false'
  ].join('\n').slice(0,4096);
}
