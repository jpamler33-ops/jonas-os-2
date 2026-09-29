export const FORECAST_CHART_OVERLAY_VERSION='TCX_FORECAST_CHART_OVERLAY_V1';

function finite(v){
  if(v===null||v===undefined||v==='') return null;
  const n=Number(v);
  return Number.isFinite(n)?n:null;
}
function clonePoint(p){
  const horizonMs=finite(p?.horizonMs),targetPrice=finite(p?.targetPrice);
  if(!(horizonMs>0)||!(targetPrice>0)) return null;
  return Object.freeze({
    horizonId:String(p?.horizonId||''),
    horizonMs,
    targetPrice,
    targetReturn:finite(p?.targetReturn)
  });
}

export function forecastIssuanceToChartOverlay(issuance,{now=Date.now(),maxAgeMs=6*60*60_000}={}){
  const forecast=issuance?.forecast;
  const asOf=finite(forecast?.asOf??issuance?.asOf);
  const anchorPrice=finite(forecast?.price??issuance?.input?.price);
  if(!(asOf>0)||!(anchorPrice>0)) return null;
  const ageMs=Math.max(0,Number(now)-asOf);
  if(ageMs>Math.max(60_000,Number(maxAgeMs)||0)) return null;

  const rawPath=forecast?.path||{};
  const scenarios=(Array.isArray(rawPath?.scenarios)?rawPath.scenarios:[])
    .map(s=>{
      const points=(Array.isArray(s?.points)?s.points:[]).map(clonePoint).filter(Boolean).sort((a,b)=>a.horizonMs-b.horizonMs);
      const probability=finite(s?.probability);
      return points.length?Object.freeze({
        id:String(s?.id||'PATH'),
        probability:probability==null?null:Math.max(0,Math.min(1,probability)),
        points:Object.freeze(points)
      }):null;
    })
    .filter(Boolean);

  const horizons=(Array.isArray(forecast?.horizons)?forecast.horizons:[])
    .map(h=>{
      const horizonMs=finite(h?.horizonMs);
      const q10=finite(h?.interval?.q10),q90=finite(h?.interval?.q90),median=finite(h?.interval?.median);
      if(!(horizonMs>0)||q10==null||q90==null||median==null) return null;
      return Object.freeze({
        horizonId:String(h?.horizonId||''),
        horizonMs,
        lowerPrice:anchorPrice*(1+q10),
        medianPrice:anchorPrice*(1+median),
        upperPrice:anchorPrice*(1+q90),
        gate:String(h?.gate||'UNKNOWN'),
        operationalConfidence:finite(h?.operationalConfidence)
      });
    })
    .filter(Boolean)
    .sort((a,b)=>a.horizonMs-b.horizonMs);

  if(!scenarios.length&&!horizons.length) return null;
  return Object.freeze({
    version:FORECAST_CHART_OVERLAY_VERSION,
    asOf,
    ageMs,
    anchorPrice,
    status:String(rawPath?.status||'UNKNOWN'),
    coherence:String(rawPath?.coherence||'UNKNOWN'),
    dominantArchetype:String(rawPath?.dominantArchetype||'UNKNOWN'),
    scenarios:Object.freeze(scenarios),
    horizons:Object.freeze(horizons),
    executionMode:'SHADOW_ONLY',
    probabilistic:true
  });
}

export function forecastOverlaySummary(overlay){
  if(!overlay) return Object.freeze({available:false,text:'Kein frischer Forecast-Pfad verfügbar.'});
  const base=overlay.scenarios.find(x=>x.id==='BASE_PATH')||overlay.scenarios[0]||null;
  const last=base?.points?.at(-1)||null;
  return Object.freeze({
    available:true,
    text:[
      'Forecast Overlay: '+overlay.status+' · '+overlay.coherence,
      'Dominant path: '+overlay.dominantArchetype,
      last?('Base target '+last.horizonId+' · '+last.targetPrice.toFixed(Math.abs(last.targetPrice)<100?3:2)):'Base path —',
      'Modellpfade + Unsicherheitsband · keine garantierte Kursbahn'
    ].join('\n')
  });
}
