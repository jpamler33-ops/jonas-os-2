import test from 'node:test';
import assert from 'node:assert/strict';
import { buildShadowTradeQualityModel } from './shadow-trade-quality-learner.mjs';
import {
  buildLearnedChallengerLab, deriveLearnedChallengerTrades
} from './learned-challenger-engine.mjs';

function pos(i,{good=true,challengerRuleId='',closedAt=null}={}){
  return {
    positionId:'p'+i,status:'CLOSED',closedAt:closedAt??1000+i,
    execution:'SHADOW_ONLY',canExecuteLive:false,
    entryMode:challengerRuleId?'CHALLENGER':'STANDARD',
    challengerRuleId,
    assetClass:'CORE',
    side:good?'LONG':'SHORT',
    horizonMs:good?300000:3600000,
    directionalProbability:good?.64:.53,
    probabilityEdge:good?.20:.06,
    expectedReturn:good?.004:.0016,
    realizedNetPnlQuote:good?2:-2,
    realizedReturnPct:good?.004:-.004
  };
}
function baseLedger(){
  return {
    positions:[
      ...Array.from({length:16},(_,i)=>pos(i,{good:true})),
      ...Array.from({length:16},(_,i)=>pos(100+i,{good:false}))
    ]
  };
}
function issuance(){
  return {
    issuanceId:'iss-v2',symbol:'BTCUSDT',generatedAt:1000,
    executionMode:'SHADOW_ONLY',action:'ABSTAIN',canExecute:false,
    admission:{gate:'PASS'},probabilityDisplayAllowed:true,
    trace:{safety:{state:'NORMAL'}},
    forecastFingerprint:'a'.repeat(64),
    forecast:{horizons:[{
      horizonId:'5m',horizonMs:300000,gate:'PASS',direction:'UP',expectedReturn:.004,
      calibration:{status:'CALIBRATED'},
      display:{probabilityDisplayAllowed:true,probabilities:{up:.64,down:.44,flat:0}}
    }]}
  };
}

test('factory derives a challenger from a learned-good exact pattern',()=>{
  const ledger=baseLedger();
  const model=buildShadowTradeQualityModel(ledger,{asOf:2000});
  const lab=buildLearnedChallengerLab(model,ledger,{asOf:2000});
  assert.ok(lab.candidateRules.length>=1);
  assert.equal(lab.candidateRules[0].status,'DISCOVERED');
  assert.equal(lab.candidateRules[0].shape.side,'LONG');
  assert.ok(lab.featureAttribution.length>0);
  assert.equal(lab.canExecuteLive,false);
});

test('matching issuance creates a forward-only shadow challenger decision',()=>{
  const ledger=baseLedger();
  const model=buildShadowTradeQualityModel(ledger,{asOf:2000});
  const lab=buildLearnedChallengerLab(model,ledger,{asOf:2000});
  const x=deriveLearnedChallengerTrades(issuance(),lab,{
    now:2000,assetClass:'CORE',baseNotionalQuote:10,maxCandidates:2
  });
  assert.equal(x.reason,'CHALLENGERS_MATCHED');
  assert.equal(x.candidates.length,1);
  assert.equal(x.candidates[0].execution,'SHADOW_ONLY');
  assert.equal(x.candidates[0].action,'ABSTAIN');
  assert.equal(x.candidates[0].canExecuteLive,false);
  assert.equal(x.candidates[0].notionalQuote,5);
});

