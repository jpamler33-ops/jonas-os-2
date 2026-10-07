import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { missionControlSnapshot, renderMissionControlHtml, MISSION_CONTROL_VERSION } from './mission-control.mjs';
import { renderBiggjMobileApp } from './biggj-mobile-webapp.mjs';

test('market science mission control remains explicitly shadow only',()=>{
  const s=missionControlSnapshot({health:{ok:true}});
  assert.equal(MISSION_CONTROL_VERSION,'BIGGJ_MARKET_SCIENCE_CONTROL_V2');
  assert.equal(s.canExecuteLive,false);
  assert.equal(s.execution,'SHADOW_ONLY');
  assert.equal(s.appVersion,'BIGGJ_USER_COMMAND_CENTER_V21_W6_ENTRY_FUNNEL');
  const html=renderMissionControlHtml(s);
  assert.match(html,/SHADOW_ONLY/);
  assert.match(html,/BIGGJ/);
});

test('embedded state cannot inject a script tag',()=>{
  const html=renderBiggjMobileApp(missionControlSnapshot({health:{x:'<script>'}}));
  assert.ok(!html.includes('"x":"<script>"'));
  assert.match(html,/"x":"\\u003cscript\\u003e"/);
});

test('mobile control plane exposes the curated user command center',()=>{
  const s=missionControlSnapshot({
    health:{
      autonomousOperator:{mode:'HANDS_OFF',operatorNeeded:false,automationCoverage:1},
      autonomousResearchFactory:{mode:'DATA_COLLECTION_ONLY'},
      biggjLivingResearch:{researchRequired:2,activeAgendaItems:3,topResearchBottlenecks:[],researchProtocols:{total:1},researchReviews:{open:0}},
      researchCoverage:{averageCoverage:.75,blocked:0},
      biggjObservability:{maturityIndex:.6,trustedSkills:2,evidence:{evidenceTotal:40,validationIndependentEpisodes:8},revisions:[],knowledge:[{skillId:'s1',title:'Structure',status:'VALIDATED',uncertainty:.2}],researchQueue:[{skillId:'s2',title:'Liquidity',nextGate:'FORWARD_SHADOW',priority:.7,uncertainty:.4}],learningTimeline:{last24h:{total:3},last7d:{total:10},events:[]}},
      experienceNeeds:[{priority:2,label:'Mehr Live Data',detail:'coverage gap'}],marketRadar:{rows:[{symbol:'BTCUSDT',status:'VALID',regime:'TREND',witnessAgreement:.8,support:8,score:.7}]},globalIntel:{eventCount:0,recent:[]},traderWatch:{sourceReady:false,nextNeed:'PIT public performance source'}
    },portfolio:{equityQuote:1000,openPositions:0,closedTrades:0,netPnlQuote:0,positions:[],recentClosed:[]}
  });
  const html=renderBiggjMobileApp(s);
  for(const x of ['data-tab="today"','data-tab="markets"','data-tab="progress"','data-tab="trading"','data-tab="meme"','LIVE TICKER','BIGGJ DISCOVERY JOURNAL','Security Outcome Lab'])assert.match(html,new RegExp(x));
  for(const hidden of ['data-tab="science"','data-tab="world"','data-tab="lab"','data-tab="decisions"','data-tab="system"'])assert.doesNotMatch(html,new RegExp(hidden));
  assert.match(html,/app\.webmanifest/);assert.match(html,/serviceWorker/);assert.match(html,/SHADOW_ONLY/);
});

test('mission control trading view separates primary performance from research activity and shows discovery blockers',()=>{
  const s=missionControlSnapshot({
    health:{},
    portfolio:{
      equityQuote:10000,netPnlQuote:0,openPositions:0,closedTrades:0,positions:[],
      researchActivity:{openPositions:1,closedTrades:2,wins:1,losses:1,winRate:.5,netPnlQuote:3.5,byMode:{COVERAGE_PROBE:{open:1,closed:2,realizedPnlQuote:3.5}},active:[{symbol:'BTCUSDT',side:'LONG',entryMode:'COVERAGE_PROBE',entryPrice:60000,horizonId:'15m'}],recentClosed:[]}
    },
    discovery:{checkedCoins:6,forecastAvailable:6,admittedForecasts:0,totalCalibratedHorizons:0,totalHorizons:18,standardCandidates:0,explorationCandidates:0,standardTrades:0,explorationTrades:0,coverageProbes:1,topBlockers:[{reason:'NO_CALIBRATED_HORIZONS',count:6,text:'Noch fehlen genügend aufgelöste Ergebnisse zur Horizont-Kalibrierung'}],nextStep:'Forward outcomes sammeln',runtime:{omsStatus:'READY',omsFilled:1,academyStage:'LEARNING',academyCoreAllowed:false,trainingHold:false,openDiscoveryPositions:1,discoveryOpenCap:3}}
  });
  const html=renderMissionControlHtml(s);
  for(const text of ['PRIMARY +','Research Trading','Discovery Pipeline','Aktueller Blocker','Runtime Gates','NO_CALIBRATED_HORIZONS','COVERAGE_PROBE','SHADOW_ONLY']) assert.match(html,new RegExp(text));
  assert.match(html,/performanceExcluded|nicht in Primary-PnL/);
  assert.match(html,/canExecuteLive:false/);
});

