export const TEMPORAL_RECENCY_VERSION='TCX_ALPHA30_TEMPORAL_RECENCY_V1';

const DEFAULTS=Object.freeze({
  minSamples:120,
  baselineFraction:.55,
  recentFraction:.20,
  neighbors:9,
  maxRecentLossRatio:2.25,
  cautionRecentLossRatio:1.55,
  maxRecentBiasRatio:1.75,
  maxShortLongRatio:2.5
});

const mean=a=>a.reduce((s,x)=>s+x,0)/Math.max(1,a.length);
const median=a=>{
  const b=[...a].sort((x,y)=>x-y);
  if(!b.length) return 0;
  const m=Math.floor(b.length/2);
  return b.length%2?b[m]:(b[m-1]+b[m])/2;
};

function valid(x){
  return Boolean(
    x?.id&&x?.mechanismId&&x?.sampleId&&x?.source&&x?.version&&x?.provenance
  )&&
  Number.isFinite(Number(x?.outcome))&&
  Number.isFinite(Number(x?.timestamp))&&
  Number.isFinite(Number(x?.availableAt))&&
  Number(x.timestamp)<=Number(x.availableAt)&&
  x?.features&&
  Object.keys(x.features).length>0&&
  Object.values(x.features).every(Number.isFinite);
}

function scaler(train,features){
  const mu=features.map(f=>mean(train.map(x=>x.features[f])));
  const sd=features.map((f,j)=>
    Math.sqrt(mean(train.map(x=>(x.features[f]-mu[j])**2)))||1
  );
  return x=>features.map((f,j)=>(x.features[f]-mu[j])/sd[j]);
}

function predict(train,query,features,k){
  const z=scaler(train,features);
  const tr=train.map(x=>({x:z(x),y:x.outcome}));

  return query.map(r=>{
    const rz=z(r);
    const nn=tr
      .map(t=>({
        d:t.x.reduce((s,v,j)=>s+(v-rz[j])**2,0),
        y:t.y
      }))
      .sort((a,b)=>a.d-b.d)
      .slice(0,Math.max(1,Math.min(k,tr.length)));

    return mean(nn.map(n=>n.y));
  });
}

/**
 * Alpha.30 adaptation: PIT-only recency falsification.
 * Baseline is strictly earlier than recent. No future outcomes are admitted.
 */
