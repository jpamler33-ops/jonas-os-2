import { sha256 } from './institutional-kernel.mjs';
import { biggjCapabilityMap } from './biggj-capability-map.mjs';
import { TCX_PROMOTION_STAGES, TCX_EPISTEMIC_CLASSES } from './tcx-research-os-contract.mjs';
import {
  canonicalSkillLeverage,
  evaluateBiggjSkillDependencyGate,
  biggjDependencyBottleneckReport,
  biggjCompositionReadiness
} from './biggj-skill-dependency-graph.mjs';

export const BIGGJ_SKILL_TREE_VERSION='BIGGJ_SKILL_TREE_V1';

export const BIGGJ_SKILL_STATES=Object.freeze([
  'UNKNOWN',
  'DISCOVERING',
  'LEARNING',
  'TESTING',
  'VALIDATED',
  'TRUSTED',
  'DECAYING',
  'RETIRED'
]);

const STATE_RANK=Object.freeze({
  UNKNOWN:0,DISCOVERING:1,LEARNING:2,TESTING:3,VALIDATED:4,TRUSTED:5,DECAYING:2,RETIRED:-1
});
const finite=(v,f=null)=>Number.isFinite(Number(v))?Number(v):f;
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,Number(v)));
const deepFreeze=v=>{
  if(v&&typeof v==='object'&&!Object.isFrozen(v)){
    Object.freeze(v);
    for(const x of Object.values(v)) deepFreeze(x);
  }
  return v;
};
const token=(v,f='UNKNOWN')=>{
  const s=String(v??'').trim().toUpperCase().replace(/[^A-Z0-9]+/g,'_').replace(/^_+|_+$/g,'');
  return s||f;
};
const uniq=xs=>[...new Set((xs||[]).map(String))];
const finalized=core=>deepFreeze({...core,fingerprint:sha256(core)});

function blankEvidence(){
  return {
    total:0,
    observed:0,
    inferred:0,
    modelled:0,
    assumed:0,
    forwardShadow:0,
    independentEpisodes:0,
    positive:0,
    negative:0,
    neutral:0,
    pitSafe:0,
    auditReady:0,
    sciencePassed:0,
    chronologicalStable:0,
    costStressPassed:0,
    concentrationPassed:0,
    winnerRemovalPassed:0,
    validationTotal:0,
    validationForwardShadow:0,
    validationIndependentEpisodes:0,
    validationPositive:0,
    validationNegative:0,
    validationNeutral:0,
    validationPitSafe:0,
    validationAuditReady:0,
    validationSciencePassed:0,
    validationChronologicalStable:0,
    validationCostStressPassed:0,
    validationConcentrationPassed:0,
    validationWinnerRemovalPassed:0
  };
}

function seedNode(cap,asOf){
  return {
    skillId:'seed:'+cap.id,
    capabilityId:cap.id,
    parentSkillId:cap.parentId?('root:'+cap.parentId):null,
    rootId:cap.parentId||cap.id,
    title:cap.id,
    purpose:cap.purpose,
    layer:cap.layer,
    plane:cap.plane||null,
    kind:cap.kind==='ROOT'?'ROOT':'SEEDED_CAPABILITY',
    status:cap.kind==='ROOT'?'DISCOVERING':'UNKNOWN',
    promotionStage:'IDEA',
    createdAt:asOf,
    updatedAt:asOf,
    question:null,
    hypothesis:null,
    falsifier:null,
    dependencies:[],
    strategicImpact:cap.priority==='FOUNDATION'?1:cap.priority==='CORE'?.9:.72,
    uncertainty:cap.kind==='ROOT'?.65:1,
    evidence:[],
    evidenceSummary:blankEvidence(),
    moduleHints:[...(cap.moduleHints||[])],
    discoveredBy:'CANONICAL_SEED',
    productionMutationAllowed:false,
    execution:'SHADOW_ONLY',
    canExecuteLive:false
  };
}

