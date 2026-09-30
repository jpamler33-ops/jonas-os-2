import { sha256 } from './institutional-kernel.mjs';

export const BIGGJ_EPISTEMIC_KERNEL_VERSION='BIGGJ_EPISTEMIC_KERNEL_V1';
export const BIGGJ_EPISTEMIC_LEDGER_SCHEMA_VERSION=1;

export const THEORY_STATUSES=Object.freeze([
  'SPECULATION',
  'HYPOTHESIS',
  'OBSERVED_EFFECT',
  'REPLICATED',
  'ROBUST',
  'PROVISIONAL_LAW',
  'BROKEN',
  'RETIRED'
]);

export const EVIDENCE_CLASSIFICATIONS=Object.freeze([
  'OBSERVED',
  'INFERRED',
  'MODELLED',
  'ASSUMED'
]);

export const EVIDENCE_KINDS=Object.freeze([
  'REAL',
  'SYNTHETIC',
  'PLACEBO',
  'STRESS_TEST'
]);

export const EVIDENCE_POLARITIES=Object.freeze([
  'SUPPORT',
  'CONTRA',
  'NEUTRAL'
]);

const STATUS_RANK=Object.freeze({
  SPECULATION:0,
  HYPOTHESIS:1,
  OBSERVED_EFFECT:2,
  REPLICATED:3,
  ROBUST:4,
  PROVISIONAL_LAW:5,
  BROKEN:-1,
  RETIRED:-2
});

function finite(v,fallback=null){
  if(v===null||v===undefined||v==='') return fallback;
  const n=Number(v);
  return Number.isFinite(n)?n:fallback;
}
function txt(v,fallback=''){
  const s=String(v??'').trim();
  return s||fallback;
}
function upper(v,fallback=''){
  return txt(v,fallback).toUpperCase();
}
function uniq(xs){
  return [...new Set((Array.isArray(xs)?xs:[]).map(x=>txt(x)).filter(Boolean))].sort();
}
function clone(v){
  return v==null?v:JSON.parse(JSON.stringify(v));
}
function deepFreeze(v){
  if(v&&typeof v==='object'&&!Object.isFrozen(v)){
    Object.freeze(v);
    for(const x of Object.values(v)) deepFreeze(x);
  }
  return v;
}
function canonicalText(v){
  return txt(v).toLowerCase().replace(/\s+/g,' ');
}
function normalizeScope(scope={}){
  return {
    markets:uniq(scope?.markets).map(x=>x.toUpperCase()),
    regimes:uniq(scope?.regimes).map(x=>x.toUpperCase()),
    horizons:uniq(scope?.horizons).map(x=>x.toUpperCase())
  };
}
function ledgerCore(ledger){
  const {fingerprint,...core}=ledger;
  return core;
}
function finalizeLedger(ledger){
  const core=ledgerCore(ledger);
  return deepFreeze({...core,fingerprint:sha256(core)});
}
function theoryKeyOf(input){
  const scope=normalizeScope(input?.scope);
  return sha256({
    question:canonicalText(input?.question),
    hypothesis:canonicalText(input?.hypothesis),
    falsifier:canonicalText(input?.falsifier),
    nullHypothesis:canonicalText(input?.nullHypothesis),
    scope,
    tags:uniq(input?.tags).map(x=>x.toLowerCase())
  });
}
function evidencePitState(row,asOf){
  const observedAt=finite(row?.observedAt);
  const availableAt=finite(row?.availableAt);
  const reasons=[];
  if(observedAt==null) reasons.push('OBSERVED_AT_MISSING');
  if(availableAt==null) reasons.push('AVAILABLE_AT_MISSING');
  if(observedAt!=null&&availableAt!=null&&observedAt>availableAt) reasons.push('OBSERVED_AFTER_AVAILABLE');
  if(availableAt!=null&&availableAt>asOf) reasons.push('FUTURE_EVIDENCE_BLOCKED');
  return {
    safe:reasons.length===0,
    observedAt,
    availableAt,
    reasons
  };
}
function evidenceUsability(row,asOf){
  const pit=evidencePitState(row,asOf);
  const reasons=[...pit.reasons];
  if(upper(row?.classification)!=='OBSERVED') reasons.push('NON_OBSERVED_CLASSIFICATION');
  if(upper(row?.kind)!=='REAL') reasons.push('NON_REAL_EVIDENCE_KIND');
  if(!txt(row?.sourceId)) reasons.push('SOURCE_ID_MISSING');
  if(!uniq(row?.provenanceIds).length) reasons.push('PROVENANCE_MISSING');
  return {
    usable:reasons.length===0,
    pit,
    reasons
  };
}
function ensureTheory(ledger,theoryId){
  const theory=(ledger?.theories||[]).find(x=>String(x.theoryId)===String(theoryId));
  if(!theory) throw new Error('THEORY_NOT_FOUND');
  return theory;
}
function normalizeScienceGate(v){
  const gate=upper(v,'INSUFFICIENT');
  return ['PASS','CAUTION','INSUFFICIENT','ABSTAIN'].includes(gate)?gate:'INSUFFICIENT';
}

