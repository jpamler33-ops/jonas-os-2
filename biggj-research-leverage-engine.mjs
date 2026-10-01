
import { sha256 } from './institutional-kernel.mjs';

export const BIGGJ_RESEARCH_LEVERAGE_ENGINE_VERSION='TCX_BIGGJ_RESEARCH_LEVERAGE_ENGINE_V1';

export const BIGGJ_RESEARCH_LEVERS=Object.freeze([
  Object.freeze({id:'UNCERTAINTY_GAIN',meaning:'Prioritize questions where resolving uncertainty can materially change what BIGGJ knows.'}),
  Object.freeze({id:'INFORMATION_GAIN',meaning:'Prefer research explicitly estimated to add more decision-relevant information.'}),
  Object.freeze({id:'DEPENDENCY_UNLOCK',meaning:'Prefer work that unlocks multiple downstream capabilities instead of isolated local progress.'}),
  Object.freeze({id:'EVIDENCE_SCARCITY',meaning:'Direct effort toward under-evidenced hypotheses before over-sampling already dense areas.'}),
  Object.freeze({id:'INDEPENDENCE_GAP',meaning:'Penalize piles of correlated observations and seek independent episodes.'}),
  Object.freeze({id:'QUEUE_AGE',meaning:'Prevent valuable work from starving indefinitely behind newer tasks.'}),
  Object.freeze({id:'STAGNATION_PRESSURE',meaning:'Escalate tasks that persist without measurable progress across changing source states.'}),
  Object.freeze({id:'DATA_READINESS',meaning:'Route effort toward data repair when coverage/source health is weak and toward experiments when data is healthy.'}),
  Object.freeze({id:'BATCH_REUSE',meaning:'Prefer data acquisition that can satisfy several research tasks at once.'}),
  Object.freeze({id:'COST_EFFICIENCY',meaning:'Favor high-information work that consumes less compute, storage, latency and operator attention.'})
]);

const DAY=24*60*60*1000;
const DATA_REPAIR_TYPES=new Set([
  'DATA_INTEGRITY_REPAIR',
  'COLLECT_FORWARD_DATA',
  'COLLECT_INDEPENDENT_EPISODES',
  'COLLECT_VALIDATION_OUTCOMES',
  'CONTINUE_SHADOW_MEASUREMENT'
]);

const COST_BY_TYPE=Object.freeze({
  RESEARCH_DEFINITION:.15,
  COLLECT_FORWARD_DATA:.20,
  COLLECT_VALIDATION_OUTCOMES:.20,
  COLLECT_INDEPENDENT_EPISODES:.25,
  CONTINUE_SHADOW_MEASUREMENT:.25,
  DATA_INTEGRITY_REPAIR:.30,
  DEPENDENCY_RESOLUTION:.38,
  COLLECT_CHALLENGER_FORWARD_EVIDENCE:.42,
  CONTINUE_STRATEGY_LEAGUE:.48,
  ADVERSARIAL_STRESS:.50,
  WALK_FORWARD_VALIDATION:.55,
  EVALUATE_REGISTERED_CANDIDATES:.58,
  CONTINUE_FEATURE_RESEARCH:.62,
  CONTINUE_MODEL_COMPETITION:.68,
  GENERATE_NEXT_CHALLENGER_GENERATION:.82,
  SKILL_TRANSITION_REVIEW:.18,
  MODEL_PROMOTION_REVIEW:.22
});

const WEIGHTS=Object.freeze({
  basePriority:.15,
  uncertaintyGain:.10,
  informationGain:.12,
  dependencyUnlock:.12,
  evidenceScarcity:.08,
  independenceGap:.08,
  queueAge:.07,
  stagnationPressure:.05,
  dataReadiness:.08,
  batchReuse:.10,
  costEfficiency:.05
});