function treeCore(tree){
  const {fingerprint,...core}=tree||{};
  return core;
}

function cloneTree(tree){
  return structuredClone(treeCore(tree));
}

function verifyTreeShape(tree){
  if(tree?.version!==BIGGJ_SKILL_TREE_VERSION) throw new Error('skill tree version invalid');
  if(tree?.execution!=='SHADOW_ONLY'||tree?.canExecuteLive!==false) throw new Error('skill tree execution invariant');
  if(!Array.isArray(tree.nodes)) throw new Error('skill tree nodes missing');
  const ids=new Set();
  for(const n of tree.nodes){
    if(!n?.skillId) throw new Error('skillId required');
    if(ids.has(n.skillId)) throw new Error('duplicate skillId '+n.skillId);
    ids.add(n.skillId);
  }
}

export function verifyBiggjSkillTree(tree){
  try{
    const reasons=[];
    try{ verifyTreeShape(tree); }catch(err){ reasons.push(err instanceof Error?err.message:String(err)); }
    const expected=sha256(treeCore(tree));
    if(tree?.fingerprint!==expected) reasons.push('FINGERPRINT_MISMATCH');
    return {
      ok:reasons.length===0,
      reasons,
      expectedFingerprint:expected,
      execution:'SHADOW_ONLY',
      action:'ABSTAIN',
      canExecuteLive:false
    };
  }catch(err){
    return {
      ok:false,
      reasons:['SKILL_TREE_INVALID',err instanceof Error?err.message:String(err)],
      expectedFingerprint:null,
      execution:'SHADOW_ONLY',
      action:'ABSTAIN',
      canExecuteLive:false
    };
  }
}

function findNodeIndex(tree,skillId){
  return tree.nodes.findIndex(x=>String(x.skillId)===String(skillId));
}

function evidenceIsValidationEligible(e){
  if(e?.validationEligible===true) return true;
  if(e?.validationEligible===false) return false;
  const contextKinds=new Set([
    'DISCOVERY_COHORT',
    'PROSPECTIVE_PERSISTENT_CASE',
    'PERSISTENCE_FILTERED_ASSOCIATION'
  ]);
  return !(e?.provenance||[]).some(x=>contextKinds.has(String(x?.kind||'')));
}

function evidenceSummary(rows){
  const s=blankEvidence();
  const episodes=new Set();
  const validationEpisodes=new Set();
  for(const e of rows||[]){
    s.total++;
    const cls=String(e.epistemicClass||'').toUpperCase();
    if(cls==='OBSERVED')s.observed++;
    else if(cls==='INFERRED')s.inferred++;
    else if(cls==='MODELLED')s.modelled++;
    else if(cls==='ASSUMED')s.assumed++;
    if(e.forwardShadow===true)s.forwardShadow++;
    if(e.independentEpisodeId)episodes.add(String(e.independentEpisodeId));
    const outcome=String(e.outcome||'NEUTRAL').toUpperCase();
    if(outcome==='POSITIVE')s.positive++;
    else if(outcome==='NEGATIVE')s.negative++;
    else s.neutral++;
    if(e.pointInTime===true&&e.futureLeakage!==true)s.pitSafe++;
    if(e.auditReady===true)s.auditReady++;
    if(e.scientificGuardsPassed===true)s.sciencePassed++;
    if(e.chronologicalStable===true)s.chronologicalStable++;
    if(e.costStressPassed===true)s.costStressPassed++;
    if(e.concentrationPassed===true)s.concentrationPassed++;
    if(e.winnerRemovalPassed===true)s.winnerRemovalPassed++;

    if(evidenceIsValidationEligible(e)){
      s.validationTotal++;
      if(e.forwardShadow===true)s.validationForwardShadow++;
      if(e.independentEpisodeId)validationEpisodes.add(String(e.independentEpisodeId));
      if(outcome==='POSITIVE')s.validationPositive++;
      else if(outcome==='NEGATIVE')s.validationNegative++;
      else s.validationNeutral++;
      if(e.pointInTime===true&&e.futureLeakage!==true)s.validationPitSafe++;
      if(e.auditReady===true)s.validationAuditReady++;
      if(e.scientificGuardsPassed===true)s.validationSciencePassed++;
      if(e.chronologicalStable===true)s.validationChronologicalStable++;
      if(e.costStressPassed===true)s.validationCostStressPassed++;
      if(e.concentrationPassed===true)s.validationConcentrationPassed++;
      if(e.winnerRemovalPassed===true)s.validationWinnerRemovalPassed++;
    }
  }
  s.independentEpisodes=episodes.size;
  s.validationIndependentEpisodes=validationEpisodes.size;
  return s;
}

