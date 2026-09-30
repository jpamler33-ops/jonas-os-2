import { sha256 } from './institutional-kernel.mjs';
import { verifyForecastClaimAssumptionShadowObservation } from './forecast-claim-assumption-sidecar.mjs';

export const CLAIM_ASSUMPTION_RESEARCH_EVALUATOR_VERSION='TCX_CLAIM_ASSUMPTION_RESEARCH_EVALUATOR_V1';

export const DEFAULT_CLAIM_ASSUMPTION_RESEARCH_EVALUATION_CONFIG=Object.freeze({
  minObservations:200,
  minPrimaryFailures:40,
  minChallengerAlerts:20,
  minChallengerNonAlerts:20,
  minCustomDeclarationObservations:30,
  minConclusiveObservations:800,
  confidenceLevel:.95,
  alpha:.05
});

const deepFreeze=value=>{
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    Object.freeze(value);
    for(const v of Object.values(value)) deepFreeze(v);
  }
  return value;
};
const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));
const finiteOrNull=v=>Number.isFinite(Number(v))?Number(v):null;
const mean=xs=>{
  const ys=(xs||[]).map(Number).filter(Number.isFinite);
  return ys.length?ys.reduce((a,b)=>a+b,0)/ys.length:null;
};
const median=xs=>{
  const ys=(xs||[]).map(Number).filter(Number.isFinite).sort((a,b)=>a-b);
  if(!ys.length) return null;
  const m=Math.floor(ys.length/2);
  return ys.length%2?ys[m]:(ys[m-1]+ys[m])/2;
};
const safeRate=(num,den)=>den>0?num/den:null;
const unique=xs=>[...new Set((xs||[]).map(String))];

function configSnapshot(input={}){
  const d=DEFAULT_CLAIM_ASSUMPTION_RESEARCH_EVALUATION_CONFIG;
  return Object.freeze({
    minObservations:Math.max(20,Math.floor(Number(input.minObservations??d.minObservations))),
    minPrimaryFailures:Math.max(10,Math.floor(Number(input.minPrimaryFailures??d.minPrimaryFailures))),
    minChallengerAlerts:Math.max(5,Math.floor(Number(input.minChallengerAlerts??d.minChallengerAlerts))),
    minChallengerNonAlerts:Math.max(5,Math.floor(Number(input.minChallengerNonAlerts??d.minChallengerNonAlerts))),
    minCustomDeclarationObservations:Math.max(0,Math.floor(Number(input.minCustomDeclarationObservations??d.minCustomDeclarationObservations))),
    minConclusiveObservations:Math.max(100,Math.floor(Number(input.minConclusiveObservations??d.minConclusiveObservations))),
    confidenceLevel:.95,
    alpha:.05
  });
}

function wilson95(successes,total){
  if(!(total>0)) return {rate:null,low:null,high:null,count:0,total:0};
  const p=successes/total;
  const z=1.959963984540054;
  const z2=z*z;
  const den=1+z2/total;
  const center=(p+z2/(2*total))/den;
  const margin=z*Math.sqrt((p*(1-p)+z2/(4*total))/total)/den;
  return {
    rate:p,
    low:Math.max(0,center-margin),
    high:Math.min(1,center+margin),
    count:successes,
    total
  };
}

function logAddExp(a,b){
  if(a===-Infinity) return b;
  if(b===-Infinity) return a;
  const m=Math.max(a,b);
  return m+Math.log(Math.exp(a-m)+Math.exp(b-m));
}

function exactTwoSidedMcNemar(challengerOnly,baselineOnly){
  const b=Math.max(0,Math.floor(Number(challengerOnly)||0));
  const c=Math.max(0,Math.floor(Number(baselineOnly)||0));
  const n=b+c;
  if(n===0) return {discordant:0,challengerOnly:b,baselineOnly:c,pValue:1,method:'EXACT_BINOMIAL_MCNEMAR'};
  const k=Math.min(b,c);
  let lp=-n*Math.log(2);
  let logCdf=-Infinity;
  for(let i=0;i<=k;i++){
    if(i>0) lp+=Math.log(n-i+1)-Math.log(i);
    logCdf=logAddExp(logCdf,lp);
  }
  return {
    discordant:n,
    challengerOnly:b,
    baselineOnly:c,
    pValue:Math.min(1,2*Math.exp(logCdf)),
    method:'EXACT_BINOMIAL_MCNEMAR'
  };
}

