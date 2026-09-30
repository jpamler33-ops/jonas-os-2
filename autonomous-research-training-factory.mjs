
import path from 'node:path';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';

import { sha256 } from './institutional-kernel.mjs';
import { rankBiggjResearchTasks, BIGGJ_RESEARCH_LEVERAGE_ENGINE_VERSION } from './biggj-research-leverage-engine.mjs';

export const AUTONOMOUS_RESEARCH_TRAINING_FACTORY_VERSION='TCX_AUTONOMOUS_RESEARCH_TRAINING_FACTORY_V1';

export const DEFAULT_AUTONOMOUS_RESEARCH_FACTORY_POLICY=Object.freeze({
  maxQueueItems:24,
  maxAutomaticResearchItems:12,
  maxAutomaticCandidateBuildsPerCycle:1,
  maxAutomaticStressTestsPerCycle:2,
  maxAutomaticWalkForwardPerCycle:2,
  requirePointInTime:true,
  requireAuditReady:true,
  requireShadowOnly:true
});

const MANUAL_TYPES=new Set([
  'SKILL_TRANSITION_REVIEW',
  'MODEL_PROMOTION_REVIEW',
  'RESEARCH_DEFINITION'
]);

const DATA_ONLY_TYPES=new Set([
  'COLLECT_FORWARD_DATA',
  'COLLECT_INDEPENDENT_EPISODES',
  'COLLECT_VALIDATION_OUTCOMES',
  'CONTINUE_SHADOW_MEASUREMENT'
]);

const AUTO_HANDLERS=Object.freeze({
  COLLECT_FORWARD_DATA:'AUTOLEARN_AND_COVERAGE_CURRICULUM',
  COLLECT_INDEPENDENT_EPISODES:'LIVING_RESEARCH_RUNTIME',
  COLLECT_VALIDATION_OUTCOMES:'FORECAST_OUTCOME_WATCHER',
  CONTINUE_SHADOW_MEASUREMENT:'SHADOW_COMPETITION_WORKER',
  WALK_FORWARD_VALIDATION:'FORECAST_CANDIDATE_LAB',
  ADVERSARIAL_STRESS:'ADVERSARIAL_STRESS_LAB',
  DATA_INTEGRITY_REPAIR:'RESEARCH_DATA_GOVERNANCE',
  DEPENDENCY_RESOLUTION:'RESEARCH_DEPENDENCY_GRAPH',
  CONTINUE_FEATURE_RESEARCH:'FORECAST_FEATURE_RESEARCH',
  CONTINUE_MODEL_COMPETITION:'FORECAST_SHADOW_COMPETITION',
  GENERATE_NEXT_CHALLENGER_GENERATION:'FORECAST_SHADOW_COMPETITION',
  EVALUATE_REGISTERED_CANDIDATES:'MODEL_CANDIDATE_REGISTRY',
  COLLECT_CHALLENGER_FORWARD_EVIDENCE:'LEARNED_CHALLENGER_ENGINE',
  CONTINUE_STRATEGY_LEAGUE:'SHADOW_STRATEGY_LEAGUE'
});

function finite(v,f=0){
  const n=Number(v);
  return Number.isFinite(n)?n:f;
}
function clamp(v,a=0,b=1){ return Math.max(a,Math.min(b,finite(v))); }
function arr(v){ return Array.isArray(v)?v:[]; }
function uniq(xs){ return [...new Set(arr(xs).filter(Boolean).map(String))]; }
function clone(v){ return v==null?v:structuredClone(v); }
function normalizedStatus(v){ return String(v||'UNKNOWN').toUpperCase(); }
function stableTaskId(core){ return 'artf_'+sha256(core).slice(0,24); }

