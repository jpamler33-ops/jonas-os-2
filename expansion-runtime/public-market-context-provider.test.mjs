import test from 'node:test';
import assert from 'node:assert/strict';
import { createPublicMarketContextProvider } from './public-market-context-provider.mjs';

function response(body,status=200){
  return {ok:status>=200&&status<300,status,json:async()=>body};
}

test('public market context combines sentiment and global snapshot',async()=>{
  const fetchImpl=async url=>{
    if(url.includes('/fng/')) return response({data:[
      {value:'69',value_classification:'Greed',timestamp:'1700000000',time_until_update:'100'},
      {value:'66',value_classification:'Greed',timestamp:'1699913600'}
    ]});
    if(url.includes('/v2/global/')) return response({data:{
      active_cryptocurrencies:1000,
      active_markets:5000,
      bitcoin_percentage_of_market_cap:55.2,
      quotes:{USD:{total_market_cap:1000000,total_volume_24h:250000}},
      last_updated:1700000000
    }});
    throw new Error('unexpected '+url);
  };
  const p=createPublicMarketContextProvider({fetchImpl,alternativeBase:'https://example.test'});
  const out=await p.fetchContext();
  assert.equal(out.sentiment.value,69);
  assert.equal(out.sentiment.delta,3);
  assert.equal(out.global.bitcoinDominancePct,55.2);
  assert.equal(out.errors.length,0);
});

test('context degrades per-source instead of fabricating data',async()=>{
  const fetchImpl=async url=>{
    if(url.includes('/fng/')) return response({},503);
    return response({data:{quotes:{USD:{total_market_cap:10,total_volume_24h:2}}}});
  };
  const p=createPublicMarketContextProvider({fetchImpl,alternativeBase:'https://example.test'});
  const out=await p.fetchContext({force:true});
  assert.equal(out.sentiment,null);
  assert.equal(out.global.totalMarketCapUsd,10);
  assert.equal(out.errors.length,1);
});
