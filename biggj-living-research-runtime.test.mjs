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
  observations=80,
  evaluatedAt=5000
}={}){
  const core={
    evaluatedAt,
    byPreOutcomeStaleAssumption:[{
      assumptionId,
      persistenceFiltered:{
        observations,
        persistentStaleBeforeMaturity:Math.floor(observations*.375),
        neverPersistentStaleBeforeMaturity:observations-Math.floor(observations*.375),
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
  assert.deepEqual(state.observedForecastIds,[]);
  assert.deepEqual(state.persistentCaseRegistry,[]);
  assert.deepEqual(state.stabilityEventRegistry,[]);
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

test('three distinct persistent forecast cases create one deterministic research-only child skill',()=>{
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
  assert.equal(skill.evidenceSummary.total,1);
  assert.equal(skill.evidenceSummary.forwardShadow,0);
  assert.equal(skill.evidenceSummary.independentEpisodes,0);
  assert.equal(skill.evidenceSummary.auditReady,0);
  assert.equal(skill.evidenceSummary.sciencePassed,0);
  assert.equal(out.boundEvidenceIds.length,1);
  const discoveryEvidence=skill.evidence[0];
  assert.equal(discoveryEvidence.epistemicClass,'INFERRED');
  assert.equal(discoveryEvidence.forwardShadow,false);
  assert.equal(discoveryEvidence.independentEpisodeId,null);
  assert.equal(discoveryEvidence.provenance[0].kind,'DISCOVERY_COHORT');
  assert.equal(discoveryEvidence.provenance[0].inSampleDiscoveryEvidence,true);

  const duplicate=refreshBiggjLivingResearchRuntime(out.state,{
    thesisMemories:memories,
    asOf:6000,
    reason:'SAME_SOURCE'
  });
  assert.equal(duplicate.changed,false);
  assert.deepEqual(duplicate.discoveredSkillIds,[]);
  assert.equal(duplicate.state.skillTree.nodes.length,out.state.skillTree.nodes.length);
});

test('new post-hypothesis persistent cases bind as prospective evidence but cannot advance maturity alone',()=>{
  const initial=createBiggjLivingResearchRuntime({asOf:1000});
  const created=refreshBiggjLivingResearchRuntime(initial,{
    thesisMemories:[
      thesisMemory({forecastId:'F1',observedAt:2000}),
      thesisMemory({forecastId:'F2',observedAt:3000}),
      thesisMemory({forecastId:'F3',observedAt:4000})
    ],
    asOf:5000,
    reason:'DISCOVERY'
  });
  const skillId=created.state.discoveredSkillIds[0];

  const next=refreshBiggjLivingResearchRuntime(created.state,{
    thesisMemories:[thesisMemory({forecastId:'F4',observedAt:6000})],
    asOf:7000,
    reason:'PROSPECTIVE_CASE'
  });
  const skill=next.state.skillTree.nodes.find(x=>x.skillId===skillId);
  assert.equal(next.boundEvidenceIds.length,1);
  assert.equal(skill.evidenceSummary.total,2);
  assert.equal(skill.evidenceSummary.forwardShadow,1);
  assert.equal(skill.evidenceSummary.independentEpisodes,0);
  const prospective=skill.evidence.find(x=>x.forwardShadow===true);
  assert.ok(prospective);
  assert.equal(prospective.epistemicClass,'INFERRED');
  assert.equal(prospective.independentEpisodeId,null);
  assert.equal(prospective.provenance[0].kind,'PROSPECTIVE_PERSISTENT_CASE');
  assert.equal(prospective.provenance[0].independenceResolved,false);

  const summary=biggjLivingResearchRuntimeSummary(next.state);
  const row=summary.researchEvidence.rows.find(x=>x.skillId===skillId);
  assert.equal(row.status,'DISCOVERING');
  assert.equal(row.recommendedStatus,'DISCOVERING');
  assert.equal(row.independentEpisodes,0);
  assert.ok(row.reasons.includes('EARLY_EVIDENCE_REQUIRED'));

  const repeated=refreshBiggjLivingResearchRuntime(next.state,{
    thesisMemories:[thesisMemory({forecastId:'F4',observedAt:6000})],
    asOf:8000,
    reason:'REPEAT_CASE'
  });
  assert.equal(repeated.changed,false);
  assert.equal(repeated.state.skillTree.nodes.find(x=>x.skillId===skillId).evidenceSummary.total,2);
});

test('association milestones bind modelled non-causal evidence without becoming independent validation',()=>{
  const initial=createBiggjLivingResearchRuntime({asOf:1000});
  const created=refreshBiggjLivingResearchRuntime(initial,{
    thesisMemories:[
      thesisMemory({forecastId:'F1',observedAt:2000}),
      thesisMemory({forecastId:'F2',observedAt:3000})
    ],
    claimAssumptionReport:report({
      ready:true,
      observations:80,
      direction:.18,
      interval:.12,
      evaluatedAt:5000
    }),
    asOf:5000,
    reason:'ASSOCIATION_DISCOVERY'
  });
  const skillId=created.state.discoveredSkillIds[0];
  let skill=created.state.skillTree.nodes.find(x=>x.skillId===skillId);
  assert.equal(skill.evidenceSummary.total,2);
  assert.equal(skill.evidenceSummary.forwardShadow,0);
  const firstAssociation=skill.evidence.find(x=>x.epistemicClass==='MODELLED');
  assert.ok(firstAssociation);
  assert.equal(firstAssociation.forwardShadow,false);
  assert.equal(firstAssociation.independentEpisodeId,null);
  assert.equal(firstAssociation.provenance[0].associationMilestone,'THESIS_WITNESS_SUPPORT_ADEQUATE:80');
  assert.equal(firstAssociation.provenance[0].causalInterpretation,false);

  const updated=refreshBiggjLivingResearchRuntime(created.state,{
    thesisMemories:[],
    claimAssumptionReport:report({
      ready:true,
      observations:100,
      direction:.20,
      interval:.14,
      evaluatedAt:7000
    }),
    asOf:7000,
    reason:'ASSOCIATION_MILESTONE'
  });
  skill=updated.state.skillTree.nodes.find(x=>x.skillId===skillId);
  assert.equal(updated.boundEvidenceIds.length,1);
  assert.equal(skill.evidenceSummary.total,3);
  assert.equal(skill.evidenceSummary.forwardShadow,0);
  assert.equal(skill.evidenceSummary.independentEpisodes,0);
  assert.equal(skill.status,'DISCOVERING');
  const secondAssociation=skill.evidence.find(x=>
    x.provenance?.some(p=>p.associationMilestone==='THESIS_WITNESS_SUPPORT_ADEQUATE:100')
  );
  assert.ok(secondAssociation);
  assert.equal(secondAssociation.forwardShadow,false);
  assert.equal(secondAssociation.independentEpisodeId,null);
  assert.equal(secondAssociation.provenance[0].postHypothesisSubsetResolved,false);
});

test('persistent research cases survive removal from hot forecast tracker',()=>{
  const initial=createBiggjLivingResearchRuntime({asOf:1000});
  const first=refreshBiggjLivingResearchRuntime(initial,{
    thesisMemories:[
      thesisMemory({forecastId:'F1',observedAt:2000}),
      thesisMemory({forecastId:'F2',observedAt:3000}),
      thesisMemory({forecastId:'F3',observedAt:4000})
    ],
    asOf:5000,
    reason:'HOT_TRACKER_CASES'
  });
  assert.equal(first.state.persistentCaseRegistry.length,3);
  assert.equal(first.state.stabilityEventRegistry.length,3);
  assert.equal(first.state.observedForecastIds.length,3);
  const firstSignal=first.state.assumptionSignals.find(x=>x.assumptionId==='THESIS_WITNESS_SUPPORT_ADEQUATE');
  assert.equal(firstSignal.everPersistentForecasts,3);
  assert.equal(firstSignal.status,'RESEARCH_REQUIRED');

  const compacted=refreshBiggjLivingResearchRuntime(first.state,{
    thesisMemories:[],
    asOf:7000,
    reason:'HOT_TRACKER_COMPACTED'
  });
  assert.equal(compacted.changed,true);
  assert.equal(compacted.state.persistentCaseRegistry.length,3);
  assert.equal(compacted.state.stabilityEventRegistry.length,3);
  assert.equal(compacted.state.observedForecastIds.length,3);
  const retained=compacted.state.assumptionSignals.find(x=>x.assumptionId==='THESIS_WITNESS_SUPPORT_ADEQUATE');
  assert.equal(retained.everPersistentForecasts,3);
  assert.equal(retained.distinctPersistentForecasts,3);
  assert.equal(retained.currentPersistentForecasts,0);
  assert.equal(retained.status,'RESEARCH_REQUIRED');
  assert.equal(compacted.discoveredSkillIds.length,0);
  assert.equal(
    compacted.state.skillTree.nodes.length,
    first.state.skillTree.nodes.length,
    'cold compaction must not create a duplicate research skill'
  );
});

test('persistent case registry deduplicates repeat observations of the same forecast',()=>{
  const initial=createBiggjLivingResearchRuntime({asOf:1000});
  const one=thesisMemory({forecastId:'F1',observedAt:2000,persistentStaleCount:1});
  const first=refreshBiggjLivingResearchRuntime(initial,{
    thesisMemories:[one],
    asOf:3000
  });
  const repeated=thesisMemory({
    forecastId:'F1',
    observedAt:4000,
    persistentStaleCount:2,
    falsifiers:['WITNESS_NOT_SATISFIED','WITNESS_EXTERNAL_COUNT_LT_2']
  });
  const second=refreshBiggjLivingResearchRuntime(first.state,{
    thesisMemories:[repeated],
    asOf:5000
  });
  assert.equal(second.state.persistentCaseRegistry.length,1);
  assert.equal(second.state.observedForecastIds.length,1);
  assert.equal(second.state.persistentCaseRegistry[0].persistentStaleCount,2);
  assert.ok(second.state.persistentCaseRegistry[0].falsifierCodes.includes('WITNESS_EXTERNAL_COUNT_LT_2'));
  const signal=second.state.assumptionSignals.find(x=>x.assumptionId==='THESIS_WITNESS_SUPPORT_ADEQUATE');
  assert.equal(signal.everPersistentForecasts,1);
  assert.equal(signal.distinctPersistentForecasts,1);
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
  assert.ok(summary.observedForecasts>=3);
  assert.ok(summary.retainedPersistentCases>=3);
  assert.ok(summary.retainedStabilityEvents>=3);
  assert.ok(summary.researchEvidence);
  assert.ok(summary.researchEvidence.skillCount>=1);
  assert.ok(summary.researchEvidence.evidenceTotal>=1);
  assert.equal(summary.researchEvidence.independentEpisodes,0);
  assert.equal(summary.automaticPromotion,false);
  assert.equal(summary.automaticKill,false);
  assert.equal(summary.automaticExperimentLaunch,false);
  assert.equal(summary.primaryMutationAllowed,false);
  assert.equal(summary.execution,'SHADOW_ONLY');
  assert.equal(summary.canExecuteLive,false);
});
