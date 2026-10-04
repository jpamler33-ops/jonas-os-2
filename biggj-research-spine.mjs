import { sha256 } from './institutional-kernel.mjs';

export const BIGGJ_RESEARCH_SPINE_VERSION='BIGGJ_RESEARCH_SPINE_V1';

const freeze=v=>{if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.freeze(v);for(const x of Object.values(v))freeze(x);}return v;};
const arr=v=>Array.isArray(v)?v:[];
const num=(v,f=0)=>Number.isFinite(Number(v))?Number(v):f;

export const BIGGJ_RESEARCH_SPINE_LAYERS=freeze([
  {id:'L0_REALITY',label:'Reality / Raw Data',canonicalLayer:'REALITY',modules:['market-data-fabric.mjs','market-data-provider.mjs','research-provider-fanout.mjs','biggj-public-news-provider.mjs','expansion-runtime/onchain-research-provider.mjs','expansion-runtime/memecoin-early-radar.mjs','biggj-public-trader-watch-provider.mjs'],purpose:'Point-in-time observations only.'},
  {id:'L1_TRUTH_EVIDENCE',label:'Truth / Evidence',canonicalLayer:'EPISTEMIC_KERNEL',modules:['research-data-plane.mjs','research-data-governance.mjs','research-dependency-graph.mjs','science-runtime/evidence-lineage-independence.mjs','evidence-history.mjs','institutional-kernel.mjs','biggj-epistemic-runtime.mjs'],purpose:'Provenance, independence, audit, uncertainty and contradiction.'},
  {id:'L2_FEATURES_INDICATORS',label:'Features / Indicators',canonicalLayer:'MARKET_SCIENCE',modules:['technical-indicator-feature-factory.mjs','indicator-evolution-engine.mjs','research-intelligence-features.mjs','market-structure.mjs','structure-event-radar.mjs','liquidation-confluence-view.mjs','flow-radar-view.mjs'],purpose:'Transform observations into measurable features without decision authority.'},
  {id:'L3_CONTEXT_REGIME_EVENT',label:'Context / Regime / Events',canonicalLayer:'WORLD_MODEL',modules:['biggj-world-model-runtime.mjs','shadow-regime-brain.mjs','expansion-runtime/global-event-radar.mjs','expansion-runtime/event-impact-memory.mjs','expansion-runtime/historical-event-reaction-learning.mjs','world-model-foundation.mjs','trend-phase-forecast.mjs'],purpose:'Market state, time/season context, events and recurring conditions.'},
  {id:'L4_OPPORTUNITY_MAP',label:'Opportunity Map',canonicalLayer:'WORLD_MODEL',modules:['biggj-discovery-ledger.mjs','mandatory-shadow-discovery.mjs','opportunity-allocator.mjs','trade-discovery-diagnostics.mjs','shadow-coverage-curriculum.mjs','memecoin-signal-controller.mjs','shadow-specialist-wallets.mjs'],purpose:'Enumerate opportunities and attach context; no live orders.'},
  {id:'L5_STRATEGY_LAB',label:'Strategy / Scenario Lab',canonicalLayer:'LABORATORY',modules:['shadow-strategy-league.mjs','parallel-strategy-worlds.mjs','learned-challenger-engine.mjs','shadow-wallet-research-manager.mjs','forecast-shadow-competition.mjs','forecast-feature-research.mjs','indicator-evolution-engine.mjs'],purpose:'Parallel strategy, indicator, sizing and holding experiments.'},
  {id:'L6_EVIDENCE_VALIDATION',label:'Evidence / Validation',canonicalLayer:'LABORATORY',modules:['strategy-evidence-engine.mjs','strategy-edge-decay.mjs','biggj-research-validation-harness.mjs','forecast-candidate-lab.mjs','science-runtime/sequential-evidence.mjs','evidence-promotion-gate.mjs','biggj-historical-proposal-research-gate.mjs'],purpose:'Chronological/OOS validation, counterexamples, robustness and edge decay.'},
  {id:'L7_DECISION_CAPITAL_RISK',label:'Decision / Capital / Risk',canonicalLayer:'DECISION_INTELLIGENCE',modules:['portfolio-brain.mjs','portfolio-risk-brain.mjs','shadow-leverage-risk.mjs','shadow-capital-academy.mjs','shadow-training-supervisor.mjs','multi-venue-shadow-sor.mjs','event-shadow-trade-gate.mjs'],purpose:'Shadow capital/risk decisions after evidence gates.'},
  {id:'L8_SHADOW_EXECUTION',label:'Shadow Execution',canonicalLayer:'SHADOW_TRADING',modules:['shadow-oms.mjs','shadow-portfolio-ledger.mjs','shadow-specialist-wallets.mjs','shadow-strategy-league.mjs','venue-quality-memory.mjs','execution-research-lab.mjs'],purpose:'Fees, slippage, fills and lifecycle simulation only.'},
  {id:'L9_LEARNING_MEMORY',label:'Learning / Memory',canonicalLayer:'MARKET_SCIENCE',modules:['episode-memory.mjs','setup-performance-memory.mjs','shadow-trade-quality-learner.mjs','forecast-learning-center.mjs','indicator-evolution-engine.mjs','expansion-runtime/historical-event-reaction-learning.mjs','memecoin-trade-learner.mjs'],purpose:'Outcomes return as evidence to challengers, never truth by PnL.'},
  {id:'L10_OPERATOR_SURFACE',label:'Operator / UI',canonicalLayer:'SHADOW_TRADING',modules:['mission-control.mjs','biggj-mobile-webapp.mjs','discord-telegram-bridge.mjs','telegram-product-ui.mjs','biggj-discord-market-science.mjs'],purpose:'Read-only observability plus explicit user feedback.'}
]);

