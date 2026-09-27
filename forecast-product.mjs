export const FORECAST_PRODUCT_VERSION='TCX_FORECAST_PRODUCT_V2_BEGINNER_FIRST';

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
  const auditOk=typeof auditBound==='boolean'?auditBound:(typeof auditHealthy==='boolean'?auditHealthy:true);
  const f=issuance.forecast;
  const horizons=Array.isArray(f.horizons)?f.horizons:[];
  const directionWord=d=>{
    const x=String(d||'UNKNOWN').toUpperCase();
    if(x==='UP') return '🟢 eher steigend';
    if(x==='DOWN') return '🔴 eher fallend';
    if(x==='FLAT'||x==='SIDEWAYS') return '🟡 eher seitwärts';
    return '⚪ noch unklar';
  };
  const admitted=auditOk&&String(issuance.admission.gate||'').toUpperCase()==='PASS';
  const lead=horizons[0]||null;
  const leadDisplay=lead&&auditOk&&issuance.probabilityDisplayAllowed===true&&lead.display?.probabilityDisplayAllowed===true;
  const lines=[
    '🔮 KURSPROGNOSE · '+String(issuance.symbol).replace('USDT','/USDT'),
    '',
    'KURZ GESAGT',
    lead?('Richtung: '+directionWord(lead.direction)):'Richtung: ⚪ noch unklar',
    admitted?'Belastbarkeit: 🟢 ausreichend geprüft':'Belastbarkeit: 🟡 noch nicht belastbar',
    lead?('Erwartete Bewegung: '+signedPct(lead.expectedReturn)):'',
    lead?('Möglicher Bereich: '+signedPct(lead.interval?.q10)+' bis '+signedPct(lead.interval?.q90)):'',
    leadDisplay
      ?('Modellverteilung: ↑ '+pct(lead.display.probabilities.up,0)+' · ↔ '+pct(lead.display.probabilities.flat,0)+' · ↓ '+pct(lead.display.probabilities.down,0))
      :'Wahrscheinlichkeit: noch nicht freigegeben',
    ''
  ].filter(Boolean);

  if(horizons.length){
    lines.push('ZEITHORIZONTE');
    for(const h of horizons){
      const display=auditOk&&issuance.probabilityDisplayAllowed===true&&h.display?.probabilityDisplayAllowed===true;
      lines.push(
        '• '+h.horizonId+' · '+directionWord(h.direction)+' · '+signedPct(h.expectedReturn),
        '  Bereich: '+signedPct(h.interval?.q10)+' bis '+signedPct(h.interval?.q90),
        display
          ?'  ↑ '+pct(h.display.probabilities.up,0)+' · ↔ '+pct(h.display.probabilities.flat,0)+' · ↓ '+pct(h.display.probabilities.down,0)
          :'  Wahrscheinlichkeit: noch nicht freigegeben'
      );
    }
  }

  lines.push('','WARUM TCX DAS SO SIEHT');
  lines.push('• Datenprüfung: '+(issuance.trace?.safety?.state==='NORMAL'?'🟢 sauber':'🟡 eingeschränkt'));
  lines.push('• Wissenschaftlicher Check: '+String(f.scienceGate||'UNKNOWN'));
  lines.push('• Forecast-Check: '+String(f.overallGate||'UNKNOWN'));
  lines.push('• Aktueller Forschungsstand: '+String(issuance.trace?.validity?.state||'UNKNOWN'));
  lines.push('• Audit: '+(auditOk?'🟢 vollständig':'FEHLER → Forecast gesperrt'));

  if(!auditOk){
    lines.push('Probability: SUPPRESSED');
  }

  if(Array.isArray(scienceGuardLines)&&scienceGuardLines.length){
    lines.push('','PROFI-CHECKS',...scienceGuardLines.slice(0,5).map(x=>'• '+String(x)));
  }

  lines.push('','WAS DAS FÜR DICH BEDEUTET');
  if(!auditOk){
    lines.push('Die Datenprüfung ist nicht sauber. TCX verwirft die Prognose deshalb.');
  }else if(!admitted){
    lines.push('TCX sieht zwar eine mögliche Richtung, aber die Belege reichen noch nicht für eine belastbare Aussage.');
  }else{
    lines.push('Die Prognose hat die internen Prüfungen bestanden. Sie bleibt trotzdem unsicher und kann sich mit neuen Daten ändern.');
  }

  lines.push(
    '',
    'RISIKO & GRENZEN',
    '• Keine Kursprognose ist sicher.',
    '• Neue Marktbewegungen oder widersprüchliche Daten können die Sicht ändern.',
    '• TCX führt keine echten Orders aus.',
    '',
    'Systemmodus: ABSTAIN / SHADOW_ONLY',
    'Trace '+String(issuance.traceId||'').slice(0,10)+'… · '+Math.max(0,Math.round((Number(now)-Number(issuance.generatedAt))/1000))+'s alt',
    ...(runtimeSummary?['Lernbasis: '+Number(runtimeSummary.historyCases||0)+' ausgewertete Fälle · '+Number(runtimeSummary.pendingOutcomes||0)+' offen']:[])
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
      {text:'🔎 Warum?',callback_data:'why:'+s},
      {text:'📈 Chart',callback_data:'chart:'+s+':5m'}
    ],
    [
      {text:'🧠 Daten & Belege',callback_data:'evidence:'+s},
      {text:'⏱ Gültigkeit',callback_data:'validity:'+s}
    ],
    [{text:'🏠 Start',callback_data:'home'}]
  ]};
}
