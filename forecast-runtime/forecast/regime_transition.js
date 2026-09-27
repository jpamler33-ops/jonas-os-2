import { clamp, weightedMean } from '../utils/math.js';
const EPS = 1e-12;
function median(xs) { if (!xs.length)
    return 0; const s = [...xs].sort((a, b) => a - b), m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : ((s[m - 1] ?? 0) + (s[m] ?? 0)) / 2; }
function robustScale(xs) { if (xs.length < 3)
    return 1; const m = median(xs), mad = median(xs.map(x => Math.abs(x - m))); return Math.max(.05, 1.4826 * mad); }
function ess(ws) { const s = ws.reduce((a, b) => a + b, 0), s2 = ws.reduce((a, b) => a + b * b, 0); return s2 <= EPS ? 0 : s * s / s2; }
function entropy(ps) { const nz = ps.filter(x => x > EPS); if (nz.length <= 1)
    return 0; return clamp(-nz.reduce((s, p) => s + p * Math.log(p), 0) / Math.log(Math.max(2, ps.length)), 0, 1); }
/**
 * Empirical next-observed-regime model. It intentionally predicts the next observed
 * regime state, not a causal intervention and not an exact clock-time endpoint.
 */
export function buildRegimeTransitionForecast(input, history, o) {
    const warnings = [];
    let futureStatesBlocked = 0, duplicateStatesCollapsed = 0;
    if (!input.regimeId)
        return { status: 'INSUFFICIENT', currentRegime: undefined, changeProbability: 0, selfTransitionProbability: 0, entropy: 1, sampleCount: 0, effectiveSamples: 0, meanTransitionGapMs: 0, probabilities: [], warnings: ['current regime is unavailable'], audit: { asOf: input.asOf, futureStatesBlocked, duplicateStatesCollapsed } };
    const byTs = new Map();
    for (const r of history) {
        if (r.symbol !== input.symbol || !r.regimeId)
            continue;
        if (r.timestamp > input.asOf || r.availableAt > input.asOf) {
            futureStatesBlocked++;
            continue;
        }
        if (!o.featureIds.every(id => Number.isFinite(r.features[id])))
            continue;
        if (byTs.has(r.timestamp)) {
            duplicateStatesCollapsed++;
            continue;
        }
        byTs.set(r.timestamp, { timestamp: r.timestamp, availableAt: r.availableAt, regimeId: r.regimeId, features: r.features, quality: clamp(r.quality ?? 1, 0, 1) });
    }
    const states = [...byTs.values()].sort((a, b) => a.timestamp - b.timestamp);
    if (states.length < 2)
        return { status: 'INSUFFICIENT', currentRegime: input.regimeId, changeProbability: 0, selfTransitionProbability: 0, entropy: 1, sampleCount: 0, effectiveSamples: 0, meanTransitionGapMs: 0, probabilities: [], warnings: ['insufficient historical regime states'], audit: { asOf: input.asOf, futureStatesBlocked, duplicateStatesCollapsed } };
    const scales = Object.fromEntries(o.featureIds.map(id => [id, robustScale(states.map(s => s.features[id]))]));
    const fw = o.featureWeights ?? {}, bw = Math.max(.05, o.bandwidth ?? 1.5), half = o.recencyHalfLifeMs ?? 1000 * 60 * 60 * 24 * 30, maxGap = o.maxTransitionGapMs ?? 1000 * 60 * 60 * 24, trs = [];
    for (let i = 0; i < states.length - 1; i++) {
        const a = states[i], b = states[i + 1], gap = b.timestamp - a.timestamp;
        if (a.regimeId !== input.regimeId || gap <= 0 || gap > maxGap)
            continue;
        let n = 0, d = 0;
        for (const id of o.featureIds) {
            const w = Math.max(0, fw[id] ?? 1) * clamp(input.featureConfidence?.[id] ?? 1, 0, 1), z = ((input.features[id] ?? 0) - (a.features[id] ?? 0)) / (scales[id] ?? 1);
            n += w * z * z;
            d += w;
        }
        const dist = Math.sqrt(n / Math.max(EPS, d)), sim = Math.exp(-.5 * (dist / bw) ** 2), age = Math.max(0, input.asOf - b.availableAt), rec = half > 0 ? Math.pow(2, -age / half) : 1, weight = sim * sim * rec * a.quality * b.quality;
        if (weight > EPS)
            trs.push({ from: a, to: b, gap, weight, similarity: sim });
    }
    const selected = trs.sort((a, b) => b.similarity - a.similarity).slice(0, Math.max(1, o.topK ?? 300)), ws = selected.map(x => x.weight), effective = ess(ws), den = ws.reduce((a, b) => a + b, 0);
    const sums = new Map();
    for (const t of selected)
        sums.set(t.to.regimeId, (sums.get(t.to.regimeId) ?? 0) + t.weight);
    const probabilities = [...sums.entries()].map(([regimeId, w]) => ({ regimeId, probability: den > EPS ? w / den : 0, weightedCount: w })).sort((a, b) => b.probability - a.probability), self = probabilities.find(x => x.regimeId === input.regimeId)?.probability ?? 0;
    const status = selected.length >= (o.minCases ?? 20) && effective >= (o.minEffectiveSamples ?? 8) ? 'ACTIVE' : 'INSUFFICIENT';
    if (status === 'INSUFFICIENT')
        warnings.push('regime-transition support is insufficient');
    return { status, currentRegime: input.regimeId, likelyNextRegime: probabilities[0]?.regimeId, changeProbability: clamp(1 - self, 0, 1), selfTransitionProbability: self, entropy: entropy(probabilities.map(x => x.probability)), sampleCount: selected.length, effectiveSamples: effective, meanTransitionGapMs: selected.length ? weightedMean(selected.map(x => x.gap), ws) : 0, probabilities, warnings, audit: { asOf: input.asOf, futureStatesBlocked, duplicateStatesCollapsed } };
}