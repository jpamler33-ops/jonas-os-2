import { renderBiggjMobileApp } from './biggj-mobile-webapp.mjs';

export const MISSION_CONTROL_VERSION='BIGGJ_MARKET_SCIENCE_CONTROL_V1';

export function missionControlSnapshot({health,portfolio,discovery,storage}={}){
  return {
    version:MISSION_CONTROL_VERSION,
    generatedAt:Date.now(),
    biggj:health?.biggjMarketScienceOs||null,
    health:health||{},
    portfolio:portfolio||{},
    discovery:discovery||{},
    storage:storage||{},
    execution:'SHADOW_ONLY',
    canExecuteLive:false
  };
}

export function renderMissionControlHtml(snapshot={}){
  return renderBiggjMobileApp(snapshot);
}
