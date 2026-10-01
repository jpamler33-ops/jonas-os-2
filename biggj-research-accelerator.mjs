import { sha256 } from './institutional-kernel.mjs';

export const BIGGJ_RESEARCH_ACCELERATOR_VERSION='BIGGJ_RESEARCH_ACCELERATOR_V2';

const finite=(v,f=0)=>Number.isFinite(Number(v))?Number(v):f;
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,finite(v,0)));
const arr=v=>Array.isArray(v)?v:[];
const uniq=xs=>[...new Set(arr(xs).map(x=>String(x)).filter(Boolean))];
const freeze=v=>{
  if(v&&typeof v==='object'&&!Object.isFrozen(v)){
    Object.freeze(v);
    for(const x of Object.values(v))freeze(x);
  }
  return v;
};

export function buildOutcomeDeadlinePlan(pending,{
  now=Date.now(),
  minPollMs=5_000,
  maxPollMs=60_000,
  dueGraceMs=1_000
}={}){
  const t=finite(now,Date.now());
  const minMs=Math.max(1_000,finite(minPollMs,5_000));
  const maxMs=Math.max(minMs,finite(maxPollMs,60_000));
  const grace=Math.max(0,finite(dueGraceMs,1_000));
  const rows=arr(pending)
    .filter(x=>String(x?.status||'PENDING')==='PENDING')
    .map(x=>({
      id:String(x?.id||''),
      symbol:String(x?.symbol||''),
      horizonId:String(x?.horizonId||''),
      dueAt:finite(x?.dueAt,NaN),
      asOf:finite(x?.asOf,NaN)
    }))
    .filter(x=>x.symbol&&Number.isFinite(x.dueAt))
    .sort((a,b)=>a.dueAt-b.dueAt||a.symbol.localeCompare(b.symbol)||a.horizonId.localeCompare(b.horizonId));

  const dueNow=rows.filter(x=>x.dueAt<=t+grace);
  const future=rows.filter(x=>x.dueAt>t+grace);
  const nextDueAt=future[0]?.dueAt??null;
  let recommendedDelayMs=maxMs;
  if(dueNow.length){
    recommendedDelayMs=minMs;
  }else if(nextDueAt!=null){
    recommendedDelayMs=Math.max(minMs,Math.min(maxMs,nextDueAt-t));
  }

  const dueSymbols=uniq(dueNow.map(x=>x.symbol));
  const nextSymbols=nextDueAt==null?[]:uniq(
    future.filter(x=>x.dueAt===nextDueAt).map(x=>x.symbol)
  );

  return freeze({
    pending:rows.length,
    dueNow:dueNow.length,
    dueSymbols,
    nextDueAt,
    nextSymbols,
    recommendedDelayMs,
    semantics:{
      deadlineSchedulingDoesNotCreateFutureEvidence:true,
      resolutionStillRequiresObservedPostDuePrice:true
    }
  });
}

