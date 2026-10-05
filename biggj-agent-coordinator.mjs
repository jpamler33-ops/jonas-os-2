import { createBiggjAgentRuntime } from './biggj-agent-runtime.mjs';
import { ingestBiggjEngineEvidence, buildBiggjAgentResearchContext } from './biggj-agent-evidence-adapter.mjs';

export const BIGGJ_AGENT_COORDINATOR_VERSION='BIGGJ_AGENT_COORDINATOR_V1';

export function createBiggjAgentCoordinator({runtime=createBiggjAgentRuntime(),minCycleMs=60_000}={}){
  let lastRunAt=0;
  let lastResult=null;
  let failures=0;

  function tick(engineState={}, {force=false,now=Date.now()}={}){
    if(!force && lastRunAt && now-lastRunAt<minCycleMs){
      return {status:'THROTTLED',nextEligibleAt:lastRunAt+minCycleMs,lastResult,snapshot:snapshot()};
    }
    lastRunAt=now;
    try{
      const context=buildBiggjAgentResearchContext(engineState);
      const evidence=ingestBiggjEngineEvidence(runtime.bus,context,{pointInTimeAt:now});
      const cycle=runtime.runCycle(context);
      lastResult={status:'OK',at:now,evidence,cycle};
      return lastResult;
    }catch(error){
      failures++;
      lastResult={status:'ERROR',at:now,error:String(error?.message||error),execution:'SHADOW_ONLY',canExecuteLive:false};
      return lastResult;
    }
  }

  function snapshot(){
    return {
      version:BIGGJ_AGENT_COORDINATOR_VERSION,
      lastRunAt,
      failures,
      lastResult,
      runtime:runtime.snapshot(),
      execution:'SHADOW_ONLY',
      canExecuteLive:false,
      automaticPrimaryMutation:false
    };
  }

  return {version:BIGGJ_AGENT_COORDINATOR_VERSION,runtime,tick,snapshot};
}

// Adapter for BIGGJ's existing runtime loop. It deliberately accepts summaries/snapshots
// rather than importing the engines themselves, so the agents coordinate existing truth
// instead of creating a second source of truth.
export function buildAgentEngineState({
  shadowCompetition,
  experimentGovernor,
  featureResearch,
  indicatorEvolution,
  learnedChallenger,
  parallelStrategyWorlds,
  walletResearchManager,
  researchActivity,
  researchFactory
}={}){
  return {
    shadowCompetition:shadowCompetition||null,
    experimentGovernor:experimentGovernor||null,
    featureResearch:featureResearch||null,
    indicatorEvolution:indicatorEvolution||null,
    learnedChallenger:learnedChallenger||null,
    parallelStrategyWorlds:parallelStrategyWorlds||null,
    walletResearchManager:walletResearchManager||null,
    researchActivity:researchActivity||null,
    autonomousResearchFactory:researchFactory||null
  };
}