function task({
  type,
  subject='SYSTEM',
  reason,
  priority=.5,
  informationValue=.5,
  uncertainty=.5,
  blocker=null,
  source='FACTORY',
  dataNeeds=[],
  metadata={}
}){
  const autoHandler=AUTO_HANDLERS[type]||null;
  const manual=MANUAL_TYPES.has(type);
  const core={
    type:String(type),
    subject:String(subject||'SYSTEM'),
    reason:String(reason||'UNSPECIFIED'),
    priority:clamp(priority),
    informationValue:clamp(informationValue),
    uncertainty:clamp(uncertainty),
    blocker:blocker==null?null:String(blocker),
    source:String(source),
    dataNeeds:uniq(dataNeeds),
    autoHandler,
    automaticShadowEligible:Boolean(autoHandler)&&!manual,
    manualReviewRequired:manual,
    primaryMutationAllowed:false,
    canExecuteLive:false,
    metadata:clone(metadata||{})
  };
  return Object.freeze({
    ...core,
    taskId:stableTaskId({
      type:core.type,
      subject:core.subject,
      source:core.source,
      blocker:core.blocker
    })
  });
}

function taskForGate(row){
  const gate=normalizedStatus(row?.nextGate);
  const subject=String(row?.skillId||row?.title||row?.capabilityId||'UNKNOWN_SKILL');
  const base={
    subject,
    priority:clamp(row?.priority,.5),
    informationValue:clamp(row?.informationValue??row?.priority,.5),
    uncertainty:clamp(row?.uncertainty,.5),
    source:'BIGGJ_RESEARCH_QUEUE',
    metadata:{
      skillId:row?.skillId??null,
      capabilityId:row?.capabilityId??null,
      rootId:row?.rootId??null,
      nextGate:gate,
      status:row?.status??null,
      directUnlocks:finite(row?.directUnlocks),
      transitiveUnlocks:finite(row?.transitiveUnlocks),
      testingDependencyReady:row?.testingDependencyReady===true,
      testingBlockers:arr(row?.testingBlockers).map(String).slice(0,12),
      validationEvidenceTotal:finite(row?.validationEvidenceTotal),
      validationIndependentEpisodes:finite(row?.validationIndependentEpisodes)
    }
  };

  if(['QUESTION_DECLARED','HYPOTHESIS_DECLARED','FALSIFIER_DECLARED'].includes(gate)){
    return task({...base,type:'RESEARCH_DEFINITION',reason:'RESEARCH_PROTOCOL_NOT_FULLY_DEFINED',blocker:gate});
  }
  if(gate==='TOTAL_EVIDENCE'||gate==='FORWARD_SHADOW'){
    return task({...base,type:'COLLECT_FORWARD_DATA',reason:'MORE_FORWARD_POINT_IN_TIME_EVIDENCE_REQUIRED',dataNeeds:['FORWARD_SHADOW_OBSERVATIONS']});
  }
  if(gate==='INDEPENDENT_EPISODES'){
    return task({...base,type:'COLLECT_INDEPENDENT_EPISODES',reason:'MORE_INDEPENDENT_COMMON_CAUSE_EPISODES_REQUIRED',dataNeeds:['INDEPENDENT_EPISODES','REGIME_DIVERSITY']});
  }
  if(gate==='POSITIVE_RATE_GT_50_PERCENT'||gate==='POSITIVE_RATE_GT_52_PERCENT'){
    return task({...base,type:'COLLECT_VALIDATION_OUTCOMES',reason:'MORE_LABELLED_FORWARD_OUTCOMES_REQUIRED',dataNeeds:['LABELLED_FORWARD_OUTCOMES']});
  }
  if(['ALL_EVIDENCE_PIT_SAFE','ALL_EVIDENCE_AUDIT_READY','ALL_EVIDENCE_SCIENCE_PASSED'].includes(gate)){
    return task({...base,type:'DATA_INTEGRITY_REPAIR',reason:'EVIDENCE_INTEGRITY_GATE_BLOCKED',blocker:gate,dataNeeds:['AUDITABLE_POINT_IN_TIME_EVIDENCE']});
  }
  if(gate==='CHRONOLOGICAL_STABILITY'){
    return task({...base,type:'WALK_FORWARD_VALIDATION',reason:'TEMPORAL_ROBUSTNESS_NOT_YET_PROVEN',dataNeeds:['CHRONOLOGICAL_HOLDOUTS']});
  }
  if(['COST_STRESS','CONCENTRATION_STRESS','WINNER_REMOVAL'].includes(gate)){
    return task({...base,type:'ADVERSARIAL_STRESS',reason:'ROBUSTNESS_STRESS_GATE_REQUIRED',blocker:gate,dataNeeds:['STRESS_EVALUATION']});
  }
  if(gate.includes('DEPENDENCY_GATE_READY')){
    return task({...base,type:'DEPENDENCY_RESOLUTION',reason:'PREREQUISITE_CAPABILITY_BLOCKED',blocker:gate,dataNeeds:['DEPENDENCY_EVIDENCE']});
  }
  if(gate==='FORWARD_EVIDENCE_NOT_DECAYING'){
    return task({...base,type:'COLLECT_FORWARD_DATA',reason:'RECENT_FORWARD_EVIDENCE_DECAY_REQUIRES_FRESH_OBSERVATIONS',dataNeeds:['FRESH_FORWARD_EVIDENCE','REGIME_DIVERSITY']});
  }
  return task({...base,type:'CONTINUE_SHADOW_MEASUREMENT',reason:'RESEARCH_GATE_REQUIRES_MORE_SHADOW_MEASUREMENT',blocker:gate,dataNeeds:['MORE_POINT_IN_TIME_DATA']});
}

