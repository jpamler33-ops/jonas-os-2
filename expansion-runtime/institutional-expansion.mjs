import { sha256 } from '../institutional-kernel.mjs';
import { evaluateSourceReliability, classifySourceEvent } from './source-intelligence.mjs';
import { buildEventImpactMemory, estimateEventImpact } from './event-impact-memory.mjs';
import { analyzeLiquiditySnapshot, buildLiquidityMap, inferLiquidityReaction } from './liquidity-intelligence.mjs';
import { EXPANSION_PACK_PROVENANCE_HASH } from './provenance.mjs';
import { buildTraderWalletEvidence } from './trader-wallet-intelligence.mjs';
import { buildMemecoinEvidence } from './memecoin-intelligence.mjs';
import { buildNarrativeReflexivityEvidence } from './narrative-reflexivity.mjs';
import { buildFutureIntelligenceEvidence } from './future-intelligence.mjs';

export const INSTITUTIONAL_EXPANSION_VERSION='TCX_INSTITUTIONAL_EXPANSION_V1';

const RANK=Object.freeze({PASS:0,CAUTION:1,INSUFFICIENT:2,ABSTAIN:3});
function gate(v){
  const x=String(v??'INSUFFICIENT').toUpperCase();
  return x in RANK?x:'INSUFFICIENT';
}
function strictest(values){
  return values.reduce((a,b)=>RANK[gate(b)]>RANK[a]?gate(b):a,'PASS');
}
function finite(v,name){
  const n=Number(v);
  if(!Number.isFinite(n)) throw new Error(name+' must be finite');
  return n;
}

/**
 * Read-only expansion evidence bundle.
 * It cannot execute, route strategy, mutate forecasts, or bypass institutional admission.
 */
