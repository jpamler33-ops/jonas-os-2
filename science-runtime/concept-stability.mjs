export const CONCEPT_STABILITY_VERSION='TCX_ALPHA30_CONCEPT_STABILITY_V1';

const DEFAULTS=Object.freeze({
  minReferenceSamples:40,
  minTargetSamples:25,
  minR2:.10,
  maxCoefficientDrift:.85,
  cautionCoefficientDrift:.45,
  maxResidualMeanShift:.75
});

const mean=a=>a.reduce((s,x)=>s+x,0)/Math.max(1,a.length);
const clamp=x=>Math.max(-1,Math.min(1,x));

function solve(A,b){
  const n=b.length;
  const M=A.map((r,i)=>[...r,b[i]]);
  for(let i=0;i<n;i++){
    let p=i;
    for(let j=i+1;j<n;j++){
      if(Math.abs(M[j][i])>Math.abs(M[p][i])) p=j;
    }
    [M[i],M[p]]=[M[p],M[i]];
    const d=M[i][i];
    if(Math.abs(d)<1e-10) return null;
    for(let k=i;k<=n;k++) M[i][k]/=d;
    for(let j=0;j<n;j++){
      if(j===i) continue;
      const q=M[j][i];
      for(let k=i;k<=n;k++) M[j][k]-=q*M[i][k];
    }
  }
  return M.map(r=>r[n]);
}

function fit(xs,features){
  const X=xs.map(x=>[1,...features.map(f=>x.features[f])]);
  const y=xs.map(x=>x.outcome);
  const p=features.length+1;
  const A=Array.from({length:p},()=>Array(p).fill(0));
  const b=Array(p).fill(0);

  for(let r=0;r<X.length;r++){
    for(let i=0;i<p;i++){
      b[i]+=X[r][i]*y[r];
      for(let j=0;j<p;j++) A[i][j]+=X[r][i]*X[r][j];
    }
  }
  for(let i=0;i<p;i++) A[i][i]+=1e-8;

  const beta=solve(A,b);
  if(!beta) return null;

  const pred=X.map(row=>row.reduce((s,v,i)=>s+v*beta[i],0));
  const my=mean(y);
  const sst=y.reduce((s,v)=>s+(v-my)**2,0);
  const sse=y.reduce((s,v,i)=>s+(v-pred[i])**2,0);

  return {
    beta,
    r2:sst>1e-12?1-sse/sst:0,
    residuals:y.map((v,i)=>v-pred[i])
  };
}

function valid(x){
  return Boolean(
    x?.id&&x?.mechanismId&&x?.environmentId&&x?.sampleId&&
    x?.source&&x?.version&&x?.provenance
  )&&
  Number.isFinite(Number(x?.outcome))&&
  Number.isFinite(Number(x?.timestamp))&&
  Number.isFinite(Number(x?.availableAt))&&
  Number(x.timestamp)<=Number(x.availableAt)&&
  x?.features&&
  Object.keys(x.features).length>0&&
  Object.values(x.features).every(Number.isFinite);
}

/**
 * Alpha.30 adaptation: detects conditional/concept drift P(Y|X) even when
 * covariate support remains acceptable. Diagnostic only; not causal proof.
 */
