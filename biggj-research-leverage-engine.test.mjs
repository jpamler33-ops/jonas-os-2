
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BIGGJ_RESEARCH_LEVERAGE_ENGINE_VERSION,
  BIGGJ_RESEARCH_LEVERS,
  rankBiggjResearchTasks
} from './biggj-research-leverage-engine.mjs';

function task(overrides={}){
  return {
    taskId:'t:'+String(overrides.subject||'x'),
    type:'COLLECT_FORWARD_DATA',
    subject:'skill:x',
    reason:'TEST',
    priority:.5,
    informationValue:.5,
    uncertainty:.5,
    blocker:null,
    source:'TEST',
    dataNeeds:['FORWARD_SHADOW_OBSERVATIONS'],
    autoHandler:'AUTOLEARN_AND_COVERAGE_CURRICULUM',
    automaticShadowEligible:true,
    manualReviewRequired:false,
    metadata:{
      validationEvidenceTotal:4,
      validationIndependentEpisodes:1,
      directUnlocks:0,
      transitiveUnlocks:0
    },
    ...overrides,
    metadata:{validationEvidenceTotal:4,validationIndependentEpisodes:1,directUnlocks:0,transitiveUnlocks:0,...(overrides.metadata||{})}
  };
}

test('engine exposes exactly ten named leverage factors and remains shadow-only',()=>{
  assert.equal(BIGGJ_RESEARCH_LEVERS.length,10);
  assert.equal(new Set(BIGGJ_RESEARCH_LEVERS.map(x=>x.id)).size,10);
  const out=rankBiggjResearchTasks([task()],{asOf:1_800_000_000_000});
  assert.equal(out.summary.version,BIGGJ_RESEARCH_LEVERAGE_ENGINE_VERSION);
  assert.equal(out.summary.leverCount,10);
  assert.equal(out.summary.execution,'SHADOW_ONLY');
  assert.equal(out.summary.canExecuteLive,false);
  assert.equal(out.summary.automaticPrimaryMutation,false);
  assert.deepEqual(Object.keys(out.tasks[0].leverage).sort(),[
    'batchReuse','costEfficiency','dataReadiness','dependencyUnlock','evidenceScarcity',
    'independenceGap','informationGain','queueAge','stagnationPressure','uncertaintyGain'
  ].sort());
});

test('dependency unlock and information value can outrank an isolated task with the same base priority',()=>{
  const out=rankBiggjResearchTasks([
    task({taskId:'isolated',subject:'isolated',informationValue:.4,metadata:{directUnlocks:0,transitiveUnlocks:0}}),
    task({taskId:'unlocker',subject:'unlocker',informationValue:.9,metadata:{directUnlocks:5,transitiveUnlocks:10}})
  ],{asOf:1_800_000_000_000});
  assert.equal(out.tasks[0].taskId,'unlocker');
  assert.ok(out.tasks[0].leverage.dependencyUnlock>out.tasks[1].leverage.dependencyUnlock);
  assert.ok(out.tasks[0].effectivePriority>out.tasks[1].effectivePriority);
});

test('independence gap distinguishes correlated evidence piles from independent episodes',()=>{
  const out=rankBiggjResearchTasks([
    task({taskId:'correlated',subject:'correlated',metadata:{validationEvidenceTotal:20,validationIndependentEpisodes:2}}),
    task({taskId:'independent',subject:'independent',metadata:{validationEvidenceTotal:20,validationIndependentEpisodes:18}})
  ],{asOf:1_800_000_000_000});
  const correlated=out.tasks.find(x=>x.taskId==='correlated');
  const independent=out.tasks.find(x=>x.taskId==='independent');
  assert.ok(correlated.leverage.independenceGap>independent.leverage.independenceGap);
});

test('shared data needs produce a batch reuse opportunity',()=>{
  const out=rankBiggjResearchTasks([
    task({taskId:'a',subject:'a',dataNeeds:['X','Y']}),
    task({taskId:'b',subject:'b',dataNeeds:['X']}),
    task({taskId:'c',subject:'c',dataNeeds:['X','Z']})
  ],{asOf:1_800_000_000_000});
  const bundle=out.bundles.find(x=>x.dataNeed==='X');
  assert.equal(bundle.taskCount,3);
  assert.equal(out.summary.batchOpportunityCount,1);
  assert.ok(out.tasks.every(x=>x.dataNeeds.includes('X')?x.leverage.batchReuse>0:true));
});

test('data readiness routes weak data toward repair instead of expensive downstream experimentation',()=>{
  const dataState={
    symbols:10,
    averageCoverage:.2,
    blocked:6,
    insufficient:2
  };
  const governance={
    sourceCount:10,
    statuses:{QUARANTINED:2,DEGRADED:4,UNOBSERVED:2,HEALTHY:2},
    quarantinedSources:['A','B']
  };
  const out=rankBiggjResearchTasks([
    task({taskId:'repair',subject:'repair',type:'DATA_INTEGRITY_REPAIR'}),
    task({taskId:'model',subject:'model',type:'GENERATE_NEXT_CHALLENGER_GENERATION',dataNeeds:[]})
  ],{
    asOf:1_800_000_000_000,
    researchCoverageSummary:dataState,
    researchDataGovernanceSummary:governance
  });
  const repair=out.tasks.find(x=>x.taskId==='repair');
  const model=out.tasks.find(x=>x.taskId==='model');
  assert.ok(repair.leverage.dataReadiness>model.leverage.dataReadiness);
  assert.ok(repair.leverage.costEfficiency>model.leverage.costEfficiency);
});

