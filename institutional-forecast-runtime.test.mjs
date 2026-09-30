import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { gzipSync, gunzipSync } from 'node:zlib';

import { sha256 } from './institutional-kernel.mjs';
import { selectIndependenceAwareAnalogs } from './forecast-runtime/forecast/engine.js';
import { evaluateScientificValidity } from './scientific-validity.mjs';
import { verifyInstitutionalForecastIssuance } from './institutional-forecast-issuance.mjs';
import {
  openInstitutionalForecastRuntime,
  saveInstitutionalForecastRuntime,
  seedInstitutionalForecastRuntimeFromEpisodes,
  issueInstitutionalForecast,
  observeInstitutionalForecastRuntime,
  observeInstitutionalForecastOutcomePoint,
  recordCoverageProbeCalibration,
  forecastClaimAssumptionShadowDataset,
  evaluateForecastClaimAssumptionResearch,
  latestInstitutionalForecast,
  institutionalForecastRuntimeSummary,
  EPISODE_FORECAST_FEATURE_IDS
} from './institutional-forecast-runtime.mjs';

function episode(i){
  const ts=100_000+i*12*60*60_000;
  const vector={
    biasScore:(i%5)-2,
    pressureScore:30+(i%50),
    spreadBps:.5+(i%4)*.1,
    imbalance:((i%7)-3)/10,
    atrPct:.4+(i%5)*.1,
    realizedVolPct:.2+(i%4)*.05,
    volumeRatio:1+(i%3)*.2,
    emaGapPct:((i%5)-2)*.1,
    supportDistancePct:.5+(i%4)*.1,
    resistanceDistancePct:.7+(i%4)*.1,
    regime:i%2?'RANGE':'TREND_UP'
  };
  const outcomes={};
  for(const [bars,mins] of [['1',5],['3',15],['12',60],['36',180]]){
    const maturedAt=ts+mins*60_000;
    outcomes[bars]={
      maturedAt,
      observedAt:maturedAt+1000,
      returnPct:((i%9)-4)*.08*(mins/5),
      maxRisePct:.5,
      maxFallPct:-.4,
      realizedRangePct:.9
    };
  }
  return {
    id:'BTCUSDT:5m:'+ts,
    symbol:'BTCUSDT',
    interval:'5m',
    anchorCloseTime:ts,
    availableAt:ts+1000,
    entryPrice:65000+i,
    vector,
    outcomes
  };
}

function input(asOf=900_000_000,price=65000){
  const features=Object.fromEntries(EPISODE_FORECAST_FEATURE_IDS.map((id,i)=>[id,(i+1)/10]));
  const core={
    schemaVersion:'TCX_FORECAST_INPUT_ADAPTER_V1',
    symbol:'BTCUSDT',
    asOf,
    price,
    features,
    regimeId:'RANGE',
    regimeConfidence:.8,
    dataQuality:.95,
    guards:[{id:'MASTER_RESEARCH_SAFETY',status:'NORMAL',reasons:[]}],
    provenance:{
      envelopeHash:'a'.repeat(64),
      inputHash:'b'.repeat(64),
      source:'TCX_RESEARCH_ENVELOPE',
      featureSources:Object.fromEntries(EPISODE_FORECAST_FEATURE_IDS.map(id=>[id,'TCX_EPISODE_VECTOR_DERIVED']))
    },
    audit:{
      marketTimestamp:asOf-10,
      marketAvailableAt:asOf-5,
      blockedFutureExtras:0,
      rejectedExtras:0,
      duplicateMarketTruthCreated:false
    }
  };
  return {...core,inputFingerprint:sha256(core)};
}

function science(asOf=900_000_000,gate='PASS'){
  return evaluateScientificValidity({
    asOf,
    guards:[{
      id:'TEST_SCIENCE',
      required:true,
      report:{asOf,gate,executionMode:'SHADOW_ONLY'}
    }]
  });
}

function traceContext(inp){
  return {
    data:{
      fabricSeq:1,
      fabricTailHash:'c'.repeat(64),
      inputFingerprint:inp.inputFingerprint
    },
    release:{
      releaseId:'release-test',
      configHash:'d'.repeat(64)
    },
    researchState:{
      fingerprint:'e'.repeat(64),
      regime:inp.regimeId,
      epistemic:'DERIVED_RESEARCH_STATE'
    },
    evidence:[],
    contradictions:[],
    provenance:{source:'TEST',version:'1'}
  };
}

async function runtime(){
  const dir=await mkdtemp(path.join(os.tmpdir(),'tcx-forecast-runtime-'));
  return openInstitutionalForecastRuntime(path.join(dir,'runtime.json'),{
    config:{
      featureIds:[...EPISODE_FORECAST_FEATURE_IDS],
      horizons:[
        {id:'5m',horizonMs:300000,flatThreshold:.0008,topK:100,minSimilarity:.01,analogBandwidth:2,independenceWindowMs:300000},
        {id:'15m',horizonMs:900000,flatThreshold:.0015,topK:100,minSimilarity:.01,analogBandwidth:2,independenceWindowMs:900000}
      ],
      minTrainingCases:8,
      minRegimeCases:4,
      minAnalogCount:5,
      minAnalogEffectiveSamples:3,
      minAnalogIndependentEpisodes:3,
      minDataQuality:.5,
      minRegimeConfidence:.3,
      calibrationMinCases:500,
      reliabilityMinCases:500,
      intervalCalibrationMinCases:500,
      pathMinCompleteTrajectories:5,
      pathMinEffectiveSamples:3,
      pathTopK:60,
      pathMinSimilarity:.01
    }
  });
}

