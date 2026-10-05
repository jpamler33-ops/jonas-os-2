import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source=await readFile(new URL('./expansion-runtime/memecoin-early-radar.mjs',import.meta.url),'utf8');

test('W6 v2 remains discovery-only and delegates established radar semantics',()=>{
  assert.match(source,/memecoin-early-radar-legacy\.mjs/);
  assert.match(source,/gecko/i);
  assert.doesNotMatch(source,/canExecuteLive\s*[:=]\s*true/);
  assert.doesNotMatch(source,/automaticPrimaryMutation\s*[:=]\s*true/);
});
