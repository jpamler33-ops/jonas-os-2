import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {BIGGJ_MOBILE_WEBAPP_VERSION,biggjWebManifest,biggjAppIconSvg,biggjServiceWorker,renderBiggjMobileApp} from './biggj-mobile-webapp.mjs';

const sample={generatedAt:1_800_000_000_000,biggj:{science:{frontier:{evidence:294,experiments:3}},worldModel:{markets:[{symbol:'BTCUSDT',status:'VALID',regime:'TREND',witnessAgreement:.8,support:12,score:.76,price:67842.31,priceChangePercent:1.84,priceChange:1226.4,openPrice:66615.91,highPrice:68410,lowPrice:66102,quoteVolume:38200000000}]}},health:{autonomousOperator:{mode:'HANDS_OFF',operatorNeeded:false},biggjObservability:{maturityIndex:.62,trustedSkills:3,totalSkillNodes:12,observedForecasts:44,runtimeRevision:9,evidence:{evidenceTotal:120,validationIndependentEpisodes:18},learningTimeline:{last24h:{total:7},last7d:{total:29},events:[{title:'Regime transfer checked',detail:'OOS evidence advanced'}]},researchQueue:[{title:'Liquidity transfer',nextGate:'FORWARD_SHADOW'}]},biggjProofFeed:{counts:{resolved:20}},marketRadar:{rows:[{symbol:'ETHUSDT',status:'SUPPORTED',regime:'RANGE',witnessAgreement:.7,support:8,score:.61}]}},portfolio:{equityQuote:1012,netPnlQuote:12,openPositions:1,closedTrades:3,positions:[],recentClosed:[]}};

