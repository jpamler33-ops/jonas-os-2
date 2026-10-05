import { createBiggjAgentCoordinator, buildAgentEngineState } from './biggj-agent-coordinator.mjs';

export const BIGGJ_AGENT_AUTOLEARN_HOOK_VERSION='BIGGJ_AGENT_AUTOLEARN_HOOK_V1';

export function createBiggjAgentAutolearnHook({coordinator=createBiggjAgentCoordinator()}={}){
  let invocations=0;
  let last=null;

  function afterAutolearn({silentResult=null,engines={}}={}){
    invocations++;
    if(!silentResult || silentResult.ok!==true){
      last={status:'SKIPPED',reason:'AUTOLEARN_NOT_SUCCESSFUL',at:Date.now()};
      return last;
    }

    const researchFactory=engines.researchFactory||{
      mode:'AUTOLEARN_OBSERVATION',
      dataNeeds:[],
      nextTasks:[],
      latestForecast:{
        symbol:silentResult.symbol||null,
        dataQuality:silentResult.dataQuality??null,
        researchDependencyGate:silentResult.researchDependencyGate||null,
        researchDependencyCoverage:silentResult.researchDependencyCoverage??null,
        researchGovernanceIssueCount:silentResult.researchGovernanceIssueCount??null,
        autoShadowTradePlaced:silentResult.autoShadowTradePlaced===true,
        mandatoryDiscoveryPlaced:silentResult.mandatoryDiscoveryPlaced===true,
        learnedChallengerPlaced:Number(silentResult.learnedChallengerPlaced||0),
        strategyLeaguePlaced:Number(silentResult.strategyLeaguePlaced||0)
      }
    };

    const state=buildAgentEngineState({
      shadowCompetition:engines.shadowCompetition||null,
      experimentGovernor:engines.experimentGovernor||null,
      featureResearch:engines.featureResearch||null,
      indicatorEvolution:engines.indicatorEvolution||null,
      learnedChallenger:engines.learnedChallenger||null,
      parallelStrategyWorlds:engines.parallelStrategyWorlds||null,
      walletResearchManager:engines.walletResearchManager||null,
      researchActivity:engines.researchActivity||null,
      researchFactory
    });

    last=coordinator.tick(state);
    return last;
  }

  return {
    version:BIGGJ_AGENT_AUTOLEARN_HOOK_VERSION,
    coordinator,
    afterAutolearn,
    snapshot:()=>({version:BIGGJ_AGENT_AUTOLEARN_HOOK_VERSION,invocations,last,coordinator:coordinator.snapshot(),execution:'SHADOW_ONLY',canExecuteLive:false,automaticPrimaryMutation:false})
  };
}
