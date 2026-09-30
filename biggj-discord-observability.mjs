
import { BIGGJ_CAPABILITY_ROOTS } from './biggj-capability-map.mjs';
import { biggjSkillTreeSnapshot } from './biggj-skill-tree.mjs';
import {
  biggjAssumptionResearchTemplates,
  biggjLivingResearchRuntimeSummary
} from './biggj-living-research-runtime.mjs';
import { biggjResearchValidationSummary } from './biggj-research-validation-harness.mjs';

export const BIGGJ_DISCORD_OBSERVABILITY_VERSION='BIGGJ_DISCORD_OBSERVABILITY_V1';

export const BIGGJ_DISCORD_OBSERVABILITY_LAYOUT=Object.freeze([
  {category:'BIGGJ • BRAIN',channels:[
    {name:'brain-pulse',topic:'Was BIGGJ gerade weiß, untersucht, bezweifelt und als Nächstes lernen will.'},
    {name:'knowledge',topic:'Capability- und Wissensstand mit Reifegrad, Unsicherheit und Wissenslücken.'},
    {name:'research-queue',topic:'Priorisierte Forschungsfragen, Informationswert, Blocker und nächste Experimente.'},
    {name:'hypotheses',topic:'Explizite Hypothesen, Falsifier und Annahmen. Kein erfundener Gedankenstrom.'},
    {name:'changes',topic:'Revisionen, stale assumptions und was BIGGJ aufgrund neuer Evidenz anders prüfen will.'}
  ]},
  {category:'BIGGJ • PROGRESS',channels:[
    {name:'experiments',topic:'Präregistrierte Research-Protokolle, Validierungsphasen und nächste Tests.'},
    {name:'skill-tree',topic:'BIGGJ Skill Tree: Reifegrade, Dependency-Bottlenecks und Capability-Gaps.'},
    {name:'review-queue',topic:'Evidenzreife Skill-Transitions, manuelle Reviews, Blocker und Governance.'},
    {name:'learning-timeline',topic:'Chronologische BIGGJ Lern-, Review-, Protokoll- und Revisionsereignisse mit 24h/7d Aktivität.'},
    {name:'progress',topic:'Messbarer Lernfortschritt: Evidence, Episoden, Reifegrad und Research-Momentum.'},
    {name:'evidence-ledger',topic:'Evidence-Qualität, PIT/Audit/Science-Status und Research-Coverage.'},
    {name:'decision-trace',topic:'Nachvollziehbare Systementscheidungen und Begründungen aus explizitem State.'}
  ]}
]);

export const BIGGJ_DISCORD_OBSERVABILITY_MARKERS=Object.freeze({
  pulse:'BIGGJ_OBSERVABILITY_BRAIN_PULSE_V1',
  knowledge:'BIGGJ_OBSERVABILITY_KNOWLEDGE_V1',
  research:'BIGGJ_OBSERVABILITY_RESEARCH_QUEUE_V1',
  hypotheses:'BIGGJ_OBSERVABILITY_HYPOTHESES_V1',
  changes:'BIGGJ_OBSERVABILITY_CHANGES_V1',
  experiments:'BIGGJ_OBSERVABILITY_EXPERIMENTS_V1',
  skills:'BIGGJ_OBSERVABILITY_SKILL_TREE_V1',
  reviews:'BIGGJ_OBSERVABILITY_REVIEW_QUEUE_V1',
  timeline:'BIGGJ_OBSERVABILITY_LEARNING_TIMELINE_V1',
  progress:'BIGGJ_OBSERVABILITY_PROGRESS_V1',
  evidence:'BIGGJ_OBSERVABILITY_EVIDENCE_V1',
  decisions:'BIGGJ_OBSERVABILITY_DECISION_TRACE_V1'
});

const STATUS_RANK=Object.freeze({
  TRUSTED:7,VALIDATED:6,TESTING:5,LEARNING:4,DISCOVERING:3,UNKNOWN:2,DECAYING:1,RETIRED:0
});
const STATUS_WEIGHT=Object.freeze({
  UNKNOWN:0,DISCOVERING:.12,LEARNING:.34,TESTING:.58,VALIDATED:.82,TRUSTED:1,DECAYING:.28,RETIRED:0
});

const arr=v=>Array.isArray(v)?v:[];
const finite=(v,f=0)=>Number.isFinite(Number(v))?Number(v):f;
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,finite(v)));
const pct=v=>Math.round(clamp(v)*100)+'%';
const fmt=v=>Number.isFinite(Number(v))?Number(v).toLocaleString('de-DE',{maximumFractionDigits:2}):'—';
const clip=(v,max=900)=>{
  const s=String(v==null?'—':v).replace(/\s+/g,' ').trim()||'—';
  return s.length<=max?s:s.slice(0,Math.max(1,max-1))+'…';
};
const when=ms=>{
  if(!Number.isFinite(Number(ms)))return '—';
  try{return new Date(Number(ms)).toLocaleString('de-DE',{timeZone:'Europe/Berlin'});}catch{return '—';}
};
const safeField=(name,value,inline=false)=>({
  name:clip(name,256),
  value:clip(value,1024),
  inline:Boolean(inline)
});
const mark=status=>{
  const s=String(status||'UNKNOWN').toUpperCase();
  if(s==='TRUSTED')return '●';
  if(s==='VALIDATED')return '◆';
  if(s==='TESTING')return '◐';
  if(s==='LEARNING')return '◒';
  if(s==='DISCOVERING')return '○';
  if(s==='DECAYING')return '!';
  return '·';
};
const rootId=root=>String(root?.id||root?.rootId||root?.capabilityId||root?.name||'UNKNOWN');
const rootPurpose=root=>String(root?.purpose||root?.description||root?.mission||'');

