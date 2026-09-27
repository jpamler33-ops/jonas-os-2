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
  auditBound=true,
  now=Date.now()
}={}){
  if(!issuance?.forecast||!issuance?.admission) throw new Error('institutional issuance required');
  const f=issuance.forecast;
  const lines=[
    '🔮 TCX FORECAST INTELLIGENCE · '+String(issuance.symbol).replace('USDT','/USDT'),
    '',
    'Admission: '+(auditBound?issuance.admission.gate:'ABSTAIN')+' · '+(auditBound?issuance.admission.researchDisposition:'ABSTAIN'),
    'Audit: '+(auditBound?'BOUND':'FAILED → ABSTAIN'),
    'Science: '+f.scienceGate+' · Forecast: '+f.overallGate,
    'Research validity: '+String(issuance.trace?.validity?.state||'UNKNOWN'),
    'Data safety: '+String(issuance.trace?.safety?.state||'UNKNOWN'),
    ''
  ];

  for(const h of f.horizons){
    const display=auditBound&&issuance.probabilityDisplayAllowed===true&&h.display?.probabilityDisplayAllowed===true;
    lines.push(
      h.horizonId+' · '+h.direction+' · gate '+h.gate,
      'μ '+signedPct(h.expectedReturn)+' · q10..q90 '+signedPct(h.interval?.q10)+' .. '+signedPct(h.interval?.q90),
      display
        ?'P↑ '+pct(h.display.probabilities.up,0)+' · P→ '+pct(h.display.probabilities.flat,0)+' · P↓ '+pct(h.display.probabilities.down,0)
        :'Probability: SUPPRESSED · '+(
          !auditBound
            ?'AUDIT_BINDING_FAILED'
            :reasons(h.display?.suppressionReasons,2).join(', ')||'INSTITUTIONAL_ADMISSION_GATE'
        ),
      'Support n='+Number(h.support?.analogCount||0)+' · ESS '+(finite(h.support?.effectiveSamples)?.toFixed(1)??'—')+
        ' · calibration '+String(h.calibration?.status||'UNKNOWN'),
      ''
    );
  }

  if(Array.isArray(scienceGuardLines)&&scienceGuardLines.length){
    lines.push('SCIENCE GUARDS',...scienceGuardLines.slice(0,8).map(x=>'• '+String(x)),'');
  }

  if(f.path){
    lines.push(
      'PATH',
      'Coherence: '+String(f.path.coherence||'UNKNOWN')+
        ' · archetype '+String(f.path.dominantArchetype||'UNKNOWN'),
      ''
    );
  }

  lines.push(
    'TRACE',
    'Trace '+String(issuance.traceId||'').slice(0,16)+'…',
    'Issuance '+String(issuance.issuanceId||'').slice(0,16)+'…',
    'asOf '+new Date(Number(issuance.asOf)).toISOString(),
    'age '+Math.max(0,Math.round((Number(now)-Number(issuance.generatedAt))/1000))+'s',
    ...(runtimeSummary?[
      'Runtime history '+Number(runtimeSummary.historyCases||0)+
      ' · pending '+Number(runtimeSummary.pendingOutcomes||0)+
      ' · tracked '+Number(runtimeSummary.trackedForecasts||0)
    ]:[]),
    '',
    'Probabilities werden nur angezeigt, wenn Forecast- und Science-Gates sowie Kalibrierung dies erlauben.',
    ...(auditHealthy?[]:['Audit binding: FAILED → display fail-closed']),
    'Action: ABSTAIN · Execution: SHADOW_ONLY'
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
