export function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
export function mean(xs) {
    if (xs.length === 0)
        return 0;
    return xs.reduce((a, b) => a + b, 0) / xs.length;
}
export function median(xs) {
    if (xs.length === 0)
        return 0;
    const s = [...xs].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 === 0 ? ((s[m - 1] ?? 0) + (s[m] ?? 0)) / 2 : (s[m] ?? 0);
}
export function mad(xs) {
    if (xs.length === 0)
        return 0;
    const m = median(xs);
    return median(xs.map(x => Math.abs(x - m)));
}
export function robustZ(value, history) {
    if (history.length < 3)
        return 0;
    const m = median(history);
    const scale = 1.4826 * mad(history);
    if (scale < 1e-12)
        return 0;
    return (value - m) / scale;
}
export function pearson(a, b) {
    const n = Math.min(a.length, b.length);
    if (n < 3)
        return 0;
    const aa = a.slice(0, n);
    const bb = b.slice(0, n);
    const ma = mean(aa);
    const mb = mean(bb);
    let num = 0, da = 0, db = 0;
    for (let i = 0; i < n; i++) {
        const xa = (aa[i] ?? 0) - ma;
        const xb = (bb[i] ?? 0) - mb;
        num += xa * xb;
        da += xa * xa;
        db += xb * xb;
    }
    const den = Math.sqrt(da * db);
    return den <= 1e-12 ? 0 : num / den;
}
export function rmse(actual, predicted) {
    const n = Math.min(actual.length, predicted.length);
    if (n === 0)
        return 0;
    let s = 0;
    for (let i = 0; i < n; i++) {
        const e = (actual[i] ?? 0) - (predicted[i] ?? 0);
        s += e * e;
    }
    return Math.sqrt(s / n);
}
export function linearFit(x, y) {
    const n = Math.min(x.length, y.length);
    if (n < 2)
        return { a: 0, b: 0 };
    const xx = x.slice(0, n), yy = y.slice(0, n);
    const mx = mean(xx), my = mean(yy);
    let cov = 0, vx = 0;
    for (let i = 0; i < n; i++) {
        const dx = (xx[i] ?? 0) - mx;
        cov += dx * ((yy[i] ?? 0) - my);
        vx += dx * dx;
    }
    const b = vx <= 1e-12 ? 0 : cov / vx;
    return { a: my - b * mx, b };
}
export function expHalfLifeDecay(ageMs, halfLifeMs) {
    if (halfLifeMs <= 0)
        return 0;
    return Math.pow(2, -Math.max(0, ageMs) / halfLifeMs);
}
export function cosineSimilarity(a, b) {
    const n = Math.min(a.length, b.length);
    if (n === 0)
        return 0;
    let dot = 0, aa = 0, bb = 0;
    for (let i = 0; i < n; i++) {
        const x = a[i] ?? 0;
        const y = b[i] ?? 0;
        dot += x * y;
        aa += x * x;
        bb += y * y;
    }
    if (aa <= 1e-12 && bb <= 1e-12)
        return 1;
    if (aa <= 1e-12 || bb <= 1e-12)
        return 0;
    return dot / Math.sqrt(aa * bb);
}
export function weightedMean(values, weights) {
    const n = Math.min(values.length, weights.length);
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) {
        const w = Math.max(0, weights[i] ?? 0);
        num += (values[i] ?? 0) * w;
        den += w;
    }
    return den <= 1e-12 ? 0 : num / den;
}