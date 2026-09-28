import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildDerivedResearchIntelligenceFeatures,
  researchIntelligenceSnapshot,
  EXTERNAL_RESEARCH_FEATURE_EXPERIMENTS,
  DERIVED_INTELLIGENCE_RESEARCH_EXPERIMENTS
} from './research-intelligence-features.mjs';

function row(id,value,availableAt=1000){
  return {id,value,availableAt,source:'TEST'};
}

test('derives bounded leverage squeeze network options and macro intelligence',()=>{
  const features=buildDerivedResearchIntelligenceFeatures([
    row('research.derivatives.fundingRate',0.0001,100),
    row('research.derivatives.globalLongShortRatio',1.5,110),
    row('research.derivatives.takerBuySellRatio',1.2,120),
    row('research.derivatives.openInterestDelta5m',0.02,130),
    row('research.liquidation.imbalance5m',0.4,140),
    row('research.coinmetrics.activeAddressesChange1d',0.08,150),
    row('research.coinmetrics.mvrv',2,160),
    row('research.options.putCallOiRatio',1.4,170),
    row('research.options.putCallIvSkewPct',10,180),
    row('research.options.weightedIvPct',75,190),
    row('research.macro.us10yMinusFedFundsPct',-1,200)
  ]);
  const byId=Object.fromEntries(features.map(x=>[x.id,x]));
  assert.ok(byId['research.intelligence.leverageCrowding'].value>0);
  assert.ok(byId['research.intelligence.squeezeRisk'].value>=0&&byId['research.intelligence.squeezeRisk'].value<=1);
  assert.ok(byId['research.intelligence.squeezeDirection'].value<0);
  assert.ok(byId['research.intelligence.networkActivityImpulse'].value>0);
  assert.ok(byId['research.intelligence.valuationStretch'].value>0);
  assert.ok(byId['research.intelligence.optionsDownsidePressure'].value>0);
  assert.ok(byId['research.intelligence.macroCurveStress'].value>0);
  assert.ok(byId['research.intelligence.crossDomainStress'].value>=0&&byId['research.intelligence.crossDomainStress'].value<=1);
  assert.equal(byId['research.intelligence.macroCurveStress'].availableAt,200);
});

test('derivation fails sparse instead of inventing missing inputs',()=>{
  const features=buildDerivedResearchIntelligenceFeatures([
    row('research.derivatives.fundingRate',0.0001)
  ]);
  assert.equal(features.some(x=>x.id==='research.intelligence.leverageCrowding'),false);
  assert.equal(features.some(x=>x.id==='research.intelligence.squeezeRisk'),false);
});

test('research experiment catalog includes raw and derived candidates without production permission',()=>{
  assert.ok(EXTERNAL_RESEARCH_FEATURE_EXPERIMENTS.length>=8);
  assert.ok(DERIVED_INTELLIGENCE_RESEARCH_EXPERIMENTS.length>=9);
  const snapshot=researchIntelligenceSnapshot([
    row('research.coinmetrics.activeAddressesChange1d',0.05),
    row('research.coinmetrics.mvrv',1.5)
  ]);
  assert.equal(snapshot.researchOnly,true);
  assert.equal(snapshot.mayExecute,false);
  assert.equal(snapshot.productionMutationAllowed,false);
});
