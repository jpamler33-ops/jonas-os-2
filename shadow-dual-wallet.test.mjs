import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveUnconstrainedLabWalletCandidate,
  buildLabWalletLearningModel,
  shadowDualWalletSummary,
  shadowWalletIdForPosition,
  LAB_WALLET_ID,
  NORMAL_WALLET_ID,
  LAB_UNCONSTRAINED_ENTRY_MODE,
  SHADOW_DUAL_WALLET_VERSION
} from './shadow-dual-wallet.mjs';

function issuance(overrides={}){
  return {
    issuanceId:'iss-lab-1',
    symbol:'BTCUSDT',
    generatedAt:1_000_000,
    executionMode:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecute:false,
    gate:'ABSTAIN',
    admission:{gate:'ABSTAIN',reasons:['INSUFFICIENT_EVIDENCE']},
    trace:{safety:{state:'NORMAL'}},
    forecastFingerprint:'f'.repeat(64),
    forecast:{horizons:[
      {horizonId:'5m',horizonMs:300_000,gate:'ABSTAIN',direction:'UP',expectedReturn:.001,calibration:{status:'UNCALIBRATED'}},
      {horizonId:'1h',horizonMs:3_600_000,gate:'ABSTAIN',direction:'DOWN',expectedReturn:-.006,calibration:{status:'WATCH'}}
    ]},
    ...overrides
  };
}

function position(id,{mode='STANDARD',status='CLOSED',pnl=1,entryQuote=100,lastPnl=0}={}){
  return {
    positionId:id,
    entryOrderId:'o-'+id,
    symbol:'BTCUSDT',
    side:'LONG',
    entryMode:mode,
    entryQuote,
    entryPrice:100,
    qtyBase:1,
    status,
    realizedNetPnlQuote:status==='CLOSED'?pnl:null,
    realizedReturnPct:status==='CLOSED'?pnl/entryQuote:null,
    lastMark:status==='OPEN'?{unrealizedNetPnlQuote:lastPnl,unrealizedReturnPct:lastPnl/entryQuote}:null,
    openedAt:1,
    closedAt:status==='CLOSED'?2:null,
    plannedExitAt:3,
    execution:'SHADOW_ONLY',
    canExecuteLive:false
  };
}

test('ABSTAIN issuance can become LAB-only counterfactual without changing execution authority',()=>{
  const d=deriveUnconstrainedLabWalletCandidate(issuance(),{now:1_010_000,notionalQuote:500});
  assert.equal(d.version,SHADOW_DUAL_WALLET_VERSION);
  assert.equal(d.eligible,true);
  assert.equal(d.walletId,LAB_WALLET_ID);
  assert.equal(d.entryMode,LAB_UNCONSTRAINED_ENTRY_MODE);
  assert.equal(d.side,'SELL');
  assert.equal(d.horizonId,'1h');
  assert.equal(d.notionalQuote,500);
  assert.equal(d.admissionGate,'ABSTAIN');
  assert.equal(d.counterfactualOnly,true);
  assert.equal(d.horizonOnlyExit,true);
  assert.equal(d.action,'ABSTAIN');
  assert.equal(d.canExecute,false);
  assert.equal(d.canExecuteLive,false);
});

test('LAB refuses degraded data instead of using unlimited capital to bypass data integrity',()=>{
  const d=deriveUnconstrainedLabWalletCandidate(issuance({trace:{safety:{state:'DEGRADED'}}}),{now:1_010_000});
  assert.equal(d.eligible,false);
  assert.equal(d.reason,'DATA_SAFETY_NOT_NORMAL');
  assert.equal(d.canExecuteLive,false);
});

test('LAB decision key prevents duplicate use of the same frozen hypothesis',()=>{
  const a=deriveUnconstrainedLabWalletCandidate(issuance(),{now:1_010_000});
  const b=deriveUnconstrainedLabWalletCandidate(issuance(),{now:1_010_000,existingDecisionKeys:[a.labDecisionKey]});
  assert.equal(b.eligible,true);
  assert.notEqual(b.labDecisionKey,a.labDecisionKey);
  assert.equal(b.horizonId,'5m');
});