function templateMap(){
  return new Map(biggjAssumptionResearchTemplates().map(x=>[String(x.assumptionId),x]));
}
function maturityIndex(nodes){
  const rows=arr(nodes).filter(x=>x?.kind!=='ROOT'&&String(x?.status||'')!=='RETIRED');
  if(!rows.length)return 0;
  return rows.reduce((sum,row)=>sum+(STATUS_WEIGHT[String(row?.status||'UNKNOWN').toUpperCase()]||0),0)/rows.length;
}
function safeSkillSnapshot(state){
  try{return biggjSkillTreeSnapshot(state?.skillTree);}catch{return null;}
}
function safeLivingSummary(state){
  try{return biggjLivingResearchRuntimeSummary(state);}catch{return null;}
}
function safeValidation(state){
  try{return biggjResearchValidationSummary(state?.skillTree,{limit:12});}catch{return null;}
}
function knowledgeRows(nodes){
  return arr(nodes)
    .filter(x=>x?.kind!=='ROOT'&&String(x?.status||'UNKNOWN')!=='RETIRED')
    .sort((a,b)=>
      (STATUS_RANK[String(b?.status||'UNKNOWN')]||0)-(STATUS_RANK[String(a?.status||'UNKNOWN')]||0)||
      clamp(a?.uncertainty)-clamp(b?.uncertainty)||
      String(a?.title||a?.skillId).localeCompare(String(b?.title||b?.skillId))
    )
    .slice(0,30)
    .map(x=>({
      skillId:String(x?.skillId||'UNKNOWN'),
      capabilityId:String(x?.capabilityId||'UNKNOWN'),
      rootId:String(x?.rootId||'UNKNOWN'),
      title:String(x?.title||x?.capabilityId||x?.skillId||'UNKNOWN'),
      status:String(x?.status||'UNKNOWN'),
      uncertainty:clamp(x?.uncertainty),
      updatedAt:finite(x?.updatedAt,null)
    }));
}
function agendaRows(state){
  const templates=templateMap();
  return arr(state?.agenda).slice(0,20).map(row=>{
    const t=templates.get(String(row?.assumptionId))||{};
    return {
      assumptionId:String(row?.assumptionId||'UNKNOWN'),
      status:String(row?.status||'UNKNOWN'),
      priority:clamp(row?.priority),
      informationValue:clamp(row?.informationValue),
      primaryCapabilityId:String(row?.primaryCapabilityId||t.primaryCapabilityId||'UNKNOWN'),
      distinctPersistentForecasts:finite(row?.distinctPersistentForecasts),
      currentPersistentForecasts:finite(row?.currentPersistentForecasts),
      question:String(t.question||''),
      hypothesis:String(t.hypothesis||''),
      falsifier:String(t.falsifier||''),
      topFalsifiers:arr(row?.falsifiers).slice(0,5).map(x=>({
        code:String(x?.code||'UNKNOWN'),
        count:finite(x?.count)
      }))
    };
  });
}
function protocolRows(state){
  return [...arr(state?.researchProtocols)]
    .sort((a,b)=>finite(b?.registeredAt)-finite(a?.registeredAt))
    .slice(0,20)
    .map(row=>({
      protocolId:String(row?.protocolId||'UNKNOWN'),
      skillId:String(row?.skillId||'UNKNOWN'),
      state:String(row?.state||row?.status||'REGISTERED'),
      registeredAt:finite(row?.registeredAt,null),
      question:String(row?.question||row?.researchQuestion||''),
      hypothesis:String(row?.hypothesis||''),
      falsifier:String(row?.falsifier||''),
      backfilledForExistingSkill:row?.backfilledForExistingSkill===true
    }));
}
function revisionRows(state){
  return [...arr(state?.stabilityEventRegistry)]
    .sort((a,b)=>finite(b?.at??b?.observedAt??b?.eventAt)-finite(a?.at??a?.observedAt??a?.eventAt))
    .slice(0,24)
    .map(row=>({
      at:finite(row?.at??row?.observedAt??row?.eventAt,null),
      type:String(row?.type||row?.state||'STATE_CHANGE'),
      assumptionId:String(row?.assumptionId||'UNKNOWN'),
      forecastId:String(row?.forecastId||'UNKNOWN'),
      symbol:String(row?.symbol||''),
      falsifierCodes:arr(row?.repeatedFalsifierCodes||row?.falsifierCodes).map(String).slice(0,6)
    }));
}

function learningTimeline(state,nodes,asOf){
  const now=finite(asOf);
  const events=[];
  const push=(at,kind,title,detail='',ref='')=>{
    const t=finite(at,null);
    if(t==null||t<=0||t>now)return;
    events.push({
      at:t,
      kind:String(kind||'EVENT'),
      title:String(title||'UNKNOWN'),
      detail:String(detail||''),
      ref:String(ref||'')
    });
  };
  for(const row of arr(state?.researchProtocols)){
    push(row?.registeredAt,'PROTOCOL_REGISTERED',row?.skillId||'UNKNOWN',row?.protocolId||'',row?.protocolId||'');
  }
  for(const row of arr(state?.stabilityEventRegistry)){
    const codes=arr(row?.repeatedFalsifierCodes||row?.falsifierCodes).map(String).slice(0,4);
    push(
      row?.at??row?.observedAt??row?.eventAt,
      'ASSUMPTION_REVISION',
      row?.assumptionId||row?.type||'STATE_CHANGE',
      [row?.symbol,...codes].filter(Boolean).join(' · '),
      row?.forecastId||''
    );
  }
  for(const row of arr(state?.researchReviewQueue?.tickets)){
    push(
      row?.createdAt,
      'REVIEW_READY',
      row?.skillId||'UNKNOWN',
      String(row?.fromStatus||'UNKNOWN')+' → '+String(row?.proposedStatus||'UNKNOWN'),
      row?.ticketId||''
    );
  }
  for(const row of arr(state?.researchReviewDecisions)){
    push(
      row?.decidedAt,
      'REVIEW_DECISION',
      row?.skillId||'UNKNOWN',
      String(row?.decision||'UNKNOWN')+(row?.fromStatus||row?.toStatus?' · '+String(row?.fromStatus||'')+' → '+String(row?.toStatus||''):''),
      row?.ticketId||''
    );
  }
  for(const row of arr(nodes)){
    if(String(row?.kind||'')!=='DISCOVERED_SKILL')continue;
    push(
      row?.createdAt??row?.updatedAt,
      'SKILL_DISCOVERED',
      row?.title||row?.skillId||'UNKNOWN',
      String(row?.status||'UNKNOWN'),
      row?.skillId||''
    );
  }
  const ordered=events.sort((a,b)=>b.at-a.at||a.kind.localeCompare(b.kind)||a.title.localeCompare(b.title));
  const summarize=windowMs=>{
    const rows=ordered.filter(x=>x.at>=now-windowMs&&x.at<=now);
    const byKind={};
    for(const row of rows)byKind[row.kind]=(byKind[row.kind]||0)+1;
    return {total:rows.length,byKind};
  };
  return {
    events:ordered.slice(0,40),
    last24h:summarize(24*60*60*1000),
    last7d:summarize(7*24*60*60*1000)
  };
}

