import path from 'node:path';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';

import { sha256 } from './institutional-kernel.mjs';
import {
  RESEARCH_FEATURE_CATALOG_VERSION,
  researchFeatureCatalogManifest,
  validateResearchFeatureRows
} from './research-feature-catalog.mjs';
import {
  RESEARCH_SOURCE_CONTRACTS,
  RESEARCH_SOURCE_CONTRACTS_VERSION,
  researchSourceContract,
  sourceContractKey,
  researchSourceContractsManifest
} from './research-source-contracts.mjs';

export const RESEARCH_DATA_GOVERNANCE_VERSION='TCX_RESEARCH_DATA_GOVERNANCE_V1';

function finite(v){
  const n=Number(v);
  return Number.isFinite(n)?n:null;
}
function median(xs){
  const ys=(Array.isArray(xs)?xs:[]).map(finite).filter(x=>x!=null).sort((a,b)=>a-b);
  if(!ys.length) return null;
  const m=Math.floor(ys.length/2);
  return ys.length%2?ys[m]:(ys[m-1]+ys[m])/2;
}
function mad(xs,med){
  const m=finite(med);
  if(m==null) return null;
  return median((xs||[]).map(x=>Math.abs(Number(x)-m)));
}
function robustZ(value,history,minSamples=20){
  const v=finite(value);
  const xs=(history||[]).map(finite).filter(x=>x!=null);
  if(v==null||xs.length<Math.max(3,Number(minSamples)||20)) return null;
  const med=median(xs);
  const d=mad(xs,med);
  if(d==null||d<1e-12) return Math.abs(v-med)<1e-12?0:null;
  return (v-med)/(1.4826*d);
}
function boundedPush(xs,value,max){
  xs.push(value);
  if(xs.length>max) xs.splice(0,xs.length-max);
}
function sourceStateFor(state,key,domain,source){
  if(!state.sources[key]){
    state.sources[key]={
      key,
      domain,
      source,
      status:'UNOBSERVED',
      firstSeenAt:null,
      lastSeenAt:null,
      lastAvailableAt:null,
      lastDecision:null,
      consecutiveViolations:0,
      consecutiveHealthy:0,
      totalSnapshots:0,
      totalViolations:0,
      totalRejected:0,
      totalQuarantined:0,
      totalSemanticReviews:0,
      lastReasons:[],
      publicationLagMs:[],
      ingestLagMs:[],
      completeness:[]
    };
  }
  return state.sources[key];
}
function cleanReason(reason){
  if(typeof reason==='string') return {code:reason};
  return {
    code:String(reason?.code||'UNKNOWN'),
    ...(reason?.id?{id:String(reason.id)}:{}),
    ...(Number.isFinite(Number(reason?.value))?{value:Number(reason.value)}:{}),
    ...(Number.isFinite(Number(reason?.limit))?{limit:Number(reason.limit)}:{}),
    ...(reason?.expected?{expected:String(reason.expected)}:{}),
    ...(reason?.actual?{actual:String(reason.actual)}:{})
  };
}
function stateFingerprint(state){
  const core={
    version:state.version,
    updatedAt:Number(state.updatedAt||0),
    sources:Object.fromEntries(Object.entries(state.sources||{}).sort(([a],[b])=>a.localeCompare(b)).map(([key,x])=>[key,{
      status:x.status,
      lastSeenAt:x.lastSeenAt,
      lastAvailableAt:x.lastAvailableAt,
      lastDecision:x.lastDecision,
      consecutiveViolations:x.consecutiveViolations,
      consecutiveHealthy:x.consecutiveHealthy,
      totalSnapshots:x.totalSnapshots,
      totalViolations:x.totalViolations,
      totalRejected:x.totalRejected,
      totalQuarantined:x.totalQuarantined,
      totalSemanticReviews:x.totalSemanticReviews,
      lastReasons:x.lastReasons
    }])),
    catalogFingerprint:researchFeatureCatalogManifest().fingerprint,
    contractsFingerprint:researchSourceContractsManifest().fingerprint
  };
  return sha256(core);
}

