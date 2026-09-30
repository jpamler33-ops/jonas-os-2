import test from 'node:test';
import assert from 'node:assert/strict';

import {
  generateControlledForecastHypotheses,
  FORECAST_HYPOTHESIS_GENERATOR_VERSION
} from './forecast-hypothesis-generator.mjs';

const MIN=60_000;
function config(){
  return {
    featureIds:['trend','pressure'],
    horizons:[
      {id:'5m',horizonMs:5*MIN,flatThreshold:.001,topK:180,minSimilarity:.08,analogBandwidth:1.5,independenceWindowMs:5*MIN},
      {id:'15m',horizonMs:15*MIN,flatThreshold:.0015,topK:180,minSimilarity:.08,analogBandwidth:1.5,independenceWindowMs:15*MIN}
    ],
    recencyHalfLifeMs:30*24*60*60_000,
    ridgeLambda:1,
    minRegimeCases:12,
    minRegimeConfidence:.4,
    pathTopK:120,
    pathMinSimilarity:.08,
    highConfidenceThreshold:.65,
    maxProbabilityDisagreement:.18,
    maxHighConfidenceWrongRate:.30,
    hardHighConfidenceWrongRate:.45,
    maxModelDispersion:.012,
    intervalUndercoverageTolerance:.08,
    intervalMaxScale:3,
    residualInflationFallback:1.25
  };
}
function rows(n=80){
  return Array.from({length:n},(_,i)=>{
    const ts=1_000_000+i*10*MIN;
    const regime=i%3===0?'TREND_UP':i%3===1?'TREND_DOWN':'RANGE';
    const ret=(i>n/2?1.6:1)*(Math.sin(i/4)*.004+(i%11===0?.009:0));
    return {
      id:'r'+i,
      symbol:'BTCUSDT',
      timestamp:ts,
      availableAt:ts,
      resolvedAt:ts+5*MIN,
      horizonMs:5*MIN,
      regimeId:regime,
      forwardReturn:ret,
      features:{trend:Math.sin(i/4),pressure:Math.cos(i/5)}
    };
  });
}

test('generator returns bounded hypotheses with locked target semantics',()=>{
  const base=config();
  const out=generateControlledForecastHypotheses({
    historyRows:rows(80),
    incumbentConfig:base,
    asOf:9_999_999_999,
    maxHypotheses:4
  });
  assert.equal(out.version,FORECAST_HYPOTHESIS_GENERATOR_VERSION);
  assert.equal(out.hypotheses.length,4);
  for(const h of out.hypotheses){
    assert.deepEqual(h.config.featureIds,base.featureIds);
    assert.deepEqual(
      h.config.horizons.map(x=>[x.id,x.horizonMs,x.flatThreshold]),
      base.horizons.map(x=>[x.id,x.horizonMs,x.flatThreshold])
    );
    assert.equal(h.source,'TCX_CONTROLLED_HYPOTHESIS_GRAMMAR');
    assert.ok(Number.isFinite(h.priority));
  }
});

test('generator does not emit hypotheses with too little history',()=>{
  const out=generateControlledForecastHypotheses({
    historyRows:rows(10),
    incumbentConfig:config(),
    asOf:9_999_999_999
  });
  assert.equal(out.hypotheses.length,0);
});

test('same inputs produce deterministic hypothesis order',()=>{
  const input={historyRows:rows(80),incumbentConfig:config(),asOf:9_999_999_999,maxHypotheses:4};
  const a=generateControlledForecastHypotheses(input);
  const b=generateControlledForecastHypotheses(input);
  assert.deepEqual(
    a.hypotheses.map(x=>[x.id,x.priority,x.config]),
    b.hypotheses.map(x=>[x.id,x.priority,x.config])
  );
});
