import path from 'node:path';
import { mkdir, readFile, rename, writeFile, stat } from 'node:fs/promises';
import { inflateRawSync, createInflateRaw } from 'node:zlib';
import { Readable } from 'node:stream';

import { sha256 } from '../institutional-kernel.mjs';

export const VERIFIED_ENTITY_REGISTRY_VERSION='TCX_VERIFIED_ENTITY_REGISTRY_V1';

function finite(v){const n=Number(v);return Number.isFinite(n)?n:null;}
function deepFreeze(v){if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.freeze(v);for(const x of Object.values(v))deepFreeze(x);}return v;}
function normalizeChain(v){
  const s=String(v||'').trim().toUpperCase();
  if(['ETH','ETHEREUM'].includes(s)) return 'ETHEREUM';
  if(['SOL','SOLANA'].includes(s)) return 'SOLANA';
  if(['BTC','BITCOIN'].includes(s)) return 'BITCOIN';
  return s||'UNKNOWN';
}
function validAddress(chain,address){
  const a=String(address||'').trim();
  if(chain==='ETHEREUM') return /^0x[a-f0-9]{40}$/i.test(a);
  if(chain==='SOLANA') return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a);
  if(chain==='BITCOIN') return /^(bc1|[13])[a-zA-HJ-NP-Z0-9]{20,90}$/.test(a);
  return a.length>=8&&a.length<=160;
}
function csvRow(line){
  const out=[];let cur='',quoted=false;
  for(let i=0;i<line.length;i++){
    const ch=line[i];
    if(ch==='"'){
      if(quoted&&line[i+1]==='"'){cur+='"';i++;}else quoted=!quoted;
    }else if(ch===','&&!quoted){out.push(cur);cur='';}
    else cur+=ch;
  }
  out.push(cur);
  return out;
}
function firstCsvFromZip(buf){
  const bytes=Buffer.isBuffer(buf)?buf:Buffer.from(buf);
  let eocd=-1;
  for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--){
    if(bytes.readUInt32LE(i)===0x06054b50){eocd=i;break;}
  }
  if(eocd<0) throw new Error('ZIP_EOCD_NOT_FOUND');
  const total=bytes.readUInt16LE(eocd+10);
  const cdOffset=bytes.readUInt32LE(eocd+16);
  let p=cdOffset;
  for(let i=0;i<total;i++){
    if(bytes.readUInt32LE(p)!==0x02014b50) throw new Error('ZIP_CENTRAL_DIRECTORY_INVALID');
    const method=bytes.readUInt16LE(p+10);
    const compressedSize=bytes.readUInt32LE(p+20);
    const nameLen=bytes.readUInt16LE(p+28);
    const extraLen=bytes.readUInt16LE(p+30);
    const commentLen=bytes.readUInt16LE(p+32);
    const localOffset=bytes.readUInt32LE(p+42);
    const name=bytes.subarray(p+46,p+46+nameLen).toString('utf8');
    if(/\.csv$/i.test(name)){
      if(bytes.readUInt32LE(localOffset)!==0x04034b50) throw new Error('ZIP_LOCAL_HEADER_INVALID');
      const localNameLen=bytes.readUInt16LE(localOffset+26);
      const localExtraLen=bytes.readUInt16LE(localOffset+28);
      const start=localOffset+30+localNameLen+localExtraLen;
      const compressed=bytes.subarray(start,start+compressedSize);
      const raw=method===0?compressed:method===8?inflateRawSync(compressed):null;
      if(!raw) throw new Error('ZIP_COMPRESSION_UNSUPPORTED_'+method);
      return {name,text:raw.toString('utf8')};
    }
    p+=46+nameLen+extraLen+commentLen;
  }
  throw new Error('ZIP_CSV_NOT_FOUND');
}