function finite(v,f=null){
  const n=Number(v);
  return Number.isFinite(n)?n:f;
}
function clamp(v,a=0,b=1){
  const n=finite(v,0);
  return Math.max(a,Math.min(b,n));
}
function arr(v){return Array.isArray(v)?v:[];}
function clone(v){return v==null?v:structuredClone(v);}
function optionalFinite(v){
  const n=Number(v);
  return Number.isFinite(n)?n:null;
}
function saturatingCount(v,scale){
  const n=Math.max(0,finite(v,0));
  return n/(n+Math.max(1,scale));
}
function statusCount(summary,key){
  return Math.max(0,finite(summary?.statuses?.[key],0));
}
function researchCost(type){
  return clamp(COST_BY_TYPE[String(type)]??.55);
}
function progressSignature(task,progressContext={}){
  const m=task?.metadata||{};
  const type=String(task?.type||'');
  const dataProgress=DATA_REPAIR_TYPES.has(type)
    ?{
        historyRows:optionalFinite(progressContext?.historyRows),
        historyProgressAt:optionalFinite(progressContext?.historyProgressAt),
        researchDataPlaneSeq:optionalFinite(progressContext?.researchDataPlaneSeq)
      }
    :null;
  return sha256({
    type:task?.type??null,
    subject:task?.subject??null,
    blocker:task?.blocker??null,
    dataNeeds:arr(task?.dataNeeds),
    evidenceTotal:m.validationEvidenceTotal??m.evidenceTotal??null,
    independentEpisodes:m.validationIndependentEpisodes??m.independentEpisodes??null,
    generationNumber:m.generationNumber??null,
    measuring:m.measuring??null,
    pending:m.pending??null,
    unresolved:m.unresolved??null,
    open:m.open??null,
    closed:m.closed??null,
    validationReadinessScore:m.validationReadinessScore??null,
    nextGate:m.nextGate??null,
    dataProgress
  });
}

function globalDataState(coverage={},governance={}){
  const symbolCount=Math.max(0,finite(coverage?.symbols,0));
  const averageCoverage=symbolCount>0?clamp(coverage?.averageCoverage):.5;
  const coverageGap=symbolCount>0?1-averageCoverage:.5;
  const sourceCount=Math.max(0,finite(governance?.sourceCount,0));
  const quarantine=statusCount(governance,'QUARANTINED');
  const degraded=statusCount(governance,'DEGRADED');
  const unobserved=statusCount(governance,'UNOBSERVED');
  const sourceHealthRisk=sourceCount>0
    ?clamp((quarantine+(.55*degraded)+(.20*unobserved))/sourceCount)
    :.5;
  const readiness=clamp(1-(.62*coverageGap+.38*sourceHealthRisk));
  return Object.freeze({
    averageCoverage,
    coverageGap,
    sourceHealthRisk,
    readiness,
    blockedSymbols:Math.max(0,finite(coverage?.blocked,0)),
    insufficientSymbols:Math.max(0,finite(coverage?.insufficient,0)),
    quarantinedSources:arr(governance?.quarantinedSources).length||quarantine,
    degradedSources:degraded,
    unobservedSources:unobserved
  });
}

function dataNeedCounts(tasks){
  const counts=new Map();
  for(const row of arr(tasks)){
    for(const need of arr(row?.dataNeeds)){
      const key=String(need);
      counts.set(key,(counts.get(key)||0)+1);
    }
  }
  return counts;
}

function dependencyScore(task,livingResearchState){
  const m=task?.metadata||{};
  const direct=Math.max(0,finite(m.directUnlocks,0));
  const transitive=Math.max(0,finite(m.transitiveUnlocks,0));
  if(direct||transitive)return clamp((direct+.35*transitive)/8);
  if(String(task?.type)==='DEPENDENCY_RESOLUTION')return .88;
  const q=arr(livingResearchState?.canonicalResearchQueue);
  const row=q.find(x=>String(x?.skillId||'')===String(m.skillId||task?.subject||''));
  if(!row)return .2;
  return clamp((finite(row.directUnlocks,0)+.35*finite(row.transitiveUnlocks,0))/8);
}

