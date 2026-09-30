import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';

import { sha256 } from './institutional-kernel.mjs';
import { buildForecastThesisDeclarations } from './forecast-thesis-declarations.mjs';
import { createForecastClaimAssumptionSidecar } from './forecast-claim-assumption-sidecar.mjs';
import {
  createInitialForecastThesisRevisionMemory,
  createForecastThesisRevisionArtifact,
  applyForecastThesisRevision
} from './forecast-thesis-revision-memory.mjs';
import {
  createBiggjLivingResearchRuntime,
  refreshBiggjLivingResearchRuntime,
  saveBiggjLivingResearchRuntime,
  openBiggjLivingResearchRuntime,
  biggjLivingResearchRuntimeSummary,
  verifyBiggjLivingResearchRuntime
} from './biggj-living-research-runtime.mjs';

function context(asOf=1000,generatedAt=1010){
  return {
    symbol:'BTCUSDT',
    asOf,
    generatedAt,
    inputFingerprint:sha256({symbol:'BTCUSDT',asOf}),
    state:{
      memoryDashboard:{regime:'TREND_UP',bias:'BULLISH',flow:'BID_PRESSURE',liquidity:'NORMAL',pressureScore:72},
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
      lattice:{sufficient:true,support:14,transitionCoherence:.78,novelty:.19},
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
    scientificValidity:{gate:'PASS',fingerprint:sha256({kind:'science',asOf})}
  };
}

function declarations(asOf=1000,generatedAt=1010,mutate=null){
  const x=context(asOf,generatedAt);
  mutate?.(x);
  return buildForecastThesisDeclarations(x);
}

function issuance(forecastId){
  const d=declarations();
  const forecastCore={
    forecastId,
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
    traceId:sha256({forecastId,trace:true}),
    generatedAt:1010,
    declarations:d
  });
  return {issuanceId:'ISSUANCE-'+forecastId,symbol:'BTCUSDT',asOf:1000,forecast,claimAssumptionSidecar:sidecar};
}

function reviseWitnessSupport(i,forecastId){
  let memory=createInitialForecastThesisRevisionMemory({forecastId,issuance:i});
  const flickerDeclarations=declarations(61_000,61_010,x=>{
    x.witnessReport.independentWitnessSatisfied=false;
    x.witnessReport.externalWitnessCount=1;
  });
  const flicker=applyForecastThesisRevision(memory,createForecastThesisRevisionArtifact({
    issuance:i,
    currentDeclarations:flickerDeclarations,
    observedAt:61_010,
    forecastRevisionAssessment:{status:'WATCH',score:.4,reasons:[],warnings:[]}
  }));
  assert.equal(
    flicker.memory.assumptions.find(x=>x.assumptionId==='THESIS_WITNESS_SUPPORT_ADEQUATE').stability.state,
    'TRANSIENT_FLICKER'
  );

  const staleDeclarations=declarations(121_000,121_010,x=>{
    x.witnessReport.independentWitnessSatisfied=false;
    x.witnessReport.externalWitnessCount=1;
  });
  const persistent=applyForecastThesisRevision(flicker.memory,createForecastThesisRevisionArtifact({
    issuance:i,
    currentDeclarations:staleDeclarations,
    observedAt:121_010,
    forecastRevisionAssessment:{status:'WATCH',score:.42,reasons:[],warnings:[]}
  }));
  assert.ok(persistent.event?.stabilityTransitions?.some(x=>
    x.assumptionId==='THESIS_WITNESS_SUPPORT_ADEQUATE'&&x.type==='PERSISTENT_STALE_CONFIRMED'
  ));
  assert.equal(
    persistent.memory.assumptions.find(x=>x.assumptionId==='THESIS_WITNESS_SUPPORT_ADEQUATE').stability.state,
    'PERSISTENT_STALE'
  );
  return {flicker:flicker.memory,persistent:persistent.memory};
}