export function createEpistemicLedger({asOf=Date.now()}={}){
  const t=finite(asOf);
  if(t==null) throw new Error('EPISTEMIC_LEDGER_ASOF_INVALID');
  return finalizeLedger({
    schemaVersion:BIGGJ_EPISTEMIC_LEDGER_SCHEMA_VERSION,
    version:BIGGJ_EPISTEMIC_KERNEL_VERSION,
    createdAt:t,
    updatedAt:t,
    theories:[],
    evidence:[],
    experiments:[],
    surpriseEvents:[],
    invariants:{
      realityOutranksModels:true,
      predictionIsNotExplanation:true,
      syntheticEvidenceIsNotRealEvidence:true,
      falsifiabilityRequired:true,
      unknownIsValidState:true,
      pointInTimeRequired:true,
      primaryTradingMutationForbidden:true
    },
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canInfluencePrimary:false,
    canExecuteLive:false
  });
}

export function verifyEpistemicLedger(ledger){
  try{
    const reasons=[];
    if(ledger?.version!==BIGGJ_EPISTEMIC_KERNEL_VERSION) reasons.push('VERSION_INVALID');
    if(ledger?.schemaVersion!==BIGGJ_EPISTEMIC_LEDGER_SCHEMA_VERSION) reasons.push('SCHEMA_INVALID');
    if(ledger?.execution!=='SHADOW_ONLY') reasons.push('EXECUTION_MODE_INVALID');
    if(ledger?.action!=='ABSTAIN') reasons.push('ACTION_INVALID');
    if(ledger?.canInfluencePrimary!==false) reasons.push('PRIMARY_INFLUENCE_INVALID');
    if(ledger?.canExecuteLive!==false) reasons.push('LIVE_EXECUTION_INVALID');
    if(!Array.isArray(ledger?.theories)||!Array.isArray(ledger?.evidence)||!Array.isArray(ledger?.experiments)) reasons.push('LEDGER_COLLECTION_INVALID');
    const expected=sha256(ledgerCore(ledger||{}));
    if(ledger?.fingerprint!==expected) reasons.push('FINGERPRINT_MISMATCH');
    return {ok:reasons.length===0,reasons,expectedFingerprint:expected};
  }catch(err){
    return {ok:false,reasons:['LEDGER_INVALID',err instanceof Error?err.message:String(err)]};
  }
}

