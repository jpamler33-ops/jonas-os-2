import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_RUNTIME_FILES, institutionalRuntimeFiles } from './runtime-release-registry.mjs';

test('W6 legacy implementation is covered by release identity',()=>{
  assert.equal(DEFAULT_RUNTIME_FILES.includes('expansion-runtime/memecoin-early-radar.mjs'),true);
  assert.equal(DEFAULT_RUNTIME_FILES.includes('expansion-runtime/memecoin-early-radar-legacy.mjs'),true);
  assert.equal(institutionalRuntimeFiles().includes('expansion-runtime/memecoin-early-radar-legacy.mjs'),true);
});
