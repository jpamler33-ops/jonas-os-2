import { buildRegimeTransitionForecast } from './regime_transition.js';
export class ForecastIntelligenceLayer {
    engine;
    options;
    constructor(engine, options = {}) {
        this.engine = engine;
        this.options = options;
    }
    issue(input) {
        const forecast = this.engine.forecast(input), cfg = this.engine.configSnapshot(), rt = this.options.regimeTransition ?? {}, regimeTransition = buildRegimeTransitionForecast(input, this.engine.historySnapshot(input.asOf), { featureIds: rt.featureIds ?? cfg.featureIds, featureWeights: rt.featureWeights ?? cfg.featureWeights, recencyHalfLifeMs: rt.recencyHalfLifeMs ?? cfg.recencyHalfLifeMs, bandwidth: rt.bandwidth, minCases: rt.minCases, minEffectiveSamples: rt.minEffectiveSamples, topK: rt.topK, maxTransitionGapMs: rt.maxTransitionGapMs });
        return { forecast, regimeTransition, executionMode: 'SHADOW_ONLY' };
    }
}