export const BIGGJ_RESEARCH_SPINE_EDGES=freeze([
  ['L0_REALITY','L1_TRUTH_EVIDENCE','OBSERVATIONS'],
  ['L1_TRUTH_EVIDENCE','L2_FEATURES_INDICATORS','VERIFIED_INPUTS'],
  ['L1_TRUTH_EVIDENCE','L3_CONTEXT_REGIME_EVENT','EVIDENCE'],
  ['L2_FEATURES_INDICATORS','L3_CONTEXT_REGIME_EVENT','FEATURES'],
  ['L2_FEATURES_INDICATORS','L4_OPPORTUNITY_MAP','SIGNALS_AS_FEATURES'],
  ['L3_CONTEXT_REGIME_EVENT','L4_OPPORTUNITY_MAP','CONTEXT'],
  ['L4_OPPORTUNITY_MAP','L5_STRATEGY_LAB','OPPORTUNITIES'],
  ['L2_FEATURES_INDICATORS','L5_STRATEGY_LAB','INDICATOR_CANDIDATES'],
  ['L3_CONTEXT_REGIME_EVENT','L5_STRATEGY_LAB','REGIME_CONDITIONING'],
  ['L5_STRATEGY_LAB','L6_EVIDENCE_VALIDATION','EXPERIMENT_OUTCOMES'],
  ['L1_TRUTH_EVIDENCE','L6_EVIDENCE_VALIDATION','VALIDATION_EVIDENCE'],
  ['L6_EVIDENCE_VALIDATION','L7_DECISION_CAPITAL_RISK','QUALIFIED_STRATEGIES'],
  ['L4_OPPORTUNITY_MAP','L7_DECISION_CAPITAL_RISK','CURRENT_OPPORTUNITIES'],
  ['L7_DECISION_CAPITAL_RISK','L8_SHADOW_EXECUTION','SHADOW_BUDGETS'],
  ['L8_SHADOW_EXECUTION','L9_LEARNING_MEMORY','OUTCOMES_AS_EVIDENCE'],
  ['L9_LEARNING_MEMORY','L5_STRATEGY_LAB','CHALLENGER_FEEDBACK_ONLY'],
  ['L9_LEARNING_MEMORY','L6_EVIDENCE_VALIDATION','NEW_EVIDENCE'],
  ['L10_OPERATOR_SURFACE','L9_LEARNING_MEMORY','EXPLICIT_USER_FEEDBACK']
]);