function okxEntryFromRow(row,idx,{reportId,reportDate,sourceUrl}){
  const chain=normalizeChain(row[idx.network]);
  const address=String(row[idx.address]||'').trim();
  if(!validAddress(chain,address)) return null;
  const message=String(row[idx.message]||'').trim();
  const signature1=String(row[idx.signature1]||'').trim();
  const amount=finite(row[idx.amount]);
  const snapshotHeight=String(row[idx['snapshot height']]||'').trim();
  const coin=String(row[idx.coin]||'').trim().toUpperCase();
  const type=String(row[idx.type]||'').trim();
  const core={
    entityId:'OKX',
    entityType:'EXCHANGE',
    chain,
    address,
    coin,
    assetType:type,
    snapshotHeight,
    snapshotAmount:amount,
    ownershipMessage:message,
    signaturePresent:Boolean(signature1),
    verificationStatus:message==='I am an OKX address'&&signature1
      ?'OFFICIAL_SOURCE_ATTESTED_WITH_SIGNATURE'
      :'OFFICIAL_SOURCE_ATTESTED',
    source:{
      publisher:'OKX',
      reportId:String(reportId),
      reportDate:reportDate?String(reportDate):null,
      url:String(sourceUrl),
      sourceType:'OFFICIAL_PROOF_OF_RESERVES'
    },
    restrictions:{
      publicAddressOnly:true,
      naturalPersonIdentity:false,
      ownershipInferenceBeyondSource:false,
      mayExecute:false
    }
  };
  return {...core,entryId:sha256(core)};
}

export function parseOfficialOkxPorCsv(text,{
  reportId='UNKNOWN',
  reportDate=null,
  sourceUrl='UNKNOWN',
  importedAt=Date.now(),
  allowedChains=['BITCOIN','ETHEREUM','SOLANA'],
  maxEntriesPerChain=5000
}={}){
  const lines=String(text||'').split(/\r?\n/);
  const headerIndex=lines.findIndex(line=>/^coin,Type,Network,Snapshot Height,address,amount,message,/i.test(line.trim()));
  if(headerIndex<0) throw new Error('OKX_POR_ADDRESS_HEADER_NOT_FOUND');
  const header=csvRow(lines[headerIndex]).map(x=>x.trim());
  const idx=Object.fromEntries(header.map((x,i)=>[x.toLowerCase(),i]));
  const entries=[];
  const allowed=new Set((allowedChains||[]).map(normalizeChain));
  const counts=new Map();
  const cap=Math.max(1,Number(maxEntriesPerChain)||5000);
  for(let i=headerIndex+1;i<lines.length;i++){
    if(!lines[i].trim()) continue;
    const row=csvRow(lines[i]);
    const entry=okxEntryFromRow(row,idx,{reportId,reportDate,sourceUrl});
    if(!entry||!allowed.has(entry.chain)) continue;
    if((counts.get(entry.chain)||0)>=cap) continue;
    counts.set(entry.chain,(counts.get(entry.chain)||0)+1);
    entries.push(entry);
  }
  const dedup=new Map();
  for(const e of entries) dedup.set(e.chain+'\u0000'+e.address.toLowerCase(),e);
  return [...dedup.values()].sort((a,b)=>a.chain.localeCompare(b.chain)||a.address.localeCompare(b.address));
}

export async function fetchOfficialOkxPorRegistry({
  fetchImpl=globalThis.fetch,
  url,
  reportId,
  reportDate,
  timeoutMs=15000,
  now=()=>Date.now()
}={}){
  if(typeof fetchImpl!=='function') throw new Error('fetchImpl required');
  const sourceUrl=String(url||'').trim();
  if(!/^https:\/\//i.test(sourceUrl)) throw new Error('official source url required');
  const ctrl=new AbortController();
  const timer=setTimeout(()=>ctrl.abort(),Math.max(1000,Number(timeoutMs)||15000));
  let res;
  try{
    res=await fetchImpl(sourceUrl,{signal:ctrl.signal,headers:{accept:'application/octet-stream','user-agent':'TCX-SHADOW-RESEARCH'}});
    if(!res.ok) throw new Error('OKX_POR_HTTP_'+res.status);
  }finally{
    clearTimeout(timer);
  }
  const bytes=Buffer.from(await res.arrayBuffer());
  const csv=firstCsvFromZip(bytes);
  const importedAt=now();
  const entries=parseOfficialOkxPorCsv(csv.text,{reportId,reportDate,sourceUrl,importedAt});
  const core={
    version:VERIFIED_ENTITY_REGISTRY_VERSION,
    importedAt,
    sources:[{
      entityId:'OKX',
      publisher:'OKX',
      reportId:String(reportId||'UNKNOWN'),
      reportDate:reportDate?String(reportDate):null,
      url:sourceUrl,
      archiveEntry:csv.name,
      verificationClass:'OFFICIAL_PROOF_OF_RESERVES_SIGNED_ADDRESS_LIST'
    }],
    entries,
    restrictions:{
      publicDataOnly:true,
      naturalPersonIdentity:false,
      mayExecute:false,
      mayMutateProductionForecast:false
    }
  };
  return deepFreeze({...core,fingerprint:sha256(core)});
}


function findZipEocd(bytes){
  for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--){
    if(bytes.readUInt32LE(i)===0x06054b50) return i;
  }
  return -1;
}

