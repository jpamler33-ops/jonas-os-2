import { sha256 } from '../institutional-kernel.mjs';

export const EPISTEMIC_INTEGRITY_VERSION='TCX_ALPHA76_EPISTEMIC_INTEGRITY_V1';
export const IDENTIFICATION_EVIDENCE_PLAN_VERSION='TCX_ALPHA75_IDENTIFICATION_EVIDENCE_PLAN_V1';
export const EVIDENCE_PLAN_SUFFICIENCY_VERSION='TCX_ALPHA76_EVIDENCE_PLAN_SUFFICIENCY_V1';

export const IDENTIFICATION_STATUSES=Object.freeze([
  'IDENTIFIED','PARTIALLY_IDENTIFIED','UNIDENTIFIED'
]);

export const IDENTIFICATION_OBLIGATION_KINDS=Object.freeze([
  'CLOSURE_EVIDENCE',
  'DEPENDENCY_MAPPING',
  'COMMON_CAUSE_METADATA',
  'LINEAGE_FACT',
  'LINEAGE_COVERAGE',
  'COVERAGE_CALIBRATION',
  'DISCOVERY_CHANNEL_LINEAGE',
  'RESOLVE_COMMON_CAUSE'
]);

const OBLIGATION_TO_EVIDENCE=Object.freeze({
  CLOSURE_EVIDENCE:'OBSERVED_PROVENANCE_CLOSURE',
  DEPENDENCY_MAPPING:'OBSERVED_DEPENDENCY_MAP',
  COMMON_CAUSE_METADATA:'OBSERVED_COMMON_CAUSE_MAP',
  LINEAGE_FACT:'OBSERVED_LINEAGE_FACT',
  LINEAGE_COVERAGE:'OBSERVED_LINEAGE_COVERAGE',
  COVERAGE_CALIBRATION:'OBSERVED_COVERAGE_CALIBRATION',
  DISCOVERY_CHANNEL_LINEAGE:'OBSERVED_DISCOVERY_CHANNEL_LINEAGE',
  RESOLVE_COMMON_CAUSE:'OBSERVED_COMMON_CAUSE_RESOLUTION'
});

const DOMINATES_GENERIC=new Set([
  'LINEAGE_FACT',
  'LINEAGE_COVERAGE',
  'COMMON_CAUSE_METADATA',
  'RESOLVE_COMMON_CAUSE',
  'DISCOVERY_CHANNEL_LINEAGE'
]);