const FORBIDDEN=freeze([
  ['L8_SHADOW_EXECUTION','L1_TRUTH_EVIDENCE','PNL_AS_TRUTH'],
  ['L8_SHADOW_EXECUTION','L6_EVIDENCE_VALIDATION','AUTO_PROMOTION'],
  ['L9_LEARNING_MEMORY','L7_DECISION_CAPITAL_RISK','SILENT_PRIMARY_MUTATION'],
  ['L10_OPERATOR_SURFACE','L7_DECISION_CAPITAL_RISK','UNAUDITED_LIVE_OVERRIDE']
]);

function runtimeFor(id,h,portfolio,discovery){
  const checks=[];
  if(id==='L0_REALITY'){checks.push(['marketFabric',h?.marketDataFabric?.healthy===true],['marketRadar',arr(h?.marketRadar?.rows).length>0],['news',h?.globalIntel?.sourceReady===true],['memecoin',h?.memecoinRadar?.sourceReady===true]);}
  else if(id==='L1_TRUTH_EVIDENCE'){checks.push(['audit',h?.institutionalKernel?.ledgerHealthy===true],['epistemic',h?.biggjEpistemicKernel?.healthy===true],['evidenceHistory',h?.evidenceHistory?.healthy===true],['rulebook',h?.biggjRulebook?.healthy!==false]);}
  else if(id==='L2_FEATURES_INDICATORS'){checks.push(['indicatorEvolution',h?.indicatorEvolution?.healthy===true],['catalog',num(h?.indicatorEvolution?.featureFactory?.experiments)>0]);}
  else if(id==='L3_CONTEXT_REGIME_EVENT'){checks.push(['worldModel',h?.biggjWorldModel?.healthy===true],['worldMarkets',num(h?.biggjWorldModel?.marketsObserved)>0],['events',arr(h?.globalIntel?.recent).length>0]);}
  else if(id==='L4_OPPORTUNITY_MAP'){checks.push(['discoveryLedger',h?.discoveryLedger?.healthy===true],['discoveryRuntime',Boolean(discovery)],['specialists',h?.specialistWallets?.healthy===true]);}
  else if(id==='L5_STRATEGY_LAB'){checks.push(['parallelWorlds',h?.parallelStrategyWorlds?.healthy===true],['strategyLeague',Boolean(h?.strategyLeagueSummary)],['walletResearch',h?.walletResearchManager?.healthy!==false]);}
  else if(id==='L6_EVIDENCE_VALIDATION'){checks.push(['researchFactory',h?.autonomousResearchFactory?.healthy===true],['proofFeed',Boolean(h?.biggjProofFeed)],['claimAssumptions',Boolean(h?.claimAssumptionResearch)]);}
  else if(id==='L7_DECISION_CAPITAL_RISK'){checks.push(['portfolio',Boolean(portfolio)],['training',Boolean(h?.walletResearchManager)],['safety',Boolean(h?.operationalReadiness)]);}
  else if(id==='L8_SHADOW_EXECUTION'){checks.push(['shadowOms',h?.shadowOms?.healthy===true],['portfolio',Boolean(portfolio)],['specialists',h?.specialistWallets?.healthy===true]);}
  else if(id==='L9_LEARNING_MEMORY'){checks.push(['episodeMemory',h?.episodeMemory?.healthy===true],['evidenceHistory',h?.evidenceHistory?.healthy===true],['indicatorEvolution',h?.indicatorEvolution?.healthy===true]);}
  else if(id==='L10_OPERATOR_SURFACE'){checks.push(['telegram',!h?.telegramPolling?.lastPollError],['discord',h?.discordBridge?.enabled===true?h?.discordBridge?.ready!==false:true]);}
  const passed=checks.filter(([,ok])=>ok===true).length,total=checks.length,ratio=total?passed/total:0;
  return {state:ratio===1?'READY':ratio>=.5?'DEGRADED':'COLLECTING',readinessRatio:ratio,checks:checks.map(([name,ok])=>({name,ok:ok===true}))};
}

