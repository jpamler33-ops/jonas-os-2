import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateMemecoinEntrySignal,
  applyMemecoinEntrySignals,
  MEMECOIN_SIGNAL_CONTROLLER_VERSION
} from './memecoin-signal-controller.mjs';

function strong(overrides={}){
  return {
    chainId:'solana',tokenAddress:'ABC',symbol:'ABC',priceUsd:.001,liquidityUsd:80_000,
    volumeM5:30_000,buysM5:24,sellsM5:10,priceChangeM5:18,
    score:{
      stage:'NEW_NOW',researchPriorityScore:.80,
      attentionSignals:['SOCIAL_ATTENTION_SPIKE','X_DIRECT_POST'],riskFlags:[]
    },
    directSocialAttention:{posts:5,uniqueAuthors:4,attentionBand:'SPIKING'},
    security:{evidenceGate:'PASS',criticalRiskFlags:[],warningFlags:[]},
    memeLearning:{action:'BOOST'},
    ...overrides
  };
}

test('strong multi-pillar candidate gets explicit BUY authority for paper entry',()=>{
  const out=evaluateMemecoinEntrySignal(strong());
  assert.equal(out.version,MEMECOIN_SIGNAL_CONTROLLER_VERSION);
  assert.equal(out.action,'BUY');
  assert.equal(out.label,'🟢 KAUFEN');
  assert.ok(out.triggerCount>=3);
  assert.ok(out.entryReadinessScore>=.72);
  assert.equal(out.canExecuteLive,false);
});

test('security uncertainty fails closed and can never emit BUY',()=>{
  const out=evaluateMemecoinEntrySignal(strong({
    security:{evidenceGate:'UNKNOWN',criticalRiskFlags:[],warningFlags:['SOURCE_UNAVAILABLE']}
  }));
  assert.equal(out.action,'BLOCKED');
  assert.ok(out.blockers.includes('SECURITY_NOT_PASS'));
});

test('good foundation without enough trigger pillars stays READY not BUY',()=>{
  const out=evaluateMemecoinEntrySignal(strong({
    volumeM5:2_000,buysM5:5,sellsM5:5,priceChangeM5:0,
    score:{stage:'EARLY',researchPriorityScore:.74,attentionSignals:[],riskFlags:[]},
    directSocialAttention:{posts:0,uniqueAuthors:0,attentionBand:'NONE'},
    memeLearning:{action:'NEUTRAL'}
  }));
  assert.equal(out.action,'READY');
  assert.ok(out.triggerCount<3);
});

test('learned destructive throttle cannot be promoted to BUY even with strong raw market data',()=>{
  const out=evaluateMemecoinEntrySignal(strong({memeLearning:{action:'THROTTLE'}}));
  assert.notEqual(out.action,'BUY');
  assert.ok(out.missing.includes('LEARNED_DESTRUCTIVE_COHORT_THROTTLED'));
});

test('snapshot enrichment exposes controller counts and preserves shadow-only invariants',()=>{
  const out=applyMemecoinEntrySignals({sourceReady:true,rows:[
    strong(),
    strong({tokenAddress:'NO',security:{evidenceGate:'ABSTAIN',criticalRiskFlags:['HONEYPOT_FLAGGED']}})
  ]});
  assert.equal(out.rows.length,2);
  assert.equal(out.signalController.counts.BUY,1);
  assert.equal(out.signalController.counts.BLOCKED,1);
  assert.equal(out.signalController.canExecuteLive,false);
});
