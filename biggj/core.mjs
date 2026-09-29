import crypto from 'node:crypto';

export const EvidenceClass = Object.freeze({
  OBSERVED: 'OBSERVED',
  INFERRED: 'INFERRED',
  MODELLED: 'MODELLED',
  HYPOTHESIS: 'HYPOTHESIS',
  UNKNOWN: 'UNKNOWN',
});

const clamp01 = (n) => Math.max(0, Math.min(1, Number(n)));
const id = (prefix, payload) => `${prefix}_${crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 16)}`;

export function evidenceRecord(input) {
  if (!input?.source || !input?.eventTime || !input?.availableAt) throw new Error('BIGGJ_EVIDENCE_INVALID');
  if (Date.parse(input.availableAt) < Date.parse(input.eventTime)) throw new Error('BIGGJ_TIME_INVALID');
  const record = {
    kind: EvidenceClass.OBSERVED,
    source: input.source,
    eventTime: input.eventTime,
    availableAt: input.availableAt,
    observedAt: input.observedAt ?? input.availableAt,
    independenceGroup: input.independenceGroup ?? input.source,
    confidence: clamp01(input.confidence ?? 1),
    payload: input.payload ?? {},
    version: input.version ?? 1,
  };
  return Object.freeze({ id: id('ev', record), ...record });
}

export function pointInTime(records, asOf) {
  const t = Date.parse(asOf);
  return records.filter((r) => Date.parse(r.availableAt) <= t);
}

export function independentEvidence(records) {
  const best = new Map();
  for (const r of records) {
    const key = r.independenceGroup ?? r.source;
    if (!best.has(key) || best.get(key).confidence < r.confidence) best.set(key, r);
  }
  return [...best.values()];
}

export function buildWorldState({ asset = 'BTC', asOf, evidence = [] }) {
  const visible = independentEvidence(pointInTime(evidence, asOf));
  const knownness = visible.length ? Math.min(1, visible.reduce((s, x) => s + x.confidence, 0) / Math.max(3, visible.length)) : 0;
  return Object.freeze({
    id: id('world', { asset, asOf, evidence: visible.map((x) => x.id) }),
    asset,
    asOf,
    evidenceIds: visible.map((x) => x.id),
    independentEvidenceCount: visible.length,
    knownness,
    unknownness: 1 - knownness,
  });
}

export function knowledgeState({ world, hypotheses = [] }) {
  const supported = hypotheses.filter((h) => h.status === 'SUPPORTED');
  const answerConfidence = supported.length ? clamp01(Math.max(...supported.map((h) => h.confidence ?? 0))) : 0;
  const knowledgeConfidence = clamp01(world.knownness * (1 - Math.min(0.5, hypotheses.length ? 1 / (hypotheses.length + 1) : 0.5)));
  return Object.freeze({
    answerConfidence,
    knowledgeConfidence,
    selfDoubt: clamp01(answerConfidence - knowledgeConfidence),
    unknownness: world.unknownness,
    status: world.unknownness > 0.65 ? EvidenceClass.UNKNOWN : 'PARTIALLY_KNOWN',
  });
}

export function shadowDecision({ world, knowledge, directionalEdge = 0 }) {
  const edge = Math.max(-1, Math.min(1, Number(directionalEdge)));
  const epistemicWeight = knowledge.knowledgeConfidence * (1 - knowledge.unknownness);
  const conviction = Math.abs(edge) * epistemicWeight;
  let action = 'ABSTAIN';
  if (conviction >= 0.12) action = edge > 0 ? 'SHADOW_LONG' : 'SHADOW_SHORT';
  return Object.freeze({
    id: id('decision', { world: world.id, edge, conviction, action }),
    asset: world.asset,
    asOf: world.asOf,
    action,
    conviction,
    canExecuteLive: false,
    mode: 'SHADOW_ONLY',
    evidenceIds: world.evidenceIds,
  });
}

export function autopsy({ decision, outcome }) {
  const direction = outcome?.returnPct === 0 ? 0 : Math.sign(outcome?.returnPct ?? 0);
  const expected = decision.action === 'SHADOW_LONG' ? 1 : decision.action === 'SHADOW_SHORT' ? -1 : 0;
  return Object.freeze({
    decisionId: decision.id,
    correctDirection: expected === 0 ? null : expected === direction,
    realizedReturnPct: Number(outcome?.returnPct ?? 0),
    learningRequired: expected !== 0 && expected !== direction,
    liveExecutionOccurred: false,
  });
}