async function rangeBuffer(fetchImpl,url,start,end,{timeoutMs=15000}={}){
  const res=await fetchImpl(url,{
    signal:AbortSignal.timeout(Math.max(1000,Number(timeoutMs)||15000)),
    headers:{
      accept:'application/octet-stream',
      range:'bytes='+start+'-'+end,
      'user-agent':'TCX-SHADOW-RESEARCH'
    }
  });
  if(res.status!==206) throw new Error('RANGE_UNSUPPORTED_'+res.status);
  return {buffer:Buffer.from(await res.arrayBuffer()),headers:res.headers};
}

function parseCentralForCsv(cd,totalEntries){
  let p=0;
  for(let i=0;i<totalEntries;i++){
    if(p+46>cd.length||cd.readUInt32LE(p)!==0x02014b50) throw new Error('ZIP_CENTRAL_DIRECTORY_INVALID');
    const method=cd.readUInt16LE(p+10);
    const compressedSize=cd.readUInt32LE(p+20);
    const uncompressedSize=cd.readUInt32LE(p+24);
    const nameLen=cd.readUInt16LE(p+28);
    const extraLen=cd.readUInt16LE(p+30);
    const commentLen=cd.readUInt16LE(p+32);
    const localOffset=cd.readUInt32LE(p+42);
    const name=cd.subarray(p+46,p+46+nameLen).toString('utf8');
    if(/\.csv$/i.test(name)) return {name,method,compressedSize,uncompressedSize,localOffset};
    p+=46+nameLen+extraLen+commentLen;
  }
  throw new Error('ZIP_CSV_NOT_FOUND');
}

async function parseOkxCsvReadable(readable,{
  reportId,
  reportDate,
  sourceUrl,
  allowedChains=['BITCOIN','ETHEREUM','SOLANA'],
  maxEntriesPerChain=5000,
  maxExpandedBytes=300*1024*1024
}={}){
  const allowed=new Set((allowedChains||[]).map(normalizeChain));
  const cap=Math.max(1,Number(maxEntriesPerChain)||5000);
  const counts=new Map();
  const dedup=new Map();
  let header=null,idx=null,tail='',expanded=0;

  const processLine=line=>{
    const clean=String(line||'').replace(/\r$/,'');
    if(!header){
      if(/^coin,Type,Network,Snapshot Height,address,amount,message,/i.test(clean.trim())){
        header=csvRow(clean).map(x=>x.trim());
        idx=Object.fromEntries(header.map((x,i)=>[x.toLowerCase(),i]));
      }
      return;
    }
    if(!clean.trim()) return;
    const row=csvRow(clean);
    const entry=okxEntryFromRow(row,idx,{reportId,reportDate,sourceUrl});
    if(!entry||!allowed.has(entry.chain)) return;
    const key=entry.chain+'\u0000'+entry.address.toLowerCase();
    if(dedup.has(key)) return;
    if((counts.get(entry.chain)||0)>=cap) return;
    counts.set(entry.chain,(counts.get(entry.chain)||0)+1);
    dedup.set(key,entry);
  };

  for await(const chunk of readable){
    const buf=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);
    expanded+=buf.length;
    if(expanded>Math.max(1024*1024,Number(maxExpandedBytes)||300*1024*1024)){
      throw new Error('OKX_POR_EXPANDED_LIMIT_EXCEEDED');
    }
    const text=tail+buf.toString('utf8');
    const lines=text.split('\n');
    tail=lines.pop()||'';
    for(const line of lines) processLine(line);
    if([...allowed].every(chain=>(counts.get(chain)||0)>=cap)) break;
  }
  if(tail) processLine(tail);
  if(!header) throw new Error('OKX_POR_ADDRESS_HEADER_NOT_FOUND');
  return [...dedup.values()].sort((a,b)=>a.chain.localeCompare(b.chain)||a.address.localeCompare(b.address));
}

