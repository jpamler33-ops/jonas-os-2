import { clamp } from '../utils/math.js';
const EPS = 1e-12;
function median(xs) { if (!xs.length)
    return 0; const s = [...xs].sort((a, b) => a - b), m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : ((s[m - 1] ?? 0) + (s[m] ?? 0)) / 2; }
function quantile(xs, q) { if (!xs.length)
    return 0; const s = [...xs].sort((a, b) => a - b), i = clamp(q, 0, 1) * (s.length - 1), lo = Math.floor(i), hi = Math.ceil(i); return (s[lo] ?? 0) + ((s[hi] ?? 0) - (s[lo] ?? 0)) * (i - lo); }
function robustStep(xs) { if (xs.length < 3)
    return 1; const m = median(xs), mad = median(xs.map(x => Math.abs(x - m))); const r = 1.4826 * mad; return r > EPS ? r : Math.max(EPS, (quantile(xs, .9) - quantile(xs, .1)) / 2.563); }
/** Model sensitivity analysis only. It must not be interpreted as causal effect estimation. */
export function analyzeForecastCounterfactuals(engine, input, base, o = {}) {
    const cfg = engine.configSnapshot(), history = engine.historySnapshot(input.asOf).filter(r => r.symbol === input.symbol), baseReport = base ?? engine.forecast(input), warnings = [], cases = [];
    const ids = (o.featureIds ?? cfg.featureIds).filter(id => Number.isFinite(input.features[id])).slice(0, o.maxFeatures ?? 12);
    for (const id of ids) {
        const xs = history.map(r => r.features[id]).filter((x) => Number.isFinite(x));
        if (xs.length < 10) {
            warnings.push(`${id}: insufficient historical feature support`);
            continue;
        }
        const step = robustStep(xs) * Math.max(.05, o.stepScale ?? 1), lo = quantile(xs, o.supportLowQuantile ?? .01), hi = quantile(xs, o.supportHighQuantile ?? .99), v = input.features[id];
        for (const side of ['LOWER', 'HIGHER']) {
            const raw = v + (side === 'HIGHER' ? step : -step), pv = clamp(raw, lo, hi), clamped = Math.abs(pv - raw) > EPS, perturbed = { ...input, features: { ...input.features, [id]: pv } }, r = engine.forecast(perturbed), impacts = baseReport.forecasts.map((b, i) => { const p = r.forecasts[i] ?? b; const probabilityShift = .5 * (Math.abs(p.probabilities.up - b.probabilities.up) + Math.abs(p.probabilities.down - b.probabilities.down) + Math.abs(p.probabilities.flat - b.probabilities.flat)); return { horizonId: b.horizonId, baseDirection: b.direction, perturbedDirection: p.direction, probabilityShift, expectedReturnShift: p.expectedReturn - b.expectedReturn, confidenceShift: p.operationalConfidence - b.operationalConfidence, gateChanged: p.gate !== b.gate }; }), maxImpact = Math.max(0, ...impacts.map(x => Math.max(x.probabilityShift, Math.min(1, Math.abs(x.expectedReturnShift) / Math.max(.001, Math.abs(baseReport.forecasts.find(f => f.horizonId === x.horizonId)?.flatThreshold ?? .001))))));
            cases.push({ featureId: id, direction: side, baseValue: v, perturbedValue: pv, robustStep: step, clampedToHistoricalSupport: clamped, maxImpact, impacts });
        }
    }
    const rankedFeatures = [...new Set(cases.map(c => c.featureId))].map(featureId => ({ featureId, maxImpact: Math.max(...cases.filter(c => c.featureId === featureId).map(c => c.maxImpact)) })).sort((a, b) => b.maxImpact - a.maxImpact);
    return { interpretation: 'MODEL_SENSITIVITY_NOT_CAUSAL', asOf: input.asOf, symbol: input.symbol, cases, rankedFeatures, warnings };
}