function tasksFromLivingResearch(state){
  const rows=arr(state?.canonicalResearchQueue);
  const tasks=rows.slice(0,20).map(taskForGate);
  const reviewQueue=state?.researchReviewQueue||{};
  for(const ticket of arr(reviewQueue.tickets).slice(0,12)){
    tasks.push(task({
      type:'SKILL_TRANSITION_REVIEW',
      subject:String(ticket?.skillId||'UNKNOWN_SKILL'),
      reason:'EVIDENCE_READY_FOR_MANUAL_SKILL_TRANSITION_REVIEW',
      priority:.98,
      informationValue:.9,
      uncertainty:1-clamp(ticket?.validationReadinessScore),
      source:'BIGGJ_RESEARCH_REVIEW_QUEUE',
      metadata:{
        ticketId:ticket?.ticketId??null,
        fromStatus:ticket?.fromStatus??null,
        proposedStatus:ticket?.proposedStatus??null,
        evidenceState:ticket?.evidenceState??null,
        validationPhase:ticket?.validationPhase??null,
        validationReadinessScore:clamp(ticket?.validationReadinessScore),
        createdAt:finite(ticket?.createdAt,null)
      }
    }));
  }
  return tasks;
}

function tasksFromExperimentGovernor(governor={}){
  const tasks=[];
  const status=normalizedStatus(governor.status);
  const counts=governor.counts||{};
  const reviewRows=[
    ...arr(governor.promotionReviewRequired),
    ...arr(governor.legacyPromotionCandidates)
  ];
  for(const row of reviewRows.slice(0,12)){
    tasks.push(task({
      type:'MODEL_PROMOTION_REVIEW',
      subject:String(row?.candidateId||row?.blueprintId||'UNKNOWN_CANDIDATE'),
      reason:'CANDIDATE_PASSED_SHADOW_STATISTICAL_REVIEW',
      priority:1,
      informationValue:.95,
      uncertainty:.25,
      source:'FORECAST_EXPERIMENT_GOVERNOR',
      metadata:row
    }));
  }
  const measuring=finite(counts.MEASURING)+finite(counts.SHADOW_TESTING)+finite(counts.INTEGRITY_HOLD);
  if(status==='ACTIVE'&&measuring>0){
    tasks.push(task({
      type:'CONTINUE_MODEL_COMPETITION',
      subject:String(governor.generationId||'CURRENT_GENERATION'),
      reason:'ACTIVE_MODEL_GENERATION_REQUIRES_MORE_SHADOW_MEASUREMENT',
      priority:.82,
      informationValue:.85,
      uncertainty:.55,
      source:'FORECAST_EXPERIMENT_GOVERNOR',
      dataNeeds:['OOS_FORECAST_OUTCOMES','INDEPENDENT_EPISODES'],
      metadata:{generationNumber:finite(governor.generationNumber),measuring}
    }));
  }
  if(governor.nextGenerationEligible===true){
    tasks.push(task({
      type:'GENERATE_NEXT_CHALLENGER_GENERATION',
      subject:String(governor.generationId||'CURRENT_GENERATION'),
      reason:'PREVIOUS_GENERATION_TERMINAL_AND_NEXT_GENERATION_ELIGIBLE',
      priority:.75,
      informationValue:.8,
      uncertainty:.6,
      source:'FORECAST_EXPERIMENT_GOVERNOR',
      metadata:{generationNumber:finite(governor.generationNumber)}
    }));
  }
  return tasks;
}

