import test from 'node:test';
import assert from 'node:assert/strict';

import { sha256 } from './institutional-kernel.mjs';
import { createForecastClaimAssumptionSidecar, createForecastClaimAssumptionShadowObservation } from './forecast-claim-assumption-sidecar.mjs';
import {
  evaluateClaimAssumptionResearch,
  verifyClaimAssumptionResearchEvaluation
} from './claim-assumption-research-evaluator.mjs';

function baseArtifacts({defect=false,custom=true}={}){
  const inputCore={symbol:'BTCUSDT',asOf:1000,price:65000,features:{x:1},regimeId:'RANGE',regimeConfidence:.8,dataQuality:.9};
  const input={...inputCore,inputFingerprint:sha256(inputCore)};
  const forecastCore={
    forecastId:'BTCUSDT:1000',
    horizons:[{
      horizonId:'5m',horizonMs:300000,direction:'UP',expectedReturn:.002,
      probabilities:{up:.6,down:.2,flat:.2},
      interval:{q10:-.01,q90:.012},
      calibration:{status:'CALIBRATED'}
    }]
  };
  const forecast={...forecastCore,fingerprint:sha256(forecastCore)};
  const scientificValidity={fingerprint:'b'.repeat(64),gate:'PASS'};
  const admission={fingerprint:'c'.repeat(64),gate:'PASS'};
  const declarations=custom?{
    evidence:defect?[]:[{
      evidenceId:'THESIS_TEST_SUPPORT_EVIDENCE',
      classification:'INFERRED',
      statement:'Synthetic prospective thesis-support evidence for evaluator tests.',
      provenanceIds:['TEST'],
      availableAt:1010
    }],
    assumptions:[{
      assumptionId:'THESIS_TEST_SUPPORT',
      statement:'The synthetic thesis support condition is adequate.',
      evidenceIds:defect?[]:['THESIS_TEST_SUPPORT_EVIDENCE'],
      requiresEvidence:true,
      availableAt:1010
    }],
    claims:[{
      claimId:'THESIS_TEST_CLAIM',
      statement:'Synthetic thesis claim for paired evaluator tests.',
      epistemicClass:'INFERRED',
      required:true,
      assumptionIds:['THESIS_TEST_SUPPORT'],
      evidenceIds:defect?[]:['THESIS_TEST_SUPPORT_EVIDENCE'],
      availableAt:1010
    }]
  }:null;
  const sidecar=createForecastClaimAssumptionSidecar({
    input,forecast,scientificValidity,admission,
    traceId:'a'.repeat(64),generatedAt:1010,declarations
  });
  return {sidecar};
}

const alertSidecar=baseArtifacts({defect:true,custom:true}).sidecar;
const cleanSidecar=baseArtifacts({defect:false,custom:true}).sidecar;
const genericSidecar=baseArtifacts({defect:false,custom:false}).sidecar;

function observation(i,{
  challenger=false,
  baseline=false,
  topCorrect=true,
  intervalMiss=false,
  custom=true
}={}){
  const sidecar=challenger?alertSidecar:(custom?cleanSidecar:genericSidecar);
  return createForecastClaimAssumptionShadowObservation(sidecar,{
    horizonId:'5m',
    maturedAt:301000+i*10,
    observedAt:301001+i*10,
    evaluationId:sha256({i,challenger,baseline,topCorrect,intervalMiss,custom}),
    evaluationMetrics:{
      brier:topCorrect?.2:.9,
      logLoss:topCorrect?.3:1.4,
      absoluteReturnError:topCorrect?.001:.01,
      intervalMiss,
      topCorrect
    },
    outcome:{
      actualReturn:topCorrect?.002:-.004,
      actualDirection:topCorrect?'UP':'DOWN'
    },
    baselineAuditState:{
      alert:baseline,
      reasons:baseline?['BASELINE_ALERT']:[],
      safetyState:baseline?'DEGRADED':'NORMAL',
      validityState:'VALID',
      contradictionCount:0,
      forecastGate:'PASS',
      scienceGate:'PASS'
    },
    overhead:{
      graphNodes:sidecar.graph.nodes.length,
      graphEdges:sidecar.graph.edges.length,
      graphBytes:1000,
      traceBytes:800,
      sidecarBytes:1600
    }
  });
}

function dataset(rows){
  return {
    version:'TCX_FORECAST_CLAIM_ASSUMPTION_SHADOW_DATASET_V1',
    generatedAt:999999,
    observationCount:rows.length,
    observations:rows,
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canInfluencePrimary:false,
    canExecuteLive:false
  };
}

const lowThresholds={
  minObservations:20,
  minPrimaryFailures:10,
  minChallengerAlerts:5,
  minChallengerNonAlerts:5,
  minCustomDeclarationObservations:10,
  minConclusiveObservations:100
};

test('evaluator stays collecting when challenger has no alert variation',()=>{
  const rows=Array.from({length:40},(_,i)=>observation(i,{
    challenger:false,baseline:i%5===0,topCorrect:i%3!==0
  }));
  const r=evaluateClaimAssumptionResearch(dataset(rows),{config:lowThresholds});
  assert.equal(r.readiness.ready,false);
  assert.equal(r.conclusion.state,'COLLECTING_ALERT_VARIATION');
  assert.equal(r.conclusion.manualPromotionReviewEligible,false);
  assert.equal(r.canInfluencePrimary,false);
  assert.equal(r.canExecuteLive,false);
  assert.equal(verifyClaimAssumptionResearchEvaluation(r).ok,true);
});

