import test from 'node:test';
import assert from 'node:assert/strict';
import { createDexScreenerPublicProvider, dexScreenerTrendingMetasToExtraFeatures } from './dexscreener-public-provider.mjs';

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


test('trending metas convert to governed research features without inventing values',()=>{
  const rows=dexScreenerTrendingMetasToExtraFeatures({
    rows:[
      {marketCap:1000,liquidity:100,volume:200,marketCapChange:{h1:10,h24:20}},
      {marketCap:3000,liquidity:300,volume:100,marketCapChange:{h1:-2,h24:4}}
    ]
  });
  const byId=new Map(rows.map(x=>[x.id,x.value]));
  assert.equal(byId.get('research.dex.trendingTopLiquidityShare'),.75);
  assert.equal(byId.get('research.dex.trendingVolumeLiquidityRatio'),.75);
  assert.equal(byId.get('research.dex.trendingH1MedianPct'),4);
  assert.equal(byId.get('research.dex.trendingH24MedianPct'),12);
  assert.ok(byId.get('research.dex.trendingMarketCapLog')>0);
  assert.ok(byId.get('research.dex.trendingLiquidityLog')>0);
});
