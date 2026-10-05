import {JONAS_CLONE_V1_POLICY} from './jonas-clone-v1.mjs';

export const JONAS_CLONE_WALLET='W6_USER_99K_60S';

export function applyJonasClonePriority(runtime={}){
  return Object.freeze({...runtime,tradingResearchPriority:'JONAS_CLONE_V1',tradingResearchPriorityLevel:'P0',execution:'SHADOW_ONLY',canExecute:false,canExecuteLive:false,automaticPrimaryMutation:false,jonasClonePolicy:JONAS_CLONE_V1_POLICY});
}

export {jonasCloneCandidateToShadowIntent} from './jonas-clone-v1-intent.mjs';

// The existing wallet engine remains the only position and persistence owner.
import {applyUser99k60sStrategySnapshot} from './shadow-specialist-wallets.mjs';
export function applyJonasCloneSnapshot(state,snapshot,options={}){
  const now=options.now??Date.now();
  const captured=Number(snapshot?.capturedAt);
  const fresh=snapshot?.capturedAt!=null&&Number.isFinite(captured)&&captured<=now&&now-captured<=15000;
  return applyUser99k60sStrategySnapshot(state,{...snapshot,sourceReady:snapshot?.sourceReady===true&&fresh},{
    ...options,clonePolicy:true,maxAgeSeconds:60,minMarketCapUsd:99000,
    minGreenChangePct:null,requireExactGmgnGreen:false,requireTrending:true,
    requireNewPair:false,minHoldSeconds:180
  });
}