export function buildBiggjDiscordObservabilitySnapshot({
  livingResearchState,
  claimAssumptionResearch=null,
  researchCoverage=null,
  discovery=null,
  asOf=Date.now()
}={}){
  const state=livingResearchState||{};
  const living=safeLivingSummary(state)||{};
  const skill=safeSkillSnapshot(state)||{};
  const validation=safeValidation(state)||{};
  const nodes=arr(state?.skillTree?.nodes);
  const evidence=living?.researchEvidence||{};
  const queue=arr(state?.canonicalResearchQueue).slice(0,20).map(row=>({
    skillId:String(row?.skillId||'UNKNOWN'),
    capabilityId:String(row?.capabilityId||'UNKNOWN'),
    rootId:String(row?.rootId||'UNKNOWN'),
    title:String(row?.title||row?.skillId||'UNKNOWN'),
    status:String(row?.status||'UNKNOWN'),
    priority:clamp(row?.priority),
    question:String(row?.question||''),
    uncertainty:clamp(row?.uncertainty),
    validationIndependentEpisodes:finite(row?.validationIndependentEpisodes),
    validationEvidenceTotal:finite(row?.validationEvidenceTotal),
    nextGate:String(row?.nextGate||'UNKNOWN'),
    dependencyLeverage:clamp(row?.dependencyLeverage),
    testingDependencyReady:row?.testingDependencyReady===true,
    testingBlockers:arr(row?.testingBlockers).map(String).slice(0,8)
  }));
  const claim=claimAssumptionResearch||{};
  const updatedAt=finite(state?.updatedAt,finite(asOf));
  const timeline=learningTimeline(state,nodes,updatedAt);
  return Object.freeze({
    version:BIGGJ_DISCORD_OBSERVABILITY_VERSION,
    generatedAt:updatedAt,
    runtimeRevision:finite(state?.revision),
    lastRefreshReason:String(state?.lastRefreshReason||'UNKNOWN'),
    integrity:String(living?.integrity||'UNKNOWN'),
    observedForecasts:finite(living?.observedForecasts),
    trackedAssumptions:finite(living?.trackedAssumptions),
    persistentCases:finite(living?.retainedPersistentCases),
    stabilityEvents:finite(living?.retainedStabilityEvents),
    unresolvedResearchCases:finite(living?.unresolvedResearchCases),
    discoveredResearchOnlySkills:finite(living?.discoveredResearchOnlySkills),
    activeAgendaItems:finite(living?.activeAgendaItems),
    researchRequired:finite(living?.researchRequired),
    maturityIndex:maturityIndex(nodes),
    skillCounts:skill?.counts||{},
    trustedSkills:finite(skill?.trusted),
    decayingSkills:finite(skill?.decaying),
    totalSkillNodes:finite(skill?.nodeCount,nodes.length),
    knowledge:knowledgeRows(nodes),
    agenda:agendaRows(state),
    researchQueue:queue.length?queue:arr(skill?.researchQueue).slice(0,20),
    protocols:protocolRows(state),
    revisions:revisionRows(state),
    learningTimeline:timeline,
    validation:{
      discoveredSkillCount:finite(validation?.discoveredSkillCount),
      manualTransitionReviewEligible:finite(validation?.manualTransitionReviewEligible),
      phases:validation?.phases||{},
      reviews:arr(validation?.topReviews).slice(0,12)
    },
    evidence:{
      skillCount:finite(evidence?.skillCount),
      evidenceTotal:finite(evidence?.evidenceTotal),
      forwardShadow:finite(evidence?.forwardShadow),
      independentEpisodes:finite(evidence?.independentEpisodes),
      validationEvidenceTotal:finite(evidence?.validationEvidenceTotal),
      validationForwardShadow:finite(evidence?.validationForwardShadow),
      validationIndependentEpisodes:finite(evidence?.validationIndependentEpisodes),
      rows:arr(evidence?.rows).slice(0,16)
    },
    capabilityRoots:BIGGJ_CAPABILITY_ROOTS.map(root=>({
      rootId:rootId(root),
      purpose:rootPurpose(root)
    })),
    capabilityGaps:arr(skill?.capabilityGaps).slice(0,8),
    dependencyBottlenecks:arr(skill?.dependencyBottlenecks).slice(0,10),
    compositionReadiness:arr(skill?.compositionReadiness).slice(0,10),
    researchReviews:{
      open:finite(living?.researchReviews?.open,finite(state?.researchReviewQueue?.ticketCount)),
      blocked:finite(living?.researchReviews?.blocked,finite(state?.researchReviewQueue?.blockedCount)),
      decisions:finite(living?.researchReviews?.decisions,arr(state?.researchReviewDecisions).length),
      automaticApply:state?.researchReviewQueue?.automaticApply===true,
      execution:String(state?.researchReviewQueue?.execution||'SHADOW_ONLY'),
      action:String(state?.researchReviewQueue?.action||'ABSTAIN'),
      canInfluencePrimary:state?.researchReviewQueue?.canInfluencePrimary===true,
      canExecuteLive:state?.researchReviewQueue?.canExecuteLive===true,
      builtAt:finite(state?.researchReviewQueue?.builtAt,null),
      tickets:arr(state?.researchReviewQueue?.tickets).slice(0,12).map(x=>({
        ticketId:String(x?.ticketId||'UNKNOWN'),
        skillId:String(x?.skillId||'UNKNOWN'),
        fromStatus:String(x?.fromStatus||'UNKNOWN'),
        proposedStatus:String(x?.proposedStatus||'UNKNOWN'),
        evidenceState:String(x?.evidenceState||'UNKNOWN'),
        validationPhase:String(x?.validationPhase||'UNKNOWN'),
        validationReadinessScore:clamp(x?.validationReadinessScore),
        createdAt:finite(x?.createdAt,null),
        validationChecklist:x?.validationChecklist||{},
        postRegistrationEvidence:x?.postRegistrationEvidence||{},
        dependencyGates:x?.dependencyGates||{}
      })),
      blockedItems:arr(state?.researchReviewQueue?.blocked).slice(0,12).map(x=>({
        protocolId:String(x?.protocolId||'UNKNOWN'),
        skillId:String(x?.skillId||'UNKNOWN'),
        reason:String(x?.reason||'UNKNOWN'),
        details:arr(x?.details).map(String).slice(0,6)
      })),
      recentDecisions:[...arr(state?.researchReviewDecisions)].slice(-10).reverse().map(x=>({
        ticketId:String(x?.ticketId||'UNKNOWN'),
        skillId:String(x?.skillId||'UNKNOWN'),
        decision:String(x?.decision||'UNKNOWN'),
        reviewer:String(x?.reviewer||'UNKNOWN'),
        decidedAt:finite(x?.decidedAt,null),
        fromStatus:String(x?.fromStatus||''),
        toStatus:String(x?.toStatus||'')
      }))
    },
    claimAssumptionResearch:{
      state:String(claim?.state||'NOT_EVALUATED'),
      observations:finite(claim?.observations),
      readiness:claim?.readiness===true,
      readinessReasons:arr(claim?.readinessReasons).map(String).slice(0,10),
      reasons:arr(claim?.reasons).map(String).slice(0,10),
      manualPromotionReviewEligible:claim?.manualPromotionReviewEligible===true,
      killReviewEligible:claim?.killReviewEligible===true,
      evaluatedAt:finite(claim?.evaluatedAt,null)
    },
    researchCoverage:researchCoverage||{},
    discovery:discovery||{},
    semantics:{
      visibleReasoningIsStructuredStateNotHiddenChainOfThought:true,
      readinessScoresAreDiagnosticsNotProbabilities:true,
      knowledgeMeansCurrentModelStateNotGuaranteedTruth:true,
      changesRequireEvidenceAndGovernance:true
    },
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    automaticPromotion:false,
    automaticExperimentLaunch:false,
    primaryMutationAllowed:false,
    canInfluencePrimary:false,
    canExecuteLive:false
  });
}

