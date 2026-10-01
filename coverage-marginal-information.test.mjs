import test from 'node:test';
import assert from 'node:assert/strict';
import { prioritizeCoverageCurriculumCandidates } from './shadow-coverage-curriculum.mjs';

const probe=(coverageKey,{symbol='BTCUSDT',horizonId='5m',klass='UP',bin=1,score=5_000_000_000_000,deficit=.9}={})=>({
  coverageKey,symbol,horizonId,horizonMs:horizonId==='5m'?300000:900000,
  coverageTargetClass:klass,coverageTargetProbabilityBinIndex:bin,
  coveragePriorityScore:score,coverageTargetEffectiveSampleDeficitRatio:deficit,
  coverageTargetEffectiveSampleDeficit:deficit*100,
  entryMode:'COVERAGE_PROBE',execution:'SHADOW_ONLY',action:'ABSTAIN',canExecuteLive:false
});

test('second global coverage slot prefers a distinct evidence lane',()=>{
  const result=prioritizeCoverageCurriculumCandidates([
    probe('winner',{score:5_000_000_000_300}),
    probe('same-lane',{score:5_000_000_000_200}),
    probe('different-lane',{symbol:'ETHUSDT',score:5_000_000_000_100})
  ],{limit:2});
  assert.deepEqual(result.candidates.map(x=>x.coverageKey),['winner','different-lane']);
  assert.equal(result.execution,'SHADOW_ONLY');
  assert.equal(result.canExecuteLive,false);
});

test('scheduler falls back to ranked candidate when no diverse lane exists',()=>{
  const result=prioritizeCoverageCurriculumCandidates([
    probe('winner',{score:300}),
    probe('fallback',{score:200})
  ],{limit:2});
  assert.deepEqual(result.candidates.map(x=>x.coverageKey),['winner','fallback']);
});
