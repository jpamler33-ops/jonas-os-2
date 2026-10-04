import { sha256 } from './institutional-kernel.mjs';

export const BIGGJ_LAYER_BACKBONE_VERSION='BIGGJ_LAYER_BACKBONE_V1';

export const BIGGJ_LAYER_ORDER=Object.freeze([
  'REALITY',
  'EPISTEMIC_KERNEL',
  'MARKET_SCIENCE',
  'WORLD_MODEL',
  'LABORATORY',
  'DECISION_INTELLIGENCE',
  'TCX_RIFT_APPLICATION',
  'SHADOW_TRADING'
]);

const freeze=v=>{
  if(v&&typeof v==='object'&&!Object.isFrozen(v)){
    Object.freeze(v);
    for(const x of Object.values(v)) freeze(x);
  }
  return v;
};
const clone=v=>v==null?v:structuredClone(v);
const finite=(v,f=0)=>Number.isFinite(Number(v))?Number(v):f;
const pathGet=(obj,path)=>String(path||'').split('.').filter(Boolean).reduce((v,k)=>v==null?undefined:v[k],obj);
const meaningful=v=>{
  if(v==null)return false;
  if(Array.isArray(v))return v.length>0;
  if(typeof v==='object')return Object.keys(v).length>0;
  if(typeof v==='string')return v.length>0;
  return true;
};

