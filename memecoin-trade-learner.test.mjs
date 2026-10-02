import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMemecoinTradeLearningModel,
  scoreMemecoinScoutCandidate,
  scoreMemecoinCopyCandidate,
  memecoinTradeLearningSummary,
  memecoinScoutFeatureShape,
  MEMECOIN_TRADE_LEARNER_VERSION
} from './memecoin-trade-learner.mjs';
import { WALLET_4_MEME_SCOUT, WALLET_5_MEME_COPY } from './shadow-specialist-wallets.mjs';

function scoutClosed(i,ret,{chainId='solana'}={}){
  return {
    walletId:WALLET_4_MEME_SCOUT,positionKey:'p'+i,chainId,tokenAddress:'T'+i,
    symbol:'M'+i,side:'LONG',execution:'SHADOW_ONLY',canExecuteLive:false,status:'CLOSED',
    openedAt:1_000_000+i*1000,closedAt:2_000_000+i*1000,
    entryPrice:1,closePrice:1+ret,realizedReturnPct:ret,realizedNetPnlQuote:100*ret,
    closeReason:ret<=-.45?'MEME_STOP':ret>=1.5?'MEME_TAKE_PROFIT':'MEME_HORIZON',
    entryStage:'EARLY',entryResearchPriorityScore:.68,entryAttentionSignals:['SOCIAL_POSTS_RECENT'],
    entryHolderFallbackUsed:true,
    entryMarketFeatures:{
      chainId,stage:'EARLY',ageMinutes:14,researchPriorityScore:.68,liquidityUsd:55_000,
      marketCap:320_000,volumeM5:18_000,buysM5:18,sellsM5:9,priceChangeM5:18,
      pairCreatedAt:1_000_000-14*60_000,holderTop10Share:.32,holderFallbackUsed:true
    }
  };
}
function copyClosed(i,ret){
  return {
    walletId:WALLET_5_MEME_COPY,positionKey:'c'+i,execution:'SHADOW_ONLY',canExecuteLive:false,status:'CLOSED',
    sourceTraderCode:'TRADER_A',sourceInstId:'PEPE-USDT-SWAP',side:'LONG',leverage:3,
    realizedReturnPct:ret,realizedNetPnlQuote:150*ret
  };
}
function state(w4=[],w5=[]){
  return {wallets:{
    [WALLET_4_MEME_SCOUT]:{closed:w4},
    [WALLET_5_MEME_COPY]:{closed:w5}
  }};
}
function candidate(){
  return {
    chainId:'solana',tokenAddress:'NEW',priceUsd:.001,liquidityUsd:55_000,marketCap:320_000,
    volumeM5:18_000,buysM5:18,sellsM5:9,priceChangeM5:18,pairCreatedAt:10_000_000-14*60_000,
    score:{stage:'EARLY',ageMinutes:14,researchPriorityScore:.68,attentionSignals:['SOCIAL_POSTS_RECENT']},
    security:{evidenceGate:'PASS',coverage:{holderConcentrationIndependent:true},holderState:{top10Share:.32}}
  };
}

test('learns a repeatable positive W4 pattern and only boosts ranking',()=>{
  const closed=Array.from({length:12},(_,i)=>scoutClosed(i,.22+i*.003));
  const model=buildMemecoinTradeLearningModel(state(closed),{asOf:20_000_000});
  const scored=scoreMemecoinScoutCandidate(model,candidate());
  assert.equal(model.version,MEMECOIN_TRADE_LEARNER_VERSION);
  assert.equal(model.wallet4.samples,12);
  assert.equal(scored.action,'BOOST');
  assert.equal(scored.canCreateEntry,false);
  assert.equal(scored.canOverrideSecurity,false);
  assert.ok(scored.evidence.samples>=8);
  assert.ok(scored.rankingAdjustment>0);
});

test('learns a destructive W4 pattern and can only abstain from otherwise eligible shadow entries',()=>{
  const closed=Array.from({length:12},(_,i)=>scoutClosed(i,-.55-(i%2)*.08));
  const model=buildMemecoinTradeLearningModel(state(closed),{asOf:20_000_000});
  const scored=scoreMemecoinScoutCandidate(model,candidate());
  assert.equal(scored.action,'BLOCK');
  assert.ok(scored.evidence.severeLossRate>=.45);
  assert.equal(scored.canCreateEntry,false);
  assert.equal(scored.canExecuteLive,false);
});

test('positive moonshot expectancy is not blocked only because most trades lose',()=>{
  const closed=[
    ...Array.from({length:8},(_,i)=>scoutClosed(i,2.10)),
    ...Array.from({length:12},(_,i)=>scoutClosed(i+8,-.55))
  ];
  const model=buildMemecoinTradeLearningModel(state(closed),{asOf:20_000_000});
  const scored=scoreMemecoinScoutCandidate(model,candidate());
  assert.equal(model.wallet4.global.label,'ASYMMETRIC_EDGE');
  assert.ok(model.wallet4.global.rawMeanReturn>0);
  assert.ok(model.wallet4.global.severeLossRate>=.5);
  assert.ok(model.wallet4.global.moonshotRate>=.3);
  assert.equal(scored.action,'NEUTRAL');
  assert.equal(scored.evidence.label,'ASYMMETRIC_EDGE');
  assert.ok(model.wallet4.topAsymmetric.length>=1);
});

