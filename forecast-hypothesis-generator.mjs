export const FORECAST_HYPOTHESIS_GENERATOR_VERSION='TCX_FORECAST_HYPOTHESIS_GENERATOR_V1';

function clone(v){ return structuredClone(v); }
function finite(v){ const n=Number(v); return Number.isFinite(n)?n:null; }
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
function mean(xs){
  const ys=(Array.isArray(xs)?xs:[]).map(finite).filter(x=>x!=null);
  return ys.length?ys.reduce((a,b)=>a+b,0)/ys.length:0;
}
function median(xs){
  const ys=(Array.isArray(xs)?xs:[]).map(finite).filter(x=>x!=null).sort((a,b)=>a-b);
  if(!ys.length) return 0;
  const m=Math.floor(ys.length/2);
  return ys.length%2?ys[m]:(ys[m-1]+ys[m])/2;
}
function quantile(xs,q){
  const ys=(Array.isArray(xs)?xs:[]).map(finite).filter(x=>x!=null).sort((a,b)=>a-b);
  if(!ys.length) return 0;
  const i=Math.max(0,Math.min(ys.length-1,Math.round((ys.length-1)*q)));
  return ys[i];
}
function semanticShape(config){
  return {
    featureIds:[...(config?.featureIds||[])],
    horizons:[...(config?.horizons||[])].map(h=>({
      id:String(h.id),
      horizonMs:Number(h.horizonMs),
      flatThreshold:Number(h.flatThreshold)
    }))
  };
}
function sameSemanticShape(a,b){
  return JSON.stringify(semanticShape(a))===JSON.stringify(semanticShape(b));
}
function validRows(rows,asOf){
  const t=finite(asOf);
  return (Array.isArray(rows)?rows:[]).filter(r=>
    finite(r?.timestamp)!=null&&
    finite(r?.resolvedAt)!=null&&
    finite(r?.forwardReturn)!=null&&
    Number(r.resolvedAt)<=t
  ).sort((a,b)=>Number(a.resolvedAt)-Number(b.resolvedAt));
}
function summarize(rows,asOf){
  const xs=validRows(rows,asOf);
  const returns=xs.map(r=>Number(r.forwardReturn));
  const abs=returns.map(Math.abs);
  const regimes=new Map();
  for(const r of xs){
    const key=String(r.regimeId||'UNKNOWN');
    regimes.set(key,(regimes.get(key)||0)+1);
  }
  const half=Math.max(1,Math.floor(xs.length/2));
  const older=xs.slice(0,half).map(r=>Math.abs(Number(r.forwardReturn)));
  const recent=xs.slice(-half).map(r=>Math.abs(Number(r.forwardReturn)));
  const recentAbs=mean(recent);
  const olderAbs=mean(older);
  const volatilityRatio=olderAbs>1e-12?recentAbs/olderAbs:1;
  const p50=median(abs);
  const p90=quantile(abs,.90);
  const tailRatio=p50>1e-12?p90/p50:(p90>0?3:1);
  const oldest=xs.length?Number(xs[0].resolvedAt):null;
  const newest=xs.length?Number(xs.at(-1).resolvedAt):null;
  const spanMs=oldest!=null&&newest!=null?Math.max(0,newest-oldest):0;
  return Object.freeze({
    cases:xs.length,
    regimeCount:regimes.size,
    regimeDistribution:Object.freeze(Object.fromEntries([...regimes.entries()].sort())),
    meanAbsReturn:mean(abs),
    recentMeanAbsReturn:recentAbs,
    olderMeanAbsReturn:olderAbs,
    recentVolatilityRatio:volatilityRatio,
    tailRatio,
    spanMs
  });
}
function mutateHorizons(config,fn){
  const out=clone(config);
  out.horizons=out.horizons.map(h=>({...h,...fn(h)}));
  return out;
}
function hypothesis({id,label,description,reason,priority,config,diagnostics}){
  return Object.freeze({
    generatorVersion:FORECAST_HYPOTHESIS_GENERATOR_VERSION,
    source:'TCX_CONTROLLED_HYPOTHESIS_GRAMMAR',
    id,
    label,
    description,
    reason,
    priority:Number(priority),
    diagnostics,
    config:Object.freeze(config)
  });
}

