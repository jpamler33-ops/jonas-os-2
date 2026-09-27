import test from 'node:test';
import assert from 'node:assert/strict';

import {
  evaluateScientificValidity,
  verifyScientificValidity,
  scientificValiditySummary
} from './scientific-validity.mjs';

function report(gate='PASS',extra={}){
  return {asOf:1000,gate,executionMode:'SHADOW_ONLY',...extra};
}

test('scientific validity preserves PASS without averaging guard semantics',()=>{
  const r=evaluateScientificValidity({
    asOf:1000,
    guards:[
      {id:'EMPIRICAL_SUPPORT',report:report('PASS')},
      {id:'RESEARCH_INTEGRITY',report:report('PASS')}
    ]
  });
  assert.equal(r.gate,'PASS');
  assert.equal(r.coverage,1);
  assert.equal(verifyScientificValidity(r).ok,true);
});

test('required ABSTAIN dominates all positive guards',()=>{
  const r=evaluateScientificValidity({
    asOf:1000,
    guards:[
      {id:'SUPPORT',report:report('PASS')},
      {id:'INTEGRITY',report:report('ABSTAIN')},
      {id:'STABILITY',report:report('PASS')}
    ]
  });
  assert.equal(r.gate,'ABSTAIN');
  assert.ok(r.reasons.includes('SCIENTIFIC_GUARD_ABSTAIN'));
});

test('missing required scientific guard fails closed',()=>{
  const r=evaluateScientificValidity({
    asOf:1000,
    guards:[
      {id:'SUPPORT',report:report('PASS')},
      {id:'INTEGRITY',report:null}
    ]
  });
  assert.equal(r.gate,'ABSTAIN');
  assert.ok(r.reasons.includes('REQUIRED_SCIENTIFIC_GUARD_INVALID_OR_MISSING'));
});

test('future scientific report is blocked rather than trusted',()=>{
  const r=evaluateScientificValidity({
    asOf:1000,
    guards:[
      {id:'SUPPORT',report:report('PASS',{asOf:1001})}
    ]
  });
  assert.equal(r.gate,'ABSTAIN');
  assert.equal(r.guards[0].futureBlocked,true);
  assert.ok(r.guards[0].reasons.includes('REPORT_FROM_FUTURE'));
});

test('non-SHADOW guard is invalid even when it reports PASS',()=>{
  const r=evaluateScientificValidity({
    asOf:1000,
    guards:[
      {id:'SUPPORT',report:report('PASS',{executionMode:'LIVE'})}
    ]
  });
  assert.equal(r.gate,'ABSTAIN');
  assert.ok(r.guards[0].reasons.includes('EXECUTION_MODE_INVALID'));
});

test('INSUFFICIENT stays distinct from CAUTION and ABSTAIN',()=>{
  const r=evaluateScientificValidity({
    asOf:1000,
    guards:[
      {id:'SUPPORT',report:report('INSUFFICIENT')},
      {id:'INTEGRITY',report:report('PASS')}
    ]
  });
  assert.equal(r.gate,'INSUFFICIENT');
  assert.ok(r.reasons.includes('SCIENTIFIC_EVIDENCE_INSUFFICIENT'));
});

test('optional unavailable guard cannot silently weaken required PASS',()=>{
  const r=evaluateScientificValidity({
    asOf:1000,
    guards:[
      {id:'SUPPORT',required:true,report:report('PASS')},
      {id:'HYPERGRAPH',required:false,report:null}
    ]
  });
  assert.equal(r.gate,'PASS');
  assert.ok(r.reasons.includes('OPTIONAL_SCIENTIFIC_GUARD_UNAVAILABLE'));
});

test('optional ABSTAIN degrades PASS to CAUTION but does not impersonate a required hard block',()=>{
  const r=evaluateScientificValidity({
    asOf:1000,
    guards:[
      {id:'SUPPORT',required:true,report:report('PASS')},
      {id:'INTERVENTIONAL',required:false,report:report('ABSTAIN')}
    ]
  });
  assert.equal(r.gate,'CAUTION');
  assert.ok(r.reasons.includes('OPTIONAL_SCIENTIFIC_GUARD_ABSTAIN'));
});

test('tampering with gate is detected by fingerprint verification',()=>{
  const r=evaluateScientificValidity({
    asOf:1000,
    guards:[{id:'SUPPORT',report:report('PASS')}]
  });
  const tampered={...r,gate:'ABSTAIN'};
  assert.equal(verifyScientificValidity(tampered).ok,false);
});

test('summary never creates trade permission',()=>{
  const s=scientificValiditySummary(evaluateScientificValidity({
    asOf:1000,
    guards:[{id:'SUPPORT',report:report('PASS')}]
  }));
  assert.equal(s.integrity,'VALID');
  assert.equal(s.executionMode,'SHADOW_ONLY');
  assert.equal(s.action,'ABSTAIN');
  assert.equal(s.canExecute,false);
});