export function evaluateTemporalRecency(asOf,rows,options={}){
  const t=Number(asOf);
  if(!Number.isFinite(t)) throw new Error('asOf must be finite');
  if(!Array.isArray(rows)) throw new Error('rows must be an array');

  const cfg={...DEFAULTS,...options};
  const invalidRows=rows.filter(x=>!valid(x)).length;
  const validRows=rows.filter(valid);
  const blockedFuture=validRows.filter(
    x=>Number(x.timestamp)>t||Number(x.availableAt)>t
  ).length;
  const usable=validRows.filter(
    x=>Number(x.timestamp)<=t&&Number(x.availableAt)<=t
  );

  const findings=[];

  for(const mechanismId of [...new Set(usable.map(x=>String(x.mechanismId)))]){
    const history=usable
      .filter(x=>String(x.mechanismId)===mechanismId)
      .sort((a,b)=>
        Number(a.timestamp)-Number(b.timestamp)||
        Number(a.availableAt)-Number(b.availableAt)||
        String(a.id).localeCompare(String(b.id))
      );

    let status='CURRENT';
    const reasons=[];
    let baselineSamples=0;
    let recentSamples=0;
    let baselineLoss=0;
    let recentLoss=0;
    let recentLossRatio=Infinity;
    let recentBiasRatio=Infinity;
    let shortLongLossRatio=Infinity;

    if(history.length<cfg.minSamples){
      status='INSUFFICIENT';
      reasons.push('insufficient PIT history for recency test');
    } else {
      const baselineEnd=Math.floor(history.length*cfg.baselineFraction);
      const recentN=Math.max(20,Math.floor(history.length*cfg.recentFraction));
      const recentStart=history.length-recentN;

      const baseline=history.slice(0,baselineEnd);
      const recent=history.slice(recentStart);
      const preRecent=history.slice(0,recentStart);

      baselineSamples=baseline.length;
      recentSamples=recent.length;

      const features=[...new Set(baseline.flatMap(x=>Object.keys(x.features)))]
        .filter(f=>
          baseline.every(x=>Number.isFinite(x.features[f]))&&
          recent.every(x=>Number.isFinite(x.features[f]))
        );

      if(!features.length||preRecent.length<cfg.neighbors){
        status='INSUFFICIENT';
        reasons.push('no aligned features');
      } else {
        const validationStart=Math.max(
          cfg.neighbors,
          Math.floor(baseline.length*.7)
        );
        const trainBaseline=baseline.slice(0,validationStart);
        const validateBaseline=baseline.slice(validationStart);

        if(!validateBaseline.length||trainBaseline.length<cfg.neighbors){
          status='INSUFFICIENT';
          reasons.push('insufficient chronological baseline split');
        } else {
          const baselinePred=predict(
            trainBaseline,validateBaseline,features,cfg.neighbors
          );
          const baselineErrors=validateBaseline.map(
            (x,i)=>x.outcome-baselinePred[i]
          );
          baselineLoss=median(baselineErrors.map(Math.abs))||.02;

          const recentPred=predict(
            preRecent,recent,features,cfg.neighbors
          );
          const recentErrors=recent.map(
            (x,i)=>x.outcome-recentPred[i]
          );
          recentLoss=median(recentErrors.map(Math.abs));

          recentLossRatio=recentLoss/Math.max(.02,baselineLoss);
          recentBiasRatio=
            Math.abs(median(recentErrors))/Math.max(.02,baselineLoss);

          const half=Math.max(10,Math.floor(recentErrors.length/2));
          const early=median(recentErrors.slice(0,half).map(Math.abs))||.02;
          const late=median(recentErrors.slice(-half).map(Math.abs));
          shortLongLossRatio=late/Math.max(.02,early);

          if(
            recentLossRatio>cfg.maxRecentLossRatio||
            recentBiasRatio>cfg.maxRecentBiasRatio||
            shortLongLossRatio>cfg.maxShortLongRatio
          ){
            status='BROKEN';
            if(recentLossRatio>cfg.maxRecentLossRatio){
              reasons.push('recent predictive loss exceeds historical baseline');
            }
            if(recentBiasRatio>cfg.maxRecentBiasRatio){
              reasons.push('recent residuals show systematic directional bias');
            }
            if(shortLongLossRatio>cfg.maxShortLongRatio){
              reasons.push('latest slice deteriorates within the recent window');
            }
          } else if(recentLossRatio>cfg.cautionRecentLossRatio){
            status='WEAKENING';
            reasons.push('recent mechanism fit is weakening');
          }
        }
      }
    }

    findings.push({
      mechanismId,
      status,
      baselineSamples,
      recentSamples,
      baselineLoss,
      recentLoss,
      recentLossRatio,
      recentBiasRatio,
      shortLongLossRatio,
      reasons
    });
  }

  let gate='PASS';
  const warnings=[];

  if(!findings.length||findings.every(x=>x.status==='INSUFFICIENT')){
    gate='INSUFFICIENT';
    warnings.push('insufficient temporal recency evidence');
  } else if(findings.some(x=>x.status==='BROKEN')){
    gate='ABSTAIN';
    warnings.push('a currently relevant mechanism appears temporally broken');
  } else if(findings.some(x=>['WEAKENING','INSUFFICIENT'].includes(x.status))){
    gate='CAUTION';
    warnings.push('temporal recency evidence is weakening or incomplete');
  }

  if(blockedFuture) warnings.push(blockedFuture+' future observation(s) blocked');
  if(invalidRows) warnings.push(invalidRows+' invalid observation(s) rejected');

  return {
    version:TEMPORAL_RECENCY_VERSION,
    asOf:t,
    usableObservations:usable.length,
    blockedFuture,
    invalidRows,
    findings,
    gate,
    warnings,
    epistemic:'MODELLED_TEMPORAL_RECENCY_DIAGNOSTIC_NOT_FORECAST',
    executionMode:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecute:false
  };
}
