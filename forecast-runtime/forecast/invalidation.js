import { clamp } from '../utils/math.js';
function interpolate(report, elapsed) {
    const fs = [...report.forecasts].sort((a, b) => a.horizonMs - b.horizonMs);
    if (!fs.length)
        return { expected: 0, lower: 0, upper: 0 };
    const points = [{ t: 0, e: 0, ld: 0, ud: 0 }, ...fs.map(f => ({ t: f.horizonMs, e: f.expectedReturn, ld: Math.max(0, f.expectedReturn - f.interval.q10), ud: Math.max(0, f.interval.q90 - f.expectedReturn) }))];
    if (elapsed >= points.at(-1).t) {
        const x = points.at(-1);
        return { expected: x.e, lower: x.e - x.ld, upper: x.e + x.ud };
    }
    let b = points[1], a = points[0];
    for (let i = 1; i < points.length; i++) {
        if (elapsed <= points[i].t) {
            a = points[i - 1];
            b = points[i];
            break;
        }
    }
    const q = clamp((elapsed - a.t) / Math.max(1, b.t - a.t), 0, 1), expected = a.e + (b.e - a.e) * q;
    // Interpolate variance proxies rather than interval width linearly. This avoids an
    // unrealistically narrow live envelope immediately after issue (diffusion ~ sqrt(t)).
    const ld = Math.sqrt(Math.max(0, a.ld * a.ld + (b.ld * b.ld - a.ld * a.ld) * q));
    const ud = Math.sqrt(Math.max(0, a.ud * a.ud + (b.ud * b.ud - a.ud * a.ud) * q));
    return { expected, lower: expected - ld, upper: expected + ud };
}
export function assessForecastInvalidation(original, current, transitionAtIssue, o = {}) {
    const reasons = [], warnings = [];
    if (current.symbol !== original.symbol)
        return { status: 'INSUFFICIENT', score: 1, elapsedMs: 0, realizedReturn: 0, expectedReturn: 0, lowerReturn: 0, upperReturn: 0, envelopeBreach: 0, regimeChanged: false, hardGuardActive: false, reasons: ['symbol mismatch'], warnings };
    const elapsed = current.asOf - original.asOf;
    if (elapsed < 0)
        return { status: 'INSUFFICIENT', score: 1, elapsedMs: elapsed, realizedReturn: 0, expectedReturn: 0, lowerReturn: 0, upperReturn: 0, envelopeBreach: 0, regimeChanged: false, hardGuardActive: false, reasons: ['current state predates original forecast'], warnings };
    const env = interpolate(original, elapsed), realized = current.price / original.price - 1, width = Math.max(1e-6, env.upper - env.lower), outside = realized < env.lower ? env.lower - realized : realized > env.upper ? realized - env.upper : 0, envelopeBreach = outside / width;
    const watch = o.watchBreach ?? .20, hard = o.hardBreach ?? .75;
    let score = clamp(envelopeBreach / Math.max(hard, 1e-6), 0, 1);
    if (envelopeBreach >= hard)
        reasons.push('realized path materially breached the issued forecast envelope');
    else if (envelopeBreach >= watch)
        reasons.push('realized path is outside the issued forecast envelope');
    const issueRegime = transitionAtIssue?.currentRegime, regimeChanged = !!issueRegime && !!current.regimeId && current.regimeId !== issueRegime;
    let observedRegimeProbability;
    if (regimeChanged && transitionAtIssue) {
        observedRegimeProbability = transitionAtIssue.probabilities.find(x => x.regimeId === current.regimeId)?.probability ?? 0;
        const cutoff = o.unexpectedRegimeProbability ?? .12;
        if (observedRegimeProbability < cutoff) {
            score = Math.max(score, .85);
            reasons.push('unexpected regime transition invalidates original state assumptions');
        }
        else {
            score = Math.max(score, .4);
            warnings.push('market regime changed since forecast issue');
        }
    }
    const hardGuardActive = (current.guards ?? []).some(g => g.status === 'ABSTAIN');
    if (hardGuardActive) {
        score = 1;
        reasons.push('a current upstream safety guard is ABSTAIN');
    }
    if (current.dataQuality < (o.minDataQuality ?? .7)) {
        score = Math.max(score, .9);
        reasons.push('current data quality is below live-invalidation policy');
    }
    const maxH = Math.max(0, ...original.forecasts.map(f => f.horizonMs));
    if (elapsed > maxH)
        warnings.push('original forecast horizon has fully elapsed');
    const status = score >= .8 ? 'INVALIDATED' : score >= .35 ? 'WATCH' : 'VALID';
    return { status, score, elapsedMs: elapsed, realizedReturn: realized, expectedReturn: env.expected, lowerReturn: env.lower, upperReturn: env.upper, envelopeBreach, regimeChanged, observedRegimeProbability, hardGuardActive, reasons, warnings };
}