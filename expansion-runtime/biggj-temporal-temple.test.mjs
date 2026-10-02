import test from 'node:test';
import assert from 'node:assert/strict';
import {
  temporalStateForCase,
  buildBiggjTemporalTemple,
  biggjTemporalTempleSummary,
  BIGGJ_TEMPORAL_TEMPLE_VERSION
} from './biggj-temporal-temple.mjs';

const MS=60_000;

function obs({
  mins,price,entry=1,liq=60_000,mcap=300_000,vol=25_000,buys=18,sells=8,p5=12
}){
  return {
    targetMs:mins*MS,observedAt:1_000_000+mins*MS,elapsedMs:mins*MS,lateByMs:0,
    quality:'ON_TIME',priceUsd:price,returnFromInitial:price/entry-1,
    liquidityUsd:liq,marketCap:mcap,volumeM5:vol,buysM5:buys,sellsM5:sells,priceChangeM5:p5
  };
}

function evidenceCase(i,{
  chain='solana',
  liq=50_000,
  mcap=250_000,
  age=8,
  oneHourReturn=.25,
  fourHourReturn=.45,
  twelveHourReturn=.55,
  twentyFourHourReturn=.65,
  expanding=true
}={}){
  const entry=1;
  const direction=expanding?1:-1;
  const l15=liq*(expanding?1.20:.80);
  const l30=liq*(expanding?1.30:.70);
  const l60=liq*(expanding?1.45:.60);
  const l240=liq*(expanding?1.60:.50);
  const l720=liq*(expanding?1.70:.45);
  const l1440=liq*(expanding?1.80:.40);
  const buy=expanding?18:5,sell=expanding?7:18;
  const vol0=liq*.25;
  return {
    key:chain+':T'+i,
    chainId:chain,
    tokenAddress:'T'+i,
    discoveredAt:1_000_000+i*10_000_000,
    initialPriceUsd:entry,
    initial:{
      chainId:chain,stage:'EARLY',ageMinutes:age,liquidityUsd:liq,marketCap:mcap,
      volumeM5:vol0,buysM5:10,sellsM5:10,priceChangeM5:0,
      socialPosts:2+i%5,socialEngagement:20+i,
      holderTop10Share:.28,researchPriorityScore:.65+(i%10)*.01
    },
    observations:{
      '5m':obs({mins:5,price:1+direction*.08,entry,liq:liq*(expanding?1.10:.90),mcap:mcap*(expanding?1.05:.95),vol:vol0*1.2,buys:buy,sells:sell,p5:direction*8}),
      '15m':obs({mins:15,price:1+direction*.16,entry,liq:l15,mcap:mcap*(expanding?1.08:.92),vol:vol0*1.8,buys:buy,sells:sell,p5:direction*12}),
      '30m':obs({mins:30,price:1+direction*.22,entry,liq:l30,mcap:mcap*(expanding?1.12:.88),vol:vol0*2.1,buys:buy,sells:sell,p5:direction*15}),
      '1h':obs({mins:60,price:1+oneHourReturn,entry,liq:l60,mcap:mcap*(1+oneHourReturn*.6),vol:vol0*2.4,buys:buy,sells:sell,p5:oneHourReturn>=0?18:-18}),
      '4h':obs({mins:240,price:1+fourHourReturn,entry,liq:l240,mcap:mcap*(1+fourHourReturn*.5),vol:vol0*2.0,buys:buy,sells:sell,p5:fourHourReturn>=0?12:-12}),
      '12h':obs({mins:720,price:1+twelveHourReturn,entry,liq:l720,mcap:mcap*(1+twelveHourReturn*.4),vol:vol0*1.8,buys:buy,sells:sell,p5:twelveHourReturn>=0?10:-10}),
      '24h':obs({mins:1440,price:1+twentyFourHourReturn,entry,liq:l1440,mcap:mcap*(1+twentyFourHourReturn*.35),vol:vol0*1.6,buys:buy,sells:sell,p5:twentyFourHourReturn>=0?8:-8})
    }
  };
}

