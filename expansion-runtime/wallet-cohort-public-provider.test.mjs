import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createWalletCohortPublicProvider,
  parseWalletCohorts,
  walletCohortSnapshotToExtraFeatures
} from './wallet-cohort-public-provider.mjs';

function response(result){
  return {
    ok:true,
    status:200,
    async text(){return JSON.stringify({jsonrpc:'2.0',id:1,result});}
  };
}

test('wallet cohort config accepts only explicit public ETH/SOL address cohorts',()=>{
  const rows=parseWalletCohorts(JSON.stringify([
    {id:'sol-research',chain:'solana',symbol:'SOLUSDT',addresses:['A','A','B']},
    {id:'bad',chain:'bitcoin',symbol:'BTCUSDT',addresses:['x']}
  ]));
  assert.equal(rows.length,1);
  assert.equal(rows[0].chain,'SOLANA');
  assert.deepEqual(rows[0].addresses,['A','B']);
});

test('no configured cohort fails closed without inventing wallet evidence',async()=>{
  const p=createWalletCohortPublicProvider({fetchImpl:async()=>{throw new Error('should not call');},cohorts:[],now:()=>2_000_000});
  const s=await p.fetchSnapshot('SOLUSDT');
  assert.equal(s.ok,false);
  assert.equal(s.reason,'NO_CONFIGURED_COHORT');
  assert.deepEqual(walletCohortSnapshotToExtraFeatures(s),[]);
});

test('solana cohort produces public activity features without identity claims',async()=>{
  const now=2_000_000;
  const p=createWalletCohortPublicProvider({
    cohorts:[{id:'sol-public',chain:'SOLANA',symbol:'SOLUSDT',addresses:['ADDR1']}],
    now:()=>now,
    fetchImpl:async(url,opts)=>{
      const req=JSON.parse(opts.body);
      assert.equal(req.method,'getSignaturesForAddress');
      return response([
        {signature:'a',blockTime:(now-60_000)/1000,err:null},
        {signature:'b',blockTime:(now-8*60_000)/1000,err:{x:1}},
        {signature:'c',blockTime:(now-20*60_000)/1000,err:null}
      ]);
    }
  });
  const s=await p.fetchSnapshot('SOLUSDT',{asOf:now});
  assert.equal(s.ok,true);
  assert.equal(s.cohorts,1);
  assert.equal(s.metrics.activity5m,1);
  assert.equal(s.metrics.activity15m,2);
  assert.equal(s.metrics.successRate15m,.5);
  assert.equal(s.restrictions.naturalPersonIdentity,false);
  const rows=walletCohortSnapshotToExtraFeatures(s);
  assert.ok(rows.some(x=>x.id==='research.wallet.activity5m'));
  assert.ok(rows.every(x=>Number.isFinite(x.value)));
});


test('ethereum cohort uses batch block scan for verified address sets',async()=>{
  const now=2_000_000;
  const address='0x1111111111111111111111111111111111111111';
  let batchCalls=0;
  const p=createWalletCohortPublicProvider({
    cohorts:[{id:'okx-eth',chain:'ETHEREUM',symbol:'ETHUSDT',addresses:[address]}],
    ethereumRpcUrl:'https://ethereum-rpc.publicnode.com',
    now:()=>now,
    fetchImpl:async(_url,opts)=>{
      const req=JSON.parse(opts.body);
      if(!Array.isArray(req)){
        assert.equal(req.method,'eth_blockNumber');
        return response('0x64');
      }
      batchCalls++;
      const result=req.map((x,i)=>({
        jsonrpc:'2.0',
        id:x.id,
        result:{
          timestamp:'0x'+Math.floor((now-60_000)/1000).toString(16),
          transactions:i===0?[{
            from:'0x2222222222222222222222222222222222222222',
            to:address,
            value:'0xde0b6b3a7640000'
          }]:[]
        }
      }));
      return {
        ok:true,
        status:200,
        async text(){return JSON.stringify(result);}
      };
    }
  });
  const s=await p.fetchSnapshot('ETHUSDT',{asOf:now});
  assert.equal(s.ok,true);
  assert.equal(batchCalls,1);
  assert.equal(s.metrics.activity5m,1);
  assert.equal(s.metrics.activity15m,1);
  assert.equal(s.metrics.nativeNetFlow,1);
  assert.equal(s.metrics.nativeGrossFlow,1);
});


test('wallet cohort RPC aborts within configured timeout',async()=>{
  const now=2_000_000;
  const p=createWalletCohortPublicProvider({
    cohorts:[{id:'sol-timeout',chain:'SOLANA',symbol:'SOLUSDT',addresses:['ADDR1']}],
    timeoutMs:25,
    now:()=>now,
    fetchImpl:async(_url,opts)=>new Promise((_resolve,reject)=>{
      opts.signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true});
    })
  });
  const started=Date.now();
  const s=await p.fetchSnapshot('SOLUSDT',{asOf:now});
  const elapsed=Date.now()-started;
  assert.equal(s.ok,false);
  assert.equal(s.reason,'COHORT_FETCH_FAILED');
  assert.ok(elapsed<500,'timeout should fail closed quickly');
});

test('ethereum cohort does not fall back to unbounded serial block requests',async()=>{
  const now=2_000_000;
  const address='0x1111111111111111111111111111111111111111';
  let calls=0;
  const p=createWalletCohortPublicProvider({
    cohorts:[{id:'eth-bounded',chain:'ETHEREUM',symbol:'ETHUSDT',addresses:[address]}],
    timeoutMs:100,
    now:()=>now,
    fetchImpl:async(_url,opts)=>{
      calls++;
      const req=JSON.parse(opts.body);
      if(!Array.isArray(req)) return response('0x64');
      return {
        ok:false,
        status:503,
        async text(){return 'batch unavailable';}
      };
    }
  });
  const s=await p.fetchSnapshot('ETHUSDT',{asOf:now});
  assert.equal(s.ok,false);
  assert.equal(s.reason,'COHORT_FETCH_FAILED');
  assert.equal(calls,2);
  assert.match(s.errors[0].error,/ETHEREUM_COHORT_BATCH_FAILED/);
});