function defaultQuestion(node){
  const title=String(node.title||node.capabilityId||node.skillId).replaceAll('_',' ');
  if(node.status==='UNKNOWN') return 'What would demonstrate that '+title+' adds reproducible information beyond current TCX capabilities?';
  if(node.status==='DISCOVERING') return 'Which observable evidence would distinguish useful '+title+' signal from coincidence or a common cause?';
  if(node.status==='LEARNING') return 'Under which regimes does '+title+' work, fail, or become redundant with existing evidence?';
  if(node.status==='TESTING') return 'Does '+title+' survive forward shadow testing, costs, chronology, concentration and winner-removal stress?';
  if(node.status==='VALIDATED') return 'Is '+title+' stable enough across new independent episodes to deserve trusted status?';
  if(node.status==='TRUSTED') return 'What evidence would falsify or demote '+title+' now?';
  if(node.status==='DECAYING') return 'Has '+title+' lost edge because of regime change, crowding, data drift, or an original false discovery?';
  return 'Should '+title+' remain in the active research graph?';
}

function promotionStageForStatus(status){
  const s=String(status||'UNKNOWN').toUpperCase();
  if(s==='UNKNOWN')return 'IDEA';
  if(s==='DISCOVERING'||s==='LEARNING')return 'RESEARCH_ONLY';
  if(s==='TESTING')return 'CHALLENGER';
  if(s==='VALIDATED')return 'FORWARD_SHADOW';
  if(s==='TRUSTED')return 'PROMOTION_REVIEW';
  if(s==='DECAYING')return 'CHALLENGER';
  return 'IDEA';
}

export function createBiggjSkillTree({asOf=Date.now()}={}){
  const t=finite(asOf);
  if(t==null) throw new Error('asOf must be finite');
  const map=biggjCapabilityMap();
  const roots=map.roots.map(x=>seedNode(x,t)).map(x=>({...x,skillId:'root:'+x.capabilityId,parentSkillId:null}));
  const capabilities=map.capabilities.map(x=>seedNode(x,t));
  const core={
    version:BIGGJ_SKILL_TREE_VERSION,
    capabilityMapVersion:map.version,
    capabilityMapFingerprint:map.fingerprint,
    asOf:t,
    nodes:[...roots,...capabilities],
    researchQuestions:[],
    proposals:[],
    promotions:[],
    invariants:{
      silentPrimaryMutation:false,
      discoveryCreatesResearchOnly:true,
      forwardEvidenceRequiredForTrust:true,
      pointInTimeRequired:true,
      auditRequired:true,
      scientificGuardsRequired:true
    },
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecuteLive:false
  };
  return finalized(core);
}


