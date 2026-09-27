import test from 'node:test';
import assert from 'node:assert/strict';
import { runScientificCore } from './scientific-core.mjs';

function supportRows(){
  const out=[];
  for(let i=0;i<60;i++){
    const x=(i-30)/10;
    out.push({
      id:'r'+i,mechanismId:'M1',environmentId:'REF',role:'REFERENCE',
      sampleId:'r'+i,feature:'x',value:x,timestamp:100+i,availableAt:100+i,
      source:'TEST',version:'1',provenance:'fixture'
    });
    out.push({
      id:'t'+i,mechanismId:'M1',environmentId:'TARGET',role:'TARGET',
      sampleId:'t'+i,feature:'x',value:x,deploymentTarget:true,
      timestamp:300+i,availableAt:300+i,
      source:'TEST',version:'1',provenance:'fixture'
    });
  }
  return out;
}

test('default institutional science profile fails closed when required datasets are missing',()=>{
  const r=runScientificCore({asOf:1000,inputs:{}});
  assert.equal(r.validity.gate,'ABSTAIN');
  assert.equal(r.executionMode,'SHADOW_ONLY');
  assert.equal(r.canExecute,false);
});

test('profile can require only guards whose evidence is actually available',()=>{
  const profile={
    EMPIRICAL_SUPPORT:{required:true},
    RESEARCH_INTEGRITY:{required:false},
    CONCEPT_STABILITY:{required:false},
    NONLINEAR_CONCEPT_STABILITY:{required:false},
    TEMPORAL_RECENCY:{required:false},
    SEQUENTIAL_EVIDENCE:{required:false},
    SPECIFICATION_MULTIVERSE:{required:false},
    TRANSPORTABILITY:{required:false},
    EVIDENCE_LINEAGE_INDEPENDENCE:{required:false}
  };
  const r=runScientificCore({
    asOf:1000,
    inputs:{EMPIRICAL_SUPPORT:supportRows()},
    profile
  });
  assert.equal(r.reports.EMPIRICAL_SUPPORT.gate,'PASS');
  assert.equal(r.validity.gate,'PASS');
});

test('future rows remain blocked inside orchestrated guards',()=>{
  const rows=supportRows();
  rows.push({...rows[0],id:'future',timestamp:2000,availableAt:2000});
  const profile={
    EMPIRICAL_SUPPORT:{required:true},
    RESEARCH_INTEGRITY:{required:false},
    CONCEPT_STABILITY:{required:false},
    NONLINEAR_CONCEPT_STABILITY:{required:false},
    TEMPORAL_RECENCY:{required:false},
    SEQUENTIAL_EVIDENCE:{required:false},
    SPECIFICATION_MULTIVERSE:{required:false},
    TRANSPORTABILITY:{required:false},
    EVIDENCE_LINEAGE_INDEPENDENCE:{required:false}
  };
  const r=runScientificCore({asOf:1000,inputs:{EMPIRICAL_SUPPORT:rows},profile});
  assert.equal(r.reports.EMPIRICAL_SUPPORT.blockedFuture,1);
  assert.equal(r.validity.gate,'PASS');
});
