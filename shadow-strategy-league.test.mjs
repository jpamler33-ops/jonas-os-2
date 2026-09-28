import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import {
  SHADOW_STRATEGIES,
  createEmptyStrategyLeagueLedger,
  strategyLeagueSummary,
  deriveStrategyLeagueCandidates,
  leaguePositionFromEntryOrder,
  reconcileStrategyLeagueEntries,
  replaceStrategyLeaguePosition,
  markStrategyLeaguePosition,
  closeStrategyLeaguePosition,
  loadStrategyLeagueLedger,
  saveStrategyLeagueLedger
} from './shadow-strategy-league.mjs';

function issuance(){
  return {
    issuanceId:'iss-1',
    symbol:'BTCUSDT',
    generatedAt:1_000_000,
    forecastFingerprint:'f'.repeat(64),
    executionMode:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecute:false,
    probabilityDisplayAllowed:true,
    admission:{gate:'PASS'},
    trace:{safety:{state:'NORMAL'}},
    forecast:{horizons:[
      {
        horizonId:'15m',horizonMs:900_000,gate:'PASS',direction:'UP',expectedReturn:.006,
        calibration:{status:'CALIBRATED'},
        probabilities:{up:.67,down:.20,flat:.13},
        display:{probabilityDisplayAllowed:true,probabilities:{up:.67,down:.20,flat:.13}}
      },
      {
        horizonId:'1h',horizonMs:3_600_000,gate:'PASS',direction:'UP',expectedReturn:.010,
        calibration:{status:'CALIBRATED'},
        probabilities:{up:.76,down:.13,flat:.11},
        display:{probabilityDisplayAllowed:true,probabilities:{up:.76,down:.13,flat:.11}}
      }
    ]}
  };
}

function leagueOrder({
  id='o1',strategyId='EDGE_HUNTER',role='LEAGUE_ENTRY',price=100,qty=1,pnlMeta={}
}={}){
  return {
    id,symbol:'BTCUSDT',side:'BUY',status:'FILLED',
    fillBase:qty,fillQuote:price*qty,avgFillPrice:price,feesQuote:.1,
    createdAt:1000,updatedAt:1000,
    execution:'SHADOW_ONLY',canExecuteLive:false,
    strategyMeta:{
      strategy:'TCX_AUTONOMOUS_SHADOW_TRADER_V1',
      role,
      leagueStrategyId:strategyId,
      leagueDecisionKey:'ld_'+id,
      leagueAllocationWeight:.2,
      leagueNotionalMultiplier:.8,
      horizonMs:900_000,horizonId:'15m',
      expectedReturn:.01,directionalProbability:.7,probabilityEdge:.4,
      admissionGate:'PASS',issuanceId:'iss-'+id,forecastFingerprint:(id.padEnd(64,'a')).slice(0,64),
      assetClass:'CORE',
      ...pnlMeta
    }
  };
}

function closedPosition(i,strategyId,{
  pnl=1,
  symbol=['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT'][i%4],
  closedAt=Date.UTC(2026,8,1)+(i%10)*86_400_000+i*60_000
}={}){
  const p=leaguePositionFromEntryOrder(leagueOrder({id:strategyId+'-'+i,strategyId}),{openedAt:closedAt-900_000});
  return {
    ...p,
    symbol,
    status:'CLOSED',
    closedAt,
    closeReason:pnl>=0?'TAKE_PROFIT':'STOP_LOSS',
    exitPrice:100+pnl,
    exitQuote:100+pnl,
    exitFeesQuote:0,
    realizedGrossPnlQuote:pnl,
    realizedNetPnlQuote:pnl,
    realizedReturnPct:pnl/100,
    leagueSampleKey:'sample-'+strategyId+'-'+i
  };
}

test('league starts with equal exploration allocation',()=>{
  const l=createEmptyStrategyLeagueLedger({initialEquityPerStrategy:5000});
  const s=strategyLeagueSummary(l,{asOf:2_000_000});
  assert.equal(s.allocationMode,'EQUAL_EXPLORATION');
  assert.equal(s.strategies.length,SHADOW_STRATEGIES.length);
  for(const x of s.strategies) assert.ok(Math.abs(x.allocationWeight-.2)<1e-12);
  assert.equal(s.canExecuteLive,false);
});

test('strategy candidates use different horizon selection without lowering safety boundary',()=>{
  const l=createEmptyStrategyLeagueLedger();
  const out=deriveStrategyLeagueCandidates(issuance(),l,{now:1_030_000,assetClass:'CORE',baseNotionalQuote:50});
  assert.ok(out.candidates.length>=3);
  const edge=out.candidates.find(x=>x.leagueStrategyId==='EDGE_HUNTER');
  const defensive=out.candidates.find(x=>x.leagueStrategyId==='DEFENSIVE');
  assert.equal(edge.horizonId,'1h');
  assert.equal(defensive.horizonId,'15m');
  assert.equal(edge.execution,'SHADOW_ONLY');
  assert.equal(edge.canExecuteLive,false);
});

