import test from 'node:test';
import assert from 'node:assert/strict';

import { sha256 } from './institutional-kernel.mjs';
import {
  createForecastClaimAssumptionSidecar,
  verifyForecastClaimAssumptionSidecar,
  forecastClaimAssumptionSidecarSummary,
  createForecastClaimAssumptionShadowObservation,
  verifyForecastClaimAssumptionShadowObservation
} from './forecast-claim-assumption-sidecar.mjs';

function artifacts(){
  const inputCore={
    schemaVersion:'TCX_FORECAST_INPUT_ADAPTER_V1',
    symbol:'BTCUSDT',
    asOf:1000,
    price:65000,
    features:{x:1},
    regimeId:'RANGE',
    regimeConfidence:.8,
    dataQuality:.9
  };
  const input={...inputCore,inputFingerprint:sha256(inputCore)};
  const forecastCore={
    schemaVersion:'TCX_FORECAST_CONTRACT_V1',
    forecastId:'BTCUSDT:1000',
    symbol:'BTCUSDT',
    generatedAt:1010,
    asOf:1000,
    price:65000,
    overallGate:'PASS',
    scienceGate:'PASS',
    horizons:[{
      horizonId:'5m',
      horizonMs:300000,
      gate:'PASS',
      direction:'UP',
      expectedReturn:.002,
      probabilities:{up:.6,down:.2,flat:.2},
      interval:{q10:-.01,q25:-.003,median:.001,q75:.006,q90:.012},
      calibration:{status:'CALIBRATED'},
      display:{probabilityDisplayAllowed:true}
    }],
    path:null,
    regimeTransition:null,
    inputQuality:{dataQuality:.9,regimeConfidence:.8,featureCount:1},
    epistemic:{probabilities:'PER_HORIZON_SEE_DISPLAY_EPISTEMIC',operationalConfidence:'DIAGNOSTIC_NOT_PROBABILITY',scenarios:'MODEL_CONDITIONAL_SCENARIOS_NOT_GUARANTEED_PATH',causality:'NOT_IDENTIFIED'},
    executionMode:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecute:false
  };
  const forecast={...forecastCore,fingerprint:sha256(forecastCore)};
  const scienceCore={
    version:'TCX_SCIENTIFIC_VALIDITY_V1',asOf:1000,gate:'PASS',
    executionMode:'SHADOW_ONLY',action:'ABSTAIN',canExecute:false
  };
  const scientificValidity={...scienceCore,fingerprint:sha256(scienceCore)};
  const admissionCore={
    version:'TCX_INSTITUTIONAL_ADMISSION_V1',asOf:1000,gate:'PASS',
    researchDisposition:'ADMIT_RESEARCH',probabilityDisplayAllowed:true,
    executionMode:'SHADOW_ONLY',action:'ABSTAIN',canExecute:false
  };
  const admission={...admissionCore,fingerprint:sha256(admissionCore)};
  return {input,forecast,scientificValidity,admission,traceId:'a'.repeat(64),generatedAt:1010};
}

test('forecast sidecar declares explicit model claims and assumptions without changing trade authority',()=>{
  const s=createForecastClaimAssumptionSidecar(artifacts());
  assert.equal(verifyForecastClaimAssumptionSidecar(s).ok,true);
  assert.equal(s.execution,'SHADOW_ONLY');
  assert.equal(s.action,'ABSTAIN');
  assert.equal(s.canInfluencePrimary,false);
  assert.equal(s.canExecuteLive,false);
  assert.equal(s.semantics.hiddenAssumptionsMayRemain,true);
  assert.equal(s.semantics.declarationCoverage,'PARTIAL_DECLARATIVE_BASELINE');
  assert.equal(s.graph.diagnostics.researchGate,'AUDIT_GRAPH_READY');
  assert.ok(s.graph.nodes.some(x=>x.id==='CLAIM:FORECAST_DIRECTION:5m'));
  assert.ok(s.graph.nodes.some(x=>x.id==='ASSUMPTION:STATE_REPRESENTATIVE:5m'));
  assert.ok(s.graph.nodes.some(x=>x.id==='ASSUMPTION:MODEL_TRANSPORTABILITY:5m'));
  assert.ok(s.graph.nodes.some(x=>x.id==='ASSUMPTION:CALIBRATION_TRANSFER:5m'));
});

test('baseline forecast assumptions are explicit scaffolding rather than claimed truth',()=>{
  const s=createForecastClaimAssumptionSidecar(artifacts());
  const assumptions=s.graph.nodes.filter(x=>x.type==='ASSUMPTION');
  assert.ok(assumptions.length>=4);
  assert.ok(assumptions.every(x=>x.epistemicClass==='ASSUMED'));
  assert.equal(s.semantics.genericAssumptionsAreResearchScaffoldingNotTruth,true);
  assert.equal(s.semantics.forecastArtifactIsNotIndependentEvidence,true);
});

