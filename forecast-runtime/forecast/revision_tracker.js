import { assessForecastInvalidation } from './invalidation.js';
export class ForecastRevisionTracker {
    options;
    records = new Map();
    constructor(options = {}) {
        this.options = options;
    }
    issue(input, report) {
        if (input.symbol !== report.forecast.symbol || input.asOf !== report.forecast.asOf)
            throw new Error('issue input/report mismatch');
        const id = `${input.symbol}:${input.asOf}`;
        if (this.records.has(id))
            return id;
        const expiresAt = input.asOf + Math.max(0, ...report.forecast.forecasts.map(f => f.horizonMs));
        this.records.set(id, { id, symbol: input.symbol, issuedAt: input.asOf, expiresAt, issuePrice: input.price, issueRegimeId: input.regimeId, report: structuredClone(report.forecast), transitionAtIssue: structuredClone(report.regimeTransition), issueState: structuredClone(input), revisions: [], status: 'ACTIVE' });
        return id;
    }
    observe(current) { const changed = []; for (const r of this.records.values()) {
        if (r.symbol !== current.symbol || current.asOf < r.issuedAt || r.status === 'EXPIRED')
            continue;
        if (current.asOf > r.expiresAt) {
            if (r.status === 'ACTIVE') {
                r.status = 'EXPIRED';
                changed.push(structuredClone(r));
            }
            continue;
        }
        const assessment = assessForecastInvalidation(r.report, current, r.transitionAtIssue, this.options);
        const prev = r.revisions.at(-1);
        if (!prev || current.asOf > prev.timestamp)
            r.revisions.push({ timestamp: current.asOf, price: current.price, regimeId: current.regimeId, assessment });
        if (assessment.status === 'INVALIDATED')
            r.status = 'INVALIDATED';
        changed.push(structuredClone(r));
    } return changed; }
    get(id) { const x = this.records.get(id); return x ? structuredClone(x) : undefined; }
    all() { return [...this.records.values()].map(x => structuredClone(x)); }
    snapshot() { return { version: 1, records: this.all() }; }
    restore(s) { if (s.version !== 1)
        throw new Error('unsupported revision snapshot version'); this.records.clear(); for (const r of s.records)
        this.records.set(r.id, structuredClone(r)); }
}