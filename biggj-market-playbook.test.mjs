import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BIGGJ_TRADING_STYLES,
  buildBiggjPreTradeAnalysis,
  freezeBiggjTradeDecision,
  reverseEngineerBiggjTrade
} from './biggj-market-playbook.mjs';

function candles({start=100,blocks=16,step=1.2}={}){
  const out=[];
  const phase=[0,.7,1.5,.7,0];
  let t=1_000_000;
  for(let b=0;b<blocks;b++){
    for(let i=0;i<phase.length;i++){
      const c=start+b*step+phase[i];
      out.push({openTime:t,o:c-.1,h:c+.45,l:c-.45,c,v:100+i,closeTime:t+59_000,closed:true});
      t+=60_000;
    }
  }
  return out;
}
function forecast(){
  return {horizons:[
    {
      horizonId:'1h',horizonMs:60*60_000,gate:'PASS',direction:'UP',expectedReturn:.009,
      calibration:{status:'CALIBRATED'},
      probabilities:{up:.69,down:.16,flat:.15},
      display:{probabilityDisplayAllowed:true,probabilities:{up:.69,down:.16,flat:.15}}
    },
    {
      horizonId:'3h',horizonMs:3*60*60_000,gate:'PASS',direction:'UP',expectedReturn:.013,
      calibration:{status:'CALIBRATED'},
      probabilities:{up:.66,down:.17,flat:.17},
      display:{probabilityDisplayAllowed:true,probabilities:{up:.66,down:.17,flat:.17}}
    }
  ]};
}
function book(price=119){
  return {
    bids:[[price-.02,20],[price-.05,30],[price-.10,40]],
    asks:[[price+.02,20],[price+.05,30],[price+.10,40]],
    source:'TEST_BOOK',availableAt:9_000_000
  };
}

test('style catalog separates scalp intraday and swing time horizons',()=>{
  assert.deepEqual(Object.keys(BIGGJ_TRADING_STYLES),['SCALP','INTRADAY','SWING']);
  assert.ok(BIGGJ_TRADING_STYLES.SCALP.nominalHoldRangeMs[1]<BIGGJ_TRADING_STYLES.SWING.nominalHoldRangeMs[0]);
});

test('pre-trade analysis inspects multi-timeframe structure liquidity and execution before admitting a candidate',()=>{
  const cs=candles();
  const analysis=buildBiggjPreTradeAnalysis({
    symbol:'BTCUSDT',
    asOf:9_000_000,
    candlesByTf:{'1m':cs,'5m':cs,'15m':cs,'1h':cs,'4h':cs},
    orderBook:book(cs.at(-1).c),
    forecast:forecast(),
    dataTrustScore:.95,
    flowAlignment:.45,
    openInterestExpansion:.35
  });
  assert.equal(analysis.execution,'SHADOW_ONLY');
  assert.equal(analysis.canExecuteLive,false);
  assert.equal(analysis.side,'LONG');
  assert.ok(['CANDIDATE','ABSTAIN'].includes(analysis.decision));
  assert.ok(Array.isArray(analysis.liquidityMap.structuralLevels));
  assert.ok(Array.isArray(analysis.styleCandidates));
  if(analysis.decision==='CANDIDATE'){
    assert.ok(['SCALP','INTRADAY','SWING'].includes(analysis.selectedStyle));
    assert.notEqual(analysis.strategyFamily,'ABSTAIN');
    assert.ok(analysis.whyEnter.length>0);
  }
});

test('frozen decision preserves why entry was chosen and competing evidence',()=>{
  const cs=candles();
  const analysis=buildBiggjPreTradeAnalysis({
    symbol:'BTCUSDT',asOf:9_000_000,
    candlesByTf:{'1m':cs,'5m':cs,'15m':cs,'1h':cs,'4h':cs},
    orderBook:book(cs.at(-1).c),forecast:forecast(),dataTrustScore:.95,flowAlignment:.5
  });
  if(analysis.decision!=='CANDIDATE') return;
  const d=freezeBiggjTradeDecision(analysis,{
    invalidationPrice:analysis.currentPrice*.99,
    targetPrice:analysis.currentPrice*1.02,
    plannedRewardRisk:2,
    thesisHealth:.78,
    counterThesisStrength:.20
  });
  assert.equal(d.frozen,true);
  assert.equal(d.symbol,'BTCUSDT');
  assert.ok(d.whyEntered.length>0);
  assert.ok(Array.isArray(d.counterEvidenceAtEntry));
  assert.equal(d.canExecuteLive,false);
});

test('post-trade reverse engineering distinguishes direction error from exit inefficiency',()=>{
  const x=reverseEngineerBiggjTrade({
    positionId:'p_loss',symbol:'BTCUSDT',tradingStyle:'SCALP',strategyFamily:'BREAKOUT_RETEST',
    openedAt:1_000_000,closedAt:1_300_000,horizonMs:900_000,
    realizedMarginRoePct:-.01,realizedReturnPct:-.01,
    mfeMarginRoePct:0,maeMarginRoePct:-.012,captureEfficiency:null,exitRegretMarginRoePct:0
  },{decision:{whyEntered:['BREAKOUT'],counterEvidenceAtEntry:['HTF_MIXED']}});
  assert.equal(x.likelyError,'ENTRY_THESIS_OR_DIRECTION_WRONG');
  assert.ok(x.whatWasWrong.includes('DIRECTIONAL_OUTCOME_NON_POSITIVE'));
  assert.equal(x.lessons.doNotClaimCausality,true);
  assert.equal(x.canExecuteLive,false);
});