function challengerAlert(row){
  return Number(row?.issuanceAuditState?.defectCount||0)>0||
    Number(row?.issuanceAuditState?.affectedRequiredClaimCount||0)>0||
    String(row?.issuanceAuditState?.graphGate??'')==='AUDIT_DEFECTS_PRESENT';
}

function baselineAlert(row){
  return row?.baselineAuditState?.alert===true;
}

function customDeclarationCount(row){
  return Math.max(0,Math.floor(Number(row?.declarationCoverage?.customDeclarationCount)||0));
}

function primaryFailure(row){
  return row?.evaluationMetrics?.topCorrect===false;
}
function primarySuccess(row){
  return row?.evaluationMetrics?.topCorrect===true;
}
function intervalFailure(row){
  return row?.evaluationMetrics?.intervalMiss===true;
}
function intervalSuccess(row){
  return row?.evaluationMetrics?.intervalMiss===false;
}

function pairedEndpoint(rows,{failure,success,label}){
  const evaluable=rows.filter(x=>failure(x)||success(x));
  const failures=evaluable.filter(failure);
  const nonFailures=evaluable.filter(success);

  const counts=(cohort)=>{
    let both=0,challengerOnly=0,baselineOnly=0,neither=0;
    for(const row of cohort){
      const ca=challengerAlert(row),ba=baselineAlert(row);
      if(ca&&ba) both++;
      else if(ca) challengerOnly++;
      else if(ba) baselineOnly++;
      else neither++;
    }
    return {both,challengerOnly,baselineOnly,neither,total:cohort.length};
  };

  const failurePairs=counts(failures);
  const nonFailurePairs=counts(nonFailures);
  const challengerAlertCount=evaluable.filter(challengerAlert).length;
  const baselineAlertCount=evaluable.filter(baselineAlert).length;
  const challengerFailureAlerts=failures.filter(challengerAlert).length;
  const baselineFailureAlerts=failures.filter(baselineAlert).length;
  const challengerFalseAlerts=nonFailures.filter(challengerAlert).length;
  const baselineFalseAlerts=nonFailures.filter(baselineAlert).length;

  return {
    endpoint:label,
    evaluable:evaluable.length,
    failures:failures.length,
    nonFailures:nonFailures.length,
    challenger:{
      alertCount:challengerAlertCount,
      alertRate:wilson95(challengerAlertCount,evaluable.length),
      recall:wilson95(challengerFailureAlerts,failures.length),
      precision:wilson95(
        evaluable.filter(x=>challengerAlert(x)&&failure(x)).length,
        challengerAlertCount
      ),
      falsePositiveRate:wilson95(challengerFalseAlerts,nonFailures.length)
    },
    baseline:{
      alertCount:baselineAlertCount,
      alertRate:wilson95(baselineAlertCount,evaluable.length),
      recall:wilson95(baselineFailureAlerts,failures.length),
      precision:wilson95(
        evaluable.filter(x=>baselineAlert(x)&&failure(x)).length,
        baselineAlertCount
      ),
      falsePositiveRate:wilson95(baselineFalseAlerts,nonFailures.length)
    },
    pairedFailureDetection:{
      ...failurePairs,
      recallDifference:safeRate(challengerFailureAlerts,failures.length)==null||safeRate(baselineFailureAlerts,failures.length)==null
        ?null
        :safeRate(challengerFailureAlerts,failures.length)-safeRate(baselineFailureAlerts,failures.length),
      test:exactTwoSidedMcNemar(failurePairs.challengerOnly,failurePairs.baselineOnly)
    },
    pairedFalseAlerts:{
      ...nonFailurePairs,
      falsePositiveRateDifference:safeRate(challengerFalseAlerts,nonFailures.length)==null||safeRate(baselineFalseAlerts,nonFailures.length)==null
        ?null
        :safeRate(challengerFalseAlerts,nonFailures.length)-safeRate(baselineFalseAlerts,nonFailures.length),
      test:exactTwoSidedMcNemar(nonFailurePairs.challengerOnly,nonFailurePairs.baselineOnly)
    }
  };
}

