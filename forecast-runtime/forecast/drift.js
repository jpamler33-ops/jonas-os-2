import { clamp, mean, weightedMean } from '../utils/math.js';
function median(xs) { if (!xs.length)
    return 0; const s = [...xs].sort((a, b) => a - b), m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : ((s[m - 1] ?? 0) + (s[m] ?? 0)) / 2; }
function mad(xs) { if (xs.length < 3)
    return 1; const m = median(xs); return Math.max(.05, 1.4826 * median(xs.map(x => Math.abs(x - m)))); }
function independentReverse(rows, gapMs, limit, before = Infinity) {
    const src = rows.filter(r => r.resolvedAt < before).sort((a, b) => b.resolvedAt - a.resolvedAt), out = [];
    let last = Infinity;
    for (const r of src) {
        if (last - r.resolvedAt < gapMs)
            continue;
        out.push(r);
        last = r.resolvedAt;
        if (out.length >= limit)
            break;
    }
    return out.reverse();
}
function metric(rows, fn) { const ws = rows.map(r => clamp(r.quality ?? 1, 0, 1)); return rows.length ? weightedMean(rows.map(fn), ws) : 0; }
/** Confidence ECE of the selected class, weighted by sample quality. */
function ece(rows, bins = 5) {
    if (!rows.length)
        return 0;
    let total = 0, error = 0;
    for (let b = 0; b < bins; b++) {
        const lo = b / bins, hi = (b + 1) / bins, part = rows.filter(r => r.topProbability >= lo && (b === bins - 1 ? r.topProbability <= hi : r.topProbability < hi));
        if (!part.length)
            continue;
        const ws = part.map(r => clamp(r.quality ?? 1, 0, 1)), w = ws.reduce((a, x) => a + x, 0);
        if (w <= 0)
            continue;
        const conf = weightedMean(part.map(r => clamp(r.topProbability, 0, 1)), ws), acc = weightedMean(part.map(r => r.topCorrect ? 1 : 0), ws);
        error += w * Math.abs(conf - acc);
        total += w;
    }
    return total > 0 ? error / total : 0;
}
/** Detects resolved-performance and feature-distribution degradation using only point-in-time available outcomes. */
export class ForecastDriftMemory {
    maxRows;
    rows = [];
    keys = new Set();
    constructor(maxRows = 150_000) {
        this.maxRows = maxRows;
    }
    add(row) { const key = row.id ?? `${row.symbol}:${row.horizonMs}:${row.resolvedAt}`; if (this.keys.has(key))
        return; this.rows.push(structuredClone(row)); this.keys.add(key); this.rows.sort((a, b) => a.resolvedAt - b.resolvedAt); if (this.rows.length > this.maxRows) {
        const removed = this.rows.splice(0, this.rows.length - this.maxRows);
        for (const r of removed)
            this.keys.delete(r.id ?? `${r.symbol}:${r.horizonMs}:${r.resolvedAt}`);
    } }
    addMany(rows) { for (const r of rows)
        this.add(r); }
    all() { return this.rows.map(r => structuredClone(r)); }
    query(input, o) {
        const eligible = this.rows.filter(r => r.symbol === input.symbol && r.horizonMs === o.horizonMs && r.resolvedAt <= o.asOf), same = input.regimeId ? eligible.filter(r => r.regimeId === input.regimeId) : [];
        const need = o.minRecentIndependent + o.minBaselineIndependent, pool = same.length >= need ? same : eligible, recent = independentReverse(pool, Math.max(1, o.horizonMs), Math.max(o.recentCases, o.minRecentIndependent)), cutoff = recent[0]?.resolvedAt ?? Infinity, baseline = independentReverse(pool, Math.max(1, o.horizonMs), Math.max(o.baselineCases, o.minBaselineIndependent), cutoff);
        const blank = { status: 'INSUFFICIENT', score: 0, recentIndependentCases: recent.length, baselineIndependentCases: baseline.length, recentBrier: 0, baselineBrier: 0, brierRatio: 1, recentLogLoss: 0, baselineLogLoss: 0, logLossRatio: 1, recentEce: 0, baselineEce: 0, eceDelta: 0, recentIntervalMissRate: 0, baselineIntervalMissRate: 0, recentHighConfidenceWrongRate: 0, baselineHighConfidenceWrongRate: 0, featureShiftScore: 0 };
        if (recent.length < o.minRecentIndependent || baseline.length < o.minBaselineIndependent)
            return blank;
        const rb = metric(recent, r => r.brier), bb = metric(baseline, r => r.brier), rl = metric(recent, r => r.logLoss), bl = metric(baseline, r => r.logLoss), re = ece(recent), be = ece(baseline), eceDelta = re - be, ri = metric(recent, r => r.intervalMiss ? 1 : 0), bi = metric(baseline, r => r.intervalMiss ? 1 : 0);
        const rh = metric(recent, r => r.topProbability >= o.highConfidenceThreshold && !r.topCorrect ? 1 : 0), bh = metric(baseline, r => r.topProbability >= o.highConfidenceThreshold && !r.topCorrect ? 1 : 0);
        const shifts = [];
        for (const id of o.featureIds) {
            const b = baseline.map(r => r.features[id]).filter(Number.isFinite), rr = recent.map(x => x.features[id]).filter(Number.isFinite);
            if (b.length >= 3 && rr.length >= 3)
                shifts.push(Math.min(5, Math.abs(median(rr) - median(b)) / mad(b)));
        }
        const featureShiftScore = shifts.length ? clamp(mean(shifts) / 3, 0, 1) : 0;
        const brierD = clamp((rb - bb) / .25, 0, 1), logD = clamp((rl - bl) / .50, 0, 1), intervalD = clamp((ri - bi) / .20, 0, 1), wrongD = clamp((rh - bh) / .20, 0, 1), eceD = clamp(eceDelta / .15, 0, 1);
        const score = clamp(.25 * brierD + .15 * logD + .20 * intervalD + .15 * wrongD + .15 * eceD + .10 * featureShiftScore, 0, 1), brierRatio = rb / Math.max(.03, bb), logLossRatio = rl / Math.max(.05, bl);
        const hard = score >= o.hardScore || (brierRatio >= 1.75 && rb - bb > .12) || (ri - bi > .25) || eceDelta > .20, status = hard ? 'DRIFT' : score >= o.watchScore ? 'WATCH' : 'STABLE';
        return { status, score, recentIndependentCases: recent.length, baselineIndependentCases: baseline.length, recentBrier: rb, baselineBrier: bb, brierRatio, recentLogLoss: rl, baselineLogLoss: bl, logLossRatio, recentEce: re, baselineEce: be, eceDelta, recentIntervalMissRate: ri, baselineIntervalMissRate: bi, recentHighConfidenceWrongRate: rh, baselineHighConfidenceWrongRate: bh, featureShiftScore };
    }
}