export function reconcileBiggjSkillTreeWithCapabilityMap(tree,{asOf=Date.now()}={}){
  verifyTreeShape(tree);
  const t=finite(asOf);
  if(t==null) throw new Error('asOf must be finite');
  const map=biggjCapabilityMap();
  const core=cloneTree(tree);
  const beforeVersion=core.capabilityMapVersion||null;
  const beforeFingerprint=core.capabilityMapFingerprint||null;
  const added=[];
  const metadataUpdated=[];

  for(const cap of map.roots){
    const skillId='root:'+cap.id;
    const current=core.nodes.find(x=>String(x.skillId)===skillId);
    if(!current){
      core.nodes.push({...seedNode(cap,t),skillId,parentSkillId:null});
      added.push(skillId);
      continue;
    }
    const desiredPlane=cap.plane||null;
    if(current.plane!==desiredPlane){
      current.plane=desiredPlane;
      metadataUpdated.push(skillId);
    }
  }

  for(const cap of map.capabilities){
    const seeded=seedNode(cap,t);
    const current=core.nodes.find(x=>String(x.skillId)===seeded.skillId);
    if(!current){
      core.nodes.push(seeded);
      added.push(seeded.skillId);
      continue;
    }
    const desiredPlane=cap.plane||null;
    if(current.plane!==desiredPlane){
      current.plane=desiredPlane;
      metadataUpdated.push(seeded.skillId);
    }
  }

  core.capabilityMapVersion=map.version;
  core.capabilityMapFingerprint=map.fingerprint;
  core.asOf=Math.max(Number(core.asOf||0),t);
  core.migrations=Array.isArray(core.migrations)?core.migrations:[];
  const changed=
    beforeVersion!==map.version||
    beforeFingerprint!==map.fingerprint||
    added.length>0||
    metadataUpdated.length>0;
  if(changed){
    core.migrations.push({
      migrationId:'capability-map:'+sha256({
        beforeVersion,
        beforeFingerprint,
        afterVersion:map.version,
        afterFingerprint:map.fingerprint,
        added,
        metadataUpdated,
        asOf:t
      }).slice(0,24),
      kind:'CAPABILITY_MAP_RECONCILIATION',
      fromVersion:beforeVersion,
      toVersion:map.version,
      at:t,
      addedSkillIds:[...added],
      metadataUpdatedSkillIds:[...metadataUpdated],
      evidenceRewritten:false,
      promotionHistoryRewritten:false,
      productionMutationPerformed:false
    });
  }

  return finalized(core);
}

export function proposeBiggjChildSkill(tree,{
  parentSkillId,
  title,
  purpose,
  question,
  hypothesis,
  falsifier,
  dependencies=[],
  strategicImpact=.6,
  uncertainty=1,
  asOf=Date.now(),
  proposedBy='AUTONOMOUS_RESEARCH'
}={}){
  verifyTreeShape(tree);
  const t=finite(asOf);
  if(t==null) throw new Error('asOf must be finite');
  const parent=tree.nodes.find(x=>x.skillId===parentSkillId);
  if(!parent) throw new Error('parent skill missing');
  const cleanTitle=String(title||'').trim();
  const cleanQuestion=String(question||'').trim();
  const cleanHypothesis=String(hypothesis||'').trim();
  const cleanFalsifier=String(falsifier||'').trim();
  if(!cleanTitle||!cleanQuestion||!cleanHypothesis||!cleanFalsifier) throw new Error('title, question, hypothesis and falsifier are required');
  const depIds=uniq(dependencies);
  for(const id of depIds) if(!tree.nodes.some(x=>x.skillId===id)) throw new Error('unknown dependency '+id);
  const identity={
    parentSkillId,
    title:cleanTitle,
    question:cleanQuestion,
    hypothesis:cleanHypothesis,
    falsifier:cleanFalsifier
  };
  const skillId='skill:'+sha256(identity).slice(0,24);
  if(tree.nodes.some(x=>x.skillId===skillId)) return tree;
  const core=cloneTree(tree);
  const node={
    skillId,
    capabilityId:null,
    parentSkillId,
    rootId:parent.rootId||parent.capabilityId||parent.skillId,
    title:cleanTitle,
    purpose:String(purpose||cleanQuestion),
    layer:parent.layer,
    kind:'DISCOVERED_SKILL',
    status:'DISCOVERING',
    promotionStage:'RESEARCH_ONLY',
    createdAt:t,
    updatedAt:t,
    question:cleanQuestion,
    hypothesis:cleanHypothesis,
    falsifier:cleanFalsifier,
    dependencies:depIds,
    strategicImpact:clamp(strategicImpact),
    uncertainty:clamp(uncertainty),
    evidence:[],
    evidenceSummary:blankEvidence(),
    moduleHints:[],
    discoveredBy:String(proposedBy||'AUTONOMOUS_RESEARCH'),
    productionMutationAllowed:false,
    execution:'SHADOW_ONLY',
    canExecuteLive:false
  };
  core.nodes.push(node);
  core.proposals.push({
    proposalId:'proposal:'+sha256({skillId,t}).slice(0,20),
    skillId,
    parentSkillId,
    createdAt:t,
    status:'RESEARCH_ONLY',
    productionMutationPerformed:false
  });
  core.asOf=Math.max(core.asOf,t);
  return finalized(core);
}

