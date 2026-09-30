import path from 'node:path';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';

import { sha256 } from './institutional-kernel.mjs';
import {
  createBiggjSkillTree,
  reconcileBiggjSkillTreeWithCapabilityMap,
  proposeBiggjChildSkill,
  recordBiggjSkillEvidence,
  evaluateBiggjSkillProgress,
  buildBiggjResearchQueue,
  biggjSkillTreeSnapshot,
  verifyBiggjSkillTree
} from './biggj-skill-tree.mjs';
import { canonicalSkillLeverage } from './biggj-skill-dependency-graph.mjs';
import {
  resolveBiggjResearchEpisodes,
  researchEpisodeAssignment,
  BIGGJ_RESEARCH_EPISODE_RESOLVER_VERSION
} from './biggj-research-episode-resolver.mjs';
import {
  compileBiggjResearchProtocol,
  verifyBiggjResearchProtocol,
  researchProtocolSummary,
  BIGGJ_RESEARCH_PROTOCOL_VERSION
} from './biggj-research-protocol-compiler.mjs';

export const BIGGJ_LIVING_RESEARCH_RUNTIME_VERSION='TCX_BIGGJ_LIVING_RESEARCH_RUNTIME_V1';
export const BIGGJ_LIVING_RESEARCH_EVIDENCE_BINDING_VERSION='TCX_BIGGJ_LIVING_RESEARCH_EVIDENCE_BINDING_V2';

const deepFreeze=value=>{
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    Object.freeze(value);
    for(const v of Object.values(value)) deepFreeze(v);
  }
  return value;
};
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,Number(v)||0));
const finite=(v,f=null)=>{
  if(v===null||v===undefined||v==='') return f;
  const n=Number(v);
  return Number.isFinite(n)?n:f;
};
const uniq=xs=>[...new Set((xs||[]).map(String).filter(Boolean))].sort();
const coreOf=value=>{
  const {fingerprint,...core}=value||{};
  return core;
};
const finalized=core=>deepFreeze({...core,fingerprint:sha256(core)});

const ASSUMPTION_RESEARCH_TEMPLATES=deepFreeze([
  {
    assumptionId:'THESIS_WORLD_STATE_REPRESENTATIVE',
    primaryCapabilityId:'STATE_CHANGE_ATTRIBUTION',
    supportingCapabilityIds:['CANONICAL_WORLD_STATE','STATE_UNCERTAINTY','REGIME_TRANSITION_MODEL'],
    title:'WORLD_STATE_STABILITY_RESEARCH',
    question:'Which point-in-time world-state changes most often cause an issued thesis to lose support, and which of those changes are reproducible rather than transient noise?',
    hypothesis:'Persistent world-state support loss is concentrated in a reproducible subset of state transitions that can be identified before horizon maturity.',
    falsifier:'Across independent forward-shadow episodes, persistent world-state support loss is not concentrated in reproducible transitions or adds no information beyond transient state noise.'
  },
  {
    assumptionId:'THESIS_WITNESS_SUPPORT_ADEQUATE',
    primaryCapabilityId:'EVIDENCE_INDEPENDENCE',
    supportingCapabilityIds:['SOURCE_TRUST','DISAGREEMENT_ENGINE','COMMON_CAUSE_GUARD'],
    title:'WITNESS_STABILITY_RESEARCH',
    question:'When independent witness support becomes persistently stale, is the cause missing independent evidence, common-cause dependence, source degradation, or genuine cross-source disagreement?',
    hypothesis:'Persistent witness-support loss can be decomposed into reproducible independence, trust, common-cause, or disagreement failure modes.',
    falsifier:'Forward-shadow evidence does not separate witness-support failures into stable failure modes beyond ordinary source noise.'
  },
  {
    assumptionId:'THESIS_MECHANISM_SUPPORT_ADEQUATE',
    primaryCapabilityId:'IDENTIFIABILITY',
    supportingCapabilityIds:['CONSTRAINT_MAP','INCENTIVE_CONSTRAINT_INFERENCE','STATE_CHANGE_ATTRIBUTION'],
    title:'MECHANISM_STABILITY_RESEARCH',
    question:'Which mechanism hypotheses lose support persistently, and is the failure caused by weak identification, missing constraints, alternative participant explanations, or regime change?',
    hypothesis:'Mechanism-support decay has identifiable recurrent causes that can be distinguished before outcome observation.',
    falsifier:'Persistent mechanism-support loss cannot be separated from generic model uncertainty or state change using pre-outcome evidence.'
  },
  {
    assumptionId:'THESIS_TRANSITION_ANALOGUES_ADEQUATE',
    primaryCapabilityId:'HISTORICAL_ANALOGUES',
    supportingCapabilityIds:['DETERMINISTIC_REPLAY','REGIME_TRANSITION_MODEL','REGIME_STATE_MEMORY'],
    title:'TRANSITION_ANALOGUE_STABILITY_RESEARCH',
    question:'Under which regimes do historical transition analogues stop being adequate, and can effective-sample-size or change-point diagnostics identify this before forecast maturity?',
    hypothesis:'Persistent analogue-support loss is preceded by measurable regime mismatch, dependence, or insufficient effective sample size.',
    falsifier:'Pre-outcome analogue diagnostics do not distinguish persistent support loss from ordinary sampling variation.'
  },
  {
    assumptionId:'THESIS_EVIDENCE_ALIGNMENT_ADEQUATE',
    primaryCapabilityId:'PROVENANCE_CHAIN',
    supportingCapabilityIds:['EVIDENCE_INDEPENDENCE','DISAGREEMENT_ENGINE','UNCERTAINTY_DECOMPOSITION'],
    title:'EVIDENCE_ALIGNMENT_STABILITY_RESEARCH',
    question:'Which evidence-lineage, strength, dependence, or disagreement patterns precede persistent evidence-alignment failure?',
    hypothesis:'Persistent evidence-alignment loss has recurrent provenance or uncertainty signatures visible before maturity.',
    falsifier:'No stable pre-outcome provenance, strength, dependence, or disagreement signature separates persistent alignment loss from transient flicker.'
  },
  {
    assumptionId:'THESIS_DEPENDENCY_COVERAGE_ADEQUATE',
    primaryCapabilityId:'COVERAGE_GAP_DETECTION',
    supportingCapabilityIds:['PROVENANCE_CHAIN','SOURCE_TRUST','FAIL_CLOSED_DEGRADATION'],
    title:'DEPENDENCY_COVERAGE_STABILITY_RESEARCH',
    question:'Which missing or degraded source-to-feature dependencies repeatedly cause forecast-thesis support to become persistently stale?',
    hypothesis:'Persistent dependency-coverage failures are dominated by a bounded set of source, feature, freshness, or governance bottlenecks.',
    falsifier:'Persistent dependency-coverage failures are diffuse, non-recurrent, or cannot be linked to point-in-time dependency lineage.'
  },
  {
    assumptionId:'THESIS_DISAGREEMENT_WITHIN_TOLERANCE',
    primaryCapabilityId:'DISAGREEMENT_ENGINE',
    supportingCapabilityIds:['COMMON_CAUSE_GUARD','EVIDENCE_INDEPENDENCE','UNCERTAINTY_DECOMPOSITION'],
    title:'DISAGREEMENT_STABILITY_RESEARCH',
    question:'Which forms of disagreement persist long enough to matter, and which are harmless transient conflicts or shared-source artifacts?',
    hypothesis:'Persistence and lineage separate structurally meaningful disagreement from transient or common-cause disagreement.',
    falsifier:'Persistence-filtered disagreement has no reproducible relation to later forecast error or adds no information beyond raw disagreement.'
  },
  {
    assumptionId:'THESIS_SCIENTIFIC_GUARDS_ADEQUATE',
    primaryCapabilityId:'SCIENTIFIC_GUARD_ORCHESTRATION',
    supportingCapabilityIds:['REPRODUCIBLE_PROMOTION_AUDIT','MULTIPLE_TESTING_BUDGET','DETERMINISTIC_REPRODUCIBILITY'],
    title:'SCIENTIFIC_GUARD_STABILITY_RESEARCH',
    question:'Which scientific-guard failures recur prospectively, what upstream evidence causes them, and which failures indicate a genuine research-design defect rather than temporary data insufficiency?',
    hypothesis:'Persistent scientific-guard failures cluster into reproducible upstream design or evidence deficits that can be separately tested.',
    falsifier:'Repeated scientific-guard failures do not form stable prospective categories or cannot be reproduced from frozen inputs.'
  }
]);

