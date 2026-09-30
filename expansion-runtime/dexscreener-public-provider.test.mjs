import test from 'node:test';
import assert from 'node:assert/strict';
import { createDexScreenerPublicProvider, dexScreenerLearningContextToExtraFeatures } from './dexscreener-public-provider.mjs';

function response(body,status=200){
  return {ok:status>=200&&status<300,status,json:async()=>body};
}

test('memecoin radar joins boosted token with its strongest-liquidity pair',async()=>{
  const fetchImpl=async url=>{
    if(url.endsWith('/token-boosts/top/v1')) return response([
      {chainId:'solana',tokenAddress:'TOKEN1',amount:10,totalAmount:50}
    ]);
    if(url.includes('/token-pairs/v1/solana/TOKEN1')) return response([
      {chainId:'solana',dexId:'a',baseToken:{address:'TOKEN1',name:'Meme One',symbol:'MEME'},quoteToken:{symbol:'SOL'},priceUsd:'0.01',liquidity:{usd:1000},volume:{h24:5000,h1:100},priceChange:{h1:2},txns:{h1:{buys:4,sells:3}}},
      {chainId:'solana',dexId:'b',baseToken:{address:'TOKEN1',name:'Meme One',symbol:'MEME'},quoteToken:{symbol:'USDC'},priceUsd:'0.011',liquidity:{usd:50000},volume:{h24:7000,h1:400},priceChange:{h1:3},txns:{h1:{buys:10,sells:5}}}
    ]);
    throw new Error('unexpected '+url);
  };
  const p=createDexScreenerPublicProvider({fetchImpl,baseUrl:'https://example.test'});
  const radar=await p.fetchMemecoinRadar({limit:1,chainIds:['solana']});
  assert.equal(radar.rows.length,1);
  assert.equal(radar.rows[0].pair.dexId,'b');
  assert.equal(radar.rows[0].pair.liquidityUsd,50000);
  assert.equal(radar.rows[0].pair.buysH1,10);
});

test('trending metas are normalized without inventing missing values',async()=>{
  const fetchImpl=async url=>{
    assert.ok(url.endsWith('/metas/trending/v1'));
    return response([{name:'AI Agents',slug:'ai-agents',marketCap:123,liquidity:45,volume:67,tokenCount:8,marketCapChange:{h1:2.5,h24:-1.2}}]);
  };
  const p=createDexScreenerPublicProvider({fetchImpl,baseUrl:'https://example.test'});
  const out=await p.fetchTrendingMetas({limit:1});
  assert.equal(out.rows[0].name,'AI Agents');
  assert.equal(out.rows[0].marketCapChange.h1,2.5);
  assert.equal(out.rows[0].marketCapChange.h6,null);
});


test('learning context converts promotion-biased DEX activity into bounded research features',()=>{
  const rows=dexScreenerLearningContextToExtraFeatures({
    radar:{rows:[
      {pair:{liquidityUsd:1000,volumeH1:500,buysH1:8,sellsH1:2}},
      {pair:{liquidityUsd:4000,volumeH1:1500,buysH1:4,sellsH1:6}}
    ]},
    metas:{rows:[
      {liquidity:10000,volume:20000,tokenCount:5},
      {liquidity:5000,volume:10000,tokenCount:3}
    ]}
  });
  const byId=new Map(rows.map(x=>[x.id,x.value]));
  assert.equal(byId.get('research.dex.boostedPairCount'),2);
  assert.equal(byId.get('research.dex.boostedBuySellImbalanceH1'),.2);
  assert.ok(byId.get('research.dex.boostedLiquidityLog')>0);
  assert.ok(byId.get('research.dex.trendingMetaVolumeLog')>0);
  assert.equal(byId.get('research.dex.trendingMetaTokenCountLog'),Math.log1p(8));
});

test('learning context survives one failed DEX sub-source without inventing the missing side',async()=>{
  const fetchImpl=async url=>{
    if(url.endsWith('/token-boosts/top/v1')) return response([],503);
    if(url.endsWith('/metas/trending/v1')) return response([{name:'AI',liquidity:50,volume:100,tokenCount:2}]);
    throw new Error('unexpected '+url);
  };
  const p=createDexScreenerPublicProvider({fetchImpl,baseUrl:'https://example.test'});
  const out=await p.fetchLearningContext({metaLimit:1});
  assert.equal(out.ok,true);
  assert.equal(out.radar,null);
  assert.equal(out.metas.rows.length,1);
  assert.equal(out.errors.length,1);
  const features=dexScreenerLearningContextToExtraFeatures(out);
  assert.equal(features.some(x=>x.id==='research.dex.boostedPairCount'),false);
  assert.ok(features.some(x=>x.id==='research.dex.trendingMetaTokenCountLog'));
});