function evidenceScores(task){
  const m=task?.metadata||{};
  const total=optionalFinite(m.validationEvidenceTotal??m.evidenceTotal);
  const independent=optionalFinite(m.validationIndependentEpisodes??m.independentEpisodes);
  const evidenceScarcity=total==null?.5:clamp(1-total/30);
  let independenceGap=.5;
  if(total!=null&&independent!=null){
    const target=Math.max(1,Math.min(total,20));
    independenceGap=clamp(1-independent/target);
  }
  return {evidenceScarcity,independenceGap,total,independent};
}

function batchReuseScore(task,counts,taskCount){
  if(taskCount<=1)return 0;
  const needs=arr(task?.dataNeeds);
  if(!needs.length)return 0;
  const maxShared=Math.max(...needs.map(x=>Math.max(1,counts.get(String(x))||1)));
  return clamp((maxShared-1)/Math.min(4,Math.max(1,taskCount-1)));
}

function dataReadinessScore(task,dataState){
  const repair=DATA_REPAIR_TYPES.has(String(task?.type));
  const gap=1-dataState.readiness;
  return repair?clamp(.30+.70*gap):clamp(.25+.75*dataState.readiness);
}

function memoryForTask(previous,task,asOf,progressContext={}){
  const id=String(task.taskId);
  const prior=previous?.[id]||null;
  const sig=progressSignature(task,progressContext);
  const sameProgress=prior?.progressSignature===sig;
  const firstSeenAt=finite(prior?.firstSeenAt,asOf);
  const seenCycles=Math.max(1,finite(prior?.seenCycles,0)+1);
  const stagnantCycles=sameProgress?Math.max(0,finite(prior?.stagnantCycles,0)+1):0;
  return Object.freeze({
    taskId:id,
    firstSeenAt,
    lastSeenAt:asOf,
    seenCycles,
    stagnantCycles,
    progressSignature:sig
  });
}

function weightedScore(task,levers){
  return clamp(
    WEIGHTS.basePriority*clamp(task?.priority)+
    WEIGHTS.uncertaintyGain*levers.uncertaintyGain+
    WEIGHTS.informationGain*levers.informationGain+
    WEIGHTS.dependencyUnlock*levers.dependencyUnlock+
    WEIGHTS.evidenceScarcity*levers.evidenceScarcity+
    WEIGHTS.independenceGap*levers.independenceGap+
    WEIGHTS.queueAge*levers.queueAge+
    WEIGHTS.stagnationPressure*levers.stagnationPressure+
    WEIGHTS.dataReadiness*levers.dataReadiness+
    WEIGHTS.batchReuse*levers.batchReuse+
    WEIGHTS.costEfficiency*levers.costEfficiency
  );
}

function topLeverIds(levers){
  return Object.entries(levers)
    .map(([id,value])=>({id,value:clamp(value)}))
    .sort((a,b)=>b.value-a.value||a.id.localeCompare(b.id))
    .slice(0,3)
    .map(x=>x.id);
}