export function buildResearchResourceBudget({
  memory={},
  limits={},
  configuredMaxIssuedPerSweep=1,
  configuredHistoryRows=1200
}={}){
  const heap=finite(memory?.heapUsedMb);
  const rss=finite(memory?.rssMb);
  const external=finite(memory?.externalMb);
  const arrayBuffers=Math.max(0,finite(memory?.arrayBuffersMb));
  // Node reports ArrayBuffer/Buffer backing stores inside external memory.
  // Persistence can leave a short-lived compressed-buffer tail after the
  // write has completed. Exclude that tail from *planning* pressure only;
  // per-issuance admission continues to use full external memory.
  const planningExternal=Math.max(0,external-arrayBuffers);
  const heapLimit=Math.max(1,finite(limits?.heapMb,320));
  const rssLimit=Math.max(1,finite(limits?.rssMb,720));
  const externalLimit=Math.max(1,finite(limits?.externalMb,64));
  const pressure=Math.max(heap/heapLimit,rss/rssLimit,planningExternal/externalLimit);
  const configuredIssue=Math.max(1,Math.min(3,Math.floor(finite(configuredMaxIssuedPerSweep,1))));
  const configuredRows=Math.max(500,Math.floor(finite(configuredHistoryRows,1200)));

  let mode='BALANCED';
  let issueBudget=Math.min(configuredIssue,2);
  let replayRows=Math.min(configuredRows,900);
  if(pressure>=1){
    mode='MEMORY_PROTECT';
    issueBudget=1;
    replayRows=500;
  }else if(pressure>=.82){
    mode='CAUTIOUS';
    issueBudget=1;
    replayRows=Math.min(configuredRows,650);
  }else if(pressure>=.64){
    mode='BALANCED';
    // Forecasts are issued sequentially and every issuance is protected by the
    // unchanged pre/post memory admission gates. Do not impose a second,
    // redundant two-issuance ceiling while memory is still below CAUTIOUS.
    issueBudget=configuredIssue;
    replayRows=Math.min(configuredRows,900);
  }else{
    mode='ACCELERATED';
    issueBudget=configuredIssue;
    replayRows=configuredRows;
  }

  return freeze({
    mode,
    pressure,
    memory:{
      heapUsedMb:heap,
      rssMb:rss,
      externalMb:external,
      arrayBuffersMb:arrayBuffers,
      planningExternalMb:planningExternal
    },
    limits:{heapMb:heapLimit,rssMb:rssLimit,externalMb:externalLimit},
    autoLearnIssueBudget:issueBudget,
    shadowReplayHistoryRows:replayRows,
    semantics:{
      budgetCanOnlyReduceConfiguredLimits:true,
      memoryProtectionOverridesAcceleration:true,
      balancedIssueBudgetReliesOnSequentialAdmissionGuards:true,
      arrayBufferBackedExternalExcludedFromPlanningPressure:true,
      perIssueAdmissionMustUseFullExternalMemory:true
    }
  });
}

export function buildResearchBundlePlan(factorySummary={}){
  const bundles=arr(factorySummary?.leverage?.topBundles?.length
    ?factorySummary.leverage.topBundles
    :factorySummary?.researchBundles);
  const stalledIds=new Set(arr(factorySummary?.nextTasks).filter(x=>x?.stalled===true).map(x=>String(x.taskId)));
  const groups=bundles
    .map(row=>{
      const taskIds=arr(row?.taskIds).map(String);
      const stalledTaskIds=taskIds.filter(id=>stalledIds.has(id));
      const taskCount=Math.max(finite(row?.taskCount),taskIds.length);
      const reuseScore=clamp(row?.reuseScore);
      const estimatedFanOut=Math.max(1,taskCount);
      const priority=clamp(.55*reuseScore+.45*Math.min(1,taskCount/6));
      const core={
        bundleId:'rb_'+sha256({
          dataNeed:String(row?.dataNeed||'UNKNOWN'),
          taskIds:[...taskIds].sort()
        }).slice(0,22),
        dataNeed:String(row?.dataNeed||'UNKNOWN'),
        taskCount,
        taskIds:taskIds.slice(0,24),
        subjects:arr(row?.subjects).map(String).slice(0,12),
        stalledTaskIds:stalledTaskIds.slice(0,24),
        stalledTaskCount:stalledTaskIds.length,
        reuseScore,
        estimatedFanOut,
        priority,
        collectionSemantics:'ONE_COLLECTION_EVENT_MAY_BE_EVALUATED_AGAINST_ALL_COMPATIBLE_TASKS_WITHOUT_DUPLICATING_EVIDENCE'
      };
      return {...core,fingerprint:sha256(core)};
    })
    .sort((a,b)=>b.priority-a.priority||b.taskCount-a.taskCount||a.dataNeed.localeCompare(b.dataNeed));

  return freeze({
    bundleCount:groups.length,
    topBundles:groups.slice(0,8),
    maxEstimatedFanOut:groups[0]?.estimatedFanOut??1,
    stalledFusionCandidates:groups.filter(x=>x.stalledTaskCount>=2).length,
    semantics:{
      fanOutNeverDuplicatesOneObservationIntoIndependentEpisodes:true,
      sharedObservationRetainsSingleProvenanceIdentity:true,
      bundlePriorityIsHeuristicNotProbability:true
    }
  });
}

