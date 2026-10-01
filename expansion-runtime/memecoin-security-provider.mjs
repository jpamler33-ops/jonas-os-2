export const MEMECOIN_SECURITY_PROVIDER_VERSION='BIGGJ_MEMECOIN_SECURITY_V1';

function finite(v){
  if(v===null||v===undefined||v==='')return null;
  const n=Number(v);return Number.isFinite(n)?n:null;
}
function bool01(v){
  if(v===true||v===1||v==='1')return true;
  if(v===false||v===0||v==='0')return false;
  return null;
}
function text(v,max=220){
  const s=String(v??'').trim();
  return s.length<=max?s:s.slice(0,max-1)+'…';
}
function clamp01(v){
  const n=finite(v);return n==null?null:Math.max(0,Math.min(1,n));
}
function freeze(v){
  if(v&&typeof v==='object'&&!Object.isFrozen(v)){
    Object.freeze(v);for(const x of Object.values(v))freeze(x);
  }
  return v;
}
function normChain(v){
  const x=String(v||'').toLowerCase().trim();
  if(x==='eth')return 'ethereum';
  if(x==='sol')return 'solana';
  return x;
}
function chainIdForGoPlus(chain){
  const c=normChain(chain);
  if(c==='ethereum')return '1';
  if(c==='base')return '8453';
  return null;
}
function topHolderStats(holders=[]){
  const xs=(Array.isArray(holders)?holders:[])
    .map(x=>({percent:clamp01(x?.percent),tag:text(x?.tag,80),locked:bool01(x?.is_locked)}))
    .filter(x=>x.percent!=null);
  return {
    top10Share:xs.length?Math.min(1,xs.slice(0,10).reduce((s,x)=>s+x.percent,0)):null,
    largestHolderShare:xs.length?Math.max(...xs.map(x=>x.percent)):null,
    observedHolders:xs.length
  };
}
function lpLockedShare(lpHolders=[]){
  const xs=(Array.isArray(lpHolders)?lpHolders:[])
    .map(x=>({percent:clamp01(x?.percent),locked:bool01(x?.is_locked),tag:text(x?.tag,80)}))
    .filter(x=>x.percent!=null);
  if(!xs.length)return null;
  return Math.min(1,xs.filter(x=>x.locked===true||/burn|dead|lock/i.test(x.tag)).reduce((s,x)=>s+x.percent,0));
}
function b20Status(raw,key){
  return bool01(raw?.b20_token?.b20_info?.[key]?.status);
}
function securityGate({criticalRiskFlags=[],coverage={}}={}){
  if(criticalRiskFlags.length)return 'ABSTAIN';
  const required=['tradeRestrictionKnown','adminAuthorityKnown','holderConcentrationKnown'];
  return required.every(k=>coverage?.[k]===true)?'PASS':'UNKNOWN';
}
function coverageGapCodes(coverage={}){
  const out=[];
  if(coverage?.tradeRestrictionKnown!==true)out.push('TRADE_RESTRICTION_EVIDENCE_MISSING');
  if(coverage?.adminAuthorityKnown!==true)out.push('ADMIN_AUTHORITY_EVIDENCE_MISSING');
  if(coverage?.holderConcentrationKnown!==true)out.push('HOLDER_CONCENTRATION_EVIDENCE_MISSING');
  return out;
}
function evmNormalize(raw={},meta={}){
  const holders=topHolderStats(raw?.holders);
  const locked=lpLockedShare(raw?.lp_holders);
  const honeypot=bool01(raw?.is_honeypot);
  const mintable=bool01(raw?.is_mintable)??b20Status(raw,'mintable');
  const transferPausable=bool01(raw?.transfer_pausable)??b20Status(raw,'transfer_pausable');
  const blacklisted=bool01(raw?.is_blacklisted)??b20Status(raw,'blacklist');
  const cannotSell=b20Status(raw,'cannot_sell')??bool01(raw?.cannot_sell_all);
  const cannotBuy=b20Status(raw,'cannot_buy');
  const ownerChangeBalance=bool01(raw?.owner_change_balance)??b20Status(raw,'owner_change_balance');
  const hiddenOwner=bool01(raw?.hidden_owner);
  const takeBackOwnership=bool01(raw?.can_take_back_ownership);
  const selfDestruct=bool01(raw?.selfdestruct);
  const openSource=bool01(raw?.is_open_source);
  const creatorPercent=clamp01(raw?.creator_percent);
  const ownerPercent=clamp01(raw?.owner_percent);
  const buyTax=finite(raw?.buy_tax);
  const sellTax=finite(raw?.sell_tax);
  const flags=[];
  const warnings=[];
  const push=(cond,name)=>{if(cond===true)flags.push(name);};
  push(honeypot,'HONEYPOT_FLAGGED');
  push(cannotSell,'SELL_RESTRICTION_PRESENT');
  push(cannotBuy,'BUY_RESTRICTION_PRESENT');
  push(mintable,'MINT_AUTHORITY_ACTIVE');
  push(transferPausable,'TRANSFER_PAUSABLE');
  push(blacklisted,'BLACKLIST_FUNCTION');
  push(ownerChangeBalance,'OWNER_CAN_CHANGE_BALANCE');
  push(hiddenOwner,'HIDDEN_OWNER');
  push(takeBackOwnership,'OWNERSHIP_RECLAIMABLE');
  push(selfDestruct,'SELF_DESTRUCT_CAPABILITY');
  if(openSource===false)flags.push('CONTRACT_NOT_OPEN_SOURCE');
  if(holders.top10Share!=null&&holders.top10Share>.60)flags.push('HOLDER_CONCENTRATION_HIGH');
  if(holders.largestHolderShare!=null&&holders.largestHolderShare>.25)flags.push('SINGLE_HOLDER_CONCENTRATION_HIGH');
  if(creatorPercent!=null&&creatorPercent>.15)flags.push('CREATOR_ALLOCATION_HIGH');
  if(ownerPercent!=null&&ownerPercent>.15)flags.push('OWNER_ALLOCATION_HIGH');
  if(buyTax!=null&&buyTax>.20)flags.push('BUY_TAX_EXTREME');
  else if(buyTax!=null&&buyTax>.08)warnings.push('BUY_TAX_HIGH');
  if(sellTax!=null&&sellTax>.20)flags.push('SELL_TAX_EXTREME');
  else if(sellTax!=null&&sellTax>.08)warnings.push('SELL_TAX_HIGH');
  if(locked!=null&&locked<.50)warnings.push('LP_LOCK_COVERAGE_LOW');
  const coverage={
    tradeRestrictionKnown:[honeypot,cannotSell,transferPausable,blacklisted].some(x=>x!=null),
    adminAuthorityKnown:[mintable,ownerChangeBalance,hiddenOwner,takeBackOwnership].some(x=>x!=null),
    holderConcentrationKnown:holders.top10Share!=null,
    lpLockKnown:locked!=null,
    openSourceKnown:openSource!=null
  };
  const critical=[...new Set(flags)];
  const gate=securityGate({criticalRiskFlags:critical,coverage});
  const unknownReasonCodes=gate==='UNKNOWN'?coverageGapCodes(coverage):[];
  return freeze({
    version:MEMECOIN_SECURITY_PROVIDER_VERSION,
    source:'GOPLUS_TOKEN_SECURITY',
    capturedAt:meta.capturedAt,
    chainId:meta.chainId,
    tokenAddress:meta.tokenAddress,
    sourceReady:true,
    evidenceGate:gate,
    unknownReasonCodes,
    criticalRiskFlags:critical,
    warningFlags:[...new Set(warnings)],
    tokenState:{
      honeypot,
      mintAuthorityActive:mintable,
      freezeAuthorityActive:transferPausable,
      transferRestrictions:[cannotSell,cannotBuy,transferPausable,blacklisted].some(x=>x===true)?true:
        [cannotSell,cannotBuy,transferPausable,blacklisted].every(x=>x==null)?null:false,
      ownerChangeBalance,
      hiddenOwner,
      takeBackOwnership,
      selfDestruct,
      openSource,
      buyTax,
      sellTax
    },
    holderState:{...holders,holderCount:finite(raw?.holder_count),creatorPercent,ownerPercent},
    liquidityState:{lockedShare:locked,lpHolderCount:finite(raw?.lp_holder_count)},
    coverage,
    epistemic:'THIRD_PARTY_SECURITY_EVIDENCE_NOT_RUG_PROBABILITY'
  });
}
function solanaNormalize(raw={},meta={}){
  const holders=topHolderStats(raw?.holders);
  const mintable=bool01(raw?.mintable?.status);
  const freezable=bool01(raw?.freezable?.status);
  const closable=bool01(raw?.closable?.status);
  const balanceMutable=bool01(raw?.balance_mutable_authority?.status);
  const hookUpgradable=bool01(raw?.transfer_hook_upgradable?.status);
  const nonTransferable=bool01(raw?.non_transferable);
  const defaultFrozen=String(raw?.default_account_state??'')==='2';
  const transferHook=raw?.transfer_hook&&typeof raw.transfer_hook==='object'?raw.transfer_hook:null;
  const transferHookMalicious=bool01(transferHook?.malicious_address);
  const creatorMalicious=(Array.isArray(raw?.creator)?raw.creator:[raw?.creator])
    .filter(Boolean).some(x=>bool01(x?.malicious_address)===true);
  const dexRows=Array.isArray(raw?.dex)?raw.dex:[];
  const bestDex=dexRows.slice().sort((a,b)=>(finite(b?.tvl)??0)-(finite(a?.tvl)??0))[0]||null;
  const locked=lpLockedShare(bestDex?.lp_holders||[]);
  const flags=[];
  const warnings=[];
  const push=(cond,name)=>{if(cond===true)flags.push(name);};
  push(mintable,'MINT_AUTHORITY_ACTIVE');
  push(freezable,'FREEZE_AUTHORITY_ACTIVE');
  push(nonTransferable,'NON_TRANSFERABLE');
  push(defaultFrozen,'DEFAULT_ACCOUNT_FROZEN');
  push(closable,'TOKEN_PROGRAM_CLOSABLE');
  push(balanceMutable,'BALANCE_MUTABLE_AUTHORITY');
  push(hookUpgradable,'TRANSFER_HOOK_UPGRADABLE');
  push(transferHookMalicious,'MALICIOUS_TRANSFER_HOOK');
  push(creatorMalicious,'MALICIOUS_CREATOR');
  if(transferHook&&!transferHookMalicious)warnings.push('TRANSFER_HOOK_PRESENT');
  if(holders.top10Share!=null&&holders.top10Share>.60)flags.push('HOLDER_CONCENTRATION_HIGH');
  if(holders.largestHolderShare!=null&&holders.largestHolderShare>.25)flags.push('SINGLE_HOLDER_CONCENTRATION_HIGH');
  if(locked!=null&&locked<.50)warnings.push('LP_LOCK_COVERAGE_LOW');
  const coverage={
    tradeRestrictionKnown:[nonTransferable,defaultFrozen,freezable].some(x=>x!=null),
    adminAuthorityKnown:[mintable,freezable,closable,balanceMutable,hookUpgradable].some(x=>x!=null),
    holderConcentrationKnown:holders.top10Share!=null,
    lpLockKnown:locked!=null,
    creatorRiskKnown:Array.isArray(raw?.creator)||raw?.creator!=null
  };
  const critical=[...new Set(flags)];
  const gate=securityGate({criticalRiskFlags:critical,coverage});
  const unknownReasonCodes=gate==='UNKNOWN'?coverageGapCodes(coverage):[];
  return freeze({
    version:MEMECOIN_SECURITY_PROVIDER_VERSION,
    source:'GOPLUS_SOLANA_TOKEN_SECURITY',
    capturedAt:meta.capturedAt,
    chainId:meta.chainId,
    tokenAddress:meta.tokenAddress,
    sourceReady:true,
    evidenceGate:gate,
    unknownReasonCodes,
    criticalRiskFlags:critical,
    warningFlags:[...new Set(warnings)],
    tokenState:{
      honeypot:null,
      mintAuthorityActive:mintable,
      freezeAuthorityActive:freezable,
      transferRestrictions:[nonTransferable,defaultFrozen,freezable,transferHookMalicious].some(x=>x===true)?true:false,
      closable,
      balanceMutable,
      transferHookPresent:Boolean(transferHook),
      transferHookUpgradable:hookUpgradable,
      transferHookMalicious,
      creatorMalicious
    },
    holderState:{...holders,holderCount:null},
    liquidityState:{lockedShare:locked,lpHolderCount:Array.isArray(bestDex?.lp_holders)?bestDex.lp_holders.length:null,tvlUsd:finite(bestDex?.tvl)},
    coverage,
    epistemic:'THIRD_PARTY_SECURITY_EVIDENCE_NOT_RUG_PROBABILITY'
  });
}

