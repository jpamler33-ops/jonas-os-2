import test from 'node:test';import assert from 'node:assert/strict';import {missionControlSnapshot,renderMissionControlHtml} from './mission-control.mjs';
test('mission control is explicitly shadow only',()=>{const s=missionControlSnapshot({health:{ok:true}});assert.equal(s.canExecuteLive,false);assert.match(renderMissionControlHtml(s),/SHADOW_ONLY/);});
test('html escapes embedded less-than data',()=>{const h=renderMissionControlHtml(missionControlSnapshot({health:{x:'<script>'}}));assert.ok(h.includes('"x":"\\\\u003cscript>"'));assert.ok(!h.includes('"x":"<script>"'));});
