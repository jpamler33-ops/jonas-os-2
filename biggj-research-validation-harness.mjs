import { sha256 } from './institutional-kernel.mjs';
import { evaluateBiggjSkillProgress, verifyBiggjSkillTree } from './biggj-skill-tree.mjs';

export const BIGGJ_RESEARCH_VALIDATION_HARNESS_VERSION='TCX_BIGGJ_RESEARCH_VALIDATION_HARNESS_V1';

const deepFreeze=value=>{
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    Object.freeze(value);
    for(const v of Object.values(value)) deepFreeze(v);
  }
  return value;
};
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,Number(v)||0));
const uniq=xs=>[...new Set((xs||[]).map(String).filter(Boolean))].sort();
const finite=(v,f=0)=>Number.isFinite(Number(v))?Number(v):f;
const safeRate=(n,d)=>d>0?Number(n||0)/d:null;
const finalized=core=>deepFreeze({...core,fingerprint:sha256(core)});

const STATUS_ORDER=Object.freeze({
  UNKNOWN:0,
  DISCOVERING:1,
  LEARNING:2,
  TESTING:3,
  VALIDATED:4,
  TRUSTED:5,
  DECAYING:2,
  RETIRED:-1
});

function ratio(count,total){
  return total>0?clamp(Number(count||0)/total):0;
}
function deficit(id,current,required,{blocking=true,unit='count'}={}){
  return {
    id,
    current:Number(current||0),
    required:Number(required||0),
    missing:Math.max(0,Number(required||0)-Number(current||0)),
    unit,
    blocking,
    satisfied:Number(current||0)>=Number(required||0)
  };
}
function booleanDeficit(id,value,{blocking=true}={}){
  return {
    id,
    current:value===true,
    required:true,
    missing:value===true?0:1,
    unit:'boolean',
    blocking,
    satisfied:value===true
  };
}
function evidenceStats(node){
  const e=node?.evidenceSummary||{};
  const researchTotal=Math.max(0,finite(e.total));
  const researchIndependentEpisodes=Math.max(0,finite(e.independentEpisodes));
  const total=Math.max(0,finite(e.validationTotal));
  const forwardShadow=Math.max(0,finite(e.validationForwardShadow));
  const independentEpisodes=Math.max(0,finite(e.validationIndependentEpisodes));
  const positive=Math.max(0,finite(e.validationPositive));
  const negative=Math.max(0,finite(e.validationNegative));
  return {
    researchContextTotal:Math.max(0,researchTotal-total),
    researchEvidenceTotal:researchTotal,
    researchIndependentEpisodes,
    total,
    pitSafe:Math.max(0,finite(e.validationPitSafe)),
    auditReady:Math.max(0,finite(e.validationAuditReady)),
    sciencePassed:Math.max(0,finite(e.validationSciencePassed)),
    forwardShadow,
    independentEpisodes,
    chronologicalStable:Math.max(0,finite(e.validationChronologicalStable)),
    costStressPassed:Math.max(0,finite(e.validationCostStressPassed)),
    concentrationPassed:Math.max(0,finite(e.validationConcentrationPassed)),
    winnerRemovalPassed:Math.max(0,finite(e.validationWinnerRemovalPassed)),
    positive,
    negative,
    neutral:Math.max(0,finite(e.validationNeutral)),
    pitCoverage:ratio(e.validationPitSafe,total),
    auditCoverage:ratio(e.validationAuditReady,total),
    scienceCoverage:ratio(e.validationSciencePassed,total),
    positiveRate:safeRate(positive,total),
    negativeRate:safeRate(negative,total)
  };
}

