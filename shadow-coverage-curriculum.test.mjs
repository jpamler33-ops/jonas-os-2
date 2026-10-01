import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveCoverageCurriculumCandidates,
  coverageCurriculumSummary,
  prioritizeCoverageCurriculumCandidates,
  DEFAULT_COVERAGE_HORIZONS
} from './shadow-coverage-curriculum.mjs';

function issuance(){
  return {
    issuanceId:'iss-cov',
    symbol:'BTCUSDT',
    generatedAt:300_000,
    asOf:299_000,
    executionMode:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecute:false,
    admission:{gate:'ABSTAIN'},
    trace:{safety:{state:'NORMAL'},researchState:{regime:'RANGE'}},
    forecastFingerprint:'f'.repeat(64),
    forecast:{asOf:299_000,price:65_000,horizons:DEFAULT_COVERAGE_HORIZONS.map((h,i)=>({
      horizonId:h.id,
      horizonMs:h.horizonMs,
      gate:i===1?'ABSTAIN':'PASS',
      direction:i===2?'FLAT':i%2===0?'UP':'DOWN',
      expectedReturn:i===2?-.001:(i%2===0?.002:-.002),
      flatThreshold:i===0?.0008:i===1?.0015:i===2?.003:.006,
      calibration:{status:'CALIBRATED'},
      probabilities:i===2
        ?{up:.32,down:.34,flat:.34}
        :i%2===0
          ?{up:.58,down:.30,flat:.12}
          :{up:.29,down:.59,flat:.12},
      display:{
        probabilityDisplayAllowed:true,
        probabilities:i===2
          ?{up:.32,down:.34,flat:.34}
          :i%2===0
            ?{up:.58,down:.30,flat:.12}
            :{up:.29,down:.59,flat:.12}
      }
    }))}
  };
}

test('coverage curriculum skips calibrated PASS horizons and keeps blocked research horizon',()=>{
  const x=deriveCoverageCurriculumCandidates(issuance(),{
    now:301_000,notionalQuote:2,assetClass:'CORE'
  });
  assert.equal(x.candidates.length,1);
  assert.equal(x.candidates[0].horizonId,'15m');
  assert.equal(x.candidates[0].coveragePriorityReason,'NON_CALIBRATION_BLOCKER_RESEARCH');
  assert.ok(x.candidates.every(c=>c.entryMode==='COVERAGE_PROBE'));
  assert.ok(x.candidates.every(c=>c.horizonOnlyExit===true));
  assert.ok(x.candidates.every(c=>c.notionalQuote===2));
  assert.ok(x.candidates.every(c=>c.execution==='SHADOW_ONLY'&&c.canExecuteLive===false));
});

test('coverage probe default stays small at 5 USDT virtual notional',()=>{
  const x=deriveCoverageCurriculumCandidates(issuance(),{now:301_000,assetClass:'CORE'});
  assert.equal(x.candidates.length,1);
  assert.equal(x.candidates[0].notionalQuote,5);
  assert.equal(x.candidates[0].entryMode,'COVERAGE_PROBE');
  assert.equal(x.candidates[0].canExecuteLive,false);
});

test('coverage key prevents another trade in the same symbol horizon slot',()=>{
  const first=deriveCoverageCurriculumCandidates(issuance(),{now:301_000});
  const key=first.candidates.find(x=>x.horizonId==='15m').coverageKey;
  const second=deriveCoverageCurriculumCandidates(issuance(),{
    now:599_000,existingCoverageKeys:[key]
  });
  assert.equal(second.candidates.some(x=>x.horizonId==='15m'),false);
  assert.equal(second.candidates.length,0);
});

test('next native slot creates a new coverage key',()=>{
  const a=deriveCoverageCurriculumCandidates(issuance(),{now:301_000});
  const b=deriveCoverageCurriculumCandidates({...issuance(),generatedAt:900_000},{now:901_000});
  const a15=a.candidates.find(x=>x.horizonId==='15m');
  const b15=b.candidates.find(x=>x.horizonId==='15m');
  assert.notEqual(a15.coverageKey,b15.coverageKey);
});

test('flat bootstrap forecast still receives a deterministic research direction',()=>{
  const x=issuance();
  x.forecast.horizons.find(h=>h.horizonId==='1h').calibration={status:'INSUFFICIENT'};
  x.forecast.horizons.find(h=>h.horizonId==='1h').gate='ABSTAIN';
  const out=deriveCoverageCurriculumCandidates(x,{now:301_000});
  const h=out.candidates.find(c=>c.horizonId==='1h');
  assert.equal(h.side,'SELL');
});