export function registerTheory(ledger,input,{at=Date.now()}={}){
  const integrity=verifyEpistemicLedger(ledger);
  if(!integrity.ok) throw new Error('EPISTEMIC_LEDGER_INVALID:'+integrity.reasons.join(','));
  const createdAt=finite(at);
  if(createdAt==null) throw new Error('THEORY_CREATED_AT_INVALID');
  const question=txt(input?.question);
  const hypothesis=txt(input?.hypothesis);
  const falsifier=txt(input?.falsifier);
  const nullHypothesis=txt(input?.nullHypothesis);
  if(!question) throw new Error('THEORY_QUESTION_REQUIRED');
  if(!hypothesis) throw new Error('THEORY_HYPOTHESIS_REQUIRED');
  if(!falsifier) throw new Error('THEORY_FALSIFIER_REQUIRED');
  if(!nullHypothesis) throw new Error('THEORY_NULL_HYPOTHESIS_REQUIRED');

  const theoryKey=theoryKeyOf(input);
  const existing=(ledger.theories||[]).find(x=>x.theoryKey===theoryKey);
  if(existing){
    return deepFreeze({
      ledger,
      created:false,
      reason:existing.status==='BROKEN'?'MATCHES_GRAVEYARD_THEORY':'THEORY_ALREADY_EXISTS',
      existingTheoryId:existing.theoryId,
      theory:existing
    });
  }

  const theoryId='th_'+sha256({theoryKey,createdAt}).slice(0,20);
  const theory={
    theoryId,
    theoryKey,
    title:txt(input?.title,'Untitled market hypothesis'),
    question,
    hypothesis,
    falsifier,
    nullHypothesis,
    mechanism:txt(input?.mechanism,'UNKNOWN'),
    scope:normalizeScope(input?.scope),
    tags:uniq(input?.tags),
    parentTheoryIds:uniq(input?.parentTheoryIds),
    supersedesTheoryIds:uniq(input?.supersedesTheoryIds),
    createdAt,
    status:'HYPOTHESIS',
    statusSource:'DECLARATION_ONLY',
    lastEvaluatedAt:null,
    brokenAt:null,
    retirementReason:null,
    semantics:{
      hypothesisIsNotFact:true,
      falsifierDeclared:true,
      nullHypothesisDeclared:true,
      syntheticEvidenceCanOnlyStressTheory:true,
      statusDoesNotAuthorizeTrading:true
    }
  };
  const next=finalizeLedger({
    ...ledgerCore(ledger),
    theories:[...ledger.theories,theory],
    updatedAt:createdAt
  });
  return deepFreeze({ledger:next,created:true,reason:'THEORY_REGISTERED',theory});
}

export function appendTheoryEvidence(ledger,theoryId,input,{at=Date.now()}={}){
  const integrity=verifyEpistemicLedger(ledger);
  if(!integrity.ok) throw new Error('EPISTEMIC_LEDGER_INVALID:'+integrity.reasons.join(','));
  ensureTheory(ledger,theoryId);
  const recordedAt=finite(at);
  if(recordedAt==null) throw new Error('EVIDENCE_RECORDED_AT_INVALID');
  const classification=upper(input?.classification,'OBSERVED');
  const kind=upper(input?.kind,'REAL');
  const polarity=upper(input?.polarity,'NEUTRAL');
  if(!EVIDENCE_CLASSIFICATIONS.includes(classification)) throw new Error('EVIDENCE_CLASSIFICATION_INVALID');
  if(!EVIDENCE_KINDS.includes(kind)) throw new Error('EVIDENCE_KIND_INVALID');
  if(!EVIDENCE_POLARITIES.includes(polarity)) throw new Error('EVIDENCE_POLARITY_INVALID');

  const evidenceId=txt(input?.evidenceId)||
    'ev_'+sha256({
      theoryId:String(theoryId),
      sourceId:txt(input?.sourceId),
      observedAt:finite(input?.observedAt),
      availableAt:finite(input?.availableAt),
      polarity,
      classification,
      kind,
      independenceKey:txt(input?.independenceKey),
      value:input?.value??null
    }).slice(0,22);
  if((ledger.evidence||[]).some(x=>x.evidenceId===evidenceId)){
    return deepFreeze({ledger,created:false,reason:'EVIDENCE_ALREADY_EXISTS',evidenceId});
  }

  const row={
    evidenceId,
    theoryId:String(theoryId),
    classification,
    kind,
    polarity,
    sourceId:txt(input?.sourceId),
    sourceControllerId:txt(input?.sourceControllerId),
    provenanceIds:uniq(input?.provenanceIds),
    independenceKey:txt(input?.independenceKey),
    episodeId:txt(input?.episodeId),
    market:upper(input?.market,'UNKNOWN'),
    regime:upper(input?.regime,'UNKNOWN'),
    horizon:upper(input?.horizon,'UNKNOWN'),
    observedAt:finite(input?.observedAt),
    availableAt:finite(input?.availableAt),
    recordedAt,
    outOfSample:input?.outOfSample===true,
    prospective:input?.prospective===true,
    falsifierHit:input?.falsifierHit===true,
    value:clone(input?.value??null),
    notes:txt(input?.notes),
    semantics:{
      empiricalSupportEligible:classification==='OBSERVED'&&kind==='REAL',
      syntheticCannotCountAsRealEvidence:kind!=='SYNTHETIC'
    }
  };
  const next=finalizeLedger({
    ...ledgerCore(ledger),
    evidence:[...ledger.evidence,row],
    updatedAt:recordedAt
  });
  return deepFreeze({ledger:next,created:true,reason:'EVIDENCE_APPENDED',evidence:row});
}

