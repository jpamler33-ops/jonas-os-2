import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TCX_RESEARCH_OS_VERSION,
  TCX_EPISTEMIC_CLASSES,
  tcxResearchOsManifest,
  createTcxEpistemicClaim,
  validateTcxEpistemicClaims,
  evaluateTcxResearchOperatingState
} from './tcx-research-os.mjs';
import { evaluateScientificValidity } from './scientific-validity.mjs';
import { evaluateEpistemicIntegrity } from './science-runtime/epistemic-integrity.mjs';
import { createResearchTrace } from './research-trace.mjs';
import { runMechanismTransitionEngine } from './mechanism-transition-engine.mjs';

const H='a'.repeat(64),G='b'.repeat(64),I='c'.repeat(64),S='d'.repeat(64);

function epistemicBundle(){
  return {
    asOf:1000,
    subjectId:'MODEL:CAND-1',
    authorities:[
      {authorityId:'AUTH-1',canonicalControllerId:'AUTH-CONTROL-1',observedAt:700,availableAt:710},
      {authorityId:'AUTH-2',canonicalControllerId:'AUTH-CONTROL-2',observedAt:705,availableAt:715}
    ],
    resolverClaims:[
      {id:'R1',subjectId:'MODEL:CAND-1',canonicalControllerId:'CTRL-1',resolverId:'RES-1',authorityId:'AUTH-1',operatorDomain:'OP-1',trustDomain:'TRUST-1',controlDomain:'CONTROL-1',signed:true,signatureValid:true,observedAt:800,availableAt:810,provenanceIds:['L1']},
      {id:'R2',subjectId:'MODEL:CAND-1',canonicalControllerId:'CTRL-1',resolverId:'RES-2',authorityId:'AUTH-2',operatorDomain:'OP-2',trustDomain:'TRUST-2',controlDomain:'CONTROL-2',signed:true,signatureValid:true,observedAt:820,availableAt:830,provenanceIds:['L2']}
    ],
    claims:[{claimId:'C1',assumptionIds:['A1'],evidenceIds:['E1','E2'],required:true}],
    assumptions:[{assumptionId:'A1'}],
    dependencies:[],
    lineageFacts:[
      {id:'L1',classification:'OBSERVED',parentIds:[],observedAt:600,availableAt:610},
      {id:'L2',classification:'OBSERVED',parentIds:[],observedAt:620,availableAt:630}
    ],
    discoveryChannels:[
      {channelId:'D1',controllerId:'DC1',lineageIds:['L1'],observedAt:850,availableAt:860},
      {channelId:'D2',controllerId:'DC2',lineageIds:['L2'],observedAt:855,availableAt:865}
    ],
    evidence:[
      {evidenceId:'E1',classification:'OBSERVED',observedAt:700,availableAt:720,provenanceIds:['L1']},
      {evidenceId:'E2',classification:'OBSERVED',observedAt:730,availableAt:740,provenanceIds:['L2']},
      {evidenceId:'EC',classification:'OBSERVED',observedAt:750,availableAt:760,provenanceIds:['L1','L2']}
    ],
    coverage:{observedLineages:2,expectedLineages:2,minimumCoverage:.8,calibrated:true,calibrationEvidenceId:'EC'}
  };
}
function mechanism(){
  return runMechanismTransitionEngine({
    analysis:{lastClose:100,ema20:101,ema50:100,support:98,resistance:103,trend:'BULLISH',pattern:null},
    dashboard:{biasScore:4,pressureScore:55,spreadBps:1.2,imbalance:.28,atrPct:.5,realizedVolPct:.25,volumeRatio:1.5,emaGapPct:.8,supportDistancePct:.6,resistanceDistancePct:1.2,regime:'TREND_ORDERLY',localTrend:'BULLISH',liquidity:'NORMAL',flow:'BID_PRESSURE',dominantPressure:'FLOW_SKEW',patternStage:'NONE',patternSide:'NONE'},
    episodes:[],
    symbol:'BTCUSDT',
    horizonMinutes:15
  });
}
function trace(){
  return createResearchTrace({
    symbol:'BTCUSDT',
    asOf:1000,
    generatedAt:1000,
    data:{fabricSeq:42,fabricTailHash:H,inputFingerprint:I},
    release:{releaseId:'r1',configHash:G},
    researchState:{fingerprint:S,regime:'TREND'},
    evidence:[{id:'E1'}],
    contradictions:[],
    forecast:{id:'F1'},
    science:{gate:'PASS'},
    safety:{state:'NORMAL',execution:'SHADOW_ONLY',canExecute:false},
    validity:{state:'VALID',reasons:[]},
    provenance:{source:'TCX_TEST',version:'1'}
  });
}

