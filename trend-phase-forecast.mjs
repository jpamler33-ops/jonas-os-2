export const TREND_PHASE_FORECAST_VERSION='BIGGJ_TREND_PHASE_FORECAST_V1';

const SCALE_TARGET_MS=Object.freeze({
  XS:5*60_000,
  S:15*60_000,
  M:60*60_000,
  L:3*60*60_000,
  XL:4*60*60_000
});

function finite(v){
  if(v===null||v===undefined||v==='')return null;
  const n=Number(v);
  return Number.isFinite(n)?n:null;
}
function nearestHorizon(overlay,targetMs){
  const rows=(overlay?.horizons||[])
    .filter(x=>finite(x?.horizonMs)>0)
    .sort((a,b)=>Math.abs(Number(a.horizonMs)-targetMs)-Math.abs(Number(b.horizonMs)-targetMs));
  return rows[0]||null;
}
function scenarioEndpoint(s,targetMs){
  const rows=(s?.points||[])
    .filter(x=>finite(x?.horizonMs)>0&&finite(x?.targetPrice)>0)
    .sort((a,b)=>Math.abs(Number(a.horizonMs)-targetMs)-Math.abs(Number(b.horizonMs)-targetMs));
  return rows[0]||null;
}
function alignedMass(overlay,direction,targetMs,anchorPrice){
  let total=0,aligned=0,opposed=0,neutral=0,used=0;
  for(const s of overlay?.scenarios||[]){
    const p=finite(s?.probability);
    const point=scenarioEndpoint(s,targetMs);
    if(p==null||p<0||!point)continue;
    const r=Number(point.targetPrice)/anchorPrice-1;
    total+=p;used++;
    if(Math.abs(r)<.0005)neutral+=p;
    else if((direction==='UP'&&r>0)||(direction==='DOWN'&&r<0))aligned+=p;
    else opposed+=p;
  }
  if(!(total>0))return {available:false,used:0,aligned:null,opposed:null,neutral:null};
  return {
    available:true,used,
    aligned:aligned/total,
    opposed:opposed/total,
    neutral:neutral/total
  };
}
function phaseFor(scale,active,overlay){
  if(!active||!overlay||!(finite(overlay.anchorPrice)>0))return null;
  const targetMs=SCALE_TARGET_MS[scale]||60*60_000;
  const h=nearestHorizon(overlay,targetMs);
  if(!h)return null;
  const anchor=Number(overlay.anchorPrice);
  const median=finite(h.medianPrice),lower=finite(h.lowerPrice),upper=finite(h.upperPrice);
  if(!(median>0))return null;
  const medianReturn=median/anchor-1;
  const lowerReturn=lower!=null&&lower>0?lower/anchor-1:null;
  const upperReturn=upper!=null&&upper>0?upper/anchor-1:null;
  const epsilon=.0005;
  const alignment=Math.abs(medianReturn)<epsilon
    ?'NEUTRAL'
    :((active.direction==='UP'&&medianReturn>0)||(active.direction==='DOWN'&&medianReturn<0))
      ?'ALIGNED':'CONTRADICTED';
  const mass=alignedMass(overlay,active.direction,targetMs,anchor);
  return Object.freeze({
    scale,
    boxId:active.id,
    boxDirection:active.direction,
    boxStatus:active.status,
    boxBars:Number(active.bars||0),
    targetHorizonId:String(h.horizonId||''),
    targetHorizonMs:Number(h.horizonMs),
    gate:String(h.gate||'UNKNOWN'),
    operationalConfidence:finite(h.operationalConfidence),
    medianReturn,
    lowerReturn,
    upperReturn,
    alignment,
    modelAlignedPathMass:mass.aligned,
    modelOpposedPathMass:mass.opposed,
    modelNeutralPathMass:mass.neutral,
    scenarioMassAvailable:mass.available,
    semantics:'MODEL_FORECAST_ALIGNED_TO_ACTIVE_TREND_PHASE_NOT_EMPIRICAL_CONTINUATION_PROBABILITY',
    execution:'SHADOW_ONLY',
    canExecuteLive:false
  });
}

export function buildTrendPhaseForecasts(multiScale,forecastOverlay){
  const byScale={};
  for(const scale of Object.keys(SCALE_TARGET_MS)){
    const active=multiScale?.active?.[scale]||multiScale?.byScale?.[scale]?.active||null;
    const row=phaseFor(scale,active,forecastOverlay);
    if(row)byScale[scale]=row;
  }
  const rows=Object.values(byScale);
  const aligned=rows.filter(x=>x.alignment==='ALIGNED').length;
  const contradicted=rows.filter(x=>x.alignment==='CONTRADICTED').length;
  return Object.freeze({
    version:TREND_PHASE_FORECAST_VERSION,
    available:rows.length>0,
    byScale:Object.freeze(byScale),
    summary:Object.freeze({
      observed:rows.length,
      aligned,
      contradicted,
      neutral:rows.length-aligned-contradicted,
      state:rows.length===0?'NO_FORECAST':contradicted===0&&aligned>0?'ALIGNED':aligned===0&&contradicted>0?'CONTRADICTED':'MIXED'
    }),
    forecastAsOf:finite(forecastOverlay?.asOf),
    probabilistic:true,
    semantics:'FORECAST_CONTEXT_PER_ACTIVE_TREND_SCALE',
    execution:'SHADOW_ONLY',
    canExecuteLive:false
  });
}

export function trendPhaseForecastSummary(result,scale='M'){
  const row=result?.byScale?.[String(scale).toUpperCase()]||null;
  if(!row)return Object.freeze({available:false,scale:String(scale).toUpperCase()});
  return Object.freeze({
    available:true,
    scale:row.scale,
    direction:row.boxDirection,
    status:row.boxStatus,
    horizonId:row.targetHorizonId,
    alignment:row.alignment,
    medianReturn:row.medianReturn,
    lowerReturn:row.lowerReturn,
    upperReturn:row.upperReturn,
    modelAlignedPathMass:row.modelAlignedPathMass,
    modelOpposedPathMass:row.modelOpposedPathMass,
    caveat:'Path mass is model-implied, not empirical trend continuation probability.',
    execution:'SHADOW_ONLY',
    canExecuteLive:false
  });
}
