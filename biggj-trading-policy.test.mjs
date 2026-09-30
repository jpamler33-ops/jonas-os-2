import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_BIGGJ_TRADING_POLICY,
  selectBiggjTradingHorizon,
  routeBiggjStrategy,
  evaluateBiggjEntryAdmission,
  deriveBiggjShadowRiskBudget,
  deriveBiggjPrimaryLeveragePolicy,
  deriveBiggjThesisEvidence,
  evaluateBiggjPositionLifecycle
} from './biggj-trading-policy.mjs';

function horizon(id,ms,{direction='UP',up=.70,down=.16,flat=.14,expectedReturn=.008}={}){
  return {
    horizonId:id,horizonMs:ms,gate:'PASS',direction,expectedReturn,
    calibration:{status:'CALIBRATED'},
    probabilities:{up,down,flat},
    display:{probabilityDisplayAllowed:true,probabilities:{up,down,flat}}
  };
}

test('CORE primary horizon excludes tiny lanes even when their edge is stronger',()=>{
  const x=selectBiggjTradingHorizon([
    horizon('5m',5*60_000,{up:.82,down:.08,flat:.10,expectedReturn:.015}),
    horizon('15m',15*60_000,{up:.78,down:.10,flat:.12,expectedReturn:.012}),
    horizon('1h',60*60_000,{up:.70,down:.16,flat:.14,expectedReturn:.008}),
    horizon('3h',3*60*60_000,{up:.66,down:.18,flat:.16,expectedReturn:.007})
  ],{assetClass:'CORE'});
  assert.equal(x.eligible,true);
  assert.equal(x.horizonId,'1h');
  assert.equal(x.horizonMs,60*60_000);
  assert.equal(x.execution,'SHADOW_ONLY');
  assert.equal(x.canExecuteLive,false);
});

test('MEME policy permits 15m but not 5m primary horizons',()=>{
  const x=selectBiggjTradingHorizon([
    horizon('5m',5*60_000,{up:.80,down:.08,flat:.12,expectedReturn:.012}),
    horizon('15m',15*60_000,{up:.72,down:.14,flat:.14,expectedReturn:.010}),
    horizon('1h',60*60_000,{up:.68,down:.16,flat:.16,expectedReturn:.009})
  ],{assetClass:'MEME'});
  assert.equal(x.eligible,true);
  assert.equal(x.horizonId,'15m');
});

test('horizon policy abstains instead of forcing a tiny CORE trade',()=>{
  const x=selectBiggjTradingHorizon([
    horizon('5m',5*60_000),
    horizon('15m',15*60_000)
  ],{assetClass:'CORE'});
  assert.equal(x.eligible,false);
  assert.equal(x.reason,'NO_PRIMARY_HORIZON');
});

test('strategy router keeps liquidity reversal research-only',()=>{
  const x=routeBiggjStrategy({liquidityReversalConfirmed:true});
  assert.equal(x.family,'LIQUIDITY_REVERSAL');
  assert.equal(x.mode,'RESEARCH_ONLY');
});

test('strong complete entry evidence can become PRIMARY',()=>{
  const h=selectBiggjTradingHorizon([horizon('1h',60*60_000)],{assetClass:'CORE'});
  const x=evaluateBiggjEntryAdmission({
    assetClass:'CORE',
    horizon:h,
    plannedRewardRisk:2,
    counterThesisStrength:.20,
    setupType:'A',
    setupMemoryStatus:'SUPPORTED',
    components:{
      forecastEdge:.85,
      structureQuality:.82,
      regimeFit:.78,
      flowConfirmation:.72,
      liquidityQuality:.90,
      setupMemory:.78,
      riskRewardQuality:.80,
      dataTrust:.95
    }
  });
  assert.equal(x.admission,'PRIMARY');
  assert.equal(x.admitted,true);
  assert.deepEqual(x.blockers,[]);
});

test('hard portfolio block prevents PRIMARY regardless of score',()=>{
  const h=selectBiggjTradingHorizon([horizon('1h',60*60_000)],{assetClass:'CORE'});
  const x=evaluateBiggjEntryAdmission({
    horizon:h,
    plannedRewardRisk:3,
    portfolioBlocked:true,
    components:Object.fromEntries(Object.keys(DEFAULT_BIGGJ_TRADING_POLICY.entry.weights).map(k=>[k,1]))
  });
  assert.equal(x.admitted,false);
  assert.ok(x.blockers.includes('PORTFOLIO_RISK_BLOCK'));
});

