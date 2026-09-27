import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateShadowCapitalAcademy,
  academyTradeBudget,
  verifyShadowCapitalAcademy
} from './shadow-capital-academy.mjs';
import { createEmptyShadowPortfolioLedger } from './shadow-portfolio-ledger.mjs';

function pos(i,{
  pnl=1,
  symbol='BTCUSDT',
  side=i%2?'LONG':'SHORT',
  assetClass='CORE',
  closedAt=Date.UTC(2026,8,1)+i*3600_000
}={}){
  const entryQuote=100;
  return {
    positionId:'p'+i,
    entryOrderId:'o'+i,
    symbol,side,
    entrySide:side==='LONG'?'BUY':'SELL',
    qtyBase:1,
    entryPrice:100,
    entryQuote,
    entryFeesQuote:0,
    openedAt:closedAt-30*60_000,
    plannedExitAt:closedAt,
    takeProfitPct:.01,
    stopLossPct:.006,
    assetClass,
    strategyLane:symbol+':15m:'+side,
    status:'CLOSED',
    closeReason:pnl>=0?'TAKE_PROFIT':'STOP_LOSS',
    closedAt,
    exitPrice:100+pnl,
    exitQuote:100+pnl,
    exitFeesQuote:0,
    realizedGrossPnlQuote:pnl,
    realizedNetPnlQuote:pnl,
    realizedReturnPct:pnl/entryQuote,
    lastMark:null,
    execution:'SHADOW_ONLY',
    canExecuteLive:false
  };
}

test('new academy starts unranked with bootcamp risk limits',()=>{
  const l=createEmptyShadowPortfolioLedger({initialEquityQuote:10000});
  const a=evaluateShadowCapitalAcademy(l,{asOf:Date.UTC(2026,8,27,12),timeZone:'Europe/Berlin'});
  assert.equal(a.achievedLevel,-1);
  assert.equal(a.activeStage,'BOOTCAMP');
  assert.equal(a.riskPolicy.maxOpenTotal,4);
  assert.equal(a.guard.coreAllowed,true);
  assert.equal(verifyShadowCapitalAcademy(a).ok,true);
});

test('academy promotes after bootcamp criteria are satisfied',()=>{
  const l=createEmptyShadowPortfolioLedger({initialEquityQuote:10000});
  l.positions=Array.from({length:20},(_,i)=>pos(i,{pnl:i%5===0?-1:2}));
  const a=evaluateShadowCapitalAcademy(l,{asOf:Date.UTC(2026,8,5,12),timeZone:'Europe/Berlin'});
  assert.equal(a.stages[0].passed,true);
  assert.equal(a.achievedStage,'BOOTCAMP');
  assert.equal(a.activeStage,'DISCIPLINE');
  assert.equal(a.riskPolicy.maxOpenTotal,4);
});

test('daily loss challenge pauses new entries',()=>{
  const l=createEmptyShadowPortfolioLedger({initialEquityQuote:10000});
  const t=Date.UTC(2026,8,27,10);
  l.positions=[pos(1,{pnl:-60,closedAt:t}),pos(2,{pnl:-50,closedAt:t+3600_000})];
  const a=evaluateShadowCapitalAcademy(l,{asOf:t+2*3600_000,timeZone:'Europe/Berlin'});
  assert.equal(a.guard.coreAllowed,false);
  assert.ok(a.guard.blockers.includes('DAILY_LOSS_LIMIT'));
});

test('memecoin sizing is smaller than core sizing',()=>{
  const l=createEmptyShadowPortfolioLedger({initialEquityQuote:10000});
  const a=evaluateShadowCapitalAcademy(l,{asOf:Date.UTC(2026,8,27,12),timeZone:'Europe/Berlin'});
  const core=academyTradeBudget(a,{assetClass:'CORE',baseNotionalQuote:100,equityQuote:10000});
  const meme=academyTradeBudget(a,{assetClass:'MEME',baseNotionalQuote:100,equityQuote:10000});
  assert.ok(core.notionalQuote>meme.notionalQuote);
  assert.equal(core.canExecuteLive,false);
  assert.equal(meme.canExecuteLive,false);
});

test('loss streak triggers one hour cooldown',()=>{
  const l=createEmptyShadowPortfolioLedger({initialEquityQuote:10000});
  const base=Date.UTC(2026,8,27,8);
  l.positions=Array.from({length:4},(_,i)=>pos(i,{pnl:-1,closedAt:base+i*5*60_000}));
  const last=base+3*5*60_000;
  const a=evaluateShadowCapitalAcademy(l,{asOf:last+10*60_000,timeZone:'Europe/Berlin'});
  assert.equal(a.guard.coreAllowed,false);
  assert.ok(a.guard.blockers.includes('LOSS_STREAK_COOLDOWN'));
  assert.equal(a.guard.lossPauseUntil,last+60*60_000);
});