test('episode memory seeds point-in-time forecast history',async()=>{
  const r=await runtime();
  const episodes=Array.from({length:30},(_,i)=>episode(i));
  const seeded=seedInstitutionalForecastRuntimeFromEpisodes(r,episodes);
  assert.equal(seeded.addedRows,60);
  assert.equal(seeded.blockedFutureOutcome,0);
  assert.equal(r.engine.historySize(),60);
  const repeated=seedInstitutionalForecastRuntimeFromEpisodes(r,episodes);
  assert.equal(repeated.builtRows,0);
  assert.equal(repeated.addedRows,0);
});

test('runtime issues immutable institutional forecast and persists restart state',async()=>{
  const r=await runtime();
  seedInstitutionalForecastRuntimeFromEpisodes(r,Array.from({length:30},(_,i)=>episode(i)));
  const inp=input();
  const out=issueInstitutionalForecast(r,{
    input:inp,
    scientificValidity:science(inp.asOf,'PASS'),
    dataSafety:{state:'NORMAL'},
    researchValidity:{status:'VALID'},
    traceContext:traceContext(inp),
    generatedAt:inp.asOf+100
  });
  assert.equal(out.issuance.executionMode,'SHADOW_ONLY');
  assert.equal(out.issuance.canExecute,false);
  assert.ok(latestInstitutionalForecast(r,'BTCUSDT'));
  await saveInstitutionalForecastRuntime(r);

  const reopened=await openInstitutionalForecastRuntime(r.filePath,{config:r.engine.configSnapshot()});
  const summary=institutionalForecastRuntimeSummary(reopened);
  assert.equal(summary.healthy,true);
  assert.equal(summary.historyCases,60);
  assert.equal(summary.issuedForecasts,1);
});

test('issuance persistence deduplicates trace forecast/science and restores a valid full issuance',async()=>{
  const r=await runtime();
  seedInstitutionalForecastRuntimeFromEpisodes(r,Array.from({length:30},(_,i)=>episode(i)));
  const inp=input();
  const out=issueInstitutionalForecast(r,{
    input:inp,
    scientificValidity:science(inp.asOf,'PASS'),
    dataSafety:{state:'NORMAL'},
    researchValidity:{status:'VALID'},
    traceContext:traceContext(inp),
    generatedAt:inp.asOf+100
  });
  await saveInstitutionalForecastRuntime(r);
  const disk=JSON.parse(await readFile(r.filePath,'utf8'));
  assert.equal(disk.issuances.length,1);
  assert.equal(disk.issuances[0].persistenceEncoding,'TCX_FORECAST_ISSUANCE_DEDUP_V1');
  assert.equal('forecast' in disk.issuances[0].trace,false);
  assert.equal('science' in disk.issuances[0].trace,false);

  const reopened=await openInstitutionalForecastRuntime(r.filePath,{config:r.engine.configSnapshot()});
  assert.equal(reopened.issuances.length,1);
  assert.equal(reopened.issuances[0].trace.forecast.fingerprint,out.issuance.forecast.fingerprint);
  assert.equal(reopened.issuances[0].trace.science.fingerprint,out.issuance.scientificValidity.fingerprint);
  assert.ok(reopened.issuances[0].claimAssumptionSidecar);
  assert.equal(reopened.issuances[0].claimAssumptionSidecar.fingerprint,out.issuance.claimAssumptionSidecar.fingerprint);
  assert.equal(verifyInstitutionalForecastIssuance(reopened.issuances[0]).ok,true);
});

test('tracker persistence projects raw reports but preserves invalidation and counterfactual behavior after restart',async()=>{
  const r=await runtime();
  seedInstitutionalForecastRuntimeFromEpisodes(r,Array.from({length:30},(_,i)=>episode(i)));
  const inp=input();
  const issued=issueInstitutionalForecast(r,{
    input:inp,
    scientificValidity:science(inp.asOf,'PASS'),
    dataSafety:{state:'NORMAL'},
    researchValidity:{status:'VALID'},
    traceContext:traceContext(inp),
    generatedAt:inp.asOf+100
  });
  await saveInstitutionalForecastRuntime(r);

  const disk=JSON.parse(await readFile(r.filePath,'utf8'));
  const persistedReport=disk.intelligence.tracker.records[0].report;
  assert.equal(persistedReport.persistenceProjection,'TCX_TRACKER_REPORT_OPERATIONAL_V1');
  assert.equal('path' in persistedReport,false);
  assert.equal('models' in persistedReport.forecasts[0],false);
  assert.equal('analogs' in persistedReport.forecasts[0],false);

  const reopened=await openInstitutionalForecastRuntime(r.filePath,{config:r.engine.configSnapshot()});
  const cf=reopened.intelligence.counterfactual(issued.forecastId,{maxFeatures:2});
  assert.equal(cf.symbol,'BTCUSDT');
  assert.equal(cf.interpretation,'MODEL_SENSITIVITY_NOT_CAUSAL');

  const observed=observeInstitutionalForecastRuntime(reopened,{
    input:input(inp.asOf+60_000,inp.price*1.001),
    quality:1
  });
  assert.ok(observed.revisions.length>=1);
  assert.equal(reopened.intelligence.get(issued.forecastId).revisions.length,1);
});

test('matured journal outcome becomes Research Trace evaluation only after due time',async()=>{
  const r=await runtime();
  seedInstitutionalForecastRuntimeFromEpisodes(r,Array.from({length:30},(_,i)=>episode(i)));
  const inp=input();
  issueInstitutionalForecast(r,{
    input:inp,
    scientificValidity:science(inp.asOf,'PASS'),
    dataSafety:{state:'NORMAL'},
    researchValidity:{status:'VALID'},
    traceContext:traceContext(inp),
    generatedAt:inp.asOf+100
  });

  const before=observeInstitutionalForecastRuntime(r,{input:input(inp.asOf+60_000,65010)});
  assert.equal(before.evaluations.length,0);

  const due=observeInstitutionalForecastRuntime(r,{input:input(inp.asOf+300_000,65100)});
  assert.equal(due.evaluations.length,1);
  assert.equal(due.evaluations[0].evaluation.horizonId,'5m');
  assert.equal(due.evaluations[0].evaluation.traceId,due.evaluations[0].trace.traceId);
});

