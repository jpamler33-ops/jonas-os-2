import { clamp, weightedMean } from '../utils/math.js';
const EPS = 1e-12;
function ess(ws) { const s = ws.reduce((a, b) => a + b, 0), s2 = ws.reduce((a, b) => a + b * b, 0); return s2 <= EPS ? 0 : s * s / s2; }
function median(xs) { if (!xs.length)
    return 0; const s = [...xs].sort((a, b) => a - b), m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : ((s[m - 1] ?? 0) + (s[m] ?? 0)) / 2; }
function robustScale(xs) { if (xs.length < 3)
    return 1; const m = median(xs), mad = median(xs.map(x => Math.abs(x - m))); return Math.max(.05, 1.4826 * mad); }
export class ForecastReliabilityMemory {
    maxRows;
    rows = [];
    keys = new Set();
    constructor(maxRows = 100_000) {
        this.maxRows = maxRows;
    }
    add(row) {
        const key = row.id ?? `${row.symbol}:${row.horizonMs}:${row.resolvedAt}:${row.actualDirection}`;
        if (this.keys.has(key))
            return;
        this.rows.push(structuredClone(row));
        this.keys.add(key);
        this.rows.sort((a, b) => a.resolvedAt - b.resolvedAt);
        if (this.rows.length > this.maxRows) {
            const removed = this.rows.splice(0, this.rows.length - this.maxRows);
            for (const r of removed)
                this.keys.delete(r.id ?? `${r.symbol}:${r.horizonMs}:${r.resolvedAt}:${r.actualDirection}`);
        }
    }
    addMany(rows) { for (const r of rows)
        this.add(r); }
    all() { return this.rows.map(r => structuredClone(r)); }
    query(input, opts) {
        const pool = this.rows.filter(r => r.symbol === input.symbol && r.horizonMs === opts.horizonMs && r.resolvedAt <= opts.asOf && opts.featureIds.every(id => Number.isFinite(r.features[id])));
        if (!pool.length)
            return { status: 'INSUFFICIENT', count: 0, effectiveSamples: 0, meanSimilarity: 0, meanBrier: 0, meanLogLoss: 0, meanAbsoluteReturnError: 0, intervalMissRate: 0, highConfidenceWrongRate: 0, reliabilityScore: .5 };
        const scales = Object.fromEntries(opts.featureIds.map(id => [id, robustScale(pool.map(r => r.features[id]))]));
        const bw = Math.max(.05, opts.bandwidth);
        const scored = pool.map(r => {
            let n = 0, d = 0;
            for (const id of opts.featureIds) {
                const fw = clamp(input.featureConfidence?.[id] ?? 1, 0, 1);
                const z = ((input.features[id] ?? 0) - (r.features[id] ?? 0)) / (scales[id] ?? 1);
                n += fw * z * z;
                d += fw;
            }
            let sim = Math.exp(-.5 * (Math.sqrt(n / Math.max(EPS, d)) / bw) ** 2);
            if (input.regimeId && r.regimeId === input.regimeId)
                sim = Math.min(1, sim * 1.10);
            else if (input.regimeId && r.regimeId)
                sim *= .85;
            const age = Math.max(0, opts.asOf - r.resolvedAt), rec = opts.recencyHalfLifeMs > 0 ? Math.pow(2, -age / opts.recencyHalfLifeMs) : 1;
            return { r, sim, w: sim ** 2 * rec * clamp(r.quality ?? 1, 0, 1) };
        }).filter(x => x.w > EPS).sort((a, b) => b.sim - a.sim).slice(0, opts.topK ?? 250);
        const ws = scored.map(x => x.w), e = ess(ws), count = scored.length;
        const status = e >= opts.minEffectiveSamples && count >= opts.minCases ? 'ACTIVE' : 'INSUFFICIENT';
        if (!scored.length)
            return { status: 'INSUFFICIENT', count: 0, effectiveSamples: 0, meanSimilarity: 0, meanBrier: 0, meanLogLoss: 0, meanAbsoluteReturnError: 0, intervalMissRate: 0, highConfidenceWrongRate: 0, reliabilityScore: .5 };
        const meanBrier = weightedMean(scored.map(x => x.r.brier), ws);
        const highWeights = scored.map((x, i) => x.r.topProbability >= opts.highConfidenceThreshold ? (ws[i] ?? 0) : 0);
        const highDen = highWeights.reduce((a, b) => a + b, 0);
        const wrong = highDen <= EPS ? 0 : scored.reduce((sum, x, i) => sum + ((x.r.topProbability >= opts.highConfidenceThreshold && !x.r.topCorrect) ? (ws[i] ?? 0) : 0), 0) / highDen;
        const reliabilityScore = clamp(1 - (.65 * clamp(meanBrier / 1.0, 0, 1) + .35 * wrong), 0, 1);
        return { status, count, effectiveSamples: e, meanSimilarity: weightedMean(scored.map(x => x.sim), ws), meanBrier, meanLogLoss: weightedMean(scored.map(x => x.r.logLoss), ws), meanAbsoluteReturnError: weightedMean(scored.map(x => x.r.absoluteReturnError), ws), intervalMissRate: weightedMean(scored.map(x => x.r.intervalMiss ? 1 : 0), ws), highConfidenceWrongRate: wrong, reliabilityScore };
    }
}