function finite(v){const n=Number(v);return Number.isFinite(n)?n:null;}
function text(v){return String(v??'').trim();}
function uniq(xs){return [...new Set((xs||[]).map(String).filter(Boolean))].sort();}
function deepFreeze(v){
  if(v&&typeof v==='object'&&!Object.isFrozen(v)){
    Object.freeze(v);
    for(const x of Object.values(v)) deepFreeze(x);
  }
  return v;
}
function obligation(kind,{assumptionId=null,claimId=null,detail=null,problemCodes=[]}={}){
  const k=String(kind);
  if(!IDENTIFICATION_OBLIGATION_KINDS.includes(k)) throw new Error('unknown identification obligation: '+k);
  return {
    kind:k,
    assumptionId:assumptionId==null?null:String(assumptionId),
    claimId:claimId==null?null:String(claimId),
    detail:detail==null?null:String(detail),
    problemCodes:uniq(problemCodes.length?problemCodes:[k])
  };
}
function obligationKey(x){
  return [x.kind,x.assumptionId??'',x.claimId??'',x.detail??''].join('\u0000');
}
function dedupeObligations(rows){
  const map=new Map();
  for(const row of rows||[]){
    const key=obligationKey(row);
    const prior=map.get(key);
    if(!prior) map.set(key,{...row,problemCodes:uniq(row.problemCodes)});
    else prior.problemCodes=uniq([...(prior.problemCodes||[]),...(row.problemCodes||[])]);
  }
  return [...map.values()].sort((a,b)=>a.kind.localeCompare(b.kind)||String(a.assumptionId??'').localeCompare(String(b.assumptionId??'')));
}
function pitUsable(row,asOf){
  const observedAt=finite(row?.observedAt??row?.timestamp);
  const availableAt=finite(row?.availableAt);
  return observedAt!=null&&availableAt!=null&&observedAt<=availableAt&&availableAt<=asOf;
}
function canonicalAuthorityMap(authorities,asOf){
  const map=new Map();
  for(const row of authorities||[]){
    if(!pitUsable(row,asOf)) continue;
    const id=text(row?.authorityId);
    const controller=text(row?.canonicalControllerId);
    if(id&&controller) map.set(id,controller);
  }
  return map;
}
function resolverIndependenceKey(row,authorityMap){
  const authorityController=authorityMap.get(text(row?.authorityId))||text(row?.authorityControllerId)||'UNKNOWN_AUTHORITY_CONTROLLER';
  return [
    text(row?.operatorDomain)||'UNKNOWN_OPERATOR',
    text(row?.trustDomain)||'UNKNOWN_TRUST',
    text(row?.controlDomain)||'UNKNOWN_CONTROL',
    authorityController
  ].join('|');
}
function evaluateIdentity(asOf,resolverClaims,authorities,requiredResolverConsensus){
  const authorityMap=canonicalAuthorityMap(authorities,asOf);
  const usable=(resolverClaims||[]).filter(row=>
    pitUsable(row,asOf)&&
    row?.signed===true&&
    row?.signatureValid===true&&
    text(row?.resolverId)&&
    text(row?.canonicalControllerId)
  );
  const byController=new Map();
  for(const row of usable){
    const controller=text(row.canonicalControllerId);
    const bucket=byController.get(controller)||[];
    bucket.push(row);
    byController.set(controller,bucket);
  }
  const groups=[...byController.entries()].map(([controllerId,rows])=>{
    const independenceKeys=uniq(rows.map(r=>resolverIndependenceKey(r,authorityMap)));
    const authorityControllers=uniq(rows.map(r=>authorityMap.get(text(r.authorityId))||text(r.authorityControllerId)||'UNKNOWN'));
    return {
      controllerId,
      claims:rows.length,
      independentClaims:independenceKeys.length,
      independenceKeys,
      authorityControllers,
      resolverIds:uniq(rows.map(r=>r.resolverId))
    };
  }).sort((a,b)=>b.independentClaims-a.independentClaims||a.controllerId.localeCompare(b.controllerId));

  const qualified=groups.filter(x=>x.independentClaims>=requiredResolverConsensus);
  let status='INSUFFICIENT';
  let canonicalControllerId=null;
  const reasons=[];
  if(qualified.length===1){
    status='RESOLVED';
    canonicalControllerId=qualified[0].controllerId;
  }else if(qualified.length>1){
    status='AMBIGUOUS';
    reasons.push('MULTIPLE_CANONICAL_CONTROLLERS_REACH_CONSENSUS');
  }else{
    reasons.push('INSUFFICIENT_INDEPENDENT_RESOLVER_CONSENSUS');
  }
  if((resolverClaims||[]).some(r=>finite(r?.availableAt)>asOf)) reasons.push('FUTURE_RESOLVER_CLAIMS_BLOCKED');
  return {status,canonicalControllerId,requiredResolverConsensus,usableClaims:usable.length,groups,reasons};
}

