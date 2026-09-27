function finite(x,fallback=null){ const n=Number(x); return Number.isFinite(n)?n:fallback; }
function mean(xs){
  const a=xs.filter(Number.isFinite);
  return a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
}
function variance(xs){
  const a=xs.filter(Number.isFinite);
  if(a.length<2) return null;
  const m=mean(a);
  return a.reduce((s,x)=>s+(x-m)**2,0)/(a.length-1);
}
function stdev(xs){ const v=variance(xs); return v==null?null:Math.sqrt(v); }
function median(xs){
  const a=xs.filter(Number.isFinite).sort((a,b)=>a-b);
  if(!a.length) return null;
  const i=Math.floor(a.length/2);
  return a.length%2?a[i]:(a[i-1]+a[i])/2;
}
function quantile(xs,p){
  const a=xs.filter(Number.isFinite).sort((a,b)=>a-b);
  if(!a.length) return null;
  const i=(a.length-1)*Math.max(0,Math.min(1,p));
  const lo=Math.floor(i),hi=Math.ceil(i);
  return lo===hi?a[lo]:a[lo]+(a[hi]-a[lo])*(i-lo);
}
function clamp(x,a=0,b=1){ return Math.max(a,Math.min(b,x)); }

export const EXECUTION_RESEARCH_LAB_VERSION='ERL_V1';
export const EXECUTION_RESEARCH_CAPABILITIES=Object.freeze({
  execution:'SHADOW_ONLY',
  canExecuteLive:false,
  objective:'EXECUTION_QUALITY_NOT_PNL',
  causalStatus:'NOT_IDENTIFIED'
});

function routeGroupKey(r){
  return String(r?.routeHash||'');
}

export function buildExecutionResearchSamples(records){
  const groups=new Map();
  for(const r of records||[]){
    const key=routeGroupKey(r);
    if(!key) continue;
    if(!groups.has(key)) groups.set(key,[]);
    groups.get(key).push(r);
  }

  const samples=[];
  for(const [routeHash,rows] of groups){
    const first=rows[0]||{};
    const policyAllInBps=finite(first.routeAllInBps);
    const policyFillRatio=finite(first.routeFillRatio);
    const policySlippageBps=finite(first.routeSlippageBps);
    if(policyAllInBps==null || policyFillRatio==null) continue;

    const baselines={};
    for(const r of rows){
      if(r?.eligible!==true) continue;
      baselines[String(r.venue)]={
        fillRatio:finite(r.fillRatio,0),
        allInBps:finite(r.benchmarkAllInBps),
        slippageBps:finite(r.benchmarkSlippageBps),
        latencyMs:finite(r.fetchLatencyMs),
        predictedToxicityBps:finite(r.predictedToxicityBps,0),
        predictedToxicityStatus:String(r.predictedToxicityStatus||'NOT_APPLIED'),
        predictedToxicityEvidenceN:Math.max(0,Number(r.predictedToxicityEvidenceN||0)),
        realizedAdverse5mBps:finite(r.markouts?.['300000']?.adverseSelectionBps)
      };
    }
    const full=Object.entries(baselines)
      .filter(([,x])=>x.fillRatio>=0.999999 && Number.isFinite(x.allInBps))
      .sort((a,b)=>a[1].allInBps-b[1].allInBps);
    const bestSingle=full[0]||null;

    samples.push({
      routeHash,
      capturedAt:Number(first.capturedAt),
      symbol:String(first.symbol||'UNKNOWN'),
      side:String(first.side||'UNKNOWN'),
      notionalQuote:Number(first.notionalQuote||0),
      sizeBucket:String(first.sizeBucket||'UNKNOWN'),
      regime:String(first.regime||'UNKNOWN'),
      liquidity:String(first.liquidity||'UNKNOWN'),
      pressureBand:String(first.pressureBand||'UNKNOWN'),
      policy:{
        allInBps:policyAllInBps,
        fillRatio:policyFillRatio,
        slippageBps:policySlippageBps,
        venueCount:Number(first.routeVenueCount||0),
        memoryActive:first.routeMemoryActive===true
      },
      bestSingle:bestSingle?{
        venue:bestSingle[0],
        ...bestSingle[1]
      }:null,
      edgeVsBestSingleBps:bestSingle?bestSingle[1].allInBps-policyAllInBps:null,
      baselines
    });
  }
  return samples.sort((a,b)=>a.capturedAt-b.capturedAt||a.routeHash.localeCompare(b.routeHash));
}

