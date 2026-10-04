import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BIGGJ_RESEARCH_SPINE_VERSION,
  BIGGJ_RESEARCH_SPINE_LAYERS,
  BIGGJ_RESEARCH_SPINE_EDGES,
  verifyBiggjResearchSpine,
  buildBiggjResearchSpine,
  biggjResearchSpineSummary
} from './biggj-research-spine.mjs';

function healthyHealth(){
  return {
    marketDataFabric:{healthy:true},
    marketRadar:{rows:[{symbol:'BTCUSDT'}]},
    globalIntel:{sourceReady:true,recent:[{id:'n1'}]},
    memecoinRadar:{sourceReady:true},
    institutionalKernel:{ledgerHealthy:true},
    biggjEpistemicKernel:{healthy:true},
    evidenceHistory:{healthy:true},
    biggjRulebook:{healthy:true},
    indicatorEvolution:{healthy:true,featureFactory:{experiments:32}},
    biggjWorldModel:{healthy:true,marketsObserved:12},
    discoveryLedger:{healthy:true},
    specialistWallets:{healthy:true},
    parallelStrategyWorlds:{healthy:true},
    strategyLeagueSummary:{healthy:true},
    walletResearchManager:{healthy:true},
    autonomousResearchFactory:{healthy:true},
    biggjProofFeed:{version:'X'},
    claimAssumptionResearch:{state:'OK'},
    operationalReadiness:{ready:true},
    shadowOms:{healthy:true},
    episodeMemory:{healthy:true},
    telegramPolling:{lastPollError:null},
    discordBridge:{enabled:true,ready:true}
  };
}

test('research spine has canonical layered wiring and no forbidden edge',()=>{
  const v=verifyBiggjResearchSpine();
  assert.equal(v.ok,true);
  assert.equal(v.layerCount,11);
  assert.ok(v.uniqueModuleReferences>=40);
  assert.equal(BIGGJ_RESEARCH_SPINE_LAYERS[0].id,'L0_REALITY');
  assert.equal(BIGGJ_RESEARCH_SPINE_LAYERS.at(-1).id,'L10_OPERATOR_SURFACE');
  assert.ok(BIGGJ_RESEARCH_SPINE_EDGES.some(x=>x[0]==='L8_SHADOW_EXECUTION'&&x[1]==='L9_LEARNING_MEMORY'));
  assert.ok(BIGGJ_RESEARCH_SPINE_EDGES.some(x=>x[0]==='L9_LEARNING_MEMORY'&&x[1]==='L5_STRATEGY_LAB'));
  assert.equal(BIGGJ_RESEARCH_SPINE_EDGES.some(x=>x[0]==='L8_SHADOW_EXECUTION'&&x[1]==='L1_TRUTH_EVIDENCE'&&x[2]==='PNL_AS_TRUTH'),false);
});

test('research spine reports all layers ready when connected runtime inputs are healthy',()=>{
  const x=buildBiggjResearchSpine({
    health:healthyHealth(),
    portfolio:{openPositions:1},
    discovery:{rows:[]},
    asOf:123456
  });
  assert.equal(x.version,BIGGJ_RESEARCH_SPINE_VERSION);
  assert.equal(x.summary.ready,11);
  assert.equal(x.summary.degraded,0);
  assert.equal(x.summary.collecting,0);
  assert.equal(x.canExecuteLive,false);
  assert.equal(x.truthFirewall.pnlMayBecomeTruthDirectly,false);
  assert.equal(x.truthFirewall.learningMayMutatePrimarySilently,false);
  const s=biggjResearchSpineSummary(x);
  assert.equal(s.layers.length,11);
  assert.equal(s.layers.find(x=>x.id==='L5_STRATEGY_LAB').runtime.state,'READY');
});

test('research spine exposes weak layers instead of pretending missing systems are healthy',()=>{
  const h=healthyHealth();
  h.indicatorEvolution={healthy:false,featureFactory:{experiments:0}};
  h.biggjWorldModel={healthy:false,marketsObserved:0};
  const x=buildBiggjResearchSpine({health:h,portfolio:{},discovery:{},asOf:123456});
  assert.equal(x.layers.find(x=>x.id==='L2_FEATURES_INDICATORS').runtime.state,'COLLECTING');
  assert.equal(x.layers.find(x=>x.id==='L3_CONTEXT_REGIME_EVENT').runtime.state,'COLLECTING');
  assert.ok(x.summary.weakestLayers.includes('L2_FEATURES_INDICATORS'));
  assert.ok(x.summary.weakestLayers.includes('L3_CONTEXT_REGIME_EVENT'));
  assert.equal(x.execution,'SHADOW_ONLY');
});
