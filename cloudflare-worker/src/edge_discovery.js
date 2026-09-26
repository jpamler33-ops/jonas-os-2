function finite(x){ return Number.isFinite(Number(x)); }
function log2(x){ return Math.log(x)/Math.LN2; }
function mean(xs){
  const v=(xs||[]).map(Number).filter(Number.isFinite);
  return v.length?v.reduce((a,b)=>a+b,0)/v.length:null;
}
function median(xs){
  const v=(xs||[]).map(Number).filter(Number.isFinite).sort((a,b)=>a-b);
  if(!v.length) return null;
  const i=Math.floor(v.length/2);
  return v.length%2?v[i]:(v[i-1]+v[i])/2;
}
function pearson(xs,ys){
  const pairs=[];
  for(let i=0;i<Math.min(xs.length,ys.length);i++){
    const x=Number(xs[i]),y=Number(ys[i]);
    if(Number.isFinite(x)&&Number.isFinite(y)) pairs.push([x,y]);
  }
  if(pairs.length<20) return null;
  const mx=mean(pairs.map(x=>x[0])),my=mean(pairs.map(x=>x[1]));
  let num=0,dx=0,dy=0;
  for(const [x,y] of pairs){
    const a=x-mx,b=y-my; num+=a*b; dx+=a*a; dy+=b*b;
  }
  return dx>0&&dy>0?num/Math.sqrt(dx*dy):null;
}
function outcomeBit(row,outcomeKey){
  const y=Number(row?.[outcomeKey]);
  if(!Number.isFinite(y)) return null;
  return y>0?1:0;
}
function mutualInformation(assignments){
  const valid=(assignments||[]).filter(x=>Number.isInteger(x?.bin)&&(x?.y===0||x?.y===1));
  if(valid.length<20) return null;
  const byBin=new Map(),yCount=[0,0];
  for(const x of valid){
    if(!byBin.has(x.bin)) byBin.set(x.bin,[0,0]);
    byBin.get(x.bin)[x.y]++; yCount[x.y]++;
  }
  let mi=0;
  for(const [,counts] of byBin){
    const binN=counts[0]+counts[1];
    for(let y=0;y<=1;y++){
      const n=counts[y];
      if(!n) continue;
      const pxy=n/valid.length;
      const px=binN/valid.length;
      const py=yCount[y]/valid.length;
      mi+=pxy*log2(pxy/(px*py));
    }
  }
  return mi;
}
function binaryStats(rows,key,threshold,outcomeKey){
  const assignments=[];
  const low=[],high=[];
  for(const r of rows){
    const x=Number(r?.[key]),y=Number(r?.[outcomeKey]);
    if(!Number.isFinite(x)||!Number.isFinite(y)) continue;
    const bin=x>threshold?1:0;
    assignments.push({bin,y:y>0?1:0});
    (bin?high:low).push(y);
  }
  if(low.length<8||high.length<8) return null;
  const lowMean=mean(low),highMean=mean(high);
  return {
    n:low.length+high.length,
    lowN:low.length,highN:high.length,
    lowMean,highMean,
    uplift:(highMean??0)-(lowMean??0),
    miBits:mutualInformation(assignments),
    positiveRateLow:low.filter(x=>x>0).length/low.length,
    positiveRateHigh:high.filter(x=>x>0).length/high.length
  };
}
function interactionStats(rows,a,b,ta,tb,outcomeKey){
  const bins=[[],[],[],[]],assignments=[];
  for(const r of rows){
    const x=Number(r?.[a]),z=Number(r?.[b]),y=Number(r?.[outcomeKey]);
    if(![x,z,y].every(Number.isFinite)) continue;
    const bin=(x>ta?1:0)+(z>tb?2:0);
    bins[bin].push(y); assignments.push({bin,y:y>0?1:0});
  }
  const occupied=bins.filter(x=>x.length>=8).length;
  const n=bins.reduce((s,x)=>s+x.length,0);
  if(n<40||occupied<3) return null;
  const means=bins.map(x=>x.length?mean(x):null);
  const finiteMeans=means.filter(Number.isFinite);
  const spread=finiteMeans.length?Math.max(...finiteMeans)-Math.min(...finiteMeans):null;
  return {
    n,occupiedBins:occupied,means,counts:bins.map(x=>x.length),
    spread,miBits:mutualInformation(assignments)
  };
}
function chronologicalSplit(rows,fraction=.7){
  const xs=[...(rows||[])].filter(r=>finite(r.ts)).sort((a,b)=>Number(a.ts)-Number(b.ts));
  const i=Math.max(1,Math.min(xs.length-1,Math.floor(xs.length*fraction)));
  return {train:xs.slice(0,i),holdout:xs.slice(i)};
}

