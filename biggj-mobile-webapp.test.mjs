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

test('BIGGJ mobile app is installable as a standalone PWA',()=>{
  const manifest=JSON.parse(biggjWebManifest());
  assert.equal(BIGGJ_MOBILE_WEBAPP_VERSION,'BIGGJ_MARKET_SCIENCE_APP_V1');
  assert.equal(manifest.start_url,'/mission-control');
  assert.equal(manifest.scope,'/');
  assert.equal(manifest.display,'standalone');
  assert.ok(Array.isArray(manifest.icons)&&manifest.icons.length>=1);
});

test('mobile app renders six primary tabs and iPhone install metadata',()=>{
  const html=renderBiggjMobileApp({
    generatedAt:1_800_000_000_000,
    health:{autonomousOperator:{mode:'HANDS_OFF'}},
    portfolio:{}
  });
  for(const tab of ['science','world','lab','decisions','trading','system']){
    assert.match(html,new RegExp('data-tab="'+tab+'"'));
  }
  assert.match(html,/apple-mobile-web-app-capable/);
  assert.match(html,/viewport-fit=cover/);
  assert.match(html,/env\(safe-area-inset-bottom\)/);
  assert.match(html,/app\.webmanifest/);
  assert.match(html,/SHADOW_ONLY/);
});

test('mobile app embeds runtime state safely and auto-refreshes from canonical snapshot',()=>{
  const html=renderBiggjMobileApp({
    health:{x:'<script>',autonomousOperator:{mode:'HANDS_OFF'}},
    portfolio:{}
  });
  assert.ok(!html.includes('"x":"<script>"'));
  assert.match(html,/"x":"\\u003cscript>"/);
  assert.match(html,/mission-control\.json/);
  assert.match(html,/cache:'no-store'/);
});

test('service worker and icon remain local first-party assets',()=>{
  const sw=biggjServiceWorker();
  assert.match(sw,/\/mission-control/);
  assert.match(sw,/\/app\.webmanifest/);
  assert.match(sw,/\/biggj-icon\.svg/);
  assert.doesNotMatch(sw,/https?:\/\//);
  const icon=biggjAppIconSvg();
  assert.match(icon,/^<svg/);
  assert.match(icon,/viewBox="0 0 512 512"/);
});


test('world model keeps reality feed separate from inferred state and refuses fabricated latent layers',()=>{
  const html=renderBiggjMobileApp({
    generatedAt:1_800_000_000_000,
    biggj:{
      science:{frontier:{total:2,evidence:10,experiments:1,surprises:1,robust:0,broken:0},director:{topAgenda:[],topDataRequests:[]}},
      worldModel:{
        marketsObserved:1,
        markets:[{symbol:'BTCUSDT',status:'VALID',regime:'TREND',epistemicClass:'INFERRED',witnessAgreement:.8,support:12,score:.8}],
        regimeDistribution:[{regime:'TREND',count:1}],
        latestIntelligence:[{title:'Ceasefire update',family:'GEOPOLITICS',status:'DEVELOPING',verified:false,availableAt:1_800_000_000_000}],
        latentStateDiscovery:{status:'NOT_YET_IMPLEMENTED',reason:'do not fabricate'},
        informationFlowGraph:{status:'NOT_YET_IMPLEMENTED',reason:'not promoted'},
        predictabilityField:{status:'NOT_YET_IMPLEMENTED',reason:'not promoted'}
      },
      laboratory:{agenda:[],dataRequests:[]}
    },
    health:{operationalReadiness:{ready:true},researchCoverage:{averageCoverage:1,blocked:0}},
    portfolio:{}
  });
  assert.match(html,/WORLD MODEL/);
  assert.match(html,/Reality Feed/);
  assert.match(html,/INFERRED/);
  assert.match(html,/NOT_YET_IMPLEMENTED/);
  assert.match(html,/nicht unabhängig bestätigt/);
});

test('V4 renders BIGGJ market-science hierarchy and live states',()=>{
  const html=renderBiggjMobileApp({
    generatedAt:1_800_000_000_000,
    health:{
      autonomousOperator:{mode:'WAITING_FOR_DATA',operatorNeeded:false,automationCoverage:1},
      autonomousResearchFactory:{mode:'RESEARCH_STALLED'},
      biggjLivingResearch:{researchRequired:4,activeAgendaItems:5,researchProtocols:{total:4},researchReviews:{open:0},discoveredResearchOnlySkills:4,topResearchBottlenecks:[{assumptionId:'A1',status:'RESEARCH_REQUIRED',informationValue:.8,primaryCapabilityId:'EVIDENCE_INDEPENDENCE',distinctPersistentForecasts:3}]},
      researchCoverage:{averageCoverage:.9,blocked:0},
      marketRadar:{rows:[{symbol:'BTCUSDT',status:'VALID',regime:'TREND_UP',witnessAgreement:.88,support:12,score:.82}]},
      experienceNeeds:[{priority:3,label:'Research wartet auf Daten',detail:'Kein Eingriff nötig.'}]
    },
    portfolio:{netPnlQuote:12.5,openPositions:1,closedTrades:3,positions:[]}
  });
  assert.match(html,/Autonomous Market Science OS/);
  assert.match(html,/MARKET<br><span class="cyan">SCIENCE/);
  assert.match(html,/Knowledge Frontier/);
  assert.match(html,/WORLD MODEL/);
  assert.match(html,/SCIENTIFIC LABORATORY/);
  assert.match(html,/Trading Application/);
  assert.match(html,/Epistemic Firewall/);
  assert.match(html,/Live Diagnose/);
});

test('canonical mission-control renderer delegates to the market-science mobile app',async()=>{
  const source=await readFile(new URL('./mission-control.mjs',import.meta.url),'utf8');
  assert.match(source,/import \{ renderBiggjMobileApp \} from '\.\/biggj-mobile-webapp\.mjs'/);
  assert.match(source,/return renderBiggjMobileApp\(snapshot\)/);
});


test('canonical route serves market-science mobile app and legacy route keeps technical dashboard',async()=>{
  const source=await readFile(new URL('./bot.mjs',import.meta.url),'utf8');
  assert.match(source,/renderBiggjMobileApp\(snapshot\)/);
  assert.match(source,/req\.url === '\/mission-control\/legacy'/);
  assert.match(source,/renderMissionControlHtml\(snapshot\)/);
});


test('mobile Signal Lab uses canonical no-store APIs and never renders raw probability without display gate',()=>{
  const html=renderBiggjMobileApp({
    generatedAt:1_800_000_000_000,
    health:{
      autonomousOperator:{mode:'HANDS_OFF'},
      biggjProofFeed:{counts:{resolved:2,hits:1,misses:1,committed:2},liveRows:[],rows:[]}
    },
    portfolio:{}
  });
  assert.match(html,/data-tab="decisions"/);
  assert.match(html,/\/signal-lab\.json/);
  assert.match(html,/\/proof-feed\.json/);
  assert.match(html,/p\.displayAllowed===true/);
  assert.match(html,/SUPPRESSED/);
  assert.match(html,/TCX konsumiert den validierten Science-/);
  assert.match(html,/Forecast-Time-Hashes/);
});

test('service worker bypasses cache for live signal and proof JSON',()=>{
  const sw=biggjServiceWorker();
  assert.match(sw,/signal-lab\.json/);
  assert.match(sw,/proof-feed\.json/);
  assert.match(sw,/cache:'no-store'/);
});
