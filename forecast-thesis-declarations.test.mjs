import test from 'node:test';
import assert from 'node:assert/strict';

import { sha256 } from './institutional-kernel.mjs';
import { buildForecastThesisDeclarations, forecastThesisDeclarationSummary } from './forecast-thesis-declarations.mjs';
import { createForecastClaimAssumptionSidecar, verifyForecastClaimAssumptionSidecar } from './forecast-claim-assumption-sidecar.mjs';

function strongInput(){
  return {
    symbol:'BTCUSDT',
    asOf:1000,
    generatedAt:1010,
    inputFingerprint:'1'.repeat(64),
    state:{
      memoryDashboard:{
        regime:'TREND_UP',
        bias:'BULLISH',
        flow:'BID_PRESSURE',
        liquidity:'NORMAL',
        pressureScore:72
      },
      memoryAnalysis:{trend:'BULLISH'},
      mtf:{bias:'BULLISH'}
    },
    witnessReport:{
      agreementScore:.88,
      independentWitnessSatisfied:true,
      externalWitnessCount:2,
      contradictions:[]
    },
    mechanism:{
      version:'MTL_V1',
      hypothesis:{
        candidate:'REFLEXIVE_ALIGNMENT',
        candidateScore:.77,
        evidenceStrength:.74,
        gate:'HYPOTHESIS_SUPPORTED',
        causalStatus:'NOT_IDENTIFIED'
      },
      lattice:{
        sufficient:true,
        support:14,
        transitionCoherence:.78,
        novelty:.19
      },
      audit:{contradictionScore:.08}
    },
    evidenceRecord:{
      index:73,
      disagreementCount:0,
      gate:'HYPOTHESIS_SUPPORTED',
      fingerprint:'2'.repeat(64),
      stateFingerprint:{hash:'3'.repeat(64)}
    },
    researchDependencyGraph:{
      gate:'PASS',
      fingerprint:'4'.repeat(64),
      impact:{coverage:1,blockedFeatures:0}
    },
    scientificValidity:{
      gate:'PASS',
      fingerprint:'5'.repeat(64)
    }
  };
}

test('strong PIT thesis produces explicit material declarations without unsupported assumptions',()=>{
  const d=buildForecastThesisDeclarations(strongInput());
  assert.equal(d.version,'TCX_FORECAST_THESIS_DECLARATIONS_V1');
  assert.equal(d.claims.length,4);
  assert.equal(d.assumptions.length,8);
  assert.equal(d.evidence.length,7);
  assert.equal(d.dependencies.length,6);
  assert.deepEqual(d.diagnostics.unsupportedMaterialAssumptions,[]);
  assert.equal(d.diagnostics.mechanismCausalStatus,'NOT_IDENTIFIED');
  assert.equal(d.semantics.mechanismIsNotCausallyIdentified,true);
  assert.equal(d.canInfluencePrimary,false);
  assert.equal(d.canExecuteLive,false);
  assert.ok(d.claims.every(x=>x.availableAt===1010));
  assert.ok(d.assumptions.every(x=>x.availableAt===1010));
  assert.ok(d.evidence.every(x=>x.availableAt===1010));
});

test('weak thesis exposes unsupported assumptions instead of fabricating confidence',()=>{
  const input=strongInput();
  input.state.memoryDashboard.regime='UNKNOWN';
  input.state.memoryAnalysis.trend='INSUFFICIENT';
  input.witnessReport.independentWitnessSatisfied=false;
  input.witnessReport.externalWitnessCount=1;
  input.witnessReport.contradictions=['PRICE_DIVERGENCE'];
  input.mechanism.hypothesis.gate='INSUFFICIENT_EVIDENCE';
  input.mechanism.hypothesis.evidenceStrength=.3;
  input.mechanism.lattice.sufficient=false;
  input.mechanism.audit.contradictionScore=.6;
  input.evidenceRecord.index=31;
  input.evidenceRecord.disagreementCount=3;
  input.researchDependencyGraph.gate='ABSTAIN';
  input.researchDependencyGraph.impact.blockedFeatures=4;
  input.scientificValidity.gate='ABSTAIN';

  const d=buildForecastThesisDeclarations(input);
  const missing=new Set(d.diagnostics.unsupportedMaterialAssumptions);
  for(const id of [
    'THESIS_WORLD_STATE_REPRESENTATIVE',
    'THESIS_WITNESS_SUPPORT_ADEQUATE',
    'THESIS_MECHANISM_SUPPORT_ADEQUATE',
    'THESIS_TRANSITION_ANALOGUES_ADEQUATE',
    'THESIS_EVIDENCE_ALIGNMENT_ADEQUATE',
    'THESIS_DEPENDENCY_COVERAGE_ADEQUATE',
    'THESIS_DISAGREEMENT_WITHIN_TOLERANCE',
    'THESIS_SCIENTIFIC_GUARDS_ADEQUATE'
  ]){
    assert.ok(missing.has(id),id);
  }
  assert.equal(d.claims.find(x=>x.claimId==='THESIS_MECHANISM_CLAIM').epistemicClass,'MODELLED');
  assert.match(d.claims.find(x=>x.claimId==='THESIS_MECHANISM_CLAIM').statement,/causal status remains NOT_IDENTIFIED/);
});

