import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('autolearn global ESS sweep retains recent audit-bound issuances across cycles',async()=>{
  const source=await readFile(new URL('./bot.mjs',import.meta.url),'utf8');
  assert.match(source,/deferCoverageToSweep:true/);
  assert.match(source,/rememberCoverageIssuance\(coverageIssuancePool/);
  assert.match(source,/findAuditRecordIdentity\(auditLedger/);
  assert.match(source,/TCX_INSTITUTIONAL_FORECAST_ISSUED/);
  assert.match(source,/coverageIssuancePoolItems\(coverageIssuancePool/);
  assert.match(source,/maybePlaceCoverageCurriculumSweep\(coveragePoolItems\)/);
  assert.match(source,/scope:'GLOBAL_ESS_SWEEP'/);
  assert.match(source,/TCX_COVERAGE_CURRICULUM_MAX_PER_SWEEP/);
  assert.match(source,/coverageFreshIssuances/);
  assert.match(source,/coveragePooledIssuances/);
  assert.match(source,/coverageGlobalWinners/);
});
