import test from 'node:test';
import assert from 'node:assert/strict';

import { sha256 } from './institutional-kernel.mjs';

import {
  buildBiggjSignalLab,
  verifyBiggjSignalLab,
  renderBiggjSignalLab,
  buildBiggjProofFeed,
  verifyBiggjProofFeed,
  renderBiggjProofFeed,
  signalLabKeyboard
} from './biggj-signal-lab.mjs';

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
    {
      id:'a',symbol:'BTCUSDT',horizonId:'1h',horizonMs:3600000,asOf:1000,dueAt:3601000,startPrice:100,
      regimeId:'RANGE',gate:'PASS',direction:'UP',probabilities:{up:.7,down:.2,flat:.1},
      expectedReturn:.01,interval:{q10:-.01,q90:.03},operationalConfidence:.7,status:'RESOLVED',
      resolution:{resolvedAt:3601000,resolvedPrice:102,actualReturn:.02,actualDirection:'UP',topCorrect:true,intervalMiss:false}
    },
    {
      id:'b',symbol:'ETHUSDT',horizonId:'1h',horizonMs:3600000,asOf:2000,dueAt:3602000,startPrice:100,
      regimeId:'RANGE',gate:'PASS',direction:'DOWN',probabilities:{up:.1,down:.8,flat:.1},
      expectedReturn:-.01,interval:{q10:-.03,q90:.01},operationalConfidence:.8,status:'RESOLVED',
      resolution:{resolvedAt:3602000,resolvedPrice:102,actualReturn:.02,actualDirection:'UP',topCorrect:false,intervalMiss:true}
    }
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
    {
      id:'live-1',symbol:'BTCUSDT',horizonId:'1h',horizonMs:3600000,asOf:1_000,dueAt:3_601_000,startPrice:100,
      regimeId:'RANGE',gate:'PASS',direction:'UP',probabilities:{up:.6,down:.2,flat:.2},
      expectedReturn:.01,interval:{q10:-.01,q90:.03},operationalConfidence:.6,status:'PENDING'
    },
    {
      id:'resolved-1',symbol:'BTCUSDT',horizonId:'1h',horizonMs:3600000,asOf:2_000,dueAt:3_602_000,startPrice:100,
      regimeId:'RANGE',gate:'PASS',direction:'DOWN',probabilities:{up:.2,down:.7,flat:.1},
      expectedReturn:-.01,interval:{q10:-.03,q90:.01},operationalConfidence:.7,status:'RESOLVED',
      resolution:{resolvedAt:3_602_100,resolvedPrice:98,actualReturn:-.02,actualDirection:'DOWN',topCorrect:true,intervalMiss:false,brier:.12,logLoss:.3}
    }
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


