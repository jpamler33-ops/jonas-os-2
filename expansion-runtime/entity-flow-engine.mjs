import path from 'node:path';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';

import { sha256 } from '../institutional-kernel.mjs';

export const ENTITY_FLOW_ENGINE_VERSION='TCX_ENTITY_FLOW_ENGINE_V1';

const DEFAULT_WINDOWS=Object.freeze([
  Object.freeze({id:'5m',ms:5*60_000}),
  Object.freeze({id:'15m',ms:15*60_000})
]);

function finite(v){const n=Number(v);return Number.isFinite(n)?n:null;}
function hexNumber(v){
  if(typeof v!=='string'||!/^0x[0-9a-f]+$/i.test(v)) return null;
  const n=Number(BigInt(v));
  return Number.isFinite(n)?n:null;
}
function hexBig(v){
  if(typeof v!=='string'||!/^0x[0-9a-f]+$/i.test(v)) return null;
  try{return BigInt(v);}catch{return null;}
}
function lowerAddress(v){
  const s=String(v||'').trim().toLowerCase();
  return /^0x[a-f0-9]{40}$/.test(s)?s:null;
}
function signedLog(v){
  const n=finite(v);
  return n==null?null:Math.sign(n)*Math.log1p(Math.abs(n));
}
function median(xs){
  const ys=(Array.isArray(xs)?xs:[]).map(finite).filter(x=>x!=null).sort((a,b)=>a-b);
  if(!ys.length) return null;
  const m=Math.floor(ys.length/2);
  return ys.length%2?ys[m]:(ys[m-1]+ys[m])/2;
}
function mad(xs,med){
  const m=finite(med);
  if(m==null) return null;
  return median((xs||[]).map(x=>Math.abs(Number(x)-m)));
}
function robustZ(value,baseline,minSamples=20){
  const v=finite(value);
  const xs=(baseline||[]).map(finite).filter(x=>x!=null);
  if(v==null||xs.length<Math.max(3,Number(minSamples)||20)) return null;
  const med=median(xs);
  const d=mad(xs,med);
  if(d==null||d<1e-12) return Math.abs(v-med)<1e-12?0:null;
  return (v-med)/(1.4826*d);
}
function deepFreeze(v){
  if(v&&typeof v==='object'&&!Object.isFrozen(v)){
    Object.freeze(v);
    for(const x of Object.values(v)) deepFreeze(x);
  }
  return v;
}

export function buildEntityAddressIndex(registry,{
  chain='ETHEREUM',
  allowedEntityTypes=['EXCHANGE'],
  requireOfficialSource=true
}={}){
  const targetChain=String(chain||'ETHEREUM').toUpperCase();
  const allowedTypes=new Set((allowedEntityTypes||[]).map(x=>String(x).toUpperCase()));
  const addressToEntity=new Map();
  const entityMeta=new Map();
  let rejected=0;
  for(const row of Array.isArray(registry?.entries)?registry.entries:[]){
    if(String(row?.chain||'').toUpperCase()!==targetChain) continue;
    if(!allowedTypes.has(String(row?.entityType||'').toUpperCase())) continue;
    const address=lowerAddress(row?.address);
    if(!address){rejected++;continue;}
    if(requireOfficialSource&&!String(row?.source?.sourceType||'').startsWith('OFFICIAL_')){rejected++;continue;}
    if(requireOfficialSource&&!String(row?.verificationStatus||'').startsWith('OFFICIAL_SOURCE_ATTESTED')){rejected++;continue;}
    const entityId=String(row?.entityId||'').trim();
    if(!entityId){rejected++;continue;}
    const prior=addressToEntity.get(address);
    if(prior&&prior!==entityId){
      rejected++;
      continue;
    }
    addressToEntity.set(address,entityId);
    if(!entityMeta.has(entityId)){
      entityMeta.set(entityId,Object.freeze({
        entityId,
        entityType:String(row.entityType||'UNKNOWN'),
        sourcePublisher:String(row?.source?.publisher||'UNKNOWN'),
        reportId:String(row?.source?.reportId||'UNKNOWN'),
        reportDate:row?.source?.reportDate?String(row.source.reportDate):null
      }));
    }
  }
  return Object.freeze({
    version:ENTITY_FLOW_ENGINE_VERSION,
    chain:targetChain,
    addressCount:addressToEntity.size,
    entityCount:entityMeta.size,
    rejected,
    addressToEntity,
    entityMeta
  });
}