export function buildHistoricalReplayPlan({
  historyRows=0,
  historyProgressAt=null,
  lastReplayProgressAt=null,
  resourceBudget=null,
  minRows=80
}={}){
  const rows=Math.max(0,Math.floor(finite(historyRows)));
  const progress=Number.isFinite(Number(historyProgressAt))?Number(historyProgressAt):null;
  const last=Number.isFinite(Number(lastReplayProgressAt))?Number(lastReplayProgressAt):null;
  const available=rows>=Math.max(20,finite(minRows,80));
  const advanced=progress!=null&&(last==null||progress>last);
  const windowRows=Math.min(
    rows,
    Math.max(0,Math.floor(finite(resourceBudget?.shadowReplayHistoryRows,rows)))
  );
  const shouldRun=available&&advanced&&windowRows>=Math.max(20,finite(minRows,80));

  return freeze({
    available,
    advanced,
    shouldRun,
    historyRows:rows,
    replayWindowRows:windowRows,
    historyProgressAt:progress,
    lastReplayProgressAt:last,
    semantics:{
      replayUsesOnlyAlreadyAvailablePointInTimeHistory:true,
      replayDoesNotCountAsProspectiveEvidence:true,
      noFutureLeakageAllowed:true
    }
  });
}

export function buildBiggjResearchAccelerator({
  factorySummary={},
  pendingForecasts=[],
  memory={},
  limits={},
  configuredMaxIssuedPerSweep=1,
  configuredHistoryRows=1200,
  historyRows=0,
  historyProgressAt=null,
  lastReplayProgressAt=null,
  now=Date.now(),
  outcomeMaxPollMs=60_000
}={}){
  const resource=buildResearchResourceBudget({
    memory,
    limits,
    configuredMaxIssuedPerSweep,
    configuredHistoryRows
  });
  const outcomes=buildOutcomeDeadlinePlan(pendingForecasts,{
    now,
    maxPollMs:outcomeMaxPollMs
  });
  const bundles=buildResearchBundlePlan(factorySummary);
  const replay=buildHistoricalReplayPlan({
    historyRows,
    historyProgressAt,
    lastReplayProgressAt,
    resourceBudget:resource
  });

  const accelerationPotential=clamp(
    .35*Math.min(1,bundles.maxEstimatedFanOut/4)+
    .25*(replay.shouldRun?1:0)+
    .20*(resource.autoLearnIssueBudget/Math.max(1,configuredMaxIssuedPerSweep))+
    .20*(outcomes.pending?1:0)
  );

  const core={
    version:BIGGJ_RESEARCH_ACCELERATOR_VERSION,
    asOf:finite(now,Date.now()),
    resource,
    outcomes,
    bundles,
    replay,
    accelerationPotential,
    execution:'SHADOW_ONLY',
    canExecuteLive:false,
    automaticPrimaryMutation:false,
    semantics:{
      accelerateEvidenceUseNotScientificThresholds:true,
      prospectiveTimeCannotBeSkipped:true,
      syntheticOrReplayEvidenceCannotMasqueradeAsProspective:true,
      noGuardRelaxation:true
    }
  };
  return freeze({...core,fingerprint:sha256(core)});
}

export function biggjResearchAcceleratorSummary(state={}){
  if(state?.version!==BIGGJ_RESEARCH_ACCELERATOR_VERSION)throw new Error('BIGGJ_RESEARCH_ACCELERATOR_INVALID');
  return freeze({
    version:state.version,
    asOf:state.asOf,
    accelerationPotential:state.accelerationPotential,
    resource:state.resource,
    outcomes:state.outcomes,
    bundles:state.bundles,
    replay:state.replay,
    execution:'SHADOW_ONLY',
    canExecuteLive:false,
    automaticPrimaryMutation:false,
    fingerprint:state.fingerprint
  });
}