function buildLineageIndex(lineageFacts,asOf){
  const rows=(lineageFacts||[]).filter(row=>pitUsable(row,asOf));
  const byId=new Map(rows.map(row=>[text(row.id),row]).filter(([id])=>id));
  return {rows,byId};
}
function lineageClosureFor(rootIds,lineage,asOf){
  const missing=new Set();
  const cycles=new Set();
  const future=new Set();
  const nonObservedLeaves=new Set();
  const visited=new Set();
  const visiting=new Set();

  const walk=id=>{
    const key=text(id);
    if(!key) return;
    if(visiting.has(key)){cycles.add(key);return;}
    if(visited.has(key)) return;
    const row=lineage.byId.get(key);
    if(!row){missing.add(key);return;}
    if(!pitUsable(row,asOf)){future.add(key);return;}
    visiting.add(key);
    const parents=uniq(row.parentIds);
    if(!parents.length&&String(row.classification||'').toUpperCase()!=='OBSERVED') nonObservedLeaves.add(key);
    for(const parent of parents) walk(parent);
    visiting.delete(key);
    visited.add(key);
  };
  for(const id of uniq(rootIds)) walk(id);
  return {
    closed:missing.size===0&&cycles.size===0&&future.size===0&&nonObservedLeaves.size===0,
    visited:uniq([...visited]),
    missing:uniq([...missing]),
    cycles:uniq([...cycles]),
    future:uniq([...future]),
    nonObservedLeaves:uniq([...nonObservedLeaves])
  };
}

function evaluateClaims({asOf,claims,assumptions,evidence,lineage}){
  const assumptionMap=new Map((assumptions||[]).map(x=>[text(x.assumptionId),x]).filter(([id])=>id));
  const evidenceMap=new Map((evidence||[]).map(x=>[text(x.evidenceId),x]).filter(([id])=>id));
  const findings=[];
  const obligations=[];

  for(const claim of claims||[]){
    const claimId=text(claim?.claimId);
    if(!claimId) continue;
    const required=claim?.required!==false;
    const assumptionIds=uniq(claim?.assumptionIds);
    const evidenceIds=uniq(claim?.evidenceIds);
    const missingAssumptions=assumptionIds.filter(id=>!assumptionMap.has(id));
    const usableEvidence=evidenceIds.filter(id=>{
      const row=evidenceMap.get(id);
      return row&&String(row.classification||'').toUpperCase()==='OBSERVED'&&pitUsable(row,asOf);
    });
    const missingEvidence=evidenceIds.filter(id=>!usableEvidence.includes(id));
    const lineageIds=uniq(usableEvidence.flatMap(id=>evidenceMap.get(id)?.provenanceIds||[]));
    const closure=lineageClosureFor(lineageIds,lineage,asOf);
    const leaveOneOutFragile=required&&usableEvidence.length<=1;

    for(const assumptionId of missingAssumptions){
      obligations.push(obligation('DEPENDENCY_MAPPING',{assumptionId,claimId,detail:'ASSUMPTION_DEFINITION_MISSING'}));
    }
    if(required&&(!evidenceIds.length||missingEvidence.length)){
      obligations.push(obligation('CLOSURE_EVIDENCE',{claimId,detail:'REQUIRED_OBSERVED_PIT_EVIDENCE_MISSING'}));
    }
    if(required&&!closure.closed){
      for(const id of closure.missing){
        obligations.push(obligation('LINEAGE_FACT',{claimId,detail:id,problemCodes:['PROVENANCE_CLOSURE']}));
      }
      obligations.push(obligation('CLOSURE_EVIDENCE',{claimId,detail:'PROVENANCE_NOT_CLOSED'}));
    }

    findings.push({
      claimId,required,assumptionIds,evidenceIds,
      usableEvidenceIds:usableEvidence,
      missingAssumptions,
      missingEvidence,
      leaveOneOutFragile,
      provenanceClosure:closure,
      status:(!missingAssumptions.length&&(!required||usableEvidence.length>0)&&closure.closed)
        ?(leaveOneOutFragile?'FRAGILE':'SUPPORTED')
        :'UNSUPPORTED'
    });
  }
  return {findings,obligations};
}

