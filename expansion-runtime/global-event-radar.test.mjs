import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyPublicActor,scoreGlobalEvent,buildCausalImpactMap,shouldNotifyGlobalEvent,makeGlobalEventRecord,renderGlobalEventAlert} from './global-event-radar.mjs';

test('known public actors are categorized without inferring motives',()=>{
 assert.equal(classifyPublicActor('Donald Trump').id,'donald-trump');
 assert.equal(classifyPublicActor('Elon Musk').id,'elon-musk');
 assert.equal(classifyPublicActor('Unknown Person').known,false);
});
test('unverified social post is not promoted by velocity alone',()=>{
 const s=scoreGlobalEvent({actor:'Elon Musk',topic:'DOGE',novelty:1,independentConfirmation:.05,manipulationRisk:.6,velocity:1,marketConfirmation:.8,severity:.8},{sourceReliability:.5});
 assert.equal(s.status,'UNVERIFIED'); assert.equal(shouldNotifyGlobalEvent(s),false);
});
test('verified event with cross-market confirmation can become high impact',()=>{
 const s=scoreGlobalEvent({actor:'Donald Trump',topic:'TARIFF',novelty:.9,independentConfirmation:.95,manipulationRisk:.05,velocity:.8,marketConfirmation:.9,severity:.9},{sourceReliability:.9});
 assert.equal(s.status,'HIGH_IMPACT'); assert.equal(shouldNotifyGlobalEvent(s),true); assert.equal(shouldNotifyGlobalEvent(s,{previousStatus:'HIGH_IMPACT'}),false);
});
test('impact map separates hypothesized mechanism from observed moves',()=>{
 const m=buildCausalImpactMap({topic:'ENERGY'},{BTC:-1.2,OIL:2.4,GOLD:.3}); assert.equal(m.chain[0],'ENERGY_PRICE'); assert.equal(m.observed.length,3); assert.match(m.meaning,/NOT_CAUSAL_PROOF/);
});
test('alert is compact and evidence focused',()=>{
 const s=scoreGlobalEvent({actor:'Donald Trump',topic:'TARIFF',novelty:.9,independentConfirmation:.95,manipulationRisk:.05,velocity:.8,marketConfirmation:.9,severity:.9},{sourceReliability:.9});
 const map=buildCausalImpactMap({topic:'TARIFF'},{BTC:-.7,NASDAQ:-.4});
 const r=makeGlobalEventRecord({id:'e1',sourceId:'wire',actor:'Donald Trump',headline:'Tariff policy announcement',topic:'TARIFF'},s,map,{asOf:1000});
 const msg=renderGlobalEventAlert(r); assert.match(msg,/GLOBAL EVENT/); assert.match(msg,/BTC -0.70%/); assert.doesNotMatch(msg,/SHADOW_ONLY|ABSTAIN|canExecute/);
});
