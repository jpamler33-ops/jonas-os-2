import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildBiggjSignalLab,
  verifyBiggjSignalLab,
  renderBiggjSignalLab,
  buildBiggjProofFeed,
  verifyBiggjProofFeed,
  renderBiggjProofFeed,
  signalLabKeyboard
} from './biggj-signal-lab.mjs';
import { ForecastLearningJournal, verifyForecastJournalProofCommitment } from './forecast-runtime/forecast/journal.js';

function issuance({probabilityDisplayAllowed=true,calibration='CALIBRATED'}={}){
  return {
    symbol:'BTCUSDT',
    asOf:1_000,
    generatedAt:1_100,
    issuanceId:'iss-1',
    traceId:'trace-1',
    gate:'PASS',
    probabilityDisplayAllowed,
    executionMode:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecute:false,
    forecast:{
      horizons:[{
        horizonId:'1h',horizonMs:3_600_000,gate:'PASS',direction:'UP',
        expectedReturn:.012,
        probabilities:{up:.68,down:.20,flat:.12},
        interval:{q10:-.006,q90:.026},
        calibration:{status:calibration},
        reasons:['MTF alignment'],
        warnings:[]
      }]
    }
  };
}

function accuracy(status='CALIBRATED'){
  return {
    ready:true,
    gate:{status,passed:status==='CALIBRATED'},
    evaluation:{resolvedCount:140}
  };
}

function journalEngineStub(){
  const sink={add(){}};
  return {drift:sink,calibration:sink,reliability:sink,intervalCalibration:sink,modelPerformance:sink};
}
function journalForecast(){
  return {
    symbol:'BTCUSDT',asOf:1_000,price:100,
    forecasts:[{
      horizonId:'1h',horizonMs:3_600_000,flatThreshold:0,gate:'PASS',direction:'UP',
      probabilities:{up:.7,down:.2,flat:.1},expectedReturn:.01,
      interval:{q10:-.01,q90:.03},rawInterval:{q10:-.01,q90:.03,median:.01},
      operationalConfidence:.7,models:[]
    }]
  };
}
function journalInput(){
  return {symbol:'BTCUSDT',asOf:1_000,regimeId:'RANGE',features:{x:1},dataQuality:1};
}

test('signal lab only exposes probability after all calibration display gates pass',()=>{
  const x=buildBiggjSignalLab({
    symbol:'BTCUSDT',
    issuance:issuance(),
    setup:{status:'READY',direction:'UP',evidence:.82,eventRows:[]},
    risk:{status:'NORMAL',reasons:[]},
    accuracy:accuracy(),
    horizonId:'1h',
    asOf:2_000
  });
  assert.equal(x.state,'WATCH_STRONG');
  assert.equal(x.probability.displayAllowed,true);
  assert.equal(x.probability.calibrated,.68);
  assert.equal(x.safety.action,'ABSTAIN');
  assert.equal(verifyBiggjSignalLab(x).ok,true);
  assert.match(renderBiggjSignalLab(x),/68\.0% calibrated/);
});

test('signal lab suppresses raw probabilities if calibration gate is not ready',()=>{
  const x=buildBiggjSignalLab({
    symbol:'BTCUSDT',
    issuance:issuance({probabilityDisplayAllowed:false}),
    setup:{status:'READY',direction:'UP',evidence:.82,eventRows:[]},
    risk:{status:'NORMAL',reasons:[]},
    accuracy:accuracy(),
    horizonId:'1h',
    asOf:2_000
  });
  assert.equal(x.probability.displayAllowed,false);
  assert.equal(x.probability.calibrated,null);
  assert.equal(verifyBiggjSignalLab(x).ok,true);
  assert.doesNotMatch(renderBiggjSignalLab(x),/68\.0% calibrated/);
});

test('high risk or missing forecast fails closed to ABSTAIN',()=>{
  const risky=buildBiggjSignalLab({
    symbol:'BTCUSDT',
    issuance:issuance(),
    setup:{status:'READY',direction:'UP',evidence:.8,eventRows:[]},
    risk:{status:'HIGH',reasons:['test risk']},
    accuracy:accuracy(),
    asOf:2_000
  });
  assert.equal(risky.state,'ABSTAIN');
  const missing=buildBiggjSignalLab({symbol:'ETHUSDT',asOf:2_000});
  assert.equal(missing.state,'ABSTAIN');
});