test('meme specialist only appears for meme asset class',()=>{
  const l=createEmptyStrategyLeagueLedger();
  const core=deriveStrategyLeagueCandidates(issuance(),l,{now:1_030_000,assetClass:'CORE'});
  const meme=deriveStrategyLeagueCandidates(issuance(),l,{now:1_030_000,assetClass:'MEME'});
  assert.equal(core.candidates.some(x=>x.leagueStrategyId==='MEME_SPECIALIST'),false);
  assert.equal(meme.candidates.some(x=>x.leagueStrategyId==='MEME_SPECIALIST'),true);
});

test('main ENTRY is excluded from league reconciliation',()=>{
  const l=createEmptyStrategyLeagueLedger();
  const main=leagueOrder({role:'ENTRY'});
  const league=leagueOrder({id:'league'});
  const r=reconcileStrategyLeagueEntries(l,[main,league],{now:2000});
  assert.equal(r.added,1);
  assert.equal(r.ledger.positions[0].entryOrderId,'league');
});

test('league position can be marked and closed with public book simulation',()=>{
  let p=leaguePositionFromEntryOrder(leagueOrder());
  const marked=markStrategyLeaguePosition(p,{bids:[[102,10]],asks:[[102.1,10]],source:'TEST',availableAt:2000},{at:2000,feeBps:0});
  assert.equal(marked.trigger,'TAKE_PROFIT');
  p=closeStrategyLeaguePosition(marked.position,{reason:marked.trigger,at:2000});
  assert.equal(p.status,'CLOSED');
  assert.ok(p.realizedNetPnlQuote>0);
});

test('proven strategies receive evidence-weighted allocation only after independent sample threshold',()=>{
  const l=createEmptyStrategyLeagueLedger({initialEquityPerStrategy:5000});
  l.positions=[
    ...Array.from({length:60},(_,i)=>closedPosition(i,'EDGE_HUNTER',{pnl:i%5===0?-1:2})),
    ...Array.from({length:60},(_,i)=>closedPosition(i,'RETURN_HUNTER',{pnl:i%4===0?-1:2})),
    ...Array.from({length:10},(_,i)=>closedPosition(i,'DEFENSIVE',{pnl:1}))
  ];
  const s=strategyLeagueSummary(l,{asOf:Date.UTC(2026,8,20)});
  assert.equal(s.allocationMode,'EVIDENCE_WEIGHTED_V2');
  const edge=s.strategies.find(x=>x.strategyId==='EDGE_HUNTER');
  const ret=s.strategies.find(x=>x.strategyId==='RETURN_HUNTER');
  const defensive=s.strategies.find(x=>x.strategyId==='DEFENSIVE');
  assert.equal(edge.eligibleForAllocation,true);
  assert.equal(ret.eligibleForAllocation,true);
  assert.equal(defensive.eligibleForAllocation,false);
  assert.ok(edge.allocationWeight>defensive.allocationWeight);
});

test('league ledger persists and restores',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'tcx-league-'));
  const file=path.join(dir,'league.json');
  const l=createEmptyStrategyLeagueLedger();
  const r=reconcileStrategyLeagueEntries(l,[leagueOrder()],{now:2000});
  await saveStrategyLeagueLedger(file,r.ledger);
  const loaded=await loadStrategyLeagueLedger(file);
  assert.equal(loaded.healthy,true);
  assert.equal(loaded.ledger.positions.length,1);
  assert.equal(loaded.ledger.positions[0].leagueStrategyId,'EDGE_HUNTER');
});


test('temporal evidence blocks a strategy whose recent performance collapses',()=>{
  const l=createEmptyStrategyLeagueLedger({initialEquityPerStrategy:5000});
  l.positions=[
    ...Array.from({length:60},(_,i)=>closedPosition(i,'EDGE_HUNTER',{pnl:i<36?(i%6===0?-1:2):-2})),
    ...Array.from({length:60},(_,i)=>closedPosition(i,'RETURN_HUNTER',{pnl:i%5===0?-1:2}))
  ];
  const s=strategyLeagueSummary(l,{asOf:Date.UTC(2026,8,20)});
  const edge=s.strategies.find(x=>x.strategyId==='EDGE_HUNTER');
  assert.equal(edge.evidence.degradationWatch,true);
  assert.equal(edge.eligibleForAllocation,false);
  assert.equal(edge.status,'DRIFT_WATCH');
  assert.equal(edge.evidence.meaning,'CHRONOLOGICAL_STABILITY_PROXY_NOT_TRUE_OUT_OF_SAMPLE');
});
