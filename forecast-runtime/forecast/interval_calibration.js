import { clamp, weightedMean } from '../utils/math.js';
const EPS = 1e-12;
function ess(ws) { const s = ws.reduce((a, b) => a + b, 0), s2 = ws.reduce((a, b) => a + b * b, 0); return s2 <= EPS ? 0 : s * s / s2; }
function median(xs) { if (!xs.length)
    return 0; const s = [...xs].sort((a, b) => a - b), m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : ((s[m - 1] ?? 0) + (s[m] ?? 0)) / 2; }
function robustScale(xs) { if (xs.length < 3)
    return 1; const m = median(xs), mad = median(xs.map(x => Math.abs(x - m))); return Math.max(.05, 1.4826 * mad); }
function weightedQuantile(xs, ws, q) {
    if (!xs.length)
        return 1;
    const pairs = xs.map((x, i) => ({ x, w: Math.max(0, ws[i] ?? 0) })).sort((a, b) => a.x - b.x), total = pairs.reduce((s, p) => s + p.w, 0);
    if (total <= EPS)
        return pairs[Math.round(clamp(q, 0, 1) * (pairs.length - 1))]?.x ?? 1;
    let c = 0, target = clamp(q, 0, 1) * total;
    for (const p of pairs) {
        c += p.w;
        if (c >= target)
            return p.x;
    }
    return pairs.at(-1)?.x ?? 1;
}
function valid(r) { return Number.isFinite(r.median) && Number.isFinite(r.lower) && Number.isFinite(r.upper) && Number.isFinite(r.actualReturn) && r.lower <= r.median && r.median <= r.upper; }
function ratioScore(r) {
    const lo = Math.max(EPS, r.median - r.lower), hi = Math.max(EPS, r.upper - r.median);
    return r.actualReturn < r.median ? (r.median - r.actualReturn) / lo : (r.actualReturn - r.median) / hi;
}
function covered(r, scale) {
    const lo = r.median - scale * Math.max(EPS, r.median - r.lower), hi = r.median + scale * Math.max(EPS, r.upper - r.median);
    return r.actualReturn >= lo && r.actualReturn <= hi;
}
/**
 * Point-in-time asymmetric conformal-style interval scaler.
 * Resolved cases are localized to the current feature state when feature history exists;
 * legacy rows without features fall back to regime/global weighting instead of being discarded.
 */