export function buildInstitutionalExpansionEvidence({
  asOf,
  sourceOutcomes=[],
  sourceEvent=null,
  sourceOptions={},
  eventImpactRows=[],
  eventImpactQuery=null,
  eventImpactOptions={},
  orderBook=null,
  liquidityOptions={},
  liquidityContext={},
  traderWallet=null,
  memecoin=null,
  narrative=null,
  futureIntelligence=null
}={}){
  const t=finite(asOf,'asOf');

  const sourceReliability=evaluateSourceReliability(t,sourceOutcomes,sourceOptions);
  const sourceClassification=sourceEvent
    ? classifySourceEvent(sourceEvent,sourceReliability,sourceOptions?.eventClassification)
    : null;

  const eventImpactMemory=buildEventImpactMemory(t,eventImpactRows,eventImpactOptions);
  const eventImpactEstimate=eventImpactQuery
    ? estimateEventImpact(eventImpactMemory,eventImpactQuery)
    : null;

  const liquiditySnapshot=orderBook
    ? analyzeLiquiditySnapshot(t,orderBook,liquidityOptions)
    : null;
  const liquidityMap=liquiditySnapshot&&liquiditySnapshot.status!=='INVALID'
    ? buildLiquidityMap({
        snapshot:liquiditySnapshot,
        swings:liquidityContext?.swings,
        roundNumbers:liquidityContext?.roundNumbers,
        liquidationClusters:liquidityContext?.liquidationClusters
      })
    : null;
  const liquidityReaction=liquiditySnapshot&&liquiditySnapshot.status==='OK'
    ? inferLiquidityReaction(liquidityContext?.reactionInputs??{})
    : null;

  const traderWalletEvidence=traderWallet
    ? buildTraderWalletEvidence({asOf:t,...traderWallet})
    : null;

  const memecoinEvidence=memecoin
    ? buildMemecoinEvidence({asOf:t,...memecoin})
    : null;

  const narrativeEvidence=narrative
    ? buildNarrativeReflexivityEvidence({asOf:t,...narrative})
    : null;

  const futureIntelligenceEvidence=futureIntelligence
    ? buildFutureIntelligenceEvidence({asOf:t,...futureIntelligence})
    : null;

  const activeGates=[
    sourceReliability.gate,
    eventImpactMemory.gate,
    ...(sourceClassification?[sourceClassification.gate]:[]),
    ...(liquiditySnapshot?[liquiditySnapshot.gate]:[]),
    ...(traderWalletEvidence?[traderWalletEvidence.evidenceGate]:[]),
    ...(memecoinEvidence?[memecoinEvidence.evidenceGate]:[]),
    ...(narrativeEvidence?[narrativeEvidence.evidenceGate]:[])
    // Future Intelligence is intentionally excluded from the fast evidence gate.
  ];

  const evidenceGate=strictest(activeGates);
  const reasons=[
    ...(sourceReliability.reasons||[]).map(x=>'SOURCE:'+x),
    ...(sourceClassification?.reasons||[]).map(x=>'SOURCE_EVENT:'+x),
    ...(eventImpactMemory.reasons||[]).map(x=>'EVENT_IMPACT:'+x),
    ...(liquiditySnapshot?.reasons||[]).map(x=>'LIQUIDITY:'+x),
    ...(traderWalletEvidence?.reasons||[]).map(x=>'TRADER_WALLET:'+x),
    ...(memecoinEvidence?.reasons||[]).map(x=>'MEMECOIN:'+x),
    ...(narrativeEvidence?.reasons||[]).map(x=>'NARRATIVE:'+x)
  ];

  const core={
    version:INSTITUTIONAL_EXPANSION_VERSION,
    asOf:t,
    sourceReliability,
    sourceClassification,
    eventImpactMemory,
    eventImpactEstimate,
    liquiditySnapshot,
    liquidityMap,
    liquidityReaction,
    traderWalletEvidence,
    memecoinEvidence,
    narrativeEvidence,
    futureIntelligenceEvidence,
    evidenceGate,
    reasons:[...new Set(reasons)],
    provenance:{
      expansionPackHash:EXPANSION_PACK_PROVENANCE_HASH,
      source:'TCX_V3_EXPANSION_PACK_INSTITUTIONAL_ADAPTATION'
    },
    epistemic:{
      evidenceGate:'EVIDENCE_DIAGNOSTIC_NOT_FORECAST_PROBABILITY',
      sourceReliability:'EMPIRICAL_POST_OUTCOME',
      eventImpact:'EMPIRICAL_POST_OUTCOME_NOT_CAUSAL',
      liquidity:'OBSERVED_PLUS_DERIVED_MICROSTRUCTURE',
      traderWallet:'EMPIRICAL_POST_OUTCOME_NOT_CAUSAL',
      memecoin:'OBSERVED_RISK_AND_ACTIVITY_NOT_FORECAST_PROBABILITY',
      narrative:'OBSERVED_DISCOURSE_AND_REFLEXIVITY_HYPOTHESIS_NOT_CAUSAL',
      futureIntelligence:'SLOW_HORIZON_SCENARIO_EVIDENCE_SEPARATE_FROM_FAST_FORECAST'
    },
    restrictions:{
      mayExecute:false,
      mayRouteStrategy:false,
      mayMutateForecast:false,
      mayBypassInstitutionalAdmission:false
    },
    executionMode:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecute:false
  };

  return Object.freeze({...core,fingerprint:sha256(core)});
}

export function verifyInstitutionalExpansionEvidence(value){
  try{
    if(value?.version!==INSTITUTIONAL_EXPANSION_VERSION) return {ok:false,reasons:['VERSION_INVALID']};
    if(value?.executionMode!=='SHADOW_ONLY') return {ok:false,reasons:['EXECUTION_MODE_INVALID']};
    if(value?.action!=='ABSTAIN'||value?.canExecute!==false) return {ok:false,reasons:['EXECUTION_INVARIANT_INVALID']};
    if(value?.restrictions?.mayBypassInstitutionalAdmission!==false) return {ok:false,reasons:['ADMISSION_BYPASS_INVALID']};
    const {fingerprint,...core}=value;
    const expected=sha256(core);
    return fingerprint===expected
      ? {ok:true,reasons:[],expectedFingerprint:expected}
      : {ok:false,reasons:['FINGERPRINT_MISMATCH'],expectedFingerprint:expected};
  }catch(err){
    return {ok:false,reasons:['EXPANSION_EVIDENCE_INVALID',err instanceof Error?err.message:String(err)]};
  }
}
