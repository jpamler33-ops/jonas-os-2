import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { loadPersistentState, savePersistentState } from './state-store.mjs';

test('round-trips favorites and alerts', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(),'tcx-state-'));
  const file = path.join(dir,'state.json');
  const favorites = new Map([['123',new Set(['BTCUSDT','ETHUSDT'])]]);
  const alerts = new Map([['123',[{symbol:'BTCUSDT',target:70000,direction:'ABOVE',createdAt:123456789}]]]);
  await savePersistentState(file,{favorites,alerts});
  const loaded = await loadPersistentState(file);
  assert.deepEqual([...loaded.favorites.get('123')],['BTCUSDT','ETHUSDT']);
  assert.deepEqual(loaded.alerts.get('123'),[{symbol:'BTCUSDT',target:70000,direction:'ABOVE',createdAt:123456789}]);
  assert.equal(loaded.recoveredFromCorrupt,false);
});

test('sanitizes invalid persisted data', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(),'tcx-state-'));
  const file = path.join(dir,'state.json');
  await writeFile(file,JSON.stringify({
    schemaVersion:1,
    favorites:{'123':['BTCUSDT','BTCUSDT','BAD!'],'abc':['ETHUSDT']},
    alerts:{'123':[
      {symbol:'ETHUSDT',target:10,direction:'BELOW',createdAt:1},
      {symbol:'BAD!',target:-1,direction:'SIDEWAYS',createdAt:0}
    ]}
  }));
  const loaded = await loadPersistentState(file);
  assert.deepEqual([...loaded.favorites.get('123')],['BTCUSDT']);
  assert.equal(loaded.favorites.has('abc'),false);
  assert.equal(loaded.alerts.get('123').length,1);
});

test('recovers from corrupt state without crashing', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(),'tcx-state-'));
  const file = path.join(dir,'state.json');
  await writeFile(file,'{not-json');
  const loaded = await loadPersistentState(file);
  assert.equal(loaded.recoveredFromCorrupt,true);
  assert.equal(loaded.favorites.size,0);
  assert.equal(loaded.alerts.size,0);
  const files = await readdir(dir);
  assert.ok(files.some(name => name.startsWith('state.json.corrupt-')));
});

test('atomic save leaves only final state file', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(),'tcx-state-'));
  const file = path.join(dir,'state.json');
  await savePersistentState(file,{favorites:new Map(),alerts:new Map()});
  const parsed = JSON.parse(await readFile(file,'utf8'));
  assert.equal(parsed.schemaVersion,1);
  const files = await readdir(dir);
  assert.equal(files.some(name => name.includes('.tmp-')),false);
});
