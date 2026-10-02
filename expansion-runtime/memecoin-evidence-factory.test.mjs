import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createMemecoinEvidenceFactoryState,
  observeMemecoinEvidence,
  dueMemecoinEvidenceFollowups,
  recordMemecoinEvidenceFollowupAttempt,
  memecoinEvidenceFactorySummary,
  MEMECOIN_EVIDENCE_FACTORY_VERSION
} from './memecoin-evidence-factory.mjs';

function row({
  token='T1',chain='solana',price=1,stage='EARLY',age=8,liq=50_000,
  buys=12,sells=6,p5=12,gate='PASS',attention='RISING'
}={}){
  return {
    chainId:chain,tokenAddress:token,pairAddress:'PAIR_'+token,symbol:token,name:token,
    priceUsd:price,liquidityUsd:liq,marketCap:250_000,fdv:300_000,
    volumeM5:20_000,volumeH1:70_000,buysM5:buys,sellsM5:sells,
    priceChangeM5:p5,priceChangeH1:35,pairCreatedAt:1_000_000-age*60_000,
    firstSeenAt:1_000_000,
    signalNewPool:true,
    directSocialAttention:{posts:3,uniqueAuthors:2,engagement:40,attentionBand:attention},
    score:{stage,ageMinutes:age,researchPriorityScore:.7,attentionSignals:['SOCIAL_POSTS_RECENT'],riskFlags:[]},
    security:{evidenceGate:gate,source:'GOPLUS+RUGCHECK',coverage:{holderConcentrationIndependent:true},holderState:{top10Share:.30,largestHolderShare:.08}},
    memeLearning:{action:'NEUTRAL'}
  };
}

test('every discovered token becomes one independent PIT case, not one case per counterfactual',()=>{
  let state=createMemecoinEvidenceFactoryState();
  state=observeMemecoinEvidence(state,[row({token:'A'}),row({token:'B'})],{now:1_000_000}).state;
  const s=memecoinEvidenceFactorySummary(state,{asOf:1_000_000});
  assert.equal(s.version,MEMECOIN_EVIDENCE_FACTORY_VERSION);
  assert.equal(s.independentCases,2);
  assert.equal(s.counterfactuals.immediate.independentCases,0);
  assert.equal(state.cases[0].initial.discoverySignals.includes('NEW_POOL'),true);
  assert.equal(s.policyMutationAllowed,false);
  assert.equal(s.canExecuteLive,false);
});

test('fixed horizon observations are point-in-time and record lateness quality',()=>{
  let state=createMemecoinEvidenceFactoryState();
  state=observeMemecoinEvidence(state,[row({token:'A',price:1})],{now:1_000_000}).state;
  state=observeMemecoinEvidence(state,[row({token:'A',price:1.2})],{now:1_000_000+5*60_000}).state;
  const c=state.cases[0];
  assert.equal(c.observations['5m'].quality,'ON_TIME');
  assert.equal(Number(c.observations['5m'].returnFromInitial.toFixed(4)),.2);

  state=observeMemecoinEvidence(state,[row({token:'A',price:.7})],{now:1_000_000+25*60_000}).state;
  assert.equal(state.cases[0].observations['15m'].quality,'LATE');
});

test('due followups prioritize the next horizon and failed attempts are throttled',()=>{
  let state=createMemecoinEvidenceFactoryState();
  state=observeMemecoinEvidence(state,[row({token:'A'})],{now:2_000_000}).state;
  let due=dueMemecoinEvidenceFollowups(state,{asOf:2_000_000+5*60_000,max:3,minRetryMs:60_000});
  assert.equal(due.length,1);
  assert.equal(due[0].horizon,'5m');

  state=recordMemecoinEvidenceFollowupAttempt(state,due[0].key,{at:2_000_000+5*60_000,error:'HTTP_429'}).state;
  due=dueMemecoinEvidenceFollowups(state,{asOf:2_000_000+5*60_000+15_000,max:3,minRetryMs:60_000});
  assert.equal(due.length,0);
});

test('counterfactual lab uses discrete checkpoint semantics and does not inflate evidence count',()=>{
  let state=createMemecoinEvidenceFactoryState();
  state=observeMemecoinEvidence(state,[row({token:'A',price:1})],{now:3_000_000}).state;
  const points=[
    [5,1.1],[15,.8],[30,.6],[60,.5],[240,1.7],[720,2.0],[1440,2.2]
  ];
  for(const [mins,price] of points){
    state=observeMemecoinEvidence(state,[row({token:'A',price})],{now:3_000_000+mins*60_000}).state;
  }
  const s=memecoinEvidenceFactorySummary(state,{asOf:3_000_000+1440*60_000});
  assert.equal(s.independentCases,1);
  assert.equal(s.counterfactuals.immediate.independentCases,1);
  assert.equal(s.counterfactuals.delay5m.independentCases,1);
  assert.match(s.counterfactuals.semantics,/DO_NOT_INCREASE_INDEPENDENT_CASE_COUNT/);
});

