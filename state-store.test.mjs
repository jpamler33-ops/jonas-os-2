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
  const alert=loaded.alerts.get('123')[0];
  assert.equal(alert.schemaVersion,2);
  assert.equal(alert.type,'PRICE');
  assert.equal(alert.symbol,'BTCUSDT');
  assert.equal(alert.conditions[0].op,'GTE');
  assert.equal(alert.conditions[0].value,70000);
  assert.equal(alert.once,true);
  assert.equal(loaded.recoveredFromCorrupt,false);
  assert.equal(loaded.loadedSchemaVersion,2);
  assert.equal(loaded.migrationNeeded,false);
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
  assert.equal(parsed.schemaVersion,2);
  const files = await readdir(dir);
  assert.equal(files.some(name => name.includes('.tmp-')),false);
});


test('round-trips native v2 alerts and runtime dedupe state', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(),'tcx-state-'));
  const file = path.join(dir,'state.json');
  const favorites = new Map();
  const alerts = new Map([['123',[{
    schemaVersion:2,
    id:'a_test',
    symbol:'ETHUSDT',
    type:'REGIME_CHANGE',
    label:'Regime changed',
    conditions:[{path:'state.regime',op:'CHANGED'}],
    mode:'ALL',
    createdAt:1000,
    expiresAt:null,
    cooldownMs:900000,
    enabled:true,
    once:false,
    lastFiredAt:2000,
    lastFingerprint:'deadbeef',
    previous:{'state.regime':'RANGE'}
  }]]]);
  await savePersistentState(file,{favorites,alerts});
  const loaded=await loadPersistentState(file);
  const a=loaded.alerts.get('123')[0];
  assert.equal(a.type,'REGIME_CHANGE');
  assert.equal(a.previous['state.regime'],'RANGE');
  assert.equal(a.lastFingerprint,'deadbeef');
});

test('loads schema v1 as backwards-compatible migration', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(),'tcx-state-'));
  const file = path.join(dir,'state.json');
  await writeFile(file,JSON.stringify({
    schemaVersion:1,
    favorites:{},
    alerts:{'123':[{symbol:'BTCUSDT',target:60000,direction:'BELOW',createdAt:10}]}
  }));
  const loaded=await loadPersistentState(file);
  const a=loaded.alerts.get('123')[0];
  assert.equal(a.schemaVersion,2);
  assert.equal(a.conditions[0].op,'LTE');
  assert.equal(loaded.loadedSchemaVersion,1);
  assert.equal(loaded.migrationNeeded,true);
});
