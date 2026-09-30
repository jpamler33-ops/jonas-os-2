import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDefiLlamaPublicProvider,
  defiLlamaSnapshotToExtraFeatures
} from './defillama-public-provider.mjs';

function response(body,status=200){
  return {ok:status>=200&&status<300,status,json:async()=>body};
}

test('DefiLlama liquidity snapshot normalizes TVL and stablecoin context',async()=>{
  const fetchImpl=async url=>{
    if(String(url).endsWith('/v2/chains')) return response([
      {name:'Ethereum',tvl:600},
      {name:'Solana',tvl:300},
      {name:'Bitcoin',tvl:100}
    ]);
    if(String(url).endsWith('/stablecoinchains')) return response([
      {name:'Ethereum',totalCirculatingUSD:{peggedUSD:300}},
      {name:'Solana',totalCirculatingUSD:{peggedUSD:120}},
      {name:'Bitcoin',totalCirculatingUSD:{peggedUSD:5}}
    ]);
    throw new Error('unexpected '+url);
  };
  const p=createDefiLlamaPublicProvider({fetchImpl,chainsBase:'https://chains.test',stablecoinsBase:'https://stables.test',now:()=>2_000_000});
  const out=await p.fetchLiquiditySnapshot('ETHUSDT');
  assert.equal(out.ok,true);
  assert.equal(out.chainName,'Ethereum');
  assert.equal(out.metrics.totalTvlUsd,1000);
  assert.equal(out.metrics.chainTvlUsd,600);
  assert.equal(out.metrics.chainTvlShare,.6);
  assert.equal(out.metrics.chainStablecoinSupplyUsd,300);
  assert.equal(out.metrics.totalStablecoinSupplyUsd,425);
  assert.equal(out.metrics.chainStablecoinToTvlRatio,.5);
  const features=defiLlamaSnapshotToExtraFeatures(out);
  assert.ok(features.some(x=>x.id==='research.defi.chainTvlShare'&&x.value===.6));
  assert.ok(features.some(x=>x.id==='research.defi.chainStablecoinToTvlRatio'&&x.value===.5));
});

test('DefiLlama snapshot degrades when stablecoin endpoint fails without fabricating values',async()=>{
  const fetchImpl=async url=>{
    if(String(url).endsWith('/v2/chains')) return response([{name:'Solana',tvl:300},{name:'Ethereum',tvl:700}]);
    if(String(url).endsWith('/stablecoinchains')) return response({},503);
    throw new Error('unexpected '+url);
  };
  const p=createDefiLlamaPublicProvider({fetchImpl,chainsBase:'https://chains.test',stablecoinsBase:'https://stables.test',now:()=>2_000_000});
  const out=await p.fetchLiquiditySnapshot('SOLUSDT');
  assert.equal(out.ok,true);
  assert.equal(out.metrics.chainTvlShare,.3);
  assert.equal(out.metrics.chainStablecoinSupplyUsd,null);
  assert.equal(out.errors.length,1);
  const features=defiLlamaSnapshotToExtraFeatures(out);
  assert.equal(features.some(x=>x.id==='research.defi.chainStablecoinSupplyLog'),false);
});

test('unmapped symbols abstain from chain liquidity mapping',async()=>{
  const p=createDefiLlamaPublicProvider({fetchImpl:async()=>{throw new Error('should not fetch')},now:()=>2_000_000});
  const out=await p.fetchLiquiditySnapshot('DOGEUSDT');
  assert.equal(out.ok,false);
  assert.equal(out.reason,'CHAIN_LIQUIDITY_NOT_MAPPED');
});
