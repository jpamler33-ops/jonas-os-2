import test from 'node:test';
import assert from 'node:assert/strict';

import { ForecastRevisionTracker } from './forecast-runtime/forecast/revision_tracker.js';
import { ForecastLearningJournal } from './forecast-runtime/forecast/journal.js';
import { institutionalForecastRuntimeSummary } from './institutional-forecast-runtime.mjs';

function input(i=0){
  return {
    symbol:'BTCUSDT',
    asOf:1000+i*1000,
    price:100+i,
    regimeId:'TEST',
    features:{x:1},
    dataQuality:1
  };
}
function report(i=0){
  return {
    forecast:{
      symbol:'BTCUSDT',
      asOf:1000+i*1000,
      forecasts:[{horizonId:'5m',horizonMs:300_000}]
    },
    regimeTransition:{status:'STABLE'}
  };
}

test('tracker lightweight stats derive thesis counters without exporting full records',()=>{
  const t=new ForecastRevisionTracker({maxRecords:100});
  t.issue(input(),report());
  t.bindThesis('BTCUSDT:1000',{
    issueGraphFingerprint:'g1',
    eventCount:4,
    stabilityEventCount:3,
    assumptions:[
      {
        assumptionId:'A',
        issueSupported:true,
        currentSupported:false,
        stability:{state:'PERSISTENT_STALE'}
      },
      {
        assumptionId:'B',
        issueSupported:true,
        currentSupported:true,
        stability:{state:'TRANSIENT_FLICKER'}
      }
    ],
    fingerprint:'f1'
  });
  assert.deepEqual(t.lightweightStats(),{
    recordCount:1,
    thesisMemoryCount:1,
    thesisRevisionEvents:4,
    staleThesisForecasts:1,
    transientFlickerThesisForecasts:1,
    persistentStaleThesisForecasts:1,
    thesisStabilityEvents:3
  });
});

test('journal exposes minimal calibration rows without feature/model payloads',()=>{
  const j=new ForecastLearningJournal({}, {maxEntries:100});
  j.entries=[
    {
      id:'x',
      status:'RESOLVED',
      probabilities:{up:.7,down:.2,flat:.1},
      operationalConfidence:.8,
      resolution:{
        topCorrect:true,
        brier:.14,
        logLoss:.35,
        absoluteReturnError:.01,
        intervalMiss:false
      },
      features:{huge:'x'.repeat(1000)},
      models:[{large:'y'.repeat(1000)}]
    },
    {id:'p',status:'PENDING',features:{huge:'z'.repeat(1000)}},
    {id:'e',status:'EXPIRED'}
  ];
  assert.deepEqual(j.lightweightStats(),{total:3,pending:1,resolved:1,expired:1});
  const rows=j.probabilityCalibrationRows();
  assert.equal(rows.length,1);
  assert.deepEqual(rows[0],{
    status:'RESOLVED',
    probabilities:{up:.7,down:.2,flat:.1},
    operationalConfidence:.8,
    resolution:{
      topCorrect:true,
      brier:.14,
      logLoss:.35,
      absoluteReturnError:.01,
      intervalMiss:false
    }
  });
  assert.equal('features' in rows[0],false);
  assert.equal('models' in rows[0],false);
});

test('institutional summary never requires full journal or tracker clones',()=>{
  const calibrationRows=Array.from({length:100},()=>({
    status:'RESOLVED',
    probabilities:{up:.8,down:.1,flat:.1},
    operationalConfidence:.8,
    resolution:{
      topCorrect:true,
      brier:.06,
      logLoss:.2,
      absoluteReturnError:.01,
      intervalMiss:false
    }
  }));
  const runtime={
    healthy:true,
    recoveredFromCorrupt:false,
    engine:{historySize:()=>2000},
    journal:{
      all(){ throw new Error('FULL_JOURNAL_CLONE_FORBIDDEN_IN_SUMMARY'); },
      lightweightStats:()=>({total:1500,pending:20,resolved:1470,expired:10}),
      probabilityCalibrationRows:()=>calibrationRows
    },
    intelligence:{
      all(){ throw new Error('FULL_TRACKER_CLONE_FORBIDDEN_IN_SUMMARY'); },
      trackerStats:()=>({
        recordCount:400,
        thesisMemoryCount:350,
        thesisRevisionEvents:1200,
        staleThesisForecasts:40,
        transientFlickerThesisForecasts:10,
        persistentStaleThesisForecasts:25,
        thesisStabilityEvents:300
      })
    },
    issuances:[
      {claimAssumptionSidecar:{fingerprint:'a'}},
      {claimAssumptionSidecar:null}
    ]
  };
  const summary=institutionalForecastRuntimeSummary(runtime);
  assert.equal(summary.journalEntries,1500);
  assert.equal(summary.pendingOutcomes,20);
  assert.equal(summary.resolvedClaimAssumptionEligible,1470);
  assert.equal(summary.trackedForecasts,400);
  assert.equal(summary.trackedThesisMemories,350);
  assert.equal(summary.thesisRevisionEvents,1200);
  assert.equal(summary.staleThesisForecasts,40);
  assert.equal(summary.transientFlickerThesisForecasts,10);
  assert.equal(summary.persistentStaleThesisForecasts,25);
  assert.equal(summary.thesisStabilityEvents,300);
  assert.equal(summary.probabilityCalibration.metrics.count,100);
  assert.equal(summary.executionMode,'SHADOW_ONLY');
  assert.equal(summary.canExecute,false);
});
