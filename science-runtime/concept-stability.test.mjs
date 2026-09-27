import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateConceptStability } from './concept-stability.mjs';

function rows(flip=false,future=false,deploymentTarget=true){
  const out=[];
  for(const [env,role,n] of [['ref','REFERENCE',80],['target','TARGET',60]]){
    for(let i=0;i<n;i++){
      const x=((i*37)%101-50)/20;
      const z=((i*19)%97-48)/25;
      const beta=env==='target'&&flip?-1.2:1.2;
      const ts=future&&i===0?200:100;
      out.push({
        id:env+'-'+i,
        mechanismId:'m',
        environmentId:env,
        role,
        sampleId:env+'-'+i,
        features:{x,z},
        outcome:beta*x+.35*z+((i%7)-3)*.02,
        deploymentTarget:env==='target'&&deploymentTarget,
        timestamp:ts,
        availableAt:ts,
        source:'synthetic',
        version:'1',
        provenance:'test'
      });
    }
  }
  return out;
}

test('stable conditional mechanism passes',()=>{
  const r=evaluateConceptStability(150,rows(false));
  assert.equal(r.gate,'PASS');
  assert.equal(r.findings[0].status,'STABLE');
  assert.equal(r.executionMode,'SHADOW_ONLY');
  assert.equal(r.canExecute,false);
});

test('same covariates but reversed P(Y|X) abstains on deployment target',()=>{
  const r=evaluateConceptStability(150,rows(true));
  assert.equal(r.gate,'ABSTAIN');
  assert.equal(r.findings[0].status,'DRIFTED');
  assert.ok(r.findings[0].coefficientCosine<0);
});

test('same drift outside deployment target produces CAUTION not hard block',()=>{
  const r=evaluateConceptStability(150,rows(true,false,false));
  assert.equal(r.gate,'CAUTION');
  assert.equal(r.findings[0].status,'DRIFTED');
});

test('future outcomes are blocked',()=>{
  const r=evaluateConceptStability(150,rows(false,true));
  assert.equal(r.blockedFuture,2);
  assert.equal(r.usableObservations,138);
});

test('invalid chronology is rejected',()=>{
  const data=rows(false);
  data.push({
    id:'bad',mechanismId:'m',environmentId:'target',role:'TARGET',sampleId:'bad',
    features:{x:1,z:1},outcome:1,deploymentTarget:true,
    timestamp:200,availableAt:199,source:'synthetic',version:'1',provenance:'test'
  });
  const r=evaluateConceptStability(150,data);
  assert.equal(r.invalidRows,1);
});

test('weak reference relationship remains insufficient instead of fabricating stability',()=>{
  const data=rows(false).map((x,i)=>x.role==='REFERENCE'?{...x,outcome:((i%11)-5)*.001}:x);
  const r=evaluateConceptStability(150,data,{minR2:.2});
  assert.equal(r.gate,'INSUFFICIENT');
  assert.equal(r.findings[0].status,'INSUFFICIENT');
});