test('custom thesis declarations can extend but cannot time-travel past issuance',()=>{
  const a=artifacts();
  const s=createForecastClaimAssumptionSidecar({
    ...a,
    declarations:{
      assumptions:[{
        assumptionId:'CUSTOM-FLOW',
        statement:'Observed flow regime remains relevant over the horizon.',
        evidenceIds:[],
        requiresEvidence:false,
        availableAt:1010,
        validUntil:301000
      }],
      claims:[{
        claimId:'CUSTOM-THESIS',
        statement:'Custom thesis remains conditional on flow persistence.',
        epistemicClass:'INFERRED',
        required:false,
        assumptionIds:['CUSTOM-FLOW'],
        evidenceIds:[],
        availableAt:1010
      }]
    }
  });
  assert.ok(s.graph.nodes.some(x=>x.id==='CLAIM:CUSTOM-THESIS'));
  assert.equal(s.declarationStats.customClaims,1);
  assert.equal(s.declarationStats.customAssumptions,1);

  assert.throws(()=>createForecastClaimAssumptionSidecar({
    ...a,
    declarations:{claims:[{
      claimId:'FUTURE',
      statement:'Future declaration.',
      epistemicClass:'MODELLED',
      availableAt:1011
    }]}
  }),/future claim/);
});

test('sidecar is bound to trace and canonical forecast fingerprints',()=>{
  const s=createForecastClaimAssumptionSidecar(artifacts());
  assert.equal(s.traceId,'a'.repeat(64));
  assert.equal(s.graph.sourceTraceId,s.traceId);
  const tampered=structuredClone(s);
  tampered.forecastFingerprint='b'.repeat(64);
  assert.equal(verifyForecastClaimAssumptionSidecar(tampered).ok,false);
});

test('uncalibrated horizon does not fabricate a calibration-transfer assumption',()=>{
  const a=artifacts();
  a.forecast=structuredClone(a.forecast);
  a.forecast.horizons[0].calibration.status='INSUFFICIENT';
  const {fingerprint,...core}=a.forecast;
  a.forecast={...core,fingerprint:sha256(core)};
  const s=createForecastClaimAssumptionSidecar(a);
  assert.equal(s.graph.nodes.some(x=>x.id==='ASSUMPTION:CALIBRATION_TRANSFER:5m'),false);
  const p=s.graph.nodes.find(x=>x.id==='CLAIM:FORECAST_PROBABILITIES:5m');
  assert.match(p.statement,/INSUFFICIENT/);
});

test('late declaration is visible instead of backdating assumption validity',()=>{
  const a=artifacts();
  a.generatedAt=400000;
  const s=createForecastClaimAssumptionSidecar(a);
  assert.deepEqual(s.declarationStats.lateDeclarationHorizons,['5m']);
  const state=s.graph.nodes.find(x=>x.id==='ASSUMPTION:STATE_REPRESENTATIVE:5m');
  assert.equal(state.validUntil,null);
  assert.equal(state.availableAt,400000);
});

test('matured outcome creates forward-shadow observation without inferring assumption truth',()=>{
  const s=createForecastClaimAssumptionSidecar(artifacts());
  const evaluationCore={traceId:'a'.repeat(64),horizonId:'5m',maturedAt:301000,observedAt:301100};
  const evaluationId=sha256(evaluationCore);
  const row=createForecastClaimAssumptionShadowObservation(s,{
    horizonId:'5m',
    maturedAt:301000,
    observedAt:301100,
    evaluationId
  });
  assert.equal(verifyForecastClaimAssumptionShadowObservation(row).ok,true);
  assert.equal(row.semantics.forwardShadowMeasurementOnly,true);
  assert.equal(row.semantics.doesNotInferAssumptionTruthFromOutcome,true);
  assert.ok(row.issuanceAuditState.horizonClaimIds.includes('FORECAST_DIRECTION:5m'));
  assert.equal(row.canInfluencePrimary,false);
  assert.equal(row.canExecuteLive,false);
});

test('sidecar summary exposes declaration coverage without turning it into confidence',()=>{
  const s=forecastClaimAssumptionSidecarSummary(createForecastClaimAssumptionSidecar(artifacts()));
  assert.equal(s.integrity,'VALID');
  assert.equal(s.epistemicStatus,'RESEARCH_SIDECAR_NOT_VALIDATED');
  assert.equal(s.graph.integrity,'VALID');
  assert.equal(s.execution,'SHADOW_ONLY');
  assert.equal(s.canInfluencePrimary,false);
});
