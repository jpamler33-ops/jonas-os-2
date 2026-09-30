import test from 'node:test';
import assert from 'node:assert/strict';

import { sha256 } from './institutional-kernel.mjs';
import { buildForecastThesisDeclarations } from './forecast-thesis-declarations.mjs';
import { createForecastClaimAssumptionSidecar } from './forecast-claim-assumption-sidecar.mjs';
import {
  createInitialForecastThesisRevisionMemory,
  createForecastThesisRevisionArtifact,
  applyForecastThesisRevision,
  verifyForecastThesisRevisionMemory,
  verifyForecastThesisRevisionArtifact,
  forecastThesisPreOutcomeRevisionState
} from './forecast-thesis-revision-memory.mjs';

function context(asOf=1000,generatedAt=1010){
  return {
    symbol:'BTCUSDT',
    asOf,
    generatedAt,
    inputFingerprint:sha256({symbol:'BTCUSDT',asOf}),
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
      channels:{REFLEXIVE_ALIGNMENT:.77,FORCED_FLOW:.4},
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
      fingerprint:sha256({kind:'evidence',asOf}),
      stateFingerprint:{hash:sha256({kind:'state',asOf})},
      map:{layers:[]}
    },
    researchDependencyGraph:{
      gate:'PASS',
      fingerprint:sha256({kind:'dependency',asOf}),
      reasons:[],
      impact:{coverage:1,blockedFeatures:0,blockedFeatureIds:[]}
    },
    scientificValidity:{
      gate:'PASS',
      fingerprint:sha256({kind:'science',asOf})
    }
  };
}

function declarations(asOf=1000,generatedAt=1010,mutate=null){
  const x=context(asOf,generatedAt);
  mutate?.(x);
  return buildForecastThesisDeclarations(x);
}

function issuance(){
  const d=declarations();
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
    input:{symbol:'BTCUSDT',asOf:1000,inputFingerprint:context().inputFingerprint},
    forecast,
    scientificValidity:{fingerprint:'5'.repeat(64),gate:'PASS'},
    admission:{fingerprint:'6'.repeat(64),gate:'PASS'},
    traceId:'7'.repeat(64),
    generatedAt:1010,
    declarations:d
  });
  return {
    issuanceId:'ISSUANCE-1',
    symbol:'BTCUSDT',
    asOf:1000,
    forecast,
    claimAssumptionSidecar:sidecar
  };
}

test('initial memory freezes issue support without rewriting the sidecar',()=>{
  const i=issuance();
  const m=createInitialForecastThesisRevisionMemory({forecastId:'BTCUSDT:1000',issuance:i});
  assert.equal(verifyForecastThesisRevisionMemory(m).ok,true);
  assert.equal(m.assumptionCount,8);
  assert.equal(m.events.length,0);
  assert.equal(m.firstStaleAt,null);
  assert.equal(m.firstForecastInvalidatedAt,null);
  assert.ok(m.assumptions.every(x=>x.issueSupported===true&&x.currentSupported===true));
  assert.equal(m.canInfluencePrimary,false);
  assert.equal(m.canExecuteLive,false);
});

