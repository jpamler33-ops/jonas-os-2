export const TRANSPORTABILITY_VERSION='TCX_ALPHA30_TRANSPORTABILITY_V1';

const DEFAULTS=Object.freeze({
  minReferenceStudies:3,
  minTargetStudies:2,
  maxTargetGapZ:3.0,
  cautionTargetGapZ:2.0,
  maxReferenceHeterogeneityI2:.75,
  cautionReferenceHeterogeneityI2:.50
});

function valid(r){
  return Boolean(
    r?.id&&r?.claimId&&r?.mechanismId&&r?.environmentId&&
    r?.source&&r?.version&&r?.provenance
  )&&
  Number.isFinite(Number(r?.estimate))&&
  Number.isFinite(Number(r?.standardError))&&Number(r.standardError)>0&&
  Number.isFinite(Number(r?.timestamp))&&
  Number.isFinite(Number(r?.availableAt))&&
  Number(r.timestamp)<=Number(r.availableAt);
}

function pooled(rows){
  if(!rows.length) return null;
  const ws=rows.map(r=>1/(Number(r.standardError)**2));
  const den=ws.reduce((a,b)=>a+b,0);
  const estimate=rows.reduce((s,r,i)=>s+ws[i]*Number(r.estimate),0)/den;
  const se=Math.sqrt(1/den);
  return {estimate,se,weightSum:den};
}

function iSquared(rows){
  if(rows.length<2) return 0;
  const p=pooled(rows);
  const q=rows.reduce((s,r)=>{
    const w=1/(Number(r.standardError)**2);
    return s+w*(Number(r.estimate)-p.estimate)**2;
  },0);
  const df=rows.length-1;
  return q<=0?0:Math.max(0,(q-df)/q);
}

/**
 * Audits whether evidence estimated in reference environments transports to a target.
 * It assumes the incoming effect estimates already have their own identification story;
 * this module only tests cross-environment compatibility.
 */
export function evaluateTransportability(asOf,rows,options={}){
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
    const mine=usable.filter(r=>String(r.mechanismId)===mechanismId&&String(r.claimId)===claimId);
    const refs=mine.filter(r=>r.role==='REFERENCE');
    const targets=[...new Set(mine.filter(r=>r.role!=='REFERENCE').map(r=>String(r.environmentId)))];

    const refPool=pooled(refs);
    const refI2=iSquared(refs);

    return targets.map(environmentId=>{
      const targetRows=mine.filter(r=>String(r.environmentId)===environmentId&&r.role!=='REFERENCE');
      const targetPool=pooled(targetRows);
      const reasons=[];
      let status='TRANSPORTABLE';
      let gapZ=Infinity;
      let signAgreement=false;

      if(refs.length<cfg.minReferenceStudies||targetRows.length<cfg.minTargetStudies||!refPool||!targetPool){
        status='INSUFFICIENT';
        reasons.push('insufficient reference/target study evidence');
      } else {
        gapZ=Math.abs(targetPool.estimate-refPool.estimate)/
          Math.sqrt(refPool.se**2+targetPool.se**2);
        signAgreement=
          Math.sign(refPool.estimate)===0||
          Math.sign(targetPool.estimate)===0||
          Math.sign(refPool.estimate)===Math.sign(targetPool.estimate);

        if(!signAgreement||gapZ>cfg.maxTargetGapZ||refI2>cfg.maxReferenceHeterogeneityI2){
          status='FAILED';
          if(!signAgreement) reasons.push('target effect direction conflicts with pooled reference direction');
          if(gapZ>cfg.maxTargetGapZ) reasons.push('target effect differs materially from pooled reference effect');
          if(refI2>cfg.maxReferenceHeterogeneityI2) reasons.push('reference environments are too heterogeneous for stable transport');
        } else if(gapZ>cfg.cautionTargetGapZ||refI2>cfg.cautionReferenceHeterogeneityI2){
          status='FRAGILE';
          reasons.push('transportability is sensitive to target gap or reference heterogeneity');
        }
      }

      return {
        claimId,mechanismId,environmentId,
        deploymentTarget:targetRows.some(r=>r.deploymentTarget===true),
        status,
        referenceStudies:refs.length,
        targetStudies:targetRows.length,
        referenceEstimate:refPool?.estimate??null,
        referenceSe:refPool?.se??null,
        targetEstimate:targetPool?.estimate??null,
        targetSe:targetPool?.se??null,
        referenceI2:refI2,
        gapZ,
        signAgreement,
        reasons
      };
    });
  }).flat();

  let gate='PASS';
  const warnings=[];
  if(!findings.length||findings.every(x=>x.status==='INSUFFICIENT')){
    gate='INSUFFICIENT';
    warnings.push('insufficient transportability evidence');
  } else if(findings.some(x=>x.deploymentTarget&&x.status==='FAILED')){
    gate='ABSTAIN';
    warnings.push('deployment target fails transportability checks');
  } else if(findings.some(x=>x.status!=='TRANSPORTABLE')){
    gate='CAUTION';
    warnings.push('some environments have fragile/failed transportability');
  }

  if(blockedFuture) warnings.push(blockedFuture+' future transportability result(s) blocked');
  if(invalidRows) warnings.push(invalidRows+' invalid transportability result(s) rejected');

  return {
    version:TRANSPORTABILITY_VERSION,
    asOf:t,
    usableStudies:usable.length,
    blockedFuture,
    invalidRows,
    findings,
    gate,
    warnings,
    epistemic:'CROSS_ENVIRONMENT_COMPATIBILITY_DIAGNOSTIC_NOT_CAUSAL_IDENTIFICATION',
    executionMode:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecute:false
  };
}
