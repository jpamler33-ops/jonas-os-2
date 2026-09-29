import test from 'node:test';
import assert from 'node:assert/strict';
import {
  biggjTradeContextVector,
  buildBiggjOutcomeFactorMemory,
  analyzeBiggjClosedTrade,
  buildBiggjAdaptiveHoldMemory,
  selectBiggjAdaptiveHoldPlan,
  discoverBiggjStrategyExperiments,
  scoreBiggjTradingConsistency
} from './biggj-adaptive-learning-core.mjs';

function closed({
  id='p1',ret=.01,openedAt=1_000_000,horizonMs=60*60_000,
  strategyFamily='TREND_CONTINUATION',regimeTrend='UP',volatility='NORMAL',
  liquidity='DEEP',setupType='A',mode='STANDARD',timeline=null
}={}){
  const closedAt=openedAt+2*horizonMs;
  return {
    positionId:id,symbol:'BTCUSDT',assetClass:'CORE',side:'LONG',
    tradingStyle:'INTRADAY',strategyFamily,setupType,setupScore:.82,
    entryMode:mode,horizonMs,openedAt,closedAt,
    realizedMarginRoePct:ret,realizedReturnPct:ret,realizedNetPnlQuote:ret*100,
    directionalProbability:.68,probabilityEdge:.18,expectedReturn:.008,
    admissionGate:'PASS',entryQualityLabel:'LEARNED_GOOD',entryQualityScore:.78,
    entryStressStatus:'RESILIENT',
    entryRegimeState:{components:{regime:'TREND_UP',trend:regimeTrend,volatility,liquidity,pressure:'BUY_HEAVY'}},
    mfeMarginRoePct:.016,maeMarginRoePct:-.004,
    captureEfficiency:ret/.016,exitRegretMarginRoePct:Math.max(0,.016-ret),
    learningTimeline:timeline||[
      {at:openedAt+horizonMs*.50,marginRoePct:.002,fullyExecutable:true},
      {at:openedAt+horizonMs*.75,marginRoePct:.004,fullyExecutable:true},
      {at:openedAt+horizonMs,marginRoePct:.006,fullyExecutable:true},
      {at:openedAt+horizonMs*1.5,marginRoePct:.015,fullyExecutable:true},
      {at:openedAt+horizonMs*2,marginRoePct:ret,fullyExecutable:true}
    ],
    execution:'SHADOW_ONLY',canExecuteLive:false,status:'CLOSED'
  };
}

test('trade context includes style strategy regime and forecast bins',()=>{
  const x=biggjTradeContextVector(closed());
  assert.equal(x.assetClass,'CORE');
  assert.equal(x.strategyFamily,'TREND_CONTINUATION');
  assert.equal(x.regimeTrend,'UP');
  assert.equal(x.volatility,'NORMAL');
  assert.equal(x.liquidity,'DEEP');
  assert.equal(x.setupType,'A');
  assert.equal(x.edge,'E16');
  assert.equal(x.probability,'P64');
});

test('outcome memory identifies positive and negative context associations without claiming causality',()=>{
  const wins=Array.from({length:14},(_,i)=>closed({id:'w'+i,ret:.012+i*.0001,openedAt:1_000_000+i*10_000}));
  const losses=Array.from({length:14},(_,i)=>closed({
    id:'l'+i,ret:-.010-i*.0001,openedAt:3_000_000+i*10_000,
    strategyFamily:'RANGE_MEAN_REVERSION',regimeTrend:'DOWN',volatility:'HIGH',setupType:'B'
  }));
  const memory=buildBiggjOutcomeFactorMemory({positions:[...wins,...losses]},{minSamples:6});
  assert.equal(memory.samples,28);
  assert.ok(memory.strongestPositive.length>0);
  assert.ok(memory.strongestNegative.length>0);
  assert.equal(memory.canExecuteLive,false);
  assert.match(memory.meaning,/NOT_CAUSAL/);
});

