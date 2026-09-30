import { sha256 } from './institutional-kernel.mjs';
import {
  BIGGJ_EPISTEMIC_KERNEL_VERSION,
  verifyEpistemicLedger,
  evaluateTheory,
  planNextTheoryExperiment
} from './biggj-epistemic-kernel.mjs';

export const BIGGJ_MARKET_SCIENCE_DIRECTOR_VERSION='BIGGJ_MARKET_SCIENCE_DIRECTOR_V1';

const finite=(v,f=0)=>Number.isFinite(Number(v))?Number(v):f;
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,finite(v,0)));
const txt=(v,f='')=>{
  const s=String(v??'').trim();
  return s||f;
};
const uniq=xs=>[...new Set((Array.isArray(xs)?xs:[]).map(x=>txt(x)).filter(Boolean))].sort();
const mean=xs=>{
  const values=(Array.isArray(xs)?xs:[]).map(x=>finite(x,NaN)).filter(Number.isFinite);
  return values.length?values.reduce((a,b)=>a+b,0)/values.length:0;
};
const deepFreeze=v=>{
  if(v&&typeof v==='object'&&!Object.isFrozen(v)){
    Object.freeze(v);
    for(const x of Object.values(v)) deepFreeze(x);
  }
  return v;
};
const normalized=s=>txt(s).toLowerCase().replace(/\s+/g,' ');
const coreFingerprint=core=>deepFreeze({...core,fingerprint:sha256(core)});

const STATUS_VALUE=Object.freeze({
  HYPOTHESIS:.10,
  OBSERVED_EFFECT:.30,
  REPLICATED:.55,
  ROBUST:.80,
  PROVISIONAL_LAW:.95,
  BROKEN:0
});

const EXPERIMENT_COST=Object.freeze({
  FAILURE_ANALYSIS:1.2,
  PROSPECTIVE_OBSERVATION:1,
  TEMPORAL_OUT_OF_SAMPLE:1.4,
  INDEPENDENT_SOURCE_REPLICATION:1.8,
  CROSS_MARKET_REPLICATION:1.7,
  CROSS_REGIME_REPLICATION:1.7,
  FORWARD_REPLICATION:1.3,
  CONTRADICTION_RESOLUTION:1.5,
  ADVERSARIAL_FALSIFICATION:1.6
});

function theoryRows(ledger,theoryId){
  return (ledger?.evidence||[]).filter(x=>String(x?.theoryId)===String(theoryId));
}

function contradictionClusters(rows){
  const buckets=new Map();
  for(const row of rows||[]){
    const polarity=String(row?.polarity||'NEUTRAL').toUpperCase();
    if(!['SUPPORT','CONTRA'].includes(polarity)) continue;
    const dims=[
      ['MARKET',String(row?.market||'UNKNOWN').toUpperCase()],
      ['REGIME',String(row?.regime||'UNKNOWN').toUpperCase()],
      ['HORIZON',String(row?.horizon||'UNKNOWN').toUpperCase()]
    ];
    for(const [dimension,value] of dims){
      if(!value||value==='UNKNOWN') continue;
      const key=dimension+':'+value;
      const bucket=buckets.get(key)||{dimension,value,support:0,contra:0,evidenceIds:[]};
      bucket[polarity==='SUPPORT'?'support':'contra']++;
      bucket.evidenceIds.push(String(row.evidenceId));
      buckets.set(key,bucket);
    }
  }
  return [...buckets.values()]
    .filter(x=>x.support>0&&x.contra>0)
    .map(x=>({
      ...x,
      total:x.support+x.contra,
      contradictionRatio:Math.min(x.support,x.contra)/(x.support+x.contra),
      evidenceIds:uniq(x.evidenceIds)
    }))
    .sort((a,b)=>b.contradictionRatio-a.contradictionRatio||b.total-a.total||String(a.dimension+a.value).localeCompare(String(b.dimension+b.value)));
}

function linkedSurprises(ledger,theoryId){
  return (ledger?.surpriseEvents||[])
    .filter(x=>String(x?.theoryId||'')===String(theoryId))
    .sort((a,b)=>finite(b.divergenceScore)-finite(a.divergenceScore)||String(a.surpriseId).localeCompare(String(b.surpriseId)));
}

