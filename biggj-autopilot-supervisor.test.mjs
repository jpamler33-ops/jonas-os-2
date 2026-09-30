import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BIGGJ_AUTOPILOT_SUPERVISOR_VERSION,
  buildBiggjAutopilotSupervisor,
  biggjAutopilotSupervisorSummary
} from './biggj-autopilot-supervisor.mjs';

const T0=Date.UTC(2026,8,30,21,0,0);

function healthySnapshot(){
  return {
    health:{
      operationalReadiness:{ready:true},
      autonomousOperator:{
        mode:'WAITING_FOR_DATA',
        operatorNeeded:false,
        approvalRequired:0,
        activeIncidents:0,
        automationCoverage:1,
        waitingForData:true,
        humanJobRemaining:'EXCEPTIONS_ONLY'
      },
      autonomousResearchFactory:{
        mode:'DATA_QUALITY_BLOCKED',
        automatic:12,
        manual:0,
        unowned:0,
        dataNeeds:['MORE_POINT_IN_TIME_DATA'],
        researchLeverage:{dataReadiness:.95,stalledTasks:26}
      },
      biggjWorldModel:{healthy:true,version:'BIGGJ_WORLD_MODEL_RUNTIME_V1'},
      biggjEpistemicKernel:{healthy:true,version:'BIGGJ_EPISTEMIC_RUNTIME_V1'},
      biggjRulebook:{runtime:{state:'PASS'}},
      institutionalForecastRuntime:{healthy:true},
      shadowOms:{healthy:true},
      shadowPortfolio:{healthy:true},
      biggjLivingResearch:{healthy:true},
      discordBridge:{ready:true}
    }
  };
}

test('passive data waiting remains autonomous and never creates a human task',()=>{
  const s=buildBiggjAutopilotSupervisor(healthySnapshot(),{asOf:T0});
  assert.equal(s.version,BIGGJ_AUTOPILOT_SUPERVISOR_VERSION);
  assert.equal(s.state,'AUTOPILOT_DEGRADED');
  assert.equal(s.humanActionRequired,false);
  assert.equal(s.shouldNotifyHuman,false);
  assert.equal(s.operator.automationCoverage,1);
  assert.equal(s.research.manual,0);
  assert.ok(s.waiting.includes('MORE_POINT_IN_TIME_DATA'));
  assert.ok(s.warnings.includes('STALLED_RESEARCH_TASKS'));
  assert.equal(s.semantics.waitingForDataIsNotFailure,true);
  assert.equal(s.canExecuteLive,false);
  assert.equal(s.automaticPrimaryMutation,false);
});

test('explicit approval or incident becomes a real escalation',()=>{
  const snapshot=healthySnapshot();
  snapshot.health.autonomousOperator={
    ...snapshot.health.autonomousOperator,
    mode:'ESCALATION_REQUIRED',
    operatorNeeded:true,
    approvalRequired:1,
    activeIncidents:1,
    waitingForData:false,
    humanJobRemaining:'APPROVAL_REQUIRED'
  };
  const s=buildBiggjAutopilotSupervisor(snapshot,{asOf:T0});
  assert.equal(s.state,'ESCALATION_REQUIRED');
  assert.equal(s.humanActionRequired,true);
  assert.equal(s.shouldNotifyHuman,true);
  assert.ok(s.critical.includes('OPERATOR_REQUIRED'));
  assert.ok(s.critical.includes('APPROVAL_REQUIRED'));
  assert.ok(s.critical.includes('ACTIVE_INCIDENTS'));
});

test('manual or unowned research is treated as an exception, not silently ignored',()=>{
  const snapshot=healthySnapshot();
  snapshot.health.autonomousResearchFactory.manual=2;
  snapshot.health.autonomousResearchFactory.unowned=1;
  snapshot.health.autonomousOperator.waitingForData=false;
  const s=buildBiggjAutopilotSupervisor(snapshot,{asOf:T0});
  assert.equal(s.humanActionRequired,true);
  assert.ok(s.critical.includes('MANUAL_RESEARCH_TASKS'));
  assert.ok(s.critical.includes('UNOWNED_RESEARCH_TASKS'));
});

test('broken science or persistence fails closed',()=>{
  const snapshot=healthySnapshot();
  snapshot.health.biggjWorldModel.healthy=false;
  snapshot.health.biggjEpistemicKernel.healthy=false;
  snapshot.health.biggjRulebook.runtime.state='BLOCKED';
  snapshot.health.shadowOms.healthy=false;
  const s=buildBiggjAutopilotSupervisor(snapshot,{asOf:T0});
  assert.equal(s.state,'ESCALATION_REQUIRED');
  assert.ok(s.critical.includes('WORLD_MODEL_UNHEALTHY'));
  assert.ok(s.critical.includes('EPISTEMIC_KERNEL_UNHEALTHY'));
  assert.ok(s.critical.includes('RULEBOOK_NOT_PASS'));
  assert.ok(s.critical.includes('PERSISTENCE_SHADOWOMS_UNHEALTHY'));
});

test('summary preserves exception-only semantics and fingerprint',()=>{
  const s=buildBiggjAutopilotSupervisor(healthySnapshot(),{asOf:T0});
  const summary=biggjAutopilotSupervisorSummary(s);
  assert.equal(summary.fingerprint,s.fingerprint);
  assert.equal(summary.humanActionRequired,false);
  assert.equal(summary.execution,'SHADOW_ONLY');
  assert.equal(summary.canExecuteLive,false);
});
