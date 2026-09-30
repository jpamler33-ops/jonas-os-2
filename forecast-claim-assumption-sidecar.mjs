import { sha256 } from './institutional-kernel.mjs';
import {
  buildClaimAssumptionGraph,
  verifyClaimAssumptionGraph,
  claimAssumptionGraphSummary
} from './claim-assumption-graph.mjs';

export const FORECAST_CLAIM_ASSUMPTION_SIDECAR_VERSION='TCX_FORECAST_CLAIM_ASSUMPTION_SIDECAR_V1';
export const FORECAST_CLAIM_ASSUMPTION_POLICY_VERSION='TCX_FORECAST_ASSUMPTION_DECLARATION_POLICY_V1';
export const FORECAST_CLAIM_ASSUMPTION_SHADOW_OBSERVATION_VERSION='TCX_FORECAST_CLAIM_ASSUMPTION_SHADOW_OBSERVATION_V1';

const deepFreeze=value=>{
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    Object.freeze(value);
    for(const v of Object.values(value)) deepFreeze(v);
  }
  return value;
};
const finite=(v,name)=>{
  const n=Number(v);
  if(!Number.isFinite(n)) throw new Error(name+' must be finite');
  return n;
};
const text=(v,name)=>{
  const s=String(v??'').trim();
  if(!s) throw new Error(name+' is required');
  return s;
};
const hash64=(v,name)=>{
  const s=String(v??'').toLowerCase();
  if(!/^[a-f0-9]{64}$/.test(s)) throw new Error(name+' must be a sha256 hex string');
  return s;
};
const safeId=v=>String(v??'').trim().replace(/[^A-Za-z0-9_.:-]+/g,'_');
const cloneArray=v=>Array.isArray(v)?structuredClone(v):[];
const finalized=core=>deepFreeze({...core,fingerprint:sha256(core)});
const sidecarCore=value=>{
  const {fingerprint,graph,...core}=value||{};
  return core;
};
const observationCore=value=>{
  const {fingerprint,...core}=value||{};
  return core;
};

function artifactEvidence({input,forecast,scientificValidity,admission,generatedAt}){
  return [
    {
      evidenceId:'CANONICAL_FORECAST_INPUT',
      classification:'INFERRED',
      statement:'Internal canonical forecast-input contract used for this issuance. This is provenance of model input, not independent market truth.',
      provenanceIds:[
        'INPUT_FINGERPRINT:'+String(input.inputFingerprint??''),
        'FORECAST_AS_OF:'+String(input.asOf)
      ],
      observedAt:generatedAt,
      availableAt:generatedAt
    },
    {
      evidenceId:'SCIENTIFIC_VALIDITY_ARTIFACT',
      classification:'INFERRED',
      statement:'Internal scientific-validity artifact attached to this forecast issuance.',
      provenanceIds:[
        'SCIENCE_FINGERPRINT:'+String(scientificValidity?.fingerprint??''),
        'SCIENCE_GATE:'+String(scientificValidity?.gate??'UNKNOWN')
      ],
      observedAt:generatedAt,
      availableAt:generatedAt
    },
    {
      evidenceId:'INSTITUTIONAL_ADMISSION_ARTIFACT',
      classification:'INFERRED',
      statement:'Internal admission-gate artifact attached to this forecast issuance.',
      provenanceIds:[
        'ADMISSION_FINGERPRINT:'+String(admission?.fingerprint??''),
        'ADMISSION_GATE:'+String(admission?.gate??'UNKNOWN')
      ],
      observedAt:generatedAt,
      availableAt:generatedAt
    },
    {
      evidenceId:'CANONICAL_FORECAST_ARTIFACT',
      classification:'MODELLED',
      statement:'Canonical forecast artifact. This is a model output and must not be treated as external evidence for itself.',
      provenanceIds:[
        'FORECAST_FINGERPRINT:'+String(forecast?.fingerprint??''),
        'FORECAST_ID:'+String(forecast?.forecastId??'')
      ],
      observedAt:generatedAt,
      availableAt:generatedAt
    }
  ];
}

