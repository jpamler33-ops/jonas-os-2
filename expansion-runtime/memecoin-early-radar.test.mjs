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

test('W6 joins exact GMGN New Pair identity with exact GMGN 1m change rank by token address',async()=>{
  const now=2_100_000_000_000;
  const json=data=>({ok:true,status:200,json:async()=>data});
  const calls=[];
  const fetchImpl=async (url,opts={})=>{
    calls.push({url,opts});
    const u=new URL(url);
    if(u.hostname==='openapi.gmgn.ai'&&u.pathname==='/v1/trenches'){
      assert.equal(u.searchParams.get('chain'),'sol');
      assert.equal(opts?.method,'POST');
      assert.equal(opts?.headers?.['X-APIKEY'],'personal-test-key');
      const body=JSON.parse(opts.body);
      assert.equal(body.version,'v2');
      assert.equal(body.new_creation.limit,80);
      return json({code:0,msg:'success',data:{new_creation:[{
        chain:'sol',address:'FASTMINT',symbol:'FAST',name:'Fast Meme',
        price:0.001,liquidity:45000,usd_market_cap:120000,
        created_timestamp:Math.floor((now-22_000)/1000),
        holder_count:77
      }]}});
    }
    if(u.hostname==='openapi.gmgn.ai'&&u.pathname==='/v1/market/rank'){
      assert.equal(u.searchParams.get('chain'),'sol');
      assert.equal(u.searchParams.get('interval'),'1m');
      assert.equal(u.searchParams.get('limit'),'100');
      assert.equal(u.searchParams.get('order_by'),'change1m');
      assert.equal(u.searchParams.get('direction'),'desc');
      return json({code:0,data:{rank:[{
        address:'FASTMINT',symbol:'FAST',name:'Fast Meme',price:.001,
        price_change_percent1m:999000,price_change_percent:999000,
        creation_timestamp:Math.floor((now-22_000)/1000)
      }]}});
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
    fetchImpl,networks:['solana'],gmgnApiKey:'personal-test-key',gmgnTrendInterval:'1m',
    ultraGeckoCacheMs:1,ultraDexCacheMs:1,gmgnTrendCacheMs:1,now:()=>now
  });
  const out=await p.fetchUltraEarlySolana({force:true,maxAgeSeconds:120});
  assert.equal(out.version,W6_ULTRA_EARLY_FEED_VERSION);
  assert.equal(out.sourceReady,true);
  assert.equal(out.rows.length,1);
  assert.equal(out.rows[0].tokenAddress,'FASTMINT');
  assert.equal(out.rows[0].marketCap,125000);
  assert.equal(out.rows[0].pairCreatedAt,now-22_000);
  assert.equal(out.rows[0].ageSeconds,22);
  assert.equal(out.rows[0].signalNewPair,true);
  assert.equal(out.rows[0].gmgnExactTrend,true);
  assert.equal(out.rows[0].gmgnExactNewPair,true);
  assert.equal(out.rows[0].trendSource,'GMGN_OPENAPI_NEW_CREATION_1M');
  assert.equal(out.rows[0].priceChangeSelectedPct,999000);
  assert.equal(out.rows[0].gmgnDisplayedChangePct,999000);
  assert.equal(out.rows[0].gmgnOneMinutePerformanceSource,'GMGN_OPENAPI_TRENDS_1M_CHANGE1M');
  assert.equal(out.exactGmgn,true);
  assert.equal(out.setup,'GMGN_NEW_PAIR_1M');
  assert.equal(out.gmgnOneMinuteRows,1);
  assert.equal(out.gmgnOneMinuteMatchedNewPairs,1);
  assert.equal(out.gmgnOneMinuteCoverage,1);
  assert.equal(out.gmgnOneMinuteError,null);
  assert.equal(out.canExecuteLive,false);
  assert.equal(calls.filter(x=>x.url.includes('/v1/market/rank')).length,1);
  assert.equal(calls.filter(x=>x.url.includes('/tokens/v1/solana/')).length,1);
});

