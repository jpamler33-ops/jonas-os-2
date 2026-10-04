import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MEMECOIN_EARLY_RADAR_VERSION,
  W6_ULTRA_EARLY_FEED_VERSION,
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

test('crash and liquidity-to-cap data anomalies are forced to risk-only',()=>{
  const now=2_000_000_000_000;
  const x=scoreEarlyMemecoin({
    pairCreatedAt:now-7*60_000,liquidityUsd:11_090_000,volumeM5:2800,
    buysM5:5,sellsM5:2,priceChangeM5:-100,marketCap:859.33,
    signalNewPool:true
  },{now});
  assert.equal(x.stage,'RISK_ONLY');
  assert.ok(x.riskFlags.includes('M5_CRASH_EXTREME'));
  assert.ok(x.riskFlags.includes('DATA_ANOMALY_MCAP_LIQUIDITY'));
  assert.ok(x.researchPriorityScore<.5);
});

test('severe drawdown is penalized even before hard-crash threshold',()=>{
  const now=2_000_000_000_000;
  const x=scoreEarlyMemecoin({
    pairCreatedAt:now-15*60_000,liquidityUsd:50_000,volumeM5:8_000,
    buysM5:15,sellsM5:14,priceChangeM5:-60,marketCap:300_000
  },{now});
  assert.ok(x.riskFlags.includes('M5_DRAWDOWN_SEVERE'));
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

test('W6 trend-first feed keeps fresh Solana launch age while enriching market cap in one Dex batch',async()=>{
  const now=2_100_000_000_000;
  const json=data=>({ok:true,status:200,json:async()=>data});
  const calls=[];
  const fetchImpl=async url=>{
    calls.push(url);
    const u=new URL(url);
    if(u.hostname==='api.geckoterminal.com'&&u.pathname==='/api/v2/networks/solana/trending_pools')return json({
      data:[{
        id:'solana_PAIRFAST',
        attributes:{
          address:'PAIRFAST',name:'FAST / SOL',base_token_price_usd:'0.001',
          reserve_in_usd:'45000',pool_created_at:new Date(now-22_000).toISOString(),
          volume_usd:{m5:'5000',h1:'5000'},transactions:{m5:{buys:20,sells:4},h1:{buys:20,sells:4}},
          price_change_percentage:{m5:'12',h1:'12'},market_cap_usd:null,fdv_usd:'120000'
        },
        relationships:{base_token:{data:{id:'solana_FASTMINT'}},quote_token:{data:{id:'solana_SOL'}},dex:{data:{id:'raydium'}}}
      }],
      included:[
        {id:'solana_FASTMINT',attributes:{address:'FASTMINT',symbol:'FAST',name:'Fast Meme'}},
        {id:'solana_SOL',attributes:{address:'So111',symbol:'SOL',name:'Solana'}}
      ]
    });
    if(u.hostname==='api.dexscreener.com'&&u.pathname.startsWith('/tokens/v1/solana/'))return json([{
      chainId:'solana',pairAddress:'OTHERPAIR',dexId:'raydium',
      baseToken:{address:'FASTMINT',symbol:'FAST',name:'Fast Meme'},quoteToken:{symbol:'SOL'},
      priceUsd:'0.0011',liquidity:{usd:50000},volume:{m5:6000,h1:6000,h24:6000},
      txns:{m5:{buys:25,sells:5},h1:{buys:25,sells:5}},priceChange:{m5:15,h1:15},
      marketCap:125000,fdv:130000,pairCreatedAt:now-500_000
    }]);
    throw new Error('unexpected '+url);
  };
  const p=createMemecoinEarlyRadarProvider({
    fetchImpl,networks:['solana'],ultraGeckoCacheMs:1,ultraDexCacheMs:1,now:()=>now
  });
  const out=await p.fetchUltraEarlySolana({force:true,maxAgeSeconds:120});
  assert.equal(out.version,W6_ULTRA_EARLY_FEED_VERSION);
  assert.equal(out.sourceReady,true);
  assert.equal(out.rows.length,1);
  assert.equal(out.rows[0].tokenAddress,'FASTMINT');
  assert.equal(out.rows[0].marketCap,125000);
  assert.equal(out.rows[0].pairCreatedAt,now-22_000);
  assert.equal(out.rows[0].ageSeconds,22);
  assert.equal(out.rows[0].ultraEarly,true);
  assert.equal(out.rows[0].signalTrending,true);
  assert.equal(out.rows[0].trendRank,1);
  assert.equal(out.rows[0].canExecuteLive,undefined);
  assert.equal(out.canExecuteLive,false);
  assert.equal(calls.filter(x=>x.includes('/tokens/v1/solana/')).length,1);
});

test('W6 candidate memory stays entry-eligible and preserves original launch age while Dex data refreshes',async()=>{
  const now=2_200_000_000_000;
  const json=data=>({ok:true,status:200,json:async()=>data});
  const fetchImpl=async url=>{
    const u=new URL(url);
    if(u.hostname==='api.geckoterminal.com')return json({data:[],included:[]});
    if(u.hostname==='api.dexscreener.com'&&u.pathname.startsWith('/tokens/v1/solana/'))return json([{
      chainId:'solana',pairAddress:'DEXPAIR',dexId:'raydium',
      baseToken:{address:'HOTMINT',symbol:'HOT',name:'Hot Meme'},quoteToken:{symbol:'SOL'},
      priceUsd:'0.002',liquidity:{usd:60000},volume:{m5:9000,h1:9000,h24:9000},
      txns:{m5:{buys:30,sells:8},h1:{buys:30,sells:8}},priceChange:{m5:18,h1:18},
      marketCap:125000,fdv:130000,pairCreatedAt:now-500_000
    }]);
    throw new Error('unexpected '+url);
  };
  const p=createMemecoinEarlyRadarProvider({
    fetchImpl,networks:['solana'],ultraGeckoCacheMs:1,ultraDexCacheMs:1,now:()=>now
  });
  const candidate={
    chainId:'solana',tokenAddress:'HOTMINT',pairAddress:'ORIGINALPAIR',
    pairCreatedAt:now-45_000,firstSeenAt:now-40_000,
    symbol:'HOT',name:'Hot Meme',marketCap:70000,priceUsd:.001
  };
  const out=await p.fetchUltraEarlySolana({force:true,candidateRows:[candidate]});
  assert.equal(out.rows.length,1);
  assert.equal(out.rows[0].candidateTracking,true);
  assert.equal(out.rows[0].w6TrackingOnly,false);
  assert.equal(out.rows[0].pairCreatedAt,now-45_000);
  assert.equal(out.rows[0].pairAddress,'ORIGINALPAIR');
  assert.equal(out.rows[0].marketCap,125000);
  assert.equal(out.rows[0].ageSeconds,45);
});

