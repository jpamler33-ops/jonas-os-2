import path from 'node:path';
import { open, stat, rename, unlink } from 'node:fs/promises';

const MiB=1024*1024;

async function exists(p){try{await stat(p);return true;}catch{return false;}}

export async function compactResearchDataPlane({
  dataDir='/data',
  fileName='tcx-research-data-plane.jsonl',
  triggerBytes=64*MiB,
  targetBytes=32*MiB,
  minFreeBytes=128*MiB,
  pressure=null,
  logger=console
}={}){
  const filePath=path.join(dataDir,fileName);
  let meta;
  try{meta=await stat(filePath);}catch(err){
    if(err?.code==='ENOENT') return {ok:true,compacted:false,reason:'MISSING'};
    return {ok:false,compacted:false,reason:'STAT_FAILED',error:String(err?.message||err)};
  }
  const available=Number(pressure?.availableBytes);
  const underPressure=String(pressure?.state||'NORMAL')!=='NORMAL'||(Number.isFinite(available)&&available<minFreeBytes);
  if(meta.size<triggerBytes&&!underPressure) return {ok:true,compacted:false,reason:'BELOW_TRIGGER',bytes:meta.size};

  const keep=Math.min(meta.size,Math.max(8*MiB,Math.floor(targetBytes)));
  const start=Math.max(0,meta.size-keep);
  const src=await open(filePath,'r');
  const tmp=`${filePath}.compact-${process.pid}-${Date.now()}`;
  const dst=await open(tmp,'w');
  try{
    const buf=Buffer.allocUnsafe(1024*1024);
    let pos=start;
    let first=true;
    let carry=Buffer.alloc(0);
    while(pos<meta.size){
      const {bytesRead}=await src.read(buf,0,Math.min(buf.length,meta.size-pos),pos);
      if(!bytesRead) break;
      let chunk=Buffer.concat([carry,buf.subarray(0,bytesRead)]);
      if(first&&start>0){
        const nl=chunk.indexOf(0x0a);
        if(nl<0){carry=Buffer.alloc(0);pos+=bytesRead;continue;}
        chunk=chunk.subarray(nl+1);first=false;
      }
      carry=Buffer.alloc(0);
      if(chunk.length) await dst.write(chunk);
      pos+=bytesRead;
    }
    await dst.sync();
  }finally{await src.close();await dst.close();}
  await rename(tmp,filePath);
  const after=await stat(filePath);
  const freed=Math.max(0,meta.size-after.size);
  logger.info?.('[TCX_RESEARCH_DATA_PLANE_COMPACT]',JSON.stringify({beforeBytes:meta.size,afterBytes:after.size,freedBytes:freed,underPressure}));
  return {ok:true,compacted:true,beforeBytes:meta.size,afterBytes:after.size,freedBytes:freed};
}

export async function cleanupResearchCompactionArtifacts({dataDir='/data',minAgeMs=5*60_000,now=Date.now()}={}){
  const {readdir}=await import('node:fs/promises');
  const removed=[];
  let names=[];try{names=await readdir(dataDir);}catch{return {removed};}
  for(const name of names){
    if(!name.startsWith('tcx-research-data-plane.jsonl.compact-')) continue;
    const p=path.join(dataDir,name);
    try{const s=await stat(p);if(now-s.mtimeMs>=minAgeMs){await unlink(p);removed.push(name);}}catch{}
  }
  return {removed};
}

export const RESEARCH_DATA_PLANE_MAINTENANCE_VERSION='TCX_RDP_MAINTENANCE_V1';
