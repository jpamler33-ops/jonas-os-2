import { sha256 } from './institutional-kernel.mjs';

export const RESEARCH_DEPENDENCY_GRAPH_VERSION='TCX_RESEARCH_DEPENDENCY_GRAPH_V2';

const HEX64=/^[a-f0-9]{64}$/i;
const SOURCE_BLOCKING=new Set(['QUARANTINED','FAILED','REJECTED']);
const SOURCE_DEGRADED=new Set(['DEGRADED','RECOVERING']);
const DECISION_BLOCKING=new Set(['QUARANTINE','REJECT']);
const NODE_RANK=Object.freeze({SOURCE:0,OBSERVATION:1,FEATURE:2,FACTOR:3,FORECAST:4,DECISION:5});

function finite(v){
  const n=Number(v);
  return Number.isFinite(n)?n:null;
}
function nonEmpty(v,name,max=240){
  const s=String(v??'').trim();
  if(!s) throw new Error(name+' is required');
  if(s.length>max) throw new Error(name+' too long');
  return s;
}
function cleanStatus(v,fallback='UNKNOWN'){
  const s=String(v??fallback).trim().toUpperCase();
  return s||fallback;
}
function deepFreeze(value){
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    Object.freeze(value);
    for(const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}
function uniqueSorted(xs){
  return [...new Set((xs||[]).map(String))].sort();
}
function sourceKeyOf(record){
  return String(record?.governance?.sourceKey||String(record?.domain||'').toUpperCase()+':'+String(record?.source||''));
}
function observationId(record){
  const hash=String(record?.recordHash||'');
  return 'OBSERVATION:'+(HEX64.test(hash)?hash:sha256({
    streamKey:record?.streamKey,
    domain:record?.domain,
    source:record?.source,
    sourceEventId:record?.sourceEventId,
    availableAt:record?.availableAt,
    features:record?.features
  }));
}
function graphCore(graph){
  const {fingerprint,...core}=graph||{};
  return core;
}
function addNode(map,node){
  const prior=map.get(node.id);
  if(!prior){
    map.set(node.id,node);
    return;
  }
  if(sha256(prior)!==sha256(node)) throw new Error('NODE_ID_CONFLICT:'+node.id);
}
function addEdge(map,from,to,relation){
  const edge={from,to,relation};
  const key=from+'\u0000'+to+'\u0000'+relation;
  if(!map.has(key)) map.set(key,edge);
}
function sourceStatusLookup(governanceSummary,knowledgeTime){
  const updatedAt=finite(governanceSummary?.updatedAt);
  const usable=updatedAt!=null&&updatedAt<=knowledgeTime;
  const byKey=new Map();
  if(usable){
    for(const row of Array.isArray(governanceSummary?.sources)?governanceSummary.sources:[]){
      const key=String(row?.sourceKey||'');
      if(key) byKey.set(key,cleanStatus(row?.status));
    }
  }
  return {usable,updatedAt,byKey};
}
function sourceAssessment(record,currentStatus,requireGoverned,dependencyRows=[]){
  const governance=record?.governance||null;
  const decision=cleanStatus(governance?.decision,'UNGOVERNED');
  const recordStatus=cleanStatus(governance?.sourceStatus,'UNOBSERVED');
  const status=cleanStatus(currentStatus||recordStatus,recordStatus);
  const ungoverned=!governance;
  const dependencyBlocked=(dependencyRows||[]).some(x=>x.state==='BLOCKED');
  const dependencyDegraded=!dependencyBlocked&&(dependencyRows||[]).some(x=>x.state==='DEGRADED');
  const blocked=
    (requireGoverned&&ungoverned)||
    SOURCE_BLOCKING.has(status)||
    DECISION_BLOCKING.has(decision)||
    governance?.usableForResearch===false||
    dependencyBlocked;
  const degraded=!blocked&&(SOURCE_DEGRADED.has(status)||decision==='DEGRADED'||dependencyDegraded);
  return {
    status,
    decision,
    governed:!ungoverned,
    usable:!blocked,
    degraded,
    dependencyBlocked,
    dependencyDegraded,
    dependencies:Object.freeze((dependencyRows||[]).map(x=>Object.freeze({...x}))),
    state:blocked?'BLOCKED':degraded?'DEGRADED':'HEALTHY'
  };
}

function derivedDependencyRows(record,statusView){
  const deps=uniqueSorted(Array.isArray(record?.provenance?.dependencies)?record.provenance.dependencies:[]);
  return deps.map(sourceKey=>{
    const known=statusView.usable?statusView.byKey.get(sourceKey):null;
    const status=cleanStatus(known,'UNOBSERVED');
    const observed=known!=null;
    const state=!observed||SOURCE_BLOCKING.has(status)
      ?'BLOCKED'
      :SOURCE_DEGRADED.has(status)
        ?'DEGRADED'
        :'HEALTHY';
    return Object.freeze({sourceKey,status,observed,state});
  });
}
function factorState(featureStates){
  const xs=featureStates||[];
  if(!xs.length) return 'INSUFFICIENT';
  if(xs.every(x=>x==='BLOCKED')) return 'BLOCKED';
  if(xs.some(x=>x!=='HEALTHY')) return 'DEGRADED';
  return 'HEALTHY';
}

export function buildResearchDependencyGraph({
  plane,
  governanceSummary=null,
  streamKey,
  asOf,
  knowledgeTime=null,
  forecastInputFingerprint=null,
  requireGoverned=true
}={}){
  const sk=nonEmpty(streamKey,'streamKey',64).toUpperCase();
  const t=finite(asOf);
  if(t==null) throw new Error('asOf must be finite');
  const kt=knowledgeTime==null?t:finite(knowledgeTime);
  if(kt==null) throw new Error('knowledgeTime must be finite');
  if(kt<t) throw new Error('knowledgeTime cannot predate asOf');
  const fp=forecastInputFingerprint==null?null:String(forecastInputFingerprint).toLowerCase();
  if(fp!=null&&!HEX64.test(fp)) throw new Error('forecastInputFingerprint must be sha256 hex');

  const reasons=[];
  const planeHealthy=plane?.healthy===true;
  if(!planeHealthy) reasons.push('RDP_UNHEALTHY');
  const records=planeHealthy&&Array.isArray(plane?.records)?plane.records:[];
  const retainedTimes=records.map(x=>finite(x?.availableAt)).filter(x=>x!=null);
  const earliestRetainedAvailableAt=retainedTimes.length?Math.min(...retainedTimes):null;
  const historyTruncated=Number(plane?.totalRecords||0)>records.length&&earliestRetainedAvailableAt!=null&&t<earliestRetainedAvailableAt;
  if(historyTruncated) reasons.push('HISTORY_TRUNCATED_BEFORE_ASOF');

  const statusView=sourceStatusLookup(governanceSummary,kt);
  if(governanceSummary&&!statusView.usable) reasons.push('GOVERNANCE_VIEW_AFTER_KNOWLEDGE_TIME_IGNORED');

  const candidates=records
    .filter(r=>String(r?.streamKey||'').toUpperCase()===sk)
    .filter(r=>{
      const availableAt=finite(r?.availableAt);
      const validUntil=finite(r?.validUntil);
      return availableAt!=null&&validUntil!=null&&availableAt<=t&&validUntil>=t;
    })
    .sort((a,b)=>Number(b.availableAt)-Number(a.availableAt)||Number(b.seq||0)-Number(a.seq||0));

  const latestBySourceFeature=new Map();
  for(const record of candidates){
    const sourceKey=sourceKeyOf(record);
    for(const row of Array.isArray(record?.features)?record.features:[]){
      const id=String(row?.id||'');
      if(!id) continue;
      const key=sourceKey+'\u0000'+id;
      if(!latestBySourceFeature.has(key)) latestBySourceFeature.set(key,{record,row,sourceKey});
    }
  }

  const nodeMap=new Map();
  const edgeMap=new Map();
  const featureContributors=new Map();
  const factorFeatures=new Map();
  const derivedSourceDependencies=[];

  for(const {record,row,sourceKey} of latestBySourceFeature.values()){
    const currentStatus=statusView.byKey.get(sourceKey)||null;
    const dependencyRows=derivedDependencyRows(record,statusView);
    const assessment=sourceAssessment(record,currentStatus,requireGoverned===true,dependencyRows);
    const sourceNodeId='SOURCE:'+sourceKey;
    const obsNodeId=observationId(record);
    const featureNodeId='FEATURE:'+String(row.id);
    const factorId='FACTOR:'+String(record.domain||'UNKNOWN').toUpperCase();

    addNode(nodeMap,{
      id:sourceNodeId,
      type:'SOURCE',
      sourceKey,
      domain:String(record.domain||'').toUpperCase(),
      source:String(record.source||''),
      status:assessment.status,
      state:assessment.state,
      upstreamSourceKeys:Object.freeze(assessment.dependencies.map(x=>x.sourceKey)),
      upstreamState:assessment.dependencyBlocked?'BLOCKED':assessment.dependencyDegraded?'DEGRADED':assessment.dependencies.length?'HEALTHY':'NONE'
    });
    if(assessment.dependencies.length){
      derivedSourceDependencies.push({derivedSourceNodeId:sourceNodeId,dependencies:assessment.dependencies});
    }
    addNode(nodeMap,{
      id:obsNodeId,
      type:'OBSERVATION',
      recordHash:String(record.recordHash||''),
      seq:Number(record.seq||0),
      sourceKey,
      sourceEventId:String(record.sourceEventId||''),
      availableAt:Number(record.availableAt),
      validUntil:Number(record.validUntil),
      governanceDecision:assessment.decision,
      governed:assessment.governed,
      usableForResearch:assessment.usable,
      state:assessment.state
    });
    addNode(nodeMap,{
      id:factorId,
      type:'FACTOR',
      domain:String(record.domain||'UNKNOWN').toUpperCase(),
      state:'PENDING'
    });

    addEdge(edgeMap,sourceNodeId,obsNodeId,'PRODUCED');
    addEdge(edgeMap,obsNodeId,featureNodeId,'EMITS_FEATURE');
    addEdge(edgeMap,featureNodeId,factorId,'ROLLS_UP_TO_FACTOR');

    const list=featureContributors.get(String(row.id))||[];
    list.push({
      sourceKey,
      observationId:obsNodeId,
      domain:String(record.domain||'UNKNOWN').toUpperCase(),
      availableAt:Number(record.availableAt),
      value:Number(row.value),
      state:assessment.state,
      usable:assessment.usable,
      degraded:assessment.degraded,
      dependencies:assessment.dependencies
    });
    featureContributors.set(String(row.id),list);

    const factorList=factorFeatures.get(String(record.domain||'UNKNOWN').toUpperCase())||[];
    if(!factorList.includes(String(row.id))) factorList.push(String(row.id));
    factorFeatures.set(String(record.domain||'UNKNOWN').toUpperCase(),factorList);
  }

  for(const derived of derivedSourceDependencies){
    for(const dependency of derived.dependencies){
      const depNodeId='SOURCE:'+dependency.sourceKey;
      if(!nodeMap.has(depNodeId)){
        const split=String(dependency.sourceKey).indexOf(':');
        const domain=split>=0?String(dependency.sourceKey).slice(0,split):'UNKNOWN';
        const source=split>=0?String(dependency.sourceKey).slice(split+1):String(dependency.sourceKey);
        addNode(nodeMap,{
          id:depNodeId,
          type:'SOURCE',
          sourceKey:dependency.sourceKey,
          domain,
          source,
          status:dependency.status,
          state:dependency.state,
          upstreamSourceKeys:Object.freeze([]),
          upstreamState:'NONE'
        });
      }
      addEdge(edgeMap,depNodeId,derived.derivedSourceNodeId,'DERIVES_SOURCE');
    }
  }

  const featureStates=new Map();
  for(const [featureId,contributors] of [...featureContributors.entries()].sort(([a],[b])=>a.localeCompare(b))){
    const usable=contributors.filter(x=>x.usable);
    let state='BLOCKED';
    if(usable.some(x=>!x.degraded)) state='HEALTHY';
    else if(usable.length) state='DEGRADED';
    featureStates.set(featureId,state);
    addNode(nodeMap,{
      id:'FEATURE:'+featureId,
      type:'FEATURE',
      featureId,
      state,
      contributorCount:contributors.length,
      usableContributorCount:usable.length,
      sourceKeys:uniqueSorted(contributors.map(x=>x.sourceKey))
    });
  }

  for(const [domain,featureIds] of factorFeatures.entries()){
    const states=featureIds.map(id=>featureStates.get(id)||'BLOCKED');
    nodeMap.set('FACTOR:'+domain,{
      id:'FACTOR:'+domain,
      type:'FACTOR',
      domain,
      state:factorState(states),
      featureCount:featureIds.length,
      blockedFeatures:states.filter(x=>x==='BLOCKED').length,
      degradedFeatures:states.filter(x=>x==='DEGRADED').length
    });
  }

  const featureIds=[...featureStates.keys()].sort();
  const states=featureIds.map(id=>featureStates.get(id));
  const healthyFeatures=states.filter(x=>x==='HEALTHY').length;
  const degradedFeatures=states.filter(x=>x==='DEGRADED').length;
  const blockedFeatures=states.filter(x=>x==='BLOCKED').length;
  const usableFeatures=healthyFeatures+degradedFeatures;
  const totalFeatures=featureIds.length;
  const coverage=totalFeatures?usableFeatures/totalFeatures:0;

  let gate='PASS';
  if(!planeHealthy||historyTruncated||blockedFeatures>0) gate='ABSTAIN';
  else if(totalFeatures===0) gate='INSUFFICIENT';
  else if(degradedFeatures>0) gate='CAUTION';
  if(totalFeatures===0) reasons.push('NO_ACTIVE_RESEARCH_FEATURES');
  if(blockedFeatures>0) reasons.push('BLOCKED_FEATURE_DEPENDENCIES');
  if(degradedFeatures>0) reasons.push('DEGRADED_FEATURE_DEPENDENCIES');

  const forecastNodeId='FORECAST_INPUT:'+(fp||sha256({streamKey:sk,asOf:t,planeTailHash:String(plane?.tailHash||'')}));
  addNode(nodeMap,{
    id:forecastNodeId,
    type:'FORECAST',
    inputFingerprint:fp,
    state:gate==='PASS'?'HEALTHY':gate==='CAUTION'?'DEGRADED':'BLOCKED',
    gate
  });
  for(const domain of [...factorFeatures.keys()].sort()) addEdge(edgeMap,'FACTOR:'+domain,forecastNodeId,'INFORMS_FORECAST');

  const decisionNodeId='DECISION:ABSTAIN';
  addNode(nodeMap,{
    id:decisionNodeId,
    type:'DECISION',
    action:'ABSTAIN',
    execution:'SHADOW_ONLY',
    canExecute:false,
    state:'LOCKED'
  });
  addEdge(edgeMap,forecastNodeId,decisionNodeId,'RESOLVES_TO');

  const nodes=[...nodeMap.values()].sort((a,b)=>NODE_RANK[a.type]-NODE_RANK[b.type]||a.id.localeCompare(b.id));
  const edges=[...edgeMap.values()].sort((a,b)=>a.from.localeCompare(b.from)||a.to.localeCompare(b.to)||a.relation.localeCompare(b.relation));
  const blockedFeatureIds=featureIds.filter(id=>featureStates.get(id)==='BLOCKED');
  const degradedFeatureIds=featureIds.filter(id=>featureStates.get(id)==='DEGRADED');
  const impactedSourceKeys=uniqueSorted(
    [...featureContributors.values()].flat()
      .filter(x=>x.state!=='HEALTHY')
      .flatMap(x=>[
        x.sourceKey,
        ...(x.dependencies||[]).filter(d=>d.state!=='HEALTHY').map(d=>d.sourceKey)
      ])
  );

  const core={
    version:RESEARCH_DEPENDENCY_GRAPH_VERSION,
    streamKey:sk,
    asOf:t,
    knowledgeTime:kt,
    gate,
    reasons:uniqueSorted(reasons),
    governanceView:Object.freeze({
      supplied:Boolean(governanceSummary),
      usable:statusView.usable,
      updatedAt:statusView.updatedAt
    }),
    retention:Object.freeze({
      retainedRecords:records.length,
      totalRecords:Number(plane?.totalRecords||0),
      earliestRetainedAvailableAt,
      historyTruncated
    }),
    impact:Object.freeze({
      totalFeatures,
      healthyFeatures,
      degradedFeatures,
      blockedFeatures,
      usableFeatures,
      coverage,
      blockedFeatureIds:Object.freeze(blockedFeatureIds),
      degradedFeatureIds:Object.freeze(degradedFeatureIds),
      impactedSourceKeys:Object.freeze(impactedSourceKeys),
      meaning:'DEPENDENCY_COVERAGE_DIAGNOSTIC_NOT_FORECAST_PROBABILITY'
    }),
    nodes:Object.freeze(nodes),
    edges:Object.freeze(edges),
    safety:Object.freeze({execution:'SHADOW_ONLY',action:'ABSTAIN',canExecute:false})
  };
  return deepFreeze({...core,fingerprint:sha256(core)});
}


const RESEARCH_VALIDITY_RANK=Object.freeze({
  VALID:0,PASS:0,
  BASELINE:1,CAUTION:1,STALE:1,DRIFTED:1,
  INSUFFICIENT:2,UNKNOWN:2,
  ABSTAIN:3,EXPIRED:3,INVALIDATED:3
});

function researchValidityStatus(v,fallback='UNKNOWN'){
  const x=String(v??fallback).toUpperCase();
  return Object.hasOwn(RESEARCH_VALIDITY_RANK,x)?x:fallback;
}

/**
 * Binds dependency integrity into institutional research admission.
 * A dependency problem may only make research validity stricter, never looser.
 */
export function bindResearchDependencyGateToValidity(baseValidity,graph){
  const baseStatus=researchValidityStatus(baseValidity?.status??baseValidity?.state,'UNKNOWN');
  const graphGate=String(graph?.gate??'ABSTAIN').toUpperCase();
  const dependencyStatus=
    graphGate==='PASS'?'VALID':
    graphGate==='CAUTION'?'CAUTION':
    graphGate==='INSUFFICIENT'?'INSUFFICIENT':
    'ABSTAIN';

  const status=
    RESEARCH_VALIDITY_RANK[dependencyStatus]>RESEARCH_VALIDITY_RANK[baseStatus]
      ? dependencyStatus
      : baseStatus;

  const baseReasons=Array.isArray(baseValidity?.reasons)?baseValidity.reasons.map(String):[];
  const dependencyReasons=graph
    ? (Array.isArray(graph.reasons)?graph.reasons:[]).map(x=>'DEPENDENCY_'+String(x))
    : ['DEPENDENCY_GRAPH_UNAVAILABLE'];
  if(graphGate!=='PASS'&&!dependencyReasons.length) dependencyReasons.push('DEPENDENCY_GATE_'+graphGate);

  return deepFreeze({
    status,
    reasons:uniqueSorted([...baseReasons,...dependencyReasons]),
    dependencyGate:graphGate,
    dependencyFingerprint:graph?.fingerprint??null,
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecute:false
  });
}

export function verifyResearchDependencyGraph(graph){
  const reasons=[];
  try{
    if(graph?.version!==RESEARCH_DEPENDENCY_GRAPH_VERSION) reasons.push('VERSION');
    if(graph?.safety?.execution!=='SHADOW_ONLY') reasons.push('EXECUTION_INVARIANT');
    if(graph?.safety?.action!=='ABSTAIN') reasons.push('ACTION_INVARIANT');
    if(graph?.safety?.canExecute!==false) reasons.push('CAN_EXECUTE_INVARIANT');
    const ids=new Set();
    for(const node of Array.isArray(graph?.nodes)?graph.nodes:[]){
      if(!node?.id||ids.has(node.id)) reasons.push('NODE_ID');
      ids.add(node.id);
      if(node.type==='OBSERVATION'&&Number(node.availableAt)>Number(graph.asOf)) reasons.push('FUTURE_OBSERVATION');
    }
    for(const edge of Array.isArray(graph?.edges)?graph.edges:[]){
      if(!ids.has(edge.from)||!ids.has(edge.to)) reasons.push('EDGE_ORPHAN');
      const from=graph.nodes.find(x=>x.id===edge.from);
      const to=graph.nodes.find(x=>x.id===edge.to);
      if(from&&to){
        const sameLayerDerived=edge.relation==='DERIVES_SOURCE'&&from.type==='SOURCE'&&to.type==='SOURCE';
        if(!sameLayerDerived&&NODE_RANK[from.type]>=NODE_RANK[to.type]) reasons.push('EDGE_LAYER_ORDER');
      }
    }
    const expected=sha256(graphCore(graph));
    if(String(graph?.fingerprint||'')!==expected) reasons.push('FINGERPRINT');
    return {ok:reasons.length===0,reasons:uniqueSorted(reasons),expectedFingerprint:expected};
  }catch(err){
    return {ok:false,reasons:['GRAPH_INVALID',err instanceof Error?err.message:String(err)]};
  }
}

export function explainResearchFeatureLineage(graph,featureId){
  const id=nonEmpty(featureId,'featureId');
  const featureNodeId='FEATURE:'+id;
  const feature=(graph?.nodes||[]).find(x=>x.id===featureNodeId)||null;
  if(!feature) return null;
  const obsIds=(graph.edges||[]).filter(e=>e.to===featureNodeId&&e.relation==='EMITS_FEATURE').map(e=>e.from);
  const observations=(graph.nodes||[]).filter(n=>obsIds.includes(n.id));
  const sourceIds=(graph.edges||[]).filter(e=>obsIds.includes(e.to)&&e.relation==='PRODUCED').map(e=>e.from);
  const sources=(graph.nodes||[]).filter(n=>sourceIds.includes(n.id));
  const upstreamSourceIds=(graph.edges||[])
    .filter(e=>sourceIds.includes(e.to)&&e.relation==='DERIVES_SOURCE')
    .map(e=>e.from);
  const upstreamSources=(graph.nodes||[]).filter(n=>upstreamSourceIds.includes(n.id));
  const factorIds=(graph.edges||[]).filter(e=>e.from===featureNodeId&&e.relation==='ROLLS_UP_TO_FACTOR').map(e=>e.to);
  const factors=(graph.nodes||[]).filter(n=>factorIds.includes(n.id));
  const forecastIds=(graph.edges||[]).filter(e=>factorIds.includes(e.from)&&e.relation==='INFORMS_FORECAST').map(e=>e.to);
  const forecasts=(graph.nodes||[]).filter(n=>forecastIds.includes(n.id));
  return deepFreeze({
    feature,
    observations:Object.freeze(observations),
    sources:Object.freeze(sources),
    upstreamSources:Object.freeze(upstreamSources),
    factors:Object.freeze(factors),
    forecasts:Object.freeze(forecasts),
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecute:false
  });
}

export function researchDependencyGraphSummary(graph){
  const verification=verifyResearchDependencyGraph(graph);
  return Object.freeze({
    version:RESEARCH_DEPENDENCY_GRAPH_VERSION,
    fingerprint:graph?.fingerprint||null,
    streamKey:graph?.streamKey||null,
    asOf:finite(graph?.asOf),
    gate:graph?.gate||'ABSTAIN',
    impact:graph?.impact||null,
    nodeCount:Array.isArray(graph?.nodes)?graph.nodes.length:0,
    edgeCount:Array.isArray(graph?.edges)?graph.edges.length:0,
    integrity:verification.ok?'VALID':'INVALID',
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecute:false
  });
}