test('dual wallet summary isolates normal performance from lab research',()=>{
  const ledger={
    initialEquityQuote:10_000,
    positions:[
      position('n1',{mode:'STANDARD',pnl:20,entryQuote:200}),
      position('l1',{mode:'LAB_UNCONSTRAINED',pnl:-30,entryQuote:500}),
      position('l2',{mode:'COVERAGE_PROBE',pnl:10,entryQuote:5}),
      position('l3',{mode:'EXPLORATION',status:'OPEN',entryQuote:25,lastPnl:2})
    ]
  };
  const s=shadowDualWalletSummary(ledger,{asOf:10,minimumProofTrades:30});
  assert.equal(s.normal.closedTrades,1);
  assert.equal(s.normal.realizedPnlQuote,20);
  assert.equal(s.lab.closedTrades,2);
  assert.equal(s.lab.openPositions,1);
  assert.equal(s.lab.realizedPnlQuote,-20);
  assert.equal(s.lab.currentRecoveryDebtQuote,20);
  assert.equal(s.lab.currentCapitalAtRiskQuote,25);
  assert.equal(s.lab.capitalLimitQuote,null);
  assert.equal(s.lab.objectiveStatus,'BUILDING_SAMPLE');
  assert.equal(s.canExecuteLive,false);
});

test('LAB recovery debt disappears only after realized cumulative PnL recovers',()=>{
  const negative=shadowDualWalletSummary({positions:[
    position('l1',{mode:'LAB_UNCONSTRAINED',pnl:-40,entryQuote:500}),
    position('l2',{mode:'LAB_UNCONSTRAINED',pnl:10,entryQuote:500})
  ]});
  assert.equal(negative.lab.currentRecoveryDebtQuote,30);
  const recovered=shadowDualWalletSummary({positions:[
    position('l1',{mode:'LAB_UNCONSTRAINED',pnl:-40,entryQuote:500}),
    position('l2',{mode:'LAB_UNCONSTRAINED',pnl:60,entryQuote:500})
  ]});
  assert.equal(recovered.lab.currentRecoveryDebtQuote,0);
  assert.equal(recovered.lab.retainedSurplusQuote,20);
});

test('legacy research lanes map to LAB while STANDARD remains NORMAL',()=>{
  assert.equal(shadowWalletIdForPosition({entryMode:'STANDARD'}),NORMAL_WALLET_ID);
  assert.equal(shadowWalletIdForPosition({entryMode:'COVERAGE_PROBE'}),LAB_WALLET_ID);
  assert.equal(shadowWalletIdForPosition({entryMode:'EXPLORATION'}),LAB_WALLET_ID);
  assert.equal(shadowWalletIdForPosition({entryMode:'LAB_UNCONSTRAINED'}),LAB_WALLET_ID);
});

test('LAB learning memory uses only prior LAB outcomes and remains shadow-only',()=>{
  const labRows=[
    ...Array.from({length:12},(_,i)=>({...position('lab-up-'+i,{mode:'LAB_UNCONSTRAINED',pnl:i%4===0?-2:4,entryQuote:500}),horizonId:'5m',side:'LONG'})),
    ...Array.from({length:12},(_,i)=>({...position('lab-down-'+i,{mode:'LAB_UNCONSTRAINED',pnl:i%4===0?2:-5,entryQuote:500}),horizonId:'1h',side:'SHORT'})),
    ...Array.from({length:20},(_,i)=>({...position('normal-'+i,{mode:'STANDARD',pnl:100,entryQuote:200}),horizonId:'1h',side:'SHORT'}))
  ];
  const model=buildLabWalletLearningModel({positions:labRows},{asOf:100});
  assert.equal(model.samples,24);
  assert.equal(model.lanes,2);
  assert.equal(model.primaryMutationAllowed,false);
  assert.equal(model.canExecuteLive,false);
  assert.equal(model.byLane['BTCUSDT|5M|UP'].state,'PROMISING');
  assert.equal(model.byLane['BTCUSDT|1H|DOWN'].state,'WEAK');
});

test('LAB candidate selection adapts to LAB-only history without changing forecast gates',()=>{
  const rows=[
    ...Array.from({length:20},(_,i)=>({...position('up-'+i,{mode:'LAB_UNCONSTRAINED',pnl:i%5===0?-1:4,entryQuote:500}),horizonId:'5m',side:'LONG'})),
    ...Array.from({length:20},(_,i)=>({...position('down-'+i,{mode:'LAB_UNCONSTRAINED',pnl:i%5===0?1:-6,entryQuote:500}),horizonId:'1h',side:'SHORT'}))
  ];
  const model=buildLabWalletLearningModel({positions:rows},{asOf:100});
  const d=deriveUnconstrainedLabWalletCandidate(issuance(),{now:1_010_000,learningModel:model});
  assert.equal(d.eligible,true);
  assert.equal(d.horizonId,'5m');
  assert.equal(d.side,'BUY');
  assert.equal(d.labLearningState,'PROMISING');
  assert.ok(d.labLearningSamples>=20);
  assert.equal(d.admissionGate,'ABSTAIN');
  assert.equal(d.action,'ABSTAIN');
  assert.equal(d.canExecuteLive,false);
});
