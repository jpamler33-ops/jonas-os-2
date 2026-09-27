import { clamp, weightedMean } from '../utils/math.js';
const EPS = 1e-12;
function ess(ws) { const s = ws.reduce((a, b) => a + b, 0), s2 = ws.reduce((a, b) => a + b * b, 0); return s2 <= EPS ? 0 : s * s / s2; }
export class ForecastModelPerformanceMemory {
    maxRows;
    rows = [];
    keys = new Set();
    constructor(maxRows = 200_000) {
        this.maxRows = maxRows;
    }
    add(row) { const key = row.id ?? `${row.symbol}:${row.horizonMs}:${row.modelId}:${row.resolvedAt}`; if (this.keys.has(key))
        return; this.rows.push(structuredClone(row)); this.keys.add(key); this.rows.sort((a, b) => a.resolvedAt - b.resolvedAt); if (this.rows.length > this.maxRows) {
        const removed = this.rows.splice(0, this.rows.length - this.maxRows);
        for (const r of removed)
            this.keys.delete(r.id ?? `${r.symbol}:${r.horizonMs}:${r.modelId}:${r.resolvedAt}`);
    } }
    addMany(rows) { for (const r of rows)
        this.add(r); }
    all() { return this.rows.map(r => structuredClone(r)); }
    query(params) {
        const eligible = this.rows.filter(r => r.symbol === params.symbol && r.horizonMs === params.horizonMs && r.modelId === params.modelId && r.resolvedAt <= params.asOf);
        const same = params.regimeId ? eligible.filter(r => r.regimeId === params.regimeId) : [];
        const selected = same.length >= Math.max(10, Math.floor(params.options.minCases / 2)) ? same : eligible;
        const ws = selected.map(r => { const age = Math.max(0, params.asOf - r.resolvedAt), rec = params.options.recencyHalfLifeMs > 0 ? Math.pow(2, -age / params.options.recencyHalfLifeMs) : 1; return rec * clamp(r.quality ?? 1, 0, 1); });
        const e = ess(ws);
        if (!selected.length)
            return { modelId: params.modelId, status: 'INSUFFICIENT', count: 0, effectiveSamples: 0, meanBrier: 0, climatologyBrier: 0, meanLogLoss: 0, climatologyLogLoss: 0, brierSkill: 0, logSkill: 0, meanAbsoluteReturnError: 0, weightMultiplier: 1 };
        const den = ws.reduce((a, b) => a + b, 0) || 1;
        const base = { up: 0, down: 0, flat: 0 };
        for (let i = 0; i < selected.length; i++) {
            const w = ws[i] ?? 0, d = selected[i].actualDirection;
            if (d === 'UP')
                base.up += w;
            else if (d === 'DOWN')
                base.down += w;
            else
                base.flat += w;
        }
        base.up /= den;
        base.down /= den;
        base.flat /= den;
        const climBriers = selected.map(r => (base.up - (r.actualDirection === 'UP' ? 1 : 0)) ** 2 + (base.down - (r.actualDirection === 'DOWN' ? 1 : 0)) ** 2 + (base.flat - (r.actualDirection === 'FLAT' ? 1 : 0)) ** 2);
        const climLogs = selected.map(r => -Math.log(Math.max(1e-9, r.actualDirection === 'UP' ? base.up : r.actualDirection === 'DOWN' ? base.down : base.flat)));
        const meanBrier = weightedMean(selected.map(r => r.brier), ws), climatologyBrier = Math.max(EPS, weightedMean(climBriers, ws)), meanLogLoss = weightedMean(selected.map(r => r.logLoss), ws), climatologyLogLoss = Math.max(EPS, weightedMean(climLogs, ws));
        const brierSkill = clamp(1 - meanBrier / climatologyBrier, -2, 1), logSkill = clamp(1 - meanLogLoss / climatologyLogLoss, -2, 1), skill = .65 * brierSkill + .35 * logSkill;
        let status = e >= params.options.minEffectiveSamples && selected.length >= params.options.minCases ? 'ACTIVE' : 'INSUFFICIENT';
        let weightMultiplier = status === 'ACTIVE' ? clamp(Math.exp(.9 * skill), .35, 1.6) : 1;
        if (status === 'ACTIVE' && skill < -.35 && e >= params.options.minEffectiveSamples * 2) {
            status = 'QUARANTINED';
            weightMultiplier = .25;
        }
        return { modelId: params.modelId, status, count: selected.length, effectiveSamples: e, meanBrier, climatologyBrier, meanLogLoss, climatologyLogLoss, brierSkill, logSkill, meanAbsoluteReturnError: weightedMean(selected.map(r => r.absoluteReturnError), ws), weightMultiplier };
    }
}