function continuousErrorSummary(rows){
  const grouped=flag=>rows.filter(x=>challengerAlert(x)===flag);
  const summary=xs=>({
    count:xs.length,
    brierMean:mean(xs.map(x=>x?.evaluationMetrics?.brier)),
    logLossMean:mean(xs.map(x=>x?.evaluationMetrics?.logLoss)),
    absoluteReturnErrorMean:mean(xs.map(x=>x?.evaluationMetrics?.absoluteReturnError))
  });
  const alert=summary(grouped(true));
  const noAlert=summary(grouped(false));
  return {
    all:summary(rows),
    challengerAlert:alert,
    challengerNoAlert:noAlert,
    differences:{
      brierMean:alert.brierMean==null||noAlert.brierMean==null?null:alert.brierMean-noAlert.brierMean,
      logLossMean:alert.logLossMean==null||noAlert.logLossMean==null?null:alert.logLossMean-noAlert.logLossMean,
      absoluteReturnErrorMean:alert.absoluteReturnErrorMean==null||noAlert.absoluteReturnErrorMean==null
        ?null
        :alert.absoluteReturnErrorMean-noAlert.absoluteReturnErrorMean
    },
    interpretation:'DESCRIPTIVE_ASSOCIATION_ONLY_NOT_CAUSAL'
  };
}

function overheadSummary(rows){
  const ratio=row=>{
    const trace=finiteOrNull(row?.overhead?.traceBytes);
    const sidecar=finiteOrNull(row?.overhead?.sidecarBytes);
    return trace!=null&&trace>0&&sidecar!=null?sidecar/trace:null;
  };
  return {
    graphNodesMean:mean(rows.map(x=>x?.overhead?.graphNodes)),
    graphEdgesMean:mean(rows.map(x=>x?.overhead?.graphEdges)),
    graphBytesMean:mean(rows.map(x=>x?.overhead?.graphBytes)),
    traceBytesMean:mean(rows.map(x=>x?.overhead?.traceBytes)),
    sidecarBytesMean:mean(rows.map(x=>x?.overhead?.sidecarBytes)),
    sidecarToTraceByteRatioMean:mean(rows.map(ratio)),
    interpretation:'SERIALIZED_RESEARCH_ARTIFACT_OVERHEAD_NOT_RUNTIME_CPU_COST'
  };
}

function thesisAssumptionBreakdown(rows){
  const ids=unique(rows.flatMap(row=>
    Array.isArray(row?.issuanceAuditState?.thesisAssumptionIds)
      ?row.issuanceAuditState.thesisAssumptionIds
      :[]
  )).sort();

  return ids.map(assumptionId=>{
    const declared=rows.filter(row=>
      Array.isArray(row?.issuanceAuditState?.thesisAssumptionIds)&&
      row.issuanceAuditState.thesisAssumptionIds.includes(assumptionId)
    );
    const unsupported=declared.filter(row=>
      Array.isArray(row?.issuanceAuditState?.thesisUnsupportedAssumptionIds)&&
      row.issuanceAuditState.thesisUnsupportedAssumptionIds.includes(assumptionId)
    );
    const supported=declared.filter(row=>!unsupported.includes(row));
    const unsupportedFailures=unsupported.filter(primaryFailure).length;
    const supportedFailures=supported.filter(primaryFailure).length;
    const unsupportedMisses=unsupported.filter(intervalFailure).length;
    const supportedMisses=supported.filter(intervalFailure).length;
    const unsupportedFailureRate=safeRate(unsupportedFailures,unsupported.length);
    const supportedFailureRate=safeRate(supportedFailures,supported.length);
    const unsupportedIntervalMissRate=safeRate(unsupportedMisses,unsupported.length);
    const supportedIntervalMissRate=safeRate(supportedMisses,supported.length);

    return {
      assumptionId,
      declaredObservations:declared.length,
      unsupportedObservations:unsupported.length,
      supportedObservations:supported.length,
      directionFailureWhenUnsupported:wilson95(unsupportedFailures,unsupported.length),
      directionFailureWhenSupported:wilson95(supportedFailures,supported.length),
      directionFailureRateDifference:
        unsupportedFailureRate==null||supportedFailureRate==null
          ?null
          :unsupportedFailureRate-supportedFailureRate,
      intervalMissWhenUnsupported:wilson95(unsupportedMisses,unsupported.length),
      intervalMissWhenSupported:wilson95(supportedMisses,supported.length),
      intervalMissRateDifference:
        unsupportedIntervalMissRate==null||supportedIntervalMissRate==null
          ?null
          :unsupportedIntervalMissRate-supportedIntervalMissRate,
      associationReady:unsupported.length>=20&&supported.length>=20,
      interpretation:'PROSPECTIVE_ASSOCIATION_ONLY_NOT_ASSUMPTION_TRUTH_OR_CAUSATION'
    };
  });
}

