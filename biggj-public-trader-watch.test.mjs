import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BIGGJ_PUBLIC_TRADER_WATCH_VERSION,
  createBiggjPublicTraderWatchProvider,
  inferTraderBehavior
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
        {uniqueCode:'DDD444EEE555FFF6',nickName:'Beta',pnl:'8000',pnlRatio:'0.31',winRatio:'0.58',aum:'350000',copyTraderNum:'120',accCopyTraderNum:'600',leadDays:'220',traderInsts:['SOL-USDT-SWAP']}
      ]
    }]);
    const code=u.searchParams.get('uniqueCode');
    if(u.pathname.endsWith('/public-current-subpositions')){
      return response(code.startsWith('AAA')?[{subPosId:'o1',instId:'BTC-USDT-SWAP',posSide:'long',lever:'5',openAvgPx:'100000',markPx:'101000',openTime:'1790870000000',upl:'10',uplRatio:'0.01'}]:[]);
    }
    if(u.pathname.endsWith('/public-subpositions-history')){
      return response(code.startsWith('AAA')?[
        {subPosId:'h1',instId:'BTC-USDT-SWAP',posSide:'long',lever:'5',openTime:'1790800000000',closeTime:'1790803600000',pnl:'20',pnlRatio:'0.02'},
        {subPosId:'h2',instId:'ETH-USDT-SWAP',posSide:'short',lever:'4',openTime:'1790810000000',closeTime:'1790817200000',pnl:'-5',pnlRatio:'-0.01'}
      ]:[
        {subPosId:'h3',instId:'SOL-USDT-SWAP',posSide:'long',lever:'2',openTime:'1790800000000',closeTime:'1790972800000',pnl:'40',pnlRatio:'0.04'}
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
  assert.ok(calls.some(x=>x.includes('/public-lead-traders')));
  assert.ok(calls.some(x=>x.includes('/public-current-subpositions')));
  assert.ok(calls.some(x=>x.includes('/public-subpositions-history')));
  const count=calls.length;
  now+=60_000;
  const cached=await p.fetchTopTraders({limit:2});
  assert.equal(cached,x);
  assert.equal(calls.length,count);
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
