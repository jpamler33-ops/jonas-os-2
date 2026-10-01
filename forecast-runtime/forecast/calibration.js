import { clamp, weightedMean } from '../utils/math.js';
function effectiveSampleSize(weights) {
    const s = weights.reduce((a, b) => a + b, 0);
    const s2 = weights.reduce((a, b) => a + b * b, 0);
    return s2 <= 1e-12 ? 0 : s * s / s2;
}
function normalize(p) {
    const up = Math.max(0, p.up), down = Math.max(0, p.down), flat = Math.max(0, p.flat);
    const s = up + down + flat;
    return s <= 1e-12 ? { up: 1 / 3, down: 1 / 3, flat: 1 / 3 } : { up: up / s, down: down / s, flat: flat / s };
}
function probabilityBin(raw, bins) {
    const count = Math.max(3, Math.floor(bins));
    const p = clamp(raw, 0, 1);
    const index = Math.min(count - 1, Math.floor(p * count));
    return { index, lo: index / count, hi: (index + 1) / count };
}
function actualDirection(r) {
    return r.actualReturn > r.flatThreshold ? 'UP' : r.actualReturn < -r.flatThreshold ? 'DOWN' : 'FLAT';
}
function pFor(r, k) {
    if (k === 'up')
        return r.predictedUp;
    if (k === 'down')
        return r.predictedDown;
    return r.predictedFlat;
}
function oneHot(dir, k) {
    return (dir === 'UP' && k === 'up') || (dir === 'DOWN' && k === 'down') || (dir === 'FLAT' && k === 'flat') ? 1 : 0;
}
export class ProbabilityCalibrationMemory {
    maxRows;
    rows = [];
    keys = new Set();
    constructor(maxRows = 100_000) {
        this.maxRows = maxRows;
    }
    add(row) {
        const key = row.id ?? `${row.symbol}:${row.horizonMs}:${row.resolvedAt}:${row.predictedUp.toFixed(8)}`;
        if (this.keys.has(key))
            return;
        this.rows.push(structuredClone(row));
        this.keys.add(key);
        this.rows.sort((a, b) => a.resolvedAt - b.resolvedAt);
        if (this.rows.length > this.maxRows) {
            const removed = this.rows.splice(0, this.rows.length - this.maxRows);
            for (const r of removed)
                this.keys.delete(r.id ?? `${r.symbol}:${r.horizonMs}:${r.resolvedAt}:${r.predictedUp.toFixed(8)}`);
        }
    }
    addMany(rows) { for (const r of rows)
        this.add(r); }
    all() { return this.rows.map(r => structuredClone(r)); }
    calibrate(params) {
        const raw = clamp(params.rawUp, 0.001, 0.999);
        const bins = Math.max(3, Math.floor(params.options.bins));
        const bin = Math.min(bins - 1, Math.floor(raw * bins));
        const lo = bin / bins, hi = (bin + 1) / bins;
        const eligible = this.rows.filter(r => r.symbol === params.symbol && r.horizonMs === params.horizonMs &&
            r.resolvedAt <= params.asOf && r.predictedUp >= lo && (bin === bins - 1 ? r.predictedUp <= hi : r.predictedUp < hi) &&
            Number.isFinite(r.actualReturn) && Number.isFinite(r.predictedUp));
        const sameRegime = params.regimeId ? eligible.filter(r => r.regimeId === params.regimeId) : [];
        const selected = sameRegime.length >= Math.max(10, Math.floor(params.options.minCases / 2)) ? sameRegime : eligible;
        const ws = selected.map(r => {
            const age = Math.max(0, params.asOf - r.resolvedAt);
            const recency = params.options.recencyHalfLifeMs > 0 ? Math.pow(2, -age / params.options.recencyHalfLifeMs) : 1;
            return recency * clamp(r.quality ?? 1, 0, 1);
        });
        const ys = selected.map(r => r.actualReturn > r.flatThreshold ? 1 : 0);
        const ess = effectiveSampleSize(ws);
        const empirical = ws.length ? weightedMean(ys, ws) : raw;
        const prior = Math.max(0, params.options.priorStrength);
        const weightSum = ws.reduce((a, b) => a + b, 0);
        const calibrated = clamp((empirical * weightSum + raw * prior) / Math.max(1e-12, weightSum + prior), 0.001, 0.999);
        const brier = selected.length ? weightedMean(selected.map((r, i) => (ys[i] - clamp(r.predictedUp, 0, 1)) ** 2), ws) : undefined;
        const gap = Math.abs(calibrated - raw);
        const status = ess >= params.options.minCases
            ? (gap <= 0.12 && (brier ?? 1) <= 0.25 ? 'CALIBRATED' : 'WATCH')
            : 'INSUFFICIENT';
        return { status, rawUp: raw, calibratedUp: calibrated, sampleCount: selected.length, effectiveSamples: ess, empiricalUp: empirical, calibrationGap: gap, brierScore: brier };
    }
    /**
     * Calibrates UP/DOWN/FLAT independently from point-in-time rows, then projects back to the simplex.
     * If only legacy UP rows exist, falls back to the v1 UP calibrator without inventing DOWN/FLAT labels.
     */
    calibrateDirectional(params) {
        const raw = normalize(params.raw);
        const bins = Math.max(3, Math.floor(params.options.bins));
        const full = this.rows.filter(r => r.symbol === params.symbol && r.horizonMs === params.horizonMs && r.resolvedAt <= params.asOf &&
            Number.isFinite(r.predictedUp) && Number.isFinite(r.predictedDown) && Number.isFinite(r.predictedFlat) && Number.isFinite(r.actualReturn));
        if (!full.length) {
            const legacy = this.calibrate({ symbol: params.symbol, horizonMs: params.horizonMs, regimeId: params.regimeId, rawUp: raw.up, asOf: params.asOf, options: params.options });
            const remain = 1 - legacy.calibratedUp, nonUp = Math.max(1e-12, raw.down + raw.flat);
            const calibrated = normalize({ up: legacy.calibratedUp, down: remain * raw.down / nonUp, flat: remain * raw.flat / nonUp });
            const targetEffectiveSamples = Math.max(1, Number(params.options.minCases) || 1);
            const withBin = (k, row) => {
                const bin = probabilityBin(raw[k], bins);
                return { ...row, probabilityBinIndex: bin.index, probabilityBinLo: bin.lo, probabilityBinHi: bin.hi, targetEffectiveSamples, effectiveSampleDeficit: Math.max(0, targetEffectiveSamples - Number(row.effectiveSamples || 0)) };
            };
            const empty = (k, r, c) => withBin(k, { raw: r, calibrated: c, empirical: r, meanPredicted: r, calibrationGap: Math.abs(c - r), sampleCount: 0, effectiveSamples: 0 });
            return {
                status: legacy.status,
                method: 'LEGACY_UP_ONLY',
                raw,
                calibrated,
                sampleCount: legacy.sampleCount,
                effectiveSamples: legacy.effectiveSamples,
                maxClassGap: legacy.calibrationGap,
                multiclassBrier: legacy.brierScore,
                targetEffectiveSamples,
                bins,
                perClass: {
                    up: withBin('up', { raw: raw.up, calibrated: calibrated.up, empirical: legacy.empiricalUp, meanPredicted: raw.up, calibrationGap: legacy.calibrationGap, sampleCount: legacy.sampleCount, effectiveSamples: legacy.effectiveSamples }),
                    down: empty('down', raw.down, calibrated.down),
                    flat: empty('flat', raw.flat, calibrated.flat)
                }
            };
        }
        const classes = ['up', 'down', 'flat'];
        const ev = {};
        const adjusted = { up: raw.up, down: raw.down, flat: raw.flat };
        let minEss = Infinity, maxGap = 0, minSelected = Infinity;
        for (const k of classes) {
            const rp = raw[k], bin = Math.min(bins - 1, Math.floor(rp * bins)), lo = bin / bins, hi = (bin + 1) / bins;
            const eligible = full.filter(r => { const p = pFor(r, k); return p >= lo && (bin === bins - 1 ? p <= hi : p < hi); });
            const same = params.regimeId ? eligible.filter(r => r.regimeId === params.regimeId) : [];
            const selected = same.length >= Math.max(10, Math.floor(params.options.minCases / 2)) ? same : eligible;
            const ws = selected.map(r => { const age = Math.max(0, params.asOf - r.resolvedAt); const rec = params.options.recencyHalfLifeMs > 0 ? Math.pow(2, -age / params.options.recencyHalfLifeMs) : 1; return rec * clamp(r.quality ?? 1, 0, 1); });
            const ys = selected.map(r => oneHot(actualDirection(r), k));
            const ps = selected.map(r => clamp(pFor(r, k), 0, 1));
            const ess = effectiveSampleSize(ws), sum = ws.reduce((a, b) => a + b, 0), empirical = selected.length ? weightedMean(ys, ws) : rp, meanPred = selected.length ? weightedMean(ps, ws) : rp;
            const prior = Math.max(0, params.options.priorStrength);
            const c = clamp((empirical * sum + rp * prior) / Math.max(1e-12, sum + prior), .001, .999);
            adjusted[k] = c;
            const gap = Math.abs(c - rp);
            minEss = Math.min(minEss, ess);
            maxGap = Math.max(maxGap, gap);
            minSelected = Math.min(minSelected, selected.length);
            ev[k] = {
                raw: rp,
                calibrated: c,
                empirical,
                meanPredicted: meanPred,
                calibrationGap: gap,
                sampleCount: selected.length,
                effectiveSamples: ess,
                probabilityBinIndex: bin,
                probabilityBinLo: lo,
                probabilityBinHi: hi,
                targetEffectiveSamples: Math.max(1, Number(params.options.minCases) || 1),
                effectiveSampleDeficit: Math.max(0, Math.max(1, Number(params.options.minCases) || 1) - ess)
            };
        }
        const calibrated = normalize(adjusted);
        for (const k of classes) {
            ev[k] = { ...ev[k], calibrated: calibrated[k], calibrationGap: Math.abs(calibrated[k] - raw[k]) };
            maxGap = Math.max(maxGap, ev[k].calibrationGap);
        }
        const globalRows = params.regimeId && full.filter(r => r.regimeId === params.regimeId).length >= params.options.minCases ? full.filter(r => r.regimeId === params.regimeId) : full;
        const gws = globalRows.map(r => { const age = Math.max(0, params.asOf - r.resolvedAt); return (params.options.recencyHalfLifeMs > 0 ? Math.pow(2, -age / params.options.recencyHalfLifeMs) : 1) * clamp(r.quality ?? 1, 0, 1); });
        const briers = globalRows.map(r => { const p = normalize({ up: r.predictedUp, down: r.predictedDown, flat: r.predictedFlat }); const a = actualDirection(r); return (p.up - (a === 'UP' ? 1 : 0)) ** 2 + (p.down - (a === 'DOWN' ? 1 : 0)) ** 2 + (p.flat - (a === 'FLAT' ? 1 : 0)) ** 2; });
        const logs = globalRows.map(r => { const p = normalize({ up: r.predictedUp, down: r.predictedDown, flat: r.predictedFlat }); const a = actualDirection(r); const hit = a === 'UP' ? p.up : a === 'DOWN' ? p.down : p.flat; return -Math.log(Math.max(1e-9, hit)); });
        const multiclassBrier = globalRows.length ? weightedMean(briers, gws) : undefined, logLoss = globalRows.length ? weightedMean(logs, gws) : undefined;
        const ess = Number.isFinite(minEss) ? minEss : 0;
        const status = ess < params.options.minCases ? 'INSUFFICIENT' : (maxGap <= .12 && (multiclassBrier ?? 2) <= .75 ? 'CALIBRATED' : 'WATCH');
        return {
            status,
            method: 'TRICLASS_EMPIRICAL',
            raw,
            calibrated,
            sampleCount: Number.isFinite(minSelected) ? minSelected : 0,
            effectiveSamples: ess,
            maxClassGap: maxGap,
            multiclassBrier,
            logLoss,
            targetEffectiveSamples: Math.max(1, Number(params.options.minCases) || 1),
            bins,
            perClass: { up: ev.up, down: ev.down, flat: ev.flat }
        };
    }
}