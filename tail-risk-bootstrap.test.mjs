import test from 'node:test';import assert from 'node:assert/strict';import {evaluateTailRiskBootstrap} from './tail-risk-bootstrap.mjs';
const mk=(n,fn)=>({initialEquityQuote:10000,positions:Array.from({length:n},(_,i)=>({execution:'SHADOW_ONLY',canExecuteLive:false,status:'CLOSED',entryMode:'STANDARD',closedAt:i+1,realizedNetPnlQuote:fn(i)}))});
test('insufficient tail evidence fails closed',()=>{const x=evaluateTailRiskBootstrap(mk(10,()=>2),{paths:100});assert.equal(x.passed,false);assert.equal(x.canExecuteLive,false);});
test('deterministic bootstrap is reproducible',()=>{const l=mk(150,i=>i%5===0?-2:1.5);const a=evaluateTailRiskBootstrap(l,{paths:200}),b=evaluateTailRiskBootstrap(l,{paths:200});assert.equal(a.fingerprint,b.fingerprint);assert.equal(a.p95DrawdownPct,b.p95DrawdownPct);});
test('destructive history fails survival evidence',()=>{const x=evaluateTailRiskBootstrap(mk(150,i=>i%2?-250:20),{paths:300});assert.equal(x.passed,false);});
