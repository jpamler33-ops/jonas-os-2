import test from 'node:test';
import assert from 'node:assert/strict';
import {
  wilsonLowerBound,
  evaluateStrategyEvidence
} from './strategy-evidence-engine.mjs';

function positions(n,{
  pnl=()=>2,
  ret=(i,p)=>p/100,
  symbol=i=>['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT'][i%4],
  start=Date.UTC(2026,8,1)
}={}){
  return Array.from({length:n},(_,i)=>{
    const p=Number(pnl(i));
    return {
      status:'CLOSED',
      closedAt:start+(i%14)*86_400_000+i*60_000,
      symbol:symbol(i),
      entryOrderId:'o'+i,
      leagueSampleKey:'s'+i,
      realizedNetPnlQuote:p,
      realizedReturnPct:Number(ret(i,p))
    };
  });
}

test('Wilson lower bound is conservative for small samples',()=>{
  assert.ok(wilsonLowerBound(8,10)<.8);
  assert.ok(wilsonLowerBound(80,100)>wilsonLowerBound(8,10));
  assert.equal(wilsonLowerBound(0,0),0);
});

test('small lucky sample cannot qualify for allocation',()=>{
  const e=evaluateStrategyEvidence(positions(12),{maxDrawdownPct:.01,strategyTrials:5});
  assert.equal(e.allocationEligible,false);
  assert.equal(e.evidenceGrade,'INSUFFICIENT');
  assert.ok(e.failedGates.includes('sample'));
  assert.ok(e.failedGates.includes('recentSample'));
});

test('broad stable history can qualify',()=>{
  const e=evaluateStrategyEvidence(positions(60,{
    pnl:i=>i%5===0?-1:2
  }),{maxDrawdownPct:.025,strategyTrials:5});
  assert.equal(e.allocationEligible,true);
  assert.ok(['QUALIFIED','ROBUST'].includes(e.evidenceGrade));
  assert.equal(e.failedGates.length,0);
  assert.ok(e.scores.trialPenalty<1);
  assert.equal(e.canExecuteLive,false);
});

test('recent collapse blocks an otherwise strong history',()=>{
  const e=evaluateStrategyEvidence(positions(60,{
    pnl:i=>i<36?(i%6===0?-1:2):-2
  }),{maxDrawdownPct:.04,strategyTrials:5});
  assert.equal(e.allocationEligible,false);
  assert.equal(e.degradationWatch,true);
  assert.equal(e.evidenceGrade,'DEGRADING');
});

test('single-symbol concentration blocks allocation',()=>{
  const e=evaluateStrategyEvidence(positions(60,{
    pnl:i=>i%5===0?-1:2,
    symbol:()=> 'BTCUSDT'
  }),{maxDrawdownPct:.02,strategyTrials:5});
  assert.equal(e.allocationEligible,false);
  assert.ok(e.failedGates.includes('concentration'));
});

test('large drawdown triggers risk hold regardless of wins',()=>{
  const e=evaluateStrategyEvidence(positions(60),{maxDrawdownPct:.13,strategyTrials:5});
  assert.equal(e.riskHold,true);
  assert.equal(e.allocationEligible,false);
  assert.equal(e.evidenceGrade,'RISK_HOLD');
});

test('more strategy trials make evidence score more conservative',()=>{
  const ps=positions(60,{pnl:i=>i%5===0?-1:2});
  const few=evaluateStrategyEvidence(ps,{maxDrawdownPct:.02,strategyTrials:2});
  const many=evaluateStrategyEvidence(ps,{maxDrawdownPct:.02,strategyTrials:50});
  assert.ok(few.scores.evidenceScore>many.scores.evidenceScore);
});
