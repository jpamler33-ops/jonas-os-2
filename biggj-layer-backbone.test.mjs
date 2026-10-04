import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BIGGJ_LAYER_BACKBONE_VERSION,
  BIGGJ_LAYER_ORDER,
  BIGGJ_LAYER_BLUEPRINT,
  BIGGJ_LAYER_EDGES,
  buildBiggjLayerBackbone,
  verifyBiggjLayerBackbone
} from './biggj-layer-backbone.mjs';

test('layer backbone preserves the canonical eight-level architecture',()=>{
  const x=buildBiggjLayerBackbone({
    health:{
      marketRadar:{rows:[{symbol:'BTCUSDT'}]},
      globalIntel:{recent:[{}]},
      memecoinRadar:{signalController:{counts:{BUY:0}},evidenceFactory:{independentCases:1},temporalTemple:{independentCases:1}},
      researchDataPlane:{rows:1},
      biggjEpistemicKernel:{version:'E1'},
      biggjLivingResearch:{version:'L1'},
      researchCoverage:{coverage:1},
      researchDataGovernance:{version:'G1'},
      researchDependencyGraph:{version:'D1'},
      biggjMarketScienceDirector:{version:'S1'},
      claimAssumptionResearch:{version:'C1'},
      biggjWorldModel:{version:'W1'},
      biggjWorldModelRuntime:{version:'W1'},
      forecastRuntime:{version:'F1'},
      forecastLearning:{version:'FL1'},
      episodeMemory:{version:'M1'},
      autonomousResearchFactory:{version:'A1'},
      biggjSignalLab:{version:'SL1'},
      shadowStrategyLeague:{version:'LEAGUE1'},
      parallelStrategyWorlds:{version:'P1'},
      biggjProofFeed:{version:'PF1'},
      portfolioBrain:{version:'PB1'},
      portfolioRiskBrain:{version:'PR1'},
      operationalReadiness:{ready:true},
      tcxResearchOs:{version:'T1'},
      shadowTrainingSupervisor:{version:'ST1'},
      shadowCapitalAcademy:{version:'CA1'},
      shadowOms:{healthy:true},
      specialistWallets:{wallets:{}},
      walletResearchManager:{version:'WR1'}
    },
    portfolio:{openPositions:2},
    discovery:{checkedCoins:4},
    asOf:1234
  });
  assert.equal(x.version,BIGGJ_LAYER_BACKBONE_VERSION);
  assert.deepEqual(x.architecture.layerOrder,[...BIGGJ_LAYER_ORDER]);
  assert.equal(x.layers.length,8);
  assert.equal(x.layers.every(v=>v.localState==='READY'),true);
  assert.equal(x.canonicalEdges.length,7);
  assert.equal(x.feedbackEdges.length,3);
  assert.equal(x.safety.execution,'SHADOW_ONLY');
  assert.equal(x.safety.canExecuteLive,false);
  assert.equal(verifyBiggjLayerBackbone(x).ok,true);
});

test('shadow outcomes can only feed upstream as evidence or proposals',()=>{
  const x=buildBiggjLayerBackbone({asOf:1});
  const feedback=x.edges.filter(e=>e.feedback);
  assert.equal(feedback.length,3);
  for(const e of feedback){
    assert.ok(['EVIDENCE_ONLY','PROPOSAL_ONLY'].includes(e.authority));
  }
  assert.equal(x.feedbackPolicy.pnlCannotPromoteTheory,true);
  assert.equal(x.feedbackPolicy.shadowOutcomesReturnAsEvidenceOnly,true);
});

test('partial or missing layers become explicit bottlenecks instead of fake readiness',()=>{
  const x=buildBiggjLayerBackbone({
    health:{
      marketRadar:{rows:[{}]},
      biggjEpistemicKernel:{version:'E1'},
      shadowOms:{healthy:true}
    },
    asOf:2
  });
  assert.equal(x.layers.find(v=>v.id==='REALITY').localState,'PARTIAL');
  assert.equal(x.layers.find(v=>v.id==='WORLD_MODEL').localState,'WAITING');
  assert.ok(x.bottlenecks.some(v=>v.layer==='WORLD_MODEL'&&v.type==='LAYER_WAITING'));
  assert.ok(x.bottlenecks.some(v=>v.layer==='SHADOW_TRADING'));
  assert.equal(verifyBiggjLayerBackbone(x).ok,true);
});

test('blueprint actually assigns existing subsystems to every layer',()=>{
  assert.equal(BIGGJ_LAYER_BLUEPRINT.length,8);
  for(const layer of BIGGJ_LAYER_BLUEPRINT){
    assert.ok(layer.modules.length>=5,layer.id+' must contain real modules');
    assert.ok(layer.probes.length>=3,layer.id+' must contain runtime probes');
  }
  assert.equal(BIGGJ_LAYER_EDGES.filter(x=>!x.feedback).length,7);
  assert.equal(BIGGJ_LAYER_EDGES.some(x=>x.from==='SHADOW_TRADING'&&x.to==='EPISTEMIC_KERNEL'&&x.authority==='EVIDENCE_ONLY'),true);
});