export const BIGGJ_LAYER_BLUEPRINT=freeze([
  {
    level:1,id:'REALITY',role:'OBSERVE_EXTERNAL_REALITY',
    modules:[
      'market-data-provider.mjs','market-data-fabric.mjs','research-provider-fanout.mjs',
      'biggj-public-news-provider.mjs','news-research-adapter.mjs','biggj-official-intel-provider.mjs',
      'biggj-public-trader-watch.mjs','expansion-runtime/onchain-research-provider.mjs',
      'expansion-runtime/entity-flow-engine.mjs','expansion-runtime/memecoin-early-radar.mjs',
      'expansion-runtime/memecoin-social-attention.mjs','expansion-runtime/memecoin-security-provider.mjs'
    ],
    probes:['marketRadar','globalIntel','memecoinRadar','publicTraderWatch','researchDataPlane'],
    output:'POINT_IN_TIME_OBSERVATIONS'
  },
  {
    level:2,id:'EPISTEMIC_KERNEL',role:'VERIFY_WHAT_IS_KNOWN',
    modules:[
      'biggj-epistemic-kernel.mjs','biggj-epistemic-runtime.mjs','research-data-governance.mjs',
      'research-dependency-graph.mjs','research-trace.mjs','scientific-validity.mjs',
      'independent-witness-network.mjs','science-runtime/evidence-lineage-independence.mjs',
      'evidence-history.mjs','biggj-living-research-runtime.mjs'
    ],
    probes:['biggjEpistemicKernel','biggjLivingResearch','researchCoverage','researchDataGovernance','researchDependencyGraph'],
    output:'GOVERNED_EVIDENCE'
  },
  {
    level:3,id:'MARKET_SCIENCE',role:'EXPLAIN_MARKET_STATE_AND_MECHANISMS',
    modules:[
      'biggj-market-science-director.mjs','market-structure.mjs','mechanism-transition-engine.mjs',
      'research-intelligence-features.mjs','technical-indicator-feature-factory.mjs',
      'indicator-evolution-engine.mjs','shadow-regime-brain.mjs',
      'expansion-runtime/global-transmission-engine.mjs','expansion-runtime/narrative-reflexivity.mjs'
    ],
    probes:['biggjMarketScienceDirector','marketRadar','claimAssumptionResearch'],
    output:'STRUCTURED_MARKET_SCIENCE'
  },
  {
    level:4,id:'WORLD_MODEL',role:'CONNECT_MARKETS_MEMORY_AND_FORWARD_STATE',
    modules:[
      'biggj-world-model-runtime.mjs','world-model-foundation.mjs','episode-memory.mjs',
      'forecast-learning-center.mjs','forecast-runtime/forecast/intelligence_service.js',
      'forecast-runtime/forecast/regime_transition.js','forecast-thesis-revision-memory.mjs',
      'expansion-runtime/event-impact-memory.mjs','venue-quality-memory.mjs'
    ],
    probes:['biggjWorldModel','biggjWorldModelRuntime','forecastRuntime','forecastLearning','episodeMemory'],
    output:'POINT_IN_TIME_WORLD_STATE'
  },
  {
    level:5,id:'LABORATORY',role:'CHALLENGE_AND_COMPARE_IDEAS',
    modules:[
      'parallel-strategy-worlds.mjs','shadow-strategy-league.mjs','biggj-signal-lab.mjs',
      'forecast-shadow-competition.mjs','forecast-hypothesis-generator.mjs','forecast-experiment-governor.mjs',
      'learned-challenger-engine.mjs','adversarial-stress-lab.mjs','execution-research-lab.mjs',
      'autonomous-research-training-factory.mjs','biggj-research-validation-harness.mjs',
      'expansion-runtime/memecoin-evidence-factory.mjs','expansion-runtime/biggj-temporal-temple.mjs'
    ],
    probes:['autonomousResearchFactory','biggjSignalLab','shadowStrategyLeague','parallelStrategyWorlds','memecoinRadar.evidenceFactory','memecoinRadar.temporalTemple'],
    output:'VALIDATED_RESEARCH_CANDIDATES'
  },
  {
    level:6,id:'DECISION_INTELLIGENCE',role:'TURN_EVIDENCE_INTO_CALIBRATED_DECISIONS',
    modules:[
      'strategy-evidence-engine.mjs','memecoin-signal-controller.mjs','biggj-trading-policy.mjs',
      'portfolio-brain.mjs','portfolio-risk-brain.mjs','event-shadow-trade-gate.mjs',
      'institutional-admission.mjs','forecast-product.mjs','biggj-outcome-supervisor.mjs',
      'model-promotion-review-service.mjs'
    ],
    probes:['biggjProofFeed','portfolioBrain','portfolioRiskBrain','memecoinRadar.signalController','operationalReadiness'],
    output:'CALIBRATED_DECISION_INTENT'
  },
  {
    level:7,id:'TCX_RIFT_APPLICATION',role:'APPLY_DECISIONS_TO_TCX_RIFT_RESEARCH',
    modules:[
      'tcx-research-os.mjs','forecast-contract.mjs','institutional-forecast-runtime.mjs',
      'institutional-forecast-issuance.mjs','forecast-science-adapter.mjs','forecast-input-adapter.mjs',
      'shadow-training-supervisor.mjs','shadow-capital-academy.mjs','biggj-trading-academy.mjs',
      'trade-discovery-diagnostics.mjs'
    ],
    probes:['tcxResearchOs','forecastRuntime','shadowTrainingSupervisor','shadowCapitalAcademy','discovery'],
    output:'SHADOW_EXECUTION_PLAN'
  },
  {
    level:8,id:'SHADOW_TRADING',role:'EXECUTE_ONLY_IN_SIMULATION_AND_RETURN_OUTCOMES',
    modules:[
      'shadow-oms.mjs','shadow-portfolio-ledger.mjs','autonomous-shadow-trader.mjs',
      'shadow-specialist-wallets.mjs','shadow-wallet-research-manager.mjs','multi-venue-shadow-sor.mjs',
      'shadow-trade-quality-learner.mjs','memecoin-trade-learner.mjs','mandatory-shadow-discovery.mjs'
    ],
    probes:['shadowOms','specialistWallets','walletResearchManager','portfolio'],
    output:'OUTCOME_EVIDENCE_ONLY'
  }
]);