function templateByAssumption(){
  return new Map(ASSUMPTION_RESEARCH_TEMPLATES.map(x=>[x.assumptionId,x]));
}

function normalizeMemories(thesisMemories){
  return (thesisMemories||[])
    .filter(Boolean)
    .map(memory=>({
      forecastId:String(memory?.forecastId||'UNKNOWN'),
      symbol:String(memory?.symbol||'UNKNOWN').toUpperCase(),
      decisionAsOf:finite(memory?.decisionAsOf),
      issueKnowledgeAt:finite(memory?.issueKnowledgeAt),
      firstPersistentStaleAt:finite(memory?.firstPersistentStaleAt),
      assumptions:(memory?.assumptions||[]).map(a=>({
        assumptionId:String(a?.assumptionId||'UNKNOWN'),
        issueSupported:a?.issueSupported===true,
        currentSupported:a?.currentSupported===true,
        stability:{
          state:String(a?.stability?.state||'UNKNOWN'),
          firstPersistentStaleAt:finite(a?.stability?.firstPersistentStaleAt),
          persistentStaleCount:Math.max(0,Math.floor(Number(a?.stability?.persistentStaleCount)||0)),
          transientFlickerCount:Math.max(0,Math.floor(Number(a?.stability?.transientFlickerCount)||0)),
          recoveryCount:Math.max(0,Math.floor(Number(a?.stability?.recoveryCount)||0)),
          relapseCount:Math.max(0,Math.floor(Number(a?.stability?.relapseCount)||0)),
          currentUnsupportedDurationMs:Math.max(0,Number(a?.stability?.currentUnsupportedDurationMs)||0),
          currentFalsifierCodes:uniq(a?.stability?.currentFalsifierCodes),
          repeatedFalsifierCodes:uniq(a?.stability?.repeatedFalsifierCodes)
        }
      })).sort((a,b)=>a.assumptionId.localeCompare(b.assumptionId)),
      stabilityEvents:(memory?.events||[]).flatMap(event=>
        (event?.stabilityTransitions||[]).map(t=>({
          eventId:String(t?.eventId||event?.eventId||''),
          assumptionId:String(t?.assumptionId||'UNKNOWN'),
          type:String(t?.type||'UNKNOWN'),
          observedAt:finite(t?.observedAt,event?.observedAt),
          repeatedFalsifierCodes:uniq(t?.repeatedFalsifierCodes),
          falsifierCodes:uniq(t?.falsifierCodes)
        }))
      ).sort((a,b)=>
        Number(a.observedAt||0)-Number(b.observedAt||0)||
        a.assumptionId.localeCompare(b.assumptionId)||
        a.type.localeCompare(b.type)
      )
    }))
    .sort((a,b)=>a.forecastId.localeCompare(b.forecastId));
}

function persistentCaseKey(forecastId,assumptionId){
  return String(forecastId)+'|'+String(assumptionId);
}

function mergeObservedForecastIds(existing,memories,{maxRows=20_000}={}){
  const ids=new Set((existing||[]).map(String).filter(Boolean));
  for(const memory of memories) ids.add(String(memory.forecastId));
  return [...ids].sort().slice(-Math.max(1000,Math.floor(Number(maxRows)||20_000)));
}

