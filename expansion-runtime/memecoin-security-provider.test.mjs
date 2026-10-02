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
  assert.ok(y.rows[0].security.unknownReasonCodes.includes('SECURITY_SOURCE_UNAVAILABLE'));
  assert.equal(y.securityProvider.unknownReasonCounts.SECURITY_SOURCE_UNAVAILABLE,1);
});

test('Honeypot.is top holders resolves EVM holder-only UNKNOWN before Blockscout fallback',async()=>{
  const address='0x5555555555555555555555555555555555555555';
  let blockscoutCalls=0;
  const p=createMemecoinSecurityProvider({
    minRequestGapMs:0,now:()=>3500,
    fetchImpl:async url=>{
      const u=new URL(url);
      if(u.hostname==='api.gopluslabs.io')return ok({code:1,result:{[address]:{
        is_honeypot:'0',is_mintable:'0',transfer_pausable:'0',is_blacklisted:'0',
        owner_change_balance:'0',hidden_owner:'0',can_take_back_ownership:'0',holders:[]
      }}});
      if(u.hostname==='api.honeypot.is'){
        assert.equal(u.pathname,'/v1/TopHolders');
        assert.equal(u.searchParams.get('chainID'),'8453');
        return ok({
          totalSupply:'1000',
          holders:Array.from({length:10},(_,i)=>({address:'0x'+String(i+1).padStart(40,'0'),balance:'30'}))
        });
      }
      if(u.hostname==='base.blockscout.com'){blockscoutCalls++;throw new Error('should not reach blockscout');}
      throw new Error('unexpected '+url);
    }
  });
  const out=await p.enrichSnapshot({rows:[{chainId:'base',tokenAddress:address}]},{maxChecks:1,maxHolderFallbackChecks:1});
  const s=out.rows[0].security;
  assert.equal(s.evidenceGate,'PASS');
  assert.equal(s.holderState.independentSource,'HONEYPOT_IS_TOP_HOLDERS');
  assert.equal(Number(s.holderState.top10Share.toFixed(2)),.3);
  assert.equal(out.securityProvider.holderFallback.resolvedPass,1);
  assert.equal(blockscoutCalls,0);
});

test('Blockscout holder evidence resolves a holder-only GoPlus UNKNOWN without relaxing other gates',async()=>{
  const address='0x3333333333333333333333333333333333333333';
  const values=Array.from({length:10},()=>String(40n*10n**18n));
  const p=createMemecoinSecurityProvider({
    minRequestGapMs:0,now:()=>4000,
    fetchImpl:async url=>{
      const u=new URL(url);
      if(u.hostname==='api.gopluslabs.io')return ok({code:1,result:{[address]:{
        is_honeypot:'0',is_mintable:'0',transfer_pausable:'0',is_blacklisted:'0',
        owner_change_balance:'0',hidden_owner:'0',can_take_back_ownership:'0',holders:[]
      }}});
      if(u.hostname==='base.blockscout.com'&&u.pathname.endsWith('/holders')){
        return ok({items:values.map((value,i)=>({address:{hash:'0x'+String(i+1).padStart(40,'0')},value}))});
      }
      if(u.hostname==='base.blockscout.com'){
        return ok({total_supply:String(1000n*10n**18n),holders_count:100});
      }
      throw new Error('unexpected '+url);
    }
  });
  const out=await p.enrichSnapshot({rows:[{chainId:'base',tokenAddress:address}]},{maxChecks:1,maxHolderFallbackChecks:1});
  const s=out.rows[0].security;
  assert.equal(s.evidenceGate,'PASS');
  assert.equal(s.coverage.holderConcentrationKnown,true);
  assert.equal(s.coverage.holderConcentrationIndependent,true);
  assert.equal(s.holderState.independentSource,'BLOCKSCOUT_BASE_TOKEN_HOLDERS');
  assert.equal(Number(s.holderState.top10Share.toFixed(2)),.4);
  assert.equal(out.securityProvider.holderFallback.resolvedPass,1);
  assert.equal(out.securityProvider.unknownReasonCounts.HOLDER_CONCENTRATION_EVIDENCE_MISSING,undefined);
});

test('Solana RPC holder fallback can convert concentration uncertainty into ABSTAIN',async()=>{
  const address='So11111111111111111111111111111111111111112';
  const p=createMemecoinSecurityProvider({
    minRequestGapMs:0,now:()=>5000,solanaRpcUrls:['https://solana.test'],
    fetchImpl:async (url,init={})=>{
      const u=new URL(url);
      if(u.hostname==='api.gopluslabs.io')return ok({code:1,result:{[address]:{
        mintable:{status:'0'},freezable:{status:'0'},non_transferable:'0',holders:[]
      }}});
      if(u.hostname==='solana.test'){
        const req=JSON.parse(init.body);
        if(req.method==='getTokenLargestAccounts')return ok({result:{context:{slot:123},value:[
          {amount:'700'},{amount:'100'},{amount:'50'}
        ]}});
        if(req.method==='getTokenSupply')return ok({result:{context:{slot:123},value:{amount:'1000',decimals:6}}});
      }
      throw new Error('unexpected '+url);
    }
  });
  const out=await p.enrichSnapshot({rows:[{chainId:'solana',tokenAddress:address}]},{maxChecks:1,maxHolderFallbackChecks:1});
  const s=out.rows[0].security;
  assert.equal(s.evidenceGate,'ABSTAIN');
  assert.ok(s.criticalRiskFlags.includes('HOLDER_CONCENTRATION_HIGH'));
  assert.ok(s.criticalRiskFlags.includes('SINGLE_HOLDER_CONCENTRATION_HIGH'));
  assert.equal(s.holderState.independentSource,'SOLANA_RPC_TOKEN_LARGEST_ACCOUNTS');
  assert.equal(out.securityProvider.holderFallback.resolvedAbstain,1);
});

test('secondary holder source failure remains fail-closed UNKNOWN',async()=>{
  const address='0x4444444444444444444444444444444444444444';
  const p=createMemecoinSecurityProvider({
    minRequestGapMs:0,now:()=>6000,
    fetchImpl:async url=>{
      const u=new URL(url);
      if(u.hostname==='api.gopluslabs.io')return ok({code:1,result:{[address]:{
        is_honeypot:'0',is_mintable:'0',transfer_pausable:'0',is_blacklisted:'0',
        owner_change_balance:'0',hidden_owner:'0',can_take_back_ownership:'0',holders:[]
      }}});
      return {ok:false,status:503,json:async()=>({})};
    }
  });
  const out=await p.enrichSnapshot({rows:[{chainId:'ethereum',tokenAddress:address}]},{maxChecks:1,maxHolderFallbackChecks:1});
  assert.equal(out.rows[0].security.evidenceGate,'UNKNOWN');
  assert.ok(out.rows[0].security.unknownReasonCodes.includes('HOLDER_CONCENTRATION_EVIDENCE_MISSING'));
  assert.equal(out.securityProvider.holderFallback.errors.length,1);
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
