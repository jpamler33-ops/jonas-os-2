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
 const provider=createMemecoinEarlyRadarProvider({fetchImpl,gmgnApiKey:'',gmgnPublicEnabled:false,now:()=>now,ultraDexCacheMs:5000,ultraGeckoCacheMs:30000});
 return {provider,calls,setNow:t=>{now=t;}};
}
test('Dex latest boosts preserve discovery during Gecko 429 but cannot impersonate exact GMGN',async()=>{
 const {provider}=setup();const snapshot=await provider.fetchUltraEarlySolana();const row=snapshot.rows.find(x=>x.tokenAddress==='FAST');
 assert.ok(row);assert.equal(row.marketCap,120000);assert.equal(row.attentionSemantics,'PAID_BOOST_ATTENTION_PROXY');assert.equal(row.gmgnExactTrend,false);
 const update=applyJonasCloneSnapshot(createSpecialistWalletState(),snapshot,{now:start,solPriceUsd:120});
 assert.equal(update.results.opened,0);assert.equal(update.state.wallets[W6].positions.length,0);
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
test('new-pool discovery is not relabelled as exact GMGN or allowed to enter the clone',async()=>{
 const {provider}=setup({newPool:true,profile:true});const snapshot=await provider.fetchUltraEarlySolana();
 const row=snapshot.rows.find(x=>x.tokenAddress==='FAST');assert.equal(row.signalNewPair,true);assert.equal(row.signalTrending,false);
 assert.equal(applyJonasCloneSnapshot(createSpecialistWalletState(),snapshot,{now:start,solPriceUsd:120}).results.opened,0);
});

test('exact GMGN New Pair result returns before hung optional multifeed discovery',async()=>{
 let optionalCalls=0;
 const fetchImpl=async(url)=>{
  const u=new URL(url);
  if(u.hostname==='openapi.gmgn.ai'&&u.pathname==='/v1/trenches'){
   await new Promise(resolve=>setTimeout(resolve,120));
   return json({code:0,data:{new_creation:[{
    address:'EXACT',symbol:'EXACT',name:'Exact Meme',price:'0.001',
    liquidity:'20000',usd_market_cap:'120000',
    created_timestamp:Math.floor((start-20_000)/1000)
   }]}});
  }
  if(u.hostname==='api.dexscreener.com'&&u.pathname.startsWith('/tokens/v1/solana/')){
   return json([pair('EXACT',start-20_000)]);
  }
  if(
   u.hostname==='api.geckoterminal.com'||
   u.pathname==='/token-boosts/latest/v1'||
   u.pathname==='/token-profiles/latest/v1'
  ){
   optionalCalls++;
   return new Promise(()=>{});
  }
  throw new Error('unexpected '+url);
 };
 const provider=createMemecoinEarlyRadarProvider({
  fetchImpl,now:()=>start,gmgnApiKey:'gmgn_solbscbaseethmonadtron',gmgnPublicEnabled:false,
  gmgnRequestGapMs:0,ultraDiscoveryTimeoutMs:250,ultraEnrichmentTimeoutMs:100,ultraLegacyTimeoutMs:50
 });
 const began=Date.now();
 const snapshot=await provider.fetchUltraEarlySolana({maxAgeSeconds:120});
 const elapsed=Date.now()-began;
 assert.equal(snapshot.exactGmgn,true);
 assert.equal(snapshot.source,'GMGN_OPENAPI_NEW_CREATION_1M');
 assert.equal(snapshot.rows[0].tokenAddress,'EXACT');
 assert.equal(snapshot.feedStatus.optionalDiscovery.awaited,false);
 assert.equal(snapshot.feedStatus.optionalDiscovery.started,false);
 assert.equal(snapshot.feedStatus.optionalDiscovery.reason,'EXACT_GMGN_READY');
 assert.equal(optionalCalls,0,'optional free feeds must not start in GMGN-configured W6 hotpath');
 assert.ok(elapsed>=100&&elapsed<500,'exact GMGN should bypass the duplicate wrapper deadline but not optional feed deadlines');
 assert.equal(snapshot.canExecuteLive,false);
});

function deadlineProvider(handler,options={}){
 return createMemecoinEarlyRadarProvider({gmgnApiKey:'',gmgnPublicEnabled:false,now:()=>start,
  ultraDiscoveryTimeoutMs:50,ultraEnrichmentTimeoutMs:50,ultraLegacyTimeoutMs:80,
  fetchImpl:async(url,opts)=>{
   const u=new URL(url);
   const out=await handler(u,opts);
   if(out)return out;
   if(u.pathname.includes('/trending_pools'))return json({data:[]});
   if(u.pathname==='/token-boosts/top/v1')return json([]);
   if(u.pathname==='/token-boosts/latest/v1'||u.pathname==='/token-profiles/latest/v1')return json([]);
   if(u.pathname.includes('/new_pools'))return json({data:[]});
   throw new Error('unexpected '+url);
  },...options});
}
test('enrichment batches start together and one failure retains usable discovery rows',async()=>{
 const started=[];let release;
 const barrier=new Promise(resolve=>{release=resolve;});
 const provider=deadlineProvider(async u=>{
  if(u.pathname==='/token-boosts/latest/v1')return json(Array.from({length:30},(_,i)=>({chainId:'solana',tokenAddress:'B'+i,amount:1})));
  if(u.pathname==='/token-profiles/latest/v1')return json(Array.from({length:30},(_,i)=>({chainId:'solana',tokenAddress:'P'+i})));
  if(u.pathname.startsWith('/tokens/v1/solana/')){
   const batch=u.pathname.split('/').at(-1).split(',');started.push(batch);
   if(started.length===2)release();
   await barrier;
   if(batch[0]==='P0')throw new Error('ONE_BATCH_DOWN');
   return json(batch.map(token=>pair(token,start-25000)));
  }
 });
 const snapshot=await provider.fetchUltraEarlySolana({maxAgeSeconds:120});
 assert.equal(started.length,2);assert.equal(snapshot.feedStatus.dexEnrichment.fulfilled,1);
 assert.equal(snapshot.feedStatus.dexEnrichment.failed,1);
 assert.ok(snapshot.errors.some(x=>x.includes('ONE_BATCH_DOWN')));
 assert.equal(snapshot.rows.length,30);assert.equal(snapshot.rows[0].marketCap,120000);
 const update=applyJonasCloneSnapshot(createSpecialistWalletState(),snapshot,{now:start,solPriceUsd:120});
 assert.equal(update.results.opened,0);assert.equal(snapshot.execution,'SHADOW_ONLY');assert.equal(snapshot.canExecuteLive,false);
});
test('hung optional enrichment/body reader cannot block complete new-pool discovery',async()=>{
 let signal;
 const provider=deadlineProvider(async(u,opts)=>{
  if(u.pathname.includes('/new_pools'))return json({data:[{id:'solana_p',attributes:{pool_created_at:new Date(start-25000).toISOString(),base_token_price_usd:'.001',reserve_in_usd:'20000',market_cap_usd:'120000'},relationships:{base_token:{data:{id:'solana_FAST'}}}}],included:[{id:'solana_FAST',attributes:{address:'FAST',symbol:'FAST'}}]});
  if(u.pathname.startsWith('/tokens/v1/solana/')){signal=opts.signal;return {ok:true,json:()=>new Promise(()=>{})};}
 });
 const began=Date.now(),snapshot=await provider.fetchUltraEarlySolana({maxAgeSeconds:120});
 assert.ok(Date.now()-began<500);assert.equal(signal.aborted,true);
 assert.equal(snapshot.rows[0].marketCap,120000);assert.ok(snapshot.errors.some(x=>x.includes('W6_REQUEST_TIMEOUT')));
 assert.equal(applyJonasCloneSnapshot(createSpecialistWalletState(),snapshot,{now:start,solPriceUsd:120}).results.opened,0);
});
test('slow legacy discovery and individual seed failure do not discard healthy Dex discovery',async()=>{
 let legacyCalls=0;
 const provider=deadlineProvider(async u=>{
  if(u.pathname.includes('/trending_pools')){legacyCalls++;return new Promise(()=>{});}
  if(u.pathname==='/token-profiles/latest/v1')throw new Error('PROFILE_DOWN');
  if(u.pathname==='/token-boosts/latest/v1')return json([{chainId:'solana',tokenAddress:'FAST',amount:1}]);
  if(u.pathname.startsWith('/tokens/v1/solana/'))return json([pair('FAST',start-25000)]);
 });
 const snapshot=await provider.fetchUltraEarlySolana({maxAgeSeconds:120});
 assert.equal(snapshot.rows[0].marketCap,120000);assert.ok(snapshot.errors.some(x=>x.includes('W6_LEGACY_DISCOVERY_TIMEOUT')));
 assert.ok(snapshot.errors.some(x=>x.includes('PROFILE_DOWN')));
 await provider.fetchUltraEarlySolana({maxAgeSeconds:120});assert.equal(legacyCalls,1);
});

const retainedCandidate=(patch={})=>({chainId:'solana',tokenAddress:'RETAINED',pairCreatedAt:start-90000,
 firstSeenAt:start-70000,marketCap:80000,priceUsd:'.001',liquidityUsd:20000,signalTrending:true,...patch});
test('retained candidate market-cap crossing cannot masquerade as GMGN +99k% during legacy timeout',async()=>{
 const provider=deadlineProvider(async u=>{
  if(u.pathname.includes('/trending_pools'))return new Promise(()=>{});
  if(u.pathname.startsWith('/tokens/v1/solana/'))return json([pair('RETAINED',start-90000)]);
 },{timeoutMs:1000});
 const snapshot=await provider.fetchUltraEarlySolana({candidateRows:[retainedCandidate()],maxAgeSeconds:120});
 const row=snapshot.rows.find(x=>x.tokenAddress==='RETAINED');
 assert.ok(row);assert.equal(row.marketCap,120000);assert.equal(row.pairCreatedAt,start-90000);
 assert.equal(row.firstSeenAt,start-70000);assert.equal(row.candidateTracking,true);
 assert.equal(row.signalTrending,false);assert.equal(snapshot.candidateTrackingRows,1);
 assert.equal(applyJonasCloneSnapshot(createSpecialistWalletState(),snapshot,{now:start,solPriceUsd:120}).results.opened,0);
});
test('missing candidate enrichment never relabels previous qualifying marks as fresh',async()=>{
 const provider=deadlineProvider(async u=>{
  if(u.pathname.startsWith('/tokens/v1/solana/'))return new Promise(()=>{});
 });
 const snapshot=await provider.fetchUltraEarlySolana({candidateRows:[retainedCandidate({marketCap:120000})],maxAgeSeconds:120});
 assert.equal(snapshot.rows.length,0);assert.equal(applyJonasCloneSnapshot(createSpecialistWalletState(),snapshot,{now:start,solPriceUsd:120}).results.opened,0);
});
test('unknown current cap does not reuse retained historic cap; 120-second candidates expire',async()=>{
 const requests=[];
 const provider=deadlineProvider(async u=>{
  if(u.pathname.startsWith('/tokens/v1/solana/')){requests.push(u.pathname);return json([pair('RETAINED',start-90000,{marketCap:null})]);}
 });
 const snapshot=await provider.fetchUltraEarlySolana({candidateRows:[retainedCandidate({marketCap:120000}),
  retainedCandidate({tokenAddress:'EXPIRED',pairCreatedAt:start-120000})],maxAgeSeconds:180});
 assert.equal(snapshot.rows[0].marketCap,null);assert.equal(snapshot.rows[0].fdv,150000);
 assert.ok(!snapshot.rows.some(x=>x.tokenAddress==='EXPIRED'));
 assert.equal(applyJonasCloneSnapshot(createSpecialistWalletState(),snapshot,{now:start,solPriceUsd:120}).results.opened,0);
});
test('open positions stay independently marked outside discovery age window and cannot become entries',async()=>{
 const provider=deadlineProvider(async u=>{
  if(u.pathname.startsWith('/tokens/v1/solana/'))return json([pair('OPEN',start-600000)]);
 });
 const snapshot=await provider.fetchUltraEarlySolana({trackTokenAddresses:['OPEN'],maxAgeSeconds:120});
 assert.equal(snapshot.rows.length,1);assert.equal(snapshot.rows[0].w6TrackingOnly,true);
 assert.equal(snapshot.trackingRows,1);assert.equal(snapshot.discoveryRows,0);
 assert.equal(applyJonasCloneSnapshot(createSpecialistWalletState(),snapshot,{now:start,solPriceUsd:120}).results.opened,0);
});

test('rediscovered retained token keeps original launch age during legacy failure',async()=>{
 const provider=deadlineProvider(async u=>{
  if(u.pathname.includes('/trending_pools'))return new Promise(()=>{});
  if(u.pathname==='/token-boosts/latest/v1')return json([{chainId:'solana',tokenAddress:'RETAINED',amount:1}]);
  if(u.pathname.startsWith('/tokens/v1/solana/'))return json([pair('RETAINED',start-5000)]);
 },{timeoutMs:1000});
 const snapshot=await provider.fetchUltraEarlySolana({candidateRows:[retainedCandidate()],maxAgeSeconds:120});
 assert.equal(snapshot.rows[0].pairCreatedAt,start-90000);assert.equal(snapshot.rows[0].firstSeenAt,start-70000);
});
test('position rediscovered through boost feed remains tracking-only beyond entry window',async()=>{
 const provider=deadlineProvider(async u=>{
  if(u.pathname==='/token-boosts/latest/v1')return json([{chainId:'solana',tokenAddress:'OPEN',amount:1}]);
  if(u.pathname.startsWith('/tokens/v1/solana/'))return json([pair('OPEN',start-600000)]);
 });
 const snapshot=await provider.fetchUltraEarlySolana({trackTokenAddresses:['OPEN'],maxAgeSeconds:120});
 assert.equal(snapshot.rows[0].w6TrackingOnly,true);assert.equal(snapshot.trackingRows,1);assert.equal(snapshot.discoveryRows,0);
});


test('retained exact GMGN New Pair candidates keep receiving scarce token-info coverage until <120s expires',async()=>{
 let tokenInfoCalls=[];
 const retained={
  chainId:'solana',tokenAddress:'RETAINED99',pairAddress:'RETAINED99PAIR',
  symbol:'R99',name:'Retained 99',priceUsd:'.001',liquidityUsd:20000,
  marketCap:120000,fdv:150000,pairCreatedAt:start-60_000,firstSeenAt:start-60_000,
  signalTrending:true,signalNewPair:true,gmgnExactTrend:true,gmgnExactNewPair:true,
  sourceSetup:'GMGN_NEW_PAIR_1M',trendSource:'GMGN_OPENAPI_NEW_CREATION_1M'
 };
 const fetchImpl=async(url)=>{
  const u=new URL(url);
  if(u.hostname==='openapi.gmgn.ai'&&u.pathname==='/v1/trenches'){
   return json({code:0,data:{new_creation:[{
    address:'CURRENT55',symbol:'CUR',name:'Current',price:'0.001',
    liquidity:'20000',usd_market_cap:'120000',
    created_timestamp:Math.floor((start-55_000)/1000)
   }]}});
  }
  if(u.hostname==='openapi.gmgn.ai'&&u.pathname==='/v1/token/info'){
   const address=u.searchParams.get('address');
   tokenInfoCalls.push(address);
   if(address==='RETAINED99')return json({code:0,data:{address,price:{price:'1000',price_1m:'0.001'}}});
   return json({code:0,data:{address,price:{price:'0.0011',price_1m:'0.001'}}});
  }
  if(u.hostname==='api.dexscreener.com'&&u.pathname.startsWith('/tokens/v1/solana/')){
   return json([
    pair('RETAINED99',start-60_000,{priceUsd:'1000',marketCap:120000,liquidity:{usd:20000}}),
    pair('CURRENT55',start-55_000,{priceUsd:'.001',marketCap:120000,liquidity:{usd:20000}})
   ]);
  }
  throw new Error('unexpected '+url);
 };
 const provider=createMemecoinEarlyRadarProvider({
  fetchImpl,now:()=>start,gmgnApiKey:'gmgn_solbscbaseethmonadtron',gmgnPublicEnabled:false,
  gmgnTokenInfoSamplePerCycle:1,gmgnRequestGapMs:0,ultraEnrichmentTimeoutMs:250
 });
 const snapshot=await provider.fetchUltraEarlySolana({candidateRows:[retained],maxAgeSeconds:120});
 const row=snapshot.rows.find(x=>x.tokenAddress==='RETAINED99');
 assert.ok(row);
 assert.deepEqual(tokenInfoCalls,['RETAINED99']);
 assert.equal(snapshot.gmgnTokenInfoCandidateMemoryEligible,1);
 assert.equal(snapshot.gmgnTokenInfoCandidateMemorySampled,1);
 assert.equal(row.candidateTracking,true);
 assert.equal(row.gmgnExactNewPair,true);
 assert.equal(row.gmgnExactOneMinutePerformance,true);
 assert.ok(row.gmgnDisplayedChangePct>=99_000);
 assert.equal(row.gmgnOneMinutePerformanceSource,'GMGN_OPENAPI_TOKEN_INFO_PRICE_1M');
 assert.equal(snapshot.execution,'SHADOW_ONLY');
 assert.equal(snapshot.canExecuteLive,false);
});
