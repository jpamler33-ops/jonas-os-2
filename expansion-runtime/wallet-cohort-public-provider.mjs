export const WALLET_COHORT_PUBLIC_PROVIDER_VERSION='TCX_WALLET_COHORT_PUBLIC_PROVIDER_V1';

function finite(v){const n=Number(v);return Number.isFinite(n)?n:null;}
function signedLog(v){const n=finite(v);if(n==null)return null;return Math.sign(n)*Math.log1p(Math.abs(n));}
async function rpc(fetchImpl,url,method,params){
  const res=await fetchImpl(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});
  const text=await res.text();
  if(!res.ok) throw new Error('RPC_HTTP_'+res.status);
  const body=JSON.parse(text);
  if(body?.error) throw new Error('RPC_'+String(body.error.code||'ERROR'));
  return body.result;
}

export function parseWalletCohorts(raw){
  if(!raw) return [];
  let value;
  try{value=typeof raw==='string'?JSON.parse(raw):raw;}catch{return [];}
  if(!Array.isArray(value)) return [];
  return value.map(x=>({
    id:String(x?.id||'').trim(),
    chain:String(x?.chain||'').toUpperCase(),
    symbol:String(x?.symbol||'').toUpperCase(),
    addresses:[...new Set((Array.isArray(x?.addresses)?x.addresses:[]).map(a=>String(a).trim()).filter(Boolean))]
  })).filter(x=>x.id&&['ETHEREUM','SOLANA'].includes(x.chain)&&x.symbol&&x.addresses.length);
}

export function walletCohortSnapshotToExtraFeatures(snapshot){
  if(!snapshot||snapshot.ok!==true) return [];
  const t=finite(snapshot.availableAt); if(t==null) return [];
  const rows=[]; const add=(id,v)=>{const n=finite(v);if(n!=null)rows.push({id,value:n,availableAt:t,source:'PUBLIC_WALLET_COHORT_RPC'});};
  add('research.wallet.activity5m',snapshot.metrics?.activity5m);
  add('research.wallet.activity15m',snapshot.metrics?.activity15m);
  add('research.wallet.successRate15m',snapshot.metrics?.successRate15m);
  add('research.wallet.nativeNetFlowSignedLog',signedLog(snapshot.metrics?.nativeNetFlow));
  add('research.wallet.nativeGrossFlowLog',Math.log1p(Math.max(0,Number(snapshot.metrics?.nativeGrossFlow||0))));
  return rows;
}

export function createWalletCohortPublicProvider({
  fetchImpl=globalThis.fetch,
  cohorts=[],
  ethereumRpcUrl='https://ethereum-rpc.publicnode.com',
  solanaRpcUrl='https://api.mainnet-beta.solana.com',
  now=()=>Date.now()
}={}){
  const defs=parseWalletCohorts(cohorts);
  const bySymbol=new Map();
  for(const c of defs){const xs=bySymbol.get(c.symbol)||[];xs.push(c);bySymbol.set(c.symbol,xs);}

  async function solanaCohort(c,asOf){
    let activity5m=0,activity15m=0,success=0,total15=0;
    for(const address of c.addresses){
      const rows=await rpc(fetchImpl,solanaRpcUrl,'getSignaturesForAddress',[address,{limit:100,commitment:'finalized'}]);
      for(const x of Array.isArray(rows)?rows:[]){
        const ts=finite(x?.blockTime)==null?null:Number(x.blockTime)*1000;
        if(ts==null||ts>asOf) continue;
        const age=asOf-ts;
        if(age<=15*60_000){total15++;if(x?.err==null)success++;}
        if(age<=5*60_000) activity5m++;
        if(age<=15*60_000) activity15m++;
      }
    }
    return {activity5m,activity15m,successRate15m:total15?success/total15:null,nativeNetFlow:0,nativeGrossFlow:0};
  }

  async function ethereumCohort(c,asOf){
    const latestHex=await rpc(fetchImpl,ethereumRpcUrl,'eth_blockNumber',[]);
    const latest=Number(BigInt(latestHex));
    const wanted=new Set(c.addresses.map(a=>a.toLowerCase()));
    let activity5m=0,activity15m=0,nativeNetFlow=0,nativeGrossFlow=0,total15=0,success=0;
    for(let n=latest;n>=Math.max(0,latest-80);n--){
      const block=await rpc(fetchImpl,ethereumRpcUrl,'eth_getBlockByNumber',['0x'+n.toString(16),true]);
      const ts=Number(BigInt(block.timestamp))*1000;
      if(asOf-ts>15*60_000) break;
      for(const tx of Array.isArray(block.transactions)?block.transactions:[]){
        const from=String(tx?.from||'').toLowerCase(),to=String(tx?.to||'').toLowerCase();
        if(!wanted.has(from)&&!wanted.has(to)) continue;
        const eth=Number(BigInt(tx.value||'0x0'))/1e18;
        total15++;success++;
        if(asOf-ts<=5*60_000) activity5m++;
        activity15m++;
        nativeGrossFlow+=eth;
        if(wanted.has(to)) nativeNetFlow+=eth;
        if(wanted.has(from)) nativeNetFlow-=eth;
      }
    }
    return {activity5m,activity15m,successRate15m:total15?success/total15:null,nativeNetFlow,nativeGrossFlow};
  }

  async function fetchSnapshot(symbol,{asOf=now()}={}){
    const s=String(symbol||'').toUpperCase();
    const cs=bySymbol.get(s)||[];
    if(!cs.length) return {version:WALLET_COHORT_PUBLIC_PROVIDER_VERSION,symbol:s,availableAt:asOf,ok:false,reason:'NO_CONFIGURED_COHORT',cohorts:0};
    const metrics={activity5m:0,activity15m:0,successRate15m:null,nativeNetFlow:0,nativeGrossFlow:0};
    const successRates=[];
    for(const c of cs){
      const m=c.chain==='SOLANA'?await solanaCohort(c,asOf):await ethereumCohort(c,asOf);
      metrics.activity5m+=m.activity5m;metrics.activity15m+=m.activity15m;
      metrics.nativeNetFlow+=m.nativeNetFlow;metrics.nativeGrossFlow+=m.nativeGrossFlow;
      if(finite(m.successRate15m)!=null) successRates.push(m.successRate15m);
    }
    metrics.successRate15m=successRates.length?successRates.reduce((a,b)=>a+b,0)/successRates.length:null;
    return {version:WALLET_COHORT_PUBLIC_PROVIDER_VERSION,symbol:s,availableAt:asOf,ok:true,cohorts:cs.length,metrics,restrictions:{publicAddressesOnly:true,naturalPersonIdentity:false,researchOnly:true,mayExecute:false}};
  }

  return Object.freeze({version:WALLET_COHORT_PUBLIC_PROVIDER_VERSION,configuredCohorts:defs.length,fetchSnapshot,walletCohortSnapshotToExtraFeatures});
}