test('standalone PWA',()=>{const m=JSON.parse(biggjWebManifest());assert.equal(BIGGJ_MOBILE_WEBAPP_VERSION,'BIGGJ_USER_COMMAND_CENTER_V7_DISCOVERY_JOURNAL');assert.equal(m.start_url,'/mission-control');assert.equal(m.display,'standalone');assert.match(biggjAppIconSvg(),/^<svg/)});
test('five user surfaces include the dedicated meme wallet',()=>{const h=renderBiggjMobileApp(sample);for(const x of ['today','markets','progress','trading','meme'])assert.match(h,new RegExp('data-tab="'+x+'"'));for(const x of ['science','world','lab','decisions','system'])assert.doesNotMatch(h,new RegExp('data-tab="'+x+'"'));assert.match(h,/BIGGJ ARBEITET FÜR DICH/);assert.match(h,/BIGGJ DISCOVERY JOURNAL/);assert.match(h,/env\(safe-area-inset-bottom\)/)});
test('market terminal exposes price performance OHLC and SuperChart',()=>{const h=renderBiggjMobileApp(sample);for(const x of ['HIGH 24H','LOW 24H','VOLUME','LIVE TICKER','data-chart-symbol','data-chart-interval','data-chart-mode','data-chart-fullscreen'])assert.match(h,new RegExp(x));assert.match(h,/PRICE\(m\.price\)/);assert.match(h,/pct\.toFixed\(2\)/);assert.match(h,/\/superchart\.png\?/);assert.match(h,/STRUCTURE · FORECAST · LIQUIDITY · CONFLUENCE · EVENTS/);assert.match(h,/terminal\.fullscreen/);assert.match(h,/fullscreen:false/);assert.match(h,/CHART\.fullscreen=!CHART\.fullscreen/);assert.match(h,/TAB==='markets'&&CHART\.fullscreen/);assert.match(h,/30000/)});
test('progress is measurable',()=>{const h=renderBiggjMobileApp(sample);assert.match(h,/Discovery Scoreboard/);assert.match(h,/Research-Reife/);assert.match(h,/Was sich sonst verändert hat/);assert.match(h,/maturityIndex/)});
test('boot state safe and live refresh no-store',()=>{const h=renderBiggjMobileApp({health:{x:'<script>',autonomousOperator:{mode:'HANDS_OFF'}},portfolio:{}});assert.ok(!h.includes('"x":"<script>"'));assert.match(h,/"x":"\\u003cscript\\u003e"/);assert.match(h,/mission-control\.json/);assert.match(h,/cache:'no-store'/);assert.match(h,/SHADOW_ONLY/);assert.match(h,/canExecuteLive/)});
test('service worker bypasses live state',()=>{const sw=biggjServiceWorker();for(const x of ['superchart.png','market-ticker.json','mission-control.json','signal-lab.json','proof-feed.json'])assert.match(sw,new RegExp(x.replace('.','\\.')));assert.match(sw,/cache:'no-store'/);assert.doesNotMatch(sw,/https?:\/\//)});
test('canonical route still serves mobile app',async()=>{const source=await readFile(new URL('./bot.mjs',import.meta.url),'utf8');assert.match(source,/renderBiggjMobileApp\(snapshot\)/);assert.match(source,/requestPath === '\/mission-control\/legacy'/);assert.match(source,/renderMissionControlHtml\(snapshot\)/)});


test('mobile market view merges world-model and radar facts instead of dropping live price data',()=>{
  const h=renderBiggjMobileApp(sample);
  assert.match(h,/by\.set\(s,\{\.\.\.\(by\.get\(s\)\|\|\{\}\),\.\.\.x,symbol:s\}\)/);
  assert.match(h,/volumeQuote/);
  assert.match(h,/INVALID_CHART_CONTENT_TYPE/);
  assert.match(h,/EMPTY_CHART_IMAGE/);
  assert.match(h,/SUPERCHART NICHT VERFÜGBAR/);
});

test('discovery journal keeps maturity separate from findings and exposes epistemic boundaries',()=>{
  const h=renderBiggjMobileApp(sample);
  assert.match(h,/BIGGJ DISCOVERY JOURNAL/);
  assert.match(h,/WAS BIGGJ/);
  assert.match(h,/Research-Reife/);
  assert.match(h,/Aktivität ≠ Reife/);
  assert.match(h,/Ein Kandidat ist keine Markt-Wahrheit/);
  assert.match(h,/keine automatische Promotion/);
  assert.match(h,/function HUMAN_DETAIL/);
});

test('live badge reflects successful transport refresh age rather than stale research-state timestamps',()=>{
  const h=renderBiggjMobileApp(sample);
  assert.match(h,/AGE\(lastGoodAt\)/);
  assert.doesNotMatch(h,/AGE\(S\.generatedAt\|\|lastGoodAt\)/);
});


test('market header uses a dedicated selected-symbol live ticker and never coerces missing data to fake zero',()=>{
  const h=renderBiggjMobileApp(sample);
  assert.match(h,/\/market-ticker\.json\?/);
  assert.match(h,/async function loadTicker/);
  assert.match(h,/let TICKER=null/);
  assert.match(h,/TICKER=\{\.\.\.x,loadedAt:Date\.now\(\)\}/);
  assert.match(h,/const NUM=x=>x===null\|\|x===undefined\|\|x===''\?NaN:Number\(x\)/);
  assert.match(h,/Marktdaten werden synchronisiert/);
  assert.doesNotMatch(h,/pct:Number\(pct\)/);
});


test('mobile hero translates human action codes and keeps internal incidents non-actionable',()=>{
  const actionable=structuredClone(sample);
  actionable.health.autonomousOperator={
    mode:'ESCALATION_REQUIRED',
    operatorNeeded:true,
    humanJobRemaining:'APPROVAL_REQUIRED',
    activeIncidents:1,
    internalIncidents:0
  };
  const actionableHtml=renderBiggjMobileApp(actionable);
  assert.match(actionableHtml,/Eine Freigabe oder Entscheidung wartet auf dich/);
  assert.doesNotMatch(actionableHtml,/>APPROVAL_REQUIRED</);

  const internal=structuredClone(sample);
  internal.health.autonomousOperator={
    mode:'AUTO_MONITORING',
    operatorNeeded:false,
    humanJobRemaining:'EXCEPTIONS_ONLY',
    activeIncidents:13,
    internalIncidents:12
  };
  const internalHtml=renderBiggjMobileApp(internal);
  assert.match(internalHtml,/BIGGJ ARBEITET FÜR DICH/);
  assert.match(internalHtml,/Keine Aktion von dir nötig/);
  assert.match(internalHtml,/internal=N\(op\.internalIncidents\|\|0\)/);
  assert.match(internalHtml,/human\?E\(HUMAN_ACTION\(op\.humanJobRemaining\)\):E\(autonomousText\)/);
});


test('base mobile trading view exposes research activity without mission-control patching',()=>{
  const x=structuredClone(sample);
  x.discovery={checkedCoins:6,forecastAvailable:6,admittedForecasts:0,totalCalibratedHorizons:0,totalHorizons:24,standardCandidates:0,explorationCandidates:0,standardTrades:0,explorationTrades:0,coverageProbes:2,topBlockers:[{reason:'NO_CALIBRATED_HORIZONS',count:6,text:'Kalibrierung fehlt'}],runtime:{omsStatus:'HEALTHY',omsFilled:4000,academyStage:'BOOTCAMP',trainingHold:false,openDiscoveryPositions:3,discoveryOpenCap:4}};
  x.portfolio.researchActivity={openPositions:20,closedTrades:3998,wins:1900,losses:2098,winRate:.475,netPnlQuote:-12.5,byMode:{COVERAGE_PROBE:{open:20,closed:3998,realizedPnlQuote:-12.5}},active:[{symbol:'BTCUSDT',side:'LONG',entryMode:'COVERAGE_PROBE',entryPrice:60000,horizonId:'15m'}],recentClosed:[]};
  const h=renderBiggjMobileApp(x);
  for(const text of ['PRIMARY +','Research Trading','Research Open','Research Closed','Discovery Pipeline','Aktueller Blocker','Runtime Gates','Aktive Research Positionen']) assert.match(h,new RegExp(text));
  assert.match(h,/APP_VERSION='BIGGJ_USER_COMMAND_CENTER_V7_DISCOVERY_JOURNAL'/);
  assert.match(h,/next\?\.appVersion&&next\.appVersion!==APP_VERSION/);
});


test('data-quality blocks are coded as automatic protection rather than a human escalation',()=>{
  const h=renderBiggjMobileApp(sample);
  assert.match(h,/dataQuality=String\(op\.factoryMode\|\|''\)\.toUpperCase\(\)==='DATA_QUALITY_BLOCKED'/);
  assert.match(h,/human=op\.operatorNeeded===true&&!job\.split/);
  assert.match(h,/BIGGJ SCHÜTZT DIE DATENQUALITÄT/);
  assert.match(h,/Keine Freigabe von dir nötig/);
});

test('today evidence card distinguishes raw independent episodes from validation-ready episodes',()=>{
  const h=renderBiggjMobileApp(sample);
  assert.match(h,/b\.evidence\?\.independentEpisodes/);
  assert.match(h,/unabhängige Episoden ·/);
  assert.match(h,/b\.evidence\?\.validationIndependentEpisodes/);
  assert.match(h,/validierungsbereit/);
});

test('timeline translates compound machine labels instead of passing them through as one machine string',()=>{
  const h=renderBiggjMobileApp(sample);
  assert.match(h,/THESIS_MECHANISM_SUPPORT_ADEQUATE:'Mechanismus-Unterstützung ausreichend'/);
  assert.match(h,/MATERIAL_WITNESS_CONTRADICTION:'Materieller Witness-Widerspruch'/);
  assert.match(h,/WITNESS_NOT_SATISFIED:'Witness-Kriterium nicht erfüllt'/);
  assert.match(h,/function HUMAN_DETAIL\(v\)/);
  assert.match(h,/x\.detail\?HUMAN_DETAIL\(x\.detail\)/);
});


test('discovery journal renders validated, rejected and collecting Temporal Temple findings',()=>{
  const x=structuredClone(sample);
  x.health.memecoinRadar={
    temporalTemple:{
      independentCases:40,
      bookOfChanges:{observedTransitions:160,uniqueTransitions:12},
      transitionLaws:{
        status:'FORWARD_LAW_CANDIDATES_PRESENT',
        testedHypotheses:24,
        eligibleHypotheses:8,
        candidates:[
          {from:'15m',to:'30m',fromState:'S17',toState:'S45',forwardHorizon:'1h',independentCases:30,contextsEligible:4,validated:true,robust:false,status:'FORWARD_LAW_CANDIDATE',validation:{medianReturn:.18,positiveRate:.72},folds:[{},{}]},
          {from:'30m',to:'1h',fromState:'S12',toState:'S03',forwardHorizon:'4h',independentCases:26,contextsEligible:3,validated:false,robust:false,status:'FAILED_FORWARD_VALIDATION',validation:{medianReturn:-.04,positiveRate:.42},folds:[{},{}]}
        ],
        collecting:[{from:'1h',to:'4h',fromState:'S09',toState:'S31',forwardHorizon:'12h',samples:8,required:22}]
      },
      invariants:{candidates:[{stateId:'S45',samples:18,contexts:3,direction:'POSITIVE',invariant:true,status:'SCALE_INVARIANT_CANDIDATE'}]},
      nilometers:{oneHour:{candidates:[{featureId:'logLiquidity',trainRho:.42,validationRho:.31,status:'NILOMETER_CANDIDATE'}]},fourHour:{candidates:[]}},
      ephemeris:{rows:[{from:'15m',to:'30m',fromState:'S17',samples:20,medianStepReturn:.05,nextStates:[{state:'S45',share:.6},{state:'S21',share:.2}]}]},
      eventClock:{milestones:[{id:'PRICE_PLUS_25',cases:12,share:.3,medianElapsedMs:1800000}]}
    },
    evidenceFactory:{independentCases:40,complete24h:11}
  };
  const h=renderBiggjMobileApp(x);
  for(const text of ['Übergangsgesetze','Widerlegt / nicht gehalten','Noch nicht entscheidbar','Skaleninvarianten','Frühe Informations-Proxies','Market Ephemeris','Event Clock'])assert.match(h,new RegExp(text));
  assert.match(h,/"fromState":"S17"/);
  assert.match(h,/"toState":"S45"/);
  assert.match(h,/E\(x\?\.fromState\|\|'\?'\)\+' → '\+E\(x\?\.toState/);
  assert.match(h,/Median forward/);
  assert.match(h,/negative Erkenntnisse zählen/);
  assert.match(h,/PIT Evidence · Walk-Forward · Cross-Context/);
});

test('meme wallet mirrors the premium mockup structure and binds only live shadow fields',()=>{
  const x=structuredClone(sample);
  x.health.memecoinRadar={
    sourceReady:true,
    source:'DEXSCREENER_PLUS_GECKOTERMINAL_KEYLESS',
    rows:[{
      chainId:'solana',tokenAddress:'SoTest',symbol:'MOONPUP',priceUsd:.0000367,liquidityUsd:1200000,
      score:{stage:'NEW_NOW'},security:{evidenceGate:'PASS'}
    }],
    security:{
      checked:4,pass:2,abstain:1,unknown:1,
      outcomes:{records:8,comparison:{status:'INSUFFICIENT_SAMPLE'},cohorts:{
        PASS_HOLDER_FALLBACK:{records:2,horizons:{'1h':{matured:0,averageReturn:null,severeLossRate:null}}},
        PASS_NATIVE:{records:1,horizons:{'1h':{matured:0,averageReturn:null,severeLossRate:null}}},
        ABSTAIN:{records:2,horizons:{'1h':{matured:0,averageReturn:null,severeLossRate:null}}},
        UNKNOWN:{records:3,horizons:{'1h':{matured:0,averageReturn:null,severeLossRate:null}}}
      }}
    }
  };
  x.health.specialistWallets={wallets:{W4_MEME_SCOUT:{
    walletId:'W4_MEME_SCOUT',openPositions:1,closedTrades:1,wins:1,losses:0,winRate:1,
    realizedPnlQuote:50,unrealizedPnlQuote:25,netPnlQuote:75,profitFactor:null,
    cumulativeMarginUsedQuote:200,currentMarginAtRiskQuote:100,
    active:[{chainId:'solana',tokenAddress:'SoTest',symbol:'MOONPUP',entryPrice:.0000123,lastPrice:.0000367,openedAt:Date.now()-600000,unrealizedNetPnlQuote:25,unrealizedReturnPct:1.983,entrySecurityGate:'PASS',entryStage:'NEW_NOW'}],
    recentClosed:[{symbol:'OLDPUP',chainId:'solana',openedAt:Date.now()-7200000,closedAt:Date.now()-3600000,realizedNetPnlQuote:50,realizedReturnPct:.5,closeReason:'MEME_TAKE_PROFIT'}]
  },W5_MEME_COPY:{walletId:'W5_MEME_COPY',openPositions:0,closedTrades:0,active:[],recentClosed:[]}}};
  const h=renderBiggjMobileApp(x);
  for(const text of ['Meme Wallet','Early Meme Scout','SHADOW_ONLY','LIVE DATA','NO REAL ORDERS · PAPER ONLY','Unrealized PnL','Realized PnL','Total PnL','ROI auf Einsatz','Performance Overview','Open Positions','Security Outcome Lab','PASS Holder Fallback','PASS Native','ABSTAIN','UNKNOWN'])assert.match(h,new RegExp(text));
  assert.match(h,/data-meme-wallet="W4_MEME_SCOUT"/);
  assert.match(h,/data-meme-range="7D"/);
  assert.match(h,/MEME_PANEL='positions'/);
  assert.match(h,/canExecuteLive:false/);
});
