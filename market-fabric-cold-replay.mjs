import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { StringDecoder } from 'node:string_decoder';
import { Transform, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createBrotliDecompress, createGunzip } from 'node:zlib';
import { sha256 } from './institutional-kernel.mjs';
import { validateMarketEventShape } from './market-data-fabric.mjs';

export const MARKET_FABRIC_COLD_REPLAY_VERSION='TCX_MARKET_FABRIC_COLD_REPLAY_V1';

function verifyManifest(value){
  if(!value||!Array.isArray(value.segments)||!value.version) throw new Error('TCX_COLD_REPLAY_MANIFEST_INVALID');
  const core={version:value.version,segments:value.segments};
  if(value.fingerprint!==sha256(core)) throw new Error('TCX_COLD_REPLAY_MANIFEST_FINGERPRINT_MISMATCH');
  return value;
}

function auditTransform(){
  const hash=createHash('sha256');
  let bytes=0;
  let finished=false;
  const stream=new Transform({
    transform(chunk,_enc,cb){
      bytes+=chunk.length;
      hash.update(chunk);
      cb(null,chunk);
    }
  });
  return {
    stream,
    finish(){
      if(finished) throw new Error('TCX_COLD_REPLAY_AUDIT_ALREADY_FINISHED');
      finished=true;
      return {bytes,sha256:hash.digest('hex')};
    }
  };
}

function decompressor(codec){
  if(codec==='brotli') return createBrotliDecompress();
  if(codec==='gzip') return createGunzip();
  throw new Error('TCX_COLD_REPLAY_CODEC_UNSUPPORTED:'+String(codec));
}

function normalizeSymbol(value){
  return String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
}

function eventSymbolMatches(event,symbol){
  const s=normalizeSymbol(symbol);
  if(!s) return true;
  const payloadSymbol=normalizeSymbol(event?.payload?.symbol);
  if(payloadSymbol===s) return true;
  const key=String(event?.streamKey||'').toUpperCase();
  return key.endsWith(':'+s)||key.includes(':'+s+':');
}

function finite(value){
  const n=Number(value);
  return Number.isFinite(n)?n:null;
}

async function readManifest(filePath){
  const manifestPath=filePath+'.segments-manifest.json';
  const manifest=verifyManifest(JSON.parse(await readFile(manifestPath,'utf8')));
  return {manifestPath,manifest};
}

async function acquireSegment({filePath,item,coldStore}){
  const localPath=path.join(path.dirname(filePath),String(item.name));
  try{
    const info=await stat(localPath);
    if(info.size!==Number(item.compressedBytes)) throw new Error('TCX_COLD_REPLAY_LOCAL_SEGMENT_BYTES_MISMATCH');
    return {path:localPath,source:'LOCAL',cleanup:async()=>{}};
  }catch(err){
    if(err?.code!=='ENOENT') throw err;
  }

  if(!item?.cold) throw new Error('TCX_COLD_REPLAY_SEGMENT_MISSING:'+String(item?.sourceName||item?.name||'unknown'));
  if(item.cold.recoveryVerified!==true) throw new Error('TCX_COLD_REPLAY_REMOTE_NOT_RECOVERY_VERIFIED');
  if(!coldStore?.enabled||typeof coldStore.restoreVerifiedSegment!=='function') throw new Error('TCX_COLD_REPLAY_COLD_STORE_REQUIRED');

  const dir=await mkdtemp(path.join(os.tmpdir(),'tcx-cold-replay-'));
  const targetPath=path.join(dir,path.basename(String(item.name)));
  try{
    await coldStore.restoreVerifiedSegment({item,descriptor:item.cold,targetPath});
    return {
      path:targetPath,
      source:'COLD',
      cleanup:()=>rm(dir,{recursive:true,force:true})
    };
  }catch(err){
    await rm(dir,{recursive:true,force:true}).catch(()=>{});
    throw err;
  }
}

