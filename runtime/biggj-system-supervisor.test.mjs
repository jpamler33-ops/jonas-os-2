import test from 'node:test';
import assert from 'node:assert/strict';
import { BIGGJ_SAFETY_INVARIANTS, BIGGJ_SYSTEMS, assertBiggjSafetyInvariants, createSystemEnvelope } from './biggj-system-contract.mjs';
import { createBiggjSystemSupervisor } from './biggj-system-supervisor.mjs';

test('safety invariants remain fail-closed', () => {
  assert.equal(assertBiggjSafetyInvariants(BIGGJ_SAFETY_INVARIANTS), true);
  assert.throws(() => assertBiggjSafetyInvariants({ ...BIGGJ_SAFETY_INVARIANTS, canExecuteLive: true }), /LIVE_EXECUTION/);
  assert.throws(() => assertBiggjSafetyInvariants({ ...BIGGJ_SAFETY_INVARIANTS, automaticProductionPromotion: true }), /AUTO_PROMOTION/);
});

test('system envelope carries immutable safety state', () => {
  const event = createSystemEnvelope({ system: BIGGJ_SYSTEMS.RESEARCH, type: 'RESEARCH_RESULT', payload: { evidenceDelta: 1 } });
  assert.equal(event.safety.canExecute, false);
  assert.equal(event.safety.canExecuteLive, false);
  assert.equal(event.safety.mode, 'SHADOW_ONLY');
});

test('noncritical worker memory pressure does not block critical systems', () => {
  const supervisor = createBiggjSystemSupervisor();
  supervisor.heartbeat(BIGGJ_SYSTEMS.CONTROL, { memoryMb: 20 });
  supervisor.heartbeat(BIGGJ_SYSTEMS.DATA, { memoryMb: 40 });
  supervisor.heartbeat(BIGGJ_SYSTEMS.LIVE_BRAIN, { memoryMb: 50 });
  supervisor.heartbeat(BIGGJ_SYSTEMS.RESEARCH, { memoryMb: 999 });
  const health = supervisor.health();
  assert.equal(health.status, 'DEGRADED');
  assert.equal(supervisor.snapshot(BIGGJ_SYSTEMS.LIVE_BRAIN).status, 'HEALTHY');
  assert.equal(supervisor.canSchedule(BIGGJ_SYSTEMS.RESEARCH, { expectedInformationGain: 1 }).allowed, false);
});

test('research without information gain is not scheduled', () => {
  const supervisor = createBiggjSystemSupervisor();
  supervisor.heartbeat(BIGGJ_SYSTEMS.RESEARCH, { memoryMb: 20 });
  assert.deepEqual(supervisor.canSchedule(BIGGJ_SYSTEMS.RESEARCH, { expectedInformationGain: 0 }), { allowed: false, reason: 'NO_EXPECTED_INFORMATION_GAIN' });
  assert.equal(supervisor.canSchedule(BIGGJ_SYSTEMS.RESEARCH, { expectedInformationGain: 0.4 }).allowed, true);
});
