import { mean } from '../utils/math.js';
function empty() { return { count: 0, directionalAccuracy: 0, multiclassBrier: 0, logLoss: 0, expectedCalibrationError: 0, maxCalibrationError: 0, reliabilityBins: [], meanAbsoluteReturnError: 0, intervalCoverage: 0, highConfidenceWrongRate: 0, meanOperationalConfidence: 0 }; }
function reliability(rows,bins=10){
    const buckets=Array.from({length:Math.max(3,bins)},(_,i)=>({bin:i,count:0,confidenceSum:0,correct:0}));
    for(const e of rows){const ps=[e.probabilities.up,e.probabilities.down,e.probabilities.flat].map(Number),confidence=Math.max(...ps);if(!Number.isFinite(confidence))continue;const i=Math.min(buckets.length-1,Math.floor(confidence*buckets.length)),b=buckets[i];b.count++;b.confidenceSum+=confidence;b.correct+=e.resolution.topCorrect?1:0;}
    const total=buckets.reduce((s,b)=>s+b.count,0);let ece=0,mce=0;const reliabilityBins=buckets.filter(b=>b.count).map(b=>{const meanConfidence=b.confidenceSum/b.count,accuracy=b.correct/b.count,gap=Math.abs(meanConfidence-accuracy);ece+=(b.count/Math.max(1,total))*gap;mce=Math.max(mce,gap);return{bin:b.bin,count:b.count,meanConfidence,accuracy,gap};});
    return{expectedCalibrationError:ece,maxCalibrationError:mce,reliabilityBins};
}
function metrics(entries, highConfidenceThreshold = .65) {
    const rows = entries.filter(e => e.status === 'RESOLVED' && e.resolution);
    if (!rows.length)
        return empty();
    const rel=reliability(rows);
    return {
        count: rows.length,
        directionalAccuracy: mean(rows.map(e => e.resolution.topCorrect ? 1 : 0)),
        multiclassBrier: mean(rows.map(e => e.resolution.brier)),
        logLoss: mean(rows.map(e => e.resolution.logLoss)),
        expectedCalibrationError: rel.expectedCalibrationError,
        maxCalibrationError: rel.maxCalibrationError,
        reliabilityBins: rel.reliabilityBins,
        meanAbsoluteReturnError: mean(rows.map(e => e.resolution.absoluteReturnError)),
        intervalCoverage: mean(rows.map(e => e.resolution.intervalMiss ? 0 : 1)),
        highConfidenceWrongRate: mean(rows.map(e => Math.max(e.probabilities.up, e.probabilities.down, e.probabilities.flat) >= highConfidenceThreshold && !e.resolution.topCorrect ? 1 : 0)),
        meanOperationalConfidence: mean(rows.map(e => e.operationalConfidence))
    };
}
/** Pure evaluation of forecasts that were already generated point-in-time. No retrospective refitting. */
export function evaluateForecastJournal(entries, highConfidenceThreshold = .65) {
    const overall = metrics(entries, highConfidenceThreshold);
    const actionable = metrics(entries.filter(e => e.gate === 'PASS' || e.gate === 'CAUTION'), highConfidenceThreshold);
    const ids = [...new Set(entries.map(e => e.horizonId))];
    const byHorizon = {};
    for (const id of ids)
        byHorizon[id] = metrics(entries.filter(e => e.horizonId === id), highConfidenceThreshold);
    return { overall, actionable, byHorizon, selectiveBrierImprovement: overall.count && actionable.count ? overall.multiclassBrier - actionable.multiclassBrier : 0, resolvedCount: entries.filter(e => e.status === 'RESOLVED').length, pendingCount: entries.filter(e => e.status === 'PENDING').length, expiredCount: entries.filter(e => e.status === 'EXPIRED').length };
}
/** Chronological, non-overlapping test folds over already point-in-time forecasts. */
export function evaluateWalkForwardJournal(entries, opts = {}) {
    const rows = entries.filter(e => e.status === 'RESOLVED' && e.resolution).sort((a, b) => a.asOf - b.asOf);
    const size = Math.max(1, Math.floor(opts.foldSize ?? 50));
    const out = [];
    for (let i = 0, fold = 0; i < rows.length; i += size, fold++) {
        const part = rows.slice(i, i + size);
        if (!part.length)
            continue;
        out.push({ fold, startAsOf: part[0].asOf, endAsOf: part.at(-1).asOf, metrics: metrics(part, opts.highConfidenceThreshold ?? .65) });
    }
    return out;
}
/** Evidence-only gate for displaying forecast probabilities. Never authorizes execution. */
export function evaluateProbabilityCalibrationGate(entries,{minResolved=100,maxBrier=.75,maxEce=.12,maxMce=.25,minIntervalCoverage=.70,maxHighConfidenceWrongRate=.25}={}){
 const m=metrics(entries),checks={sampleSize:m.count>=minResolved,brier:m.count>0&&m.multiclassBrier<=maxBrier,ece:m.count>0&&m.expectedCalibrationError<=maxEce,mce:m.count>0&&m.maxCalibrationError<=maxMce,intervalCoverage:m.count>0&&m.intervalCoverage>=minIntervalCoverage,highConfidenceErrors:m.count>0&&m.highConfidenceWrongRate<=maxHighConfidenceWrongRate};
 const passed=Object.values(checks).every(Boolean);return{version:'TCX_PROBABILITY_CALIBRATION_GATE_V1',passed,status:passed?'CALIBRATED':'SUPPRESSED',checks,metrics:m,thresholds:{minResolved,maxBrier,maxEce,maxMce,minIntervalCoverage,maxHighConfidenceWrongRate},execution:'SHADOW_ONLY',canExecuteLive:false};
}