export function createResearchDataGovernanceState({
  createdAt=Date.now(),
  sources={},
  featureHistory={},
  maxFeatureHistory=96,
  maxSourceHistory=96
}={}){
  return {
    version:RESEARCH_DATA_GOVERNANCE_VERSION,
    createdAt:Number(createdAt),
    updatedAt:Number(createdAt),
    maxFeatureHistory:Math.max(20,Math.floor(Number(maxFeatureHistory)||96)),
    maxSourceHistory:Math.max(20,Math.floor(Number(maxSourceHistory)||96)),
    sources:structuredClone(sources||{}),
    featureHistory:structuredClone(featureHistory||{})
  };
}

export function governResearchSnapshot(state,snapshot,{
  evaluatedAt=Date.now(),
  semanticDriftMinSamples=20,
  semanticDriftAbsZ=12
}={}){
  if(!state||state.version!==RESEARCH_DATA_GOVERNANCE_VERSION) throw new Error('research governance state invalid');
  if(!snapshot) return null;

  const domain=String(snapshot.domain||'').toUpperCase();
  const source=String(snapshot.source||'');
  const key=sourceContractKey(domain,source);
  const contract=researchSourceContract(domain,source);
  const src=sourceStateFor(state,key,domain,source);
  const reasons=[];
  const semanticReviews=[];

  src.totalSnapshots++;
  src.firstSeenAt=src.firstSeenAt??Number(evaluatedAt);
  src.lastSeenAt=Number(evaluatedAt);
  src.lastAvailableAt=finite(snapshot.availableAt);

  let structuralViolation=false;
  if(!contract){
    structuralViolation=true;
    reasons.push({code:'SOURCE_CONTRACT_MISSING'});
  }

  const featureValidation=validateResearchFeatureRows(domain,snapshot.features);
  if(!featureValidation.ok){
    structuralViolation=true;
    for(const err of featureValidation.errors) reasons.push(err);
  }

  if(contract?.requiredFinality&&String(snapshot.finality||'').toUpperCase()!==contract.requiredFinality){
    structuralViolation=true;
    reasons.push({
      code:'FINALITY_CONTRACT_VIOLATION',
      expected:contract.requiredFinality,
      actual:String(snapshot.finality||'UNKNOWN')
    });
  }

  const eventTime=finite(snapshot.eventTime);
  const availableAt=finite(snapshot.availableAt);
  const ingestedAt=finite(snapshot.ingestedAt);
  const completeness=finite(snapshot?.quality?.completeness);
  const publicationLagMs=eventTime!=null&&availableAt!=null?Math.max(0,availableAt-eventTime):null;
  const ingestLagMs=availableAt!=null&&ingestedAt!=null?Math.max(0,ingestedAt-availableAt):null;

  if(publicationLagMs!=null) boundedPush(src.publicationLagMs,publicationLagMs,state.maxSourceHistory);
  if(ingestLagMs!=null) boundedPush(src.ingestLagMs,ingestLagMs,state.maxSourceHistory);
  if(completeness!=null) boundedPush(src.completeness,completeness,state.maxSourceHistory);

  let operationalViolation=false;
  if(contract){
    if(completeness==null||completeness<contract.minCompleteness){
      operationalViolation=true;
      reasons.push({code:'COMPLETENESS_SLO_BREACH',value:completeness,limit:contract.minCompleteness});
    }
    if(publicationLagMs==null||publicationLagMs>contract.maxPublicationLagMs){
      operationalViolation=true;
      reasons.push({code:'PUBLICATION_LAG_SLO_BREACH',value:publicationLagMs,limit:contract.maxPublicationLagMs});
    }
    if(ingestLagMs==null||ingestLagMs>contract.maxIngestLagMs){
      operationalViolation=true;
      reasons.push({code:'INGEST_LAG_SLO_BREACH',value:ingestLagMs,limit:contract.maxIngestLagMs});
    }
  }

  if(!structuralViolation){
    for(const row of snapshot.features||[]){
      const history=state.featureHistory[row.id]||[];
      const z=robustZ(row.value,history,semanticDriftMinSamples);
      if(Number.isFinite(z)&&Math.abs(z)>=Math.max(3,Number(semanticDriftAbsZ)||12)){
        semanticReviews.push({code:'SEMANTIC_DISTRIBUTION_SHIFT_REVIEW',id:row.id,value:Number(row.value),robustZ:z});
      }
    }
  }

  let decision='ACCEPT';
  if(structuralViolation){
    src.status='QUARANTINED';
    src.consecutiveViolations++;
    src.consecutiveHealthy=0;
    src.totalViolations++;
    src.totalRejected++;
    decision='REJECT';
  }else if(operationalViolation){
    src.consecutiveViolations++;
    src.consecutiveHealthy=0;
    src.totalViolations++;
    if(src.consecutiveViolations>=Math.max(1,Number(contract?.quarantineAfterConsecutiveViolations)||3)){
      src.status='QUARANTINED';
      src.totalQuarantined++;
      decision='QUARANTINE';
      reasons.push({code:'SOURCE_AUTO_QUARANTINED'});
    }else{
      src.status='DEGRADED';
      decision='DEGRADED';
    }
  }else{
    src.consecutiveViolations=0;
    src.consecutiveHealthy++;
    if(src.status==='QUARANTINED'){
      if(src.consecutiveHealthy>=Math.max(1,Number(contract?.recoverAfterConsecutiveHealthy)||3)){
        src.status='HEALTHY';
        decision=semanticReviews.length?'DEGRADED':'ACCEPT';
        reasons.push({code:'SOURCE_AUTO_RECOVERED'});
      }else{
        decision='QUARANTINE';
        reasons.push({code:'SOURCE_RECOVERY_PROBATION'});
      }
    }else{
      src.status='HEALTHY';
      decision=semanticReviews.length?'DEGRADED':'ACCEPT';
    }
  }

  if(semanticReviews.length){
    src.totalSemanticReviews+=semanticReviews.length;
    for(const review of semanticReviews) reasons.push(review);
  }

  if(['ACCEPT','DEGRADED'].includes(decision)&&!operationalViolation){
    for(const row of snapshot.features||[]){
      const history=state.featureHistory[row.id]||(state.featureHistory[row.id]=[]);
      boundedPush(history,Number(row.value),state.maxFeatureHistory);
    }
  }

  src.lastDecision=decision;
  src.lastReasons=reasons.map(cleanReason).slice(-20);
  state.updatedAt=Number(evaluatedAt);

  const qualityScore=contract
    ?Math.max(0,Math.min(1,
      .5*Math.max(0,Math.min(1,Number(completeness??0)))+
      .25*(publicationLagMs!=null&&publicationLagMs<=contract.maxPublicationLagMs?1:0)+
      .25*(ingestLagMs!=null&&ingestLagMs<=contract.maxIngestLagMs?1:0)
    ))
    :0;

  const governance=Object.freeze({
    version:RESEARCH_DATA_GOVERNANCE_VERSION,
    catalogVersion:RESEARCH_FEATURE_CATALOG_VERSION,
    sourceContractsVersion:RESEARCH_SOURCE_CONTRACTS_VERSION,
    sourceContractId:contract?.id||null,
    sourceKey:key,
    evaluatedAt:Number(evaluatedAt),
    decision,
    sourceStatus:src.status,
    qualityScore,
    qualityScoreMeaning:'NON_PROBABILISTIC_DATA_QUALITY_DIAGNOSTIC',
    reasons:Object.freeze(reasons.map(cleanReason)),
    semanticDrift:semanticReviews.length?'REVIEW':'NORMAL',
    semanticReviewCount:semanticReviews.length,
    publicationLagMs,
    ingestLagMs,
    completeness,
    execution:'SHADOW_ONLY',
    canExecute:false
  });

  return Object.freeze({...snapshot,governance});
}

