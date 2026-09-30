import { buildNewsResearchSnapshots, newsResearchSummary, NEWS_RESEARCH_ADAPTER_VERSION } from './news-research-adapter.mjs';
import { preflightResearchDataPlaneInputs, appendResearchDataPlane } from './research-data-plane.mjs';
import { governResearchSnapshot } from './research-data-governance.mjs';

export const NEWS_RESEARCH_RUNTIME_VERSION='TCX_NEWS_RESEARCH_RUNTIME_V1';

export async function ingestNewsResearchFeed({
  feed,
  symbols=[],
  plane,
  governanceState,
  ingestedAt=Date.now(),
  maxEvents=60,
  persistGovernance=null
}={}){
  if(!plane?.healthy) return Object.freeze({ok:false,reason:'RDP_UNHEALTHY',appended:0,duplicates:0,rejected:0});
  if(!governanceState) return Object.freeze({ok:false,reason:'GOVERNANCE_UNAVAILABLE',appended:0,duplicates:0,rejected:0});
  const raw=buildNewsResearchSnapshots(feed,{symbols,ingestedAt,maxEvents});
  const preflight=preflightResearchDataPlaneInputs(plane,raw);
  const governed=[];
  let rejected=0,quarantined=0,degraded=0;
  for(const snapshot of preflight.novel){
    const row=governResearchSnapshot(governanceState,snapshot,{evaluatedAt:ingestedAt});
    if(!row) continue;
    if(row.governance.decision==='REJECT') rejected++;
    else if(row.governance.decision==='QUARANTINE') quarantined++;
    else {
      if(row.governance.decision==='DEGRADED') degraded++;
      governed.push(row);
    }
  }
  const appended=governed.length?await appendResearchDataPlane(plane,governed):{appended:[],duplicates:0};
  if(typeof persistGovernance==='function'&&(preflight.novel.length>0)) await persistGovernance(governanceState);
  return Object.freeze({
    ok:true,
    version:NEWS_RESEARCH_RUNTIME_VERSION,
    adapterVersion:NEWS_RESEARCH_ADAPTER_VERSION,
    feed:newsResearchSummary(feed,{symbols}),
    candidateSnapshots:raw.length,
    preflightDuplicates:preflight.duplicates,
    governed:governed.length,
    appended:appended.appended.length,
    appendDuplicates:appended.duplicates,
    rejected,
    quarantined,
    degraded,
    execution:'SHADOW_ONLY',
    productionMutationAllowed:false,
    canExecuteLive:false
  });
}