async function scanVerifiedSegment({
  segmentPath,
  item,
  select=()=>false,
  maxMatches=12000,
  keepLatest=true
}={}){
  const compressed=auditTransform();
  const raw=auditTransform();
  const decoder=new StringDecoder('utf8');
  const matches=[];
  let carry='';
  let count=0;
  let expectedSeq=Number(item.firstSeq);
  let previousHash=null;
  let lastSeq=null;
  let lastHash=null;

  function processLine(line){
    if(!line.trim()) return;
    let event;
    try{event=JSON.parse(line);}
    catch{throw new Error('TCX_COLD_REPLAY_SEGMENT_JSON_INVALID');}

    const shape=validateMarketEventShape(event);
    if(!shape.ok) throw new Error('TCX_COLD_REPLAY_EVENT_INVALID:'+shape.errors.join(','));
    if(Number(event.seq)!==expectedSeq) throw new Error('TCX_COLD_REPLAY_SEGMENT_SEQ_MISMATCH');
    if(previousHash!==null&&String(event.prevHash)!==String(previousHash)) throw new Error('TCX_COLD_REPLAY_SEGMENT_CHAIN_MISMATCH');

    expectedSeq++;
    previousHash=event.eventHash;
    lastSeq=Number(event.seq);
    lastHash=String(event.eventHash);
    count++;

    if(select(event)){
      matches.push(event);
      if(matches.length>maxMatches){
        if(keepLatest) matches.shift();
        else throw new Error('TCX_COLD_REPLAY_MATCH_LIMIT_EXCEEDED');
      }
    }
  }

  const sink=new Writable({
    write(chunk,_enc,cb){
      try{
        carry+=decoder.write(chunk);
        if(Buffer.byteLength(carry,'utf8')>8*1024*1024&&!carry.includes('\n')) throw new Error('TCX_COLD_REPLAY_LINE_TOO_LARGE');
        let idx;
        while((idx=carry.indexOf('\n'))>=0){
          const line=carry.slice(0,idx);
          carry=carry.slice(idx+1);
          processLine(line);
        }
        cb();
      }catch(err){cb(err);}
    },
    final(cb){
      try{
        carry+=decoder.end();
        if(carry.trim()) processLine(carry);
        carry='';
        cb();
      }catch(err){cb(err);}
    }
  });

  await pipeline(
    createReadStream(segmentPath),
    compressed.stream,
    decompressor(String(item.codec||'gzip')),
    raw.stream,
    sink
  );

  const c=compressed.finish();
  const r=raw.finish();
  if(c.bytes!==Number(item.compressedBytes)) throw new Error('TCX_COLD_REPLAY_COMPRESSED_BYTES_MISMATCH');
  if(c.sha256!==String(item.compressedSha256)) throw new Error('TCX_COLD_REPLAY_COMPRESSED_HASH_MISMATCH');
  if(r.bytes!==Number(item.rawBytes)) throw new Error('TCX_COLD_REPLAY_RAW_BYTES_MISMATCH');
  if(r.sha256!==String(item.rawSha256)) throw new Error('TCX_COLD_REPLAY_RAW_HASH_MISMATCH');

  const expectedCount=Math.max(0,Number(item.lastSeq)-Number(item.firstSeq)+1);
  if(count!==expectedCount) throw new Error('TCX_COLD_REPLAY_SEGMENT_COUNT_MISMATCH');
  if(lastSeq!==Number(item.lastSeq)) throw new Error('TCX_COLD_REPLAY_SEGMENT_LAST_SEQ_MISMATCH');
  if(lastHash!==String(item.tailHash)) throw new Error('TCX_COLD_REPLAY_SEGMENT_TAIL_HASH_MISMATCH');

  return {
    matches,
    count,
    compressedBytes:c.bytes,
    rawBytes:r.bytes,
    firstSeq:Number(item.firstSeq),
    lastSeq:Number(item.lastSeq)
  };
}

async function scanItem({filePath,item,coldStore,select,maxMatches,keepLatest}){
  const acquired=await acquireSegment({filePath,item,coldStore});
  try{
    const result=await scanVerifiedSegment({
      segmentPath:acquired.path,
      item,
      select,
      maxMatches,
      keepLatest
    });
    return {...result,source:acquired.source};
  }finally{
    await acquired.cleanup();
  }
}

function orderedSegments(manifest){
  return [...manifest.segments].sort((a,b)=>Number(b.lastSeq||0)-Number(a.lastSeq||0));
}