test('matured forecast outcome emits reconstructible claim-assumption forward-shadow observation',async()=>{
  const r=await runtime();
  seedInstitutionalForecastRuntimeFromEpisodes(r,Array.from({length:30},(_,i)=>episode(i)));
  const inp=input();
  const issued=issueInstitutionalForecast(r,{
    input:inp,
    scientificValidity:science(inp.asOf,'PASS'),
    dataSafety:{state:'NORMAL'},
    researchValidity:{status:'VALID'},
    traceContext:traceContext(inp),
    generatedAt:inp.asOf+100
  });
  assert.ok(issued.issuance.claimAssumptionSidecar);
  const due=observeInstitutionalForecastRuntime(r,{input:input(inp.asOf+300_000,65100)});
  assert.equal(due.evaluations.length,1);
  assert.ok(due.evaluations[0].claimAssumptionObservation);
  assert.equal(due.evaluations[0].claimAssumptionObservation.sidecarFingerprint,issued.issuance.claimAssumptionSidecar.fingerprint);
  assert.equal(due.evaluations[0].claimAssumptionObservation.semantics.doesNotInferAssumptionTruthFromOutcome,true);
  assert.equal(due.evaluations[0].claimAssumptionObservation.canInfluencePrimary,false);

  const dataset=forecastClaimAssumptionShadowDataset(r);
  assert.equal(dataset.observationCount,1);
  assert.equal(dataset.observations[0].fingerprint,due.evaluations[0].claimAssumptionObservation.fingerprint);
  assert.equal(dataset.persistenceSemantics,'RECONSTRUCTED_FROM_PERSISTED_ISSUANCES_AND_FORECAST_JOURNAL');
  assert.equal(dataset.prospectiveOnly,true);
  assert.equal(dataset.infersAssumptionTruth,false);
});

test('claim-assumption shadow dataset reconstructs after forecast runtime restart without a new truth store',async()=>{
  const r=await runtime();
  seedInstitutionalForecastRuntimeFromEpisodes(r,Array.from({length:30},(_,i)=>episode(i)));
  const inp=input();
  issueInstitutionalForecast(r,{
    input:inp,
    scientificValidity:science(inp.asOf,'PASS'),
    dataSafety:{state:'NORMAL'},
    researchValidity:{status:'VALID'},
    traceContext:traceContext(inp),
    generatedAt:inp.asOf+100
  });
  observeInstitutionalForecastRuntime(r,{input:input(inp.asOf+300_000,65100)});
  const before=forecastClaimAssumptionShadowDataset(r);
  assert.equal(before.observationCount,1);
  await saveInstitutionalForecastRuntime(r);

  const reopened=await openInstitutionalForecastRuntime(r.filePath,{config:r.engine.configSnapshot()});
  const after=forecastClaimAssumptionShadowDataset(reopened);
  assert.equal(after.observationCount,1);
  assert.equal(after.observations[0].fingerprint,before.observations[0].fingerprint);
  assert.equal(institutionalForecastRuntimeSummary(reopened).claimAssumptionSidecars,1);
});

test('runtime exposes claim-assumption research evaluator without PRIMARY authority',async()=>{
  const r=await runtime();
  seedInstitutionalForecastRuntimeFromEpisodes(r,Array.from({length:30},(_,i)=>episode(i)));
  const inp=input();
  const context=traceContext(inp);
  context.claimAssumptionDeclarations={
    assumptions:[{
      assumptionId:'CUSTOM-RUNTIME-ASSUMPTION',
      statement:'Custom runtime research assumption.',
      evidenceIds:[],
      requiresEvidence:false,
      availableAt:inp.asOf+100
    }],
    claims:[{
      claimId:'CUSTOM-RUNTIME-CLAIM',
      statement:'Custom runtime research claim.',
      epistemicClass:'INFERRED',
      required:false,
      assumptionIds:['CUSTOM-RUNTIME-ASSUMPTION'],
      evidenceIds:[],
      availableAt:inp.asOf+100
    }]
  };
  issueInstitutionalForecast(r,{
    input:inp,
    scientificValidity:science(inp.asOf,'PASS'),
    dataSafety:{state:'NORMAL'},
    researchValidity:{status:'VALID'},
    traceContext:context,
    generatedAt:inp.asOf+100
  });
  observeInstitutionalForecastRuntime(r,{input:input(inp.asOf+300_000,65100)});
  const report=evaluateForecastClaimAssumptionResearch(r,{
    config:{
      minObservations:20,
      minPrimaryFailures:10,
      minChallengerAlerts:5,
      minChallengerNonAlerts:5,
      minCustomDeclarationObservations:1,
      minConclusiveObservations:100
    }
  });
  assert.equal(report.proposalId,'CLAIM_ASSUMPTION_GRAPH');
  assert.equal(report.acceptedObservationCount,1);
  assert.equal(report.coverage.customDeclarationObservations,1);
  assert.equal(report.conclusion.state,'COLLECTING_ALERT_VARIATION');
  assert.equal(report.governance.conclusionDoesNotAutoPromote,true);
  assert.equal(report.governance.conclusionDoesNotAutoKill,true);
  assert.equal(report.canInfluencePrimary,false);
  assert.equal(report.canExecuteLive,false);
});

