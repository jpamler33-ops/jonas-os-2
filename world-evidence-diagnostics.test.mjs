import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorldEvidenceDiagnostics,recordWorldEvidenceEvent,summarizeWorldEvidenceDiagnostics} from './world-evidence-diagnostics.mjs';

test('attributes blockers to exact world genome generation',()=>{
  const meta={worldId:'WORLD_SCOUT',genomeId:'wg_1',generation:1};
  let s=createWorldEvidenceDiagnostics({now:1000});
  s=recordWorldEvidenceEvent(s,meta,{event:'CANDIDATE',now:1100});
  s=recordWorldEvidenceEvent(s,meta,{event:'BLOCKED',reason:'EDGE_GATE',now:1200});
  const summary=summarizeWorldEvidenceDiagnostics(s,{worlds:[{worldId:'WORLD_SCOUT',generation:1,currentGenome:{genomeId:'wg_1'}}],now:1300});
  assert.equal(summary.worlds[0].candidateAttempts,1);
  assert.equal(summary.worlds[0].blockers.EDGE_GATE,1);
  assert.equal(summary.worlds[0].topBlocker,'EDGE_GATE');
  assert.equal(summary.canExecuteLive,false);
});

test('marks stale zero-evidence world without changing execution authority',()=>{
  const worlds=[{worldId:'WORLD_EDGE',generation:1,currentGenome:{genomeId:'wg_x'}}];
  const summary=summarizeWorldEvidenceDiagnostics(createWorldEvidenceDiagnostics({now:1}),{worlds,now:10_000,staleMs:100});
  assert.equal(summary.stalledWorlds,1);
  assert.equal(summary.action,'ABSTAIN');
  assert.equal(summary.canExecute,false);
});
