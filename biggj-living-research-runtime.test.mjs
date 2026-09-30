import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { sha256 } from './institutional-kernel.mjs';
import {
  createBiggjLivingResearchRuntime,
  refreshBiggjLivingResearchRuntime,
  openBiggjLivingResearchRuntime,
  saveBiggjLivingResearchRuntime,
  verifyBiggjLivingResearchRuntime,
  biggjLivingResearchRuntimeSummary,
  biggjAssumptionResearchTemplates
} from './biggj-living-research-runtime.mjs';

function thesisMemory({
  forecastId,
  assumptionId='THESIS_WITNESS_SUPPORT_ADEQUATE',
  state='PERSISTENT_STALE',
  persistentStaleCount=1,
  falsifiers=['WITNESS_NOT_SATISFIED'],
  eventType='PERSISTENT_STALE_CONFIRMED',
  observedAt=1000
}={}){
  return {
    forecastId,
    firstPersistentStaleAt:state==='PERSISTENT_STALE'?observedAt:null,
    assumptions:[{
      assumptionId,
      issueSupported:true,
      currentSupported:state!=='PERSISTENT_STALE'&&state!=='TRANSIENT_FLICKER',
      stability:{
        state,
        firstPersistentStaleAt:state==='PERSISTENT_STALE'?observedAt:null,
        persistentStaleCount,
        transientFlickerCount:state==='TRANSIENT_FLICKER'?1:0,
        recoveryCount:0,
        relapseCount:0,
        currentUnsupportedDurationMs:state==='PERSISTENT_STALE'?120000:1000,
        currentFalsifierCodes:falsifiers,
        repeatedFalsifierCodes:state==='PERSISTENT_STALE'?falsifiers:[]
      }
    }],
    events:eventType?[{
      eventId:'event:'+forecastId,
      observedAt,
      stabilityTransitions:[{
        eventId:'stability:'+forecastId,
        assumptionId,
        type:eventType,
        observedAt,
        repeatedFalsifierCodes:state==='PERSISTENT_STALE'?falsifiers:[],
        falsifierCodes:falsifiers
      }]
    }]:[]
  };
}

function report({
  assumptionId='THESIS_WITNESS_SUPPORT_ADEQUATE',
  ready=false,
  direction=.0,
  interval=.0,
  evaluatedAt=5000
}={}){
  const core={
    evaluatedAt,
    byPreOutcomeStaleAssumption:[{
      assumptionId,
      persistenceFiltered:{
        observations:80,
        persistentStaleBeforeMaturity:30,
        neverPersistentStaleBeforeMaturity:50,
        associationReady:ready,
        directionFailureRateDifference:direction,
        intervalMissRateDifference:interval,
        interpretation:'PERSISTENCE_FILTERED_STALENESS_ASSOCIATION_ONLY_NOT_CAUSAL_PROOF'
      }
    }]
  };
  return {...core,fingerprint:sha256(core)};
}

test('initial living research runtime is a governed research-only skill graph',()=>{
  const state=createBiggjLivingResearchRuntime({asOf:1000});
  assert.equal(verifyBiggjLivingResearchRuntime(state).ok,true);
  assert.equal(state.execution,'SHADOW_ONLY');
  assert.equal(state.action,'ABSTAIN');
  assert.equal(state.canInfluencePrimary,false);
  assert.equal(state.canExecuteLive,false);
  assert.equal(state.invariants.automaticPromotion,false);
  assert.equal(state.invariants.automaticKill,false);
  assert.equal(state.invariants.automaticExperimentLaunch,false);
  assert.equal(state.invariants.primaryMutationAllowed,false);
  assert.equal(state.discoveredSkillIds.length,0);
  assert.ok(state.skillTree.nodes.length>=159);
});

