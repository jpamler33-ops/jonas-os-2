import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateTransportability } from './transportability.mjs';

function row(id,role,environmentId,estimate,se=.05,deploymentTarget=false,ts=100){
  return {
    id,claimId:'C1',mechanismId:'M1',role,environmentId,
    estimate,standardError:se,deploymentTarget,
    timestamp:ts,availableAt:ts,
    source:'TEST',version:'1',provenance:'fixture'
  };
}

function base(target=.20,deploymentTarget=true){
  return [
    row('r1','REFERENCE','A',.20),
    row('r2','REFERENCE','B',.22),
    row('r3','REFERENCE','C',.18),
    row('t1','TARGET','TARGET',target,.06,deploymentTarget),
    row('t2','TARGET','TARGET',target+.01,.06,deploymentTarget)
  ];
}

test('compatible target passes transportability',()=>{
  const r=evaluateTransportability(1000,base(.21));
  assert.equal(r.gate,'PASS');
  assert.equal(r.findings[0].status,'TRANSPORTABLE');
  assert.equal(r.canExecute,false);
});

test('opposite deployment target effect abstains',()=>{
  const r=evaluateTransportability(1000,base(-.20));
  assert.equal(r.gate,'ABSTAIN');
  assert.equal(r.findings[0].status,'FAILED');
  assert.equal(r.findings[0].signAgreement,false);
});

test('failed non-deployment target is caution only',()=>{
  const r=evaluateTransportability(1000,base(-.20,false));
  assert.equal(r.gate,'CAUTION');
});

test('heterogeneous references cannot silently pass',()=>{
  const rows=[
    row('r1','REFERENCE','A',.8),
    row('r2','REFERENCE','B',-.7),
    row('r3','REFERENCE','C',.6),
    row('t1','TARGET','TARGET',.2,.06,true),
    row('t2','TARGET','TARGET',.2,.06,true)
  ];
  const r=evaluateTransportability(1000,rows);
  assert.notEqual(r.gate,'PASS');
  assert.ok(r.findings[0].referenceI2>.5);
});

test('future rows are blocked',()=>{
  const rows=base(.21);
  rows.push(row('future','TARGET','TARGET',.21,.06,true,2000));
  const r=evaluateTransportability(1000,rows);
  assert.equal(r.blockedFuture,1);
  assert.equal(r.gate,'PASS');
});

test('too little target evidence is insufficient',()=>{
  const rows=base(.21).filter(x=>x.id!=='t2');
  const r=evaluateTransportability(1000,rows);
  assert.equal(r.gate,'INSUFFICIENT');
});