function tasksFromRegistry(summary={}){
  return arr(summary.candidates)
    .filter(x=>normalizedStatus(x.status)==='REGISTERED')
    .slice(0,8)
    .map(row=>task({
      type:'EVALUATE_REGISTERED_CANDIDATES',
      subject:String(row.candidateId||'UNKNOWN_CANDIDATE'),
      reason:'REGISTERED_CANDIDATE_HAS_NO_EVALUATION',
      priority:.74,
      informationValue:.78,
      uncertainty:.65,
      source:'MODEL_CANDIDATE_REGISTRY',
      dataNeeds:['WALK_FORWARD_EVIDENCE']
    }));
}

function tasksFromLearnedChallenger(summary={}){
  const counts=summary?.counts||summary||{};
  const pending=finite(counts.discovered)+finite(counts.trial);
  if(pending<=0)return [];
  return [task({
    type:'COLLECT_CHALLENGER_FORWARD_EVIDENCE',
    subject:'LEARNED_CHALLENGER_LAB',
    reason:'DISCOVERED_OR_TRIAL_RULES_REQUIRE_FORWARD_SHADOW_EVIDENCE',
    priority:.72,
    informationValue:.78,
    uncertainty:.6,
    source:'LEARNED_CHALLENGER_ENGINE',
    dataNeeds:['CHALLENGER_FORWARD_TRADES','REGIME_DIVERSITY'],
    metadata:{pending}
  })];
}

function tasksFromFeatureResearch(summary={}){
  const status=normalizedStatus(summary?.status);
  const experiments=arr(summary?.experiments);
  if(status!=='ACTIVE'&&experiments.length===0)return [];
  const unresolved=experiments.filter(x=>!['REJECTED','SUPPORTED'].includes(normalizedStatus(x?.status))).length;
  if(unresolved<=0)return [];
  return [task({
    type:'CONTINUE_FEATURE_RESEARCH',
    subject:'FEATURE_RESEARCH',
    reason:'FEATURE_EXPERIMENTS_STILL_REQUIRE_FORWARD_EVALUATION',
    priority:.67,
    informationValue:.72,
    uncertainty:.62,
    source:'FORECAST_FEATURE_RESEARCH',
    dataNeeds:['FEATURE_COMPLETE_FORWARD_ROWS'],
    metadata:{unresolved}
  })];
}

function tasksFromStrategyLeague(summary={}){
  const strategies=arr(summary?.strategies||summary?.rows);
  const open=strategies.reduce((n,x)=>n+finite(x?.openPositions??x?.open??x?.account?.openPositions),0);
  const closed=strategies.reduce((n,x)=>n+finite(x?.closedTrades??x?.closed??x?.account?.closedTrades),0);
  if(!strategies.length&&open===0&&closed===0)return [];
  return [task({
    type:'CONTINUE_STRATEGY_LEAGUE',
    subject:'SHADOW_STRATEGY_LEAGUE',
    reason:'STRATEGY_LEAGUE_REQUIRES_MORE_INDEPENDENT_SHADOW_DECISIONS',
    priority:.6,
    informationValue:.65,
    uncertainty:.55,
    source:'SHADOW_STRATEGY_LEAGUE',
    dataNeeds:['INDEPENDENT_SHADOW_TRADES','MULTI_REGIME_OUTCOMES'],
    metadata:{open,closed,strategyCount:strategies.length}
  })];
}

function dedupeTasks(tasks){
  const map=new Map();
  for(const row of tasks){
    const key=[row.type,row.subject,row.blocker||''].join('|');
    const prev=map.get(key);
    if(!prev||row.priority>prev.priority)map.set(key,row);
  }
  return [...map.values()].sort((a,b)=>
    Number(b.manualReviewRequired)-Number(a.manualReviewRequired)||
    b.priority-a.priority||
    b.informationValue-a.informationValue||
    String(a.taskId).localeCompare(String(b.taskId))
  );
}