function ci95(xs){
  const a=xs.filter(Number.isFinite);
  const m=mean(a);
  if(a.length<2||m==null) return {n:a.length,mean:m,lo:null,hi:null,se:null};
  const sd=stdev(a);
  const se=sd/Math.sqrt(a.length);
  return {n:a.length,mean:m,se,lo:m-1.96*se,hi:m+1.96*se};
}

function policyStats(samples){
  const edges=samples.map(x=>x.edgeVsBestSingleBps).filter(Number.isFinite);
  const policyCost=samples.map(x=>x.policy.allInBps).filter(Number.isFinite);
  const fills=samples.map(x=>x.policy.fillRatio).filter(Number.isFinite);
  return {
    n:samples.length,
    comparableN:edges.length,
    edgeVsBestSingle:ci95(edges),
    policyAllInBps:ci95(policyCost),
    policyFillRatio:{
      mean:mean(fills),
      median:median(fills),
      p10:quantile(fills,0.10)
    },
    positiveEdgeRate:edges.length?edges.filter(x=>x>0).length/edges.length:null
  };
}

export function temporalOosEvaluation(samples,{
  trainFraction=0.7,
  minTrain=20,
  minTest=10,
  purgeMs=0
}={}){
  const xs=[...(samples||[])].sort((a,b)=>a.capturedAt-b.capturedAt);
  if(xs.length<minTrain+minTest){
    return {
      status:'INSUFFICIENT_OOS_SAMPLES',
      total:xs.length,
      required:minTrain+minTest,
      train:null,
      test:null
    };
  }
  let cut=Math.floor(xs.length*Math.max(0.5,Math.min(0.9,trainFraction)));
  cut=Math.max(minTrain,Math.min(xs.length-minTest,cut));
  const cutoff=xs[cut]?.capturedAt??0;
  const train=xs.slice(0,cut).filter(x=>cutoff-x.capturedAt>purgeMs);
  const test=xs.slice(cut).filter(x=>x.capturedAt-cutoff>=purgeMs);
  if(train.length<minTrain||test.length<minTest){
    return {
      status:'INSUFFICIENT_AFTER_PURGE',
      total:xs.length,
      trainN:train.length,
      testN:test.length,
      cutoff
    };
  }
  const trainStats=policyStats(train);
  const testStats=policyStats(test);
  const testEdge=testStats.edgeVsBestSingle.mean;
  return {
    status:'OOS_AVAILABLE',
    cutoff,
    train:trainStats,
    test:testStats,
    generalizationGapBps:
      Number.isFinite(trainStats.edgeVsBestSingle.mean)&&Number.isFinite(testEdge)
        ? testEdge-trainStats.edgeVsBestSingle.mean
        : null,
    oosPolicyEdgeStatus:
      !Number.isFinite(testEdge)?'NO_COMPARABLE_BASELINE':
      testEdge>0?'POSITIVE_EXECUTION_EDGE':
      testEdge<0?'NEGATIVE_EXECUTION_EDGE':'FLAT'
  };
}

export function walkForwardExecutionEvaluation(samples,{
  minTrain=30,
  testWindow=10,
  step=10,
  purgeMs=0,
  minTest=5
}={}){
  const xs=[...(samples||[])].sort((a,b)=>a.capturedAt-b.capturedAt);
  const folds=[];
  for(let start=minTrain;start<xs.length;start+=Math.max(1,step)){
    const cutoff=xs[start]?.capturedAt;
    if(!Number.isFinite(cutoff)) break;
    const train=xs.slice(0,start).filter(x=>cutoff-x.capturedAt>purgeMs);
    const rawTest=xs.slice(start,Math.min(xs.length,start+testWindow));
    const test=rawTest.filter(x=>x.capturedAt-cutoff>=purgeMs);
    if(train.length<minTrain||test.length<minTest) continue;
    const stats=policyStats(test);
    folds.push({
      fold:folds.length+1,
      cutoff,
      trainN:train.length,
      testN:test.length,
      edgeMeanBps:stats.edgeVsBestSingle.mean,
      edgeCi95:stats.edgeVsBestSingle,
      positiveEdgeRate:stats.positiveEdgeRate,
      fillRatioMean:stats.policyFillRatio.mean,
      allInBpsMean:stats.policyAllInBps.mean
    });
  }
  const edges=folds.map(x=>x.edgeMeanBps).filter(Number.isFinite);
  return {
    status:folds.length>=2?'WALK_FORWARD_AVAILABLE':'INSUFFICIENT_WALK_FORWARD_FOLDS',
    folds:folds.length,
    foldEdge:ci95(edges),
    positiveFoldRate:edges.length?edges.filter(x=>x>0).length/edges.length:null,
    worstFoldEdgeBps:edges.length?Math.min(...edges):null,
    bestFoldEdgeBps:edges.length?Math.max(...edges):null,
    details:folds
  };
}

