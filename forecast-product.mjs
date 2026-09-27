export const FORECAST_PRODUCT_VERSION='TCX_FORECAST_PRODUCT_V1';

function finite(v){const n=Number(v);return Number.isFinite(n)?n:null;}
function clamp01(v){const n=finite(v);return n==null?0:Math.max(0,Math.min(1,n));}
function pct(v,d=1){
  const n=finite(v);
  return n==null?'—':(n*100).toFixed(d)+'%';
}
function signedPct(v,d=2){
  const n=finite(v);
  if(n==null) return '—';
  return (n>=0?'+':'')+(n*100).toFixed(d)+'%';
}
function price(v){
  const n=finite(v);
  if(n==null) return '—';
  return n<1?n.toFixed(6):n.toFixed(2);
}
function reasons(xs,limit=3){
  return (Array.isArray(xs)?xs:[]).map(String).filter(Boolean).slice(0,limit);
}

export function deriveForecastRuntimeQuality({
  safety,
  marketAudit,
  witnessAudit,
  engineAudit,
  witnessReport,
  dashboard,
  extraFeatureCount=0,
  expectedExtraFeatureCount=10
}={}){
  const featureCoverage=expectedExtraFeatureCount>0
    ?clamp01(Number(extraFeatureCount)/Number(expectedExtraFeatureCount))
    :1;
  const marketIntegrity=marketAudit?.ok===true?1:0;
  const engineIntegrity=engineAudit?.ok===true?1:0;
  const witnessIntegrity=witnessAudit?.ok===true?1:0;
  const externalCoverage=clamp01(Number(witnessReport?.externalWitnessCount||0)/2);
  const safetyFactor=String(safety?.state||'UNKNOWN')==='NORMAL'
    ?1
    :String(safety?.state||'UNKNOWN')==='DEGRADED'
      ?.75
      :0;

  const dataQuality=clamp01(
    .30*marketIntegrity+
    .20*engineIntegrity+
    .15*witnessIntegrity+
    .15*externalCoverage+
    .20*featureCoverage
  )*safetyFactor;

  const biasScore=Math.abs(Number(dashboard?.biasScore||0));
  const regimeConfidence=clamp01(biasScore/6);

  return Object.freeze({
    version:FORECAST_PRODUCT_VERSION,
    dataQuality,
    regimeConfidence,
    components:Object.freeze({
      marketIntegrity,
      engineIntegrity,
      witnessIntegrity,
      externalCoverage,
      featureCoverage,
      safetyFactor
    }),
    epistemic:Object.freeze({
      dataQuality:'DIAGNOSTIC_INPUT_QUALITY_NOT_PROBABILITY',
      regimeConfidence:'DERIVED_MTF_ALIGNMENT_NOT_PROBABILITY'
    })
  });
}

