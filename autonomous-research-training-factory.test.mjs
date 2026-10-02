
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  AUTONOMOUS_RESEARCH_TRAINING_FACTORY_VERSION,
  createAutonomousResearchTrainingFactory,
  verifyAutonomousResearchTrainingFactory,
  refreshAutonomousResearchTrainingFactory,
  autonomousResearchTrainingFactorySummary,
  loadAutonomousResearchTrainingFactory,
  saveAutonomousResearchTrainingFactory
} from './autonomous-research-training-factory.mjs';

function baseLivingResearch(overrides={}){
  return {
    revision:7,
    fingerprint:'living-fp-7',
    canonicalResearchQueue:[],
    researchReviewQueue:{tickets:[],blocked:[]},
    ...overrides
  };
}

test('factory is fail-closed and never gains production authority',()=>{
  const state=createAutonomousResearchTrainingFactory({asOf:1000});
  const v=verifyAutonomousResearchTrainingFactory(state);
  assert.equal(v.ok,true);
  assert.equal(state.version,AUTONOMOUS_RESEARCH_TRAINING_FACTORY_VERSION);
  assert.equal(state.safety.execution,'SHADOW_ONLY');
  assert.equal(state.safety.canExecuteLive,false);
  assert.equal(state.safety.automaticPrimaryMutation,false);
  assert.equal(state.safety.automaticPromotion,false);
  assert.equal(state.safety.automaticSkillTransition,false);
});

test('data deficits collapse into an operator data-only state when existing workers own the loop',()=>{
  const state=createAutonomousResearchTrainingFactory({asOf:1000});
  const refreshed=refreshAutonomousResearchTrainingFactory(state,{
    livingResearchState:baseLivingResearch({
      canonicalResearchQueue:[
        {
          skillId:'skill:alpha',
          title:'Alpha hypothesis',
          nextGate:'FORWARD_SHADOW',
          priority:.8,
          uncertainty:.7,
          validationEvidenceTotal:4,
          validationIndependentEpisodes:2
        },
        {
          skillId:'skill:beta',
          title:'Beta hypothesis',
          nextGate:'INDEPENDENT_EPISODES',
          priority:.7,
          uncertainty:.8,
          validationEvidenceTotal:8,
          validationIndependentEpisodes:1
        }
      ]
    }),
    experimentGovernorSummary:{status:'UNINITIALIZED',counts:{}},
    modelCandidateRegistrySummary:{seq:0,candidates:[]},
    historyStats:{rows:120,progressAt:900},
    asOf:2000
  });
  assert.equal(refreshed.changed,true);
  assert.equal(refreshed.state.mode,'DATA_COLLECTION_ONLY');
  assert.equal(refreshed.state.operatorDataOnly,true);
  assert.deepEqual(
    refreshed.state.queue.map(x=>x.type).sort(),
    ['COLLECT_FORWARD_DATA','COLLECT_INDEPENDENT_EPISODES'].sort()
  );
  assert.ok(refreshed.state.dataNeeds.includes('FORWARD_SHADOW_OBSERVATIONS'));
  assert.ok(refreshed.state.dataNeeds.includes('INDEPENDENT_EPISODES'));
  assert.equal(refreshed.state.counters.manual,0);
  assert.equal(refreshed.state.counters.unowned,0);
});

test('world-model validation collects independent evidence autonomously instead of requesting human approval',()=>{
  const state=createAutonomousResearchTrainingFactory({asOf:1000});
  const refreshed=refreshAutonomousResearchTrainingFactory(state,{
    livingResearchState:baseLivingResearch(),
    marketScienceDirectorSummary:{
      topAgenda:[{
        questionId:'rq_world_1',
        kind:'WORLD_MODEL_VALIDATION',
        worldModelTarget:'LATENT_STATE_CANDIDATE',
        question:'Does the candidate remain stable out of sample?',
        nextExperimentType:'TEMPORAL_OUT_OF_SAMPLE',
        priority:.78,
        expectedInformationGainProxy:.74,
        scientificLeverage:.72
      }],
      topDataRequests:[]
    },
    historyStats:{rows:500,progressAt:1900},
    asOf:2000
  });
  const task=refreshed.state.queue.find(x=>x.source==='BIGGJ_MARKET_SCIENCE_DIRECTOR');
  assert.ok(task);
  assert.equal(task.type,'COLLECT_INDEPENDENT_EPISODES');
  assert.equal(task.autoHandler,'LIVING_RESEARCH_RUNTIME');
  assert.equal(task.automaticShadowEligible,true);
  assert.equal(task.manualReviewRequired,false);
  assert.equal(task.primaryMutationAllowed,false);
  assert.equal(task.canExecuteLive,false);
  assert.ok(task.dataNeeds.includes('POINT_IN_TIME_WORLD_MODEL_EVIDENCE'));
  assert.ok(task.dataNeeds.includes('TEMPORAL_HOLDOUT'));
  assert.equal(refreshed.state.counters.manual,0);
});