export async function fetchOfficialOkxPorRegistryStreaming({
  fetchImpl=globalThis.fetch,
  url,
  reportId,
  reportDate,
  timeoutMs=20000,
  allowedChains=['BITCOIN','ETHEREUM','SOLANA'],
  maxEntriesPerChain=5000,
  maxExpandedBytes=300*1024*1024,
  now=()=>Date.now()
}={}){
  if(typeof fetchImpl!=='function') throw new Error('fetchImpl required');
  const sourceUrl=String(url||'').trim();
  if(!/^https:\/\//i.test(sourceUrl)) throw new Error('official source url required');

  const tailRes=await fetchImpl(sourceUrl,{
    signal:AbortSignal.timeout(Math.max(1000,Number(timeoutMs)||20000)),
    headers:{accept:'application/octet-stream',range:'bytes=-65557','user-agent':'TCX-SHADOW-RESEARCH'}
  });
  if(tailRes.status!==206) throw new Error('RANGE_UNSUPPORTED_'+tailRes.status);
  const contentRange=String(tailRes.headers?.get?.('content-range')||'');
  const match=contentRange.match(/bytes\s+(\d+)-(\d+)\/(\d+)/i);
  if(!match) throw new Error('CONTENT_RANGE_MISSING');
  const tailStart=Number(match[1]);
  const totalSize=Number(match[3]);
  const tail=Buffer.from(await tailRes.arrayBuffer());
  const eocd=findZipEocd(tail);
  if(eocd<0) throw new Error('ZIP_EOCD_NOT_FOUND');
  const totalEntries=tail.readUInt16LE(eocd+10);
  const cdSize=tail.readUInt32LE(eocd+12);
  const cdOffset=tail.readUInt32LE(eocd+16);

  let cd;
  if(cdOffset>=tailStart&&cdOffset+cdSize<=tailStart+tail.length){
    cd=tail.subarray(cdOffset-tailStart,cdOffset-tailStart+cdSize);
  }else{
    cd=(await rangeBuffer(fetchImpl,sourceUrl,cdOffset,cdOffset+cdSize-1,{timeoutMs})).buffer;
  }
  const entry=parseCentralForCsv(cd,totalEntries);
  const local=(await rangeBuffer(fetchImpl,sourceUrl,entry.localOffset,entry.localOffset+29,{timeoutMs})).buffer;
  if(local.length<30||local.readUInt32LE(0)!==0x04034b50) throw new Error('ZIP_LOCAL_HEADER_INVALID');
  const nameLen=local.readUInt16LE(26);
  const extraLen=local.readUInt16LE(28);
  const dataStart=entry.localOffset+30+nameLen+extraLen;
  const dataEnd=dataStart+entry.compressedSize-1;

  const dataCtrl=new AbortController();
  const dataTimer=setTimeout(()=>dataCtrl.abort(),Math.max(1000,Number(timeoutMs)||20000));
  let dataRes=null,source=null,readable=null,entries;
  try{
    dataRes=await fetchImpl(sourceUrl,{
      signal:dataCtrl.signal,
      headers:{accept:'application/octet-stream',range:'bytes='+dataStart+'-'+dataEnd,'user-agent':'TCX-SHADOW-RESEARCH'}
    });
    if(dataRes.status!==206) throw new Error('CSV_RANGE_UNSUPPORTED_'+dataRes.status);
    source=dataRes.body?Readable.fromWeb(dataRes.body):Readable.from(Buffer.from(await dataRes.arrayBuffer()));
    // Network aborts must never become unhandled process-level stream errors.
    source.on('error',()=>{});
    if(entry.method===0) readable=source;
    else if(entry.method===8){
      readable=source.pipe(createInflateRaw());
      readable.on('error',()=>{});
    }else throw new Error('ZIP_COMPRESSION_UNSUPPORTED_'+entry.method);

    entries=await parseOkxCsvReadable(readable,{
      reportId,reportDate,sourceUrl,allowedChains,maxEntriesPerChain,maxExpandedBytes
    });
  }finally{
    clearTimeout(dataTimer);
    try{readable?.destroy?.();}catch{}
    try{source?.destroy?.();}catch{}
    try{await dataRes?.body?.cancel?.();}catch{}
  }

  const importedAt=now();
  const core={
    version:VERIFIED_ENTITY_REGISTRY_VERSION,
    importedAt,
    sources:[{
      entityId:'OKX',
      publisher:'OKX',
      reportId:String(reportId||'UNKNOWN'),
      reportDate:reportDate?String(reportDate):null,
      url:sourceUrl,
      archiveEntry:entry.name,
      archiveBytes:totalSize,
      verificationClass:'OFFICIAL_PROOF_OF_RESERVES_SIGNED_ADDRESS_LIST',
      importMode:'HTTP_RANGE_STREAM'
    }],
    entries,
    restrictions:{
      publicDataOnly:true,
      naturalPersonIdentity:false,
      mayExecute:false,
      mayMutateProductionForecast:false
    }
  };
  return deepFreeze({...core,fingerprint:sha256(core)});
}

export function entityRegistrySummary(registry){
  const entries=Array.isArray(registry?.entries)?registry.entries:[];
  const byEntity={},byChain={};
  for(const e of entries){
    byEntity[e.entityId]=(byEntity[e.entityId]||0)+1;
    byChain[e.chain]=(byChain[e.chain]||0)+1;
  }
  return {
    version:registry?.version||VERIFIED_ENTITY_REGISTRY_VERSION,
    importedAt:finite(registry?.importedAt),
    entries:entries.length,
    byEntity,
    byChain,
    sources:(registry?.sources||[]).map(x=>({entityId:x.entityId,reportId:x.reportId,reportDate:x.reportDate,url:x.url})),
    publicDataOnly:true,
    naturalPersonIdentity:false
  };
}

export function registryToWalletCohorts(registry,{
  entityIds=['OKX'],
  chains=['ETHEREUM'],
  maxAddressesPerCohort=20000
}={}){
  const allowedEntities=new Set(entityIds.map(String));
  const allowedChains=new Set(chains.map(x=>normalizeChain(x)));
  const groups=new Map();
  for(const e of Array.isArray(registry?.entries)?registry.entries:[]){
    if(!allowedEntities.has(String(e.entityId))||!allowedChains.has(normalizeChain(e.chain))) continue;
    const chain=normalizeChain(e.chain);
    if(chain==='ETHEREUM'&&!/^0x[a-f0-9]{40}$/i.test(e.address)) continue;
    if(chain==='SOLANA'&&!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(e.address)) continue;
    const symbol=chain==='ETHEREUM'?'ETHUSDT':chain==='SOLANA'?'SOLUSDT':null;
    if(!symbol) continue;
    const key=e.entityId+'-'+chain;
    const g=groups.get(key)||{id:'ENTITY_'+e.entityId+'_'+chain,entityId:e.entityId,chain,symbol,addresses:[],source:'VERIFIED_ENTITY_REGISTRY'};
    if(g.addresses.length<Math.max(1,Number(maxAddressesPerCohort)||20000)) g.addresses.push(e.address);
    groups.set(key,g);
  }
  return [...groups.values()].filter(x=>x.addresses.length);
}

export async function loadEntityRegistry(filePath,{maxBytes=20*1024*1024}={}){
  await mkdir(path.dirname(filePath),{recursive:true});
  try{
    const info=await stat(filePath);
    if(info.size>Math.max(1024,Number(maxBytes)||20*1024*1024)){
      const backup=filePath+'.oversize-'+Date.now();
      try{await rename(filePath,backup);}catch{}
      return null;
    }
    const raw=await readFile(filePath,'utf8');
    const value=JSON.parse(raw);
    if(value?.version!==VERIFIED_ENTITY_REGISTRY_VERSION) throw new Error('unsupported entity registry version');
    return value;
  }catch(err){
    if(err?.code==='ENOENT') return null;
    const backup=filePath+'.corrupt-'+Date.now();
    try{await rename(filePath,backup);}catch{}
    return null;
  }
}
export async function saveEntityRegistry(filePath,state){
  await mkdir(path.dirname(filePath),{recursive:true});
  const tmp=filePath+'.tmp-'+process.pid;
  await writeFile(tmp,JSON.stringify(state,null,2)+'\n',{encoding:'utf8',mode:0o600});
  await rename(tmp,filePath);
  return state;
}