function baselineDeclarations({input,forecast,generatedAt}){
  const claims=[];
  const assumptions=[];
  const dependencies=[];
  const lateDeclarationHorizons=[];

  for(const horizon of Array.isArray(forecast?.horizons)?forecast.horizons:[]){
    const hId=safeId(horizon.horizonId||String(horizon.horizonMs));
    const horizonMs=finite(horizon.horizonMs,'horizon.horizonMs');
    const dueAt=finite(input.asOf,'input.asOf')+horizonMs;
    const validUntil=dueAt>=generatedAt?dueAt:null;
    if(validUntil==null) lateDeclarationHorizons.push(String(horizon.horizonId));

    const stateId='STATE_REPRESENTATIVE:'+hId;
    const regimeId='REGIME_ADEQUACY:'+hId;
    const transportId='MODEL_TRANSPORTABILITY:'+hId;
    const calibrationId='CALIBRATION_TRANSFER:'+hId;

    assumptions.push(
      {
        assumptionId:stateId,
        statement:'The point-in-time input state remains sufficiently representative for the '+String(horizon.horizonId)+' forecast horizon. This does not assume the market state is static.',
        evidenceIds:[],
        requiresEvidence:false,
        availableAt:generatedAt,
        ...(validUntil==null?{}:{validUntil})
      },
      {
        assumptionId:regimeId,
        statement:'The regime representation and any modeled regime transition remain sufficiently informative for the '+String(horizon.horizonId)+' horizon.',
        evidenceIds:[],
        requiresEvidence:false,
        availableAt:generatedAt,
        ...(validUntil==null?{}:{validUntil})
      },
      {
        assumptionId:transportId,
        statement:'The learned model relationships remain sufficiently transportable from their historical support into the current '+String(horizon.horizonId)+' forecast horizon.',
        evidenceIds:['SCIENTIFIC_VALIDITY_ARTIFACT'],
        requiresEvidence:false,
        availableAt:generatedAt,
        ...(validUntil==null?{}:{validUntil})
      }
    );

    dependencies.push(
      {
        fromAssumptionId:regimeId,
        toAssumptionId:stateId,
        relation:'DEPENDS_ON',
        commonCauseIds:[],
        availableAt:generatedAt
      },
      {
        fromAssumptionId:transportId,
        toAssumptionId:stateId,
        relation:'DEPENDS_ON',
        commonCauseIds:[],
        availableAt:generatedAt
      }
    );

    const commonAssumptionIds=[stateId,regimeId,transportId];
    claims.push(
      {
        claimId:'FORECAST_DIRECTION:'+hId,
        statement:'For '+String(horizon.horizonId)+', the model output direction is '+String(horizon.direction)+' with expected return '+String(horizon.expectedReturn)+'.',
        epistemicClass:'MODELLED',
        required:true,
        assumptionIds:commonAssumptionIds,
        evidenceIds:['CANONICAL_FORECAST_INPUT','CANONICAL_FORECAST_ARTIFACT','SCIENTIFIC_VALIDITY_ARTIFACT'],
        availableAt:generatedAt
      },
      {
        claimId:'FORECAST_INTERVAL:'+hId,
        statement:'For '+String(horizon.horizonId)+', the conditional model interval q10..q90 is '+String(horizon.interval?.q10)+' .. '+String(horizon.interval?.q90)+'.',
        epistemicClass:'MODELLED',
        required:false,
        assumptionIds:[stateId,transportId],
        evidenceIds:['CANONICAL_FORECAST_INPUT','CANONICAL_FORECAST_ARTIFACT'],
        availableAt:generatedAt
      }
    );

    const probabilityAssumptions=[stateId,transportId];
    if(String(horizon.calibration?.status??'').toUpperCase()==='CALIBRATED'){
      assumptions.push({
        assumptionId:calibrationId,
        statement:'The historical probability calibration remains sufficiently applicable to the current '+String(horizon.horizonId)+' horizon.',
        evidenceIds:['SCIENTIFIC_VALIDITY_ARTIFACT'],
        requiresEvidence:false,
        availableAt:generatedAt,
        ...(validUntil==null?{}:{validUntil})
      });
      dependencies.push({
        fromAssumptionId:calibrationId,
        toAssumptionId:transportId,
        relation:'DEPENDS_ON',
        commonCauseIds:[],
        availableAt:generatedAt
      });
      probabilityAssumptions.push(calibrationId);
    }

    claims.push({
      claimId:'FORECAST_PROBABILITIES:'+hId,
      statement:'For '+String(horizon.horizonId)+', the internal model probability vector is UP '+String(horizon.probabilities?.up)+', DOWN '+String(horizon.probabilities?.down)+', FLAT '+String(horizon.probabilities?.flat)+'. Calibration status: '+String(horizon.calibration?.status??'UNKNOWN')+'.',
      epistemicClass:'MODELLED',
      required:false,
      assumptionIds:probabilityAssumptions,
      evidenceIds:['CANONICAL_FORECAST_ARTIFACT','SCIENTIFIC_VALIDITY_ARTIFACT'],
      availableAt:generatedAt
    });
  }

  return {
    claims,
    assumptions,
    dependencies,
    lateDeclarationHorizons
  };
}