test('manual research review prevents false claim that operator only needs to collect data',()=>{
  const state=createAutonomousResearchTrainingFactory({asOf:1000});
  const refreshed=refreshAutonomousResearchTrainingFactory(state,{
    livingResearchState:baseLivingResearch({
      researchReviewQueue:{
        tickets:[{
          ticketId:'review:1',
          skillId:'skill:gamma',
          fromStatus:'LEARNING',
          proposedStatus:'TESTING',
          validationReadinessScore:.91,
          evidenceState:'FORMAL_TESTING_REVIEW_EVIDENCE_READY',
          validationPhase:'LEARNING_AUDIT'
        }]
      }
    }),
    historyStats:{rows:500,progressAt:1900},
    asOf:2000
  });
  assert.equal(refreshed.state.mode,'MANUAL_REVIEW_REQUIRED');
  assert.equal(refreshed.state.operatorDataOnly,false);
  assert.equal(refreshed.state.counters.manual,1);
  assert.equal(refreshed.state.queue[0].type,'SKILL_TRANSITION_REVIEW');
  assert.equal(refreshed.state.queue[0].automaticShadowEligible,false);
});

test('statistical promotion-review readiness is prepared autonomously before human escalation',()=>{
  const state=createAutonomousResearchTrainingFactory({asOf:1000});
  const refreshed=refreshAutonomousResearchTrainingFactory(state,{
    livingResearchState:baseLivingResearch(),
    experimentGovernorSummary:{
      status:'ACTIVE',
      generationId:'gen-3',
      generationNumber:3,
      counts:{MEASURING:2,SHADOW_TESTING:1},
      nextGenerationEligible:false,
      promotionReviewRequired:[{
        candidateId:'candidate-9',
        blueprintId:'bp-9',
        label:'candidate nine',
        evidenceId:'e9'
      }]
    },
    asOf:2000
  });
  const types=refreshed.state.queue.map(x=>x.type);
  assert.ok(types.includes('CONTINUE_MODEL_COMPETITION'));
  assert.ok(types.includes('PREPARE_MODEL_PROMOTION_REVIEW'));
  assert.equal(types.includes('MODEL_PROMOTION_REVIEW'),false);
  assert.equal(refreshed.state.counters.manual,0);
  const review=refreshed.state.queue.find(x=>x.type==='PREPARE_MODEL_PROMOTION_REVIEW');
  assert.equal(review.autoHandler,'MODEL_PROMOTION_REVIEW_SERVICE');
  assert.equal(review.automaticShadowEligible,true);
});

test('chronological and robustness deficits become owned automatic research tasks',()=>{
  const state=createAutonomousResearchTrainingFactory({asOf:1000});
  const refreshed=refreshAutonomousResearchTrainingFactory(state,{
    livingResearchState:baseLivingResearch({
      canonicalResearchQueue:[
        {skillId:'wf',nextGate:'CHRONOLOGICAL_STABILITY',priority:.9,uncertainty:.6},
        {skillId:'stress',nextGate:'COST_STRESS',priority:.85,uncertainty:.5}
      ]
    }),
    asOf:2000
  });
  const wf=refreshed.state.queue.find(x=>x.type==='WALK_FORWARD_VALIDATION');
  const stress=refreshed.state.queue.find(x=>x.type==='ADVERSARIAL_STRESS');
  assert.equal(wf.autoHandler,'FORECAST_CANDIDATE_LAB');
  assert.equal(stress.autoHandler,'ADVERSARIAL_STRESS_LAB');
  assert.equal(refreshed.state.mode,'AUTONOMOUS_RESEARCH_ACTIVE');
  assert.equal(refreshed.state.operatorDataOnly,true);
});

