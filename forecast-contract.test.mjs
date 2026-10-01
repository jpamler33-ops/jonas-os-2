import test from 'node:test';
import assert from 'node:assert/strict';

import { createCanonicalForecast, verifyCanonicalForecast } from './forecast-contract.mjs';

function horizon(extra={}){
  return {
    horizonId:'5m',
    horizonMs:300000,
    gate:'PASS',
    direction:'UP',
    expectedReturn:.003,
    flatThreshold:.001,
    probabilities:{up:.6,down:.2,flat:.2},
    interval:{q10:-.01,q25:-.003,median:.002,q75:.006,q90:.012},
    scenarios:[],
    calibration:{
      status:'CALIBRATED',method:'TRICLASS_EMPIRICAL',
      sampleCount:100,effectiveSamples:80,multiclassBrier:.4,logLoss:.7,maxClassGap:.03,
      targetEffectiveSamples:40,bins:10,
      perClass:{
        up:{raw:.58,calibrated:.6,empirical:.61,meanPredicted:.57,calibrationGap:.02,sampleCount:42,effectiveSamples:31,probabilityBinIndex:5,probabilityBinLo:.5,probabilityBinHi:.6,targetEffectiveSamples:40,effectiveSampleDeficit:9},
        down:{raw:.22,calibrated:.2,empirical:.19,meanPredicted:.23,calibrationGap:.02,sampleCount:50,effectiveSamples:41,probabilityBinIndex:2,probabilityBinLo:.2,probabilityBinHi:.3,targetEffectiveSamples:40,effectiveSampleDeficit:0},
        flat:{raw:.20,calibrated:.2,empirical:.20,meanPredicted:.20,calibrationGap:0,sampleCount:55,effectiveSamples:44,probabilityBinIndex:2,probabilityBinLo:.2,probabilityBinHi:.3,targetEffectiveSamples:40,effectiveSampleDeficit:0}
      }
    },
    localReliability:{status:'PASS',effectiveSamples:50,brierScore:.18},
    drift:{status:'STABLE',score:.1},
    analogs:{count:50,effectiveSamples:30,independentEpisodes:25,episodeEffectiveSamples:20,maxSimilarity:.9,oodScore:.1},
    operationalConfidence:.7,
    modelDispersion:.002,
    probabilityDisagreement:.04,
    directionalEntropy:.5,
    reasons:[],warnings:[],
    audit:{asOf:1000,usableTrainingCases:90,blockedFutureCases:5,invalidCases:1,featureCoverage:1,executionMode:'SHADOW_ONLY'},
    ...extra
  };
}

function report(h=horizon()){
  return {
    executionMode:'SHADOW_ONLY',
    forecast:{
      symbol:'BTCUSDT',asOf:1000,price:65000,
      forecasts:[h],path:{coherence:'OK'},executionMode:'SHADOW_ONLY'
    },
    regimeTransition:{status:'SUPPORTED'}
  };
}

function input(){
  return {symbol:'BTCUSDT',asOf:1000,price:65000,features:{x:1},dataQuality:.9,regimeConfidence:.8};
}

test('calibrated admissible horizon may expose probabilities',()=>{
  const f=createCanonicalForecast({
    input:input(),
    report:report(),
    generatedAt:1010,
    scientificValidity:{gate:'PASS',executionMode:'SHADOW_ONLY'}
  });
  assert.equal(f.horizons[0].display.probabilityDisplayAllowed,true);
  assert.deepEqual(f.horizons[0].display.probabilities,{up:.6,down:.2,flat:.2});
  assert.equal(f.horizons[0].display.probabilityEpistemic,'CALIBRATED_PROBABILITY');
  assert.equal(f.horizons[0].flatThreshold,.001);
  assert.equal(f.horizons[0].calibration.targetEffectiveSamples,40);
  assert.equal(f.horizons[0].calibration.bins,10);
  assert.equal(f.horizons[0].calibration.perClass.up.probabilityBinIndex,5);
  assert.equal(f.horizons[0].calibration.perClass.up.effectiveSamples,31);
  assert.equal(f.horizons[0].calibration.perClass.up.effectiveSampleDeficit,9);
  assert.equal(verifyCanonicalForecast(f).ok,true);
});

test('uncalibrated probability remains auditable but suppressed from display',()=>{
  const h=horizon({calibration:{status:'INSUFFICIENT',sampleCount:3,effectiveSamples:2}});
  const f=createCanonicalForecast({
    input:input(),report:report(h),generatedAt:1010,
    scientificValidity:{gate:'PASS',executionMode:'SHADOW_ONLY'}
  });
  assert.deepEqual(f.horizons[0].probabilities,{up:.6,down:.2,flat:.2});
  assert.equal(f.horizons[0].display.probabilities,null);
  assert.equal(f.horizons[0].display.probabilityDisplayAllowed,false);
  assert.ok(f.horizons[0].display.suppressionReasons.includes('CALIBRATION_INSUFFICIENT'));
});

test('scientific ABSTAIN suppresses otherwise calibrated forecast probabilities',()=>{
  const f=createCanonicalForecast({
    input:input(),report:report(),generatedAt:1010,
    scientificValidity:{gate:'ABSTAIN',executionMode:'SHADOW_ONLY'}
  });
  assert.equal(f.overallGate,'ABSTAIN');
  assert.equal(f.horizons[0].display.probabilityDisplayAllowed,false);
  assert.ok(f.horizons[0].display.suppressionReasons.includes('SCIENCE_GATE_ABSTAIN'));
});

test('forecast probabilities must form a valid simplex',()=>{
  const h=horizon({probabilities:{up:.8,down:.4,flat:.1}});
  assert.throws(()=>createCanonicalForecast({
    input:input(),report:report(h),generatedAt:1010,
    scientificValidity:{gate:'PASS',executionMode:'SHADOW_ONLY'}
  }),/sum to 1/);
});

test('forecast intervals must be monotonic',()=>{
  const h=horizon({interval:{q10:-.01,q25:.01,median:0,q75:.02,q90:.03}});
  assert.throws(()=>createCanonicalForecast({
    input:input(),report:report(h),generatedAt:1010,
    scientificValidity:{gate:'PASS',executionMode:'SHADOW_ONLY'}
  }),/not monotonic/);
});

test('forecast report cannot escape SHADOW_ONLY',()=>{
  const r=report();
  r.executionMode='LIVE';
  assert.throws(()=>createCanonicalForecast({
    input:input(),report:r,generatedAt:1010,
    scientificValidity:{gate:'PASS',executionMode:'SHADOW_ONLY'}
  }),/SHADOW_ONLY/);
});

test('forecast horizon audit must bind to issuance asOf',()=>{
  const h=horizon({audit:{asOf:999,usableTrainingCases:90,blockedFutureCases:0,invalidCases:0,featureCoverage:1,executionMode:'SHADOW_ONLY'}});
  assert.throws(()=>createCanonicalForecast({
    input:input(),report:report(h),generatedAt:1010,
    scientificValidity:{gate:'PASS',executionMode:'SHADOW_ONLY'}
  }),/asOf mismatch/);
});

test('tampering is detected by forecast fingerprint',()=>{
  const f=createCanonicalForecast({
    input:input(),report:report(),generatedAt:1010,
    scientificValidity:{gate:'PASS',executionMode:'SHADOW_ONLY'}
  });
  const tampered=structuredClone(f);
  tampered.horizons[0].probabilities.up=.99;
  assert.equal(verifyCanonicalForecast(tampered).ok,false);
});