test('duplicate issuance is idempotent',async()=>{
  const r=await runtime();
  seedInstitutionalForecastRuntimeFromEpisodes(r,Array.from({length:30},(_,i)=>episode(i)));
  const inp=input();
  const args={
    input:inp,
    scientificValidity:science(inp.asOf,'PASS'),
    dataSafety:{state:'NORMAL'},
    researchValidity:{status:'VALID'},
    traceContext:traceContext(inp),
    generatedAt:inp.asOf+100
  };
  const a=issueInstitutionalForecast(r,args);
  const b=issueInstitutionalForecast(r,args);
  assert.equal(a.issuance.issuanceId,b.issuance.issuanceId);
  assert.equal(b.duplicate,true);
  assert.equal(r.issuances.length,1);
});

test('duplicate issuance fails closed when custom assumption sidecar diverges',async()=>{
  const r=await runtime();
  seedInstitutionalForecastRuntimeFromEpisodes(r,Array.from({length:30},(_,i)=>episode(i)));
  const inp=input();
  const a=traceContext(inp);
  a.claimAssumptionDeclarations={
    assumptions:[{
      assumptionId:'CUSTOM-A',
      statement:'Custom assumption A.',
      evidenceIds:[],
      requiresEvidence:false,
      availableAt:inp.asOf+100
    }]
  };
  issueInstitutionalForecast(r,{
    input:inp,
    scientificValidity:science(inp.asOf,'PASS'),
    dataSafety:{state:'NORMAL'},
    researchValidity:{status:'VALID'},
    traceContext:a,
    generatedAt:inp.asOf+100
  });

  const b=traceContext(inp);
  b.claimAssumptionDeclarations={
    assumptions:[{
      assumptionId:'CUSTOM-B',
      statement:'Different custom assumption B.',
      evidenceIds:[],
      requiresEvidence:false,
      availableAt:inp.asOf+100
    }]
  };
  assert.throws(()=>issueInstitutionalForecast(r,{
    input:inp,
    scientificValidity:science(inp.asOf,'PASS'),
    dataSafety:{state:'NORMAL'},
    researchValidity:{status:'VALID'},
    traceContext:b,
    generatedAt:inp.asOf+100
  }),/claim-assumption sidecar mismatch/);
  assert.equal(r.issuances.length,1);
});

test('corrupt persistence fails closed into recovered clean runtime',async()=>{
  const r=await runtime();
  await saveInstitutionalForecastRuntime(r);
  const {writeFile}=await import('node:fs/promises');
  await writeFile(r.filePath,'{bad json');
  const reopened=await openInstitutionalForecastRuntime(r.filePath,{config:r.engine.configSnapshot()});
  assert.equal(reopened.recoveredFromCorrupt,true);
  assert.ok(reopened.backupPath);
});


test('lightweight outcome point resolves without rebuilding research state',async()=>{
  const r=await runtime();
  seedInstitutionalForecastRuntimeFromEpisodes(r,Array.from({length:30},(_,i)=>episode(i)));
  const inp=input();
  issueInstitutionalForecast(r,{
    input:inp,
    scientificValidity:science(inp.asOf,'PASS'),
    dataSafety:{state:'NORMAL'},
    researchValidity:{status:'VALID'},
    traceContext:traceContext(inp),
    generatedAt:inp.asOf+100
  });

  const out=observeInstitutionalForecastOutcomePoint(r,{
    symbol:'BTCUSDT',
    timestamp:inp.asOf+300_000,
    price:65100,
    quality:1
  });
  assert.equal(out.evaluations.length,1);
  assert.equal(out.evaluations[0].evaluation.horizonId,'5m');
});


test('cold-start issuance remains serializable and fail-closed',async()=>{
  const r=await runtime();
  const inp=input();
  const out=issueInstitutionalForecast(r,{
    input:inp,
    scientificValidity:science(inp.asOf,'INSUFFICIENT'),
    dataSafety:{state:'NORMAL'},
    researchValidity:{status:'VALID'},
    traceContext:traceContext(inp),
    generatedAt:inp.asOf+100
  });
  assert.equal(out.issuance.executionMode,'SHADOW_ONLY');
  assert.equal(out.issuance.canExecute,false);
  assert.notEqual(out.issuance.admission.gate,'PASS');
  assert.doesNotThrow(()=>JSON.stringify(out.issuance));
  const serialized=JSON.stringify(out.issuance);
  assert.doesNotMatch(serialized,/Infinity|NaN/);
});

test('only matured raw horizon coverage outcomes feed the bootstrap calibrator',async()=>{
  const r=await runtime();
  const position={
    entryMode:'COVERAGE_PROBE',coverageEvidenceTier:'BOOTSTRAP_RAW_FORECAST',coverageDataSafety:'NORMAL',horizonOnlyExit:true,
    coverageHorizonGate:'ABSTAIN',coverageKey:'coverage-1',symbol:'BTCUSDT',
    status:'CLOSED',closeReason:'HORIZON_EXIT',execution:'SHADOW_ONLY',canExecuteLive:false,
    coverageProbabilityVector:{up:.50,down:.30,flat:.20},coverageFlatThreshold:.001,
    coverageForecastAsOf:1000,coverageRegimeId:'UNKNOWN',horizonMs:300_000,
    coverageReferencePrice:100,entryPrice:100,exitPrice:101,closedAt:301_000
  };
  const learned=recordCoverageProbeCalibration(r,{position,closeReason:'HORIZON_EXIT',resolvedPrice:101});
  assert.equal(learned.recorded,true);
  assert.equal(r.engine.calibration.rows.length,1);
  assert.ok(Math.abs(r.engine.calibration.rows[0].actualReturn-.01)<1e-12);
  assert.equal(r.engine.calibration.rows[0].quality,.5);
  assert.equal(recordCoverageProbeCalibration(r,{position,closeReason:'HORIZON_EXIT',resolvedPrice:101}).reason,'DUPLICATE_OUTCOME');
  assert.equal(recordCoverageProbeCalibration(r,{position:{...position,closeReason:'STOP_LOSS'},closeReason:'STOP_LOSS',resolvedPrice:101}).reason,'NOT_HORIZON_RESOLVED');
  assert.equal(recordCoverageProbeCalibration(r,{position:{...position,coverageEvidenceTier:'CALIBRATED'},closeReason:'HORIZON_EXIT',resolvedPrice:101}).reason,'NOT_RAW_BOOTSTRAP_EVIDENCE');
});