test('transient flicker becomes a watch item but cannot autonomously create a skill',()=>{
  const initial=createBiggjLivingResearchRuntime({asOf:1000});
  const out=refreshBiggjLivingResearchRuntime(initial,{
    thesisMemories:[
      thesisMemory({
        forecastId:'F1',
        state:'TRANSIENT_FLICKER',
        persistentStaleCount:0,
        eventType:'TRANSIENT_FLICKER_STARTED'
      })
    ],
    asOf:2000,
    reason:'TEST_FLICKER'
  });
  assert.equal(out.changed,true);
  const signal=out.state.assumptionSignals.find(x=>x.assumptionId==='THESIS_WITNESS_SUPPORT_ADEQUATE');
  assert.equal(signal.status,'WATCH_FLICKER');
  assert.equal(signal.everPersistentForecasts,0);
  assert.equal(signal.distinctPersistentForecasts,0);
  assert.equal(signal.currentPersistentForecasts,0);
  assert.equal(signal.currentTransientForecasts,1);
  assert.equal(out.discoveredSkillIds.length,0);
  assert.equal(out.state.discoveredSkillIds.length,0);
});

test('one or two persistent forecasts stay in evidence collection',()=>{
  const initial=createBiggjLivingResearchRuntime({asOf:1000});
  const out=refreshBiggjLivingResearchRuntime(initial,{
    thesisMemories:[
      thesisMemory({forecastId:'F1',observedAt:2000}),
      thesisMemory({forecastId:'F2',observedAt:3000})
    ],
    asOf:4000
  });
  const signal=out.state.assumptionSignals.find(x=>x.assumptionId==='THESIS_WITNESS_SUPPORT_ADEQUATE');
  assert.equal(signal.status,'COLLECT_MORE_PERSISTENCE');
  assert.equal(signal.distinctPersistentForecasts,2);
  assert.equal(signal.researchRequired,false);
  assert.equal(out.discoveredSkillIds.length,0);
});

test('three independent persistent forecast cases create one deterministic research-only child skill',()=>{
  const initial=createBiggjLivingResearchRuntime({asOf:1000});
  const memories=[
    thesisMemory({forecastId:'F1',observedAt:2000}),
    thesisMemory({forecastId:'F2',observedAt:3000,falsifiers:['WITNESS_EXTERNAL_COUNT_LT_2']}),
    thesisMemory({forecastId:'F3',observedAt:4000,falsifiers:['WITNESS_MATERIAL_CONTRADICTION']})
  ];
  const out=refreshBiggjLivingResearchRuntime(initial,{
    thesisMemories:memories,
    asOf:5000,
    reason:'PERSISTENCE_THRESHOLD'
  });
  const signal=out.state.assumptionSignals.find(x=>x.assumptionId==='THESIS_WITNESS_SUPPORT_ADEQUATE');
  assert.equal(signal.status,'RESEARCH_REQUIRED');
  assert.equal(signal.researchRequired,true);
  assert.equal(signal.distinctPersistentForecasts,3);
  assert.equal(out.discoveredSkillIds.length,1);

  const skill=out.state.skillTree.nodes.find(x=>x.skillId===out.discoveredSkillIds[0]);
  assert.ok(skill);
  assert.equal(skill.kind,'DISCOVERED_SKILL');
  assert.equal(skill.status,'DISCOVERING');
  assert.equal(skill.promotionStage,'RESEARCH_ONLY');
  assert.equal(skill.discoveredBy,'ASSUMPTION_PERSISTENCE_RUNTIME_V1');
  assert.equal(skill.parentSkillId,'seed:EVIDENCE_INDEPENDENCE');
  assert.equal(skill.productionMutationAllowed,false);
  assert.equal(skill.canExecuteLive,false);

  const duplicate=refreshBiggjLivingResearchRuntime(out.state,{
    thesisMemories:memories,
    asOf:6000,
    reason:'SAME_SOURCE'
  });
  assert.equal(duplicate.changed,false);
  assert.deepEqual(duplicate.discoveredSkillIds,[]);
  assert.equal(duplicate.state.skillTree.nodes.length,out.state.skillTree.nodes.length);
});