test('pathological price-ratio jumps are quarantined instead of poisoning counterfactual averages',()=>{
  let state=createMemecoinEvidenceFactoryState();
  state=observeMemecoinEvidence(state,[row({token:'Q',price:1e-12})],{now:4_000_000}).state;
  state=observeMemecoinEvidence(state,[row({token:'Q',price:1e-12})],{now:4_000_000+5*60_000}).state;
  state=observeMemecoinEvidence(state,[row({token:'Q',price:1e-3})],{now:4_000_000+15*60_000}).state;

  const s=memecoinEvidenceFactorySummary(state,{asOf:4_000_000+15*60_000});
  assert.equal(s.counterfactuals.delay5m.independentCases,1);
  assert.equal(s.counterfactuals.delay5m.usableCases,0);
  assert.equal(s.counterfactuals.delay5m.quarantinedCases,1);
  assert.equal(s.counterfactuals.delay5m.averageFinalReturn,null);
  assert.equal(s.counterfactuals.delay5m.quarantineReasons.EXTREME_PRICE_RATIO_QUARANTINED,1);
  assert.ok(s.counterfactuals.delay5m.largestRawAbsReturn>1e8);
  assert.equal(s.counterfactuals.delay5m.qualityGuard.action,'QUARANTINE_NOT_CLIP');
  assert.equal(s.returnQualityGuard.rawObservationPreserved,true);
});

test('large but non-pathological moonshots remain usable and are not clipped',()=>{
  let state=createMemecoinEvidenceFactoryState();
  state=observeMemecoinEvidence(state,[row({token:'M',price:1})],{now:5_000_000}).state;
  state=observeMemecoinEvidence(state,[row({token:'M',price:2})],{now:5_000_000+5*60_000}).state;
  state=observeMemecoinEvidence(state,[row({token:'M',price:200})],{now:5_000_000+15*60_000}).state;

  const s=memecoinEvidenceFactorySummary(state,{asOf:5_000_000+15*60_000});
  assert.equal(s.counterfactuals.delay5m.independentCases,1);
  assert.equal(s.counterfactuals.delay5m.usableCases,1);
  assert.equal(s.counterfactuals.delay5m.quarantinedCases,0);
  assert.equal(Number(s.counterfactuals.delay5m.averageFinalReturn.toFixed(2)),99);
});

test('old persisted raw returns are requalified from prices during summary',()=>{
  let state=createMemecoinEvidenceFactoryState();
  state=observeMemecoinEvidence(state,[row({token:'OLD',price:1e-12})],{now:6_000_000}).state;
  state=observeMemecoinEvidence(state,[row({token:'OLD',price:1e-12})],{now:6_000_000+5*60_000}).state;
  state=observeMemecoinEvidence(state,[row({token:'OLD',price:1e-3})],{now:6_000_000+15*60_000}).state;
  const persisted=JSON.parse(JSON.stringify(state));
  persisted.cases[0].observations['15m'].returnFromInitial=1e27;

  const s=memecoinEvidenceFactorySummary(persisted,{asOf:6_000_000+15*60_000});
  assert.equal(s.byHorizon['15m'].quarantined,1);
  assert.equal(s.byHorizon['15m'].usable,0);
  assert.equal(s.byHorizon['15m'].averageReturn,null);
  assert.equal(s.returnQualityGuard.quarantineReasons.EXTREME_PRICE_RATIO_QUARANTINED,1);
});

test('walk-forward miner stays research-only even when a repeated pattern validates',()=>{
  let state=createMemecoinEvidenceFactoryState();
  let now=10_000_000;
  for(let i=0;i<42;i++){
    const token='P'+i;
    state=observeMemecoinEvidence(state,[row({token,price:1,chain:'solana',stage:'EARLY',age:8,liq:50_000,buys:14,sells:5})],{now}).state;
    state=observeMemecoinEvidence(state,[row({token,price:1.25,chain:'solana',stage:'EARLY',age:8,liq:50_000,buys:14,sells:5})],{now:now+60*60_000}).state;
    now+=2*60*60_000;
  }
  const s=memecoinEvidenceFactorySummary(state,{asOf:now,minPatternTrain:20,minPatternValidate:8});
  assert.equal(s.patternMiner.walkForward1h.matureCases,42);
  assert.ok(s.patternMiner.walkForward1h.patterns.length>0);
  assert.equal(s.patternMiner.walkForward1h.patterns[0].decisionAuthority,false);
  assert.equal(s.automaticPromotionAllowed,false);
  assert.equal(s.policyMutationAllowed,false);
});

test('security ABSTAIN and UNKNOWN cases are still research evidence cases',()=>{
  let state=createMemecoinEvidenceFactoryState();
  state=observeMemecoinEvidence(state,[
    row({token:'PASS',gate:'PASS'}),
    row({token:'ABSTAIN',gate:'ABSTAIN'}),
    row({token:'UNKNOWN',gate:'UNKNOWN'})
  ],{now:20_000_000}).state;
  assert.equal(state.cases.length,3);
  assert.deepEqual(state.cases.map(x=>x.initial.securityGate).sort(),['ABSTAIN','PASS','UNKNOWN']);
});