test('online forecast memories accept explicit bounded row caps',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'tcx-forecast-caps-'));
  const r=await openInstitutionalForecastRuntime(path.join(dir,'runtime.json'),{
    maxHistoryRows:700,maxJournalEntries:900,maxCalibrationRows:701,
    maxReliabilityRows:702,maxModelPerformanceRows:703,
    maxIntervalCalibrationRows:704,maxDriftRows:705
  });
  assert.equal(r.engine.maxHistoryRows,700);
  assert.equal(r.journal.maxEntries,900);
  assert.equal(r.engine.calibration.maxRows,701);
  assert.equal(r.engine.reliability.maxRows,702);
  assert.equal(r.engine.modelPerformance.maxRows,703);
  assert.equal(r.engine.intervalCalibration.maxRows,704);
  assert.equal(r.engine.drift.maxRows,705);
});

test('first persistence reports one-shot snapshot component byte profile',async()=>{
  const r=await runtime();
  seedInstitutionalForecastRuntimeFromEpisodes(r,Array.from({length:12},(_,i)=>episode(i)));
  const first=await saveInstitutionalForecastRuntime(r);
  assert.ok(first.componentProfile);
  assert.ok(first.componentProfile.engine.history>0);
  assert.ok(first.componentProfile.journal>0);
  assert.ok(first.componentProfile.intelligence.total>0);
  assert.ok(first.componentProfile.intelligence.trackerFields);
  assert.ok(Number.isInteger(first.componentProfile.intelligence.trackerFields.records));
  assert.ok(first.componentProfile.issuances>0);
  assert.ok(first.componentProfile.issuanceFields);
  const second=await saveInstitutionalForecastRuntime(r);
  assert.equal(second.componentProfile,null);
});

test('gzip snapshot migration loads legacy JSON, writes compressed target, and restores full state',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'tcx-forecast-gzip-'));
  const legacy=path.join(dir,'runtime.json');
  const target=path.join(dir,'runtime.v2.json.gz');

  const original=await openInstitutionalForecastRuntime(legacy);
  seedInstitutionalForecastRuntimeFromEpisodes(original,Array.from({length:30},(_,i)=>episode(i)));
  const inp=input();
  issueInstitutionalForecast(original,{
    input:inp,
    scientificValidity:science(inp.asOf,'PASS'),
    dataSafety:{state:'NORMAL'},
    researchValidity:{status:'VALID'},
    traceContext:traceContext(inp),
    generatedAt:inp.asOf+100
  });
  await saveInstitutionalForecastRuntime(original);

  const migrated=await openInstitutionalForecastRuntime(target,{
    legacyFilePath:legacy,
    snapshotCompression:'gzip',
    config:original.engine.configSnapshot()
  });
  assert.equal(migrated.migratedFromLegacyPath,legacy);
  assert.equal(migrated.issuances.length,1);
  const meta=await saveInstitutionalForecastRuntime(migrated);
  assert.equal(meta.encoding,'gzip');
  assert.ok(meta.bytes<meta.logicalBytes);

  const stored=await readFile(target);
  assert.equal(stored[0],0x1f);
  assert.equal(stored[1],0x8b);

  const reopened=await openInstitutionalForecastRuntime(target,{
    snapshotCompression:'gzip',
    config:original.engine.configSnapshot()
  });
  assert.equal(reopened.snapshotEncoding,'gzip');
  assert.equal(reopened.issuances.length,1);
  assert.equal(verifyInstitutionalForecastIssuance(reopened.issuances[0]).ok,true);
  assert.equal(reopened.engine.historySize(),original.engine.historySize());
});

test('persistence manifest binds main snapshot and all sidecar references to one verified generation',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'tcx-manifest-'));
  const file=path.join(dir,'runtime.json.gz');
  const r=await openInstitutionalForecastRuntime(file,{snapshotCompression:'gzip'});
  seedInstitutionalForecastRuntimeFromEpisodes(r,Array.from({length:30},(_,i)=>episode(i)));
  const firstInput=input();
  issueInstitutionalForecast(r,{
    input:firstInput,
    scientificValidity:science(firstInput.asOf,'PASS'),
    dataSafety:{state:'NORMAL'},
    researchValidity:{status:'VALID'},
    traceContext:traceContext(firstInput),
    generatedAt:firstInput.asOf+100
  });
  const first=await saveInstitutionalForecastRuntime(r);
  assert.equal(first.persistenceManifest.status,'VERIFIED');
  const firstIssuance={...first.issuanceStore};

  const secondInput=input(firstInput.asOf+60_000,firstInput.price*1.001);
  issueInstitutionalForecast(r,{
    input:secondInput,
    scientificValidity:science(secondInput.asOf,'PASS'),
    dataSafety:{state:'NORMAL'},
    researchValidity:{status:'VALID'},
    traceContext:traceContext(secondInput),
    generatedAt:secondInput.asOf+100
  });
  const second=await saveInstitutionalForecastRuntime(r);
  assert.equal(second.persistenceManifest.status,'VERIFIED');
  assert.notEqual(second.persistenceManifest.generationId,first.persistenceManifest.generationId);

  const reopened=await openInstitutionalForecastRuntime(file,{
    snapshotCompression:'gzip',
    config:r.engine.configSnapshot()
  });
  assert.equal(reopened.persistenceManifestStatus,'VERIFIED');
  assert.equal(reopened.persistenceGenerationId,second.persistenceManifest.generationId);

  // Simulate a valid-but-stale sidecar reference from the previous generation.
  // Without the generation manifest, the old sidecar's own hash would still be valid.
  const main=JSON.parse(gunzipSync(await readFile(file)).toString('utf8'));
  main.issuanceStore=firstIssuance;
  await writeFile(file,gzipSync(Buffer.from(JSON.stringify(main),'utf8'),{level:1}),{mode:0o600});

  const rejected=await openInstitutionalForecastRuntime(file,{
    snapshotCompression:'gzip',
    config:r.engine.configSnapshot()
  });
  assert.equal(rejected.recoveredFromCorrupt,true);
  assert.match(rejected.lastError,/manifest component reference mismatch/);
});

