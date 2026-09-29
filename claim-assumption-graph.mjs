import { sha256 } from './institutional-kernel.mjs';

export const CLAIM_ASSUMPTION_GRAPH_VERSION='TCX_CLAIM_ASSUMPTION_GRAPH_V1';
export const CLAIM_ASSUMPTION_REVISION_VERSION='TCX_CLAIM_ASSUMPTION_REVISION_V1';

const EPISTEMIC_CLASSES=Object.freeze(['OBSERVED','INFERRED','MODELLED','ASSUMED']);

const deepFreeze=value=>{
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    Object.freeze(value);
    for(const v of Object.values(value)) deepFreeze(v);
  }
  return value;
};
const finalized=core=>deepFreeze({...core,fingerprint:sha256(core)});
const text=(v,f='')=>String(v??f).trim();
const uniq=xs=>[...new Set((xs||[]).map(String).filter(Boolean))].sort();
const finite=(v,name)=>{
  const n=Number(v);
  if(!Number.isFinite(n)) throw new Error(name+' must be finite');
  return n;
};
const optionalFinite=(v,name)=>{
  if(v==null) return null;
  return finite(v,name);
};
const id=(v,name)=>{
  const s=text(v);
  if(!s) throw new Error(name+' is required');
  if(s.length>180) throw new Error(name+' too long');
  return s;
};
const classification=v=>{
  const s=text(v).toUpperCase();
  if(!EPISTEMIC_CLASSES.includes(s)) throw new Error('invalid epistemic classification '+s);
  return s;
};
const optionalHash64=(v,name)=>{
  if(v==null) return null;
  const s=text(v).toLowerCase();
  if(!/^[a-f0-9]{64}$/.test(s)) throw new Error(name+' must be a sha256 hex string');
  return s;
};
const timed=(row,kind,asOf)=>{
  const availableAt=finite(row?.availableAt,kind+'.availableAt');
  if(availableAt>asOf) throw new Error('future '+kind+' blocked');
  const observedAt=optionalFinite(row?.observedAt,kind+'.observedAt');
  if(observedAt!=null&&observedAt>availableAt) throw new Error(kind+' observedAt cannot exceed availableAt');
  const validUntil=optionalFinite(row?.validUntil,kind+'.validUntil');
  if(validUntil!=null&&validUntil<availableAt) throw new Error(kind+' validUntil cannot predate availableAt');
  return {availableAt,observedAt,validUntil};
};
const addNode=(map,node)=>{
  const prior=map.get(node.id);
  if(prior&&sha256(prior)!==sha256(node)) throw new Error('node id conflict '+node.id);
  if(!prior) map.set(node.id,node);
};
const addEdge=(map,from,to,relation)=>{
  const row={from,to,relation};
  const key=from+'\u0000'+to+'\u0000'+relation;
  if(!map.has(key)) map.set(key,row);
};
const graphCore=graph=>{
  const {fingerprint,...core}=graph||{};
  return core;
};

