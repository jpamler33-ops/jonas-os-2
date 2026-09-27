import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateSequentialEvidence } from './sequential-evidence.mjs';

function look(i,{effect=.1,se=.04,predeclared=true,expectedSign=1,ts=100+i}={}){
  return {
    id:'l'+i,claimId:'C1',mechanismId:'M1',
    lookIndex:i,plannedMaxLooks:5,
    cumulativeEffect:effect,cumulativeStandardError:se,
    expectedSign,predeclared,
    timestamp:ts,availableAt:ts,
    source:'TEST',version:'1',provenance:'fixture'
  };
}

test('predeclared stable sequential evidence passes',()=>{
  const rows=[
    look(1,{effect:.04,se:.04}),
    look(2,{effect:.07,se:.04}),
    look(3,{effect:.10,se:.04}),
    look(4,{effect:.12,se:.04}),
    look(5,{effect:.13,se:.04})
  ];
  const r=evaluateSequentialEvidence(1000,rows);
  assert.equal(r.gate,'PASS');
  assert.equal(r.findings[0].status,'STABLE');
  assert.equal(r.executionMode,'SHADOW_ONLY');
  assert.equal(r.canExecute,false);
});

test('early nominal crossing that disappears is optional-stopping risk',()=>{
  const rows=[
    look(1,{effect:.10,se:.04}),
    look(2,{effect:.12,se:.04}),
    look(3,{effect:.06,se:.04}),
    look(4,{effect:.04,se:.04}),
    look(5,{effect:.03,se:.04})
  ];
  const r=evaluateSequentialEvidence(1000,rows);
  assert.equal(r.gate,'ABSTAIN');
  assert.equal(r.findings[0].status,'OPTIONAL_STOPPING_RISK');
});

test('insufficient predeclaration abstains',()=>{
  const rows=[
    look(1,{predeclared:false}),
    look(2,{predeclared:false}),
    look(3,{predeclared:true}),
    look(4,{predeclared:true}),
    look(5,{predeclared:true})
  ];
  const r=evaluateSequentialEvidence(1000,rows);
  assert.equal(r.gate,'ABSTAIN');
});

test('future look is blocked',()=>{
  const rows=[
    look(1),look(2),look(3),
    look(4,{ts:2000}),look(5,{ts:2001})
  ];
  const r=evaluateSequentialEvidence(1000,rows);
  assert.equal(r.blockedFuture,2);
  assert.equal(r.usableLooks,3);
});

test('invalid look is rejected',()=>{
  const bad=look(1);
  bad.availableAt=99;
  const r=evaluateSequentialEvidence(1000,[bad,look(2),look(3),look(4)]);
  assert.equal(r.invalidLooks,1);
});

test('too few looks stays insufficient',()=>{
  const r=evaluateSequentialEvidence(1000,[look(1),look(2)]);
  assert.equal(r.gate,'INSUFFICIENT');
  assert.equal(r.findings[0].status,'INSUFFICIENT');
});
