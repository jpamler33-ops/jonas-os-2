import test from 'node:test';
import assert from 'node:assert/strict';
import {createMemecoinEarlyRadarProvider} from './expansion-runtime/memecoin-early-radar.mjs';
import {applyJonasCloneSnapshot} from './jonas-clone-v1-integration.mjs';
import {createSpecialistWalletState,WALLET_6_USER_99K_60S as W6} from './shadow-specialist-wallets.mjs';
const start=1700000000000;
const json=body=>({ok:true,status:200,json:async()=>body});
const pair=(token,time,patch={})=>({chainId:'solana',baseToken:{address:token,symbol:token},pairAddress:token+'PAIR',priceUsd:'.001',marketCap:120000,fdv:150000,pairCreatedAt:time,liquidity:{usd:20000},txns:{m5:{buys:20,sells:5}},...patch});
function setup({newPool=false,profile=false,missingCap=false,secondPool=false}={}){
 let now=start;const calls=[];
 const fetchImpl=async(url)=>{
  calls.push({url,at:now});const u=new URL(url);
  if(u.hostname==='api.geckoterminal.com'){
   if(newPool&&u.pathname.endsWith('/new_pools'))return json({data:[{id:'solana_p',attributes:{pool_created_at:new Date(start-25000).toISOString(),base_token_price_usd:'.001',reserve_in_usd:'20000',market_cap_usd:null,fdv_usd:'150000'},relationships:{base_token:{data:{id:'solana_FAST'}}}}],included:[{id:'solana_FAST',attributes:{address:'FAST',symbol:'FAST'}}]});
   return {ok:false,status:429,headers:{get:()=> '120'}};
  }
  if(u.pathname==='/token-boosts/top/v1')return json([]);
  if(u.pathname==='/token-boosts/latest/v1')return json(profile?[]:[{chainId:'solana',tokenAddress:'FAST',amount:10}]);
  if(u.pathname==='/token-profiles/latest/v1')return json(profile?[{chainId:'solana',tokenAddress:'FAST'}]:[]);
  if(u.pathname.startsWith('/tokens/v1/solana/'))return json([pair('FAST',secondPool?start-5000:start-25000,{marketCap:missingCap?null:120000})]);
  throw new Error('unexpected '+url);
 };
 const provider=createMemecoinEarlyRadarProvider({fetchImpl,gmgnPublicEnabled:false,now:()=>now,ultraDexCacheMs:5000,ultraGeckoCacheMs:30000});
 return {provider,calls,setNow:t=>{now=t;}};
}
test('Dex latest boosts produce an independent fully enriched clone candidate during Gecko 429',async()=>{
 const {provider}=setup();const snapshot=await provider.fetchUltraEarlySolana();const row=snapshot.rows.find(x=>x.tokenAddress==='FAST');
 assert.ok(row);assert.equal(row.marketCap,120000);assert.equal(row.attentionSemantics,'PAID_BOOST_ATTENTION_PROXY');assert.equal(row.gmgnExactTrend,false);
 const update=applyJonasCloneSnapshot(createSpecialistWalletState(),snapshot,{now:start,solPriceUsd:120});
 assert.equal(update.results.opened,1);assert.equal(update.state.wallets[W6].positions[0].entryNotionalSol,8);
});
test('profile discovery alone cannot invent trend visibility',async()=>{
 const {provider}=setup({profile:true});const snapshot=await provider.fetchUltraEarlySolana();
 assert.equal(snapshot.rows.find(x=>x.tokenAddress==='FAST').signalTrending,false);
 assert.equal(applyJonasCloneSnapshot(createSpecialistWalletState(),snapshot,{now:start,solPriceUsd:120}).results.opened,0);
});
test('FDV is not substituted for unknown market cap',async()=>{
 const {provider}=setup({missingCap:true});const snapshot=await provider.fetchUltraEarlySolana();
 assert.equal(snapshot.rows[0].marketCap,null);assert.equal(snapshot.rows[0].fdv,150000);
 assert.equal(applyJonasCloneSnapshot(createSpecialistWalletState(),snapshot,{now:start,solPriceUsd:120}).results.opened,0);
});
test('Gecko discovered missing cap is enriched independently; newer pool does not reset birth time',async()=>{
 const {provider}=setup({newPool:true,secondPool:true});const snapshot=await provider.fetchUltraEarlySolana();
 const row=snapshot.rows.find(x=>x.tokenAddress==='FAST');assert.equal(row.marketCap,120000);assert.equal(row.pairCreatedAt,start-25000);assert.equal(row.marketCapSource,'DEXSCREENER');
});
test('429 Retry-After protects new-pool feed while Dex continues polling',async()=>{
 const {provider,calls,setNow}=setup();await provider.fetchUltraEarlySolana();setNow(start+20000);await provider.fetchUltraEarlySolana({force:true});
 assert.equal(calls.filter(x=>x.url.includes('/new_pools')).length,1);
 assert.equal(calls.filter(x=>x.url.includes('/token-boosts/latest')).length,2);
 setNow(start+121000);await provider.fetchUltraEarlySolana();assert.equal(calls.filter(x=>x.url.includes('/new_pools')).length,2);
});
test('successful new-pool response is reused until its 30-second cache expires',async()=>{
 const {provider,calls,setNow}=setup({newPool:true});await provider.fetchUltraEarlySolana();setNow(start+5000);await provider.fetchUltraEarlySolana();
 assert.equal(calls.filter(x=>x.url.includes('/new_pools')).length,1);
 setNow(start+31000);await provider.fetchUltraEarlySolana();assert.equal(calls.filter(x=>x.url.includes('/new_pools')).length,2);
});
test('new-pool discovery is not relabelled as a current trend',async()=>{
 const {provider}=setup({newPool:true,profile:true});const snapshot=await provider.fetchUltraEarlySolana();
 const row=snapshot.rows.find(x=>x.tokenAddress==='FAST');assert.equal(row.signalNewPair,true);assert.equal(row.signalTrending,false);
 assert.equal(applyJonasCloneSnapshot(createSpecialistWalletState(),snapshot,{now:start,solPriceUsd:120}).results.opened,0);
});