test('quarantined research sources force a data-quality blocked state',()=>{
  const state=createAutonomousResearchTrainingFactory({asOf:1000});
  const refreshed=refreshAutonomousResearchTrainingFactory(state,{
    livingResearchState:baseLivingResearch({
      canonicalResearchQueue:[
        {skillId:'x',nextGate:'FORWARD_SHADOW',priority:.5,uncertainty:.5}
      ]
    }),
    researchDataGovernanceSummary:{quarantinedSources:['DERIVATIVES:SOURCE_A','ONCHAIN:SOURCE_B']},
    asOf:2000
  });
  assert.equal(refreshed.state.mode,'DATA_QUALITY_BLOCKED');
  assert.equal(refreshed.state.operatorDataOnly,false);
});

test('unchanged source state does not create artificial research revisions',()=>{
  const initial=createAutonomousResearchTrainingFactory({asOf:1000});
  const args={
    livingResearchState:baseLivingResearch({
      canonicalResearchQueue:[{skillId:'x',nextGate:'FORWARD_SHADOW',priority:.5,uncertainty:.5}]
    }),
    historyStats:{rows:10,progressAt:900},
    asOf:2000
  };
  const a=refreshAutonomousResearchTrainingFactory(initial,args).state;
  const b=refreshAutonomousResearchTrainingFactory(a,{...args,asOf:3000});
  assert.equal(b.changed,false);
  assert.equal(b.state.revision,a.revision);
  assert.equal(b.state.fingerprint,a.fingerprint);
});

test('summary gives a concise data-only and next-work contract',()=>{
  const initial=createAutonomousResearchTrainingFactory({asOf:1000});
  const state=refreshAutonomousResearchTrainingFactory(initial,{
    livingResearchState:baseLivingResearch({
      canonicalResearchQueue:[{skillId:'x',nextGate:'FORWARD_SHADOW',priority:.9,uncertainty:.8}]
    }),
    asOf:2000
  }).state;
  const summary=autonomousResearchTrainingFactorySummary(state);
  assert.equal(summary.healthy,true);
  assert.equal(summary.operatorDataOnly,true);
  assert.equal(summary.canExecuteLive,false);
  assert.equal(summary.automaticPrimaryMutation,false);
  assert.equal(summary.automaticPromotion,false);
  assert.equal(summary.nextTasks.length,1);
  assert.equal(summary.nextTasks[0].autoHandler,'AUTOLEARN_AND_COVERAGE_CURRICULUM');
  assert.equal(typeof summary.leverage.waitingForDataTaskCount,'number');
  assert.ok(Array.isArray(summary.leverage.stalledTasks));
});

test('factory state persists and reloads with fingerprint verification',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'tcx-artf-'));
  const file=path.join(dir,'factory.json');
  const initial=createAutonomousResearchTrainingFactory({asOf:1000});
  const state=refreshAutonomousResearchTrainingFactory(initial,{
    livingResearchState:baseLivingResearch(),
    asOf:2000
  }).state;
  await saveAutonomousResearchTrainingFactory(file,state);
  const loaded=await loadAutonomousResearchTrainingFactory(file);
  assert.deepEqual(loaded,state);
  const raw=await readFile(file,'utf8');
  assert.match(raw,/TCX_AUTONOMOUS_RESEARCH_TRAINING_FACTORY_V1/);
});


test('registry accounts for multiple registered candidates and league reads nested account totals',()=>{
  const state=createAutonomousResearchTrainingFactory({asOf:1000});
  const refreshed=refreshAutonomousResearchTrainingFactory(state,{
    livingResearchState:baseLivingResearch(),
    modelCandidateRegistrySummary:{
      seq:4,
      candidates:[
        {candidateId:'c1',status:'REGISTERED'},
        {candidateId:'c2',status:'REGISTERED'}
      ]
    },
    strategyLeagueSummary:{
      fingerprint:'league-1',
      strategies:[
        {strategyId:'S1',account:{openPositions:2,closedTrades:11}},
        {strategyId:'S2',account:{openPositions:1,closedTrades:9}}
      ]
    },
    asOf:2000
  });
  assert.equal(refreshed.state.queue.filter(x=>x.type==='EVALUATE_REGISTERED_CANDIDATES').length,2);
  const league=refreshed.state.queue.find(x=>x.type==='CONTINUE_STRATEGY_LEAGUE');
  assert.equal(league.metadata.open,3);
  assert.equal(league.metadata.closed,20);
});