function mergeDeclarations(baseline,custom={}){
  return {
    claims:[...baseline.claims,...cloneArray(custom?.claims)],
    assumptions:[...baseline.assumptions,...cloneArray(custom?.assumptions)],
    evidence:[...cloneArray(custom?.evidence)],
    dependencies:[...baseline.dependencies,...cloneArray(custom?.dependencies)]
  };
}

export function createForecastClaimAssumptionSidecar({
  input,
  forecast,
  scientificValidity,
  admission,
  traceId,
  generatedAt,
  declarations=null
}={}){
  const issuedAt=finite(generatedAt,'generatedAt');
  const decisionAsOf=finite(input?.asOf,'input.asOf');
  if(issuedAt<decisionAsOf) throw new Error('generatedAt cannot predate decision asOf');
  const forecastFingerprint=hash64(forecast?.fingerprint,'forecast.fingerprint');
  const inputFingerprint=hash64(input?.inputFingerprint,'input.inputFingerprint');
  const scienceFingerprint=hash64(scientificValidity?.fingerprint,'scientificValidity.fingerprint');
  const admissionFingerprint=hash64(admission?.fingerprint,'admission.fingerprint');
  const traceHash=hash64(traceId,'traceId');

  const baseline=baselineDeclarations({input,forecast,generatedAt:issuedAt});
  const merged=mergeDeclarations(baseline,declarations||{});
  const evidence=[
    ...artifactEvidence({input,forecast,scientificValidity,admission,generatedAt:issuedAt}),
    ...merged.evidence
  ];

  const graph=buildClaimAssumptionGraph({
    asOf:issuedAt,
    subjectId:'FORECAST:'+text(forecast?.forecastId,'forecast.forecastId'),
    claims:merged.claims,
    assumptions:merged.assumptions,
    evidence,
    dependencies:merged.dependencies,
    sourceTraceId:traceHash,
    provenance:{
      source:'TCX_FORECAST_CLAIM_ASSUMPTION_SIDECAR',
      version:FORECAST_CLAIM_ASSUMPTION_SIDECAR_VERSION
    }
  });
  const gv=verifyClaimAssumptionGraph(graph);
  if(!gv.ok) throw new Error('claim-assumption graph verification failed: '+gv.reasons.join(','));

  const core={
    version:FORECAST_CLAIM_ASSUMPTION_SIDECAR_VERSION,
    policyVersion:FORECAST_CLAIM_ASSUMPTION_POLICY_VERSION,
    symbol:text(input?.symbol,'input.symbol').toUpperCase(),
    forecastId:text(forecast?.forecastId,'forecast.forecastId'),
    forecastFingerprint,
    inputFingerprint,
    scienceFingerprint,
    admissionFingerprint,
    traceId:traceHash,
    decisionAsOf,
    generatedAt:issuedAt,
    graphFingerprint:graph.fingerprint,
    declarationStats:{
      baselineClaims:baseline.claims.length,
      baselineAssumptions:baseline.assumptions.length,
      baselineDependencies:baseline.dependencies.length,
      customClaims:cloneArray(declarations?.claims).length,
      customAssumptions:cloneArray(declarations?.assumptions).length,
      customEvidence:cloneArray(declarations?.evidence).length,
      customDependencies:cloneArray(declarations?.dependencies).length,
      lateDeclarationHorizons:[...baseline.lateDeclarationHorizons]
    },
    epistemicStatus:'RESEARCH_SIDECAR_NOT_VALIDATED',
    semantics:{
      declarationCoverage:'PARTIAL_DECLARATIVE_BASELINE',
      hiddenAssumptionsMayRemain:true,
      genericAssumptionsAreResearchScaffoldingNotTruth:true,
      forecastArtifactIsNotIndependentEvidence:true,
      graphDoesNotChangeForecastGate:true,
      graphDoesNotGrantTradeAuthority:true
    },
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canInfluencePrimary:false,
    canExecuteLive:false
  };
  return deepFreeze({...core,fingerprint:sha256(core),graph});
}

