import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateResearchIntegrity } from './science-runtime/research-integrity.mjs';

function rec({
  id,role,purpose,partitionId,systemVersion='v1',
  resultRevealed=true,informedChange=false,
  timestamp=1000,availableAt=1000
}){
  return {
    id,
    claimId:'C1',
    mechanismId:'M1',
    datasetId:'D1',
    partitionId,
    role,
    purpose,
    experimentId:`E-${id}`,
    systemVersion,
    timestamp,
    availableAt,
    source:'TEST',
    version:'1',
    provenance:'fixture',
    resultRevealed,
    informedChange
  };
}

function cleanRows(){
  return [
    rec({id:'dev',role:'DEVELOPMENT',purpose:'DISCOVERY',partitionId:'dev',resultRevealed:true,informedChange:true,timestamp:100}),
    rec({id:'val',role:'VALIDATION',purpose:'MODEL_SELECTION',partitionId:'val',resultRevealed:true,informedChange:false,timestamp:200}),
    rec({id:'holdout',role:'SEALED_HOLDOUT',purpose:'FINAL_CONFIRMATION',partitionId:'holdout',resultRevealed:true,informedChange:false,timestamp:300})
  ];
}

test('clean sealed final confirmation passes research integrity',()=>{
  const r=evaluateResearchIntegrity(1000,cleanRows());
  assert.equal(r.gate,'PASS');
  assert.equal(r.mechanisms[0].status,'CLEAN');
  assert.equal(r.mechanisms[0].sealedFinalConfirmation,true);
  assert.equal(r.executionMode,'SHADOW_ONLY');
  assert.equal(r.canExecute,false);
});

test('discovery-to-final-confirmation reuse contaminates the path',()=>{
  const rows=cleanRows();
  rows.push(rec({
    id:'reuse',
    role:'SEALED_HOLDOUT',
    purpose:'DISCOVERY',
    partitionId:'holdout',
    systemVersion:'v0',
    timestamp:50,
    resultRevealed:true,
    informedChange:true
  }));
  const r=evaluateResearchIntegrity(1000,rows);
  assert.equal(r.gate,'ABSTAIN');
  assert.equal(r.mechanisms[0].status,'CONTAMINATED');
});

test('reusing revealed sealed holdout contaminates confirmation',()=>{
  const rows=cleanRows();
  rows.push(rec({
    id:'holdout2',
    role:'SEALED_HOLDOUT',
    purpose:'FINAL_CONFIRMATION',
    partitionId:'holdout',
    systemVersion:'v2',
    timestamp:400,
    resultRevealed:true
  }));
  const r=evaluateResearchIntegrity(1000,rows);
  assert.equal(r.gate,'ABSTAIN');
  assert.ok(r.mechanisms[0].partitionAudits.find(x=>x.partitionId==='holdout').sealedReuses>0);
});

test('no final confirmation is insufficient/degraded rather than silently pass',()=>{
  const rows=cleanRows().filter(x=>x.purpose!=='FINAL_CONFIRMATION');
  const r=evaluateResearchIntegrity(1000,rows);
  assert.equal(r.gate,'CAUTION');
  assert.equal(r.mechanisms[0].status,'INSUFFICIENT');
});

test('future exposure is blocked from current integrity state',()=>{
  const rows=cleanRows();
  rows.push(rec({
    id:'future',
    role:'SEALED_HOLDOUT',
    purpose:'FINAL_CONFIRMATION',
    partitionId:'future-holdout',
    timestamp:2000,
    availableAt:2000
  }));
  const r=evaluateResearchIntegrity(1000,rows);
  assert.equal(r.gate,'PASS');
  assert.equal(r.blockedFuture,1);
  assert.equal(r.usableExposures,3);
});

test('invalid chronology row is rejected',()=>{
  const rows=cleanRows();
  rows.push(rec({
    id:'bad',
    role:'VALIDATION',
    purpose:'MODEL_SELECTION',
    partitionId:'bad',
    timestamp:500,
    availableAt:499
  }));
  const r=evaluateResearchIntegrity(1000,rows);
  assert.equal(r.invalidRows,1);
  assert.equal(r.gate,'PASS');
});

test('excessive adaptive validation reuse becomes contamination',()=>{
  const rows=cleanRows();
  rows.push(
    rec({id:'v2',role:'VALIDATION',purpose:'MODEL_SELECTION',partitionId:'val',systemVersion:'v2',timestamp:250,resultRevealed:true,informedChange:true}),
    rec({id:'v3',role:'VALIDATION',purpose:'MODEL_SELECTION',partitionId:'val',systemVersion:'v3',timestamp:275,resultRevealed:true,informedChange:false})
  );
  const r=evaluateResearchIntegrity(1000,rows,{maxValidationAdaptiveReuses:1,maxValidationVersions:2});
  assert.equal(r.gate,'ABSTAIN');
  assert.equal(r.mechanisms[0].status,'CONTAMINATED');
});