test('forecast thesis persistence creates one research-only skill and reload is exactly idempotent',async()=>{
  const cases=['BTCUSDT:1000:A','BTCUSDT:1000:B','BTCUSDT:1000:C'].map(forecastId=>{
    const issued=issuance(forecastId);
    assert.equal(issued.forecast.forecastId,forecastId);
    assert.ok(issued.claimAssumptionSidecar?.graphFingerprint);
    const revised=reviseWitnessSupport(issued,forecastId);
    return {issued,...revised};
  });

  const initial=createBiggjLivingResearchRuntime({asOf:1000});
  const flickerRefresh=refreshBiggjLivingResearchRuntime(initial,{
    thesisMemories:cases.map(x=>x.flicker),
    asOf:70_000,
    reason:'INTEGRATION_FLICKER'
  });
  assert.equal(flickerRefresh.discoveredSkillIds.length,0);
  assert.equal(flickerRefresh.state.agenda.find(x=>x.assumptionId==='THESIS_WITNESS_SUPPORT_ADEQUATE')?.status,'WATCH_FLICKER');

  const persistentRefresh=refreshBiggjLivingResearchRuntime(flickerRefresh.state,{
    thesisMemories:cases.map(x=>x.persistent),
    asOf:130_000,
    reason:'INTEGRATION_PERSISTENT_STALE'
  });
  assert.equal(persistentRefresh.discoveredSkillIds.length,1);
  const agenda=persistentRefresh.state.agenda.find(x=>x.assumptionId==='THESIS_WITNESS_SUPPORT_ADEQUATE');
  assert.equal(agenda?.status,'RESEARCH_REQUIRED');
  assert.equal(agenda?.distinctPersistentForecasts,3);

  const discovered=persistentRefresh.state.skillTree.nodes.find(x=>x.skillId===persistentRefresh.discoveredSkillIds[0]);
  assert.ok(discovered);
  assert.equal(discovered.kind,'DISCOVERED_SKILL');
  assert.equal(discovered.status,'DISCOVERING');
  assert.equal(discovered.promotionStage,'RESEARCH_ONLY');
  assert.equal(discovered.discoveredBy,'ASSUMPTION_PERSISTENCE_RUNTIME_V1');
  assert.equal(discovered.productionMutationAllowed,false);
  assert.equal(discovered.canExecuteLive,false);
  assert.equal(persistentRefresh.state.execution,'SHADOW_ONLY');
  assert.equal(persistentRefresh.state.action,'ABSTAIN');
  assert.equal(persistentRefresh.state.canInfluencePrimary,false);
  assert.equal(persistentRefresh.state.canExecuteLive,false);
  assert.equal(verifyBiggjLivingResearchRuntime(persistentRefresh.state).ok,true);

  const dir=await mkdtemp(path.join(tmpdir(),'biggj-living-research-integration-'));
  const file=path.join(dir,'runtime.json');
  try{
    await saveBiggjLivingResearchRuntime(file,persistentRefresh.state);
    const reopened=await openBiggjLivingResearchRuntime(file,{asOf:140_000});
    assert.equal(reopened.recoveredFromCorrupt,false);
    assert.equal(reopened.state.fingerprint,persistentRefresh.state.fingerprint);
    assert.equal(reopened.state.skillTree.fingerprint,persistentRefresh.state.skillTree.fingerprint);

    const beforeNodes=reopened.state.skillTree.nodes.length;
    const replay=refreshBiggjLivingResearchRuntime(reopened.state,{
      thesisMemories:cases.map(x=>x.persistent),
      asOf:150_000,
      reason:'INTEGRATION_REPLAY'
    });
    assert.equal(replay.changed,false);
    assert.deepEqual(replay.discoveredSkillIds,[]);
    assert.equal(replay.state.fingerprint,reopened.state.fingerprint);
    assert.equal(replay.state.skillTree.nodes.length,beforeNodes);

    const summary=biggjLivingResearchRuntimeSummary(replay.state);
    assert.equal(summary.researchRequired,1);
    assert.equal(summary.discoveredResearchOnlySkills,1);
    assert.deepEqual(summary.discoveredResearchOnlySkillIds,persistentRefresh.discoveredSkillIds);
    assert.equal(summary.automaticPromotion,false);
    assert.equal(summary.automaticKill,false);
    assert.equal(summary.automaticExperimentLaunch,false);
    assert.equal(summary.primaryMutationAllowed,false);
    assert.equal(summary.execution,'SHADOW_ONLY');
    assert.equal(summary.action,'ABSTAIN');
    assert.equal(summary.canInfluencePrimary,false);
    assert.equal(summary.canExecuteLive,false);
  }finally{
    await rm(dir,{recursive:true,force:true});
  }
});
