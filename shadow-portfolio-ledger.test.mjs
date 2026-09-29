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
  shadowResearchProbeSummary,
  shadowResearchActivitySummary,
  shadowPortfolioPeriodStats,
  shadowPortfolioStatistics,
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
      admissionGate:'PASS',issuanceId:'iss1',forecastFingerprint:'f'.repeat(64),
      assetClass:'MEME',strategyLane:'BTCUSDT:1m:BUY'
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


test('period statistics split day week month and asset class',()=>{
  const base=createEmptyShadowPortfolioLedger({initialEquityQuote:1000});
  const mk=(id,openedAt,closedAt,pnl,assetClass='CORE')=>({
    ...shadowPositionFromEntryOrder(entry({
      id,createdAt:openedAt,updatedAt:openedAt,
      strategyMeta:{...entry().strategyMeta,assetClass}
    }),{openedAt}),
    status:'CLOSED',closedAt,
    realizedNetPnlQuote:pnl,realizedReturnPct:pnl/100,
    exitPrice:100+pnl,exitQuote:100+pnl,exitFeesQuote:0
  });
  const asOf=Date.UTC(2026,8,27,20,0,0);
  const l={...base,positions:[
    mk('d1',Date.UTC(2026,8,27,10),Date.UTC(2026,8,27,11),5,'MEME'),
    mk('w1',Date.UTC(2026,8,25,10),Date.UTC(2026,8,25,11),-2,'CORE'),
    mk('m1',Date.UTC(2026,8,5,10),Date.UTC(2026,8,5,11),3,'CORE'),
    mk('old',Date.UTC(2026,7,10),Date.UTC(2026,7,10),7,'CORE')
  ]};
  const day=shadowPortfolioPeriodStats(l,{period:'DAY',asOf});
  assert.equal(day.trades,1);
  assert.equal(day.realizedPnlQuote,5);
  assert.equal(day.byAssetClass.MEME.trades,1);

  const week=shadowPortfolioPeriodStats(l,{period:'WEEK',asOf});
  assert.equal(week.trades,2);
  assert.equal(week.realizedPnlQuote,3);

  const month=shadowPortfolioPeriodStats(l,{period:'MONTH',asOf});
  assert.equal(month.trades,3);
  assert.equal(month.realizedPnlQuote,6);

  const all=shadowPortfolioStatistics(l,{asOf});
  assert.equal(all.ALL.trades,4);
  assert.equal(all.ALL.realizedPnlQuote,13);
});

test('position preserves asset class and strategy lane',()=>{
  const p=shadowPositionFromEntryOrder(entry());
  assert.equal(p.assetClass,'MEME');
  assert.equal(p.strategyLane,'BTCUSDT:1m:BUY');
});


test('Berlin day statistics use local midnight across UTC offset',()=>{
  const base=createEmptyShadowPortfolioLedger({initialEquityQuote:1000});
  const mk=(id,closedAt,pnl)=>({
    ...shadowPositionFromEntryOrder(entry({id,createdAt:closedAt-60_000,updatedAt:closedAt-60_000}),{openedAt:closedAt-60_000}),
    status:'CLOSED',closedAt,realizedNetPnlQuote:pnl,realizedReturnPct:pnl/100,
    exitPrice:100+pnl,exitQuote:100+pnl,exitFeesQuote:0
  });
  const asOf=Date.UTC(2026,8,27,12,0,0);
  const l={...base,positions:[
    mk('before-local-midnight',Date.UTC(2026,8,26,21,30,0),1),
    mk('after-local-midnight',Date.UTC(2026,8,26,22,30,0),2)
  ]};
  const day=shadowPortfolioPeriodStats(l,{period:'DAY',asOf,timeZone:'Europe/Berlin'});
  assert.equal(day.trades,1);
  assert.equal(day.realizedPnlQuote,2);
  assert.equal(day.timeZone,'Europe/Berlin');
});


test('exploration entry is reconciled and preserves learning metadata',()=>{
  const e=entry({
    id:'sh_explore_1',
    strategyMeta:{
      ...entry().strategyMeta,
      role:'EXPLORATION_ENTRY',
      entryMode:'EXPLORATION',
      entryQualityLearnerVersion:'TCX_SHADOW_TRADE_QUALITY_LEARNER_V1',
      entryQualityLabel:'UNCERTAIN',
      entryQualityScore:.48,
      entryQualityConfidence:.1,
      entryQualitySamples:2,
      entryLearningValue:.9,
      entryDiscoveryScore:.7
    }
  });
  const x=reconcileShadowPortfolioEntries(createEmptyShadowPortfolioLedger(),[e],{now:2000});
  assert.equal(x.added,1);
  assert.equal(x.ledger.positions[0].exploration,true);
  assert.equal(x.ledger.positions[0].entryMode,'EXPLORATION');
  assert.equal(x.ledger.positions[0].entryQualityLabel,'UNCERTAIN');
  assert.equal(x.ledger.positions[0].entryLearningValue,.9);
});


