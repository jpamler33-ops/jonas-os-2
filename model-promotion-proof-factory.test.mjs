import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, writeFile } from 'node:fs/promises';

import { sha256 } from './institutional-kernel.mjs';
import { openReleaseRegistry, registerRuntimeRelease } from './runtime-release-registry.mjs';
import { buildForecastCandidateArtifact } from './forecast-candidate-lab.mjs';
import {
  createCandidateDeterministicReplayProof,
  verifyCandidateDeterministicReplayProof,
  createModelRollbackPreflight,
  verifyModelRollbackPreflight,
  buildPromotionSoftwareProofs
} from './model-promotion-proof-factory.mjs';

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

function rows(n=150){
  const out=[];
  const start=1_000_000,step=10*60_000;
  for(let i=0;i<n;i++){
    const timestamp=start+i*step;
    const x=Math.sin(i/9),y=Math.cos(i/13);
    out.push({
      id:'BTC:'+i,symbol:'BTCUSDT',timestamp,
      availableAt:timestamp+1000,
      resolvedAt:timestamp+301000,
      horizonMs:300000,
      features:{x,y},
      regimeId:i%2?'RANGE':'TREND',
      forwardReturn:.004*x+.002*y+((i%5)-2)*.0002,
      quality:1
    });
  }
  return out;
}

async function releaseRegistryFor(config){
  const dir=await mkdtemp(path.join(os.tmpdir(),'tcx-proof-registry-'));
  const registry=await openReleaseRegistry(path.join(dir,'release.jsonl'));
  const core={
    schemaVersion:1,
    kind:'TCX_RUNTIME_RELEASE',
    package:{name:'tcx-test',version:'1'},
    runtime:{node:process.version,platform:process.platform,arch:process.arch},
    deployment:{gitCommit:null,gitBranch:null,service:'test'},
    versions:{forecastConfigHash:sha256(config)},
    configHash:sha256({}),
    componentHashes:{'bot.mjs':sha256('test')}
  };
  const manifest={...core,releaseId:sha256(core)};
  const registered=await registerRuntimeRelease(registry,manifest,{registeredAt:900});
  return {registry,record:registered.record,manifest};
}

test('candidate deterministic replay produces identical PIT evaluation proof',async()=>{
  const history=rows();
  const {manifest}=await releaseRegistryFor(baseConfig);
  const cutoff=history[60].timestamp;
  const candidate=buildForecastCandidateArtifact({
    historyRows:history,
    incumbentConfig:baseConfig,
    candidateConfig:{...baseConfig,ridgeLambda:1.25},
    dataCutoffAt:cutoff,
    createdAt:cutoff+1,
    parentReleaseId:manifest.releaseId
  });
  const proof=createCandidateDeterministicReplayProof({
    historyRows:history,
    incumbentConfig:baseConfig,
    candidate,
    asOf:history[135].resolvedAt,
    minimumTrainCases:30
  });
  assert.equal(proof.passed,true);
  assert.equal(proof.checks.deterministicEvaluation,true);
  assert.equal(proof.checks.pitLeakagePassed,true);
  assert.equal(verifyCandidateDeterministicReplayProof(proof).ok,true);
  assert.equal(proof.canExecute,false);
});

test('rollback preflight freezes a registered incumbent config without mutation',async()=>{
  const history=rows();
  const {registry,manifest}=await releaseRegistryFor(baseConfig);
  const cutoff=history[60].timestamp;
  const candidate=buildForecastCandidateArtifact({
    historyRows:history,
    incumbentConfig:baseConfig,
    candidateConfig:{...baseConfig,ridgeLambda:1.25},
    dataCutoffAt:cutoff,
    createdAt:cutoff+1,
    parentReleaseId:manifest.releaseId
  });
  const proof=createModelRollbackPreflight({
    candidate,
    incumbentConfig:baseConfig,
    releaseRegistry:registry,
    asOf:history[135].resolvedAt
  });
  assert.equal(proof.passed,true);
  assert.equal(proof.result,'ROLLBACK_PREFLIGHT_READY');
  assert.equal(proof.rollbackTarget.forecastConfigHash,sha256(baseConfig));
  assert.deepEqual(proof.rollbackTarget.configSnapshot,baseConfig);
  assert.equal(proof.checks.productionMutationPerformed,false);
  assert.equal(verifyModelRollbackPreflight(proof).ok,true);
  assert.equal(proof.canExecute,false);
});

test('rollback preflight blocks when parent release config does not match incumbent',async()=>{
  const history=rows();
  const other={...baseConfig,ridgeLambda:9};
  const {registry,manifest}=await releaseRegistryFor(other);
  const candidate=buildForecastCandidateArtifact({
    historyRows:history,
    incumbentConfig:baseConfig,
    candidateConfig:{...baseConfig,ridgeLambda:1.25},
    dataCutoffAt:history[60].timestamp,
    createdAt:history[60].timestamp+1,
    parentReleaseId:manifest.releaseId
  });
  const proof=createModelRollbackPreflight({
    candidate,incumbentConfig:baseConfig,releaseRegistry:registry,asOf:history[135].resolvedAt
  });
  assert.equal(proof.passed,false);
  assert.equal(proof.checks.incumbentConfigBoundToParent,false);
  assert.equal(verifyModelRollbackPreflight(proof).ok,true);
});

test('proof bundle distinguishes verified proof from absent proof',async()=>{
  const history=rows();
  const {registry,manifest}=await releaseRegistryFor(baseConfig);
  const candidate=buildForecastCandidateArtifact({
    historyRows:history,
    incumbentConfig:baseConfig,
    candidateConfig:{...baseConfig,ridgeLambda:1.25},
    dataCutoffAt:history[60].timestamp,
    createdAt:history[60].timestamp+1,
    parentReleaseId:manifest.releaseId
  });
  const replay=createCandidateDeterministicReplayProof({
    historyRows:history,incumbentConfig:baseConfig,candidate,
    asOf:history[135].resolvedAt,minimumTrainCases:30
  });
  const rollback=createModelRollbackPreflight({
    candidate,incumbentConfig:baseConfig,releaseRegistry:registry,asOf:history[135].resolvedAt
  });
  const bundle=buildPromotionSoftwareProofs({
    buildAttestationVerification:{
      ok:true,generatedAt:1000,sourceFingerprint:'s',testContractFingerprint:'t'
    },
    replayProof:replay,
    rollbackPreflight:rollback
  });
  assert.equal(bundle.testsPassed.value,true);
  assert.equal(bundle.deterministicReplayPassed.value,true);
  assert.equal(bundle.rollbackReady.value,true);
  assert.equal(bundle.canExecute,false);

  const missing=buildPromotionSoftwareProofs({});
  assert.equal(missing.testsPassed,undefined);
  assert.equal(missing.deterministicReplayPassed,undefined);
  assert.equal(missing.rollbackReady,undefined);
});