function cyclePaths(assumptionIds,dependencyRows){
  const adj=new Map(assumptionIds.map(x=>[x,[]]));
  for(const row of dependencyRows){
    if(adj.has(row.fromAssumptionId)&&adj.has(row.toAssumptionId)){
      adj.get(row.fromAssumptionId).push(row.toAssumptionId);
    }
  }
  const visiting=new Set(),visited=new Set(),stack=[],cycles=[];
  function walk(x){
    if(visiting.has(x)){
      const at=stack.indexOf(x);
      cycles.push([...stack.slice(at),x]);
      return;
    }
    if(visited.has(x)) return;
    visiting.add(x);
    stack.push(x);
    for(const y of adj.get(x)||[]) walk(y);
    stack.pop();
    visiting.delete(x);
    visited.add(x);
  }
  for(const x of assumptionIds) walk(x);
  const seen=new Set();
  return cycles.filter(c=>{
    const k=c.join('>');
    if(seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function assumptionImpact({claims,assumptions,dependencies},assumptionId){
  const target=String(assumptionId);
  const reverse=new Map(assumptions.map(x=>[x.assumptionId,[]]));
  for(const row of dependencies){
    const list=reverse.get(row.toAssumptionId)||[];
    list.push(row.fromAssumptionId);
    reverse.set(row.toAssumptionId,list);
  }
  const affectedAssumptions=new Set([target]);
  const queue=[target];
  while(queue.length){
    const x=queue.shift();
    for(const dependent of reverse.get(x)||[]){
      if(affectedAssumptions.has(dependent)) continue;
      affectedAssumptions.add(dependent);
      queue.push(dependent);
    }
  }
  const affectedClaims=claims
    .filter(c=>c.assumptionIds.some(x=>affectedAssumptions.has(x)))
    .map(c=>c.claimId)
    .sort();
  return {
    assumptionId:target,
    affectedAssumptionIds:[...affectedAssumptions].sort(),
    affectedClaimIds:affectedClaims,
    affectedRequiredClaimIds:claims
      .filter(c=>c.required&&c.assumptionIds.some(x=>affectedAssumptions.has(x)))
      .map(c=>c.claimId)
      .sort()
  };
}

export function buildClaimAssumptionGraph({
  asOf,
  subjectId,
  claims=[],
  assumptions=[],
  evidence=[],
  dependencies=[],
  sourceTraceId=null,
  provenance={source:'TCX_CLAIM_ASSUMPTION_RESEARCH',version:'V1'}
}={}){
  const t=finite(asOf,'asOf');
  const subject=id(subjectId,'subjectId');
  const nodeMap=new Map();
  const edgeMap=new Map();

  const evidenceRows=(evidence||[]).map((row,index)=>{
    const evidenceId=id(row?.evidenceId,'evidence['+index+'].evidenceId');
    const time=timed(row,'evidence['+evidenceId+']',t);
    const normalized={
      evidenceId,
      classification:classification(row?.classification),
      statement:text(row?.statement)||null,
      provenanceIds:uniq(row?.provenanceIds),
      ...time
    };
    addNode(nodeMap,{
      id:'EVIDENCE:'+evidenceId,
      type:'EVIDENCE',
      ...normalized,
      state:time.validUntil!=null&&time.validUntil<t?'EXPIRED':'PIT_VALID'
    });
    return normalized;
  });
  const evidenceMap=new Map(evidenceRows.map(x=>[x.evidenceId,x]));

  const assumptionRows=(assumptions||[]).map((row,index)=>{
    const assumptionId=id(row?.assumptionId,'assumptions['+index+'].assumptionId');
    const time=timed(row,'assumption['+assumptionId+']',t);
    const evidenceIds=uniq(row?.evidenceIds);
    const missingEvidenceIds=evidenceIds.filter(x=>!evidenceMap.has(x));
    const expiredEvidenceIds=evidenceIds.filter(x=>evidenceMap.get(x)?.validUntil!=null&&evidenceMap.get(x).validUntil<t);
    const expired=time.validUntil!=null&&time.validUntil<t;
    const requiresEvidence=row?.requiresEvidence===true;
    const supportState=missingEvidenceIds.length
      ?'EVIDENCE_REFERENCE_MISSING'
      :expiredEvidenceIds.length
        ?'EVIDENCE_EXPIRED'
        :evidenceIds.length
          ?'EVIDENCE_LINKED'
          :requiresEvidence?'REQUIRED_SUPPORT_MISSING':'EXPLICIT_ASSUMPTION';
    const normalized={
      assumptionId,
      statement:id(row?.statement,'assumption['+assumptionId+'].statement'),
      epistemicClass:'ASSUMED',
      evidenceIds,
      requiresEvidence,
      missingEvidenceIds,
      expiredEvidenceIds,
      supportState,
      ...time,
      state:expired?'EXPIRED':'ACTIVE'
    };
    addNode(nodeMap,{id:'ASSUMPTION:'+assumptionId,type:'ASSUMPTION',...normalized});
    for(const evidenceId of evidenceIds){
      if(evidenceMap.has(evidenceId)) addEdge(edgeMap,'EVIDENCE:'+evidenceId,'ASSUMPTION:'+assumptionId,'SUPPORTS_ASSUMPTION');
    }
    return normalized;
  });
  const assumptionMap=new Map(assumptionRows.map(x=>[x.assumptionId,x]));

  const claimRows=(claims||[]).map((row,index)=>{
    const claimId=id(row?.claimId,'claims['+index+'].claimId');
    const time=timed(row,'claim['+claimId+']',t);
    const assumptionIds=uniq(row?.assumptionIds);
    const evidenceIds=uniq(row?.evidenceIds);
    const missingAssumptionIds=assumptionIds.filter(x=>!assumptionMap.has(x));
    const missingEvidenceIds=evidenceIds.filter(x=>!evidenceMap.has(x));
    const expiredEvidenceIds=evidenceIds.filter(x=>evidenceMap.get(x)?.validUntil!=null&&evidenceMap.get(x).validUntil<t);
    const expiredAssumptionIds=assumptionIds.filter(x=>assumptionMap.get(x)?.state==='EXPIRED');
    const required=row?.required!==false;
    const normalized={
      claimId,
      statement:id(row?.statement,'claim['+claimId+'].statement'),
      epistemicClass:classification(row?.epistemicClass??'INFERRED'),
      required,
      assumptionIds,
      evidenceIds,
      missingAssumptionIds,
      missingEvidenceIds,
      expiredEvidenceIds,
      expiredAssumptionIds,
      assumptionDeclaration:assumptionIds.length?'EXPLICIT':'NONE_DECLARED',
      ...time,
      state:missingAssumptionIds.length||missingEvidenceIds.length||expiredEvidenceIds.length||expiredAssumptionIds.length
        ?'AUDIT_DEFECT'
        :'PIT_VALID'
    };
    addNode(nodeMap,{id:'CLAIM:'+claimId,type:'CLAIM',...normalized});
    for(const assumptionId of assumptionIds){
      if(assumptionMap.has(assumptionId)) addEdge(edgeMap,'CLAIM:'+claimId,'ASSUMPTION:'+assumptionId,'DEPENDS_ON_ASSUMPTION');
    }
    for(const evidenceId of evidenceIds){
      if(evidenceMap.has(evidenceId)) addEdge(edgeMap,'EVIDENCE:'+evidenceId,'CLAIM:'+claimId,'SUPPORTS_CLAIM');
    }
    return normalized;
  });

  const dependencyRows=(dependencies||[]).map((row,index)=>{
    const fromAssumptionId=id(row?.fromAssumptionId,'dependencies['+index+'].fromAssumptionId');
    const toAssumptionId=id(row?.toAssumptionId,'dependencies['+index+'].toAssumptionId');
    const time=timed(row,'dependency['+fromAssumptionId+'>'+toAssumptionId+']',t);
    const commonCauseIds=uniq(row?.commonCauseIds);
    const normalized={
      fromAssumptionId,
      toAssumptionId,
      relation:text(row?.relation||'DEPENDS_ON').toUpperCase(),
      commonCauseIds,
      missingFrom:!assumptionMap.has(fromAssumptionId),
      missingTo:!assumptionMap.has(toAssumptionId),
      ...time
    };
    if(!normalized.missingFrom&&!normalized.missingTo){
      addEdge(edgeMap,'ASSUMPTION:'+fromAssumptionId,'ASSUMPTION:'+toAssumptionId,'DEPENDS_ON_ASSUMPTION');
    }
    return normalized;
  });

  const cycles=cyclePaths(assumptionRows.map(x=>x.assumptionId),dependencyRows);
  const claimDefects=claimRows.flatMap(c=>[
    ...c.missingAssumptionIds.map(assumptionId=>({kind:'MISSING_ASSUMPTION_DEFINITION',claimId:c.claimId,assumptionId})),
    ...c.missingEvidenceIds.map(evidenceId=>({kind:'MISSING_CLAIM_EVIDENCE',claimId:c.claimId,evidenceId})),
    ...c.expiredEvidenceIds.map(evidenceId=>({kind:'EXPIRED_CLAIM_EVIDENCE',claimId:c.claimId,evidenceId})),
    ...c.expiredAssumptionIds.map(assumptionId=>({kind:'EXPIRED_ASSUMPTION_USED',claimId:c.claimId,assumptionId}))
  ]);
  const assumptionDefects=assumptionRows.flatMap(a=>[
    ...a.missingEvidenceIds.map(evidenceId=>({kind:'MISSING_ASSUMPTION_EVIDENCE',assumptionId:a.assumptionId,evidenceId})),
    ...a.expiredEvidenceIds.map(evidenceId=>({kind:'EXPIRED_ASSUMPTION_EVIDENCE',assumptionId:a.assumptionId,evidenceId})),
    ...(a.supportState==='REQUIRED_SUPPORT_MISSING'?[{kind:'REQUIRED_ASSUMPTION_SUPPORT_MISSING',assumptionId:a.assumptionId}]:[])
  ]);
  const dependencyDefects=dependencyRows.flatMap(d=>[
    ...(d.missingFrom?[{kind:'MISSING_DEPENDENCY_FROM_ASSUMPTION',assumptionId:d.fromAssumptionId}]:[]),
    ...(d.missingTo?[{kind:'MISSING_DEPENDENCY_TO_ASSUMPTION',assumptionId:d.toAssumptionId}]:[])
  ]);
  const cycleDefects=cycles.map(path=>({kind:'ASSUMPTION_DEPENDENCY_CYCLE',path}));

  const impacts=assumptionRows.map(a=>assumptionImpact({
    claims:claimRows,
    assumptions:assumptionRows,
    dependencies:dependencyRows
  },a.assumptionId));
  const sharedAssumptions=impacts
    .filter(x=>x.affectedClaimIds.length>1)
    .map(x=>({
      assumptionId:x.assumptionId,
      directlyOrTransitivelyAffectedClaims:x.affectedClaimIds.length,
      affectedRequiredClaims:x.affectedRequiredClaimIds.length
    }))
    .sort((a,b)=>b.directlyOrTransitivelyAffectedClaims-a.directlyOrTransitivelyAffectedClaims||a.assumptionId.localeCompare(b.assumptionId));

  const defects=[...claimDefects,...assumptionDefects,...dependencyDefects,...cycleDefects];
  const requiredClaimDefects=new Set(claimDefects
    .filter(d=>claimRows.find(c=>c.claimId===d.claimId)?.required)
    .map(d=>d.claimId));

  const core={
    version:CLAIM_ASSUMPTION_GRAPH_VERSION,
    subjectId:subject,
    asOf:t,
    sourceTraceId:optionalHash64(sourceTraceId,'sourceTraceId'),
    nodes:[...nodeMap.values()].sort((a,b)=>a.id.localeCompare(b.id)),
    edges:[...edgeMap.values()].sort((a,b)=>a.from.localeCompare(b.from)||a.to.localeCompare(b.to)||a.relation.localeCompare(b.relation)),
    diagnostics:{
      claimCount:claimRows.length,
      assumptionCount:assumptionRows.length,
      evidenceCount:evidenceRows.length,
      dependencyCount:dependencyRows.length,
      explicitAssumptionLinks:claimRows.reduce((s,x)=>s+x.assumptionIds.length,0),
      claimsWithNoDeclaredAssumptions:claimRows.filter(x=>!x.assumptionIds.length).map(x=>x.claimId).sort(),
      expiredAssumptionIds:assumptionRows.filter(x=>x.state==='EXPIRED').map(x=>x.assumptionId).sort(),
      explicitUnsupportedAssumptionIds:assumptionRows.filter(x=>x.supportState==='EXPLICIT_ASSUMPTION').map(x=>x.assumptionId).sort(),
      sharedAssumptions,
      assumptionCycles:cycles,
      defects,
      defectCount:defects.length,
      affectedRequiredClaimCount:requiredClaimDefects.size,
      researchGate:defects.length?'AUDIT_DEFECTS_PRESENT':'AUDIT_GRAPH_READY'
    },
    assumptionImpacts:impacts,
    semantics:{
      assumptionCountIsNotConfidence:true,
      sharedAssumptionIsNotNecessarilyInvalid:true,
      explicitAssumptionWithoutEvidenceIsAllowedUnlessEvidenceRequired:true,
      futureRecordsBlocked:true,
      retrospectiveMutationForbidden:true,
      graphDoesNotGrantTruth:true
    },
    provenance:{
      source:id(provenance?.source,'provenance.source'),
      version:id(provenance?.version,'provenance.version')
    },
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canInfluencePrimary:false,
    canExecuteLive:false
  };
  return finalized(core);
}

export function verifyClaimAssumptionGraph(graph){
  try{
    if(graph?.version!==CLAIM_ASSUMPTION_GRAPH_VERSION) return {ok:false,reasons:['VERSION_INVALID']};
    if(graph?.execution!=='SHADOW_ONLY'||graph?.action!=='ABSTAIN'||graph?.canInfluencePrimary!==false||graph?.canExecuteLive!==false){
      return {ok:false,reasons:['SAFETY_INVARIANT_INVALID']};
    }
    const expected=sha256(graphCore(graph));
    return graph?.fingerprint===expected
      ?{ok:true,reasons:[],expectedFingerprint:expected}
      :{ok:false,reasons:['FINGERPRINT_MISMATCH'],expectedFingerprint:expected};
  }catch(err){
    return {ok:false,reasons:['CLAIM_ASSUMPTION_GRAPH_INVALID',err instanceof Error?err.message:String(err)]};
  }
}

export function claimAssumptionInvalidationImpact(graph,assumptionId){
  const v=verifyClaimAssumptionGraph(graph);
  if(!v.ok) throw new Error('claim-assumption graph invalid');
  const target=id(assumptionId,'assumptionId');
  const row=(graph.assumptionImpacts||[]).find(x=>x.assumptionId===target);
  if(!row) throw new Error('assumption missing');
  return deepFreeze({
    version:CLAIM_ASSUMPTION_GRAPH_VERSION,
    graphFingerprint:graph.fingerprint,
    ...structuredClone(row),
    counterfactualOnly:true,
    mutatesOriginalGraph:false,
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canInfluencePrimary:false,
    canExecuteLive:false
  });
}

function nodeHashes(graph,type){
  return new Map((graph.nodes||[])
    .filter(x=>x.type===type)
    .map(x=>[x.id,sha256(x)]));
}

export function compareClaimAssumptionGraphs(before,after){
  const bv=verifyClaimAssumptionGraph(before);
  const av=verifyClaimAssumptionGraph(after);
  if(!bv.ok||!av.ok) throw new Error('both claim-assumption graphs must be valid');
  if(before.subjectId!==after.subjectId) throw new Error('subject mismatch');
  if(Number(after.asOf)<Number(before.asOf)) throw new Error('revision cannot move backward in time');

  const changes={};
  for(const type of ['CLAIM','ASSUMPTION','EVIDENCE']){
    const a=nodeHashes(before,type),b=nodeHashes(after,type);
    const added=[...b.keys()].filter(x=>!a.has(x)).sort();
    const removed=[...a.keys()].filter(x=>!b.has(x)).sort();
    const changed=[...b.keys()].filter(x=>a.has(x)&&a.get(x)!==b.get(x)).sort();
    changes[type.toLowerCase()]={added,removed,changed};
  }
  const beforeDefects=new Set((before.diagnostics?.defects||[]).map(x=>sha256(x)));
  const afterDefects=(after.diagnostics?.defects||[]);
  const newDefects=afterDefects.filter(x=>!beforeDefects.has(sha256(x)));

  const core={
    version:CLAIM_ASSUMPTION_REVISION_VERSION,
    subjectId:before.subjectId,
    beforeFingerprint:before.fingerprint,
    afterFingerprint:after.fingerprint,
    beforeAsOf:before.asOf,
    afterAsOf:after.asOf,
    changes,
    defectDelta:Number(after.diagnostics?.defectCount||0)-Number(before.diagnostics?.defectCount||0),
    newDefects,
    rewritesHistoricalGraph:false,
    semantics:{
      revisionIsSeparateArtifact:true,
      laterDiscoveryDoesNotBackdateOriginalState:true
    },
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canInfluencePrimary:false,
    canExecuteLive:false
  };
  return finalized(core);
}

export function claimAssumptionGraphSummary(graph){
  const v=verifyClaimAssumptionGraph(graph);
  return deepFreeze({
    version:CLAIM_ASSUMPTION_GRAPH_VERSION,
    subjectId:graph?.subjectId??null,
    asOf:graph?.asOf??null,
    integrity:v.ok?'VALID':'INVALID',
    claimCount:Number(graph?.diagnostics?.claimCount||0),
    assumptionCount:Number(graph?.diagnostics?.assumptionCount||0),
    explicitAssumptionLinks:Number(graph?.diagnostics?.explicitAssumptionLinks||0),
    defectCount:Number(graph?.diagnostics?.defectCount||0),
    affectedRequiredClaimCount:Number(graph?.diagnostics?.affectedRequiredClaimCount||0),
    sharedAssumptionCount:Array.isArray(graph?.diagnostics?.sharedAssumptions)?graph.diagnostics.sharedAssumptions.length:0,
    researchGate:graph?.diagnostics?.researchGate??'UNKNOWN',
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canInfluencePrimary:false,
    canExecuteLive:false
  });
}
