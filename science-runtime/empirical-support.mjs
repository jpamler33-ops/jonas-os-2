export const EMPIRICAL_SUPPORT_VERSION='TCX_ALPHA30_EMPIRICAL_SUPPORT_V1';

const DEFAULTS=Object.freeze({
  minReferenceSamples:30,
  minTargetSamples:20,
  minEnvironmentSupport:.55,
  cautionEnvironmentSupport:.70,
  bins:12
});

function valid(x){
  return Boolean(
    x?.id&&x?.mechanismId&&x?.environmentId&&x?.feature&&
    x?.source&&x?.version&&x?.provenance
  )&&
  Number.isFinite(Number(x?.value))&&
  Number.isFinite(Number(x?.timestamp))&&
  Number.isFinite(Number(x?.availableAt))&&
  Number(x.timestamp)<=Number(x.availableAt);
}
function mean(a){return a.reduce((s,x)=>s+x,0)/Math.max(1,a.length);}
function variance(a,m=mean(a)){return a.length<2?0:a.reduce((s,x)=>s+(x-m)**2,0)/(a.length-1);}
function clamp01(x){return Math.max(0,Math.min(1,x));}
function corr(a,b){
  if(a.length<3||a.length!==b.length)return 0;
  const ma=mean(a),mb=mean(b),sa=Math.sqrt(variance(a,ma)),sb=Math.sqrt(variance(b,mb));
  if(sa<1e-12||sb<1e-12)return 0;
  return a.reduce((s,x,i)=>s+(x-ma)*(b[i]-mb),0)/((a.length-1)*sa*sb);
}
function histOverlap(a,b,bins){
  const lo=Math.min(...a,...b),hi=Math.max(...a,...b);
  if(!(hi>lo))return 1;
  const ha=Array(bins).fill(0),hb=Array(bins).fill(0);
  for(const x of a)ha[Math.min(bins-1,Math.floor((x-lo)/(hi-lo)*bins))]++;
  for(const x of b)hb[Math.min(bins-1,Math.floor((x-lo)/(hi-lo)*bins))]++;
  return ha.reduce((s,n,i)=>s+Math.min(n/a.length,hb[i]/b.length),0);
}
function maxCorrelationShift(refs,target,features){
  if(features.length<2||!refs.some(x=>x.sampleId)||!target.some(x=>x.sampleId))return 0;
  let max=0;
  for(let i=0;i<features.length;i++){
    for(let j=i+1;j<features.length;j++){
      const f1=features[i],f2=features[j];
      const pairs=xs=>{
        const m=new Map();
        for(const x of xs){
          if(!x.sampleId||(x.feature!==f1&&x.feature!==f2))continue;
          const row=m.get(x.sampleId)??{};
          row[x.feature]=Number(x.value);
          m.set(x.sampleId,row);
        }
        return [...m.values()]
          .filter(r=>Number.isFinite(r[f1])&&Number.isFinite(r[f2]))
          .map(r=>[r[f1],r[f2]]);
      };
      const a=pairs(refs),b=pairs(target);
      if(a.length>=10&&b.length>=10){
        max=Math.max(max,Math.abs(
          corr(a.map(x=>x[0]),a.map(x=>x[1]))-
          corr(b.map(x=>x[0]),b.map(x=>x[1]))
        ));
      }
    }
  }
  return max;
}

/**
 * Alpha.30 adaptation: estimates whether target feature distributions have
 * empirical support inside reference distributions using point-in-time data only.
 * This is a transport/support diagnostic, not a causal estimator or price probability.
 */