test('64-state lattice encodes six independent binary axes',()=>{
  const c=evidenceCase(1,{expanding:true});
  const state=temporalStateForCase(c,'15m');
  assert.equal(state.stateId,'S63');
  assert.equal(state.direction,'EXPANSION');
  assert.equal(state.alignment,1);
  assert.equal(Object.keys(state.axes).length,6);
});

test('book of changes learns empirical transitions without execution authority',()=>{
  const cases=Array.from({length:12},(_,i)=>evidenceCase(i,{expanding:i%3!==0,oneHourReturn:i%3!==0?.35:-.30,fourHourReturn:i%3!==0?.55:-.45}));
  const temple=buildBiggjTemporalTemple({cases},{minEphemerisSamples:2,minNilometerTrain:50,minNilometerValidate:20});
  assert.equal(temple.version,BIGGJ_TEMPORAL_TEMPLE_VERSION);
  assert.ok(temple.bookOfChanges.observedTransitions>0);
  assert.ok(temple.bookOfChanges.topTransitions.length>0);
  assert.equal(temple.bookOfChanges.decisionAuthority,false);
  assert.equal(temple.policyMutationAllowed,false);
  assert.equal(temple.canExecuteLive,false);
});

test('nilometer screen can find a stable leading proxy only after chronological validation',()=>{
  const cases=Array.from({length:50},(_,i)=>{
    const liq=20_000+i*5_000;
    const scaled=(liq-20_000)/(49*5_000);
    return evidenceCase(i,{liq,mcap:liq*5,oneHourReturn:-.25+scaled*.90,fourHourReturn:-.20+scaled*.95,expanding:true});
  });
  const temple=buildBiggjTemporalTemple({cases},{minNilometerTrain:20,minNilometerValidate:8});
  const cands=temple.nilometers.oneHour.candidates;
  assert.equal(temple.nilometers.oneHour.status,'CANDIDATE_PROXIES_PRESENT');
  assert.ok(cands.some(x=>x.featureId==='logLiquidity'&&x.directionConsistent&&x.validationRho>0));
  assert.ok(cands.every(x=>x.decisionAuthority===false));
});

test('resonance detects synchronized expansion as a testable cross-axis state',()=>{
  const cases=Array.from({length:16},(_,i)=>evidenceCase(i,{expanding:true,oneHourReturn:.30+i*.005,fourHourReturn:.50}));
  const temple=buildBiggjTemporalTemple({cases},{minResonanceSamples:8,minNilometerTrain:50,minNilometerValidate:20});
  const r=temple.resonance.fifteenMinToOneHour;
  assert.equal(r.status,'RESONANCE_SAMPLE_AVAILABLE');
  assert.ok(r.expansion.samples>=8);
  assert.ok(r.expansion.averageReturn>0);
  assert.match(r.semantics,/NOT_MYSTICAL_FREQUENCY/);
});

test('event clock measures meaningful milestones relative to discovery',()=>{
  const c=evidenceCase(1,{expanding:true,oneHourReturn:.40,fourHourReturn:.60});
  c.observations['30m'].priceUsd=1.30;
  c.observations['30m'].returnFromInitial=.30;
  const temple=buildBiggjTemporalTemple({cases:[c]},{minNilometerTrain:50,minNilometerValidate:20});
  const p=temple.eventClock.milestones.find(x=>x.id==='PRICE_PLUS_25');
  assert.equal(p.cases,1);
  assert.equal(p.medianElapsedMs,30*MS);
  assert.match(temple.eventClock.semantics,/EVENT_TIME/);
});

