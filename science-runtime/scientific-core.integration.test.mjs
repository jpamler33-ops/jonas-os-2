import test from 'node:test';
import assert from 'node:assert/strict';

import { evaluateEmpiricalSupport } from './empirical-support.mjs';
import { evaluateResearchIntegrity } from './research-integrity.mjs';
import { evaluateScientificValidity } from '../scientific-validity.mjs';

function supportRows(shift=0){
  const rows=[];
  for(let i=0;i<60;i++){
    const x=(i-30)/12;
    rows.push({
      id:`r-${i}`,mechanismId:'M1',environmentId:'REF',role:'REFERENCE',
      sampleId:`r-${i}`,feature:'x',value:x,
      timestamp:100+i,availableAt:100+i,
      source:'TEST',version:'1',provenance:'fixture'
    });
  }
  for(let i=0;i<40;i++){
    const x=(i-20)/12+shift;
    rows.push({
      id:`t-${i}`,mechanismId:'M1',environmentId:'TARGET',role:'TARGET',
      sampleId:`t-${i}`,feature:'x',value:x,deploymentTarget:true,
      timestamp:500+i,availableAt:500+i,
      source:'TEST',version:'1',provenance:'fixture'
    });
  }
  return rows;
}

function exposure(id,role,purpose,partitionId,extra={}){
  return {
    id,claimId:'C1',mechanismId:'M1',datasetId:'D1',partitionId,
    role,purpose,experimentId:`E-${id}`,systemVersion:'v1',
    timestamp:100,availableAt:100,source:'TEST',version:'1',
    provenance:'fixture',resultRevealed:true,informedChange:false,
    ...extra
  };
}

function cleanIntegrity(){
  return [
    exposure('dev','DEVELOPMENT','DISCOVERY','dev',{informedChange:true,timestamp:100}),
    exposure('val','VALIDATION','MODEL_SELECTION','val',{timestamp:200}),
    exposure('hold','SEALED_HOLDOUT','FINAL_CONFIRMATION','hold',{timestamp:300})
  ];
}

test('real Alpha30-adapted support + integrity guards can produce scientific PASS',()=>{
  const support=evaluateEmpiricalSupport(1000,supportRows(),{
    minReferenceSamples:30,minTargetSamples:20
  });
  const integrity=evaluateResearchIntegrity(1000,cleanIntegrity());
  const result=evaluateScientificValidity({
    asOf:1000,
    guards:[
      {id:'EMPIRICAL_SUPPORT',required:true,report:support},
      {id:'RESEARCH_INTEGRITY',required:true,report:integrity}
    ]
  });
  assert.equal(support.gate,'PASS');
  assert.equal(integrity.gate,'PASS');
  assert.equal(result.gate,'PASS');
  assert.equal(result.coverage,1);
});

test('clean distribution support cannot override contaminated research lineage',()=>{
  const rows=cleanIntegrity();
  rows.push(exposure('reuse','SEALED_HOLDOUT','DISCOVERY','hold',{
    systemVersion:'v0',timestamp:50,informedChange:true
  }));
  const support=evaluateEmpiricalSupport(1000,supportRows(),{
    minReferenceSamples:30,minTargetSamples:20
  });
  const integrity=evaluateResearchIntegrity(1000,rows);
  const result=evaluateScientificValidity({
    asOf:1000,
    guards:[
      {id:'EMPIRICAL_SUPPORT',required:true,report:support},
      {id:'RESEARCH_INTEGRITY',required:true,report:integrity}
    ]
  });
  assert.equal(support.gate,'PASS');
  assert.equal(integrity.gate,'ABSTAIN');
  assert.equal(result.gate,'ABSTAIN');
});

test('out-of-support deployment target cannot be rescued by clean holdout lineage',()=>{
  const support=evaluateEmpiricalSupport(1000,supportRows(8),{
    minReferenceSamples:30,minTargetSamples:20
  });
  const integrity=evaluateResearchIntegrity(1000,cleanIntegrity());
  const result=evaluateScientificValidity({
    asOf:1000,
    guards:[
      {id:'EMPIRICAL_SUPPORT',required:true,report:support},
      {id:'RESEARCH_INTEGRITY',required:true,report:integrity}
    ]
  });
  assert.equal(support.gate,'ABSTAIN');
  assert.equal(integrity.gate,'PASS');
  assert.equal(result.gate,'ABSTAIN');
});