export function verifyForecastClaimAssumptionSidecar(value){
  try{
    const reasons=[];
    if(value?.version!==FORECAST_CLAIM_ASSUMPTION_SIDECAR_VERSION) reasons.push('VERSION_INVALID');
    if(value?.policyVersion!==FORECAST_CLAIM_ASSUMPTION_POLICY_VERSION) reasons.push('POLICY_VERSION_INVALID');
    if(value?.execution!=='SHADOW_ONLY'||value?.action!=='ABSTAIN'||value?.canInfluencePrimary!==false||value?.canExecuteLive!==false){
      reasons.push('SAFETY_INVARIANT_INVALID');
    }
    for(const [field,v] of [
      ['forecastFingerprint',value?.forecastFingerprint],
      ['inputFingerprint',value?.inputFingerprint],
      ['scienceFingerprint',value?.scienceFingerprint],
      ['admissionFingerprint',value?.admissionFingerprint],
      ['traceId',value?.traceId],
      ['graphFingerprint',value?.graphFingerprint]
    ]){
      if(!/^[a-f0-9]{64}$/i.test(String(v??''))) reasons.push(String(field).toUpperCase()+'_INVALID');
    }
    if(!Number.isFinite(Number(value?.decisionAsOf))||!Number.isFinite(Number(value?.generatedAt))){
      reasons.push('TIMESTAMP_INVALID');
    }else if(Number(value.generatedAt)<Number(value.decisionAsOf)){
      reasons.push('GENERATED_BEFORE_DECISION');
    }
    const gv=verifyClaimAssumptionGraph(value?.graph);
    if(!gv.ok) reasons.push('GRAPH_INVALID');
    if(value?.graphFingerprint!==value?.graph?.fingerprint) reasons.push('GRAPH_FINGERPRINT_LINK_MISMATCH');
    if(value?.traceId!==value?.graph?.sourceTraceId) reasons.push('TRACE_LINK_MISMATCH');
    if(Number(value?.graph?.asOf)!==Number(value?.generatedAt)) reasons.push('GRAPH_ASOF_LINK_MISMATCH');
    if(String(value?.graph?.subjectId??'')!=='FORECAST:'+String(value?.forecastId??'')) reasons.push('GRAPH_SUBJECT_LINK_MISMATCH');
    const expected=sha256(sidecarCore(value));
    if(value?.fingerprint!==expected) reasons.push('FINGERPRINT_MISMATCH');
    return {ok:reasons.length===0,reasons:[...new Set(reasons)],expectedFingerprint:expected};
  }catch(err){
    return {ok:false,reasons:['FORECAST_CLAIM_ASSUMPTION_SIDECAR_INVALID',err instanceof Error?err.message:String(err)]};
  }
}

