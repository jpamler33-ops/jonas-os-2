export const CHART_INTELLIGENCE_VERSION='TCX_CHART_INTELLIGENCE_V1';

function finite(v){
  const n=Number(v);
  return Number.isFinite(n)?n:null;
}
function price(v){
  const n=finite(v);
  if(n==null) return '—';
  const a=Math.abs(n);
  return n.toFixed(a<1?6:a<100?3:2);
}
function pct(v,d=2){
  const n=finite(v);
  return n==null?'—':n.toFixed(d)+'%';
}
function trendWord(v){
  const x=String(v||'').toUpperCase();
  if(x==='BULLISH'||x.includes('UP')) return 'BULLISH';
  if(x==='BEARISH'||x.includes('DOWN')) return 'BEARISH';
  if(x==='NEUTRAL'||x.includes('RANGE')||x.includes('SIDE')) return 'NEUTRAL';
  return 'UNKNOWN';
}
function directionIcon(v){
  const t=trendWord(v);
  return t==='BULLISH'?'↗':t==='BEARISH'?'↘':'→';
}
function mtfSummary(mtf){
  const frames=['4h','1h','15m','5m'];
  const rows=frames.map(tf=>[tf,trendWord(mtf?.analyses?.[tf]?.trend)]);
  const bullish=rows.filter(([,t])=>t==='BULLISH').length;
  const bearish=rows.filter(([,t])=>t==='BEARISH').length;
  const label=bullish>=3?'BULLISH ALIGNMENT':bearish>=3?'BEARISH ALIGNMENT':'MIXED';
  return {rows,bullish,bearish,label};
}
function structureMeaning(trend){
  const t=trendWord(trend);
  if(t==='BULLISH') return 'höhere Hochs + höhere Tiefs';
  if(t==='BEARISH') return 'tiefere Hochs + tiefere Tiefs';
  if(t==='NEUTRAL') return 'keine saubere Folge höherer/tieferer Swings';
  return 'noch nicht genug bestätigte Swings';
}
function latestByKind(pivots,kind){
  for(let i=pivots.length-1;i>=0;i--) if(pivots[i]?.kind===kind) return pivots[i];
  return null;
}
function scenarioLines(analysis){
  const trend=trendWord(analysis?.trend);
  const support=finite(analysis?.support),resistance=finite(analysis?.resistance);
  const lines=[];
  if(resistance!=null) lines.push('Über '+price(resistance)+' → Resistance-Test / möglicher Break');
  if(support!=null) lines.push('Unter '+price(support)+' → Support-Test / Struktur unter Druck');
  if(trend==='BULLISH'&&support!=null) lines.push('Bull-Struktur bleibt intakt, solange bestätigte HLs nicht brechen.');
  else if(trend==='BEARISH'&&resistance!=null) lines.push('Bear-Struktur bleibt intakt, solange bestätigte LHs nicht brechen.');
  else lines.push('Bei gemischter Struktur zählt der nächste bestätigte Swing.');
  return lines;
}
function patternText(pattern){
  if(!pattern) return 'kein aktiver Break/Retest';
  const side=String(pattern.side||'').toUpperCase()==='LONG'?'UP':String(pattern.side||'').toUpperCase()==='SHORT'?'DOWN':String(pattern.side||'—');
  const stage=String(pattern.stage||'—').replaceAll('_',' ');
  return side+' · '+stage+' @ '+price(pattern.level);
}
function emaText(analysis){
  const e20=finite(analysis?.ema20),e50=finite(analysis?.ema50);
  if(e20==null||e50==null) return '—';
  if(e20>e50) return 'EMA20 > EMA50';
  if(e20<e50) return 'EMA20 < EMA50';
  return 'EMA20 = EMA50';
}

export function buildChartIntelligence({
  symbol,
  interval='5m',
  analysis={},
  dashboard={},
  mtf={},
  candles=[],
  live=false,
  now=Date.now()
}={}){
  const pivots=Array.isArray(analysis?.classifiedPivots)?analysis.classifiedPivots:[];
  const recent=pivots.slice(-6);
  const lastPivot=recent.at(-1)||null;
  const lastHigh=latestByKind(recent,'H');
  const lastLow=latestByKind(recent,'L');
  const active=Array.isArray(candles)&&candles.some(c=>c?.closed===false);
  const trend=trendWord(analysis?.trend);
  const mtfState=mtfSummary(mtf);
  const flow=String(dashboard?.flow||'UNKNOWN').toUpperCase();
  const pressure=Math.round(finite(dashboard?.pressureScore)??0);
  const vol=finite(dashboard?.realizedVolPct);
  const atr=finite(dashboard?.atrPct);
  const volumeRatio=finite(dashboard?.volumeRatio);
  const spread=finite(dashboard?.spreadBps);
  const sequence=recent.map(p=>String(p.label||'?')).join(' → ')||'noch nicht genug Swings';
  const levels=[
    lastHigh?('High '+lastHigh.label+' '+price(lastHigh.price)):null,
    lastLow?('Low '+lastLow.label+' '+price(lastLow.price)):null
  ].filter(Boolean).join(' · ')||'—';
  const glossary='HH höheres Hoch · HL höheres Tief · LH tieferes Hoch · LL tieferes Tief';
  const mtfLine=mtfState.rows.map(([tf,t])=>tf+' '+directionIcon(t)).join(' · ');

  const caption=[
    'TCX // LIVE CHART · '+String(symbol||'').replace('USDT','/USDT'),
    String(interval).toUpperCase()+' · '+(live?'⚡ AUTO '+Math.round(10)+'s':'Snapshot'),
    '',
    'STRUKTUR  '+directionIcon(trend)+' '+trend,
    sequence,
    'Letzter Swing  '+(lastPivot?(lastPivot.label+' '+price(lastPivot.price)):'—'),
    levels,
    'Bedeutung      '+structureMeaning(trend),
    '',
    'LEVELS',
    'Support '+price(analysis?.support)+' · Resistance '+price(analysis?.resistance),
    'Event   '+patternText(analysis?.pattern),
    emaText(analysis),
    '',
    'MARKT',
    'MTF '+mtfState.label+' · '+mtfLine,
    'Flow '+flow+' · Druck '+pressure+'/100',
    'Vol '+pct(vol,3)+' · ATR '+pct(atr,3)+' · Volume '+(volumeRatio==null?'—':volumeRatio.toFixed(2)+'×')+' · Spread '+(spread==null?'—':spread.toFixed(2)+'bps'),
    '',
    'WENN/DANN',
    ...scenarioLines(analysis).slice(0,2),
    '',
    glossary,
    active?'Laufende Kerze zählt NICHT als bestätigter Swing.':'Nur abgeschlossene Kerzen ausgewertet.',
    'DERIVED STRUCTURE · SHADOW_ONLY'
  ].join('\n');

  return Object.freeze({
    version:CHART_INTELLIGENCE_VERSION,
    caption:caption.slice(0,1024),
    trend,
    sequence,
    lastPivot:lastPivot?Object.freeze({label:String(lastPivot.label),price:finite(lastPivot.price),kind:String(lastPivot.kind||'')}):null,
    support:finite(analysis?.support),
    resistance:finite(analysis?.resistance),
    pattern:patternText(analysis?.pattern),
    mtf:Object.freeze(mtfState),
    activeCandleVisible:active,
    generatedAt:Number(now),
    researchOnly:true
  });
}
