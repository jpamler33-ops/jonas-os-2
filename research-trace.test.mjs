import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createResearchTrace,
  verifyResearchTrace,
  createResearchTraceEvaluation,
  verifyResearchTraceEvaluation,
  researchTraceSummary
} from './research-trace.mjs';

const H='a'.repeat(64);
const G='b'.repeat(64);
const I='c'.repeat(64);
const S='d'.repeat(64);

function base(extra={}){
  return {
    symbol:'BTCUSDT',
    asOf:1000,
    generatedAt:1010,
    data:{fabricSeq:42,fabricTailHash:H,inputFingerprint:I},
    release:{releaseId:'release-42',configHash:G},
    researchState:{fingerprint:S,regime:'RANGE'},
    evidence:[{id:'witness',status:'SUPPORTIVE'}],
    contradictions:[{id:'memory',status:'WEAK'}],
    forecast:{forecastId:'fc-1',gate:'CAUTION'},
    science:{gate:'PASS'},
    safety:{state:'NORMAL',reasons:[],execution:'SHADOW_ONLY',canExecute:false},
    validity:{state:'VALID',reasons:[]},
    provenance:{source:'TCX_TEST',version:'1'},
    ...extra
  };
}

test('research trace is deterministic for equivalent logical input',()=>{
  const a=createResearchTrace(base());
  const b=createResearchTrace({
    ...base(),
    data:{inputFingerprint:I,fabricTailHash:H,fabricSeq:42},
    release:{configHash:G,releaseId:'release-42'}
  });
  assert.equal(a.traceId,b.traceId);
  assert.equal(verifyResearchTrace(a).ok,true);
});

test('research trace hard-locks execution invariants',()=>{
  assert.throws(()=>createResearchTrace(base({safety:{state:'NORMAL',execution:'LIVE',canExecute:false}})),/SHADOW_ONLY/);
  assert.throws(()=>createResearchTrace(base({safety:{state:'NORMAL',execution:'SHADOW_ONLY',canExecute:true}})),/cannot enable execution/);
  const t=createResearchTrace(base());
  assert.equal(t.safety.action,'ABSTAIN');
  assert.equal(t.safety.canExecute,false);
});

test('research trace rejects impossible issuance chronology',()=>{
  assert.throws(()=>createResearchTrace(base({asOf:2000,generatedAt:1999})),/predate/);
});

test('trace integrity detects post-issuance mutation',()=>{
  const original=createResearchTrace(base());
  const tampered=structuredClone(original);
  tampered.forecast.gate='PASS';
  const v=verifyResearchTrace(tampered);
  assert.equal(v.ok,false);
  assert.ok(v.reasons.includes('TRACE_HASH_MISMATCH'));
});

test('outcome evaluation is separate and cannot time-travel',()=>{
  const t=createResearchTrace(base());
  assert.throws(()=>createResearchTraceEvaluation(t,{horizonId:'5m',maturedAt:900,observedAt:1100,outcome:{returnPct:1}}),/predate/);
  assert.throws(()=>createResearchTraceEvaluation(t,{horizonId:'5m',maturedAt:1300,observedAt:1200,outcome:{returnPct:1}}),/before maturity/);
});

test('evaluation links deterministically to immutable issuance trace',()=>{
  const t=createResearchTrace(base());
  const e=createResearchTraceEvaluation(t,{
    horizonId:'5m',
    maturedAt:1300,
    observedAt:1310,
    outcome:{returnPct:.5},
    metrics:{brier:.18}
  });
  assert.equal(e.traceId,t.traceId);
  assert.equal(verifyResearchTraceEvaluation(e,t).ok,true);
  const altered={...e,metrics:{brier:.01}};
  assert.equal(verifyResearchTraceEvaluation(altered,t).ok,false);
});

test('summary exposes integrity and never execution permission',()=>{
  const s=researchTraceSummary(createResearchTrace(base()));
  assert.equal(s.integrity,'VALID');
  assert.equal(s.execution,'SHADOW_ONLY');
  assert.equal(s.action,'ABSTAIN');
  assert.equal(s.canExecute,false);
  assert.equal(s.forecastPresent,true);
  assert.equal(s.sciencePresent,true);
});


test('research trace immutably binds expansion evidence',()=>{
  const expansion={
    version:'TCX_INSTITUTIONAL_EXPANSION_V1',
    asOf:999,
    fingerprint:'e'.repeat(64),
    evidenceGate:'CAUTION',
    executionMode:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecute:false
  };
  const t=createResearchTrace(base({expansion}));
  assert.equal(t.expansion.fingerprint,expansion.fingerprint);
  assert.equal(researchTraceSummary(t).expansionPresent,true);
  const tampered=structuredClone(t);
  tampered.expansion.evidenceGate='PASS';
  assert.equal(verifyResearchTrace(tampered).ok,false);
});