export function forecastClaimAssumptionSidecarSummary(value){
  const v=verifyForecastClaimAssumptionSidecar(value);
  const graphSummary=value?.graph?claimAssumptionGraphSummary(value.graph):null;
  return deepFreeze({
    version:FORECAST_CLAIM_ASSUMPTION_SIDECAR_VERSION,
    forecastId:value?.forecastId??null,
    traceId:value?.traceId??null,
    integrity:v.ok?'VALID':'INVALID',
    decisionAsOf:value?.decisionAsOf??null,
    generatedAt:value?.generatedAt??null,
    graph:graphSummary,
    declarationStats:structuredClone(value?.declarationStats??null),
    epistemicStatus:value?.epistemicStatus??'UNKNOWN',
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canInfluencePrimary:false,
    canExecuteLive:false
  });
}

export function createForecastClaimAssumptionShadowObservation(sidecar,{
  horizonId,
  maturedAt,
  observedAt,
  evaluationId,
  evaluationMetrics=null,
  outcome=null,
  baselineAuditState=null,
  overhead=null,
  thesisRevisionState=null
}={}){
  const sv=verifyForecastClaimAssumptionSidecar(sidecar);
  if(!sv.ok) throw new Error('forecast claim-assumption sidecar invalid');
  const horizon=text(horizonId,'horizonId');
  const maturity=finite(maturedAt,'maturedAt');
  const observed=finite(observedAt,'observedAt');
  if(maturity<Number(sidecar.decisionAsOf)) throw new Error('maturedAt cannot predate decision asOf');
  if(observed<maturity) throw new Error('observedAt cannot predate maturedAt');
  const evalId=hash64(evaluationId,'evaluationId');

  const horizonClaimIds=(sidecar.graph?.nodes||[])
    .filter(x=>x.type==='CLAIM'&&String(x.claimId||'').endsWith(':'+safeId(horizon)))
    .map(x=>x.claimId)
    .sort();

  const core={
    version:FORECAST_CLAIM_ASSUMPTION_SHADOW_OBSERVATION_VERSION,
    sidecarFingerprint:sidecar.fingerprint,
    graphFingerprint:sidecar.graphFingerprint,
    forecastFingerprint:sidecar.forecastFingerprint,
    traceId:sidecar.traceId,
    symbol:sidecar.symbol,
    forecastId:sidecar.forecastId,
    horizonId:horizon,
    decisionAsOf:sidecar.decisionAsOf,
    issuanceGeneratedAt:sidecar.generatedAt,
    maturedAt:maturity,
    observedAt:observed,
    evaluationId:evalId,
    issuanceAuditState:{
      graphGate:sidecar.graph?.diagnostics?.researchGate??'UNKNOWN',
      defectCount:Number(sidecar.graph?.diagnostics?.defectCount||0),
      affectedRequiredClaimCount:Number(sidecar.graph?.diagnostics?.affectedRequiredClaimCount||0),
      sharedAssumptionCount:Array.isArray(sidecar.graph?.diagnostics?.sharedAssumptions)
        ?sidecar.graph.diagnostics.sharedAssumptions.length
        :0,
      explicitUnsupportedAssumptionCount:Array.isArray(sidecar.graph?.diagnostics?.explicitUnsupportedAssumptionIds)
        ?sidecar.graph.diagnostics.explicitUnsupportedAssumptionIds.length
        :0,
      unsupportedRequiredAssumptionIds:(sidecar.graph?.nodes||[])
        .filter(x=>x?.type==='ASSUMPTION'&&x?.supportState==='REQUIRED_SUPPORT_MISSING')
        .map(x=>String(x.assumptionId))
        .sort(),
      thesisAssumptionIds:(sidecar.graph?.nodes||[])
        .filter(x=>x?.type==='ASSUMPTION'&&String(x.assumptionId||'').startsWith('THESIS_'))
        .map(x=>String(x.assumptionId))
        .sort(),
      thesisUnsupportedAssumptionIds:(sidecar.graph?.nodes||[])
        .filter(x=>
          x?.type==='ASSUMPTION'&&
          x?.supportState==='REQUIRED_SUPPORT_MISSING'&&
          String(x.assumptionId||'').startsWith('THESIS_')
        )
        .map(x=>String(x.assumptionId))
        .sort(),
      horizonClaimIds
    },
    declarationCoverage:{
      customClaims:Number(sidecar?.declarationStats?.customClaims||0),
      customAssumptions:Number(sidecar?.declarationStats?.customAssumptions||0),
      customEvidence:Number(sidecar?.declarationStats?.customEvidence||0),
      customDependencies:Number(sidecar?.declarationStats?.customDependencies||0),
      customDeclarationCount:
        Number(sidecar?.declarationStats?.customClaims||0)+
        Number(sidecar?.declarationStats?.customAssumptions||0)+
        Number(sidecar?.declarationStats?.customEvidence||0)+
        Number(sidecar?.declarationStats?.customDependencies||0),
      hiddenAssumptionsMayRemain:sidecar?.semantics?.hiddenAssumptionsMayRemain===true
    },
    evaluationMetrics:{
      brier:Number.isFinite(Number(evaluationMetrics?.brier))?Number(evaluationMetrics.brier):null,
      logLoss:Number.isFinite(Number(evaluationMetrics?.logLoss))?Number(evaluationMetrics.logLoss):null,
      absoluteReturnError:Number.isFinite(Number(evaluationMetrics?.absoluteReturnError))?Number(evaluationMetrics.absoluteReturnError):null,
      intervalMiss:typeof evaluationMetrics?.intervalMiss==='boolean'?evaluationMetrics.intervalMiss:null,
      topCorrect:typeof evaluationMetrics?.topCorrect==='boolean'?evaluationMetrics.topCorrect:null
    },
    outcome:{
      actualReturn:Number.isFinite(Number(outcome?.actualReturn))?Number(outcome.actualReturn):null,
      actualDirection:outcome?.actualDirection==null?null:String(outcome.actualDirection)
    },
    baselineAuditState:{
      alert:baselineAuditState?.alert===true,
      reasons:Array.isArray(baselineAuditState?.reasons)?[...new Set(baselineAuditState.reasons.map(String))].sort():[],
      safetyState:String(baselineAuditState?.safetyState??'UNKNOWN'),
      validityState:String(baselineAuditState?.validityState??'UNKNOWN'),
      contradictionCount:Math.max(0,Math.floor(Number(baselineAuditState?.contradictionCount)||0)),
      forecastGate:String(baselineAuditState?.forecastGate??'UNKNOWN'),
      scienceGate:String(baselineAuditState?.scienceGate??'UNKNOWN')
    },
    overhead:{
      graphNodes:Math.max(0,Math.floor(Number(overhead?.graphNodes)||0)),
      graphEdges:Math.max(0,Math.floor(Number(overhead?.graphEdges)||0)),
      graphBytes:Math.max(0,Math.floor(Number(overhead?.graphBytes)||0)),
      traceBytes:Math.max(0,Math.floor(Number(overhead?.traceBytes)||0)),
      sidecarBytes:Math.max(0,Math.floor(Number(overhead?.sidecarBytes)||0))
    },
    preOutcomeThesisRevisionState:thesisRevisionState?{
      eventsBeforeMaturity:Math.max(0,Math.floor(Number(thesisRevisionState?.eventsBeforeMaturity)||0)),
      staleAssumptionIdsAtMaturity:Array.isArray(thesisRevisionState?.staleAssumptionIdsAtMaturity)
        ?[...new Set(thesisRevisionState.staleAssumptionIdsAtMaturity.map(String))].sort()
        :[],
      everStaleAssumptionIdsBeforeMaturity:Array.isArray(thesisRevisionState?.everStaleAssumptionIdsBeforeMaturity)
        ?[...new Set(thesisRevisionState.everStaleAssumptionIdsBeforeMaturity.map(String))].sort()
        :[],
      firstStaleAt:thesisRevisionState?.firstStaleAt==null?null:Number.isFinite(Number(thesisRevisionState.firstStaleAt))?Number(thesisRevisionState.firstStaleAt):null,
      firstWatchAt:thesisRevisionState?.firstWatchAt==null?null:Number.isFinite(Number(thesisRevisionState.firstWatchAt))?Number(thesisRevisionState.firstWatchAt):null,
      firstForecastInvalidatedAt:thesisRevisionState?.firstForecastInvalidatedAt==null
        ?null
        :Number.isFinite(Number(thesisRevisionState.firstForecastInvalidatedAt))
          ?Number(thesisRevisionState.firstForecastInvalidatedAt)
          :null,
      firstWarningAt:thesisRevisionState?.firstWarningAt==null?null:Number.isFinite(Number(thesisRevisionState.firstWarningAt))?Number(thesisRevisionState.firstWarningAt):null,
      warningAvailableBeforeMaturity:thesisRevisionState?.warningAvailableBeforeMaturity===true,
      warningLeadMs:thesisRevisionState?.warningLeadMs==null?null:Number.isFinite(Number(thesisRevisionState.warningLeadMs))?Number(thesisRevisionState.warningLeadMs):null,
      forecastInvalidatedBeforeMaturity:thesisRevisionState?.forecastInvalidatedBeforeMaturity===true,
      interpretation:'PRE_OUTCOME_REVISION_SIGNAL_NOT_CAUSAL_PROOF'
    }:null,
    semantics:{
      forwardShadowMeasurementOnly:true,
      linksIssuanceStateToLaterOutcome:true,
      doesNotInferAssumptionTruthFromOutcome:true,
      doesNotRewriteIssuanceGraph:true,
      doesNotChangeForecastEvaluation:true,
      pairedResearchComparisonOnly:true,
      preOutcomeRevisionStateUsesOnlyEventsKnownByMaturity:true,
      outcomeAssociationIsNotCausation:true
    },
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canInfluencePrimary:false,
    canExecuteLive:false
  };
  return finalized(core);
}

