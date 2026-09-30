export const TRADE_DISCOVERY_DIAGNOSTICS_VERSION='TCX_TRADE_DISCOVERY_DIAGNOSTICS_V1';

const REASON_TEXT={
  ADMISSION_ABSTAIN:'Die Prognose hat keine Einstiegsfreigabe erhalten',
  ADMISSION_CAUTION:'Die Freigabe ist vorsichtig; strengere Einstiegsschwellen gelten',
  NO_ADMITTED_DIRECTIONAL_HORIZON:'Kein kalibrierter Richtungs-Horizont ist zugelassen',
  DATA_SAFETY_NOT_NORMAL:'Die Datensicherheit steht nicht auf NORMAL',
  EXPECTED_RETURN_TOO_SMALL:'Die erwartete Rendite liegt unter der Einstiegsschwelle',
  DIRECTIONAL_PROBABILITY_TOO_LOW:'Die Richtungswahrscheinlichkeit liegt unter der Schwelle',
  PROBABILITY_EDGE_TOO_LOW:'Der Wahrscheinlichkeitsvorsprung liegt unter der Schwelle',
  STRATEGY_LANE_COOLDOWN:'Für diese Coin-, Richtung- und Horizont-Kombination läuft noch die Abkühlzeit',
  DAILY_SYMBOL_CAP:'Der Tageshöchstwert für normale Einstiege dieses Coins ist erreicht',
  ACADEMY_GLOBAL_OPEN_CAP:'Das von der Academy erlaubte Gesamtlimit offener Positionen ist erreicht',
  ACADEMY_SYMBOL_OPEN_CAP:'Das von der Academy erlaubte Coin-Limit offener Positionen ist erreicht',
  ACADEMY_RISK_HOLD:'Capital Academy hält Core-Einstiege zurück',
  ACADEMY_MEME_HOLD:'Capital Academy hält Memecoin-Einstiege zurück',
  TRAINING_SUPERVISOR_HOLD:'Training Supervisor hat Einstiege pausiert',
  DISCOVERY_GLOBAL_OPEN_CAP:'Das Limit offener Exploration-Trades ist erreicht',
  DISCOVERY_SYMBOL_OPEN_CAP:'Für diesen Coin ist bereits ein Exploration-Trade offen',
  DISCOVERY_SYMBOL_COOLDOWN:'Für diesen Coin läuft noch die Exploration-Abkühlzeit',
  DISCOVERY_DAILY_SYMBOL_CAP:'Der Tageshöchstwert für diesen Coin ist erreicht',
  DISCOVERY_RUNTIME_UNHEALTHY:'Audit, OMS oder Portfolio blockiert neue Einstiege',
  RUNTIME_AUDIT_OR_OMS_UNHEALTHY:'Audit oder OMS blockiert normale Einstiege',
  PROBABILITY_NOT_ADMITTED:'Wahrscheinlichkeiten sind nicht zur Nutzung freigegeben',
  FORECAST_STALE:'Die Prognose ist zu alt für einen Einstieg',
  MANDATORY_DISCOVERY_DISABLED:'Mandatory Discovery ist ausgeschaltet',
  COVERAGE_SLOTS_PLACED:'Es wurden nur getrennte Coverage-Probes angelegt',
  NO_SAFE_LEARNABLE_CANDIDATE:'Kein kalibrierter und gerichteter Exploration-Kandidat ist sicher genug',
  LEARNING_VALUE_TOO_LOW:'Der Kandidat bringt zu wenig zusätzlichen Lernwert',
  DISCOVERY_RESPECTS_STANDARD_BLOCK_ADMISSION_ABSTAIN:'Discovery respektiert die ABSTAIN-Sperre',
  DISCOVERY_RESPECTS_STANDARD_BLOCK_NO_ADMITTED_DIRECTIONAL_HORIZON:'Discovery respektiert den fehlenden freigegebenen Horizont',
  FORECAST_ALL_HORIZONS_ABSTAIN:'Alle Prognose-Horizonte sind gesperrt; es gibt kein freigegebenes Einstiegssignal',
  NO_CALIBRATED_HORIZONS:'Noch fehlen genügend aufgelöste Ergebnisse zur Horizont-Kalibrierung',
  RESEARCH_DEPENDENCY_ABSTAIN:'Die Prüfung der Forschungsdaten blockiert die Prognosefreigabe'
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
    if(String(row.admissionGate||'').toUpperCase()==='ABSTAIN') increment(blockers,'ADMISSION_ABSTAIN');
    if(String(row.researchDependencyGate||'').toUpperCase()==='ABSTAIN') increment(blockers,'RESEARCH_DEPENDENCY_ABSTAIN');
    const hs=Array.isArray(row.horizons)?row.horizons:[];
    if(hs.length&&hs.every(x=>String(x.gate||'').toUpperCase()==='ABSTAIN')) increment(blockers,'FORECAST_ALL_HORIZONS_ABSTAIN');
    if(hs.length&&!hs.some(x=>String(x.calibration||'').toUpperCase()==='CALIBRATED')) increment(blockers,'NO_CALIBRATED_HORIZONS');
  }
  const topBlockers=[...blockers.entries()].sort((a,b)=>b[1]-a[1]).slice(0,6).map(([reason,count])=>({reason,count,text:humanReason(reason)}));
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
    researchDependencyAbstain:count(x=>String(x.researchDependencyGate||'').toUpperCase()==='ABSTAIN'),
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
    latestHorizonDetails:(latest?.horizons||[]).map(h=>({
      horizonId:String(h.horizonId||'unknown'),gate:String(h.gate||'UNKNOWN'),
      calibration:String(h.calibration||'UNKNOWN'),direction:String(h.direction||'NEUTRAL'),
      expectedReturn:h.expectedReturn,directionalProbability:h.directionalProbability,
      probabilityEdge:h.probabilityEdge,expectedReturnThreshold:h.expectedReturnThreshold,
      directionThreshold:h.directionThreshold,edgeThreshold:h.edgeThreshold,
      reasons:Array.isArray(h.reasons)?h.reasons.slice(0,2):[]
    })),
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
  const horizonText=(s.latestHorizonDetails||[]).map(h=>{
    const vals=[`${h.horizonId}: ${h.gate}/${h.calibration}`,h.direction&&h.direction!=='NEUTRAL'?h.direction:null,
      h.expectedReturn!=null&&Number.isFinite(Number(h.expectedReturn))?`Rendite ${(Number(h.expectedReturn)*100).toFixed(2)}% (Schwelle ${(Number(h.expectedReturnThreshold)*100).toFixed(2)}%)`:null,
      h.directionalProbability!=null&&Number.isFinite(Number(h.directionalProbability))?`Richtung ${(Number(h.directionalProbability)*100).toFixed(0)}% (Schwelle ${(Number(h.directionThreshold)*100).toFixed(0)}%)`:null,
      h.probabilityEdge!=null&&Number.isFinite(Number(h.probabilityEdge))?`Vorsprung ${(Number(h.probabilityEdge)*100).toFixed(0)}pp (Schwelle ${(Number(h.edgeThreshold)*100).toFixed(0)}pp)`:null].filter(Boolean);
    return '• '+vals.join(' · ')+(h.reasons.length?' — '+h.reasons.join('; '):'');
  }).join('\n');
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
    `Research Dependency ABSTAIN: ${s.researchDependencyAbstain}/${s.checkedCoins}`,
    `Wahrscheinlichkeiten freigegeben: ${s.probabilityDisplayAllowed}/${s.checkedCoins} · Datensicherheit NORMAL: ${s.normalDataSafety}/${s.checkedCoins}`,
    `Kalibrierte Horizonte: ${s.totalCalibratedHorizons}/${s.totalHorizons} · Horizon PASS: ${s.horizonPasses}`,
    `Schwellen erfüllt: Return ${s.expectedReturnPasses} · Richtung ${s.directionProbabilityPasses} · Edge ${s.probabilityEdgePasses}`,
    '',
    'WICHTIGSTE BLOCKER',
    blockerText,
    '',
    latestText,
    ...(horizonText?['Horizont-Details',horizonText]:[]),
    '',
    `OMS: ${s.runtime.omsStatus||'unbekannt'} · gefüllt ${s.runtime.omsFilled??'unbekannt'} · aktiv ${s.runtime.omsActive??'unbekannt'}`,
    `Academy: ${s.runtime.academyStage||'unbekannt'} · Core ${s.runtime.academyCoreAllowed===true?'freigegeben':s.runtime.academyCoreAllowed===false?'gehalten':'unbekannt'} · Meme ${s.runtime.academyMemeAllowed===true?'freigegeben':s.runtime.academyMemeAllowed===false?'gehalten':'unbekannt'}`,
    `Training Supervisor: ${s.runtime.trainingHold===true?'HOLD':s.runtime.trainingHold===false?'freigegeben':'unbekannt'} · Mission ${s.runtime.trainingMission||'unbekannt'}`,
    `Offene normale Positionen: ${s.runtime.openStandardPositions??'unbekannt'}/${s.runtime.standardOpenCap??'?'} · offene Discovery: ${s.runtime.openDiscoveryPositions??'unbekannt'}/${s.runtime.discoveryOpenCap??'?'}`,
    `Reconciliation: ${s.runtime.reconciliation||'unbekannt'} · zuletzt geprüft ${fmtTime(s.runtime.reconciledAt)}`,
    '',
    'Nächster Lernschritt: '+s.nextStep,
    '',
    'Keine echten Börsenorders · SHADOW_ONLY · canExecuteLive: false'
  ].join('\n').slice(0,4096);
}