export function renderInstitutionalForecastCard(issuance,{
  runtimeSummary=null,
  scienceGuardLines=[],
  auditBound=null,
  auditHealthy=null,
  now=Date.now()
}={}){
  if(!issuance?.forecast||!issuance?.admission) throw new Error('institutional issuance required');
  const auditOk=typeof auditBound==='boolean'
    ?auditBound
    :(typeof auditHealthy==='boolean'?auditHealthy:true);
  const f=issuance.forecast;
  const horizons=Array.isArray(f.horizons)?f.horizons:[];
  const directionWord=d=>{
    const x=String(d||'UNKNOWN').toUpperCase();
    if(x==='UP') return 'eher nach oben';
    if(x==='DOWN') return 'eher nach unten';
    if(x==='FLAT'||x==='SIDEWAYS') return 'eher seitwärts';
    return 'noch keine klare Richtung';
  };
  const gateWord=g=>{
    const x=String(g||'UNKNOWN').toUpperCase();
    if(x==='PASS'||x==='VALID') return 'ausreichend geprüft';
    if(x==='CAUTION') return 'mit Vorsicht';
    if(x==='INSUFFICIENT') return 'noch zu wenig Belege';
    if(x==='ABSTAIN'||x==='SAFE_STOP') return 'keine belastbare Aussage';
    return x.toLowerCase();
  };
  const admitted=auditOk&&String(issuance.admission.gate||'').toUpperCase()==='PASS';
  const lead=horizons[0]||null;
  const lines=[
    '🔮 TCX FORECAST · '+String(issuance.symbol).replace('USDT','/USDT'),
    '',
    'KURZ GESAGT',
    lead
      ?'Für '+lead.horizonId+' sieht TCX den Markt '+directionWord(lead.direction)+'.'
      :'TCX hat aktuell noch keine belastbare Richtung.',
    admitted
      ?'Der Forecast hat die institutionellen Prüfungen bestanden.'
      :'TCX hält sich aktuell zurück: '+gateWord(issuance.admission.gate)+'.',
    ''
  ];

  if(horizons.length){
    lines.push('ZEITHORIZONTE');
    for(const h of horizons){
      const display=auditOk&&issuance.probabilityDisplayAllowed===true&&h.display?.probabilityDisplayAllowed===true;
      lines.push(
        '• '+h.horizonId+': '+directionWord(h.direction),
        '  Erwartete Bewegung: '+signedPct(h.expectedReturn)+
          ' · realistischer Bereich: '+signedPct(h.interval?.q10)+' bis '+signedPct(h.interval?.q90),
        display
          ?'  Chancenmodell: hoch '+pct(h.display.probabilities.up,0)+
            ' · seitwärts '+pct(h.display.probabilities.flat,0)+
            ' · runter '+pct(h.display.probabilities.down,0)
          :'  Wahrscheinlichkeit: noch nicht freigegeben',
        '  Grundlage: '+Number(h.support?.analogCount||0)+' ähnliche Fälle'+
          ' · Kalibrierung: '+String(h.calibration?.status||'UNKNOWN'),
        ''
      );
    }
  }

  lines.push(
    'WARUM TCX SO URTEILT',
    '• Daten: '+gateWord(issuance.trace?.safety?.state==='NORMAL'?'PASS':issuance.trace?.safety?.state),
    '• Wissenschaftliche Prüfung: '+gateWord(f.scienceGate),
    '• Forecast-Prüfung: '+gateWord(f.overallGate),
    '• Forschungsstand: '+String(issuance.trace?.validity?.state||'UNKNOWN'),
    '• Audit: '+(auditOk?'vollständig gebunden':'FEHLER → Forecast gesperrt')
  );

  if(f.path){
    lines.push(
      '• Preisweg: '+String(f.path.coherence||'UNKNOWN')+
      (f.path.dominantArchetype?' · Muster '+String(f.path.dominantArchetype):'')
    );
  }

  if(Array.isArray(scienceGuardLines)&&scienceGuardLines.length){
    lines.push('','DETAILCHECKS',...scienceGuardLines.slice(0,6).map(x=>'• '+String(x)));
  }

  lines.push('','WAS DAS FÜR DICH BEDEUTET');
  if(!auditOk){
    lines.push('Der Audit ist nicht sauber. TCX verwirft die Aussage deshalb vollständig.');
  }else if(!admitted){
    lines.push('Die Richtung ist nur ein Forschungssignal. Die Belege reichen noch nicht für eine belastbare Wahrscheinlichkeit.');
  }else{
    lines.push('Das Signal ist für Forschung zugelassen. Es bleibt eine Prognose mit Unsicherheit, keine sichere Kursvorhersage.');
  }

  lines.push(
    '',
    'SYSTEM',
    'Trace '+String(issuance.traceId||'').slice(0,12)+'… · '+Math.max(0,Math.round((Number(now)-Number(issuance.generatedAt))/1000))+'s alt',
    ...(runtimeSummary?[
      'Lernbasis: '+Number(runtimeSummary.historyCases||0)+' ausgewertete Fälle'+
      ' · '+Number(runtimeSummary.pendingOutcomes||0)+' offen'
    ]:[]),
    '',
    'Modus: SHADOW_ONLY · Aktion: ABSTAIN'
  );

  return lines.join('\n').slice(0,4096);
}

export function forecastKeyboard(symbol){
  const s=String(symbol||'').toUpperCase();
  return {inline_keyboard:[
    [
      {text:'🔄 Neu berechnen',callback_data:'forecast:'+s},
      {text:'📊 Markt',callback_data:'refresh:'+s}
    ],
    [
      {text:'🧩 Evidence',callback_data:'evidence:'+s},
      {text:'⏱ Validity',callback_data:'validity:'+s}
    ],
    [
      {text:'🧬 Memory',callback_data:'memory:'+s},
      {text:'🧪 MTL',callback_data:'engine:'+s}
    ],
    [{text:'🏠 Home',callback_data:'home'}]
  ]};
}