test('W6 public demo key derives exact 1m percent only from GMGN token-info prices',async()=>{
  const now=2_103_000_000_000;
  const calls=[];
  const json=data=>({ok:true,status:200,headers:{get:()=>null},json:async()=>data});
  const fetchImpl=async (url,opts={})=>{
    calls.push({url:String(url),opts});
    const u=new URL(url);
    if(u.hostname==='openapi.gmgn.ai'&&u.pathname==='/v1/trenches'){
      return json({code:0,data:{new_creation:[{
        address:'DEMOMINT',symbol:'DEMO',name:'Demo Meme',price:'0.001',
        usd_market_cap:'10000',liquidity:'8000',
        created_timestamp:Math.floor((now-40_000)/1000)
      }]}});
    }
    if(u.hostname==='openapi.gmgn.ai'&&u.pathname==='/v1/token/info'){
      assert.equal(u.searchParams.get('chain'),'sol');
      assert.equal(u.searchParams.get('address'),'DEMOMINT');
      return json({
        address:'DEMOMINT',symbol:'DEMO',
        price:{price:'0.001',price_1m:'0.000001'}
      });
    }
    if(u.hostname==='api.dexscreener.com'&&u.pathname.startsWith('/tokens/v1/solana/'))return json([{
      chainId:'solana',pairAddress:'DEMOPOOL',dexId:'pump',
      baseToken:{address:'DEMOMINT',symbol:'DEMO',name:'Demo Meme'},quoteToken:{symbol:'SOL'},
      priceUsd:'0.001',liquidity:{usd:9000},volume:{m5:100,h1:100,h24:100},
      txns:{m5:{buys:2,sells:0},h1:{buys:2,sells:0}},priceChange:{m5:1,h1:1},
      marketCap:10000,fdv:10000,pairCreatedAt:now-40000
    }]);
    throw new Error('unexpected '+url);
  };
  const p=createMemecoinEarlyRadarProvider({
    fetchImpl,networks:['solana'],
    gmgnRequestGapMs:0,gmgnTokenInfoSamplePerCycle:3,
    ultraGeckoCacheMs:1,ultraDexCacheMs:1,now:()=>now
  });
  const out=await p.fetchUltraEarlySolana({force:true,maxAgeSeconds:120});
  assert.equal(calls.some(x=>x.url.includes('/v1/market/rank')),false);
  assert.equal(calls.filter(x=>x.url.includes('/v1/token/info')).length,1);
  assert.equal(out.source,'GMGN_OPENAPI_NEW_CREATION_1M');
  assert.equal(out.exactGmgn,true);
  assert.equal(out.rows.length,1);
  assert.equal(out.rows[0].signalNewPair,true);
  assert.equal(out.rows[0].gmgnExactTrend,true);
  assert.equal(out.rows[0].gmgnExactNewPair,true);
  assert.equal(out.rows[0].gmgnExactOneMinutePerformance,true);
  assert.equal(out.rows[0].gmgnOneMinutePerformanceSource,'GMGN_OPENAPI_TOKEN_INFO_PRICE_1M');
  assert.equal(out.rows[0].gmgnCurrentPriceUsd,0.001);
  assert.equal(out.rows[0].gmgnOneMinuteStartPriceUsd,0.000001);
  assert.ok(Math.abs(out.rows[0].gmgnDisplayedChangePct-99900)<1e-9);
  assert.ok(Math.abs(out.rows[0].priceChangeSelectedPct-99900)<1e-9);
  assert.equal(out.gmgnOneMinuteMatchedNewPairs,1);
  assert.equal(out.gmgnOneMinuteCoverage,1);
  assert.equal(out.gmgnTokenInfoObserved,1);
  assert.equal(out.canExecuteLive,false);
});

