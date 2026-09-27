import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ProbabilisticForecastEngine,
  ForecastIntelligenceLayer,
  ForecastRevisionTracker,
  ForecastIntelligenceService,
  ForecastBotApi,
  buildRegimeTransitionForecast,
  assessForecastInvalidation,
  analyzeForecastCounterfactuals
} from './forecast-runtime/forecast/index.js';

const MIN=60_000;
const H5=5*MIN;
const H15=15*MIN;
const H60=60*MIN;
const ASOF=900_000_000;

function config(extra={}){
  return {
    featureIds:['trend','momentum','pressure'],
    horizons:[
      {id:'5m',horizonMs:H5,flatThreshold:.0005,topK:140,minSimilarity:.01,analogBandwidth:2,independenceWindowMs:H5},
      {id:'15m',horizonMs:H15,flatThreshold:.001,topK:140,minSimilarity:.01,analogBandwidth:2,independenceWindowMs:H15},
      {id:'1h',horizonMs:H60,flatThreshold:.002,topK:140,minSimilarity:.01,analogBandwidth:2,independenceWindowMs:H60}
    ],
    minTrainingCases:20,
    minRegimeCases:10,
    minAnalogCount:8,
    minAnalogEffectiveSamples:4,
    minAnalogIndependentEpisodes:3,
    minDataQuality:.7,
    minRegimeConfidence:.4,
    maxModelDispersion:.2,
    maxProbabilityDisagreement:1,
    minNearestSimilarity:.01,
    calibrationMinCases:500,
    reliabilityMinCases:500,
    intervalCalibrationMinCases:500,
    driftRecentCases:50,
    driftBaselineCases:100,
    pathMinCompleteTrajectories:10,
    pathMinEffectiveSamples:5,
    pathTopK:80,
    pathMinSimilarity:.01,
    recencyHalfLifeMs:1e12,
    ...extra
  };
}

function buildHistory(n=90){
  const rows=[];
  let regime='RANGE';
  for(let i=0;i<n;i++){
    const ts=100_000+i*(H60+10_000);
    if(i%9===0) regime=regime==='RANGE'?'TREND_UP':regime==='TREND_UP'?'TREND_DOWN':'RANGE';
    const trend=regime==='TREND_UP'?.8:regime==='TREND_DOWN'?-.8:.05*Math.sin(i);
    const momentum=.5*trend+.1*Math.cos(i);
    const pressure=.4*trend+.1*Math.sin(i/2);
    for(const h of [H5,H15,H60]){
      const k=h===H5?1:h===H15?1.8:3.2;
      rows.push({
        id:`${i}-${h}`,
        symbol:'BTCUSDT',
        timestamp:ts,
        availableAt:ts,
        resolvedAt:ts+h,
        horizonMs:h,
        features:{trend,momentum,pressure},
        regimeId:regime,
        forwardReturn:k*(.003*trend+.0015*momentum+.001*pressure),
        quality:1
      });
    }
  }
  return rows;
}

function input(extra={}){
  return {
    symbol:'BTCUSDT',
    asOf:ASOF,
    price:65000,
    features:{trend:.72,momentum:.39,pressure:.31},
    regimeId:'TREND_UP',
    regimeConfidence:.9,
    dataQuality:.99,
    ...extra
  };
}

function engine(){
  const e=new ProbabilisticForecastEngine(config());
  e.addHistoryMany(buildHistory());
  return e;
}

test('forecast integration keeps regime transitions normalized and PIT bounded',()=>{
  const e=engine();
  const cfg=e.configSnapshot();
  const r=buildRegimeTransitionForecast(input(),e.historySnapshot(ASOF),{
    featureIds:cfg.featureIds,
    featureWeights:cfg.featureWeights,
    recencyHalfLifeMs:1e12,
    minCases:5,
    minEffectiveSamples:3,
    maxTransitionGapMs:H60*2
  });
  const sum=r.probabilities.reduce((s,x)=>s+x.probability,0);
  assert.equal(r.currentRegime,'TREND_UP');
  assert.ok(r.sampleCount>=5);
  assert.ok(Math.abs(sum-1)<1e-9);
  assert.ok(r.changeProbability>=0&&r.changeProbability<=1);
});

test('future regime states are blocked from transition evidence',()=>{
  const e=engine();
  const cfg=e.configSnapshot();
  const opts={featureIds:cfg.featureIds,featureWeights:cfg.featureWeights,recencyHalfLifeMs:1e12,minCases:5,minEffectiveSamples:3,maxTransitionGapMs:H60*2};
  const before=buildRegimeTransitionForecast(input(),e.historySnapshot(Number.POSITIVE_INFINITY),opts);
  for(let i=0;i<20;i++){
    e.addHistory({
      id:`future-${i}`,
      symbol:'BTCUSDT',
      timestamp:ASOF+10_000+i*1000,
      availableAt:ASOF+10_000+i*1000,
      resolvedAt:ASOF+H60+i*1000,
      horizonMs:H5,
      features:{trend:9,momentum:9,pressure:9},
      regimeId:'CRASH',
      forwardReturn:-.5,
      quality:1
    });
  }
  const after=buildRegimeTransitionForecast(input(),e.historySnapshot(Number.POSITIVE_INFINITY),opts);
  assert.equal(after.audit.futureStatesBlocked,20);
  assert.deepEqual(
    {...after,audit:{...after.audit,futureStatesBlocked:0}},
    {...before,audit:{...before.audit,futureStatesBlocked:0}}
  );
});

