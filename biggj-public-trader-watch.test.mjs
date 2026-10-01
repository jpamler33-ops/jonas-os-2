import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BIGGJ_PUBLIC_TRADER_WATCH_VERSION,
  createBiggjPublicTraderWatchProvider,
  inferTraderBehavior,
  compareTraderCohorts
} from './biggj-public-trader-watch.mjs';

test('behavioral strategy is inferred from observed public position history',()=>{
  const h=[
    {instId:'BTC-USDT-SWAP',posSide:'long',lever:'5',openTime:'1000',closeTime:String(1000+60*60_000),pnlRatio:'0.02'},
    {instId:'BTC-USDT-SWAP',posSide:'long',lever:'4',openTime:'2000',closeTime:String(2000+90*60_000),pnlRatio:'-0.01'},
    {instId:'ETH-USDT-SWAP',posSide:'short',lever:'6',openTime:'3000',closeTime:String(3000+2*60*60_000),pnlRatio:'0.03'}
  ];
  const x=inferTraderBehavior(h,[]);
  assert.equal(x.holdingStyle,'SCALP');
  assert.equal(x.directionalBias,'TWO_WAY');
  assert.equal(x.concentration,'CONCENTRATED');
  assert.equal(x.leverageStyle,'MODERATE_LEVERAGE');
  assert.equal(x.inferred,true);
  assert.equal(x.observedClosedTrades,3);
  assert.equal(x.realizedWinRate,.6667);
  assert.equal(x.lossHandling,'BALANCED_HOLD_TIME');
  assert.ok(x.payoffRatio>1);
});

test('cohort comparison stays descriptive and exposes measurable differences',()=>{
  const mk=(pnl90d,strategy)=>({metrics:{pnl90d,pnlRatio90d:pnl90d/10000},strategy});
  const top=[
    mk(1000,{observedClosedTrades:30,realizedWinRate:.65,payoffRatio:1.6,profitFactor:2,expectancyPnlRatio:.02,medianHoldMs:4e6,medianLeverage:4,lossToWinHoldRatio:.7,topSymbolShare:.5,tradesPerDay:4,observedOpenPositions:1}),
    mk(900,{observedClosedTrades:30,realizedWinRate:.60,payoffRatio:1.5,profitFactor:1.8,expectancyPnlRatio:.018,medianHoldMs:5e6,medianLeverage:5,lossToWinHoldRatio:.8,topSymbolShare:.6,tradesPerDay:3,observedOpenPositions:2}),
    mk(800,{observedClosedTrades:30,realizedWinRate:.62,payoffRatio:1.4,profitFactor:1.7,expectancyPnlRatio:.015,medianHoldMs:4.5e6,medianLeverage:4,lossToWinHoldRatio:.75,topSymbolShare:.55,tradesPerDay:3.5,observedOpenPositions:1})
  ];
  const low=[
    mk(100,{observedClosedTrades:20,realizedWinRate:.45,payoffRatio:.9,profitFactor:.8,expectancyPnlRatio:-.005,medianHoldMs:8e6,medianLeverage:9,lossToWinHoldRatio:1.7,topSymbolShare:.8,tradesPerDay:7,observedOpenPositions:3}),
    mk(50,{observedClosedTrades:20,realizedWinRate:.48,payoffRatio:1,profitFactor:.9,expectancyPnlRatio:-.002,medianHoldMs:7e6,medianLeverage:8,lossToWinHoldRatio:1.5,topSymbolShare:.75,tradesPerDay:6,observedOpenPositions:2}),
    mk(-20,{observedClosedTrades:20,realizedWinRate:.42,payoffRatio:.8,profitFactor:.7,expectancyPnlRatio:-.01,medianHoldMs:9e6,medianLeverage:10,lossToWinHoldRatio:1.8,topSymbolShare:.85,tradesPerDay:8,observedOpenPositions:4})
  ];
  const x=compareTraderCohorts(top,low);
  assert.equal(x.sampleQuality,'MODERATE');
  assert.equal(x.basis,'DESCRIPTIVE_PUBLIC_OKX_SAMPLE_NOT_CAUSAL');
  assert.ok(x.top.medianWinRate>x.lowerProfit.medianWinRate);
  assert.ok(x.top.medianPayoffRatio>x.lowerProfit.medianPayoffRatio);
  assert.ok(x.top.medianLeverage<x.lowerProfit.medianLeverage);
  assert.ok(x.observations.some(o=>o.key==='win_rate'));
  assert.ok(x.observations.some(o=>o.key==='loser_hold'));
});