function evaluateDependencies({asOf,assumptions,dependencies}){
  const assumptionIds=uniq((assumptions||[]).map(x=>x?.assumptionId));
  const usable=(dependencies||[]).filter(x=>pitUsable(x,asOf));
  const obligations=[];
  const statuses=[];
  const commonCauseConflicts=[];

  if(assumptionIds.length>1&&usable.length===0){
    for(const assumptionId of assumptionIds){
      obligations.push(obligation('DEPENDENCY_MAPPING',{assumptionId,detail:'NO_PIT_DEPENDENCY_MAP'}));
    }
  }

  for(const dep of usable){
    const from=text(dep?.fromAssumptionId);
    const to=text(dep?.toAssumptionId);
    const status=IDENTIFICATION_STATUSES.includes(String(dep?.status||'').toUpperCase())
      ?String(dep.status).toUpperCase()
      :'UNIDENTIFIED';
    statuses.push(status);
    if(status!=='IDENTIFIED'){
      obligations.push(obligation('DEPENDENCY_MAPPING',{assumptionId:from||to||null,detail:status,problemCodes:['DEPENDENCY_'+status]}));
    }
    if(!Array.isArray(dep?.commonCauseIds)){
      obligations.push(obligation('COMMON_CAUSE_METADATA',{assumptionId:from||to||null,detail:'COMMON_CAUSE_FIELD_MISSING'}));
    }else if(dep.commonCauseIds.length){
      commonCauseConflicts.push({fromAssumptionId:from,toAssumptionId:to,commonCauseIds:uniq(dep.commonCauseIds)});
      obligations.push(obligation('RESOLVE_COMMON_CAUSE',{assumptionId:from||to||null,detail:uniq(dep.commonCauseIds).join(','),problemCodes:['SHARED_COMMON_CAUSE']}));
    }
  }

  let status='IDENTIFIED';
  if(!usable.length&&assumptionIds.length>1) status='UNIDENTIFIED';
  else if(statuses.includes('UNIDENTIFIED')) status='UNIDENTIFIED';
  else if(statuses.includes('PARTIALLY_IDENTIFIED')) status='PARTIALLY_IDENTIFIED';

  return {status,usableDependencies:usable.length,commonCauseConflicts,obligations};
}

function evaluateCoverage({asOf,coverage,evidence}){
  const obligations=[];
  const observed=Math.max(0,Number(coverage?.observedLineages)||0);
  const expected=finite(coverage?.expectedLineages);
  const minimum=Math.max(0,Math.min(1,Number(coverage?.minimumCoverage??0.8)));
  const ratio=expected!=null&&expected>0?Math.min(1,observed/expected):null;
  const calibrationEvidenceId=text(coverage?.calibrationEvidenceId);
  const calibrationEvidence=(evidence||[]).find(x=>text(x?.evidenceId)===calibrationEvidenceId);
  const calibrated=coverage?.calibrated===true&&
    calibrationEvidence&&
    String(calibrationEvidence.classification||'').toUpperCase()==='OBSERVED'&&
    pitUsable(calibrationEvidence,asOf);

  if(expected==null||expected<=0){
    obligations.push(obligation('LINEAGE_COVERAGE',{detail:'EXPECTED_LINEAGE_SPACE_UNKNOWN',problemCodes:['OPEN_WORLD_COVERAGE_UNKNOWN']}));
  }else if(ratio<minimum){
    obligations.push(obligation('LINEAGE_COVERAGE',{detail:'COVERAGE_BELOW_MINIMUM',problemCodes:['LINEAGE_COVERAGE_LOW']}));
  }
  if(!calibrated){
    obligations.push(obligation('COVERAGE_CALIBRATION',{detail:'OBSERVED_PIT_CALIBRATION_REQUIRED'}));
  }
  return {
    status:(ratio!=null&&ratio>=minimum&&calibrated)?'CALIBRATED':'INSUFFICIENT',
    observedLineages:observed,
    expectedLineages:expected,
    coverageRatio:ratio,
    minimumCoverage:minimum,
    calibrated:Boolean(calibrated),
    obligations
  };
}

