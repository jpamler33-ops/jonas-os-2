import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp } from 'node:fs/promises';

import {
  buildEntityAddressIndex,
  classifyEvmNativeTransaction,
  classifyEvmNativeBlocks,
  aggregateEntityFlow,
  createEthereumEntityFlowProvider,
  createEntityFlowMemory,
  observeEntityFlowMemory,
  scoreEntityFlowSnapshot,
  entityFlowSnapshotToExtraFeatures,
  entityFlowMemorySummary,
  loadEntityFlowMemory,
  saveEntityFlowMemory
} from './entity-flow-engine.mjs';

const OKX_A='0x1111111111111111111111111111111111111111';
const OKX_B='0x2222222222222222222222222222222222222222';
const BINANCE_A='0x3333333333333333333333333333333333333333';
const OUTSIDE='0x4444444444444444444444444444444444444444';

function registry(){
  const source={publisher:'OKX',reportId:'R1',reportDate:'2026-09-08',sourceType:'OFFICIAL_PROOF_OF_RESERVES'};
  return {
    entries:[
      {entityId:'OKX',entityType:'EXCHANGE',chain:'ETHEREUM',address:OKX_A,verificationStatus:'OFFICIAL_SOURCE_ATTESTED_WITH_SIGNATURE',source},
      {entityId:'OKX',entityType:'EXCHANGE',chain:'ETHEREUM',address:OKX_B,verificationStatus:'OFFICIAL_SOURCE_ATTESTED_WITH_SIGNATURE',source},
      {entityId:'BINANCE',entityType:'EXCHANGE',chain:'ETHEREUM',address:BINANCE_A,verificationStatus:'OFFICIAL_SOURCE_ATTESTED_WITH_SIGNATURE',source:{...source,publisher:'BINANCE'}},
      {entityId:'BAD',entityType:'EXCHANGE',chain:'ETHEREUM',address:'0x5555555555555555555555555555555555555555',verificationStatus:'UNVERIFIED',source:{sourceType:'THIRD_PARTY'}}
    ]
  };
}

function block(number,ts,transactions){
  return {
    number:'0x'+number.toString(16),
    hash:'0x'+String(number).padStart(64,'0'),
    timestamp:'0x'+Math.floor(ts/1000).toString(16),
    transactions
  };
}
function tx(hash,from,to,eth){
  return {
    hash,
    from,
    to,
    value:'0x'+(BigInt(Math.round(eth*1e6))*10n**12n).toString(16),
    nonce:'0x1'
  };
}

test('verified entity index accepts only official attested exchange addresses',()=>{
  const idx=buildEntityAddressIndex(registry(),{chain:'ETHEREUM'});
  assert.equal(idx.addressCount,3);
  assert.equal(idx.entityCount,2);
  assert.equal(idx.addressToEntity.get(OKX_A),'OKX');
  assert.equal(idx.addressToEntity.get(BINANCE_A),'BINANCE');
  assert.equal(idx.addressToEntity.has('0x5555555555555555555555555555555555555555'),false);
});

test('classification separates external inflow, outflow, internal and inter-entity transfers',()=>{
  const idx=buildEntityAddressIndex(registry());
  const b=block(100,2_000_000,[]);
  const inflow=classifyEvmNativeTransaction(tx('0x1',OUTSIDE,OKX_A,10),b,idx);
  const outflow=classifyEvmNativeTransaction(tx('0x2',OKX_A,OUTSIDE,4),b,idx);
  const internal=classifyEvmNativeTransaction(tx('0x3',OKX_A,OKX_B,3),b,idx);
  const inter=classifyEvmNativeTransaction(tx('0x4',OKX_A,BINANCE_A,2),b,idx);
  assert.equal(inflow.classification,'INFLOW');
  assert.equal(inflow.entityId,'OKX');
  assert.equal(outflow.classification,'OUTFLOW');
  assert.equal(internal.classification,'INTERNAL');
  assert.equal(inter.classification,'INTER_ENTITY');
});

test('external flow aggregation excludes same-entity and exchange-to-exchange transfers from net',()=>{
  const idx=buildEntityAddressIndex(registry());
  const asOf=2_000_000;
  const b=block(100,asOf-10_000,[
    tx('0xa',OUTSIDE,OKX_A,10),
    tx('0xb',OKX_A,OUTSIDE,4),
    tx('0xc',OKX_A,OKX_B,100),
    tx('0xd',OKX_A,BINANCE_A,50)
  ]);
  const events=classifyEvmNativeBlocks([b],idx);
  const agg=aggregateEntityFlow(events,{entityId:'OKX',asOf,windowMs:5*60_000});
  assert.equal(agg.inflowEth,10);
  assert.equal(agg.outflowEth,4);
  assert.equal(agg.netExternalEth,6);
  assert.equal(agg.grossExternalEth,14);
  assert.equal(agg.internalEth,100);
  assert.equal(agg.interEntityEth,50);
  assert.equal(agg.externalTxCount,2);
});

