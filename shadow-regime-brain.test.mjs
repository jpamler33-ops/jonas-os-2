import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveShadowRegimeFingerprint, buildRegimeStrategyMatrix,
  regimeDecisionForStrategy
} from './shadow-regime-brain.mjs';

function closed(i,{regime='CORE|TREND_UP|UP|HIGH|DEEP|BUY_HEAVY',strategy='lc_a',pnl=2}={}){
  return {
    positionId:'p'+i,status:'CLOSED',execution:'SHADOW_ONLY',canExecuteLive:false,
    entryMode:'CHALLENGER',challengerRuleId:strategy,strategyLane:'x',
    entryRegimeKey:regime,realizedNetPnlQuote:pnl,realizedReturnPct:pnl/500
  };
}
test('fingerprint is deterministic and research-only',()=>{
  const a=deriveShadowRegimeFingerprint({
    regimeId:'trend up',regimeConfidence:.8,mtfBias:'BULLISH',
    pressureScore:80,volatilityState:'HIGH',liquidityState:'DEEP',assetClass:'CORE'
  });
  const b=deriveShadowRegimeFingerprint({
    regimeId:'trend up',regimeConfidence:.8,mtfBias:'BULLISH',
    pressureScore:80,volatilityState:'HIGH',liquidityState:'DEEP',assetClass:'CORE'
  });
  assert.equal(a.fingerprint,b.fingerprint);
  assert.equal(a.components.trend,'UP');
  assert.equal(a.canExecuteLive,false);
  assert.equal(a.action,'ABSTAIN');
});
test('same strategy can be favored in one regime and avoided in another',()=>{
  const good='CORE|TREND_UP|UP|HIGH|DEEP|BUY_HEAVY';
  const bad='CORE|CHOP|CHOP|LOW|THIN|BALANCED';
  const rows=[
    ...Array.from({length:12},(_,i)=>closed(i,{regime:good,pnl:i%5===0?-1:3})),
    ...Array.from({length:12},(_,i)=>closed(100+i,{regime:bad,pnl:i%5===0?1:-3}))
  ];
  const m=buildRegimeStrategyMatrix({positions:rows},{minSamples:6});
  const goodReg={regimeKey:good},badReg={regimeKey:bad};
  assert.equal(regimeDecisionForStrategy(m,goodReg,'lc_a').status,'FAVORED');
  assert.equal(regimeDecisionForStrategy(m,badReg,'lc_a').status,'AVOID');
  assert.ok(regimeDecisionForStrategy(m,goodReg,'lc_a').multiplier>1);
  assert.equal(regimeDecisionForStrategy(m,badReg,'lc_a').multiplier,0);
});
test('unknown regime/strategy is downweighted rather than promoted',()=>{
  const m=buildRegimeStrategyMatrix({positions:[]});
  const d=regimeDecisionForStrategy(m,{regimeKey:'UNKNOWN'},'lc_x');
  assert.equal(d.status,'UNKNOWN');
  assert.equal(d.multiplier,.65);
});