export function rankBiggjResearchTasks(tasks,{
  asOf=Date.now(),
  taskMemory={},
  livingResearchState=null,
  researchCoverageSummary=null,
  researchDataGovernanceSummary=null,
  researchDataPlaneSummary=null,
  historyStats=null
}={}){
  const t=finite(asOf,Date.now());
  const rows=arr(tasks);
  const needCounts=dataNeedCounts(rows);
  const dataState=globalDataState(researchCoverageSummary||{},researchDataGovernanceSummary||{});
  const progressContext=Object.freeze({
    historyRows:finite(historyStats?.rows,null),
    historyProgressAt:finite(historyStats?.progressAt,null),
    researchDataPlaneSeq:finite(researchDataPlaneSummary?.seq,null)
  });
  const nextMemory={...(taskMemory||{})};
  const ranked=[];

  for(const row of rows){
    const memory=memoryForTask(taskMemory,row,t,progressContext);
    nextMemory[row.taskId]=memory;
    const evidence=evidenceScores(row);
    const ageMs=Math.max(0,t-memory.firstSeenAt);
    const levers=Object.freeze({
      uncertaintyGain:clamp(row?.uncertainty),
      informationGain:clamp(row?.informationValue),
      dependencyUnlock:dependencyScore(row,livingResearchState),
      evidenceScarcity:evidence.evidenceScarcity,
      independenceGap:evidence.independenceGap,
      queueAge:clamp(ageMs/(7*DAY)),
      stagnationPressure:clamp(memory.stagnantCycles/10),
      dataReadiness:dataReadinessScore(row,dataState),
      batchReuse:batchReuseScore(row,needCounts,rows.length),
      costEfficiency:1-researchCost(row?.type)
    });
    const effectivePriority=weightedScore(row,levers);
    ranked.push(Object.freeze({
      ...clone(row),
      effectivePriority,
      estimatedResearchCost:researchCost(row?.type),
      leverage:levers,
      topLevers:topLeverIds(levers),
      queueAgeMs:ageMs,
      seenCycles:memory.seenCycles,
      stagnantCycles:memory.stagnantCycles,
      stalled:memory.stagnantCycles>=8,
      progressSignature:memory.progressSignature
    }));
  }

  const alive=new Set(ranked.map(x=>x.taskId));
  for(const [id,m] of Object.entries(nextMemory)){
    if(alive.has(id))continue;
    if(t-finite(m?.lastSeenAt,t)>30*DAY)delete nextMemory[id];
  }
  const trimmedMemory=Object.fromEntries(
    Object.entries(nextMemory)
      .sort((a,b)=>finite(b[1]?.lastSeenAt,0)-finite(a[1]?.lastSeenAt,0))
      .slice(0,128)
  );

  ranked.sort((a,b)=>
    Number(b.manualReviewRequired)-Number(a.manualReviewRequired)||
    b.effectivePriority-a.effectivePriority||
    b.priority-a.priority||
    String(a.taskId).localeCompare(String(b.taskId))
  );

  const bundles=[...needCounts.entries()]
    .filter(([,count])=>count>=2)
    .map(([dataNeed,count])=>({
      dataNeed,
      taskCount:count,
      taskIds:ranked.filter(x=>arr(x.dataNeeds).includes(dataNeed)).map(x=>x.taskId).slice(0,16),
      subjects:ranked.filter(x=>arr(x.dataNeeds).includes(dataNeed)).map(x=>x.subject).slice(0,10),
      reuseScore:clamp((count-1)/4)
    }))
    .sort((a,b)=>b.taskCount-a.taskCount||a.dataNeed.localeCompare(b.dataNeed));

  const stalled=ranked.filter(x=>x.stalled);
  const summary=Object.freeze({
    version:BIGGJ_RESEARCH_LEVERAGE_ENGINE_VERSION,
    leverCount:BIGGJ_RESEARCH_LEVERS.length,
    levers:BIGGJ_RESEARCH_LEVERS,
    weights:WEIGHTS,
    dataState,
    progressContext,
    batchOpportunityCount:bundles.length,
    topBundles:bundles.slice(0,8),
    stalledTaskCount:stalled.length,
    stalledTasks:stalled.slice(0,8).map(x=>({
      taskId:x.taskId,
      type:x.type,
      subject:x.subject,
      stagnantCycles:x.stagnantCycles,
      queueAgeMs:x.queueAgeMs,
      effectivePriority:x.effectivePriority
    })),
    topTasks:ranked.slice(0,8).map(x=>({
      taskId:x.taskId,
      type:x.type,
      subject:x.subject,
      effectivePriority:x.effectivePriority,
      basePriority:x.priority,
      topLevers:x.topLevers,
      stagnantCycles:x.stagnantCycles,
      queueAgeMs:x.queueAgeMs
    })),
    execution:'SHADOW_ONLY',
    canExecuteLive:false,
    automaticPrimaryMutation:false
  });

  return Object.freeze({
    tasks:Object.freeze(ranked),
    taskMemory:Object.freeze(trimmedMemory),
    bundles:Object.freeze(bundles),
    summary
  });
}
