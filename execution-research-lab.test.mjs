import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildExecutionResearchSamples,temporalOosEvaluation,walkForwardExecutionEvaluation,
  segmentExecutionBreakdown,toxicityCalibration,executionDrift,executionResearchReport,
  EXECUTION_RESEARCH_CAPABILITIES
} from './execution-research-lab.mjs';

function route(routeHash,t,{policy=2,best=4,fill=1,pred=1,realized=2,symbol='BTCUSDT'}={}){
  return ['BINANCE','OKX'].map((venue,i)=>({
    id:routeHash+venue,
    routeHash,
    capturedAt:t,
    symbol,
    venue,
    side:'BUY',
    notionalQuote:1000,
    sizeBucket:'SMALL',
    regime:'RANGE',
    liquidity:'TIGHT',
    pressureBand:'LOW',
    eligible:true,
    fillRatio:1,
    benchmarkAllInBps:i===0?best:best+1,
    benchmarkSlippageBps:i===0?best-1:best,
    fetchLatencyMs:20+i*10,
    predictedToxicityBps:pred,
    predictedToxicityStatus:'MODELLED_FROM_MATURED_VQM',
    predictedToxicityEvidenceN:40,
    routeAllInBps:policy,
    routeFillRatio:fill,
    routeSlippageBps:policy-1,
    routeVenueCount:2,
    routeMemoryActive:true,
    markouts:{
      '300000':{status:'OBSERVED',adverseSelectionBps:realized}
    }
  }));
}

test('research lab remains execution-disabled',()=>{
  assert.equal(EXECUTION_RESEARCH_CAPABILITIES.execution,'SHADOW_ONLY');
  assert.equal(EXECUTION_RESEARCH_CAPABILITIES.canExecuteLive,false);
});

test('builds one route sample from multiple venue observations',()=>{
  const s=buildExecutionResearchSamples(route('r1',1));
  assert.equal(s.length,1);
  assert.equal(s[0].bestSingle.venue,'BINANCE');
  assert.equal(s[0].edgeVsBestSingleBps,2);
});

test('OOS evaluation uses chronological split',()=>{
  const records=[];
  for(let i=0;i<50;i++) records.push(...route('r'+i,1000+i,{policy:2,best:4}));
  const s=buildExecutionResearchSamples(records);
  const o=temporalOosEvaluation(s,{minTrain:20,minTest:10});
  assert.equal(o.status,'OOS_AVAILABLE');
  assert.ok(o.test.n>=10);
  assert.ok(o.test.edgeVsBestSingle.mean>0);
});

test('OOS refuses insufficient evidence',()=>{
  const s=buildExecutionResearchSamples(route('r1',1));
  const o=temporalOosEvaluation(s);
  assert.equal(o.status,'INSUFFICIENT_OOS_SAMPLES');
});

test('toxicity calibration compares predicted penalty with matured 5m adverse selection',()=>{
  const records=[];
  for(let i=0;i<25;i++) records.push(...route('r'+i,i,{pred:2,realized:3}));
  const c=toxicityCalibration(records,{minN:20});
  assert.equal(c.status,'CALIBRATION_AVAILABLE');
  assert.equal(c.biasBps,-1);
  assert.equal(c.maeBps,1);
});

test('missed markouts never enter toxicity calibration',()=>{
  const rows=route('r1',1);
  rows[0].markouts={'300000':{status:'MISSED_CAPTURE_WINDOW'}};
  const c=toxicityCalibration(rows,{minN:1});
  assert.equal(c.n,1);
});

test('drift catches simultaneous cost and edge deterioration',()=>{
  const records=[];
  for(let i=0;i<60;i++) records.push(...route('old'+i,i,{policy:2,best:5,fill:1}));
  for(let i=0;i<30;i++) records.push(...route('new'+i,100+i,{policy:6,best:6.5,fill:0.9}));
  const s=buildExecutionResearchSamples(records);
  const d=executionDrift(s,{recentN:30,referenceN:60,minRecent:10,minReference:20});
  assert.equal(d.status,'DRIFT');
  assert.ok(d.signals.length>=2);
});

test('stable windows remain stable',()=>{
  const records=[];
  for(let i=0;i<90;i++) records.push(...route('r'+i,i,{policy:2,best:4,fill:1}));
  const s=buildExecutionResearchSamples(records);
  const d=executionDrift(s,{recentN:30,referenceN:60});
  assert.equal(d.status,'STABLE');
});

test('full report keeps execution and causal boundaries explicit',()=>{
  const records=[];
  for(let i=0;i<50;i++) records.push(...route('r'+i,i));
  const r=executionResearchReport(records,{symbol:'BTCUSDT'});
  assert.equal(r.epistemic.execution,'SHADOW_ONLY');
  assert.equal(r.epistemic.inference,'DESCRIPTIVE_OOS_EVALUATION_NOT_CAUSAL');
  assert.equal(r.sampleRoutes,50);
});


test('walk-forward evaluation uses sequential unseen windows',()=>{
  const records=[];
  for(let i=0;i<70;i++) records.push(...route('wf'+i,1000+i,{policy:2,best:4}));
  const s=buildExecutionResearchSamples(records);
  const w=walkForwardExecutionEvaluation(s,{minTrain:30,testWindow:10,step:10,minTest:5});
  assert.equal(w.status,'WALK_FORWARD_AVAILABLE');
  assert.equal(w.folds,4);
  assert.equal(w.positiveFoldRate,1);
  assert.ok(w.details.every((x,i)=>x.trainN===30+i*10));
  assert.ok(w.details.every(x=>x.testN===10));
});

test('segment breakdown separates regimes and memory state without mixing small groups',()=>{
  const records=[];
  for(let i=0;i<6;i++) records.push(...route('range'+i,i,{policy:2,best:4}));
  for(let i=0;i<6;i++){
    const rows=route('stress'+i,100+i,{policy:5,best:4});
    for(const x of rows){ x.regime='STRESS'; x.routeMemoryActive=false; }
    records.push(...rows);
  }
  const s=buildExecutionResearchSamples(records);
  const seg=segmentExecutionBreakdown(s,{minN:5});
  assert.equal(seg.REGIME.length,2);
  assert.equal(seg.MEMORY.length,2);
  assert.equal(seg.REGIME.find(x=>x.segment==='RANGE').edgeMeanBps,2);
  assert.equal(seg.REGIME.find(x=>x.segment==='STRESS').edgeMeanBps,-1);
});
