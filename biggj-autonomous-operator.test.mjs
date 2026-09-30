
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  BIGGJ_AUTONOMOUS_OPERATOR_VERSION,
  createBiggjAutonomousOperator,
  verifyBiggjAutonomousOperator,
  refreshBiggjAutonomousOperator,
  recordBiggjAutonomousOperatorActionResults,
  biggjAutonomousOperatorSummary,
  loadBiggjAutonomousOperator,
  saveBiggjAutonomousOperator
} from './biggj-autonomous-operator.mjs';

const now=1_800_000_000_000;

function task(overrides={}){
  return {
    taskId:'t1',
    type:'CONTINUE_SHADOW_MEASUREMENT',
    subject:'seed:TEST',
    autoHandler:'SHADOW_COMPETITION_WORKER',
    automaticShadowEligible:true,
    manualReviewRequired:false,
    ...overrides
  };
}

function factory(overrides={}){
  return {
    mode:'DATA_COLLECTION_ONLY',
    operatorDataOnly:true,
    nextTasks:[task()],
    ...overrides
  };
}

function policies(overrides={}){
  return {
    SHADOW_COMPETITION_WORKER:{
      enabled:true,
      operations:['forecast_shadow_competition'],
      maxSilentMs:120_000,
      recoveryAction:null
    },
    FORECAST_FEATURE_RESEARCH:{
      enabled:true,
      operations:['forecast_feature_research_sync'],
      maxSilentMs:120_000,
      recoveryAction:'SYNC_FEATURE_RESEARCH'
    },
    ...overrides
  };
}

test('operator state is fail-closed and has no production authority',()=>{
  const state=createBiggjAutonomousOperator({asOf:now});
  const v=verifyBiggjAutonomousOperator(state);
  assert.equal(v.ok,true);
  assert.equal(state.version,BIGGJ_AUTONOMOUS_OPERATOR_VERSION);
  assert.equal(state.safety.execution,'SHADOW_ONLY');
  assert.equal(state.safety.canExecute,false);
  assert.equal(state.safety.canExecuteLive,false);
  assert.equal(state.safety.automaticPrimaryMutation,false);
  assert.equal(state.safety.automaticPromotion,false);
  assert.equal(state.safety.automaticSkillTransition,false);
});

test('healthy owned work becomes hands-off operator mode',()=>{
  const state=createBiggjAutonomousOperator({asOf:now-10_000});
  const out=refreshBiggjAutonomousOperator(state,{
    factorySummary:factory(),
    operations:{forecast_shadow_competition:{lastAt:now-10_000,lastError:null}},
    ownerPolicies:policies(),
    uptimeMs:600_000,
    asOf:now
  });
  const summary=biggjAutonomousOperatorSummary(out.state);
  assert.equal(summary.mode,'HANDS_OFF');
  assert.equal(summary.operatorNeeded,false);
  assert.equal(summary.humanJobRemaining,'EXCEPTIONS_ONLY');
  assert.equal(summary.automationCoverage,1);
  assert.equal(summary.activeIncidents,0);
});

test('manual governance review remains a human approval boundary',()=>{
  const state=createBiggjAutonomousOperator({asOf:now-10_000});
  const out=refreshBiggjAutonomousOperator(state,{
    factorySummary:factory({
      mode:'MANUAL_REVIEW_REQUIRED',
      operatorDataOnly:false,
      nextTasks:[task({
        taskId:'manual',
        type:'SKILL_TRANSITION_REVIEW',
        subject:'skill:x',
        autoHandler:null,
        automaticShadowEligible:false,
        manualReviewRequired:true
      })]
    }),
    operations:{},
    ownerPolicies:policies(),
    uptimeMs:600_000,
    asOf:now
  });
  assert.equal(out.state.mode,'ESCALATION_REQUIRED');
  assert.equal(out.state.operatorNeeded,true);
  assert.match(out.state.humanJobRemaining,/APPROVAL_REQUIRED/);
  assert.equal(out.actions.length,0);
});