function surpriseSignal(rows){
  const scores=(rows||[]).map(x=>Math.max(0,finite(x?.divergenceScore)));
  if(!scores.length) return {count:0,maxDivergence:0,meanDivergence:0,normalized:0};
  const maxDivergence=Math.max(...scores);
  const meanDivergence=mean(scores);
  return {
    count:scores.length,
    maxDivergence,
    meanDivergence,
    normalized:clamp((.65*maxDivergence+.35*meanDivergence)/5)
  };
}

function generalizationGap(e){
  const sourceGap=1-clamp(finite(e?.sourceControllers)/2);
  const marketGap=1-clamp(finite(e?.markets)/2);
  const regimeGap=1-clamp(finite(e?.regimes)/2);
  const oosGap=1-clamp(finite(e?.independentOosEpisodes)/3);
  return clamp(mean([sourceGap,marketGap,regimeGap,oosGap]));
}

function replicationGap(e){
  return 1-clamp(finite(e?.independentSupportEpisodes)/8);
}

function contradictionSignal(e,clusters){
  const support=finite(e?.independentSupportEpisodes);
  const contra=finite(e?.independentContraEpisodes);
  const denom=support+contra;
  const episodeConflict=denom?Math.min(1,2*contra/denom):0;
  const clusterConflict=clusters.length?Math.max(...clusters.map(x=>clamp(x.contradictionRatio*2))):0;
  return Math.max(episodeConflict,clusterConflict);
}

function actionCost(type){
  return finite(EXPERIMENT_COST[String(type||'').toUpperCase()],2);
}

function questionForTheory(theory,evaluation,experiment,clusters,surprises){
  if(evaluation.derivedStatus==='BROKEN'){
    return 'Which hidden condition, confounder, or regime boundary caused the falsification of "'+theory.title+'"?';
  }
  if(clusters.length){
    const x=clusters[0];
    return 'Why does "'+theory.title+'" produce conflicting evidence inside '+x.dimension.toLowerCase()+' '+x.value+'?';
  }
  if(surprises.length){
    const variables=uniq(surprises.flatMap(x=>x.candidateMissingVariables||[])).slice(0,4);
    return variables.length
      ?'Can '+variables.join(', ')+' explain the largest prediction surprises around "'+theory.title+'"?'
      :'Which unobserved variable explains the largest prediction surprises around "'+theory.title+'"?';
  }
  return experiment?.purpose
    ?experiment.purpose
    :'What evidence would most efficiently discriminate this theory from its null hypothesis?';
}

