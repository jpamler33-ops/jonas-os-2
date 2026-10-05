import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EARLY_MOMENTUM_CHALLENGER_POLICY,
  earlyMomentumAgeBucket,
  earlyMomentumSizeGrid,
  createEarlyMomentumChallengerLab,
  updateEarlyMomentumChallengerLab,
  summarizeEarlyMomentumChallengerLab
} from './early-momentum-challenger-v1.mjs';

test('early momentum challenger is research-only and cannot mutate primary',()=>{
  assert.equal(EARLY_MOMENTUM_CHALLENGER_POLICY.execution,'SHADOW_ONLY');
  assert.equal(EARLY_MOMENTUM_CHALLENGER_POLICY.canExecuteLive,false);
  assert.equal(EARLY_MOMENTUM_CHALLENGER_POLICY.automaticPrimaryMutation,false);
  assert.equal(EARLY_MOMENTUM_CHALLENGER_POLICY.baselineImmutable,true);
});

test('age buckets preserve benchmark cohorts without claiming a live edge',()=>{
  assert.equal(earlyMomentumAgeBucket(30),'AGE_LT1M');
  assert.equal(earlyMomentumAgeBucket(120),'AGE_1_3M');
  assert.equal(earlyMomentumAgeBucket(240),'AGE_3_5M');
  assert.equal(earlyMomentumAgeBucket(420),'AGE_5_10M');
});

test('liquidity grid includes conservative arms and the 4 SOL per 10k hypothesis separately',()=>{
  const g=earlyMomentumSizeGrid(20_000);
  assert.deepEqual(g.sizesSol,[.5,1,2,4,8]);
  assert.equal(g.userHypothesisSizeSol,8);
  assert.match(g.semantics,/NOT_LIVE/);
  const thin=earlyMomentumSizeGrid(8_000);
  assert.deepEqual(thin.sizesSol,[.1,.25,.5,1,3.2]);
});

test('parallel lab closes hold-time arms only after their observation horizon',()=>{
  let lab=createEarlyMomentumChallengerLab({
    entryAgeSeconds:35,
    liquidityUsd:20_000,
    solPriceUsd:150,
    feeBps:30
  });
  assert.equal(lab.scenarios.length,35);
  lab=updateEarlyMomentumChallengerLab(lab,{
    now:1_000_000,
    holdSeconds:240,
    returnPct:.20,
    currentLiquidityUsd:18_000,
    solPriceUsd:150,
    securityGate:'PASS',
    buysM5:20,
    sellsM5:8,
    priceChangeM5:35
  });
  assert.equal(lab.scenarios.filter(x=>x.status==='CLOSED').length,25);
  assert.equal(lab.scenarios.filter(x=>x.status==='OPEN').length,10);
  const closed=lab.scenarios.find(x=>x.status==='CLOSED'&&x.sizeSol===1&&x.holdTargetSeconds===240);
  assert.ok(closed.grossPnlSol>closed.netPnlSol);
  assert.ok(closed.entryImpactPct>0);
  assert.ok(closed.exitImpactPct>0);
});

test('diagnostics flag critical security evidence and liquidity decay without becoming a probability claim',()=>{
  let lab=createEarlyMomentumChallengerLab({
    entryAgeSeconds:45,
    liquidityUsd:12_000,
    solPriceUsd:150
  });
  lab=updateEarlyMomentumChallengerLab(lab,{
    now:2_000_000,
    holdSeconds:300,
    returnPct:-.15,
    currentLiquidityUsd:3_000,
    solPriceUsd:150,
    securityGate:'ABSTAIN',
    criticalRiskFlags:['HONEYPOT_FLAGGED'],
    buysM5:2,
    sellsM5:10,
    priceChangeM5:80
  });
  assert.equal(lab.diagnostics.rugRisk,1);
  assert.ok(lab.diagnostics.liquidityDecayRisk>.8);
  assert.ok(lab.diagnostics.falseMomentumRisk>=.8);
  assert.equal(lab.diagnostics.scoreSemantics,'HEURISTIC_DIAGNOSTIC_NOT_WIN_PROBABILITY');
});

test('summary compares capital efficiency, absolute pnl and user sizing hypothesis',()=>{
  let lab=createEarlyMomentumChallengerLab({
    entryAgeSeconds:25,
    liquidityUsd:20_000,
    solPriceUsd:150
  });
  lab=updateEarlyMomentumChallengerLab(lab,{
    now:3_000_000,
    holdSeconds:500,
    returnPct:.40,
    currentLiquidityUsd:16_000,
    solPriceUsd:150,
    securityGate:'PASS',
    buysM5:30,
    sellsM5:10,
    priceChangeM5:45
  });
  const summary=summarizeEarlyMomentumChallengerLab(lab);
  assert.ok(summary.bestCapitalEfficiency);
  assert.ok(summary.bestAbsoluteNetPnl);
  assert.ok(summary.bestUser4SolPer10kHypothesis);
  assert.equal(summary.execution,'SHADOW_ONLY');
  assert.equal(summary.automaticPrimaryMutation,false);
});


test('entry-age arms capture delayed entries point-in-time and compare fixed hold windows',()=>{
  let lab=createEarlyMomentumChallengerLab({
    entryAgeSeconds:30,
    liquidityUsd:20_000,
    solPriceUsd:150,
    feeBps:30
  });
  lab=updateEarlyMomentumChallengerLab(lab,{
    now:4_000_000,
    holdSeconds:40,
    returnPct:.05,
    currentLiquidityUsd:19_000,
    solPriceUsd:150,
    securityGate:'PASS'
  });
  const delayed60=lab.entryAgeArms.find(x=>x.targetAgeSeconds===60&&x.evaluationHoldSeconds===180);
  assert.equal(delayed60.status,'ENTERED');
  assert.equal(delayed60.entryObservedAgeSeconds,70);

  lab=updateEarlyMomentumChallengerLab(lab,{
    now:4_180_000,
    holdSeconds:220,
    returnPct:.20,
    currentLiquidityUsd:17_000,
    solPriceUsd:150,
    securityGate:'PASS'
  });
  const closed60=lab.entryAgeArms.find(x=>x.targetAgeSeconds===60&&x.evaluationHoldSeconds===180);
  assert.equal(closed60.status,'CLOSED');
  assert.ok(closed60.closeReturnPct>0);
  assert.ok(closed60.netReturnAfterFeesPct<closed60.closeReturnPct);
  const summary=summarizeEarlyMomentumChallengerLab(lab);
  assert.ok(summary.entryAgeArmsClosed>=2);
  assert.ok(summary.bestEntryAgeArm);
});