export function biggjObservabilityNavComponents(){
  return [
    {type:1,components:[
      {type:2,style:1,label:'Brain',custom_id:'dc6:brain:pulse'},
      {type:2,style:2,label:'Research',custom_id:'dc6:brain:research'},
      {type:2,style:2,label:'Skills',custom_id:'dc6:brain:skills'},
      {type:2,style:2,label:'Progress',custom_id:'dc6:brain:progress'},
      {type:2,style:2,label:'Changes',custom_id:'dc6:brain:changes'}
    ]},
    {type:1,components:[
      {type:2,style:3,label:'Reviews',custom_id:'dc6:brain:reviews'},
      {type:2,style:2,label:'Evidence',custom_id:'dc6:brain:evidence'},
      {type:2,style:2,label:'Decisions',custom_id:'dc6:brain:decisions'},
      {type:2,style:2,label:'Experiments',custom_id:'dc6:brain:experiments'},
      {type:2,style:2,label:'Timeline',custom_id:'dc6:brain:timeline'}
    ]}
  ];
}
function payload(title,description,fields,marker,snapshot){
  const safeTitle=clip(title,256);
  const safeDescription=clip(description,3500);
  const footerText=clip(marker+' · '+String(snapshot?.execution||'SHADOW_ONLY')+' · structured state, not hidden chain-of-thought',512);
  let budget=Math.max(0,5850-safeTitle.length-safeDescription.length-footerText.length);
  const fitted=[];
  for(const input of arr(fields).slice(0,25)){
    if(budget<24)break;
    const name=clip(input?.name,Math.min(256,Math.max(1,budget-8)));
    budget-=name.length;
    if(budget<4)break;
    const value=clip(input?.value,Math.min(1024,Math.max(1,budget)));
    budget-=value.length;
    fitted.push({name,value,inline:Boolean(input?.inline)});
  }
  return {
    embeds:[{
      title:safeTitle,
      description:safeDescription,
      fields:fitted,
      footer:{text:footerText},
      timestamp:new Date(finite(snapshot?.generatedAt,Date.now())).toISOString()
    }],
    components:biggjObservabilityNavComponents(),
    allowedMentions:{parse:[]}
  };
}
function queueLines(snapshot,limit=6){
  const rows=arr(snapshot?.researchQueue).slice(0,limit);
  return rows.length?rows.map((x,i)=>
    (i+1)+'. '+mark(x.status)+' **'+clip(x.title,70)+'** · P '+pct(x.priority)+' · U '+pct(x.uncertainty)+(x.testingDependencyReady?'':' · BLOCKED')
  ).join('\n'):'Keine aktive Research-Queue.';
}
function agendaLines(snapshot,limit=6){
  const rows=arr(snapshot?.agenda).slice(0,limit);
  return rows.length?rows.map(x=>
    mark(x.status)+' **'+clip(x.assumptionId,56)+'** · Info '+pct(x.informationValue)+' · '+clip(x.status,30)
  ).join('\n'):'Keine aktiven Annahmen auf der Agenda.';
}
function nextExperimentLines(snapshot,limit=6){
  const rows=arr(snapshot?.validation?.reviews).slice(0,limit);
  return rows.length?rows.map(x=>
    mark(x.currentStatus)+' **'+clip(x.title||x.skillId,65)+'** · '+clip(x.currentStatus,20)+' → '+clip(x.recommendedStatus,20)+
    '\nNEXT · '+clip(x?.nextExperiment?.purpose||x?.nextExperiment?.experimentId||'No implied experiment',150)
  ).join('\n'):'Noch keine discovered skills im Validation Harness.';
}

function diagnosticLines(value,limit=6){
  const out=[];
  const walk=(node,prefix='',depth=0)=>{
    if(out.length>=limit||depth>2||node==null)return;
    if(Array.isArray(node)){
      if(node.every(x=>x==null||['string','number','boolean'].includes(typeof x))){
        out.push((prefix||'items')+': '+clip(node.join(', '),180));
        return;
      }
      node.slice(0,Math.max(1,limit-out.length)).forEach((x,i)=>walk(x,prefix?prefix+'.'+i:String(i),depth+1));
      return;
    }
    if(typeof node==='object'){
      for(const [k,v] of Object.entries(node)){
        if(out.length>=limit)break;
        walk(v,prefix?prefix+'.'+k:k,depth+1);
      }
      return;
    }
    out.push((prefix||'value')+': '+clip(node,160));
  };
  walk(value);
  return out.length?out.map(x=>'• '+x).join('\n'):'—';
}

