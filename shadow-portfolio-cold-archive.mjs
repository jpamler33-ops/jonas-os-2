import path from 'node:path';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, open as openFile, stat } from 'node:fs/promises';
import readline from 'node:readline';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGzip, createGunzip } from 'node:zlib';

import { sha256 } from './institutional-kernel.mjs';

export const SHADOW_PORTFOLIO_COLD_ARCHIVE_VERSION='TCX_SHADOW_PORTFOLIO_COLD_ARCHIVE_V1';

function validClosedShadowPosition(position){
  return Boolean(
    position&&
    typeof position==='object'&&
    String(position.positionId||'')&&
    String(position.status||'')==='CLOSED'&&
    position.execution==='SHADOW_ONLY'&&
    position.canExecuteLive===false
  );
}

function envelopeFor(position,archivedAt=Date.now()){
  const recordHash=sha256(position);
  return {
    version:SHADOW_PORTFOLIO_COLD_ARCHIVE_VERSION,
    positionId:String(position.positionId),
    closedAt:Number(position.closedAt)||null,
    archivedAt:Number(archivedAt)||Date.now(),
    recordHash,
    position
  };
}

function verifyEnvelope(value){
  if(value?.version!==SHADOW_PORTFOLIO_COLD_ARCHIVE_VERSION) return {ok:false,reason:'VERSION_INVALID'};
  if(!validClosedShadowPosition(value?.position)) return {ok:false,reason:'POSITION_INVALID'};
  if(String(value.positionId)!==String(value.position.positionId)) return {ok:false,reason:'POSITION_ID_MISMATCH'};
  const expected=sha256(value.position);
  if(String(value.recordHash)!==expected) return {ok:false,reason:'HASH_MISMATCH'};
  return {ok:true,recordHash:expected};
}

export async function openShadowPortfolioColdArchive(filePath){
  await mkdir(path.dirname(filePath),{recursive:true});
  const hashes=new Map();
  let records=0;
  let bytes=0;
  try{
    bytes=Number((await stat(filePath)).size||0);
  }catch(err){
    if(err?.code==='ENOENT'){
      return {
        version:SHADOW_PORTFOLIO_COLD_ARCHIVE_VERSION,
        filePath,hashes,records:0,bytes:0,healthy:true,error:null
      };
    }
    return {
      version:SHADOW_PORTFOLIO_COLD_ARCHIVE_VERSION,
      filePath,hashes,records:0,bytes:0,healthy:false,
      error:'STAT_FAILED:'+String(err instanceof Error?err.message:err)
    };
  }

  const input=createReadStream(filePath);
  const gunzip=createGunzip();
  const rl=readline.createInterface({input:input.pipe(gunzip),crlfDelay:Infinity});
  try{
    for await(const line of rl){
      if(!line.trim()) continue;
      let value;
      try{value=JSON.parse(line);}
      catch{
        return {
          version:SHADOW_PORTFOLIO_COLD_ARCHIVE_VERSION,filePath,hashes:new Map(),records:0,bytes,
          healthy:false,error:'PARSE_FAILURE'
        };
      }
      const verified=verifyEnvelope(value);
      if(!verified.ok){
        return {
          version:SHADOW_PORTFOLIO_COLD_ARCHIVE_VERSION,filePath,hashes:new Map(),records:0,bytes,
          healthy:false,error:'VERIFY_FAILURE:'+verified.reason
        };
      }
      const id=String(value.positionId);
      const prior=hashes.get(id);
      if(prior&&prior!==verified.recordHash){
        return {
          version:SHADOW_PORTFOLIO_COLD_ARCHIVE_VERSION,filePath,hashes:new Map(),records:0,bytes,
          healthy:false,error:'POSITION_CONFLICT:'+id
        };
      }
      if(!prior){
        hashes.set(id,verified.recordHash);
        records++;
      }
    }
  }catch(err){
    return {
      version:SHADOW_PORTFOLIO_COLD_ARCHIVE_VERSION,filePath,hashes:new Map(),records:0,bytes,
      healthy:false,error:'READ_FAILURE:'+String(err instanceof Error?err.message:err)
    };
  }finally{
    rl.close();
    input.destroy();
  }

  return {
    version:SHADOW_PORTFOLIO_COLD_ARCHIVE_VERSION,
    filePath,hashes,records,bytes,healthy:true,error:null
  };
}

export async function archiveClosedShadowPositions(archive,positions,{archivedAt=Date.now()}={}){
  if(!archive?.healthy) throw new Error('SHADOW_COLD_ARCHIVE_UNHEALTHY:'+String(archive?.error||'UNKNOWN'));
  const rows=[];
  let skipped=0;
  for(const position of Array.isArray(positions)?positions:[]){
    if(!validClosedShadowPosition(position)) continue;
    const env=envelopeFor(position,archivedAt);
    const prior=archive.hashes.get(env.positionId);
    if(prior){
      if(prior!==env.recordHash) throw new Error('SHADOW_COLD_ARCHIVE_CONFLICT:'+env.positionId);
      skipped++;
      continue;
    }
    rows.push(env);
  }
  if(!rows.length){
    return {archived:0,skipped,bytesAdded:0,totalRecords:archive.records,totalBytes:archive.bytes};
  }

  const before=archive.bytes;
  function* archiveLines(){
    for(const row of rows) yield JSON.stringify(row)+'\n';
  }
  await pipeline(
    Readable.from(archiveLines()),
    createGzip({level:1}),
    createWriteStream(archive.filePath,{flags:'a',mode:0o600})
  );
  const fh=await openFile(archive.filePath,'r+');
  try{await fh.sync();}finally{await fh.close();}
  const after=Number((await stat(archive.filePath)).size||0);

  for(const row of rows) archive.hashes.set(row.positionId,row.recordHash);
  archive.records+=rows.length;
  archive.bytes=after;
  return {
    archived:rows.length,
    skipped,
    bytesAdded:Math.max(0,after-before),
    totalRecords:archive.records,
    totalBytes:archive.bytes
  };
}

export function shadowPortfolioColdArchiveSummary(archive){
  return Object.freeze({
    version:SHADOW_PORTFOLIO_COLD_ARCHIVE_VERSION,
    healthy:archive?.healthy===true,
    records:Number(archive?.records||0),
    bytes:Number(archive?.bytes||0),
    error:archive?.error||null,
    destructiveRetention:false,
    execution:'SHADOW_ONLY',
    canExecuteLive:false
  });
}
