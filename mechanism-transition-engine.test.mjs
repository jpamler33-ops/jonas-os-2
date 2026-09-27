import test from 'node:test';
import assert from 'node:assert/strict';
import { mechanismChannels, evidenceAudit, buildTransitionObservations, queryTransitionLattice, mechanismHypothesis, runMechanismTransitionEngine } from './mechanism-transition-engine.mjs';

function vector(overrides={}){
  return {
    biasScore:4,pressureScore:55,spreadBps:1.2,imbalance:0.28,atrPct:0.5,realizedVolPct:0.25,volumeRatio:1.5,
    emaGapPct:0.8,supportDistancePct:0.6,resistanceDistancePct:1.2,
    regime:'TREND_ORDERLY',localTrend:'BULLISH',liquidity:'NORMAL',flow:'BID_PRESSURE',dominantPressure:'FLOW_SKEW',
    patternStage:'NONE',patternSide:'NONE',...overrides
  };
}
function ep(i,v=vector()){
  return {
    id:'e'+i,symbol:'BTCUSDT',anchorCloseTime:i*15*60_000,vector:v,outcomes:{}
  };
}

test('mechanism channels are bounded and separated',()=>{
  const c=mechanismChannels(vector());
  for(const x of Object.values(c)) assert.ok(x>=0&&x<=1);
  assert.ok(c.FORCED_FLOW>0);
  assert.ok(c.LIQUIDITY_STRESS>=0);
});

test('evidence audit detects flow/trend contradiction without witness report',()=>{
  const v=vector({localTrend:'BEARISH',flow:'BID_PRESSURE'});
  const c=mechanismChannels(v);
  const a=evidenceAudit(v,c);
  assert.ok(a.conflictFlags.includes('FLOW_VS_TREND'));
  assert.equal(a.independentWitnessSatisfied,false);
  assert.equal(a.sourceIndependence,'SINGLE_PROVIDER_MULTI_MODALITY');
});

test('transition observations use time-window successor instead of arbitrary next episode',()=>{
  const episodes=[ep(0),ep(1),ep(5),ep(6)];
  const obs=buildTransitionObservations(episodes,{symbol:'BTCUSDT',horizonMinutes:15,toleranceMinutes:2});
  assert.equal(obs.length,2);
  assert.equal(obs[0].from.id,'e0');
  assert.equal(obs[0].to.id,'e1');
  assert.equal(obs[1].from.id,'e5');
  assert.equal(obs[1].to.id,'e6');
});

test('lattice reports coherent repeated transition families without calling them causal',()=>{
  const episodes=[];
  for(let i=0;i<20;i++){
    const from=ep(i*2,vector());
    const to=ep(i*2+1,vector({regime:'TREND_EXPANSION',pressureScore:72}));
    episodes.push(from,to);
  }
  const q=queryTransitionLattice(vector(),episodes,{symbol:'BTCUSDT',horizonMinutes:15,minSupport:5});
  assert.ok(q.support>=5);
  assert.ok(q.transitionCoherence>0.5);
  assert.equal(q.epistemic,'OBSERVATIONAL_TRANSITION_EVIDENCE');
});

test('hypothesis cannot reach identifiability review without independent witness',()=>{
  const v=vector();
  const c=mechanismChannels(v);
  const a=evidenceAudit(v,c);
  const h=mechanismHypothesis(v,c,a,{support:20,novelty:0.1,transitionCoherence:0.9});
  assert.notEqual(h.gate,'IDENTIFIABILITY_REVIEW');
  assert.equal(h.causalStatus,'NOT_IDENTIFIED');
});

test('full engine keeps action ABSTAIN and causal status NOT_IDENTIFIED',()=>{
  const episodes=[];
  for(let i=0;i<12;i++){
    episodes.push(ep(i*2,vector()),ep(i*2+1,vector({regime:'TREND_EXPANSION'})));
  }
  const result=runMechanismTransitionEngine({
    analysis:{lastClose:100,ema20:101,ema50:100,support:98,resistance:103,trend:'BULLISH',pattern:null},
    dashboard:{...vector(),bias:'BULLISH'},
    episodes,
    symbol:'BTCUSDT',
    horizonMinutes:15
  });
  assert.equal(result.action,'ABSTAIN');
  assert.equal(result.execution,'SHADOW_ONLY');
  assert.equal(result.hypothesis.causalStatus,'NOT_IDENTIFIED');
});


test('independent multi-venue witness can satisfy witness gate without claiming causality',()=>{
  const v=vector();
  const c=mechanismChannels(v);
  const witness={
    sourceIndependence:'MULTI_VENUE_INDEPENDENT',
    independentWitnessSatisfied:true,
    agreementScore:0.82,
    externalWitnessCount:2,
    contradictions:[],
    caveats:['ORDERBOOK_IMBALANCE_IS_VENUE_LOCAL']
  };
  const a=evidenceAudit(v,c,witness);
  assert.equal(a.independentWitnessSatisfied,true);
  assert.equal(a.sourceIndependence,'MULTI_VENUE_INDEPENDENT');
  assert.equal(a.witnessCoverage,2);
});

test('identifiability review requires strict witness but causal status remains NOT_IDENTIFIED',()=>{
  const v=vector();
  const c=mechanismChannels(v);
  const a=evidenceAudit(v,c,{
    sourceIndependence:'MULTI_VENUE_INDEPENDENT',
    independentWitnessSatisfied:true,
    agreementScore:0.9,
    externalWitnessCount:2,
    contradictions:[],
    caveats:[]
  });
  const h=mechanismHypothesis(v,c,a,{support:20,novelty:0.05,transitionCoherence:0.9});
  assert.equal(h.gate,'IDENTIFIABILITY_REVIEW');
  assert.equal(h.causalStatus,'NOT_IDENTIFIED');
});

test('full engine stays ABSTAIN even with strict independent witness',()=>{
  const episodes=[];
  for(let i=0;i<12;i++){
    episodes.push(ep(i*2,vector()),ep(i*2+1,vector({regime:'TREND_EXPANSION'})));
  }
  const result=runMechanismTransitionEngine({
    analysis:{lastClose:100,ema20:101,ema50:100,support:98,resistance:103,trend:'BULLISH',pattern:null},
    dashboard:{...vector(),bias:'BULLISH'},
    episodes,
    symbol:'BTCUSDT',
    horizonMinutes:15,
    witnessReport:{
      sourceIndependence:'MULTI_VENUE_INDEPENDENT',
      independentWitnessSatisfied:true,
      agreementScore:0.9,
      externalWitnessCount:2,
      contradictions:[],
      caveats:[]
    }
  });
  assert.equal(result.action,'ABSTAIN');
  assert.equal(result.execution,'SHADOW_ONLY');
  assert.equal(result.hypothesis.causalStatus,'NOT_IDENTIFIED');
});