export function recordBiggjSkillEvidence(tree,{
  skillId,
  epistemicClass,
  asOf,
  availableAt,
  sourceId,
  independentEpisodeId=null,
  statement,
  outcome='NEUTRAL',
  metricDelta=null,
  forwardShadow=false,
  pointInTime=true,
  futureLeakage=false,
  auditReady=false,
  scientificGuardsPassed=false,
  chronologicalStable=false,
  costStressPassed=false,
  concentrationPassed=false,
  winnerRemovalPassed=false,
  provenance=[]
}={}){
  verifyTreeShape(tree);
  const i=findNodeIndex(tree,skillId);
  if(i<0) throw new Error('skill missing');
  const cls=String(epistemicClass||'').toUpperCase();
  if(!TCX_EPISTEMIC_CLASSES.includes(cls)) throw new Error('invalid epistemic class');
  const t=finite(asOf),a=finite(availableAt);
  if(t==null||a==null) throw new Error('asOf and availableAt must be finite');
  if(a>t) throw new Error('future evidence blocked');
  if(futureLeakage===true) throw new Error('future leakage blocked');
  if((cls==='OBSERVED'||cls==='INFERRED')&&!String(sourceId||'').trim()) throw new Error('sourceId required');
  const text=String(statement||'').trim();
  if(!text) throw new Error('evidence statement required');
  const core=cloneTree(tree);
  const node=core.nodes[i];
  const evidenceCore={
    skillId,
    epistemicClass:cls,
    asOf:t,
    availableAt:a,
    sourceId:String(sourceId||''),
    independentEpisodeId:independentEpisodeId==null?null:String(independentEpisodeId),
    statement:text,
    outcome:token(outcome,'NEUTRAL'),
    metricDelta:finite(metricDelta),
    forwardShadow:forwardShadow===true,
    pointInTime:pointInTime===true,
    futureLeakage:false,
    auditReady:auditReady===true,
    scientificGuardsPassed:scientificGuardsPassed===true,
    chronologicalStable:chronologicalStable===true,
    costStressPassed:costStressPassed===true,
    concentrationPassed:concentrationPassed===true,
    winnerRemovalPassed:winnerRemovalPassed===true,
    provenance:Array.isArray(provenance)?structuredClone(provenance):[]
  };
  const evidence={...evidenceCore,evidenceId:'evidence:'+sha256(evidenceCore).slice(0,24)};
  if(!node.evidence.some(x=>x.evidenceId===evidence.evidenceId)) node.evidence.push(evidence);
  node.evidenceSummary=evidenceSummary(node.evidence);
  node.updatedAt=t;
  node.uncertainty=clamp(1-node.evidenceSummary.independentEpisodes/(node.evidenceSummary.independentEpisodes+20));
  if(node.status==='UNKNOWN') node.status='DISCOVERING';
  node.promotionStage=promotionStageForStatus(node.status);
  core.asOf=Math.max(core.asOf,t);
  return finalized(core);
}

