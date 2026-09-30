import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BIGGJ_WORLD_MODEL_RUNTIME_VERSION,
  buildBiggjWorldModelRuntime,
  biggjWorldModelRuntimeSummary,
  verifyBiggjWorldModelRuntime
} from './biggj-world-model-runtime.mjs';

const T0=Date.UTC(2026,8,30,20,0,0);

function series(base,drift=0){
  const out=[];
  let p=base;
  for(let i=0;i<130;i++){
    p*=1+(Math.sin(i/7)*.001+drift);
    out.push({closeTime:T0-(130-i)*300_000,close:p});
  }
  return out;
}

function journal(symbol='BTCUSDT',n=40){
  return Array.from({length:n},(_,i)=>({
    forecastId:symbol+'_'+i,
    symbol,
    asOf:T0-((n-i)+2)*3_600_000,
    direction:i%3===0?'UP':i%3===1?'DOWN':'FLAT',
    confidence:.55,
    horizons:[{
      horizonId:'1h',
      probabilities:{up:.45,down:.35,flat:.20},
      interval:{q10:-.01,q90:.01}
    }],
    resolution:{
      resolvedAt:T0-((n-i)+1)*3_600_000,
      actualDirection:i%3===0?'UP':i%3===1?'DOWN':'FLAT',
      topCorrect:true,
      actualReturn:.002,
      intervalMiss:false
    }
  }));
}

test('world model is fail-closed and distinguishes association from causality',()=>{
  const runtime=buildBiggjWorldModelRuntime({
    seriesBySymbol:{
      BTCUSDT:series(60000,.0001),
      ETHUSDT:series(3000,.00012),
      SOLUSDT:series(150,.00008)
    },
    radarRows:[
      {symbol:'BTCUSDT',capturedAt:T0,regime:'TREND',bias:'BULLISH',status:'VALID',witnessAgreement:.8,support:12},
      {symbol:'ETHUSDT',capturedAt:T0,regime:'TREND',bias:'BULLISH',status:'VALID',witnessAgreement:.75,support:11}
    ],
    assetClassBySymbol:{BTCUSDT:'CORE',ETHUSDT:'CORE',SOLUSDT:'CORE'},
    forecastJournalEntries:[],
    asOf:T0
  });
  assert.equal(runtime.version,BIGGJ_WORLD_MODEL_RUNTIME_VERSION);
  assert.equal(runtime.execution,'SHADOW_ONLY');
  assert.equal(runtime.action,'ABSTAIN');
  assert.equal(runtime.canInfluencePrimary,false);
  assert.equal(runtime.canExecuteLive,false);
  for(const edge of runtime.associationGraph.edges) assert.equal(edge.causal,false);
  for(const edge of runtime.informationFlowHypotheses.candidates){
    assert.equal(edge.causal,false);
    assert.equal(edge.predictivePermission,false);
  }
  assert.equal(runtime.epistemicPolicy.observedAssociationIsNotCausality,true);
  assert.equal(runtime.epistemicPolicy.leadLagIsHypothesisOnly,true);
  assert.equal(verifyBiggjWorldModelRuntime(runtime).ok,true);
});

test('future price rows are excluded from PIT world model series',()=>{
  const rows=series(60000);
  rows.push({closeTime:T0+60_000,close:999999});
  const runtime=buildBiggjWorldModelRuntime({
    seriesBySymbol:{
      BTCUSDT:rows,
      ETHUSDT:series(3000)
    },
    asOf:T0
  });
  assert.equal(runtime.seriesCoverage.BTCUSDT.lastAt<=T0,true);
  assert.notEqual(runtime.associationGraph.nodes.find(x=>x.symbol==='BTCUSDT')?.return1h,999999);
});

test('latent state remains explicitly unknown until a validated estimator is promoted',()=>{
  const runtime=buildBiggjWorldModelRuntime({asOf:T0});
  assert.equal(runtime.latentState.status,'UNKNOWN');
  assert.equal(runtime.latentState.estimatorPromoted,false);
  assert.equal(runtime.latentState.dimensions.length,0);
  assert.ok(runtime.unknowns.some(x=>x.id==='LATENT_MARKET_STATE'));
});

