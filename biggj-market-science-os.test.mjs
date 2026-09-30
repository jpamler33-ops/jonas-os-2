import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BIGGJ_MARKET_SCIENCE_OS_VERSION,
  BIGGJ_ARCHITECTURE_LAYERS,
  BIGGJ_ARCHITECTURE_CONTRACT,
  verifyBiggjArchitectureContract,
  buildBiggjMarketScienceOs,
  biggjMarketScienceOsSummary
} from './biggj-market-science-os.mjs';

const T0=Date.UTC(2026,8,30,21,0,0);

function fixture(){
  return {
    epistemicSummary:{
      version:'BIGGJ_EPISTEMIC_RUNTIME_V1',
      theoryCount:5,
      evidenceCount:294,
      experimentCount:3,
      surpriseCount:2,
      derivedStatusCounts:{HYPOTHESIS:3,OBSERVED_EFFECT:1,REPLICATED:1,ROBUST:0,PROVISIONAL_LAW:0,BROKEN:0}
    },
    scienceDirectorSummary:{
      version:'BIGGJ_MARKET_SCIENCE_DIRECTOR_V1',
      researchFingerprint:'rf1',
      knowledgeFrontier:{totalTheories:5,brokenTheories:0},
      nextResearchQuestion:{questionId:'rq1',question:'Why does X fail under Y?',priority:.82},
      topAgenda:[{questionId:'rq1',kind:'CONTRADICTION',priority:.82}],
      topDataRequests:[{requestId:'dr1',variable:'dealer_gamma',priority:.74}],
      theoryCompetitionCount:1
    },
    livingResearchSummary:{
      revision:9,
      researchRequired:4,
      activeAgendaItems:5,
      discoveredResearchOnlySkills:3,
      integrity:'PASS'
    },
    researchFactorySummary:{
      mode:'AUTONOMOUS_RESEARCH_ACTIVE',
      automatic:12,
      manual:2,
      dataOnly:3
    },
    marketRadar:{
      rows:[
        {symbol:'BTCUSDT',status:'WATCH',regime:'HIGH_LEVERAGE',witnessAgreement:.7,support:4,score:.66},
        {symbol:'ETHUSDT',status:'WATCH',regime:'LOW_LIQUIDITY',witnessAgreement:.6,support:3,score:.58}
      ]
    },
    globalIntel:{recent:[{title:'Macro event',availableAt:T0-1000}]},
    proofFeed:{version:'BIGGJ_PROOF_FEED_V1',counts:{live:2,resolved:10,committed:8,hits:5,misses:5,invalid:0,learned:4}},
    portfolio:{equityQuote:10000,netPnlQuote:12.5,openPositions:1,closedTrades:22,researchActivity:{openPositions:4,closedTrades:300}},
    operationalReadiness:{ready:true}
  };
}

test('architecture contract makes science core and trading an application',()=>{
  const v=verifyBiggjArchitectureContract();
  assert.equal(v.ok,true);
  assert.deepEqual(BIGGJ_ARCHITECTURE_CONTRACT.layerOrder,BIGGJ_ARCHITECTURE_LAYERS);
  assert.equal(BIGGJ_ARCHITECTURE_CONTRACT.identity.canonicalHome,'SCIENCE');
  assert.equal(BIGGJ_ARCHITECTURE_CONTRACT.identity.tradingIsApplication,true);
  assert.equal(BIGGJ_ARCHITECTURE_CONTRACT.identity.tcxIsBiggj,false);
  assert.ok(BIGGJ_ARCHITECTURE_CONTRACT.forbiddenEdges.includes('PNL->THEORY_PROMOTION'));
});

test('OS snapshot exposes science, world, lab, decisions and trading in downstream order',()=>{
  const os=buildBiggjMarketScienceOs({...fixture(),asOf:T0});
  assert.equal(os.version,BIGGJ_MARKET_SCIENCE_OS_VERSION);
  assert.equal(os.identity.systemClass,'AUTONOMOUS_MARKET_SCIENCE_AND_DECISION_INTELLIGENCE_SYSTEM');
  assert.equal(os.architecture.layerOrder[0],'REALITY');
  assert.equal(os.architecture.layerOrder.at(-1),'SHADOW_TRADING');
  assert.equal(os.science.role,'CORE');
  assert.equal(os.worldModel.role,'CORE');
  assert.equal(os.laboratory.role,'CORE');
  assert.equal(os.decisionIntelligence.role,'DOWNSTREAM_APPLICATION');
  assert.equal(os.trading.role,'DOWNSTREAM_DECISION_APPLICATION');
});

test('world model refuses to invent latent state, information flow or predictability field',()=>{
  const os=buildBiggjMarketScienceOs({...fixture(),asOf:T0});
  assert.equal(os.worldModel.latentStateDiscovery.status,'NOT_YET_IMPLEMENTED');
  assert.equal(os.worldModel.informationFlowGraph.status,'NOT_YET_IMPLEMENTED');
  assert.equal(os.worldModel.predictabilityField.status,'NOT_YET_IMPLEMENTED');
  assert.equal(os.semantics.unimplementedWorldModelCapabilitiesRemainExplicitlyUnknown,true);
});

test('PnL is visible downstream but has no scientific authority',()=>{
  const os=buildBiggjMarketScienceOs({...fixture(),asOf:T0});
  assert.equal(os.trading.netPnlQuote,12.5);
  assert.equal(os.trading.scientificAuthority,false);
  assert.equal(os.trading.canMutateTheory,false);
  assert.equal(os.semantics.pnlCannotPromoteTheory,true);
});

test('TCX and RIFT are reclassified as applications, not BIGGJ identity',()=>{
  const os=buildBiggjMarketScienceOs({...fixture(),asOf:T0});
  assert.equal(os.identity.tcxIsBiggj,false);
  assert.equal(os.decisionIntelligence.tcx.role,'DECISION_APPLICATION');
  assert.equal(os.decisionIntelligence.tcx.scientificAuthority,false);
  assert.equal(os.decisionIntelligence.rift.role,'MECHANISM_APPLICATION');
});

test('OS remains fail-closed and shadow-only',()=>{
  const os=buildBiggjMarketScienceOs({...fixture(),asOf:T0});
  assert.equal(os.safety.execution,'SHADOW_ONLY');
  assert.equal(os.safety.canExecute,false);
  assert.equal(os.safety.canExecuteLive,false);
  assert.equal(os.safety.automaticPrimaryMutation,false);
  assert.equal(os.trading.canExecuteLive,false);
});

test('canonical home is science even when runtime data is incomplete',()=>{
  const os=buildBiggjMarketScienceOs({asOf:T0});
  assert.equal(os.readiness.canonicalHome,'SCIENCE');
  assert.equal(os.readiness.scienceReady,false);
  assert.equal(os.readiness.worldReady,false);
  assert.equal(os.identity.canonicalHome,'SCIENCE');
});

test('summary preserves the architecture and fingerprint',()=>{
  const os=buildBiggjMarketScienceOs({...fixture(),asOf:T0});
  const summary=biggjMarketScienceOsSummary(os);
  assert.equal(summary.fingerprint,os.fingerprint);
  assert.equal(summary.architecture.canonicalFlow,os.architecture.canonicalFlow);
  assert.equal(summary.science.frontier.total,5);
  assert.equal(summary.worldModel.marketsObserved,2);
});
