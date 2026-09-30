export const SPECIFICATION_MULTIVERSE_VERSION='TCX_ALPHA30_SPECIFICATION_MULTIVERSE_V1';

const DEFAULTS=Object.freeze({
  minSpecifications:8,
  minReasonableFraction:.8,
  minSignAgreement:.75,
  cautionSignAgreement:.6,
  maxRelativeDispersion:1.5,
  maxSelectionGap:1.0
});

const mean=a=>a.reduce((s,x)=>s+x,0)/Math.max(1,a.length);
const median=a=>{
  const b=[...a].sort((x,y)=>x-y);
  if(!b.length) return 0;
  const m=Math.floor(b.length/2);
  return b.length%2?b[m]:(b[m-1]+b[m])/2;
};

function valid(r){
  return Boolean(
    r?.id&&r?.claimId&&r?.mechanismId&&r?.specificationId&&
    r?.source&&r?.version&&r?.provenance
  )&&
  Number.isFinite(Number(r?.estimate))&&
  Number.isFinite(Number(r?.timestamp))&&
  Number.isFinite(Number(r?.availableAt))&&
  Number(r.timestamp)<=Number(r.availableAt);
}

function sign(x,tol){
  const n=Number(x);
  if(Math.abs(n)<=tol) return 0;
  return n>0?1:-1;
}

/**
 * Audits robustness across reasonable alternative specifications.
 * It does not choose the "best" specification and does not turn robustness into probability.
 */
export function evaluateSpecificationMultiverse(asOf,rows,options={}){
  const t=Number(asOf);
  if(!Number.isFinite(t)) throw new Error('asOf must be finite');
  if(!Array.isArray(rows)) throw new Error('rows must be an array');

  const cfg={...DEFAULTS,...options};
  const invalidRows=rows.filter(x=>!valid(x)).length;
  const validRows=rows.filter(valid);
  const blockedFuture=validRows.filter(x=>Number(x.timestamp)>t||Number(x.availableAt)>t).length;
  const usable=validRows.filter(x=>Number(x.timestamp)<=t&&Number(x.availableAt)<=t);

  const keys=[...new Set(usable.map(r=>String(r.mechanismId)+'\u0000'+String(r.claimId)))];
  const findings=keys.map(key=>{
    const [mechanismId,claimId]=key.split('\u0000');
    const xs=usable.filter(r=>String(r.mechanismId)===mechanismId&&String(r.claimId)===claimId);
    const reasonable=xs.filter(r=>r.reasonable!==false);
    const estimates=reasonable.map(r=>Number(r.estimate));
    const tolerance=Math.max(0,Number(options.zeroTolerance??0));
    const signs=estimates.map(x=>sign(x,tolerance));
    const nonzero=signs.filter(x=>x!==0);
    const dominantSign=nonzero.length
      ? (nonzero.filter(x=>x>0).length>=nonzero.filter(x=>x<0).length?1:-1)
      : 0;
    const signAgreement=nonzero.length
      ? nonzero.filter(x=>x===dominantSign).length/nonzero.length
      : 0;

    const med=median(estimates);
    const mad=median(estimates.map(x=>Math.abs(x-med)));
    const relativeDispersion=mad/Math.max(.02,Math.abs(med));

    const selected=reasonable.filter(r=>r.selected===true);
    const selectedMean=selected.length?mean(selected.map(r=>Number(r.estimate))):null;
    const overallMean=estimates.length?mean(estimates):null;
    const selectionGap=selectedMean==null||overallMean==null
      ? 0
      : Math.abs(selectedMean-overallMean)/Math.max(.02,Math.abs(overallMean));

    const reasonableFraction=xs.length?reasonable.length/xs.length:0;
    const reasons=[];
    let status='ROBUST';

    if(reasonable.length<cfg.minSpecifications){
      status='INSUFFICIENT';
      reasons.push('too few reasonable specifications');
    } else if(reasonableFraction<cfg.minReasonableFraction){
      status='FRAGILE';
      reasons.push('large share of explored specifications was excluded as unreasonable');
    }

    if(status!=='INSUFFICIENT'){
      if(signAgreement<cfg.minSignAgreement||relativeDispersion>cfg.maxRelativeDispersion||selectionGap>cfg.maxSelectionGap){
        status='FRAGILE';
        if(signAgreement<cfg.minSignAgreement) reasons.push('effect direction changes across reasonable specifications');
        if(relativeDispersion>cfg.maxRelativeDispersion) reasons.push('effect magnitude is highly specification-sensitive');
        if(selectionGap>cfg.maxSelectionGap) reasons.push('selected specification is materially different from multiverse center');
      } else if(signAgreement<cfg.cautionSignAgreement){
        status='FRAGILE';
        reasons.push('specification sign agreement is weak');
      }
    }

    const deploymentTarget=xs.some(r=>r.deploymentTarget===true);
    return {
      claimId,mechanismId,
      specifications:xs.length,
      reasonableSpecifications:reasonable.length,
      reasonableFraction,
      dominantSign,
      signAgreement,
      medianEstimate:med,
      relativeDispersion,
      selectionGap,
      deploymentTarget,
      status,
      reasons
    };
  });

  let gate='PASS';
  const warnings=[];
  if(!findings.length||findings.every(x=>x.status==='INSUFFICIENT')){
    gate='INSUFFICIENT';
    warnings.push('insufficient specification multiverse evidence');
  } else if(findings.some(x=>x.deploymentTarget&&x.status==='FRAGILE')){
    gate='ABSTAIN';
    warnings.push('deployment-relevant claim is specification-sensitive');
  } else if(findings.some(x=>x.status!=='ROBUST')){
    gate='CAUTION';
    warnings.push('some claims are specification-sensitive or incomplete');
  }

  if(blockedFuture) warnings.push(blockedFuture+' future specification result(s) blocked');
  if(invalidRows) warnings.push(invalidRows+' invalid specification result(s) rejected');

  return {
    version:SPECIFICATION_MULTIVERSE_VERSION,
    asOf:t,
    usableSpecifications:usable.length,
    blockedFuture,
    invalidRows,
    findings,
    gate,
    warnings,
    epistemic:'SPECIFICATION_ROBUSTNESS_DIAGNOSTIC_NOT_FORECAST_PROBABILITY',
    executionMode:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecute:false
  };
}