function mergePersistentCaseRegistry(existing,memories,{observedAt,maxRows=10_000}={}){
  const map=new Map((existing||[]).map(row=>[
    persistentCaseKey(row.forecastId,row.assumptionId),
    structuredClone(row)
  ]));
  const t=finite(observedAt,0);
  for(const memory of memories){
    for(const row of memory.assumptions){
      const st=row.stability;
      const historicallyPersistent=
        st.firstPersistentStaleAt!=null||
        st.persistentStaleCount>0||
        st.state==='PERSISTENT_STALE'||
        st.state==='RECOVERING';
      if(!historicallyPersistent) continue;
      const key=persistentCaseKey(memory.forecastId,row.assumptionId);
      const prior=map.get(key);
      const firstAt=[
        finite(prior?.firstPersistentStaleAt),
        finite(st.firstPersistentStaleAt),
        finite(memory.firstPersistentStaleAt)
      ].filter(x=>x!=null);
      map.set(key,{
        caseId:'persistent-case:'+sha256({forecastId:memory.forecastId,assumptionId:row.assumptionId}).slice(0,24),
        forecastId:memory.forecastId,
        assumptionId:row.assumptionId,
        symbol:String(prior?.symbol||memory.symbol||'UNKNOWN').toUpperCase(),
        decisionAsOf:finite(prior?.decisionAsOf,memory.decisionAsOf),
        issueKnowledgeAt:finite(prior?.issueKnowledgeAt,memory.issueKnowledgeAt),
        firstPersistentStaleAt:firstAt.length?Math.min(...firstAt):null,
        persistentStaleCount:Math.max(Number(prior?.persistentStaleCount||0),Number(st.persistentStaleCount||0),1),
        transientFlickerCount:Math.max(Number(prior?.transientFlickerCount||0),Number(st.transientFlickerCount||0)),
        recoveryCount:Math.max(Number(prior?.recoveryCount||0),Number(st.recoveryCount||0)),
        relapseCount:Math.max(Number(prior?.relapseCount||0),Number(st.relapseCount||0)),
        falsifierCodes:uniq([
          ...(prior?.falsifierCodes||[]),
          ...st.currentFalsifierCodes,
          ...st.repeatedFalsifierCodes
        ]),
        lastKnownState:st.state,
        firstSeenByLivingResearchAt:finite(prior?.firstSeenByLivingResearchAt,t),
        lastSeenByLivingResearchAt:Math.max(Number(prior?.lastSeenByLivingResearchAt||0),t)
      });
    }
  }
  return [...map.values()]
    .sort((a,b)=>
      Number(a.firstPersistentStaleAt??Infinity)-Number(b.firstPersistentStaleAt??Infinity)||
      a.forecastId.localeCompare(b.forecastId)||
      a.assumptionId.localeCompare(b.assumptionId)
    )
    .slice(-Math.max(1000,Math.floor(Number(maxRows)||10_000)));
}

function mergeStabilityEventRegistry(existing,memories,{maxRows=20_000}={}){
  const map=new Map((existing||[]).map(row=>[String(row.registryEventId),structuredClone(row)]));
  for(const memory of memories){
    for(const event of memory.stabilityEvents){
      if(![
        'PERSISTENT_STALE_CONFIRMED',
        'RECOVERY_FAILED',
        'PERSISTENT_STALE_RECOVERED',
        'ISSUE_UNSUPPORTED_SUPPORT_ESTABLISHED',
        'ISSUE_SUPPORT_ESTABLISHMENT_FAILED'
      ].includes(event.type)) continue;
      const registryEventId=event.eventId||
        'stability-event:'+sha256({
          forecastId:memory.forecastId,
          assumptionId:event.assumptionId,
          type:event.type,
          observedAt:event.observedAt,
          repeatedFalsifierCodes:event.repeatedFalsifierCodes,
          falsifierCodes:event.falsifierCodes
        }).slice(0,24);
      if(map.has(registryEventId)) continue;
      map.set(registryEventId,{
        registryEventId,
        forecastId:memory.forecastId,
        assumptionId:event.assumptionId,
        type:event.type,
        observedAt:event.observedAt,
        repeatedFalsifierCodes:[...event.repeatedFalsifierCodes],
        falsifierCodes:[...event.falsifierCodes]
      });
    }
  }
  return [...map.values()]
    .sort((a,b)=>
      Number(a.observedAt||0)-Number(b.observedAt||0)||
      a.forecastId.localeCompare(b.forecastId)||
      a.assumptionId.localeCompare(b.assumptionId)||
      a.type.localeCompare(b.type)
    )
    .slice(-Math.max(1000,Math.floor(Number(maxRows)||20_000)));
}

function associationFor(report,assumptionId){
  const row=(report?.byPreOutcomeStaleAssumption||[]).find(x=>String(x?.assumptionId)===String(assumptionId));
  const p=row?.persistenceFiltered||null;
  return {
    observations:Math.max(0,Number(p?.observations)||0),
    persistentStaleBeforeMaturity:Math.max(0,Number(p?.persistentStaleBeforeMaturity)||0),
    neverPersistentStaleBeforeMaturity:Math.max(0,Number(p?.neverPersistentStaleBeforeMaturity)||0),
    associationReady:p?.associationReady===true,
    directionFailureRateDifference:finite(p?.directionFailureRateDifference),
    intervalMissRateDifference:finite(p?.intervalMissRateDifference),
    interpretation:p?.interpretation||'PERSISTENCE_FILTERED_ASSOCIATION_ONLY_NOT_CAUSAL_PROOF'
  };
}