test('gzip persistence externalizes learning journal and restores entries without replaying memory',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'tcx-journal-store-'));
  const file=path.join(dir,'runtime.json.gz');
  const r=await openInstitutionalForecastRuntime(file,{snapshotCompression:'gzip'});
  seedInstitutionalForecastRuntimeFromEpisodes(r,Array.from({length:30},(_,i)=>episode(i)));
  const inp=input();
  issueInstitutionalForecast(r,{
    input:inp,
    scientificValidity:science(inp.asOf,'PASS'),
    dataSafety:{state:'NORMAL'},
    researchValidity:{status:'VALID'},
    traceContext:traceContext(inp),
    generatedAt:inp.asOf+100
  });
  assert.ok(r.journal.entries.length>0);
  const before=JSON.parse(JSON.stringify(r.journal.entries));
  const engineRowsBefore={
    calibration:r.engine.calibration.rows.length,
    reliability:r.engine.reliability.rows.length,
    modelPerformance:r.engine.modelPerformance.rows.length,
    interval:r.engine.intervalCalibration.rows.length,
    drift:r.engine.drift.rows.length
  };

  const meta=await saveInstitutionalForecastRuntime(r);
  assert.ok(meta.journalStore);
  assert.equal(meta.journalStore.count,before.length);
  assert.ok(meta.journalStore.storageBytes<meta.journalStore.logicalBytes);
  const journalSidecar=file+'.journal.'+meta.journalStore.slot+'.json.gz';
  const logicalJournal=gunzipSync(await readFile(journalSidecar)).toString('utf8');
  assert.equal(Buffer.byteLength(logicalJournal),meta.journalStore.logicalBytes);
  assert.equal(sha256(logicalJournal),meta.journalStore.sha256);

  const main=JSON.parse(gunzipSync(await readFile(file)).toString('utf8'));
  assert.deepEqual(main.journal.entries,[]);
  assert.equal(main.journalStore.count,before.length);

  const reopened=await openInstitutionalForecastRuntime(file,{
    snapshotCompression:'gzip',
    config:r.engine.configSnapshot()
  });
  assert.deepEqual(JSON.parse(JSON.stringify(reopened.journal.entries)),before);
  assert.equal(reopened.journalStoreCount,before.length);
  assert.deepEqual({
    calibration:reopened.engine.calibration.rows.length,
    reliability:reopened.engine.reliability.rows.length,
    modelPerformance:reopened.engine.modelPerformance.rows.length,
    interval:reopened.engine.intervalCalibration.rows.length,
    drift:reopened.engine.drift.rows.length
  },engineRowsBefore);
});

test('gzip persistence externalizes engine learning memories and restores them losslessly',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'tcx-engine-store-'));
  const file=path.join(dir,'runtime.json.gz');
  const r=await openInstitutionalForecastRuntime(file,{snapshotCompression:'gzip'});
  seedInstitutionalForecastRuntimeFromEpisodes(r,Array.from({length:40},(_,i)=>episode(i)));
  const before={
    history:r.engine.history.length,
    calibration:r.engine.calibration.rows.length,
    reliability:r.engine.reliability.rows.length,
    modelPerformance:r.engine.modelPerformance.rows.length,
    interval:r.engine.intervalCalibration.rows.length,
    drift:r.engine.drift.rows.length
  };
  assert.ok(before.history>0);

  const meta=await saveInstitutionalForecastRuntime(r);
  assert.ok(meta.engineStore);
  assert.ok(meta.engineStore.logicalBytes>0);
  assert.ok(meta.engineStore.storageBytes<meta.engineStore.logicalBytes);
  const engineSidecar=file+'.engine.'+meta.engineStore.slot+'.json.gz';
  const logicalEngine=gunzipSync(await readFile(engineSidecar)).toString('utf8');
  assert.equal(Buffer.byteLength(logicalEngine),meta.engineStore.logicalBytes);
  assert.equal(sha256(logicalEngine),meta.engineStore.sha256);

  const main=JSON.parse(gunzipSync(await readFile(file)).toString('utf8'));
  assert.ok(main.engineStore);
  assert.deepEqual(Object.keys(main.engine).sort(),['config']);
  assert.equal('history' in main.engine,false);

  const reopened=await openInstitutionalForecastRuntime(file,{
    snapshotCompression:'gzip',
    config:r.engine.configSnapshot()
  });
  assert.equal(reopened.engine.history.length,before.history);
  assert.equal(reopened.engine.calibration.rows.length,before.calibration);
  assert.equal(reopened.engine.reliability.rows.length,before.reliability);
  assert.equal(reopened.engine.modelPerformance.rows.length,before.modelPerformance);
  assert.equal(reopened.engine.intervalCalibration.rows.length,before.interval);
  assert.equal(reopened.engine.drift.rows.length,before.drift);
  assert.ok(['a','b'].includes(reopened.engineStoreSlot));
});

