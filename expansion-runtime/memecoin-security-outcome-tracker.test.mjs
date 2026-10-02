import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createMemecoinSecurityOutcomeState,
  observeMemecoinSecurityOutcomes,
  dueMemecoinSecurityOutcomeFollowups,
  memecoinSecurityOutcomeSummary,
  MEMECOIN_SECURITY_OUTCOME_TRACKER_VERSION
} from './memecoin-security-outcome-tracker.mjs';

function row({
  chainId='solana',
  tokenAddress='TOKEN1',
  priceUsd=1,
  gate='PASS',
  holderFallbackUsed=false,
  holderSource=null,
  source='GOPLUS_SOLANA_TOKEN_SECURITY',
  score=.7
}={}){
  return {
    chainId,tokenAddress,priceUsd,symbol:tokenAddress,
    score:{researchPriorityScore:score,stage:'EARLY'},
    security:{
      evidenceGate:gate,
      source,
      coverage:{holderConcentrationIndependent:holderFallbackUsed},
      independentHolderEvidence:holderFallbackUsed?{source:holderSource||'RUGCHECK_SOLANA_TOP_HOLDERS'}:null,
      criticalRiskFlags:gate==='ABSTAIN'?['HOLDER_CONCENTRATION_HIGH']:[],
      warningFlags:[],
      unknownReasonCodes:gate==='UNKNOWN'?['HOLDER_CONCENTRATION_EVIDENCE_MISSING']:[]
    }
  };
}

test('tracks fallback PASS outcomes across fixed horizons without changing policy',()=>{
  let state=createMemecoinSecurityOutcomeState();
  let x=observeMemecoinSecurityOutcomes(state,[row({
    priceUsd:1,
    holderFallbackUsed:true,
    holderSource:'RUGCHECK_SOLANA_TOP_HOLDERS'
  })],{now:1_000});
  state=x.state;
  assert.equal(x.results.created,1);
  assert.equal(state.records[0].holderFallbackUsed,true);
  assert.equal(state.records[0].holderEvidenceSource,'RUGCHECK_SOLANA_TOP_HOLDERS');

  x=observeMemecoinSecurityOutcomes(state,[{chainId:'solana',tokenAddress:'TOKEN1',priceUsd:1.2}],{
    now:1_000+60*60_000
  });
  state=x.state;
  assert.equal(Number(state.records[0].horizons['1h'].return.toFixed(4)),.2);

  const s=memecoinSecurityOutcomeSummary(state,{asOf:1_000+60*60_000,minComparisonSample:30});
  assert.equal(s.version,MEMECOIN_SECURITY_OUTCOME_TRACKER_VERSION);
  assert.equal(s.cohorts.PASS_HOLDER_FALLBACK.records,1);
  assert.equal(s.cohorts.PASS_HOLDER_FALLBACK.horizons['1h'].matured,1);
  assert.equal(Number(s.cohorts.PASS_HOLDER_FALLBACK.horizons['1h'].averageReturn.toFixed(4)),.2);
  assert.equal(s.comparison.status,'INSUFFICIENT_SAMPLE');
  assert.equal(s.comparison.policyMutationAllowed,false);
  assert.equal(s.canExecuteLive,false);
});

test('keeps PASS native, ABSTAIN and UNKNOWN as separate empirical cohorts',()=>{
  let state=createMemecoinSecurityOutcomeState();
  const first=[
    row({tokenAddress:'PASS_NATIVE',gate:'PASS',priceUsd:2}),
    row({tokenAddress:'ABSTAIN',gate:'ABSTAIN',priceUsd:2}),
    row({tokenAddress:'UNKNOWN',gate:'UNKNOWN',priceUsd:2})
  ];
  state=observeMemecoinSecurityOutcomes(state,first,{now:5_000}).state;
  state=observeMemecoinSecurityOutcomes(state,[
    {chainId:'solana',tokenAddress:'PASS_NATIVE',priceUsd:3},
    {chainId:'solana',tokenAddress:'ABSTAIN',priceUsd:.5},
    {chainId:'solana',tokenAddress:'UNKNOWN',priceUsd:2.2}
  ],{now:5_000+60*60_000}).state;
  const s=memecoinSecurityOutcomeSummary(state,{asOf:5_000+60*60_000});
  assert.equal(s.cohorts.PASS_NATIVE.horizons['1h'].matured,1);
  assert.equal(Number(s.cohorts.PASS_NATIVE.horizons['1h'].averageReturn.toFixed(2)),.5);
  assert.equal(s.cohorts.ABSTAIN.horizons['1h'].severeLossRate,1);
  assert.equal(Number(s.cohorts.UNKNOWN.horizons['1h'].averageReturn.toFixed(2)),.1);
});

test('schedules bounded direct followups when a tracked token drops out of the radar',()=>{
  let state=createMemecoinSecurityOutcomeState();
  state=observeMemecoinSecurityOutcomes(state,[row({
    tokenAddress:'DROPPED',
    holderFallbackUsed:true
  })],{now:10_000}).state;

  const early=dueMemecoinSecurityOutcomeFollowups(state,{asOf:10_000+4*60_000,max:3});
  assert.equal(early.length,0);

  const due=dueMemecoinSecurityOutcomeFollowups(state,{
    asOf:10_000+6*60_000,
    recentObservationMs:60_000,
    max:3
  });
  assert.equal(due.length,1);
  assert.equal(due[0].tokenAddress,'DROPPED');
  assert.equal(due[0].dueHorizon,'5m');
  assert.equal(due[0].holderFallbackUsed,true);
});

test('plain price followups cannot create new security observations',()=>{
  const state=createMemecoinSecurityOutcomeState();
  const x=observeMemecoinSecurityOutcomes(state,[
    {chainId:'base',tokenAddress:'0xabc',priceUsd:1.5}
  ],{now:20_000});
  assert.equal(x.state.records.length,0);
  assert.equal(x.results.created,0);
});
