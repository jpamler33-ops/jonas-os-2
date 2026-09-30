import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BIGGJ_TRADING_ACADEMY_VERSION,
  buildBiggjTradingAcademy,
  renderBiggjTradingAcademy,
  verifyBiggjTradingAcademy
} from './biggj-trading-academy.mjs';

function trade(i,{
  pnl=1,
  entryMode='STANDARD',
  policy=true,
  trusted=true,
  attribution=true,
  leverage=1,
  symbol=['BTCUSDT','ETHUSDT','SOLUSDT'][i%3],
  side=i%2?'LONG':'SHORT',
  horizonId=i%2?'1h':'3h',
  regime=['TREND_UP','RANGE','VOL_EXPANSION'][i%3],
  capture=.6,
  closeReason='TAKE_PROFIT'
}={}){
  return {
    positionId:'p'+i,
    symbol,side,horizonId,
    status:'CLOSED',
    entryMode,
    execution:'SHADOW_ONLY',
    canExecuteLive:false,
    closedAt:1_000_000+i*60_000,
    realizedNetPnlQuote:pnl,
    leverage,
    tradingPolicyVersion:policy?'BIGGJ_TRADING_POLICY_V1':'',
    forecastFingerprint:policy?'f'.repeat(64):'',
    issuanceId:policy?'iss_'+i:'',
    directionalProbability:.66,
    probabilityEdge:.14,
    setupScore:.76,
    lifecycleEvidence:trusted?{
      trusted:true,
      thesisHealth:.70,
      oppositeThesisStrength:.18
    }:null,
    tradeAttribution:attribution?{version:'TEST_ATTRIBUTION'}:null,
    captureEfficiency:capture,
    trainingMissionId:'tm_'+i,
    entryRegimeKey:regime,
    entryQualityScore:.72,
    entryLearningValue:.68,
    closeReason
  };
}

function ledger(rows=[]){
  return {positions:rows,execution:'SHADOW_ONLY',canExecuteLive:false};
}

const academy={
  activeStage:'CONSISTENCY',
  metrics:{maxDrawdownPct:.025}
};
const supervisor={risk:{multiplier:.85}};

test('new BIGGJ academy is process based and shadow-only',()=>{
  const x=buildBiggjTradingAcademy(ledger(),{academy,supervisor,asOf:2_000_000});
  assert.equal(x.version,BIGGJ_TRADING_ACADEMY_VERSION);
  assert.equal(x.sampleCount,0);
  assert.equal(x.execution,'SHADOW_ONLY');
  assert.equal(x.canExecute,false);
  assert.equal(x.canExecuteLive,false);
  assert.equal(x.changesPrimaryPolicy,false);
  assert.equal(verifyBiggjTradingAcademy(x).ok,true);
});

test('research lanes cannot farm academy XP or rank',()=>{
  const rows=Array.from({length:40},(_,i)=>trade(i,{entryMode:'CHALLENGER'}));
  const x=buildBiggjTradingAcademy(ledger(rows),{academy,supervisor});
  assert.equal(x.sampleCount,0);
  assert.equal(x.xp,0);
  assert.equal(x.rank.id,'INITIATE');
});

test('clean losing trade can earn stronger process debrief than untraceable win',()=>{
  const cleanLoss=buildBiggjTradingAcademy(
    ledger([trade(1,{pnl:-2,closeReason:'THESIS_COLLAPSE'})]),
    {academy,supervisor}
  );
  assert.equal(cleanLoss.debrief.outcome,'LOSS');
  assert.equal(cleanLoss.debrief.classification,'CLEAN_LOSS');
  assert.ok(cleanLoss.debrief.processScore>.70);

  const luckyWin=buildBiggjTradingAcademy(
    ledger([trade(2,{pnl:5,policy:false,trusted:false,attribution:false,leverage:2,capture:null})]),
    {academy,supervisor}
  );
  assert.equal(luckyWin.debrief.outcome,'WIN');
  assert.equal(luckyWin.debrief.classification,'LUCKY_WIN_PROCESS_DEBT');
  assert.ok(luckyWin.debrief.processScore<cleanLoss.debrief.processScore);
});

test('diverse policy-clean sample builds mastery without requiring profit',()=>{
  const rows=Array.from({length:60},(_,i)=>trade(i,{pnl:i%2?1:-1}));
  const x=buildBiggjTradingAcademy(ledger(rows),{academy,supervisor});
  assert.equal(x.sampleCount,60);
  assert.ok(x.mastery>.65);
  assert.ok(['TACTICIAN','OPERATOR','STRATEGIST','ARCHITECT'].includes(x.rank.id));
  const adaptation=x.skills.find(s=>s.id==='ADAPTATION');
  assert.ok(adaptation.score>.75);
});

test('boss progress is evidence/process driven and never a risk permission',()=>{
  const rows=Array.from({length:35},(_,i)=>trade(i,{pnl:i%3===0?-1:1}));
  const x=buildBiggjTradingAcademy(ledger(rows),{academy,supervisor});
  assert.ok(x.boss.progress>0);
  assert.match(x.boss.reward,/NEVER AUTO-RISK-UPGRADE/);
  assert.equal(x.changesPrimaryPolicy,false);
});

test('rendered academy exposes skill grid quest boss and debrief',()=>{
  const rows=Array.from({length:25},(_,i)=>trade(i,{pnl:i%4===0?-1:1}));
  const x=buildBiggjTradingAcademy(ledger(rows),{academy,supervisor});
  const text=renderBiggjTradingAcademy(x);
  assert.match(text,/BIGGJ TRADING ACADEMY/);
  assert.match(text,/SKILL GRID/);
  assert.match(text,/ACTIVE QUEST/);
  assert.match(text,/BOSS CHALLENGE/);
  assert.match(text,/LAST DEBRIEF/);
  assert.match(text,/SHADOW_ONLY/);
  assert.ok(text.length<=4096);
});


test('risk quest does not pass loss-streak control when recent sample is all losses',()=>{
  const rows=Array.from({length:20},(_,i)=>trade(i,{
    pnl:-1,
    policy:true,
    trusted:true,
    attribution:true,
    leverage:2,
    capture:.85
  }));
  const x=buildBiggjTradingAcademy(ledger(rows),{
    academy:{...academy,metrics:{maxDrawdownPct:.02}},
    supervisor:{risk:{multiplier:1}}
  });
  assert.equal(x.mission.skillId,'RISK');
  const streak=x.mission.checks.find(c=>c.label.includes('Verlustserie'));
  assert.ok(streak);
  assert.ok(streak.progress<1);
});
