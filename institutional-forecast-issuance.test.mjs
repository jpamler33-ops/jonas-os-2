import test from 'node:test';
import assert from 'node:assert/strict';
import { sha256 } from './institutional-kernel.mjs';
import { createInstitutionalForecastIssuance, verifyInstitutionalForecastIssuance } from './institutional-forecast-issuance.mjs';

const H='a'.repeat(64), I='b'.repeat(64), C='c'.repeat(64), R='d'.repeat(64);

function science(gate='PASS'){
  const core={
    version:'TCX_SCIENTIFIC_VALIDITY_V1',asOf:1000,gate,coverage:1,
    requiredGuardCount:1,usableRequiredGuardCount:1,guards:[],reasons:[],
    epistemic:'SCIENTIFIC_SUPPORT_DIAGNOSTIC_NOT_FORECAST_PROBABILITY',
    executionMode:'SHADOW_ONLY',action:'ABSTAIN',canExecute:false
  };
  return {...core,fingerprint:sha256(core)};
}
function input(){return {symbol:'BTCUSDT',asOf:1000,price:65000,features:{x:1},dataQuality:.9,regimeConfidence:.8,regimeId:'RANGE'};}
function report(){
  return {
    executionMode:'SHADOW_ONLY',
    forecast:{
      symbol:'BTCUSDT',asOf:1000,price:65000,executionMode:'SHADOW_ONLY',
      path:{coherence:'OK'},
      forecasts:[{
        horizonId:'5m',horizonMs:300000,gate:'PASS',direction:'UP',
        expectedReturn:.002,probabilities:{up:.6,down:.2,flat:.2},
        interval:{q10:-.01,q25:-.003,median:.001,q75:.006,q90:.012},
        scenarios:[],
        calibration:{status:'CALIBRATED',method:'TRICLASS_EMPIRICAL',sampleCount:100,effectiveSamples:80,multiclassBrier:.4,logLoss:.7,maxClassGap:.03},
        localReliability:{status:'PASS',effectiveSamples:40,brierScore:.2},
        drift:{status:'STABLE',score:.1},
        analogs:{count:50,effectiveSamples:30,independentEpisodes:20,episodeEffectiveSamples:15,maxSimilarity:.9,oodScore:.1},
        modelDispersion:.01,probabilityDisagreement:.03,directionalEntropy:.5,operationalConfidence:.7,
        reasons:[],warnings:[],
        audit:{asOf:1000,usableTrainingCases:90,blockedFutureCases:0,invalidCases:0,featureCoverage:1,executionMode:'SHADOW_ONLY'}
      }]
    },
    regimeTransition:{status:'SUPPORTED'}
  };
}
function ctx(){
  return {
    data:{fabricSeq:12,fabricTailHash:H,inputFingerprint:I},
    release:{releaseId:'release-1',configHash:C},
    researchState:{fingerprint:R,regime:'RANGE'},
    evidence:[{id:'e1'}],contradictions:[],
    provenance:{source:'TEST',version:'1'}
  };
}

test('issuance atomically binds forecast, science, admission and trace',()=>{
  const x=createInstitutionalForecastIssuance({
    input:input(),forecastReport:report(),scientificValidity:science('PASS'),
    dataSafety:{state:'NORMAL'},researchValidity:{status:'VALID'},
    traceContext:ctx(),generatedAt:1010
  });
  assert.equal(x.gate,'PASS');
  assert.equal(x.researchDisposition,'ADMIT_RESEARCH');
  assert.equal(x.canExecute,false);
  assert.equal(x.trace.forecast.fingerprint,x.forecast.fingerprint);
  assert.equal(x.trace.science.fingerprint,x.scientificValidity.fingerprint);
  assert.equal(verifyInstitutionalForecastIssuance(x).ok,true);
});

test('science abstain propagates into issuance admission',()=>{
  const x=createInstitutionalForecastIssuance({
    input:input(),forecastReport:report(),scientificValidity:science('ABSTAIN'),
    dataSafety:{state:'NORMAL'},researchValidity:{status:'VALID'},
    traceContext:ctx(),generatedAt:1010
  });
  assert.equal(x.gate,'ABSTAIN');
  assert.equal(x.researchDisposition,'ABSTAIN');
  assert.equal(x.probabilityDisplayAllowed,false);
});

test('safe stop propagates without changing research artifact invariants',()=>{
  const x=createInstitutionalForecastIssuance({
    input:input(),forecastReport:report(),scientificValidity:science('PASS'),
    dataSafety:{state:'SAFE_STOP',reasons:['feed invalid']},researchValidity:{status:'VALID'},
    traceContext:ctx(),generatedAt:1010
  });
  assert.equal(x.gate,'ABSTAIN');
  assert.equal(x.trace.safety.state,'SAFE_STOP');
  assert.equal(x.executionMode,'SHADOW_ONLY');
  assert.equal(x.canExecute,false);
});

test('tampering any linked artifact invalidates issuance',()=>{
  const x=createInstitutionalForecastIssuance({
    input:input(),forecastReport:report(),scientificValidity:science('PASS'),
    dataSafety:{state:'NORMAL'},researchValidity:{status:'VALID'},
    traceContext:ctx(),generatedAt:1010
  });
  const y=structuredClone(x);
  y.admission.gate='ABSTAIN';
  assert.equal(verifyInstitutionalForecastIssuance(y).ok,false);
});

test('missing trace provenance fails closed during issuance',()=>{
  const bad=ctx();
  bad.data.fabricTailHash='bad';
  assert.throws(()=>createInstitutionalForecastIssuance({
    input:input(),forecastReport:report(),scientificValidity:science('PASS'),
    dataSafety:{state:'NORMAL'},researchValidity:{status:'VALID'},
    traceContext:bad,generatedAt:1010
  }),/sha256/);
});
