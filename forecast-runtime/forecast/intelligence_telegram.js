function pct(x, d = 1) { return `${(x * 100).toFixed(d)}%`; }
function regimeLine(r) { if (r.status === 'INSUFFICIENT')
    return 'Regime→: insufficient evidence'; const top = r.probabilities.slice(0, 3).map(x => `${x.regimeId} ${pct(x.probability, 0)}`).join(' · '); return `Regime→: ${top}\nChange ${pct(r.changeProbability, 0)} · ESS ${r.effectiveSamples.toFixed(1)} · H ${r.entropy.toFixed(2)}`; }
/** Display-only intelligence extension. No order/execution language by design. */
export function renderForecastIntelligenceCard(r) {
    const f = r.forecast.forecasts.map(x => `${x.horizonId}: ${x.direction} · P↑${pct(x.probabilities.up, 0)} P↓${pct(x.probabilities.down, 0)} · ${x.gate}`).join('\n');
    return [`TCX FORECAST INTELLIGENCE`, `${r.forecast.symbol} · SHADOW_ONLY`, f, regimeLine(r.regimeTransition), `Path: ${r.forecast.path.coherence} · ${r.forecast.path.dominantArchetype}`].join('\n\n');
}
export function renderForecastInvalidationCard(a) {
    const why = a.reasons.length ? `\nReason: ${a.reasons.join('; ')}` : '';
    return [`Forecast revision: ${a.status}`, `Score ${pct(a.score, 0)} · realized ${pct(a.realizedReturn, 2)} · expected ${pct(a.expectedReturn, 2)}`, `Envelope ${pct(a.lowerReturn, 2)} … ${pct(a.upperReturn, 2)}`, `Regime changed: ${a.regimeChanged ? 'yes' : 'no'}`].join('\n') + why;
}