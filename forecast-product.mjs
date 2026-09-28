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

export function renderInstitutionalForecastCard(issuance,{runtimeSummary=null,scienceGuardLines=[],auditBound=null,auditHealthy=null,now=Date.now()}={}){if(!issuance?.forecast||!issuance?.admission)throw new Error('institutional issuance required');const auditOk=typeof auditBound==='boolean'?auditBound:(typeof auditHealthy==='boolean'?auditHealthy:true),f=issuance.forecast,h=Array.isArray(f.horizons)?f.horizons:[],lead=h[0]||null,admitted=auditOk&&String(issuance.admission.gate||'').toUpperCase()==='PASS',dir=d=>String(d).toUpperCase()==='UP'?'↗ UP':String(d).toUpperCase()==='DOWN'?'↘ DOWN':'→ SIDEWAYS';const directionPlain=lead?(String(lead.direction).toUpperCase()==='UP'?'eher steigend':String(lead.direction).toUpperCase()==='DOWN'?'eher fallend':'eher seitwärts'):'noch unklar';const lines=['🔮 FORECAST · '+String(issuance.symbol).replace('USDT','/USDT'),'','KURZ GESAGT','Richtung: '+directionPlain,'DIRECTION   '+(lead?dir(lead.direction):'—'),'CONFIDENCE  '+(admitted?'🟢 VERIFIED':'🟡 LIMITED'),'EXPECTED    '+(lead?signedPct(lead.expectedReturn):'—'),'RANGE       '+(lead?signedPct(lead.interval?.q10)+'  →  '+signedPct(lead.interval?.q90):'—'),'','TIME HORIZONS'];for(const x of h.slice(0,4))lines.push(x.horizonId+'   '+dir(x.direction)+'   '+signedPct(x.expectedReturn));const dependency=(issuance.trace?.evidence||[]).find(x=>x?.type==='RESEARCH_DEPENDENCY_GRAPH');if(dependency){const usable=Number(dependency.usableFeatures||0),total=Number(dependency.totalFeatures||0),blocked=Number(dependency.blockedFeatures||0);lines.push('Forschungsdaten: '+(blocked>0?'🟡':'🟢')+' '+usable+'/'+total+' Zusatzmerkmale nutzbar'+(blocked>0?' · '+blocked+' gesperrt':''));}if(!(auditOk&&issuance.probabilityDisplayAllowed===true&&lead?.display?.probabilityDisplayAllowed===true))lines.push('','Wahrscheinlichkeit: noch nicht freigegeben');lines.push('','VALIDATION','Data '+(issuance.trace?.safety?.state==='NORMAL'?'🟢':'🟡')+' · Science '+String(f.scienceGate||'—')+' · Audit '+(auditOk?'🟢':'🔴'),...(auditOk?[]:['Audit: FEHLER → Forecast gesperrt','Probability: SUPPRESSED']),'','WAS DAS FÜR DICH BEDEUTET','STATUS',!auditOk?'Forecast gesperrt: Audit nicht vollständig.':!admitted?'Richtung erkannt, Evidenz noch nicht stark genug.':'Interne Prüfungen bestanden; Unsicherheit bleibt bestehen.','','ABSTAIN / SHADOW_ONLY','Trace '+String(issuance.traceId||'').slice(0,10)+'… · '+Math.max(0,Math.round((Number(now)-Number(issuance.generatedAt))/1000))+'s');return lines.join('\n').slice(0,4096);}

function dependencyDomainLabel(domain){
  const d=String(domain||'UNKNOWN').toUpperCase();
  const labels={
    DERIVATIVES:'Futures & Funding',
    LIQUIDATION:'Liquidationen',
    ONCHAIN:'Blockchain',
    ENTITY_FLOW:'Große Akteure',
    WALLET_COHORT:'Wallet-Gruppen'
  };
  return labels[d]||d.replaceAll('_',' ');
}

function dependencyStateLabel(state){
  const x=String(state||'UNKNOWN').toUpperCase();
  if(x==='HEALTHY') return '🟢 sauber';
  if(x==='DEGRADED') return '🟡 eingeschränkt';
  if(x==='BLOCKED') return '🔴 gesperrt';
  if(x==='INSUFFICIENT') return '⚪ zu wenig Daten';
  return '⚪ unbekannt';
}

function dependencyGateLabel(gate){
  const x=String(gate||'UNKNOWN').toUpperCase();
  if(x==='PASS') return '🟢 Datenweg sauber';
  if(x==='CAUTION') return '🟡 Datenweg eingeschränkt';
  if(x==='ABSTAIN') return '🔴 Datenweg blockiert';
  if(x==='INSUFFICIENT') return '⚪ Noch zu wenig Daten';
  return '⚪ Status unbekannt';
}

