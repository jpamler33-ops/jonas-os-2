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
import {
  ForecastLearningJournal,
  FORECAST_JOURNAL_PROOF_COMMITMENT_VERSION,
  forecastJournalProofCommitment,
  verifyForecastJournalProofCommitment
} from './forecast-runtime/forecast/journal.js';

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

function committedRow(row){
  const out=structuredClone(row);
  out.proofCommitmentVersion=FORECAST_JOURNAL_PROOF_COMMITMENT_VERSION;
  out.proofCommitment=forecastJournalProofCommitment(out);
  out.proofIntegrity='VERIFIED_AT_RECORD';
  return out;
}
function journalEngineStub(){
  const sink={add(){}};
  return {drift:sink,calibration:sink,reliability:sink,intervalCalibration:sink,modelPerformance:sink};
}
function journalInput(){
  return {symbol:'BTCUSDT',asOf:1_000,regimeId:'RANGE',features:{x:1},dataQuality:1};
}
function journalReport(){
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

test('proof feed includes hits and misses and binds outcome to forecast commitment',()=>{
  const rows=[
    committedRow({
      id:'a',symbol:'BTCUSDT',horizonId:'1h',horizonMs:3600000,flatThreshold:0,asOf:1000,dueAt:3601000,startPrice:100,
      regimeId:'RANGE',dataQuality:1,gate:'PASS',direction:'UP',probabilities:{up:.7,down:.2,flat:.1},
      expectedReturn:.01,interval:{q10:-.01,q90:.03},operationalConfidence:.7,status:'RESOLVED',
      resolution:{resolvedAt:3601000,resolvedPrice:102,actualReturn:.02,actualDirection:'UP',topCorrect:true,intervalMiss:false}
    }),
    committedRow({
      id:'b',symbol:'ETHUSDT',horizonId:'1h',horizonMs:3600000,flatThreshold:0,asOf:2000,dueAt:3602000,startPrice:100,
      regimeId:'RANGE',dataQuality:1,gate:'PASS',direction:'DOWN',probabilities:{up:.1,down:.8,flat:.1},
      expectedReturn:-.01,interval:{q10:-.03,q90:.01},operationalConfidence:.8,status:'RESOLVED',
      resolution:{resolvedAt:3602000,resolvedPrice:102,actualReturn:.02,actualDirection:'UP',topCorrect:false,intervalMiss:true}
    })
  ];
  const feed=buildBiggjProofFeed(rows,{asOf:4_000_000});
  assert.equal(feed.counts.resolved,2);
  assert.equal(feed.counts.hits,1);
  assert.equal(feed.counts.misses,1);
  assert.equal(feed.policy.includesLosses,true);
  assert.equal(feed.rows[0].beforeHash.length,64);
  assert.equal(feed.rows[0].outcomeHash.length,64);
  assert.equal(verifyBiggjProofFeed(feed).ok,true);
  const text=renderBiggjProofFeed(feed);
  assert.match(text,/HIT/);
  assert.match(text,/MISS/);
  assert.match(text,/keine Cherry-Pick-Policy/);
});

test('signal lab keyboard stays inside callback size limits',()=>{
  const kb=signalLabKeyboard('BTCUSDT','1h');
  for(const row of kb.inline_keyboard)for(const b of row)if(b.callback_data)assert.ok(Buffer.byteLength(b.callback_data,'utf8')<=64);
});


test('mode lenses filter structured evidence without recomputing the canonical forecast',()=>{
  const base=issuance();
  const withTrace={
    ...base,
    trace:{
      evidence:[
        {type:'DERIVATIVES',detail:'Funding negative while open interest expands'},
        {type:'MACRO',detail:'Treasury yield pressure rising'}
      ],
      contradictions:[]
    }
  };
  const flow=buildBiggjSignalLab({
    symbol:'BTCUSDT',
    issuance:withTrace,
    setup:{status:'READY',direction:'UP',evidence:.82,eventRows:[{type:'BREAK_OF_STRUCTURE',detail:'higher high'}]},
    risk:{status:'NORMAL',reasons:[]},
    accuracy:accuracy(),
    horizonId:'1h',
    mode:'FLOW',
    asOf:2_000
  });
  const structure=buildBiggjSignalLab({
    symbol:'BTCUSDT',
    issuance:withTrace,
    setup:{status:'READY',direction:'UP',evidence:.82,eventRows:[{type:'BREAK_OF_STRUCTURE',detail:'higher high'}]},
    risk:{status:'NORMAL',reasons:[]},
    accuracy:accuracy(),
    horizonId:'1h',
    mode:'STRUCTURE',
    asOf:2_000
  });
  assert.equal(flow.bias,structure.bias);
  assert.equal(flow.probability.calibrated,structure.probability.calibrated);
  assert.equal(flow.modeLens.semantics.includes('does not recompute'),true);
  assert.ok(flow.modeLens.items.some(x=>/Funding|open interest/i.test(x.text)));
  assert.ok(structure.modeLens.items.some(x=>/BREAK_OF_STRUCTURE|higher high/i.test(x.text)));
  assert.equal(verifyBiggjSignalLab(flow).ok,true);
  assert.match(renderBiggjSignalLab(flow),/MODE LENS · FLOW/);
});

test('proof lifecycle exposes live before-hash and marks learned only after aggregate learning inclusion',()=>{
  const entries=[
    committedRow({
      id:'live-1',symbol:'BTCUSDT',horizonId:'1h',horizonMs:3600000,flatThreshold:0,asOf:1_000,dueAt:3_601_000,startPrice:100,
      regimeId:'RANGE',dataQuality:1,gate:'PASS',direction:'UP',probabilities:{up:.6,down:.2,flat:.2},
      expectedReturn:.01,interval:{q10:-.01,q90:.03},operationalConfidence:.6,status:'PENDING'
    }),
    committedRow({
      id:'resolved-1',symbol:'BTCUSDT',horizonId:'1h',horizonMs:3600000,flatThreshold:0,asOf:2_000,dueAt:3_602_000,startPrice:100,
      regimeId:'RANGE',dataQuality:1,gate:'PASS',direction:'DOWN',probabilities:{up:.2,down:.7,flat:.1},
      expectedReturn:-.01,interval:{q10:-.03,q90:.01},operationalConfidence:.7,status:'RESOLVED',
      resolution:{resolvedAt:3_602_100,resolvedPrice:98,actualReturn:-.02,actualDirection:'DOWN',topCorrect:true,intervalMiss:false,brier:.12,logLoss:.3}
    })
  ];
  const feed=buildBiggjProofFeed(entries,{
    asOf:3_000_000,
    learningSummary:{generatedAt:4_000_000,resolvedOutcomes:1,phase:'LEARNING'}
  });
  assert.equal(feed.liveRows.length,2);
  assert.ok(feed.liveRows.every(x=>x.currentStage==='LIVE'));
  assert.ok(feed.liveRows.every(x=>x.outcomeHash===null));
  assert.ok(feed.liveRows.every(x=>x.beforeHash.length===64));
  assert.equal(feed.learning.generatedAt,null);
  assert.equal(feed.learning.futureSummarySuppressed,true);

  const later=buildBiggjProofFeed(entries,{
    asOf:4_000_000,
    learningSummary:{generatedAt:4_000_000,resolvedOutcomes:1,phase:'LEARNING'}
  });
  const learned=later.rows.find(x=>x.forecastId==='resolved-1');
  assert.equal(learned.currentStage,'LEARNED');
  assert.equal(learned.milestones.reviewed,true);
  assert.equal(learned.milestones.learned,true);
  assert.equal(later.learning.meaning.includes('does not mean skill promotion'),true);
  assert.equal(verifyBiggjProofFeed(later).ok,true);
  assert.match(renderBiggjProofFeed(later),/GENERATED → LIVE → MATURED → REVIEWED → LEARNED/);
});


test('journal stores proof commitment before outcome and preserves it through resolution',()=>{
  const journal=new ForecastLearningJournal(journalEngineStub());
  journal.record(journalInput(),journalReport());
  const pending=journal.entries[0];
  assert.equal(pending.status,'PENDING');
  assert.equal(verifyForecastJournalProofCommitment(pending).status,'VERIFIED');
  const before=pending.proofCommitment;

  journal.observe({symbol:'BTCUSDT',timestamp:3_601_000,price:102,quality:1});
  const resolved=journal.all()[0];
  assert.equal(resolved.status,'RESOLVED');
  assert.equal(resolved.proofCommitment,before);
  assert.equal(verifyForecastJournalProofCommitment(resolved).status,'VERIFIED');

  const feed=buildBiggjProofFeed(journal.all(),{asOf:4_000_000});
  assert.equal(feed.counts.committed,1);
  assert.equal(feed.counts.verifiedHits,1);
  assert.equal(feed.rows[0].beforeHash,before);
  assert.equal(feed.rows[0].outcomeHash.length,64);
});

test('forecast-field mutation after record fails closed before outcome learning',()=>{
  const journal=new ForecastLearningJournal(journalEngineStub());
  journal.record(journalInput(),journalReport());
  journal.entries[0].direction='DOWN';
  journal.observe({symbol:'BTCUSDT',timestamp:3_601_000,price:102,quality:1});
  assert.equal(journal.entries[0].status,'PROOF_INVALID');
  assert.equal(journal.entries[0].proofIntegrity,'MISMATCH');
  assert.equal(journal.entries[0].resolution,undefined);
  assert.equal(journal.proofIntegrityStats().invalid,1);
});

test('legacy outcomes remain visible without being misrepresented as forecast-time proof',()=>{
  const legacy={
    id:'legacy',symbol:'BTCUSDT',horizonId:'1h',horizonMs:3600000,flatThreshold:0,
    asOf:1000,dueAt:3601000,startPrice:100,regimeId:'RANGE',dataQuality:1,
    gate:'PASS',direction:'UP',probabilities:{up:.7,down:.2,flat:.1},
    expectedReturn:.01,interval:{q10:-.01,q90:.03},operationalConfidence:.7,status:'RESOLVED',
    resolution:{resolvedAt:3601000,resolvedPrice:102,actualReturn:.02,actualDirection:'UP',topCorrect:true,intervalMiss:false}
  };
  const feed=buildBiggjProofFeed([legacy],{asOf:4_000_000});
  assert.equal(feed.counts.legacy,1);
  assert.equal(feed.counts.committed,0);
  assert.equal(feed.rows[0].commitmentState,'LEGACY_UNCOMMITTED');
  assert.equal(feed.rows[0].beforeHash,null);
  assert.equal(feed.rows[0].outcomeHash,null);
  assert.equal(verifyBiggjProofFeed(feed).ok,true);
  assert.match(renderBiggjProofFeed(feed),/LEGACY UNCOMMITTED/);
});


test('restore quarantines tampered committed rows before learning rehydration',()=>{
  const source=new ForecastLearningJournal(journalEngineStub());
  source.record(journalInput(),journalReport());
  source.observe({symbol:'BTCUSDT',timestamp:3_601_000,price:102,quality:1});
  const snapshot=source.snapshot();
  snapshot.entries[0].expectedReturn=.99;

  const restored=new ForecastLearningJournal(journalEngineStub());
  restored.restore(snapshot);
  assert.equal(restored.entries[0].status,'PROOF_INVALID');
  assert.equal(restored.entries[0].proofIntegrity,'MISMATCH');
  assert.equal(restored.proofIntegrityStats().invalid,1);
});


test('runtime forwards Signal Lab mode and exposes read-only mobile APIs',async()=>{
  const {readFile}=await import('node:fs/promises');
  const source=await readFile(new URL('./bot.mjs',import.meta.url),'utf8');
  assert.match(source,/showSignalLab\(chatId,textMessageId,a\.symbol,a\.horizon\|\|'1h',a\.mode\|\|'FULL'\)/);
  assert.match(source,/\/signal-lab\.json/);
  assert.match(source,/\/proof-feed\.json/);
  assert.match(source,/currentSignalLab\(symbol,horizon,mode\)/);
  assert.match(source,/currentProofFeed\(symbol,\{limit:20,liveLimit:8\}\)/);
  assert.match(source,/canExecuteLive:false/);
});