test('robust anomaly score is point-in-time and requires baseline observations',()=>{
  const memory=createEntityFlowMemory();
  const baseSnapshot={
    ok:true,
    fingerprint:'base',
    availableAt:2_000_000,
    finalizedBlockNumber:100,
    entities:{OKX:{'5m':{
      entityId:'OKX',asOf:2_000_000,windowMs:300000,
      inflowEth:5,outflowEth:5,netExternalEth:0,grossExternalEth:10,
      inflowShare:.5,externalTxCount:2,largestExternalShare:.5
    }}}
  };
  for(let i=0;i<25;i++){
    const s=structuredClone(baseSnapshot);
    s.fingerprint='b'+i;
    s.availableAt+=i*300000;
    s.finalizedBlockNumber+=i;
    s.entities.OKX['5m'].grossExternalEth=10+(i%3);
    observeEntityFlowMemory(memory,s,{observedAt:s.availableAt});
  }
  const current=structuredClone(baseSnapshot);
  current.fingerprint='spike';
  current.availableAt=20_000_000;
  current.entities.OKX['5m'].grossExternalEth=100;
  const scored=scoreEntityFlowSnapshot(current,memory,{minBaselineSamples:20});
  assert.ok(scored.entities.OKX['5m'].grossExternalRobustZ>10);
  const features=entityFlowSnapshotToExtraFeatures(scored);
  assert.ok(features.some(x=>x.id==='research.entityflow.eth.grossAnomaly5m'));
});

test('provider scans finalized blocks in bounded batches and produces classified snapshot',async()=>{
  const idx=buildEntityAddressIndex(registry());
  const finalizedTs=2_000_000;
  let batchCalls=0;
  const fetchImpl=async(_url,opts)=>{
    const req=JSON.parse(opts.body);
    if(!Array.isArray(req)){
      assert.equal(req.method,'eth_getBlockByNumber');
      assert.equal(req.params[0],'finalized');
      return {
        ok:true,status:200,
        async text(){
          return JSON.stringify({jsonrpc:'2.0',id:1,result:block(100,finalizedTs,[
            tx('0xf',OUTSIDE,OKX_A,12)
          ])});
        }
      };
    }
    batchCalls++;
    const rows=req.map(r=>{
      const n=parseInt(r.params[0],16);
      const age=(100-n)*12_000;
      return {
        jsonrpc:'2.0',
        id:r.id,
        result:block(n,finalizedTs-age,n===99?[tx('0xe',OKX_A,OUTSIDE,2)]:[])
      };
    });
    return {ok:true,status:200,async text(){return JSON.stringify(rows);}};
  };
  const provider=createEthereumEntityFlowProvider({
    fetchImpl,
    rpcUrl:'https://eth.local',
    addressIndex:idx,
    entityIds:['OKX'],
    maxBlocks:20,
    batchSize:4,
    now:()=>2_100_000,
    cacheMs:0
  });
  const s=await provider.fetchSnapshot({force:true});
  assert.equal(s.ok,true);
  assert.equal(s.finalizedBlockNumber,100);
  assert.ok(batchCalls<=5);
  assert.equal(s.entities.OKX['5m'].inflowEth,12);
  assert.equal(s.entities.OKX['5m'].outflowEth,2);
  assert.equal(s.entities.OKX['5m'].netExternalEth,10);
  assert.equal(s.restrictions.finalizedBlocksOnly,true);
});

test('entity flow memory survives persistence round trip',async()=>{
  const memory=createEntityFlowMemory();
  observeEntityFlowMemory(memory,{
    ok:true,
    fingerprint:'x',
    availableAt:2_000_000,
    finalizedBlockNumber:10,
    entities:{OKX:{'5m':{
      inflowEth:1,outflowEth:0,netExternalEth:1,grossExternalEth:1,
      externalTxCount:1,largestExternalShare:1
    }}}
  },{observedAt:2_000_000});
  const dir=await mkdtemp(path.join(os.tmpdir(),'tcx-entity-flow-'));
  const file=path.join(dir,'memory.json');
  await saveEntityFlowMemory(file,memory);
  const loaded=await loadEntityFlowMemory(file);
  assert.equal(entityFlowMemorySummary(loaded).observations,1);
  assert.equal(loaded.observations[0].entityId,'OKX');
});