export function classifyEvmNativeTransaction(tx,block,addressIndex){
  const valueWei=hexBig(tx?.value);
  if(valueWei==null||valueWei<=0n) return null;
  const from=lowerAddress(tx?.from);
  const to=lowerAddress(tx?.to);
  if(!from&&!to) return null;

  const fromEntity=from?addressIndex?.addressToEntity?.get(from)||null:null;
  const toEntity=to?addressIndex?.addressToEntity?.get(to)||null:null;
  if(!fromEntity&&!toEntity) return null;

  let classification='EXTERNAL';
  let entityId=null;
  if(fromEntity&&toEntity&&fromEntity===toEntity){
    classification='INTERNAL';
    entityId=fromEntity;
  }else if(fromEntity&&toEntity&&fromEntity!==toEntity){
    classification='INTER_ENTITY';
  }else if(toEntity){
    classification='INFLOW';
    entityId=toEntity;
  }else if(fromEntity){
    classification='OUTFLOW';
    entityId=fromEntity;
  }

  const blockNumber=hexNumber(block?.number);
  const blockTimestampSec=hexNumber(block?.timestamp);
  const blockTimestamp=blockTimestampSec==null?null:blockTimestampSec*1000;
  const valueEth=Number(valueWei)/1e18;
  const txHash=String(tx?.hash||'').trim().toLowerCase()||sha256({
    blockNumber,
    from,
    to,
    value:String(valueWei),
    nonce:String(tx?.nonce||'')
  });
  const core={
    chain:'ETHEREUM',
    asset:'ETH',
    txHash,
    blockNumber,
    blockHash:String(block?.hash||'').toLowerCase()||null,
    blockTimestamp,
    from,
    to,
    fromEntity,
    toEntity,
    entityId,
    classification,
    valueEth,
    source:'ETHEREUM_FINALIZED_BLOCKS'
  };
  return deepFreeze({...core,eventId:sha256(core)});
}

export function classifyEvmNativeBlocks(blocks,addressIndex){
  const out=[];
  const seen=new Set();
  for(const block of Array.isArray(blocks)?blocks:[]){
    for(const tx of Array.isArray(block?.transactions)?block.transactions:[]){
      const event=classifyEvmNativeTransaction(tx,block,addressIndex);
      if(!event||seen.has(event.eventId)) continue;
      seen.add(event.eventId);
      out.push(event);
    }
  }
  return out.sort((a,b)=>(a.blockTimestamp||0)-(b.blockTimestamp||0)||String(a.txHash).localeCompare(String(b.txHash)));
}

export function aggregateEntityFlow(events,{
  entityId,
  asOf,
  windowMs
}={}){
  const t=finite(asOf);
  const w=Math.max(1000,Number(windowMs)||5*60_000);
  if(t==null) throw new Error('asOf required');
  const entity=String(entityId||'').trim();
  if(!entity) throw new Error('entityId required');
  const xs=(Array.isArray(events)?events:[]).filter(e=>{
    const ts=finite(e?.blockTimestamp);
    return ts!=null&&ts<=t&&ts>t-w&&(e?.entityId===entity||e?.fromEntity===entity||e?.toEntity===entity);
  });
  let inflow=0,outflow=0,internal=0,interEntity=0;
  let inflowCount=0,outflowCount=0,internalCount=0,interEntityCount=0,largestExternal=0;
  for(const e of xs){
    const v=Math.max(0,Number(e.valueEth)||0);
    if(e.classification==='INFLOW'&&e.entityId===entity){
      inflow+=v;inflowCount++;largestExternal=Math.max(largestExternal,v);
    }else if(e.classification==='OUTFLOW'&&e.entityId===entity){
      outflow+=v;outflowCount++;largestExternal=Math.max(largestExternal,v);
    }else if(e.classification==='INTERNAL'&&e.entityId===entity){
      internal+=v;internalCount++;
    }else if(e.classification==='INTER_ENTITY'&&(e.fromEntity===entity||e.toEntity===entity)){
      interEntity+=v;interEntityCount++;
    }
  }
  const grossExternal=inflow+outflow;
  const netExternal=inflow-outflow;
  return deepFreeze({
    entityId:entity,
    asOf:t,
    windowMs:w,
    inflowEth:inflow,
    outflowEth:outflow,
    netExternalEth:netExternal,
    grossExternalEth:grossExternal,
    inflowShare:grossExternal>0?inflow/grossExternal:.5,
    externalTxCount:inflowCount+outflowCount,
    inflowCount,
    outflowCount,
    largestExternalEth:largestExternal,
    largestExternalShare:grossExternal>0?largestExternal/grossExternal:0,
    internalEth:internal,
    internalCount,
    interEntityEth:interEntity,
    interEntityCount,
    excludedFromExternalNet:{
      internalEth:internal,
      interEntityEth:interEntity
    }
  });
}

