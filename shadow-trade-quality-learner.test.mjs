import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildShadowTradeQualityModel, scoreShadowTradeCandidate
} from './shadow-trade-quality-learner.mjs';

function closed(i,{pnl=2,assetClass='CORE',side='LONG',horizonMs=300000,prob=.62,edge=.16,ret=.004,exploration=false}={}){
  return {
    positionId:'p'+i,status:'CLOSED',closedAt:1000+i,
    execution:'SHADOW_ONLY',canExecuteLive:false,
    assetClass,side,horizonMs,
    directionalProbability:prob,probabilityEdge:edge,expectedReturn:ret,
    realizedNetPnlQuote:pnl,realizedReturnPct:pnl/1000,
    exploration,entryMode:exploration?'EXPLORATION':'STANDARD'
  };
}

test('learner shrinks tiny samples instead of declaring a winner',()=>{
  const model=buildShadowTradeQualityModel({positions:[closed(1),closed(2)]});
  const s=scoreShadowTradeCandidate(model,{
    assetClass:'CORE',side:'LONG',horizonMs:300000,
    directionalProbability:.62,probabilityEdge:.16,expectedReturn:.004
  });
  assert.equal(s.qualityLabel,'UNCERTAIN');
  assert.ok(s.confidence<.5);
  assert.ok(s.learningValue>.4);
  assert.equal(s.canExecuteLive,false);
});

test('repeated positive outcomes become learned-good evidence',()=>{
  const rows=Array.from({length:30},(_,i)=>closed(i,{pnl:i%6===0?-1:2}));
  const model=buildShadowTradeQualityModel({positions:rows});
  const s=scoreShadowTradeCandidate(model,{
    assetClass:'CORE',side:'LONG',horizonMs:300000,
    directionalProbability:.62,probabilityEdge:.16,expectedReturn:.004
  });
  assert.equal(s.qualityLabel,'LEARNED_GOOD');
  assert.ok(s.samples>=30);
  assert.ok(s.posteriorWinRate>.55);
});

test('repeated negative outcomes become learned-bad evidence',()=>{
  const rows=Array.from({length:30},(_,i)=>closed(i,{pnl:i%6===0?1:-2}));
  const model=buildShadowTradeQualityModel({positions:rows});
  const s=scoreShadowTradeCandidate(model,{
    assetClass:'CORE',side:'LONG',horizonMs:300000,
    directionalProbability:.62,probabilityEdge:.16,expectedReturn:.004
  });
  assert.equal(s.qualityLabel,'LEARNED_BAD');
  assert.ok(s.shrinkedMeanReturn<0);
});

test('exploration outcomes are counted separately but still teach the model',()=>{
  const rows=Array.from({length:12},(_,i)=>closed(i,{pnl:2,exploration:i<5}));
  const model=buildShadowTradeQualityModel({positions:rows});
  assert.equal(model.samples,12);
  assert.equal(model.explorationSamples,5);
});


test('challenger outcomes do not self-reinforce the discovery model',()=>{
  const standard=Array.from({length:10},(_,i)=>closed(i,{pnl:2}));
  const challenger=Array.from({length:10},(_,i)=>({
    ...closed(100+i,{pnl:10}),
    entryMode:'CHALLENGER',
    challengerRuleId:'lc_test'
  }));
  const model=buildShadowTradeQualityModel({positions:[...standard,...challenger]});
  assert.equal(model.samples,10);
});


test('ABSTAIN probes teach the learner as exploration samples',()=>{
  const standard=Array.from({length:5},(_,i)=>closed(i,{pnl:2}));
  const probes=Array.from({length:5},(_,i)=>({
    ...closed(100+i,{pnl:i%2?2:-1}),
    entryMode:'ABSTAIN_PROBE',
    exploration:true,
    probeOnly:true
  }));
  const model=buildShadowTradeQualityModel({positions:[...standard,...probes]});
  assert.equal(model.samples,10);
  assert.equal(model.explorationSamples,5);
});


test('raw coverage probes teach with reduced effective sample weight',()=>{
  const rows=Array.from({length:8},(_,i)=>({
    ...closed(500+i,{pnl:2}),
    entryMode:'COVERAGE_PROBE',
    exploration:true,
    coverageEvidenceTier:'BOOTSTRAP_RAW_FORECAST'
  }));
  const model=buildShadowTradeQualityModel({positions:rows});
  const s=scoreShadowTradeCandidate(model,{
    assetClass:'CORE',side:'LONG',horizonMs:300000,
    directionalProbability:.62,probabilityEdge:.16,expectedReturn:.004
  });
  assert.equal(s.samples,8);
  assert.ok(s.confidence<.25);
  assert.equal(model.explorationSamples,8);
});
