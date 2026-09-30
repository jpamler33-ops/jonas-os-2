import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BIGGJ_MOBILE_WEBAPP_VERSION,
  biggjWebManifest,
  biggjAppIconSvg,
  biggjServiceWorker,
  renderBiggjMobileApp
} from './biggj-mobile-webapp.mjs';

test('BIGGJ mobile app is installable as a standalone PWA',()=>{
  const manifest=JSON.parse(biggjWebManifest());
  assert.equal(BIGGJ_MOBILE_WEBAPP_VERSION,'BIGGJ_MOBILE_COMMAND_CENTER_V1');
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
  for(const tab of ['home','learn','trades','intel','system']){
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
  assert.match(html,/World situation/);
  assert.match(html,/General relevant news/);
  assert.match(html,/Memecoin radar/);
  assert.match(html,/Trader watch/);
  assert.match(html,/not independently verified/);
  assert.match(html,/Market radar/);
});
