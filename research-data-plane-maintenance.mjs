import path from 'node:path';
import { createReadStream } from 'node:fs';
import { open, stat, rename, unlink } from 'node:fs/promises';
import readline from 'node:readline';

import {
  validateResearchDataRecord,
  saveResearchDataPlaneAnchor,
  withResearchDataPlaneMutationLock
} from './research-data-plane.mjs';

const MiB=1024*1024;

async function inspectCompactedChain(filePath){
  const input=createReadStream(filePath,{encoding:'utf8'});
  const rl=readline.createInterface({input,crlfDelay:Infinity});
  let first=null;
  let previous=null;
  let count=0;
  try{
    for await(const line of rl){
      if(!line.trim()) continue;
      let record;
      try{record=JSON.parse(line);}
      catch(err){throw new Error('RDP_COMPACT_PARSE_FAILURE:'+String(err instanceof Error?err.message:err));}
      const shape=validateResearchDataRecord(record);
      if(!shape.ok) throw new Error('RDP_COMPACT_RECORD_INVALID:'+shape.errors.join(','));
      if(!first) first=record;
      if(previous){
        if(Number(record.seq)!==Number(previous.seq)+1){
          throw new Error('RDP_COMPACT_SEQ_GAP:'+record.seq+':'+(Number(previous.seq)+1));
        }
        if(record.prevHash!==previous.recordHash){
          throw new Error('RDP_COMPACT_PREV_HASH_MISMATCH:'+record.seq);
        }
      }
      previous=record;
      count++;
    }
  }finally{
    rl.close();
    input.destroy();
  }
  if(!first||!previous||count<1) throw new Error('RDP_COMPACT_EMPTY_RESULT');
  return {
    count,
    firstSeq:Number(first.seq),
    firstPrevHash:String(first.prevHash),
    firstRecordHash:String(first.recordHash),
    lastSeq:Number(previous.seq),
    lastRecordHash:String(previous.recordHash)
  };
}

async function compactResearchDataPlaneUnlocked({
  dataDir='/data',
  fileName='tcx-research-data-plane.jsonl',
  triggerBytes=64*MiB,
  targetBytes=32*MiB,
  minFreeBytes=128*MiB,
  pressure=null,
  logger=console,
  minTargetBytes=8*MiB
}={}){
  const filePath=path.join(dataDir,fileName);
  let meta;
  try{meta=await stat(filePath);}catch(err){
    if(err?.code==='ENOENT') return {ok:true,compacted:false,reason:'MISSING'};
    return {ok:false,compacted:false,reason:'STAT_FAILED',error:String(err?.message||err)};
  }
  const available=Number(pressure?.availableBytes);
  const underPressure=String(pressure?.state||'NORMAL')!=='NORMAL'||(Number.isFinite(available)&&available<minFreeBytes);
  const target=Math.max(Math.max(256,Math.floor(minTargetBytes)),Math.floor(targetBytes));
  if(meta.size<triggerBytes&&!underPressure) return {ok:true,compacted:false,reason:'BELOW_TRIGGER',bytes:meta.size};
  if(underPressure&&meta.size<=target){
    return {
      ok:true,
      compacted:false,
      reason:'AT_TARGET_UNDER_PRESSURE',
      bytes:meta.size,
      targetBytes:target,
      availableBytes:Number.isFinite(available)?available:null
    };
  }

  const keep=Math.min(meta.size,target);
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

  let verified;
  try{
    verified=await inspectCompactedChain(tmp);
  }catch(error){
    try{await unlink(tmp);}catch{}
    const message=error instanceof Error?error.message:String(error);
    logger.error?.('[TCX_RESEARCH_DATA_PLANE_COMPACT_VERIFY_FAILED]',JSON.stringify({
      error:message,beforeBytes:meta.size,underPressure,destructiveRetention:false
    }));
    return {ok:false,compacted:false,reason:'VERIFY_FAILED',error:message,beforeBytes:meta.size};
  }

  await rename(tmp,filePath);
  const anchor=await saveResearchDataPlaneAnchor(filePath,{
    firstSeq:verified.firstSeq,
    anchorPrevHash:verified.firstPrevHash,
    firstRecordHash:verified.firstRecordHash,
    reason:'VERIFIED_TAIL_COMPACTION'
  });
  const after=await stat(filePath);
  const freed=Math.max(0,meta.size-after.size);
  logger.info?.('[TCX_RESEARCH_DATA_PLANE_COMPACT]',JSON.stringify({
    beforeBytes:meta.size,afterBytes:after.size,freedBytes:freed,underPressure,
    retainedRecords:verified.count,firstSeq:verified.firstSeq,lastSeq:verified.lastSeq,
    anchorVersion:anchor.version
  }));
  return {
    ok:true,compacted:true,beforeBytes:meta.size,afterBytes:after.size,freedBytes:freed,
    retainedRecords:verified.count,firstSeq:verified.firstSeq,lastSeq:verified.lastSeq,
    anchorVersion:anchor.version
  };
}

export async function compactResearchDataPlane(options={}){
  const dataDir=options?.dataDir||'/data';
  const fileName=options?.fileName||'tcx-research-data-plane.jsonl';
  const filePath=path.join(dataDir,fileName);
  return withResearchDataPlaneMutationLock(
    filePath,
    ()=>compactResearchDataPlaneUnlocked(options)
  );
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

export const RESEARCH_DATA_PLANE_MAINTENANCE_VERSION='TCX_RDP_MAINTENANCE_V2';