function evaluateDiscoveryChannels({asOf,discoveryChannels}){
  const usable=(discoveryChannels||[]).filter(x=>pitUsable(x,asOf));
  const obligations=[];
  for(const row of usable){
    if(!Array.isArray(row?.lineageIds)||!row.lineageIds.length){
      obligations.push(obligation('DISCOVERY_CHANNEL_LINEAGE',{detail:text(row?.channelId)||'UNKNOWN_CHANNEL'}));
    }
  }
  const controllerIds=uniq(usable.map(x=>x?.controllerId));
  const independent=usable.length>=2&&controllerIds.length>=2;
  if(usable.length&&usable.length>=2&&!independent){
    obligations.push(obligation('RESOLVE_COMMON_CAUSE',{detail:'DISCOVERY_CHANNELS_SHARE_CONTROLLER',problemCodes:['DISCOVERY_CHANNEL_DEPENDENCE']}));
  }
  return {
    status:usable.length<2?'INSUFFICIENT':independent?'INDEPENDENT':'DEPENDENT',
    channels:usable.length,
    independentControllers:controllerIds.length,
    obligations
  };
}

export function evaluateEpistemicIntegrity({
  asOf,
  subjectId='UNKNOWN',
  resolverClaims=[],
  authorities=[],
  claims=[],
  assumptions=[],
  dependencies=[],
  lineageFacts=[],
  discoveryChannels=[],
  evidence=[],
  coverage={},
  requiredResolverConsensus=2
}={}){
  const t=finite(asOf);
  if(t==null) throw new Error('epistemic integrity asOf must be finite');
  const lineage=buildLineageIndex(lineageFacts,t);
  const identity=evaluateIdentity(t,resolverClaims,authorities,Math.max(2,Math.floor(Number(requiredResolverConsensus)||2)));
  const claimSupport=evaluateClaims({asOf:t,claims,assumptions,evidence,lineage});
  const dependency=evaluateDependencies({asOf:t,assumptions,dependencies});
  const coverageResult=evaluateCoverage({asOf:t,coverage,evidence});
  const discovery=evaluateDiscoveryChannels({asOf:t,discoveryChannels});

  const trustRoots=uniq((resolverClaims||[])
    .filter(x=>pitUsable(x,t))
    .flatMap(x=>x?.provenanceIds||[]));
  const trustClosure=lineageClosureFor(trustRoots,lineage,t);
  const obligations=[
    ...claimSupport.obligations,
    ...dependency.obligations,
    ...coverageResult.obligations,
    ...discovery.obligations
  ];
  if(identity.status!=='RESOLVED'){
    obligations.push(obligation('CLOSURE_EVIDENCE',{detail:'CANONICAL_CONTROLLER_NOT_RESOLVED',problemCodes:['ENTITY_RESOLUTION']}));
  }
  if(!trustClosure.closed){
    obligations.push(obligation('CLOSURE_EVIDENCE',{detail:'TRUST_CHAIN_NOT_CLOSED',problemCodes:['TRUST_CHAIN']}));
    for(const id of trustClosure.missing) obligations.push(obligation('LINEAGE_FACT',{detail:id,problemCodes:['TRUST_CHAIN']}));
  }

  const allObligations=dedupeObligations(obligations);
  const fragileClaims=claimSupport.findings.filter(x=>x.leaveOneOutFragile).map(x=>x.claimId);
  let identificationStatus=dependency.status;
  if(identity.status!=='RESOLVED'||!trustClosure.closed||coverageResult.status!=='CALIBRATED'||discovery.status!=='INDEPENDENT'){
    identificationStatus=identificationStatus==='UNIDENTIFIED'?'UNIDENTIFIED':'PARTIALLY_IDENTIFIED';
  }
  if(allObligations.some(x=>['DEPENDENCY_MAPPING','LINEAGE_FACT','CLOSURE_EVIDENCE'].includes(x.kind))){
    identificationStatus='UNIDENTIFIED';
  }

  let gate='PASS';
  const reasons=[];
  if(identity.status!=='RESOLVED'){gate='ABSTAIN';reasons.push('ENTITY_IDENTITY_NOT_RESOLVED');}
  if(!trustClosure.closed){gate='ABSTAIN';reasons.push('TRUST_CHAIN_INCOMPLETE');}
  if(identificationStatus!=='IDENTIFIED'){gate='ABSTAIN';reasons.push('DEPENDENCY_IDENTIFICATION_INCOMPLETE');}
  if(dependency.commonCauseConflicts.length){gate='ABSTAIN';reasons.push('COMMON_CAUSE_UNRESOLVED');}
  if(coverageResult.status!=='CALIBRATED'){gate='ABSTAIN';reasons.push('OPEN_WORLD_COVERAGE_UNRESOLVED');}
  if(discovery.status!=='INDEPENDENT'){gate='ABSTAIN';reasons.push('DISCOVERY_CHANNEL_INDEPENDENCE_UNPROVEN');}
  if(claimSupport.findings.some(x=>x.required&&x.status==='UNSUPPORTED')){gate='ABSTAIN';reasons.push('REQUIRED_CLAIM_UNSUPPORTED');}
  if(gate==='PASS'&&fragileClaims.length){gate='CAUTION';reasons.push('LEAVE_ONE_OUT_FRAGILITY');}

  const core={
    version:EPISTEMIC_INTEGRITY_VERSION,
    asOf:t,
    subjectId:String(subjectId),
    identity,
    trustClosure,
    claimSupport:claimSupport.findings,
    dependency,
    coverage:coverageResult,
    discovery,
    identificationStatus,
    obligations:allObligations,
    fragileClaims,
    gate,
    reasons:uniq(reasons),
    semantics:{
      resolverConsensusRequiresIndependence:true,
      authorityAliasesDoNotCreateIndependence:true,
      trustChainFailClosed:true,
      pointInTimeBoundaryRequired:true,
      commonCauseAware:true,
      openWorldCoverageAware:true,
      evidencePlanCannotClearAbstain:true
    },
    executionMode:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecute:false
  };
  return deepFreeze({...core,fingerprint:sha256(core)});
}