test('mission snapshot feeds only primary positions into primary Discord trade streams',()=>{
  const source=readFileSync(new URL('./bot.mjs',import.meta.url),'utf8');
  assert.ok(source.includes("const researchShadowModes=new Set(['CHALLENGER','ABSTAIN_PROBE','COVERAGE_PROBE','EXPLORATION'])"));
  assert.ok(source.includes("const primaryShadowPositions=allShadowPositions.filter"));
  assert.ok(source.includes("const openPositions=primaryShadowPositions.filter"));
  assert.ok(source.includes("const recentClosed=primaryShadowPositions.filter"));
  assert.ok(source.includes("TCX_COVERAGE_CURRICULUM_NOTIONAL || 5"));
  assert.ok(source.includes("TCX_MANDATORY_SHADOW_DISCOVERY_NOTIONAL || 25"));
  assert.ok(source.includes("TCX_AUTO_SHADOW_NOTIONAL_QUOTE || 200"));
});

test('mission-control snapshot source exposes canonical memecoin signal controller for Discord and webapp',()=>{
  const source=readFileSync(new URL('./bot.mjs',import.meta.url),'utf8');
  assert.ok(source.includes("signalController:memecoinEarlySnapshot?.signalController"));
  assert.ok(source.includes("version:MEMECOIN_SIGNAL_CONTROLLER_VERSION"));
  assert.ok(source.includes("entryAuthority:'BUY_REQUIRED_WHEN_ENFORCED'"));
  assert.ok(source.includes("enforcedForWallet4:true"));
  assert.ok(source.includes("canExecuteLive:false"));
});


test('mission-control snapshot exposes isolated user 99k-in-60s strategy for Discord and webapp',()=>{
  const source=readFileSync(new URL('./bot.mjs',import.meta.url),'utf8');
  assert.ok(source.includes("user99k60s:memecoinEarlySnapshot?.user99k60s"));
  assert.ok(source.includes("version:USER_99K_60S_STRATEGY_VERSION"));
  assert.ok(source.includes("sizingScenariosSol:[2,5,10,20,40,60,80]"));
  assert.ok(source.includes("WALLET_6_USER_99K_60S"));
  assert.ok(source.includes("canExecuteLive:false"));
});


test('W6 runtime follows the exact GMGN 1m +99k% rule and does not use market cap as the threshold',()=>{
  const source=readFileSync(new URL('./bot.mjs',import.meta.url),'utf8');
  assert.ok(source.includes("minMarketCapUsd:null"));
  assert.ok(source.includes('minGreenChangePct:99_000'));
  assert.ok(source.includes('requireExactGmgnGreen:true'));
  assert.ok(source.includes('FIRST_OBSERVED_EXACT_GMGN_1M_PERCENT_GTE_99K_NOT_EXACT_HISTORICAL_CROSSING_TIME'));
  assert.ok(source.includes('effectiveMinMarketCapUsd:null'));
  assert.ok(source.includes('effectiveMinGmgn1mChangePct:99000'));
  assert.ok(source.includes("gmgn_solbscbaseethmonadtron"));
  assert.ok(source.includes("gmgnTrendOrderBy:String(process.env.TCX_W6_GMGN_TREND_ORDER_BY||'creation_timestamp')"));
});

test('mission-control exposes W6 descriptive exit learner without automatic policy mutation',()=>{
  const source=readFileSync(new URL('./bot.mjs',import.meta.url),'utf8');
  assert.ok(source.includes("exitLearning:user99k60sExitLearningSummary"));
  assert.ok(source.includes("recordUser99k60sExitObservation"));
  assert.ok(source.includes("USER_PROFIT_ENOUGH"));
  assert.ok(source.includes("USER_MCAP_TOO_SMALL"));
});


test('mission-control source exposes W6 fixed four-minute shadow exit and hold research lab',()=>{
  const source=readFileSync(new URL('./bot.mjs',import.meta.url),'utf8');
  assert.ok(source.includes("minHoldSeconds:240"));
  assert.ok(source.includes("fixedHoldSeconds:240"));
  assert.ok(source.includes("notionalScenariosSol:[0.5,1,2,3,5,10,20,40,60,80]"));
  assert.ok(source.includes("holdScenarioCloses"));
  assert.ok(source.includes("canExecuteLive:false"));
});


test('mission control source exposes layered research spine',()=>{
  const source=readFileSync(new URL('./bot.mjs',import.meta.url),'utf8');
  assert.ok(source.includes("buildBiggjResearchSpine"));
  assert.ok(source.includes("health.biggjResearchSpine"));
  assert.ok(source.includes("BIGGJ_RESEARCH_SPINE_VERSION"));
});


test('mission-control source wires live SOL price into W6 liquidity-aware sizing',()=>{
  const source=readFileSync(new URL('./bot.mjs',import.meta.url),'utf8');
  assert.ok(source.includes("currentW6SolPriceUsd"));
  assert.ok(source.includes("solPriceUsd:w6SolPriceUsd"));
  assert.ok(source.includes("RUNNER_60M"));
});
