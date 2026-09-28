import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateAdversarialRuleStress,
  buildAdversarialStressLab,
  stressDecisionForRule
} from './adversarial-stress-lab.mjs';

function row(i,{ruleId='lc_a',pnl=2,ret=null,symbol=null,regime=null}={}){
  return {
    positionId:'p'+i,
    entryOrderId:'o'+i,
    status:'CLOSED',
    execution:'SHADOW_ONLY',
    canExecuteLive:false,
    entryMode:'CHALLENGER',
    challengerRuleId:ruleId,
    entryQuote:100,
    symbol:symbol||['BTCUSDT','ETHUSDT','SOLUSDT'][i%3],
    entryRegimeKey:regime||['RISK_ON','TREND','CHOP'][i%3],
    closedAt:1000+i,
    realizedNetPnlQuote:pnl,
    realizedReturnPct:ret==null?pnl/100:ret
  };
}

test('stable challenger survives deterministic stress scenarios',()=>{
  const positions=Array.from({length:30},(_,i)=>row(i,{pnl:i%5===0?-1:2}));
  const x=evaluateAdversarialRuleStress({positions},'lc_a');
  assert.equal(x.status,'RESILIENT');
  assert.equal(x.multiplier,.85);
  assert.equal(x.criticalFails.length,0);
  assert.ok(x.robustnessScore>.8);
  assert.equal(x.canExecuteLive,false);
  assert.equal(x.action,'ABSTAIN');
});

test('long stable sample becomes stress mature without risk amplification',()=>{
  const positions=Array.from({length:45},(_,i)=>row(i,{pnl:i%6===0?-1:2}));
  const x=evaluateAdversarialRuleStress({positions},'lc_a');
  assert.equal(x.status,'STRESS_MATURE');
  assert.equal(x.multiplier,1);
  assert.ok(x.multiplier<=1);
});

test('one giant winner cannot make a fragile rule pass',()=>{
  const positions=Array.from({length:18},(_,i)=>row(i,{pnl:i===17?30:-1}));
  const x=evaluateAdversarialRuleStress({positions},'lc_a');
  assert.equal(x.status,'FRAGILE');
  assert.equal(x.multiplier,0);
  assert.ok(x.criticalFails.includes('winnerMissPositive'));
  assert.ok(x.criticalFails.includes('foldConsistency'));
});

test('edge that disappears under severe extra costs is downweighted',()=>{
  const positions=Array.from({length:18},(_,i)=>row(i,{pnl:.03,ret:.0003}));
  const x=evaluateAdversarialRuleStress({positions},'lc_a');
  assert.equal(x.status,'WATCH');
  assert.equal(x.multiplier,.5);
  assert.equal(x.checks.severeCostPositive,false);
});

test('small forward sample remains collecting so evidence can continue accumulating',()=>{
  const positions=Array.from({length:7},(_,i)=>row(i,{pnl:2}));
  const x=evaluateAdversarialRuleStress({positions},'lc_a');
  assert.equal(x.status,'COLLECTING');
  assert.equal(x.multiplier,1);
  assert.ok(x.robustnessScore<.45);
});

test('lab returns deterministic rule decisions',()=>{
  const positions=Array.from({length:20},(_,i)=>row(i,{pnl:i%5===0?-1:2}));
  const challengerLab={candidateRules:[{ruleId:'lc_a'}]};
  const lab=buildAdversarialStressLab({positions},challengerLab);
  const d=stressDecisionForRule(lab,'lc_a');
  assert.equal(d.samples,20);
  assert.ok(['RESILIENT','WATCH','FRAGILE'].includes(d.status));
  assert.ok(d.multiplier<=1);
  assert.equal(d.execution,'SHADOW_ONLY');
});