function metricSeries(memory,entityId,windowId,field){
  return (memory?.observations||[])
    .filter(x=>x.entityId===entityId&&x.windowId===windowId)
    .map(x=>finite(x.metrics?.[field]))
    .filter(x=>x!=null);
}

export function scoreEntityFlowSnapshot(snapshot,memory,{
  minBaselineSamples=20
}={}){
  if(!snapshot?.ok) return snapshot;
  const entities={};
  for(const [entityId,windows] of Object.entries(snapshot.entities||{})){
    entities[entityId]={};
    for(const [windowId,metrics] of Object.entries(windows||{})){
      const baseline=metricSeries(memory,entityId,windowId,'grossExternalEth');
      entities[entityId][windowId]={
        ...metrics,
        grossExternalRobustZ:robustZ(metrics.grossExternalEth,baseline,minBaselineSamples),
        baselineSamples:baseline.length
      };
    }
  }
  return deepFreeze({...snapshot,entities});
}

export function entityFlowSnapshotToExtraFeatures(snapshot,{
  entityId='OKX'
}={}){
  if(!snapshot||snapshot.ok!==true) return [];
  const t=finite(snapshot.availableAt);
  if(t==null) return [];
  const e=snapshot.entities?.[entityId];
  if(!e) return [];
  const rows=[];
  const add=(id,value)=>{
    const n=finite(value);
    if(n==null) return;
    rows.push({id,value:n,availableAt:t,source:'VERIFIED_ENTITY_FINALIZED_FLOW'});
  };
  for(const [windowId,metrics] of Object.entries(e)){
    const suffix=windowId==='5m'?'5m':windowId==='15m'?'15m':windowId;
    add('research.entityflow.eth.netExternal'+suffix,signedLog(metrics.netExternalEth));
    add('research.entityflow.eth.grossExternal'+suffix,Math.log1p(Math.max(0,Number(metrics.grossExternalEth||0))));
    add('research.entityflow.eth.inflowShare'+suffix,metrics.inflowShare);
    add('research.entityflow.eth.externalTxCount'+suffix,Math.log1p(Math.max(0,Number(metrics.externalTxCount||0))));
    add('research.entityflow.eth.largestShare'+suffix,metrics.largestExternalShare);
    if(finite(metrics.grossExternalRobustZ)!=null){
      add('research.entityflow.eth.grossAnomaly'+suffix,metrics.grossExternalRobustZ);
    }
  }
  return rows;
}

async function rpc(fetchImpl,url,method,params,{timeoutMs=10000}={}){
  const ctrl=new AbortController();
  const timer=setTimeout(()=>ctrl.abort(),Math.max(1000,Number(timeoutMs)||10000));
  try{
    const res=await fetchImpl(url,{
      method:'POST',
      signal:ctrl.signal,
      headers:{'content-type':'application/json','accept':'application/json','user-agent':'TCX-SHADOW-RESEARCH'},
      body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})
    });
    const text=await res.text();
    if(!res.ok) throw new Error('RPC_HTTP_'+res.status);
    const body=JSON.parse(text);
    if(body?.error) throw new Error('RPC_'+String(body.error.code||'ERROR')+':'+String(body.error.message||''));
    return body.result;
  }finally{clearTimeout(timer);}
}