test('unsafe data cannot be forced into a coverage trade',()=>{
  const x=issuance();
  x.trace={safety:{state:'DEGRADED'}};
  const out=deriveCoverageCurriculumCandidates(x,{now:301_000});
  assert.equal(out.candidates.length,0);
  assert.equal(out.reason,'DATA_SAFETY_NOT_NORMAL');
});

test('uncalibrated horizon is sampled first as a labelled bootstrap probe',()=>{
  const x=issuance();
  x.forecast.horizons[0].calibration={status:'UNCALIBRATED'};
  x.forecast.horizons[0].gate='ABSTAIN';
  x.forecast.horizons[3].calibration={status:'WATCH'};
  x.forecast.horizons[3].gate='ABSTAIN';
  const out=deriveCoverageCurriculumCandidates(x,{now:301_000});
  const row=out.candidates.find(c=>c.horizonId==='5m');
  assert.ok(row);
  assert.equal(row.coverageEvidenceTier,'BOOTSTRAP_RAW_FORECAST');
  assert.equal(row.calibrationStatus,'UNCALIBRATED');
  assert.equal(row.horizonGate,'ABSTAIN');
  assert.equal(row.coveragePriorityReason,'CALIBRATION_DEFICIT');
  assert.equal(out.candidates[0].horizonId,'5m');
  assert.equal(out.candidates[1].horizonId,'3h');
  assert.equal(row.execution,'SHADOW_ONLY');
  assert.equal(row.canExecuteLive,false);
});

test('summary reports symbol and horizon coverage',()=>{
  const ledger={positions:[
    {
      entryMode:'COVERAGE_PROBE',execution:'SHADOW_ONLY',canExecuteLive:false,
      status:'CLOSED',symbol:'BTCUSDT',horizonId:'5m'
    },
    {
      entryMode:'COVERAGE_PROBE',execution:'SHADOW_ONLY',canExecuteLive:false,
      status:'OPEN',symbol:'ETHUSDT',horizonId:'15m',positionId:'p2',
      side:'LONG',openedAt:1,plannedExitAt:2,coverageKey:'c2'
    }
  ]};
  const s=coverageCurriculumSummary(ledger,{symbols:['BTCUSDT','ETHUSDT','SOLUSDT']});
  assert.equal(s.total,2);
  assert.equal(s.coveredSymbols,2);
  assert.equal(s.targetSymbols,3);
  assert.equal(s.byHorizon['5m'].closed,1);
  assert.equal(s.byHorizon['15m'].open,1);
  assert.equal(s.canExecuteLive,false);
});


test('all calibrated PASS and CAUTION horizons produce no bootstrap coverage probes',()=>{
  const x=issuance();
  for(const h of x.forecast.horizons){
    h.calibration={status:'CALIBRATED'};
    h.gate=h.horizonId==='15m'?'CAUTION':'PASS';
  }
  const out=deriveCoverageCurriculumCandidates(x,{now:301_000});
  assert.equal(out.candidates.length,0);
  assert.equal(out.reason,'CALIBRATION_COVERAGE_SUFFICIENT');
});

test('deficit priority prefers insufficient over watch and faster maturity inside the same tier',()=>{
  const x=issuance();
  for(const h of x.forecast.horizons){
    h.gate='ABSTAIN';
    h.calibration={status:'CALIBRATED'};
  }
  x.forecast.horizons.find(h=>h.horizonId==='5m').calibration={status:'INSUFFICIENT'};
  x.forecast.horizons.find(h=>h.horizonId==='3h').calibration={status:'INSUFFICIENT'};
  x.forecast.horizons.find(h=>h.horizonId==='1h').calibration={status:'WATCH'};
  const out=deriveCoverageCurriculumCandidates(x,{now:301_000});
  assert.deepEqual(out.candidates.slice(0,3).map(x=>x.horizonId),['5m','3h','1h']);
  assert.equal(out.candidates[0].coveragePriorityScore,out.candidates[1].coveragePriorityScore);
  assert.ok(out.candidates[0].coveragePriorityScore>out.candidates[2].coveragePriorityScore);
});


test('coverage probe carries complete point-in-time calibration metadata',()=>{
  const x=issuance();
  x.forecast.horizons[0].calibration={status:'INSUFFICIENT'};
  x.forecast.horizons[0].gate='ABSTAIN';
  const out=deriveCoverageCurriculumCandidates(x,{now:301_000});
  const row=out.candidates.find(c=>c.horizonId==='5m');
  assert.ok(row);
  assert.equal(row.referencePrice,65_000);
  assert.equal(row.forecastAsOf,299_000);
  assert.equal(row.flatThreshold,.0008);
  assert.equal(row.regimeId,'RANGE');
  assert.equal(row.coverageEvidenceTier,'BOOTSTRAP_RAW_FORECAST');
  assert.equal(row.execution,'SHADOW_ONLY');
  assert.equal(row.canExecuteLive,false);
});

