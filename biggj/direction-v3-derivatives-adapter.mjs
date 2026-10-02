import {buildDerivativesState} from './derivatives-state.mjs';
export function derivativesEvidenceForDirectionV3(observations,{asOf=new Date().toISOString()}={}){
  const state=buildDerivativesState(observations,{asOf});
  const usable=state.quality.usableForDirectionalFeature;
  let signal='ABSTAIN',reason='DERIVATIVES_NOT_QUALIFIED';
  if(usable){
    if(state.funding.consensus==='ALIGNED'&&state.funding.median>0){
      signal='CROWDED_LONG_PRESSURE';
      reason='FUNDING_POSITIVE_CROSS_PROVIDER';
    }else if(state.funding.consensus==='ALIGNED'&&state.funding.median<0){
      signal='CROWDED_SHORT_PRESSURE';
      reason='FUNDING_NEGATIVE_CROSS_PROVIDER';
    }
  }
  return Object.freeze({
    schema:'BIGGJ_DIRECTION_V3_DERIVATIVES_EVIDENCE_V1',
    asOf,
    classification:'OBSERVED_DERIVED',
    execution:'SHADOW_ONLY',
    canExecuteLive:false,
    signal,
    reason,
    features:{
      fundingMedian:state.funding.median,
      fundingConsensus:state.funding.consensus,
      providerCount:state.providerCount,
      comparableFundingProviderCount:state.funding.comparableProviderCount,
      markPriceMedian:state.markPrice.median
    },
    guards:{
      qualified:usable,
      crossProviderConflict:state.quality.crossProviderConflict,
      fundingUnitsVerified:state.funding.comparableProviderCount>=2,
      oiAggregationDisabled:true
    },
    state
  });
}