function evidenceDiagnostics(rows,asOf){
  return rows.map(row=>{
    const usability=evidenceUsability(row,asOf);
    return {
      evidenceId:row.evidenceId,
      classification:row.classification,
      kind:row.kind,
      polarity:row.polarity,
      usableForEmpiricalSupport:usability.usable,
      reasons:usability.reasons
    };
  });
}

export function evaluateTheory(ledger,theoryId,{asOf=Date.now(),scientificGate='INSUFFICIENT'}={}){
  const integrity=verifyEpistemicLedger(ledger);
  if(!integrity.ok) throw new Error('EPISTEMIC_LEDGER_INVALID:'+integrity.reasons.join(','));
  const theory=ensureTheory(ledger,theoryId);
  const t=finite(asOf);
  if(t==null) throw new Error('THEORY_EVALUATION_ASOF_INVALID');
  const rows=(ledger.evidence||[]).filter(x=>x.theoryId===String(theoryId));
  const diagnostics=evidenceDiagnostics(rows,t);
  const usable=rows.filter((row,i)=>diagnostics[i].usableForEmpiricalSupport);
  const support=usable.filter(x=>x.polarity==='SUPPORT');
  const contra=usable.filter(x=>x.polarity==='CONTRA');
  const neutral=usable.filter(x=>x.polarity==='NEUTRAL');

  const independentSupportKeys=uniq(support.map(x=>x.independenceKey));
  const independentContraKeys=uniq(contra.map(x=>x.independenceKey));
  const independentOosKeys=uniq(support.filter(x=>x.outOfSample).map(x=>x.independenceKey));
  const independentProspectiveKeys=uniq(support.filter(x=>x.prospective).map(x=>x.independenceKey));
  const sourceControllers=uniq(support.map(x=>x.sourceControllerId));
  const markets=uniq(support.map(x=>x.market).filter(x=>x&&x!=='UNKNOWN'));
  const regimes=uniq(support.map(x=>x.regime).filter(x=>x&&x!=='UNKNOWN'));
  const horizons=uniq(support.map(x=>x.horizon).filter(x=>x&&x!=='UNKNOWN'));

  const supportEpisodes=independentSupportKeys.length;
  const contraEpisodes=independentContraKeys.length;
  const denominator=supportEpisodes+contraEpisodes;
  const evidenceBalance=denominator?supportEpisodes/denominator:null;
  const falsifierHits=contra.filter(x=>x.falsifierHit===true);
  const contradictionDominance=denominator>=4&&contraEpisodes/denominator>=0.75;
  const broken=falsifierHits.length>0||contradictionDominance;

  let derivedStatus='HYPOTHESIS';
  if(broken) derivedStatus='BROKEN';
  else if(supportEpisodes>=20&&sourceControllers.length>=3&&markets.length>=3&&regimes.length>=3&&independentOosKeys.length>=8&&Number(evidenceBalance)>=0.75) derivedStatus='PROVISIONAL_LAW';
  else if(supportEpisodes>=8&&sourceControllers.length>=2&&markets.length>=2&&regimes.length>=2&&independentOosKeys.length>=3&&Number(evidenceBalance)>=0.70) derivedStatus='ROBUST';
  else if(supportEpisodes>=4&&sourceControllers.length>=2&&markets.length>=2&&independentOosKeys.length>=1&&Number(evidenceBalance)>=0.65) derivedStatus='REPLICATED';
  else if(supportEpisodes>=2&&Number(evidenceBalance)>=0.60) derivedStatus='OBSERVED_EFFECT';

  const gate=normalizeScienceGate(scientificGate);
  const bridgeEligible=
    ['ROBUST','PROVISIONAL_LAW'].includes(derivedStatus)&&
    gate==='PASS'&&
    !broken&&
    independentOosKeys.length>=3;

  const invalidEvidence=diagnostics.filter(x=>!x.usableForEmpiricalSupport);
  const syntheticRows=rows.filter(x=>x.kind==='SYNTHETIC');
  const core={
    version:BIGGJ_EPISTEMIC_KERNEL_VERSION,
    asOf:t,
    theoryId:theory.theoryId,
    theoryKey:theory.theoryKey,
    declaredStatus:theory.status,
    derivedStatus,
    statusRank:STATUS_RANK[derivedStatus],
    evidence:{
      totalRows:rows.length,
      empiricallyUsableRows:usable.length,
      supportRows:support.length,
      contraRows:contra.length,
      neutralRows:neutral.length,
      independentSupportEpisodes:supportEpisodes,
      independentContraEpisodes:contraEpisodes,
      independentOosEpisodes:independentOosKeys.length,
      independentProspectiveEpisodes:independentProspectiveKeys.length,
      sourceControllers:sourceControllers.length,
      markets:markets.length,
      regimes:regimes.length,
      horizons:horizons.length,
      syntheticRows:syntheticRows.length,
      invalidRows:invalidEvidence.length,
      evidenceBalance
    },
    dimensions:{
      sourceControllers,
      markets,
      regimes,
      horizons,
      independentSupportKeys,
      independentContraKeys,
      independentOosKeys
    },
    falsification:{
      falsifierDeclared:Boolean(txt(theory.falsifier)),
      nullHypothesisDeclared:Boolean(txt(theory.nullHypothesis)),
      falsifierHits:falsifierHits.map(x=>x.evidenceId),
      contradictionDominance,
      broken
    },
    scientificGate:gate,
    researchBridgeEligible:bridgeEligible,
    tradingBridgeEligible:bridgeEligible,
    canInfluencePrimary:false,
    automaticPrimaryPromotionAllowed:false,
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecuteLive:false,
    diagnostics,
    semantics:{
      evidenceBalanceIsNotProbability:true,
      repeatedRowsDoNotCreateIndependentReplication:true,
      sourceIndependenceIsConservativeMetadataNotProof:true,
      syntheticRowsExcludedFromEmpiricalSupport:true,
      futureRowsExcludedFromEmpiricalSupport:true,
      robustnessDoesNotProveCausality:true,
      tradingBridgeEligibilityStillRequiresExternalPromotionReview:true
    }
  };
  return deepFreeze({...core,fingerprint:sha256(core)});
}

