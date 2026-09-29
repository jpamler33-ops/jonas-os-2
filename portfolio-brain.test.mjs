import test from 'node:test';
import assert from 'node:assert/strict';
import { buildShadowPortfolioBrain, verifyShadowPortfolioBrain } from './portfolio-brain.mjs';

function shadowOrder(symbol, amount, createdAt=900) {
  return {
    symbol,
    side:'BUY',
    notionalQuote:amount,
    fillQuote:amount,
    createdAt,
    status:'FILLED',
    execution:'SHADOW_ONLY',
    canExecuteLive:false
  };
}

test('portfolio risk summary remains shadow-only', () => {
  const result=buildShadowPortfolioBrain({
    asOf:1000,
    equityQuote:1000,
    orders:[shadowOrder('BTCUSDT',700),shadowOrder('ETHUSDT',200)]
  });
  assert.equal(result.portfolio.grossExposure,900);
  assert.ok(result.portfolio.symbolConcentration>0.7);
  assert.ok(result.reasons.includes('SYMBOL_CONCENTRATION_HIGH'));
  assert.equal(result.canExecute,false);
  assert.equal(result.restrictions.maySubmitOrders,false);
  assert.equal(verifyShadowPortfolioBrain(result).ok,true);
});

test('future and non-shadow records are ignored', () => {
  const future=shadowOrder('ETHUSDT',500,1100);
  const nonShadow={...shadowOrder('SOLUSDT',500),execution:'EXTERNAL',canExecuteLive:true};
  const result=buildShadowPortfolioBrain({
    asOf:1000,
    equityQuote:1000,
    orders:[shadowOrder('BTCUSDT',100),future,nonShadow]
  });
  assert.equal(result.portfolio.grossExposure,100);
  assert.equal(result.portfolio.positionCount,1);
});

test('correlated concentration is diagnostic only', () => {
  const result=buildShadowPortfolioBrain({
    asOf:1000,
    equityQuote:1000,
    orders:[shadowOrder('BTCUSDT',400),shadowOrder('ETHUSDT',400)],
    correlations:{BTCUSDT:{ETHUSDT:0.95}}
  });
  assert.ok(result.reasons.includes('CORRELATED_EXPOSURE_HIGH'));
  assert.equal(result.epistemic.allocation,'NO_AUTONOMOUS_ALLOCATION');
});

test('fingerprint detects changed evidence', () => {
  const result=buildShadowPortfolioBrain({asOf:1000,equityQuote:1000,orders:[shadowOrder('BTCUSDT',100)]});
  const changed=structuredClone(result);
  changed.portfolio.grossExposure=999;
  assert.equal(verifyShadowPortfolioBrain(changed).ok,false);
});
