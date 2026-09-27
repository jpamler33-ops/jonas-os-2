import { clamp } from '../utils/math.js';
import { evaluateForecastJournal } from './evaluation.js';
function normalize(p) { const u = Math.max(0, p.up), d = Math.max(0, p.down), f = Math.max(0, p.flat), s = u + d + f; return s <= 1e-12 ? { up: 1 / 3, down: 1 / 3, flat: 1 / 3 } : { up: u / s, down: d / s, flat: f / s }; }
function direction(ret, flat) { return ret > flat ? 'UP' : ret < -flat ? 'DOWN' : 'FLAT'; }
function topDirection(p) { return p.up >= p.down && p.up >= p.flat ? 'UP' : p.down >= p.up && p.down >= p.flat ? 'DOWN' : 'FLAT'; }
function score(p0, actual) { const p = normalize(p0); const yu = actual === 'UP' ? 1 : 0, yd = actual === 'DOWN' ? 1 : 0, yf = actual === 'FLAT' ? 1 : 0; const brier = (p.up - yu) ** 2 + (p.down - yd) ** 2 + (p.flat - yf) ** 2; const hit = actual === 'UP' ? p.up : actual === 'DOWN' ? p.down : p.flat; return { brier, logLoss: -Math.log(Math.max(1e-9, hit)), topCorrect: topDirection(p) === actual }; }
/**
 * Online feedback loop. Record a point-in-time forecast once, then feed future prices via observe().
 * Outcomes are resolved only after dueAt, and only then enter calibration/reliability memory.
 */