function collectSignalFor(template,memories,report,{
  persistentCaseRegistry=[],
  stabilityEventRegistry=[],
  observedForecastIds=[]
}={}){
  let currentPersistentForecasts=0;
  let currentTransientForecasts=0;
  let everPersistentForecasts=0;
  let persistentConfirmations=0;
  let recoveryFailures=0;
  let recoveries=0;
  let maxUnsupportedDurationMs=0;
  const falsifierCounts=new Map();
  const forecastIds=new Set();

  for(const memory of memories){
    const row=memory.assumptions.find(x=>x.assumptionId===template.assumptionId);
    if(!row) continue;
    const st=row.stability;
    if(st.state==='PERSISTENT_STALE'||st.state==='RECOVERING') currentPersistentForecasts++;
    if(st.state==='TRANSIENT_FLICKER') currentTransientForecasts++;
    maxUnsupportedDurationMs=Math.max(maxUnsupportedDurationMs,st.currentUnsupportedDurationMs||0);
    for(const code of [...st.currentFalsifierCodes,...st.repeatedFalsifierCodes]){
      falsifierCounts.set(code,(falsifierCounts.get(code)||0)+1);
    }
  }

  const historicalCases=persistentCaseRegistry.filter(x=>x.assumptionId===template.assumptionId);
  everPersistentForecasts=historicalCases.length;
  for(const row of historicalCases){
    forecastIds.add(row.forecastId);
    for(const code of row.falsifierCodes||[]){
      falsifierCounts.set(code,(falsifierCounts.get(code)||0)+1);
    }
  }
  const historicalEvents=stabilityEventRegistry.filter(x=>x.assumptionId===template.assumptionId);
  for(const event of historicalEvents){
    if(event.type==='PERSISTENT_STALE_CONFIRMED') persistentConfirmations++;
    if(event.type==='RECOVERY_FAILED') recoveryFailures++;
    if(event.type==='PERSISTENT_STALE_RECOVERED') recoveries++;
    for(const code of [...(event.repeatedFalsifierCodes||[]),...(event.falsifierCodes||[])]){
      falsifierCounts.set(code,(falsifierCounts.get(code)||0)+1);
    }
  }

  const falsifiers=[...falsifierCounts.entries()]
    .map(([code,count])=>({code,count}))
    .sort((a,b)=>b.count-a.count||a.code.localeCompare(b.code));
  const association=associationFor(report,template.assumptionId);
  const leverageCandidates=[template.primaryCapabilityId,...template.supportingCapabilityIds]
    .map(id=>canonicalSkillLeverage(id));
  const leverage=leverageCandidates.reduce((m,x)=>Math.max(m,x.score),0);
  const prevalence=observedForecastIds.length?everPersistentForecasts/observedForecastIds.length:0;
  const persistenceStrength=clamp(everPersistentForecasts/5);
  const recurrenceStrength=clamp((persistentConfirmations+recoveryFailures)/8);
  const falsifierDiversity=clamp(falsifiers.length/4);
  const currentPressure=clamp(currentPersistentForecasts/3);
  const associationStrength=association.associationReady
    ?clamp(Math.max(
      Math.abs(Number(association.directionFailureRateDifference)||0),
      Math.abs(Number(association.intervalMissRateDifference)||0)
    )/.25)
    :0;
  const priority=clamp(
    .28*persistenceStrength+
    .14*recurrenceStrength+
    .10*falsifierDiversity+
    .10*currentPressure+
    .23*leverage+
    .10*associationStrength+
    .05*clamp(prevalence)
  );
  const researchRequired=
    everPersistentForecasts>=3||
    recoveryFailures>=2||
    (association.associationReady&&associationStrength>=.4&&everPersistentForecasts>=2);
  const status=researchRequired
    ?'RESEARCH_REQUIRED'
    :everPersistentForecasts>0
      ?'COLLECT_MORE_PERSISTENCE'
      :currentTransientForecasts>0
        ?'WATCH_FLICKER'
        :'DORMANT';

  return {
    assumptionId:template.assumptionId,
    status,
    priority,
    informationValue:clamp(priority*(.55+.45*leverage)),
    primaryCapabilityId:template.primaryCapabilityId,
    supportingCapabilityIds:[...template.supportingCapabilityIds],
    currentPersistentForecasts,
    currentTransientForecasts,
    everPersistentForecasts,
    persistentConfirmations,
    recoveryFailures,
    recoveries,
    distinctPersistentForecasts:forecastIds.size,
    maxUnsupportedDurationMs,
    falsifiers,
    association,
    researchRequired,
    researchContract:{
      title:template.title,
      question:template.question,
      hypothesis:template.hypothesis,
      falsifier:template.falsifier,
      baseline:'CURRENT_BIGGJ_THESIS_PIPELINE_WITHOUT_ASSUMPTION_SPECIFIC_RESEARCH_EXTENSION',
      pointInTimeRequired:true,
      independentEpisodesRequired:true,
      prospectiveOnly:true,
      outcomeDoesNotValidateAssumptionTruth:true,
      causalInterpretation:false
    }
  };
}

function compactSource(memories,report){
  return {
    researchEvidenceBindingVersion:BIGGJ_LIVING_RESEARCH_EVIDENCE_BINDING_VERSION,
    researchProtocolVersion:BIGGJ_RESEARCH_PROTOCOL_VERSION,
    memories:memories.map(m=>({
      forecastId:m.forecastId,
      symbol:m.symbol,
      decisionAsOf:m.decisionAsOf,
      issueKnowledgeAt:m.issueKnowledgeAt,
      firstPersistentStaleAt:m.firstPersistentStaleAt,
      assumptions:m.assumptions.map(a=>({
        assumptionId:a.assumptionId,
        state:a.stability.state,
        firstPersistentStaleAt:a.stability.firstPersistentStaleAt,
        persistentStaleCount:a.stability.persistentStaleCount,
        transientFlickerCount:a.stability.transientFlickerCount,
        recoveryCount:a.stability.recoveryCount,
        relapseCount:a.stability.relapseCount,
        currentUnsupportedDurationMs:a.stability.currentUnsupportedDurationMs,
        currentFalsifierCodes:a.stability.currentFalsifierCodes,
        repeatedFalsifierCodes:a.stability.repeatedFalsifierCodes
      })),
      stabilityEvents:m.stabilityEvents
    })),
    claimAssumptionReportFingerprint:report?.fingerprint||null,
    claimAssumptionReportEvaluatedAt:finite(report?.evaluatedAt)
  };
}

function assertLivingResearchPointInTime(memories,claimAssumptionReport,asOf){
  const t=Number(asOf);
  const reportAt=finite(claimAssumptionReport?.evaluatedAt);
  if(reportAt!=null&&reportAt>t) throw new Error('future claim-assumption research report blocked');
  for(const memory of memories||[]){
    const memoryPersistentAt=finite(memory?.firstPersistentStaleAt);
    if(memoryPersistentAt!=null&&memoryPersistentAt>t) throw new Error('future thesis persistence state blocked');
    for(const row of memory?.assumptions||[]){
      const persistentAt=finite(row?.stability?.firstPersistentStaleAt);
      if(persistentAt!=null&&persistentAt>t) throw new Error('future assumption persistence state blocked');
    }
    for(const event of memory?.stabilityEvents||[]){
      const eventAt=finite(event?.observedAt);
      if(eventAt!=null&&eventAt>t) throw new Error('future thesis stability event blocked');
    }
  }
}