test('manifest defines one canonical layered research OS',()=>{
  const m=tcxResearchOsManifest();
  assert.equal(m.version,TCX_RESEARCH_OS_VERSION);
  assert.equal(m.execution,'SHADOW_ONLY');
  assert.equal(m.canExecuteLive,false);
  assert.ok(m.layers.some(x=>x.id==='TEMPORAL_MARKET_FABRIC'));
  assert.ok(m.layers.some(x=>x.id==='EVIDENCE_MESH'));
  assert.ok(m.layers.some(x=>x.id==='MECHANISM_RIFT'));
  assert.ok(m.layers.some(x=>x.id==='FORECAST_INTELLIGENCE'));
  assert.ok(m.layers.some(x=>x.id==='STRATEGY_CHALLENGERS'));
});

test('epistemic classes stay explicit and OBSERVED requires provenance',()=>{
  assert.deepEqual([...TCX_EPISTEMIC_CLASSES],['OBSERVED','INFERRED','MODELLED','ASSUMED']);
  assert.throws(()=>createTcxEpistemicClaim({statement:'price rose',epistemicClass:'OBSERVED',asOf:1000}),/provenance/);
  const c=createTcxEpistemicClaim({
    statement:'price rose',
    epistemicClass:'OBSERVED',
    asOf:1000,
    provenance:[{source:'FABRIC',recordHash:H}]
  });
  assert.equal(validateTcxEpistemicClaims([c],{asOf:1000}).ok,true);
});

test('future or tampered claims fail closed',()=>{
  const c=structuredClone(createTcxEpistemicClaim({
    statement:'model says expansion risk increased',
    epistemicClass:'MODELLED',
    asOf:1000,
    provenance:[]
  }));
  c.asOf=1001;
  const v=validateTcxEpistemicClaims([c],{asOf:1000});
  assert.equal(v.ok,false);
  assert.ok(v.reasons.includes('CLAIM_FROM_FUTURE'));
  assert.ok(v.reasons.includes('FINGERPRINT_INVALID'));
});

test('OS fails closed when required layers are absent',()=>{
  const r=evaluateTcxResearchOperatingState({asOf:1000});
  assert.equal(r.operatingState,'ABSTAIN');
  assert.equal(r.invariants.action,'ABSTAIN');
  assert.equal(r.invariants.canExecuteLive,false);
  assert.ok(r.reasons.includes('PIT_NOT_CONFIRMED'));
  assert.ok(r.reasons.includes('SCIENTIFIC_VALIDITY_MISSING'));
  assert.ok(r.reasons.includes('RESEARCH_TRACE_MISSING'));
});

test('fully supplied PIT research state can become RESEARCH_READY without enabling execution',()=>{
  const science=evaluateScientificValidity({
    asOf:1000,
    guards:[
      {id:'SUPPORT',report:{asOf:1000,gate:'PASS',executionMode:'SHADOW_ONLY'}},
      {id:'INTEGRITY',report:{asOf:1000,gate:'PASS',executionMode:'SHADOW_ONLY'}}
    ]
  });
  const epistemic=evaluateEpistemicIntegrity(epistemicBundle());
  const claim=createTcxEpistemicClaim({
    statement:'BTCUSDT point-in-time market snapshot is available',
    epistemicClass:'OBSERVED',
    asOf:1000,
    provenance:[{source:'MARKET_FABRIC',recordHash:H}]
  });
  const r=evaluateTcxResearchOperatingState({
    asOf:1000,
    temporal:{pitSafe:true,futureLeakage:false,fabricHealthy:true,maxInputAvailableAt:1000,futureInputCount:0},
    evidence:{dependencyGraphHealthy:true,provenanceComplete:true,independenceChecked:true,commonCauseChecked:true,contradictionCoverage:1},
    claims:[claim],
    mechanism:mechanism(),
    scientificValidity:science,
    epistemicIntegrity:epistemic,
    researchTrace:trace(),
    forecast:{present:true,calibrated:true,uncertaintyDefined:true,invalidationDefined:true,multiHorizon:true},
    learning:{versionedChangesOnly:true,silentProductionMutation:false,challengerIsolation:true},
    promotion:{productionMutationPerformed:false,promotionGateBypassed:false,candidateVersioned:true}
  });
  assert.equal(r.operatingState,'RESEARCH_READY');
  assert.deepEqual(r.reasons,[]);
  assert.equal(r.invariants.execution,'SHADOW_ONLY');
  assert.equal(r.invariants.action,'ABSTAIN');
  assert.equal(r.invariants.canExecuteLive,false);
  assert.equal(r.invariants.silentSelfModification,false);
});