export class ForecastLearningJournal {
    engine;
    entries = [];
    keys = new Set();
    maxEntries;
    maxResolutionDelayRatio;
    learnStatuses;
    constructor(engine, opts = {}) {
        this.engine = engine;
        this.maxEntries = Math.max(100, opts.maxEntries ?? 100_000);
        this.maxResolutionDelayRatio = Math.max(0, opts.maxResolutionDelayRatio ?? .25);
        this.learnStatuses = new Set(opts.learnStatuses ?? ['PASS', 'CAUTION']);
    }
    record(input, report) {
        if (report.symbol !== input.symbol || report.asOf !== input.asOf)
            throw new Error('forecast report/input mismatch');
        const ids = [];
        for (const f of report.forecasts) {
            const id = `${report.symbol}:${report.asOf}:${f.horizonId}`;
            ids.push(id);
            if (this.keys.has(id))
                continue;
            const e = { id, symbol: report.symbol, horizonId: f.horizonId, horizonMs: f.horizonMs, flatThreshold: f.flatThreshold, asOf: report.asOf, dueAt: report.asOf + f.horizonMs, startPrice: report.price, regimeId: input.regimeId, features: structuredClone(input.features), dataQuality: input.dataQuality, gate: f.gate, direction: f.direction, probabilities: structuredClone(f.probabilities), expectedReturn: f.expectedReturn, interval: { q10: f.interval.q10, q90: f.interval.q90 }, rawInterval: { q10: f.rawInterval.q10, q90: f.rawInterval.q90, median: f.rawInterval.median }, operationalConfidence: f.operationalConfidence, models: structuredClone(f.models), runningMaxAdverseReturn: 0, runningMaxFavorableReturn: 0, status: 'PENDING' };
            this.entries.push(e);
            this.keys.add(id);
        }
        this.entries.sort((a, b) => a.asOf - b.asOf);
        this.trim();
        return ids;
    }
    observe(point) {
        if (!Number.isFinite(point.timestamp) || !Number.isFinite(point.price) || point.price <= 0)
            throw new Error('valid point required');
        const resolved = [];
        for (const e of this.entries) {
            if (e.status !== 'PENDING' || e.symbol !== point.symbol || point.timestamp < e.asOf)
                continue;
            const ret = point.price / e.startPrice - 1;
            e.runningMaxAdverseReturn = Math.min(e.runningMaxAdverseReturn, ret);
            e.runningMaxFavorableReturn = Math.max(e.runningMaxFavorableReturn, ret);
            if (point.timestamp < e.dueAt)
                continue;
            if (point.timestamp - e.dueAt > e.horizonMs * this.maxResolutionDelayRatio) {
                e.status = 'EXPIRED';
                continue;
            }
            const actualDirection = direction(ret, e.flatThreshold), s = score(e.probabilities, actualDirection), intervalMiss = ret < e.interval.q10 || ret > e.interval.q90;
            const resolution = { resolvedAt: point.timestamp, resolvedPrice: point.price, actualReturn: ret, actualDirection, maxAdverseReturn: e.runningMaxAdverseReturn, maxFavorableReturn: e.runningMaxFavorableReturn, brier: s.brier, logLoss: s.logLoss, absoluteReturnError: Math.abs(ret - e.expectedReturn), intervalMiss, topCorrect: s.topCorrect };
            e.resolution = resolution;
            e.status = 'RESOLVED';
            resolved.push(structuredClone(e));
            this.feedResolved(e, point.quality ?? 1);
        }
        return resolved;
    }
    feedResolved(e, quality = 1) {
        if (e.status !== 'RESOLVED' || !e.resolution)
            return;
        const r = e.resolution, q = clamp(quality * e.dataQuality, 0, 1);
        // Drift is monitoring, not model fitting: keep observing every resolved shadow forecast so a drift ABSTAIN can later recover.
        this.engine.drift.add({ id: e.id, symbol: e.symbol, horizonMs: e.horizonMs, resolvedAt: r.resolvedAt, regimeId: e.regimeId, features: structuredClone(e.features), brier: r.brier, logLoss: r.logLoss, intervalMiss: r.intervalMiss, topProbability: Math.max(e.probabilities.up, e.probabilities.down, e.probabilities.flat), topCorrect: r.topCorrect, quality: q });
        if (!this.learnStatuses.has(e.gate))
            return;
        this.engine.calibration.add({ id: e.id, symbol: e.symbol, horizonMs: e.horizonMs, regimeId: e.regimeId, predictedUp: e.probabilities.up, predictedDown: e.probabilities.down, predictedFlat: e.probabilities.flat, actualReturn: r.actualReturn, flatThreshold: e.flatThreshold, resolvedAt: r.resolvedAt, quality: q });
        this.engine.reliability.add({ id: e.id, symbol: e.symbol, horizonMs: e.horizonMs, resolvedAt: r.resolvedAt, regimeId: e.regimeId, features: structuredClone(e.features), predicted: structuredClone(e.probabilities), actualDirection: r.actualDirection, brier: r.brier, logLoss: r.logLoss, absoluteReturnError: r.absoluteReturnError, intervalMiss: r.intervalMiss, topProbability: Math.max(e.probabilities.up, e.probabilities.down, e.probabilities.flat), topCorrect: r.topCorrect, quality: q });
        const raw = e.rawInterval ?? { q10: e.interval.q10, q90: e.interval.q90, median: e.expectedReturn };
        this.engine.intervalCalibration.add({ id: e.id, symbol: e.symbol, horizonMs: e.horizonMs, regimeId: e.regimeId, median: raw.median, lower: raw.q10, upper: raw.q90, actualReturn: r.actualReturn, features: structuredClone(e.features), resolvedAt: r.resolvedAt, quality: q });
        for (const m of e.models) {
            const p = { up: m.pUp, down: m.pDown, flat: m.pFlat }, ms = score(p, r.actualDirection);
            this.engine.modelPerformance.add({ id: `${e.id}:${m.modelId}`, symbol: e.symbol, horizonMs: e.horizonMs, resolvedAt: r.resolvedAt, regimeId: e.regimeId, modelId: m.modelId, predicted: p, expectedReturn: m.expectedReturn, actualDirection: r.actualDirection, actualReturn: r.actualReturn, brier: ms.brier, logLoss: ms.logLoss, absoluteReturnError: Math.abs(r.actualReturn - m.expectedReturn), quality: q });
        }
    }
    all() { return this.entries.map(e => structuredClone(e)); }
    pending() { return this.entries.filter(e => e.status === 'PENDING').map(e => structuredClone(e)); }
    report() { return evaluateForecastJournal(this.entries); }
    snapshot() { return { version: 3, entries: this.all() }; }
    restore(snapshot, opts = {}) {
        if (snapshot.version !== 2 && snapshot.version !== 3)
            throw new Error('unsupported forecast journal snapshot version');
        this.entries = [];
        this.keys.clear();
        for (const e of snapshot.entries) {
            if (this.keys.has(e.id))
                continue;
            const copy = structuredClone(e);
            this.entries.push(copy);
            this.keys.add(copy.id);
        }
        this.entries.sort((a, b) => a.asOf - b.asOf);
        this.trim();
        if (opts.rehydrateLearningMemory ?? true)
            for (const e of this.entries)
                this.feedResolved(e, 1);
    }
    trim() { if (this.entries.length <= this.maxEntries)
        return; const n = this.entries.length - this.maxEntries; const removed = this.entries.splice(0, n); for (const e of removed)
        this.keys.delete(e.id); }
}