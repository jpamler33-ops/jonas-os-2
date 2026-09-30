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