function currentTreeMapFingerprint(){
  return createBiggjSkillTree({asOf:0}).capabilityMapFingerprint;
}

function researchSkillForTemplate(tree,template){
  return (tree?.nodes||[]).find(node=>
    node?.kind==='DISCOVERED_SKILL'&&
    node?.parentSkillId==='seed:'+template.primaryCapabilityId&&
    node?.title===template.title&&
    node?.discoveredBy==='ASSUMPTION_PERSISTENCE_RUNTIME_V1'
  )||null;
}

function evidenceHasProvenance(node,key,value){
  for(const evidence of node?.evidence||[]){
    for(const item of evidence?.provenance||[]){
      if(item&&String(item?.[key]??'')===String(value)) return true;
    }
  }
  return false;
}

function prospectiveCaseSelected(caseRow,index){
  if(index<20) return true;
  const hex=sha256(String(caseRow?.caseId||'')).slice(0,8);
  return Number.parseInt(hex,16)%5===0;
}

function bindResearchEvidence(tree,{
  signal,
  template,
  persistentCaseRegistry=[],
  claimAssumptionReport=null,
  asOf
}={}){
  let next=tree;
  let skill=researchSkillForTemplate(next,template);
  if(!skill) return {tree:next,boundEvidenceIds:[]};

  const bound=[];
  const cases=(persistentCaseRegistry||[])
    .filter(row=>row.assumptionId===template.assumptionId)
    .sort((a,b)=>
      Number(a.firstSeenByLivingResearchAt||0)-Number(b.firstSeenByLivingResearchAt||0)||
      String(a.caseId).localeCompare(String(b.caseId))
    );
  const episodePlan=resolveBiggjResearchEpisodes(cases,{
    hypothesisCreatedAt:Number(skill.createdAt),
    asOf:Number(asOf)
  });

  const discoveryCases=cases.filter(row=>
    Number(row.firstSeenByLivingResearchAt||Infinity)<=Number(skill.createdAt)
  );
  if(discoveryCases.length){
    const cohortCaseIds=discoveryCases.map(x=>x.caseId).sort();
    const cohortId='discovery-cohort:'+sha256({
      skillId:skill.skillId,
      assumptionId:template.assumptionId,
      caseIds:cohortCaseIds
    }).slice(0,24);
    if(!evidenceHasProvenance(skill,'cohortId',cohortId)){
      const latestKnownAt=Math.max(
        ...discoveryCases.map(x=>Number(x.firstSeenByLivingResearchAt||0)),
        Number(skill.createdAt||0)
      );
      const persistentTimes=discoveryCases
        .map(x=>finite(x.firstPersistentStaleAt))
        .filter(x=>x!=null);
      next=recordBiggjSkillEvidence(next,{
        skillId:skill.skillId,
        epistemicClass:'INFERRED',
        asOf:Number(skill.createdAt),
        availableAt:Math.min(Number(skill.createdAt),latestKnownAt),
        sourceId:'BIGGJ_LIVING_RESEARCH_DISCOVERY_COHORT',
        independentEpisodeId:null,
        statement:
          'Discovery cohort contained '+discoveryCases.length+
          ' persistent '+template.assumptionId+
          ' forecast cases known when this research skill was created. This is in-sample discovery evidence, not forward validation.',
        outcome:'NEUTRAL',
        metricDelta:null,
        forwardShadow:false,
        pointInTime:true,
        futureLeakage:false,
        auditReady:false,
        scientificGuardsPassed:false,
        chronologicalStable:false,
        costStressPassed:false,
        concentrationPassed:false,
        winnerRemovalPassed:false,
        provenance:[{
          kind:'DISCOVERY_COHORT',
          cohortId,
          assumptionId:template.assumptionId,
          caseCount:discoveryCases.length,
          caseSetFingerprint:sha256(cohortCaseIds),
          earliestPersistentStaleAt:persistentTimes.length?Math.min(...persistentTimes):null,
          latestFirstSeenByLivingResearchAt:Math.max(...discoveryCases.map(x=>Number(x.firstSeenByLivingResearchAt||0))),
          inSampleDiscoveryEvidence:true,
          causalInterpretation:false
        }]
      });
      skill=researchSkillForTemplate(next,template);
      const evidence=skill?.evidence?.find(x=>evidenceHasProvenance({evidence:[x]},'cohortId',cohortId));
      if(evidence) bound.push(evidence.evidenceId);
    }
  }

  skill=researchSkillForTemplate(next,template);
  const prospectiveCases=cases.filter(row=>
    Number(row.firstSeenByLivingResearchAt||0)>Number(skill?.createdAt||Infinity)
  );
  for(let i=0;i<prospectiveCases.length;i++){
    const row=prospectiveCases[i];
    if(!prospectiveCaseSelected(row,i)) continue;
    skill=researchSkillForTemplate(next,template);
    if(evidenceHasProvenance(skill,'persistentCaseId',row.caseId)) continue;
    const knownAt=Number(row.firstSeenByLivingResearchAt||asOf);
    const episodeAssignment=researchEpisodeAssignment(episodePlan,row.caseId);
    const independentEpisodeId=episodeAssignment?.independenceResolved===true
      ?episodeAssignment.independentEpisodeId
      :null;
    next=recordBiggjSkillEvidence(next,{
      skillId:skill.skillId,
      epistemicClass:'INFERRED',
      asOf:knownAt,
      availableAt:knownAt,
      sourceId:'THESIS_STABILITY_MEMORY',
      independentEpisodeId,
      statement:
        'A new prospective forecast case entered persistent staleness for '+
        template.assumptionId+
        ' after the research hypothesis already existed. '+
        (independentEpisodeId
          ?'The case was assigned to a conservative common-cause episode; cases sharing that episode cannot inflate the independent-episode count.'
          :'Episode independence remains unresolved and contributes no independent-episode count.'),
      outcome:'NEUTRAL',
      metricDelta:null,
      forwardShadow:true,
      pointInTime:true,
      futureLeakage:false,
      auditReady:false,
      scientificGuardsPassed:false,
      chronologicalStable:false,
      costStressPassed:false,
      concentrationPassed:false,
      winnerRemovalPassed:false,
      provenance:[{
        kind:'PROSPECTIVE_PERSISTENT_CASE',
        persistentCaseId:row.caseId,
        forecastId:row.forecastId,
        assumptionId:row.assumptionId,
        firstPersistentStaleAt:row.firstPersistentStaleAt,
        firstSeenByLivingResearchAt:row.firstSeenByLivingResearchAt,
        sampledAfterFirstTwenty:i>=20,
        episodeResolverVersion:BIGGJ_RESEARCH_EPISODE_RESOLVER_VERSION,
        independentEpisodeId,
        episodeStatus:episodeAssignment?.status??'UNRESOLVED',
        episodeReasons:[...(episodeAssignment?.reasons||[])],
        episodeAnchorCaseId:episodeAssignment?.episodeAnchorCaseId??null,
        independenceResolved:episodeAssignment?.independenceResolved===true,
        statisticalIndependenceProven:false,
        crossSymbolAloneNeverCreatesIndependence:true,
        causalInterpretation:false
      }]
    });
    skill=researchSkillForTemplate(next,template);
    const evidence=skill?.evidence?.find(x=>evidenceHasProvenance({evidence:[x]},'persistentCaseId',row.caseId));
    if(evidence) bound.push(evidence.evidenceId);
  }

  skill=researchSkillForTemplate(next,template);
  const association=signal?.association||{};
  const milestone=association.associationReady===true
    ?Math.floor(Math.max(0,Number(association.observations)||0)/20)*20
    :0;
  if(milestone>=40){
    const associationKey=template.assumptionId+':'+milestone;
    if(!evidenceHasProvenance(skill,'associationMilestone',associationKey)){
      const reportAt=finite(claimAssumptionReport?.evaluatedAt,asOf);
      const evidenceAsOf=Math.max(Number(skill.createdAt||0),Number(reportAt||0));
      next=recordBiggjSkillEvidence(next,{
        skillId:skill.skillId,
        epistemicClass:'MODELLED',
        asOf:evidenceAsOf,
        availableAt:Number(reportAt||evidenceAsOf),
        sourceId:'CLAIM_ASSUMPTION_RESEARCH_EVALUATOR',
        independentEpisodeId:null,
        statement:
          'Persistence-filtered outcome association reached '+milestone+
          ' observations for '+template.assumptionId+
          '. This is an association snapshot only; it does not prove assumption truth, causality, or counterfactual benefit.',
        outcome:'NEUTRAL',
        metricDelta:null,
        forwardShadow:false,
        pointInTime:true,
        futureLeakage:false,
        auditReady:false,
        scientificGuardsPassed:false,
        chronologicalStable:false,
        costStressPassed:false,
        concentrationPassed:false,
        winnerRemovalPassed:false,
        provenance:[{
          kind:'PERSISTENCE_FILTERED_ASSOCIATION',
          associationMilestone:associationKey,
          assumptionId:template.assumptionId,
          observations:association.observations,
          persistentStaleBeforeMaturity:association.persistentStaleBeforeMaturity,
          neverPersistentStaleBeforeMaturity:association.neverPersistentStaleBeforeMaturity,
          directionFailureRateDifference:association.directionFailureRateDifference,
          intervalMissRateDifference:association.intervalMissRateDifference,
          interpretation:association.interpretation,
          postHypothesisSubsetResolved:false,
          causalInterpretation:false
        }]
      });
      skill=researchSkillForTemplate(next,template);
      const evidence=skill?.evidence?.find(x=>evidenceHasProvenance({evidence:[x]},'associationMilestone',associationKey));
      if(evidence) bound.push(evidence.evidenceId);
    }
  }

  return {
    tree:next,
    boundEvidenceIds:uniq(bound),
    episodePlan
  };
}

