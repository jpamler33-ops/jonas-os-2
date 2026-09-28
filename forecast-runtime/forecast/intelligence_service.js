import { analyzeForecastCounterfactuals } from './counterfactual.js';
import { ForecastIntelligenceLayer } from './intelligence.js';
import { ForecastRevisionTracker } from './revision_tracker.js';
/**
 * Stateful orchestration layer for bot/live integration.
 * It does not place orders and cannot switch execution out of SHADOW_ONLY.
 */
export class ForecastIntelligenceService {
    engine;
    layer;
    tracker;
    maxAuditEvents;
    audit = [];
    sequence = 0;
    constructor(engine, options = {}) {
        this.engine = engine;
        this.layer = new ForecastIntelligenceLayer(engine, options.intelligence);
        this.tracker = new ForecastRevisionTracker({
            ...(options.invalidation ?? {}),
            maxRecords: options.maxTrackerRecords ?? 1200,
        });
        this.maxAuditEvents = Math.max(100, Math.floor(options.maxAuditEvents ?? 1_000));
    }
    issue(input) {
        const report = this.layer.issue(input);
        const expectedId = `${input.symbol}:${input.asOf}`;
        const existed = this.tracker.get(expectedId);
        const forecastId = this.tracker.issue(input, report);
        if (!existed) {
            this.emit('FORECAST_ISSUED', input.asOf, input.symbol, forecastId, {
                horizons: report.forecast.forecasts.length,
                pathCoherence: report.forecast.path.coherence,
                regimeTransitionStatus: report.regimeTransition.status,
                executionMode: report.executionMode,
            });
        }
        return { forecastId, report };
    }
    observe(input) {
        const before = new Map(this.tracker.all().map(r => [r.id, { status: r.status, revisions: r.revisions.length }]));
        const changed = this.tracker.observe(input);
        for (const record of changed) {
            const prior = before.get(record.id);
            const revision = record.revisions.at(-1);
            if (revision && (!prior || record.revisions.length > prior.revisions)) {
                this.emit('OBSERVATION_RECORDED', revision.timestamp, record.symbol, record.id, {
                    assessment: revision.assessment.status,
                    score: revision.assessment.score,
                    realizedReturn: revision.assessment.realizedReturn,
                    regimeChanged: revision.assessment.regimeChanged,
                });
            }
            if (prior?.status !== record.status && record.status === 'INVALIDATED') {
                this.emit('FORECAST_INVALIDATED', input.asOf, record.symbol, record.id, {
                    score: revision?.assessment.score ?? 1,
                    reasonCount: revision?.assessment.reasons.length ?? 0,
                });
            }
            if (prior?.status !== record.status && record.status === 'EXPIRED') {
                this.emit('FORECAST_EXPIRED', input.asOf, record.symbol, record.id, {
                    revisions: record.revisions.length,
                });
            }
        }
        return changed;
    }
    counterfactual(forecastId, options = {}) {
        const record = this.tracker.get(forecastId);
        if (!record)
            throw new Error(`unknown forecast id: ${forecastId}`);
        if (!record.issueState)
            throw new Error('forecast snapshot predates issue-state persistence; counterfactual unavailable');
        const report = analyzeForecastCounterfactuals(this.engine, record.issueState, record.report, options);
        this.emit('COUNTERFACTUAL_ANALYZED', record.issueState.asOf, record.symbol, record.id, {
            cases: report.cases.length,
            rankedFeatures: report.rankedFeatures.length,
            interpretation: report.interpretation,
        });
        return report;
    }
    get(forecastId) { return this.tracker.get(forecastId); }
    all() { return this.tracker.all(); }
    auditTrail(limit = this.maxAuditEvents) {
        const n = Math.max(0, Math.floor(limit));
        return structuredClone(n ? this.audit.slice(-n) : []);
    }
    snapshot() {
        return { version: 1, sequence: this.sequence, tracker: this.tracker.snapshot(), audit: this.auditTrail(this.maxAuditEvents) };
    }
    restore(snapshot, restoredAt = Date.now()) {
        if (snapshot.version !== 1)
            throw new Error('unsupported intelligence service snapshot version');
        this.tracker.restore(snapshot.tracker);
        this.sequence = Math.max(0, Math.floor(snapshot.sequence));
        this.audit = structuredClone(snapshot.audit).slice(-this.maxAuditEvents);
        this.emit('STATE_RESTORED', restoredAt, '*', undefined, {
            records: this.tracker.all().length,
            priorAuditEvents: snapshot.audit.length,
        });
    }
    emit(type, timestamp, symbol, forecastId, details) {
        this.sequence += 1;
        this.audit.push({
            eventId: `FIA-${this.sequence}`,
            type,
            timestamp,
            symbol,
            forecastId,
            details: structuredClone(details),
        });
        if (this.audit.length > this.maxAuditEvents)
            this.audit.splice(0, this.audit.length - this.maxAuditEvents);
    }
}