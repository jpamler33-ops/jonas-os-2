import { renderBiggjMobileApp, BIGGJ_MOBILE_WEBAPP_VERSION } from './biggj-mobile-webapp.mjs';

export const MISSION_CONTROL_VERSION='BIGGJ_MARKET_SCIENCE_CONTROL_V2';

export function missionControlSnapshot({health,portfolio,researchTrades,discovery,storage}={}){
  const portfolioView=portfolio||{};
  const isolatedResearchTrades=researchTrades||portfolioView?.researchActivity||{};
  return {
    version:MISSION_CONTROL_VERSION,
    appVersion:BIGGJ_MOBILE_WEBAPP_VERSION,
    generatedAt:Date.now(),
    biggj:health?.biggjMarketScienceOs||null,
    health:health||{},
    portfolio:portfolioView,
    researchTrades:isolatedResearchTrades,
    discovery:discovery||{},
    storage:storage||{},
    execution:'SHADOW_ONLY',
    canExecuteLive:false
  };
}

export function renderMissionControlHtml(snapshot={}){
  return renderBiggjMobileApp(snapshot);
}