import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp } from 'node:fs/promises';

import { sha256 } from './institutional-kernel.mjs';
import { evaluateScientificValidity } from './scientific-validity.mjs';
import {
  openInstitutionalForecastRuntime,
  saveInstitutionalForecastRuntime,
  seedInstitutionalForecastRuntimeFromEpisodes,
  issueInstitutionalForecast,
  observeInstitutionalForecastRuntime,
  observeInstitutionalForecastOutcomePoint,
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
  const seeded=seedInstitutionalForecastRuntimeFromEpisodes(r,Array.from({length:30},(_,i)=>episode(i)));
  assert.equal(seeded.addedRows,60);
  assert.equal(seeded.blockedFutureOutcome,0);
  assert.equal(r.engine.historySize(),60);
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
