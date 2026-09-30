import test from 'node:test';import assert from 'node:assert/strict';import {chronologicalSplit,validateFrozenOOS} from './oos-validation.mjs';
const mk=n=>Array.from({length:n},(_,i)=>({openedAt:new Date(Date.UTC(2026,0,1,i)).toISOString(),signal:'CROWDED_LONG_PRESSURE',outcomes:{h1:{return:i%2?.01:-.01},h4:{return:.01},h24:{return:.02}}}));
test('refuses premature OOS',()=>{assert.equal(validateFrozenOOS(mk(99)).status,'INSUFFICIENT_SAMPLE');});
test('uses chronological 70/30 split',()=>{const s=chronologicalSplit(mk(100));assert.equal(s.train.length,70);assert.equal(s.test.length,30);assert.ok(Date.parse(s.train.at(-1).openedAt)<Date.parse(s.test[0].openedAt));});
test('OOS never enables live execution or edge claim',()=>{const v=validateFrozenOOS(mk(100));assert.equal(v.status,'FROZEN_OOS');assert.equal(v.canExecuteLive,false);assert.equal(v.claimAllowed,false);assert.equal(v.results.CROWDED_LONG_PRESSURE.test.h24.n,30);});
