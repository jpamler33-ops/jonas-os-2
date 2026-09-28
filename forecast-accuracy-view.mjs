import { evaluateForecastJournal, evaluateWalkForwardJournal, evaluateProbabilityCalibrationGate } from './forecast-runtime/forecast/evaluation.js';

export const FORECAST_ACCURACY_VIEW_VERSION='TCX_FORECAST_ACCURACY_VIEW_V1';

function finite(v){
  if(v===null||v===undefined||v==='')return null;
  const n=Number(v);
  return Number.isFinite(n)?n:null;
}
function pct(v,d=1){
  const n=finite(v);
  return n==null?'—':(n*100).toFixed(d)+'%';
}
function num(v,d=3){
  const n=finite(v);
  return n==null?'—':n.toFixed(d);
}
function bar(v,width=10){
  const n=Math.max(0,Math.min(1,finite(v)||0));
  const k=Math.round(n*width);
  return '█'.repeat(k)+'░'.repeat(width-k);
}
function horizonOrder(a,b){
  return Number(a?.[1]?.count?0:0)-Number(b?.[1]?.count?0);
}

export function buildForecastAccuracyView(entries,{
  symbol=null,
  minDisplaySamples=30,
  foldSize=50,
  highConfidenceThreshold=.65
}={}){
  const all=Array.isArray(entries)?entries:[];
  const scoped=symbol?all.filter(x=>String(x?.symbol||'').toUpperCase()===String(symbol).toUpperCase()):all;
  const evaluation=evaluateForecastJournal(scoped,highConfidenceThreshold);
  const folds=evaluateWalkForwardJournal(scoped,{foldSize,highConfidenceThreshold});
  const gate=evaluateProbabilityCalibrationGate(scoped);
  const resolved=evaluation.resolvedCount;
  const ready=resolved>=Math.max(1,Number(minDisplaySamples)||30);
  const m=evaluation.overall;
  const lines=[
    'TCX // FORECAST ACCURACY · '+(symbol?String(symbol).replace('USDT','/USDT'):'ALL MARKETS'),
    '━━━━━━━━━━━━━━━━━━━━',
    '',
    'SAMPLE',
    'Resolved '+resolved+' · Pending '+evaluation.pendingCount+' · Expired '+evaluation.expiredCount,
    'Display gate '+(ready?'🟢 enough cases':'🟡 '+resolved+'/'+Math.max(1,Number(minDisplaySamples)||30)+' cases'),
    ''
  ];

  if(ready){
    lines.push(
      'QUALITY',
      'Directional accuracy '+pct(m.directionalAccuracy,1),
      'Brier score          '+num(m.multiclassBrier,3)+'  (lower better)',
      'Log loss             '+num(m.logLoss,3)+'  (lower better)',
      'Calibration ECE      '+pct(m.expectedCalibrationError,1)+'  (lower better)',
      'Interval coverage    '+pct(m.intervalCoverage,1),
      'High-conf wrong      '+pct(m.highConfidenceWrongRate,1),
      'Mean op confidence   '+pct(m.meanOperationalConfidence,1),
      '',
      'CALIBRATION BINS'
    );
    for(const bin of m.reliabilityBins.slice(0,10)){
      lines.push(
        Math.round(bin.meanConfidence*100)+'% conf  '+bar(bin.accuracy,8)+'  '+Math.round(bin.accuracy*100)+'% correct · n='+bin.count
      );
    }
  }else{
    lines.push(
      'QUALITY',
      'Noch zu wenige aufgelöste Forecasts für eine belastbare Treffer-/Kalibrierungsanzeige.'
    );
  }

  lines.push('','BY HORIZON');
  const horizons=Object.entries(evaluation.byHorizon||{}).sort((a,b)=>String(a[0]).localeCompare(String(b[0])));
  if(horizons.length){
    for(const [id,h] of horizons.slice(0,8)){
      lines.push(
        String(id).toUpperCase()+' · n='+h.count+
        (h.count>=minDisplaySamples?' · hit '+pct(h.directionalAccuracy,0)+' · Brier '+num(h.multiclassBrier,3):' · sammelt')
      );
    }
  }else lines.push('—');

  lines.push('','WALK-FORWARD');
  if(folds.length){
    const recent=folds.slice(-4);
    for(const f of recent){
      lines.push(
        'Fold '+f.fold+' · n='+f.metrics.count+' · hit '+pct(f.metrics.directionalAccuracy,0)+' · Brier '+num(f.metrics.multiclassBrier,3)
      );
    }
  }else lines.push('Noch keine abgeschlossenen Folds.');

  lines.push(
    '',
    'PROBABILITY GATE  '+String(gate.status||'UNKNOWN'),
    'Sample '+(gate.checks.sampleSize?'✓':'×')+
      ' · Brier '+(gate.checks.brier?'✓':'×')+
      ' · ECE '+(gate.checks.ece?'✓':'×')+
      ' · Coverage '+(gate.checks.intervalCoverage?'✓':'×')+
      ' · High-conf '+(gate.checks.highConfidenceErrors?'✓':'×'),
    '',
    'Trefferquote allein reicht nicht: Kalibrierung, Brier, Log-Loss und Interval Coverage zählen mit.',
    'Nur Point-in-Time Forecasts mit später beobachtetem Ergebnis werden ausgewertet.',
    'SHADOW_ONLY · keine Profitgarantie'
  );

  return Object.freeze({
    version:FORECAST_ACCURACY_VIEW_VERSION,
    text:lines.join('\n').slice(0,4096),
    ready,
    scopedEntries:scoped.length,
    evaluation,
    folds:Object.freeze(folds),
    gate,
    researchOnly:true
  });
}