export function planNextTheoryExperiment(ledger,theoryId,{asOf=Date.now(),scientificGate='INSUFFICIENT'}={}){
  const evaluation=evaluateTheory(ledger,theoryId,{asOf,scientificGate});
  const theory=ensureTheory(ledger,theoryId);
  const e=evaluation.evidence;
  let type='ADVERSARIAL_FALSIFICATION';
  let purpose='Try to break the theory under hostile but point-in-time-valid conditions.';

  if(evaluation.derivedStatus==='BROKEN'){
    type='FAILURE_ANALYSIS';
    purpose='Explain the falsifier hit or contradiction cluster before any replacement theory is trusted.';
  }else if(e.independentSupportEpisodes<2){
    type='PROSPECTIVE_OBSERVATION';
    purpose='Collect genuinely independent point-in-time observations without changing the hypothesis.';
  }else if(e.independentOosEpisodes<1){
    type='TEMPORAL_OUT_OF_SAMPLE';
    purpose='Test the frozen hypothesis on data that became available only after theory declaration.';
  }else if(e.sourceControllers<2){
    type='INDEPENDENT_SOURCE_REPLICATION';
    purpose='Replicate with evidence controlled by a different source lineage.';
  }else if(e.markets<2){
    type='CROSS_MARKET_REPLICATION';
    purpose='Test whether the mechanism transports to a different market.';
  }else if(e.regimes<2){
    type='CROSS_REGIME_REPLICATION';
    purpose='Test whether the mechanism survives a materially different regime.';
  }else if(e.independentOosEpisodes<3){
    type='FORWARD_REPLICATION';
    purpose='Accumulate additional independent out-of-sample evidence.';
  }else if(e.evidenceBalance!=null&&e.evidenceBalance<0.70){
    type='CONTRADICTION_RESOLUTION';
    purpose='Isolate the variable or regime that separates supporting from contradicting observations.';
  }

  const plannedAt=finite(asOf);
  const experimentId='xp_'+sha256({theoryId:String(theoryId),type,plannedAt,evaluationFingerprint:evaluation.fingerprint}).slice(0,20);
  const core={
    experimentId,
    theoryId:String(theoryId),
    theoryKey:theory.theoryKey,
    type,
    purpose,
    plannedAt,
    frozenHypothesis:theory.hypothesis,
    frozenFalsifier:theory.falsifier,
    nullHypothesis:theory.nullHypothesis,
    requiredControls:[
      'POINT_IN_TIME_BOUNDARY',
      'NULL_MODEL',
      'TIME_SHIFT_PLACEBO',
      'LABEL_OR_DIRECTION_SHUFFLE',
      'FEATURE_ABLATION',
      'SOURCE_HOLDOUT',
      'REGIME_HOLDOUT',
      'WINNER_REMOVAL'
    ],
    requiredOutputs:[
      'SUPPORTING_EVIDENCE',
      'CONTRADICTING_EVIDENCE',
      'INVALID_OR_LEAKED_EVIDENCE',
      'PROVENANCE',
      'INDEPENDENCE_KEY',
      'WHAT_WOULD_CHANGE_THE_CONCLUSION'
    ],
    syntheticWorldsAllowed:true,
    syntheticWorldsCountAsEvidence:false,
    automaticLaunchAllowed:false,
    automaticPrimaryMutationAllowed:false,
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canInfluencePrimary:false,
    canExecuteLive:false
  };
  return deepFreeze({...core,fingerprint:sha256(core)});
}

