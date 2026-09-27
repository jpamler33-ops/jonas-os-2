function pct(x) { return `${x >= 0 ? '+' : ''}${(x * 100).toFixed(2)}%`; }
function prob(x) { return `${(x * 100).toFixed(1)}%`; }
function gateIcon(g) { return g === 'PASS' ? 'PASS' : g === 'CAUTION' ? 'CAUTION' : g === 'INSUFFICIENT' ? 'INSUFFICIENT' : 'ABSTAIN'; }
/** Display-only forecast card. Deliberately contains no BUY/SELL instruction. */
export function renderProbabilisticForecastCard(report) {
    const lines = [`TCX FORECAST · ${report.symbol}`, `Preis: ${report.price.toLocaleString('en-US', { maximumFractionDigits: 8 })}`, ''];
    for (const f of report.forecasts) {
        lines.push(`${f.horizonId} · ${gateIcon(f.gate)} · ${f.direction}`);
        lines.push(`↑ ${prob(f.probabilities.up)}  ↓ ${prob(f.probabilities.down)}  ↔ ${prob(f.probabilities.flat)}`);
        lines.push(`E[r] ${pct(f.expectedReturn)} · Q10/Q90 ${pct(f.interval.q10)} … ${pct(f.interval.q90)}`);
        lines.push(`Analoge ${f.analogs.count} · ESS ${f.analogs.effectiveSamples.toFixed(1)} · IndepESS ${f.analogs.episodeEffectiveSamples.toFixed(1)} · OOD ${(f.analogs.oodScore * 100).toFixed(0)}%`);
        lines.push(`Modelle ${f.models.length} · ProbDis ${f.probabilityDisagreement.toFixed(3)} · Entropie ${(f.directionalEntropy * 100).toFixed(0)}%`);
        lines.push(`Adaptive W: ${f.models.map(m => `${m.modelId.replace('_RIDGE', '').replace('ANALOG_EMPIRICAL', 'ANALOG')} ${m.effectiveWeight.toFixed(2)}`).join(' · ')}`);
        lines.push(`Kalibrierung ${f.calibration.status}/${f.calibration.method} · Intervall ${f.intervalCalibration.status} x${f.intervalCalibration.scaleFactor.toFixed(2)} sim ${(f.intervalCalibration.meanSimilarity * 100).toFixed(0)}% · Drift ${f.drift.status} ${(f.drift.score * 100).toFixed(0)}% ECEΔ ${(f.drift.eceDelta * 100).toFixed(1)}pp`);
        lines.push(`LocalRel ${f.localReliability.status} · OpConf ${(f.operationalConfidence * 100).toFixed(0)}/100`);
        if (f.reasons.length)
            lines.push(`Gate: ${f.reasons.join(' | ')}`);
        lines.push('');
    }
    if (report.path.scenarios.length) {
        lines.push(`PATH · ${report.path.status} · ${report.path.coherence} · Traj ${report.path.completeTrajectoryCount} · ESS ${report.path.effectiveSamples.toFixed(1)} · FlipRisk ${(report.path.directionFlipRisk * 100).toFixed(0)}% · MargConflict ${(report.path.marginalConflict * 100).toFixed(0)}% · Arch ${report.path.dominantArchetype}`);
        for (const s of report.path.scenarios)
            lines.push(`${s.id.replace('_PATH', '')} ${prob(s.probability)} · ${s.points.map(p => `${p.horizonId}:${pct(p.targetReturn)}`).join(' → ')}`);
        lines.push('');
    }
    lines.push('SHADOW_ONLY · Wahrscheinlichkeitsmodell, kein Echtgeldsignal.');
    return lines.join('\n');
}