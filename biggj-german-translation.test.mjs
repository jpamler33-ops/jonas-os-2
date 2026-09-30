import test from 'node:test';
import assert from 'node:assert/strict';
import {createGermanTranslationProvider} from './biggj-german-translation.mjs';

test('translation provider returns German text and caches it',async()=>{
  let calls=0;
  const fetchImpl=async()=>{calls++;return {ok:true,json:async()=>[[['Bitcoin steigt','Bitcoin rises',null,null]],null,'en']};};
  const p=createGermanTranslationProvider({fetchImpl,now:()=>1000});
  const a=await p.translate('Bitcoin rises');
  const b=await p.translate('Bitcoin rises');
  assert.equal(a.ok,true);
  assert.equal(a.text,'Bitcoin steigt');
  assert.equal(b.cached,true);
  assert.equal(calls,1);
});

test('translation provider fails closed for unavailable provider',async()=>{
  const p=createGermanTranslationProvider({fetchImpl:async()=>{throw new Error('DOWN');},now:()=>1000});
  const out=await p.translate('Market falls');
  assert.equal(out.ok,false);
  assert.equal(out.text,null);
  assert.match(out.error,/DOWN/);
});
