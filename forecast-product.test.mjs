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
  assert.match(text,/Probability: SUPPRESSED/);
  assert.doesNotMatch(text,/P↑/);
  assert.match(text,/SHADOW_ONLY/);
});

test('forecast callback data remains compact',()=>{
  const kb=forecastKeyboard('BTCUSDT');
  for(const row of kb.inline_keyboard) for(const b of row){
    assert.ok(Buffer.byteLength(b.callback_data,'utf8')<=64);
  }
});
