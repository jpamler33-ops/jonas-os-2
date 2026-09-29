import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateShadowTrainingSupervisor,
  supervisedShadowBudget,
  verifyShadowTrainingSupervisor
} from './shadow-training-supervisor.mjs';
import { createEmptyShadowPortfolioLedger } from './shadow-portfolio-ledger.mjs';

function academy(stage='BOOTCAMP'){
  return {
    activeStage:stage,
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecuteLive:false
  };
}

function closed(i,{
  pnl=1,
  side=i%2?'LONG':'SHORT',
  symbol=i%3===0?'ETHUSDT':'BTCUSDT',
  horizonId=i%2?'15m':'1h',
  assetClass='CORE',
  closedAt=Date.UTC(2026,8,1)+i*3600_000
}={}){
  return {
    positionId:'p'+i,
    entryOrderId:'o'+i,
    symbol,side,
    entrySide:side==='LONG'?'BUY':'SELL',
    qtyBase:1,
    entryPrice:100,
    entryQuote:100,
    entryFeesQuote:0,
    openedAt:closedAt-20*60_000,
    plannedExitAt:closedAt,
    horizonMs:20*60_000,
    takeProfitPct:.01,
    stopLossPct:.006,
    horizonId,
    assetClass,
    strategyLane:symbol+':'+horizonId+':'+side,
    status:'CLOSED',
    closeReason:pnl>=0?'TAKE_PROFIT':'STOP_LOSS',
    lastMark:null,
    closedAt,
    exitPrice:100+pnl,
    exitQuote:100+pnl,
    exitFeesQuote:0,
    realizedGrossPnlQuote:pnl,
    realizedNetPnlQuote:pnl,
    realizedReturnPct:pnl/100,
    execution:'SHADOW_ONLY',
    canExecuteLive:false
  };
}

test('small sample creates sample-building mission and scales risk down',()=>{
  const l=createEmptyShadowPortfolioLedger({initialEquityQuote:10000});
  l.positions=Array.from({length:8},(_,i)=>closed(i,{pnl:i%4===0?-1:2}));
  const s=evaluateShadowTrainingSupervisor(l,academy(),{asOf:Date.UTC(2026,8,5)});
  assert.equal(s.mission.type,'SAMPLE_BUILDING');
  assert.equal(s.risk.multiplier,.5);
  assert.equal(s.risk.hold,false);
  assert.equal(verifyShadowTrainingSupervisor(s).ok,true);
});

test('weak rolling profit factor becomes edge recovery and reduces budget',()=>{
  const l=createEmptyShadowPortfolioLedger({initialEquityQuote:10000});
  l.positions=Array.from({length:40},(_,i)=>closed(i,{pnl:i%5===0?1:-2}));
  const s=evaluateShadowTrainingSupervisor(l,academy(),{asOf:Date.UTC(2026,8,10)});
  assert.equal(s.mission.type,'EDGE_RECOVERY');
  assert.ok(s.risk.multiplier<=.55);
  const b=supervisedShadowBudget(s,{academyNotionalQuote:100});
  assert.ok(b.notionalQuote<100);
  assert.equal(b.canExecuteLive,false);
});

test('severe rolling failure creates time-bounded training hold',()=>{
  const l=createEmptyShadowPortfolioLedger({initialEquityQuote:10000});
  const base=Date.UTC(2026,8,20,10);
  l.positions=Array.from({length:35},(_,i)=>closed(i,{pnl:i%10===0?1:-8,closedAt:base+i*60_000}));
  const last=base+34*60_000;
  const s=evaluateShadowTrainingSupervisor(l,academy(),{asOf:last+10*60_000});
  assert.equal(s.risk.hold,true);
  assert.ok(s.risk.holdUntil>last);
  const after=evaluateShadowTrainingSupervisor(l,academy(),{asOf:last+3*60*60_000});
  assert.equal(after.risk.hold,false);
});

test('one-sided sample produces side-balance mission without increasing risk',()=>{
  const l=createEmptyShadowPortfolioLedger({initialEquityQuote:10000});
  l.positions=Array.from({length:35},(_,i)=>closed(i,{pnl:i%4===0?-1:2,side:i<32?'LONG':'SHORT'}));
  const s=evaluateShadowTrainingSupervisor(l,academy(),{asOf:Date.UTC(2026,8,10)});
  assert.equal(s.mission.type,'SIDE_BALANCE');
  assert.ok(s.risk.multiplier<=1);
});

test('stress stage asks for meme discipline when other weaknesses are absent',()=>{
  const l=createEmptyShadowPortfolioLedger({initialEquityQuote:10000});
  l.positions=Array.from({length:60},(_,i)=>closed(i,{
    pnl:i%4===0?-1:2,
    side:i%2?'LONG':'SHORT',
    symbol:['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT'][i%4],
    horizonId:['15m','1h','4h'][i%3],
    assetClass:i<10?'MEME':'CORE'
  }));
  const s=evaluateShadowTrainingSupervisor(l,academy('STRESS_TEST'),{asOf:Date.UTC(2026,8,10)});
  assert.equal(s.mission.type,'MEME_DISCIPLINE');
  assert.equal(s.mission.current,10);
});


test('ABSTAIN probes do not alter training risk samples',()=>{
  const l=createEmptyShadowPortfolioLedger({initialEquityQuote:10000});
  l.positions=Array.from({length:30},(_,i)=>({
    ...closed(i,{pnl:-5}),
    entryMode:'ABSTAIN_PROBE',
    probeOnly:true
  }));
  const s=evaluateShadowTrainingSupervisor(l,academy(),{asOf:Date.UTC(2026,8,10)});
  assert.equal(s.samples.all,0);
  assert.equal(s.risk.hold,false);
  assert.equal(s.mission.type,'SAMPLE_BUILDING');
});
