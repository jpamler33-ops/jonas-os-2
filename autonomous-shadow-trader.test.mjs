import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveAutonomousShadowTrade } from './autonomous-shadow-trader.mjs';

function issuance(overrides={}){
  return {
    issuanceId:'iss_1',symbol:'BTCUSDT',generatedAt:1_000_000,
    forecastFingerprint:'a'.repeat(64),
    executionMode:'SHADOW_ONLY',action:'ABSTAIN',canExecute:false,
    probabilityDisplayAllowed:true,
    admission:{gate:'PASS'},
    trace:{safety:{state:'NORMAL'}},
    forecast:{horizons:[{
      horizonId:'15m',horizonMs:900_000,gate:'PASS',direction:'UP',expectedReturn:0.006,
      calibration:{status:'CALIBRATED'},
      probabilities:{up:0.68,down:0.20,flat:0.12},
      display:{probabilityDisplayAllowed:true,probabilities:{up:0.68,down:0.20,flat:0.12}}
    }]},
    ...overrides
  };
}

test('admits strong calibrated PASS forecast into shadow BUY',()=>{
  const d=deriveAutonomousShadowTrade(issuance(),{now:1_030_000,notionalQuote:100});
  assert.equal(d.eligible,true);
  assert.equal(d.side,'BUY');
  assert.equal(d.type,'MARKET');
  assert.equal(d.notionalQuote,100);
  assert.equal(d.execution,'SHADOW_ONLY');
  assert.equal(d.canExecuteLive,false);
});

test('maps strong DOWN forecast to shadow SELL',()=>{
  const x=issuance();
  x.forecast={horizons:[{...x.forecast.horizons[0],direction:'DOWN',expectedReturn:-0.007,
    probabilities:{up:0.16,down:0.72,flat:0.12},
    display:{probabilityDisplayAllowed:true,probabilities:{up:0.16,down:0.72,flat:0.12}}
  }]};
  const d=deriveAutonomousShadowTrade(x,{now:1_030_000});
  assert.equal(d.eligible,true);
  assert.equal(d.side,'SELL');
});

test('CAUTION requires stronger edge than PASS',()=>{
  const x=issuance({admission:{gate:'CAUTION'}});
  x.forecast={horizons:[{...x.forecast.horizons[0],expectedReturn:0.003,
    probabilities:{up:0.60,down:0.24,flat:0.16},
    display:{probabilityDisplayAllowed:true,probabilities:{up:0.60,down:0.24,flat:0.16}}
  }]};
  const d=deriveAutonomousShadowTrade(x,{now:1_030_000});
  assert.equal(d.eligible,false);
  assert.equal(d.reason,'EXPECTED_RETURN_TOO_SMALL');
});

test('ABSTAIN admission never creates a trade',()=>{
  const d=deriveAutonomousShadowTrade(issuance({admission:{gate:'ABSTAIN'}}),{now:1_030_000});
  assert.equal(d.eligible,false);
  assert.equal(d.reason,'ADMISSION_ABSTAIN');
});

test('stale forecast is rejected',()=>{
  const d=deriveAutonomousShadowTrade(issuance(),{now:2_000_000,maxAgeMs:60_000});
  assert.equal(d.eligible,false);
  assert.equal(d.reason,'FORECAST_STALE');
});

test('safety invariants remain mandatory',()=>{
  const d=deriveAutonomousShadowTrade(issuance({canExecute:true}),{now:1_030_000});
  assert.equal(d.eligible,false);
  assert.equal(d.reason,'ISSUANCE_SAFETY_INVARIANT_INVALID');
});


test('strategy horizon selection can prefer strongest edge or longest horizon',()=>{
  const x=issuance();
  x.forecast={horizons:[
    {...x.forecast.horizons[0],horizonId:'15m',horizonMs:900_000,expectedReturn:0.004,
      probabilities:{up:0.62,down:0.23,flat:0.15},
      display:{probabilityDisplayAllowed:true,probabilities:{up:0.62,down:0.23,flat:0.15}}
    },
    {...x.forecast.horizons[0],horizonId:'1h',horizonMs:3_600_000,expectedReturn:0.008,
      probabilities:{up:0.74,down:0.14,flat:0.12},
      display:{probabilityDisplayAllowed:true,probabilities:{up:0.74,down:0.14,flat:0.12}}
    }
  ]};
  const edge=deriveAutonomousShadowTrade(x,{now:1_030_000,horizonSelection:'MAX_EDGE'});
  const longest=deriveAutonomousShadowTrade(x,{now:1_030_000,horizonSelection:'LONGEST'});
  assert.equal(edge.horizonId,'1h');
  assert.equal(longest.horizonId,'1h');
});
