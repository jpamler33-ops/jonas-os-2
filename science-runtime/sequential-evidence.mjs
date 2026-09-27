export const SEQUENTIAL_EVIDENCE_VERSION='TCX_ALPHA30_SEQUENTIAL_EVIDENCE_V1';

const DEFAULTS=Object.freeze({
  minLooks:3,
  naiveZ:1.96,
  minPredeclaredFraction:.9,
  minFinalZ:1.96,
  maxEarlyLateSignFlips:0
});

function valid(r){
  return Boolean(
    r?.id&&r?.claimId&&r?.mechanismId&&
    r?.source?.trim?.()&&r?.version?.trim?.()&&r?.provenance?.trim?.()
  )&&
  Number.isFinite(Number(r?.timestamp))&&
  Number.isFinite(Number(r?.availableAt))&&
  Number(r.timestamp)<=Number(r.availableAt)&&
  Number.isInteger(Number(r?.lookIndex))&&Number(r.lookIndex)>=1&&
  Number.isInteger(Number(r?.plannedMaxLooks))&&
  Number(r.plannedMaxLooks)>=Number(r.lookIndex)&&
  Number.isFinite(Number(r?.cumulativeEffect))&&
  Number.isFinite(Number(r?.cumulativeStandardError))&&
  Number(r.cumulativeStandardError)>0&&
  [-1,0,1].includes(Number(r?.expectedSign));
}

/**
 * Alpha.30 adaptation: audits sequential monitoring for peeking/optional stopping.
 * It is a research-process integrity diagnostic, not market-direction evidence.
 */
export function evaluateSequentialEvidence(asOf,rows,options={}){
  const t=Number(asOf);
  if(!Number.isFinite(t)) throw new Error('asOf must be finite');
  if(!Array.isArray(rows)) throw new Error('rows must be an array');

  const cfg={...DEFAULTS,...options};
  const usable=[];
  let blockedFuture=0;
  let invalidLooks=0;

  for(const r of rows){
    if(!valid(r)){
      invalidLooks++;
      continue;
    }
    if(Number(r.timestamp)>t||Number(r.availableAt)>t){
      blockedFuture++;
      continue;
    }
    usable.push(structuredClone(r));
  }

  const keys=[...new Set(
    usable.map(r=>String(r.mechanismId)+'\u0000'+String(r.claimId))
  )];

  const findings=keys.map(key=>{
    const [mechanismId,claimId]=key.split('\u0000');
    const xs=usable
      .filter(r=>String(r.mechanismId)===mechanismId&&String(r.claimId)===claimId)
      .sort((a,b)=>
        Number(a.lookIndex)-Number(b.lookIndex)||
        Number(a.timestamp)-Number(b.timestamp)
      );

    const zs=xs.map(
      x=>Number(x.cumulativeEffect)/Number(x.cumulativeStandardError)
    );
    const planned=Math.max(1,...xs.map(x=>Number(x.plannedMaxLooks)));
    const anytimeBoundary=Math.sqrt(2*Math.log(Math.max(2,planned/.05)));
    const crossing=zs.findIndex(z=>Math.abs(z)>=cfg.naiveZ);
    const firstNaiveCrossingLook=
      crossing>=0?Number(xs[crossing].lookIndex):undefined;

    const maxAbsZ=Math.max(0,...zs.map(Math.abs));
    const finalZ=zs.at(-1)??0;
    const crossedAnytimeBoundary=maxAbsZ>=anytimeBoundary;
    const naiveCrossingRetained=
      crossing<0||Math.abs(finalZ)>=cfg.minFinalZ;

    let signFlips=0;
    for(let i=1;i<zs.length;i++){
      if(
        Math.sign(zs[i])!==0&&
        Math.sign(zs[i-1])!==0&&
        Math.sign(zs[i])!==Math.sign(zs[i-1])
      ){
        signFlips++;
      }
    }

    const predeclaredFraction=
      xs.length?xs.filter(x=>x.predeclared===true).length/xs.length:0;

    const sufficient=xs.length>=cfg.minLooks;
    const reasons=[];
    let status='STABLE';

    if(!sufficient){
      status='INSUFFICIENT';
      reasons.push('insufficient sequential looks for optional-stopping audit');
    } else if(
      (crossing>=0&&!naiveCrossingRetained)||
      predeclaredFraction<cfg.minPredeclaredFraction||
      signFlips>cfg.maxEarlyLateSignFlips
    ){
      status='OPTIONAL_STOPPING_RISK';
      reasons.push('sequential trajectory is compatible with peeking/optional-stopping sensitivity');
    } else if(crossing>=0&&!crossedAnytimeBoundary){
      status='PEEK_SENSITIVE';
      reasons.push('nominal significance occurs without crossing the conservative anytime-style boundary');
    }

    if(
      firstNaiveCrossingLook!==undefined&&
      firstNaiveCrossingLook<planned&&
      !naiveCrossingRetained
    ){
      reasons.push('early nominal crossing disappears by the latest available look');
    }

    if(predeclaredFraction<cfg.minPredeclaredFraction){
      reasons.push('sequential look schedule is insufficiently predeclared');
    }

    return {
      claimId,
      mechanismId,
      looks:xs.length,
      plannedMaxLooks:planned,
      predeclaredFraction,
      maxAbsZ,
      finalZ,
      firstNaiveCrossingLook,
      anytimeBoundary,
      crossedAnytimeBoundary,
      naiveCrossingRetained,
      signFlips,
      status,
      reasons
    };
  });

  const mechanisms=[...new Set(findings.map(f=>f.mechanismId))].map(mechanismId=>{
    const fs=findings.filter(f=>f.mechanismId===mechanismId);
    let status='INSUFFICIENT';
    if(fs.some(f=>f.status==='OPTIONAL_STOPPING_RISK')) status='OPTIONAL_STOPPING_RISK';
    else if(fs.some(f=>f.status==='PEEK_SENSITIVE')) status='PEEK_SENSITIVE';
    else if(fs.length&&fs.every(f=>f.status==='STABLE')) status='STABLE';
    return {mechanismId,status};
  });

  let gate='PASS';
  const warnings=[];

  if(!findings.length||findings.every(f=>f.status==='INSUFFICIENT')){
    gate='INSUFFICIENT';
    warnings.push('insufficient sequential evidence history');
  } else if(findings.some(f=>f.status==='OPTIONAL_STOPPING_RISK')){
    gate='ABSTAIN';
    warnings.push('optional-stopping/peeking risk detected in sequential evidence');
  } else if(findings.some(f=>['PEEK_SENSITIVE','INSUFFICIENT'].includes(f.status))){
    gate='CAUTION';
    warnings.push('some evidence is nominally significant but not robust to sequential monitoring');
  }

  if(blockedFuture) warnings.push(blockedFuture+' future sequential look(s) blocked');
  if(invalidLooks) warnings.push(invalidLooks+' invalid sequential look(s) rejected');

  return {
    version:SEQUENTIAL_EVIDENCE_VERSION,
    asOf:t,
    usableLooks:usable.length,
    blockedFuture,
    invalidLooks,
    findings,
    mechanisms,
    gate,
    warnings,
    epistemic:'RESEARCH_PROCESS_SEQUENTIAL_ROBUSTNESS_DIAGNOSTIC',
    executionMode:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecute:false
  };
}