export function refreshResearchSourceFreshness(state,{now=Date.now(),monitorStartedAt=null}={}){
  if(!state||state.version!==RESEARCH_DATA_GOVERNANCE_VERSION) throw new Error('research governance state invalid');
  const t=Number(now);
  const changes=[];
  for(const contract of RESEARCH_SOURCE_CONTRACTS){
    const key=sourceContractKey(contract.domain,contract.source);
    const src=state.sources[key];
    if(!src||!Number.isFinite(Number(src.lastSeenAt))) continue;
    const effectiveLastSeen=Number.isFinite(Number(monitorStartedAt))?Math.max(Number(src.lastSeenAt),Number(monitorStartedAt)):Number(src.lastSeenAt);\n    const silenceMs=Math.max(0,t-effectiveLastSeen);
    let next=src.status;
    let reason=null;
    if(silenceMs>2*contract.maxSilenceMs){
      next='QUARANTINED';
      reason='SOURCE_SILENCE_QUARANTINE';
    }else if(silenceMs>contract.maxSilenceMs&&src.status!=='QUARANTINED'){
      next='DEGRADED';
      reason='SOURCE_SILENCE_DEGRADED';
    }
    if(next!==src.status){
      changes.push({sourceKey:key,from:src.status,to:next,reason,silenceMs});
      src.status=next;
      src.lastDecision=next==='QUARANTINED'?'QUARANTINE':'DEGRADED';
      src.lastReasons=[{code:reason,value:silenceMs,limit:contract.maxSilenceMs}];
      src.consecutiveHealthy=0;
      if(next==='QUARANTINED') src.totalQuarantined++;
    }
  }
  if(changes.length) state.updatedAt=t;
  return Object.freeze({changed:changes.length>0,changes:Object.freeze(changes)});
}