test('stale recoverable owner gets a reversible self-heal action',()=>{
  const state=createBiggjAutonomousOperator({asOf:now-10_000});
  const out=refreshBiggjAutonomousOperator(state,{
    factorySummary:factory({
      mode:'AUTONOMOUS_RESEARCH_ACTIVE',
      nextTasks:[task({
        taskId:'feature',
        type:'CONTINUE_FEATURE_RESEARCH',
        subject:'FEATURE_RESEARCH',
        autoHandler:'FORECAST_FEATURE_RESEARCH'
      })]
    }),
    operations:{forecast_feature_research_sync:{lastAt:now-600_000,lastError:null}},
    ownerPolicies:policies(),
    uptimeMs:600_000,
    asOf:now
  });
  assert.equal(out.state.mode,'SELF_HEALING');
  assert.equal(out.state.operatorNeeded,false);
  assert.equal(out.actions.length,1);
  assert.equal(out.actions[0].type,'SYNC_FEATURE_RESEARCH');
  assert.equal(out.actions[0].reversible,true);
  assert.equal(out.actions[0].canExecuteLive,false);
});

test('successful recovery result is recorded without granting authority',()=>{
  const state=createBiggjAutonomousOperator({asOf:now-10_000});
  const planned=refreshBiggjAutonomousOperator(state,{
    factorySummary:factory({
      nextTasks:[task({taskId:'feature',subject:'FEATURE_RESEARCH',autoHandler:'FORECAST_FEATURE_RESEARCH'})]
    }),
    operations:{},
    ownerPolicies:policies(),
    uptimeMs:600_000,
    asOf:now
  });
  const action=planned.actions[0];
  const next=recordBiggjAutonomousOperatorActionResults(planned.state,[{actionId:action.actionId,ok:true}],{asOf:now+1});
  assert.equal(next.recoveryHistory.at(-1).result,'EXECUTED');
  assert.equal(next.plannedActions.length,0);
  assert.equal(next.safety.canExecuteLive,false);
});

test('executed recovery is only marked resolved after a later verification cycle',()=>{
  const state=createBiggjAutonomousOperator({asOf:now-10_000});
  const planned=refreshBiggjAutonomousOperator(state,{
    factorySummary:factory({
      mode:'AUTONOMOUS_RESEARCH_ACTIVE',
      nextTasks:[task({taskId:'feature',subject:'FEATURE_RESEARCH',autoHandler:'FORECAST_FEATURE_RESEARCH'})]
    }),
    operations:{forecast_feature_research_sync:{lastAt:now-600_000,lastError:'stale'}},
    ownerPolicies:policies(),
    uptimeMs:600_000,
    asOf:now
  });
  const action=planned.actions[0];
  const executed=recordBiggjAutonomousOperatorActionResults(planned.state,[{actionId:action.actionId,ok:true}],{asOf:now+1});
  assert.equal(executed.recoveryHistory.at(-1).result,'EXECUTED');

  const verified=refreshBiggjAutonomousOperator(executed,{
    factorySummary:factory({
      mode:'AUTONOMOUS_RESEARCH_ACTIVE',
      nextTasks:[task({taskId:'feature',subject:'FEATURE_RESEARCH',autoHandler:'FORECAST_FEATURE_RESEARCH'})]
    }),
    operations:{forecast_feature_research_sync:{lastAt:now+2,lastError:null}},
    ownerPolicies:policies(),
    uptimeMs:600_000,
    asOf:now+3
  });
  assert.equal(verified.state.recoveryHistory.at(-1).result,'VERIFIED_RESOLVED');
  assert.equal(biggjAutonomousOperatorSummary(verified.state).verifiedResolvedRecoveries,1);
});

test('repeated failed self-healing eventually escalates instead of looping forever',()=>{
  let state=createBiggjAutonomousOperator({asOf:now-100_000});
  for(let i=0;i<3;i++){
    const t=now+i*400_000;
    const out=refreshBiggjAutonomousOperator(state,{
      factorySummary:factory({
        nextTasks:[task({taskId:'feature',subject:'FEATURE_RESEARCH',autoHandler:'FORECAST_FEATURE_RESEARCH'})]
      }),
      operations:{forecast_feature_research_sync:{lastAt:now-1_000_000,lastError:'stuck'}},
      ownerPolicies:policies(),
      uptimeMs:1_000_000,
      asOf:t,
      policy:{actionCooldownMs:1}
    });
    state=out.state;
  }
  const summary=biggjAutonomousOperatorSummary(state);
  assert.equal(summary.operatorNeeded,true);
  assert.equal(summary.mode,'ESCALATION_REQUIRED');
  assert.ok(summary.exhaustedRecoveries>=1);
});

