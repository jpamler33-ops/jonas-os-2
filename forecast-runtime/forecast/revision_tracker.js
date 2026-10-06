import { assessForecastInvalidation } from './invalidation.js';
export class ForecastRevisionTracker {
    options;
    records = new Map();
    maxRecords;
    maxRevisionsPerRecord;
    constructor(options = {}) {
        this.options = options;
        this.maxRecords = Math.max(100, Math.floor(options.maxRecords ?? 5000));
        this.maxRevisionsPerRecord = Math.max(16, Math.floor(options.maxRevisionsPerRecord ?? 256));
    }
    trimRevisions(record) {
        if (!record || !Array.isArray(record.revisions) || record.revisions.length <= this.maxRevisionsPerRecord)
            return;
        record.revisions.splice(0, record.revisions.length - this.maxRevisionsPerRecord);
    }
    trim() {
        for (const r of this.records.values())
            this.trimRevisions(r);
        if (this.records.size <= this.maxRecords)
            return;
        const rows = [...this.records.values()].sort((a, b) => {
            const ae = a.status === 'ACTIVE' ? 1 : 0;
            const be = b.status === 'ACTIVE' ? 1 : 0;
            return ae - be || a.issuedAt - b.issuedAt;
        });
        const remove = Math.max(0, this.records.size - this.maxRecords);
        for (const r of rows.slice(0, remove))
            this.records.delete(r.id);
    }
    issue(input, report) {
        if (input.symbol !== report.forecast.symbol || input.asOf !== report.forecast.asOf)
            throw new Error('issue input/report mismatch');
        const id = `${input.symbol}:${input.asOf}`;
        if (this.records.has(id))
            return id;
        const expiresAt = input.asOf + Math.max(0, ...report.forecast.forecasts.map(f => f.horizonMs));
        this.records.set(id, { id, symbol: input.symbol, issuedAt: input.asOf, expiresAt, issuePrice: input.price, issueRegimeId: input.regimeId, report: structuredClone(report.forecast), transitionAtIssue: structuredClone(report.regimeTransition), issueState: structuredClone(input), revisions: [], thesisMemory: null, status: 'ACTIVE' });
        this.trim();
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
        if (!prev || current.asOf > prev.timestamp) {
            r.revisions.push({ timestamp: current.asOf, price: current.price, regimeId: current.regimeId, assessment });
            this.trimRevisions(r);
        }
        if (assessment.status === 'INVALIDATED')
            r.status = 'INVALIDATED';
        changed.push(structuredClone(r));
    } return changed; }
    bindThesis(id, memory) {
        const r = this.records.get(id);
        if (!r)
            throw new Error('unknown forecast id: ' + id);
        if (r.thesisMemory) {
            if (r.thesisMemory.fingerprint !== memory?.fingerprint)
                throw new Error('forecast thesis memory binding mismatch');
            return structuredClone(r);
        }
        r.thesisMemory = structuredClone(memory);
        return structuredClone(r);
    }
    updateThesisMemory(id, memory) {
        const r = this.records.get(id);
        if (!r)
            throw new Error('unknown forecast id: ' + id);
        if (!r.thesisMemory)
            throw new Error('forecast thesis memory not bound');
        if (
            r.thesisMemory.issueGraphFingerprint &&
            memory?.issueGraphFingerprint &&
            r.thesisMemory.issueGraphFingerprint !== memory.issueGraphFingerprint
        )
            throw new Error('forecast thesis issue graph mismatch');
        r.thesisMemory = structuredClone(memory);
        return structuredClone(r);
    }
    get(id) { const x = this.records.get(id); return x ? structuredClone(x) : undefined; }
    stateIndex() {
        return [...this.records.values()].map(r => ({
            id: r.id,
            status: r.status,
            revisionCount: r.revisions.length,
            symbol: r.symbol,
            issuedAt: r.issuedAt,
            expiresAt: r.expiresAt,
            hasThesisMemory: Boolean(r.thesisMemory)
        }));
    }
    thesisMemories() {
        return [...this.records.values()]
            .filter(r => r.thesisMemory)
            .map(r => structuredClone(r.thesisMemory));
    }
    lightweightStats() {
        let thesisMemoryCount = 0;
        let thesisRevisionEvents = 0;
        let staleThesisForecasts = 0;
        let transientFlickerThesisForecasts = 0;
        let persistentStaleThesisForecasts = 0;
        let thesisStabilityEvents = 0;
        for (const r of this.records.values()) {
            const memory = r.thesisMemory;
            if (!memory) continue;
            thesisMemoryCount++;
            thesisRevisionEvents += Number(memory.eventCount || 0);
            thesisStabilityEvents += Number(memory.stabilityEventCount || 0);
            const assumptions = memory.assumptions || [];
            if (assumptions.some(a => a?.issueSupported === true && a?.currentSupported === false))
                staleThesisForecasts++;
            if (assumptions.some(a => a?.stability?.state === 'TRANSIENT_FLICKER'))
                transientFlickerThesisForecasts++;
            if (assumptions.some(a =>
                a?.stability?.state === 'PERSISTENT_STALE' || a?.stability?.state === 'RECOVERING'
            ))
                persistentStaleThesisForecasts++;
        }
        return {
            recordCount: this.records.size,
            thesisMemoryCount,
            thesisRevisionEvents,
            staleThesisForecasts,
            transientFlickerThesisForecasts,
            persistentStaleThesisForecasts,
            thesisStabilityEvents
        };
    }
    all() { return [...this.records.values()].map(x => structuredClone(x)); }
    snapshot() { return { version: 1, records: this.all() }; }
    restore(s) { if (s.version !== 1)
        throw new Error('unsupported revision snapshot version'); this.records.clear(); for (const r of s.records) {
        const copy = structuredClone(r);
        this.trimRevisions(copy);
        this.records.set(copy.id, copy);
    } this.trim(); }
}