export function verifyForecastClaimAssumptionShadowObservation(value){
  try{
    const reasons=[];
    if(value?.version!==FORECAST_CLAIM_ASSUMPTION_SHADOW_OBSERVATION_VERSION) reasons.push('VERSION_INVALID');
    if(value?.execution!=='SHADOW_ONLY'||value?.action!=='ABSTAIN'||value?.canInfluencePrimary!==false||value?.canExecuteLive!==false){
      reasons.push('SAFETY_INVARIANT_INVALID');
    }
    for(const [field,v] of [
      ['sidecarFingerprint',value?.sidecarFingerprint],
      ['graphFingerprint',value?.graphFingerprint],
      ['forecastFingerprint',value?.forecastFingerprint],
      ['traceId',value?.traceId],
      ['evaluationId',value?.evaluationId]
    ]){
      if(!/^[a-f0-9]{64}$/i.test(String(v??''))) reasons.push(String(field).toUpperCase()+'_INVALID');
    }
    for(const [field,v] of [
      ['decisionAsOf',value?.decisionAsOf],
      ['issuanceGeneratedAt',value?.issuanceGeneratedAt],
      ['maturedAt',value?.maturedAt],
      ['observedAt',value?.observedAt]
    ]){
      if(!Number.isFinite(Number(v))) reasons.push(String(field).toUpperCase()+'_INVALID');
    }
    if(Number(value?.issuanceGeneratedAt)<Number(value?.decisionAsOf)) reasons.push('ISSUANCE_BEFORE_DECISION');
    if(Number(value?.maturedAt)<Number(value?.decisionAsOf)) reasons.push('MATURITY_BEFORE_DECISION');
    if(Number(value?.observedAt)<Number(value?.maturedAt)) reasons.push('OBSERVED_BEFORE_MATURITY');
    const expected=sha256(observationCore(value));
    if(value?.fingerprint!==expected) reasons.push('FINGERPRINT_MISMATCH');
    return {ok:reasons.length===0,reasons:[...new Set(reasons)],expectedFingerprint:expected};
  }catch(err){
    return {ok:false,reasons:['FORECAST_CLAIM_ASSUMPTION_SHADOW_OBSERVATION_INVALID',err instanceof Error?err.message:String(err)]};
  }
}