test('passive point-in-time data wait does not trigger pointless research restart',()=>{
  const state=createBiggjAutonomousOperator({asOf:now-10_000});
  const out=refreshBiggjAutonomousOperator(state,{
    factorySummary:factory({
      mode:'RESEARCH_STALLED',
      operatorDataOnly:false,
      dataNeeds:['MORE_POINT_IN_TIME_DATA'],
      nextTasks:[task({taskId:'pit',subject:'seed:PIT_EVENT_CLOCK'})]
    }),
    operations:{forecast_shadow_competition:{lastAt:now-10_000,lastError:null}},
    ownerPolicies:policies(),
    uptimeMs:600_000,
    asOf:now
  });
  const summary=biggjAutonomousOperatorSummary(out.state);
  assert.equal(summary.mode,'WAITING_FOR_DATA');
  assert.equal(summary.waitingForData,true);
  assert.equal(summary.operatorNeeded,false);
  assert.equal(out.actions.length,0);
});

test('startup grace also treats passive stalled research as data wait rather than self-heal',()=>{
  const state=createBiggjAutonomousOperator({asOf:now-1_000});
  const out=refreshBiggjAutonomousOperator(state,{
    factorySummary:factory({
      mode:'RESEARCH_STALLED',
      operatorDataOnly:false,
      dataNeeds:['MORE_POINT_IN_TIME_DATA'],
      nextTasks:[task({taskId:'pit',subject:'seed:PIT_EVENT_CLOCK'})]
    }),
    operations:{},
    ownerPolicies:policies(),
    uptimeMs:30_000,
    asOf:now
  });
  assert.equal(out.state.ownerAssessments[0].state,'WARMING_UP');
  assert.equal(out.state.mode,'WAITING_FOR_DATA');
  assert.equal(out.actions.length,0);
});

test('research stall is self-diagnosed before human escalation',()=>{
  const state=createBiggjAutonomousOperator({asOf:now-10_000});
  const out=refreshBiggjAutonomousOperator(state,{
    factorySummary:factory({mode:'RESEARCH_STALLED',operatorDataOnly:false,nextTasks:[]}),
    operations:{},
    ownerPolicies:policies(),
    uptimeMs:600_000,
    asOf:now
  });
  assert.equal(out.state.mode,'SELF_HEALING');
  assert.equal(out.actions[0].type,'REFRESH_RESEARCH_STACK');
  assert.equal(out.state.operatorNeeded,false);
});

test('disabled required owner escalates when there is no safe recovery',()=>{
  const state=createBiggjAutonomousOperator({asOf:now-10_000});
  const out=refreshBiggjAutonomousOperator(state,{
    factorySummary:factory(),
    operations:{},
    ownerPolicies:policies({
      SHADOW_COMPETITION_WORKER:{
        enabled:false,
        operations:['forecast_shadow_competition'],
        maxSilentMs:120_000,
        recoveryAction:null
      }
    }),
    uptimeMs:600_000,
    asOf:now
  });
  assert.equal(out.state.operatorNeeded,true);
  assert.equal(out.state.mode,'ESCALATION_REQUIRED');
});

test('startup grace avoids false stale-worker alarms',()=>{
  const state=createBiggjAutonomousOperator({asOf:now-1_000});
  const out=refreshBiggjAutonomousOperator(state,{
    factorySummary:factory(),
    operations:{},
    ownerPolicies:policies(),
    uptimeMs:30_000,
    asOf:now
  });
  assert.equal(out.state.ownerAssessments[0].state,'WARMING_UP');
  assert.equal(out.state.operatorNeeded,false);
});

test('operator state persists and reloads with fingerprint verification',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'biggj-operator-'));
  const file=path.join(dir,'operator.json');
  const state=createBiggjAutonomousOperator({asOf:now});
  await saveBiggjAutonomousOperator(file,state);
  const loaded=await loadBiggjAutonomousOperator(file);
  assert.deepEqual(loaded,state);
});