function discoveryChecklist(node,stats){
  return [
    booleanDeficit('QUESTION_DECLARED',Boolean(String(node?.question||'').trim())),
    booleanDeficit('HYPOTHESIS_DECLARED',Boolean(String(node?.hypothesis||'').trim())),
    booleanDeficit('FALSIFIER_DECLARED',Boolean(String(node?.falsifier||'').trim())),
    deficit('TOTAL_EVIDENCE',stats.total,3),
    deficit('INDEPENDENT_EPISODES',stats.independentEpisodes,2),
    booleanDeficit('ALL_EVIDENCE_PIT_SAFE',stats.total>0&&stats.pitSafe===stats.total)
  ];
}
function learningChecklist(stats,dependencyGates){
  return [
    deficit('TOTAL_EVIDENCE',stats.total,10),
    deficit('INDEPENDENT_EPISODES',stats.independentEpisodes,5),
    booleanDeficit('ALL_EVIDENCE_PIT_SAFE',stats.total>0&&stats.pitSafe===stats.total),
    booleanDeficit('ALL_EVIDENCE_AUDIT_READY',stats.total>0&&stats.auditReady===stats.total),
    booleanDeficit('TESTING_DEPENDENCY_GATE_READY',dependencyGates?.testing?.ready===true)
  ];
}
function testingChecklist(stats,dependencyGates){
  const stressNeed=Math.min(20,stats.forwardShadow);
  return [
    deficit('FORWARD_SHADOW',stats.forwardShadow,30),
    deficit('INDEPENDENT_EPISODES',stats.independentEpisodes,20),
    booleanDeficit('ALL_EVIDENCE_PIT_SAFE',stats.total>0&&stats.pitSafe===stats.total),
    booleanDeficit('ALL_EVIDENCE_AUDIT_READY',stats.total>0&&stats.auditReady===stats.total),
    booleanDeficit('ALL_EVIDENCE_SCIENCE_PASSED',stats.total>0&&stats.sciencePassed===stats.total),
    deficit('CHRONOLOGICAL_STABILITY',stats.chronologicalStable,stressNeed),
    deficit('COST_STRESS',stats.costStressPassed,stressNeed),
    deficit('CONCENTRATION_STRESS',stats.concentrationPassed,stressNeed),
    deficit('WINNER_REMOVAL',stats.winnerRemovalPassed,stressNeed),
    booleanDeficit('POSITIVE_RATE_GT_50_PERCENT',stats.positiveRate!=null&&stats.positiveRate>.50),
    booleanDeficit('DECISION_DEPENDENCY_GATE_READY',dependencyGates?.decision?.ready===true)
  ];
}
function trustChecklist(stats,dependencyGates){
  return [
    deficit('FORWARD_SHADOW',stats.forwardShadow,60),
    deficit('INDEPENDENT_EPISODES',stats.independentEpisodes,40),
    booleanDeficit('ALL_EVIDENCE_PIT_SAFE',stats.total>0&&stats.pitSafe===stats.total),
    booleanDeficit('ALL_EVIDENCE_AUDIT_READY',stats.total>0&&stats.auditReady===stats.total),
    booleanDeficit('ALL_EVIDENCE_SCIENCE_PASSED',stats.total>0&&stats.sciencePassed===stats.total),
    deficit('CHRONOLOGICAL_STABILITY',stats.chronologicalStable,40),
    deficit('COST_STRESS',stats.costStressPassed,40),
    deficit('CONCENTRATION_STRESS',stats.concentrationPassed,40),
    deficit('WINNER_REMOVAL',stats.winnerRemovalPassed,40),
    booleanDeficit('POSITIVE_RATE_GT_52_PERCENT',stats.positiveRate!=null&&stats.positiveRate>.52),
    booleanDeficit('TRUST_DEPENDENCY_GATE_READY',dependencyGates?.trust?.ready===true)
  ];
}

