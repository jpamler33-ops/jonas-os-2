import { mean } from '../utils/math.js';
function empty() { return { count: 0, directionalAccuracy: 0, multiclassBrier: 0, logLoss: 0, meanAbsoluteReturnError: 0, intervalCoverage: 0, highConfidenceWrongRate: 0, meanOperationalConfidence: 0 }; }
function metrics(entries, highConfidenceThreshold = .65) {
    const rows = entries.filter(e => e.status === 'RESOLVED' && e.resolution);
    if (!rows.length)
        return empty();
    return {
        count: rows.length,
        directionalAccuracy: mean(rows.map(e => e.resolution.topCorrect ? 1 : 0)),
        multiclassBrier: mean(rows.map(e => e.resolution.brier)),
        logLoss: mean(rows.map(e => e.resolution.logLoss)),
        meanAbsoluteReturnError: mean(rows.map(e => e.resolution.absoluteReturnError)),
        intervalCoverage: mean(rows.map(e => e.resolution.intervalMiss ? 0 : 1)),
        highConfidenceWrongRate: mean(rows.map(e => Math.max(e.probabilities.up, e.probabilities.down, e.probabilities.flat) >= highConfidenceThreshold && !e.resolution.topCorrect ? 1 : 0)),
        meanOperationalConfidence: mean(rows.map(e => e.operationalConfidence))
    };
}
/** Pure evaluation of forecasts that were already generated point-in-time. No retrospective refitting. */
export function evaluateForecastJournal(entries, highConfidenceThreshold = .65) {
    const overall = metrics(entries, highConfidenceThreshold);
    const actionable = metrics(entries.filter(e => e.gate === 'PASS' || e.gate === 'CAUTION'), highConfidenceThreshold);
    const ids = [...new Set(entries.map(e => e.horizonId))];
    const byHorizon = {};
    for (const id of ids)
        byHorizon[id] = metrics(entries.filter(e => e.horizonId === id), highConfidenceThreshold);
    return { overall, actionable, byHorizon, selectiveBrierImprovement: overall.count && actionable.count ? overall.multiclassBrier - actionable.multiclassBrier : 0, resolvedCount: entries.filter(e => e.status === 'RESOLVED').length, pendingCount: entries.filter(e => e.status === 'PENDING').length, expiredCount: entries.filter(e => e.status === 'EXPIRED').length };
}
/** Chronological, non-overlapping test folds over already point-in-time forecasts. */
export function evaluateWalkForwardJournal(entries, opts = {}) {
    const rows = entries.filter(e => e.status === 'RESOLVED' && e.resolution).sort((a, b) => a.asOf - b.asOf);
    const size = Math.max(1, Math.floor(opts.foldSize ?? 50));
    const out = [];
    for (let i = 0, fold = 0; i < rows.length; i += size, fold++) {
        const part = rows.slice(i, i + size);
        if (!part.length)
            continue;
        out.push({ fold, startAsOf: part[0].asOf, endAsOf: part.at(-1).asOf, metrics: metrics(part, opts.highConfidenceThreshold ?? .65) });
    }
    return out;
}