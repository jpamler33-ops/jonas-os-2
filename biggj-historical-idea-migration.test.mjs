import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BIGGJ_HISTORICAL_IDEAS,
  biggjHistoricalIdeaCatalog
} from './biggj-historical-idea-catalog.mjs';
import {
  migrateBiggjHistoricalIdeas,
  biggjHistoricalMigrationQueue,
  biggjHistoricalResearchProposals,
  biggjHistoricalMigrationSummary
} from './biggj-historical-idea-migration.mjs';
import {
  BIGGJ_CAPABILITY_ROOTS,
  BIGGJ_SEED_CAPABILITIES
} from './biggj-capability-map.mjs';

test('historical catalog preserves recovered source provenance instead of pretending one exact 150-item list',()=>{
  const c=biggjHistoricalIdeaCatalog();
  assert.equal(c.total,344);
  assert.equal(c.sourceCounts.NOTION_TCX_WORLD_MASTER,223);
  assert.equal(c.sourceCounts.CHAT_HISTORY_2026_09_27_TO_29,121);
  assert.equal(BIGGJ_HISTORICAL_IDEAS.filter(x=>x.recoveryConfidence==='EXACT_SOURCE').length,223);
  assert.equal(BIGGJ_HISTORICAL_IDEAS.filter(x=>x.recoveryConfidence==='RECOVERED_PRIOR_CHAT').length,121);
});

test('migration resolves every recovered idea without enabling execution',()=>{
  const r=migrateBiggjHistoricalIdeas();
  assert.equal(r.sourceIdeaCount,344);
  assert.equal(r.dispositions.NEEDS_REVIEW,0);
  assert.equal(r.action,'ABSTAIN');
  assert.equal(r.execution,'SHADOW_ONLY');
  assert.equal(r.canExecuteLive,false);
});

test('migration deduplicates history into substantially fewer semantic targets',()=>{
  const r=migrateBiggjHistoricalIdeas();
  assert.ok(r.uniqueSemanticTargets<r.sourceIdeaCount);
  assert.equal(r.uniqueSemanticTargets,151);
  assert.ok(r.ideas.some(x=>x.duplicateGroupSize>1));
});

test('every mapped canonical target exists in the V2 capability map',()=>{
  const capabilityIds=new Set(BIGGJ_SEED_CAPABILITIES.map(x=>x.id));
  const rootIds=new Set(BIGGJ_CAPABILITY_ROOTS.map(x=>x.id));
  const r=migrateBiggjHistoricalIdeas();
  for(const row of r.ideas){
    if(row.capabilityId) assert.ok(capabilityIds.has(row.capabilityId),'unknown canonical capability '+row.capabilityId);
    if(row.targetKind==='ROOT') assert.ok(rootIds.has(row.rootId),'unknown canonical root '+row.rootId);
  }
});

test('foundational historical concepts map to the intended canonical skills',()=>{
  const r=migrateBiggjHistoricalIdeas();
  const byTitle=title=>r.ideas.find(x=>x.title===title);
  assert.equal(byTitle('World State').capabilityId,'CANONICAL_WORLD_STATE');
  assert.equal(byTitle('Surprise / Information Value').capabilityId,'INFORMATION_VALUE_PRIORITIZATION');
  assert.equal(byTitle('Causal Discovery').capabilityId,'IDENTIFIABILITY');
  assert.equal(byTitle('Disagreement Intelligence').capabilityId,'DISAGREEMENT_ENGINE');
  assert.equal(byTitle('Research Autopilot').capabilityId,'SELF_QUESTIONING');
  assert.equal(byTitle('Champion / Challenger System').capabilityId,'VERSIONED_CANDIDATES');
});

test('historical operator ideas remain views and never become evidence authority',()=>{
  const r=migrateBiggjHistoricalIdeas();
  for(const title of ['Discord Command Center','Superchart','BIGGJ Trading Academy','Alert Center']){
    const row=r.ideas.find(x=>x.title===title);
    assert.equal(row.role,'OPERATOR_VIEW');
    assert.equal(row.disposition,'KEEP_AS_OPERATOR_FEATURE');
  }
});

