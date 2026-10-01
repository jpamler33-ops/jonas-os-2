import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('autolearn uses the global coverage sweep',async()=>{
  const source=await readFile(new URL('./bot.mjs',import.meta.url),'utf8');
  assert.match(source,/deferCoverageToSweep:true/);
  assert.match(source,/maybePlaceCoverageCurriculumSweep\(coverageSweepItems\)/);
  assert.match(source,/scope:'GLOBAL_ESS_SWEEP'/);
  assert.match(source,/TCX_COVERAGE_CURRICULUM_MAX_PER_SWEEP/);
  assert.match(source,/coverageGlobalWinners/);
  assert.match(source,/coverageCurriculumRefreshPriority\(latest,\{now:sweepPlanNow\}\)/);
  assert.match(source,/TCX_COVERAGE_REFRESH_PLAN/);
  assert.match(source,/REFRESH_PRIORITY_ONLY/);
});
