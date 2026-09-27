import { sha256 } from '../institutional-kernel.mjs';

export const EXPANSION_PACK_PROVENANCE_VERSION='TCX_EXPANSION_PACK_PROVENANCE_V1';

export const EXPANSION_PACK_PROVENANCE=Object.freeze({
  package:{
    name:'tcx-v3-expansion-pack',
    version:'3.0.0-alpha.insertable.1',
    createdAt:'2026-09-27',
    zipSha256:'e15a7c66bbbdcfcb8c3680842e0071e2728cb872592b455b073fd218681f2180',
    manifestSha256:'0f9acc67c5a032e6787c2fd2d6616008bd9d35b7d0ba87644d29370acd3f9209'
  },
  sourceFiles:{
    sourceIntelligence:'3b580af8123faf59a585f8e0a7b9443f6e9241f26a960ad71cd0b99abd457785',
    eventImpact:'fdb6074b813b9f80a0232d411926f92295af7af144922d8338f7f96afdb06cfe',
    liquidityIntelligence:'7ea378bb228113d412a4adcaa5e7186acda957e9382bb45da291101636f6e86b',
    handoff:'2df575af19bddef8a5d2746d729e6651a04101eb8f7763ee115b4c20707f6c55',
    mergePlaybook:'b52329fde05082450306a6b8fce9557be2cdbe4a6a37409435f3d6191ee75cd1'
  },
  importedAsInstitutionalAdaptations:[
    'SOURCE_INTELLIGENCE',
    'EVENT_IMPACT_MEMORY',
    'LIQUIDITY_INTELLIGENCE'
  ],
  intentionallyNotCopiedWholesale:true,
  invariants:{
    executionMode:'SHADOW_ONLY',
    canExecuteLive:false,
    duplicateTruthForbidden:true,
    sourceScoresAreNotForecastProbability:true
  }
});

export const EXPANSION_PACK_PROVENANCE_HASH=sha256(EXPANSION_PACK_PROVENANCE);

export function verifyExpansionPackProvenance(value=EXPANSION_PACK_PROVENANCE){
  const hash=sha256(value);
  return {
    ok:hash===EXPANSION_PACK_PROVENANCE_HASH,
    hash,
    expectedHash:EXPANSION_PACK_PROVENANCE_HASH
  };
}