test('W6 demo-key sampler spends scarce token-info quota closest to one-minute pair age',async()=>{
  const now=2_103_500_000_000;
  const json=data=>({ok:true,status:200,headers:{get:()=>null},json:async()=>data});
  const launches=[
    {address:'AGE20',symbol:'A20',price:'0.001',usd_market_cap:'10000',liquidity:'8000',created_timestamp:Math.floor((now-20_000)/1000)},
    {address:'AGE60',symbol:'A60',price:'0.001',usd_market_cap:'10000',liquidity:'8000',created_timestamp:Math.floor((now-60_000)/1000)},
    {address:'AGE115',symbol:'A115',price:'0.001',usd_market_cap:'10000',liquidity:'8000',created_timestamp:Math.floor((now-115_000)/1000)}
  ];
  const tokenInfoCalls=[];
  const fetchImpl=async url=>{
    const u=new URL(url);
    if(u.hostname==='openapi.gmgn.ai'&&u.pathname==='/v1/trenches'){
      return json({code:0,data:{new_creation:launches}});
    }
    if(u.hostname==='openapi.gmgn.ai'&&u.pathname==='/v1/token/info'){
      tokenInfoCalls.push(u.searchParams.get('address'));
      return json({address:u.searchParams.get('address'),price:{price:'0.001',price_1m:'0.000001'}});
    }
    if(u.hostname==='api.dexscreener.com'&&u.pathname.startsWith('/tokens/v1/solana/')){
      const addresses=decodeURIComponent(u.pathname.split('/').pop()).split(',');
      return json(addresses.map(address=>({
        chainId:'solana',pairAddress:'POOL_'+address,dexId:'pump',
        baseToken:{address,symbol:address,name:address},quoteToken:{symbol:'SOL'},
        priceUsd:'0.001',liquidity:{usd:9000},volume:{m5:100,h1:100,h24:100},
        txns:{m5:{buys:2,sells:0},h1:{buys:2,sells:0}},priceChange:{m5:1,h1:1},
        marketCap:10000,fdv:10000,pairCreatedAt:now-60_000
      })));
    }
    throw new Error('unexpected '+url);
  };
  const p=createMemecoinEarlyRadarProvider({
    fetchImpl,networks:['solana'],gmgnRequestGapMs:0,gmgnTokenInfoSamplePerCycle:1,
    ultraGeckoCacheMs:1,ultraDexCacheMs:1,now:()=>now
  });
  const out=await p.fetchUltraEarlySolana({force:true,maxAgeSeconds:120});
  assert.deepEqual(tokenInfoCalls,['AGE60']);
  assert.equal(out.gmgnTokenInfoTargetAgeSeconds,60);
  assert.equal(out.gmgnTokenInfoMinSampleAgeSeconds,50);
  assert.equal(out.gmgnTokenInfoResampleSeconds,20);
  const measured=out.rows.find(x=>x.tokenAddress==='AGE60');
  assert.ok(measured);
  assert.equal(measured.gmgnExactOneMinutePerformance,true);
  assert.ok(measured.gmgnDisplayedChangePct>=99000);
});

