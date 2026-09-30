import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateEvidenceLineageIndependence } from './evidence-lineage-independence.mjs';

function item(id,witnessId,lineage,{deploymentTarget=true,ts=100,requiredIndependent=3}={}){
  return {
    id,claimId:'C1',mechanismId:'M1',witnessId,lineage,
    deploymentTarget,requiredIndependent,
    timestamp:ts,availableAt:ts,
    source:'TEST',version:'1',provenance:'fixture'
  };
}

test('three independent lineages pass',()=>{
  const r=evaluateEvidenceLineageIndependence(1000,[
    item('a','A',['raw:A']),
    item('b','B',['raw:B']),
    item('c','C',['raw:C'])
  ]);
  assert.equal(r.gate,'PASS');
  assert.equal(r.findings[0].independentComponents,3);
  assert.equal(r.canExecute,false);
});

test('three nominal witnesses sharing one source abstain',()=>{
  const r=evaluateEvidenceLineageIndependence(1000,[
    item('a','A',['shared:X','pipe:A']),
    item('b','B',['shared:X','pipe:B']),
    item('c','C',['shared:X','pipe:C'])
  ]);
  assert.equal(r.gate,'ABSTAIN');
  assert.equal(r.findings[0].status,'DEPENDENT');
  assert.equal(r.findings[0].independentComponents,1);
});

test('partial dependence is caution when required independence still met',()=>{
  const r=evaluateEvidenceLineageIndependence(1000,[
    item('a','A',['shared:X','pipe:A'],{requiredIndependent:3}),
    item('b','B',['shared:X','pipe:B'],{requiredIndependent:3}),
    item('c','C',['raw:C'],{requiredIndependent:3}),
    item('d','D',['raw:D'],{requiredIndependent:3})
  ]);
  assert.equal(r.gate,'CAUTION');
  assert.equal(r.findings[0].independentComponents,3);
});

test('dependent non-deployment evidence only cautions',()=>{
  const opts={deploymentTarget:false};
  const r=evaluateEvidenceLineageIndependence(1000,[
    item('a','A',['same'],opts),
    item('b','B',['same'],opts),
    item('c','C',['same'],opts)
  ]);
  assert.equal(r.gate,'CAUTION');
});

test('future evidence is blocked',()=>{
  const r=evaluateEvidenceLineageIndependence(1000,[
    item('a','A',['a']),
    item('b','B',['b']),
    item('c','C',['c']),
    item('future','F',['f'],{ts:2000})
  ]);
  assert.equal(r.blockedFuture,1);
  assert.equal(r.gate,'PASS');
});

test('invalid lineage record is rejected',()=>{
  const bad=item('bad','B',[]);
  const r=evaluateEvidenceLineageIndependence(1000,[
    item('a','A',['a']),item('b','B',['b']),item('c','C',['c']),bad
  ]);
  assert.equal(r.invalidRows,1);
  assert.equal(r.gate,'PASS');
});
