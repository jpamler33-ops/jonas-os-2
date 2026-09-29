import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateTemporalRecency } from './temporal-recency.mjs';

function rows(mode='stable',future=false){
  const a=[];
  for(let i=0;i<240;i++){
    const x=((i*37)%211-105)/42;
    const z=((i*71)%199-99)/50;
    let y=x*x+.25*z;
    if(mode==='break'&&i>=205) y=-x*x+.25*z;
    if(mode==='slow'&&i>=190){
      const w=(i-190)/50;
      y=(1-2*w)*x*x+.25*z;
    }
    y+=((i%11)-5)*.012;
    a.push({
      id:'r-'+i,
      mechanismId:'m',
      sampleId:'s-'+i,
      features:{x,z},
      outcome:y,
      timestamp:100+i,
      availableAt:100+i,
      source:'synthetic',
      version:'1',
      provenance:'test'
    });
  }
  if(future){
    a.push({...a[0],id:'future',sampleId:'future',timestamp:999,availableAt:999});
  }
  return a;
}

test('stable current mechanism passes',()=>{
  const r=evaluateTemporalRecency(500,rows());
  assert.equal(r.gate,'PASS');
  assert.equal(r.findings[0].status,'CURRENT');
  assert.equal(r.canExecute,false);
});

test('recent structural break abstains',()=>{
  const r=evaluateTemporalRecency(500,rows('break'));
  assert.equal(r.gate,'ABSTAIN');
  assert.equal(r.findings[0].status,'BROKEN');
});

test('slow recent decay does not pass silently',()=>{
  const r=evaluateTemporalRecency(500,rows('slow'));
  assert.notEqual(r.gate,'PASS');
});

test('future observation is blocked without changing current pass',()=>{
  const r=evaluateTemporalRecency(500,rows('stable',true));
  assert.equal(r.blockedFuture,1);
  assert.equal(r.gate,'PASS');
});

test('invalid chronology is rejected',()=>{
  const data=rows();
  data.push({
    ...data[0],id:'bad',sampleId:'bad',timestamp:600,availableAt:599
  });
  const r=evaluateTemporalRecency(500,data);
  assert.equal(r.invalidRows,1);
});
