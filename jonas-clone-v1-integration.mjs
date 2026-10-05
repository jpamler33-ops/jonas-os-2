import {JONAS_CLONE_V1_POLICY,jonasCloneResearchPlan} from './jonas-clone-v1.mjs';

export const JONAS_CLONE_WALLET='W6_USER_99K_60S';

export function applyJonasClonePriority(runtime={}){
  return Object.freeze({...runtime,tradingResearchPriority:'JONAS_CLONE_V1',tradingResearchPriorityLevel:'P0',execution:'SHADOW_ONLY',canExecute:false,canExecuteLive:false,automaticPrimaryMutation:false,jonasClonePolicy:JONAS_CLONE_V1_POLICY});
}

export function jonasCloneCandidateToShadowIntent(candidate={}){
  const plan=jonasCloneResearchPlan(candidate);
  if(!plan.eligible)return Object.freeze({eligible:false,walletId:JONAS_CLONE_WALLET,execution:'SHADOW_ONLY',canExecuteLive:false});
  return Object.freeze({eligible:true,walletId:JONAS_CLONE_WALLET,strategy:'JONAS_CLONE_V1',priority:'P0',execution:'SHADOW_ONLY',canExecute:false,canExecuteLive:false,sizeSol:plan.sizeSol,checkpointsSeconds:plan.checkpointsSeconds,exitComparisonsSeconds:plan.exitComparisonsSeconds,minimumNormalLossExitSeconds:180,liquidityDecaySignal:true,preserveBaseline:true});
}