export function buildBiggjBrainPulsePayload(snapshot={}){
  const claim=snapshot?.claimAssumptionResearch||{};
  return payload(
    'BIGGJ // BRAIN PULSE',
    '**Was BIGGJ gerade weiß, bezweifelt, untersucht und als Nächstes prüfen will.**\nAlle Aussagen stammen aus explizitem Research-State; keine erfundenen Gedanken.',
    [
      safeField('NOW · Research Agenda',agendaLines(snapshot,5)),
      safeField('NEXT · Highest Leverage',queueLines(snapshot,5)),
      safeField('SYSTEM BELIEF REVISION',[
        'Runtime revision '+fmt(snapshot.runtimeRevision)+' · '+clip(snapshot.lastRefreshReason,80),
        'Claim/Assumption evaluator: '+clip(claim.state,40)+' · '+fmt(claim.observations)+' observations',
        'Promotion review: '+(claim.manualPromotionReviewEligible?'eligible for MANUAL review':'not eligible'),
        'Automatic production mutation: OFF'
      ].join('\n')),
      safeField('PROGRESS',[
        'Maturity index '+pct(snapshot.maturityIndex)+' (diagnostic)',
        'Trusted '+fmt(snapshot.trustedSkills)+' · Validated '+fmt(snapshot?.skillCounts?.VALIDATED)+' · Testing '+fmt(snapshot?.skillCounts?.TESTING),
        'Research-required '+fmt(snapshot.researchRequired)+' · Persistent cases '+fmt(snapshot.persistentCases),
        'Manual review tickets '+fmt(snapshot?.researchReviews?.open)+' · blocked '+fmt(snapshot?.researchReviews?.blocked),
        'Observed forecasts '+fmt(snapshot.observedForecasts)
      ].join('\n'))
    ],
    BIGGJ_DISCORD_OBSERVABILITY_MARKERS.pulse,
    snapshot
  );
}
export function buildBiggjKnowledgePayload(snapshot={}){
  const body=arr(snapshot.knowledge).slice(0,18).map(x=>
    mark(x.status)+' **'+clip(x.title,70)+'** · '+clip(x.status,18)+' · U '+pct(x.uncertainty)
  ).join('\n')||'Noch kein Skill-State verfügbar.';
  const gaps=arr(snapshot.capabilityGaps).slice(0,6).map(x=>
    '**'+clip(x.rootId,50)+'** · coverage '+pct(x.coverage)+' · validated '+pct(x.validatedCoverage)+' · U '+pct(x.meanUncertainty)
  ).join('\n')||'Keine Gap-Daten.';
  return payload(
    'BIGGJ // KNOWLEDGE MAP',
    'Reifegrad ist **kein Wahrheitszertifikat**. Er zeigt, wie weit eine Capability den Research-/Validation-Prozess durchlaufen hat.',
    [
      safeField('MOST MATURE / MOST TESTED',body),
      safeField('WEAKEST ROOTS',gaps),
      safeField('STATE COUNTS',Object.entries(snapshot.skillCounts||{}).map(([k,v])=>k+' '+fmt(v)).join(' · ')||'—')
    ],
    BIGGJ_DISCORD_OBSERVABILITY_MARKERS.knowledge,
    snapshot
  );
}
export function buildBiggjResearchQueuePayload(snapshot={}){
  const fields=arr(snapshot.researchQueue).slice(0,10).map((x,i)=>safeField(
    '#'+(i+1)+' · '+clip(x.title||x.skillId,90),
    [
      'State '+clip(x.status,30)+' · Priority '+pct(x.priority)+' · Uncertainty '+pct(x.uncertainty),
      'Question: '+clip(x.question||'Not declared',430),
      'Next gate: '+clip(x.nextGate||'UNKNOWN',40)+' · Dependency leverage '+pct(x.dependencyLeverage),
      x.testingDependencyReady?'Testing dependencies: READY':'Blockers: '+clip(arr(x.testingBlockers).join(', ')||'unknown',220)
    ].join('\n')
  ));
  return payload(
    'BIGGJ // RESEARCH QUEUE',
    '**Priorisiert nach Informationswert, Unsicherheit, strategischem Impact und Dependency-Leverage.**\nKein Experiment startet automatisch.',
    fields.length?fields:[safeField('Queue','Keine Research-Items.')],
    BIGGJ_DISCORD_OBSERVABILITY_MARKERS.research,
    snapshot
  );
}
export function buildBiggjHypothesesPayload(snapshot={}){
  const fields=arr(snapshot.agenda).slice(0,8).map(x=>safeField(
    clip(x.assumptionId,100)+' · '+clip(x.status,30),
    [
      '**Question** '+clip(x.question||'—',280),
      '**Hypothesis** '+clip(x.hypothesis||'—',280),
      '**Falsifier** '+clip(x.falsifier||'—',280),
      'Info '+pct(x.informationValue)+' · Persistent forecasts '+fmt(x.distinctPersistentForecasts)
    ].join('\n')
  ));
  return payload(
    'BIGGJ // HYPOTHESES & FALSIFIERS',
    'Hier steht **was BIGGJ explizit testet** und **welche Beobachtung dagegen zählen würde**. Hypothesen werden nicht als Fakten dargestellt.',
    fields.length?fields:[safeField('Status','Keine aktive Hypothesen-Agenda.')],
    BIGGJ_DISCORD_OBSERVABILITY_MARKERS.hypotheses,
    snapshot
  );
}
export function buildBiggjChangesPayload(snapshot={}){
  const revisions=arr(snapshot.revisions).slice(0,10);
  const lines=revisions.length?revisions.map(x=>
    when(x.at)+' · **'+clip(x.type,42)+'** · '+clip(x.assumptionId,58)+(x.falsifierCodes.length?' · '+clip(x.falsifierCodes.join(', '),120):'')
  ).join('\n'):'Keine gespeicherten Stability-Events.';
  return payload(
    'BIGGJ // REVISION LOG',
    '**Was sich geändert hat und was BIGGJ deshalb anders prüfen will.**\nSupport-Verlust ist kein Beweis, dass ein Forecast falsch ist; er löst Research/Revision aus.',
    [
      safeField('LATEST STATE CHANGES',lines),
      safeField('WHAT CHANGES NEXT',nextExperimentLines(snapshot,6)),
      safeField('GOVERNANCE','Auto-promotion OFF · Auto-kill OFF · Auto-experiment OFF · PRIMARY mutation OFF')
    ],
    BIGGJ_DISCORD_OBSERVABILITY_MARKERS.changes,
    snapshot
  );
}
export function buildBiggjExperimentsPayload(snapshot={}){
  const fields=arr(snapshot.protocols).slice(0,8).map((x,i)=>safeField(
    '#'+(i+1)+' · '+clip(x.skillId,90),
    [
      'Protocol '+clip(x.protocolId,80)+' · '+clip(x.state,30)+' · '+when(x.registeredAt),
      x.question?'Q: '+clip(x.question,260):'',
      x.hypothesis?'H: '+clip(x.hypothesis,240):'',
      x.falsifier?'F: '+clip(x.falsifier,240):'',
      'Automatic launch: OFF'
    ].filter(Boolean).join('\n')
  ));
  if(!fields.length)fields.push(safeField('Registered protocols','Noch keine Research-Protokolle.'));
  const reviewTickets=arr(snapshot?.researchReviews?.tickets).slice(0,6).map(x=>
    '**'+clip(x.skillId,64)+'** · '+clip(x.fromStatus,18)+' → '+clip(x.proposedStatus,18)+' · '+pct(x.validationReadinessScore)+' · '+clip(x.evidenceState,52)
  ).join('\n')||'Keine offenen Review-Tickets.';
  fields.push(safeField('MANUAL REVIEW QUEUE',reviewTickets));
  fields.push(safeField('NEXT EXPERIMENTS',nextExperimentLines(snapshot,5)));
  return payload(
    'BIGGJ // EXPERIMENT LAB',
    'Präregistrierte Tests und Validierungsdefizite. Ergebnisse dürfen die Produktion nicht still verändern.',
    fields,
    BIGGJ_DISCORD_OBSERVABILITY_MARKERS.experiments,
    snapshot
  );
}
export function buildBiggjSkillTreePayload(snapshot={}){
  const gaps=arr(snapshot.capabilityGaps).slice(0,7).map(x=>
    '**'+clip(x.rootId,52)+'** · '+pct(x.coverage)+' known · '+pct(x.validatedCoverage)+' validated · U '+pct(x.meanUncertainty)
  ).join('\n')||'Keine Capability-Gaps.';
  const bottlenecks=arr(snapshot.dependencyBottlenecks).slice(0,8).map(x=>
    '**'+clip(x.capabilityId||x.skillId||x.dependencyCapabilityId||'UNKNOWN',70)+'** · '+clip(x.reason||x.relation||x.phase||'dependency blocker',120)
  ).join('\n')||'Keine Dependency-Bottlenecks gemeldet.';
  const roots=arr(snapshot.capabilityRoots).slice(0,22).map(x=>'• '+clip(x.rootId,54)).join('\n');
  return payload(
    'BIGGJ // SKILL TREE',
    'Der Skill Tree entwickelt sich über **Frage → Evidenz → Learning → Testing → Validated → Trusted**. Jede Stufe bleibt auditierbar.',
    [
      safeField('MATURITY',[
        'Index '+pct(snapshot.maturityIndex)+' · Nodes '+fmt(snapshot.totalSkillNodes),
        'Trusted '+fmt(snapshot.trustedSkills)+' · Decaying '+fmt(snapshot.decayingSkills),
        Object.entries(snapshot.skillCounts||{}).map(([k,v])=>k+' '+fmt(v)).join(' · ')
      ].join('\n')),
      safeField('WEAKEST ROOTS',gaps),
      safeField('DEPENDENCY BOTTLENECKS',bottlenecks),
      safeField('ROOT CAPABILITIES',roots)
    ],
    BIGGJ_DISCORD_OBSERVABILITY_MARKERS.skills,
    snapshot
  );
}
export function buildBiggjProgressPayload(snapshot={}){
  const e=snapshot.evidence||{};
  const phases=snapshot?.validation?.phases||{};
  return payload(
    'BIGGJ // PROGRESS SCOREBOARD',
    'Fortschritt wird nicht nur an PnL gemessen, sondern daran, **wie viel prüfbares Wissen aufgebaut wurde**.',
    [
      safeField('MATURITY INDEX',pct(snapshot.maturityIndex)+' · diagnostic, not probability',true),
      safeField('RUNTIME REVISION',fmt(snapshot.runtimeRevision),true),
      safeField('OBSERVED FORECASTS',fmt(snapshot.observedForecasts),true),
      safeField('RESEARCH EVIDENCE',[
        'Total '+fmt(e.evidenceTotal)+' · validation '+fmt(e.validationEvidenceTotal),
        'Forward shadow '+fmt(e.validationForwardShadow)+' · independent episodes '+fmt(e.validationIndependentEpisodes)
      ].join('\n')),
      safeField('RESEARCH MEMORY',[
        'Persistent cases '+fmt(snapshot.persistentCases),
        'Stability events '+fmt(snapshot.stabilityEvents),
        'Unresolved cases '+fmt(snapshot.unresolvedResearchCases),
        'Discovered research skills '+fmt(snapshot.discoveredResearchOnlySkills)
      ].join('\n')),
      safeField('VALIDATION PHASES',Object.entries(phases).map(([k,v])=>k+' '+fmt(v)).join(' · ')||'—'),
      safeField('MANUAL REVIEW QUEUE',[
        'Open '+fmt(snapshot?.researchReviews?.open)+' · blocked '+fmt(snapshot?.researchReviews?.blocked)+' · decisions '+fmt(snapshot?.researchReviews?.decisions),
        'Automatic apply OFF · explicit operator approval required'
      ].join('\n')),
      safeField('ACTIVITY WINDOWS',[
        '24h '+fmt(snapshot?.learningTimeline?.last24h?.total)+' events · '+Object.entries(snapshot?.learningTimeline?.last24h?.byKind||{}).map(([k,v])=>k+' '+fmt(v)).join(' · '),
        '7d '+fmt(snapshot?.learningTimeline?.last7d?.total)+' events · '+Object.entries(snapshot?.learningTimeline?.last7d?.byKind||{}).map(([k,v])=>k+' '+fmt(v)).join(' · '),
        'Activity is not quality; maturity/evidence gates remain separate.'
      ].join('\n')),
      safeField('NEXT HIGH-LEVERAGE WORK',queueLines(snapshot,5))
    ],
    BIGGJ_DISCORD_OBSERVABILITY_MARKERS.progress,
    snapshot
  );
}
export function buildBiggjEvidencePayload(snapshot={}){
  const e=snapshot.evidence||{};
  const coverage=snapshot.researchCoverage||{};
  const rows=arr(e.rows).slice(0,8).map(x=>
    mark(x.status)+' **'+clip(x.title||x.skillId,64)+'** · val '+fmt(x.validationEvidenceTotal)+' · FS '+fmt(x.validationForwardShadow)+' · ep '+fmt(x.validationIndependentEpisodes)
  ).join('\n')||'Noch keine discovered-skill Evidence.';
  const worst=arr(coverage?.worstSymbols).slice(0,6).map(x=>
    '**'+clip(x.symbol,20)+'** '+pct(x.coverage)+' · blocked '+fmt(x.blockedFeatures)
  ).join('\n')||'Keine Coverage-Probleme gemeldet.';
  return payload(
    'BIGGJ // EVIDENCE LEDGER',
    'Evidence wird nach **Point-in-Time, Auditierbarkeit, Science-Guards, Unabhängigkeit und Coverage** getrennt betrachtet.',
    [
      safeField('DISCOVERED-SKILL EVIDENCE',rows),
      safeField('FLEET COVERAGE',[
        'Average '+pct(coverage.averageCoverage),
        'Healthy '+fmt(coverage.healthy)+' · blocked '+fmt(coverage.blocked),
        'Blocked features '+fmt(coverage.blockedFeatures)
      ].join('\n')),
      safeField('WORST COVERAGE',worst),
      safeField('CLAIM/ASSUMPTION RESEARCH',[
        'State '+clip(snapshot?.claimAssumptionResearch?.state,50),
        'Observations '+fmt(snapshot?.claimAssumptionResearch?.observations),
        'Readiness '+(snapshot?.claimAssumptionResearch?.readiness?'READY':'NOT READY')
      ].join('\n'))
    ],
    BIGGJ_DISCORD_OBSERVABILITY_MARKERS.evidence,
    snapshot
  );
}
export function buildBiggjLearningTimelinePayload(snapshot={}){
  const timeline=snapshot?.learningTimeline||{};
  const events=arr(timeline.events).slice(0,22);
  const lines=events.length?events.map(x=>
    when(x.at)+' · **'+clip(x.kind,32)+'** · '+clip(x.title,62)+(x.detail?' · '+clip(x.detail,130):'')
  ).join('\n'):'Noch keine zeitlich zuordenbaren Lern-/Review-Ereignisse im gespeicherten Research-State.';
  const kinds=(window={})=>Object.entries(window?.byKind||{}).map(([k,v])=>k+' '+fmt(v)).join(' · ')||'keine';
  return payload(
    'BIGGJ // LEARNING TIMELINE',
    '**Was hat sich wann verändert?** Diese Seite ordnet gespeicherte Research-Ereignisse chronologisch ein. Aktivität ist nicht automatisch Fortschritt; Qualität bleibt über Evidence-, Validation- und Review-Gates getrennt.',
    [
      safeField('LAST 24 HOURS','Events '+fmt(timeline?.last24h?.total)+' · '+kinds(timeline?.last24h)),
      safeField('LAST 7 DAYS','Events '+fmt(timeline?.last7d?.total)+' · '+kinds(timeline?.last7d)),
      safeField('LATEST EVENTS',lines),
      safeField('INTERPRETATION','PROTOCOL_REGISTERED = Test vorregistriert · ASSUMPTION_REVISION = gespeicherter Revisions-/Stability-Event · REVIEW_READY = evidenzreif für manuelle Prüfung · REVIEW_DECISION = explizite Review-Entscheidung · SKILL_DISCOVERED = neue Research-Capability.')
    ],
    BIGGJ_DISCORD_OBSERVABILITY_MARKERS.timeline,
    snapshot
  );
}