async function rpcBatch(fetchImpl,url,calls,{timeoutMs=15000}={}){
  const payload=calls.map((x,i)=>({jsonrpc:'2.0',id:i+1,method:x.method,params:x.params}));
  const ctrl=new AbortController();
  const timer=setTimeout(()=>ctrl.abort(),Math.max(1000,Number(timeoutMs)||15000));
  try{
    const res=await fetchImpl(url,{
      method:'POST',
      signal:ctrl.signal,
      headers:{'content-type':'application/json','accept':'application/json','user-agent':'TCX-SHADOW-RESEARCH'},
      body:JSON.stringify(payload)
    });
    const text=await res.text();
    if(!res.ok) throw new Error('RPC_BATCH_HTTP_'+res.status);
    const body=JSON.parse(text);
    if(!Array.isArray(body)) throw new Error('RPC_BATCH_INVALID');
    const byId=new Map(body.map(x=>[Number(x.id),x]));
    return payload.map(req=>{
      const row=byId.get(Number(req.id));
      if(!row) throw new Error('RPC_BATCH_MISSING_'+req.id);
      if(row.error) throw new Error('RPC_'+String(row.error.code||'ERROR'));
      return row.result;
    });
  }finally{clearTimeout(timer);}
}

export function createEthereumEntityFlowProvider({
  fetchImpl=globalThis.fetch,
  rpcUrl='https://ethereum-rpc.publicnode.com',
  addressIndex,
  entityIds=['OKX'],
  windows=DEFAULT_WINDOWS,
  maxBlocks=96,
  batchSize=6,
  timeoutMs=15000,
  cacheMs=45000,
  now=()=>Date.now()
}={}){
  if(typeof fetchImpl!=='function') throw new Error('fetchImpl required');
  if(!addressIndex?.addressToEntity) throw new Error('addressIndex required');
  const entities=[...new Set((entityIds||[]).map(String).filter(Boolean))];
  let cache=null;

  async function fetchSnapshot({force=false}={}){
    const requestedAt=now();
    if(!force&&cache&&requestedAt-cache.cachedAt<=Math.max(0,Number(cacheMs)||0)){
      return structuredClone(cache.value);
    }
    const finalized=await rpc(fetchImpl,rpcUrl,'eth_getBlockByNumber',['finalized',true],{timeoutMs});
    if(!finalized?.number||!finalized?.timestamp) throw new Error('FINALIZED_BLOCK_UNAVAILABLE');
    const head=hexNumber(finalized.number);
    const headTs=hexNumber(finalized.timestamp)*1000;
    if(!Number.isFinite(head)||!Number.isFinite(headTs)) throw new Error('FINALIZED_BLOCK_INVALID');

    const blocks=[finalized];
    const oldestNeeded=headTs-Math.max(...windows.map(x=>Number(x.ms)||0))-60_000;
    const numbers=[];
    for(let n=head-1;n>=0&&numbers.length<Math.max(1,Number(maxBlocks)||96);n--) numbers.push(n);

    const step=Math.max(1,Number(batchSize)||6);
    for(let i=0;i<numbers.length;i+=step){
      const chunk=numbers.slice(i,i+step);
      const rows=await rpcBatch(fetchImpl,rpcUrl,chunk.map(n=>({
        method:'eth_getBlockByNumber',
        params:['0x'+n.toString(16),true]
      })),{timeoutMs});
      let reachedOld=false;
      for(const block of rows){
        if(!block?.timestamp) continue;
        const ts=hexNumber(block.timestamp)*1000;
        if(Number.isFinite(ts)&&ts<oldestNeeded){reachedOld=true;continue;}
        blocks.push(block);
      }
      if(reachedOld) break;
    }

    const events=classifyEvmNativeBlocks(blocks,addressIndex);
    const entitiesOut={};
    for(const entityId of entities){
      entitiesOut[entityId]={};
      for(const w of windows){
        entitiesOut[entityId][w.id]=aggregateEntityFlow(events,{
          entityId,
          asOf:headTs,
          windowMs:w.ms
        });
      }
    }
    const core={
      version:ENTITY_FLOW_ENGINE_VERSION,
      ok:true,
      chain:'ETHEREUM',
      asset:'ETH',
      requestedAt,
      availableAt:requestedAt,
      finalizedBlockNumber:head,
      finalizedBlockTimestamp:headTs,
      blocksScanned:blocks.length,
      classifiedEvents:events.length,
      addressCount:addressIndex.addressCount,
      entityCount:addressIndex.entityCount,
      entities:entitiesOut,
      restrictions:{
        finalizedBlocksOnly:true,
        internalTransfersExcludedFromExternalNet:true,
        interEntityTransfersExcludedFromExternalNet:true,
        nativeAssetOnly:true,
        researchOnly:true,
        mayExecute:false,
        mayMutateProductionForecast:false
      }
    };
    const value=deepFreeze({...core,fingerprint:sha256(core)});
    cache={cachedAt:requestedAt,value};
    return structuredClone(value);
  }

  return Object.freeze({
    version:ENTITY_FLOW_ENGINE_VERSION,
    fetchSnapshot
  });
}