test('C setup cannot enter PRIMARY',()=>{
  const h=selectBiggjTradingHorizon([horizon('1h',60*60_000)],{assetClass:'CORE'});
  const x=evaluateBiggjEntryAdmission({
    horizon:h,
    plannedRewardRisk:2,
    setupType:'C',
    components:Object.fromEntries(Object.keys(DEFAULT_BIGGJ_TRADING_POLICY.entry.weights).map(k=>[k,.9]))
  });
  assert.notEqual(x.admission,'PRIMARY');
  assert.ok(x.blockers.includes('SETUP_C_RESEARCH_ONLY'));
});

test('primary horizon becomes a review point, not an unconditional exit',()=>{
  const openedAt=1_000_000;
  const x=evaluateBiggjPositionLifecycle({
    assetClass:'CORE',openedAt,horizonMs:60*60_000,stopLossPct:.01,takeProfitPct:.02
  },{
    at:openedAt+60*60_000,
    marginRoePct:-.002,
    thesisHealth:.76,
    oppositeThesisStrength:.20,
    trustedExecutableBook:true
  });
  assert.equal(x.action,'HOLD');
  assert.equal(x.reason,'HORIZON_REVIEW_EXTEND');
});

test('weak thesis at horizon exits instead of extending blindly',()=>{
  const openedAt=1_000_000;
  const x=evaluateBiggjPositionLifecycle({
    assetClass:'CORE',openedAt,horizonMs:60*60_000,stopLossPct:.01,takeProfitPct:.02
  },{
    at:openedAt+60*60_000,
    marginRoePct:-.002,
    thesisHealth:.40,
    oppositeThesisStrength:.40,
    trustedExecutableBook:true
  });
  assert.equal(x.action,'EXIT');
  assert.equal(x.reason,'HORIZON_REVIEW_THESIS_WEAK');
});

test('hard stop still exits immediately before horizon',()=>{
  const openedAt=1_000_000;
  const x=evaluateBiggjPositionLifecycle({
    assetClass:'CORE',openedAt,horizonMs:60*60_000,stopLossPct:.01,takeProfitPct:.02
  },{
    at:openedAt+10*60_000,
    marginRoePct:-.011,
    thesisHealth:.90,
    trustedExecutableBook:true
  });
  assert.equal(x.action,'EXIT');
  assert.equal(x.reason,'STOP_LOSS');
});

test('strong trade reaching target becomes a protected runner',()=>{
  const openedAt=1_000_000;
  const x=evaluateBiggjPositionLifecycle({
    assetClass:'CORE',openedAt,horizonMs:60*60_000,stopLossPct:.01,takeProfitPct:.02
  },{
    at:openedAt+30*60_000,
    marginRoePct:.021,
    thesisHealth:.80,
    oppositeThesisStrength:.15,
    trustedExecutableBook:true
  });
  assert.equal(x.action,'TRAIL');
  assert.equal(x.reason,'TARGET_RUNNER');
});

test('untrusted executable book freezes lifecycle instead of fabricating an exit',()=>{
  const x=evaluateBiggjPositionLifecycle({
    assetClass:'CORE',openedAt:1_000_000,horizonMs:60*60_000
  },{
    at:2_000_000,
    marginRoePct:-.50,
    thesisHealth:.10,
    trustedExecutableBook:false
  });
  assert.equal(x.action,'DATA_FREEZE');
  assert.equal(x.reason,'EXECUTABLE_BOOK_UNTRUSTED');
});

test('risk budget is stop-aware, capped and baseline unlevered',()=>{
  const x=deriveBiggjShadowRiskBudget({
    equityQuote:10_000,
    assetClass:'CORE',
    entryScore:.85,
    stopDistancePct:.01,
    portfolioMultiplier:1
  });
  assert.ok(x.riskQuote>0);
  assert.ok(x.notionalQuote<=1_200);
  assert.equal(x.leverage,1);
  assert.equal(x.execution,'SHADOW_ONLY');
  assert.equal(x.canExecuteLive,false);
});


function reviewPosition(overrides={}){
  return {
    symbol:'BTCUSDT',
    side:'LONG',
    assetClass:'CORE',
    horizonId:'1h',
    horizonMs:60*60_000,
    openedAt:1_000_000,
    tradingPolicyVersion:'BIGGJ_TRADING_POLICY_V1',
    ...overrides
  };
}