test('paired evaluator identifies incremental failure detection without false-alert penalty',()=>{
  const rows=[];
  let i=0;
  for(let n=0;n<22;n++) rows.push(observation(i++,{challenger:true,baseline:n<2,topCorrect:false}));
  for(let n=0;n<8;n++) rows.push(observation(i++,{challenger:n<2,baseline:true,topCorrect:false}));
  for(let n=0;n<50;n++) rows.push(observation(i++,{challenger:n<3,baseline:n<6,topCorrect:true}));
  const r=evaluateClaimAssumptionResearch(dataset(rows),{config:lowThresholds});
  assert.equal(r.readiness.ready,true);
  assert.equal(r.primary.pairedFailureDetection.challengerOnly,20);
  assert.equal(r.primary.pairedFailureDetection.baselineOnly,6);
  assert.ok(r.primary.pairedFailureDetection.test.pValue<.05);
  assert.equal(r.conclusion.state,'PROMISING_INCREMENTAL_AUDIT_SIGNAL');
  assert.equal(r.conclusion.manualPromotionReviewEligible,true);
  assert.equal(r.governance.conclusionDoesNotAutoPromote,true);
});

test('paired evaluator flags false-positive burden rather than calling noisy alerts useful',()=>{
  const rows=[];
  let i=0;
  for(let n=0;n<20;n++) rows.push(observation(i++,{challenger:n<6,baseline:n<6,topCorrect:false}));
  for(let n=0;n<100;n++) rows.push(observation(i++,{challenger:n<80,baseline:n<10,topCorrect:true}));
  const r=evaluateClaimAssumptionResearch(dataset(rows),{config:{...lowThresholds,minConclusiveObservations:100}});
  assert.equal(r.readiness.ready,true);
  assert.ok(r.primary.pairedFalseAlerts.test.pValue<.05);
  assert.equal(r.conclusion.state,'FALSE_POSITIVE_BURDEN');
  assert.equal(r.conclusion.killReviewEligible,true);
  assert.equal(r.conclusion.manualPromotionReviewEligible,false);
  assert.equal(r.governance.conclusionDoesNotAutoKill,true);
});

test('generic baseline-only declarations do not satisfy custom declaration coverage',()=>{
  const rows=Array.from({length:40},(_,i)=>observation(i,{
    challenger:false,baseline:i%4===0,topCorrect:i%3!==0,custom:false
  }));
  const r=evaluateClaimAssumptionResearch(dataset(rows),{config:lowThresholds});
  assert.ok(r.readiness.reasons.includes('MIN_CUSTOM_DECLARATION_COVERAGE_NOT_MET'));
  assert.equal(r.coverage.customDeclarationObservations,0);
  assert.equal(r.conclusion.manualPromotionReviewEligible,false);
});

test('invalid observation blocks research conclusion instead of silently dropping evidence',()=>{
  const rows=Array.from({length:30},(_,i)=>observation(i,{
    challenger:i%2===0,baseline:i%3===0,topCorrect:i%4!==0
  }));
  const bad=structuredClone(rows[0]);
  bad.evaluationMetrics.topCorrect=!bad.evaluationMetrics.topCorrect;
  rows[0]=bad;
  const r=evaluateClaimAssumptionResearch(dataset(rows),{config:lowThresholds});
  assert.equal(r.rejectedObservationCount,1);
  assert.equal(r.conclusion.state,'DATA_INTEGRITY_BLOCKED');
  assert.equal(r.conclusion.killReviewEligible,false);
});

test('evaluator attributes prospective outcome association to frozen thesis assumption support',()=>{
  const rows=[];
  let i=0;
  for(let n=0;n<30;n++) rows.push(observation(i++,{challenger:true,baseline:false,topCorrect:n>=20}));
  for(let n=0;n<30;n++) rows.push(observation(i++,{challenger:false,baseline:false,topCorrect:n>=5}));
  const r=evaluateClaimAssumptionResearch(dataset(rows),{config:lowThresholds});
  const a=r.byThesisAssumption.find(x=>x.assumptionId==='THESIS_TEST_SUPPORT');
  assert.ok(a);
  assert.equal(a.declaredObservations,60);
  assert.equal(a.unsupportedObservations,30);
  assert.equal(a.supportedObservations,30);
  assert.ok(a.directionFailureRateDifference>0);
  assert.equal(a.associationReady,true);
  assert.equal(a.interpretation,'PROSPECTIVE_ASSOCIATION_ONLY_NOT_ASSUMPTION_TRUTH_OR_CAUSATION');
  assert.equal(r.methodology.outcomeDoesNotValidateIndividualAssumptions,true);
});

test('same frozen dataset produces same evaluation fingerprint',()=>{
  const rows=Array.from({length:30},(_,i)=>observation(i,{
    challenger:i%2===0,baseline:i%4===0,topCorrect:i%3!==0
  }));
  const a=evaluateClaimAssumptionResearch(dataset(rows),{config:lowThresholds,evaluatedAt:999999});
  const b=evaluateClaimAssumptionResearch(dataset(rows),{config:lowThresholds,evaluatedAt:999999});
  assert.equal(a.fingerprint,b.fingerprint);
  assert.equal(verifyClaimAssumptionResearchEvaluation(a).ok,true);
});

test('evaluation refuses a dataset that could influence PRIMARY',()=>{
  const d=dataset([]);
  d.canInfluencePrimary=true;
  assert.throws(()=>evaluateClaimAssumptionResearch(d),/safety invariant/);
});