test('proof feed binds BEFORE state to a pre-outcome institutional audit record',()=>{
  const horizon={
    horizonId:'1h',
    horizonMs:3_600_000,
    gate:'PASS',
    direction:'UP',
    probabilities:{up:.7,down:.2,flat:.1},
    expectedReturn:.01,
    interval:{q10:-.01,q25:-.002,median:.01,q75:.02,q90:.03},
    diagnostics:{operationalConfidence:.7}
  };
  const forecastCore={
    schemaVersion:'TEST_FORECAST',
    forecastId:'BTCUSDT:1000',
    symbol:'BTCUSDT',
    generatedAt:1_100,
    asOf:1_000,
    price:100,
    overallGate:'PASS',
    scienceGate:'PASS',
    horizons:[horizon],
    path:null,
    regimeTransition:null,
    inputQuality:{},
    epistemic:{},
    executionMode:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecute:false
  };
  const forecast={...forecastCore,fingerprint:sha256(forecastCore)};
  const issuanceCore={
    version:'TEST_ISSUANCE',
    symbol:'BTCUSDT',
    asOf:1_000,
    generatedAt:1_100,
    forecastFingerprint:forecast.fingerprint,
    scienceFingerprint:'s'.repeat(64),
    admissionFingerprint:'a'.repeat(64),
    traceId:'trace-audit',
    gate:'PASS',
    researchDisposition:'RESEARCH_ALLOWED',
    probabilityDisplayAllowed:true,
    executionMode:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecute:false
  };
  const issuance={...issuanceCore,issuanceId:sha256(issuanceCore),forecast};
  const entry={
    id:'BTCUSDT:1000:1h',
    symbol:'BTCUSDT',
    horizonId:'1h',
    horizonMs:3_600_000,
    asOf:1_000,
    dueAt:3_601_000,
    startPrice:100,
    regimeId:'RANGE',
    gate:'PASS',
    direction:'UP',
    probabilities:{up:.7,down:.2,flat:.1},
    expectedReturn:.01,
    interval:{q10:-.01,q90:.03},
    operationalConfidence:.7,
    status:'RESOLVED',
    resolution:{
      resolvedAt:3_601_100,
      resolvedPrice:102,
      actualReturn:.02,
      actualDirection:'UP',
      topCorrect:true,
      intervalMiss:false
    }
  };
  const auditLedger={records:[{
    kind:'TCX_INSTITUTIONAL_FORECAST_ISSUED',
    seq:7,
    occurredAt:1_100,
    recordHash:'b'.repeat(64),
    payload:{
      issuanceId:issuance.issuanceId,
      forecastFingerprint:issuance.forecastFingerprint,
      symbol:'BTCUSDT',
      asOf:1_000
    }
  }]};

  const feed=buildBiggjProofFeed([entry],{
    asOf:4_000_000,
    issuances:[issuance],
    auditLedger
  });
  const proof=feed.rows[0];
  assert.equal(proof.beforeHashSource,'INSTITUTIONAL_ISSUANCE');
  assert.equal(proof.proofIntegrity,'AUDIT_BOUND');
  assert.equal(proof.proofBinding.auditBacked,true);
  assert.equal(proof.proofBinding.auditPreOutcome,true);
  assert.equal(proof.proofBinding.auditSeq,7);
  assert.equal(proof.proofBinding.journalMatchesIssuance,true);
  assert.equal(feed.counts.auditBacked,1);
  assert.equal(verifyBiggjProofFeed(feed).ok,true);
  assert.match(renderBiggjProofFeed(feed),/AUDIT #7/);
});

test('proof aggregate counts use the full scoped set rather than only displayed rows',()=>{
  const mk=(id,topCorrect)=>({
    id,
    symbol:'BTCUSDT',
    horizonId:'1h',
    horizonMs:3_600_000,
    asOf:Number(id.split('-')[1])*1_000,
    dueAt:Number(id.split('-')[1])*1_000+3_600_000,
    startPrice:100,
    regimeId:'RANGE',
    gate:'PASS',
    direction:'UP',
    probabilities:{up:.7,down:.2,flat:.1},
    expectedReturn:.01,
    interval:{q10:-.01,q90:.03},
    operationalConfidence:.7,
    status:'RESOLVED',
    resolution:{
      resolvedAt:Number(id.split('-')[1])*1_000+3_600_100,
      resolvedPrice:topCorrect?102:98,
      actualReturn:topCorrect?.02:-.02,
      actualDirection:topCorrect?'UP':'DOWN',
      topCorrect,
      intervalMiss:false
    }
  });
  const feed=buildBiggjProofFeed([mk('f-1',true),mk('f-2',false),mk('f-3',true)],{
    asOf:8_000_000,
    limit:1
  });
  assert.equal(feed.rows.length,1);
  assert.equal(feed.counts.displayedResolved,1);
  assert.equal(feed.counts.resolved,3);
  assert.equal(feed.counts.hits,2);
  assert.equal(feed.counts.misses,1);
  assert.equal(feed.policy.aggregateCountsUseFullScopedSet,true);
  assert.equal(verifyBiggjProofFeed(feed).ok,true);
});