export function quarantinedResearchSourceKeys(state){
  return Object.freeze(Object.entries(state?.sources||{})
    .filter(([,x])=>x?.status==='QUARANTINED')
    .map(([key])=>key)
    .sort());
}

export function researchDataGovernanceSummary(state,{now=Date.now()}={}){
  const statuses={UNOBSERVED:0,HEALTHY:0,DEGRADED:0,QUARANTINED:0};
  const sources=[];
  for(const contract of RESEARCH_SOURCE_CONTRACTS){
    const key=sourceContractKey(contract.domain,contract.source);
    const src=state?.sources?.[key]||null;
    const status=src?.status||'UNOBSERVED';
    statuses[status]=(statuses[status]||0)+1;
    const silenceMs=src?.lastSeenAt==null?null:Math.max(0,Number(now)-Number(src.lastSeenAt));
    sources.push({
      sourceKey:key,
      contractId:contract.id,
      status,
      lastSeenAt:src?.lastSeenAt??null,
      silenceMs,
      maxSilenceMs:contract.maxSilenceMs,
      lastDecision:src?.lastDecision??null,
      consecutiveViolations:Number(src?.consecutiveViolations||0),
      consecutiveHealthy:Number(src?.consecutiveHealthy||0),
      semanticReviews:Number(src?.totalSemanticReviews||0)
    });
  }
  const catalog=researchFeatureCatalogManifest();
  const contracts=researchSourceContractsManifest();
  const core={
    version:RESEARCH_DATA_GOVERNANCE_VERSION,
    updatedAt:Number(state?.updatedAt||0),
    statuses,
    quarantinedSources:quarantinedResearchSourceKeys(state),
    sourceCount:sources.length,
    sources,
    featureCatalog:{
      version:catalog.version,
      featureCount:catalog.featureCount,
      fingerprint:catalog.fingerprint
    },
    sourceContracts:{
      version:contracts.version,
      sourceCount:contracts.sourceCount,
      fingerprint:contracts.fingerprint
    },
    execution:'SHADOW_ONLY',
    canExecute:false
  };
  return Object.freeze({...core,fingerprint:stateFingerprint(state)});
}

export async function loadResearchDataGovernance(filePath){
  await mkdir(path.dirname(filePath),{recursive:true});
  try{
    const raw=await readFile(filePath,'utf8');
    const parsed=JSON.parse(raw);
    if(parsed?.version!==RESEARCH_DATA_GOVERNANCE_VERSION) throw new Error('unsupported research governance version');
    return createResearchDataGovernanceState(parsed);
  }catch(err){
    if(err?.code==='ENOENT') return createResearchDataGovernanceState();
    const backup=filePath+'.corrupt-'+Date.now();
    try{await rename(filePath,backup);}catch{}
    return createResearchDataGovernanceState();
  }
}

export async function saveResearchDataGovernance(filePath,state){
  await mkdir(path.dirname(filePath),{recursive:true});
  const tmp=filePath+'.tmp-'+process.pid;
  await writeFile(tmp,JSON.stringify(state,null,2)+'\n',{encoding:'utf8',mode:0o600});
  await rename(tmp,filePath);
  return state;
}
