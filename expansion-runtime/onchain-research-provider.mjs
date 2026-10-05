export const ONCHAIN_RESEARCH_PROVIDER_VERSION='TCX_ONCHAIN_RESEARCH_PROVIDER_V1';

function finite(v){
  const n=Number(v);
  return Number.isFinite(n)?n:null;
}
function hexNumber(v){
  if(typeof v!=='string'||!/^0x[0-9a-f]+$/i.test(v)) return null;
  const n=Number(BigInt(v));
  return Number.isFinite(n)?n:null;
}
function hexBig(v){
  if(typeof v!=='string'||!/^0x[0-9a-f]+$/i.test(v)) return null;
  try{return BigInt(v);}catch{return null;}
}
function median(xs){
  const ys=(Array.isArray(xs)?xs:[]).map(finite).filter(x=>x!=null).sort((a,b)=>a-b);
  if(!ys.length) return null;
  const m=Math.floor(ys.length/2);
  return ys.length%2?ys[m]:(ys[m-1]+ys[m])/2;
}
function mean(xs){
  const ys=(Array.isArray(xs)?xs:[]).map(finite).filter(x=>x!=null);
  return ys.length?ys.reduce((a,b)=>a+b,0)/ys.length:null;
}
function log1p(v){
  const n=finite(v);
  return n==null?null:Math.log1p(Math.max(0,n));
}

async function rpc(fetchImpl,url,method,params,{timeoutMs=7000}={}){
  const ctrl=new AbortController();
  const timer=setTimeout(()=>ctrl.abort(),Math.max(1,Number(timeoutMs)||7000));
  try{
    const res=await fetchImpl(url,{
      method:'POST',
      signal:ctrl.signal,
      headers:{'content-type':'application/json','accept':'application/json','user-agent':'TCX-SHADOW-RESEARCH'},
      body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})
    });
    const text=await res.text();
    if(!res.ok) throw new Error('RPC_HTTP_'+res.status+':'+String(text).slice(0,140));
    const body=JSON.parse(text);
    if(body?.error) throw new Error('RPC_'+String(body.error.code||'ERROR')+':'+String(body.error.message||''));
    return body?.result;
  }finally{
    clearTimeout(timer);
  }
}

async function getJson(fetchImpl,url,{timeoutMs=7000}={}){
  const ctrl=new AbortController();
  const timer=setTimeout(()=>ctrl.abort(),Math.max(1,Number(timeoutMs)||7000));
  try{
    const res=await fetchImpl(url,{signal:ctrl.signal,headers:{accept:'application/json','user-agent':'TCX-SHADOW-RESEARCH'}});
    const text=await res.text();
    if(!res.ok) throw new Error('HTTP_'+res.status+':'+String(text).slice(0,140));
    return JSON.parse(text);
  }finally{
    clearTimeout(timer);
  }
}

export function onchainSnapshotToExtraFeatures(snapshot){
  if(!snapshot||snapshot.ok!==true) return [];
  const t=finite(snapshot.availableAt);
  if(t==null) return [];
  const rows=[];
  const add=(id,value,source)=>{
    const n=finite(value);
    if(n==null) return;
    rows.push({id,value:n,availableAt:t,source});
  };

  if(snapshot.chain==='BITCOIN'){
    const x=snapshot.metrics||{};
    add('research.onchain.btc.mempoolLogCount',log1p(x.mempoolTxCount),'MEMPOOL_SPACE_PUBLIC');
    add('research.onchain.btc.mempoolLogVsize',log1p(x.mempoolVsize),'MEMPOOL_SPACE_PUBLIC');
    add('research.onchain.btc.fastestFeeSatVb',x.fastestFeeSatVb,'MEMPOOL_SPACE_PUBLIC');
    add('research.onchain.btc.halfHourFeeSatVb',x.halfHourFeeSatVb,'MEMPOOL_SPACE_PUBLIC');
  }else if(snapshot.chain==='ETHEREUM'){
    const x=snapshot.metrics||{};
    add('research.onchain.eth.gasUtilization',x.gasUtilization,'ETHEREUM_PUBLIC_RPC');
    add('research.onchain.eth.baseFeeGwei',x.baseFeeGwei,'ETHEREUM_PUBLIC_RPC');
    add('research.onchain.eth.gasPriceGwei',x.gasPriceGwei,'ETHEREUM_PUBLIC_RPC');
    add('research.onchain.eth.txCountLog',log1p(x.txCount),'ETHEREUM_PUBLIC_RPC');
    add('research.onchain.eth.largeNativeTransferLogEth',log1p(x.largeNativeTransferEth),'ETHEREUM_PUBLIC_RPC');
    add('research.onchain.eth.largeNativeTransferCount',x.largeNativeTransferCount,'ETHEREUM_PUBLIC_RPC');
  }else if(snapshot.chain==='SOLANA'){
    const x=snapshot.metrics||{};
    add('research.onchain.sol.tps',x.tps,'SOLANA_PUBLIC_RPC');
    add('research.onchain.sol.nonVoteTps',x.nonVoteTps,'SOLANA_PUBLIC_RPC');
    add('research.onchain.sol.priorityFeeMedian',x.priorityFeeMedian,'SOLANA_PUBLIC_RPC');
    add('research.onchain.sol.slotMs',x.avgSlotMs,'SOLANA_PUBLIC_RPC');
  }
  return rows;
}