test('W6 never drops an exact GMGN 1m match behind either 30-row selection cap',async()=>{
  const now=2_104_000_000_000;
  const json=data=>({ok:true,status:200,headers:{get:()=>null},json:async()=>data});
  const launches=Array.from({length:35},(_,i)=>({
    address:'CAP'+String(i).padStart(2,'0'),symbol:'C'+i,name:'Cap '+i,price:'0.001',
    usd_market_cap:'10000',liquidity:'8000',
    created_timestamp:Math.floor((now-(30_000+i*1000))/1000)
  }));
  const exactTarget=launches[30].address;
  const fetchImpl=async url=>{
    const u=new URL(url);
    if(u.hostname==='openapi.gmgn.ai'&&u.pathname==='/v1/trenches'){
      return json({code:0,data:{new_creation:launches}});
    }
    if(u.hostname==='openapi.gmgn.ai'&&u.pathname==='/v1/token/info'){
      assert.equal(u.searchParams.get('address'),exactTarget);
      return json({address:exactTarget,price:{price:'0.001',price_1m:'0.000001'}});
    }
    if(u.hostname==='api.dexscreener.com'&&u.pathname.startsWith('/tokens/v1/solana/')){
      const addresses=decodeURIComponent(u.pathname.split('/').pop()).split(',');
      return json(addresses.map(address=>({
        chainId:'solana',pairAddress:'POOL_'+address,dexId:'pump',
        baseToken:{address,symbol:address,name:address},quoteToken:{symbol:'SOL'},
        priceUsd:'0.001',liquidity:{usd:9000},volume:{m5:100,h1:100,h24:100},
        txns:{m5:{buys:2,sells:0},h1:{buys:2,sells:0}},priceChange:{m5:1,h1:1},
        marketCap:10000,fdv:10000,pairCreatedAt:now-10_000
      })));
    }
    throw new Error('unexpected '+url);
  };
  const p=createMemecoinEarlyRadarProvider({
    fetchImpl,networks:['solana'],gmgnRequestGapMs:0,gmgnTokenInfoSamplePerCycle:1,
    ultraGeckoCacheMs:1,ultraDexCacheMs:1,now:()=>now
  });
  const candidateRows=Array.from({length:25},(_,i)=>({
    chainId:'solana',tokenAddress:'MEM'+String(i).padStart(2,'0'),
    pairAddress:'MEMPOOL'+i,pairCreatedAt:now-(1_000+i*500),
    firstSeenAt:now-(1_000+i*500),marketCap:9000,liquidityUsd:7000,priceUsd:0.001
  }));
  const out=await p.fetchUltraEarlySolana({force:true,maxAgeSeconds:120,candidateRows});
  assert.equal(out.gmgnOneMinuteMatchedNewPairs,1);
  assert.ok(out.rows.length>30,'always-retained candidate memory may expand the bounded output');
  const matched=out.rows.find(x=>x.tokenAddress===exactTarget);
  assert.ok(matched,'exact GMGN 1m match must survive the 30-row cap');
  assert.equal(matched.gmgnExactOneMinutePerformance,true);
  assert.ok(matched.gmgnDisplayedChangePct>=99000);
  assert.equal(matched.signalNewPair,true);
  assert.equal(matched.gmgnExactNewPair,true);
});

test('W6 stops all exact GMGN follow-up requests during authoritative 429 cooldown',async()=>{
  let now=2_105_000_000_000;
  const calls=[];
  const ok=data=>({ok:true,status:200,headers:{get:()=>null},json:async()=>data});
  const limited=()=>({
    ok:false,status:429,
    headers:{get:name=>String(name).toLowerCase()==='x-ratelimit-reset'?String(Math.floor((now+60_000)/1000)):null},
    json:async()=>({code:429,error:'RATE_LIMIT_BANNED',reset_at:Math.floor((now+60_000)/1000)})
  });
  const fetchImpl=async url=>{
    calls.push(String(url));
    const u=new URL(url);
    if(u.hostname==='openapi.gmgn.ai')return limited();
    if(u.hostname==='api.geckoterminal.com')return ok({data:[],included:[]});
    if(u.hostname==='api.dexscreener.com')return ok([]);
    throw new Error('unexpected '+url);
  };
  const p=createMemecoinEarlyRadarProvider({
    fetchImpl,networks:['solana'],gmgnApiKey:'shared-demo-key',gmgnPublicEnabled:false,
    gmgnRequestGapMs:0,ultraGeckoCacheMs:1,ultraDexCacheMs:1,now:()=>now
  });
  const first=await p.fetchUltraEarlySolana({force:true,maxAgeSeconds:120});
  assert.equal(calls.filter(x=>x.includes('openapi.gmgn.ai')).length,1);
  assert.equal(calls.some(x=>x.includes('/v1/market/rank')),false);
  assert.equal(first.exactGmgn,false);
  assert.equal(first.gmgnRateLimit.active,true);
  assert.ok(first.gmgnRateLimit.until>now);
  now+=5_000;
  const before=calls.filter(x=>x.includes('openapi.gmgn.ai')).length;
  const second=await p.fetchUltraEarlySolana({force:true,maxAgeSeconds:120});
  assert.equal(calls.filter(x=>x.includes('openapi.gmgn.ai')).length,before);
  assert.equal(second.gmgnRateLimit.active,true);
  assert.equal(second.canExecuteLive,false);
});

