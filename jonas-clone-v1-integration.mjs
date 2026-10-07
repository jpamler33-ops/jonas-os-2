import {JONAS_CLONE_V1_POLICY} from './jonas-clone-v1.mjs';

export const JONAS_CLONE_WALLET='W6_USER_99K_60S';

export function applyJonasClonePriority(runtime={}){
  return Object.freeze({...runtime,tradingResearchPriority:'JONAS_CLONE_V1',tradingResearchPriorityLevel:'P0',execution:'SHADOW_ONLY',canExecute:false,canExecuteLive:false,automaticPrimaryMutation:false,jonasClonePolicy:JONAS_CLONE_V1_POLICY});
}

export {jonasCloneCandidateToShadowIntent} from './jonas-clone-v1-intent.mjs';

// W6 reproduces the user's GMGN New Pair -> 1m workflow in SHADOW only.
// "99k" means the observed GMGN 1m performance is >= +99,000%, never
// $99,000 market cap. A valid entry must be seen on the exact GMGN feed
// while pair age is strictly <120s. The primary exit is fixed at 240s;
// confirmed liquidity death closes earlier with zero-recovery settlement.
import {applyUser99k60sStrategySnapshot} from './shadow-specialist-wallets.mjs';
export function applyJonasCloneSnapshot(state,snapshot,options={}){
  const now=options.now??Date.now();
  const captured=Number(snapshot?.capturedAt);
  const fresh=snapshot?.capturedAt!=null&&Number.isFinite(captured)&&captured<=now&&now-captured<=15000;
  return applyUser99k60sStrategySnapshot(state,{...snapshot,sourceReady:snapshot?.sourceReady===true&&fresh},{
    ...options,
    clonePolicy:true,
    maxAgeSeconds:120,
    minMarketCapUsd:null,
    minGreenChangePct:99000,
    requireExactGmgnGreen:true,
    requireTrending:false,
    requireNewPair:true,
    minHoldSeconds:240
  });
}