test('scale invariants require the same state to survive distinct chain-liquidity contexts',()=>{
  const cases=[];
  for(let i=0;i<6;i++)cases.push(evidenceCase(i,{chain:'solana',liq:40_000,mcap:200_000,oneHourReturn:.35,fourHourReturn:.50,expanding:true}));
  for(let i=6;i<12;i++)cases.push(evidenceCase(i,{chain:'base',liq:300_000,mcap:1_500_000,oneHourReturn:.28,fourHourReturn:.46,expanding:true}));
  const temple=buildBiggjTemporalTemple({cases},{
    minInvariantPerContext:4,minInvariantContexts:2,
    minNilometerTrain:50,minNilometerValidate:20
  });
  assert.equal(temple.invariants.status,'INVARIANT_CANDIDATES_PRESENT');
  assert.ok(temple.invariants.candidates.some(x=>x.invariant&&x.contexts>=2&&x.direction==='POSITIVE'));
});

test('transition laws validate only later forward behavior with chronological folds and cross-context holdout',()=>{
  const cases=Array.from({length:40},(_,i)=>{
    const chain=i%2===0?'solana':'base';
    const liq=i%4<2?40_000:300_000;
    return evidenceCase(i,{
      chain,liq,mcap:liq*5,expanding:true,
      oneHourReturn:.34+(i%3)*.01,
      fourHourReturn:.55+(i%4)*.01,
      twelveHourReturn:.72+(i%5)*.01,
      twentyFourHourReturn:.88+(i%6)*.01
    });
  });
  const temple=buildBiggjTemporalTemple({cases},{
    minTransitionLawTrain:16,
    minTransitionLawValidate:6,
    minTransitionLawContextSamples:3,
    minTransitionLawContexts:2,
    maxTransitionLawFolds:3,
    minTransitionLawMedianEffect:.01,
    minNilometerTrain:100,
    minNilometerValidate:20
  });
  assert.match(temple.transitionLaws.status,/LAW_CANDIDATES_PRESENT/);
  const law=temple.transitionLaws.candidates.find(x=>
    x.from==='15m'&&x.to==='30m'&&x.forwardHorizon==='1h'&&x.validated
  );
  assert.ok(law);
  assert.equal(law.fromState,'S63');
  assert.equal(law.toState,'S63');
  assert.equal(law.direction,'POSITIVE');
  assert.ok(law.folds.length>=2);
  assert.ok(law.contextsEligible>=2);
  assert.equal(law.contextConsistent,true);
  assert.equal(law.decisionAuthority,false);
  assert.match(temple.transitionLaws.leakageGuard,/AFTER_TRANSITION_TO_STATE/);
});

test('transition law walk-forward rejects a relation that reverses in later chronological samples',()=>{
  const cases=Array.from({length:34},(_,i)=>{
    const late=i>=22;
    return evidenceCase(i,{
      chain:i%2===0?'solana':'base',
      liq:i%4<2?40_000:300_000,
      mcap:(i%4<2?40_000:300_000)*5,
      expanding:true,
      oneHourReturn:late?.08:.36,
      fourHourReturn:late?.10:.56,
      twelveHourReturn:late?.12:.70,
      twentyFourHourReturn:late?.14:.82
    });
  });
  const temple=buildBiggjTemporalTemple({cases},{
    minTransitionLawTrain:16,
    minTransitionLawValidate:6,
    minTransitionLawContextSamples:2,
    minTransitionLawContexts:2,
    maxTransitionLawFolds:2,
    minTransitionLawMedianEffect:.01,
    minNilometerTrain:100,
    minNilometerValidate:20
  });
  const law=temple.transitionLaws.candidates.find(x=>
    x.from==='15m'&&x.to==='30m'&&x.forwardHorizon==='1h'
  );
  assert.ok(law);
  assert.equal(law.direction,'POSITIVE');
  assert.equal(law.validated,false);
  assert.equal(law.status,'FAILED_FORWARD_VALIDATION');
});

test('summary stays research-only and cannot auto-promote',()=>{
  const temple=buildBiggjTemporalTemple({cases:[evidenceCase(1)]});
  const s=biggjTemporalTempleSummary(temple);
  assert.equal(s.execution,'SHADOW_ONLY');
  assert.equal(s.canExecuteLive,false);
  assert.equal(s.policyMutationAllowed,false);
  assert.equal(s.automaticPromotionAllowed,false);
  assert.equal(s.transitionLaws.decisionAuthority,false);
});
