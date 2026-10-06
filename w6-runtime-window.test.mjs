import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('./bot.mjs',import.meta.url),'utf8');
function runtime(env={}){
 const context=vm.createContext({process:{env},Date,Map,Number,String,Math,Infinity,w6UltraCandidateBook:new Map(),w6UltraLaunchStats:{discoveredWithin60:0,first99kObservedWithin60:0,first99kObservedAfter60:0,expiredWithout99k:0}});
 vm.runInContext(source.slice(source.indexOf('function w6UltraCandidateKey('),source.indexOf('async function refreshW6UltraEarlyOnce(')),context);
 return context;
}
test('actual runtime book retains candidates through 60/75/119.999s despite stale env and tracks 99k',()=>{
 const r=runtime({TCX_W6_ULTRA_CANDIDATE_KEEP_SECONDS:'75'}),birth=1700000000000;
 const row={chainId:'solana',tokenAddress:'TEST',pairCreatedAt:birth,marketCap:50000};
 r.enrichW6UltraCandidateRows({capturedAt:birth+30000,rows:[row]});
 for(const age of [60,75,90,119.999])assert.equal(r.currentW6UltraCandidates(birth+age*1000).length,1);
 const x=r.enrichW6UltraCandidateRows({capturedAt:birth+90000,rows:[{...row,marketCap:99000,candidateTracking:true}]});
 assert.equal(x.rows[0].w6LaunchTracker.firstObservedAgeSeconds,30);
 assert.equal(x.rows[0].w6LaunchTracker.first99kObservedAgeSeconds,90);
 assert.equal(r.currentW6UltraCandidates(birth+181000).length,0);
});
test('missing timestamps cannot enter candidate book',()=>{const r=runtime();r.enrichW6UltraCandidateRows({capturedAt:1700000000000,rows:[{tokenAddress:'BAD',pairCreatedAt:null}]});assert.equal(r.w6UltraCandidateBook.size,0);});
test('runtime provider deadline rejects a stalled request and preserves normal results',async()=>{
 const r=vm.createContext({Promise,setTimeout,clearTimeout,Error});
 vm.runInContext(source.slice(source.indexOf('async function w6BoundedAwait('),source.indexOf('let w6SolPriceCache=')),r);
 await assert.rejects(r.w6BoundedAwait(new Promise(()=>{}),5,'FEED'),/FEED_TIMEOUT/);
 assert.equal(await r.w6BoundedAwait(Promise.resolve(7),100,'FEED'),7);
});
