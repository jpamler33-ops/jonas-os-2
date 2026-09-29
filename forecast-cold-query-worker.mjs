import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { gunzip as gunzipCallback } from 'node:zlib';
import { parentPort, workerData } from 'node:worker_threads';
import { sha256 } from './institutional-kernel.mjs';
import { FORECAST_COLD_ARCHIVE_VERSION } from './forecast-cold-archive.mjs';

const gunzip=promisify(gunzipCallback);
const MANIFEST_VERSION='TCX_FORECAST_COLD_ARCHIVE_MANIFEST_V1';

function verifyManifest(value){
  if(!value||value.version!==MANIFEST_VERSION||!Array.isArray(value.segments)){
    throw Object.assign(new Error('FORECAST_COLD_QUERY_MANIFEST_INVALID'),{code:'FORECAST_COLD_QUERY_MANIFEST_INVALID'});
  }
  const core={version:value.version,segments:value.segments};
  if(value.fingerprint!==sha256(core)){
    throw Object.assign(new Error('FORECAST_COLD_QUERY_MANIFEST_FINGERPRINT_MISMATCH'),{code:'FORECAST_COLD_QUERY_MANIFEST_FINGERPRINT_MISMATCH'});
  }
  return value;
}

function rowAt(row){
  for(const value of [row?.generatedAt,row?.asOf,row?.issuedAt,row?.report?.asOf]){
    const n=Number(value);
    if(Number.isFinite(n)&&n>0) return n;
  }
  return 0;
}

function normalizeQuery(query={}){
  const symbol=String(query.symbol||'').toUpperCase()||null;
  const fromAt=Math.max(0,Number(query.fromAt)||0);
  const toAt=Math.max(fromAt,Number(query.toAt)||Number.MAX_SAFE_INTEGER);
  const limit=Math.max(1,Math.min(200,Math.floor(Number(query.limit)||50)));
  const includeIssuances=query.includeIssuances!==false;
  const includeTracker=query.includeTracker!==false;
  return {symbol,fromAt,toAt,limit,includeIssuances,includeTracker};
}

function rowMatches(row,q){
  const at=rowAt(row);
  if(at<q.fromAt||at>q.toAt) return false;
  if(q.symbol&&String(row?.symbol||row?.report?.symbol||'').toUpperCase()!==q.symbol) return false;
  return true;
}

async function loadVerifiedSegment(dir,segment){
  const packed=await readFile(path.join(dir,segment.name));
  const logical=await gunzip(packed);
  const hash=createHash('sha256').update(logical).digest('hex');
  if(hash!==segment.sha256||logical.length!==Number(segment.logicalBytes)){
    throw Object.assign(new Error('FORECAST_COLD_QUERY_SEGMENT_INTEGRITY_FAILURE:'+segment.name),{code:'FORECAST_COLD_QUERY_SEGMENT_INTEGRITY_FAILURE'});
  }
  const parsed=JSON.parse(logical.toString('utf8'));
  if(parsed?.version!==FORECAST_COLD_ARCHIVE_VERSION){
    throw Object.assign(new Error('FORECAST_COLD_QUERY_SEGMENT_VERSION_UNSUPPORTED'),{code:'FORECAST_COLD_QUERY_SEGMENT_VERSION_UNSUPPORTED'});
  }
  return parsed;
}

async function run(input={}){
  const dir=String(input.dir||'');
  if(!dir) throw Object.assign(new Error('FORECAST_COLD_QUERY_DIR_REQUIRED'),{code:'FORECAST_COLD_QUERY_DIR_REQUIRED'});
  const q=normalizeQuery(input.query);
  const manifest=verifyManifest(JSON.parse(await readFile(path.join(dir,'manifest.json'),'utf8')));
  const candidates=manifest.segments
    .filter(s=>Number(s.lastAt||0)>=q.fromAt&&Number(s.firstAt||0)<=q.toAt)
    .sort((a,b)=>Number(b.lastAt||0)-Number(a.lastAt||0));

  const issuances=[];
  const trackerRecords=[];
  let scannedSegments=0,verifiedLogicalBytes=0;

  for(const segment of candidates){
    if(
      (!q.includeIssuances||issuances.length>=q.limit)&&
      (!q.includeTracker||trackerRecords.length>=q.limit)
    ) break;
    const parsed=await loadVerifiedSegment(dir,segment);
    scannedSegments++;
    verifiedLogicalBytes+=Number(segment.logicalBytes)||0;

    if(q.includeIssuances&&issuances.length<q.limit){
      for(const row of [...(parsed.issuances||[])].reverse()){
        if(rowMatches(row,q)) issuances.push(row);
        if(issuances.length>=q.limit) break;
      }
    }
    if(q.includeTracker&&trackerRecords.length<q.limit){
      for(const row of [...(parsed.trackerRecords||[])].reverse()){
        if(rowMatches(row,q)) trackerRecords.push(row);
        if(trackerRecords.length>=q.limit) break;
      }
    }
  }

  issuances.sort((a,b)=>rowAt(b)-rowAt(a));
  trackerRecords.sort((a,b)=>rowAt(b)-rowAt(a));
  return {
    version:'TCX_FORECAST_COLD_QUERY_V1',
    archiveVersion:FORECAST_COLD_ARCHIVE_VERSION,
    manifestFingerprint:manifest.fingerprint,
    query:q,
    scannedSegments,
    candidateSegments:candidates.length,
    verifiedLogicalBytes,
    issuances:issuances.slice(0,q.limit),
    trackerRecords:trackerRecords.slice(0,q.limit)
  };
}

try{
  const result=await run(workerData||{});
  parentPort.postMessage({ok:true,result});
  parentPort.close();
}catch(err){
  parentPort.postMessage({
    ok:false,
    error:err instanceof Error?err.message:String(err),
    code:err?.code||null
  });
  parentPort.close();
}