test('public trader provider returns ranked metrics, open trades and inferred profiles',async()=>{
  const calls=[];
  const response=(data)=>({ok:true,status:200,json:async()=>({code:'0',msg:'',data})});
  const fetchImpl=async url=>{
    calls.push(String(url));
    const u=new URL(url);
    if(u.pathname.endsWith('/public-lead-traders'))return response([{
      dataVer:'20261001190000',
      ranks:[
        {uniqueCode:'AAA111BBB222CCC3',nickName:'Alpha',pnl:'12000',pnlRatio:'0.42',winRatio:'0.64',aum:'500000',copyTraderNum:'200',accCopyTraderNum:'900',leadDays:'420',traderInsts:['BTC-USDT-SWAP','ETH-USDT-SWAP']},
        {uniqueCode:'DDD444EEE555FFF6',nickName:'Beta',pnl:'8000',pnlRatio:'0.31',winRatio:'0.58',aum:'350000',copyTraderNum:'120',accCopyTraderNum:'600',leadDays:'220',traderInsts:['SOL-USDT-SWAP']},
        {uniqueCode:'GGG777HHH888III9',nickName:'Gamma',pnl:'900',pnlRatio:'0.06',winRatio:'0.46',aum:'60000',copyTraderNum:'25',accCopyTraderNum:'90',leadDays:'80',traderInsts:['BTC-USDT-SWAP']},
        {uniqueCode:'JJJ000KKK111LLL2',nickName:'Delta',pnl:'300',pnlRatio:'0.02',winRatio:'0.44',aum:'40000',copyTraderNum:'10',accCopyTraderNum:'60',leadDays:'60',traderInsts:['ETH-USDT-SWAP']},
        {uniqueCode:'MMM333NNN444OOO5',nickName:'Epsilon',pnl:'-100',pnlRatio:'-0.01',winRatio:'0.40',aum:'30000',copyTraderNum:'8',accCopyTraderNum:'40',leadDays:'50',traderInsts:['SOL-USDT-SWAP']}
      ]
    }]);
    const code=u.searchParams.get('uniqueCode');
    if(u.pathname.endsWith('/public-current-subpositions')){
      if(code.startsWith('AAA'))return response([{subPosId:'o1',instId:'BTC-USDT-SWAP',posSide:'long',lever:'5',openAvgPx:'100000',markPx:'101000',openTime:'1790870000000',upl:'10',uplRatio:'0.01'}]);
      if(code.startsWith('MMM'))return response([{subPosId:'o2',instId:'SOL-USDT-SWAP',posSide:'long',lever:'12',openAvgPx:'150',markPx:'149',openTime:'1790875000000',upl:'-8',uplRatio:'-0.02'}]);
      return response([]);
    }
    if(u.pathname.endsWith('/public-subpositions-history')){
      if(code.startsWith('AAA'))return response([
        {subPosId:'h1',instId:'BTC-USDT-SWAP',posSide:'long',lever:'5',openAvgPx:'100000',closeAvgPx:'102000',openTime:'1790800000000',closeTime:'1790803600000',pnl:'20',pnlRatio:'0.02'},
        {subPosId:'h2',instId:'ETH-USDT-SWAP',posSide:'short',lever:'4',openTime:'1790810000000',closeTime:'1790817200000',pnl:'-5',pnlRatio:'-0.01'}
      ]);
      if(code.startsWith('DDD'))return response([
        {subPosId:'h3',instId:'SOL-USDT-SWAP',posSide:'long',lever:'2',openTime:'1790800000000',closeTime:'1790972800000',pnl:'40',pnlRatio:'0.04'}
      ]);
      return response([
        {subPosId:'l1',instId:'SOL-USDT-SWAP',posSide:'long',lever:'10',openTime:'1790800000000',closeTime:'1790900000000',pnl:'-20',pnlRatio:'-0.03'},
        {subPosId:'l2',instId:'BTC-USDT-SWAP',posSide:'long',lever:'12',openTime:'1790910000000',closeTime:'1790913600000',pnl:'5',pnlRatio:'0.005'}
      ]);
    }
    throw new Error('unexpected '+u.pathname);
  };
  let now=1790881200000;
  const p=createBiggjPublicTraderWatchProvider({
    fetchImpl,
    baseUrls:['https://www.okx.com'],
    timeoutMs:1000,
    minRequestGapMs:0,
    cacheTtlMs:300000,
    now:()=>now
  });
  const x=await p.fetchTopTraders({limit:2});
  assert.equal(x.version,BIGGJ_PUBLIC_TRADER_WATCH_VERSION);
  assert.equal(x.sourceReady,true);
  assert.equal(x.traders.length,2);
  assert.equal(x.traders[0].providerRank,1);
  assert.equal(x.traders[0].nickname,'Alpha');
  assert.equal(x.traders[0].metrics.pnlRatio90d,0.42);
  assert.equal(x.traders[0].openPositions[0].side,'LONG');
  assert.equal(x.traders[0].strategy.inferred,true);
  assert.ok(x.traders[0].cohortComparison);
  assert.equal(x.traders[0].cohortComparison.comparatorDefinition,'LOWER_PNL_ROWS_WITHIN_SAME_OKX_OVERVIEW_SNAPSHOT');
  assert.equal(x.lowerProfitSampleSize,3);
  assert.ok(calls.some(x=>x.includes('/public-lead-traders')));
  assert.ok(calls.some(x=>x.includes('/public-current-subpositions')));
  assert.ok(calls.some(x=>x.includes('/public-subpositions-history')));
  const count=calls.length;
  now+=60_000;
  const cached=await p.fetchTopTraders({limit:2});
  assert.equal(cached,x);
  assert.equal(calls.length,count);

  const tracked=await p.fetchTraderByCode('AAA111BBB222CCC3',{nickname:'Alpha tracked'});
  assert.equal(tracked.providerRank,null);
  assert.equal(tracked.trackedLifecycleOnly,true);
  assert.equal(tracked.nickname,'Alpha tracked');
  assert.equal(tracked.recentClosed[0].closeAvgPx,102000);
});

test('provider fails closed when public leaderboard is unavailable',async()=>{
  const p=createBiggjPublicTraderWatchProvider({
    fetchImpl:async()=>({ok:false,status:503,json:async()=>({})}),
    baseUrls:['https://www.okx.com'],
    timeoutMs:1000,
    minRequestGapMs:0
  });
  await assert.rejects(()=>p.fetchTopTraders({limit:3,force:true}),/OKX_PUBLIC_COPY_TRADING_FAILED/);
});
