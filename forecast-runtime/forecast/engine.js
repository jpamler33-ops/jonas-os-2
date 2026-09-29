import { clamp, mean, weightedMean } from '../utils/math.js';
import { ProbabilityCalibrationMemory } from './calibration.js';
import { ForecastReliabilityMemory } from './reliability.js';
import { ForecastModelPerformanceMemory } from './model_performance.js';
import { ForecastIntervalCalibrationMemory } from './interval_calibration.js';
import { ForecastDriftMemory } from './drift.js';
import { buildCrossHorizonPathForecast } from './path_engine.js';
const EPS = 1e-12;
function std(xs) { if (xs.length < 2)
    return 0; const m = mean(xs); return Math.sqrt(mean(xs.map(x => (x - m) ** 2))); }
function weightedStd(xs, ws, m = weightedMean(xs, ws)) { const den = ws.reduce((a, b) => a + b, 0); return den <= EPS ? 0 : Math.sqrt(xs.reduce((s, x, i) => s + (ws[i] ?? 0) * (x - m) ** 2, 0) / den); }
function effectiveSampleSize(ws) { const s = ws.reduce((a, b) => a + b, 0), s2 = ws.reduce((a, b) => a + b * b, 0); return s2 <= EPS ? 0 : s * s / s2; }
function median(xs) { if (!xs.length)
    return 0; const s = [...xs].sort((a, b) => a - b), m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : ((s[m - 1] ?? 0) + (s[m] ?? 0)) / 2; }
function robustScale(xs) { if (xs.length < 3)
    return 1; const m = median(xs), mad = median(xs.map(x => Math.abs(x - m))); return Math.max(.05, 1.4826 * mad); }
