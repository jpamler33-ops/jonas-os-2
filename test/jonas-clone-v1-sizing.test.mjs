import test from 'node:test';
import assert from 'node:assert/strict';
import {jonasCloneSizeSol} from '../jonas-clone-v1.mjs';

test('research sizing scales linearly at reference points',()=>{
  assert.equal(jonasCloneSizeSol(10000),4);
  assert.equal(jonasCloneSizeSol(20000),8);
  assert.equal(jonasCloneSizeSol(30000),12);
  assert.equal(jonasCloneSizeSol(40000),16);
});

test('research sizing rejects missing liquidity and caps extreme values',()=>{
  assert.equal(jonasCloneSizeSol(null),null);
  assert.equal(jonasCloneSizeSol(-1),null);
  assert.equal(jonasCloneSizeSol(1000000),80);
});
