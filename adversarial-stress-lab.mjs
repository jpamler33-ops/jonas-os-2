import { sha256 } from './institutional-kernel.mjs';

export const ADVERSARIAL_STRESS_LAB_VERSION='TCX_ADVERSARIAL_STRESS_LAB_V1';

function finite(v,fallback=null){
  if(v===null||v===undefined||v==='') return fallback;
  const n=Number(v); return Number.isFinite(n)?n:fallback;
}
function clamp(v,a=0,b=1){ return Math.max(a,Math.min(b,Number(v))); }
function mean(xs){ return xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:0; }
function freeze(v){
  if(v&&typeof v==='object'&&!Object.isFrozen(v)){
    Object.freeze(v); for(const x of Object.values(v)) freeze(x);
  }
  return v;
}
function rowsForRule(ledger,ruleId){
  return (ledger?.positions||[]).filter(p=>
    p&&p.execution==='SHADOW_ONLY'&&p.canExecuteLive===false&&p.status==='CLOSED'&&
    String(p.entryMode||'').toUpperCase()==='CHALLENGER'&&
    String(p.challengerRuleId||'')===String(ruleId)&&
    finite(p.realizedNetPnlQuote)!=null&&finite(p.realizedReturnPct)!=null
  ).sort((a,b)=>Number(a.closedAt||0)-Number(b.closedAt||0));
}
function metricRows(rows,{extraCostBps=0}={}){
  const adjusted=rows.map(p=>{
    const basis=Math.max(1e-9,finite(p.entryQuote,100));
    const extra=basis*Math.max(0,Number(extraCostBps)||0)/10000;
    const pnl=Number(p.realizedNetPnlQuote||0)-extra;
    const ret=Number(p.realizedReturnPct||0)-Math.max(0,Number(extraCostBps)||0)/10000;
    return {pnl,ret,basis};
  });
  const pnls=adjusted.map(x=>x.pnl),rets=adjusted.map(x=>x.ret);
  const wins=pnls.filter(x=>x>0).length;
  const gp=pnls.filter(x=>x>0).reduce((a,b)=>a+b,0);
  const gl=Math.abs(pnls.filter(x=>x<0).reduce((a,b)=>a+b,0));
  let equity=0,peak=0,maxDd=0;
  for(const x of rets){
    equity+=x; peak=Math.max(peak,equity); maxDd=Math.max(maxDd,peak-equity);
  }
  return {
    trades:rows.length,
    wins,
    winRate:rows.length?wins/rows.length:0,
    netPnlQuote:pnls.reduce((a,b)=>a+b,0),
    expectancyQuote:mean(pnls),
    meanReturn:mean(rets),
    profitFactor:gl>0?gp/gl:(gp>0?null:0),
    cumulativeReturn:rets.reduce((a,b)=>a+b,0),
    maxCumulativeReturnDrawdown:maxDd
  };
}
function dropTopWinners(rows,fraction=.10){
  if(!rows.length) return [];
  const count=Math.max(1,Math.floor(rows.length*Math.max(0,Math.min(.5,Number(fraction)||.1))));
  const sorted=[...rows].sort((a,b)=>Number(b.realizedNetPnlQuote||0)-Number(a.realizedNetPnlQuote||0));
  const drop=new Set(sorted.slice(0,count).map(x=>String(x.positionId||x.entryOrderId)));
  return rows.filter(x=>!drop.has(String(x.positionId||x.entryOrderId)));
}
function dominantValue(rows,key){
  const map=new Map();
  for(const p of rows){
    const v=String(p?.[key]||'UNKNOWN');
    map.set(v,(map.get(v)||0)+1);
  }
  return [...map.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0]||null;
}
function folds(rows,n=3){
  if(!rows.length) return [];
  const k=Math.max(2,Math.min(5,Math.floor(Number(n)||3)));
  const out=[];
  for(let i=0;i<k;i++){
    const start=Math.floor(i*rows.length/k);
    const end=Math.floor((i+1)*rows.length/k);
    const part=rows.slice(start,end);
    if(part.length) out.push(part);
  }
  return out;
}
function passMetric(m){
  return m.trades>0&&m.expectancyQuote>0&&m.meanReturn>0;
}