export async function sampleArchivedReplayPoints({
  filePath,
  coldStore,
  symbol,
  before=Date.now(),
  limit=8,
  maxSegments=6
}={}){
  const cutoff=finite(before);
  if(cutoff==null) throw new Error('TCX_COLD_REPLAY_BEFORE_REQUIRED');
  const want=Math.max(1,Math.min(24,Math.floor(Number(limit)||8)));
  const segmentLimit=Math.max(1,Math.min(64,Math.floor(Number(maxSegments)||6)));
  const {manifest}=await readManifest(filePath);
  const segments=orderedSegments(manifest);
  const candidates=[];
  let scannedSegments=0,coldSegments=0,localSegments=0;

  for(const item of segments){
    if(scannedSegments>=segmentLimit) break;
    const scan=await scanItem({
      filePath,item,coldStore,
      maxMatches:Math.max(2000,want*64),
      keepLatest:true,
      select:event=>
        event?.kind==='PRIMARY_MARKET' &&
        eventSymbolMatches(event,symbol) &&
        Number(event.availableAt)<cutoff
    });
    scannedSegments++;
    if(scan.source==='COLD') coldSegments++; else localSegments++;
    candidates.push(...scan.matches);

    const buckets=new Set(
      candidates
        .sort((a,b)=>Number(b.availableAt)-Number(a.availableAt)||Number(b.seq)-Number(a.seq))
        .map(e=>Math.floor(Number(e.availableAt)/60000))
    );
    if(buckets.size>=want) break;
  }

  const points=[];
  const seen=new Set();
  for(const event of candidates.sort((a,b)=>Number(b.availableAt)-Number(a.availableAt)||Number(b.seq)-Number(a.seq))){
    const at=Number(event.availableAt);
    const bucket=Math.floor(at/60000);
    if(seen.has(bucket)) continue;
    seen.add(bucket);
    points.push(at);
    if(points.length>=want) break;
  }

  return {
    version:MARKET_FABRIC_COLD_REPLAY_VERSION,
    points,
    scannedSegments,
    coldSegments,
    localSegments,
    manifestSegments:segments.length,
    provider:coldStore?.summary?.()||null
  };
}

export async function loadArchivedReplayTail({
  filePath,
  coldStore,
  symbol,
  asOf,
  limit=12000,
  maxSegments=24,
  kinds=['PRIMARY_MARKET','WITNESS_CONSENSUS','CANDLE_CLOSE']
}={}){
  const cutoff=finite(asOf);
  if(cutoff==null) throw new Error('TCX_COLD_REPLAY_ASOF_REQUIRED');
  const keep=Math.max(1000,Math.min(50000,Math.floor(Number(limit)||12000)));
  const segmentLimit=Math.max(1,Math.min(64,Math.floor(Number(maxSegments)||24)));
  const kindSet=new Set((kinds||[]).map(String));
  const {manifest}=await readManifest(filePath);
  const segments=orderedSegments(manifest);
  const events=[];
  let scannedSegments=0,coldSegments=0,localSegments=0;

  for(const item of segments){
    if(scannedSegments>=segmentLimit) break;
    const scan=await scanItem({
      filePath,item,coldStore,
      maxMatches:keep,
      keepLatest:true,
      select:event=>
        Number(event.availableAt)<=cutoff &&
        eventSymbolMatches(event,symbol) &&
        (kindSet.size===0||kindSet.has(String(event.kind)))
    });
    scannedSegments++;
    if(scan.source==='COLD') coldSegments++; else localSegments++;

    if(scan.matches.length){
      events.push(...scan.matches);
      const bySeq=new Map(events.map(e=>[Number(e.seq),e]));
      const ordered=[...bySeq.values()].sort((a,b)=>Number(a.seq)-Number(b.seq));
      events.splice(0,events.length,...ordered.slice(-keep));
      if(events.length>=keep) break;
    }
  }

  const exhaustedManifest=scannedSegments>=segments.length;
  const completeTail=events.length>=keep||exhaustedManifest;
  if(!completeTail&&scannedSegments>=segmentLimit){
    throw new Error('TCX_COLD_REPLAY_SEGMENT_SCAN_LIMIT_EXCEEDED');
  }

  return {
    version:MARKET_FABRIC_COLD_REPLAY_VERSION,
    events,
    asOf:cutoff,
    symbol:normalizeSymbol(symbol),
    maxEvents:keep,
    scannedSegments,
    coldSegments,
    localSegments,
    manifestSegments:segments.length,
    completeTail,
    provider:coldStore?.summary?.()||null
  };
}