test('later support loss records exact assumption transition and forecast watch state',()=>{
  const i=issuance();
  const m=createInitialForecastThesisRevisionMemory({forecastId:'BTCUSDT:1000',issuance:i});
  const current=declarations(61_000,61_010,x=>{
    x.witnessReport.independentWitnessSatisfied=false;
    x.witnessReport.externalWitnessCount=1;
  });
  const artifact=createForecastThesisRevisionArtifact({
    issuance:i,
    currentDeclarations:current,
    observedAt:61_000,
    currentInputFingerprint:context(61_000,61_010).inputFingerprint,
    forecastRevisionAssessment:{
      status:'WATCH',
      score:.44,
      reasons:['realized path is outside the issued forecast envelope'],
      warnings:[],
      elapsedMs:60_000,
      envelopeBreach:.3,
      regimeChanged:false,
      hardGuardActive:false
    }
  });
  assert.equal(verifyForecastThesisRevisionArtifact(artifact).ok,true);
  assert.ok(artifact.diagnostics.supportLostSinceIssueIds.includes('THESIS_WITNESS_SUPPORT_ADEQUATE'));

  const applied=applyForecastThesisRevision(m,artifact);
  assert.equal(applied.changed,true);
  assert.equal(applied.memory.firstStaleAt,61_000);
  assert.equal(applied.memory.firstWatchAt,61_000);
  assert.equal(applied.memory.eventCount,1);
  assert.ok(applied.event.supportTransitions.some(x=>
    x.assumptionId==='THESIS_WITNESS_SUPPORT_ADEQUATE'&&x.transition==='SUPPORT_LOST'
  ));
  const transition=applied.event.supportTransitions.find(x=>x.assumptionId==='THESIS_WITNESS_SUPPORT_ADEQUATE');
  assert.ok(transition.currentEvidence.some(x=>
    x.evidenceId==='THESIS_WITNESS_STATE'&&
    x.provenanceIds.includes('SATISFIED:false')
  ));
});

test('repeating the same stale state does not create revision spam',()=>{
  const i=issuance();
  let m=createInitialForecastThesisRevisionMemory({forecastId:'BTCUSDT:1000',issuance:i});
  const current=declarations(61_000,61_010,x=>{
    x.witnessReport.independentWitnessSatisfied=false;
    x.witnessReport.externalWitnessCount=1;
  });
  const first=createForecastThesisRevisionArtifact({
    issuance:i,currentDeclarations:current,observedAt:61_000,
    forecastRevisionAssessment:{status:'WATCH',score:.4,reasons:[],warnings:[]}
  });
  m=applyForecastThesisRevision(m,first).memory;

  const later=declarations(121_000,121_010,x=>{
    x.witnessReport.independentWitnessSatisfied=false;
    x.witnessReport.externalWitnessCount=1;
  });
  const repeated=createForecastThesisRevisionArtifact({
    issuance:i,currentDeclarations:later,observedAt:121_000,
    forecastRevisionAssessment:{status:'WATCH',score:.42,reasons:[],warnings:[]}
  });
  const applied=applyForecastThesisRevision(m,repeated);
  assert.equal(applied.changed,false);
  assert.equal(applied.memory.eventCount,1);
});

test('support restoration is a separate prospective event',()=>{
  const i=issuance();
  let m=createInitialForecastThesisRevisionMemory({forecastId:'BTCUSDT:1000',issuance:i});
  const lost=declarations(61_000,61_010,x=>{
    x.witnessReport.independentWitnessSatisfied=false;
    x.witnessReport.externalWitnessCount=1;
  });
  m=applyForecastThesisRevision(m,createForecastThesisRevisionArtifact({
    issuance:i,currentDeclarations:lost,observedAt:61_000,
    forecastRevisionAssessment:{status:'WATCH',score:.4,reasons:[],warnings:[]}
  })).memory;

  const restored=declarations(121_000,121_010);
  const applied=applyForecastThesisRevision(m,createForecastThesisRevisionArtifact({
    issuance:i,currentDeclarations:restored,observedAt:121_000,
    forecastRevisionAssessment:{status:'VALID',score:.1,reasons:[],warnings:[]}
  }));
  assert.equal(applied.changed,true);
  assert.ok(applied.event.supportTransitions.some(x=>
    x.assumptionId==='THESIS_WITNESS_SUPPORT_ADEQUATE'&&x.transition==='SUPPORT_RESTORED'
  ));
  const row=applied.memory.assumptions.find(x=>x.assumptionId==='THESIS_WITNESS_SUPPORT_ADEQUATE');
  assert.equal(row.currentSupported,true);
  assert.equal(row.supportTransitionCount,2);
});