test('sparse evidence stays neutral',()=>{
  const model=buildMemecoinTradeLearningModel(state([scoutClosed(1,.8),scoutClosed(2,-.3)]));
  const scored=scoreMemecoinScoutCandidate(model,candidate());
  assert.equal(scored.action,'NEUTRAL');
  assert.equal(scored.evidence.level,'PRIOR');
});

test('broadly destructive W4 chain throttles new research instead of repeatedly paying full notional',()=>{
  const closed=Array.from({length:32},(_,i)=>{
    const row=scoutClosed(i,-.55-(i%3)*.05);
    const stages=['EARLY','NEW_NOW'];
    const liqs=[12_000,32_000,90_000,300_000];
    row.entryStage=stages[i%stages.length];
    row.entryMarketFeatures.stage=row.entryStage;
    row.entryMarketFeatures.liquidityUsd=liqs[i%liqs.length];
    row.entryMarketFeatures.ageMinutes=3+(i%4)*7;
    row.entryMarketFeatures.priceChangeM5=[-8,8,22,70][i%4];
    row.entryMarketFeatures.buysM5=10+(i%5);
    row.entryMarketFeatures.sellsM5=8+(i%4);
    return row;
  });
  const model=buildMemecoinTradeLearningModel(state(closed),{asOf:20_000_000});
  const scored=scoreMemecoinScoutCandidate(model,candidate());
  assert.equal(scored.action,'THROTTLE');
  assert.equal(scored.evidence.level,'CHAIN');
  assert.ok(scored.evidence.severeLossRate>=.6);
  assert.ok(scored.sizeMultiplier<=.35);
  assert.ok(scored.sizeMultiplier>=.05);
  assert.equal(scored.canExecuteLive,false);
});

test('legacy W4 trades without entry microstructure remain diagnostic and cannot block new candidates',()=>{
  const legacy=Array.from({length:40},(_,i)=>({
    walletId:WALLET_4_MEME_SCOUT,positionKey:'legacy'+i,chainId:'solana',tokenAddress:'L'+i,
    execution:'SHADOW_ONLY',canExecuteLive:false,status:'CLOSED',
    openedAt:1000+i,closedAt:2000+i,entryStage:'NEW_NOW',entryResearchPriorityScore:.7,
    realizedReturnPct:-.6,realizedNetPnlQuote:-60,closeReason:'MEME_STOP'
  }));
  const model=buildMemecoinTradeLearningModel(state(legacy));
  const scored=scoreMemecoinScoutCandidate(model,candidate());
  assert.equal(model.wallet4.samples,40);
  assert.equal(model.wallet4.featureCompleteSamples,0);
  assert.equal(model.wallet4.legacyOrIncompleteSamples,40);
  assert.equal(model.wallet4.global.label,'LEARNED_BAD');
  assert.equal(scored.action,'NEUTRAL');
  assert.equal(scored.evidence.level,'PRIOR');
});

test('W5 copy outcomes are learned separately from W4 scout policy',()=>{
  const w5=Array.from({length:10},(_,i)=>copyClosed(i,-.25));
  const model=buildMemecoinTradeLearningModel(state([],w5));
  const copy=scoreMemecoinCopyCandidate(model,{sourceTraderCode:'TRADER_A',sourceInstId:'PEPE-USDT-SWAP',side:'LONG',leverage:3});
  const scout=scoreMemecoinScoutCandidate(model,candidate());
  assert.equal(model.wallet5.samples,10);
  assert.equal(copy.action,'BLOCK');
  assert.equal(scout.action,'NEUTRAL');
});

test('feature shape captures the entry microstructure instead of token identity',()=>{
  const shape=memecoinScoutFeatureShape(candidate(),10_000_000);
  assert.equal(shape.chain,'solana');
  assert.equal(shape.stage,'EARLY');
  assert.equal(shape.age,'AGE_10_20');
  assert.equal(shape.liquidity,'LIQ_25_75K');
  assert.equal(shape.pressure,'PRESSURE_STRONG_BUY');
  assert.equal(shape.attention,'ATTN_DIRECT_SOCIAL');
  assert.equal(shape.holder,'HOLDER_TOP10_25_45');
});

test('learner preserves tail-risk exit taxonomy for later policy evaluation',()=>{
  const row=scoutClosed(1,-.24);
  row.closeReason='MEME_TAIL_RISK_EXIT';
  const model=buildMemecoinTradeLearningModel(state([row]));
  assert.equal(model.wallet4.global.closeReasons.tailRisk,1);
  assert.equal(model.wallet4.global.closeReasons.stop,0);
});

test('summary keeps automatic positive override disabled',()=>{
  const model=buildMemecoinTradeLearningModel(state(Array.from({length:12},(_,i)=>scoutClosed(i,.25))));
  const s=memecoinTradeLearningSummary(model);
  assert.equal(s.learningMode,'ABSTAIN_ONLY_AFTER_MINIMUM_EVIDENCE');
  assert.equal(s.automaticPositiveOverride,false);
  assert.equal(s.execution,'SHADOW_ONLY');
  assert.equal(s.canExecuteLive,false);
});
