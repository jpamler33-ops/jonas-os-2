import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveCoverageCurriculumCandidates,
  coverageCurriculumSummary,
  DEFAULT_COVERAGE_HORIZONS
} from './shadow-coverage-curriculum.mjs';

function issuance(){
  return {
    issuanceId:'iss-cov',
    symbol:'BTCUSDT',
    generatedAt:300_000,
    executionMode:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecute:false,
    admission:{gate:'ABSTAIN'},
    trace:{safety:{state:'NORMAL'}},
    forecastFingerprint:'f'.repeat(64),
    forecast:{horizons:DEFAULT_COVERAGE_HORIZONS.map((h,i)=>({
      horizonId:h.id,
      horizonMs:h.horizonMs,
      gate:i===1?'ABSTAIN':'PASS',
      direction:i===2?'FLAT':i%2===0?'UP':'DOWN',
      expectedReturn:i===2?-.001:(i%2===0?.002:-.002),
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

test('deficit priority prefers insufficient over watch and longer horizon inside same tier',()=>{
  const x=issuance();
  for(const h of x.forecast.horizons){
    h.gate='ABSTAIN';
    h.calibration={status:'CALIBRATED'};
  }
  x.forecast.horizons.find(h=>h.horizonId==='5m').calibration={status:'INSUFFICIENT'};
  x.forecast.horizons.find(h=>h.horizonId==='3h').calibration={status:'INSUFFICIENT'};
  x.forecast.horizons.find(h=>h.horizonId==='1h').calibration={status:'WATCH'};
  const out=deriveCoverageCurriculumCandidates(x,{now:301_000});
  assert.deepEqual(out.candidates.slice(0,3).map(x=>x.horizonId),['3h','5m','1h']);
  assert.ok(out.candidates[0].coveragePriorityScore>out.candidates[2].coveragePriorityScore);
});