export function evaluateConceptStability(asOf,rows,options={}){
  const t=Number(asOf);
  if(!Number.isFinite(t)) throw new Error('asOf must be finite');
  if(!Array.isArray(rows)) throw new Error('rows must be an array');

  const cfg={...DEFAULTS,...options};
  const invalidRows=rows.filter(x=>!valid(x)).length;
  const validRows=rows.filter(valid);
  const blockedFuture=validRows.filter(x=>Number(x.timestamp)>t||Number(x.availableAt)>t).length;
  const usable=validRows.filter(x=>Number(x.timestamp)<=t&&Number(x.availableAt)<=t);
  const findings=[];

  for(const mechanismId of [...new Set(usable.map(x=>String(x.mechanismId)))]){
    const mechanismRows=usable.filter(x=>String(x.mechanismId)===mechanismId);
    const refs=mechanismRows.filter(x=>x.role==='REFERENCE');

    for(const environmentId of [...new Set(
      mechanismRows.filter(x=>x.role!=='REFERENCE').map(x=>String(x.environmentId))
    )]){
      const target=mechanismRows.filter(
        x=>String(x.environmentId)===environmentId&&x.role!=='REFERENCE'
      );
      const features=[...new Set(refs.flatMap(x=>Object.keys(x.features)))]
        .filter(f=>refs.every(x=>Number.isFinite(x.features[f]))&&
                   target.every(x=>Number.isFinite(x.features[f])));

      const reasons=[];
      let status='STABLE';
      let referenceR2=0;
      let targetR2=0;
      let coefficientCosine=0;
      let relativeCoefficientDrift=Infinity;
      let normalizedResidualMeanShift=Infinity;

      if(refs.length<cfg.minReferenceSamples||target.length<cfg.minTargetSamples||!features.length){
        status='INSUFFICIENT';
        reasons.push('insufficient aligned PIT outcome/feature samples');
      } else {
        const refFit=fit(refs,features);
        const targetFit=fit(target,features);

        if(!refFit||!targetFit){
          status='INSUFFICIENT';
          reasons.push('conditional model not identifiable');
        } else {
          referenceR2=refFit.r2;
          targetR2=targetFit.r2;

          const a=refFit.beta.slice(1);
          const b=targetFit.beta.slice(1);
          const na=Math.sqrt(a.reduce((s,x)=>s+x*x,0));
          const nb=Math.sqrt(b.reduce((s,x)=>s+x*x,0));

          coefficientCosine=na>1e-10&&nb>1e-10
            ? clamp(a.reduce((s,x,i)=>s+x*b[i],0)/(na*nb))
            : 0;

          relativeCoefficientDrift=
            Math.sqrt(a.reduce((s,x,i)=>s+(x-b[i])**2,0))/Math.max(.05,na);

          const referenceResidualSd=
            Math.sqrt(mean(refFit.residuals.map(x=>x*x)));

          normalizedResidualMeanShift=
            Math.abs(mean(targetFit.residuals))/Math.max(.05,referenceResidualSd);

          if(referenceR2<cfg.minR2){
            status='INSUFFICIENT';
            reasons.push('reference conditional signal too weak for stability inference');
          } else if(
            coefficientCosine<0||
            relativeCoefficientDrift>cfg.maxCoefficientDrift||
            normalizedResidualMeanShift>cfg.maxResidualMeanShift
          ){
            status='DRIFTED';
            if(coefficientCosine<0) reasons.push('conditional relationship reverses direction');
            if(relativeCoefficientDrift>cfg.maxCoefficientDrift){
              reasons.push('conditional coefficients changed materially');
            }
            if(normalizedResidualMeanShift>cfg.maxResidualMeanShift){
              reasons.push('reference model is systematically biased in target');
            }
          } else if(
            relativeCoefficientDrift>cfg.cautionCoefficientDrift||
            targetR2<cfg.minR2
          ){
            status='FRAGILE';
            reasons.push('conditional relationship weakened or shifted');
          }
        }
      }

      findings.push({
        mechanismId,
        environmentId,
        deploymentTarget:target.some(x=>x.deploymentTarget===true),
        status,
        referenceR2,
        targetR2,
        coefficientCosine,
        relativeCoefficientDrift,
        normalizedResidualMeanShift,
        reasons
      });
    }
  }

  let gate='PASS';
  const warnings=[];

  if(!findings.length||findings.every(x=>x.status==='INSUFFICIENT')){
    gate='INSUFFICIENT';
    warnings.push('insufficient concept-stability evidence');
  } else if(findings.some(x=>x.deploymentTarget&&x.status==='DRIFTED')){
    gate='ABSTAIN';
    warnings.push('deployment target exhibits conditional/concept drift');
  } else if(findings.some(x=>['DRIFTED','FRAGILE','INSUFFICIENT'].includes(x.status))){
    gate='CAUTION';
    warnings.push('some environments have fragile/drifted conditional relationships');
  }

  if(blockedFuture) warnings.push(blockedFuture+' future concept observation(s) blocked');
  if(invalidRows) warnings.push(invalidRows+' invalid concept observation(s) rejected');

  return {
    version:CONCEPT_STABILITY_VERSION,
    asOf:t,
    usableObservations:usable.length,
    blockedFuture,
    invalidRows,
    findings,
    gate,
    warnings,
    epistemic:'MODELLED_CONDITIONAL_STABILITY_DIAGNOSTIC_NOT_CAUSAL',
    executionMode:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecute:false
  };
}
