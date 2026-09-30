import { sha256 } from './institutional-kernel.mjs';

export const FORECAST_THESIS_DECLARATIONS_VERSION='TCX_FORECAST_THESIS_DECLARATIONS_V1';

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
const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));
const txt=(v,fallback='UNKNOWN')=>{
  const s=String(v??fallback).trim();
  return s||fallback;
};
const safe=(v)=>txt(v).toUpperCase().replace(/[^A-Z0-9:_-]+/g,'_').slice(0,120);
const short=(v,max=20)=>txt(v).replace(/\s+/g,' ').slice(0,max);
const uniq=xs=>[...new Set((xs||[]).map(String).filter(Boolean))].sort();

function evidenceRow({evidenceId,classification,statement,provenanceIds,availableAt}){
  return {
    evidenceId,
    classification,
    statement,
    provenanceIds:uniq(provenanceIds),
    availableAt
  };
}

function supportIds(condition,id){
  return condition?[id]:[];
}

function thesisFingerprintPayload(value){
  return {
    symbol:value.symbol,
    asOf:value.asOf,
    generatedAt:value.generatedAt,
    claims:value.claims,
    assumptions:value.assumptions,
    evidence:value.evidence,
    dependencies:value.dependencies
  };
}

export function buildForecastThesisDeclarations({
  symbol,
  asOf,
  generatedAt,
  inputFingerprint=null,
  state=null,
  witnessReport=null,
  mechanism=null,
  evidenceRecord=null,
  researchDependencyGraph=null,
  scientificValidity=null
}={}){
  const decisionAsOf=finite(asOf,'asOf');
  const issuedAt=finite(generatedAt,'generatedAt');
  if(issuedAt<decisionAsOf) throw new Error('generatedAt cannot predate asOf');
  const marketSymbol=txt(symbol,'').toUpperCase();
  if(!marketSymbol) throw new Error('symbol required');

  const dashboard=state?.memoryDashboard||state?.dashboard||{};
  const analysis=state?.memoryAnalysis||state?.analysis||{};
  const hypothesis=mechanism?.hypothesis||{};
  const lattice=mechanism?.lattice||{};
  const audit=mechanism?.audit||{};

  const regime=txt(dashboard?.regime);
  const bias=txt(state?.mtf?.bias??dashboard?.bias);
  const structure=txt(analysis?.trend);
  const flow=txt(dashboard?.flow);
  const liquidity=txt(dashboard?.liquidity);
  const pressure=Number.isFinite(Number(dashboard?.pressureScore))?Number(dashboard.pressureScore):null;

  const witnessAgreement=clamp(witnessReport?.agreementScore);
  const witnessSatisfied=witnessReport?.independentWitnessSatisfied===true;
  const witnessExternal=Math.max(0,Math.floor(Number(witnessReport?.externalWitnessCount)||0));
  const witnessContradictions=uniq(witnessReport?.contradictions);

  const mechanismCandidate=txt(hypothesis?.candidate);
  const mechanismGate=txt(hypothesis?.gate);
  const mechanismScore=clamp(hypothesis?.candidateScore);
  const evidenceStrength=clamp(hypothesis?.evidenceStrength);
  const causalStatus=txt(hypothesis?.causalStatus,'NOT_IDENTIFIED');
  const mechanismSupported=['HYPOTHESIS_SUPPORTED','IDENTIFIABILITY_REVIEW'].includes(mechanismGate);
  const latticeSufficient=lattice?.sufficient===true;
  const latticeSupport=Math.max(0,Math.floor(Number(lattice?.support)||0));
  const latticeCoherence=clamp(lattice?.transitionCoherence);
  const latticeNovelty=clamp(lattice?.novelty);

  const evidenceIndex=Number.isFinite(Number(evidenceRecord?.index))?Number(evidenceRecord.index):null;
  const disagreementCount=Math.max(0,Math.floor(Number(evidenceRecord?.disagreementCount)||0));
  const evidenceGate=txt(evidenceRecord?.gate);
  const evidenceStateFingerprint=evidenceRecord?.stateFingerprint?.hash??null;
  const disagreementLayers=(evidenceRecord?.map?.layers||[])
    .filter(x=>String(x?.relation||'').toUpperCase()==='CONFLICT')
    .map(x=>safe(x?.layer))
    .filter(Boolean)
    .sort();
  const mechanismChannels=Object.entries(mechanism?.channels||{})
    .map(([id,score])=>[safe(id),clamp(score)])
    .sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))
    .slice(0,4);

  const dependencyGate=txt(researchDependencyGraph?.gate);
  const dependencyCoverage=clamp(researchDependencyGraph?.impact?.coverage);
  const blockedFeatures=Math.max(0,Math.floor(Number(researchDependencyGraph?.impact?.blockedFeatures)||0));
  const blockedFeatureIds=uniq(researchDependencyGraph?.impact?.blockedFeatureIds).slice(0,12);
  const dependencyReasons=uniq(researchDependencyGraph?.reasons).slice(0,12);
  const dependencyAdequate=['PASS','CAUTION'].includes(dependencyGate)&&blockedFeatures===0;

  const scienceGate=txt(scientificValidity?.gate??scientificValidity?.status);
  const scienceAdequate=['PASS','CAUTION','VALID'].includes(scienceGate);

  const worldStateKnown=
    !['UNKNOWN','INSUFFICIENT'].includes(regime)&&
    !['UNKNOWN','INSUFFICIENT'].includes(structure);
  const disagreementWithinTolerance=
    Number(audit?.contradictionScore??1)<=0.25&&
    witnessContradictions.filter(x=>!String(x).startsWith('QUOTE_BASIS_RISK_')).length===0;
  const thesisEvidenceAdequate=
    evidenceIndex!=null&&
    evidenceIndex>=45&&
    evidenceStrength>=0.55;

  const evidence=[
    evidenceRow({
      evidenceId:'THESIS_WORLD_STATE',
      classification:'INFERRED',
      statement:'PIT-derived world-state snapshot used to form this forecast thesis.',
      provenanceIds:[
        'SYMBOL:'+marketSymbol,
        'INPUT_FINGERPRINT:'+String(inputFingerprint??''),
        'STATE_FINGERPRINT:'+String(evidenceStateFingerprint??''),
        'REGIME:'+regime,
        'BIAS:'+bias,
        'STRUCTURE:'+structure,
        'FLOW:'+flow,
        'LIQUIDITY:'+liquidity,
        pressure==null?'PRESSURE:UNKNOWN':'PRESSURE:'+String(pressure)
      ],
      availableAt:issuedAt
    }),
    evidenceRow({
      evidenceId:'THESIS_WITNESS_STATE',
      classification:'INFERRED',
      statement:'Cross-venue witness aggregation frozen at thesis declaration time.',
      provenanceIds:[
        'AGREEMENT:'+String(witnessAgreement),
        'EXTERNAL:'+String(witnessExternal),
        'SATISFIED:'+String(witnessSatisfied),
        ...witnessContradictions.map(x=>'CONTRADICTION:'+x)
      ],
      availableAt:issuedAt
    }),
    evidenceRow({
      evidenceId:'THESIS_MECHANISM_STATE',
      classification:'MODELLED',
      statement:'Mechanism-transition engine output; observational model result, not an identified causal mechanism.',
      provenanceIds:[
        'VERSION:'+txt(mechanism?.version,'UNKNOWN'),
        'CANDIDATE:'+mechanismCandidate,
        'CANDIDATE_SCORE:'+String(mechanismScore),
        'EVIDENCE_STRENGTH:'+String(evidenceStrength),
        'GATE:'+mechanismGate,
        'CAUSAL_STATUS:'+causalStatus,
        ...mechanismChannels.map(([id,score])=>'CHANNEL:'+id+':'+String(score))
      ],
      availableAt:issuedAt
    }),
    evidenceRow({
      evidenceId:'THESIS_TRANSITION_STATE',
      classification:'MODELLED',
      statement:'Historical transition-lattice query frozen at thesis declaration time.',
      provenanceIds:[
        'SUPPORT:'+String(latticeSupport),
        'SUFFICIENT:'+String(latticeSufficient),
        'COHERENCE:'+String(latticeCoherence),
        'NOVELTY:'+String(latticeNovelty)
      ],
      availableAt:issuedAt
    }),
    evidenceRow({
      evidenceId:'THESIS_EVIDENCE_STATE',
      classification:'INFERRED',
      statement:'Research evidence alignment and disagreement diagnostic frozen before outcome maturity.',
      provenanceIds:[
        'INDEX:'+String(evidenceIndex??'UNKNOWN'),
        'DISAGREEMENT_COUNT:'+String(disagreementCount),
        'GATE:'+evidenceGate,
        'FINGERPRINT:'+String(evidenceRecord?.fingerprint??''),
        ...disagreementLayers.map(x=>'CONFLICT_LAYER:'+x)
      ],
      availableAt:issuedAt
    }),
    evidenceRow({
      evidenceId:'THESIS_DEPENDENCY_STATE',
      classification:'INFERRED',
      statement:'Research dependency and source-governance coverage frozen at thesis declaration time.',
      provenanceIds:[
        'GATE:'+dependencyGate,
        'COVERAGE:'+String(dependencyCoverage),
        'BLOCKED_FEATURES:'+String(blockedFeatures),
        'FINGERPRINT:'+String(researchDependencyGraph?.fingerprint??''),
        ...blockedFeatureIds.map(x=>'BLOCKED_FEATURE:'+x),
        ...dependencyReasons.map(x=>'REASON:'+safe(x))
      ],
      availableAt:issuedAt
    }),
    evidenceRow({
      evidenceId:'THESIS_SCIENCE_STATE',
      classification:'INFERRED',
      statement:'Scientific-validity control state attached to the thesis at issuance.',
      provenanceIds:[
        'GATE:'+scienceGate,
        'FINGERPRINT:'+String(scientificValidity?.fingerprint??'')
      ],
      availableAt:issuedAt
    })
  ];

  const assumptions=[
    {
      assumptionId:'THESIS_WORLD_STATE_REPRESENTATIVE',
      statement:'The current derived world state is sufficiently informative for the thesis at issuance.',
      evidenceIds:supportIds(worldStateKnown,'THESIS_WORLD_STATE'),
      requiresEvidence:true,
      availableAt:issuedAt
    },
    {
      assumptionId:'THESIS_WITNESS_SUPPORT_ADEQUATE',
      statement:'Independent cross-venue witness support is sufficient for the thesis evidence used at issuance.',
      evidenceIds:supportIds(witnessSatisfied&&witnessExternal>=2,'THESIS_WITNESS_STATE'),
      requiresEvidence:true,
      availableAt:issuedAt
    },
    {
      assumptionId:'THESIS_MECHANISM_SUPPORT_ADEQUATE',
      statement:'The modelled mechanism candidate has sufficient observational support to be a thesis component.',
      evidenceIds:supportIds(mechanismSupported,'THESIS_MECHANISM_STATE'),
      requiresEvidence:true,
      availableAt:issuedAt
    },
    {
      assumptionId:'THESIS_TRANSITION_ANALOGUES_ADEQUATE',
      statement:'Historical transition analogues are sufficiently supported and transportable for this thesis.',
      evidenceIds:supportIds(latticeSufficient,'THESIS_TRANSITION_STATE'),
      requiresEvidence:true,
      availableAt:issuedAt
    },
    {
      assumptionId:'THESIS_EVIDENCE_ALIGNMENT_ADEQUATE',
      statement:'The pre-outcome evidence alignment is strong enough to support the declared thesis.',
      evidenceIds:supportIds(thesisEvidenceAdequate,'THESIS_EVIDENCE_STATE'),
      requiresEvidence:true,
      availableAt:issuedAt
    },
    {
      assumptionId:'THESIS_DEPENDENCY_COVERAGE_ADEQUATE',
      statement:'Research-source dependencies are sufficiently covered and contain no blocked forecast features.',
      evidenceIds:supportIds(dependencyAdequate,'THESIS_DEPENDENCY_STATE'),
      requiresEvidence:true,
      availableAt:issuedAt
    },
    {
      assumptionId:'THESIS_DISAGREEMENT_WITHIN_TOLERANCE',
      statement:'Observed cross-source and model disagreement is not large enough to invalidate this thesis.',
      evidenceIds:supportIds(disagreementWithinTolerance,'THESIS_EVIDENCE_STATE'),
      requiresEvidence:true,
      availableAt:issuedAt
    },
    {
      assumptionId:'THESIS_SCIENTIFIC_GUARDS_ADEQUATE',
      statement:'The scientific validity layer is adequate for this thesis to remain a research hypothesis.',
      evidenceIds:supportIds(scienceAdequate,'THESIS_SCIENCE_STATE'),
      requiresEvidence:true,
      availableAt:issuedAt
    }
  ];

  const claims=[
    {
      claimId:'THESIS_WORLD_STATE_CLAIM',
      statement:'Derived state: regime '+short(regime)+', bias '+short(bias)+', structure '+short(structure)+', flow '+short(flow)+', liquidity '+short(liquidity)+'.',
      epistemicClass:'INFERRED',
      required:true,
      assumptionIds:['THESIS_WORLD_STATE_REPRESENTATIVE','THESIS_DEPENDENCY_COVERAGE_ADEQUATE'],
      evidenceIds:['THESIS_WORLD_STATE','THESIS_DEPENDENCY_STATE'],
      availableAt:issuedAt
    },
    {
      claimId:'THESIS_MECHANISM_CLAIM',
      statement:'Modelled mechanism '+short(mechanismCandidate,32)+' score '+mechanismScore.toFixed(3)+'; causal status remains '+short(causalStatus,28)+'.',
      epistemicClass:'MODELLED',
      required:true,
      assumptionIds:[
        'THESIS_MECHANISM_SUPPORT_ADEQUATE',
        'THESIS_TRANSITION_ANALOGUES_ADEQUATE',
        'THESIS_WITNESS_SUPPORT_ADEQUATE'
      ],
      evidenceIds:['THESIS_MECHANISM_STATE','THESIS_TRANSITION_STATE','THESIS_WITNESS_STATE'],
      availableAt:issuedAt
    },
    {
      claimId:'THESIS_EVIDENCE_CLAIM',
      statement:'Evidence alignment index is '+String(evidenceIndex??'unknown')+' with '+String(disagreementCount)+' declared disagreement conflicts.',
      epistemicClass:'INFERRED',
      required:true,
      assumptionIds:['THESIS_EVIDENCE_ALIGNMENT_ADEQUATE','THESIS_DISAGREEMENT_WITHIN_TOLERANCE'],
      evidenceIds:['THESIS_EVIDENCE_STATE','THESIS_WITNESS_STATE'],
      availableAt:issuedAt
    },
    {
      claimId:'THESIS_SYNTHESIS_CLAIM',
      statement:'The forecast thesis combines the frozen world state, evidence, mechanism candidate and explicit disagreement under unresolved uncertainty.',
      epistemicClass:'MODELLED',
      required:true,
      assumptionIds:[
        'THESIS_WORLD_STATE_REPRESENTATIVE',
        'THESIS_WITNESS_SUPPORT_ADEQUATE',
        'THESIS_MECHANISM_SUPPORT_ADEQUATE',
        'THESIS_TRANSITION_ANALOGUES_ADEQUATE',
        'THESIS_EVIDENCE_ALIGNMENT_ADEQUATE',
        'THESIS_DEPENDENCY_COVERAGE_ADEQUATE',
        'THESIS_DISAGREEMENT_WITHIN_TOLERANCE',
        'THESIS_SCIENTIFIC_GUARDS_ADEQUATE'
      ],
      evidenceIds:[
        'THESIS_WORLD_STATE',
        'THESIS_WITNESS_STATE',
        'THESIS_MECHANISM_STATE',
        'THESIS_TRANSITION_STATE',
        'THESIS_EVIDENCE_STATE',
        'THESIS_DEPENDENCY_STATE',
        'THESIS_SCIENCE_STATE'
      ],
      availableAt:issuedAt
    }
  ];

  const dependencies=[
    {
      fromAssumptionId:'THESIS_MECHANISM_SUPPORT_ADEQUATE',
      toAssumptionId:'THESIS_WORLD_STATE_REPRESENTATIVE',
      relation:'DEPENDS_ON',
      commonCauseIds:['MARKET_STATE'],
      availableAt:issuedAt
    },
    {
      fromAssumptionId:'THESIS_TRANSITION_ANALOGUES_ADEQUATE',
      toAssumptionId:'THESIS_WORLD_STATE_REPRESENTATIVE',
      relation:'DEPENDS_ON',
      commonCauseIds:['MARKET_STATE'],
      availableAt:issuedAt
    },
    {
      fromAssumptionId:'THESIS_EVIDENCE_ALIGNMENT_ADEQUATE',
      toAssumptionId:'THESIS_WITNESS_SUPPORT_ADEQUATE',
      relation:'DEPENDS_ON',
      commonCauseIds:['MARKET_OBSERVATIONS'],
      availableAt:issuedAt
    },
    {
      fromAssumptionId:'THESIS_DISAGREEMENT_WITHIN_TOLERANCE',
      toAssumptionId:'THESIS_WITNESS_SUPPORT_ADEQUATE',
      relation:'DEPENDS_ON',
      commonCauseIds:['MARKET_OBSERVATIONS'],
      availableAt:issuedAt
    },
    {
      fromAssumptionId:'THESIS_MECHANISM_SUPPORT_ADEQUATE',
      toAssumptionId:'THESIS_DEPENDENCY_COVERAGE_ADEQUATE',
      relation:'DEPENDS_ON',
      commonCauseIds:['RESEARCH_INPUTS'],
      availableAt:issuedAt
    },
    {
      fromAssumptionId:'THESIS_SCIENTIFIC_GUARDS_ADEQUATE',
      toAssumptionId:'THESIS_DEPENDENCY_COVERAGE_ADEQUATE',
      relation:'DEPENDS_ON',
      commonCauseIds:['RESEARCH_INPUTS'],
      availableAt:issuedAt
    }
  ];

  const core={
    version:FORECAST_THESIS_DECLARATIONS_VERSION,
    symbol:marketSymbol,
    asOf:decisionAsOf,
    generatedAt:issuedAt,
    claims,
    assumptions,
    evidence,
    dependencies,
    diagnostics:{
      worldStateKnown,
      witnessSatisfied,
      mechanismSupported,
      latticeSufficient,
      thesisEvidenceAdequate,
      dependencyAdequate,
      disagreementWithinTolerance,
      scienceAdequate,
      disagreementLayers,
      witnessContradictions,
      topMechanismChannels:mechanismChannels.map(([id,score])=>({id,score})),
      blockedFeatureIds,
      dependencyReasons,
      unsupportedMaterialAssumptions:assumptions
        .filter(x=>x.requiresEvidence&&x.evidenceIds.length===0)
        .map(x=>x.assumptionId)
        .sort(),
      mechanismCausalStatus:causalStatus,
      hiddenAssumptionsMayRemain:true
    },
    semantics:{
      declarationsArePointInTime:true,
      mechanismIsNotCausallyIdentified:causalStatus!=='IDENTIFIED',
      absenceOfSupportIsNotEvidenceOfOppositeDirection:true,
      graphAuditMustNotChangeForecastGate:true,
      noOutcomeInformationUsed:true
    },
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canInfluencePrimary:false,
    canExecuteLive:false
  };
  return deepFreeze({...core,fingerprint:sha256(thesisFingerprintPayload(core))});
}

export function forecastThesisDeclarationSummary(value){
  return deepFreeze({
    version:value?.version??FORECAST_THESIS_DECLARATIONS_VERSION,
    symbol:value?.symbol??null,
    asOf:value?.asOf??null,
    generatedAt:value?.generatedAt??null,
    claims:Array.isArray(value?.claims)?value.claims.length:0,
    assumptions:Array.isArray(value?.assumptions)?value.assumptions.length:0,
    evidence:Array.isArray(value?.evidence)?value.evidence.length:0,
    dependencies:Array.isArray(value?.dependencies)?value.dependencies.length:0,
    unsupportedMaterialAssumptions:structuredClone(value?.diagnostics?.unsupportedMaterialAssumptions??[]),
    mechanismCausalStatus:value?.diagnostics?.mechanismCausalStatus??'UNKNOWN',
    fingerprint:value?.fingerprint??null,
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canInfluencePrimary:false,
    canExecuteLive:false
  });
}