export function buildBiggjReviewQueuePayload(snapshot={}){
  const reviews=snapshot?.researchReviews||{};
  const tickets=arr(reviews.tickets).slice(0,7);
  const fields=tickets.map((x,i)=>safeField(
    '#'+(i+1)+' · '+clip(x.skillId,88),
    [
      '**Transition** '+clip(x.fromStatus,20)+' → '+clip(x.proposedStatus,20)+' · readiness '+pct(x.validationReadinessScore),
      '**Evidence state** '+clip(x.evidenceState,72)+' · phase '+clip(x.validationPhase,52),
      x.createdAt?'**Ticket** '+when(x.createdAt):'',
      '**Post-registration evidence**\n'+diagnosticLines(x.postRegistrationEvidence,4),
      '**Dependency gates**\n'+diagnosticLines(x.dependencyGates,4),
      '**Validation checklist**\n'+diagnosticLines(x.validationChecklist,4)
    ].filter(Boolean).join('\n')
  ));
  if(!fields.length){
    fields.push(safeField('OPEN REVIEWS','Aktuell kein Skill-Transition-Ticket evidenzreif. BIGGJ wartet auf weitere valide Evidence statt eine Stufe zu erzwingen.'));
  }
  const blocked=arr(reviews.blockedItems).slice(0,7).map(x=>
    '• **'+clip(x.skillId,52)+'** · '+clip(x.reason,72)+(arr(x.details).length?' · '+clip(arr(x.details).join(', '),140):'')
  ).join('\n')||'Keine blockierten Review-Protokolle.';
  const recent=arr(reviews.recentDecisions).slice(0,6).map(x=>
    '• '+when(x.decidedAt)+' · **'+clip(x.skillId,48)+'** · '+clip(x.decision,24)+
    (x.fromStatus||x.toStatus?' · '+clip(x.fromStatus,16)+' → '+clip(x.toStatus,16):'')
  ).join('\n')||'Noch keine Review-Entscheidungen.';
  fields.push(
    safeField('BLOCKED',blocked),
    safeField('RECENT DECISIONS',recent),
    safeField('GOVERNANCE',[
      'Open '+fmt(reviews.open)+' · blocked '+fmt(reviews.blocked)+' · decisions '+fmt(reviews.decisions),
      'Queue built '+when(reviews.builtAt),
      'Automatic apply '+(reviews.automaticApply?'ON':'OFF'),
      'Execution '+clip(reviews.execution,30)+' · action '+clip(reviews.action,30),
      'PRIMARY influence '+(reviews.canInfluencePrimary?'ENABLED':'BLOCKED')+' · live execution '+(reviews.canExecuteLive?'ENABLED':'BLOCKED'),
      'TRUSTED transitions stay on the separate promotion path.'
    ].join('\n'))
  );
  return payload(
    'BIGGJ // RESEARCH REVIEW QUEUE',
    '**Der menschlich prüfbare Übergang zwischen Lernen und höherer Skill-Reife.**\nEin Ticket bedeutet: Evidence erfüllt Review-Kriterien — nicht, dass die vorgeschlagene Stufe automatisch wahr oder freigegeben ist.',
    fields,
    BIGGJ_DISCORD_OBSERVABILITY_MARKERS.reviews,
    snapshot
  );
}

