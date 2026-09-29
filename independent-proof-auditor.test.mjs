import test from 'node:test';import assert from 'node:assert/strict';import {auditTcxEvidence} from './independent-proof-auditor.mjs';
const p=(i,pnl,s='BTCUSDT')=>({execution:'SHADOW_ONLY',canExecuteLive:false,status:'CLOSED',entryMode:'STANDARD',symbol:s,openedAt:i*10,closedAt:i*10+5,entryQuote:100,realizedNetPnlQuote:pnl,forecastFingerprint:'f'+i});
test('small evidence fails audit',()=>{const x=auditTcxEvidence({positions:[p(1,2)]});assert.equal(x.passed,false);assert.equal(x.canExecuteLive,false);});
test('duplicate evidence is critical',()=>{const row=p(1,2);const x=auditTcxEvidence({positions:Array.from({length:120},()=>({...row}))});assert.equal(x.findings.duplicateEvidence,true);assert.ok(x.critical.includes('duplicateEvidence'));});
test('auditor detects winner concentration',()=>{const rows=Array.from({length:120},(_,i)=>p(i+1,i===0?1000:1,['BTCUSDT','ETHUSDT','SOLUSDT'][i%3]));const x=auditTcxEvidence({positions:rows});assert.equal(x.findings.winnerConcentration,true);});
