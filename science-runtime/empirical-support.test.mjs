import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateEmpiricalSupport } from './empirical-support.mjs';

function rows({shift=0,targetCorrelationFlip=false,future=false,deploymentTarget=true}={}){
  const out=[];
  const mechanismId='M1';
  const t0=1_000_000;

  for(let i=0;i<60;i++){
    const x=(i-30)/10;
    const y=.8*x+.1*Math.sin(i);
    for(const [feature,value] of [['x',x],['y',y]]){
      out.push({
        id:`r-${i}-${feature}`,
        mechanismId,environmentId:'REF',role:'REFERENCE',sampleId:`r-${i}`,
        feature,value,timestamp:t0+i,availableAt:t0+i,
        source:'TEST',version:'1',provenance:'fixture'
      });
    }
  }

  for(let i=0;i<40;i++){
    const x=(i-20)/10+shift;
    const y=targetCorrelationFlip?-.8*x+.1*Math.sin(i):.8*x+.1*Math.sin(i);
    for(const [feature,value] of [['x',x],['y',y]]){
      const ts=t0+1000+i+(future?1_000_000:0);
      out.push({
        id:`t-${i}-${feature}`,
        mechanismId,environmentId:'TARGET',role:'TARGET',sampleId:`t-${i}`,
        feature,value,deploymentTarget,timestamp:ts,availableAt:ts,
        source:'TEST',version:'1',provenance:'fixture'
      });
    }
  }
  return out;
}

test('empirical support passes overlapping PIT distributions',()=>{
  const r=evaluateEmpiricalSupport(3_000_000,rows(),{
    minReferenceSamples:30,minTargetSamples:20
  });
  assert.equal(r.blockedFuture,0);
  assert.equal(r.invalidRows,0);
  assert.equal(r.gate,'PASS');
  assert.equal(r.executionMode,'SHADOW_ONLY');
  assert.equal(r.canExecute,false);
});

test('deployment target outside support forces ABSTAIN',()=>{
  const r=evaluateEmpiricalSupport(3_000_000,rows({shift:8}),{
    minReferenceSamples:30,minTargetSamples:20
  });
  assert.equal(r.gate,'ABSTAIN');
  assert.equal(r.findings[0].status,'OUT_OF_SUPPORT');
});

test('future observations are blocked and cannot repair missing support',()=>{
  const r=evaluateEmpiricalSupport(1_500_000,rows({future:true}),{
    minReferenceSamples:30,minTargetSamples:20
  });
  assert.ok(r.blockedFuture>0);
  assert.equal(r.gate,'INSUFFICIENT');
  assert.equal(r.usableObservations,120);
});

test('invalid timestamp rows are rejected',()=>{
  const data=rows();
  data.push({
    id:'bad',mechanismId:'M1',environmentId:'TARGET',role:'TARGET',
    feature:'x',value:0,timestamp:100,availableAt:99,
    source:'TEST',version:'1',provenance:'fixture'
  });
  const r=evaluateEmpiricalSupport(3_000_000,data);
  assert.equal(r.invalidRows,1);
});

test('joint dependence shift is visible even when marginals overlap',()=>{
  const r=evaluateEmpiricalSupport(3_000_000,rows({targetCorrelationFlip:true}),{
    minReferenceSamples:30,minTargetSamples:20
  });
  assert.ok(r.findings[0].maxCorrelationShift>1);
  assert.ok(r.findings[0].reasons.some(x=>x.includes('joint feature dependence shifted')));
  assert.notEqual(r.gate,'PASS');
});

test('non-deployment out-of-support environment warns rather than hard abstains',()=>{
  const r=evaluateEmpiricalSupport(3_000_000,rows({shift:8,deploymentTarget:false}),{
    minReferenceSamples:30,minTargetSamples:20
  });
  assert.equal(r.gate,'CAUTION');
});
