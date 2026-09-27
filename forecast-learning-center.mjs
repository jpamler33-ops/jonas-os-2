import { DEFAULT_PROMOTION_POLICY } from './model-promotion-ladder.mjs';

export const FORECAST_LEARNING_CENTER_VERSION='TCX_FORECAST_LEARNING_CENTER_V1';

function finite(v){
  const n=Number(v);
  return Number.isFinite(n)?n:null;
}

function mean(xs){
  const ys=(Array.isArray(xs)?xs:[]).map(finite).filter(x=>x!=null);
  return ys.length?ys.reduce((a,b)=>a+b,0)/ys.length:null;
}

function horizonSort(a,b){
  return Number(a?.horizonMs??0)-Number(b?.horizonMs??0);
}

function independentEpisodeCount(entries){
  const groups=new Map();
  const rows=(Array.isArray(entries)?entries:[])
    .filter(e=>Number.isFinite(Number(e?.asOf))&&Number.isFinite(Number(e?.horizonMs)))
    .sort((a,b)=>Number(a.asOf)-Number(b.asOf));
  for(const e of rows){
    const key=String(e.symbol)+'\u0000'+String(e.horizonId||e.horizonMs);
    const g=groups.get(key)??{last:-Infinity,count:0};
    if(Number(e.asOf)-g.last>=Math.max(1,Number(e.horizonMs))){
      g.count++;
      g.last=Number(e.asOf);
    }
    groups.set(key,g);
  }
  return [...groups.values()].reduce((s,g)=>s+g.count,0);
}

function summarizeHorizon(rows,minDisplaySamples){
  const xs=rows||[];
  const resolved=xs.filter(x=>x.status==='RESOLVED'&&x.resolution);
  const pending=xs.filter(x=>x.status==='PENDING');
  const expired=xs.filter(x=>x.status==='EXPIRED');
  const ready=resolved.length>=minDisplaySamples;
  const accuracy=ready?mean(resolved.map(x=>x.resolution?.topCorrect?1:0)):null;
  const brier=ready?mean(resolved.map(x=>x.resolution?.brier)):null;
  const logLoss=ready?mean(resolved.map(x=>x.resolution?.logLoss)):null;
  const intervalCoverage=ready?mean(resolved.map(x=>x.resolution?.intervalMiss?0:1)):null;
  const absoluteReturnError=ready?mean(resolved.map(x=>x.resolution?.absoluteReturnError)):null;
  return Object.freeze({
    horizonId:String(xs[0]?.horizonId??'UNKNOWN'),
    horizonMs:Number(xs[0]?.horizonMs??0),
    total:xs.length,
    resolved:resolved.length,
    pending:pending.length,
    expired:expired.length,
    independentEpisodes:independentEpisodeCount(resolved),
    metricsReady:ready,
    metrics:Object.freeze({
      directionalAccuracy:accuracy,
      meanBrier:brier,
      meanLogLoss:logLoss,
      intervalCoverage,
      meanAbsoluteReturnError:absoluteReturnError
    })
  });
}

export function buildForecastLearningSummary(runtime,{
  minDisplaySamples=30,
  promotionPolicy=DEFAULT_PROMOTION_POLICY,
  autoLearnEnabled=true,
  autoLearnSymbols=[],
  autoLearnForecastMs=300000,
  now=Date.now()
}={}){
  const journal=runtime?.journal?.all?.()??[];
  const issuances=Array.isArray(runtime?.issuances)?runtime.issuances:[];
  const byHorizon=new Map();
  for(const row of journal){
    const key=String(row?.horizonId??row?.horizonMs??'UNKNOWN');
    const xs=byHorizon.get(key)??[];
    xs.push(row);
    byHorizon.set(key,xs);
  }
  const horizons=[...byHorizon.values()].map(xs=>summarizeHorizon(xs,minDisplaySamples)).sort(horizonSort);
  const resolvedEntries=journal.filter(x=>x.status==='RESOLVED'&&x.resolution);
  const pendingEntries=journal.filter(x=>x.status==='PENDING');
  const expiredEntries=journal.filter(x=>x.status==='EXPIRED');
  const independentEpisodes=independentEpisodeCount(resolvedEntries);
  const minCases=Math.max(1,Math.floor(Number(promotionPolicy?.minCases??200)));
  const minIndependentEpisodes=Math.max(1,Math.floor(Number(promotionPolicy?.minIndependentEpisodes??80)));
  const promotionDataReady=resolvedEntries.length>=minCases&&independentEpisodes>=minIndependentEpisodes;

  let phase='COLD_START';
  if(resolvedEntries.length>0) phase='LEARNING';
  if(horizons.some(h=>h.metricsReady)) phase='MEASURING';
  if(promotionDataReady) phase='CANDIDATE_READY';

  const latestIssuance=issuances.length?issuances.reduce((a,b)=>Number(a.generatedAt||0)>=Number(b.generatedAt||0)?a:b):null;

  return Object.freeze({
    version:FORECAST_LEARNING_CENTER_VERSION,
    generatedAt:Number(now),
    autoLearn:Object.freeze({
      enabled:autoLearnEnabled===true,
      symbols:Object.freeze((Array.isArray(autoLearnSymbols)?autoLearnSymbols:[]).map(String)),
      forecastIntervalMs:Number(autoLearnForecastMs)
    }),
    phase,
    issuedForecasts:issuances.length,
    journalEntries:journal.length,
    resolvedOutcomes:resolvedEntries.length,
    pendingOutcomes:pendingEntries.length,
    expiredOutcomes:expiredEntries.length,
    independentEpisodes,
    latestIssuanceAt:finite(latestIssuance?.generatedAt),
    horizons:Object.freeze(horizons),
    promotion:Object.freeze({
      dataReady:promotionDataReady,
      resolvedCases:resolvedEntries.length,
      requiredCases:minCases,
      independentEpisodes,
      requiredIndependentEpisodes:minIndependentEpisodes,
      productionMutationAllowed:false,
      status:promotionDataReady?'READY_FOR_SHADOW_CANDIDATE_EVALUATION':'WAITING_FOR_MORE_RESOLVED_DATA'
    }),
    safety:Object.freeze({
      executionMode:'SHADOW_ONLY',
      action:'ABSTAIN',
      canExecute:false
    })
  });
}