export function evaluateBiggjSkillProgress(tree,skillId){
  verifyTreeShape(tree);
  const node=tree.nodes.find(x=>x.skillId===skillId);
  if(!node) throw new Error('skill missing');
  const e=node.evidenceSummary||blankEvidence();
  const allPit=e.total>0&&e.pitSafe===e.total;
  const allAudited=e.total>0&&e.auditReady===e.total;
  const allScience=e.total>0&&e.sciencePassed===e.total;
  const positiveRate=e.total?e.positive/e.total:0;
  const testingDependencyGate=evaluateBiggjSkillDependencyGate(tree,{skillId,phase:'TESTING'});
  const decisionDependencyGate=evaluateBiggjSkillDependencyGate(tree,{skillId,phase:'DECISION'});
  const trustDependencyGate=evaluateBiggjSkillDependencyGate(tree,{skillId,phase:'TRUST'});
  const reasons=[];
  let recommended=node.status;

  if(node.status==='UNKNOWN'){
    recommended='DISCOVERING';
    reasons.push('RESEARCH_QUESTION_REQUIRED');
  }else if(node.status==='DISCOVERING'){
    if(!node.question&&!defaultQuestion(node)) reasons.push('QUESTION_MISSING');
    if(!node.hypothesis&&node.kind==='DISCOVERED_SKILL') reasons.push('HYPOTHESIS_MISSING');
    if(!node.falsifier&&node.kind==='DISCOVERED_SKILL') reasons.push('FALSIFIER_MISSING');
    if(e.total>=3&&e.independentEpisodes>=2&&allPit) recommended='LEARNING';
    else reasons.push('EARLY_EVIDENCE_REQUIRED');
  }else if(node.status==='LEARNING'){
    const evidenceReady=e.total>=10&&e.independentEpisodes>=5&&allPit&&allAudited;
    if(!evidenceReady) reasons.push('LEARNING_SAMPLE_OR_AUDIT_DEFICIT');
    if(!testingDependencyGate.ready) reasons.push('DEPENDENCY_GATE_TESTING_BLOCKED');
    if(evidenceReady&&testingDependencyGate.ready) recommended='TESTING';
  }else if(node.status==='TESTING'){
    const strong=
      e.forwardShadow>=30&&e.independentEpisodes>=20&&allPit&&allAudited&&allScience&&
      e.chronologicalStable>=Math.min(20,e.forwardShadow)&&
      e.costStressPassed>=Math.min(20,e.forwardShadow)&&
      e.concentrationPassed>=Math.min(20,e.forwardShadow)&&
      e.winnerRemovalPassed>=Math.min(20,e.forwardShadow)&&
      positiveRate>.50;
    if(!strong) reasons.push('FORWARD_STRESS_VALIDATION_INCOMPLETE');
    if(!decisionDependencyGate.ready) reasons.push('DEPENDENCY_GATE_DECISION_BLOCKED');
    if(strong&&decisionDependencyGate.ready) recommended='VALIDATED';
  }else if(node.status==='VALIDATED'){
    const trusted=
      e.forwardShadow>=60&&e.independentEpisodes>=40&&allPit&&allAudited&&allScience&&
      e.chronologicalStable>=40&&e.costStressPassed>=40&&
      e.concentrationPassed>=40&&e.winnerRemovalPassed>=40&&positiveRate>.52;
    if(!trusted) reasons.push('TRUST_THRESHOLD_NOT_REACHED');
    if(!trustDependencyGate.ready) reasons.push('DEPENDENCY_GATE_TRUST_BLOCKED');
    if(trusted&&trustDependencyGate.ready) recommended='TRUSTED';
  }else if(node.status==='TRUSTED'){
    if(!trustDependencyGate.ready){
      recommended='DECAYING';
      reasons.push('DEPENDENCY_DECAY_PROPAGATION');
    }else if(e.total>=10&&e.negative/Math.max(1,e.total)>.55){
      recommended='DECAYING';
      reasons.push('FORWARD_EVIDENCE_DECAY');
    }
  }else if(node.status==='DECAYING'){
    reasons.push('REVALIDATION_REQUIRED');
  }

  const gateSummary=gate=>({
    ready:gate.ready,
    blockers:gate.blockers.map(x=>({
      dependencyCapabilityId:x.dependencyCapabilityId,
      dependencySkillId:x.dependencySkillId,
      relation:x.relation,
      requiredState:x.requiredState,
      actualState:x.actualState
    }))
  });
  const promotionStage=promotionStageForStatus(recommended);
  return finalized({
    version:BIGGJ_SKILL_TREE_VERSION,
    skillId,
    currentStatus:node.status,
    recommendedStatus:recommended,
    promotionStage,
    evidenceSummary:{...e},
    uncertainty:node.uncertainty,
    dependencyGates:{
      testing:gateSummary(testingDependencyGate),
      decision:gateSummary(decisionDependencyGate),
      trust:gateSummary(trustDependencyGate)
    },
    reasons,
    automaticPrimaryMutationAllowed:false,
    requiresVersionedPromotion:recommended==='TRUSTED'||node.status==='TRUSTED',
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecuteLive:false
  });
}