test('forward challenger outcomes qualify a rule without contaminating discovery samples',()=>{
  const ledger=baseLedger();
  const model1=buildShadowTradeQualityModel(ledger,{asOf:2000});
  const lab1=buildLearnedChallengerLab(model1,ledger,{asOf:2000});
  const ruleId=lab1.candidateRules[0].ruleId;
  const forward=Array.from({length:12},(_,i)=>({
    ...pos(200+i,{good:true,challengerRuleId:ruleId,closedAt:3000+i}),
    entryMode:'CHALLENGER'
  }));
  const ledger2={positions:[...ledger.positions,...forward]};
  const model2=buildShadowTradeQualityModel(ledger2,{asOf:2000});
  assert.equal(model2.samples,model1.samples);
  const lab2=buildLearnedChallengerLab(model2,ledger2,{asOf:2000});
  const rule=lab2.candidateRules.find(x=>x.ruleId===ruleId);
  assert.equal(rule.status,'QUALIFIED');
  assert.equal(rule.forward.n,12);
});

test('recent challenger collapse triggers drift watch',()=>{
  const ledger=baseLedger();
  const model=buildShadowTradeQualityModel(ledger,{asOf:2000});
  const lab=buildLearnedChallengerLab(model,ledger,{asOf:2000});
  const ruleId=lab.candidateRules[0].ruleId;
  const forward=[
    ...Array.from({length:8},(_,i)=>({...pos(300+i,{good:true,challengerRuleId:ruleId,closedAt:3000+i}),entryMode:'CHALLENGER'})),
    ...Array.from({length:8},(_,i)=>({
      ...pos(400+i,{good:true,challengerRuleId:ruleId,closedAt:4000+i}),
      entryMode:'CHALLENGER',realizedNetPnlQuote:-3,realizedReturnPct:-.006
    }))
  ];
  const lab2=buildLearnedChallengerLab(model,{positions:[...ledger.positions,...forward]},{asOf:2000});
  const rule=lab2.candidateRules.find(x=>x.ruleId===ruleId);
  assert.equal(rule.status,'DRIFT_WATCH');
  assert.equal(rule.eligible,false);
});

test('unsafe issuance cannot create challenger trades',()=>{
  const ledger=baseLedger();
  const model=buildShadowTradeQualityModel(ledger,{asOf:2000});
  const lab=buildLearnedChallengerLab(model,ledger,{asOf:2000});
  const x=issuance(); x.trace={safety:{state:'DEGRADED'}};
  const out=deriveLearnedChallengerTrades(x,lab,{now:2000,assetClass:'CORE'});
  assert.equal(out.candidates.length,0);
  assert.equal(out.reason,'DATA_SAFETY_NOT_NORMAL');
});


test('stress gate can block a fragile challenger',()=>{
  const ledger=baseLedger();
  const model=buildShadowTradeQualityModel(ledger,{asOf:2000});
  const lab=buildLearnedChallengerLab(model,ledger,{asOf:2000});
  const out=deriveLearnedChallengerTrades(issuance(),lab,{
    now:2000,
    assetClass:'CORE',
    baseNotionalQuote:10,
    stressLab:{
      decisionForRule:()=>({
        status:'FRAGILE',
        multiplier:0,
        samples:20,
        robustnessScore:.2,
        reason:'ADVERSARIAL_STRESS_RESULT'
      })
    }
  });
  assert.equal(out.candidates.length,0);
});

test('stress gate can only reduce challenger notional',()=>{
  const ledger=baseLedger();
  const model=buildShadowTradeQualityModel(ledger,{asOf:2000});
  const lab=buildLearnedChallengerLab(model,ledger,{asOf:2000});
  const out=deriveLearnedChallengerTrades(issuance(),lab,{
    now:2000,
    assetClass:'CORE',
    baseNotionalQuote:10,
    stressLab:{
      decisionForRule:()=>({
        status:'WATCH',
        multiplier:.5,
        samples:20,
        robustnessScore:.55,
        reason:'ADVERSARIAL_STRESS_RESULT',
        failedChecks:['severeCostPositive']
      })
    }
  });
  assert.equal(out.candidates.length,1);
  assert.equal(out.candidates[0].stressStatus,'WATCH');
  assert.equal(out.candidates[0].stressMultiplier,.5);
  assert.equal(out.candidates[0].notionalQuote,2.5);
  assert.equal(out.candidates[0].canExecuteLive,false);
});