function applyBudget(tasks,policy){
  const max=Math.max(1,Math.floor(finite(policy.maxQueueItems,24)));
  let candidateBuilds=0,stress=0,walk=0,auto=0;
  const out=[];
  for(const row of tasks){
    if(out.length>=max)break;
    if(row.automaticShadowEligible){
      if(auto>=policy.maxAutomaticResearchItems)continue;
      if(row.type==='GENERATE_NEXT_CHALLENGER_GENERATION'&&candidateBuilds>=policy.maxAutomaticCandidateBuildsPerCycle)continue;
      if(row.type==='ADVERSARIAL_STRESS'&&stress>=policy.maxAutomaticStressTestsPerCycle)continue;
      if(row.type==='WALK_FORWARD_VALIDATION'&&walk>=policy.maxAutomaticWalkForwardPerCycle)continue;
      auto++;
      if(row.type==='GENERATE_NEXT_CHALLENGER_GENERATION')candidateBuilds++;
      if(row.type==='ADVERSARIAL_STRESS')stress++;
      if(row.type==='WALK_FORWARD_VALIDATION')walk++;
    }
    out.push(row);
  }
  return out;
}

function sourceFingerprint(input){
  const compact={
    livingResearchFingerprint:input?.livingResearchState?.fingerprint??null,
    livingResearchRevision:finite(input?.livingResearchState?.revision),
    governorGenerationId:input?.experimentGovernorSummary?.generationId??null,
    governorStatus:input?.experimentGovernorSummary?.status??null,
    governorLastEvaluatedAt:input?.experimentGovernorSummary?.lastEvaluatedAt??null,
    modelRegistrySeq:finite(input?.modelCandidateRegistrySummary?.seq),
    learnedChallengerCounts:input?.learnedChallengerSummary?.counts??null,
    featureResearchStatus:input?.featureResearchSummary?.status??null,
    featureResearchFingerprint:input?.featureResearchSummary?.fingerprint??null,
    strategyLeagueFingerprint:input?.strategyLeagueSummary?.fingerprint??null,
    researchDataPlaneSeq:finite(input?.researchDataPlaneSummary?.seq),
    researchGovernanceFingerprint:input?.researchDataGovernanceSummary?.fingerprint??null,
    researchCoverageFingerprint:sha256({
      symbols:finite(input?.researchCoverageSummary?.symbols),
      healthy:finite(input?.researchCoverageSummary?.healthy),
      degraded:finite(input?.researchCoverageSummary?.degraded),
      blocked:finite(input?.researchCoverageSummary?.blocked),
      insufficient:finite(input?.researchCoverageSummary?.insufficient),
      averageCoverage:finite(input?.researchCoverageSummary?.averageCoverage,null),
      blockedFeatures:finite(input?.researchCoverageSummary?.blockedFeatures),
      degradedFeatures:finite(input?.researchCoverageSummary?.degradedFeatures),
      topBlockedSources:input?.researchCoverageSummary?.topBlockedSources??[],
      topBlockedFeatures:input?.researchCoverageSummary?.topBlockedFeatures??[],
      worstSymbols:input?.researchCoverageSummary?.worstSymbols??[]
    }),
    historyRows:finite(input?.historyStats?.rows),
    historyProgressAt:finite(input?.historyStats?.progressAt)
  };
  return sha256(compact);
}