export class ForecastIntervalCalibrationMemory {
    maxRows;
    rows = [];
    keys = new Set();
    constructor(maxRows = 100_000) {
        this.maxRows = maxRows;
    }
    add(row) { const key = row.id ?? `${row.symbol}:${row.horizonMs}:${row.resolvedAt}:${row.median.toFixed(8)}`; if (this.keys.has(key))
        return; if (!valid(row))
        return; this.rows.push(structuredClone(row)); this.keys.add(key); this.rows.sort((a, b) => a.resolvedAt - b.resolvedAt); if (this.rows.length > this.maxRows) {
        const removed = this.rows.splice(0, this.rows.length - this.maxRows);
        for (const r of removed)
            this.keys.delete(r.id ?? `${r.symbol}:${r.horizonMs}:${r.resolvedAt}:${r.median.toFixed(8)}`);
    } }
    addMany(rows) { for (const r of rows)
        this.add(r); }
    all() { return this.rows.map(r => structuredClone(r)); }
    calibrate(params) {
        const o = params.options, target = clamp(o.targetCoverage, .5, .99), base = this.rows.filter(r => r.symbol === params.symbol && r.horizonMs === params.horizonMs && r.resolvedAt <= params.asOf && valid(r));
        const same = params.regimeId ? base.filter(r => r.regimeId === params.regimeId) : [];
        let selected = same.length >= Math.max(10, Math.floor(o.minCases / 2)) ? same : base;
        const raw = { lower: Math.min(params.raw.lower, params.raw.median), median: params.raw.median, upper: Math.max(params.raw.upper, params.raw.median) };
        if (!selected.length)
            return { status: 'INSUFFICIENT', sampleCount: 0, effectiveSamples: 0, targetCoverage: target, empiricalRawCoverage: 0, empiricalAdjustedCoverage: 0, scaleFactor: 1, meanSimilarity: 0, raw, adjusted: { ...raw } };
        const featureIds = (o.featureIds ?? []).filter(id => Number.isFinite(params.features?.[id]));
        const localizable = featureIds.length > 0 && selected.filter(r => featureIds.every(id => Number.isFinite(r.features?.[id]))).length >= Math.max(10, Math.floor(o.minCases / 2));
        const scales = {};
        if (localizable)
            for (const id of featureIds)
                scales[id] = robustScale(selected.map(r => r.features?.[id]).filter(Number.isFinite));
        const candidates = selected.map(r => {
            let similarity = 1;
            if (localizable && featureIds.every(id => Number.isFinite(r.features?.[id]))) {
                let n = 0, d = 0;
                for (const id of featureIds) {
                    const conf = clamp(params.featureConfidence?.[id] ?? 1, 0, 1), z = ((params.features?.[id] ?? 0) - (r.features?.[id] ?? 0)) / (scales[id] ?? 1);
                    n += conf * z * z;
                    d += conf;
                }
                const distance = Math.sqrt(n / Math.max(EPS, d));
                similarity = Math.exp(-.5 * (distance / Math.max(.05, o.bandwidth ?? 1.5)) ** 2);
            }
            if (params.regimeId && r.regimeId === params.regimeId)
                similarity = Math.min(1, similarity * 1.08);
            else if (params.regimeId && r.regimeId)
                similarity *= .88;
            const age = Math.max(0, params.asOf - r.resolvedAt), rec = o.recencyHalfLifeMs > 0 ? Math.pow(2, -age / o.recencyHalfLifeMs) : 1, weight = rec * clamp(r.quality ?? 1, 0, 1) * similarity ** 2;
            return { r, similarity, weight };
        }).filter(x => x.weight > EPS).sort((a, b) => b.similarity - a.similarity).slice(0, Math.max(1, o.topK ?? 300));
        selected = candidates.map(x => x.r);
        const ws = candidates.map(x => x.weight), e = ess(ws), meanSimilarity = candidates.length ? weightedMean(candidates.map(x => x.similarity), ws) : 0;
        if (!selected.length)
            return { status: 'INSUFFICIENT', sampleCount: 0, effectiveSamples: 0, targetCoverage: target, empiricalRawCoverage: 0, empiricalAdjustedCoverage: 0, scaleFactor: 1, meanSimilarity: 0, raw, adjusted: { ...raw } };
        const qLevel = Math.min(.995, target + 1 / (selected.length + 1)), scale = clamp(weightedQuantile(selected.map(r => ratioScore(r)), ws, qLevel), o.minScale, o.maxScale);
        const adjusted = { lower: raw.median - scale * Math.max(EPS, raw.median - raw.lower), median: raw.median, upper: raw.median + scale * Math.max(EPS, raw.upper - raw.median) };
        const rawCoverage = weightedMean(selected.map(r => covered(r, 1) ? 1 : 0), ws), adjustedCoverage = weightedMean(selected.map(r => covered(r, scale) ? 1 : 0), ws);
        let status = selected.length >= o.minCases && e >= o.minEffectiveSamples ? 'ACTIVE' : 'INSUFFICIENT';
        if (status === 'ACTIVE' && (adjustedCoverage < target - o.undercoverageTolerance || (scale >= o.maxScale * .999 && adjustedCoverage < target)))
            status = 'WATCH';
        return { status, sampleCount: selected.length, effectiveSamples: e, targetCoverage: target, empiricalRawCoverage: rawCoverage, empiricalAdjustedCoverage: adjustedCoverage, scaleFactor: scale, meanSimilarity, raw, adjusted };
    }
}