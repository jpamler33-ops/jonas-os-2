import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {applyJonasCloneSnapshot} from './jonas-clone-v1-integration.mjs';
import {createSpecialistWalletState,saveSpecialistWalletState,loadSpecialistWalletState,WALLET_6_USER_99K_60S as W6} from './shadow-specialist-wallets.mjs';
const now=1700000000000;
const row={chainId:'solana',tokenAddress:'CLONE',symbol:'CLONE',priceUsd:1,marketCap:120000,liquidityUsd:20000,pairCreatedAt:now-25000,signalTrending:true};
const snapshot=(rows,capturedAt=now)=>({sourceReady:true,capturedAt,rows});
const apply=(state,rows,time=now)=>applyJonasCloneSnapshot(state,snapshot(rows,time),{now:time,solPriceUsd:120});
test('production adapter opens clone at actual hypothesis exposure, preserves wallets and blocks duplicates',()=>{
 const original=createSpecialistWalletState(),x=apply(original,[row]),p=x.state.wallets[W6].positions[0];
 assert.equal(x.results.opened,1);assert.equal(p.strategyVersion,'JONAS_CLONE_V1');
 assert.equal(p.entryNotionalSol,8);assert.equal(p.exposureQuote,960);assert.equal(p.canExecuteLive,false);
 assert.deepEqual(x.state.wallets.W4_MEME_SCOUT,original.wallets.W4_MEME_SCOUT);
 assert.equal(apply(x.state,[row]).results.opened,0);assert.equal(original.wallets[W6].positions.length,0);
});
test('missing liquidity, unknown/future age, tracking-only, not trending and unready sources abstain',()=>{
 for(const patch of [{liquidityUsd:null},{pairCreatedAt:null},{pairCreatedAt:now+1},{w6TrackingOnly:true},{signalTrending:false}])assert.equal(apply(createSpecialistWalletState(),[{...row,...patch}]).results.opened,0);
 assert.equal(applyJonasCloneSnapshot(createSpecialistWalletState(),{...snapshot([row]),sourceReady:false},{now,solPriceUsd:120}).results.opened,0);
});
test('six checkpoints persist, four exit comparisons use observed time; small initial loss remains open',async()=>{
 let x=apply(createSpecialistWalletState(),[row]);
 for(const seconds of [60,120,180,240,300,600])x=apply(x.state,[{...row,w6TrackingOnly:true,priceUsd:seconds===60?.95:1.1}],now+seconds*1000);
 const p=x.state.wallets[W6].positions[0];assert.ok(p);assert.equal(p.jonasClone.checkpoints.length,6);
 assert.deepEqual(p.jonasClone.checkpoints.filter(c=>c.exitComparison).map(c=>c.targetSeconds),[180,240,300,600]);
 assert.equal(p.jonasClone.checkpoints[0].status,'OBSERVED');assert.ok(p.jonasClone.maeReturnPct<0);
 const dir=await mkdtemp(path.join(tmpdir(),'clone-state-'));
 try{const file=path.join(dir,'state.json');await saveSpecialistWalletState(file,x.state);const loaded=await loadSpecialistWalletState(file);assert.equal(loaded.healthy,true);assert.deepEqual(loaded.state.wallets[W6].positions[0].jonasClone,p.jonasClone);}finally{await rm(dir,{recursive:true,force:true});}
});
test('late observations cannot masquerade as on-time profitable exits and zero liquidity has no modelled net profit',()=>{
 let x=apply(createSpecialistWalletState(),[row]);x=apply(x.state,[{...row,w6TrackingOnly:true,priceUsd:1.2,liquidityUsd:0}],now+400000);
 const c=x.state.wallets[W6].positions[0].jonasClone.checkpoints[0];
 assert.equal(c.status,'LATE_OBSERVATION');assert.equal(c.holdSeconds,400);assert.equal(c.modelledNetPnlSol,null);
});
test('legacy W6 positions remain legacy across clone deployment',()=>{
 const state=structuredClone(createSpecialistWalletState());
 state.wallets[W6].positions.push({walletId:W6,positionKey:'legacy',chainId:'solana',tokenAddress:'OLD',entryPrice:1,lastPrice:1,openedAt:now-10000,exposureQuote:100,marginQuote:100,status:'OPEN',side:'LONG',strategyVersion:'LEGACY'});
 const x=apply(state,[]);assert.equal(x.state.wallets[W6].positions[0].strategyVersion,'LEGACY');assert.equal(x.state.wallets[W6].positions[0].jonasClone,undefined);
});

test('stale or future snapshots cannot open clone positions',()=>{
 for(const capturedAt of [now-16000,now+1,null])assert.equal(applyJonasCloneSnapshot(createSpecialistWalletState(),snapshot([row],capturedAt),{now,solPriceUsd:120}).results.opened,0);
});
