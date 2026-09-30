import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateSpecificationMultiverse } from './specification-multiverse.mjs';

function rows(mode='robust',deploymentTarget=true){
  const out=[];
  for(let i=0;i<12;i++){
    let estimate=.20+((i%5)-2)*.01;
    if(mode==='flip'&&i%3===0) estimate=-.18;
    if(mode==='spread') estimate=(i%2===0?1:-1)*(0.05+i*.04);
    out.push({
      id:'s'+i,claimId:'C1',mechanismId:'M1',specificationId:'SPEC'+i,
      estimate,reasonable:true,selected:i===0,deploymentTarget,
      timestamp:100+i,availableAt:100+i,
      source:'TEST',version:'1',provenance:'fixture'
    });
  }
  return out;
}

test('robust multiverse passes',()=>{
  const r=evaluateSpecificationMultiverse(1000,rows());
  assert.equal(r.gate,'PASS');
  assert.equal(r.findings[0].status,'ROBUST');
  assert.equal(r.canExecute,false);
});

test('sign-fragile deployment claim abstains',()=>{
  const r=evaluateSpecificationMultiverse(1000,rows('flip'));
  assert.equal(r.gate,'ABSTAIN');
  assert.equal(r.findings[0].status,'FRAGILE');
});

test('magnitude-fragile claim outside deployment target is caution',()=>{
  const r=evaluateSpecificationMultiverse(1000,rows('spread',false));
  assert.equal(r.gate,'CAUTION');
});

test('future specifications are blocked',()=>{
  const data=rows();
  data.push({...data[0],id:'future',specificationId:'future',timestamp:2000,availableAt:2000});
  const r=evaluateSpecificationMultiverse(1000,data);
  assert.equal(r.blockedFuture,1);
  assert.equal(r.gate,'PASS');
});

test('invalid chronology is rejected',()=>{
  const data=rows();
  data.push({...data[0],id:'bad',specificationId:'bad',timestamp:500,availableAt:499});
  const r=evaluateSpecificationMultiverse(1000,data);
  assert.equal(r.invalidRows,1);
});

test('too few specifications is insufficient',()=>{
  const r=evaluateSpecificationMultiverse(1000,rows().slice(0,4));
  assert.equal(r.gate,'INSUFFICIENT');
});
