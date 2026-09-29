import { sha256 } from '../institutional-kernel.mjs';

export const ONCHAIN_PUBLIC_PROVIDER_VERSION='TCX_ONCHAIN_PUBLIC_PROVIDER_V1';

function nonEmpty(v,name){const s=String(v||'').trim();if(!s)throw new Error(name+' required');return s;}
function finite(v){const n=Number(v);return Number.isFinite(n)?n:null;}
function freeze(v){if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.freeze(v);for(const x of Object.values(v))freeze(x);}return v;}

async function rpc(fetchImpl,url,method,params){
  const res=await fetchImpl(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});
  if(!res.ok) throw new Error('RPC_HTTP_'+res.status);
  const body=await res.json();
  if(body?.error) throw new Error('RPC_'+String(body.error.code||'ERROR')+':'+String(body.error.message||''));
  return body?.result;
}

export function createPublicOnchainProvider({
  fetchImpl=globalThis.fetch,
  solanaRpcUrl='https://api.mainnet-beta.solana.com',
  ethereumRpcUrl=null
}={}){
  if(typeof fetchImpl!=='function') throw new Error('fetch implementation required');

  async function solanaAddressActivity(address,{limit=25,asOf=Date.now()}={}){
    const a=nonEmpty(address,'address');
    const max=Math.max(1,Math.min(100,Number(limit)||25));
    const rows=await rpc(fetchImpl,solanaRpcUrl,'getSignaturesForAddress',[a,{commitment:'finalized',limit:max}]);
    const cutoff=Number(asOf);
    const observations=(Array.isArray(rows)?rows:[]).map(x=>{
      const blockTimeMs=finite(x?.blockTime)==null?null:Number(x.blockTime)*1000;
      return {
        chain:'SOLANA',address:a,signature:String(x?.signature||''),slot:finite(x?.slot),
        blockTime:blockTimeMs,availableAt:blockTimeMs,confirmationStatus:String(x?.confirmationStatus||''),
        success:x?.err==null,source:'SOLANA_JSON_RPC'
      };
    }).filter(x=>x.signature&&x.availableAt!=null&&x.availableAt<=cutoff);
    const core={version:ONCHAIN_PUBLIC_PROVIDER_VERSION,chain:'SOLANA',asOf:cutoff,address:a,observations,
      provenance:{rpcMethod:'getSignaturesForAddress',commitment:'finalized',publicChainData:true},
      restrictions:{privateData:false,naturalPersonIdentity:false,execution:false}};
    return freeze({...core,fingerprint:sha256(core)});
  }

  async function solanaTransaction(signature,{asOf=Date.now()}={}){
    const sig=nonEmpty(signature,'signature');
    const tx=await rpc(fetchImpl,solanaRpcUrl,'getTransaction',[sig,{commitment:'finalized',maxSupportedTransactionVersion:0,encoding:'jsonParsed'}]);
    if(!tx) return null;
    const blockTime=finite(tx?.blockTime)==null?null:Number(tx.blockTime)*1000;
    if(blockTime==null||blockTime>Number(asOf)) return null;
    const core={version:ONCHAIN_PUBLIC_PROVIDER_VERSION,chain:'SOLANA',asOf:Number(asOf),signature:sig,
      blockTime,slot:finite(tx?.slot),transaction:tx,
      provenance:{rpcMethod:'getTransaction',commitment:'finalized',publicChainData:true},
      restrictions:{privateData:false,naturalPersonIdentity:false,execution:false}};
    return freeze({...core,fingerprint:sha256(core)});
  }

  async function ethereumLogs({fromBlock='latest',toBlock='latest',address=null,topics=[],asOf=Date.now()}={}){
    if(!ethereumRpcUrl) throw new Error('ETHEREUM_RPC_URL_NOT_CONFIGURED');
    const filter={fromBlock,toBlock};
    if(address) filter.address=address;
    if(Array.isArray(topics)&&topics.length) filter.topics=topics;
    const logs=await rpc(fetchImpl,ethereumRpcUrl,'eth_getLogs',[filter]);
    const core={version:ONCHAIN_PUBLIC_PROVIDER_VERSION,chain:'ETHEREUM',asOf:Number(asOf),
      logs:Array.isArray(logs)?logs:[],provenance:{rpcMethod:'eth_getLogs',publicChainData:true},
      restrictions:{privateData:false,naturalPersonIdentity:false,execution:false}};
    return freeze({...core,fingerprint:sha256(core)});
  }

  return Object.freeze({version:ONCHAIN_PUBLIC_PROVIDER_VERSION,solanaAddressActivity,solanaTransaction,ethereumLogs});
}