test('association evidence can raise research priority but remains explicitly non-causal',()=>{
  const initial=createBiggjLivingResearchRuntime({asOf:1000});
  const memories=[
    thesisMemory({forecastId:'F1',observedAt:2000}),
    thesisMemory({forecastId:'F2',observedAt:3000})
  ];
  const out=refreshBiggjLivingResearchRuntime(initial,{
    thesisMemories:memories,
    claimAssumptionReport:report({ready:true,direction:.18,interval:.12}),
    asOf:5000
  });
  const signal=out.state.assumptionSignals.find(x=>x.assumptionId==='THESIS_WITNESS_SUPPORT_ADEQUATE');
  assert.equal(signal.association.associationReady,true);
  assert.equal(signal.researchContract.causalInterpretation,false);
  assert.equal(signal.researchContract.outcomeDoesNotValidateAssumptionTruth,true);
  assert.ok(signal.informationValue>0);
  assert.equal(signal.researchRequired,true);
  assert.equal(out.discoveredSkillIds.length,1);
});

test('all assumption templates target canonical skill nodes',()=>{
  const state=createBiggjLivingResearchRuntime({asOf:1000});
  const ids=new Set(state.skillTree.nodes.map(x=>x.skillId));
  for(const template of biggjAssumptionResearchTemplates()){
    assert.ok(ids.has('seed:'+template.primaryCapabilityId),template.primaryCapabilityId);
    for(const id of template.supportingCapabilityIds){
      assert.ok(ids.has('seed:'+id),id);
    }
  }
});

test('runtime persistence round-trip preserves fingerprint and research state',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'biggj-living-research-'));
  const file=path.join(dir,'runtime.json');
  const initial=createBiggjLivingResearchRuntime({asOf:1000});
  const out=refreshBiggjLivingResearchRuntime(initial,{
    thesisMemories:[
      thesisMemory({forecastId:'F1'}),
      thesisMemory({forecastId:'F2'}),
      thesisMemory({forecastId:'F3'})
    ],
    asOf:5000
  });
  await saveBiggjLivingResearchRuntime(file,out.state);
  const reopened=await openBiggjLivingResearchRuntime(file,{asOf:6000});
  assert.equal(reopened.recoveredFromCorrupt,false);
  assert.equal(reopened.state.fingerprint,out.state.fingerprint);
  assert.equal(verifyBiggjLivingResearchRuntime(reopened.state).ok,true);
  const raw=JSON.parse(await readFile(file,'utf8'));
  assert.equal(raw.fingerprint,out.state.fingerprint);
});

test('corrupt runtime is quarantined and safely restarted research-only',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'biggj-living-research-corrupt-'));
  const file=path.join(dir,'runtime.json');
  await writeFile(file,'{broken json','utf8');
  const reopened=await openBiggjLivingResearchRuntime(file,{asOf:7000});
  assert.equal(reopened.recoveredFromCorrupt,true);
  assert.equal(reopened.created,true);
  assert.equal(verifyBiggjLivingResearchRuntime(reopened.state).ok,true);
  assert.equal(reopened.state.canInfluencePrimary,false);
  assert.equal(reopened.state.canExecuteLive,false);
});

test('summary exposes agenda and skill graph without execution authority',()=>{
  const initial=createBiggjLivingResearchRuntime({asOf:1000});
  const out=refreshBiggjLivingResearchRuntime(initial,{
    thesisMemories:[
      thesisMemory({forecastId:'F1'}),
      thesisMemory({forecastId:'F2'}),
      thesisMemory({forecastId:'F3'})
    ],
    asOf:5000
  });
  const summary=biggjLivingResearchRuntimeSummary(out.state);
  assert.equal(summary.integrity,'VALID');
  assert.ok(summary.activeAgendaItems>=1);
  assert.ok(summary.researchRequired>=1);
  assert.ok(summary.discoveredResearchOnlySkills>=1);
  assert.equal(summary.automaticPromotion,false);
  assert.equal(summary.automaticKill,false);
  assert.equal(summary.automaticExperimentLaunch,false);
  assert.equal(summary.primaryMutationAllowed,false);
  assert.equal(summary.execution,'SHADOW_ONLY');
  assert.equal(summary.canExecuteLive,false);
});
