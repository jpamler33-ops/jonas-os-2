import test from 'node:test';
import assert from 'node:assert/strict';
import { evidenceRecord, pointInTime, independentEvidence, buildWorldState, knowledgeState, shadowDecision, autopsy } from './core.mjs';

const a = evidenceRecord({ source: 'market', eventTime: '2026-09-29T10:00:00Z', availableAt: '2026-09-29T10:00:01Z', confidence: 0.9, independenceGroup: 'price', payload: { price: 100 } });
const copy = evidenceRecord({ source: 'news-copy', eventTime: '2026-09-29T10:00:00Z', availableAt: '2026-09-29T10:00:02Z', confidence: 0.7, independenceGroup: 'price', payload: { price: 100 } });
const future = evidenceRecord({ source: 'future', eventTime: '2026-09-29T10:05:00Z', availableAt: '2026-09-29T10:05:01Z', payload: { price: 110 } });

test('PIT guard excludes unavailable evidence', () => {
  assert.deepEqual(pointInTime([a, future], '2026-09-29T10:01:00Z').map(x => x.id), [a.id]);
});

test('independence guard prevents duplicate evidence votes', () => {
  assert.equal(independentEvidence([a, copy]).length, 1);
});

test('world state preserves lineage and unknownness', () => {
  const world = buildWorldState({ asOf: '2026-09-29T10:01:00Z', evidence: [a, copy, future] });
  assert.equal(world.independentEvidenceCount, 1);
  assert.deepEqual(world.evidenceIds, [a.id]);
  assert.ok(world.unknownness > 0);
});

test('execution is structurally shadow-only', () => {
  const world = buildWorldState({ asOf: '2026-09-29T10:01:00Z', evidence: [a] });
  const knowledge = knowledgeState({ world, hypotheses: [{ status: 'SUPPORTED', confidence: 0.8 }] });
  const decision = shadowDecision({ world, knowledge, directionalEdge: 1 });
  assert.equal(decision.canExecuteLive, false);
  assert.equal(decision.mode, 'SHADOW_ONLY');
  const report = autopsy({ decision, outcome: { returnPct: -0.02 } });
  assert.equal(report.liveExecutionOccurred, false);
});
