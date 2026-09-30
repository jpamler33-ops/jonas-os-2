const clamp=(n,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(n)));

export function decomposeConfidence({signalStrength=0,evidenceQuality=0,independence=0,regimeFit=0,sampleAdequacy=0,driftPenalty=0,unknownness=0}={}){
 const components={signalStrength:clamp(signalStrength),evidenceQuality:clamp(evidenceQuality),independence:clamp(independence),regimeFit:clamp(regimeFit),sampleAdequacy:clamp(sampleAdequacy),driftPenalty:clamp(driftPenalty),unknownness:clamp(unknownness)};
 const reliability=(components.evidenceQuality+components.independence+components.regimeFit+components.sampleAdequacy)/4;
 const usable=reliability*(1-components.driftPenalty)*(1-components.unknownness);
 const edge=(components.signalStrength-.5)*2;
 const rawProbability=clamp(.5+edge*usable*.5,.01,.99);
 return Object.freeze({...components,reliability,usable,rawProbability});
}

export function fitHistogramCalibrator(rows,{bins=10,minSamples=30,shrinkage=40}={}){
 const buckets=Array.from({length:bins},()=>({n:0,y:0}));
 for(const r of rows){const p=clamp(r.probability);const i=Math.min(bins-1,Math.floor(p*bins));buckets[i].n++;buckets[i].y+=r.outcome?1:0;}
 const global=rows.length?rows.reduce((s,r)=>s+(r.outcome?1:0),0)/rows.length:.5;
 return Object.freeze({bins,minSamples,global,buckets:buckets.map(b=>Object.freeze({...b,rate:b.n?b.y/b.n:global})) ,shrinkage});
}
export function calibrateProbability(model,p){
 const x=clamp(p);const i=Math.min(model.bins-1,Math.floor(x*model.bins));const b=model.buckets[i];
 if(!b||b.n<model.minSamples) return clamp((x*model.shrinkage+model.global*(b?.n??0))/(model.shrinkage+(b?.n??0)),.01,.99);
 const w=b.n/(b.n+model.shrinkage);return clamp(b.rate*w+x*(1-w),.01,.99);
}

export function walkForwardCalibration(rows,{warmup=200,window=1000,bins=10,minSamples=30,shrinkage=40}={}){
 const out=[];
 for(let i=0;i<rows.length;i++){
  const raw=clamp(rows[i].probability); if(i<warmup){out.push({...rows[i],rawProbability:raw,calibratedProbability:.5,calibrationReady:false});continue;}
  const history=rows.slice(Math.max(0,i-window),i); // strictly prior observations only
  const model=fitHistogramCalibrator(history,{bins,minSamples,shrinkage});
  out.push({...rows[i],rawProbability:raw,calibratedProbability:calibrateProbability(model,raw),calibrationReady:true});
 }
 return out;
}
