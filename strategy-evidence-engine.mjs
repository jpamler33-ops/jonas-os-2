import { sha256 } from './institutional-kernel.mjs';

export const STRATEGY_EVIDENCE_ENGINE_VERSION='TCX_STRATEGY_EVIDENCE_V1';

function finite(v,fallback=null){
  if(v===null||v===undefined||v==='') return fallback;
  const n=Number(v);
  return Number.isFinite(n)?n:fallback;
}
function clamp(v,a=0,b=1){ return Math.max(a,Math.min(b,Number(v))); }
function mean(xs){ return xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:0; }
function median(xs){
  if(!xs.length) return 0;
  const a=[...xs].sort((x,y)=>x-y),m=Math.floor(a.length/2);
  return a.length%2?a[m]:(a[m-1]+a[m])/2;
}
function dayKey(epoch){ return new Date(Number(epoch)).toISOString().slice(0,10); }

export function wilsonLowerBound(successes,trials,{z=1.959963984540054}={}){
  const n=Math.max(0,Math.floor(Number(trials)||0));
  const x=clamp(Math.floor(Number(successes)||0),0,n);
  if(!n) return 0;
  const p=x/n,z2=z*z;
  const center=p+z2/(2*n);
  const spread=z*Math.sqrt((p*(1-p)+z2/(4*n))/n);
  return clamp((center-spread)/(1+z2/n));
}

function segmentMetrics(positions){
  const rows=positions.filter(p=>finite(p?.realizedNetPnlQuote)!=null&&finite(p?.realizedReturnPct)!=null);
  const pnls=rows.map(p=>Number(p.realizedNetPnlQuote));
  const returns=rows.map(p=>Number(p.realizedReturnPct));
  const wins=pnls.filter(x=>x>0).length;
  const grossProfit=pnls.filter(x=>x>0).reduce((a,b)=>a+b,0);
  const grossLoss=Math.abs(pnls.filter(x=>x<0).reduce((a,b)=>a+b,0));
  const profitFactor=grossLoss>0?grossProfit/grossLoss:(grossProfit>0?null:0);
  let lossStreak=0,maxLossStreak=0;
  for(const p of pnls){
    if(p<0){ lossStreak++;maxLossStreak=Math.max(maxLossStreak,lossStreak); }
    else lossStreak=0;
  }
  return {
    trades:rows.length,
    wins,
    losses:pnls.filter(x=>x<0).length,
    winRate:rows.length?wins/rows.length:0,
    winRateWilsonLower95:wilsonLowerBound(wins,rows.length),
    meanReturn:mean(returns),
    medianReturn:median(returns),
    netPnlQuote:pnls.reduce((a,b)=>a+b,0),
    expectancyQuote:mean(pnls),
    profitFactor,
    maxLossStreak
  };
}

function profitFactorScore(pf){
  if(pf==null) return 1;
  return clamp((Number(pf)-.75)/.85);
}