export function appendExperimentPlan(ledger,plan,{at=Date.now()}={}){
  const integrity=verifyEpistemicLedger(ledger);
  if(!integrity.ok) throw new Error('EPISTEMIC_LEDGER_INVALID:'+integrity.reasons.join(','));
  ensureTheory(ledger,plan?.theoryId);
  if(!txt(plan?.experimentId)) throw new Error('EXPERIMENT_ID_REQUIRED');
  if((ledger.experiments||[]).some(x=>x.experimentId===plan.experimentId)){
    return deepFreeze({ledger,created:false,reason:'EXPERIMENT_ALREADY_EXISTS',experimentId:plan.experimentId});
  }
  const recordedAt=finite(at);
  const row={...clone(plan),recordedAt};
  const next=finalizeLedger({
    ...ledgerCore(ledger),
    experiments:[...ledger.experiments,row],
    updatedAt:recordedAt
  });
  return deepFreeze({ledger:next,created:true,reason:'EXPERIMENT_APPENDED',experiment:row});
}

export function appendSurpriseEvent(ledger,input,{at=Date.now()}={}){
  const integrity=verifyEpistemicLedger(ledger);
  if(!integrity.ok) throw new Error('EPISTEMIC_LEDGER_INVALID:'+integrity.reasons.join(','));
  const recordedAt=finite(at);
  const theoryId=txt(input?.theoryId);
  if(theoryId) ensureTheory(ledger,theoryId);
  const divergence=finite(input?.divergenceScore);
  if(divergence==null||divergence<0) throw new Error('SURPRISE_DIVERGENCE_INVALID');
  const surpriseId='sp_'+sha256({
    theoryId,
    observedAt:finite(input?.observedAt),
    availableAt:finite(input?.availableAt),
    divergence,
    expected:input?.expected??null,
    observed:input?.observed??null
  }).slice(0,20);
  if((ledger.surpriseEvents||[]).some(x=>x.surpriseId===surpriseId)){
    return deepFreeze({ledger,created:false,reason:'SURPRISE_ALREADY_EXISTS',surpriseId});
  }
  const row={
    surpriseId,
    theoryId:theoryId||null,
    divergenceScore:divergence,
    expected:clone(input?.expected??null),
    observed:clone(input?.observed??null),
    observedAt:finite(input?.observedAt),
    availableAt:finite(input?.availableAt),
    candidateMissingVariables:uniq(input?.candidateMissingVariables),
    notes:txt(input?.notes),
    recordedAt
  };
  const next=finalizeLedger({
    ...ledgerCore(ledger),
    surpriseEvents:[...ledger.surpriseEvents,row],
    updatedAt:recordedAt
  });
  return deepFreeze({ledger:next,created:true,reason:'SURPRISE_APPENDED',surprise:row});
}