export function evaluateAdversarialRuleStress(ledger,ruleId,{
  minTrades=18,
  matureTrades=40,
  extraCostBps=20,
  severeCostBps=50,
  winnerDropFraction=.10,
  foldCount=3
}={}){
  const rows=rowsForRule(ledger,ruleId);
  const baseline=metricRows(rows);
  const regularCost=metricRows(rows,{extraCostBps});
  const severeCost=metricRows(rows,{extraCostBps:severeCostBps});
  const winnerMissRows=dropTopWinners(rows,winnerDropFraction);
  const winnerMiss=metricRows(winnerMissRows);
  const recentRows=rows.slice(Math.floor(rows.length/2));
  const recent=metricRows(recentRows);
  const dominantSymbol=dominantValue(rows,'symbol');
  const withoutDominantSymbol=metricRows(rows.filter(x=>String(x.symbol)!==dominantSymbol));
  const dominantRegime=dominantValue(rows,'entryRegimeKey');
  const distinctRegimes=new Set(rows.map(x=>String(x.entryRegimeKey||''))).size;
  const withoutDominantRegime=distinctRegimes>1
    ?metricRows(rows.filter(x=>String(x.entryRegimeKey)!==dominantRegime))
    :null;
  const foldMetrics=folds(rows,foldCount).map((x,i)=>({fold:i+1,...metricRows(x)}));

  const checks={
    baselinePositive:passMetric(baseline),
    regularCostPositive:passMetric(regularCost),
    severeCostPositive:passMetric(severeCost),
    winnerMissPositive:winnerMiss.trades>=Math.max(4,Math.floor(rows.length*.6))&&passMetric(winnerMiss),
    recentPositive:recent.trades>=Math.max(4,Math.floor(minTrades/3))&&passMetric(recent),
    foldConsistency:foldMetrics.length>=2&&foldMetrics.every(x=>x.trades>=3&&passMetric(x)),
    symbolIndependence:withoutDominantSymbol.trades<4||passMetric(withoutDominantSymbol),
    regimeIndependence:!withoutDominantRegime||withoutDominantRegime.trades<4||passMetric(withoutDominantRegime)
  };
  const critical=['severeCostPositive','winnerMissPositive','recentPositive','foldConsistency'];
  const criticalFails=critical.filter(k=>checks[k]===false);
  const allFails=Object.entries(checks).filter(([,ok])=>ok===false).map(([k])=>k);

  let status='COLLECTING',multiplier=1;
  if(rows.length>=minTrades){
    if(criticalFails.length>=2){
      status='FRAGILE';multiplier=0;
    }else if(criticalFails.length===1||allFails.length>=2){
      status='WATCH';multiplier=.5;
    }else if(rows.length>=matureTrades){
      status='STRESS_MATURE';multiplier=1;
    }else{
      status='RESILIENT';multiplier=.85;
    }
  }

  const robustnessScore=rows.length<minTrades
    ?clamp(rows.length/minTrades)*.45
    :clamp(
      .18*(checks.regularCostPositive?1:0)+
      .18*(checks.severeCostPositive?1:0)+
      .18*(checks.winnerMissPositive?1:0)+
      .18*(checks.recentPositive?1:0)+
      .14*(checks.foldConsistency?1:0)+
      .07*(checks.symbolIndependence?1:0)+
      .07*(checks.regimeIndependence?1:0)
    );

  const core={
    version:ADVERSARIAL_STRESS_LAB_VERSION,
    ruleId:String(ruleId||''),
    samples:rows.length,
    status,
    multiplier,
    robustnessScore,
    checks,
    failedChecks:allFails,
    criticalFails,
    scenarios:{
      baseline,
      extraCost:{bps:Number(extraCostBps),metrics:regularCost},
      severeCost:{bps:Number(severeCostBps),metrics:severeCost},
      winnerMiss:{fraction:Number(winnerDropFraction),metrics:winnerMiss},
      recentHalf:recent,
      withoutDominantSymbol:{symbol:dominantSymbol,metrics:withoutDominantSymbol},
      withoutDominantRegime:withoutDominantRegime?{regime:dominantRegime,metrics:withoutDominantRegime}:null,
      chronologicalFolds:foldMetrics
    },
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecuteLive:false,
    meaning:'DETERMINISTIC_ADVERSARIAL_SHADOW_STRESS_PROXY_NOT_REAL_EXECUTION_PROOF'
  };
  return freeze({...core,fingerprint:sha256(core)});
}

export function buildAdversarialStressLab(ledger,challengerLab,{
  minTrades=18,
  matureTrades=40
}={}){
  const rules=(challengerLab?.candidateRules||[]).map(rule=>
    evaluateAdversarialRuleStress(ledger,rule.ruleId,{minTrades,matureTrades})
  );
  const core={
    version:ADVERSARIAL_STRESS_LAB_VERSION,
    rules,
    counts:{
      collecting:rules.filter(x=>x.status==='COLLECTING').length,
      resilient:rules.filter(x=>x.status==='RESILIENT').length,
      stressMature:rules.filter(x=>x.status==='STRESS_MATURE').length,
      watch:rules.filter(x=>x.status==='WATCH').length,
      fragile:rules.filter(x=>x.status==='FRAGILE').length
    },
    execution:'SHADOW_ONLY',action:'ABSTAIN',canExecuteLive:false
  };
  return freeze({...core,fingerprint:sha256(core)});
}

export function stressDecisionForRule(lab,ruleId){
  const x=(lab?.rules||[]).find(r=>r.ruleId===String(ruleId))||null;
  if(!x) return freeze({
    version:ADVERSARIAL_STRESS_LAB_VERSION,status:'COLLECTING',multiplier:1,
    samples:0,robustnessScore:0,reason:'NO_FORWARD_STRESS_SAMPLE',
    execution:'SHADOW_ONLY',canExecuteLive:false
  });
  return freeze({
    version:ADVERSARIAL_STRESS_LAB_VERSION,
    status:x.status,multiplier:x.multiplier,samples:x.samples,
    robustnessScore:x.robustnessScore,failedChecks:x.failedChecks,
    reason:'ADVERSARIAL_STRESS_RESULT',
    execution:'SHADOW_ONLY',canExecuteLive:false
  });
}

export function adversarialStressSummary(lab){
  const sorted=[...(lab?.rules||[])].sort((a,b)=>b.robustnessScore-a.robustnessScore||b.samples-a.samples);
  return freeze({
    version:ADVERSARIAL_STRESS_LAB_VERSION,
    ruleCount:sorted.length,
    counts:lab?.counts||{},
    strongest:sorted[0]||null,
    weakest:sorted.length?[...sorted].sort((a,b)=>a.robustnessScore-b.robustnessScore)[0]:null,
    execution:'SHADOW_ONLY',canExecuteLive:false
  });
}