export function evaluateStrategyEvidence(positions,{
  asOf=Date.now(),
  maxDrawdownPct=0,
  strategyTrials=5,
  minIndependentDecisions=40,
  minTradingDays=10,
  minRecentTrades=16,
  maxSymbolConcentration=.55
}={}){
  const closed=(Array.isArray(positions)?positions:[])
    .filter(p=>p?.status==='CLOSED'&&finite(p?.closedAt)!=null)
    .sort((a,b)=>Number(a.closedAt)-Number(b.closedAt));

  const independentDecisions=new Set(
    closed.map(p=>String(p.leagueSampleKey||p.entryOrderId||'')).filter(Boolean)
  ).size;
  const tradingDays=new Set(closed.map(p=>dayKey(p.closedAt))).size;
  const bySymbol=new Map();
  for(const p of closed){
    const symbol=String(p.symbol||'UNKNOWN');
    bySymbol.set(symbol,(bySymbol.get(symbol)||0)+1);
  }
  const maxSymbolTrades=closed.length?Math.max(...bySymbol.values()):0;
  const symbolConcentration=closed.length?maxSymbolTrades/closed.length:0;

  const splitIndex=closed.length<2?closed.length:Math.max(1,Math.floor(closed.length*.60));
  const earlyRows=closed.slice(0,splitIndex);
  const recentRows=closed.slice(splitIndex);
  const all=segmentMetrics(closed);
  const early=segmentMetrics(earlyRows);
  const recent=segmentMetrics(recentRows);

  const recentPf=recent.profitFactor==null?(recent.netPnlQuote>0?3:0):recent.profitFactor;
  const earlyPf=early.profitFactor==null?(early.netPnlQuote>0?3:0):early.profitFactor;
  const performanceDecayRatio=early.meanReturn>0
    ? recent.meanReturn/early.meanReturn
    : recent.meanReturn>0?1:0;

  const sampleScore=clamp(independentDecisions/80);
  const confidenceScore=clamp((recent.winRateWilsonLower95-.30)/.30);
  const expectancyScore=clamp((recent.meanReturn+.0025)/.0125);
  const pfScore=profitFactorScore(recent.profitFactor);
  const drawdownScore=clamp(1-Number(maxDrawdownPct||0)/.12);
  const concentrationScore=clamp((.80-symbolConcentration)/.40);
  const temporalScore=
    recent.meanReturn>0&&early.meanReturn>0
      ? clamp(.65+.35*clamp(performanceDecayRatio/1.25))
      : recent.meanReturn>0?.55:.10;

  const rawEvidenceScore=clamp(
    .20*sampleScore+
    .18*confidenceScore+
    .20*expectancyScore+
    .17*pfScore+
    .10*drawdownScore+
    .08*concentrationScore+
    .07*temporalScore
  );

  // Conservative heuristic for trying multiple strategy variants.
  // This is deliberately NOT presented as a formal p-value or DSR.
  const trials=Math.max(1,Math.floor(Number(strategyTrials)||1));
  const trialPenalty=Math.sqrt(
    Math.max(1,independentDecisions)/
    (Math.max(1,independentDecisions)+4*trials)
  );
  const evidenceScore=clamp(rawEvidenceScore*trialPenalty);

  const gates={
    sample:independentDecisions>=minIndependentDecisions,
    tradingDays:tradingDays>=minTradingDays,
    recentSample:recent.trades>=minRecentTrades,
    concentration:symbolConcentration<=maxSymbolConcentration,
    totalExpectancy:all.meanReturn>0,
    recentExpectancy:recent.meanReturn>0,
    recentProfitFactor:recentPf>=1.05,
    drawdown:Number(maxDrawdownPct||0)<=.10
  };
  const failedGates=Object.entries(gates).filter(([,ok])=>!ok).map(([name])=>name);
  const degradationWatch=
    recent.trades>=Math.max(8,Math.floor(minRecentTrades/2))&&
    early.trades>=12&&
    (
      (early.meanReturn>0&&recent.meanReturn<=0)||
      (earlyPf>=1.10&&recentPf<.90)||
      performanceDecayRatio<-.25
    );
  const riskHold=Number(maxDrawdownPct||0)>.12;
  const allocationEligible=failedGates.length===0&&!degradationWatch&&!riskHold&&evidenceScore>=.45;

  const evidenceGrade=riskHold
    ?'RISK_HOLD'
    :degradationWatch
      ?'DEGRADING'
      :allocationEligible&&evidenceScore>=.62
        ?'ROBUST'
        :allocationEligible
          ?'QUALIFIED'
          :independentDecisions>=20
            ?'DEVELOPING'
            :'INSUFFICIENT';

  const core={
    version:STRATEGY_EVIDENCE_ENGINE_VERSION,
    asOf:Number(asOf),
    closedTrades:closed.length,
    independentDecisions,
    tradingDays,
    symbolConcentration,
    temporalValidation:{
      meaning:'CHRONOLOGICAL_STABILITY_PROXY_NOT_TRUE_OUT_OF_SAMPLE',
      split:'FIRST_60_PERCENT_VS_RECENT_40_PERCENT',
      early,
      recent,
      performanceDecayRatio
    },
    scores:{
      sampleScore,
      confidenceScore,
      expectancyScore,
      profitFactorScore:pfScore,
      drawdownScore,
      concentrationScore,
      temporalScore,
      rawEvidenceScore,
      trialPenalty,
      evidenceScore
    },
    gates,
    failedGates,
    degradationWatch,
    riskHold,
    allocationEligible,
    evidenceGrade,
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecuteLive:false
  };
  return Object.freeze({...core,fingerprint:sha256(core)});
}