test('thesis declarations create measurable graph defects only for unsupported required support',()=>{
  const d=buildForecastThesisDeclarations(strongInput());
  const forecastCore={
    forecastId:'BTCUSDT:1000',
    horizons:[{
      horizonId:'5m',
      horizonMs:300000,
      direction:'UP',
      expectedReturn:.002,
      probabilities:{up:.6,down:.2,flat:.2},
      interval:{q10:-.01,q90:.012},
      calibration:{status:'CALIBRATED'}
    }]
  };
  const forecast={...forecastCore,fingerprint:sha256(forecastCore)};
  const sidecar=createForecastClaimAssumptionSidecar({
    input:{
      symbol:'BTCUSDT',
      asOf:1000,
      inputFingerprint:'1'.repeat(64)
    },
    forecast,
    scientificValidity:{fingerprint:'5'.repeat(64),gate:'PASS'},
    admission:{fingerprint:'6'.repeat(64),gate:'PASS'},
    traceId:'7'.repeat(64),
    generatedAt:1010,
    declarations:d
  });
  assert.equal(verifyForecastClaimAssumptionSidecar(sidecar).ok,true);
  assert.equal(sidecar.declarationStats.customClaims,4);
  assert.equal(sidecar.declarationStats.customAssumptions,8);
  assert.equal(sidecar.declarationStats.customEvidence,7);
  assert.equal(sidecar.graph.diagnostics.defectCount,0);
  assert.equal(sidecar.graph.diagnostics.researchGate,'AUDIT_GRAPH_READY');
});

test('unsupported thesis support becomes a graph audit signal without changing execution authority',()=>{
  const input=strongInput();
  input.witnessReport.independentWitnessSatisfied=false;
  input.witnessReport.externalWitnessCount=1;
  input.mechanism.hypothesis.gate='INSUFFICIENT_EVIDENCE';
  input.mechanism.lattice.sufficient=false;
  input.evidenceRecord.index=20;
  input.mechanism.hypothesis.evidenceStrength=.2;

  const d=buildForecastThesisDeclarations(input);
  const forecastCore={
    forecastId:'BTCUSDT:1000',
    horizons:[{
      horizonId:'5m',
      horizonMs:300000,
      direction:'UP',
      expectedReturn:.002,
      probabilities:{up:.6,down:.2,flat:.2},
      interval:{q10:-.01,q90:.012},
      calibration:{status:'CALIBRATED'}
    }]
  };
  const forecast={...forecastCore,fingerprint:sha256(forecastCore)};
  const sidecar=createForecastClaimAssumptionSidecar({
    input:{symbol:'BTCUSDT',asOf:1000,inputFingerprint:'1'.repeat(64)},
    forecast,
    scientificValidity:{fingerprint:'5'.repeat(64),gate:'PASS'},
    admission:{fingerprint:'6'.repeat(64),gate:'PASS'},
    traceId:'7'.repeat(64),
    generatedAt:1010,
    declarations:d
  });
  assert.ok(sidecar.graph.diagnostics.defectCount>0);
  assert.equal(sidecar.graph.diagnostics.researchGate,'AUDIT_DEFECTS_PRESENT');
  assert.ok(sidecar.graph.diagnostics.affectedRequiredClaimCount>0);
  assert.equal(sidecar.canInfluencePrimary,false);
  assert.equal(sidecar.canExecuteLive,false);
});

test('declaration fingerprint is deterministic for the same frozen PIT state',()=>{
  const a=buildForecastThesisDeclarations(strongInput());
  const b=buildForecastThesisDeclarations(strongInput());
  assert.equal(a.fingerprint,b.fingerprint);
  assert.deepEqual(forecastThesisDeclarationSummary(a),forecastThesisDeclarationSummary(b));
});

test('generatedAt cannot predate decision state',()=>{
  const input=strongInput();
  input.generatedAt=999;
  assert.throws(()=>buildForecastThesisDeclarations(input),/cannot predate/);
});
