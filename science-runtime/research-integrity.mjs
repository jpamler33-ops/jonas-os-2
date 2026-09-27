export const RESEARCH_INTEGRITY_VERSION='TCX_ALPHA30_RESEARCH_INTEGRITY_V1';

const DEFAULTS=Object.freeze({
  maxValidationAdaptiveReuses:1,
  maxValidationVersions:2,
  requireSealedFinalConfirmation:true
});

function unique(xs){return [...new Set(xs)];}

function validRow(x){
  return Boolean(
    x?.id&&x?.claimId&&x?.mechanismId&&x?.datasetId&&x?.partitionId&&
    x?.experimentId&&x?.systemVersion&&x?.source&&x?.version&&x?.provenance
  )&&
  Number.isFinite(Number(x?.timestamp))&&
  Number.isFinite(Number(x?.availableAt))&&
  Number(x.timestamp)<=Number(x.availableAt);
}

/**
 * Alpha.30 adaptation of the research-lineage guard.
 * It audits whether validation/holdout evidence has been adaptively spent.
 * It does not estimate market direction, causality or return.
 */
export function evaluateResearchIntegrity(asOf,rows,options={}){
  const t=Number(asOf);
  if(!Number.isFinite(t)) throw new Error('asOf must be finite');
  if(!Array.isArray(rows)) throw new Error('rows must be an array');

  const cfg={...DEFAULTS,...options};
  const invalidRows=rows.filter(x=>!validRow(x)).length;
  const valid=rows.filter(validRow);
  const blockedFuture=valid.filter(x=>Number(x.timestamp)>t||Number(x.availableAt)>t).length;
  const usable=valid.filter(x=>Number(x.timestamp)<=t&&Number(x.availableAt)<=t);
  const mechanismIds=unique(usable.map(x=>String(x.mechanismId)));

  const mechanisms=mechanismIds.map(mechanismId=>{
    const mine=usable
      .filter(x=>String(x.mechanismId)===mechanismId)
      .sort((a,b)=>Number(a.timestamp)-Number(b.timestamp)||Number(a.availableAt)-Number(b.availableAt));

    const keys=unique(mine.map(x=>`${x.datasetId}::${x.partitionId}`));

    const partitionAudits=keys.map(key=>{
      const xs=mine
        .filter(x=>`${x.datasetId}::${x.partitionId}`===key)
        .sort((a,b)=>Number(a.timestamp)-Number(b.timestamp)||Number(a.availableAt)-Number(b.availableAt));

      const [datasetId,partitionId]=key.split('::');
      const reasons=[];
      let adaptiveReuses=0;
      let sealedReuses=0;
      let priorRevealed=false;
      let priorInformedChange=false;

      for(let i=0;i<xs.length;i++){
        const x=xs[i];
        if(i>0&&priorRevealed&&(priorInformedChange||xs[i-1].systemVersion!==x.systemVersion)){
          adaptiveReuses++;
        }
        if(i>0&&x.role==='SEALED_HOLDOUT'&&priorRevealed){
          sealedReuses++;
        }
        priorRevealed ||= Boolean(x.resultRevealed);
        priorInformedChange ||= Boolean(x.resultRevealed&&x.informedChange);
      }

      const purposes=unique(xs.map(x=>x.purpose));
      const roles=unique(xs.map(x=>x.role));
      const discoveryToConfirmationReuse=
        purposes.includes('FINAL_CONFIRMATION')&&
        purposes.some(p=>p!=='FINAL_CONFIRMATION');

      const distinctSystemVersions=unique(xs.map(x=>x.systemVersion)).length;
      const revealedExposures=xs.filter(x=>x.resultRevealed).length;

      if(discoveryToConfirmationReuse){
        reasons.push('same partition was used for development/model selection and final confirmation');
      }
      if(sealedReuses>0){
        reasons.push('sealed holdout was reused after its result had been revealed');
      }
      if(roles.includes('VALIDATION')&&adaptiveReuses>cfg.maxValidationAdaptiveReuses){
        reasons.push('validation partition was adaptively reused across research iterations');
      }
      if(roles.includes('VALIDATION')&&distinctSystemVersions>cfg.maxValidationVersions){
        reasons.push('validation partition evaluated too many system versions');
      }

      const contaminated=
        discoveryToConfirmationReuse||
        sealedReuses>0||
        (roles.includes('VALIDATION')&&adaptiveReuses>cfg.maxValidationAdaptiveReuses);

      return {
        datasetId:datasetId??key,
        partitionId:partitionId??key,
        roles,
        purposes,
        exposures:xs.length,
        revealedExposures,
        distinctSystemVersions,
        adaptiveReuses,
        sealedReuses,
        discoveryToConfirmationReuse,
        contaminated,
        reasons
      };
    });

    const confirmationRows=mine.filter(x=>x.purpose==='FINAL_CONFIRMATION');

    const cleanFinalConfirmation=confirmationRows.some(row=>{
      const audit=partitionAudits.find(p=>p.datasetId===row.datasetId&&p.partitionId===row.partitionId);
      return Boolean(audit&&!audit.contaminated&&audit.purposes.length===1);
    });

    const sealedFinalConfirmation=confirmationRows.some(row=>{
      const audit=partitionAudits.find(p=>p.datasetId===row.datasetId&&p.partitionId===row.partitionId);
      return row.role==='SEALED_HOLDOUT'&&
        Boolean(audit&&!audit.contaminated&&audit.purposes.length===1&&audit.revealedExposures<=1);
    });

    const reasons=partitionAudits.flatMap(x=>x.reasons);
    let status='CLEAN';

    if(partitionAudits.some(x=>x.contaminated)){
      status='CONTAMINATED';
    } else if(!cleanFinalConfirmation||(cfg.requireSealedFinalConfirmation&&!sealedFinalConfirmation)){
      status=confirmationRows.length?'DEGRADED':'INSUFFICIENT';
      reasons.push(
        confirmationRows.length
          ? 'final confirmation lacks a clean sealed holdout'
          : 'no final confirmation exposure recorded'
      );
    } else if(partitionAudits.some(x=>x.adaptiveReuses>0||x.distinctSystemVersions>1)){
      status='DEGRADED';
      reasons.push('research loop reused validation evidence adaptively even though final holdout remained clean');
    }

    return {
      mechanismId,
      claims:unique(mine.map(x=>x.claimId)),
      status,
      partitionAudits,
      cleanFinalConfirmation,
      sealedFinalConfirmation,
      totalExposures:mine.length,
      blockedFuture:valid.filter(
        x=>String(x.mechanismId)===mechanismId&&
        (Number(x.timestamp)>t||Number(x.availableAt)>t)
      ).length,
      reasons:unique(reasons)
    };
  });

  let gate='PASS';
  const warnings=[];

  if(!mechanisms.length){
    gate='INSUFFICIENT';
    warnings.push('no point-in-time research-lineage evidence available');
  } else if(mechanisms.some(x=>x.status==='CONTAMINATED')){
    gate='ABSTAIN';
    warnings.push('adaptive data reuse contaminated at least one mechanism validation path');
  } else if(mechanisms.some(x=>x.status==='DEGRADED'||x.status==='INSUFFICIENT')){
    gate='CAUTION';
    warnings.push('some mechanism validation paths lack a clean sealed confirmation');
  }

  if(blockedFuture)warnings.push(`${blockedFuture} future research exposure record(s) blocked`);
  if(invalidRows)warnings.push(`${invalidRows} invalid research exposure record(s) rejected`);

  return {
    version:RESEARCH_INTEGRITY_VERSION,
    asOf:t,
    usableExposures:usable.length,
    blockedFuture,
    invalidRows,
    mechanisms,
    gate,
    warnings,
    epistemic:'RESEARCH_LINEAGE_INTEGRITY_DIAGNOSTIC',
    executionMode:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecute:false
  };
}