export function evaluateEmpiricalSupport(asOf,rows,options={}){
  const t=Number(asOf);
  if(!Number.isFinite(t)) throw new Error('asOf must be finite');
  if(!Array.isArray(rows)) throw new Error('rows must be an array');

  const cfg={...DEFAULTS,...options};
  const invalidRows=rows.filter(x=>!valid(x)).length;
  const validRows=rows.filter(valid);
  const blockedFuture=validRows.filter(x=>Number(x.timestamp)>t||Number(x.availableAt)>t).length;
  const usable=validRows.filter(x=>Number(x.timestamp)<=t&&Number(x.availableAt)<=t);

  const mechanisms=[...new Set(usable.map(x=>String(x.mechanismId)))];
  const findings=[];

  for(const mechanismId of mechanisms){
    const mine=usable.filter(x=>String(x.mechanismId)===mechanismId);
    const refs=mine.filter(x=>x.role==='REFERENCE');
    const environments=[...new Set(mine.filter(x=>x.role!=='REFERENCE').map(x=>String(x.environmentId)))];

    for(const environmentId of environments){
      const target=mine.filter(x=>String(x.environmentId)===environmentId&&x.role!=='REFERENCE');
      const features=[
        ...new Set(
          target.map(x=>String(x.feature)).filter(feature=>refs.some(r=>String(r.feature)===feature))
        )
      ];
      const diagnostics=[];

      for(const feature of features){
        const a=refs.filter(x=>String(x.feature)===feature).map(x=>Number(x.value));
        const b=target.filter(x=>String(x.feature)===feature).map(x=>Number(x.value));
        if(a.length<cfg.minReferenceSamples||b.length<cfg.minTargetSamples)continue;

        const ma=mean(a),mb=mean(b);
        const pooled=Math.sqrt((variance(a,ma)+variance(b,mb))/2);
        const smd=pooled>1e-12?Math.abs(mb-ma)/pooled:(ma===mb?0:Infinity);
        const overlap=histOverlap(a,b,cfg.bins);
        const densityRatioProxy=Number.isFinite(smd)?Math.exp(-.5*smd*smd):0;
        const score=clamp01(Math.sqrt(overlap*densityRatioProxy));
        diagnostics.push({
          feature,
          referenceN:a.length,
          targetN:b.length,
          standardizedMeanDifference:smd,
          histogramOverlap:overlap,
          densityRatioProxy,
          score
        });
      }

      const correlationShift=maxCorrelationShift(refs,target,features);
      const reasons=[];
      let status='IN_SUPPORT';
      let supportScore=0;
      let worstFeatureScore=0;

      if(!diagnostics.length){
        status='INSUFFICIENT';
        reasons.push('insufficient PIT feature samples shared by reference and target');
      } else {
        const scores=diagnostics.map(x=>Math.max(1e-9,x.score));
        const geometric=Math.exp(scores.reduce((s,x)=>s+Math.log(x),0)/scores.length);
        worstFeatureScore=Math.min(...scores);
        supportScore=clamp01(Math.sqrt(geometric*worstFeatureScore)*Math.exp(-correlationShift));

        if(correlationShift>.8){
          reasons.push('joint feature dependence shifted materially despite marginal overlap');
        }
        if(supportScore<cfg.minEnvironmentSupport){
          status='OUT_OF_SUPPORT';
          reasons.push('target covariate distribution has inadequate overlap with reference support');
        } else if(supportScore<cfg.cautionEnvironmentSupport){
          status='FRAGILE';
          reasons.push('target covariate overlap is fragile');
        }
      }

      findings.push({
        mechanismId,
        environmentId,
        deploymentTarget:target.some(x=>x.deploymentTarget===true),
        status,
        supportScore,
        worstFeatureScore,
        maxCorrelationShift:correlationShift,
        diagnostics,
        reasons
      });
    }
  }

  const mechanismSummaries=mechanisms.map(mechanismId=>{
    const mine=findings.filter(x=>x.mechanismId===mechanismId);
    let status='INSUFFICIENT';
    if(mine.some(x=>x.status==='OUT_OF_SUPPORT'))status='OUT_OF_SUPPORT';
    else if(mine.some(x=>x.status==='FRAGILE'))status='FRAGILE';
    else if(mine.length&&mine.every(x=>x.status==='IN_SUPPORT'))status='IN_SUPPORT';
    return {mechanismId,status};
  });

  let gate='PASS';
  const warnings=[];
  if(!findings.length||findings.every(x=>x.status==='INSUFFICIENT')){
    gate='INSUFFICIENT';
    warnings.push('insufficient empirical support data');
  } else if(findings.some(x=>x.deploymentTarget&&x.status==='OUT_OF_SUPPORT')){
    gate='ABSTAIN';
    warnings.push('deployment target is outside empirically estimated covariate support');
  } else if(findings.some(x=>['OUT_OF_SUPPORT','FRAGILE','INSUFFICIENT'].includes(x.status))){
    gate='CAUTION';
    warnings.push('some target environments have fragile/incomplete empirical support');
  }

  if(blockedFuture)warnings.push(`${blockedFuture} future support observation(s) blocked`);
  if(invalidRows)warnings.push(`${invalidRows} invalid support observation(s) rejected`);

  return {
    version:EMPIRICAL_SUPPORT_VERSION,
    asOf:t,
    usableObservations:usable.length,
    blockedFuture,
    invalidRows,
    findings,
    mechanisms:mechanismSummaries,
    gate,
    warnings,
    epistemic:'EMPIRICAL_COVARIATE_SUPPORT_DIAGNOSTIC_NOT_CAUSAL',
    executionMode:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecute:false
  };
}
