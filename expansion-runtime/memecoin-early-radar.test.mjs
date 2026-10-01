import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MEMECOIN_EARLY_RADAR_VERSION,
  scoreEarlyMemecoin,
  applyExternalMemecoinAttention,
  createMemecoinEarlyRadarProvider
} from './memecoin-early-radar.mjs';

test('early score favors fresh active attention without making profit claims',()=>{
  const now=2_000_000_000_000;
  const fresh=scoreEarlyMemecoin({
    pairCreatedAt:now-8*60_000,liquidityUsd:40_000,volumeM5:18_000,
    buysM5:35,sellsM5:12,priceChangeM5:18,marketCap:350_000,
    signalProfile:true,signalBoost:true,xLinked:true,websiteLinked:true
  },{now});
  const old=scoreEarlyMemecoin({
    pairCreatedAt:now-3*24*60*60_000,liquidityUsd:1_000_000,volumeM5:5_000,
    buysM5:8,sellsM5:7,priceChangeM5:1,marketCap:100_000_000
  },{now});
  assert.ok(fresh.researchPriorityScore>old.researchPriorityScore);
  assert.equal(fresh.epistemic,'RESEARCH_PRIORITY_NOT_PROFIT_PROBABILITY');
  assert.ok(['NEW_NOW','EARLY'].includes(fresh.stage));
});

test('ultra thin one-sided pool is risk-only even when new',()=>{
  const now=2_000_000_000_000;
  const x=scoreEarlyMemecoin({
    pairCreatedAt:now-2*60_000,liquidityUsd:900,volumeM5:5000,
    buysM5:30,sellsM5:0,priceChangeM5:80,signalBoost:true
  },{now});
  assert.equal(x.stage,'RISK_ONLY');
  assert.ok(x.riskFlags.includes('LIQUIDITY_EXTREME_THIN'));
  assert.ok(x.riskFlags.includes('ONE_SIDED_NO_SELLS_OBSERVED'));
});

test('external exact token mention raises attention without claiming causality',()=>{
  const now=2_000_000_000_000;
  const snap={capturedAt:now,rows:[{
    chainId:'solana',tokenAddress:'abc',symbol:'MOONX',name:'Moon X',
    pairCreatedAt:now-20*60_000,liquidityUsd:30000,buysM5:15,sellsM5:7,volumeM5:8000
  }]};
  const out=applyExternalMemecoinAttention(snap,[{title:'Traders discuss $MOONX after viral launch',url:'https://example.test',source:'test'}]);
  assert.equal(out.rows[0].externalAttentionCount,1);
  assert.ok(out.rows[0].score.attentionSignals.includes('EXTERNAL_MENTION'));
});

test('provider merges keyless new pools with DexScreener launch-attention signals',async()=>{
  const now=2_000_000_000_000;
  const json=data=>({ok:true,status:200,json:async()=>data});
  const fetchImpl=async url=>{
    const u=new URL(url);
    if(u.hostname==='api.dexscreener.com'&&u.pathname==='/token-profiles/latest/v1')return json([{
      chainId:'solana',tokenAddress:'SoLabc',description:'new cat meme',
      links:[{type:'twitter',url:'https://x.com/catmeme'}]
    }]);
    if(u.hostname==='api.dexscreener.com'&&u.pathname==='/token-boosts/latest/v1')return json([{chainId:'solana',tokenAddress:'SoLabc',amount:10,totalAmount:20}]);
    if(u.hostname==='api.dexscreener.com'&&u.pathname==='/community-takeovers/latest/v1')return json([]);
    if(u.hostname==='api.dexscreener.com'&&u.pathname==='/ads/latest/v1')return json([]);
    if(u.hostname==='api.dexscreener.com'&&u.pathname.includes('/token-pairs/v1/solana/SoLabc'))return json([{
      chainId:'solana',pairAddress:'Pair1',dexId:'raydium',url:'https://dex.test',
      baseToken:{address:'SoLabc',symbol:'CATX',name:'Cat X'},quoteToken:{symbol:'SOL'},
      priceUsd:'0.001',liquidity:{usd:42000},volume:{m5:12000,h1:50000,h24:90000},
      txns:{m5:{buys:30,sells:11},h1:{buys:90,sells:40}},priceChange:{m5:22,h1:40},
      marketCap:420000,fdv:500000,pairCreatedAt:now-10*60_000,
      info:{socials:[{platform:'twitter',handle:'catmeme'}]}
    }]);
    if(u.hostname==='api.geckoterminal.com')return json({data:[],included:[]});
    throw new Error('unexpected '+url);
  };
  const p=createMemecoinEarlyRadarProvider({
    fetchImpl,networks:['solana'],dexCacheMs:1,geckoCacheMs:1,now:()=>now,pairLookupLimit:4
  });
  const out=await p.fetchEarlyRadar({limit:5,force:true});
  assert.equal(out.version,MEMECOIN_EARLY_RADAR_VERSION);
  assert.equal(out.sourceReady,true);
  assert.equal(out.rows[0].symbol,'CATX');
  assert.equal(out.rows[0].xLinked,true);
  assert.ok(out.rows[0].score.attentionSignals.includes('NEW_PROFILE'));
  assert.ok(out.rows[0].score.attentionSignals.includes('NEW_BOOST'));
  assert.ok(out.rows[0].score.researchPriorityScore>0.5);
  assert.equal(out.execution,'SHADOW_ONLY');
  assert.equal(out.canExecuteLive,false);
});