function normalCdf(x) { const t = 1 / (1 + 0.2316419 * Math.abs(x)); const d = 0.3989422804014327 * Math.exp(-x * x / 2); const p = 1 - d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429)))); return x >= 0 ? p : 1 - p; }
function weightedQuantile(xs, ws, q) {
    if (!xs.length)
        return 0;
    const pairs = xs.map((x, i) => ({ x, w: Math.max(0, ws[i] ?? 0) })).sort((a, b) => a.x - b.x);
    const total = pairs.reduce((s, p) => s + p.w, 0);
    if (total <= EPS) {
        const i = Math.round(clamp(q, 0, 1) * (pairs.length - 1));
        return pairs[i]?.x ?? 0;
    }
    const target = clamp(q, 0, 1) * total;
    let c = 0;
    for (const p of pairs) {
        c += p.w;
        if (c >= target)
            return p.x;
    }
    return pairs.at(-1)?.x ?? 0;
}
function normalize(p) { const up = Math.max(0, p.up), down = Math.max(0, p.down), flat = Math.max(0, p.flat), s = up + down + flat; return s <= EPS ? { up: 1 / 3, down: 1 / 3, flat: 1 / 3 } : { up: up / s, down: down / s, flat: flat / s }; }
function entropy(p) { const a = [p.up, p.down, p.flat]; return clamp(-a.reduce((s, x) => s + (x > EPS ? x * Math.log(x) : 0), 0) / Math.log(3), 0, 1); }
function kl(a, b) { return a.reduce((s, x, i) => s + (x > EPS ? x * Math.log(x / Math.max(EPS, b[i] ?? EPS)) : 0), 0); }
function jsd(a, b) { const aa = [a.up, a.down, a.flat], bb = [b.up, b.down, b.flat], m = aa.map((x, i) => (x + (bb[i] ?? 0)) / 2); return .5 * kl(aa, m) + .5 * kl(bb, m); }
function solveLinear(a, b) {
    const n = b.length;
    const m = a.map((r, i) => [...r, b[i] ?? 0]);
    for (let col = 0; col < n; col++) {
        let pivot = col;
        for (let r = col + 1; r < n; r++)
            if (Math.abs(m[r]?.[col] ?? 0) > Math.abs(m[pivot]?.[col] ?? 0))
                pivot = r;
        if (Math.abs(m[pivot]?.[col] ?? 0) < 1e-10)
            return null;
        [m[col], m[pivot]] = [m[pivot], m[col]];
        const pv = m[col][col];
        for (let j = col; j <= n; j++)
            m[col][j] = (m[col][j] ?? 0) / pv;
        for (let r = 0; r < n; r++) {
            if (r === col)
                continue;
            const f = m[r]?.[col] ?? 0;
            for (let j = col; j <= n; j++)
                m[r][j] = (m[r][j] ?? 0) - f * (m[col][j] ?? 0);
        }
    }
    return m.map(r => r[n] ?? 0);
}
function fitRidgeCore(rows, featureIds, lambda, weights) {
    if (rows.length < Math.max(8, featureIds.length + 3))
        return null;
    const means = featureIds.map(id => weightedMean(rows.map(r => r.features[id] ?? 0), weights));
    const scales = featureIds.map((id, j) => Math.max(1e-6, weightedStd(rows.map(r => r.features[id] ?? 0), weights, means[j])));
    const p = featureIds.length + 1, xtx = Array.from({ length: p }, () => Array(p).fill(0)), xty = Array(p).fill(0);
    for (let i = 0; i < rows.length; i++) {
        const x = [1, ...featureIds.map((id, j) => ((rows[i].features[id] ?? 0) - means[j]) / scales[j])], y = rows[i].forwardReturn, w = Math.max(0, weights[i] ?? 0);
        for (let a = 0; a < p; a++) {
            xty[a] += w * (x[a] ?? 0) * y;
            for (let c = 0; c < p; c++)
                xtx[a][c] += w * (x[a] ?? 0) * (x[c] ?? 0);
        }
    }
    for (let j = 1; j < p; j++)
        xtx[j][j] += Math.max(0, lambda);
    const beta = solveLinear(xtx, xty);
    if (!beta)
        return null;
    return { predict: (features) => beta.reduce((sum, b, j) => sum + b * (j === 0 ? 1 : ((features[featureIds[j - 1]] ?? 0) - means[j - 1]) / scales[j - 1]), 0) };
}
function fitRidge(rows, featureIds, lambda, weights, oosMinCases, holdoutFraction, fallbackInflation) {
    const final = fitRidgeCore(rows, featureIds, lambda, weights);
    if (!final)
        return null;
    const inResiduals = rows.map(r => r.forwardReturn - final.predict(r.features)), inStd = Math.max(1e-6, weightedStd(inResiduals, weights));
    let residualStd = inStd * Math.max(1, fallbackInflation), uncertaintySource = 'IN_SAMPLE_INFLATED', oosResidualCount = 0;
    if (rows.length >= Math.max(oosMinCases, featureIds.length + 12)) {
        const zipped = rows.map((r, i) => ({ r, w: weights[i] ?? 0 })).sort((a, b) => a.r.timestamp - b.r.timestamp);
        const testN = Math.max(5, Math.floor(zipped.length * clamp(holdoutFraction, .1, .4))), split = zipped.length - testN;
        const train = zipped.slice(0, split), test = zipped.slice(split);
        const core = fitRidgeCore(train.map(x => x.r), featureIds, lambda, train.map(x => x.w));
        if (core && test.length >= 5) {
            const rs = test.map(x => x.r.forwardReturn - core.predict(x.r.features)), ws = test.map(x => x.w), oosStd = weightedStd(rs, ws);
            if (Number.isFinite(oosStd) && oosStd > EPS) {
                residualStd = Math.max(1e-6, oosStd, inStd * 1.05);
                uncertaintySource = 'OOS_HOLDOUT';
                oosResidualCount = test.length;
            }
        }
    }
    return { ...final, residualStd, sampleCount: rows.length, uncertaintySource, oosResidualCount };
}
function ridgeComponent(modelId, fit, input, h, weight) {
    const mu = fit.predict(input.features), sd = Math.max(1e-6, fit.residualStd);
    const up = 1 - normalCdf((h.flatThreshold - mu) / sd), down = normalCdf((-h.flatThreshold - mu) / sd), flat = clamp(1 - up - down, 0, 1);
    return { modelId, expectedReturn: mu, residualStd: sd, pUp: up, pDown: down, pFlat: flat, weight, sampleCount: fit.sampleCount, uncertaintySource: fit.uncertaintySource, oosResidualCount: fit.oosResidualCount, performanceMultiplier: 1, effectiveWeight: weight, performanceStatus: 'INSUFFICIENT' };
}
function raiseGate(current, next) {
    const severity = { PASS: 0, CAUTION: 1, INSUFFICIENT: 2, ABSTAIN: 3 };
    return severity[next] > severity[current] ? next : current;
}
function episodeWeights(rows, windowMs) {
    if (!rows.length)
        return [];
    if (windowMs <= 0)
        return rows.map(x => x.weight);
    const sorted = [...rows].sort((a, b) => a.row.timestamp - b.row.timestamp);
    const out = [];
    let start = sorted[0].row.timestamp, sum = 0;
    for (const x of sorted) {
        if (x.row.timestamp - start >= windowMs) {
            out.push(sum);
            start = x.row.timestamp;
            sum = 0;
        }
        sum += x.weight;
    }
    out.push(sum);
    return out;
}
function dependencyAdjustedWeights(rows, base, windowMs) {
    if (windowMs <= 0 || rows.length < 2)
        return base;
    const order = rows.map((r, i) => ({ r, i })).sort((a, b) => a.r.timestamp - b.r.timestamp);
    const result = [...base];
    let g = [];
    let start = order[0]?.r.timestamp ?? 0;
    const flush = () => { const n = Math.max(1, g.length); for (const idx of g)
        result[idx] = (result[idx] ?? 0) / n; g = []; };
    for (const x of order) {
        if (g.length && x.r.timestamp - start >= windowMs) {
            flush();
            start = x.r.timestamp;
        }
        if (!g.length)
            start = x.r.timestamp;
        g.push(x.i);
    }
    flush();
    return result;
}
export class ProbabilisticForecastEngine {
    history = [];
    historyKeys = new Set();
    maxHistoryRows;
    duplicateHistoryCasesBlocked = 0;
    calibration = new ProbabilityCalibrationMemory();
    reliability = new ForecastReliabilityMemory();
    modelPerformance = new ForecastModelPerformanceMemory();
    intervalCalibration = new ForecastIntervalCalibrationMemory();
    drift = new ForecastDriftMemory();
    cfg;
    constructor(config, opts = {}) {
        if (!config.featureIds.length)
            throw new Error('featureIds required');
        if (!config.horizons.length)
            throw new Error('horizons required');
        this.cfg = { ...config, featureWeights: config.featureWeights ?? {},
            ridgeLambda: config.ridgeLambda ?? 1, ridgeOosMinCases: config.ridgeOosMinCases ?? 40, ridgeOosHoldoutFraction: config.ridgeOosHoldoutFraction ?? .20, residualInflationFallback: config.residualInflationFallback ?? 1.25, recencyHalfLifeMs: config.recencyHalfLifeMs ?? 1000 * 60 * 60 * 24 * 30,
            minTrainingCases: config.minTrainingCases ?? 80, minRegimeCases: config.minRegimeCases ?? 30, minAnalogCount: config.minAnalogCount ?? 25,
            minAnalogEffectiveSamples: config.minAnalogEffectiveSamples ?? 10, minAnalogIndependentEpisodes: config.minAnalogIndependentEpisodes ?? 8,
            minDataQuality: config.minDataQuality ?? .8, minRegimeConfidence: config.minRegimeConfidence ?? .55, maxModelDispersion: config.maxModelDispersion ?? .012,
            maxProbabilityDisagreement: config.maxProbabilityDisagreement ?? .18, minNearestSimilarity: config.minNearestSimilarity ?? .18,
            calibrationMinCases: config.calibrationMinCases ?? 40, calibrationBins: config.calibrationBins ?? 10, calibrationPriorStrength: config.calibrationPriorStrength ?? 12,
            reliabilityMinCases: config.reliabilityMinCases ?? 25, reliabilityMinEffectiveSamples: config.reliabilityMinEffectiveSamples ?? 12, reliabilityBandwidth: config.reliabilityBandwidth ?? 1.5,
            maxLocalBrier: config.maxLocalBrier ?? .70, maxHighConfidenceWrongRate: config.maxHighConfidenceWrongRate ?? .30, hardHighConfidenceWrongRate: config.hardHighConfidenceWrongRate ?? .45,
            highConfidenceThreshold: config.highConfidenceThreshold ?? .65, modelPerformanceMinCases: config.modelPerformanceMinCases ?? 30, modelPerformanceMinEffectiveSamples: config.modelPerformanceMinEffectiveSamples ?? 15,
            intervalCalibrationMinCases: config.intervalCalibrationMinCases ?? 30, intervalCalibrationMinEffectiveSamples: config.intervalCalibrationMinEffectiveSamples ?? 15, intervalTargetCoverage: config.intervalTargetCoverage ?? .80, intervalMinScale: config.intervalMinScale ?? .55, intervalMaxScale: config.intervalMaxScale ?? 3, intervalUndercoverageTolerance: config.intervalUndercoverageTolerance ?? .08, intervalBandwidth: config.intervalBandwidth ?? 1.5, intervalTopK: config.intervalTopK ?? 300,
            driftRecentCases: config.driftRecentCases ?? 24, driftBaselineCases: config.driftBaselineCases ?? 60, driftMinRecentIndependent: config.driftMinRecentIndependent ?? 10, driftMinBaselineIndependent: config.driftMinBaselineIndependent ?? 20, driftWatchScore: config.driftWatchScore ?? .35, driftHardScore: config.driftHardScore ?? .65,
            pathMinCompleteTrajectories: config.pathMinCompleteTrajectories ?? 20, pathMinEffectiveSamples: config.pathMinEffectiveSamples ?? 8, pathTopK: config.pathTopK ?? 180, pathMinSimilarity: config.pathMinSimilarity ?? .08, pathMarginalConflictWarn: config.pathMarginalConflictWarn ?? .20, pathMarginalConflictHard: config.pathMarginalConflictHard ?? .35
        };
        this.maxHistoryRows = Math.max(500, Math.floor(Number(opts.maxHistoryRows) || 12_000));
        // Every resolved-memory table is part of the persistent snapshot. Keep
        // their aggregate size bounded instead of relying on generous defaults
        // intended for offline batch runs.
        this.calibration = new ProbabilityCalibrationMemory(opts.maxCalibrationRows ?? 2_000);
        this.reliability = new ForecastReliabilityMemory(opts.maxReliabilityRows ?? 2_000);
        this.modelPerformance = new ForecastModelPerformanceMemory(opts.maxModelPerformanceRows ?? 8_000);
        this.intervalCalibration = new ForecastIntervalCalibrationMemory(opts.maxIntervalCalibrationRows ?? 2_000);
        this.drift = new ForecastDriftMemory(opts.maxDriftRows ?? 2_000);
    }
    trimHistory() {
        if (this.history.length <= this.maxHistoryRows)
            return;
        const removed = this.history.splice(0, this.history.length - this.maxHistoryRows);
        for (const row of removed)
            this.historyKeys.delete(this.historyKey(row));
    }
    historyKey(r) { return r.id ?? `${r.symbol}:${r.timestamp}:${r.horizonMs}`; }
    addHistory(row) { const k = this.historyKey(row); if (this.historyKeys.has(k)) {
        this.duplicateHistoryCasesBlocked++;
        return;
    } this.history.push(structuredClone(row)); this.historyKeys.add(k); this.history.sort((a, b) => a.timestamp - b.timestamp); this.trimHistory(); }
    addHistoryMany(rows) { let added = false; for (const row of rows) {
        const k = this.historyKey(row);
        if (this.historyKeys.has(k)) {
            this.duplicateHistoryCasesBlocked++;
            continue;
        }
        this.history.push(structuredClone(row));
        this.historyKeys.add(k);
        added = true;
    } if (added) {
        this.history.sort((a, b) => a.timestamp - b.timestamp);
        this.trimHistory();
    } }
    historySize() { return this.history.length; }
    hasHistory(id) { return this.historyKeys.has(String(id)); }
    /** Point-in-time safe copy for diagnostics/intelligence layers. */
    historySnapshot(asOf = Number.POSITIVE_INFINITY, { limit = Number.POSITIVE_INFINITY } = {}) {
        const eligible = this.history.filter(r => r.timestamp <= asOf && r.availableAt <= asOf);
        const n = Number.isFinite(Number(limit)) ? Math.max(0, Math.floor(Number(limit))) : eligible.length;
        return (n === 0 ? [] : eligible.slice(-n)).map(r => structuredClone(r));
    }
    /** Read-only configuration snapshot for compatible intelligence layers. */
    configSnapshot() { return structuredClone(this.cfg); }
    forecast(input) {
        if (!Number.isFinite(input.price) || input.price <= 0)
            throw new Error('positive finite price required');
        if (!Number.isFinite(input.asOf))
            throw new Error('finite asOf required');
        const forecasts = this.cfg.horizons.map(h => this.forecastHorizon(input, h));
        for (let i = 1; i < forecasts.length; i++) {
            const a = forecasts[i - 1], b = forecasts[i];
            const pa = Math.max(a.probabilities.up, a.probabilities.down), pb = Math.max(b.probabilities.up, b.probabilities.down);
            if (a.direction !== b.direction && a.direction !== 'FLAT' && b.direction !== 'FLAT' && pa >= .65 && pb >= .65)
                b.warnings.push(`strong cross-horizon direction flip vs ${a.horizonId}`);
        }
        const path = buildCrossHorizonPathForecast(input, forecasts, this.history, { featureIds: this.cfg.featureIds, featureWeights: this.cfg.featureWeights, recencyHalfLifeMs: this.cfg.recencyHalfLifeMs, minCompleteTrajectories: this.cfg.pathMinCompleteTrajectories, minEffectiveSamples: this.cfg.pathMinEffectiveSamples, topK: this.cfg.pathTopK, minSimilarity: this.cfg.pathMinSimilarity, marginalConflictWarn: this.cfg.pathMarginalConflictWarn, marginalConflictHard: this.cfg.pathMarginalConflictHard });
        if (path.coherence === 'CONFLICT')
            for (const f of forecasts) {
                f.gate = raiseGate(f.gate, 'ABSTAIN');
                f.reasons.push('cross-horizon joint path conflict exceeds hard policy');
                f.operationalConfidence = Math.min(f.operationalConfidence, .20);
            }
        return { symbol: input.symbol, asOf: input.asOf, price: input.price, forecasts, path, executionMode: 'SHADOW_ONLY' };
    }
    forecastHorizon(input, h) {
        let blockedFutureCases = 0, invalidCases = 0;
        const usable = [];
        for (const r of this.history) {
            if (r.symbol !== input.symbol || r.horizonMs !== h.horizonMs)
                continue;
            if (r.timestamp > input.asOf || r.availableAt > input.asOf || r.resolvedAt > input.asOf) {
                blockedFutureCases++;
                continue;
            }
            const valid = this.cfg.featureIds.every(id => Number.isFinite(r.features[id])) && Number.isFinite(r.forwardReturn) && r.availableAt >= r.timestamp && r.resolvedAt >= r.timestamp;
            if (!valid) {
                invalidCases++;
                continue;
            }
            usable.push(r);
        }
        const featureCoverage = this.cfg.featureIds.filter(id => Number.isFinite(input.features[id])).length / this.cfg.featureIds.length;
        const independenceWindow = Math.max(1, h.independenceWindowMs ?? h.horizonMs);
        const search = this.findAnalogs(input, usable, h);
        const analogRows = search.rows;
        const analog = this.summarizeAnalogs(analogRows, h.flatThreshold, independenceWindow, search.nearestSimilarity);
        const models = [];
        if (analogRows.length) {
            models.push({ modelId: 'ANALOG_EMPIRICAL', expectedReturn: analog.expectedReturn, residualStd: Math.max(1e-6, weightedStd(analogRows.map(a => a.row.forwardReturn), analogRows.map(a => a.weight))), pUp: analog.pUp, pDown: analog.pDown, pFlat: analog.pFlat, weight: 1.25, sampleCount: Math.max(1, Math.round(analog.episodeEffectiveSamples)), uncertaintySource: 'EMPIRICAL_ANALOG', oosResidualCount: 0, performanceMultiplier: 1, effectiveWeight: 1.25, performanceStatus: 'INSUFFICIENT' });
        }
        const globalBase = usable.map(r => this.recencyWeight(input.asOf, r.resolvedAt) * clamp(r.quality ?? 1, 0, 1));
        const globalWeights = dependencyAdjustedWeights(usable, globalBase, independenceWindow);
        const globalFit = fitRidge(usable, this.cfg.featureIds, this.cfg.ridgeLambda, globalWeights, this.cfg.ridgeOosMinCases, this.cfg.ridgeOosHoldoutFraction, this.cfg.residualInflationFallback);
        if (globalFit)
            models.push(ridgeComponent('GLOBAL_RIDGE', globalFit, input, h, .8));
        const regimeRows = input.regimeId ? usable.filter(r => r.regimeId === input.regimeId) : [];
        const regimeBase = regimeRows.map(r => this.recencyWeight(input.asOf, r.resolvedAt) * clamp(r.quality ?? 1, 0, 1));
        const regimeWeights = dependencyAdjustedWeights(regimeRows, regimeBase, independenceWindow);
        if (regimeRows.length >= this.cfg.minRegimeCases) {
            const f = fitRidge(regimeRows, this.cfg.featureIds, this.cfg.ridgeLambda, regimeWeights, this.cfg.ridgeOosMinCases, this.cfg.ridgeOosHoldoutFraction, this.cfg.residualInflationFallback);
            if (f)
                models.push(ridgeComponent('REGIME_RIDGE', f, input, h, 1.1));
        }
        if (analogRows.length >= Math.max(12, this.cfg.featureIds.length + 3)) {
            const f = fitRidge(analogRows.map(a => a.row), this.cfg.featureIds, this.cfg.ridgeLambda, analogRows.map(a => a.weight), this.cfg.ridgeOosMinCases, this.cfg.ridgeOosHoldoutFraction, this.cfg.residualInflationFallback);
            if (f)
                models.push(ridgeComponent('LOCAL_RIDGE', f, input, h, 1.0));
        }
        const modelPerformance = models.map(m => this.modelPerformance.query({ symbol: input.symbol, horizonMs: h.horizonMs, regimeId: input.regimeId, modelId: m.modelId, asOf: input.asOf, options: { minCases: this.cfg.modelPerformanceMinCases, minEffectiveSamples: this.cfg.modelPerformanceMinEffectiveSamples, recencyHalfLifeMs: this.cfg.recencyHalfLifeMs } }));
        for (let i = 0; i < models.length; i++) {
            const m = models[i], p = modelPerformance[i];
            m.performanceMultiplier = p.weightMultiplier;
            m.performanceStatus = p.status;
            m.effectiveWeight = m.weight * p.weightMultiplier;
        }
        const mws = models.map(m => m.effectiveWeight * Math.min(1, Math.sqrt(m.sampleCount / Math.max(1, this.cfg.minTrainingCases))));
        const expectedReturn = models.length ? weightedMean(models.map(m => m.expectedReturn), mws) : 0;
        const raw = normalize({ up: models.length ? weightedMean(models.map(m => m.pUp), mws) : 1 / 3, down: models.length ? weightedMean(models.map(m => m.pDown), mws) : 1 / 3, flat: models.length ? weightedMean(models.map(m => m.pFlat), mws) : 1 / 3 });
        const modelDispersion = models.length ? std(models.map(m => m.expectedReturn)) : null;
        const modelProbabilityDisagreement = models.length ? weightedMean(models.map(m => jsd({ up: m.pUp, down: m.pDown, flat: m.pFlat }, raw)), mws) : 1;
        const cal = this.calibration.calibrateDirectional({ symbol: input.symbol, horizonMs: h.horizonMs, regimeId: input.regimeId, raw, asOf: input.asOf, options: { minCases: this.cfg.calibrationMinCases, bins: this.cfg.calibrationBins, priorStrength: this.cfg.calibrationPriorStrength, recencyHalfLifeMs: this.cfg.recencyHalfLifeMs } });
        const probs = cal.calibrated;
        const localReliability = this.reliability.query(input, { featureIds: this.cfg.featureIds, asOf: input.asOf, horizonMs: h.horizonMs, recencyHalfLifeMs: this.cfg.recencyHalfLifeMs, bandwidth: this.cfg.reliabilityBandwidth, minCases: this.cfg.reliabilityMinCases, minEffectiveSamples: this.cfg.reliabilityMinEffectiveSamples, highConfidenceThreshold: this.cfg.highConfidenceThreshold });
        const returns = analogRows.map(a => a.row.forwardReturn), aws = analogRows.map(a => a.weight);
        const fallbackSd = models.length ? weightedMean(models.map(m => m.residualStd), mws) : Math.max(input.volatilityHint ?? .01, .001);
        const q10 = returns.length ? weightedQuantile(returns, aws, .10) : expectedReturn - 1.2816 * fallbackSd;
        const q25 = returns.length ? weightedQuantile(returns, aws, .25) : expectedReturn - .6745 * fallbackSd;
        const med = returns.length ? weightedQuantile(returns, aws, .50) : expectedReturn;
        const q75 = returns.length ? weightedQuantile(returns, aws, .75) : expectedReturn + .6745 * fallbackSd;
        const q90 = returns.length ? weightedQuantile(returns, aws, .90) : expectedReturn + 1.2816 * fallbackSd;
        const rawInterval = { q10, q25, median: med, q75, q90 };
        const intervalCalibration = this.intervalCalibration.calibrate({ symbol: input.symbol, horizonMs: h.horizonMs, regimeId: input.regimeId, asOf: input.asOf, features: input.features, featureConfidence: input.featureConfidence, raw: { lower: q10, median: med, upper: q90 }, options: { minCases: this.cfg.intervalCalibrationMinCases, minEffectiveSamples: this.cfg.intervalCalibrationMinEffectiveSamples, targetCoverage: this.cfg.intervalTargetCoverage, minScale: this.cfg.intervalMinScale, maxScale: this.cfg.intervalMaxScale, undercoverageTolerance: this.cfg.intervalUndercoverageTolerance, recencyHalfLifeMs: this.cfg.recencyHalfLifeMs, featureIds: this.cfg.featureIds, bandwidth: this.cfg.intervalBandwidth, topK: this.cfg.intervalTopK } });
        const adjustedQ10 = Math.min(intervalCalibration.adjusted.lower, q25), adjustedQ90 = Math.max(intervalCalibration.adjusted.upper, q75);
        intervalCalibration.adjusted.lower = adjustedQ10;
        intervalCalibration.adjusted.upper = adjustedQ90;
        const drift = this.drift.query(input, { featureIds: this.cfg.featureIds, horizonMs: h.horizonMs, asOf: input.asOf, recentCases: this.cfg.driftRecentCases, baselineCases: this.cfg.driftBaselineCases, minRecentIndependent: this.cfg.driftMinRecentIndependent, minBaselineIndependent: this.cfg.driftMinBaselineIndependent, watchScore: this.cfg.driftWatchScore, hardScore: this.cfg.driftHardScore, highConfidenceThreshold: this.cfg.highConfidenceThreshold });
        const direction = probs.up >= probs.down && probs.up >= probs.flat ? 'UP' : probs.down >= probs.up && probs.down >= probs.flat ? 'DOWN' : 'FLAT';
        const directionalEntropy = entropy(probs);
        const reasons = [], warnings = [];
        let gate = 'PASS';
        for (const g of input.guards ?? []) {
            if (g.status === 'ABSTAIN') {
                gate = raiseGate(gate, 'ABSTAIN');
                reasons.push(`upstream guard ${g.id} abstained${g.reasons?.length ? `: ${g.reasons.join('; ')}` : ''}`);
            }
            else if (g.status === 'INSUFFICIENT') {
                gate = raiseGate(gate, 'INSUFFICIENT');
                reasons.push(`upstream guard ${g.id} has insufficient evidence`);
            }
            else if (g.status === 'CAUTION')
                warnings.push(`upstream guard ${g.id}: ${g.reasons?.join('; ') || 'caution'}`);
        }
        if (featureCoverage < 1) {
            gate = raiseGate(gate, 'ABSTAIN');
            reasons.push('required forecast features missing');
        }
        if (input.dataQuality < this.cfg.minDataQuality) {
            gate = raiseGate(gate, 'ABSTAIN');
            reasons.push('data quality below forecast policy');
        }
        if ((input.regimeConfidence ?? 0) < this.cfg.minRegimeConfidence) {
            gate = raiseGate(gate, 'CAUTION');
            reasons.push('regime confidence is weak');
        }
        if (usable.length < this.cfg.minTrainingCases) {
            gate = raiseGate(gate, 'INSUFFICIENT');
            reasons.push('insufficient point-in-time training history');
        }
        if (models.length < 2) {
            gate = raiseGate(gate, 'INSUFFICIENT');
            reasons.push('insufficient independent model components');
        }
        if (analog.count < this.cfg.minAnalogCount || analog.effectiveSamples < this.cfg.minAnalogEffectiveSamples) {
            gate = raiseGate(gate, 'CAUTION');
            reasons.push('weak historical analogue support');
        }
        if (analog.episodeEffectiveSamples < this.cfg.minAnalogIndependentEpisodes) {
            gate = raiseGate(gate, 'CAUTION');
            reasons.push('historical support is dominated by overlapping outcome windows');
        }
        if (analog.maxSimilarity < this.cfg.minNearestSimilarity * .5) {
            gate = raiseGate(gate, 'ABSTAIN');
            reasons.push('current state is far outside historical analogue support');
        }
        else if (analog.maxSimilarity < this.cfg.minNearestSimilarity) {
            gate = raiseGate(gate, 'CAUTION');
            reasons.push('current state has weak nearest-neighbour support');
        }
        if (modelDispersion > this.cfg.maxModelDispersion) {
            gate = raiseGate(gate, 'ABSTAIN');
            reasons.push('return-model disagreement exceeds policy');
        }
        if (modelProbabilityDisagreement > this.cfg.maxProbabilityDisagreement) {
            gate = raiseGate(gate, 'ABSTAIN');
            reasons.push('directional probability disagreement exceeds policy');
        }
        if (cal.status === 'INSUFFICIENT') {
            gate = raiseGate(gate, 'CAUTION');
            reasons.push('probability calibration history is insufficient');
        }
        else if (cal.status === 'WATCH') {
            gate = raiseGate(gate, 'CAUTION');
            reasons.push('probability calibration is unstable');
        }
        if (intervalCalibration.status === 'WATCH') {
            gate = raiseGate(gate, 'CAUTION');
            reasons.push('forecast interval calibration shows material undercoverage');
        }
        else if (intervalCalibration.status === 'INSUFFICIENT')
            warnings.push('adaptive interval calibration has insufficient resolved history');
        if (drift.status === 'DRIFT') {
            gate = raiseGate(gate, 'ABSTAIN');
            reasons.push('resolved forecast performance drift exceeds hard policy');
        }
        else if (drift.status === 'WATCH') {
            gate = raiseGate(gate, 'CAUTION');
            reasons.push('resolved forecast performance drift is elevated');
        }
        if (localReliability.status === 'ACTIVE') {
            if (localReliability.highConfidenceWrongRate > this.cfg.hardHighConfidenceWrongRate) {
                gate = raiseGate(gate, 'ABSTAIN');
                reasons.push('local failure memory shows excessive high-confidence errors');
            }
            else if (localReliability.meanBrier > this.cfg.maxLocalBrier || localReliability.highConfidenceWrongRate > this.cfg.maxHighConfidenceWrongRate) {
                gate = raiseGate(gate, 'CAUTION');
                reasons.push('local reliability memory is weak in similar states');
            }
        }
        const quarantinedModels = modelPerformance.filter(x => x.status === 'QUARANTINED').length;
        if (models.length >= 2 && quarantinedModels >= Math.ceil(models.length / 2)) {
            gate = raiseGate(gate, 'CAUTION');
            reasons.push('multiple ensemble components are quarantined by live model-performance memory');
        }
        if ((direction === 'UP' && expectedReturn < -h.flatThreshold) || (direction === 'DOWN' && expectedReturn > h.flatThreshold)) {
            gate = raiseGate(gate, 'CAUTION');
            reasons.push('directional probabilities conflict with expected-return sign');
        }
        if (blockedFutureCases)
            warnings.push(`${blockedFutureCases} future/unresolved history row(s) blocked by PIT firewall`);
        if (invalidCases)
            warnings.push(`${invalidCases} invalid history row(s) rejected`);
        if (this.duplicateHistoryCasesBlocked)
            warnings.push(`${this.duplicateHistoryCasesBlocked} duplicate history row(s) blocked`);
        const supportScore = clamp(Math.min(analog.effectiveSamples / Math.max(1, this.cfg.minAnalogEffectiveSamples * 2), analog.episodeEffectiveSamples / Math.max(1, this.cfg.minAnalogIndependentEpisodes * 2)), 0, 1);
        const dispersionScore = Number.isFinite(modelDispersion) ? clamp(1 - modelDispersion / Math.max(EPS, this.cfg.maxModelDispersion * 1.5), 0, 1) : 0;
        const agreementScore = clamp(1 - modelProbabilityDisagreement / Math.max(EPS, this.cfg.maxProbabilityDisagreement * 1.5), 0, 1);
        const calibrationScore = cal.status === 'CALIBRATED' ? clamp(1 - cal.maxClassGap / .20, 0, 1) : cal.status === 'WATCH' ? .4 : .18;
        const reliabilityScore = localReliability.status === 'ACTIVE' ? localReliability.reliabilityScore : .45;
        const activeModelPerf = modelPerformance.filter(x => x.status !== 'INSUFFICIENT');
        const modelPerfScore = activeModelPerf.length ? clamp(mean(activeModelPerf.map(x => x.weightMultiplier)) / 1.25, 0, 1) : .5;
        const certaintyScore = 1 - directionalEntropy;
        const intervalScore = intervalCalibration.status === 'INSUFFICIENT' ? .5 : clamp(1 - Math.max(0, intervalCalibration.targetCoverage - intervalCalibration.empiricalAdjustedCoverage) / .20, 0, 1);
        const driftScore = drift.status === 'STABLE' ? 1 : drift.status === 'WATCH' ? .45 : drift.status === 'DRIFT' ? 0 : .5;
        let operationalConfidence = clamp(.14 * input.dataQuality + .09 * (input.regimeConfidence ?? 0) + .15 * supportScore + .10 * dispersionScore + .08 * agreementScore + .10 * calibrationScore + .08 * reliabilityScore + .07 * modelPerfScore + .05 * certaintyScore + .07 * intervalScore + .07 * driftScore, 0, 1);
        if (gate === 'CAUTION')
            operationalConfidence = Math.min(operationalConfidence, .60);
        else if (gate === 'INSUFFICIENT')
            operationalConfidence = Math.min(operationalConfidence, .25);
        else if (gate === 'ABSTAIN')
            operationalConfidence = Math.min(operationalConfidence, .20);
        const scenarios = [
            { id: 'UPSIDE', probability: probs.up, targetReturn: q75, targetPrice: input.price * (1 + q75) },
            { id: 'BASE', probability: probs.flat, targetReturn: med, targetPrice: input.price * (1 + med) },
            { id: 'DOWNSIDE', probability: probs.down, targetReturn: q25, targetPrice: input.price * (1 + q25) },
        ];
        return { horizonId: h.id, horizonMs: h.horizonMs, flatThreshold: h.flatThreshold, gate, direction, expectedReturn, probabilities: probs, rawProbabilities: raw, interval: { q10: adjustedQ10, q25, median: med, q75, q90: adjustedQ90 }, rawInterval, intervalCalibration, drift, scenarios, analogs: analog, models, calibration: cal, localReliability, modelPerformance, modelDispersion, probabilityDisagreement: modelProbabilityDisagreement, directionalEntropy, operationalConfidence, reasons, warnings, audit: { asOf: input.asOf, usableTrainingCases: usable.length, blockedFutureCases, invalidCases, duplicateHistoryCasesBlocked: this.duplicateHistoryCasesBlocked, featureCoverage, executionMode: 'SHADOW_ONLY' } };
    }
    recencyWeight(asOf, resolvedAt) { return this.cfg.recencyHalfLifeMs > 0 ? Math.pow(2, -Math.max(0, asOf - resolvedAt) / this.cfg.recencyHalfLifeMs) : 1; }
    findAnalogs(input, rows, h) {
        const bw = Math.max(.05, h.analogBandwidth ?? 1.25), minSim = h.minSimilarity ?? .20, topK = h.topK ?? 250;
        const out = [];
        const scales = Object.fromEntries(this.cfg.featureIds.map(id => [id, robustScale(rows.map(r => r.features[id]))]));
        let nearestSimilarity = 0;
        for (const row of rows) {
            let num = 0, den = 0;
            for (const id of this.cfg.featureIds) {
                const fw = Math.max(0, this.cfg.featureWeights[id] ?? 1);
                const fc = clamp(input.featureConfidence?.[id] ?? 1, 0, 1);
                const w = fw * fc;
                const d = ((input.features[id] ?? 0) - (row.features[id] ?? 0)) / (scales[id] ?? 1);
                num += w * d * d;
                den += w;
            }
            const dist = Math.sqrt(num / Math.max(EPS, den));
            let similarity = Math.exp(-.5 * (dist / bw) ** 2);
            if (input.regimeId && row.regimeId === input.regimeId)
                similarity = Math.min(1, similarity * 1.12);
            else if (input.regimeId && row.regimeId)
                similarity *= .82;
            nearestSimilarity = Math.max(nearestSimilarity, similarity);
            if (similarity < minSim)
                continue;
            const weight = similarity ** 2 * this.recencyWeight(input.asOf, row.resolvedAt) * clamp(row.quality ?? 1, 0, 1);
            if (weight > EPS)
                out.push({ row, similarity, weight });
        }
        const selected = out.sort((a, b) => b.similarity - a.similarity).slice(0, topK);
        const adjusted = dependencyAdjustedWeights(selected.map(x => x.row), selected.map(x => x.weight), Math.max(1, h.independenceWindowMs ?? h.horizonMs));
        return { rows: selected.map((x, i) => ({ ...x, weight: adjusted[i] ?? x.weight })), nearestSimilarity };
    }
    summarizeAnalogs(rows, flat, independenceWindowMs, nearestSimilarity) {
        if (!rows.length)
            return { count: 0, effectiveSamples: 0, independentEpisodes: 0, episodeEffectiveSamples: 0, meanSimilarity: 0, maxSimilarity: nearestSimilarity, oodScore: 1 - nearestSimilarity, expectedReturn: 0, medianReturn: 0, q10: 0, q25: 0, q75: 0, q90: 0, pUp: 1 / 3, pDown: 1 / 3, pFlat: 1 / 3 };
        const ys = rows.map(x => x.row.forwardReturn), ws = rows.map(x => x.weight), den = ws.reduce((a, b) => a + b, 0) || 1;
        const pUp = rows.reduce((s, x) => s + x.weight * (x.row.forwardReturn > flat ? 1 : 0), 0) / den, pDown = rows.reduce((s, x) => s + x.weight * (x.row.forwardReturn < -flat ? 1 : 0), 0) / den;
        const pFlat = clamp(1 - pUp - pDown, 0, 1);
        const advRows = rows.filter(x => Number.isFinite(x.row.maxAdverseReturn));
        const favRows = rows.filter(x => Number.isFinite(x.row.maxFavorableReturn));
        const eps = episodeWeights(rows, independenceWindowMs);
        return { count: rows.length, effectiveSamples: effectiveSampleSize(ws), independentEpisodes: eps.length, episodeEffectiveSamples: effectiveSampleSize(eps), meanSimilarity: weightedMean(rows.map(x => x.similarity), ws), maxSimilarity: Math.max(nearestSimilarity, ...rows.map(x => x.similarity)), oodScore: clamp(1 - nearestSimilarity, 0, 1), expectedReturn: weightedMean(ys, ws), medianReturn: weightedQuantile(ys, ws, .5), q10: weightedQuantile(ys, ws, .1), q25: weightedQuantile(ys, ws, .25), q75: weightedQuantile(ys, ws, .75), q90: weightedQuantile(ys, ws, .9), pUp, pDown, pFlat, expectedAdverseReturn: advRows.length ? weightedMean(advRows.map(x => x.row.maxAdverseReturn), advRows.map(x => x.weight)) : undefined, expectedFavorableReturn: favRows.length ? weightedMean(favRows.map(x => x.row.maxFavorableReturn), favRows.map(x => x.weight)) : undefined };
    }
}
