import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTraderWalletEvidence, verifyTraderWalletEvidence } from './trader-wallet-intelligence.mjs';

const controls={
  resolution:{confidence:.95,method:'PUBLIC_ADDRESS_CLUSTER'},
  selection:{survivorshipControlled:true,windowLocked:true,inclusionRuleLocked:true,cohortId:'cohort-1',minSamples:2},
  costs:{feeBps:10,slippageBps:5}
};

test('wallet evidence is PIT-safe, cost-adjusted and non-executable',()=>{
  const e=buildTraderWalletEvidence({
    asOf:1000,entityId:'cluster:abc',
    observations:[
      {availableAt:900,returnPct:.02,source:'PUBLIC_CHAIN'},
      {availableAt:950,returnPct:-.01,source:'PUBLIC_CHAIN'},
      {availableAt:1001,returnPct:9,source:'FUTURE_BAD'}
    ],
    ...controls
  });
  assert.equal(e.performance.sampleSize,2);
  assert.equal(e.audit.futureRejected,1);
  assert.equal(e.canExecute,false);
  assert.equal(e.action,'ABSTAIN');
  assert.equal(e.executionMode,'SHADOW_ONLY');
  assert.equal(e.epistemic.causality,'NOT_IDENTIFIED');
  assert.equal(verifyTraderWalletEvidence(e).ok,true);
});

test('survivorship or entity-resolution failure forces abstention',()=>{
  const e=buildTraderWalletEvidence({
    asOf:1000,entityId:'cluster:abc',
    observations:[{availableAt:900,returnPct:.02}],
    resolution:{confidence:.4},
    selection:{survivorshipControlled:false,windowLocked:false,inclusionRuleLocked:false,minSamples:1}
  });
  assert.equal(e.evidenceGate,'ABSTAIN');
  assert.ok(e.reasons.includes('SURVIVORSHIP_BIAS_UNCONTROLLED'));
  assert.ok(e.reasons.includes('ENTITY_RESOLUTION_INSUFFICIENT'));
});

test('fingerprint detects mutation',()=>{
  const e=buildTraderWalletEvidence({
    asOf:1000,entityId:'cluster:abc',
    observations:[{availableAt:900,returnPct:.02},{availableAt:950,returnPct:.01}],
    ...controls
  });
  const x=structuredClone(e);
  x.performance.hitRate=0;
  assert.equal(verifyTraderWalletEvidence(x).ok,false);
});
