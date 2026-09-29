import test from 'node:test';
import assert from 'node:assert/strict';

import {
  EXPANSION_PACK_PROVENANCE,
  EXPANSION_PACK_PROVENANCE_HASH,
  verifyExpansionPackProvenance
} from './provenance.mjs';

test('expansion pack provenance is deterministic and immutable-by-hash',()=>{
  const v=verifyExpansionPackProvenance();
  assert.equal(v.ok,true);
  assert.equal(v.hash,EXPANSION_PACK_PROVENANCE_HASH);
  assert.equal(EXPANSION_PACK_PROVENANCE.package.version,'3.0.0-alpha.insertable.1');
  assert.equal(EXPANSION_PACK_PROVENANCE.package.zipSha256,'e15a7c66bbbdcfcb8c3680842e0071e2728cb872592b455b073fd218681f2180');
});

test('expansion provenance hard-codes no-live and no-duplicate-truth invariants',()=>{
  assert.equal(EXPANSION_PACK_PROVENANCE.invariants.executionMode,'SHADOW_ONLY');
  assert.equal(EXPANSION_PACK_PROVENANCE.invariants.canExecuteLive,false);
  assert.equal(EXPANSION_PACK_PROVENANCE.invariants.duplicateTruthForbidden,true);
  assert.equal(EXPANSION_PACK_PROVENANCE.intentionallyNotCopiedWholesale,true);
});