export function segmentExecutionBreakdown(samples,{minN=5}={}){
  const specs=[
    ['REGIME',x=>x.regime],
    ['SIZE',x=>x.sizeBucket],
    ['SIDE',x=>x.side],
    ['MEMORY',x=>x.policy.memoryActive?'MEMORY_ACTIVE':'MEMORY_INACTIVE']
  ];
  const out={};
  for(const [name,keyFn] of specs){
    const groups=new Map();
    for(const s of samples||[]){
      const key=String(keyFn(s)||'UNKNOWN');
      if(!groups.has(key)) groups.set(key,[]);
      groups.get(key).push(s);
    }
    out[name]=[...groups.entries()]
      .filter(([,rows])=>rows.length>=minN)
      .map(([segment,rows])=>{
        const stats=policyStats(rows);
        return {
          segment,
          n:rows.length,
          comparableN:stats.comparableN,
          edgeMeanBps:stats.edgeVsBestSingle.mean,
          edgeLoBps:stats.edgeVsBestSingle.lo,
          edgeHiBps:stats.edgeVsBestSingle.hi,
          allInBpsMean:stats.policyAllInBps.mean,
          fillRatioMean:stats.policyFillRatio.mean,
          positiveEdgeRate:stats.positiveEdgeRate
        };
      })
      .sort((a,b)=>b.n-a.n||a.segment.localeCompare(b.segment));
  }
  return out;
}

function correlation(xs,ys){
  const pairs=xs.map((x,i)=>[x,ys[i]]).filter(([x,y])=>Number.isFinite(x)&&Number.isFinite(y));
  if(pairs.length<3) return null;
  const ax=pairs.map(x=>x[0]),ay=pairs.map(x=>x[1]);
  const mx=mean(ax),my=mean(ay);
  let num=0,dx=0,dy=0;
  for(const [x,y] of pairs){
    num+=(x-mx)*(y-my);
    dx+=(x-mx)**2;
    dy+=(y-my)**2;
  }
  return dx>0&&dy>0?num/Math.sqrt(dx*dy):null;
}

export function toxicityCalibration(records,{minN=20}={}){
  const rows=(records||[]).filter(r=>
    r?.eligible===true &&
    Number.isFinite(Number(r.predictedToxicityBps)) &&
    Number.isFinite(Number(r.markouts?.['300000']?.adverseSelectionBps))
  );
  const predicted=rows.map(r=>Number(r.predictedToxicityBps));
  const realized=rows.map(r=>Math.max(0,Number(r.markouts['300000'].adverseSelectionBps)));
  const errors=rows.map((r,i)=>predicted[i]-realized[i]);
  const abs=errors.map(Math.abs);
  const buckets=[
    {name:'ZERO',lo:-Infinity,hi:0},
    {name:'LOW',lo:0,hi:1},
    {name:'MEDIUM',lo:1,hi:5},
    {name:'HIGH',lo:5,hi:Infinity}
  ].map(b=>{
    const idx=predicted.map((v,i)=>({v,i})).filter(x=>x.v>b.lo&&x.v<=b.hi).map(x=>x.i);
    return {
      bucket:b.name,
      n:idx.length,
      predictedMean:mean(idx.map(i=>predicted[i])),
      realizedMean:mean(idx.map(i=>realized[i]))
    };
  });
  return {
    status:rows.length>=minN?'CALIBRATION_AVAILABLE':'INSUFFICIENT_CALIBRATION_SAMPLES',
    n:rows.length,
    minN,
    biasBps:mean(errors),
    maeBps:mean(abs),
    rmseBps:rows.length?Math.sqrt(mean(errors.map(x=>x*x))):null,
    correlation:correlation(predicted,realized),
    buckets
  };
}