export function applyBiggjSkillStatusTransition(tree,{
  skillId,
  toStatus,
  evaluation,
  asOf=Date.now(),
  promotionRecordId=null
}={}){
  verifyTreeShape(tree);
  const i=findNodeIndex(tree,skillId);
  if(i<0) throw new Error('skill missing');
  const target=String(toStatus||'').toUpperCase();
  if(!BIGGJ_SKILL_STATES.includes(target)) throw new Error('invalid skill status');
  if(!evaluation||evaluation.skillId!==skillId) throw new Error('matching evaluation required');
  if(evaluation.recommendedStatus!==target) throw new Error('transition not supported by evaluation');
  const current=tree.nodes[i].status;
  if(target==='TRUSTED'&&!promotionRecordId) throw new Error('trusted transition requires promotion record');
  if(target!=='DECAYING'&&target!=='RETIRED'&&STATE_RANK[target]<STATE_RANK[current]) throw new Error('backward transition requires decay or retire');
  const core=cloneTree(tree);
  const node=core.nodes[i];
  node.status=target;
  node.promotionStage=promotionStageForStatus(target);
  node.updatedAt=Number(asOf);
  core.promotions.push({
    transitionId:'transition:'+sha256({skillId,current,target,asOf,promotionRecordId}).slice(0,24),
    skillId,
    fromStatus:current,
    toStatus:target,
    at:Number(asOf),
    evaluationFingerprint:evaluation.fingerprint,
    promotionRecordId:promotionRecordId||null,
    productionMutationPerformed:false
  });
  core.asOf=Math.max(core.asOf,Number(asOf));
  return finalized(core);
}

function researchPriority(node){
  const e=node.evidenceSummary||blankEvidence();
  const evidenceDeficit=1-clamp(e.independentEpisodes/30);
  const statusNeed={
    UNKNOWN:1,DISCOVERING:.92,LEARNING:.78,TESTING:.62,VALIDATED:.35,TRUSTED:.12,DECAYING:.95,RETIRED:0
  }[node.status]??.6;
  const dynamicDependencyNeed=(node.dependencies||[]).length?Math.min(.08,.02*node.dependencies.length):0;
  const leverage=canonicalSkillLeverage(node.capabilityId).score;
  return clamp(
    .30*node.strategicImpact+
    .26*node.uncertainty+
    .22*evidenceDeficit+
    .08*statusNeed+
    .14*leverage+
    dynamicDependencyNeed
  );
}

