import test from 'node:test';
import assert from 'node:assert/strict';
import { createPublicOnchainProvider } from './onchain-public-provider.mjs';

function mock(result){
  return async()=>({ok:true,status:200,json:async()=>({jsonrpc:'2.0',id:1,result})});
}

test('Solana provider rejects future observations at the PIT boundary',async()=>{
  const p=createPublicOnchainProvider({fetchImpl:mock([
    {signature:'old',slot:1,blockTime:1,err:null,confirmationStatus:'finalized'},
    {signature:'future',slot:2,blockTime:3,err:null,confirmationStatus:'finalized'}
  ]),solanaRpcUrl:'https://fixture.invalid'});
  const x=await p.solanaAddressActivity('wallet',{asOf:2000});
  assert.deepEqual(x.observations.map(v=>v.signature),['old']);
  assert.equal(x.restrictions.execution,false);
  assert.equal(x.restrictions.naturalPersonIdentity,false);
});

test('Solana transaction remains read-only and PIT-safe',async()=>{
  const p=createPublicOnchainProvider({fetchImpl:mock({slot:1,blockTime:1,meta:{},transaction:{}}),solanaRpcUrl:'https://fixture.invalid'});
  const x=await p.solanaTransaction('sig',{asOf:2000});
  assert.equal(x.chain,'SOLANA');
  assert.equal(x.provenance.rpcMethod,'getTransaction');
  assert.equal(x.restrictions.privateData,false);
});

test('Ethereum logs require an explicitly configured RPC endpoint',async()=>{
  const p=createPublicOnchainProvider({fetchImpl:mock([])});
  await assert.rejects(()=>p.ethereumLogs({}),/NOT_CONFIGURED/);
});