export function verifyBiggjResearchSpine(){
  const ids=new Set(BIGGJ_RESEARCH_SPINE_LAYERS.map(x=>x.id)),reasons=[];
  for(const [from,to] of BIGGJ_RESEARCH_SPINE_EDGES)if(!ids.has(from)||!ids.has(to))reasons.push('UNKNOWN_EDGE:'+from+'>'+to);
  for(const [from,to,relation] of FORBIDDEN)if(BIGGJ_RESEARCH_SPINE_EDGES.some(x=>x[0]===from&&x[1]===to&&x[2]===relation))reasons.push('FORBIDDEN_EDGE_PRESENT:'+from+'>'+to+':'+relation);
  const refs=BIGGJ_RESEARCH_SPINE_LAYERS.flatMap(x=>x.modules);
  return freeze({ok:reasons.length===0,reasons,layerCount:BIGGJ_RESEARCH_SPINE_LAYERS.length,moduleReferences:refs.length,uniqueModuleReferences:new Set(refs).size,execution:'SHADOW_ONLY',canExecuteLive:false});
}

export function buildBiggjResearchSpine({health={},portfolio=null,discovery=null,asOf=Date.now()}={}){
  const check=verifyBiggjResearchSpine();if(!check.ok)throw new Error('BIGGJ_RESEARCH_SPINE_INVALID:'+check.reasons.join(','));
  const layers=BIGGJ_RESEARCH_SPINE_LAYERS.map(layer=>({...layer,runtime:runtimeFor(layer.id,health,portfolio,discovery),inputs:BIGGJ_RESEARCH_SPINE_EDGES.filter(x=>x[1]===layer.id).map(([from,,relation])=>({from,relation})),outputs:BIGGJ_RESEARCH_SPINE_EDGES.filter(x=>x[0]===layer.id).map(([,to,relation])=>({to,relation}))}));
  const core={version:BIGGJ_RESEARCH_SPINE_VERSION,asOf:Number(asOf),architecture:'LAYERED_RESEARCH_SPINE_OVER_EXISTING_BIGGJ_MODULES',layers,edges:BIGGJ_RESEARCH_SPINE_EDGES.map(([from,to,relation])=>({from,to,relation})),forbiddenEdges:FORBIDDEN.map(([from,to,relation])=>({from,to,relation})),summary:{layers:layers.length,ready:layers.filter(x=>x.runtime.state==='READY').length,degraded:layers.filter(x=>x.runtime.state==='DEGRADED').length,collecting:layers.filter(x=>x.runtime.state==='COLLECTING').length,uniqueModuleReferences:check.uniqueModuleReferences,weakestLayers:layers.filter(x=>x.runtime.state!=='READY').map(x=>x.id)},researchLoop:'REALITY -> EVIDENCE -> FEATURES -> CONTEXT -> OPPORTUNITY -> STRATEGY_LAB -> VALIDATION -> CAPITAL_RISK -> SHADOW_EXECUTION -> LEARNING -> STRATEGY_LAB',truthFirewall:{pnlMayReturnAsEvidence:true,pnlMayBecomeTruthDirectly:false,learningMayCreateChallengers:true,learningMayMutatePrimarySilently:false},execution:'SHADOW_ONLY',action:'ABSTAIN',canExecute:false,canExecuteLive:false};
  return freeze({...core,fingerprint:sha256(core)});
}

export function biggjResearchSpineSummary(spine){
  if(spine?.version!==BIGGJ_RESEARCH_SPINE_VERSION)throw new Error('BIGGJ_RESEARCH_SPINE_VERSION_INVALID');
  return freeze({version:spine.version,asOf:spine.asOf,architecture:spine.architecture,summary:spine.summary,researchLoop:spine.researchLoop,truthFirewall:spine.truthFirewall,layers:spine.layers.map(x=>({id:x.id,label:x.label,canonicalLayer:x.canonicalLayer,purpose:x.purpose,runtime:x.runtime,inputs:x.inputs,outputs:x.outputs,moduleCount:x.modules.length,modules:x.modules})),execution:spine.execution,action:spine.action,canExecute:spine.canExecute,canExecuteLive:spine.canExecuteLive,fingerprint:spine.fingerprint});
}
