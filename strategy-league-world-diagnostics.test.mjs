import test from 'node:test';
import assert from 'node:assert/strict';
import { createStrategyLeagueLedger } from './shadow-strategy-league.mjs';
import { diagnoseStrategyLeagueWorldCandidates } from './strategy-league-world-diagnostics.mjs';

test('world candidate diagnostics never gain execution authority',()=>{
  const ledger=createStrategyLeagueLedger({now:1});
  const out=diagnoseStrategyLeagueWorldCandidates(null,ledger,{now:2,worldState:null});
  assert.equal(out.execution,'SHADOW_ONLY');
  assert.equal(out.action,'ABSTAIN');
  assert.equal(out.canExecute,false);
  assert.equal(out.canExecuteLive,false);
  assert.ok(out.rows.length>0);
  assert.ok(out.rows.every(x=>x.canExecuteLive===false));
});