test('closed trade reverse analysis reports prior matching associations and timing observations',()=>{
  const base=Array.from({length:12},(_,i)=>closed({id:'b'+i,ret:.012,openedAt:1_000_000+i*20_000}));
  const memory=buildBiggjOutcomeFactorMemory({positions:base},{minSamples:4});
  const trade=closed({id:'new',ret:.002,openedAt:9_000_000});
  const x=analyzeBiggjClosedTrade(trade,memory);
  assert.equal(x.positionId,'new');
  assert.equal(x.execution,'SHADOW_ONLY');
  assert.ok(Array.isArray(x.supportiveAssociations));
  assert.ok(Array.isArray(x.postHocObservations));
  assert.equal(x.epistemic.outcomeExplanation,'POST_HOC_ASSOCIATION_NOT_CAUSAL_PROOF');
});

test('hold memory learns that 1.5x horizon historically captured more return',()=>{
  const positions=Array.from({length:14},(_,i)=>closed({id:'h'+i,openedAt:1_000_000+i*100_000,ret:.010}));
  const memory=buildBiggjAdaptiveHoldMemory({positions},{minSamples:6});
  const global=memory.groups.GLOBAL.ALL;
  assert.equal(global.evidenceReady,true);
  assert.equal(global.best.multiplier,1.5);
});

test('adaptive hold extends strong matching contexts but shortens on thesis deterioration',()=>{
  const positions=Array.from({length:14},(_,i)=>closed({id:'h'+i,openedAt:1_000_000+i*100_000}));
  const memory=buildBiggjAdaptiveHoldMemory({positions},{minSamples:6});
  const position={...positions[0],status:'OPEN'};
  const strong=selectBiggjAdaptiveHoldPlan(memory,position,{
    thesisHealth:.85,oppositeThesisStrength:.12,structureHealth:.85,
    regimeAlignment:.80,flowAlignment:.75,liquidityHealth:.90,volatilityShock:.05
  });
  assert.equal(strong.mode,'EXTEND');
  assert.ok(strong.recommendedHoldMultiplier>=1.5);
  const weak=selectBiggjAdaptiveHoldPlan(memory,position,{
    thesisHealth:.25,oppositeThesisStrength:.80,structureHealth:.20,
    regimeAlignment:.30,flowAlignment:.25,liquidityHealth:.50,volatilityShock:.8
  });
  assert.equal(weak.mode,'SHORTEN');
  assert.ok(weak.recommendedHoldMultiplier<=.75);
});

test('strategy experiments are generated only from evidence-backed positive interactions',()=>{
  const good=Array.from({length:16},(_,i)=>closed({id:'g'+i,ret:.014,openedAt:1_000_000+i*50_000}));
  const bad=Array.from({length:16},(_,i)=>closed({
    id:'b'+i,ret:-.012,openedAt:3_000_000+i*50_000,
    strategyFamily:'RANGE_MEAN_REVERSION',regimeTrend:'DOWN',volatility:'HIGH',liquidity:'THIN',setupType:'B'
  }));
  const memory=buildBiggjOutcomeFactorMemory({positions:[...good,...bad]},{minSamples:6});
  const lab=discoverBiggjStrategyExperiments(memory,{minSamples:8,minAssociationScore:.56});
  assert.ok(lab.experiments.length>0);
  assert.ok(lab.experiments.every(x=>x.mode==='CHALLENGER_ONLY'));
  assert.ok(lab.experiments.every(x=>x.promotionGate.minForwardSamples>=30));
  assert.equal(lab.canExecuteLive,false);
});

test('consistency objective rewards expectancy stability and drawdown control rather than raw win count alone',()=>{
  const positions=Array.from({length:20},(_,i)=>closed({id:'c'+i,ret:i%4===0?-.004:.006,openedAt:1_000_000+i*50_000}));
  const x=scoreBiggjTradingConsistency(positions);
  assert.equal(x.trades,20);
  assert.ok(x.consistencyScore>0&&x.consistencyScore<=1);
  assert.equal(x.canExecuteLive,false);
});