function preOutcomeRevisionSummary(rows){
  const withState=rows.filter(x=>x?.preOutcomeThesisRevisionState!=null);
  const warning=withState.filter(x=>x.preOutcomeThesisRevisionState?.warningAvailableBeforeMaturity===true);
  const failures=withState.filter(primaryFailure);
  const successes=withState.filter(primarySuccess);
  const failureWarnings=failures.filter(x=>x.preOutcomeThesisRevisionState?.warningAvailableBeforeMaturity===true);
  const successWarnings=successes.filter(x=>x.preOutcomeThesisRevisionState?.warningAvailableBeforeMaturity===true);
  const invalidated=withState.filter(x=>x.preOutcomeThesisRevisionState?.forecastInvalidatedBeforeMaturity===true);
  const leads=warning.map(x=>x.preOutcomeThesisRevisionState?.warningLeadMs).map(finiteOrNull).filter(x=>x!=null);
  return {
    observationsWithRevisionState:withState.length,
    observationsWithoutRevisionState:rows.length-withState.length,
    warningsBeforeMaturity:warning.length,
    warningRate:wilson95(warning.length,withState.length),
    primaryFailures:failures.length,
    failuresWithPriorWarning:failureWarnings.length,
    failureCaptureRate:wilson95(failureWarnings.length,failures.length),
    primarySuccesses:successes.length,
    successesWithPriorWarning:successWarnings.length,
    falseWarningRate:wilson95(successWarnings.length,successes.length),
    forecastInvalidatedBeforeMaturity:invalidated.length,
    medianWarningLeadMs:median(leads),
    meanWarningLeadMs:mean(leads),
    interpretation:'PROSPECTIVE_PRE_OUTCOME_WARNING_ASSOCIATION_NOT_CAUSAL_OR_COUNTERFACTUAL_PROOF'
  };
}

function preOutcomeStaleAssumptionBreakdown(rows){
  const ids=unique(rows.flatMap(row=>
    Array.isArray(row?.issuanceAuditState?.thesisAssumptionIds)
      ?row.issuanceAuditState.thesisAssumptionIds
      :[]
  )).sort();

  return ids.map(assumptionId=>{
    const declared=rows.filter(row=>
      Array.isArray(row?.issuanceAuditState?.thesisAssumptionIds)&&
      row.issuanceAuditState.thesisAssumptionIds.includes(assumptionId)&&
      row?.preOutcomeThesisRevisionState!=null
    );
    const stale=declared.filter(row=>
      Array.isArray(row?.preOutcomeThesisRevisionState?.everStaleAssumptionIdsBeforeMaturity)&&
      row.preOutcomeThesisRevisionState.everStaleAssumptionIdsBeforeMaturity.includes(assumptionId)
    );
    const notStale=declared.filter(row=>!stale.includes(row));
    const staleFailures=stale.filter(primaryFailure).length;
    const stableFailures=notStale.filter(primaryFailure).length;
    const staleMisses=stale.filter(intervalFailure).length;
    const stableMisses=notStale.filter(intervalFailure).length;
    const staleFailureRate=safeRate(staleFailures,stale.length);
    const stableFailureRate=safeRate(stableFailures,notStale.length);
    const staleIntervalRate=safeRate(staleMisses,stale.length);
    const stableIntervalRate=safeRate(stableMisses,notStale.length);
    return {
      assumptionId,
      observations:declared.length,
      staleBeforeMaturity:stale.length,
      neverStaleBeforeMaturity:notStale.length,
      directionFailureWhenStale:wilson95(staleFailures,stale.length),
      directionFailureWhenNotStale:wilson95(stableFailures,notStale.length),
      directionFailureRateDifference:
        staleFailureRate==null||stableFailureRate==null?null:staleFailureRate-stableFailureRate,
      intervalMissWhenStale:wilson95(staleMisses,stale.length),
      intervalMissWhenNotStale:wilson95(stableMisses,notStale.length),
      intervalMissRateDifference:
        staleIntervalRate==null||stableIntervalRate==null?null:staleIntervalRate-stableIntervalRate,
      associationReady:stale.length>=20&&notStale.length>=20,
      interpretation:'PROSPECTIVE_STALENESS_ASSOCIATION_ONLY_NOT_CAUSAL_PROOF'
    };
  });
}