export function renderResearchDependencyCard(graph,{
  symbol=null,
  latestForecast=null,
  now=Date.now()
}={}){
  if(!graph?.impact||!Array.isArray(graph?.nodes)) throw new Error('research dependency graph required');
  const s=String(symbol||graph.streamKey||'').toUpperCase();
  const impact=graph.impact;
  const sourceNodes=graph.nodes.filter(x=>x?.type==='SOURCE');
  const factorNodes=graph.nodes.filter(x=>x?.type==='FACTOR').sort((a,b)=>String(a.domain).localeCompare(String(b.domain)));
  const sourceCounts={HEALTHY:0,DEGRADED:0,BLOCKED:0,UNKNOWN:0};
  for(const row of sourceNodes){
    const state=String(row?.state||'UNKNOWN').toUpperCase();
    sourceCounts[state]=(sourceCounts[state]||0)+1;
  }
  const latestAt=finite(latestForecast?.generatedAt);
  const ageSec=latestAt==null?null:Math.max(0,Math.round((Number(now)-latestAt)/1000));
  const coverage=finite(impact.coverage);
  const lines=[
    '🧬 DATENWEG · '+s.replace('USDT','/USDT'),
    '',
    'KURZ GESAGT',
    'Status: '+dependencyGateLabel(graph.gate),
    'Nutzbare Zusatzmerkmale: '+Number(impact.usableFeatures||0)+'/'+Number(impact.totalFeatures||0),
    'Gesperrt: '+Number(impact.blockedFeatures||0)+' · Eingeschränkt: '+Number(impact.degradedFeatures||0),
    coverage==null?'Abdeckung: —':'Abdeckung: '+Math.round(coverage*100)+' %',
    '',
    'SO KOMMT EIN SIGNAL ZUSTANDE',
    'Datenquelle → Messpunkt → Merkmal → Faktor → Prognose',
    'TCX kann dadurch rückwärts prüfen, wo jedes Forschungssignal herkommt.',
    '',
    'DATENBEREICHE'
  ];

  if(factorNodes.length){
    for(const factor of factorNodes.slice(0,8)){
      lines.push(
        '• '+dependencyDomainLabel(factor.domain)+': '+dependencyStateLabel(factor.state)+
        ' · '+Number(factor.featureCount||0)+' Merkmale'
      );
    }
  }else{
    lines.push('• Noch keine aktiven Forschungsdaten für diesen Forecast.');
  }

  lines.push(
    '',
    'QUELLENSTATUS',
    '🟢 '+Number(sourceCounts.HEALTHY||0)+' sauber · 🟡 '+Number(sourceCounts.DEGRADED||0)+' eingeschränkt · 🔴 '+Number(sourceCounts.BLOCKED||0)+' gesperrt'
  );

  const impacted=Array.isArray(impact.impactedSourceKeys)?impact.impactedSourceKeys:[];
  if(impacted.length){
    lines.push('','BETROFFENE QUELLEN');
    for(const key of impacted.slice(0,5)){
      const parts=String(key).split(':');
      lines.push('• '+dependencyDomainLabel(parts[0])+' · '+String(parts.slice(1).join(':')||'Quelle').replaceAll('_',' '));
    }
  }

  const blocked=Array.isArray(impact.blockedFeatureIds)?impact.blockedFeatureIds:[];
  if(blocked.length){
    lines.push('','GESPERRTE MERKMALE');
    for(const id of blocked.slice(0,5)){
      lines.push('• '+String(id).split('.').at(-1));
    }
    if(blocked.length>5) lines.push('• +'+(blocked.length-5)+' weitere');
  }

  lines.push(
    '',
    'WAS DAS BEDEUTET',
    graph.gate==='PASS'
      ?'Die verwendeten Forschungsdaten sind entlang ihrer Herkunft nachvollziehbar und aktuell nicht blockiert.'
      :graph.gate==='CAUTION'
        ?'Mindestens ein Teil der Forschungsdaten ist eingeschränkt. TCX kennzeichnet den Einfluss sichtbar.'
        :'Mindestens eine relevante Datenabhängigkeit ist nicht ausreichend nutzbar. TCX arbeitet deshalb fail-closed.',
    '',
    'Integrität: '+String(graph.fingerprint||'').slice(0,12)+'…',
    ...(ageSec==null?[]:['Forecast-Alter: '+ageSec+'s']),
    'Systemmodus: ABSTAIN / SHADOW_ONLY'
  );

  return lines.join('\n').slice(0,4096);
}

export function researchDependencyKeyboard(symbol){
  const s=String(symbol||'').toUpperCase();
  return {inline_keyboard:[
    [
      {text:'🔮 Zur Prognose',callback_data:'forecast:'+s},
      {text:'🔄 Neu laden',callback_data:'lineage:'+s}
    ],
    [
      {text:'🧠 Belege',callback_data:'evidence:'+s},
      {text:'⏱ Gültigkeit',callback_data:'validity:'+s}
    ],
    [{text:'🏠 Start',callback_data:'home'}]
  ]};
}

export function forecastKeyboard(symbol){const s=String(symbol||'').toUpperCase();return {inline_keyboard:[[{text:'🔄 Recalculate',callback_data:'forecast:'+s},{text:'📈 Chart',callback_data:'chart:'+s+':5m'}],[{text:'🔎 Why?',callback_data:'why:'+s},{text:'🔔 Alert',callback_data:'alerthelp:'+s}],[{text:'🧠 Evidence',callback_data:'evidence:'+s},{text:'📊 Market',callback_data:'refresh:'+s}],[{text:'🏠 Command Center',callback_data:'home'}]]};}
