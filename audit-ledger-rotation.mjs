import path from 'node:path';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, open, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { Transform, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { constants as zlibConstants, createBrotliCompress, createBrotliDecompress } from 'node:zlib';

export const AUDIT_LEDGER_ROTATION_VERSION='TCX_AUDIT_LEDGER_ROTATION_V1';
const GENESIS='0'.repeat(64);

function canonicalize(value){
  if(value===null||typeof value==='string'||typeof value==='boolean')return value;
  if(typeof value==='number'){
    if(!Number.isFinite(value))throw new Error('AUDIT_ROTATION_NON_FINITE');
    return Object.is(value,-0)?0:value;
  }
  if(Array.isArray(value))return value.map(canonicalize);
  if(typeof value==='object'){
    const out={};
    for(const key of Object.keys(value).sort()){
      const v=value[key];
      if(v===undefined||typeof v==='function'||typeof v==='symbol')continue;
      out[key]=canonicalize(v);
    }
    return out;
  }
  throw new Error('AUDIT_ROTATION_UNSUPPORTED_TYPE:'+typeof value);
}
function canonicalJson(value){return JSON.stringify(canonicalize(value));}
function sha256(value){
  const bytes=Buffer.isBuffer(value)?value:Buffer.from(typeof value==='string'?value:canonicalJson(value),'utf8');
  return createHash('sha256').update(bytes).digest('hex');
}
function checkpointPath(filePath){return filePath+'.checkpoint.json';}
function pendingPath(filePath){return filePath+'.rotation-pending.json';}
function manifestPath(filePath){return filePath+'.segments-manifest.json';}

async function durableReplaceJson(target,value){
  await mkdir(path.dirname(target),{recursive:true});
  const tmp=target+'.tmp-'+process.pid;
  await writeFile(tmp,canonicalJson(value)+'\n',{encoding:'utf8',mode:0o600});
  const fh=await open(tmp,'r');
  try{await fh.sync();}finally{await fh.close();}
  await rename(tmp,target);
}

function signed(version,core){return {...core,version,fingerprint:sha256({...core,version})};}
function verifySigned(value,version,errorPrefix){
  if(!value||value.version!==version)throw new Error(errorPrefix+'_VERSION');
  const fp=String(value.fingerprint||'');
  const core={...value};delete core.fingerprint;
  if(sha256(core)!==fp)throw new Error(errorPrefix+'_FINGERPRINT');
  return value;
}
async function readOptionalJson(target){
  try{return JSON.parse(await readFile(target,'utf8'));}
  catch(err){if(err?.code==='ENOENT')return null;throw err;}
}
export async function readAuditLedgerCheckpoint(filePath){
  const value=await readOptionalJson(checkpointPath(filePath));
  if(!value)return null;
  return verifySigned(value,AUDIT_LEDGER_ROTATION_VERSION,'AUDIT_LEDGER_CHECKPOINT_INVALID');
}
export async function readAuditLedgerArchiveManifest(filePath){
  const value=await readOptionalJson(manifestPath(filePath));
  if(!value)return signed(AUDIT_LEDGER_ROTATION_VERSION,{segments:[]});
  return verifySigned(value,AUDIT_LEDGER_ROTATION_VERSION,'AUDIT_LEDGER_MANIFEST_INVALID');
}
async function readPending(filePath){
  const value=await readOptionalJson(pendingPath(filePath));
  if(!value)return null;
  return verifySigned(value,AUDIT_LEDGER_ROTATION_VERSION,'AUDIT_LEDGER_PENDING_INVALID');
}
function identityRows(identityIndex){
  return [...(identityIndex?.entries?.()??[])]
    .map(([key,row])=>[
      String(key),
      Number(row?.seq||0),
      String(row?.recordHash||''),
      Number(row?.occurredAt||0),
      String(row?.kind||''),
      String(row?.idField||''),
      String(row?.id||'')
    ])
    .sort((a,b)=>a[0].localeCompare(b[0]));
}
export function restoreAuditIdentityIndex(rows){
  const out=new Map();
  for(const x of Array.isArray(rows)?rows:[]){
    if(!Array.isArray(x)||x.length<7||!x[0])continue;
    out.set(String(x[0]),{
      seq:Number(x[1]||0),
      recordHash:String(x[2]||''),
      occurredAt:Number(x[3]||0),
      kind:String(x[4]||''),
      idField:String(x[5]||''),
      id:String(x[6]||'')
    });
  }
  return out;
}
function hashTransform(){
  const hash=createHash('sha256');let bytes=0;
  const stream=new Transform({
    transform(chunk,_enc,cb){bytes+=chunk.length;hash.update(chunk);cb(null,chunk);}
  });
  return {stream,finish:()=>({bytes,sha256:hash.digest('hex')})};
}
function discard(){return new Writable({write(_c,_e,cb){cb();}});}
async function compressAndAudit(source,target){
  const raw=hashTransform(),compressed=hashTransform();
  await pipeline(
    createReadStream(source),
    raw.stream,
    createBrotliCompress({params:{[zlibConstants.BROTLI_PARAM_QUALITY]:4}}),
    compressed.stream,
    createWriteStream(target,{flags:'wx',mode:0o600})
  );
  return {raw:raw.finish(),compressed:compressed.finish()};
}
async function verifyCompressed(target,item){
  const compressed=hashTransform(),raw=hashTransform();
  await pipeline(createReadStream(target),compressed.stream,createBrotliDecompress(),raw.stream,discard());
  const c=compressed.finish(),r=raw.finish();
  if(c.bytes!==Number(item.compressedBytes)||c.sha256!==String(item.compressedSha256)){
    throw new Error('AUDIT_LEDGER_SEGMENT_COMPRESSED_MISMATCH');
  }
  if(r.bytes!==Number(item.rawBytes)||r.sha256!==String(item.rawSha256)){
    throw new Error('AUDIT_LEDGER_SEGMENT_RAW_MISMATCH');
  }
  return {compressed:c,raw:r};
}
async function readBoundaryRecord(filePath,{first=false}={}){
  const fh=await open(filePath,'r');
  try{
    const meta=await fh.stat();
    if(meta.size<=0)return null;
    if(first){
      const max=Math.min(meta.size,256*1024);
      const buf=Buffer.allocUnsafe(max);
      await fh.read(buf,0,max,0);
      const line=buf.toString('utf8').split('\n').find(Boolean);
      return line?JSON.parse(line):null;
    }
    let pos=meta.size,carry=Buffer.alloc(0);
    while(pos>0&&carry.length<=4*1024*1024){
      const len=Math.min(64*1024,pos);pos-=len;
      const chunk=Buffer.allocUnsafe(len);await fh.read(chunk,0,len,pos);
      carry=Buffer.concat([chunk,carry]);
      const lines=carry.toString('utf8').split('\n').filter(Boolean);
      if(pos===0||lines.length>=2)return JSON.parse(lines.at(-1));
    }
    throw new Error('AUDIT_LEDGER_LAST_RECORD_UNREADABLE');
  }finally{await fh.close();}
}
async function writeManifestWithSegment(filePath,item){
  const current=await readAuditLedgerArchiveManifest(filePath);
  const existing=(current.segments||[]).find(x=>x.segmentId===item.segmentId);
  if(existing){
    if(existing.rawSha256!==item.rawSha256||existing.tailHash!==item.tailHash){
      throw new Error('AUDIT_LEDGER_MANIFEST_SEGMENT_CONFLICT');
    }
    return current;
  }
  const next=signed(AUDIT_LEDGER_ROTATION_VERSION,{
    segments:[...(current.segments||[]),item]
  });
  await durableReplaceJson(manifestPath(filePath),next);
  return next;
}
async function finishPending(filePath,pending){
  const item=pending.segment;
  const segmentPath=path.join(path.dirname(filePath),item.sourceName);
  await verifyCompressed(segmentPath,item);
  const manifest=await writeManifestWithSegment(filePath,item);
  const checkpoint=signed(AUDIT_LEDGER_ROTATION_VERSION,{
    createdAt:Number(pending.createdAt),
    lastSeq:Number(item.lastSeq),
    tailHash:String(item.tailHash),
    totalRecords:Number(pending.totalRecords||item.lastSeq),
    segmentId:String(item.segmentId),
    archivedSegment:String(item.sourceName),
    firstSeq:Number(item.firstSeq),
    anchorPrevHash:String(item.anchorPrevHash),
    rawBytes:Number(item.rawBytes),
    rawSha256:String(item.rawSha256),
    compressedBytes:Number(item.compressedBytes),
    compressedSha256:String(item.compressedSha256),
    codec:String(item.codec),
    previousCheckpointFingerprint:pending.previousCheckpointFingerprint||null,
    manifestFingerprint:manifest.fingerprint,
    identities:Array.isArray(pending.identities)?pending.identities:[],
    retainedRecords:Array.isArray(pending.retainedRecords)?pending.retainedRecords:[]
  });
  await durableReplaceJson(checkpointPath(filePath),checkpoint);
  return checkpoint;
}
export async function reconcileAuditLedgerRotation(filePath){
  const pending=await readPending(filePath);
  if(!pending)return {reconciled:false,reason:'NO_PENDING_ROTATION'};
  const item=pending.segment;
  const segmentFile=path.join(path.dirname(filePath),item.sourceName);
  const rawBackup=path.join(path.dirname(filePath),pending.rawBackupName);
  const activeExists=await stat(filePath).then(()=>true).catch(err=>err?.code==='ENOENT'?false:Promise.reject(err));
  const backupExists=await stat(rawBackup).then(()=>true).catch(err=>err?.code==='ENOENT'?false:Promise.reject(err));
  const segmentExists=await stat(segmentFile).then(()=>true).catch(err=>err?.code==='ENOENT'?false:Promise.reject(err));

  if(activeExists){
    // Rename never committed: the authoritative active chain still exists.
    if(segmentExists)await unlink(segmentFile).catch(()=>{});
    if(backupExists)await unlink(rawBackup).catch(()=>{});
    await unlink(pendingPath(filePath)).catch(()=>{});
    return {reconciled:true,action:'ABORTED_PENDING_ACTIVE_INTACT'};
  }
  if(!segmentExists&&backupExists){
    await rename(rawBackup,filePath);
    await unlink(pendingPath(filePath)).catch(()=>{});
    return {reconciled:true,action:'RESTORED_RAW_ACTIVE'};
  }
  if(!segmentExists)throw new Error('AUDIT_LEDGER_ROTATION_RECOVERY_SEGMENT_MISSING');

  const committed=await readAuditLedgerCheckpoint(filePath);
  if(committed&&Number(committed.lastSeq)===Number(item.lastSeq)&&committed.tailHash===item.tailHash){
    if(backupExists)await unlink(rawBackup).catch(()=>{});
    await unlink(pendingPath(filePath)).catch(()=>{});
    return {reconciled:true,action:'COMMIT_ALREADY_DURABLE',checkpoint:committed};
  }

  const checkpoint=await finishPending(filePath,pending);
  if(backupExists)await unlink(rawBackup).catch(()=>{});
  await unlink(pendingPath(filePath)).catch(()=>{});
  return {reconciled:true,action:'COMMITTED_PENDING_ROTATION',checkpoint};
}
export async function rotateVerifiedAuditLedger({
  ledger,
  filePath=ledger?.filePath,
  rotateBytes=48*1024*1024,
  now=Date.now()
}={}){
  if(!ledger?.healthy||!ledger?.verification?.ok)return {rotated:false,reason:'VERIFICATION_REQUIRED'};
  const meta=await stat(filePath).catch(err=>err?.code==='ENOENT'?null:Promise.reject(err));
  if(!meta||meta.size<=0)return {rotated:false,reason:'MISSING_OR_EMPTY',bytes:meta?.size||0};
  if(meta.size<Math.max(1,Number(rotateBytes)||1))return {rotated:false,reason:'BELOW_LIMIT',bytes:meta.size};

  const prior=await readAuditLedgerCheckpoint(filePath);
  const first=await readBoundaryRecord(filePath,{first:true});
  const last=await readBoundaryRecord(filePath);
  const expectedFirst=(Number(prior?.lastSeq)||0)+1;
  const expectedPrev=prior?.tailHash||GENESIS;
  if(Number(first?.seq)!==expectedFirst||String(first?.prevHash)!==expectedPrev){
    throw new Error('AUDIT_LEDGER_ROTATION_FIRST_RECORD_MISMATCH');
  }
  if(Number(last?.seq)!==Number(ledger.seq)||String(last?.recordHash)!==String(ledger.tailHash)){
    throw new Error('AUDIT_LEDGER_ROTATION_STALE_VERIFICATION');
  }
  if(Number(ledger.fileBytes||0)!==meta.size){
    throw new Error('AUDIT_LEDGER_ROTATION_FILE_SIZE_MISMATCH');
  }

  const segmentId=String(expectedFirst)+'-'+String(ledger.seq)+'-'+String(now);
  const segmentName=path.basename(filePath)+'.segment-'+segmentId+'.jsonl.br';
  const segmentFile=path.join(path.dirname(filePath),segmentName);
  const segmentTmp=segmentFile+'.tmp-'+process.pid;
  await unlink(segmentTmp).catch(()=>{});
  const audited=await compressAndAudit(filePath,segmentTmp);
  const item={
    segmentId,
    sourceName:segmentName,
    firstSeq:expectedFirst,
    lastSeq:Number(ledger.seq),
    anchorPrevHash:expectedPrev,
    tailHash:String(ledger.tailHash),
    rawBytes:audited.raw.bytes,
    rawSha256:audited.raw.sha256,
    compressedBytes:audited.compressed.bytes,
    compressedSha256:audited.compressed.sha256,
    codec:'brotli',
    createdAt:Number(now)
  };
  await verifyCompressed(segmentTmp,item);
  await rename(segmentTmp,segmentFile);

  const rawBackupName=path.basename(filePath)+'.rotation-raw-'+segmentId;
  const rawBackup=path.join(path.dirname(filePath),rawBackupName);
  const pending=signed(AUDIT_LEDGER_ROTATION_VERSION,{
    createdAt:Number(now),
    previousCheckpointFingerprint:prior?.fingerprint||null,
    totalRecords:Number(ledger.totalRecords||ledger.seq),
    rawBackupName,
    segment:item,
    identities:identityRows(ledger.identityIndex),
    retainedRecords:(Array.isArray(ledger.records)?ledger.records:[]).slice(-Math.max(1,Number(ledger.maxInMemoryRecords)||1000))
  });
  await durableReplaceJson(pendingPath(filePath),pending);
  await rename(filePath,rawBackup);
  let checkpoint;
  try{
    checkpoint=await finishPending(filePath,pending);
  }catch(err){
    // Leave pending + raw backup for deterministic startup reconciliation.
    throw err;
  }
  await unlink(rawBackup).catch(()=>{});
  await unlink(pendingPath(filePath)).catch(()=>{});

  ledger.fileBytes=0;
  ledger.checkpoint=checkpoint;
  ledger.writeBlocked=false;
  ledger.healthy=true;
  ledger.verification={
    ok:true,
    count:Number(ledger.seq),
    lastSeq:Number(ledger.seq),
    tailHash:String(ledger.tailHash),
    retainedRecords:Array.isArray(ledger.records)?ledger.records.length:0,
    checkpointed:true
  };
  return {rotated:true,checkpoint,segment:item};
}
