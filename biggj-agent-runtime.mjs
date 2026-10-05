import { createDefaultBiggjAgentBus } from './biggj-agent-bus.mjs';

export const BIGGJ_AGENT_RUNTIME_VERSION='BIGGJ_AGENT_RUNTIME_V1';

export function createBiggjAgentRuntime({bus=createDefaultBiggjAgentBus()}={}) {
  let cycles=0;
  let lastCycle=null;

  function seedFromResearchState(state={}) {
    const factory=state.autonomousResearchFactory||state.researchFactory||{};
    const needs=Array.isArray(factory.dataNeeds)?factory.dataNeeds:[];
    const next=Array.isArray(factory.nextTasks)?factory.nextTasks:[];

    for (const need of needs) {
      bus.enqueueTask({
        type:'OBSERVE_DATA_GAP',
        subject:String(need),
        payload:{source:'AUTONOMOUS_RESEARCH_FACTORY',researchMode:factory.mode||null},
        priority:0.95,
        requestedBy:'orchestrator-1',
        requires:['DATA_GAPS']
      });
    }

    for (const task of next.slice(0,20)) {
      bus.enqueueTask({
        type:task.type||'CONTINUE_RESEARCH',
        subject:task.subject||'UNKNOWN',
        payload:{sourceTask:task},
        priority:Number(task.effectivePriority??0.7),
        requestedBy:'orchestrator-1',
        requires:['SHADOW_TEST']
      });
    }
    return bus.snapshot();
  }

  function runCycle(context={}) {
    cycles++;
    const startedAt=Date.now();
    seedFromResearchState(context);

    // Observer: convert current PIT/data gaps into immutable evidence.
    let task=bus.claimTask('observer-1');
    if (task) {
      const ev=bus.addEvidence({
        source:'BIGGJ_RUNTIME',kind:'DATA_GAP',subject:task.subject,
        data:{task:task.payload,cycle:cycles},pointInTimeAt:startedAt,
        independentKey:`observer:${task.subject}:${cycles}`
      });
      bus.completeTask({taskId:task.taskId,agentId:'observer-1',result:{status:'OBSERVED'},evidenceIds:[ev.evidenceId]});
      bus.publish({from:'observer-1',to:'orchestrator-1',type:'DATA_GAP_EVIDENCE',payload:{subject:task.subject},evidenceIds:[ev.evidenceId]});
      bus.enqueueTask({type:'GENERATE_HYPOTHESIS',subject:task.subject,payload:{parentEvidenceId:ev.evidenceId},priority:0.85,requestedBy:'orchestrator-1',requires:['HYPOTHESIS_GENERATION']});
    }

    // Hypothesis agent: only creates a falsifiable research proposal, never a trade instruction.
    task=bus.claimTask('hypothesis-1');
    if (task) {
      const hypothesis={hypothesisId:`hyp_${cycles}_${task.taskId}`,subject:task.subject,falsifiable:true,authority:'RESEARCH_ONLY'};
      bus.completeTask({taskId:task.taskId,agentId:'hypothesis-1',result:hypothesis});
      bus.publish({from:'hypothesis-1',to:'experiment-1',type:'HYPOTHESIS_PROPOSED',payload:hypothesis});
      bus.enqueueTask({type:'TEST_HYPOTHESIS',subject:hypothesis.hypothesisId,payload:hypothesis,priority:0.8,requestedBy:'orchestrator-1',requires:['WALK_FORWARD']});
    }

    // Experiment agent creates the test request. Existing BIGGJ engines remain the measurement authority.
    task=bus.claimTask('experiment-1');
    if (task) {
      const result={status:'MEASUREMENT_REQUIRED',hypothesisId:task.payload?.hypothesisId||task.subject,required:['POINT_IN_TIME','WALK_FORWARD','OUT_OF_SAMPLE'],authority:'SHADOW_RESEARCH'};
      bus.completeTask({taskId:task.taskId,agentId:'experiment-1',result});
      bus.publish({from:'experiment-1',to:'red-team-1',type:'EXPERIMENT_READY_FOR_ATTACK',payload:result});
      bus.enqueueTask({type:'RED_TEAM_REVIEW',subject:result.hypothesisId,payload:result,priority:0.79,requestedBy:'orchestrator-1',requires:['LEAKAGE']});
    }

    // Red team assumes failure until evidence survives leakage/overfit/confounder checks.
    task=bus.claimTask('red-team-1');
    if (task) {
      const result={hypothesisId:task.subject,status:'MORE_DATA',checks:['FUTURE_LEAKAGE','OVERFIT','CONFOUNDERS','SAMPLE_INDEPENDENCE'],passed:false};
      bus.completeTask({taskId:task.taskId,agentId:'red-team-1',result});
      bus.publish({from:'red-team-1',to:'judge-1',type:'RED_TEAM_RESULT',payload:result});
      bus.enqueueTask({type:'JUDGE_RESEARCH',subject:task.subject,payload:result,priority:0.78,requestedBy:'orchestrator-1',requires:['EVIDENCE_GRADING']});
    }

    // Judge defaults to MORE_DATA. Challenger status requires independent replication in Agent Bus.
    task=bus.claimTask('judge-1');
    if (task) {
      const decision=bus.judge({agentId:'judge-1',hypothesisId:task.subject,decision:'MORE_DATA',reason:'Independent PIT/OOS replication not yet supplied',evidenceIds:[],replicationAgentIds:[]});
      bus.completeTask({taskId:task.taskId,agentId:'judge-1',result:decision});
      bus.publish({from:'judge-1',to:'orchestrator-1',type:'JUDGE_DECISION',payload:decision});
    }

    lastCycle={cycle:cycles,startedAt,finishedAt:Date.now(),bus:bus.snapshot(),execution:'SHADOW_ONLY',canExecuteLive:false,automaticPrimaryMutation:false};
    return lastCycle;
  }

  return {
    version:BIGGJ_AGENT_RUNTIME_VERSION,
    bus,
    runCycle,
    seedFromResearchState,
    snapshot:()=>({version:BIGGJ_AGENT_RUNTIME_VERSION,cycles,lastCycle,bus:bus.snapshot(),execution:'SHADOW_ONLY',canExecuteLive:false,automaticPrimaryMutation:false})
  };
}