export function createMemecoinSecurityProvider({
  fetchImpl=globalThis.fetch,
  baseUrl='https://api.gopluslabs.io',
  accessToken='',
  timeoutMs=7000,
  cacheMs=5*60_000,
  minRequestGapMs=2100,
  now=()=>Date.now()
}={}){
  if(typeof fetchImpl!=='function')throw new Error('fetch implementation required');
  const base=String(baseUrl).replace(/\/+$/,'');
  const cache=new Map();
  let lastRequestAt=0;
  async function throttle(){
    const wait=Math.max(0,Number(minRequestGapMs)||0)-(Number(now())-lastRequestAt);
    if(wait>0)await new Promise(r=>setTimeout(r,wait));
    lastRequestAt=Number(now());
  }
  async function getJson(url){
    await throttle();
    const c=new AbortController();
    const timer=setTimeout(()=>c.abort(),Math.max(1000,Number(timeoutMs)||7000));
    try{
      const headers={accept:'application/json','user-agent':'BIGGJ/1.0 meme-security'};
      if(String(accessToken||'').trim())headers.authorization='Bearer '+String(accessToken).trim();
      const res=await fetchImpl(url,{headers,signal:c.signal});
      if(!res?.ok)throw new Error('HTTP_'+String(res?.status??'UNKNOWN'));
      const body=await res.json();
      if(body?.code!=null&&String(body.code)!=='1')throw new Error('GOPLUS_CODE_'+String(body.code)+':'+text(body?.message,120));
      return body;
    }finally{clearTimeout(timer);}
  }
  function pickResult(body,address){
    const result=body?.result;
    if(!result)return null;
    if(Array.isArray(result))return result[0]||null;
    if(typeof result!=='object')return null;
    const exact=result[address]??result[String(address).toLowerCase()]??result[String(address).toUpperCase()];
    if(exact&&typeof exact==='object')return exact;
    const vals=Object.values(result).filter(x=>x&&typeof x==='object');
    return vals.length===1?vals[0]:null;
  }
  async function fetchTokenSecurity(chainId,tokenAddress,{force=false}={}){
    const chain=normChain(chainId),address=String(tokenAddress||'').trim();
    if(!chain||!address)throw new Error('chainId and tokenAddress required');
    const key=chain+':'+address.toLowerCase(),t=Number(now()),hit=cache.get(key);
    if(!force&&hit&&t-hit.at<Math.max(30_000,Number(cacheMs)||300_000))return hit.value;
    let url;
    if(chain==='solana'){
      url=base+'/api/v1/solana/token_security?contract_addresses='+encodeURIComponent(address);
    }else{
      const gid=chainIdForGoPlus(chain);
      if(!gid)return freeze({version:MEMECOIN_SECURITY_PROVIDER_VERSION,source:'GOPLUS_TOKEN_SECURITY',capturedAt:t,chainId:chain,tokenAddress:address,sourceReady:false,evidenceGate:'UNKNOWN',unknownReasonCodes:['CHAIN_UNSUPPORTED'],criticalRiskFlags:[],warningFlags:['CHAIN_UNSUPPORTED'],coverage:{},epistemic:'NO_SECURITY_EVIDENCE'});
      url=base+'/api/v1/token_security/'+gid+'?contract_addresses='+encodeURIComponent(address);
    }
    const body=await getJson(url);
    const raw=pickResult(body,address);
    if(!raw)throw new Error('GOPLUS_TOKEN_RESULT_EMPTY');
    const value=chain==='solana'?solanaNormalize(raw,{capturedAt:t,chainId:chain,tokenAddress:address}):evmNormalize(raw,{capturedAt:t,chainId:chain,tokenAddress:address});
    cache.set(key,{at:t,value});
    return value;
  }
  async function enrichSnapshot(snapshot,{maxChecks=5,force=false}={}){
    const rows=Array.isArray(snapshot?.rows)?snapshot.rows:[];
    const out=[];
    const errors=[];
    let attempted=0;
    for(const row of rows){
      let security=row?.security||null;
      if(attempted<Math.max(0,Number(maxChecks)||0)){
        try{
          security=await fetchTokenSecurity(row?.chainId,row?.tokenAddress,{force});
          attempted++;
        }catch(err){
          attempted++;
          errors.push(String(row?.chainId||'')+':'+String(row?.tokenAddress||'')+':'+(err instanceof Error?err.message:String(err)));
          security=freeze({
            version:MEMECOIN_SECURITY_PROVIDER_VERSION,source:'GOPLUS_TOKEN_SECURITY',capturedAt:Number(now()),
            chainId:normChain(row?.chainId),tokenAddress:String(row?.tokenAddress||''),sourceReady:false,
            evidenceGate:'UNKNOWN',unknownReasonCodes:['SECURITY_SOURCE_UNAVAILABLE'],
            criticalRiskFlags:[],warningFlags:['SECURITY_SOURCE_UNAVAILABLE'],
            coverage:{},epistemic:'NO_SECURITY_EVIDENCE'
          });
        }
      }
      out.push(freeze({...row,security}));
    }
    const unknownReasonCounts={};
    for(const row of out){
      if(row?.security?.evidenceGate!=='UNKNOWN')continue;
      for(const code of row?.security?.unknownReasonCodes||['UNKNOWN_EVIDENCE_GAP']){
        unknownReasonCounts[code]=(unknownReasonCounts[code]||0)+1;
      }
    }
    return freeze({...snapshot,rows:out,securityProvider:{
      version:MEMECOIN_SECURITY_PROVIDER_VERSION,source:'GOPLUS',attempted,errors,
      unknownReasonCounts,freeRateLimitAware:true
    }});
  }
  return freeze({version:MEMECOIN_SECURITY_PROVIDER_VERSION,fetchTokenSecurity,enrichSnapshot});
}
