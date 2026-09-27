import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildForecastCandidateArtifact,
  verifyForecastCandidateArtifact,
  evaluateForecastCandidateWalkForward
} from './forecast-candidate-lab.mjs';

const baseConfig={
  featureIds:['x','y'],
  horizons:[{
    id:'5m',horizonMs:300000,flatThreshold:.001,
    topK:80,minSimilarity:.01,analogBandwidth:2,independenceWindowMs:300000
  }],
  ridgeLambda:1,
  recencyHalfLifeMs:1000*60*60*24*30,
  minTrainingCases:12,
  minRegimeCases:6,
  minAnalogCount:6,
  minAnalogEffectiveSamples:3,
  minAnalogIndependentEpisodes:3,
  minDataQuality:.5,
  minRegimeConfidence:.2,
  minNearestSimilarity:.01,
  calibrationMinCases:8,
  reliabilityMinCases:8,
  reliabilityMinEffectiveSamples:4,
  modelPerformanceMinCases:8,
  modelPerformanceMinEffectiveSamples:4,
  intervalCalibrationMinCases:8,
  intervalCalibrationMinEffectiveSamples:4,
  driftRecentCases:8,
  driftBaselineCases:16,
  driftMinRecentIndependent:4,
  driftMinBaselineIndependent:8,
  pathMinCompleteTrajectories:6,
  pathMinEffectiveSamples:3,
  pathTopK:60,
  pathMinSimilarity:.01
};

function rows(n=180){
  const out=[];
  const start=1_000_000;
  const step=10*60_000;
  for(let i=0;i<n;i++){
    const timestamp=start+i*step;
    const x=Math.sin(i/9);
    const y=Math.cos(i/13);
    const forwardReturn=.004*x+.002*y+((i%5)-2)*.0002;
    out.push({
      id:'BTC:'+i,
      symbol:'BTCUSDT',
      timestamp,
      availableAt:timestamp+1000,
      resolvedAt:timestamp+300000+1000,
      horizonMs:300000,
      features:{x,y},
      regimeId:i%2?'RANGE':'TREND',
      forwardReturn,
      quality:1
    });
  }
  return out;
}

test('candidate artifact binds only matured history at cutoff',()=>{
  const history=rows();
  const cutoff=history[80].timestamp;
  const candidateConfig={...baseConfig,ridgeLambda:2};
  const c=buildForecastCandidateArtifact({
    historyRows:history,
    incumbentConfig:baseConfig,
    candidateConfig,
    dataCutoffAt:cutoff,
    createdAt:cutoff+1,
    parentReleaseId:'release-a'
  });
  assert.equal(verifyForecastCandidateArtifact(c).ok,true);
  assert.ok(c.trainingCases<history.length);
  assert.equal(c.canExecute,false);
  assert.match(c.objective,/NOT_PNL/);
});

test('candidate cannot change target semantics',()=>{
  const history=rows();
  const changed={
    ...baseConfig,
    horizons:[{...baseConfig.horizons[0],flatThreshold:.01}]
  };
  assert.throws(()=>buildForecastCandidateArtifact({
    historyRows:history,
    incumbentConfig:baseConfig,
    candidateConfig:changed,
    dataCutoffAt:history[80].timestamp,
    parentReleaseId:'release-a'
  }),/target semantics/);
});

test('walk-forward evaluation is chronological and blocks future outcomes',()=>{
  const history=rows();
  const cutoff=history[70].timestamp;
  const candidate=buildForecastCandidateArtifact({
    historyRows:history,
    incumbentConfig:baseConfig,
    candidateConfig:{...baseConfig,ridgeLambda:1.5,recencyHalfLifeMs:1000*60*60*24*20},
    dataCutoffAt:cutoff,
    createdAt:cutoff+1,
    parentReleaseId:'release-a'
  });
  const asOf=history[160].resolvedAt;
  const result=evaluateForecastCandidateWalkForward({
    historyRows:history,
    incumbentConfig:baseConfig,
    candidate,
    asOf,
    minimumTrainCases:30
  });
  assert.equal(result.diagnostics.pitViolations,0);
  assert.equal(result.diagnostics.temporalOosPassed,true);
  assert.ok(result.diagnostics.blockedFuture>0);
  assert.ok(result.evaluation.cases>40);
  assert.ok(Number.isFinite(result.evaluation.candidate.brier));
  assert.ok(Number.isFinite(result.evaluation.incumbent.logLoss));
  assert.ok(result.evaluation.independentEpisodes>0);
  assert.equal(result.canExecute,false);
});

test('walk-forward artifact is deterministic for same inputs',()=>{
  const history=rows(140);
  const cutoff=history[60].timestamp;
  const candidate=buildForecastCandidateArtifact({
    historyRows:history,
    incumbentConfig:baseConfig,
    candidateConfig:{...baseConfig,ridgeLambda:1.25},
    dataCutoffAt:cutoff,
    createdAt:cutoff+1,
    parentReleaseId:'release-a'
  });
  const args={historyRows:history,incumbentConfig:baseConfig,candidate,asOf:history[130].resolvedAt,minimumTrainCases:30};
  const a=evaluateForecastCandidateWalkForward(args);
  const b=evaluateForecastCandidateWalkForward(args);
  assert.equal(a.fingerprint,b.fingerprint);
  assert.deepEqual(a.promotionEvaluationInput,b.promotionEvaluationInput);
});