function windowMetric(rows,fn){
  return mean(rows.map(fn).filter(Number.isFinite));
}

export function executionDrift(samples,{
  recentN=30,
  referenceN=60,
  minRecent=10,
  minReference=20,
  thresholds={
    allInBps:2,
    edgeBps:2,
    fillRatio:0.05
  }
}={}){
  const xs=[...(samples||[])].sort((a,b)=>a.capturedAt-b.capturedAt);
  const recent=xs.slice(-recentN);
  const reference=xs.slice(Math.max(0,xs.length-recentN-referenceN),Math.max(0,xs.length-recentN));
  if(recent.length<minRecent||reference.length<minReference){
    return {status:'INSUFFICIENT_DRIFT_SAMPLES',recentN:recent.length,referenceN:reference.length,signals:[]};
  }

  const metrics={
    allInBps:{
      recent:windowMetric(recent,x=>x.policy.allInBps),
      reference:windowMetric(reference,x=>x.policy.allInBps),
      threshold:thresholds.allInBps,
      worse:(a,b)=>a-b
    },
    edgeBps:{
      recent:windowMetric(recent,x=>x.edgeVsBestSingleBps),
      reference:windowMetric(reference,x=>x.edgeVsBestSingleBps),
      threshold:thresholds.edgeBps,
      worse:(a,b)=>b-a
    },
    fillRatio:{
      recent:windowMetric(recent,x=>x.policy.fillRatio),
      reference:windowMetric(reference,x=>x.policy.fillRatio),
      threshold:thresholds.fillRatio,
      worse:(a,b)=>b-a
    }
  };

  const signals=[];
  for(const [name,m] of Object.entries(metrics)){
    if(!Number.isFinite(m.recent)||!Number.isFinite(m.reference)) continue;
    const deterioration=m.worse(m.recent,m.reference);
    if(deterioration>m.threshold){
      signals.push({metric:name,deterioration,recent:m.recent,reference:m.reference,threshold:m.threshold});
    }
  }
  return {
    status:signals.length>=2?'DRIFT':signals.length===1?'WATCH':'STABLE',
    recentN:recent.length,
    referenceN:reference.length,
    signals,
    metrics:Object.fromEntries(Object.entries(metrics).map(([k,v])=>[k,{recent:v.recent,reference:v.reference}]))
  };
}

export function executionResearchReport(records,{
  symbol=null,
  side=null,
  regime=null,
  now=Date.now()
}={}){
  let rows=records||[];
  if(symbol) rows=rows.filter(r=>r.symbol===symbol);
  if(side) rows=rows.filter(r=>r.side===String(side).toUpperCase());
  if(regime) rows=rows.filter(r=>r.regime===regime);

  const samples=buildExecutionResearchSamples(rows);
  const inSample=policyStats(samples);
  const oos=temporalOosEvaluation(samples);
  const walkForward=walkForwardExecutionEvaluation(samples);
  const calibration=toxicityCalibration(rows);
  const drift=executionDrift(samples);
  const segments=segmentExecutionBreakdown(samples);

  return {
    version:EXECUTION_RESEARCH_LAB_VERSION,
    generatedAt:Number(now),
    filters:{symbol,side,regime},
    sampleRoutes:samples.length,
    venueObservations:rows.length,
    inSample,
    oos,
    walkForward,
    calibration,
    drift,
    segments,
    epistemic:{
      objective:'EXECUTION_QUALITY_NOT_PNL',
      routeOutcomes:'COUNTERFACTUAL_SHADOW_SIMULATION',
      markouts:'OBSERVED_ONLY_WITHIN_CAPTURE_WINDOW',
      inference:'DESCRIPTIVE_OOS_EVALUATION_NOT_CAUSAL',
      action:'ABSTAIN',
      execution:'SHADOW_ONLY'
    }
  };
}
