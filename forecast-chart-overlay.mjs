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


export function forecastHorizonForChartInterval(interval){
  const tf=String(interval||'5m').toLowerCase();
  return tf==='1m'?'5m':tf==='5m'?'15m':tf==='15m'?'1h':'3h';
}

export function forecastIssuancesToChartMoments(issuances,{
  symbol=null,
  startAt=Number.NEGATIVE_INFINITY,
  endAt=Number.POSITIVE_INFINITY,
  horizonId=null,
  limit=24
}={}){
  const wantedSymbol=symbol==null?null:String(symbol).toUpperCase();
  const rows=(Array.isArray(issuances)?issuances:[])
    .filter(x=>!wantedSymbol||String(x?.symbol||'').toUpperCase()===wantedSymbol)
    .map(x=>({issuance:x,asOf:finite(x?.forecast?.asOf??x?.asOf)}))
    .filter(x=>x.asOf!=null&&x.asOf>=Number(startAt)&&x.asOf<=Number(endAt))
    .sort((a,b)=>a.asOf-b.asOf);
  const chosen=[];
  let lastBucket=null;
  const span=Math.max(1,Number(endAt)-Number(startAt));
  const bucketMs=Math.max(1,span/Math.max(1,Number(limit)||24));
  for(const row of rows){
    const forecast=row.issuance?.forecast||{};
    const anchorPrice=finite(forecast?.price??row.issuance?.input?.price);
    if(!(anchorPrice>0))continue;
    const candidates=(Array.isArray(forecast?.horizons)?forecast.horizons:[])
      .filter(h=>finite(h?.horizonMs)>0&&finite(h?.interval?.median)!=null);
    if(!candidates.length)continue;
    let h=horizonId?candidates.find(x=>String(x?.horizonId||'')===String(horizonId)):null;
    if(!h)h=candidates[0];
    const medianReturn=finite(h?.interval?.median),horizonMs=finite(h?.horizonMs);
    if(medianReturn==null||!(horizonMs>0))continue;
    const bucket=Math.floor((row.asOf-Number(startAt))/bucketMs);
    if(bucket===lastBucket&&chosen.length){
      chosen[chosen.length-1]={
        asOf:row.asOf,
        anchorPrice,
        horizonId:String(h?.horizonId||''),
        horizonMs,
        targetAt:row.asOf+horizonMs,
        medianReturn,
        medianPrice:anchorPrice*(1+medianReturn),
        gate:String(h?.gate||'UNKNOWN'),
        operationalConfidence:finite(h?.operationalConfidence),
        probabilistic:true
      };
    }else{
      chosen.push({
        asOf:row.asOf,
        anchorPrice,
        horizonId:String(h?.horizonId||''),
        horizonMs,
        targetAt:row.asOf+horizonMs,
        medianReturn,
        medianPrice:anchorPrice*(1+medianReturn),
        gate:String(h?.gate||'UNKNOWN'),
        operationalConfidence:finite(h?.operationalConfidence),
        probabilistic:true
      });
      lastBucket=bucket;
    }
  }
  return Object.freeze(chosen.slice(-Math.max(1,Number(limit)||24)).map(Object.freeze));
}
