import { clamp, mean } from '../utils/math.js';
export function tcxForecastFeatureIds(specs, extraFeatureIds = []) {
    return [...specs.flatMap(s => s.dimensions.map(d => `${s.feature}.${d}`)), ...extraFeatureIds];
}
/** Converts TCX state/pressure/regime layers without replacing missing evidence with neutral zeroes. */
export function buildForecastStateFromTcx(input) {
    const map = new Map(input.states.map(s => [s.feature, s]));
    const features = {};
    const featureConfidence = {};
    let requested = 0, provided = 0;
    const valueConfidences = [];
    const maxStale = input.maxStateStalenessMs ?? Infinity;
    for (const spec of input.specs) {
        const s = map.get(spec.feature);
        for (const d of spec.dimensions) {
            requested++;
            if (!s)
                continue;
            const freshness = maxStale === Infinity ? 1 : clamp(1 - Math.max(0, input.asOf - s.timestamp) / Math.max(1, maxStale), 0, 1);
            const id = `${spec.feature}.${d}`;
            const value = d === 'pressure' ? input.pressure?.pressureByNode[spec.feature] : s[d];
            if (!Number.isFinite(value))
                continue;
            features[id] = value;
            const c = clamp(s.confidence * freshness, 0, 1);
            featureConfidence[id] = c;
            valueConfidences.push(c);
            provided++;
        }
    }
    for (const [id, value] of Object.entries(input.extraFeatures ?? {})) {
        requested++;
        if (!Number.isFinite(value))
            continue;
        features[id] = value;
        const c = clamp(input.extraConfidence?.[id] ?? 1, 0, 1);
        featureConfidence[id] = c;
        valueConfidences.push(c);
        provided++;
    }
    const coverage = requested ? provided / requested : 1;
    const evidenceQuality = valueConfidences.length ? mean(valueConfidences) : 1;
    const dataQuality = clamp(evidenceQuality * coverage, 0, 1);
    return { symbol: input.symbol, asOf: input.asOf, price: input.price, features, featureConfidence, regimeId: input.regime?.id, regimeConfidence: input.regime?.confidence ?? 0, dataQuality, guards: input.guards };
}