test('gzip persistence externalizes tracker issue-state and revision history losslessly',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'tcx-tracker-archive-'));
  const file=path.join(dir,'runtime.json.gz');
  const r=await openInstitutionalForecastRuntime(file,{snapshotCompression:'gzip'});
  seedInstitutionalForecastRuntimeFromEpisodes(r,Array.from({length:30},(_,i)=>episode(i)));
  const inp=input();
  const issued=issueInstitutionalForecast(r,{
    input:inp,
    scientificValidity:science(inp.asOf,'PASS'),
    dataSafety:{state:'NORMAL'},
    researchValidity:{status:'VALID'},
    traceContext:traceContext(inp),
    generatedAt:inp.asOf+100
  });
  observeInstitutionalForecastRuntime(r,{
    input:input(inp.asOf+60_000,inp.price*1.001),
    quality:1
  });
  observeInstitutionalForecastRuntime(r,{
    input:input(inp.asOf+120_000,inp.price*.999),
    quality:1
  });

  const before=r.intelligence.get(issued.forecastId);
  assert.equal(before.revisions.length,2);
  assert.ok(before.issueState);

  const meta=await saveInstitutionalForecastRuntime(r);
  assert.ok(meta.trackerArchive);
  assert.equal(meta.trackerArchive.recordCount,1);
  assert.equal(meta.trackerArchive.revisionCount,2);
  assert.ok(meta.trackerArchive.storageBytes<meta.trackerArchive.logicalBytes);
  const trackerSidecar=file+'.tracker.'+meta.trackerArchive.slot+'.json.gz';
  const logicalTracker=gunzipSync(await readFile(trackerSidecar)).toString('utf8');
  assert.equal(Buffer.byteLength(logicalTracker),meta.trackerArchive.logicalBytes);
  assert.equal(sha256(logicalTracker),meta.trackerArchive.sha256);
  assert.equal(JSON.parse(logicalTracker).records.length,1);

  const main=JSON.parse(gunzipSync(await readFile(file)).toString('utf8'));
  const persisted=main.intelligence.tracker.records[0];
  assert.equal(persisted.issueState,null);
  assert.deepEqual(persisted.revisions,[]);
  assert.equal(main.trackerArchive.revisionCount,2);

  const reopened=await openInstitutionalForecastRuntime(file,{
    snapshotCompression:'gzip',
    config:r.engine.configSnapshot()
  });
  const restored=reopened.intelligence.get(issued.forecastId);
  assert.equal(restored.revisions.length,2);
  assert.equal(restored.issueState.inputFingerprint,before.issueState.inputFingerprint);
  assert.deepEqual(restored.revisions,JSON.parse(JSON.stringify(before.revisions)));
  const cf=reopened.intelligence.counterfactual(issued.forecastId,{maxFeatures:2});
  assert.equal(cf.interpretation,'MODEL_SENSITIVITY_NOT_CAUSAL');
});

test('gzip persistence bypasses full intelligence snapshot materialization',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'tcx-hot-view-'));
  const file=path.join(dir,'runtime.json.gz');
  const r=await openInstitutionalForecastRuntime(file,{snapshotCompression:'gzip'});
  seedInstitutionalForecastRuntimeFromEpisodes(r,Array.from({length:30},(_,i)=>episode(i)));
  const inp=input();
  issueInstitutionalForecast(r,{
    input:inp,
    scientificValidity:science(inp.asOf,'PASS'),
    dataSafety:{state:'NORMAL'},
    researchValidity:{status:'VALID'},
    traceContext:traceContext(inp),
    generatedAt:inp.asOf+100
  });
  const originalSnapshot=r.intelligence.snapshot;
  r.intelligence.snapshot=()=>{ throw new Error('FULL_INTELLIGENCE_SNAPSHOT_MUST_NOT_RUN'); };
  const meta=await saveInstitutionalForecastRuntime(r);
  r.intelligence.snapshot=originalSnapshot;
  assert.equal(meta.encoding,'gzip');
  assert.equal(meta.issuanceStore.count,1);
  assert.equal(meta.trackerArchive.recordCount,1);

  const main=JSON.parse(gunzipSync(await readFile(file)).toString('utf8'));
  assert.deepEqual(main.issuances,[]);
  assert.equal(main.intelligence.tracker.records.length,1);
  assert.equal(main.intelligence.tracker.records[0].issueState,null);
  assert.deepEqual(main.intelligence.tracker.records[0].revisions,[]);
});

