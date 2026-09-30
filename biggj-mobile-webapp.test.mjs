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
  assert.equal(BIGGJ_MOBILE_WEBAPP_VERSION,'BIGGJ_MOBILE_COMMAND_CENTER_V2');
  assert.equal(manifest.start_url,'/mission-control');
  assert.equal(manifest.scope,'/');
  assert.equal(manifest.display,'standalone');
  assert.ok(Array.isArray(manifest.icons)&&manifest.icons.length>=1);
});

test('mobile app renders five primary tabs and iPhone install metadata',()=>{
  const html=renderBiggjMobileApp({
    generatedAt:1_800_000_000_000,
    health:{autonomousOperator:{mode:'HANDS_OFF'}},
    portfolio:{}
  });
  for(const tab of ['overview','markets','research','trades','system']){
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


test('mobile intel separates world, general news, memecoins and trader source truth',()=>{
  const html=renderBiggjMobileApp({
    generatedAt:1_800_000_000_000,
    health:{
      autonomousOperator:{mode:'HANDS_OFF'},
      marketRadar:{rows:[{symbol:'BTCUSDT',status:'VALID',regime:'TREND',witnessAgreement:.8,support:12}]},
      globalIntel:{source:'GDELT DOC 2.1',recent:[
        {title:'Ceasefire update',family:'GEOPOLITICS',status:'DEVELOPING',verified:false,availableAt:1_800_000_000_000},
        {title:'Bitcoin update',family:'CRYPTO',status:'WATCH',verified:false,availableAt:1_800_000_000_000}
      ]},
      memecoinRadar:{source:'DEXSCREENER_PUBLIC_API',rows:[
        {chainId:'solana',pair:{symbol:'MEME',priceUsd:.01,liquidityUsd:100000,priceChangeH1:3,buysH1:20,sellsH1:10}}
      ],metas:[{name:'AI memes',tokenCount:5,volume:1000,liquidity:500}]},
      traderWatch:{sourceReady:false,nextNeed:'PIT public performance feed'}
    },
    portfolio:{}
  });
  assert.match(html,/Live Intelligence/);
  assert.match(html,/Memecoin Radar/);
  assert.match(html,/Trader Intelligence/);
  assert.match(html,/nicht unabhängig bestätigt/);
  assert.match(html,/Market Radar/);
});


test('V2 renders BIGGJ command-center hierarchy and live states',()=>{
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
  assert.match(html,/BIGGJ \/\/ TCX/);
  assert.match(html,/System posture/);
  assert.match(html,/WARTET AUF DATEN/);
  assert.match(html,/Living Research/);
  assert.match(html,/Market Radar/);
  assert.match(html,/Execution Boundary/);
  assert.match(html,/Live Diagnose/);
});

test('canonical mission-control renderer delegates to the V2 mobile app',async()=>{
  const source=await readFile(new URL('./mission-control.mjs',import.meta.url),'utf8');
  assert.match(source,/import \{ renderBiggjMobileApp \} from '\.\/biggj-mobile-webapp\.mjs'/);
  assert.match(source,/return renderBiggjMobileApp\(snapshot\)/);
});
