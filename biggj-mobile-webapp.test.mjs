import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  BIGGJ_MOBILE_WEBAPP_VERSION,
  biggjWebManifest,
  biggjAppIconSvg,
  biggjServiceWorker,
  renderBiggjMobileApp
} from './biggj-mobile-webapp.mjs';

const sample={
  generatedAt:1_800_000_000_000,
  biggj:{
    science:{frontier:{evidence:294,experiments:3,surprises:2}},
    worldModel:{markets:[{symbol:'BTCUSDT',status:'VALID',regime:'TREND',witnessAgreement:.8,support:12,score:.76}]}
  },
  health:{
    autonomousOperator:{mode:'HANDS_OFF',operatorNeeded:false,automationCoverage:1},
    autonomousResearchFactory:{mode:'DATA_COLLECTION_ONLY'},
    biggjObservability:{
      maturityIndex:.62,trustedSkills:3,totalSkillNodes:12,observedForecasts:44,runtimeRevision:9,
      evidence:{evidenceTotal:120,validationEvidenceTotal:46,validationIndependentEpisodes:18},
      learningTimeline:{last24h:{total:7},last7d:{total:29},events:[{kind:'VALIDATION',title:'Regime transfer checked',detail:'OOS evidence advanced',at:1_800_000_000_000}]},
      revisions:[{type:'ASSUMPTION_REVISION',assumptionId:'A1',falsifierCodes:['F1']}],
      researchQueue:[{title:'Liquidity transfer',nextGate:'FORWARD_SHADOW',uncertainty:.4,priority:.8}]
    },
    biggjProofFeed:{counts:{resolved:20}},
    marketRadar:{rows:[{symbol:'ETHUSDT',status:'SUPPORTED',regime:'RANGE',witnessAgreement:.7,support:8,score:.61}]}
  },
  portfolio:{equityQuote:1012,netPnlQuote:12,openPositions:1,closedTrades:3,positions:[],recentClosed:[]}
};

test('BIGGJ command center remains installable as a standalone PWA',()=>{
  const manifest=JSON.parse(biggjWebManifest());
  assert.equal(BIGGJ_MOBILE_WEBAPP_VERSION,'BIGGJ_USER_COMMAND_CENTER_V2');
  assert.equal(manifest.start_url,'/mission-control');
  assert.equal(manifest.display,'standalone');
  assert.match(manifest.name,/Command Center/);
  assert.ok(manifest.icons.length>=1);
});

test('mobile UI exposes only four primary user surfaces',()=>{
  const html=renderBiggjMobileApp(sample);
  for(const tab of ['today','markets','progress','trading'])assert.match(html,new RegExp('data-tab="'+tab+'"'));
  for(const oldTab of ['science','world','lab','decisions','system'])assert.doesNotMatch(html,new RegExp('data-tab="'+oldTab+'"'));
  assert.match(html,/BIGGJ ARBEITET FÜR DICH/);
  assert.match(html,/Dein Überblick/);
  assert.match(html,/Was sich verändert hat/);
  assert.match(html,/MESSBARER FORTSCHRITT/);
  assert.match(html,/apple-mobile-web-app-capable/);
  assert.match(html,/env\(safe-area-inset-bottom\)/);
});

test('market monitor uses the advanced first-party SuperChart',()=>{
  const html=renderBiggjMobileApp(sample);
  assert.match(html,/SUPER<span class="cyan">CHART/);
  assert.match(html,/\/superchart\.png\?/);
  assert.match(html,/Structure · Forecast · Liquidity · Confluence · Events/);
  assert.match(html,/data-chart-symbol/);
  assert.match(html,/data-chart-interval/);
  assert.match(html,/data-chart-mode/);
  assert.match(html,/\['PRO','FULL'\]/);
  assert.match(html,/30000/);
});

test('progress view exposes measurable evidence and learning state',()=>{
  const html=renderBiggjMobileApp(sample);
  assert.match(html,/Scoreboard/);
  assert.match(html,/Learning Timeline/);
  assert.match(html,/Nächster Hebel/);
  assert.match(html,/validationIndependentEpisodes/);
  assert.match(html,/maturityIndex/);
});

test('runtime state is embedded safely and refresh remains no-store',()=>{
  const html=renderBiggjMobileApp({health:{x:'<script>',autonomousOperator:{mode:'HANDS_OFF'}},portfolio:{}});
  assert.ok(!html.includes('"x":"<script>"'));
  assert.match(html,/"x":"\\u003cscript>"/);
  assert.match(html,/mission-control\.json/);
  assert.match(html,/cache:'no-store'/);
  assert.match(html,/SHADOW_ONLY/);
  assert.match(html,/canExecuteLive:false/);
});

test('service worker bypasses cache for live chart and live state',()=>{
  const sw=biggjServiceWorker();
  assert.match(sw,/superchart\.png/);
  assert.match(sw,/mission-control\.json/);
  assert.match(sw,/signal-lab\.json/);
  assert.match(sw,/proof-feed\.json/);
  assert.match(sw,/cache:'no-store'/);
  assert.doesNotMatch(sw,/https?:\/\//);
  assert.match(biggjAppIconSvg(),/^<svg/);
});

test('canonical route still serves mobile app and legacy technical dashboard remains available',async()=>{
  const source=await readFile(new URL('./bot.mjs',import.meta.url),'utf8');
  assert.match(source,/renderBiggjMobileApp\(snapshot\)/);
  assert.match(source,/req\.url === '\/mission-control\/legacy'/);
  assert.match(source,/renderMissionControlHtml\(snapshot\)/);
});