function horizonBreakdown(rows){
  const ids=[...new Set(rows.map(x=>String(x?.horizonId??'UNKNOWN')))].sort();
  return ids.map(horizonId=>{
    const cohort=rows.filter(x=>String(x?.horizonId??'UNKNOWN')===horizonId);
    return {
      horizonId,
      observations:cohort.length,
      customDeclarationObservations:cohort.filter(x=>customDeclarationCount(x)>0).length,
      challengerAlerts:cohort.filter(challengerAlert).length,
      baselineAlerts:cohort.filter(baselineAlert).length,
      direction:pairedEndpoint(cohort,{failure:primaryFailure,success:primarySuccess,label:'DIRECTION_TOP_ERROR'})
    };
  });
}

function readiness(rows,primary,cfg){
  const custom=rows.filter(x=>customDeclarationCount(x)>0).length;
  const challengerAlerts=rows.filter(challengerAlert).length;
  const challengerNonAlerts=rows.length-challengerAlerts;
  const reasons=[];
  if(rows.length<cfg.minObservations) reasons.push('MIN_OBSERVATIONS_NOT_MET');
  if(primary.failures<cfg.minPrimaryFailures) reasons.push('MIN_PRIMARY_FAILURES_NOT_MET');
  if(challengerAlerts<cfg.minChallengerAlerts) reasons.push('MIN_CHALLENGER_ALERTS_NOT_MET');
  if(challengerNonAlerts<cfg.minChallengerNonAlerts) reasons.push('MIN_CHALLENGER_NON_ALERTS_NOT_MET');
  if(custom<cfg.minCustomDeclarationObservations) reasons.push('MIN_CUSTOM_DECLARATION_COVERAGE_NOT_MET');
  return {
    ready:reasons.length===0,
    reasons,
    observations:rows.length,
    primaryFailures:primary.failures,
    challengerAlerts,
    challengerNonAlerts,
    customDeclarationObservations:custom,
    customDeclarationCoverage:safeRate(custom,rows.length)
  };
}

function researchConclusion({integrityBlocked,readinessState,primary,rows,cfg}){
  if(integrityBlocked){
    return {
      state:'DATA_INTEGRITY_BLOCKED',
      reasons:['INVALID_SHADOW_OBSERVATIONS_PRESENT'],
      killReviewEligible:false,
      manualPromotionReviewEligible:false
    };
  }
  if(!readinessState.ready){
    const noVariation=readinessState.challengerAlerts===0||readinessState.challengerNonAlerts===0;
    return {
      state:noVariation?'COLLECTING_ALERT_VARIATION':'COLLECTING_FORWARD_SHADOW',
      reasons:[...readinessState.reasons],
      killReviewEligible:false,
      manualPromotionReviewEligible:false
    };
  }

  const failureTest=primary.pairedFailureDetection.test;
  const falseTest=primary.pairedFalseAlerts.test;
  const failureGain=
    failureTest.pValue<=cfg.alpha&&
    failureTest.challengerOnly>failureTest.baselineOnly;
  const failureLoss=
    failureTest.pValue<=cfg.alpha&&
    failureTest.baselineOnly>failureTest.challengerOnly;
  const falseAlertWorse=
    falseTest.pValue<=cfg.alpha&&
    falseTest.challengerOnly>falseTest.baselineOnly;
  const falseAlertBetter=
    falseTest.pValue<=cfg.alpha&&
    falseTest.baselineOnly>falseTest.challengerOnly;

  if(failureGain&&!falseAlertWorse){
    return {
      state:'PROMISING_INCREMENTAL_AUDIT_SIGNAL',
      reasons:[
        'PAIRED_PRIMARY_FAILURE_DETECTION_IMPROVED',
        ...(falseAlertBetter?['PAIRED_FALSE_ALERT_RATE_IMPROVED']:[])
      ],
      killReviewEligible:false,
      manualPromotionReviewEligible:true
    };
  }
  if(failureGain&&falseAlertWorse){
    return {
      state:'MIXED_SIGNAL',
      reasons:['PRIMARY_FAILURE_DETECTION_IMPROVED','FALSE_ALERT_BURDEN_INCREASED'],
      killReviewEligible:false,
      manualPromotionReviewEligible:false
    };
  }
  if(failureLoss){
    return {
      state:'EVIDENCE_AGAINST_INCREMENTAL_VALUE',
      reasons:['BASELINE_DETECTS_MORE_PRIMARY_FAILURES'],
      killReviewEligible:rows.length>=cfg.minConclusiveObservations,
      manualPromotionReviewEligible:false
    };
  }
  if(falseAlertWorse){
    return {
      state:'FALSE_POSITIVE_BURDEN',
      reasons:['CHALLENGER_ADDS_SIGNIFICANTLY_MORE_FALSE_ALERTS_WITHOUT_SIGNIFICANT_FAILURE_GAIN'],
      killReviewEligible:rows.length>=cfg.minConclusiveObservations,
      manualPromotionReviewEligible:false
    };
  }
  if(
    rows.length>=cfg.minConclusiveObservations&&
    primary.pairedFailureDetection.challengerOnly===0
  ){
    return {
      state:'NO_INCREMENTAL_FAILURE_DETECTION_OBSERVED',
      reasons:['NO_CHALLENGER_ONLY_PRIMARY_FAILURE_CATCHES_AT_CONCLUSIVE_SAMPLE_FLOOR'],
      killReviewEligible:true,
      manualPromotionReviewEligible:false
    };
  }
  return {
    state:'INCONCLUSIVE',
    reasons:['NO_STATISTICALLY_DISTINGUISHABLE_PAIRED_PRIMARY_LIFT_YET'],
    killReviewEligible:false,
    manualPromotionReviewEligible:false
  };
}

