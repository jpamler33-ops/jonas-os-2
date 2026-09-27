import { clamp, weightedMean } from '../utils/math.js';
const EPS = 1e-12;
function median(xs) { if (!xs.length)
    return 0; const s = [...xs].sort((a, b) => a - b), m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : ((s[m - 1] ?? 0) + (s[m] ?? 0)) / 2; }
function robustScale(xs) { if (xs.length < 3)
    return 1; const m = median(xs), mad = median(xs.map(x => Math.abs(x - m))); return Math.max(.05, 1.4826 * mad); }
function ess(ws) { const s = ws.reduce((a, b) => a + b, 0), s2 = ws.reduce((a, b) => a + b * b, 0); return s2 <= EPS ? 0 : s * s / s2; }
function weightedQuantile(xs, ws, q) { if (!xs.length)
    return 0; const ps = xs.map((x, i) => ({ x, w: Math.max(0, ws[i] ?? 0) })).sort((a, b) => a.x - b.x), total = ps.reduce((s, p) => s + p.w, 0); if (total <= EPS)
    return ps[Math.round(clamp(q, 0, 1) * (ps.length - 1))]?.x ?? 0; let c = 0, t = clamp(q, 0, 1) * total; for (const p of ps) {
    c += p.w;
    if (c >= t)
        return p.x;
} return ps.at(-1)?.x ?? 0; }
function dir(r, flat) { return r > flat ? 'UP' : r < -flat ? 'DOWN' : 'FLAT'; }
function dependencyAdjust(rows, windowMs) { const order = [...rows].sort((a, b) => a.timestamp - b.timestamp); let group = []; let start = order[0]?.timestamp ?? 0; const flush = () => { const n = Math.max(1, group.length); for (const x of group)
    x.weight /= n; group = []; }; for (const x of order) {
    if (group.length && x.timestamp - start >= windowMs) {
        flush();
        start = x.timestamp;
    }
    if (!group.length)
        start = x.timestamp;
    group.push(x);
} flush(); }
function classifyPath(t, ordered) {
    const last = ordered.at(-1);
    const final = dir(t.returns.get(last.horizonMs) ?? 0, last.flatThreshold), early = ordered.slice(0, -1);
    if (final === 'UP') {
        const dipped = early.some(f => (t.returns.get(f.horizonMs) ?? 0) < -f.flatThreshold);
        return dipped ? 'DIP_THEN_RALLY' : 'TREND_UP';
    }
    if (final === 'DOWN') {
        const popped = early.some(f => (t.returns.get(f.horizonMs) ?? 0) > f.flatThreshold);
        return popped ? 'POP_THEN_FADE' : 'TREND_DOWN';
    }
    return 'RANGE_CHOP';
}
function archetypeEvidence(rows, ordered) {
    const ids = ['TREND_UP', 'TREND_DOWN', 'DIP_THEN_RALLY', 'POP_THEN_FADE', 'RANGE_CHOP'], total = rows.reduce((s, r) => s + r.weight, 0);
    const evidence = ids.map(id => { const part = rows.filter(r => classifyPath(r, ordered) === id); return { id, probability: total > EPS ? part.reduce((s, r) => s + r.weight, 0) / total : 0, count: part.length }; });
    const dominant = [...evidence].sort((a, b) => b.probability - a.probability)[0]?.id ?? 'RANGE_CHOP';
    return { dominant, evidence };
}
function marginalConflictScore(rows, ordered) {
    const den = rows.reduce((s, r) => s + r.weight, 0);
    if (den <= EPS)
        return 0;
    const tvs = [];
    for (const f of ordered) {
        let up = 0, down = 0, flat = 0;
        for (const t of rows) {
            const d = dir(t.returns.get(f.horizonMs) ?? 0, f.flatThreshold);
            if (d === 'UP')
                up += t.weight;
            else if (d === 'DOWN')
                down += t.weight;
            else
                flat += t.weight;
        }
        up /= den;
        down /= den;
        flat /= den;
        tvs.push(.5 * (Math.abs(up - f.probabilities.up) + Math.abs(down - f.probabilities.down) + Math.abs(flat - f.probabilities.flat)));
    }
    return tvs.length ? tvs.reduce((a, b) => a + b, 0) / tvs.length : 0;
}
export function buildCrossHorizonPathForecast(input, forecasts, history, o) {
    const ordered = [...forecasts].sort((a, b) => a.horizonMs - b.horizonMs), warnings = [];
    if (ordered.length < 2)
        return fallback(input, ordered, 0, 0, 0, 'MIXED', ['at least two forecast horizons are required for path inference']);
    const horizons = ordered.map(f => f.horizonMs), byTs = new Map();
    for (const r of history) {
        if (r.symbol !== input.symbol || r.timestamp > input.asOf || r.availableAt > input.asOf || r.resolvedAt > input.asOf || !horizons.includes(r.horizonMs))
            continue;
        let m = byTs.get(r.timestamp);
        if (!m) {
            m = new Map();
            byTs.set(r.timestamp, m);
        }
        if (!m.has(r.horizonMs))
            m.set(r.horizonMs, r);
    }
    const complete = [];
    for (const [timestamp, m] of byTs) {
        if (!horizons.every(h => m.has(h)))
            continue;
        const anchor = m.get(horizons[0]);
        if (!o.featureIds.every(id => Number.isFinite(anchor.features[id])))
            continue;
        complete.push({ timestamp, regimeId: anchor.regimeId, features: anchor.features, resolvedAt: Math.max(...horizons.map(h => m.get(h).resolvedAt)), returns: new Map(horizons.map(h => [h, m.get(h).forwardReturn])), weight: 1, similarity: 0 });
    }
    if (!complete.length)
        return fallback(input, ordered, 0, 0, 0, 'MIXED', ['no complete point-in-time historical trajectories']);
    const scales = Object.fromEntries(o.featureIds.map(id => [id, robustScale(complete.map(t => t.features[id]))]));
    for (const t of complete) {
        let n = 0, d = 0;
        for (const id of o.featureIds) {
            const w = Math.max(0, o.featureWeights[id] ?? 1) * clamp(input.featureConfidence?.[id] ?? 1, 0, 1), z = ((input.features[id] ?? 0) - (t.features[id] ?? 0)) / (scales[id] ?? 1);
            n += w * z * z;
            d += w;
        }
        const distance = Math.sqrt(n / Math.max(EPS, d));
        let sim = Math.exp(-.5 * (distance / 1.25) ** 2);
        if (input.regimeId && t.regimeId === input.regimeId)
            sim = Math.min(1, sim * 1.10);
        else if (input.regimeId && t.regimeId)
            sim *= .85;
        t.similarity = sim;
        const age = Math.max(0, input.asOf - t.resolvedAt), rec = o.recencyHalfLifeMs > 0 ? Math.pow(2, -age / o.recencyHalfLifeMs) : 1;
        t.weight = sim ** 2 * rec;
    }
    const selected = complete.filter(t => t.similarity >= o.minSimilarity && t.weight > EPS).sort((a, b) => b.similarity - a.similarity).slice(0, o.topK);
    dependencyAdjust(selected, Math.max(...horizons));
    const ws = selected.map(t => t.weight), e = ess(ws), meanSimilarity = selected.length ? weightedMean(selected.map(t => t.similarity), ws) : 0;
    const last = ordered.at(-1), groups = { UP: selected.filter(t => dir(t.returns.get(last.horizonMs) ?? 0, last.flatThreshold) === 'UP'), DOWN: selected.filter(t => dir(t.returns.get(last.horizonMs) ?? 0, last.flatThreshold) === 'DOWN'), FLAT: selected.filter(t => dir(t.returns.get(last.horizonMs) ?? 0, last.flatThreshold) === 'FLAT') };
    const mk = (id, probability, key, fallbackKey) => { const rows = groups[key], rws = rows.map(t => t.weight); return { id, probability, points: ordered.map(f => { let target; if (rows.length >= 3 && ess(rws) >= 2)
            target = weightedQuantile(rows.map(t => t.returns.get(f.horizonMs) ?? 0), rws, .5);
        else
            target = fallbackKey === 'up' ? f.interval.q75 : fallbackKey === 'down' ? f.interval.q25 : f.interval.median; return { horizonId: f.horizonId, horizonMs: f.horizonMs, targetReturn: target, targetPrice: input.price * (1 + target) }; }) }; };
    const scenarios = [mk('UPSIDE_PATH', last.probabilities.up, 'UP', 'up'), mk('BASE_PATH', last.probabilities.flat, 'FLAT', 'flat'), mk('DOWNSIDE_PATH', last.probabilities.down, 'DOWN', 'down')];
    let flipWeight = 0, total = 0;
    for (const t of selected) {
        let prev, flip = false;
        for (const f of ordered) {
            const d = dir(t.returns.get(f.horizonMs) ?? 0, f.flatThreshold);
            if (prev && d !== 'FLAT' && prev !== 'FLAT' && d !== prev)
                flip = true;
            if (d !== 'FLAT')
                prev = d;
        }
        total += t.weight;
        if (flip)
            flipWeight += t.weight;
    }
    const directionFlipRisk = total > EPS ? flipWeight / total : 0;
    let strongConflict = false;
    for (let i = 1; i < ordered.length; i++) {
        const a = ordered[i - 1], b = ordered[i], pa = Math.max(a.probabilities.up, a.probabilities.down), pb = Math.max(b.probabilities.up, b.probabilities.down);
        if (a.direction !== b.direction && a.direction !== 'FLAT' && b.direction !== 'FLAT' && pa >= .65 && pb >= .65)
            strongConflict = true;
    }
    const marginalConflict = marginalConflictScore(selected, ordered), arch = archetypeEvidence(selected, ordered);
    const coherence = strongConflict || marginalConflict >= o.marginalConflictHard ? 'CONFLICT' : directionFlipRisk > .45 || marginalConflict >= o.marginalConflictWarn ? 'MIXED' : 'COHERENT';
    if (strongConflict)
        warnings.push('strong calibrated direction conflict across forecast horizons');
    if (directionFlipRisk > .45)
        warnings.push('historical analogue paths frequently reverse direction across horizons');
    if (marginalConflict >= o.marginalConflictHard)
        warnings.push('joint historical path distribution conflicts with marginal horizon forecasts');
    else if (marginalConflict >= o.marginalConflictWarn)
        warnings.push('joint path distribution is only partially consistent with marginal horizon forecasts');
    const status = selected.length >= o.minCompleteTrajectories && e >= o.minEffectiveSamples ? 'ACTIVE' : 'INSUFFICIENT';
    if (status === 'INSUFFICIENT')
        warnings.push('multi-horizon trajectory support is insufficient');
    return { status, coherence, completeTrajectoryCount: selected.length, effectiveSamples: e, meanSimilarity, directionFlipRisk, marginalConflict, dominantArchetype: arch.dominant, archetypes: arch.evidence, scenarios, warnings };
}
function fallback(input, ordered, count, e, sim, coherence, warnings) {
    if (!ordered.length)
        return { status: 'INSUFFICIENT', coherence, completeTrajectoryCount: count, effectiveSamples: e, meanSimilarity: sim, directionFlipRisk: 0, marginalConflict: 0, dominantArchetype: 'RANGE_CHOP', archetypes: [], scenarios: [], warnings };
    const last = ordered.at(-1);
    const make = (id, p, k) => ({ id, probability: p, points: ordered.map(f => { const r = k === 'up' ? f.interval.q75 : k === 'down' ? f.interval.q25 : f.interval.median; return { horizonId: f.horizonId, horizonMs: f.horizonMs, targetReturn: r, targetPrice: input.price * (1 + r) }; }) });
    return { status: 'INSUFFICIENT', coherence, completeTrajectoryCount: count, effectiveSamples: e, meanSimilarity: sim, directionFlipRisk: 0, marginalConflict: 0, dominantArchetype: 'RANGE_CHOP', archetypes: [], scenarios: [make('UPSIDE_PATH', last.probabilities.up, 'up'), make('BASE_PATH', last.probabilities.flat, 'flat'), make('DOWNSIDE_PATH', last.probabilities.down, 'down')], warnings };
}