test('coverage curriculum fails closed instead of placing unlearnable probes',()=>{
  const x=issuance();
  x.forecast.horizons[0].calibration={status:'INSUFFICIENT'};
  x.forecast.horizons[0].gate='ABSTAIN';
  delete x.forecast.horizons[0].flatThreshold;
  x.forecast.price=null;
  const out=deriveCoverageCurriculumCandidates(x,{now:301_000});
  assert.equal(out.candidates.some(c=>c.horizonId==='5m'),false);
  assert.ok(out.missingCalibrationMetadata>=1);
});


test('ESS-targeted curriculum prioritizes the largest class probability-bin deficit',()=>{
  const x=issuance();
  const five=x.forecast.horizons.find(h=>h.horizonId==='5m');
  five.gate='ABSTAIN';
  five.calibration={
    status:'INSUFFICIENT',method:'TRICLASS_EMPIRICAL',
    sampleCount:12,effectiveSamples:2,targetEffectiveSamples:40,bins:10,
    perClass:{
      up:{raw:.58,effectiveSamples:5,targetEffectiveSamples:40,probabilityBinIndex:5,probabilityBinLo:.5,probabilityBinHi:.6},
      down:{raw:.30,effectiveSamples:2,targetEffectiveSamples:40,probabilityBinIndex:3,probabilityBinLo:.3,probabilityBinHi:.4},
      flat:{raw:.12,effectiveSamples:39,targetEffectiveSamples:40,probabilityBinIndex:1,probabilityBinLo:.1,probabilityBinHi:.2}
    }
  };
  const three=x.forecast.horizons.find(h=>h.horizonId==='3h');
  three.gate='ABSTAIN';
  three.calibration={
    status:'INSUFFICIENT',method:'TRICLASS_EMPIRICAL',
    sampleCount:35,effectiveSamples:30,targetEffectiveSamples:40,bins:10,
    perClass:{
      up:{raw:.29,effectiveSamples:30,targetEffectiveSamples:40,probabilityBinIndex:2,probabilityBinLo:.2,probabilityBinHi:.3},
      down:{raw:.59,effectiveSamples:31,targetEffectiveSamples:40,probabilityBinIndex:5,probabilityBinLo:.5,probabilityBinHi:.6},
      flat:{raw:.12,effectiveSamples:32,targetEffectiveSamples:40,probabilityBinIndex:1,probabilityBinLo:.1,probabilityBinHi:.2}
    }
  };

  const out=deriveCoverageCurriculumCandidates(x,{now:301_000});
  assert.equal(out.candidates[0].horizonId,'5m');
  assert.equal(out.candidates[0].coveragePriorityReason,'EFFECTIVE_SAMPLE_DEFICIT');
  assert.equal(out.candidates[0].coverageTargetClass,'DOWN');
  assert.equal(out.candidates[0].coverageTargetProbabilityBinIndex,3);
  assert.equal(out.candidates[0].coverageTargetProbabilityBinLo,.3);
  assert.equal(out.candidates[0].coverageTargetProbabilityBinHi,.4);
  assert.equal(out.candidates[0].coverageTargetEffectiveSamples,2);
  assert.equal(out.candidates[0].coverageTargetEffectiveSamplesGoal,40);
  assert.equal(out.candidates[0].coverageTargetEffectiveSampleDeficit,38);
  assert.equal(out.candidates[0].coverageTargetEffectiveSampleDeficitRatio,.95);
  // Trade direction remains the forecast direction; the matured price outcome
  // labels all three calibration classes, including the targeted DOWN bin.
  assert.equal(out.candidates[0].side,'BUY');
  assert.ok(out.candidates[0].coveragePriorityScore>out.candidates.find(c=>c.horizonId==='3h').coveragePriorityScore);
});