export function createAutonomousResearchTrainingFactory({asOf=Date.now()}={}){
  const t=finite(asOf,Date.now());
  const core={
    version:AUTONOMOUS_RESEARCH_TRAINING_FACTORY_VERSION,
    createdAt:t,
    updatedAt:t,
    revision:0,
    sourceFingerprint:null,
    mode:'INITIALIZING',
    operatorDataOnly:false,
    queue:[],
    dataNeeds:[],
    taskMemory:{},
    researchBundles:[],
    leverage:{
      version:BIGGJ_RESEARCH_LEVERAGE_ENGINE_VERSION,
      leverCount:10,
      stalledTaskCount:0,
      batchOpportunityCount:0,
      topTasks:[],
      topBundles:[]
    },
    counters:{automatic:0,manual:0,dataOnly:0},
    lastReason:'INITIALIZED',
    policy:clone(DEFAULT_AUTONOMOUS_RESEARCH_FACTORY_POLICY),
    safety:{
      execution:'SHADOW_ONLY',
      canExecuteLive:false,
      automaticPrimaryMutation:false,
      automaticPromotion:false,
      automaticSkillTransition:false,
      automaticShadowResearchPlanning:true
    }
  };
  return Object.freeze({...core,fingerprint:sha256(core)});
}

export function verifyAutonomousResearchTrainingFactory(state){
  const reasons=[];
  if(state?.version!==AUTONOMOUS_RESEARCH_TRAINING_FACTORY_VERSION)reasons.push('VERSION_INVALID');
  if(state?.safety?.execution!=='SHADOW_ONLY')reasons.push('EXECUTION_MODE_INVALID');
  if(state?.safety?.canExecuteLive!==false)reasons.push('LIVE_EXECUTION_MUST_BE_FALSE');
  if(state?.safety?.automaticPrimaryMutation!==false)reasons.push('PRIMARY_MUTATION_MUST_BE_FALSE');
  if(state?.safety?.automaticPromotion!==false)reasons.push('AUTOMATIC_PROMOTION_MUST_BE_FALSE');
  if(state?.safety?.automaticSkillTransition!==false)reasons.push('AUTOMATIC_SKILL_TRANSITION_MUST_BE_FALSE');
  if(!Array.isArray(state?.queue))reasons.push('QUEUE_INVALID');
  if(!Array.isArray(state?.dataNeeds))reasons.push('DATA_NEEDS_INVALID');
  if(state?.taskMemory!=null&&(typeof state.taskMemory!=='object'||Array.isArray(state.taskMemory)))reasons.push('TASK_MEMORY_INVALID');
  if(state?.researchBundles!=null&&!Array.isArray(state.researchBundles))reasons.push('RESEARCH_BUNDLES_INVALID');
  const {fingerprint,...core}=state||{};
  if(fingerprint!==sha256(core))reasons.push('FINGERPRINT_MISMATCH');
  return {ok:reasons.length===0,reasons};
}

