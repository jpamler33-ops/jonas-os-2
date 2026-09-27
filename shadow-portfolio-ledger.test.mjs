import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import {
  deriveShadowRiskPlan,
  shadowPositionFromEntryOrder,
  simulateShadowPositionExit,
  markShadowPosition,
  closeShadowPosition,
  createEmptyShadowPortfolioLedger,
  reconcileShadowPortfolioEntries,
  replaceShadowPortfolioPosition,
  shadowPortfolioSummary,
  verifyShadowPortfolioSummary,
  loadShadowPortfolioLedger,
  saveShadowPortfolioLedger
} from './shadow-portfolio-ledger.mjs';

function entry(overrides={}){
  return {
    id:'sh_entry_1',symbol:'BTCUSDT',side:'BUY',status:'FILLED',
    fillBase:1,fillQuote:100,avgFillPrice:100,feesQuote:0.1,
    createdAt:1000,updatedAt:1000,
    execution:'SHADOW_ONLY',canExecuteLive:false,
    strategyMeta:{
      strategy:'TCX_AUTONOMOUS_SHADOW_TRADER_V1',
      role:'ENTRY',horizonMs:60_000,horizonId:'1m',
      expectedReturn:0.01,directionalProbability:0.7,probabilityEdge:0.4,
      admissionGate:'PASS',issuanceId:'iss1',forecastFingerprint:'f'.repeat(64)
    },
    ...overrides
  };
}
function book({bid=101,ask=101.1,qty=10,availableAt=2000}={}){
  return {bids:[[bid,qty]],asks:[[ask,qty]],source:'TEST',availableAt};
}

test('risk plan is bounded and positive',()=>{
  const p=deriveShadowRiskPlan(0.02);
  assert.ok(p.takeProfitPct>=0.003&&p.takeProfitPct<=0.03);
  assert.ok(p.stopLossPct>=0.002&&p.stopLossPct<=0.02);
  assert.ok(p.rewardRisk>=1);
});

test('filled autonomous entry becomes an open shadow position',()=>{
  const p=shadowPositionFromEntryOrder(entry());
  assert.equal(p.status,'OPEN');
  assert.equal(p.side,'LONG');
  assert.equal(p.execution,'SHADOW_ONLY');
  assert.equal(p.canExecuteLive,false);
  assert.equal(p.plannedExitAt,61_000);
});

test('long exit simulation uses bid depth and includes both-side fees',()=>{
  const p=shadowPositionFromEntryOrder(entry());
  const x=simulateShadowPositionExit(p,book({bid:102}),{feeBps:10});
  assert.equal(x.fullyExecutable,true);
  assert.equal(x.avgExitPrice,102);
  assert.ok(x.netPnlQuote<2);
  assert.ok(x.netPnlQuote>1.7);
});

test('short exit simulation buys back on asks',()=>{
  const p=shadowPositionFromEntryOrder(entry({side:'SELL'}));
  const x=simulateShadowPositionExit(p,book({ask:98}),{feeBps:10});
  assert.ok(x.netPnlQuote>1.7);
  assert.equal(x.exitSide,'BUY');
});

test('take profit and stop loss triggers are deterministic',()=>{
  const p=shadowPositionFromEntryOrder(entry({strategyMeta:{...entry().strategyMeta,expectedReturn:0.006}}));
  const win=markShadowPosition(p,book({bid:101}),{at:10_000,feeBps:0});
  assert.equal(win.trigger,'TAKE_PROFIT');
  const loss=markShadowPosition(p,book({bid:99}),{at:10_000,feeBps:0});
  assert.equal(loss.trigger,'STOP_LOSS');
});

test('horizon closes even without TP or SL',()=>{
  const p=shadowPositionFromEntryOrder(entry());
  const m=markShadowPosition(p,book({bid:100.1}),{at:61_000,feeBps:0});
  assert.equal(m.trigger,'HORIZON_EXIT');
  const closed=closeShadowPosition(m.position,{reason:m.trigger,at:61_000});
  assert.equal(closed.status,'CLOSED');
  assert.equal(closed.closeReason,'HORIZON_EXIT');
});

test('insufficient exit depth does not close position',()=>{
  const p=shadowPositionFromEntryOrder(entry({fillBase:5,fillQuote:500}));
  const m=markShadowPosition(p,book({bid:110,qty:1}),{at:100_000});
  assert.equal(m.trigger,null);
  assert.equal(m.position.lastMark.fullyExecutable,false);
});

test('entry reconciliation is idempotent',()=>{
  const l=createEmptyShadowPortfolioLedger();
  const a=reconcileShadowPortfolioEntries(l,[entry()],{now:2000});
  const b=reconcileShadowPortfolioEntries(a.ledger,[entry()],{now:3000});
  assert.equal(a.added,1);
  assert.equal(b.added,0);
  assert.equal(b.ledger.positions.length,1);
});

test('portfolio summary calculates win rate profit factor and drawdown',()=>{
  let l=reconcileShadowPortfolioEntries(createEmptyShadowPortfolioLedger({initialEquityQuote:1000}),[entry()],{now:1000}).ledger;
  let p=l.positions[0];
  p=markShadowPosition(p,book({bid:102}),{at:61_000,feeBps:0}).position;
  p=closeShadowPosition(p,{reason:'TAKE_PROFIT',at:61_000});
  l=replaceShadowPortfolioPosition(l,p);

  const e2=entry({id:'sh_entry_2',createdAt:70_000,updatedAt:70_000});
  l=reconcileShadowPortfolioEntries(l,[e2],{now:70_000}).ledger;
  let p2=l.positions.find(x=>x.entryOrderId==='sh_entry_2');
  p2=markShadowPosition(p2,book({bid:99,availableAt:80_000}),{at:80_000,feeBps:0}).position;
  p2=closeShadowPosition(p2,{reason:'STOP_LOSS',at:80_000});
  l=replaceShadowPortfolioPosition(l,p2);

  const s=shadowPortfolioSummary(l,{asOf:90_000});
  assert.equal(s.closedTrades,2);
  assert.equal(s.wins,1);
  assert.equal(s.losses,1);
  assert.equal(s.winRate,0.5);
  assert.ok(s.profitFactor>1);
  assert.ok(s.maxDrawdownQuote>0);
  assert.equal(verifyShadowPortfolioSummary(s).ok,true);
});

test('ledger persists and restores shadow-only positions',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'tcx-shadow-portfolio-'));
  const file=path.join(dir,'portfolio.json');
  const l=reconcileShadowPortfolioEntries(createEmptyShadowPortfolioLedger(),[entry()],{now:1000}).ledger;
  await saveShadowPortfolioLedger(file,l);
  const loaded=await loadShadowPortfolioLedger(file);
  assert.equal(loaded.ledger.positions.length,1);
  assert.equal(loaded.ledger.execution,'SHADOW_ONLY');
  assert.equal(loaded.ledger.canExecuteLive,false);
});