function theoryAgendaItem(ledger,theory,{asOf,scientificGate='INSUFFICIENT'}={}){
  const evaluation=evaluateTheory(ledger,theory.theoryId,{asOf,scientificGate});
  const experiment=planNextTheoryExperiment(ledger,theory.theoryId,{asOf,scientificGate});
  const rows=theoryRows(ledger,theory.theoryId);
  const clusters=contradictionClusters(rows);
  const surprises=linkedSurprises(ledger,theory.theoryId);
  const surprise=surpriseSignal(surprises);
  const contradiction=contradictionSignal(evaluation.evidence,clusters);
  const replication=replicationGap(evaluation.evidence);
  const generalization=generalizationGap(evaluation.evidence);
  const broken=evaluation.derivedStatus==='BROKEN'?1:0;
  const statusMaturity=finite(STATUS_VALUE[evaluation.derivedStatus],0);

  const expectedInformationGainProxy=clamp(
    .30*replication+
    .25*generalization+
    .22*contradiction+
    .18*surprise.normalized+
    .05*(1-statusMaturity)
  );
  const falsificationUrgency=clamp(.65*broken+.35*contradiction);
  const scientificLeverage=clamp(
    .45*expectedInformationGainProxy+
    .25*falsificationUrgency+
    .20*surprise.normalized+
    .10*(evaluation.evidence.independentOosEpisodes>0?1:0)
  );
  const computeCostProxy=actionCost(experiment.type);
  const priority=clamp(
    (.72*scientificLeverage+.28*expectedInformationGainProxy)/Math.sqrt(computeCostProxy)
  );

  const question=questionForTheory(theory,evaluation,experiment,clusters,surprises);
  const core={
    questionId:'rq_'+sha256({theoryId:theory.theoryId,question,experimentType:experiment.type}).slice(0,22),
    kind:evaluation.derivedStatus==='BROKEN'
      ?'BROKEN_THEORY'
      :clusters.length
        ?'CONTRADICTION'
        :surprises.length
          ?'SURPRISE'
          :'EVIDENCE_GAP',
    theoryId:theory.theoryId,
    theoryKey:theory.theoryKey,
    title:theory.title,
    question,
    derivedStatus:evaluation.derivedStatus,
    nextExperimentType:experiment.type,
    nextExperimentPurpose:experiment.purpose,
    expectedInformationGainProxy,
    scientificLeverage,
    falsificationUrgency,
    surpriseSignal:surprise.normalized,
    contradictionSignal:contradiction,
    replicationGap:replication,
    generalizationGap:generalization,
    computeCostProxy,
    priority,
    contradictionClusters:clusters.slice(0,5),
    linkedSurpriseIds:surprises.slice(0,10).map(x=>x.surpriseId),
    candidateMissingVariables:uniq(surprises.flatMap(x=>x.candidateMissingVariables||[])),
    evaluationFingerprint:evaluation.fingerprint,
    experimentFingerprint:experiment.fingerprint,
    automaticExperimentLaunchAllowed:false,
    primaryMutationAllowed:false,
    canInfluencePrimary:false,
    canExecuteLive:false,
    semantics:{
      priorityIsHeuristicNotProbability:true,
      informationGainIsProxyNotMeasuredMutualInformation:true,
      surpriseDoesNotProveMissingVariable:true,
      contradictionCreatesResearchQuestionNotTradingSignal:true
    }
  };
  return coreFingerprint(core);
}

function missingVariableRequests(ledger,{asOf}={}){
  const map=new Map();
  for(const surprise of ledger?.surpriseEvents||[]){
    const divergence=Math.max(0,finite(surprise?.divergenceScore));
    for(const variable of uniq(surprise?.candidateMissingVariables)){
      const key=normalized(variable);
      if(!key) continue;
      const row=map.get(key)||{
        variable:txt(variable),
        surpriseIds:[],
        theoryIds:[],
        divergences:[]
      };
      row.surpriseIds.push(String(surprise.surpriseId));
      if(txt(surprise.theoryId)) row.theoryIds.push(String(surprise.theoryId));
      row.divergences.push(divergence);
      map.set(key,row);
    }
  }
  return [...map.values()]
    .map(row=>{
      const count=row.surpriseIds.length;
      const maxDivergence=Math.max(0,...row.divergences);
      const meanDivergence=mean(row.divergences);
      const recurrence=clamp(count/4);
      const severity=clamp((.65*maxDivergence+.35*meanDivergence)/5);
      const priority=clamp(.55*severity+.45*recurrence);
      const question='Does '+row.variable+' explain a recurrent cluster of high-divergence market observations?';
      const core={
        requestId:'dr_'+sha256({variable:normalized(row.variable),surpriseIds:uniq(row.surpriseIds)}).slice(0,22),
        kind:'DATA_REQUEST',
        variable:row.variable,
        question,
        surpriseCount:count,
        surpriseIds:uniq(row.surpriseIds),
        theoryIds:uniq(row.theoryIds),
        maxDivergence,
        meanDivergence,
        priority,
        requestedEvidence:[
          'POINT_IN_TIME_SOURCE',
          'PROVENANCE',
          'LATENCY_OR_AVAILABLE_AT',
          'COVERAGE_BY_MARKET',
          'COVERAGE_BY_REGIME'
        ],
        automaticAcquisitionAllowed:false,
        primaryMutationAllowed:false,
        canInfluencePrimary:false,
        canExecuteLive:false,
        semantics:{
          candidateVariableIsHypothesisNotFact:true,
          priorityIsHeuristicNotProbability:true,
          dataPresenceDoesNotEstablishCausality:true
        },
        asOf
      };
      return coreFingerprint(core);
    })
    .filter(x=>x.surpriseCount>=2||x.maxDivergence>=3)
    .sort((a,b)=>b.priority-a.priority||b.surpriseCount-a.surpriseCount||a.variable.localeCompare(b.variable));
}