export function buildBiggjResearchQueue(tree,{limit=25}={}){
  verifyTreeShape(tree);
  const rows=tree.nodes
    .filter(x=>x.kind!=='ROOT'&&x.status!=='RETIRED')
    .map(node=>{
      const leverage=canonicalSkillLeverage(node.capabilityId);
      const dependencyGate=evaluateBiggjSkillDependencyGate(tree,{skillId:node.skillId,phase:'TESTING'});
      return {
        skillId:node.skillId,
        capabilityId:node.capabilityId,
        rootId:node.rootId,
        title:node.title,
        status:node.status,
        priority:clamp(researchPriority(node)*(dependencyGate.ready?1:Math.max(.70,1-.10*dependencyGate.blockers.length))),
        question:node.question||defaultQuestion(node),
        uncertainty:node.uncertainty,
        independentEpisodes:node.evidenceSummary?.independentEpisodes||0,
        nextGate:evaluateBiggjSkillProgress(tree,node.skillId).recommendedStatus,
        dependencyLeverage:leverage.score,
        directUnlocks:leverage.directUnlocks,
        transitiveUnlocks:leverage.transitiveUnlocks,
        testingDependencyReady:dependencyGate.ready,
        testingBlockers:dependencyGate.blockers.map(x=>x.dependencyCapabilityId||x.dependencySkillId)
      };
    })
    .sort((a,b)=>b.priority-a.priority||b.uncertainty-a.uncertainty||String(a.skillId).localeCompare(String(b.skillId)))
    .slice(0,Math.max(1,Number(limit)||25));
  return finalized({
    version:BIGGJ_SKILL_TREE_VERSION,
    asOf:tree.asOf,
    queue:rows,
    generatedFromTreeFingerprint:tree.fingerprint,
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecuteLive:false
  });
}

export function biggjCapabilityGapReport(tree){
  verifyTreeShape(tree);
  const roots=tree.nodes.filter(x=>x.kind==='ROOT');
  const byRoot=[];
  for(const root of roots){
    const rows=tree.nodes.filter(x=>x.rootId===root.capabilityId&&x.kind!=='ROOT');
    const counts=Object.fromEntries(BIGGJ_SKILL_STATES.map(s=>[s,rows.filter(x=>x.status===s).length]));
    const known=rows.filter(x=>STATE_RANK[x.status]>=STATE_RANK.LEARNING).length;
    const validated=rows.filter(x=>['VALIDATED','TRUSTED'].includes(x.status)).length;
    byRoot.push({
      rootId:root.capabilityId,
      total:rows.length,
      known,
      validated,
      coverage:rows.length?known/rows.length:0,
      validatedCoverage:rows.length?validated/rows.length:0,
      meanUncertainty:rows.length?rows.reduce((s,x)=>s+Number(x.uncertainty||0),0)/rows.length:1,
      counts
    });
  }
  byRoot.sort((a,b)=>a.coverage-b.coverage||b.meanUncertainty-a.meanUncertainty);
  return finalized({
    version:BIGGJ_SKILL_TREE_VERSION,
    asOf:tree.asOf,
    roots:byRoot,
    weakestRoots:byRoot.slice(0,5),
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecuteLive:false
  });
}

export function biggjSkillTreeSnapshot(tree){
  verifyTreeShape(tree);
  const counts=Object.fromEntries(BIGGJ_SKILL_STATES.map(s=>[s,tree.nodes.filter(x=>x.status===s).length]));
  const discovered=tree.nodes.filter(x=>x.kind==='DISCOVERED_SKILL').length;
  const trusted=tree.nodes.filter(x=>x.status==='TRUSTED').length;
  const decaying=tree.nodes.filter(x=>x.status==='DECAYING').length;
  return finalized({
    version:BIGGJ_SKILL_TREE_VERSION,
    asOf:tree.asOf,
    nodeCount:tree.nodes.length,
    discovered,
    trusted,
    decaying,
    counts,
    researchQueue:buildBiggjResearchQueue(tree,{limit:10}).queue,
    capabilityGaps:biggjCapabilityGapReport(tree).weakestRoots,
    dependencyBottlenecks:biggjDependencyBottleneckReport(tree,{phase:'TESTING',limit:10}).bottlenecks,
    compositionReadiness:biggjCompositionReadiness(tree).blocked,
    silentPrimaryMutation:false,
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecuteLive:false
  });
}