function reportCore(value){
  const {fingerprint,...core}=value||{};
  return core;
}

export function evaluateClaimAssumptionResearch(dataset,{config={},evaluatedAt=null}={}){
  if(dataset?.execution!=='SHADOW_ONLY'||dataset?.canInfluencePrimary!==false||dataset?.canExecuteLive!==false){
    throw new Error('claim-assumption dataset safety invariant invalid');
  }

  const cfg=configSnapshot(config);
  const accepted=[];
  const rejected=[];
  for(const row of Array.isArray(dataset?.observations)?dataset.observations:[]){
    const v=verifyForecastClaimAssumptionShadowObservation(row);
    if(v.ok) accepted.push(row);
    else rejected.push({fingerprint:row?.fingerprint??null,reasons:v.reasons});
  }
  accepted.sort((a,b)=>Number(a.observedAt)-Number(b.observedAt)||String(a.fingerprint).localeCompare(String(b.fingerprint)));

  const lastObserved=accepted.length?Math.max(...accepted.map(x=>Number(x.observedAt)||0)):0;
  const asOf=evaluatedAt==null?lastObserved:Number(evaluatedAt);
  if(!Number.isFinite(asOf)||asOf<lastObserved) throw new Error('evaluatedAt cannot predate accepted observations');

  const primary=pairedEndpoint(accepted,{
    failure:primaryFailure,
    success:primarySuccess,
    label:'DIRECTION_TOP_ERROR'
  });
  const secondary=pairedEndpoint(accepted,{
    failure:intervalFailure,
    success:intervalSuccess,
    label:'INTERVAL_MISS'
  });
  const ready=readiness(accepted,primary,cfg);
  const conclusion=researchConclusion({
    integrityBlocked:rejected.length>0,
    readinessState:ready,
    primary,
    rows:accepted,
    cfg
  });

  const core={
    version:CLAIM_ASSUMPTION_RESEARCH_EVALUATOR_VERSION,
    proposalId:'CLAIM_ASSUMPTION_GRAPH',
    evaluatedAt:asOf,
    sourceDatasetVersion:String(dataset?.version??'UNKNOWN'),
    sourceObservationCount:Number(dataset?.observationCount??accepted.length),
    acceptedObservationCount:accepted.length,
    rejectedObservationCount:rejected.length,
    rejectedObservations:rejected,
    config:cfg,
    coverage:{
      customDeclarationObservations:accepted.filter(x=>customDeclarationCount(x)>0).length,
      genericBaselineOnlyObservations:accepted.filter(x=>customDeclarationCount(x)===0).length,
      challengerAlertObservations:accepted.filter(challengerAlert).length,
      baselineAlertObservations:accepted.filter(baselineAlert).length,
      uniqueSymbols:unique(accepted.map(x=>x?.symbol).filter(Boolean)).length,
      horizons:unique(accepted.map(x=>x?.horizonId).filter(Boolean))
    },
    readiness:ready,
    primary,
    secondary,
    continuousErrors:continuousErrorSummary(accepted),
    overhead:overheadSummary(accepted),
    byHorizon:horizonBreakdown(accepted),
    byThesisAssumption:thesisAssumptionBreakdown(accepted),
    preOutcomeRevision:preOutcomeRevisionSummary(accepted),
    byPreOutcomeStaleAssumption:preOutcomeStaleAssumptionBreakdown(accepted),
    conclusion,
    dimensions:{
      unsupportedOrInvalidAssumptionDefectDetection:'MEASURED_BY_ISSUANCE_GRAPH_ALERTS',
      assumptionLevelOutcomeAssociation:'MEASURED_PROSPECTIVELY_BY_FROZEN_SUPPORT_STATE',
      outcomeAssociation:'MEASURED_PROSPECTIVELY',
      revisionPrecision:'MEASURED_AS_PRE_OUTCOME_WARNING_CAPTURE_AND_FALSE_WARNING_RATE',
      staleAssumptionDetection:'MEASURED_PROSPECTIVELY_BY_SUPPORT_TRANSITION_MEMORY',
      reproducibility:'SUPPORTED_BY_PERSISTED_FINGERPRINTED_ARTIFACTS',
      runtimeCpuCost:'NOT_MEASURED'
    },
    methodology:{
      design:'PAIRED_FORWARD_SHADOW',
      primaryEndpoint:'DIRECTION_TOP_ERROR',
      secondaryEndpoint:'INTERVAL_MISS',
      pairedTest:'EXACT_BINOMIAL_MCNEMAR',
      confidenceIntervals:'WILSON_95_PERCENT',
      causalInterpretation:false,
      outcomeDoesNotValidateIndividualAssumptions:true,
      preOutcomeWarningsUseOnlyEventsKnownByHorizonMaturity:true,
      warningLeadTimeIsDescriptiveNotCounterfactualCausation:true,
      noRandomizedTrafficSplitRequired:true
    },
    governance:{
      conclusionDoesNotAutoPromote:true,
      conclusionDoesNotAutoKill:true,
      manualReviewRequired:true,
      primaryMutationAllowed:false
    },
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canInfluencePrimary:false,
    canExecuteLive:false
  };
  return deepFreeze({...core,fingerprint:sha256(core)});
}