test('terminal feature experiments do not create phantom work',()=>{
  const state=createAutonomousResearchTrainingFactory({asOf:1000});
  const refreshed=refreshAutonomousResearchTrainingFactory(state,{
    livingResearchState:baseLivingResearch(),
    featureResearchSummary:{
      status:'COMPLETE_SUPPORTED_FEATURES',
      fingerprint:'fr-complete',
      experiments:[
        {id:'f1',status:'SUPPORTED'},
        {id:'f2',status:'REJECTED'}
      ]
    },
    asOf:2000
  });
  assert.equal(refreshed.state.queue.some(x=>x.type==='CONTINUE_FEATURE_RESEARCH'),false);
  assert.equal(refreshed.state.mode,'IDLE_MONITORING');
  assert.equal(refreshed.state.operatorDataOnly,true);
});


test('factory exposes all ten leverage factors and shared data bundles',()=>{
  const initial=createAutonomousResearchTrainingFactory({asOf:1000});
  const state=refreshAutonomousResearchTrainingFactory(initial,{
    livingResearchState:baseLivingResearch({
      canonicalResearchQueue:[
        {skillId:'a',nextGate:'FORWARD_SHADOW',priority:.7,uncertainty:.8,directUnlocks:2,transitiveUnlocks:4},
        {skillId:'b',nextGate:'FORWARD_SHADOW',priority:.6,uncertainty:.7,directUnlocks:0,transitiveUnlocks:0}
      ]
    }),
    researchCoverageSummary:{symbols:2,averageCoverage:.8,healthy:2,blocked:0,insufficient:0},
    asOf:2000
  }).state;
  const summary=autonomousResearchTrainingFactorySummary(state);
  assert.equal(summary.leverage.leverCount,10);
  assert.ok(summary.leverage.batchOpportunityCount>=1);
  assert.ok(summary.researchBundles.some(x=>x.dataNeed==='FORWARD_SHADOW_OBSERVATIONS'&&x.taskCount===2));
  assert.ok(summary.nextTasks.every(x=>Number.isFinite(x.effectivePriority)));
  assert.ok(summary.nextTasks.every(x=>Array.isArray(x.topLevers)&&x.topLevers.length>0));
});

test('coverage generatedAt alone cannot create artificial factory revisions',()=>{
  const initial=createAutonomousResearchTrainingFactory({asOf:1000});
  const common={
    livingResearchState:baseLivingResearch({
      canonicalResearchQueue:[{skillId:'x',nextGate:'FORWARD_SHADOW',priority:.5,uncertainty:.5}]
    }),
    researchCoverageSummary:{
      symbols:3,healthy:2,degraded:1,blocked:0,insufficient:0,
      averageCoverage:.8,blockedFeatures:0,degradedFeatures:1,
      topBlockedSources:[],topBlockedFeatures:[],worstSymbols:[]
    },
    historyStats:{rows:10,progressAt:900}
  };
  const a=refreshAutonomousResearchTrainingFactory(initial,{
    ...common,
    researchCoverageSummary:{...common.researchCoverageSummary,generatedAt:2000},
    asOf:2000
  }).state;
  const b=refreshAutonomousResearchTrainingFactory(a,{
    ...common,
    researchCoverageSummary:{...common.researchCoverageSummary,generatedAt:999999},
    asOf:3000
  });
  assert.equal(b.changed,false);
  assert.equal(b.state.revision,a.revision);
});

test('stable task identity preserves age while real evidence progress resets stagnation',()=>{
  const initial=createAutonomousResearchTrainingFactory({asOf:1000});
  const a=refreshAutonomousResearchTrainingFactory(initial,{
    livingResearchState:baseLivingResearch({
      fingerprint:'living-a',
      canonicalResearchQueue:[{
        skillId:'stable-skill',nextGate:'FORWARD_SHADOW',priority:.7,uncertainty:.8,
        validationEvidenceTotal:2,validationIndependentEpisodes:1
      }]
    }),
    asOf:2000
  }).state;
  const first=a.queue[0];
  const b=refreshAutonomousResearchTrainingFactory(a,{
    livingResearchState:baseLivingResearch({
      revision:8,
      fingerprint:'living-b',
      canonicalResearchQueue:[{
        skillId:'stable-skill',nextGate:'FORWARD_SHADOW',priority:.7,uncertainty:.7,
        validationEvidenceTotal:5,validationIndependentEpisodes:2
      }]
    }),
    asOf:4000
  }).state;
  const second=b.queue[0];
  assert.equal(first.taskId,second.taskId);
  assert.ok(second.queueAgeMs>0);
  assert.equal(second.stagnantCycles,0);
});