test('forecast invalidation is timestamped independently of assumption support loss',()=>{
  const i=issuance();
  const m=createInitialForecastThesisRevisionMemory({forecastId:'BTCUSDT:1000',issuance:i});
  const current=declarations(181_000,181_010);
  const applied=applyForecastThesisRevision(m,createForecastThesisRevisionArtifact({
    issuance:i,currentDeclarations:current,observedAt:181_000,
    forecastRevisionAssessment:{
      status:'INVALIDATED',
      score:.91,
      reasons:['unexpected regime transition invalidates original state assumptions'],
      warnings:[],
      regimeChanged:true
    }
  }));
  assert.equal(applied.memory.firstForecastInvalidatedAt,181_000);
  assert.equal(applied.memory.firstStaleAt,null);
  assert.equal(applied.event.forecastAssessmentTransition.to,'INVALIDATED');
});

test('pre-outcome view only uses revisions known before maturity and reports warning lead time',()=>{
  const i=issuance();
  let m=createInitialForecastThesisRevisionMemory({forecastId:'BTCUSDT:1000',issuance:i});
  const lost=declarations(61_000,61_010,x=>{
    x.witnessReport.independentWitnessSatisfied=false;
    x.witnessReport.externalWitnessCount=1;
  });
  m=applyForecastThesisRevision(m,createForecastThesisRevisionArtifact({
    issuance:i,currentDeclarations:lost,observedAt:61_000,
    forecastRevisionAssessment:{status:'WATCH',score:.4,reasons:[],warnings:[]}
  })).memory;
  const invalidated=declarations(241_000,241_010);
  m=applyForecastThesisRevision(m,createForecastThesisRevisionArtifact({
    issuance:i,currentDeclarations:invalidated,observedAt:241_000,
    forecastRevisionAssessment:{status:'INVALIDATED',score:.9,reasons:['path breach'],warnings:[]}
  })).memory;

  const before=forecastThesisPreOutcomeRevisionState(m,{maturedAt:180_000});
  assert.equal(before.warningAvailableBeforeMaturity,true);
  assert.equal(before.firstWarningAt,61_000);
  assert.equal(before.warningLeadMs,119_000);
  assert.equal(before.forecastInvalidatedBeforeMaturity,false);
  assert.ok(before.everStaleAssumptionIdsBeforeMaturity.includes('THESIS_WITNESS_SUPPORT_ADEQUATE'));

  const after=forecastThesisPreOutcomeRevisionState(m,{maturedAt:300_000});
  assert.equal(after.forecastInvalidatedBeforeMaturity,true);
  assert.equal(after.firstForecastInvalidatedAt,241_000);
});

test('a missing declaration is audited but is not silently converted into support loss',()=>{
  const i=issuance();
  const m=createInitialForecastThesisRevisionMemory({forecastId:'BTCUSDT:1000',issuance:i});
  const current=structuredClone(declarations(61_000,61_010));
  current.assumptions=current.assumptions.filter(x=>x.assumptionId!=='THESIS_WITNESS_SUPPORT_ADEQUATE');
  current.fingerprint=sha256({
    symbol:current.symbol,
    asOf:current.asOf,
    generatedAt:current.generatedAt,
    claims:current.claims,
    assumptions:current.assumptions,
    evidence:current.evidence,
    dependencies:current.dependencies
  });
  const artifact=createForecastThesisRevisionArtifact({
    issuance:i,currentDeclarations:current,observedAt:61_000,
    forecastRevisionAssessment:{status:'VALID',score:.1,reasons:[],warnings:[]}
  });
  const row=artifact.assumptions.find(x=>x.assumptionId==='THESIS_WITNESS_SUPPORT_ADEQUATE');
  assert.equal(row.currentSupported,null);
  const applied=applyForecastThesisRevision(m,artifact);
  assert.equal(applied.changed,true);
  assert.ok(applied.event.missingDeclarationIds.includes('THESIS_WITNESS_SUPPORT_ADEQUATE'));
  const memoryRow=applied.memory.assumptions.find(x=>x.assumptionId==='THESIS_WITNESS_SUPPORT_ADEQUATE');
  assert.equal(memoryRow.currentSupported,true);
  assert.equal(memoryRow.firstSupportLostAt,null);
});