function reviewIssuance(overrides={}){
  const generatedAt=2_000_000;
  return {
    issuanceId:'iss_review_1',
    symbol:'BTCUSDT',
    generatedAt,
    probabilityDisplayAllowed:true,
    trace:{safety:{state:'NORMAL'}},
    forecastFingerprint:'f'.repeat(64),
    forecast:{horizons:[horizon('1h',60*60_000,{direction:'UP',up:.78,down:.12,flat:.10,expectedReturn:.01})]},
    ...overrides
  };
}

test('live thesis evidence binds same-symbol same-horizon calibrated PIT forecast',()=>{
  const x=deriveBiggjThesisEvidence(
    reviewPosition(),
    reviewIssuance(),
    {at:2_100_000}
  );
  assert.equal(x.trusted,true);
  assert.equal(x.reason,'THESIS_EVIDENCE_TRUSTED');
  assert.equal(x.thesisHealth,.78);
  assert.equal(x.oppositeThesisStrength,.12);
  assert.equal(x.issuanceId,'iss_review_1');
  assert.equal(x.execution,'SHADOW_ONLY');
  assert.equal(x.canExecuteLive,false);
});

test('live thesis evidence maps short thesis to down probability',()=>{
  const x=deriveBiggjThesisEvidence(
    reviewPosition({side:'SHORT'}),
    reviewIssuance({
      forecast:{horizons:[horizon('1h',60*60_000,{direction:'DOWN',up:.14,down:.74,flat:.12,expectedReturn:-.01})]}
    }),
    {at:2_100_000}
  );
  assert.equal(x.trusted,true);
  assert.equal(x.thesisHealth,.74);
  assert.equal(x.oppositeThesisStrength,.14);
});

test('future forecast can never influence an earlier position mark',()=>{
  const x=deriveBiggjThesisEvidence(
    reviewPosition(),
    reviewIssuance({generatedAt:3_000_000}),
    {at:2_900_000}
  );
  assert.equal(x.trusted,false);
  assert.equal(x.reason,'FUTURE_FORECAST_REJECTED');
  assert.equal(x.thesisHealth,null);
});

test('stale forecast is withheld instead of extending thesis',()=>{
  const x=deriveBiggjThesisEvidence(
    reviewPosition(),
    reviewIssuance({generatedAt:1_000_000}),
    {at:1_000_000+46*60_000}
  );
  assert.equal(x.trusted,false);
  assert.equal(x.reason,'FORECAST_STALE');
});

test('degraded forecast safety cannot become lifecycle thesis evidence',()=>{
  const x=deriveBiggjThesisEvidence(
    reviewPosition(),
    reviewIssuance({trace:{safety:{state:'DEGRADED'}}}),
    {at:2_100_000}
  );
  assert.equal(x.trusted,false);
  assert.equal(x.reason,'FORECAST_SAFETY_NOT_NORMAL');
});

test('un-calibrated or hidden horizon probabilities are withheld',()=>{
  const base=reviewIssuance();
  const h={...base.forecast.horizons[0],calibration:{status:'INSUFFICIENT'}};
  const uncalibrated=deriveBiggjThesisEvidence(
    reviewPosition(),
    {...base,forecast:{horizons:[h]}},
    {at:2_100_000}
  );
  assert.equal(uncalibrated.trusted,false);
  assert.equal(uncalibrated.reason,'HORIZON_NOT_CALIBRATED');

  const hidden=deriveBiggjThesisEvidence(
    reviewPosition(),
    {...base,probabilityDisplayAllowed:false},
    {at:2_100_000}
  );
  assert.equal(hidden.trusted,false);
  assert.equal(hidden.reason,'PROBABILITY_NOT_ADMITTED');
});


test('PRIMARY leverage baseline stays 1x even when research lab suggests more',()=>{
  const x=deriveBiggjPrimaryLeveragePolicy({suggestedLeverage:3});
  assert.equal(x.requestedLeverage,1);
  assert.equal(x.allowedLeverage,1);
  assert.equal(x.leveragePolicy,'PRIMARY_BASELINE_UNLEVERED');
  assert.equal(x.suggestedResearchLeverage,3);
  assert.equal(x.suggestionDisposition,'RESEARCH_ONLY');
  assert.equal(x.experimentOnly,true);
  assert.equal(x.execution,'SHADOW_ONLY');
  assert.equal(x.canExecuteLive,false);
});

test('1x leverage suggestion matches PRIMARY baseline without experiment flag',()=>{
  const x=deriveBiggjPrimaryLeveragePolicy({suggestedLeverage:1});
  assert.equal(x.allowedLeverage,1);
  assert.equal(x.suggestionDisposition,'BASELINE_MATCH');
  assert.equal(x.experimentOnly,false);
});