function livingResearchEvidenceSummary(tree){
  const rows=(tree?.nodes||[])
    .filter(x=>x?.kind==='DISCOVERED_SKILL'&&x?.discoveredBy==='ASSUMPTION_PERSISTENCE_RUNTIME_V1')
    .map(node=>{
      const progress=evaluateBiggjSkillProgress(tree,node.skillId);
      return {
        skillId:node.skillId,
        title:node.title,
        status:node.status,
        evidenceTotal:Number(node?.evidenceSummary?.total||0),
        forwardShadow:Number(node?.evidenceSummary?.forwardShadow||0),
        independentEpisodes:Number(node?.evidenceSummary?.independentEpisodes||0),
        auditReady:Number(node?.evidenceSummary?.auditReady||0),
        sciencePassed:Number(node?.evidenceSummary?.sciencePassed||0),
        recommendedStatus:progress.recommendedStatus,
        reasons:[...(progress.reasons||[])]
      };
    })
    .sort((a,b)=>b.evidenceTotal-a.evidenceTotal||a.skillId.localeCompare(b.skillId));
  return {
    skillCount:rows.length,
    evidenceTotal:rows.reduce((n,x)=>n+x.evidenceTotal,0),
    forwardShadow:rows.reduce((n,x)=>n+x.forwardShadow,0),
    independentEpisodes:rows.reduce((n,x)=>n+x.independentEpisodes,0),
    rows
  };
}

export function createBiggjLivingResearchRuntime({asOf=Date.now()}={}){
  const t=finite(asOf);
  if(t==null) throw new Error('asOf must be finite');
  const skillTree=createBiggjSkillTree({asOf:t});
  const core={
    version:BIGGJ_LIVING_RESEARCH_RUNTIME_VERSION,
    createdAt:t,
    updatedAt:t,
    revision:0,
    sourceFingerprint:null,
    skillTree,
    observedForecastIds:[],
    persistentCaseRegistry:[],
    stabilityEventRegistry:[],
    researchEpisodeResolution:[],
    researchProtocols:[],
    assumptionSignals:[],
    agenda:[],
    discoveredSkillIds:[],
    canonicalResearchQueue:buildBiggjResearchQueue(skillTree,{limit:20}).queue,
    lastRefreshReason:'INITIALIZED',
    invariants:{
      pointInTime:true,
      researchOnlyAutonomousDiscovery:true,
      conservativeResearchEpisodeResolution:true,
      crossSymbolAloneNeverCreatesIndependence:true,
      researchProtocolsArePreregistered:true,
      retrospectiveConfirmatoryRelabelingForbidden:true,
      automaticPromotion:false,
      automaticKill:false,
      automaticExperimentLaunch:false,
      primaryMutationAllowed:false,
      outcomeDoesNotValidateAssumptionTruth:true,
      causalInterpretation:false
    },
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canInfluencePrimary:false,
    canExecuteLive:false
  };
  return finalized(core);
}