export function buildBiggjDecisionTracePayload(snapshot={}){
  const claim=snapshot.claimAssumptionResearch||{};
  const rationale=arr(snapshot.researchQueue).slice(0,5).map(x=>
    '**'+clip(x.title,66)+'** → priority '+pct(x.priority)+' because uncertainty '+pct(x.uncertainty)+
    ', leverage '+pct(x.dependencyLeverage)+(x.testingDependencyReady?'':' and blocked dependencies')
  ).join('\n')||'Keine Research-Priorisierung.';
  const claimReasons=[...arr(claim.readinessReasons),...arr(claim.reasons)].slice(0,8).map(x=>'• '+clip(x,150)).join('\n')||'Keine evaluator reasons.';
  return payload(
    'BIGGJ // DECISION TRACE',
    'Nachvollziehbare **strukturierte Entscheidungsgründe**. Das ist kein versteckter Chain-of-Thought-Stream, sondern auditierbarer State.',
    [
      safeField('WHY THESE RESEARCH ITEMS',rationale),
      safeField('CLAIM/ASSUMPTION DECISION',[
        'State '+clip(claim.state,50),
        'Manual promotion review '+(claim.manualPromotionReviewEligible?'ELIGIBLE':'NOT ELIGIBLE'),
        'Kill review '+(claim.killReviewEligible?'ELIGIBLE':'NOT ELIGIBLE'),
        claimReasons
      ].join('\n')),
      safeField('MANUAL RESEARCH REVIEWS',[
        'Open '+fmt(snapshot?.researchReviews?.open)+' · blocked '+fmt(snapshot?.researchReviews?.blocked),
        ...arr(snapshot?.researchReviews?.tickets).slice(0,5).map(x=>'• '+clip(x.skillId,54)+' '+clip(x.fromStatus,16)+' → '+clip(x.proposedStatus,16)+' · '+clip(x.evidenceState,44))
      ].join('\n')),
      safeField('WHAT BIGGJ WILL NOT DO','Keine automatische Promotion · kein automatischer Kill · keine stillen PRIMARY-Änderungen · keine echten Orders.'),
      safeField('CURRENT NEXT STEP',nextExperimentLines(snapshot,5))
    ],
    BIGGJ_DISCORD_OBSERVABILITY_MARKERS.decisions,
    snapshot
  );
}