export function verifyEpistemicIntegrity(value){
  try{
    if(value?.version!==EPISTEMIC_INTEGRITY_VERSION) return {ok:false,reasons:['VERSION_INVALID']};
    if(value?.executionMode!=='SHADOW_ONLY'||value?.action!=='ABSTAIN'||value?.canExecute!==false){
      return {ok:false,reasons:['SAFETY_INVARIANT_INVALID']};
    }
    const {fingerprint,...core}=value;
    const expected=sha256(core);
    return fingerprint===expected
      ?{ok:true,reasons:[],expectedFingerprint:expected}
      :{ok:false,reasons:['FINGERPRINT_MISMATCH'],expectedFingerprint:expected};
  }catch(err){
    return {ok:false,reasons:['EPISTEMIC_INTEGRITY_INVALID',err instanceof Error?err.message:String(err)]};
  }
}

export function buildIdentificationEvidencePlan(report){
  const integrity=verifyEpistemicIntegrity(report);
  if(!integrity.ok) throw new Error('epistemic integrity report invalid');
  const raw=[];
  for(const ob of report.obligations||[]){
    const evidenceKind=OBLIGATION_TO_EVIDENCE[ob.kind];
    if(!evidenceKind) continue;
    raw.push({
      evidenceKind,
      assumptionId:ob.assumptionId??null,
      claimId:ob.claimId??null,
      addresses:uniq(ob.problemCodes?.length?ob.problemCodes:[ob.kind]),
      requiredClassification:'OBSERVED',
      pitRequired:true
    });
  }

  const genericKeys=new Set(raw
    .filter(x=>x.evidenceKind==='OBSERVED_PROVENANCE_CLOSURE')
    .map(x=>String(x.assumptionId??'')+'\u0000'+String(x.claimId??'')));
  const specificKeys=new Set((report.obligations||[])
    .filter(x=>DOMINATES_GENERIC.has(x.kind))
    .map(x=>String(x.assumptionId??'')+'\u0000'+String(x.claimId??'')));

  const map=new Map();
  for(const item of raw){
    const scope=String(item.assumptionId??'')+'\u0000'+String(item.claimId??'');
    if(item.evidenceKind==='OBSERVED_PROVENANCE_CLOSURE'&&genericKeys.has(scope)&&specificKeys.has(scope)) continue;
    const key=item.evidenceKind+'\u0000'+String(item.assumptionId??'');
    const prior=map.get(key);
    if(!prior) map.set(key,{...item});
    else prior.addresses=uniq([...prior.addresses,...item.addresses]);
  }

  const items=[...map.values()]
    .map(item=>({
      ...item,
      priority:item.addresses.length
    }))
    .sort((a,b)=>b.priority-a.priority||a.evidenceKind.localeCompare(b.evidenceKind)||String(a.assumptionId??'').localeCompare(String(b.assumptionId??'')))
    .map((item,index)=>deepFreeze({
      planItemId:sha256({version:IDENTIFICATION_EVIDENCE_PLAN_VERSION,index,...item}),
      ...item
    }));

  const core={
    version:IDENTIFICATION_EVIDENCE_PLAN_VERSION,
    sourceIntegrityFingerprint:report.fingerprint,
    sourceGate:report.gate,
    sourceIdentificationStatus:report.identificationStatus,
    items,
    rankingSemantics:'IDENTIFICATION_PROBLEM_COVERAGE_ONLY',
    excludes:Object.freeze(['PNL','CONFIDENCE_SCORE','FORECAST_UPSIDE']),
    action:'ACQUIRE_EVIDENCE_THEN_REVALIDATE',
    clearsAbstain:false,
    executionMode:'SHADOW_ONLY',
    canExecute:false
  };
  return deepFreeze({...core,fingerprint:sha256(core)});
}