test('W6 keeps GMGN discovery unfiltered and applies green threshold downstream',async()=>{
  const now=2_110_000_000_000;
  const json=data=>({ok:true,status:200,json:async()=>data});
  const fetchImpl=async (url)=>{
    const u=new URL(url);
    if(u.hostname==='openapi.gmgn.ai'&&u.pathname==='/v1/trenches'){
      return json({code:0,data:{new_creation:[]}});
    }
    if(u.hostname==='openapi.gmgn.ai'&&u.pathname==='/v1/market/rank'){
      assert.equal(u.searchParams.get('interval'),'1m');
      assert.equal(u.searchParams.get('min_price_change_percent'),null);
      if(u.searchParams.get('order_by')==='change1m'){
        return json({code:0,data:{rank:[{
          address:'OTHER',symbol:'OTHER',price:.001,price_change_percent1m:200000
        }]}});
      }
      assert.equal(u.searchParams.get('order_by'),null);
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
  assert.equal(out.rows[0].signalNewPair,false);
  assert.equal(out.rows[0].gmgnExactNewPair,false);
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
  // Independent new-pool discovery now starts concurrently; exact GMGN output stays authoritative.
  assert.equal(calls.some(x=>x.url.includes('/new_pools')),true);
  assert.equal(calls.some(x=>x.url.includes('/token-boosts/top/v1')),false);
});

test('W6 can disable the unsupported public GMGN path and fall back without recording a 403',async()=>{
  const now=2_140_000_000_000;
  const json=data=>({ok:true,status:200,json:async()=>data});
  const calls=[];
  const fetchImpl=async url=>{
    calls.push(String(url));
    const u=new URL(url);
    if(u.hostname==='gmgn.ai') throw new Error('public GMGN must be skipped');
    if(u.hostname==='api.geckoterminal.com') return json({data:[],included:[]});
    if(u.hostname==='api.dexscreener.com'&&u.pathname==='/token-boosts/top/v1')return json([{
      chainId:'solana',tokenAddress:'BOOSTONLY',amount:50,totalAmount:200
    }]);
    if(u.hostname==='api.dexscreener.com'&&u.pathname.startsWith('/tokens/v1/solana/'))return json([{
      chainId:'solana',pairAddress:'BOOSTPAIR',dexId:'raydium',
      baseToken:{address:'BOOSTONLY',symbol:'BST',name:'Boost Meme'},quoteToken:{symbol:'SOL'},
      priceUsd:'0.0012',liquidity:{usd:70000},volume:{m5:10000,h1:12000,h24:12000},
      txns:{m5:{buys:35,sells:7},h1:{buys:35,sells:7}},priceChange:{m5:20,h1:20},
      marketCap:130000,fdv:135000,pairCreatedAt:now-30_000
    }]);
    throw new Error('unexpected '+url);
  };
  const p=createMemecoinEarlyRadarProvider({
    fetchImpl,networks:['solana'],gmgnApiKey:'',gmgnPublicEnabled:false,
    ultraGeckoCacheMs:1,ultraDexCacheMs:1,now:()=>now
  });
  const out=await p.fetchUltraEarlySolana({force:true,maxAgeSeconds:120});
  assert.equal(out.exactGmgn,false);
  assert.equal(out.source,'FREE_TRENDS_COMPOSITE_GECKO_DEXSCREENER');
  assert.equal(out.rows.length,1);
  assert.equal(calls.some(x=>x.includes('gmgn.ai')),false);
  assert.equal(out.errors.some(x=>String(x).startsWith('gmgn:public:')),false);
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
  assert.equal(out.setup,'TRENDS_PROXY_RESEARCH');
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

test('legacy discovery backs off HTTP 429 even during forced refresh and retries after cooldown',async()=>{
 let now=1700000000000,calls=0;
 const p=createMemecoinEarlyRadarProvider({now:()=>now,gmgnPublicEnabled:false,fetchImpl:async url=>{
  if(String(url).includes('geckoterminal')){calls++;return {ok:false,status:429};}
  return {ok:true,status:200,json:async()=>[]};
 }});
 await p.fetchUltraEarlySolana({force:true});const initial=calls;assert.ok(initial>0);
 now+=5000;await p.fetchUltraEarlySolana({force:true});assert.equal(calls,initial);
 now+=60000;await p.fetchUltraEarlySolana({force:true});assert.ok(calls>initial);
});
