import test from 'node:test';
import assert from 'node:assert/strict';
import { sha256 } from './institutional-kernel.mjs';
import { evaluateInstitutionalAdmission, verifyInstitutionalAdmission } from './institutional-admission.mjs';

function forecast(gate='PASS',display=true){
  const core={
    schemaVersion:'TCX_FORECAST_CONTRACT_V1',
    forecastId:'f1',symbol:'BTCUSDT',generatedAt:1000,asOf:1000,price:1,
    overallGate:gate,scienceGate:'PASS',
    horizons:[{display:{probabilityDisplayAllowed:display}}],
    path:null,regimeTransition:null,inputQuality:{},
    epistemic:{},executionMode:'SHADOW_ONLY',action:'ABSTAIN',canExecute:false
  };
  return {...core,fingerprint:sha256(core)};
}
function science(gate='PASS'){
  const core={
    version:'TCX_SCIENTIFIC_VALIDITY_V1',asOf:1000,gate,coverage:1,
    requiredGuardCount:1,usableRequiredGuardCount:1,guards:[],reasons:[],
    epistemic:'SCIENTIFIC_SUPPORT_DIAGNOSTIC_NOT_FORECAST_PROBABILITY',
    executionMode:'SHADOW_ONLY',action:'ABSTAIN',canExecute:false
  };
  return {...core,fingerprint:sha256(core)};
}

test('all PASS admits research but never execution',()=>{
  const r=evaluateInstitutionalAdmission({
    asOf:1000,
    dataSafety:{state:'NORMAL',asOf:1000},
    researchValidity:{status:'VALID'},
    forecast:forecast('PASS'),
    scientificValidity:science('PASS')
  });
  assert.equal(r.gate,'PASS');
  assert.equal(r.researchAdmitted,true);
  assert.equal(r.probabilityDisplayAllowed,true);
  assert.equal(r.invariants.canExecute,false);
  assert.equal(verifyInstitutionalAdmission(r).ok,true);
});

test('SAFE_STOP dominates downstream PASS',()=>{
  const r=evaluateInstitutionalAdmission({
    asOf:1000,
    dataSafety:{state:'SAFE_STOP'},
    researchValidity:{status:'VALID'},
    forecast:forecast('PASS'),
    scientificValidity:science('PASS')
  });
  assert.equal(r.gate,'ABSTAIN');
  assert.equal(r.researchAdmitted,false);
});

test('expired research state dominates forecast PASS',()=>{
  const r=evaluateInstitutionalAdmission({
    asOf:1000,
    dataSafety:{state:'NORMAL'},
    researchValidity:{status:'EXPIRED'},
    forecast:forecast('PASS'),
    scientificValidity:science('PASS')
  });
  assert.equal(r.gate,'ABSTAIN');
});

test('science ABSTAIN cannot be averaged away',()=>{
  const r=evaluateInstitutionalAdmission({
    asOf:1000,
    dataSafety:{state:'NORMAL'},
    researchValidity:{status:'VALID'},
    forecast:forecast('PASS'),
    scientificValidity:science('ABSTAIN')
  });
  assert.equal(r.gate,'ABSTAIN');
});

test('CAUTION admits research with caution',()=>{
  const r=evaluateInstitutionalAdmission({
    asOf:1000,
    dataSafety:{state:'DEGRADED'},
    researchValidity:{status:'VALID'},
    forecast:forecast('PASS'),
    scientificValidity:science('PASS')
  });
  assert.equal(r.gate,'CAUTION');
  assert.equal(r.researchDisposition,'ADMIT_WITH_CAUTION');
});

test('invalid forecast fingerprint fails closed',()=>{
  const f=forecast('PASS');
  f.overallGate='CAUTION';
  const r=evaluateInstitutionalAdmission({
    asOf:1000,
    dataSafety:{state:'NORMAL'},
    researchValidity:{status:'VALID'},
    forecast:f,
    scientificValidity:science('PASS')
  });
  assert.equal(r.gate,'ABSTAIN');
  assert.equal(r.components.forecast.integrity,'INVALID');
});

test('future component timestamp hard-abstains',()=>{
  const r=evaluateInstitutionalAdmission({
    asOf:1000,
    dataSafety:{state:'NORMAL',availableAt:1001},
    researchValidity:{status:'VALID'},
    forecast:forecast('PASS'),
    scientificValidity:science('PASS')
  });
  assert.equal(r.gate,'ABSTAIN');
  assert.ok(r.reasons.includes('DATA_AVAILABLEAT_FROM_FUTURE'));
});

test('uncalibrated/suppressed horizon blocks probability display even when research is admissible',()=>{
  const r=evaluateInstitutionalAdmission({
    asOf:1000,
    dataSafety:{state:'NORMAL'},
    researchValidity:{status:'VALID'},
    forecast:forecast('PASS',false),
    scientificValidity:science('PASS')
  });
  assert.equal(r.gate,'PASS');
  assert.equal(r.probabilityDisplayAllowed,false);
});

test('admission tampering is detected',()=>{
  const r=evaluateInstitutionalAdmission({
    asOf:1000,
    dataSafety:{state:'NORMAL'},
    researchValidity:{status:'VALID'},
    forecast:forecast('PASS'),
    scientificValidity:science('PASS')
  });
  const x=structuredClone(r);
  x.gate='ABSTAIN';
  assert.equal(verifyInstitutionalAdmission(x).ok,false);
});


test('research baseline is admitted only with caution',()=>{
  const r=evaluateInstitutionalAdmission({
    asOf:1000,
    dataSafety:{state:'NORMAL'},
    researchValidity:{status:'BASELINE'},
    forecast:forecast('PASS'),
    scientificValidity:science('PASS')
  });
  assert.equal(r.gate,'CAUTION');
  assert.equal(r.researchDisposition,'ADMIT_WITH_CAUTION');
});