export const BIGGJ_LAYER_EDGES=freeze([
  {from:'REALITY',to:'EPISTEMIC_KERNEL',channel:'RAW_OBSERVATIONS',authority:'DATA_ONLY'},
  {from:'EPISTEMIC_KERNEL',to:'MARKET_SCIENCE',channel:'GOVERNED_EVIDENCE',authority:'EVIDENCE_GATE'},
  {from:'MARKET_SCIENCE',to:'WORLD_MODEL',channel:'MARKET_STATE_AND_MECHANISMS',authority:'RESEARCH_ONLY'},
  {from:'WORLD_MODEL',to:'LABORATORY',channel:'POINT_IN_TIME_WORLD_STATE',authority:'RESEARCH_ONLY'},
  {from:'LABORATORY',to:'DECISION_INTELLIGENCE',channel:'VALIDATED_CANDIDATES',authority:'PROPOSAL_ONLY'},
  {from:'DECISION_INTELLIGENCE',to:'TCX_RIFT_APPLICATION',channel:'CALIBRATED_DECISION_INTENT',authority:'DECISION_ONLY'},
  {from:'TCX_RIFT_APPLICATION',to:'SHADOW_TRADING',channel:'SHADOW_EXECUTION_PLAN',authority:'SHADOW_ONLY'},
  {from:'SHADOW_TRADING',to:'EPISTEMIC_KERNEL',channel:'OUTCOME_EVIDENCE',authority:'EVIDENCE_ONLY',feedback:true},
  {from:'SHADOW_TRADING',to:'LABORATORY',channel:'PERFORMANCE_EVIDENCE',authority:'EVIDENCE_ONLY',feedback:true},
  {from:'LABORATORY',to:'MARKET_SCIENCE',channel:'RESEARCH_FINDINGS',authority:'PROPOSAL_ONLY',feedback:true}
]);

export const BIGGJ_LAYER_FORBIDDEN_EDGES=freeze([
  'SHADOW_TRADING->MARKET_SCIENCE:TRUTH',
  'SHADOW_TRADING->WORLD_MODEL:PRIMARY_MUTATION',
  'PNL->EPISTEMIC_KERNEL:PROMOTION',
  'LABORATORY->SHADOW_TRADING:LIVE_EXECUTION',
  'UI->DECISION_INTELLIGENCE:AUTHORITY',
  'ANY->LIVE_EXECUTION'
]);

function probeLayer(blueprint,context){
  const probes=blueprint.probes.map(path=>{
    const value=pathGet(context,path);
    return {path,present:meaningful(value)};
  });
  const present=probes.filter(x=>x.present).length;
  const coverage=probes.length?present/probes.length:1;
  return {
    level:blueprint.level,
    id:blueprint.id,
    role:blueprint.role,
    modules:clone(blueprint.modules),
    probes,
    moduleCount:blueprint.modules.length,
    probeCoverage:coverage,
    localState:coverage>=.6?'READY':coverage>0?'PARTIAL':'WAITING',
    output:blueprint.output
  };
}

export function buildBiggjLayerBackbone({
  health={},
  portfolio={},
  discovery={},
  asOf=Date.now()
}={}){
  const t=finite(asOf,NaN);
  if(!Number.isFinite(t))throw new Error('BIGGJ_LAYER_BACKBONE_ASOF_INVALID');
  const context={...health,portfolio,discovery};
  const layers=BIGGJ_LAYER_BLUEPRINT.map(x=>probeLayer(x,context));
  const byId=Object.fromEntries(layers.map(x=>[x.id,x]));
  const edges=BIGGJ_LAYER_EDGES.map(edge=>{
    const from=byId[edge.from],to=byId[edge.to];
    const sourceReady=from?.localState!=='WAITING';
    const targetPresent=to?.localState!=='WAITING';
    return {
      ...edge,
      sourceReady,
      targetPresent,
      state:sourceReady&&targetPresent?'FLOWING':sourceReady?'TARGET_WAITING':'SOURCE_WAITING'
    };
  });
  const canonicalEdges=edges.filter(x=>!x.feedback);
  const feedbackEdges=edges.filter(x=>x.feedback);
  const bottlenecks=[];
  for(let i=0;i<layers.length;i++){
    const layer=layers[i];
    const upstream=i===0?null:layers[i-1];
    if(layer.localState==='WAITING'){
      bottlenecks.push({layer:layer.id,type:'LAYER_WAITING',reason:'NO_RUNTIME_PROBES_PRESENT'});
    }else if(upstream&&upstream.localState==='WAITING'){
      bottlenecks.push({layer:layer.id,type:'UPSTREAM_MISSING',upstream:upstream.id,reason:'LAYER_HAS_LOCAL_STATE_WITHOUT_CANONICAL_UPSTREAM'});
    }else if(layer.localState==='PARTIAL'){
      bottlenecks.push({layer:layer.id,type:'PARTIAL_COVERAGE',coverage:layer.probeCoverage});
    }
  }
  const readyLayers=layers.filter(x=>x.localState==='READY').length;
  const activeLayers=layers.filter(x=>x.localState!=='WAITING').length;
  const core={
    version:BIGGJ_LAYER_BACKBONE_VERSION,
    asOf:t,
    architecture:{
      layerOrder:clone(BIGGJ_LAYER_ORDER),
      canonicalFlow:BIGGJ_LAYER_ORDER.join(' -> '),
      totalLayers:layers.length,
      readyLayers,
      activeLayers,
      wiringCoverage:layers.length?layers.reduce((s,x)=>s+x.probeCoverage,0)/layers.length:0
    },
    layers,
    edges,
    canonicalEdges,
    feedbackEdges,
    bottlenecks,
    feedbackPolicy:{
      shadowOutcomesReturnAsEvidenceOnly:true,
      pnlCannotPromoteTheory:true,
      laboratoryFindingsRequireEpistemicValidation:true,
      downstreamApplicationsCannotRewriteUpstreamTruth:true
    },
    safety:{
      execution:'SHADOW_ONLY',
      canExecute:false,
      canExecuteLive:false,
      automaticPrimaryMutation:false,
      automaticTheoryPromotion:false
    },
    semantics:{
      purpose:'ONE_BACKBONE_CONNECTING_EXISTING_BIGGJ_SUBSYSTEMS_WITH_EXPLICIT_LAYER_CONTRACTS',
      noDuplicateScoringEngine:true,
      noParallelTruthSystem:true,
      layersAreAuthorityBoundaries:true,
      feedbackIsEvidenceNotAuthority:true
    }
  };
  const fingerprint=sha256(core);
  return freeze({...core,fingerprint});
}

