// Candidate identities frozen from BIGGJ Discovery run 36525765767.
// IMPORTANT: thresholds are intentionally NOT claimed to be frozen from that artifact;
// the artifact aggregated them away. Thresholds must be fitted once on pre-holdout data,
// serialized, hashed, and never refit on holdout data.
export const FROZEN_CANDIDATE_SPECS=Object.freeze([
 Object.freeze({id:'C1_1H_12H_VOL3_VOL6',interval:'1h',horizon:12,features:Object.freeze(['volatility_3','volatility_6']),sides:Object.freeze([1,-1])}),
 Object.freeze({id:'C2_1H_12H_VOL3_VR6',interval:'1h',horizon:12,features:Object.freeze(['volatility_3','volume_ratio_6']),sides:Object.freeze([1,1])}),
 Object.freeze({id:'C3_1H_12H_VOL6_VR6',interval:'1h',horizon:12,features:Object.freeze(['volatility_6','volume_ratio_6']),sides:Object.freeze([1,1])})
]);