export function verifyClaimAssumptionResearchEvaluation(value){
  try{
    const reasons=[];
    if(value?.version!==CLAIM_ASSUMPTION_RESEARCH_EVALUATOR_VERSION) reasons.push('VERSION_INVALID');
    if(value?.proposalId!=='CLAIM_ASSUMPTION_GRAPH') reasons.push('PROPOSAL_ID_INVALID');
    if(value?.execution!=='SHADOW_ONLY'||value?.action!=='ABSTAIN'||value?.canInfluencePrimary!==false||value?.canExecuteLive!==false){
      reasons.push('SAFETY_INVARIANT_INVALID');
    }
    if(value?.governance?.conclusionDoesNotAutoPromote!==true||value?.governance?.conclusionDoesNotAutoKill!==true){
      reasons.push('GOVERNANCE_INVARIANT_INVALID');
    }
    const expected=sha256(reportCore(value));
    if(value?.fingerprint!==expected) reasons.push('FINGERPRINT_MISMATCH');
    return {ok:reasons.length===0,reasons,expectedFingerprint:expected};
  }catch(err){
    return {ok:false,reasons:['CLAIM_ASSUMPTION_RESEARCH_EVALUATION_INVALID',err instanceof Error?err.message:String(err)]};
  }
}

export function claimAssumptionResearchEvaluationSummary(value){
  const v=verifyClaimAssumptionResearchEvaluation(value);
  return deepFreeze({
    version:CLAIM_ASSUMPTION_RESEARCH_EVALUATOR_VERSION,
    proposalId:value?.proposalId??null,
    evaluatedAt:value?.evaluatedAt??null,
    integrity:v.ok?'VALID':'INVALID',
    observations:value?.acceptedObservationCount??0,
    readiness:structuredClone(value?.readiness??null),
    conclusion:structuredClone(value?.conclusion??null),
    primary:structuredClone(value?.primary??null),
    preOutcomeRevision:structuredClone(value?.preOutcomeRevision??null),
    overhead:structuredClone(value?.overhead??null),
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canInfluencePrimary:false,
    canExecuteLive:false
  });
}