/**
 * Generates bounded model hypotheses from a pre-approved parameter grammar.
 * It cannot alter feature IDs, forecast horizons, target thresholds, execution mode,
 * or any production model. Every output still has to pass temporal OOS competition.
 */
export function generateControlledForecastHypotheses({
  historyRows,
  incumbentConfig,
  asOf=Date.now(),
  maxHypotheses=4
}={}){
  if(!incumbentConfig?.featureIds?.length||!incumbentConfig?.horizons?.length){
    throw new Error('incumbent forecast config required');
  }
  const t=finite(asOf);
  if(t==null) throw new Error('asOf must be finite');
  const d=summarize(historyRows,t);
  if(d.cases<20) return Object.freeze({version:FORECAST_HYPOTHESIS_GENERATOR_VERSION,diagnostics:d,hypotheses:Object.freeze([])});

  const base=clone(incumbentConfig);
  const day=24*60*60_000;
  const halfLife=Math.max(day,Number(base.recencyHalfLifeMs||30*day));
  const ridge=Math.max(.05,Number(base.ridgeLambda||1));
  const proposals=[];

  {
    const cfg=clone(base);
    cfg.recencyHalfLifeMs=clamp(
      d.recentVolatilityRatio>=1.15?halfLife*.55:halfLife*.75,
      5*day,
      30*day
    );
    cfg.maxProbabilityDisagreement=clamp(Number(base.maxProbabilityDisagreement??.18)*.90,.05,.40);
    proposals.push(hypothesis({
      id:'HYP_FAST_ADAPT',
      label:'Fast Adapt',
      description:'Reagiert stärker auf neuere Marktbedingungen, bleibt bei Modellstreit vorsichtiger.',
      reason:d.recentVolatilityRatio>=1.15
        ?'Die jüngere Hälfte der Historie bewegt sich stärker als die ältere.'
        :'Testet, ob kürzere zeitliche Erinnerung die OOS-Kalibrierung verbessert.',
      priority:2+Math.min(3,Math.max(0,d.recentVolatilityRatio-1)*4),
      config:cfg,
      diagnostics:d
    }));
  }

  {
    const cfg=clone(base);
    cfg.ridgeLambda=clamp(ridge*(d.tailRatio>=2.5?2.6:1.8),.05,25);
    cfg.residualInflationFallback=clamp(Number(base.residualInflationFallback??1.25)*(d.tailRatio>=2.5?1.18:1.08),1,3);
    cfg.maxModelDispersion=clamp(Number(base.maxModelDispersion??.012)*.90,.002,.05);
    proposals.push(hypothesis({
      id:'HYP_TAIL_STABILITY',
      label:'Tail Stability',
      description:'Regularisiert stärker und reagiert konservativer auf breite Modellstreuung.',
      reason:d.tailRatio>=2.5
        ?'Die historischen Returns zeigen relativ ausgeprägte Tails.'
        :'Prüft, ob stärkere Regularisierung OOS-Fehler reduziert.',
      priority:1.5+Math.min(4,Math.max(0,d.tailRatio-1.5)),
      config:cfg,
      diagnostics:d
    }));
  }

  {
    const cfg=mutateHorizons(base,h=>({
      analogBandwidth:clamp(Number(h.analogBandwidth||1.5)*.70,.30,4),
      minSimilarity:clamp(Number(h.minSimilarity||.08)*1.45,.02,.65),
      topK:Math.max(35,Math.round(Number(h.topK||180)*.65))
    }));
    cfg.pathTopK=Math.max(35,Math.round(Number(base.pathTopK||120)*.70));
    cfg.pathMinSimilarity=clamp(Number(base.pathMinSimilarity||.08)*1.35,.02,.65);
    cfg.minNearestSimilarity=clamp(Number(base.minNearestSimilarity??.18)*1.12,.05,.70);
    proposals.push(hypothesis({
      id:'HYP_ANALOG_PRECISION',
      label:'Analog Precision',
      description:'Akzeptiert weniger, dafür ähnlichere historische Vergleichsfälle.',
      reason:d.cases>=60
        ?'Die Historie ist groß genug, um selektivere Analogien im OOS-Test zu prüfen.'
        :'Testet selektivere Analogien ohne die Prognoseziele zu verändern.',
      priority:d.cases>=60?3:1,
      config:cfg,
      diagnostics:d
    }));
  }

  {
    const cfg=clone(base);
    cfg.highConfidenceThreshold=clamp(Number(base.highConfidenceThreshold??.65)+.07,.55,.90);
    cfg.maxHighConfidenceWrongRate=clamp(Number(base.maxHighConfidenceWrongRate??.30)*.85,.10,.45);
    cfg.hardHighConfidenceWrongRate=clamp(Number(base.hardHighConfidenceWrongRate??.45)*.90,.15,.60);
    cfg.maxProbabilityDisagreement=clamp(Number(base.maxProbabilityDisagreement??.18)*.82,.05,.35);
    proposals.push(hypothesis({
      id:'HYP_CONFIDENCE_DISCIPLINE',
      label:'Confidence Discipline',
      description:'Verlangt mehr Evidenz, bevor hohe Prognosesicherheit zugelassen wird.',
      reason:'Prüft explizit, ob konservativere Confidence-Gates Brier/Log-Loss im OOS verbessern.',
      priority:2.6,
      config:cfg,
      diagnostics:d
    }));
  }

  if(d.regimeCount>=3){
    const cfg=clone(base);
    cfg.minRegimeCases=Math.max(6,Math.round(Number(base.minRegimeCases||12)*.75));
    cfg.minRegimeConfidence=clamp(Number(base.minRegimeConfidence??.40)+.05,.20,.85);
    proposals.push(hypothesis({
      id:'HYP_REGIME_SPECIALIST',
      label:'Regime Specialist',
      description:'Lässt Regime-spezifische Modelle früher antreten, verlangt aber etwas mehr Regime-Confidence.',
      reason:'Die Trainingshistorie enthält mehrere unterschiedliche Marktregime.',
      priority:2.2+Math.min(2,d.regimeCount/3),
      config:cfg,
      diagnostics:d
    }));
  }

  {
    const cfg=clone(base);
    cfg.intervalTargetCoverage=.84;
    cfg.intervalUndercoverageTolerance=clamp(Number(base.intervalUndercoverageTolerance??.08)*.75,.02,.15);
    cfg.intervalMaxScale=clamp(Number(base.intervalMaxScale??3)*1.15,1.5,4);
    cfg.residualInflationFallback=clamp(Number(base.residualInflationFallback??1.25)*1.10,1,3);
    proposals.push(hypothesis({
      id:'HYP_INTERVAL_DEFENSE',
      label:'Interval Defense',
      description:'Testet defensivere Prognoseintervalle gegen Undercoverage.',
      reason:d.tailRatio>=2
        ?'Breitere Return-Tails rechtfertigen einen OOS-Test konservativerer Intervalle.'
        :'Prüft, ob etwas defensivere Intervalle näher an die Zielabdeckung kommen.',
      priority:1.8+Math.min(2,Math.max(0,d.tailRatio-1)),
      config:cfg,
      diagnostics:d
    }));
  }

  const unique=[];
  const seen=new Set();
  for(const p of proposals.sort((a,b)=>b.priority-a.priority||a.id.localeCompare(b.id))){
    if(!sameSemanticShape(base,p.config)) throw new Error('hypothesis changed locked target semantics');
    const key=JSON.stringify(p.config);
    if(seen.has(key)) continue;
    seen.add(key);
    unique.push(p);
    if(unique.length>=Math.max(1,Math.floor(Number(maxHypotheses)||4))) break;
  }

  return Object.freeze({
    version:FORECAST_HYPOTHESIS_GENERATOR_VERSION,
    diagnostics:d,
    hypotheses:Object.freeze(unique)
  });
}