function phaseFor(status){
  if(status==='DISCOVERING'||status==='UNKNOWN') return 'DISCOVERY_EVIDENCE';
  if(status==='LEARNING'||status==='DECAYING') return 'LEARNING_AUDIT';
  if(status==='TESTING') return 'FORWARD_STRESS';
  if(status==='VALIDATED') return 'TRUST_REPLICATION';
  if(status==='TRUSTED') return 'TRUST_MONITORING';
  return 'INACTIVE';
}
function checklistFor(node,stats,progress){
  const status=String(node?.status||'UNKNOWN').toUpperCase();
  if(status==='DISCOVERING'||status==='UNKNOWN') return discoveryChecklist(node,stats);
  if(status==='LEARNING'||status==='DECAYING') return learningChecklist(stats,progress?.dependencyGates);
  if(status==='TESTING') return testingChecklist(stats,progress?.dependencyGates);
  if(status==='VALIDATED') return trustChecklist(stats,progress?.dependencyGates);
  if(status==='TRUSTED'){
    return [
      booleanDeficit('TRUST_DEPENDENCY_GATE_READY',progress?.dependencyGates?.trust?.ready===true),
      booleanDeficit('FORWARD_EVIDENCE_NOT_DECAYING',!(stats.total>=10&&stats.negativeRate!=null&&stats.negativeRate>.55))
    ];
  }
  return [];
}
function nextExperiment(checklist){
  const missing=checklist.filter(x=>!x.satisfied);
  const order=[
    'QUESTION_DECLARED','HYPOTHESIS_DECLARED','FALSIFIER_DECLARED',
    'TOTAL_EVIDENCE','INDEPENDENT_EPISODES','ALL_EVIDENCE_PIT_SAFE',
    'ALL_EVIDENCE_AUDIT_READY','TESTING_DEPENDENCY_GATE_READY',
    'FORWARD_SHADOW','ALL_EVIDENCE_SCIENCE_PASSED',
    'CHRONOLOGICAL_STABILITY','COST_STRESS','CONCENTRATION_STRESS','WINNER_REMOVAL',
    'POSITIVE_RATE_GT_50_PERCENT','DECISION_DEPENDENCY_GATE_READY',
    'POSITIVE_RATE_GT_52_PERCENT','TRUST_DEPENDENCY_GATE_READY','FORWARD_EVIDENCE_NOT_DECAYING'
  ];
  missing.sort((a,b)=>order.indexOf(a.id)-order.indexOf(b.id)||a.id.localeCompare(b.id));
  const first=missing[0];
  if(!first) return {
    experimentId:'NO_BLOCKING_DEFICIT',
    purpose:'No additional validation experiment is implied by the current gate.',
    automaticLaunchAllowed:false
  };
  const map={
    QUESTION_DECLARED:'Formalize the exact research question before collecting more evidence.',
    HYPOTHESIS_DECLARED:'Write one falsifiable hypothesis before further validation.',
    FALSIFIER_DECLARED:'Define the observation that would count against the hypothesis.',
    TOTAL_EVIDENCE:'Collect additional point-in-time research observations without changing the hypothesis.',
    INDEPENDENT_EPISODES:'Collect evidence from additional conservatively separated common-cause episodes.',
    ALL_EVIDENCE_PIT_SAFE:'Repair or exclude evidence that cannot prove point-in-time availability.',
    ALL_EVIDENCE_AUDIT_READY:'Run provenance and audit-completeness checks on every evidence row.',
    TESTING_DEPENDENCY_GATE_READY:'Resolve prerequisite capability blockers before entering testing.',
    FORWARD_SHADOW:'Continue prospective forward-shadow collection after hypothesis creation.',
    ALL_EVIDENCE_SCIENCE_PASSED:'Run the scientific guard suite against all candidate validation evidence.',
    CHRONOLOGICAL_STABILITY:'Run chronological split / walk-forward robustness checks.',
    COST_STRESS:'Stress the result under realistic cost and friction assumptions.',
    CONCENTRATION_STRESS:'Check whether the finding depends on one regime, symbol, period, or source cluster.',
    WINNER_REMOVAL:'Remove the strongest cases and verify the conclusion does not collapse.',
    POSITIVE_RATE_GT_50_PERCENT:'Collect labelled forward outcomes; current positive rate is insufficient.',
    DECISION_DEPENDENCY_GATE_READY:'Resolve decision-phase dependency blockers.',
    POSITIVE_RATE_GT_52_PERCENT:'Collect larger replicated forward evidence; trust-level positive rate is insufficient.',
    TRUST_DEPENDENCY_GATE_READY:'Resolve trust-phase dependency blockers.',
    FORWARD_EVIDENCE_NOT_DECAYING:'Investigate recent negative forward evidence before retaining trust.'
  };
  return {
    experimentId:first.id,
    purpose:map[first.id]||'Resolve the highest-priority validation deficit.',
    targetCurrent:first.current,
    targetRequired:first.required,
    automaticLaunchAllowed:false
  };
}

