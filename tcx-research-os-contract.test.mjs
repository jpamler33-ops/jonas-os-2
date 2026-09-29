import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TCX_RESEARCH_OS_CANON_VERSION,
  TCX_RESEARCH_OS_DNA,
  TCX_EPISTEMIC_CLASSES,
  tcxResearchOsContract,
  verifyTcxResearchOsDecisionEnvelope,
  verifyTcxPromotionCandidate,
  assertTcxResearchOsLayerDependency
} from './tcx-research-os-contract.mjs';

test('canonical Research OS DNA preserves the epistemic sequence',()=>{
  assert.deepEqual([...TCX_RESEARCH_OS_DNA],[
    'POINT_IN_TIME_TRUTH',
    'EVIDENCE',
    'DISAGREEMENT',
    'CALIBRATED_UNCERTAINTY',
    'INVALIDATION',
    'ABSTAIN',
    'AUDIT',
    'LEARNING'
  ]);
  assert.deepEqual([...TCX_EPISTEMIC_CLASSES],['OBSERVED','INFERRED','MODELLED','ASSUMED']);
  const c=tcxResearchOsContract();
  assert.equal(c.version,TCX_RESEARCH_OS_CANON_VERSION);
  assert.equal(c.invariants.execution,'SHADOW_ONLY');
  assert.equal(c.invariants.canExecuteLive,false);
  assert.equal(c.invariants.silentPrimarySelfModificationAllowed,false);
});

test('failure-first envelope forces ABSTAIN when critical uncertainty remains',()=>{
  const x=verifyTcxResearchOsDecisionEnvelope({
    execution:'SHADOW_ONLY',
    canExecuteLive:false,
    action:'BUY',
    pointInTime:true,
    futureLeakage:false,
    epistemicClass:'MODELLED',
    provenanceReady:true,
    auditReady:true,
    uncertaintyReady:true,
    invalidationReady:true,
    criticalDisagreement:true,
    criticalUnknowns:[]
  });
  assert.equal(x.ok,false);
  assert.equal(x.gate,'ABSTAIN');
  assert.ok(x.reasons.includes('FAILURE_FIRST_REQUIRES_ABSTAIN'));
});

test('complete research envelope can pass while contract itself remains non-executing',()=>{
  const x=verifyTcxResearchOsDecisionEnvelope({
    execution:'SHADOW_ONLY',
    canExecuteLive:false,
    action:'ABSTAIN',
    pointInTime:true,
    futureLeakage:false,
    epistemicClass:'MODELLED',
    provenanceReady:true,
    auditReady:true,
    uncertaintyReady:true,
    invalidationReady:true,
    criticalDisagreement:false,
    criticalUnknowns:[]
  });
  assert.equal(x.ok,true);
  assert.equal(x.gate,'PASS');
  assert.equal(x.action,'ABSTAIN');
  assert.equal(x.canExecuteLive,false);
});

test('PRIMARY promotion requires forward shadow calibration stress and stability',()=>{
  const blocked=verifyTcxPromotionCandidate({
    stage:'PRIMARY',
    pointInTimeSafe:true,
    futureLeakageDetected:false,
    auditReproducible:true,
    scientificGuardsPassed:true,
    forwardShadowPassed:false,
    calibrationPassed:true,
    stressPassed:true,
    chronologicalStabilityPassed:true,
    concentrationChecksPassed:true,
    edgeDecayClear:true
  });
  assert.equal(blocked.promotable,false);
  assert.ok(blocked.reasons.includes('FORWARD_SHADOW_REQUIRED'));

  const pass=verifyTcxPromotionCandidate({
    stage:'PRIMARY',
    pointInTimeSafe:true,
    futureLeakageDetected:false,
    auditReproducible:true,
    scientificGuardsPassed:true,
    forwardShadowPassed:true,
    calibrationPassed:true,
    stressPassed:true,
    chronologicalStabilityPassed:true,
    concentrationChecksPassed:true,
    edgeDecayClear:true
  });
  assert.equal(pass.promotable,true);
  assert.equal(pass.canExecuteLive,false);
});

test('downstream trading/UI cannot become upstream truth source',()=>{
  const good=assertTcxResearchOsLayerDependency({
    consumerLayer:'SHADOW_DECISION_CONSUMERS',
    dependencyLayer:'FORECAST_INTELLIGENCE'
  });
  assert.equal(good.ok,true);

  const bad=assertTcxResearchOsLayerDependency({
    consumerLayer:'FORECAST_INTELLIGENCE',
    dependencyLayer:'SHADOW_DECISION_CONSUMERS'
  });
  assert.equal(bad.ok,false);
  assert.equal(bad.reason,'DOWNSTREAM_OR_PEER_TRUTH_DEPENDENCY_BLOCKED');
});
