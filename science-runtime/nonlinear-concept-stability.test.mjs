import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateNonlinearConceptStability } from './nonlinear-concept-stability.mjs';

function rows(mode='stable',future=false,deploymentTarget=true){
  const out=[];
  for(const [env,role,n] of [['ref','REFERENCE',160],['target','TARGET',120]]){
    for(let i=0;i<n;i++){
      const x=((i*37)%211-105)/42;
      const z=((i*71)%199-99)/50;
      let y=x*x+.25*z;
      if(env==='target'&&mode==='flip') y=-x*x+.25*z;
      if(env==='target'&&mode==='shape') y=Math.abs(x)*1.7+.25*z;
      y+=((i%11)-5)*.012;
      const ts=future&&i===0?200:100;
      out.push({
        id:env+'-'+i,
        mechanismId:'m',
        environmentId:env,
        role,
        sampleId:env+'-'+i,
        features:{x,z},
        outcome:y,
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

test('stable nonlinear conditional passes',()=>{
  const r=evaluateNonlinearConceptStability(150,rows());
  assert.equal(r.gate,'PASS');
  assert.equal(r.findings[0].status,'STABLE');
  assert.equal(r.executionMode,'SHADOW_ONLY');
  assert.equal(r.canExecute,false);
});

test('nonlinear sign reversal abstains on deployment target',()=>{
  const r=evaluateNonlinearConceptStability(150,rows('flip'));
  assert.equal(r.gate,'ABSTAIN');
  assert.equal(r.findings[0].status,'DRIFTED');
});

test('nonlinear shape drift abstains on deployment target',()=>{
  const r=evaluateNonlinearConceptStability(150,rows('shape'));
  assert.equal(r.gate,'ABSTAIN');
  assert.equal(r.findings[0].status,'DRIFTED');
});

test('non-deployment nonlinear drift produces CAUTION',()=>{
  const r=evaluateNonlinearConceptStability(150,rows('flip',false,false));
  assert.equal(r.gate,'CAUTION');
});

test('future outcomes are blocked',()=>{
  const r=evaluateNonlinearConceptStability(150,rows('stable',true));
  assert.equal(r.blockedFuture,2);
  assert.equal(r.usableObservations,278);
});

test('invalid chronology is rejected',()=>{
  const data=rows();
  data.push({
    id:'bad',mechanismId:'m',environmentId:'target',role:'TARGET',sampleId:'bad',
    features:{x:1,z:1},outcome:1,deploymentTarget:true,
    timestamp:200,availableAt:199,source:'synthetic',version:'1',provenance:'test'
  });
  const r=evaluateNonlinearConceptStability(150,data);
  assert.equal(r.invalidRows,1);
});