export function theoryGraveyard(ledger,{asOf=Date.now()}={}){
  const rows=(ledger?.theories||[]).map(theory=>{
    const evaluation=evaluateTheory(ledger,theory.theoryId,{asOf});
    return {theory,evaluation};
  }).filter(x=>x.theory.status==='BROKEN'||x.evaluation.derivedStatus==='BROKEN');
  return deepFreeze(rows.map(({theory,evaluation})=>({
    theoryId:theory.theoryId,
    theoryKey:theory.theoryKey,
    title:theory.title,
    hypothesis:theory.hypothesis,
    falsifier:theory.falsifier,
    derivedStatus:evaluation.derivedStatus,
    falsifierHits:evaluation.falsification.falsifierHits,
    independentContraEpisodes:evaluation.evidence.independentContraEpisodes
  })));
}

export function epistemicKernelSnapshot(ledger,{asOf=Date.now()}={}){
  const integrity=verifyEpistemicLedger(ledger);
  if(!integrity.ok) throw new Error('EPISTEMIC_LEDGER_INVALID:'+integrity.reasons.join(','));
  const evaluations=(ledger.theories||[]).map(x=>evaluateTheory(ledger,x.theoryId,{asOf}));
  const counts=Object.fromEntries(THEORY_STATUSES.map(s=>[s,0]));
  for(const x of evaluations) counts[x.derivedStatus]=(counts[x.derivedStatus]||0)+1;
  const core={
    version:BIGGJ_EPISTEMIC_KERNEL_VERSION,
    asOf:finite(asOf),
    theoryCount:evaluations.length,
    evidenceCount:ledger.evidence.length,
    experimentCount:ledger.experiments.length,
    surpriseCount:ledger.surpriseEvents.length,
    derivedStatusCounts:counts,
    robustTheoryCount:evaluations.filter(x=>['ROBUST','PROVISIONAL_LAW'].includes(x.derivedStatus)).length,
    brokenTheoryCount:evaluations.filter(x=>x.derivedStatus==='BROKEN').length,
    tradingBridgeEligibleCount:evaluations.filter(x=>x.tradingBridgeEligible).length,
    canInfluencePrimary:false,
    automaticPrimaryPromotionAllowed:false,
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecuteLive:false
  };
  return deepFreeze({...core,fingerprint:sha256(core)});
}