function orphanSurpriseQuestions(ledger,{asOf}={}){
  return (ledger?.surpriseEvents||[])
    .filter(x=>!txt(x?.theoryId))
    .map(x=>{
      const vars=uniq(x?.candidateMissingVariables);
      const question=vars.length
        ?'Which mechanism connects '+vars.join(', ')+' to this unexplained market surprise?'
        :'Which missing state variable or mechanism explains this unexplained market surprise?';
      const priority=clamp(Math.max(0,finite(x?.divergenceScore))/5);
      const core={
        questionId:'rq_'+sha256({surpriseId:x.surpriseId,question}).slice(0,22),
        kind:'UNKNOWN_UNKNOWN',
        theoryId:null,
        surpriseId:x.surpriseId,
        question,
        candidateMissingVariables:vars,
        priority,
        expectedInformationGainProxy:priority,
        scientificLeverage:priority,
        nextExperimentType:'UNKNOWN_VARIABLE_SEARCH',
        nextExperimentPurpose:'Search for point-in-time observable variables or mechanisms that reduce this unexplained prediction divergence.',
        computeCostProxy:2,
        automaticExperimentLaunchAllowed:false,
        primaryMutationAllowed:false,
        canInfluencePrimary:false,
        canExecuteLive:false,
        semantics:{
          unknownUnknownIsOperationalLabelNotClaim:true,
          priorityIsHeuristicNotProbability:true,
          candidateVariablesAreHypotheses:true
        },
        asOf
      };
      return coreFingerprint(core);
    })
    .sort((a,b)=>b.priority-a.priority||String(a.surpriseId).localeCompare(String(b.surpriseId)));
}

function competitionSets(ledger,{asOf}={}){
  const groups=new Map();
  for(const theory of ledger?.theories||[]){
    const key=normalized(theory.question);
    const xs=groups.get(key)||[];
    xs.push(theory);
    groups.set(key,xs);
  }
  const out=[];
  for(const theories of groups.values()){
    if(theories.length<2) continue;
    const entries=theories.map(theory=>{
      const e=evaluateTheory(ledger,theory.theoryId,{asOf});
      const support=finite(e.evidence.independentSupportEpisodes);
      const contra=finite(e.evidence.independentContraEpisodes);
      const denom=support+contra;
      const balance=denom?support/denom:0;
      const evidenceBreadth=clamp(mean([
        clamp(e.evidence.sourceControllers/3),
        clamp(e.evidence.markets/3),
        clamp(e.evidence.regimes/3),
        clamp(e.evidence.independentOosEpisodes/5)
      ]));
      const empiricalStrength=clamp(.55*balance+.45*evidenceBreadth);
      return {
        theoryId:theory.theoryId,
        status:e.derivedStatus,
        empiricalStrength,
        independentSupportEpisodes:support,
        independentContraEpisodes:contra,
        independentOosEpisodes:e.evidence.independentOosEpisodes,
        broken:e.derivedStatus==='BROKEN'
      };
    }).sort((a,b)=>b.empiricalStrength-a.empiricalStrength||String(a.theoryId).localeCompare(String(b.theoryId)));
    const core={
      competitionId:'tc_'+sha256({question:normalized(theories[0].question),theoryIds:entries.map(x=>x.theoryId).sort()}).slice(0,22),
      question:theories[0].question,
      entries,
      discriminatingExperimentRequired:true,
      selectedWinnerTheoryId:null,
      automaticWinnerSelectionForbidden:true,
      primaryMutationAllowed:false,
      canInfluencePrimary:false,
      canExecuteLive:false,
      semantics:{
        empiricalStrengthIsHeuristicNotProbability:true,
        rankingDoesNotEstablishTruth:true,
        noWinnerWithoutPreRegisteredDiscriminatingEvidence:true
      }
    };
    out.push(coreFingerprint(core));
  }
  return out.sort((a,b)=>b.entries.length-a.entries.length||a.competitionId.localeCompare(b.competitionId));
}