test('legacy resolved rows remain visible but are not misrepresented as forecast-time proof',()=>{
  const rows=[{
    id:'legacy',symbol:'BTCUSDT',horizonId:'1h',horizonMs:3600000,asOf:1000,dueAt:3601000,startPrice:100,
    regimeId:'RANGE',gate:'PASS',direction:'UP',probabilities:{up:.7,down:.2,flat:.1},
    expectedReturn:.01,interval:{q10:-.01,q90:.03},operationalConfidence:.7,status:'RESOLVED',
    resolution:{resolvedAt:3601000,resolvedPrice:102,actualReturn:.02,actualDirection:'UP',topCorrect:true,intervalMiss:false}
  }];
  const feed=buildBiggjProofFeed(rows,{asOf:4_000_000});
  assert.equal(feed.counts.resolved,1);
  assert.equal(feed.counts.legacy,1);
  assert.equal(feed.counts.committed,0);
  assert.equal(feed.rows[0].commitmentState,'LEGACY_UNCOMMITTED');
  assert.equal(feed.rows[0].beforeHash,null);
  assert.equal(feed.rows[0].outcomeHash,null);
  assert.match(renderBiggjProofFeed(feed),/LEGACY UNCOMMITTED/);
});

test('new journal forecasts are committed before outcome and proof feed binds resolution to that commitment',()=>{
  const journal=new ForecastLearningJournal(journalEngineStub());
  journal.record(journalInput(),journalForecast());
  const pending=journal.entries[0];
  assert.equal(verifyForecastJournalProofCommitment(pending).status,'VERIFIED');
  assert.equal(pending.status,'PENDING');
  const committed=pending.proofCommitment;
  journal.observe({symbol:'BTCUSDT',timestamp:3_601_000,price:102,quality:1});
  const resolved=journal.all()[0];
  assert.equal(resolved.proofCommitment,committed);
  assert.equal(resolved.status,'RESOLVED');
  const feed=buildBiggjProofFeed(journal.all(),{asOf:4_000_000});
  assert.equal(feed.counts.committed,1);
  assert.equal(feed.counts.verifiedHits,1);
  assert.equal(feed.rows[0].commitmentState,'VERIFIED');
  assert.equal(feed.rows[0].beforeHash,committed);
  assert.equal(feed.rows[0].outcomeHash.length,64);
  assert.equal(verifyBiggjProofFeed(feed).ok,true);
  assert.match(renderBiggjProofFeed(feed),/FORECAST-TIME COMMITTED/);
});

test('journal detects forecast-field tampering before resolution and refuses to learn from it',()=>{
  const journal=new ForecastLearningJournal(journalEngineStub());
  journal.record(journalInput(),journalForecast());
  journal.entries[0].direction='DOWN';
  journal.observe({symbol:'BTCUSDT',timestamp:3_601_000,price:102,quality:1});
  assert.equal(journal.entries[0].status,'PROOF_INVALID');
  assert.equal(journal.entries[0].proofIntegrity,'MISMATCH');
  assert.equal(journal.lightweightStats().proofInvalid,1);
});

test('Signal Lab evidence lenses are explicit and insufficient specialized context fails closed',()=>{
  const flow=buildBiggjSignalLab({
    symbol:'BTCUSDT',issuance:issuance(),setup:{status:'READY',direction:'UP',evidence:.8,eventRows:[]},
    risk:{status:'NORMAL',reasons:[]},accuracy:accuracy(),mode:'FLOW',
    modeContext:{flow:{state:'BID_PRESSURE',imbalance:.2,pressureScore:61}},asOf:2_000
  });
  assert.equal(flow.modeView.status,'AVAILABLE');
  assert.equal(flow.state,'WATCH_STRONG');
  assert.match(renderBiggjSignalLab(flow),/FOCUS EVIDENCE/);

  const macro=buildBiggjSignalLab({
    symbol:'BTCUSDT',issuance:issuance(),setup:{status:'READY',direction:'UP',evidence:.8,eventRows:[]},
    risk:{status:'NORMAL',reasons:[]},accuracy:accuracy(),mode:'MACRO',asOf:2_000
  });
  assert.equal(macro.modeView.status,'INSUFFICIENT');
  assert.equal(macro.state,'ABSTAIN');
  assert.equal(verifyBiggjSignalLab(macro).ok,true);
});

test('signal lab keyboard stays inside callback size limits',()=>{
  const kb=signalLabKeyboard('BTCUSDT','1h','LIQUIDITY');
  for(const row of kb.inline_keyboard)for(const b of row)if(b.callback_data)assert.ok(Buffer.byteLength(b.callback_data,'utf8')<=64);
});