export function buildBiggjDiscordObservabilityPayload(view='pulse',snapshot={}){
  const key=String(view||'pulse').toLowerCase();
  if(key==='knowledge')return buildBiggjKnowledgePayload(snapshot);
  if(key==='research')return buildBiggjResearchQueuePayload(snapshot);
  if(key==='hypotheses')return buildBiggjHypothesesPayload(snapshot);
  if(key==='changes')return buildBiggjChangesPayload(snapshot);
  if(key==='experiments')return buildBiggjExperimentsPayload(snapshot);
  if(key==='skills')return buildBiggjSkillTreePayload(snapshot);
  if(key==='reviews')return buildBiggjReviewQueuePayload(snapshot);
  if(key==='timeline')return buildBiggjLearningTimelinePayload(snapshot);
  if(key==='progress')return buildBiggjProgressPayload(snapshot);
  if(key==='evidence')return buildBiggjEvidencePayload(snapshot);
  if(key==='decisions')return buildBiggjDecisionTracePayload(snapshot);
  return buildBiggjBrainPulsePayload(snapshot);
}

export function buildBiggjDiscordObservabilityPanelMap(snapshot={}){
  return [
    {channel:'brain-pulse',marker:BIGGJ_DISCORD_OBSERVABILITY_MARKERS.pulse,payload:buildBiggjBrainPulsePayload(snapshot)},
    {channel:'knowledge',marker:BIGGJ_DISCORD_OBSERVABILITY_MARKERS.knowledge,payload:buildBiggjKnowledgePayload(snapshot)},
    {channel:'research-queue',marker:BIGGJ_DISCORD_OBSERVABILITY_MARKERS.research,payload:buildBiggjResearchQueuePayload(snapshot)},
    {channel:'hypotheses',marker:BIGGJ_DISCORD_OBSERVABILITY_MARKERS.hypotheses,payload:buildBiggjHypothesesPayload(snapshot)},
    {channel:'changes',marker:BIGGJ_DISCORD_OBSERVABILITY_MARKERS.changes,payload:buildBiggjChangesPayload(snapshot)},
    {channel:'experiments',marker:BIGGJ_DISCORD_OBSERVABILITY_MARKERS.experiments,payload:buildBiggjExperimentsPayload(snapshot)},
    {channel:'skill-tree',marker:BIGGJ_DISCORD_OBSERVABILITY_MARKERS.skills,payload:buildBiggjSkillTreePayload(snapshot)},
    {channel:'review-queue',marker:BIGGJ_DISCORD_OBSERVABILITY_MARKERS.reviews,payload:buildBiggjReviewQueuePayload(snapshot)},
    {channel:'learning-timeline',marker:BIGGJ_DISCORD_OBSERVABILITY_MARKERS.timeline,payload:buildBiggjLearningTimelinePayload(snapshot)},
    {channel:'progress',marker:BIGGJ_DISCORD_OBSERVABILITY_MARKERS.progress,payload:buildBiggjProgressPayload(snapshot)},
    {channel:'evidence-ledger',marker:BIGGJ_DISCORD_OBSERVABILITY_MARKERS.evidence,payload:buildBiggjEvidencePayload(snapshot)},
    {channel:'decision-trace',marker:BIGGJ_DISCORD_OBSERVABILITY_MARKERS.decisions,payload:buildBiggjDecisionTracePayload(snapshot)}
  ];
}