test('forecast intelligence remains SHADOW_ONLY',()=>{
  const e=engine();
  const r=new ForecastIntelligenceLayer(e,{regimeTransition:{minCases:5,minEffectiveSamples:3,maxTransitionGapMs:H60*2}}).issue(input());
  assert.equal(r.executionMode,'SHADOW_ONLY');
  assert.equal(r.forecast.executionMode,'SHADOW_ONLY');
  assert.equal(r.forecast.forecasts.length,3);
});

test('material path breach invalidates the issued forecast',()=>{
  const e=engine();
  const issued=new ForecastIntelligenceLayer(e,{regimeTransition:{minCases:5,minEffectiveSamples:3,maxTransitionGapMs:H60*2}}).issue(input());
  const current=input({asOf:ASOF+H5/2,price:65000*.90});
  const a=assessForecastInvalidation(issued.forecast,current,issued.regimeTransition,{hardBreach:.5});
  assert.equal(a.status,'INVALIDATED');
  assert.ok(a.score>=.8);
});

test('upstream ABSTAIN is authoritative over forecast reuse',()=>{
  const e=engine();
  const issued=new ForecastIntelligenceLayer(e).issue(input());
  const current=input({asOf:ASOF+MIN,guards:[{id:'LIVE_DATA',status:'ABSTAIN',reasons:['feed invalid']}]});
  const a=assessForecastInvalidation(issued.forecast,current,issued.regimeTransition);
  assert.equal(a.status,'INVALIDATED');
  assert.equal(a.hardGuardActive,true);
});

test('revision tracking is chronological and invalidation is sticky',()=>{
  const e=engine();
  const issued=new ForecastIntelligenceLayer(e).issue(input());
  const tracker=new ForecastRevisionTracker({hardBreach:.5});
  const id=tracker.issue(input(),issued);
  tracker.observe(input({asOf:ASOF+MIN,price:65100}));
  tracker.observe(input({asOf:ASOF+2*MIN,price:57000}));
  const r=tracker.get(id);
  assert.equal(r.status,'INVALIDATED');
  assert.equal(r.revisions.length,2);
  tracker.observe(input({asOf:ASOF+3*MIN,price:65000}));
  assert.equal(tracker.get(id).status,'INVALIDATED');
});

test('duplicate or older observations do not manufacture revisions',()=>{
  const e=engine();
  const issued=new ForecastIntelligenceLayer(e).issue(input());
  const tracker=new ForecastRevisionTracker();
  const id=tracker.issue(input(),issued);
  const obs=input({asOf:ASOF+MIN,price:65100});
  tracker.observe(obs);
  tracker.observe(obs);
  tracker.observe(input({asOf:ASOF+MIN/2,price:65050}));
  assert.equal(tracker.get(id).revisions.length,1);
});

test('forecast counterfactuals are support-bounded, non-causal and learning-pure',()=>{
  const e=engine();
  const sizes={
    h:e.historySize(),
    c:e.calibration.all().length,
    r:e.reliability.all().length,
    i:e.intervalCalibration.all().length,
    d:e.drift.all().length,
    m:e.modelPerformance.all().length
  };
  const r=analyzeForecastCounterfactuals(e,input(),undefined,{stepScale:20,maxFeatures:3});
  assert.equal(r.interpretation,'MODEL_SENSITIVITY_NOT_CAUSAL');
  assert.ok(r.cases.some(x=>x.clampedToHistoricalSupport));
  assert.deepEqual({
    h:e.historySize(),
    c:e.calibration.all().length,
    r:e.reliability.all().length,
    i:e.intervalCalibration.all().length,
    d:e.drift.all().length,
    m:e.modelPerformance.all().length
  },sizes);
});

test('service audit is idempotent for duplicate observations',()=>{
  const e=engine();
  const s=new ForecastIntelligenceService(e);
  const issued=s.issue(input());
  const obs=input({asOf:ASOF+MIN,price:65100});
  s.observe(obs);
  s.observe(obs);
  s.observe(input({asOf:ASOF+MIN/2,price:65050}));
  assert.equal(s.get(issued.forecastId).revisions.length,1);
  assert.equal(s.auditTrail().filter(x=>x.type==='OBSERVATION_RECORDED').length,1);
});

test('restart snapshot preserves issue state and explainability',()=>{
  const e=engine();
  const s=new ForecastIntelligenceService(e);
  const issued=s.issue(input());
  s.observe(input({asOf:ASOF+MIN,price:65100}));
  const s2=new ForecastIntelligenceService(e);
  s2.restore(s.snapshot(),ASOF+2*MIN);
  assert.deepEqual(s2.get(issued.forecastId).issueState.features,input().features);
  const cf=s2.counterfactual(issued.forecastId,{maxFeatures:2});
  assert.equal(cf.interpretation,'MODEL_SENSITIVITY_NOT_CAUSAL');
});

test('bot adapter stays display-only and contains no execution language',()=>{
  const api=new ForecastBotApi(new ForecastIntelligenceService(engine(),{invalidation:{hardBreach:.5}}));
  const issued=api.issue(input());
  assert.match(issued.text,/SHADOW_ONLY/);
  assert.doesNotMatch(issued.text,/\bBUY\b|\bSELL\b|Kaufen|Verkaufen/);
  const explanation=api.explain(issued.forecastId,{maxFeatures:2});
  assert.match(explanation,/MODEL_SENSITIVITY_NOT_CAUSAL/);
  assert.doesNotMatch(explanation,/\bBUY\b|\bSELL\b/);
});

test('identical point-in-time issuance is audit-idempotent',()=>{
  const s=new ForecastIntelligenceService(engine());
  const a=s.issue(input());
  const b=s.issue(input());
  assert.equal(a.forecastId,b.forecastId);
  assert.equal(s.all().length,1);
  assert.equal(s.auditTrail().filter(x=>x.type==='FORECAST_ISSUED').length,1);
});
