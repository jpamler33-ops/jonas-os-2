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

test('coverage curriculum creates one candidate for every native learning horizon',()=>{
  const x=deriveCoverageCurriculumCandidates(issuance(),{
    now:301_000,notionalQuote:2,assetClass:'CORE'
  });
  assert.equal(x.candidates.length,4);
  assert.deepEqual(x.candidates.map(c=>c.horizonId),['5m','15m','1h','3h']);
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
  assert.equal(second.candidates.some(x=>x.horizonId==='5m'),true);
});

test('next native slot creates a new coverage key',()=>{
  const a=deriveCoverageCurriculumCandidates(issuance(),{now:301_000});
  const b=deriveCoverageCurriculumCandidates({...issuance(),generatedAt:900_000},{now:901_000});
  const a15=a.candidates.find(x=>x.horizonId==='15m');
  const b15=b.candidates.find(x=>x.horizonId==='15m');
  assert.notEqual(a15.coverageKey,b15.coverageKey);
});

test('flat forecast still receives a deterministic research direction',()=>{
  const x=deriveCoverageCurriculumCandidates(issuance(),{now:301_000});
  const h=x.candidates.find(c=>c.horizonId==='1h');
  assert.equal(h.side,'SELL');
});

test('unsafe data cannot be forced into a coverage trade',()=>{
  const x=issuance();
  x.trace={safety:{state:'DEGRADED'}};
  const out=deriveCoverageCurriculumCandidates(x,{now:301_000});
  assert.equal(out.candidates.length,0);
  assert.equal(out.reason,'DATA_SAFETY_NOT_NORMAL');
});

test('uncalibrated horizons are not forced',()=>{
  const x=issuance();
  x.forecast.horizons[0].calibration={status:'UNCALIBRATED'};
  const out=deriveCoverageCurriculumCandidates(x,{now:301_000});
  assert.equal(out.candidates.some(c=>c.horizonId==='5m'),false);
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