export function createEntityFlowMemory({
  observations=[],
  maxObservations=1500,
  createdAt=Date.now()
}={}){
  return {
    version:ENTITY_FLOW_ENGINE_VERSION,
    createdAt:Number(createdAt),
    updatedAt:Number(createdAt),
    maxObservations:Math.max(100,Number(maxObservations)||1500),
    observations:(Array.isArray(observations)?observations:[]).slice(-Math.max(100,Number(maxObservations)||1500))
  };
}

export function observeEntityFlowMemory(memory,snapshot,{observedAt=Date.now()}={}){
  if(!memory||memory.version!==ENTITY_FLOW_ENGINE_VERSION) throw new Error('entity flow memory invalid');
  if(!snapshot?.ok) return memory;
  const additions=[];
  for(const [entityId,windows] of Object.entries(snapshot.entities||{})){
    for(const [windowId,metrics] of Object.entries(windows||{})){
      additions.push({
        observationId:sha256({
          fingerprint:snapshot.fingerprint,
          entityId,
          windowId
        }),
        observedAt:Number(observedAt),
        availableAt:Number(snapshot.availableAt),
        finalizedBlockNumber:Number(snapshot.finalizedBlockNumber),
        entityId,
        windowId,
        metrics:{
          inflowEth:Number(metrics.inflowEth||0),
          outflowEth:Number(metrics.outflowEth||0),
          netExternalEth:Number(metrics.netExternalEth||0),
          grossExternalEth:Number(metrics.grossExternalEth||0),
          externalTxCount:Number(metrics.externalTxCount||0),
          largestExternalShare:Number(metrics.largestExternalShare||0)
        }
      });
    }
  }
  const seen=new Set((memory.observations||[]).map(x=>x.observationId));
  for(const row of additions) if(!seen.has(row.observationId)) memory.observations.push(row);
  memory.observations=memory.observations.slice(-Math.max(100,Number(memory.maxObservations)||1500));
  memory.updatedAt=Number(observedAt);
  return memory;
}

export function entityFlowMemorySummary(memory){
  const observations=Array.isArray(memory?.observations)?memory.observations:[];
  const byEntity={};
  for(const x of observations){
    byEntity[x.entityId]=(byEntity[x.entityId]||0)+1;
  }
  return {
    version:memory?.version||ENTITY_FLOW_ENGINE_VERSION,
    observations:observations.length,
    byEntity,
    updatedAt:finite(memory?.updatedAt),
    maxObservations:Number(memory?.maxObservations||0)
  };
}

export async function loadEntityFlowMemory(filePath){
  await mkdir(path.dirname(filePath),{recursive:true});
  try{
    const raw=await readFile(filePath,'utf8');
    const parsed=JSON.parse(raw);
    if(parsed?.version!==ENTITY_FLOW_ENGINE_VERSION) throw new Error('unsupported entity flow memory version');
    return createEntityFlowMemory(parsed);
  }catch(err){
    if(err?.code==='ENOENT') return createEntityFlowMemory();
    const backup=filePath+'.corrupt-'+Date.now();
    try{await rename(filePath,backup);}catch{}
    return createEntityFlowMemory();
  }
}

export async function saveEntityFlowMemory(filePath,memory){
  await mkdir(path.dirname(filePath),{recursive:true});
  const tmp=filePath+'.tmp-'+process.pid;
  await writeFile(tmp,JSON.stringify(memory,null,2)+'\n',{encoding:'utf8',mode:0o600});
  await rename(tmp,filePath);
  return memory;
}