export function verifyBiggjLayerBackbone(value){
  const reasons=[];
  if(value?.version!==BIGGJ_LAYER_BACKBONE_VERSION)reasons.push('VERSION_INVALID');
  const order=(value?.architecture?.layerOrder||[]).join('|');
  if(order!==BIGGJ_LAYER_ORDER.join('|'))reasons.push('LAYER_ORDER_INVALID');
  if(value?.layers?.length!==BIGGJ_LAYER_ORDER.length)reasons.push('LAYER_COUNT_INVALID');
  if(value?.safety?.execution!=='SHADOW_ONLY'||value?.safety?.canExecute!==false||value?.safety?.canExecuteLive!==false)reasons.push('EXECUTION_SAFETY_INVALID');
  if(value?.feedbackPolicy?.pnlCannotPromoteTheory!==true)reasons.push('PNL_FIREWALL_MISSING');
  if(value?.feedbackPolicy?.shadowOutcomesReturnAsEvidenceOnly!==true)reasons.push('OUTCOME_EVIDENCE_FIREWALL_MISSING');
  for(const edge of value?.edges||[]){
    if(edge.authority==='LIVE_EXECUTION')reasons.push('LIVE_EXECUTION_EDGE_FORBIDDEN');
    if(edge.feedback&&edge.authority!=='EVIDENCE_ONLY'&&edge.authority!=='PROPOSAL_ONLY')reasons.push('FEEDBACK_AUTHORITY_INVALID:'+edge.from+'->'+edge.to);
  }
  const {fingerprint,...core}=value||{};
  if(fingerprint!==sha256(core))reasons.push('FINGERPRINT_MISMATCH');
  return {ok:reasons.length===0,reasons};
}

export function biggjLayerBackboneSummary(value){
  const check=verifyBiggjLayerBackbone(value);
  if(!check.ok)throw new Error('BIGGJ_LAYER_BACKBONE_INVALID:'+check.reasons.join(','));
  return freeze({
    version:value.version,
    asOf:value.asOf,
    architecture:clone(value.architecture),
    layers:value.layers.map(x=>({
      level:x.level,id:x.id,role:x.role,moduleCount:x.moduleCount,
      probeCoverage:x.probeCoverage,localState:x.localState,output:x.output,
      probes:clone(x.probes)
    })),
    edges:clone(value.edges),
    bottlenecks:clone(value.bottlenecks),
    feedbackPolicy:clone(value.feedbackPolicy),
    safety:clone(value.safety),
    semantics:clone(value.semantics),
    fingerprint:value.fingerprint
  });
}