test('radar rows form an inferred state atlas rather than observed fact',()=>{
  const runtime=buildBiggjWorldModelRuntime({
    radarRows:[{
      symbol:'BTCUSDT',
      capturedAt:T0,
      regime:'HIGH_LEVERAGE',
      bias:'BULLISH',
      status:'CAUTION',
      gate:'INSUFFICIENT',
      witnessAgreement:.64,
      support:9,
      novelty:.2,
      contradiction:.1
    }],
    asOf:T0
  });
  assert.equal(runtime.stateAtlas.length,1);
  assert.equal(runtime.stateAtlas[0].epistemicClass,'INFERRED');
  assert.equal(runtime.stateAtlas[0].causal,false);
});

test('latent-state candidate can be researched without becoming canonical state or decision authority',()=>{
  const runtime=buildBiggjWorldModelRuntime({
    seriesBySymbol:{
      BTCUSDT:series(60000,.00010),
      ETHUSDT:series(3000,.00012),
      SOLUSDT:series(150,.00008),
      BNBUSDT:series(600,.00009),
      XRPUSDT:series(.6,.00011)
    },
    radarRows:[
      {symbol:'BTCUSDT',capturedAt:T0,regime:'TREND',bias:'BULLISH',status:'VALID',witnessAgreement:.8,support:12,contradiction:.1},
      {symbol:'ETHUSDT',capturedAt:T0,regime:'TREND',bias:'BULLISH',status:'VALID',witnessAgreement:.75,support:11,contradiction:.1},
      {symbol:'SOLUSDT',capturedAt:T0,regime:'TREND',bias:'BULLISH',status:'VALID',witnessAgreement:.72,support:10,contradiction:.2}
    ],
    assetClassBySymbol:{BTCUSDT:'MAJOR',ETHUSDT:'MAJOR',SOLUSDT:'L1',BNBUSDT:'L1',XRPUSDT:'ALT'},
    asOf:T0
  });
  const candidate=runtime.latentState.researchCandidate;
  assert.equal(runtime.latentState.status,'UNKNOWN');
  assert.equal(runtime.latentState.estimatorPromoted,false);
  assert.equal(candidate.status,'RESEARCH_CANDIDATE');
  assert.equal(candidate.epistemicClass,'MODELLED');
  assert.equal(candidate.decisionAuthority,false);
  assert.equal(candidate.tradingAuthority,false);
  assert.ok(candidate.coverage.populatedDimensions>=4);
  assert.match(candidate.meaning,/NOT_A_VALIDATED_LATENT_MARKET_STATE/);
});

test('forecast field is explicitly forecast-performance evidence, not intrinsic predictability',()=>{
  const runtime=buildBiggjWorldModelRuntime({
    seriesBySymbol:{
      BTCUSDT:series(60000),
      ETHUSDT:series(3000)
    },
    forecastJournalEntries:journal('BTCUSDT',40),
    asOf:T0,
    minForecastSamples:30
  });
  const btc=runtime.forecastabilityField.markets.find(x=>x.symbol==='BTCUSDT');
  assert.ok(btc);
  assert.equal(btc.epistemicClass,'OBSERVED_FORECAST_PERFORMANCE');
  assert.match(btc.meaning,/NOT_INTRINSIC_MARKET_PREDICTABILITY/);
  assert.equal(runtime.epistemicPolicy.forecastPerformanceIsNotIntrinsicPredictability,true);
});

test('world runtime summary cannot gain trading authority',()=>{
  const runtime=buildBiggjWorldModelRuntime({
    seriesBySymbol:{
      BTCUSDT:series(60000),
      ETHUSDT:series(3000)
    },
    asOf:T0
  });
  const summary=biggjWorldModelRuntimeSummary(runtime);
  assert.equal(summary.execution,'SHADOW_ONLY');
  assert.equal(summary.action,'ABSTAIN');
  assert.equal(summary.canInfluencePrimary,false);
  assert.equal(summary.canExecuteLive,false);
  assert.equal(summary.fingerprint,runtime.fingerprint);
});