test('factory stops claiming data-only when an owned research task is persistently stalled',()=>{
  let state=createAutonomousResearchTrainingFactory({asOf:1000});
  for(let i=0;i<9;i++){
    state=refreshAutonomousResearchTrainingFactory(state,{
      livingResearchState:baseLivingResearch({
        revision:10+i,
        fingerprint:'living-stall-'+i,
        canonicalResearchQueue:[{
          skillId:'stalled-skill',
          nextGate:'FORWARD_SHADOW',
          priority:.7,
          uncertainty:.8,
          validationEvidenceTotal:2,
          validationIndependentEpisodes:1
        }]
      }),
      historyStats:{rows:100,progressAt:1000},
      // Simulate a genuinely stale upstream PIT flow (>6h) plus enough
      // no-progress wall time to distinguish it from normal data maturation.
      asOf:1000+7*60*60*1000+i*5*60*1000
    }).state;
  }
  assert.equal(state.leverage.stalledTaskCount,1);
  assert.equal(state.mode,'RESEARCH_STALLED');
  assert.equal(state.operatorDataOnly,false);
  assert.equal(state.queue[0].stalled,true);
});


test('HOLD and REJECT model decisions do not create human approval tasks',()=>{
  for(const decision of ['HOLD_CANDIDATE','REJECT_CANDIDATE']){
    const state=createAutonomousResearchTrainingFactory({asOf:1000});
    const refreshed=refreshAutonomousResearchTrainingFactory(state,{
      livingResearchState:baseLivingResearch(),
      experimentGovernorSummary:{
        status:'ACTIVE',
        generationId:'gen-3',
        generationNumber:3,
        counts:{},
        promotionReviewRequired:[{candidateId:'candidate-9',blueprintId:'bp-9'}]
      },
      modelPromotionReviewSummary:{
        generationId:'gen-3',
        at:1900,
        decisions:[{candidateId:'candidate-9',ok:true,decision,nextAction:'AUTO',missingProofs:[]}]
      },
      asOf:2000
    });
    assert.equal(refreshed.state.queue.some(x=>x.type==='MODEL_PROMOTION_REVIEW'),false);
    assert.equal(refreshed.state.queue.some(x=>x.type==='PREPARE_MODEL_PROMOTION_REVIEW'),false);
    assert.equal(refreshed.state.counters.manual,0);
  }
});

test('only PROMOTE_CANDIDATE produces explicit human model approval',()=>{
  const state=createAutonomousResearchTrainingFactory({asOf:1000});
  const refreshed=refreshAutonomousResearchTrainingFactory(state,{
    livingResearchState:baseLivingResearch(),
    experimentGovernorSummary:{
      status:'ACTIVE',
      generationId:'gen-3',
      generationNumber:3,
      counts:{},
      promotionReviewRequired:[{candidateId:'candidate-9',blueprintId:'bp-9'}]
    },
    modelPromotionReviewSummary:{
      generationId:'gen-3',
      at:1900,
      decisions:[{
        candidateId:'candidate-9',
        ok:true,
        decision:'PROMOTE_CANDIDATE',
        nextAction:'EXPLICIT_PROMOTION_RECORD_REVIEW_REQUIRED',
        missingProofs:[]
      }]
    },
    asOf:2000
  });
  const review=refreshed.state.queue.find(x=>x.type==='MODEL_PROMOTION_REVIEW');
  assert.ok(review);
  assert.equal(review.manualReviewRequired,true);
  assert.equal(review.automaticShadowEligible,false);
  assert.equal(refreshed.state.mode,'MANUAL_REVIEW_REQUIRED');
});


test('factory does not call active PIT collection stalled while history is advancing',()=>{
  let state=createAutonomousResearchTrainingFactory({asOf:1000});
  for(let i=0;i<12;i++){
    state=refreshAutonomousResearchTrainingFactory(state,{
      livingResearchState:baseLivingResearch({
        revision:30+i,
        fingerprint:'living-pit-progress-'+i,
        canonicalResearchQueue:[{
          skillId:'collecting-skill',
          nextGate:'FORWARD_SHADOW',
          priority:.7,
          uncertainty:.8,
          validationEvidenceTotal:2,
          validationIndependentEpisodes:1
        }]
      }),
      researchDataPlaneSummary:{seq:1000+i},
      historyStats:{rows:100+i,progressAt:2000+i*60_000},
      asOf:3000+i*60_000
    }).state;
  }
  assert.equal(state.leverage.stalledTaskCount,0);
  assert.notEqual(state.mode,'RESEARCH_STALLED');
  assert.equal(state.queue[0].stagnantCycles,0);
  assert.equal(state.queue[0].stalled,false);
});