export function evaluateEvidencePlanSufficiency({report,plan}={}){
  const rv=verifyEpistemicIntegrity(report);
  if(!rv.ok) throw new Error('epistemic integrity report invalid');
  if(plan?.version!==IDENTIFICATION_EVIDENCE_PLAN_VERSION) throw new Error('identification evidence plan invalid');
  const requiredKinds=new Set((report.obligations||[]).map(x=>OBLIGATION_TO_EVIDENCE[x.kind]).filter(Boolean));
  const plannedKinds=new Set((plan.items||[]).map(x=>x.evidenceKind));
  const missing=[...requiredKinds].filter(x=>!plannedKinds.has(x)).sort();
  const invalidItems=(plan.items||[]).filter(x=>x.requiredClassification!=='OBSERVED'||x.pitRequired!==true);
  const conditional=(report.obligations||[]).some(x=>x.kind==='LINEAGE_COVERAGE');

  let status='SUFFICIENT_CANDIDATE';
  const reasons=[];
  if(missing.length||invalidItems.length){
    status='INSUFFICIENT';
    if(missing.length) reasons.push('REQUIRED_EVIDENCE_KIND_UNPLANNED');
    if(invalidItems.length) reasons.push('PLAN_CONTAINS_NON_OBSERVED_OR_NON_PIT_EVIDENCE');
  }else if(conditional){
    status='CONDITIONAL';
    reasons.push('OPEN_WORLD_COVERAGE_MAY_EXPOSE_NEW_OBLIGATIONS');
  }

  const core={
    version:EVIDENCE_PLAN_SUFFICIENCY_VERSION,
    sourceIntegrityFingerprint:report.fingerprint,
    planFingerprint:plan.fingerprint,
    status,
    missingEvidenceKinds:missing,
    invalidPlanItems:invalidItems.map(x=>x.planItemId),
    reasons,
    requiredEvidenceClassification:'OBSERVED',
    pitRequired:true,
    requiresFullReidentificationAfterAssimilation:true,
    mayExposeNewDependencies:true,
    clearsAbstain:false,
    executionMode:'SHADOW_ONLY',
    canExecute:false
  };
  return deepFreeze({...core,fingerprint:sha256(core)});
}