export function verifyBiggjLivingResearchRuntime(value){
  try{
    const reasons=[];
    if(value?.version!==BIGGJ_LIVING_RESEARCH_RUNTIME_VERSION) reasons.push('VERSION_INVALID');
    if(value?.execution!=='SHADOW_ONLY'||value?.action!=='ABSTAIN'||value?.canInfluencePrimary!==false||value?.canExecuteLive!==false){
      reasons.push('SAFETY_INVARIANT_INVALID');
    }
    if(value?.invariants?.automaticPromotion!==false||value?.invariants?.automaticKill!==false||value?.invariants?.primaryMutationAllowed!==false){
      reasons.push('GOVERNANCE_INVARIANT_INVALID');
    }
    if(!Array.isArray(value?.observedForecastIds)) reasons.push('OBSERVED_FORECAST_IDS_INVALID');
    if(!Array.isArray(value?.persistentCaseRegistry)) reasons.push('PERSISTENT_CASE_REGISTRY_INVALID');
    if(!Array.isArray(value?.stabilityEventRegistry)) reasons.push('STABILITY_EVENT_REGISTRY_INVALID');
    if(value?.researchProtocols!=null&&!Array.isArray(value.researchProtocols)){
      reasons.push('RESEARCH_PROTOCOLS_INVALID');
    }else{
      for(const protocol of value?.researchProtocols||[]){
        const pv=verifyBiggjResearchProtocol(protocol);
        if(!pv.ok) reasons.push('RESEARCH_PROTOCOL_INVALID:'+String(protocol?.protocolId||'UNKNOWN'));
      }
    }
    const tv=verifyBiggjSkillTree(value?.skillTree);
    if(!tv.ok) reasons.push('SKILL_TREE_INVALID:'+tv.reasons.join('|'));
    const expected=sha256(coreOf(value));
    if(value?.fingerprint!==expected) reasons.push('FINGERPRINT_MISMATCH');
    return {ok:reasons.length===0,reasons,expectedFingerprint:expected};
  }catch(err){
    return {ok:false,reasons:['LIVING_RESEARCH_RUNTIME_INVALID',err instanceof Error?err.message:String(err)]};
  }
}

export function refreshBiggjLivingResearchRuntime(state,{
  thesisMemories=[],
  claimAssumptionReport=null,
  asOf=Date.now(),
  reason='RUNTIME_REFRESH'
}={}){
  const v=verifyBiggjLivingResearchRuntime(state);
  if(!v.ok) throw new Error('living research runtime invalid: '+v.reasons.join(','));
  const t=finite(asOf);
  if(t==null) throw new Error('asOf must be finite');

  const memories=normalizeMemories(thesisMemories);
  assertLivingResearchPointInTime(memories,claimAssumptionReport,t);
  const sourceFingerprint=sha256(compactSource(memories,claimAssumptionReport));
  if(sourceFingerprint===state.sourceFingerprint){
    return deepFreeze({
      changed:false,
      state,
      discoveredSkillIds:[],
      boundEvidenceIds:[],
      reasons:['SOURCE_STATE_UNCHANGED']
    });
  }

  let tree=state.skillTree;
  const expectedMap=currentTreeMapFingerprint();
  if(tree.capabilityMapFingerprint!==expectedMap){
    tree=reconcileBiggjSkillTreeWithCapabilityMap(tree,{asOf:t});
  }

  const observedForecastIds=mergeObservedForecastIds(state.observedForecastIds,memories);
  const persistentCaseRegistry=mergePersistentCaseRegistry(state.persistentCaseRegistry,memories,{observedAt:t});
  const stabilityEventRegistry=mergeStabilityEventRegistry(state.stabilityEventRegistry,memories);

  const signals=ASSUMPTION_RESEARCH_TEMPLATES
    .map(template=>collectSignalFor(template,memories,claimAssumptionReport,{
      persistentCaseRegistry,
      stabilityEventRegistry,
      observedForecastIds
    }))
    .sort((a,b)=>b.priority-a.priority||a.assumptionId.localeCompare(b.assumptionId));

  const discovered=[];
  for(const signal of signals){
    if(!signal.researchRequired) continue;
    const template=templateByAssumption().get(signal.assumptionId);
    const parentSkillId='seed:'+template.primaryCapabilityId;
    const dependencies=template.supportingCapabilityIds.map(x=>'seed:'+x);
    const beforeIds=new Set(tree.nodes.map(x=>x.skillId));
    const proposed=proposeBiggjChildSkill(tree,{
      parentSkillId,
      title:template.title,
      purpose:'Research recurring persistent thesis-assumption failure without changing PRIMARY behavior.',
      question:template.question,
      hypothesis:template.hypothesis,
      falsifier:template.falsifier,
      dependencies,
      strategicImpact:clamp(.65+.30*signal.informationValue),
      uncertainty:1,
      asOf:t,
      proposedBy:'ASSUMPTION_PERSISTENCE_RUNTIME_V1'
    });
    const added=proposed.nodes.find(x=>!beforeIds.has(x.skillId));
    if(added) discovered.push(added.skillId);
    tree=proposed;
  }

  const boundEvidenceIds=[];
  const researchEpisodeResolution=[];
  for(const signal of signals){
    if(!signal.researchRequired) continue;
    const template=templateByAssumption().get(signal.assumptionId);
    const binding=bindResearchEvidence(tree,{
      signal,
      template,
      persistentCaseRegistry,
      claimAssumptionReport,
      asOf:t
    });
    tree=binding.tree;
    boundEvidenceIds.push(...binding.boundEvidenceIds);
    if(binding.episodePlan){
      researchEpisodeResolution.push({
        assumptionId:signal.assumptionId,
        version:binding.episodePlan.version,
        fingerprint:binding.episodePlan.fingerprint,
        counts:{...binding.episodePlan.counts},
        policy:{...binding.episodePlan.policy}
      });
    }
  }

  const agenda=signals
    .filter(x=>x.status!=='DORMANT')
    .map(x=>({
      ...x,
      targetSkillId:'seed:'+x.primaryCapabilityId,
      dependencySkillIds:x.supportingCapabilityIds.map(id=>'seed:'+id)
    }))
    .sort((a,b)=>b.informationValue-a.informationValue||b.priority-a.priority||a.assumptionId.localeCompare(b.assumptionId));

  const core={
    ...coreOf(state),
    version:BIGGJ_LIVING_RESEARCH_RUNTIME_VERSION,
    updatedAt:t,
    revision:Number(state.revision||0)+1,
    sourceFingerprint,
    skillTree:tree,
    observedForecastIds,
    persistentCaseRegistry,
    stabilityEventRegistry,
    researchEpisodeResolution,
    assumptionSignals:signals,
    agenda,
    discoveredSkillIds:uniq([...(state.discoveredSkillIds||[]),...discovered]),
    canonicalResearchQueue:buildBiggjResearchQueue(tree,{limit:20}).queue,
    lastRefreshReason:String(reason||'RUNTIME_REFRESH'),
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canInfluencePrimary:false,
    canExecuteLive:false
  };
  return deepFreeze({
    changed:true,
    state:finalized(core),
    discoveredSkillIds:discovered,
    boundEvidenceIds:uniq(boundEvidenceIds),
    reasons:[]
  });
}