test('global scheduler prefers the shortest horizon when ESS deficits are exactly tied',()=>{
  const btc=issuance();
  const eth=issuance();
  eth.symbol='ETHUSDT';
  eth.issuanceId='iss-eth';
  eth.forecastFingerprint='e'.repeat(64);

  for(const row of [btc.forecast.horizons.find(h=>h.horizonId==='3h'),eth.forecast.horizons.find(h=>h.horizonId==='5m')]){
    row.gate='ABSTAIN';
    row.calibration={
      status:'INSUFFICIENT',targetEffectiveSamples:40,bins:10,
      perClass:{
        up:{raw:.58,effectiveSamples:0,targetEffectiveSamples:40,probabilityBinIndex:5,probabilityBinLo:.5,probabilityBinHi:.6},
        down:{raw:.30,effectiveSamples:10,targetEffectiveSamples:40,probabilityBinIndex:3,probabilityBinLo:.3,probabilityBinHi:.4},
        flat:{raw:.12,effectiveSamples:10,targetEffectiveSamples:40,probabilityBinIndex:1,probabilityBinLo:.1,probabilityBinHi:.2}
      }
    };
  }

  // Remove unrelated coverage candidates so the comparison is an exact
  // 5m-vs-3h tie on class/bin ESS deficit.
  for(const x of [btc,eth]){
    for(const h of x.forecast.horizons){
      if(
        !(x.symbol==='BTCUSDT'&&h.horizonId==='3h')&&
        !(x.symbol==='ETHUSDT'&&h.horizonId==='5m')
      ){
        h.calibration={status:'CALIBRATED'};
        h.gate='PASS';
      }
    }
  }

  const rows=[
    ...deriveCoverageCurriculumCandidates(btc,{now:301_000}).candidates,
    ...deriveCoverageCurriculumCandidates(eth,{now:301_000}).candidates
  ];
  const ranked=prioritizeCoverageCurriculumCandidates(rows,{limit:1});
  assert.equal(ranked.candidates[0].symbol,'ETHUSDT');
  assert.equal(ranked.candidates[0].horizonId,'5m');
  assert.equal(ranked.candidates[0].coverageTargetEffectiveSampleDeficit,40);
  assert.match(ranked.meaning,/TIME_TO_INFORMATION/);
});

test('global scheduler selects the largest ESS deficit across coins, horizons, bins and classes',()=>{
  const btc=issuance();
  const eth=issuance();
  eth.symbol='ETHUSDT';
  eth.issuanceId='iss-eth';
  eth.forecastFingerprint='e'.repeat(64);

  const btc5=btc.forecast.horizons.find(h=>h.horizonId==='5m');
  btc5.gate='ABSTAIN';
  btc5.calibration={
    status:'INSUFFICIENT',targetEffectiveSamples:40,bins:10,
    perClass:{
      up:{raw:.58,effectiveSamples:18,targetEffectiveSamples:40,probabilityBinIndex:5,probabilityBinLo:.5,probabilityBinHi:.6},
      down:{raw:.30,effectiveSamples:20,targetEffectiveSamples:40,probabilityBinIndex:3,probabilityBinLo:.3,probabilityBinHi:.4},
      flat:{raw:.12,effectiveSamples:22,targetEffectiveSamples:40,probabilityBinIndex:1,probabilityBinLo:.1,probabilityBinHi:.2}
    }
  };

  const eth15=eth.forecast.horizons.find(h=>h.horizonId==='15m');
  eth15.gate='ABSTAIN';
  eth15.calibration={
    status:'INSUFFICIENT',targetEffectiveSamples:40,bins:10,
    perClass:{
      up:{raw:.29,effectiveSamples:12,targetEffectiveSamples:40,probabilityBinIndex:2,probabilityBinLo:.2,probabilityBinHi:.3},
      down:{raw:.59,effectiveSamples:3,targetEffectiveSamples:40,probabilityBinIndex:5,probabilityBinLo:.5,probabilityBinHi:.6},
      flat:{raw:.12,effectiveSamples:21,targetEffectiveSamples:40,probabilityBinIndex:1,probabilityBinLo:.1,probabilityBinHi:.2}
    }
  };

  const btcCandidates=deriveCoverageCurriculumCandidates(btc,{now:301_000}).candidates;
  const ethCandidates=deriveCoverageCurriculumCandidates(eth,{now:301_000}).candidates;
  const ranked=prioritizeCoverageCurriculumCandidates([...btcCandidates,...ethCandidates],{limit:1});

  assert.equal(ranked.eligible,3);
  assert.equal(ranked.candidates.length,1);
  assert.equal(ranked.candidates[0].symbol,'ETHUSDT');
  assert.equal(ranked.candidates[0].horizonId,'15m');
  assert.equal(ranked.candidates[0].coverageTargetClass,'DOWN');
  assert.equal(ranked.candidates[0].coverageTargetProbabilityBinIndex,5);
  assert.equal(ranked.candidates[0].coverageTargetEffectiveSampleDeficit,37);
  assert.equal(ranked.canExecuteLive,false);
});
