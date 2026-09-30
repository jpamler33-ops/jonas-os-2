import test from 'node:test';import assert from 'node:assert/strict';import {evaluateFrozenCandidate,wilsonLowerBound,costStress} from './discovery-validation.mjs';
test('candidate needs repeated OOS evidence, not one spectacular fold',()=>{const r=evaluateFrozenCandidate({id:'x',folds:[{support:150,lift:2.5}]});assert.equal(r.passes,false);assert.equal(r.gates.enoughFolds,false);});
test('stable repeated candidate can pass research validation gates',()=>{const r=evaluateFrozenCandidate({id:'x',folds:[{support:50,lift:1.2},{support:50,lift:1.3},{support:50,lift:1.15},{support:50,lift:1.25}]});assert.equal(r.passes,true);assert.ok(r.positiveShareWilsonLower95>=0&&r.positiveShareWilsonLower95<=1);});
test('cost stress monotonically reduces mean return',()=>{const x=costStress({grossReturns:[.01,.02,-.005]});for(let i=1;i<x.length;i++)assert.ok(x[i].meanNetReturn<=x[i-1].meanNetReturn);});
test('wilson bound is conservative',()=>{assert.ok(wilsonLowerBound(5,5)<1);});