export function buildBiggjMarketScienceDirector(ledger,{
  asOf=Date.now(),
  limit=12,
  scientificGateByTheory={}
}={}){
  const verification=verifyEpistemicLedger(ledger);
  if(!verification.ok) throw new Error('EPISTEMIC_LEDGER_INVALID:'+verification.reasons.join(','));
  const t=finite(asOf,NaN);
  if(!Number.isFinite(t)) throw new Error('SCIENCE_DIRECTOR_ASOF_INVALID');
  const maxItems=Math.max(1,Math.min(100,Math.floor(finite(limit,12))));

  const theoryItems=(ledger.theories||[]).map(theory=>theoryAgendaItem(ledger,theory,{
    asOf:t,
    scientificGate:scientificGateByTheory?.[theory.theoryId]||'INSUFFICIENT'
  }));
  const unknownItems=orphanSurpriseQuestions(ledger,{asOf:t});
  const agenda=[...theoryItems,...unknownItems]
    .sort((a,b)=>b.priority-a.priority||String(a.questionId).localeCompare(String(b.questionId)))
    .slice(0,maxItems);
  const dataRequests=missingVariableRequests(ledger,{asOf:t}).slice(0,maxItems);
  const competitions=competitionSets(ledger,{asOf:t}).slice(0,maxItems);

  const knowledgeFrontier={
    totalTheories:ledger.theories.length,
    totalEvidence:ledger.evidence.length,
    totalSurprises:ledger.surpriseEvents.length,
    brokenTheories:theoryItems.filter(x=>x.derivedStatus==='BROKEN').length,
    contradictionQuestions:theoryItems.filter(x=>x.kind==='CONTRADICTION').length,
    surpriseQuestions:theoryItems.filter(x=>x.kind==='SURPRISE').length+unknownItems.length,
    evidenceGapQuestions:theoryItems.filter(x=>x.kind==='EVIDENCE_GAP').length,
    recurringMissingVariables:dataRequests.length,
    theoryCompetitions:competitions.length
  };

  const top=agenda[0]||null;
  const core={
    version:BIGGJ_MARKET_SCIENCE_DIRECTOR_VERSION,
    kernelVersion:BIGGJ_EPISTEMIC_KERNEL_VERSION,
    asOf:t,
    knowledgeFrontier,
    agenda,
    dataRequests,
    theoryCompetitions:competitions,
    nextResearchQuestion:top,
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    automaticExperimentLaunchAllowed:false,
    automaticDataAcquisitionAllowed:false,
    automaticTheoryPromotionAllowed:false,
    automaticTheoryKillAllowed:false,
    primaryMutationAllowed:false,
    canInfluencePrimary:false,
    canExecuteLive:false,
    semantics:{
      directorPrioritizesResearchNotTrades:true,
      prioritiesAreHeuristicsNotProbabilities:true,
      questionsDoNotBecomeClaims:true,
      dataRequestsDoNotAuthorizeCollection:true,
      competitionDoesNotSelectTruthByScore:true
    }
  };
  return coreFingerprint(core);
}

export function biggjMarketScienceDirectorSummary(director){
  if(director?.version!==BIGGJ_MARKET_SCIENCE_DIRECTOR_VERSION) throw new Error('SCIENCE_DIRECTOR_INVALID');
  return deepFreeze({
    version:director.version,
    kernelVersion:director.kernelVersion,
    asOf:director.asOf,
    knowledgeFrontier:director.knowledgeFrontier,
    nextResearchQuestion:director.nextResearchQuestion,
    topAgenda:director.agenda.slice(0,5),
    topDataRequests:director.dataRequests.slice(0,5),
    theoryCompetitionCount:director.theoryCompetitions.length,
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    automaticExperimentLaunchAllowed:false,
    primaryMutationAllowed:false,
    canInfluencePrimary:false,
    canExecuteLive:false
  });
}
