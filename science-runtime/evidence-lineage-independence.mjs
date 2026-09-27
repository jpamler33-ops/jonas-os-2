export const EVIDENCE_LINEAGE_INDEPENDENCE_VERSION='TCX_ALPHA30_EVIDENCE_LINEAGE_INDEPENDENCE_V1';

const DEFAULTS=Object.freeze({
  minEvidenceItems:3,
  minIndependentComponents:3,
  cautionMaxComponentShare:.5,
  hardMaxComponentShare:.75
});

function valid(r){
  return Boolean(
    r?.id&&r?.claimId&&r?.mechanismId&&r?.witnessId&&
    r?.source&&r?.version&&r?.provenance
  )&&
  Array.isArray(r?.lineage)&&r.lineage.length>0&&
  r.lineage.every(x=>typeof x==='string'&&x.trim())&&
  Number.isFinite(Number(r?.timestamp))&&
  Number.isFinite(Number(r?.availableAt))&&
  Number(r.timestamp)<=Number(r.availableAt);
}

function unique(xs){return [...new Set(xs)];}

class DSU{
  constructor(n){this.p=Array.from({length:n},(_,i)=>i);}
  find(x){return this.p[x]===x?x:(this.p[x]=this.find(this.p[x]));}
  union(a,b){a=this.find(a);b=this.find(b);if(a!==b)this.p[b]=a;}
}

/**
 * Audits whether nominally separate evidence items are actually independent
 * after shared upstream lineage is accounted for.
 */
export function evaluateEvidenceLineageIndependence(asOf,rows,options={}){
  const t=Number(asOf);
  if(!Number.isFinite(t)) throw new Error('asOf must be finite');
  if(!Array.isArray(rows)) throw new Error('rows must be an array');

  const cfg={...DEFAULTS,...options};
  const invalidRows=rows.filter(x=>!valid(x)).length;
  const validRows=rows.filter(valid);
  const blockedFuture=validRows.filter(x=>Number(x.timestamp)>t||Number(x.availableAt)>t).length;
  const usable=validRows.filter(x=>Number(x.timestamp)<=t&&Number(x.availableAt)<=t);

  const keys=unique(usable.map(r=>String(r.mechanismId)+'\u0000'+String(r.claimId)));
  const findings=keys.map(key=>{
    const [mechanismId,claimId]=key.split('\u0000');
    const xs=usable.filter(r=>String(r.mechanismId)===mechanismId&&String(r.claimId)===claimId);
    const dsu=new DSU(xs.length);
    const tokenOwners=new Map();

    xs.forEach((r,i)=>{
      for(const raw of r.lineage){
        const token=String(raw).trim();
        const owners=tokenOwners.get(token)??[];
        for(const j of owners) dsu.union(i,j);
        owners.push(i);
        tokenOwners.set(token,owners);
      }
    });

    const components=new Map();
    xs.forEach((r,i)=>{
      const root=dsu.find(i);
      const arr=components.get(root)??[];
      arr.push(r);
      components.set(root,arr);
    });

    const componentList=[...components.values()].map(items=>({
      size:items.length,
      witnessIds:unique(items.map(x=>String(x.witnessId))),
      evidenceIds:items.map(x=>String(x.id)),
      sharedLineage:unique(
        items.flatMap(x=>x.lineage).filter(token=>
          items.filter(y=>y.lineage.includes(token)).length>1
        )
      )
    })).sort((a,b)=>b.size-a.size);

    const independentComponents=componentList.length;
    const nominalEvidence=xs.length;
    const maxComponentShare=nominalEvidence
      ? (componentList[0]?.size??0)/nominalEvidence
      : 0;
    const requiredIndependent=Math.max(
      1,
      Number(xs.find(x=>Number.isFinite(Number(x.requiredIndependent)))?.requiredIndependent??cfg.minIndependentComponents)
    );

    const reasons=[];
    let status='INDEPENDENT';

    if(nominalEvidence<cfg.minEvidenceItems){
      status='INSUFFICIENT';
      reasons.push('too few evidence items for independence audit');
    } else if(independentComponents<requiredIndependent){
      status='DEPENDENT';
      reasons.push('shared upstream lineage collapses nominal witnesses below required independence');
    } else if(maxComponentShare>cfg.hardMaxComponentShare){
      status='DEPENDENT';
      reasons.push('one lineage component dominates the evidence set');
    } else if(maxComponentShare>cfg.cautionMaxComponentShare||independentComponents<nominalEvidence){
      status='PARTIALLY_DEPENDENT';
      reasons.push('some nominal evidence items share upstream lineage');
    }

    return {
      claimId,mechanismId,
      deploymentTarget:xs.some(x=>x.deploymentTarget===true),
      nominalEvidence,
      uniqueWitnesses:unique(xs.map(x=>String(x.witnessId))).length,
      independentComponents,
      requiredIndependent,
      maxComponentShare,
      components:componentList,
      status,
      reasons
    };
  });

  let gate='PASS';
  const warnings=[];
  if(!findings.length||findings.every(x=>x.status==='INSUFFICIENT')){
    gate='INSUFFICIENT';
    warnings.push('insufficient evidence-lineage information');
  } else if(findings.some(x=>x.deploymentTarget&&x.status==='DEPENDENT')){
    gate='ABSTAIN';
    warnings.push('deployment-relevant evidence lacks required upstream independence');
  } else if(findings.some(x=>x.status!=='INDEPENDENT')){
    gate='CAUTION';
    warnings.push('some evidence is partially dependent or insufficient');
  }

  if(blockedFuture) warnings.push(blockedFuture+' future evidence item(s) blocked');
  if(invalidRows) warnings.push(invalidRows+' invalid evidence item(s) rejected');

  return {
    version:EVIDENCE_LINEAGE_INDEPENDENCE_VERSION,
    asOf:t,
    usableEvidence:usable.length,
    blockedFuture,
    invalidRows,
    findings,
    gate,
    warnings,
    epistemic:'EVIDENCE_LINEAGE_INDEPENDENCE_DIAGNOSTIC_NOT_EFFECT_ESTIMATE',
    executionMode:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecute:false
  };
}