test('gzip persistence externalizes immutable issuances into an atomic A/B sidecar and restores them',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'tcx-forecast-sidecar-'));
  const file=path.join(dir,'runtime.json.gz');
  const r=await openInstitutionalForecastRuntime(file,{snapshotCompression:'gzip'});
  seedInstitutionalForecastRuntimeFromEpisodes(r,Array.from({length:30},(_,i)=>episode(i)));
  const inp=input();
  const issued=issueInstitutionalForecast(r,{
    input:inp,
    scientificValidity:science(inp.asOf,'PASS'),
    dataSafety:{state:'NORMAL'},
    researchValidity:{status:'VALID'},
    traceContext:traceContext(inp),
    generatedAt:inp.asOf+100
  });

  const meta=await saveInstitutionalForecastRuntime(r);
  assert.equal(meta.encoding,'gzip');
  assert.ok(meta.issuanceStore);
  assert.equal(meta.issuanceStore.count,1);
  assert.ok(meta.issuanceStore.logicalBytes>0);
  assert.ok(meta.issuanceStore.storageBytes<meta.issuanceStore.logicalBytes);
  const sidecarPath=file+'.issuances.'+meta.issuanceStore.slot+'.json.gz';
  const logicalSidecar=gunzipSync(await readFile(sidecarPath)).toString('utf8');
  assert.equal(Buffer.byteLength(logicalSidecar),meta.issuanceStore.logicalBytes);
  assert.equal(sha256(logicalSidecar),meta.issuanceStore.sha256);
  assert.equal(JSON.parse(logicalSidecar).issuances.length,1);

  const reopened=await openInstitutionalForecastRuntime(file,{
    snapshotCompression:'gzip',
    config:r.engine.configSnapshot()
  });
  assert.equal(reopened.issuances.length,1);
  assert.equal(reopened.issuances[0].issuanceId,issued.issuance.issuanceId);
  assert.equal(verifyInstitutionalForecastIssuance(reopened.issuances[0]).ok,true);
  assert.equal(reopened.issuanceStoreCount,1);
  assert.ok(['a','b'].includes(reopened.issuanceStoreSlot));

  const second=await saveInstitutionalForecastRuntime(reopened);
  assert.equal(second.issuanceStore.sha256,meta.issuanceStore.sha256);
  assert.equal(second.issuanceStore.slot,meta.issuanceStore.slot);
});

test('snapshot writer enforces the same byte ceiling as reload and preserves the last valid file',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'tcx-forecast-contract-'));
  const file=path.join(dir,'runtime.json');
  const r=await openInstitutionalForecastRuntime(file,{maxSnapshotBytes:64*1024});
  const first=await saveInstitutionalForecastRuntime(r);
  assert.ok(first.bytes<64*1024);
  const baseline=await readFile(file,'utf8');
  r.issuances=[{issuanceId:'oversize-test',payload:'x'.repeat(128*1024)}];
  await assert.rejects(
    ()=>saveInstitutionalForecastRuntime(r),
    err=>err?.code==='TCX_RUNTIME_SNAPSHOT_TOO_LARGE_TO_PERSIST'&&err.bytes>err.maxSnapshotBytes
  );
  assert.equal(await readFile(file,'utf8'),baseline);
  assert.equal(r.healthy,false);
});

test('oversized legacy snapshot recovery is distinguished from corruption and written forward',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'tcx-forecast-oversize-'));
  const file=path.join(dir,'runtime.json');
  await writeFile(file,' '.repeat(2048));
  const r=await openInstitutionalForecastRuntime(file,{maxSnapshotBytes:1024});
  assert.equal(r.healthy,true);
  assert.equal(r.recoveredFromCorrupt,false);
  assert.equal(r.recoveredFromOversizedSnapshot,true);
  assert.match(r.backupPath,/\.oversized-/);
  const summary=institutionalForecastRuntimeSummary(r);
  assert.equal(summary.recoveredFromOversizedSnapshot,true);
});


test('analogue selection reserves independent episodes before similarity fill',()=>{
  const windowMs=5*60_000;
  const crowded=Array.from({length:12},(_,i)=>({
    row:{id:'crowded-'+i,timestamp:i*1000,forwardReturn:i/1000},
    similarity:.99-i*.001,
    weight:.98-i*.001
  }));
  const independent=Array.from({length:10},(_,i)=>({
    row:{id:'independent-'+i,timestamp:(i+1)*windowMs,forwardReturn:-i/1000},
    similarity:.88-i*.005,
    weight:.80-i*.005
  }));
  const result=selectIndependenceAwareAnalogs([...crowded,...independent],{
    topK:8,
    windowMs,
    minIndependentEpisodes:3
  });
  assert.equal(result.rows.length,8);
  assert.equal(result.policy,'INDEPENDENCE_AWARE_TOPK_V1');
  assert.ok(result.reservedIndependentEpisodes>=6);
  assert.ok(result.rows.some(x=>x.row.id==='crowded-0'));

  const times=result.rows.map(x=>x.row.timestamp).sort((a,b)=>a-b);
  let episodes=0,start=null;
  for(const ts of times){
    if(start==null||ts-start>=windowMs){episodes++;start=ts;}
  }
  assert.ok(episodes>=6);
});

test('analogue diversity selection is outcome-blind',()=>{
  const make=(flip=false)=>Array.from({length:12},(_,i)=>({
    row:{id:'a-'+i,timestamp:i*5*60_000,forwardReturn:flip?-1000+i:1000-i},
    similarity:.95-i*.01,
    weight:.90-i*.01
  }));
  const a=selectIndependenceAwareAnalogs(make(false),{topK:6,windowMs:5*60_000,minIndependentEpisodes:3});
  const b=selectIndependenceAwareAnalogs(make(true),{topK:6,windowMs:5*60_000,minIndependentEpisodes:3});
  assert.deepEqual(a.rows.map(x=>x.row.id),b.rows.map(x=>x.row.id));
});


test('gzip sidecar hashing is stable when a live journal row changes between serializations',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'tcx-stable-stream-'));
  const file=path.join(dir,'runtime.json.gz');
  const r=await openInstitutionalForecastRuntime(file,{snapshotCompression:'gzip'});
  r.snapshotProfilePending=false;
  let reads=0;
  const row={};
  Object.defineProperty(row,'unstable',{
    enumerable:true,
    get(){ reads+=1; return reads; }
  });
  r.journal.entries.push(row);

  const meta=await saveInstitutionalForecastRuntime(r);
  assert.equal(meta.journalStore.count,1);
  assert.equal(r.healthy,true);
  assert.equal(r.lastError,null);
  assert.equal(reads,1);
});
