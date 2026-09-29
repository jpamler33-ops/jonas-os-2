import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createOnchainResearchProvider,
  onchainSnapshotToExtraFeatures
} from './onchain-research-provider.mjs';

function response(body,{status=200,text=false}={}){
  return {
    ok:status>=200&&status<300,
    status,
    async text(){ return text?String(body):JSON.stringify(body); }
  };
}

function rpcResult(result){ return response({jsonrpc:'2.0',id:1,result}); }

function fetchMock(url,opts={}){
  const u=String(url);
  if(u.includes('mempool.space/api/mempool')) return Promise.resolve(response({count:1000,vsize:250000,total_fee:1234567}));
  if(u.includes('mempool.space/api/v1/fees/recommended')) return Promise.resolve(response({fastestFee:12,halfHourFee:8,hourFee:5}));
  if(u.includes('mempool.space/api/blocks/tip/height')) return Promise.resolve(response('900000',{text:true}));

  if(opts.method==='POST'&&u.includes('ethereum-rpc')){
    const req=JSON.parse(opts.body);
    if(req.method==='eth_getBlockByNumber') return Promise.resolve(rpcResult({
      number:'0x64',
      timestamp:'0x3e8',
      gasUsed:'0x4c4b40',
      gasLimit:'0x989680',
      baseFeePerGas:'0x3b9aca00',
      transactions:[
        {value:'0x56bc75e2d63100000'},
        {value:'0xde0b6b3a7640000'}
      ]
    }));
    if(req.method==='eth_gasPrice') return Promise.resolve(rpcResult('0x77359400'));
  }

  if(opts.method==='POST'&&u.includes('solana')){
    const req=JSON.parse(opts.body);
    if(req.method==='getRecentPerformanceSamples') return Promise.resolve(rpcResult([
      {numTransactions:6000,numNonVoteTransactions:4000,samplePeriodSecs:10,numSlots:25},
      {numTransactions:6600,numNonVoteTransactions:4200,samplePeriodSecs:10,numSlots:25}
    ]));
    if(req.method==='getRecentPrioritizationFees') return Promise.resolve(rpcResult([
      {slot:1,prioritizationFee:100},
      {slot:2,prioritizationFee:300},
      {slot:3,prioritizationFee:200}
    ]));
    if(req.method==='getSlot') return Promise.resolve(rpcResult(123456));
  }

  throw new Error('unhandled '+u);
}

test('bitcoin snapshot exposes mempool pressure without fabricated wallet labels',async()=>{
  const p=createOnchainResearchProvider({fetchImpl:fetchMock,now:()=>2_000_000});
  const s=await p.fetchAssetSnapshot('BTCUSDT',{cacheMs:0});
  assert.equal(s.ok,true);
  assert.equal(s.chain,'BITCOIN');
  assert.equal(s.metrics.mempoolTxCount,1000);
  assert.equal(s.metrics.fastestFeeSatVb,12);
  const ids=onchainSnapshotToExtraFeatures(s).map(x=>x.id);
  assert.ok(ids.includes('research.onchain.btc.mempoolLogCount'));
  assert.ok(ids.includes('research.onchain.btc.fastestFeeSatVb'));
});

test('ethereum snapshot derives block pressure and large native transfer proxy',async()=>{
  const p=createOnchainResearchProvider({
    fetchImpl:fetchMock,
    ethereumRpcUrl:'https://ethereum-rpc.publicnode.com',
    now:()=>2_000_000
  });
  const s=await p.fetchAssetSnapshot('ETHUSDT',{cacheMs:0});
  assert.equal(s.ok,true);
  assert.equal(s.chain,'ETHEREUM');
  assert.equal(s.metrics.gasUtilization,.5);
  assert.equal(s.metrics.baseFeeGwei,1);
  assert.equal(s.metrics.gasPriceGwei,2);
  assert.equal(s.metrics.txCount,2);
  assert.equal(s.metrics.largeNativeTransferCount,1);
  assert.equal(s.metrics.largeNativeTransferEth,100);
});

test('solana snapshot derives public RPC throughput and fee pressure',async()=>{
  const p=createOnchainResearchProvider({
    fetchImpl:fetchMock,
    solanaRpcUrl:'https://api.mainnet-beta.solana.com',
    now:()=>2_000_000
  });
  const s=await p.fetchAssetSnapshot('SOLUSDT',{cacheMs:0});
  assert.equal(s.ok,true);
  assert.equal(s.chain,'SOLANA');
  assert.equal(s.metrics.tps,630);
  assert.equal(s.metrics.nonVoteTps,410);
  assert.equal(s.metrics.avgSlotMs,400);
  assert.equal(s.metrics.priorityFeeMedian,200);
  const rows=onchainSnapshotToExtraFeatures(s);
  assert.ok(rows.every(x=>Number.isFinite(x.value)));
});

test('unmapped assets fail closed instead of inventing on-chain context',async()=>{
  const p=createOnchainResearchProvider({fetchImpl:fetchMock,now:()=>2_000_000});
  const s=await p.fetchAssetSnapshot('DOGEUSDT',{cacheMs:0});
  assert.equal(s.ok,false);
  assert.equal(s.reason,'CHAIN_RESEARCH_NOT_MAPPED');
  assert.deepEqual(onchainSnapshotToExtraFeatures(s),[]);
});
