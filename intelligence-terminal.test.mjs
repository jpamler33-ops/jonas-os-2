import test from 'node:test';import assert from 'node:assert/strict';
import {buildSuperRadar,buildSuperSetup,buildSuperRisk,buildSuperSignal} from './intelligence-terminal.mjs';
test('radar ranks evidence without converting it to trade permission',()=>{const x=buildSuperRadar([{symbol:'A',witnessAgreement:.9,support:30,pressureScore:80,eventCount:2,ageMs:1000,status:'VALID'},{symbol:'B',witnessAgreement:.2,support:1,ageMs:100000,status:'VALID'}]);assert.equal(x.rows[0].symbol,'A');assert.equal(x.canExecuteLive,false);});
test('terminal chain fails closed',()=>{const setup=buildSuperSetup({symbol:'BTCUSDT',state:{dashboard:{bias:'NEUTRAL',witnessAgreement:.2},analysis:{}},events:{events:[]},confluence:{zones:[]}});const risk=buildSuperRisk({symbol:'BTCUSDT',state:{market:{spreadBps:20}},accuracy:{ready:false},confluence:{zones:[]}});const sig=buildSuperSignal({symbol:'BTCUSDT',setup,risk});assert.equal(setup.status,'ABSTAIN');assert.equal(sig.status,'ABSTAIN');assert.equal(sig.canExecuteLive,false);});

// CI sync: terminal chain merged with current main.
