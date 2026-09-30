export const NONLINEAR_CONCEPT_STABILITY_VERSION='TCX_ALPHA30_NONLINEAR_CONCEPT_STABILITY_V1';

const DEFAULTS=Object.freeze({
  minReferenceSamples:60,
  minTargetSamples:35,
  folds:5,
  neighbors:9,
  maxRelativeLossIncrease:1.0,
  cautionRelativeLossIncrease:.45,
  maxResidualBias:1.5
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

function scale(train,features){
  const mu=features.map(f=>mean(train.map(x=>x.features[f])));
  const sd=features.map((f,j)=>
    Math.sqrt(mean(train.map(x=>(x.features[f]-mu[j])**2)))||1
  );
  return x=>features.map((f,j)=>(x.features[f]-mu[j])/sd[j]);
}

function predict(train,query,features,k){
  const z=scale(train,features);
  const tr=train.map(x=>({x:z(x),y:x.outcome}));

  return query.map(q=>{
    const qz=z(q);
    const nn=tr
      .map(t=>({
        d:t.x.reduce((s,v,j)=>s+(v-qz[j])**2,0),
        y:t.y
      }))
      .sort((a,b)=>a.d-b.d)
      .slice(0,Math.max(1,Math.min(k,tr.length)));

    return mean(nn.map(n=>n.y));
  });
}

function crossfit(rows,features,folds,k){
  const nFolds=Math.max(2,Math.min(Math.floor(folds),rows.length));
  const pred=Array(rows.length).fill(0);

  for(let f=0;f<nFolds;f++){
    const testIndexes=rows.map((_,i)=>i).filter(i=>i%nFolds===f);
    const train=rows.filter((_,i)=>i%nFolds!==f);
    if(!train.length) continue;
    const pp=predict(train,testIndexes.map(i=>rows[i]),features,k);
    testIndexes.forEach((i,j)=>{ pred[i]=pp[j]; });
  }
  return pred;
}

/**
 * Alpha.30 adaptation: cross-fitted nonlinear probe for conditional drift.
 * kNN is deliberately a falsification diagnostic, not a forecast engine.
 */
export function evaluateNonlinearConceptStability(asOf,rows,options={}){
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

      let status='STABLE';
      let referenceLoss=0;
      let targetLoss=0;
      let relativeLossIncrease=Infinity;
      let normalizedResidualBias=Infinity;
      const reasons=[];

      if(refs.length<cfg.minReferenceSamples||target.length<cfg.minTargetSamples||!features.length){
        status='INSUFFICIENT';
        reasons.push('insufficient aligned PIT samples');
      } else {
        const referencePred=crossfit(refs,features,cfg.folds,cfg.neighbors);
        const referenceErrors=refs.map((x,i)=>x.outcome-referencePred[i]);
        referenceLoss=median(referenceErrors.map(x=>Math.abs(x)))||1e-6;

        const targetPred=predict(refs,target,features,cfg.neighbors);
        const targetErrors=target.map((x,i)=>x.outcome-targetPred[i]);
        targetLoss=median(targetErrors.map(x=>Math.abs(x)));

        relativeLossIncrease=
          (targetLoss-referenceLoss)/Math.max(.02,referenceLoss);

        normalizedResidualBias=
          Math.abs(median(targetErrors))/Math.max(.02,referenceLoss);

        if(
          relativeLossIncrease>cfg.maxRelativeLossIncrease||
          normalizedResidualBias>cfg.maxResidualBias
        ){
          status='DRIFTED';
          if(relativeLossIncrease>cfg.maxRelativeLossIncrease){
            reasons.push('cross-fitted nonlinear target error exceeds reference error');
          }
          if(normalizedResidualBias>cfg.maxResidualBias){
            reasons.push('nonlinear reference model has systematic target residual bias');
          }
        } else if(relativeLossIncrease>cfg.cautionRelativeLossIncrease){
          status='FRAGILE';
          reasons.push('nonlinear conditional relationship weakened');
        }
      }

      findings.push({
        mechanismId,
        environmentId,
        deploymentTarget:target.some(x=>x.deploymentTarget===true),
        status,
        referenceLoss,
        targetLoss,
        relativeLossIncrease,
        normalizedResidualBias,
        reasons
      });
    }
  }

  let gate='PASS';
  const warnings=[];

  if(!findings.length||findings.every(x=>x.status==='INSUFFICIENT')){
    gate='INSUFFICIENT';
    warnings.push('insufficient nonlinear concept-stability evidence');
  } else if(findings.some(x=>x.deploymentTarget&&x.status==='DRIFTED')){
    gate='ABSTAIN';
    warnings.push('deployment target exhibits nonlinear conditional drift');
  } else if(findings.some(x=>x.status!=='STABLE')){
    gate='CAUTION';
    warnings.push('some environments have fragile/drifted nonlinear conditionals');
  }

  if(blockedFuture) warnings.push(blockedFuture+' future observation(s) blocked');
  if(invalidRows) warnings.push(invalidRows+' invalid observation(s) rejected');

  return {
    version:NONLINEAR_CONCEPT_STABILITY_VERSION,
    asOf:t,
    usableObservations:usable.length,
    blockedFuture,
    invalidRows,
    findings,
    gate,
    warnings,
    epistemic:'MODELLED_NONLINEAR_STABILITY_DIAGNOSTIC_NOT_FORECAST',
    executionMode:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecute:false
  };
}
