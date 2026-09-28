import test from 'node:test';import assert from 'node:assert/strict';import {evaluateRollingWalkForward} from './rolling-walk-forward.mjs';
const mk=(n,fn)=>({positions:Array.from({length:n},(_,i)=>({execution:'SHADOW_ONLY',canExecuteLive:false,status:'CLOSED',entryMode:'STANDARD',closedAt:i+1,realizedNetPnlQuote:fn(i)}))});
test('insufficient history fails closed',()=>{const x=evaluateRollingWalkForward(mk(100,()=>2));assert.equal(x.passed,false);assert.equal(x.canExecuteLive,false);});
test('chronological robust history passes rolling windows',()=>{const x=evaluateRollingWalkForward(mk(300,i=>i%5===0?-1:2));assert.equal(x.passed,true);assert.ok(x.windows.every(w=>w.trainEndAt<w.testStartAt));});
test('recent forward collapse blocks proof',()=>{const x=evaluateRollingWalkForward(mk(300,i=>i>=270?-4:(i%5===0?-1:2)));assert.equal(x.passed,false);assert.equal(x.checks.recentWindowPositive,false);});
