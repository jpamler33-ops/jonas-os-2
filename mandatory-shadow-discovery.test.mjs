import test from 'node:test';
import assert from 'node:assert/strict';
import { buildShadowTradeQualityModel } from './shadow-trade-quality-learner.mjs';
import { deriveMandatoryShadowDiscovery } from './mandatory-shadow-discovery.mjs';

function issuance(overrides={}){
  return {
    issuanceId:'iss1',symbol:'BTCUSDT',generatedAt:1000,
    executionMode:'SHADOW_ONLY',action:'ABSTAIN',canExecute:false,
    admission:{gate:'PASS'},probabilityDisplayAllowed:true,
    trace:{safety:{state:'NORMAL'}},
    forecastFingerprint:'f'.repeat(64),
    forecast:{horizons:[
      {
        horizonId:'5m',horizonMs:300000,gate:'PASS',direction:'UP',expectedReturn:.001,
        calibration:{status:'CALIBRATED'},display:{probabilityDisplayAllowed:true,probabilities:{up:.54,down:.40,flat:.06}}
      },
      {
        horizonId:'15m',horizonMs:900000,gate:'PASS',direction:'DOWN',expectedReturn:-.0018,
        calibration:{status:'CALIBRATED'},display:{probabilityDisplayAllowed:true,probabilities:{up:.39,down:.56,flat:.05}}
      }
    ]},
    ...overrides
  };
}

test('mandatory discovery produces a bounded shadow learning candidate',()=>{
  const model=buildShadowTradeQualityModel({positions:[]},{asOf:2000});
  const d=deriveMandatoryShadowDiscovery(issuance(),model,{now:2000,notionalQuote:12,assetClass:'CORE'});
  assert.equal(d.eligible,true);
  assert.equal(d.entryMode,'EXPLORATION');
  assert.equal(d.execution,'SHADOW_ONLY');
  assert.equal(d.action,'ABSTAIN');
  assert.equal(d.canExecuteLive,false);
  assert.equal(d.notionalQuote,12);
  assert.ok(d.learning.learningValue>0);
});

test('discovery default uses a medium 25 USDT virtual notional',()=>{
  const model=buildShadowTradeQualityModel({positions:[]},{asOf:2000});
  const d=deriveMandatoryShadowDiscovery(issuance(),model,{now:2000,assetClass:'CORE'});
  assert.equal(d.eligible,true);
  assert.equal(d.notionalQuote,25);
  assert.equal(d.entryMode,'EXPLORATION');
  assert.equal(d.canExecuteLive,false);
});

test('discovery refuses unsafe data even though search is mandatory',()=>{
  const model=buildShadowTradeQualityModel({positions:[]},{asOf:2000});
  const d=deriveMandatoryShadowDiscovery(issuance({trace:{safety:{state:'DEGRADED'}}}),model,{now:2000});
  assert.equal(d.eligible,false);
  assert.equal(d.reason,'DATA_SAFETY_NOT_NORMAL');
});

test('discovery refuses uncalibrated horizons',()=>{
  const x=issuance();
  x.forecast.horizons=x.forecast.horizons.map(h=>({...h,calibration:{status:'UNCALIBRATED'}}));
  const model=buildShadowTradeQualityModel({positions:[]},{asOf:2000});
  const d=deriveMandatoryShadowDiscovery(x,model,{now:2000});
  assert.equal(d.eligible,false);
  assert.equal(d.reason,'NO_SAFE_LEARNABLE_CANDIDATE');
});

test('discovery prioritizes learnable candidates without claiming live execution',()=>{
  const model=buildShadowTradeQualityModel({positions:[]},{asOf:2000});
  const d=deriveMandatoryShadowDiscovery(issuance(),model,{now:2000});
  assert.ok(['5m','15m'].includes(d.horizonId));
  assert.equal(d.searchRequired,true);
  assert.equal(d.canExecuteLive,false);
});


test('ABSTAIN admission cannot be bypassed by discovery probe options',()=>{
  const x=issuance({
    admission:{gate:'ABSTAIN',reasons:['RESEARCH_VALIDITY_ABSTAIN']},
    probabilityDisplayAllowed:false
  });
  x.forecast={horizons:x.forecast.horizons.map(h=>({
    ...h,
    gate:'ABSTAIN',
    probabilities:h.display.probabilities,
    display:{probabilityDisplayAllowed:false,probabilities:null}
  }))};
  const model=buildShadowTradeQualityModel({positions:[]},{asOf:2000});
  const d=deriveMandatoryShadowDiscovery(x,model,{
    now:2000,
    assetClass:'CORE',
    allowAbstainProbe:true,
    abstainProbeNotionalQuote:5
  });
  assert.equal(d.eligible,false);
  assert.equal(d.reason,'ADMISSION_ABSTAIN');
  assert.equal(d.canExecuteLive,false);
});

test('ABSTAIN forecast stays blocked when probe mode is not enabled',()=>{
  const x=issuance({
    admission:{gate:'ABSTAIN',reasons:['RESEARCH_VALIDITY_ABSTAIN']},
    probabilityDisplayAllowed:false
  });
  const model=buildShadowTradeQualityModel({positions:[]},{asOf:2000});
  const d=deriveMandatoryShadowDiscovery(x,model,{now:2000,assetClass:'CORE'});
  assert.equal(d.eligible,false);
  assert.equal(d.reason,'ADMISSION_ABSTAIN');
});

test('ABSTAIN remains blocked when safety is degraded too',()=>{
  const x=issuance({
    admission:{gate:'ABSTAIN',reasons:['RESEARCH_VALIDITY_ABSTAIN']},
    probabilityDisplayAllowed:false,
    trace:{safety:{state:'DEGRADED'}}
  });
  x.forecast={horizons:x.forecast.horizons.map(h=>({
    ...h,
    gate:'ABSTAIN',
    probabilities:h.display.probabilities,
    display:{probabilityDisplayAllowed:false,probabilities:null}
  }))};
  const model=buildShadowTradeQualityModel({positions:[]},{asOf:2000});
  const d=deriveMandatoryShadowDiscovery(x,model,{
    now:2000,
    allowAbstainProbe:true
  });
  assert.equal(d.eligible,false);
  assert.equal(d.reason,'ADMISSION_ABSTAIN');
});
