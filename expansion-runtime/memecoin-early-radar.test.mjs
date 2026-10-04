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

test('W6 exact GMGN Trends 1m feed keeps launch age and displayed green percentage while enriching market cap',async()=>{
  const now=2_100_000_000_000;
  const json=data=>({ok:true,status:200,json:async()=>data});
  const calls=[];
  const fetchImpl=async (url,opts={})=>{
    calls.push({url,opts});
    const u=new URL(url);
    if(u.hostname==='openapi.gmgn.ai'&&u.pathname==='/v1/market/rank'){
      assert.equal(u.searchParams.get('chain'),'sol');
      assert.equal(u.searchParams.get('interval'),'1m');
      assert.equal(u.searchParams.get('order_by'),null);
      assert.equal(u.searchParams.get('direction'),null);
      assert.equal(opts?.headers?.['X-APIKEY'],'personal-test-key');
      assert.equal(opts?.headers?.['user-agent'],'gmgn-cli/1.6.6');
      return json({
      code:0,msg:'success',data:{rank:[{
        chain:'sol',address:'FASTMINT',symbol:'FAST',name:'Fast Meme',
        price:0.001,liquidity:45000,volume:5000,market_cap:120000,
        buys:20,sells:4,price_change_percent:999000,price_change_percent5m:12,price_change_percent1h:12,
        open_timestamp:Math.floor((now-22_000)/1000),
        pool_creation_timestamp:Math.floor((now-28_000)/1000),
        holder_count:77
      }]}
    });
    }
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
    fetchImpl,networks:['solana'],gmgnApiKey:'personal-test-key',ultraGeckoCacheMs:1,ultraDexCacheMs:1,now:()=>now
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
  assert.equal(out.rows[0].signalNewPair,false);
  assert.equal(out.rows[0].gmgnExactTrend,true);
  assert.equal(out.rows[0].trendSource,'GMGN_OPENAPI_TRENDS_1M_DEFAULT');
  assert.equal(out.rows[0].trendRank,1);
  assert.equal(out.exactGmgn,true);
  assert.equal(out.trendInterval,'1m');
  assert.equal(out.trendOrderBy,'default');
  assert.equal(out.setup,'GMGN_TRENDS_1M');
  assert.equal(out.source,'GMGN_OPENAPI_TRENDS_1M_DEFAULT');
  assert.equal(out.rows[0].priceChangeSelectedPct,999000);
  assert.equal(out.rows[0].canExecuteLive,undefined);
  assert.equal(out.canExecuteLive,false);
  assert.equal(calls.filter(x=>x.url.includes('/tokens/v1/solana/')).length,1);
});

test('W6 can push the green percent threshold into GMGN OpenAPI discovery',async()=>{
  const now=2_110_000_000_000;
  const json=data=>({ok:true,status:200,json:async()=>data});
  const fetchImpl=async (url)=>{
    const u=new URL(url);
    if(u.hostname==='openapi.gmgn.ai'&&u.pathname==='/v1/market/rank'){
      assert.equal(u.searchParams.get('interval'),'1m');
      assert.equal(u.searchParams.get('order_by'),null);
      assert.equal(u.searchParams.get('min_price_change_percent'),'99000');
      return json({code:0,data:{rank:[{
        address:'GREENMINT',symbol:'GREEN',name:'Green Meme',price:.001,market_cap:47800,
        price_change_percent:999000,open_timestamp:Math.floor((now-50_000)/1000)
      }]}});
    }
    if(u.hostname==='api.dexscreener.com'&&u.pathname.startsWith('/tokens/v1/solana/'))return json([{
      chainId:'solana',pairAddress:'GREENPAIR',dexId:'raydium',
      baseToken:{address:'GREENMINT',symbol:'GREEN',name:'Green Meme'},quoteToken:{symbol:'SOL'},
      priceUsd:'0.001',liquidity:{usd:50000},volume:{m5:5000,h1:5000,h24:5000},
      txns:{m5:{buys:10,sells:2},h1:{buys:10,sells:2}},priceChange:{m5:20,h1:20},
      marketCap:47800,fdv:50000,pairCreatedAt:now-50_000
    }]);
    throw new Error('unexpected '+url);
  };
  const p=createMemecoinEarlyRadarProvider({
    fetchImpl,gmgnApiKey:'personal-test-key',gmgnTrendInterval:'1m',
    gmgnTrendOrderBy:'default',gmgnTrendMinPriceChangePct:99000,now:()=>now
  });
  const out=await p.fetchUltraEarlySolana({force:true,maxAgeSeconds:60});
  assert.equal(out.rows.length,1);
  assert.equal(out.rows[0].priceChangeSelectedPct,999000);
  assert.equal(out.minPriceChangePct,99000);
  assert.equal(out.exactGmgn,true);
});


test('W6 uses public GMGN Trends 1m before free composite when no personal key is configured',async()=>{
  const now=2_125_000_000_000;
  const json=data=>({ok:true,status:200,json:async()=>data});
  const calls=[];
  const fetchImpl=async (url,opts={})=>{
    calls.push({url,opts});
    const u=new URL(url);
    if(u.hostname==='gmgn.ai'&&u.pathname==='/defi/quotation/v1/rank/sol/swaps/1m'){
      assert.equal(u.searchParams.get('orderby'),'default');
      assert.equal(u.searchParams.get('direction'),'desc');
      assert.equal(opts?.headers?.referer,'https://gmgn.ai/trend');
      return json({code:0,msg:'success',data:{rank:[{
        address:'PUBMINT',symbol:'PUB',name:'Public Trend Meme',
        price:0.001,liquidity:42000,volume:7000,market_cap:118000,
        buys:28,sells:6,price_change_percent:120000,price_change_percent5m:14,price_change_percent1h:14,
        creation_timestamp:Math.floor((now-25_000)/1000),
        holder_count:91
      }]}});
    }
    if(u.hostname==='api.dexscreener.com'&&u.pathname.startsWith('/tokens/v1/solana/'))return json([{
      chainId:'solana',pairAddress:'PUBPAIR',dexId:'raydium',
      baseToken:{address:'PUBMINT',symbol:'PUB',name:'Public Trend Meme'},quoteToken:{symbol:'SOL'},
      priceUsd:'0.0011',liquidity:{usd:52000},volume:{m5:8000,h1:9000,h24:9000},
      txns:{m5:{buys:31,sells:7},h1:{buys:31,sells:7}},priceChange:{m5:16,h1:16},
      marketCap:124000,fdv:128000,pairCreatedAt:now-600_000
    }]);
    if(u.hostname==='api.geckoterminal.com'||u.pathname==='/token-boosts/top/v1'){
      throw new Error('free fallback must not run while public GMGN Trends is healthy');
    }
    throw new Error('unexpected '+url);
  };
  const p=createMemecoinEarlyRadarProvider({
    fetchImpl,networks:['solana'],gmgnApiKey:'',gmgnTrendInterval:'1m',
    ultraGeckoCacheMs:1,ultraDexCacheMs:1,gmgnTrendCacheMs:1,now:()=>now
  });
  const out=await p.fetchUltraEarlySolana({force:true,maxAgeSeconds:120});
  assert.equal(out.sourceReady,true);
  assert.equal(out.exactGmgn,true);
  assert.equal(out.source,'GMGN_PUBLIC_TRENDS_1M_DEFAULT');
  assert.equal(out.trendInterval,'1m');
  assert.equal(out.rows.length,1);
  assert.equal(out.rows[0].tokenAddress,'PUBMINT');
  assert.equal(out.rows[0].gmgnExactTrend,true);
  assert.equal(out.rows[0].signalNewPair,false);
  assert.equal(out.rows[0].priceChangeSelectedPct,120000);
  assert.equal(out.rows[0].trendSource,'GMGN_PUBLIC_TRENDS_1M_DEFAULT');
  assert.equal(out.rows[0].ageSeconds,25);
  assert.equal(out.rows[0].marketCap,124000);
  assert.equal(calls.some(x=>x.url.includes('api.geckoterminal.com')),false);
  assert.equal(calls.some(x=>x.url.includes('/token-boosts/top/v1')),false);
});

test('W6 free trends composite can use DexScreener as enrichment when GMGN is unavailable',async()=>{
  const now=2_150_000_000_000;
  const json=data=>({ok:true,status:200,json:async()=>data});
  const fetchImpl=async url=>{
    const u=new URL(url);
    if(u.hostname==='gmgn.ai'&&u.pathname==='/defi/quotation/v1/rank/sol/swaps/1m'){
      return {ok:false,status:503,json:async()=>({})};
    }
    if(u.hostname==='api.geckoterminal.com'){
      return {ok:false,status:429,json:async()=>({})};
    }
    if(u.hostname==='api.dexscreener.com'&&u.pathname==='/token-boosts/top/v1')return json([{
      chainId:'solana',tokenAddress:'BOOSTMINT',amount:50,totalAmount:200
    }]);
    if(u.hostname==='api.dexscreener.com'&&u.pathname.startsWith('/tokens/v1/solana/'))return json([{
      chainId:'solana',pairAddress:'BOOSTPAIR',dexId:'raydium',
      baseToken:{address:'BOOSTMINT',symbol:'BST',name:'Boost Meme'},quoteToken:{symbol:'SOL'},
      priceUsd:'0.0012',liquidity:{usd:70000},volume:{m5:10000,h1:12000,h24:12000},
      txns:{m5:{buys:35,sells:7},h1:{buys:35,sells:7}},priceChange:{m5:20,h1:20},
      marketCap:130000,fdv:135000,pairCreatedAt:now-30_000
    }]);
    throw new Error('unexpected '+url);
  };
  const p=createMemecoinEarlyRadarProvider({
    fetchImpl,networks:['solana'],ultraGeckoCacheMs:1,ultraDexCacheMs:1,now:()=>now
  });
  const out=await p.fetchUltraEarlySolana({force:true,maxAgeSeconds:120});
  assert.equal(out.exactGmgn,false);
  assert.equal(out.source,'FREE_TRENDS_COMPOSITE_GECKO_DEXSCREENER');
  assert.ok(out.errors.some(x=>String(x).startsWith('gmgn:public:solana:trending:HTTP_503')));
  assert.equal(out.rows.length,1);
  assert.equal(out.rows[0].tokenAddress,'BOOSTMINT');
  assert.equal(out.rows[0].signalTrending,true);
  assert.equal(out.rows[0].gmgnExactTrend,false);
  assert.ok(out.rows[0].freeTrendSources.includes('DEXSCREENER_TOP_BOOSTS'));
  assert.equal(out.rows[0].ageSeconds,30);
});

test('W6 candidate memory preserves launch age but is no longer current New Pair visibility',async()=>{
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
  assert.equal(out.rows[0].signalTrending,false);
  assert.equal(out.rows[0].signalNewPair,false);
  assert.equal(out.rows[0].w6TrackingOnly,false);
  assert.equal(out.rows[0].pairCreatedAt,now-45_000);
  assert.equal(out.rows[0].pairAddress,'ORIGINALPAIR');
  assert.equal(out.rows[0].marketCap,125000);
  assert.equal(out.rows[0].ageSeconds,45);
});