test('learned challenger is tracked but excluded from primary portfolio metrics',()=>{
  const e=entry({
    id:'sh_challenger_1',
    strategyMeta:{
      ...entry().strategyMeta,
      role:'LEARNED_CHALLENGER_ENTRY',
      entryMode:'CHALLENGER',
      challengerEngineVersion:'TCX_LEARNED_CHALLENGER_ENGINE_V1',
      challengerRuleId:'lc_test',
      challengerDecisionKey:'cd_test',
      challengerRuleStatus:'DISCOVERED',
      challengerDiscoveryStrength:.72,
      challengerSourceSamples:16,
      challengerForwardSamples:0
    }
  });
  let l=reconcileShadowPortfolioEntries(createEmptyShadowPortfolioLedger(),[e],{now:1000}).ledger;
  assert.equal(l.positions.length,1);
  assert.equal(l.positions[0].entryMode,'CHALLENGER');
  assert.equal(l.positions[0].challengerRuleId,'lc_test');
  let x=markShadowPosition(l.positions[0],book({bid:102}),{at:61_000,feeBps:0}).position;
  x=closeShadowPosition(x,{reason:'TAKE_PROFIT',at:61_000});
  l=replaceShadowPortfolioPosition(l,x);
  const summary=shadowPortfolioSummary(l,{asOf:70_000});
  assert.equal(summary.closedTrades,0);
  const stats=shadowPortfolioPeriodStats(l,{period:'ALL',asOf:70_000});
  assert.equal(stats.trades,0);
});


test('portfolio freezes regime metadata from the entry order',()=>{
  const e=entry({
    id:'sh_regime_1',
    strategyMeta:{
      ...entry().strategyMeta,
      entryRegimeBrainVersion:'TCX_SHADOW_REGIME_BRAIN_V1',
      entryRegimeKey:'CORE|TREND_UP|UP|HIGH|DEEP|BUY_HEAVY',
      entryRegimeFingerprint:'r'.repeat(64),
      entryRegimeConfidence:.82,
      entryRegimeState:{trend:'UP',volatility:'HIGH',liquidity:'DEEP'}
    }
  });
  const l=reconcileShadowPortfolioEntries(createEmptyShadowPortfolioLedger(),[e],{now:2000}).ledger;
  assert.equal(l.positions[0].entryRegimeConfidence,.82);
  assert.equal(l.positions[0].entryRegimeState.trend,'UP');
  assert.equal(l.positions[0].entryRegimeKey,'CORE|TREND_UP|UP|HIGH|DEEP|BUY_HEAVY');
});


test('portfolio freezes adversarial stress metadata from challenger entry',()=>{
  const e=entry({
    id:'sh_stress_1',
    strategyMeta:{
      ...entry().strategyMeta,
      role:'LEARNED_CHALLENGER_ENTRY',
      entryMode:'CHALLENGER',
      challengerRuleId:'lc_stress',
      entryStressLabVersion:'TCX_ADVERSARIAL_STRESS_LAB_V1',
      entryStressStatus:'WATCH',
      entryStressSamples:20,
      entryStressMultiplier:.5,
      entryStressRobustnessScore:.55,
      entryStressFailedChecks:['severeCostPositive']
    }
  });
  const l=reconcileShadowPortfolioEntries(createEmptyShadowPortfolioLedger(),[e],{now:2000}).ledger;
  const p=l.positions[0];
  assert.equal(p.entryStressStatus,'WATCH');
  assert.equal(p.entryStressSamples,20);
  assert.equal(p.entryStressMultiplier,.5);
  assert.deepEqual(p.entryStressFailedChecks,['severeCostPositive']);
});


test('ABSTAIN probe is tracked separately from primary performance',()=>{
  const e=entry({
    id:'sh_probe_1',
    strategyMeta:{
      ...entry().strategyMeta,
      role:'ABSTAIN_PROBE_ENTRY',
      entryMode:'ABSTAIN_PROBE',
      admissionGate:'ABSTAIN',
      probeAdmissionReasons:['RESEARCH_VALIDITY_ABSTAIN']
    }
  });
  let l=reconcileShadowPortfolioEntries(createEmptyShadowPortfolioLedger(),[e],{now:1000}).ledger;
  assert.equal(l.positions.length,1);
  assert.equal(l.positions[0].probeOnly,true);
  assert.equal(l.positions[0].exploration,true);
  assert.deepEqual(l.positions[0].probeAdmissionReasons,['RESEARCH_VALIDITY_ABSTAIN']);

  let p=markShadowPosition(l.positions[0],book({bid:102}),{at:61_000,feeBps:0}).position;
  p=closeShadowPosition(p,{reason:'TAKE_PROFIT',at:61_000});
  l=replaceShadowPortfolioPosition(l,p);

  const primary=shadowPortfolioSummary(l,{asOf:70_000});
  const stats=shadowPortfolioPeriodStats(l,{period:'ALL',asOf:70_000});
  const probes=shadowResearchProbeSummary(l,{asOf:70_000});
  assert.equal(primary.closedTrades,0);
  assert.equal(stats.trades,0);
  assert.equal(probes.closedTrades,1);
  assert.equal(probes.wins,1);
  assert.ok(probes.realizedPnlQuote>0);
  assert.equal(probes.action,'ABSTAIN');
  assert.equal(probes.canExecuteLive,false);
});