export function refreshAutonomousResearchTrainingFactory(state,{
  livingResearchState=null,
  experimentGovernorSummary=null,
  modelCandidateRegistrySummary=null,
  learnedChallengerSummary=null,
  featureResearchSummary=null,
  strategyLeagueSummary=null,
  researchDataPlaneSummary=null,
  researchDataGovernanceSummary=null,
  researchCoverageSummary=null,
  historyStats=null,
  asOf=Date.now(),
  reason='PERIODIC_REFRESH',
  policy=null
}={}){
  const base=state||createAutonomousResearchTrainingFactory({asOf});
  const verified=verifyAutonomousResearchTrainingFactory(base);
  if(!verified.ok)throw new Error('autonomous research factory invalid: '+verified.reasons.join(','));
  const t=finite(asOf,Date.now());
  const effectivePolicy=Object.freeze({...DEFAULT_AUTONOMOUS_RESEARCH_FACTORY_POLICY,...(base.policy||{}),...(policy||{})});
  const input={
    livingResearchState,
    experimentGovernorSummary,
    modelCandidateRegistrySummary,
    learnedChallengerSummary,
    featureResearchSummary,
    strategyLeagueSummary,
    researchDataPlaneSummary,
    researchDataGovernanceSummary,
    researchCoverageSummary,
    historyStats
  };
  const fp=sourceFingerprint(input);
  if(fp===base.sourceFingerprint){
    return Object.freeze({changed:false,state:base,reasons:['SOURCE_STATE_UNCHANGED']});
  }

  const rawTasks=dedupeTasks([
    ...tasksFromLivingResearch(livingResearchState),
    ...tasksFromExperimentGovernor(experimentGovernorSummary||{}),
    ...tasksFromRegistry(modelCandidateRegistrySummary||{}),
    ...tasksFromLearnedChallenger(learnedChallengerSummary||{}),
    ...tasksFromFeatureResearch(featureResearchSummary||{}),
    ...tasksFromStrategyLeague(strategyLeagueSummary||{})
  ]);
  const leverage=rankBiggjResearchTasks(rawTasks,{
    asOf:t,
    taskMemory:base.taskMemory||{},
    livingResearchState,
    researchCoverageSummary,
    researchDataGovernanceSummary
  });
  const tasks=applyBudget(leverage.tasks,effectivePolicy);

  const manual=tasks.filter(x=>x.manualReviewRequired);
  const automatic=tasks.filter(x=>x.automaticShadowEligible);
  const dataOnly=automatic.filter(x=>DATA_ONLY_TYPES.has(x.type));
  const unowned=tasks.filter(x=>!x.manualReviewRequired&&!x.autoHandler);
  const governanceBlocked=(Array.isArray(researchDataGovernanceSummary?.quarantinedSources)?researchDataGovernanceSummary.quarantinedSources.length:finite(researchDataGovernanceSummary?.quarantinedSources))>0||
    (Array.isArray(researchDataGovernanceSummary?.blockedSources)?researchDataGovernanceSummary.blockedSources.length:finite(researchDataGovernanceSummary?.blockedSources))>0;
  const dataNeeds=uniq(tasks.flatMap(x=>x.dataNeeds));
  const stalledResearch=finite(leverage?.summary?.stalledTaskCount)>0;

  let mode='AUTONOMOUS_RESEARCH_ACTIVE';
  if(governanceBlocked)mode='DATA_QUALITY_BLOCKED';
  else if(manual.length)mode='MANUAL_REVIEW_REQUIRED';
  else if(unowned.length)mode='AUTOMATION_GAP';
  else if(stalledResearch)mode='RESEARCH_STALLED';
  else if(automatic.length===0)mode='IDLE_MONITORING';
  else if(dataOnly.length===automatic.length)mode='DATA_COLLECTION_ONLY';

  const operatorDataOnly=
    !governanceBlocked&&
    manual.length===0&&
    unowned.length===0&&
    !stalledResearch;

  const compactHistory=arr(base.history).slice(-31);
  compactHistory.push({
    at:t,
    revision:finite(base.revision)+1,
    mode,
    operatorDataOnly,
    automatic:automatic.length,
    manual:manual.length,
    dataNeeds:dataNeeds.slice(0,12),
    stalledTasks:finite(leverage?.summary?.stalledTaskCount),
    topTask:leverage?.summary?.topTasks?.[0]?.taskId??null,
    sourceFingerprint:fp
  });

  const core={
    version:AUTONOMOUS_RESEARCH_TRAINING_FACTORY_VERSION,
    createdAt:finite(base.createdAt,t),
    updatedAt:t,
    revision:finite(base.revision)+1,
    sourceFingerprint:fp,
    mode,
    operatorDataOnly,
    queue:tasks,
    dataNeeds,
    taskMemory:clone(leverage.taskMemory),
    researchBundles:clone(leverage.bundles),
    leverage:clone(leverage.summary),
    counters:{
      automatic:automatic.length,
      manual:manual.length,
      dataOnly:dataOnly.length,
      unowned:unowned.length
    },
    inputs:{
      researchRevision:finite(livingResearchState?.revision),
      researchQueueItems:arr(livingResearchState?.canonicalResearchQueue).length,
      reviewTickets:arr(livingResearchState?.researchReviewQueue?.tickets).length,
      governorStatus:String(experimentGovernorSummary?.status||'UNINITIALIZED'),
      governorGeneration:finite(experimentGovernorSummary?.generationNumber),
      modelRegistrySeq:finite(modelCandidateRegistrySummary?.seq),
      researchDataPlaneSeq:finite(researchDataPlaneSummary?.seq),
      researchCoverageAverage:finite(researchCoverageSummary?.averageCoverage,null),
      researchCoverageBlocked:finite(researchCoverageSummary?.blocked,null),
      researchCoverageInsufficient:finite(researchCoverageSummary?.insufficient,null),
      historyRows:finite(historyStats?.rows),
      historyProgressAt:finite(historyStats?.progressAt)
    },
    history:compactHistory,
    lastReason:String(reason),
    policy:clone(effectivePolicy),
    safety:{
      execution:'SHADOW_ONLY',
      canExecuteLive:false,
      automaticPrimaryMutation:false,
      automaticPromotion:false,
      automaticSkillTransition:false,
      automaticShadowResearchPlanning:true
    }
  };
  return Object.freeze({
    changed:true,
    state:Object.freeze({...core,fingerprint:sha256(core)}),
    reasons:['RESEARCH_FACTORY_REFRESHED']
  });
}