export function evaluateBiggjResearchSkillValidation(tree,skillId){
  const tv=verifyBiggjSkillTree(tree);
  if(!tv.ok) throw new Error('skill tree invalid: '+tv.reasons.join(','));
  const node=(tree.nodes||[]).find(x=>String(x.skillId)===String(skillId));
  if(!node) throw new Error('skill missing');
  const progress=evaluateBiggjSkillProgress(tree,skillId);
  const stats=evidenceStats(node);
  const checklist=checklistFor(node,stats,progress);
  const blockers=checklist.filter(x=>x.blocking&&!x.satisfied);
  const currentRank=STATUS_ORDER[String(node.status||'UNKNOWN')]??0;
  const recommendedRank=STATUS_ORDER[String(progress.recommendedStatus||node.status)]??currentRank;
  const manualTransitionReviewEligible=
    recommendedRank>currentRank&&
    blockers.length===0;
  const evidenceIntegrity=
    stats.total===0?0:
    (
      stats.pitCoverage+
      stats.auditCoverage+
      stats.scienceCoverage
    )/3;
  const gateCoverage=checklist.length
    ?checklist.filter(x=>x.satisfied).length/checklist.length
    :1;
  const readinessScore=clamp(.55*gateCoverage+.30*evidenceIntegrity+.15*clamp(stats.independentEpisodes/20));

  const core={
    version:BIGGJ_RESEARCH_VALIDATION_HARNESS_VERSION,
    skillId:node.skillId,
    title:node.title,
    currentStatus:node.status,
    recommendedStatus:progress.recommendedStatus,
    validationPhase:phaseFor(node.status),
    readinessScore,
    evidence:stats,
    checklist,
    blockers,
    dependencyGates:structuredClone(progress.dependencyGates),
    nextExperiment:nextExperiment(checklist),
    manualTransitionReviewEligible,
    manualPromotionRequired:manualTransitionReviewEligible,
    automaticStatusTransitionAllowed:false,
    automaticExperimentLaunchAllowed:false,
    automaticPromotionAllowed:false,
    automaticKillAllowed:false,
    primaryMutationAllowed:false,
    semantics:{
      reviewDoesNotChangeSkillStatus:true,
      researchContextEvidenceCannotUnlockMaturity:true,
      validationDenominatorExcludesDiscoveryAndAssociationContext:true,
      readinessScoreIsDiagnosticNotProbability:true,
      independentEpisodeIdsAreConservativePartitionsNotProofOfStatisticalIndependence:true,
      outcomeEvidenceCannotProveCausality:true
    },
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canInfluencePrimary:false,
    canExecuteLive:false
  };
  return finalized(core);
}

export function buildBiggjResearchValidationHarness(tree,{limit=50}={}){
  const tv=verifyBiggjSkillTree(tree);
  if(!tv.ok) throw new Error('skill tree invalid: '+tv.reasons.join(','));
  const reviews=(tree.nodes||[])
    .filter(x=>x?.kind==='DISCOVERED_SKILL'&&x?.status!=='RETIRED')
    .map(x=>evaluateBiggjResearchSkillValidation(tree,x.skillId))
    .sort((a,b)=>
      Number(b.manualTransitionReviewEligible)-Number(a.manualTransitionReviewEligible)||
      b.readinessScore-a.readinessScore||
      a.skillId.localeCompare(b.skillId)
    );

  const limited=reviews.slice(0,Math.max(1,Math.floor(Number(limit)||50)));
  const core={
    version:BIGGJ_RESEARCH_VALIDATION_HARNESS_VERSION,
    asOf:tree.asOf,
    treeFingerprint:tree.fingerprint,
    discoveredSkillCount:reviews.length,
    manualTransitionReviewEligible:reviews.filter(x=>x.manualTransitionReviewEligible).length,
    phases:Object.fromEntries(
      ['DISCOVERY_EVIDENCE','LEARNING_AUDIT','FORWARD_STRESS','TRUST_REPLICATION','TRUST_MONITORING','INACTIVE']
        .map(phase=>[phase,reviews.filter(x=>x.validationPhase===phase).length])
    ),
    reviews:limited,
    invariants:{
      automaticStatusTransitionAllowed:false,
      automaticExperimentLaunchAllowed:false,
      automaticPromotionAllowed:false,
      automaticKillAllowed:false,
      primaryMutationAllowed:false
    },
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canInfluencePrimary:false,
    canExecuteLive:false
  };
  return finalized(core);
}

export function biggjResearchValidationSummary(tree,{limit=5}={}){
  const h=buildBiggjResearchValidationHarness(tree,{limit:Math.max(5,Number(limit)||5)});
  return deepFreeze({
    version:h.version,
    discoveredSkillCount:h.discoveredSkillCount,
    manualTransitionReviewEligible:h.manualTransitionReviewEligible,
    phases:h.phases,
    topReviews:h.reviews.slice(0,Math.max(1,Number(limit)||5)).map(x=>({
      skillId:x.skillId,
      title:x.title,
      currentStatus:x.currentStatus,
      recommendedStatus:x.recommendedStatus,
      validationPhase:x.validationPhase,
      readinessScore:x.readinessScore,
      blockerIds:x.blockers.map(b=>b.id),
      nextExperiment:x.nextExperiment
    })),
    automaticStatusTransitionAllowed:false,
    automaticExperimentLaunchAllowed:false,
    automaticPromotionAllowed:false,
    automaticKillAllowed:false,
    primaryMutationAllowed:false,
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canInfluencePrimary:false,
    canExecuteLive:false
  });
}
