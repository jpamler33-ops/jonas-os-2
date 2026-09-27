import { clamp } from '../utils/math.js';
/**
 * Builds realized labels independently per symbol. A label is usable only after every forward-path
 * observation needed for it has become available, preserving the point-in-time firewall.
 */
export function buildForecastHistory(points, opts) {
    if (opts.horizonMs <= 0)
        throw new Error('horizonMs must be positive');
    const rows = [];
    let rejectedInvalid = 0, rejectedCoverage = 0, rejectedNoTarget = 0;
    const minCoverage = clamp(opts.minFeatureCoverage ?? 1, 0, 1), maxDelay = opts.maxTargetDelayMs ?? opts.horizonMs * .25;
    const groups = new Map();
    for (const p of points) {
        const arr = groups.get(p.symbol) ?? [];
        arr.push(p);
        groups.set(p.symbol, arr);
    }
    for (const [symbol, raw] of groups) {
        const sorted = [...raw].sort((a, b) => a.timestamp - b.timestamp || a.availableAt - b.availableAt);
        for (let i = 0; i < sorted.length; i++) {
            const cur = sorted[i];
            if (!Number.isFinite(cur.price) || cur.price <= 0 || cur.availableAt < cur.timestamp) {
                rejectedInvalid++;
                continue;
            }
            const coverage = opts.featureIds.filter(id => Number.isFinite(cur.features[id])).length / Math.max(1, opts.featureIds.length);
            if (coverage < minCoverage) {
                rejectedCoverage++;
                continue;
            }
            const targetTs = cur.timestamp + opts.horizonMs;
            let j = i + 1;
            while (j < sorted.length && (sorted[j]?.timestamp ?? Infinity) < targetTs)
                j++;
            const target = sorted[j];
            if (!target || target.timestamp - targetTs > maxDelay || !Number.isFinite(target.price) || target.price <= 0) {
                rejectedNoTarget++;
                continue;
            }
            const path = sorted.slice(i + 1, j + 1).filter(p => p.timestamp <= target.timestamp && p.timestamp > cur.timestamp && Number.isFinite(p.price) && p.price > 0);
            if (!path.length) {
                rejectedNoTarget++;
                continue;
            }
            const pathReturns = path.map(p => p.price / cur.price - 1), resolvedAt = Math.max(cur.availableAt, ...path.map(p => p.availableAt)), forwardReturn = target.price / cur.price - 1;
            const realizedVolatility = Math.sqrt(pathReturns.reduce((s, r, k) => { const prev = k === 0 ? 0 : pathReturns[k - 1] ?? 0; const dr = r - prev; return s + dr * dr; }, 0) / Math.max(1, pathReturns.length));
            rows.push({ id: `${symbol}:${cur.timestamp}:${opts.horizonMs}`, symbol, timestamp: cur.timestamp, availableAt: cur.availableAt, resolvedAt, horizonMs: opts.horizonMs, features: Object.fromEntries(opts.featureIds.map(id => [id, cur.features[id]])), regimeId: cur.regimeId, forwardReturn, maxAdverseReturn: Math.min(...pathReturns), maxFavorableReturn: Math.max(...pathReturns), realizedVolatility, quality: clamp(cur.quality ?? 1, 0, 1) });
        }
    }
    rows.sort((a, b) => a.timestamp - b.timestamp || a.symbol.localeCompare(b.symbol));
    return { rows, rejectedInvalid, rejectedCoverage, rejectedNoTarget };
}