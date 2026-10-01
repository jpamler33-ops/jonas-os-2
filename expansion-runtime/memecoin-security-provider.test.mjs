import test from 'node:test';
import assert from 'node:assert/strict';
import {createMemecoinSecurityProvider,MEMECOIN_SECURITY_PROVIDER_VERSION} from './memecoin-security-provider.mjs';

const ok=data=>({ok:true,status:200,json:async()=>data});

test('EVM honeypot and concentration fail closed',async()=>{
  const address='0x1111111111111111111111111111111111111111';
  const p=createMemecoinSecurityProvider({
    minRequestGapMs:0,now:()=>1000,
    fetchImpl:async url=>{
      assert.match(url,/token_security\/1/);
      return ok({code:1,message:'ok',result:{[address]:{
        is_honeypot:'1',is_mintable:'0',transfer_pausable:'0',is_blacklisted:'0',
        holders:[{percent:'0.40'},{percent:'0.30'}],lp_holders:[{percent:'0.80',is_locked:'1'}],
        is_open_source:'1'
      }}});
    }
  });
  const x=await p.fetchTokenSecurity('ethereum',address);
  assert.equal(x.version,MEMECOIN_SECURITY_PROVIDER_VERSION);
  assert.equal(x.evidenceGate,'ABSTAIN');
  assert.ok(x.criticalRiskFlags.includes('HONEYPOT_FLAGGED'));
  assert.ok(x.criticalRiskFlags.includes('HOLDER_CONCENTRATION_HIGH'));
  assert.equal(x.liquidityState.lockedShare,.8);
});

test('Solana authority risks are normalized',async()=>{
  const address='So11111111111111111111111111111111111111112';
  const p=createMemecoinSecurityProvider({
    minRequestGapMs:0,now:()=>2000,
    fetchImpl:async url=>{
      assert.match(url,/solana\/token_security/);
      return ok({code:1,result:{[address]:{
        mintable:{status:'1'},freezable:{status:'0'},non_transferable:'0',
        holders:[{percent:'0.10'},{percent:'0.08'}],
        creator:[{address:'abc',malicious_address:'0'}],
        dex:[{tvl:'50000',lp_holders:[{percent:'0.75',is_locked:'1'}]}]
      }}});
    }
  });
  const x=await p.fetchTokenSecurity('solana',address);
  assert.equal(x.evidenceGate,'ABSTAIN');
  assert.ok(x.criticalRiskFlags.includes('MINT_AUTHORITY_ACTIVE'));
  assert.equal(x.holderState.top10Share,.18);
  assert.equal(x.liquidityState.lockedShare,.75);
});

test('clean covered token can pass and unknown source never fabricates pass',async()=>{
  const address='0x2222222222222222222222222222222222222222';
  const p=createMemecoinSecurityProvider({
    minRequestGapMs:0,now:()=>3000,
    fetchImpl:async()=>ok({code:1,result:{[address]:{
      is_honeypot:'0',is_mintable:'0',transfer_pausable:'0',is_blacklisted:'0',
      owner_change_balance:'0',hidden_owner:'0',can_take_back_ownership:'0',
      holders:[{percent:'0.08'},{percent:'0.07'}],is_open_source:'1'
    }}})
  });
  const x=await p.fetchTokenSecurity('base',address);
  assert.equal(x.evidenceGate,'PASS');
  assert.equal(x.criticalRiskFlags.length,0);

  const bad=createMemecoinSecurityProvider({minRequestGapMs:0,fetchImpl:async()=>({ok:false,status:503,json:async()=>({})})});
  const y=await bad.enrichSnapshot({rows:[{chainId:'base',tokenAddress:address}]},{maxChecks:1});
  assert.equal(y.rows[0].security.evidenceGate,'UNKNOWN');
  assert.ok(y.rows[0].security.warningFlags.includes('SECURITY_SOURCE_UNAVAILABLE'));
});

test('enrichment is bounded to protect free-provider rate budget',async()=>{
  let calls=0;
  const p=createMemecoinSecurityProvider({
    minRequestGapMs:0,
    fetchImpl:async()=>{calls++;return ok({code:1,result:{x:{
      is_honeypot:'0',is_mintable:'0',transfer_pausable:'0',owner_change_balance:'0',
      holders:[{percent:'0.05'}]
    }}});}
  });
  const rows=Array.from({length:8},(_,i)=>({chainId:'ethereum',tokenAddress:'0x'+String(i+1).padStart(40,'0')}));
  const out=await p.enrichSnapshot({rows},{maxChecks:3});
  assert.equal(calls,3);
  assert.equal(out.securityProvider.attempted,3);
  assert.equal(out.rows.length,8);
});