export function autonomousResearchTrainingFactorySummary(state){
  const v=verifyAutonomousResearchTrainingFactory(state);
  const queue=arr(state?.queue);
  return Object.freeze({
    version:AUTONOMOUS_RESEARCH_TRAINING_FACTORY_VERSION,
    healthy:v.ok,
    reasons:v.reasons,
    mode:String(state?.mode||'UNINITIALIZED'),
    operatorDataOnly:state?.operatorDataOnly===true,
    revision:finite(state?.revision),
    updatedAt:finite(state?.updatedAt,null),
    queueItems:queue.length,
    automatic:finite(state?.counters?.automatic),
    manual:finite(state?.counters?.manual),
    dataOnly:finite(state?.counters?.dataOnly),
    unowned:finite(state?.counters?.unowned),
    dataNeeds:arr(state?.dataNeeds).slice(0,20),
    leverage:{
      version:state?.leverage?.version??BIGGJ_RESEARCH_LEVERAGE_ENGINE_VERSION,
      leverCount:finite(state?.leverage?.leverCount,10),
      stalledTaskCount:finite(state?.leverage?.stalledTaskCount),
      batchOpportunityCount:finite(state?.leverage?.batchOpportunityCount),
      dataState:state?.leverage?.dataState??null,
      topBundles:arr(state?.leverage?.topBundles).slice(0,8),
      topTasks:arr(state?.leverage?.topTasks).slice(0,8)
    },
    researchBundles:arr(state?.researchBundles).slice(0,8),
    nextTasks:queue.slice(0,8).map(x=>({
      taskId:x.taskId,
      type:x.type,
      subject:x.subject,
      priority:x.priority,
      effectivePriority:finite(x.effectivePriority,x.priority),
      estimatedResearchCost:finite(x.estimatedResearchCost,null),
      topLevers:arr(x.topLevers).slice(0,3),
      stagnantCycles:finite(x.stagnantCycles),
      queueAgeMs:finite(x.queueAgeMs),
      stalled:x.stalled===true,
      reason:x.reason,
      autoHandler:x.autoHandler,
      automaticShadowEligible:x.automaticShadowEligible,
      manualReviewRequired:x.manualReviewRequired,
      dataNeeds:x.dataNeeds
    })),
    execution:'SHADOW_ONLY',
    canExecuteLive:false,
    automaticPrimaryMutation:false,
    automaticPromotion:false
  });
}

export async function loadAutonomousResearchTrainingFactory(filePath){
  await mkdir(path.dirname(filePath),{recursive:true});
  try{
    const raw=await readFile(filePath,'utf8');
    const state=JSON.parse(raw);
    const v=verifyAutonomousResearchTrainingFactory(state);
    if(!v.ok)throw new Error(v.reasons.join(','));
    return state;
  }catch(err){
    if(err?.code==='ENOENT')return createAutonomousResearchTrainingFactory();
    const backup=filePath+'.corrupt-'+Date.now();
    try{await rename(filePath,backup);}catch{}
    return createAutonomousResearchTrainingFactory();
  }
}

export async function saveAutonomousResearchTrainingFactory(filePath,state){
  const v=verifyAutonomousResearchTrainingFactory(state);
  if(!v.ok)throw new Error('autonomous research factory invalid: '+v.reasons.join(','));
  await mkdir(path.dirname(filePath),{recursive:true});
  const tmp=filePath+'.tmp-'+process.pid;
  await writeFile(tmp,JSON.stringify(state,null,2)+'\n',{encoding:'utf8',mode:0o600});
  await rename(tmp,filePath);
  return state;
}
