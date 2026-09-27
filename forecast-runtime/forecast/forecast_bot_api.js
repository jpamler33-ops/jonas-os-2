import { renderForecastIntelligenceCard, renderForecastInvalidationCard } from './intelligence_telegram.js';
/** Thin display/API adapter for Telegram or any chat surface. No execution actions. */
export class ForecastBotApi {
    service;
    constructor(service) {
        this.service = service;
    }
    issue(input) {
        const issued = this.service.issue(input);
        return { ...issued, text: renderForecastIntelligenceCard(issued.report) };
    }
    observe(input) {
        return this.service.observe(input).map(record => {
            const latest = record.revisions.at(-1)?.assessment;
            const text = latest
                ? renderForecastInvalidationCard(latest)
                : `Forecast revision: ${record.status}\nNo new assessment.`;
            return { forecastId: record.id, status: record.status, text, record };
        });
    }
    explain(forecastId, options = {}) {
        const r = this.service.counterfactual(forecastId, options);
        const top = r.rankedFeatures.slice(0, 5);
        const lines = top.length
            ? top.map((x, i) => `${i + 1}. ${x.featureId}: impact ${(x.maxImpact * 100).toFixed(2)}pp`)
            : ['No supported feature perturbation available.'];
        return [
            'TCX FORECAST SENSITIVITY',
            `${r.symbol} · MODEL_SENSITIVITY_NOT_CAUSAL`,
            ...lines,
            r.warnings.length ? `Warnings: ${r.warnings.join('; ')}` : '',
        ].filter(Boolean).join('\n');
    }
}