test('queue age and stagnation rise only when the same stable task makes no progress',()=>{
  const t0=1_800_000_000_000;
  const first=rankBiggjResearchTasks([task({taskId:'stable',subject:'stable'})],{asOf:t0});
  const second=rankBiggjResearchTasks([task({taskId:'stable',subject:'stable'})],{
    asOf:t0+2*24*60*60*1000,
    taskMemory:first.taskMemory
  });
  const row=second.tasks[0];
  assert.ok(row.leverage.queueAge>0);
  assert.equal(row.stagnantCycles,1);
  assert.ok(row.leverage.stagnationPressure>0);
});

test('measurable progress resets stagnation without losing queue age',()=>{
  const t0=1_800_000_000_000;
  const first=rankBiggjResearchTasks([task({taskId:'stable',subject:'stable'})],{asOf:t0});
  const second=rankBiggjResearchTasks([
    task({taskId:'stable',subject:'stable',metadata:{validationEvidenceTotal:6,validationIndependentEpisodes:2}})
  ],{
    asOf:t0+24*60*60*1000,
    taskMemory:first.taskMemory
  });
  assert.equal(second.tasks[0].stagnantCycles,0);
  assert.ok(second.tasks[0].leverage.queueAge>0);
});

test('eight no-progress source cycles mark research as stalled',()=>{
  const t0=1_800_000_000_000;
  let memory={};
  let out=null;
  for(let i=0;i<9;i++){
    out=rankBiggjResearchTasks([task({taskId:'stuck',subject:'stuck'})],{
      asOf:t0+i*60_000,
      taskMemory:memory
    });
    memory=out.taskMemory;
  }
  assert.equal(out.tasks[0].stalled,true);
  assert.equal(out.summary.stalledTaskCount,1);
  assert.ok(out.tasks[0].stagnantCycles>=8);
});

test('manual review remains ahead of automatic research regardless of leverage score',()=>{
  const out=rankBiggjResearchTasks([
    task({
      taskId:'auto',
      subject:'auto',
      priority:1,
      informationValue:1,
      uncertainty:1,
      metadata:{directUnlocks:20,transitiveUnlocks:20}
    }),
    task({
      taskId:'manual',
      subject:'manual',
      type:'SKILL_TRANSITION_REVIEW',
      priority:.2,
      informationValue:.2,
      uncertainty:.1,
      automaticShadowEligible:false,
      manualReviewRequired:true,
      autoHandler:null,
      dataNeeds:[]
    })
  ],{asOf:1_800_000_000_000});
  assert.equal(out.tasks[0].taskId,'manual');
});

test('task memory is bounded and drops long-dead tasks',()=>{
  const now=1_800_000_000_000;
  const memory={};
  for(let i=0;i<160;i++){
    memory['old-'+i]={
      taskId:'old-'+i,
      firstSeenAt:now-40*24*60*60*1000,
      lastSeenAt:now-31*24*60*60*1000,
      seenCycles:3,
      stagnantCycles:2,
      progressSignature:'x'
    };
  }
  const out=rankBiggjResearchTasks([task({taskId:'live',subject:'live'})],{asOf:now,taskMemory:memory});
  assert.ok(Object.keys(out.taskMemory).length<=128);
  assert.ok(out.taskMemory.live);
  assert.equal(Object.keys(out.taskMemory).some(x=>x.startsWith('old-')),false);
});


test('new PIT history resets stagnation for data-collection research tasks',()=>{
  const t0=1_800_000_000_000;
  const first=rankBiggjResearchTasks([
    task({taskId:'pit',subject:'pit',type:'CONTINUE_SHADOW_MEASUREMENT',dataNeeds:['MORE_POINT_IN_TIME_DATA']})
  ],{
    asOf:t0,
    historyStats:{rows:100,progressAt:t0-10_000},
    researchDataPlaneSummary:{seq:500}
  });
  const stale=rankBiggjResearchTasks([
    task({taskId:'pit',subject:'pit',type:'CONTINUE_SHADOW_MEASUREMENT',dataNeeds:['MORE_POINT_IN_TIME_DATA']})
  ],{
    asOf:t0+60_000,
    taskMemory:first.taskMemory,
    historyStats:{rows:100,progressAt:t0-10_000},
    researchDataPlaneSummary:{seq:500}
  });
  assert.equal(stale.tasks[0].stagnantCycles,1);

  const advanced=rankBiggjResearchTasks([
    task({taskId:'pit',subject:'pit',type:'CONTINUE_SHADOW_MEASUREMENT',dataNeeds:['MORE_POINT_IN_TIME_DATA']})
  ],{
    asOf:t0+120_000,
    taskMemory:stale.taskMemory,
    historyStats:{rows:104,progressAt:t0+90_000},
    researchDataPlaneSummary:{seq:520}
  });
  assert.equal(advanced.tasks[0].stagnantCycles,0);
  assert.equal(advanced.summary.progressContext.historyRows,104);
  assert.equal(advanced.summary.progressContext.historyProgressAt,t0+90_000);
  assert.equal(advanced.summary.progressContext.researchDataPlaneSeq,520);
});

test('global PIT growth does not fake progress for unrelated non-data research',()=>{
  const t0=1_800_000_000_000;
  const nonData=task({
    taskId:'model',
    subject:'model',
    type:'GENERATE_NEXT_CHALLENGER_GENERATION',
    dataNeeds:[]
  });
  const first=rankBiggjResearchTasks([nonData],{
    asOf:t0,
    historyStats:{rows:100,progressAt:t0-10_000},
    researchDataPlaneSummary:{seq:500}
  });
  const second=rankBiggjResearchTasks([nonData],{
    asOf:t0+60_000,
    taskMemory:first.taskMemory,
    historyStats:{rows:130,progressAt:t0+50_000},
    researchDataPlaneSummary:{seq:800}
  });
  assert.equal(second.tasks[0].stagnantCycles,1);
});