export async function openBiggjLivingResearchRuntime(filePath,{asOf=Date.now()}={}){
  await mkdir(path.dirname(filePath),{recursive:true});
  let recoveredFromCorrupt=false;
  let created=false;
  let state=null;

  try{
    const raw=await readFile(filePath,'utf8');
    const parsed=JSON.parse(raw);
    const v=verifyBiggjLivingResearchRuntime(parsed);
    if(!v.ok) throw new Error('invalid living research runtime: '+v.reasons.join(','));
    state=parsed;
  }catch(err){
    if(err?.code!=='ENOENT'){
      recoveredFromCorrupt=true;
      const backup=filePath+'.corrupt-'+Date.now();
      try{ await rename(filePath,backup); }catch{}
    }
    state=createBiggjLivingResearchRuntime({asOf});
    created=true;
  }

  const expectedMap=currentTreeMapFingerprint();
  let reconciled=false;
  if(state.skillTree?.capabilityMapFingerprint!==expectedMap){
    const tree=reconcileBiggjSkillTreeWithCapabilityMap(state.skillTree,{asOf});
    const core={
      ...coreOf(state),
      updatedAt:finite(asOf,Date.now()),
      skillTree:tree,
      canonicalResearchQueue:buildBiggjResearchQueue(tree,{limit:20}).queue,
      lastRefreshReason:'CAPABILITY_MAP_RECONCILIATION'
    };
    state=finalized(core);
    reconciled=true;
  }

  return {
    filePath,
    state,
    healthy:true,
    created,
    reconciled,
    recoveredFromCorrupt,
    schemaVersion:BIGGJ_LIVING_RESEARCH_RUNTIME_VERSION
  };
}

export async function saveBiggjLivingResearchRuntime(filePath,state){
  const v=verifyBiggjLivingResearchRuntime(state);
  if(!v.ok) throw new Error('living research runtime invalid: '+v.reasons.join(','));
  await mkdir(path.dirname(filePath),{recursive:true});
  const tmp=filePath+'.tmp-'+process.pid;
  await writeFile(tmp,JSON.stringify(state,null,2)+'\n',{encoding:'utf8',mode:0o600});
  await rename(tmp,filePath);
  return state;
}

export function biggjLivingResearchRuntimeSummary(value){
  const v=verifyBiggjLivingResearchRuntime(value);
  const active=(value?.agenda||[]);
  const researchRequired=active.filter(x=>x.status==='RESEARCH_REQUIRED');
  return deepFreeze({
    version:BIGGJ_LIVING_RESEARCH_RUNTIME_VERSION,
    integrity:v.ok?'VALID':'INVALID',
    updatedAt:value?.updatedAt??null,
    revision:Number(value?.revision||0),
    trackedAssumptions:Array.isArray(value?.assumptionSignals)?value.assumptionSignals.length:0,
    activeAgendaItems:active.length,
    researchRequired:researchRequired.length,
    topAgenda:active.slice(0,5).map(x=>({
      assumptionId:x.assumptionId,
      status:x.status,
      informationValue:x.informationValue,
      primaryCapabilityId:x.primaryCapabilityId,
      distinctPersistentForecasts:x.distinctPersistentForecasts,
      topFalsifier:x.falsifiers?.[0]?.code??null
    })),
    observedForecasts:(value?.observedForecastIds||[]).length,
    retainedPersistentCases:(value?.persistentCaseRegistry||[]).length,
    retainedStabilityEvents:(value?.stabilityEventRegistry||[]).length,
    researchEpisodeResolverVersion:BIGGJ_RESEARCH_EPISODE_RESOLVER_VERSION,
    conservativeEpisodePartitions:(value?.researchEpisodeResolution||[])
      .reduce((n,x)=>n+Number(x?.counts?.independentEpisodes||0),0),
    unresolvedResearchCases:(value?.researchEpisodeResolution||[])
      .reduce((n,x)=>n+Number(x?.counts?.unresolvedCases||0),0),
    discoveredResearchOnlySkills:(value?.discoveredSkillIds||[]).length,
    researchEvidence:verifyBiggjSkillTree(value?.skillTree).ok
      ?livingResearchEvidenceSummary(value.skillTree)
      :null,
    skillTree:verifyBiggjSkillTree(value?.skillTree).ok
      ?biggjSkillTreeSnapshot(value.skillTree)
      :null,
    automaticPromotion:false,
    automaticKill:false,
    automaticExperimentLaunch:false,
    primaryMutationAllowed:false,
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canInfluencePrimary:false,
    canExecuteLive:false
  });
}

export function biggjAssumptionResearchTemplates(){
  return ASSUMPTION_RESEARCH_TEMPLATES.map(x=>structuredClone(x));
}
