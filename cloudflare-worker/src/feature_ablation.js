function finite(x){return Number.isFinite(Number(x));}
function mean(xs){
  const v=(xs||[]).map(Number).filter(Number.isFinite);
  return v.length?v.reduce((a,b)=>a+b,0)/v.length:null;
}
function std(xs){
  const v=(xs||[]).map(Number).filter(Number.isFinite);
  if(v.length<2)return null;
  const m=mean(v);
  return Math.sqrt(v.reduce((s,x)=>s+(x-m)*(x-m),0)/(v.length-1));
}
function corr(xs,ys){
  const pairs=[];
  for(let i=0;i<Math.min(xs.length,ys.length);i++){
    const x=Number(xs[i]),y=Number(ys[i]);
    if(Number.isFinite(x)&&Number.isFinite(y))pairs.push([x,y]);
  }
  if(pairs.length<20)return null;
  const mx=mean(pairs.map(p=>p[0])),my=mean(pairs.map(p=>p[1]));
  let num=0,dx=0,dy=0;
  for(const [x,y] of pairs){
    const a=x-mx,b=y-my; num+=a*b; dx+=a*a; dy+=b*b;
  }
  return dx>0&&dy>0?num/Math.sqrt(dx*dy):null;
}
function sigmoidScore(z){
  const x=Math.max(-6,Math.min(6,Number(z)||0));
  return 1/(1+Math.exp(-x));
}
function brier(pred,obs){
  const xs=[];
  for(let i=0;i<Math.min(pred.length,obs.length);i++){
    const p=Number(pred[i]),y=Number(obs[i]);
    if(Number.isFinite(p)&&(y===0||y===1)) xs.push((p-y)*(p-y));
  }
  return xs.length?mean(xs):null;
}
function accuracy(pred,obs){
  let n=0,ok=0;
  for(let i=0;i<Math.min(pred.length,obs.length);i++){
    const p=Number(pred[i]),y=Number(obs[i]);
    if(!Number.isFinite(p)||(y!==0&&y!==1))continue;
    n++; if((p>=0.5?1:0)===y)ok++;
  }
  return n?ok/n:null;
}

export function featureAblationReport(rows,featureKeys,outcomeKey="ret_fwd_60m"){
  const xs=[...(rows||[])].filter(r=>finite(r.ts)&&finite(r[outcomeKey]))
    .sort((a,b)=>Number(a.ts)-Number(b.ts));
  if(xs.length<100) return {status:"LEARNING",n:xs.length,features:[]};

  const split=Math.floor(xs.length*0.7);
  const train=xs.slice(0,split),holdout=xs.slice(split);
  const stats={};
  for(const key of featureKeys){
    const vals=train.map(r=>Number(r[key])).filter(Number.isFinite);
    if(vals.length<50)continue;
    const m=mean(vals),s=std(vals);
    if(!Number.isFinite(m)||!Number.isFinite(s)||s<=1e-12)continue;
    const paired=train.filter(r=>finite(r[key])&&finite(r[outcomeKey]));
    const weight=corr(
      paired.map(r=>Number(r[key])),
      paired.map(r=>Number(r[outcomeKey]))
    );
    if(weight===null)continue;
    stats[key]={mean:m,std:s,weight};
  }
  const usable=Object.keys(stats);
  if(usable.length<2) return {
    status:"LEARNING",n:xs.length,trainN:train.length,holdoutN:holdout.length,
    features:[]
  };

  const scoreRow=(r,omit=null)=>{
    let s=0,w=0;
    for(const key of usable){
      if(key===omit)continue;
      const st=stats[key],x=Number(r[key]);
      if(!Number.isFinite(x))continue;
      const z=Math.max(-4,Math.min(4,(x-st.mean)/st.std));
      s+=z*st.weight;
      w+=Math.abs(st.weight);
    }
    return w>0?s/Math.sqrt(w):0;
  };

  const obs=holdout.map(r=>Number(r[outcomeKey])>0?1:0);
  const baselineScores=holdout.map(r=>scoreRow(r));
  const baselinePred=baselineScores.map(sigmoidScore);
  const baselineBrier=brier(baselinePred,obs);
  const baselineAccuracy=accuracy(baselinePred,obs);
  const baselineContinuousCorr=corr(
    baselineScores,
    holdout.map(r=>Number(r[outcomeKey]))
  );

  const features=[];
  for(const key of usable){
    const scores=holdout.map(r=>scoreRow(r,key));
    const pred=scores.map(sigmoidScore);
    const ablatedBrier=brier(pred,obs);
    const ablatedAccuracy=accuracy(pred,obs);
    const ablatedCorr=corr(scores,holdout.map(r=>Number(r[outcomeKey])));
    const deltaBrier=Number.isFinite(baselineBrier)&&Number.isFinite(ablatedBrier)
      ? ablatedBrier-baselineBrier:null;
    const deltaAccuracy=Number.isFinite(baselineAccuracy)&&Number.isFinite(ablatedAccuracy)
      ? baselineAccuracy-ablatedAccuracy:null;
    const deltaCorr=Number.isFinite(baselineContinuousCorr)&&Number.isFinite(ablatedCorr)
      ? Math.abs(baselineContinuousCorr)-Math.abs(ablatedCorr):null;

    let verdict="NEUTRAL";
    if((deltaBrier??0)>0.001 || (deltaAccuracy??0)>0.01 || (deltaCorr??0)>0.02) verdict="USEFUL_INCREMENT";
    else if((deltaBrier??0)<-0.001 && (deltaAccuracy??0)<-0.01) verdict="POSSIBLE_NOISE";
    else if(Math.abs(deltaBrier??0)<0.0003 && Math.abs(deltaAccuracy??0)<0.005) verdict="LOW_INCREMENTAL_VALUE";

    features.push({
      feature:key,
      trainWeight:stats[key].weight,
      holdoutN:holdout.length,
      baselineBrier,
      ablatedBrier,
      deltaBrier,
      baselineAccuracy,
      ablatedAccuracy,
      deltaAccuracy,
      baselineAbsOutcomeCorrelation:baselineContinuousCorr===null?null:Math.abs(baselineContinuousCorr),
      ablatedAbsOutcomeCorrelation:ablatedCorr===null?null:Math.abs(ablatedCorr),
      deltaAbsOutcomeCorrelation:deltaCorr,
      verdict
    });
  }

  return {
    status:holdout.length>=100?"ACTIVE":"EARLY",
    n:xs.length,trainN:train.length,holdoutN:holdout.length,
    usableFeatures:usable.length,
    baseline:{
      brier:baselineBrier,
      directionalAccuracy:baselineAccuracy,
      absOutcomeCorrelation:baselineContinuousCorr===null?null:Math.abs(baselineContinuousCorr)
    },
    features:features.sort((a,b)=>(b.deltaBrier??-999)-(a.deltaBrier??-999)),
    interpretation:{
      positiveDeltaBrier:"Removing the feature made holdout Brier worse, so it contributed incremental information in this ensemble.",
      lowIncrementalValue:"Removing the feature barely changed holdout performance; it may be redundant.",
      possibleNoise:"Removing the feature improved multiple holdout metrics; investigate before using it."
    },
    warning:"Ablation measures incremental value inside this simple research ensemble. It does not prove causal value or justify an automatic live-rule change."
  };
}