test('coverage probe is horizon-only and excluded from primary performance',()=>{
  const e=entry({
    id:'sh_coverage_1',
    strategyMeta:{
      ...entry().strategyMeta,
      role:'COVERAGE_PROBE_ENTRY',
      entryMode:'COVERAGE_PROBE',
      horizonMs:60_000,
      horizonId:'1m',
      coverageCurriculumVersion:'TCX_SHADOW_COVERAGE_CURRICULUM_V1',
      coverageKey:'cc_test',
      coverageSlotStart:0,
      coverageSlotEnd:60_000,
      coveragePurpose:'SYSTEMATIC_MARKET_STRUCTURE_AND_HORIZON_COVERAGE',
      horizonOnlyExit:true
    }
  });
  let l=reconcileShadowPortfolioEntries(createEmptyShadowPortfolioLedger(),[e],{now:1000}).ledger;
  const p=l.positions[0];
  assert.equal(p.entryMode,'COVERAGE_PROBE');
  assert.equal(p.horizonOnlyExit,true);
  assert.equal(p.coverageKey,'cc_test');

  const early=markShadowPosition(p,book({bid:110}),{at:30_000,feeBps:0});
  assert.equal(early.trigger,null);

  const due=markShadowPosition(early.position,book({bid:110}),{at:61_000,feeBps:0});
  assert.equal(due.trigger,'HORIZON_EXIT');
  const closed=closeShadowPosition(due.position,{reason:due.trigger,at:61_000});
  l=replaceShadowPortfolioPosition(l,closed);

  assert.equal(shadowPortfolioSummary(l,{asOf:70_000}).closedTrades,0);
  assert.equal(shadowPortfolioPeriodStats(l,{period:'ALL',asOf:70_000}).trades,0);
});

test('coverage probe remains excluded from primary performance but is visible as research activity',()=>{
  const e=entry({
    id:'sh_coverage_visibility',
    strategyMeta:{
      ...entry().strategyMeta,
      role:'COVERAGE_PROBE_ENTRY',
      entryMode:'COVERAGE_PROBE',
      horizonMs:60_000,
      horizonId:'1m',
      coverageCurriculumVersion:'TCX_SHADOW_COVERAGE_CURRICULUM_V1',
      coverageKey:'cc_visibility',
      horizonOnlyExit:true
    }
  });
  let l=reconcileShadowPortfolioEntries(createEmptyShadowPortfolioLedger(),[e],{now:1000}).ledger;
  const openSummary=shadowResearchActivitySummary(l,{asOf:30_000});
  assert.equal(openSummary.openPositions,1);
  assert.equal(openSummary.closedTrades,0);
  assert.equal(openSummary.byMode.COVERAGE_PROBE.open,1);
  assert.equal(openSummary.performanceExcluded,true);
  assert.equal(shadowPortfolioSummary(l,{asOf:30_000}).openPositions,0);

  const marked=markShadowPosition(l.positions[0],book({bid:102}),{at:61_000,feeBps:0});
  assert.equal(marked.trigger,'HORIZON_EXIT');
  const closed=closeShadowPosition(marked.position,{reason:marked.trigger,at:61_000});
  l=replaceShadowPortfolioPosition(l,closed);

  const research=shadowResearchActivitySummary(l,{asOf:70_000});
  assert.equal(research.openPositions,0);
  assert.equal(research.closedTrades,1);
  assert.ok(research.realizedPnlQuote>0);
  assert.equal(research.recentClosed[0].entryMode,'COVERAGE_PROBE');
  assert.equal(shadowPortfolioSummary(l,{asOf:70_000}).closedTrades,0);
});

test('leveraged positions expose price return and margin ROE separately',()=>{const p={execution:'SHADOW_ONLY',canExecuteLive:false,status:'OPEN',side:'LONG',qtyBase:1,entryQuote:100,entryFeesQuote:0,marginQuote:50,leverage:2,plannedExitAt:999999,stopLossPct:1,takeProfitPct:1};const book={bids:[[110,2]],asks:[[111,2]],source:'TEST',availableAt:2};const m=markShadowPosition(p,book,{at:2,feeBps:0});assert.equal(m.exit.priceReturnPct,.1);assert.equal(m.exit.marginRoePct,.2);const closed=closeShadowPosition(m.position,{at:3});assert.equal(closed.realizedPriceReturnPct,.1);assert.equal(closed.realizedMarginRoePct,.2);assert.equal(closed.realizedReturnPct,.2);});
