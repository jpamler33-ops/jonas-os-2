import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveForecastRuntimeQuality, renderInstitutionalForecastCard, forecastKeyboard } from './forecast-product.mjs';

test('quality diagnostic is bounded and explicitly non-probabilistic',()=>{
  const q=deriveForecastRuntimeQuality({
    safety:{state:'NORMAL'},
    marketAudit:{ok:true},
    witnessAudit:{ok:true},
    engineAudit:{ok:true},
    witnessReport:{externalWitnessCount:2},
    dashboard:{biasScore:6},
    extraFeatureCount:10
  });
  assert.equal(q.dataQuality,1);
  assert.equal(q.regimeConfidence,1);
  assert.match(q.epistemic.dataQuality,/NOT_PROBABILITY/);
});

test('SAFE_STOP collapses runtime input quality',()=>{
  const q=deriveForecastRuntimeQuality({
    safety:{state:'SAFE_STOP'},
    marketAudit:{ok:true},
    witnessAudit:{ok:true},
    engineAudit:{ok:true},
    witnessReport:{externalWitnessCount:2},
    dashboard:{biasScore:6},
    extraFeatureCount:10
  });
  assert.equal(q.dataQuality,0);
});

test('forecast card suppresses unavailable probabilities',()=>{
  const issuance={
    symbol:'BTCUSDT',asOf:1000,generatedAt:1100,traceId:'a'.repeat(64),issuanceId:'b'.repeat(64),
    admission:{gate:'INSUFFICIENT',researchDisposition:'ABSTAIN'},
    trace:{validity:{state:'BASELINE'},safety:{state:'NORMAL'}},
    forecast:{
      scienceGate:'INSUFFICIENT',overallGate:'INSUFFICIENT',
      horizons:[{
        horizonId:'5m',direction:'UP',gate:'INSUFFICIENT',expectedReturn:.01,
        interval:{q10:-.01,q90:.02},
        display:{probabilityDisplayAllowed:false,suppressionReasons:['CALIBRATION_INSUFFICIENT'],probabilities:null},
        support:{analogCount:3,effectiveSamples:2},
        calibration:{status:'INSUFFICIENT'}
      }],
      path:{coherence:'INSUFFICIENT',dominantArchetype:'UNKNOWN'}
    }
  };
  const text=renderInstitutionalForecastCard(issuance,{now:1200});
  assert.match(text,/Wahrscheinlichkeit: noch nicht freigegeben/);
  assert.doesNotMatch(text,/P↑/);
  assert.match(text,/SHADOW_ONLY/);
});

test('forecast callback data remains compact',()=>{
  const kb=forecastKeyboard('BTCUSDT');
  for(const row of kb.inline_keyboard) for(const b of row){
    assert.ok(Buffer.byteLength(b.callback_data,'utf8')<=64);
  }
});


test('audit failure suppresses otherwise displayable probability',()=>{
  const issuance={
    symbol:'BTCUSDT',asOf:1000,generatedAt:1100,traceId:'a'.repeat(64),issuanceId:'b'.repeat(64),
    probabilityDisplayAllowed:true,
    admission:{gate:'PASS',researchDisposition:'ADMIT_RESEARCH'},
    trace:{validity:{state:'VALID'},safety:{state:'NORMAL'}},
    forecast:{
      scienceGate:'PASS',overallGate:'PASS',
      horizons:[{
        horizonId:'5m',direction:'UP',gate:'PASS',expectedReturn:.01,
        interval:{q10:-.01,q90:.02},
        display:{probabilityDisplayAllowed:true,suppressionReasons:[],probabilities:{up:.6,flat:.2,down:.2}},
        support:{analogCount:50,effectiveSamples:25},
        calibration:{status:'CALIBRATED'}
      }],
      path:{coherence:'COHERENT',dominantArchetype:'TREND'}
    }
  };
  const text=renderInstitutionalForecastCard(issuance,{auditBound:false,now:1200});
  assert.match(text,/Audit: FEHLER → Forecast gesperrt/);
  assert.match(text,/Probability: SUPPRESSED/);
  assert.doesNotMatch(text,/P↑/);
});


test('audit failure suppresses otherwise displayable probabilities',()=>{
  const issuance={
    symbol:'BTCUSDT',asOf:1000,generatedAt:1000,traceId:'a'.repeat(64),issuanceId:'b'.repeat(64),
    admission:{gate:'PASS',researchDisposition:'ADMIT_RESEARCH'},
    trace:{validity:{state:'VALID'},safety:{state:'NORMAL'}},
    forecast:{
      scienceGate:'PASS',overallGate:'PASS',
      horizons:[{
        horizonId:'5m',direction:'UP',gate:'PASS',expectedReturn:.01,
        interval:{q10:-.01,q90:.02},
        display:{probabilityDisplayAllowed:true,suppressionReasons:[],probabilities:{up:.6,flat:.2,down:.2}},
        support:{analogCount:50,effectiveSamples:30},
        calibration:{status:'CALIBRATED'}
      }]
    }
  };
  const text=renderInstitutionalForecastCard(issuance,{now:1100,auditHealthy:false});
  assert.match(text,/Aktion: ABSTAIN/);
  assert.match(text,/Probability: SUPPRESSED/);
  assert.doesNotMatch(text,/P↑/);
  assert.match(text,/Audit: FEHLER → Forecast gesperrt/);
});


test('forecast card explains the signal in plain German',()=>{
  const issuance={
    symbol:'BTCUSDT',asOf:1000,generatedAt:1000,traceId:'a'.repeat(64),issuanceId:'b'.repeat(64),
    probabilityDisplayAllowed:false,
    admission:{gate:'INSUFFICIENT',researchDisposition:'ABSTAIN'},
    trace:{validity:{state:'VALID'},safety:{state:'NORMAL'}},
    forecast:{
      scienceGate:'INSUFFICIENT',overallGate:'INSUFFICIENT',
      horizons:[{
        horizonId:'5m',direction:'UP',gate:'INSUFFICIENT',expectedReturn:.01,
        interval:{q10:-.01,q90:.02},
        display:{probabilityDisplayAllowed:false,suppressionReasons:['CALIBRATION_INSUFFICIENT'],probabilities:null},
        support:{analogCount:3,effectiveSamples:2},
        calibration:{status:'INSUFFICIENT'}
      }],
      path:{coherence:'INSUFFICIENT',dominantArchetype:'UNKNOWN'}
    }
  };
  const rendered=renderInstitutionalForecastCard(issuance,{now:1100});
  assert.match(rendered,/KURZ GESAGT/);
  assert.match(rendered,/eher nach oben/);
  assert.match(rendered,/WAS DAS FÜR DICH BEDEUTET/);
  assert.match(rendered,/noch nicht freigegeben/);
  assert.doesNotMatch(rendered,/P↑/);
  assert.match(rendered,/SHADOW_ONLY/);
});