test('historical multiverse mechanics remain separated from BIGGJ market-core research',()=>{
  const r=migrateBiggjHistoricalIdeas();
  const rows=r.ideas.filter(x=>x.disposition==='SIMULATION_ONLY');
  assert.ok(rows.length>=30);
  assert.ok(rows.some(x=>/Universe|Interverse|Reality/i.test(x.title)));
  assert.ok(rows.every(x=>x.capabilityId===null));
});

test('obsolete living-world PWA mechanics can be retired without deleting their provenance',()=>{
  const r=migrateBiggjHistoricalIdeas();
  const row=r.ideas.find(x=>x.title==='IndexedDB + LocalStorage Save Mirror');
  assert.ok(row);
  assert.equal(row.disposition,'RETIRE_FROM_BIGGJ_CORE');
  assert.equal(row.source,'NOTION_TCX_WORLD_MASTER');
  assert.equal(row.sourceRef,'REQ-129');
});

test('unique surviving ideas become research proposals rather than automatic skills',()=>{
  const p=biggjHistoricalResearchProposals();
  assert.equal(p.proposals.length,15);
  assert.equal(p.automaticSkillCreation,false);
  assert.equal(p.automaticPromotion,false);
  assert.equal(p.canExecuteLive,false);
  const titles=new Set(p.proposals.map(x=>x.title));
  for(const title of [
    'LATENT_MARKET_ENERGY',
    'MECHANISM_POSTERIOR_GRAPH',
    'REFLEXIVITY_WITNESS_ENSEMBLE',
    'INTERVENTION_VALUE_MAP',
    'PRICE_TIME_CONSTRAINT_SURFACE',
    'MINIMUM_CASCADE_TRIGGER',
    'CASCADE_BASIN',
    'ABSORPTION_RESERVE',
    'MECHANISM_ENSEMBLE',
    'CAUSAL_EPISODE_MEMORY',
    'LEAVE_ONE_OUT_ROBUSTNESS',
    'MEME_RUG_RISK_INTELLIGENCE',
    'CLAIM_ASSUMPTION_GRAPH',
    'GOVERNED_EXPERIMENT_BLUEPRINTS',
    'RESEARCH_POLICY_GENOME'
  ]) assert.ok(titles.has(title),'missing historical research proposal '+title);
});

test('historical proposal sources remain attached for future audits',()=>{
  const p=biggjHistoricalResearchProposals();
  const mechanism=p.proposals.find(x=>x.title==='MECHANISM_POSTERIOR_GRAPH');
  assert.ok(mechanism.sourceIdeaIds.length>0);
  assert.ok(mechanism.sourceTitles.includes('Mechanism Posterior Graph'));
  assert.ok(mechanism.recoveryConfidence.includes('RECOVERED_PRIOR_CHAT'));

  const blueprints=p.proposals.find(x=>x.title==='GOVERNED_EXPERIMENT_BLUEPRINTS');
  assert.ok(blueprints.sourceIdeaIds.length>=2);
  assert.ok(blueprints.recoveryConfidence.every(x=>x==='EXACT_SOURCE'));
});

test('migration queue removes simulation-only and retired ideas from implementation priority',()=>{
  const q=biggjHistoricalMigrationQueue({limit:500});
  assert.ok(q.queue.length>0);
  assert.ok(q.queue.every(x=>!['SIMULATION_ONLY','RETIRE_FROM_BIGGJ_CORE'].includes(x.disposition)));
  assert.ok(q.queue.some(x=>x.disposition==='KEEP_AS_RESEARCH_PROPOSAL'));
  assert.equal(q.canExecuteLive,false);
});

test('summary exposes the migration boundary and zero unresolved historical ideas',()=>{
  const s=biggjHistoricalMigrationSummary();
  assert.equal(s.sourceIdeaCount,344);
  assert.equal(s.needsReviewCount,0);
  assert.equal(s.researchProposalCount,15);
  assert.ok(s.simulationOnlyCount>=30);
  assert.ok(s.topLeverage.some(x=>x.capabilityId==='PROVENANCE_CHAIN'));
  assert.equal(s.execution,'SHADOW_ONLY');
  assert.equal(s.action,'ABSTAIN');
  assert.equal(s.canExecuteLive,false);
});