export function discoverInformationEdges(rows, featureKeys, outcomeKey="ret_fwd_60m"){
  const {train,holdout}=chronologicalSplit(rows,.7);
  if(train.length<60||holdout.length<25) {
    return {
      status:"LEARNING",n:rows?.length||0,trainN:train.length,holdoutN:holdout.length,
      features:[],interactions:[],redundancy:[],governor:[]
    };
  }

  const singles=[];
  const thresholds={};
  for(const key of featureKeys){
    const vals=train.map(r=>Number(r?.[key])).filter(Number.isFinite);
    if(vals.length<40) continue;
    const threshold=median(vals);
    thresholds[key]=threshold;
    const tr=binaryStats(train,key,threshold,outcomeKey);
    const ho=binaryStats(holdout,key,threshold,outcomeKey);
    if(!tr||!ho) continue;
    const sameDirection=Math.sign(tr.uplift)===Math.sign(ho.uplift);
    const retention=Math.abs(tr.uplift)>1e-12?Math.abs(ho.uplift)/Math.abs(tr.uplift):null;
    const stability=retention===null?0:Math.min(1,retention)*(sameDirection?1:0);
    const score=(ho.miBits??0)*Math.sqrt(Math.min(1000,ho.n)/1000)*stability;
    singles.push({
      feature:key,threshold,train:tr,holdout:ho,
      sameDirection,effectRetention:retention,
      discoveryScore:score,
      verdict:ho.n>=50 && sameDirection && (ho.miBits??0)>=0.001 && (retention??0)>=0.2
        ?"STABLE_CANDIDATE"
        : ho.n>=50 ? "WEAK_OR_UNSTABLE" : "LEARNING"
    });
  }

  const singleMap=Object.fromEntries(singles.map(x=>[x.feature,x]));
  const pairs=[];
  const usable=singles.map(x=>x.feature).slice(0,16);
  for(let i=0;i<usable.length;i++){
    for(let j=i+1;j<usable.length;j++){
      const a=usable[i],b=usable[j];
      const tr=interactionStats(train,a,b,thresholds[a],thresholds[b],outcomeKey);
      const ho=interactionStats(holdout,a,b,thresholds[a],thresholds[b],outcomeKey);
      if(!tr||!ho) continue;
      const bestSingleTrain=Math.max(singleMap[a]?.train?.miBits??0,singleMap[b]?.train?.miBits??0);
      const bestSingleHold=Math.max(singleMap[a]?.holdout?.miBits??0,singleMap[b]?.holdout?.miBits??0);
      const trainSynergy=(tr.miBits??0)-bestSingleTrain;
      const holdoutSynergy=(ho.miBits??0)-bestSingleHold;
      const sameSpreadDirection=Math.sign(tr.spread??0)===Math.sign(ho.spread??0);
      const stableSynergy=trainSynergy>0 && holdoutSynergy>0;
      const score=Math.max(0,holdoutSynergy)*Math.sqrt(Math.min(1000,ho.n)/1000);
      pairs.push({
        featureA:a,featureB:b,train:tr,holdout:ho,
        trainSynergyBits:trainSynergy,
        holdoutSynergyBits:holdoutSynergy,
        stableSynergy,sameSpreadDirection,
        discoveryScore:score,
        verdict:ho.n>=80 && stableSynergy && holdoutSynergy>=0.001
          ?"INTERACTION_CANDIDATE"
          : "NO_CONFIRMED_SYNERGY"
      });
    }
  }

  const redundancy=[];
  for(let i=0;i<usable.length;i++){
    for(let j=i+1;j<usable.length;j++){
      const a=usable[i],b=usable[j];
      const xs=[],ys=[];
      for(const r of rows){
        const x=Number(r?.[a]),y=Number(r?.[b]);
        if(Number.isFinite(x)&&Number.isFinite(y)){xs.push(x);ys.push(y);}
      }
      const corr=pearson(xs,ys);
      if(corr!==null && Math.abs(corr)>=0.70) {
        redundancy.push({
          featureA:a,featureB:b,n:xs.length,correlation:corr,
          absCorrelation:Math.abs(corr),
          verdict:Math.abs(corr)>=0.90?"HIGH_REDUNDANCY":"RELATED"
        });
      }
    }
  }

  const redundantFeatures=new Map();
  for(const r of redundancy.filter(x=>x.absCorrelation>=0.90)){
    const a=singleMap[r.featureA],b=singleMap[r.featureB];
    if(!a||!b) continue;
    const weaker=(a.discoveryScore??0)<(b.discoveryScore??0)?r.featureA:r.featureB;
    if(!redundantFeatures.has(weaker)) redundantFeatures.set(weaker,[]);
    redundantFeatures.get(weaker).push(r);
  }

  const governor=singles.map(x=>{
    const redundant=redundantFeatures.get(x.feature)||[];
    let action="KEEP_FOR_RESEARCH";
    if(x.verdict==="STABLE_CANDIDATE"&&!redundant.length) action="PROMOTE_TO_CHALLENGER_TEST";
    else if(x.verdict==="STABLE_CANDIDATE"&&redundant.length) action="REDUNDANT_CANDIDATE";
    else if(x.verdict==="WEAK_OR_UNSTABLE"&&x.holdout.n>=100) action="DEPRIORITIZE";
    return {
      feature:x.feature,
      action,
      discoveryScore:x.discoveryScore,
      holdoutMiBits:x.holdout.miBits,
      holdoutUplift:x.holdout.uplift,
      effectRetention:x.effectRetention,
      redundantWith:redundant.map(r=>r.featureA===x.feature?r.featureB:r.featureA),
      reason:action==="PROMOTE_TO_CHALLENGER_TEST"
        ?"Chronological holdout retained directional effect and information."
        : action==="REDUNDANT_CANDIDATE"
        ?"Signal survived holdout but overlaps strongly with another feature."
        : action==="DEPRIORITIZE"
        ?"Adequate sample but holdout evidence is weak or unstable."
        :"Evidence is still insufficient for promotion."
    };
  });

  const interactionGovernor=pairs
    .filter(x=>x.verdict==="INTERACTION_CANDIDATE")
    .sort((a,b)=>b.discoveryScore-a.discoveryScore)
    .slice(0,20)
    .map(x=>({
      features:[x.featureA,x.featureB],
      action:"PROMOTE_INTERACTION_TO_CHALLENGER_TEST",
      discoveryScore:x.discoveryScore,
      holdoutSynergyBits:x.holdoutSynergyBits,
      holdoutN:x.holdout.n
    }));

  return {
    status:"ACTIVE",
    n:rows.length,trainN:train.length,holdoutN:holdout.length,
    outcomeKey,
    features:singles.sort((a,b)=>b.discoveryScore-a.discoveryScore),
    interactions:pairs.sort((a,b)=>b.discoveryScore-a.discoveryScore),
    redundancy:redundancy.sort((a,b)=>b.absCorrelation-a.absCorrelation),
    governor:governor.sort((a,b)=>b.discoveryScore-a.discoveryScore),
    interactionGovernor,
    rules:{
      chronologicalTrainFraction:0.70,
      automaticLivePromotion:false,
      interactionSearchMaxFeatures:16,
      redundancyHighThreshold:0.90,
      note:"Discovery can nominate challenger tests only. It cannot modify live champion rules."
    }
  };
}