export function createOnchainResearchProvider({
  fetchImpl=globalThis.fetch,
  bitcoinBase='https://mempool.space',
  ethereumRpcUrl='https://ethereum-rpc.publicnode.com',
  solanaRpcUrl='https://api.mainnet-beta.solana.com',
  timeoutMs=7000,
  now=()=>Date.now()
}={}){
  if(typeof fetchImpl!=='function') throw new Error('fetchImpl required');
  const btcBase=String(bitcoinBase).replace(/\/+$/,'');
  const ethUrl=String(ethereumRpcUrl||'').trim();
  const solUrl=String(solanaRpcUrl||'').trim();
  const cache=new Map();

  async function bitcoinSnapshot(){
    const [mempool,fees,height]=await Promise.all([
      getJson(fetchImpl,btcBase+'/api/mempool',{timeoutMs}),
      getJson(fetchImpl,btcBase+'/api/v1/fees/recommended',{timeoutMs}),
      fetchImpl(btcBase+'/api/blocks/tip/height',{headers:{'user-agent':'TCX-SHADOW-RESEARCH'}}).then(async res=>{
        const text=await res.text();
        if(!res.ok) throw new Error('BTC_HEIGHT_HTTP_'+res.status);
        const n=Number(text.trim());
        if(!Number.isFinite(n)) throw new Error('BTC_HEIGHT_INVALID');
        return n;
      })
    ]);
    return {
      chain:'BITCOIN',
      metrics:{
        blockHeight:finite(height),
        mempoolTxCount:finite(mempool?.count),
        mempoolVsize:finite(mempool?.vsize),
        mempoolTotalFeeSat:finite(mempool?.total_fee),
        fastestFeeSatVb:finite(fees?.fastestFee),
        halfHourFeeSatVb:finite(fees?.halfHourFee),
        hourFeeSatVb:finite(fees?.hourFee)
      },
      source:'MEMPOOL_SPACE_PUBLIC'
    };
  }

  async function ethereumSnapshot(){
    if(!ethUrl) throw new Error('ETHEREUM_RPC_URL_NOT_CONFIGURED');
    const [block,gasPrice]=await Promise.all([
      rpc(fetchImpl,ethUrl,'eth_getBlockByNumber',['latest',true],{timeoutMs}),
      rpc(fetchImpl,ethUrl,'eth_gasPrice',[],{timeoutMs})
    ]);
    const gasUsed=hexNumber(block?.gasUsed);
    const gasLimit=hexNumber(block?.gasLimit);
    const baseFeeWei=hexBig(block?.baseFeePerGas);
    const gasPriceWei=hexBig(gasPrice);
    const txs=Array.isArray(block?.transactions)?block.transactions:[];
    let largeNativeTransferCount=0;
    let largeNativeTransferWei=0n;
    const thresholdWei=100n*10n**18n;
    for(const tx of txs){
      const value=hexBig(tx?.value);
      if(value!=null&&value>=thresholdWei){
        largeNativeTransferCount++;
        largeNativeTransferWei+=value;
      }
    }
    return {
      chain:'ETHEREUM',
      metrics:{
        blockNumber:hexNumber(block?.number),
        blockTimestampMs:hexNumber(block?.timestamp)==null?null:hexNumber(block.timestamp)*1000,
        gasUtilization:gasUsed!=null&&gasLimit!=null&&gasLimit>0?gasUsed/gasLimit:null,
        baseFeeGwei:baseFeeWei==null?null:Number(baseFeeWei)/1e9,
        gasPriceGwei:gasPriceWei==null?null:Number(gasPriceWei)/1e9,
        txCount:txs.length,
        largeNativeTransferCount,
        largeNativeTransferEth:Number(largeNativeTransferWei)/1e18
      },
      source:'ETHEREUM_PUBLIC_RPC'
    };
  }

  async function solanaSnapshot(){
    if(!solUrl) throw new Error('SOLANA_RPC_URL_NOT_CONFIGURED');
    const [samples,priority,slot]=await Promise.all([
      rpc(fetchImpl,solUrl,'getRecentPerformanceSamples',[5],{timeoutMs}),
      rpc(fetchImpl,solUrl,'getRecentPrioritizationFees',[],{timeoutMs}),
      rpc(fetchImpl,solUrl,'getSlot',[{commitment:'finalized'}],{timeoutMs})
    ]);
    const perf=Array.isArray(samples)?samples:[];
    const secs=perf.reduce((s,x)=>s+(finite(x?.samplePeriodSecs)||0),0);
    const txs=perf.reduce((s,x)=>s+(finite(x?.numTransactions)||0),0);
    const nonVote=perf.reduce((s,x)=>s+(finite(x?.numNonVoteTransactions)||0),0);
    const slots=perf.reduce((s,x)=>s+(finite(x?.numSlots)||0),0);
    const fees=(Array.isArray(priority)?priority:[]).map(x=>finite(x?.prioritizationFee)).filter(x=>x!=null);
    return {
      chain:'SOLANA',
      metrics:{
        slot:finite(slot),
        tps:secs>0?txs/secs:null,
        nonVoteTps:secs>0?nonVote/secs:null,
        avgSlotMs:slots>0?secs*1000/slots:null,
        priorityFeeMedian:median(fees),
        priorityFeeMean:mean(fees)
      },
      source:'SOLANA_PUBLIC_RPC'
    };
  }

  async function fetchAssetSnapshot(symbol,{cacheMs=20000}={}){
    const s=String(symbol||'').toUpperCase();
    const cached=cache.get(s);
    const t0=now();
    if(cached&&t0-cached.cachedAt<=Math.max(0,Number(cacheMs)||0)) return structuredClone(cached.value);

    let fetcher=null;
    if(s==='BTCUSDT') fetcher=bitcoinSnapshot;
    else if(s==='ETHUSDT') fetcher=ethereumSnapshot;
    else if(s==='SOLUSDT') fetcher=solanaSnapshot;

    if(!fetcher){
      const value=Object.freeze({
        version:ONCHAIN_RESEARCH_PROVIDER_VERSION,
        symbol:s,
        availableAt:t0,
        ok:false,
        applicable:false,
        status:'NOT_APPLICABLE',
        chain:null,
        metrics:null,
        source:null,
        reason:'CHAIN_RESEARCH_NOT_APPLICABLE',
        restrictions:Object.freeze({researchOnly:true,mayExecute:false,mayMutateProductionForecast:false})
      });
      cache.set(s,{cachedAt:t0,value});
      return structuredClone(value);
    }

    try{
      const raw=await fetcher();
      const value=Object.freeze({
        version:ONCHAIN_RESEARCH_PROVIDER_VERSION,
        symbol:s,
        availableAt:now(),
        ok:true,
        chain:raw.chain,
        metrics:Object.freeze(raw.metrics),
        source:raw.source,
        restrictions:Object.freeze({researchOnly:true,mayExecute:false,mayMutateProductionForecast:false})
      });
      cache.set(s,{cachedAt:value.availableAt,value});
      return structuredClone(value);
    }catch(err){
      const value=Object.freeze({
        version:ONCHAIN_RESEARCH_PROVIDER_VERSION,
        symbol:s,
        availableAt:now(),
        ok:false,
        chain:s==='BTCUSDT'?'BITCOIN':s==='ETHUSDT'?'ETHEREUM':'SOLANA',
        metrics:null,
        source:null,
        error:err instanceof Error?err.message:String(err),
        restrictions:Object.freeze({researchOnly:true,mayExecute:false,mayMutateProductionForecast:false})
      });
      cache.set(s,{cachedAt:value.availableAt,value});
      return structuredClone(value);
    }
  }

  return Object.freeze({
    version:ONCHAIN_RESEARCH_PROVIDER_VERSION,
    fetchAssetSnapshot,
    onchainSnapshotToExtraFeatures
  });
}