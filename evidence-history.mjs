import path from "node:path";
import { createWriteStream } from "node:fs";
import { mkdir, open as openFile, readFile, rename, unlink } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import { createGzip, gunzip as gunzipCallback } from "node:zlib";

const gunzip=promisify(gunzipCallback);
import { createStateFingerprint, validateStateFingerprint } from "./state-validity.mjs";

export const EVIDENCE_HISTORY_VERSION="TCX_EVIDENCE_HISTORY_V2";
export const EVIDENCE_HISTORY_SCHEMA_VERSION=1;
export const EVIDENCE_HISTORY_WAL_VERSION="TCX_EVIDENCE_HISTORY_WAL_V1";
const SCHEMA_VERSION=EVIDENCE_HISTORY_SCHEMA_VERSION;
const DEFAULT_MAX_WAL_BYTES=32*1024*1024;
const SYMBOL_RE=/^[A-Z0-9]{2,18}USDT$/;
const DEFAULT_MAX_LOGICAL_BYTES=128*1024*1024;

function isGzipBuffer(value){
  return Buffer.isBuffer(value)&&value.length>=2&&value[0]===0x1f&&value[1]===0x8b;
}

function canonicalEvidenceRecordSafe(r){
  if(!r||typeof r!=="object"||Array.isArray(r)) return false;
  const symbol=String(r.symbol||"");
  const capturedAt=Number(r.capturedAt);
  const index=Number(r.index);
  const closedAt=r.closedAt==null?null:Number(r.closedAt);
  if(
    Number(r.schemaVersion)!==SCHEMA_VERSION||
    symbol!==symbol.toUpperCase()||
    !SYMBOL_RE.test(symbol)||
    !Number.isFinite(capturedAt)||capturedAt<=0||
    !Number.isFinite(index)||index<0||index>100||
    !Number.isFinite(Number(r.disagreementCount))||Number(r.disagreementCount)<0||
    !Number.isFinite(Number(r.weakCount))||Number(r.weakCount)<0||
    typeof r.trend!=="string"||
    (r.stateFingerprint!=null&&!validateStateFingerprint(r.stateFingerprint))||
    (r.validityLast!=null&&(typeof r.validityLast!=="object"||Array.isArray(r.validityLast)))||
    (closedAt!=null&&(!Number.isFinite(closedAt)||closedAt<=0))||
    !r.map||typeof r.map!=="object"||Array.isArray(r.map)
  ) return false;
  return true;
}

function normalizedEvidenceRecords(records,{maxPerSymbol=500,reuseCanonicalRecords=false}={}){
  const grouped=new Map();
  for(const r of Array.isArray(records)?records:[]){
    const x=reuseCanonicalRecords&&canonicalEvidenceRecordSafe(r)?r:sanitizeRecord(r);
    if(!x) continue;
    if(!grouped.has(x.symbol)) grouped.set(x.symbol,[]);
    grouped.get(x.symbol).push(x);
  }
  const clean=[];
  const cap=Math.max(1,Math.floor(Number(maxPerSymbol)||500));
  for(const rows of grouped.values()){
    rows.sort((a,b)=>a.capturedAt-b.capturedAt);
    clean.push(...rows.slice(-cap));
  }
  clean.sort((a,b)=>a.capturedAt-b.capturedAt);
  return clean;
}

function clamp(x,a=0,b=1){
  const n=Number(x);
  return Number.isFinite(n)?Math.max(a,Math.min(b,n)):a;
}

function side(v){
  const s=String(v||"").toUpperCase();
  if(["BULLISH","UP","BID_PRESSURE"].includes(s)) return "BULLISH";
  if(["BEARISH","DOWN","ASK_PRESSURE"].includes(s)) return "BEARISH";
  return "NEUTRAL";
}

function relation(reference,value){
  if(reference==="MIXED"||value==="NEUTRAL") return "NEUTRAL";
  return reference===value?"ALIGNED":"CONFLICT";
}

function fingerprint(record){
  const s=[
    record.symbol,
    record.status,
    record.regime,
    record.bias,
    record.structure,
    record.trend,
    record.disagreementCount,
    record.index,
    record.gate,
    record.stateFingerprint?.hash||"NO_STATE_FP"
  ].join("|");
  let h=2166136261;
  for(let i=0;i<s.length;i++){
    h^=s.charCodeAt(i);
    h=Math.imul(h,16777619);
  }
  return (h>>>0).toString(16).padStart(8,"0");
}

export function deriveDisagreementMap(ctx={}){
  const structure=side(ctx.state?.structure);
  const mtf=side(ctx.state?.mtfBias);
  const flow=side(ctx.state?.flow);
  let reference="MIXED";
  if(structure===mtf && structure!=="NEUTRAL") reference=structure;
  else if(structure!=="NEUTRAL" && mtf==="NEUTRAL") reference=structure;
  else if(mtf!=="NEUTRAL" && structure==="NEUTRAL") reference=mtf;

  const witnessRelation=ctx.witness?.contradiction===true
    ? "CONFLICT"
    : clamp(ctx.witness?.agreement)>=0.58?"ALIGNED":"WEAK";

  const novelty=clamp(ctx.memory?.novelty);
  const memoryRelation=novelty>0.75
    ? "NOVEL"
    : ctx.memory?.sufficient===true?"SUPPORTED":"WEAK";

  const engineContradiction=clamp(ctx.engine?.contradiction);
  const gate=String(ctx.engine?.gate||"INSUFFICIENT_EVIDENCE");
  const engineRelation=engineContradiction>0.25
    ? "CONFLICT"
    : ["HYPOTHESIS_SUPPORTED","IDENTIFIABILITY_REVIEW"].includes(gate)?"SUPPORTED":"WEAK";

  const safetyState=String(ctx.safety?.state||"UNKNOWN");
  const safetyRelation=safetyState==="SAFE_STOP"
    ? "CONFLICT"
    : ctx.safety?.canResearch===true?"ALIGNED":"WEAK";

  const layers=[
    {layer:"STRUCTURE",value:structure,relation:relation(reference,structure)},
    {layer:"MTF",value:mtf,relation:relation(reference,mtf)},
    {layer:"FLOW",value:flow,relation:relation(reference,flow)},
    {layer:"WITNESS",value:Math.round(clamp(ctx.witness?.agreement)*100)+"%",relation:witnessRelation},
    {layer:"MEMORY",value:"support "+Number(ctx.memory?.support||0),relation:memoryRelation},
    {layer:"ENGINE",value:gate,relation:engineRelation},
    {layer:"SAFETY",value:safetyState,relation:safetyRelation}
  ];

  return {
    reference,
    layers,
    conflictCount:layers.filter(x=>x.relation==="CONFLICT").length,
    weakCount:layers.filter(x=>["WEAK","NOVEL"].includes(x.relation)).length
  };
}

export function deriveEvidenceIndex(ctx={}){
  const witness=clamp(ctx.witness?.agreement);
  const support=clamp(Number(ctx.memory?.support||0)/16);
  const novelty=clamp(ctx.memory?.novelty);
  const strength=clamp(ctx.engine?.evidenceStrength);
  const contradiction=clamp(ctx.engine?.contradiction);
  const safety=ctx.safety?.canResearch===true?1:0;
  let score=100*(
    0.20*witness+
    0.15*support+
    0.15*(1-novelty)+
    0.25*strength+
    0.15*(1-contradiction)+
    0.10*safety
  );
  const state=String(ctx.safety?.state||"UNKNOWN");
  if(state==="SAFE_STOP") score=Math.min(score,25);
  else if(ctx.safety?.canResearch!==true) score=Math.min(score,45);
  return Math.round(Math.max(0,Math.min(100,score)));
}

export function deriveEvidenceTrend(currentIndex,previousRecord,map){
  if(map?.conflictCount>=2) return "CONFLICTED";
  const current=Number(currentIndex);
  const prev=Number(previousRecord?.index);
  if(!Number.isFinite(prev)) return "BASELINE";
  const delta=current-prev;
  if(delta>=5) return "RISING";
  if(delta<=-5) return "DECAYING";
  return "STABLE";
}

export function createEvidenceRecord(symbol,ctx,previousRecord=null){
  const s=String(symbol||"").toUpperCase();
  if(!SYMBOL_RE.test(s)) throw new Error("invalid evidence symbol");
  const map=deriveDisagreementMap(ctx);
  const index=deriveEvidenceIndex(ctx);
  const record={
    schemaVersion:SCHEMA_VERSION,
    symbol:s,
    capturedAt:Number(ctx.capturedAt||Date.now()),
    index,
    trend:deriveEvidenceTrend(index,previousRecord,map),
    disagreementCount:map.conflictCount,
    weakCount:map.weakCount,
    reference:map.reference,
    status:String(ctx.safety?.state||"UNKNOWN"),
    regime:String(ctx.state?.regime||"UNKNOWN"),
    bias:String(ctx.state?.mtfBias||"UNKNOWN"),
    structure:String(ctx.state?.structure||"UNKNOWN"),
    flow:String(ctx.state?.flow||"UNKNOWN"),
    witnessAgreement:clamp(ctx.witness?.agreement),
    memorySupport:Number(ctx.memory?.support||0),
    novelty:clamp(ctx.memory?.novelty),
    contradiction:clamp(ctx.engine?.contradiction),
    evidenceStrength:clamp(ctx.engine?.evidenceStrength),
    gate:String(ctx.engine?.gate||"UNKNOWN"),
    stateFingerprint:createStateFingerprint(s,ctx),
    validityLast:null,
    closedAt:null,
    epistemic:"DERIVED_RESEARCH_DIAGNOSTIC_NOT_PROBABILITY"
  };
  return {...record,fingerprint:fingerprint(record),map};
}

export function appendEvidenceRecord(history,record,{maxPerSymbol=500}={}){
  const out=Array.isArray(history)?history:[];
  const last=[...out].reverse().find(x=>x.symbol===record.symbol);
  if(last && last.fingerprint===record.fingerprint && Number(last.capturedAt)===Number(record.capturedAt)) return out;
  out.push(record);
  const grouped=new Map();
  for(const r of out){
    if(!grouped.has(r.symbol)) grouped.set(r.symbol,[]);
    grouped.get(r.symbol).push(r);
  }
  const trimmed=[];
  for(const rows of grouped.values()){
    rows.sort((a,b)=>a.capturedAt-b.capturedAt);
    trimmed.push(...rows.slice(-maxPerSymbol));
  }
  trimmed.sort((a,b)=>a.capturedAt-b.capturedAt);
  return trimmed;
}

function sanitizeRecord(r){
  if(!r||typeof r!=="object") return null;
  const symbol=String(r.symbol||"").toUpperCase();
  if(!SYMBOL_RE.test(symbol)) return null;
  const capturedAt=Number(r.capturedAt);
  const index=Number(r.index);
  if(!Number.isFinite(capturedAt)||capturedAt<=0||!Number.isFinite(index)) return null;
  const stateFingerprint=validateStateFingerprint(r.stateFingerprint)?r.stateFingerprint:null;
  const closedAt=Number(r.closedAt);
  const validityLast=(r.validityLast&&typeof r.validityLast==="object"&&!Array.isArray(r.validityLast))
    ? {...r.validityLast}
    : null;
  return {
    ...r,
    schemaVersion:SCHEMA_VERSION,
    symbol,
    capturedAt,
    index:Math.max(0,Math.min(100,index)),
    trend:String(r.trend||"UNKNOWN"),
    disagreementCount:Math.max(0,Number(r.disagreementCount||0)),
    weakCount:Math.max(0,Number(r.weakCount||0)),
    stateFingerprint,
    validityLast,
    closedAt:Number.isFinite(closedAt)&&closedAt>0?closedAt:null,
    map:r.map&&typeof r.map==="object"?r.map:{reference:"MIXED",layers:[],conflictCount:0,weakCount:0}
  };
}

function evidenceRecordIdentity(record){
  const r=record||{};
  return [String(r.symbol||""),Number(r.capturedAt)||0,String(r.fingerprint||"")].join("|");
}

function mergeEvidenceWalRecords(baseRecords,walRecords,{maxPerSymbol=2000}={}){
  const byIdentity=new Map();
  for(const raw of Array.isArray(baseRecords)?baseRecords:[]){
    const record=canonicalEvidenceRecordSafe(raw)?raw:sanitizeRecord(raw);
    if(record) byIdentity.set(evidenceRecordIdentity(record),record);
  }
  for(const raw of Array.isArray(walRecords)?walRecords:[]){
    const record=canonicalEvidenceRecordSafe(raw)?raw:sanitizeRecord(raw);
    if(record) byIdentity.set(evidenceRecordIdentity(record),record);
  }
  return normalizedEvidenceRecords([...byIdentity.values()],{
    maxPerSymbol:Math.max(1,Math.floor(Number(maxPerSymbol)||2000)),
    reuseCanonicalRecords:true
  });
}

export function evidenceHistoryWalPath(filePath){
  return String(filePath)+".wal.jsonl";
}

export async function appendEvidenceHistoryWal(filePath,records,{
  walPath=evidenceHistoryWalPath(filePath),
  maxWalBytes=DEFAULT_MAX_WAL_BYTES,
  sync=true
}={}){
  await mkdir(path.dirname(walPath),{recursive:true});
  const clean=[];
  const seen=new Set();
  for(const raw of Array.isArray(records)?records:[]){
    const record=canonicalEvidenceRecordSafe(raw)?raw:sanitizeRecord(raw);
    if(!record) continue;
    const key=evidenceRecordIdentity(record);
    if(seen.has(key)) continue;
    seen.add(key);
    clean.push(record);
  }
  if(!clean.length) return {appended:0,bytes:0,walPath};

  const payload=clean.map(record=>JSON.stringify({
    schemaVersion:SCHEMA_VERSION,
    version:EVIDENCE_HISTORY_WAL_VERSION,
    op:"UPSERT",
    record
  })+"\n").join("");
  const bytes=Buffer.byteLength(payload,"utf8");
  const maxBytes=Math.max(1024*1024,Number(maxWalBytes)||DEFAULT_MAX_WAL_BYTES);
  const fh=await openFile(walPath,"a",0o600);
  try{
    const info=await fh.stat();
    if(Number(info.size||0)+bytes>maxBytes) throw new Error("evidence history WAL exceeds configured safety limit");
    await fh.writeFile(payload,{encoding:"utf8"});
    if(sync) await fh.sync();
  }finally{
    await fh.close();
  }
  return {appended:clean.length,bytes,walPath};
}

export async function clearEvidenceHistoryWal(filePath,{walPath=evidenceHistoryWalPath(filePath)}={}){
  await unlink(walPath).catch(err=>{if(err?.code!=="ENOENT") throw err;});
  return true;
}

async function readEvidenceHistoryWal(walPath,{maxWalBytes=DEFAULT_MAX_WAL_BYTES}={}){
  try{
    const stored=await readFile(walPath);
    const maxBytes=Math.max(1024*1024,Number(maxWalBytes)||DEFAULT_MAX_WAL_BYTES);
    if(stored.length>maxBytes) throw new Error("evidence history WAL exceeds configured read safety limit");
    const rows=[];
    let recoveredFromCorrupt=false;
    for(const line of stored.toString("utf8").split("\n")){
      if(!line.trim()) continue;
      try{
        const entry=JSON.parse(line);
        if(
          Number(entry?.schemaVersion)!==SCHEMA_VERSION||
          entry?.version!==EVIDENCE_HISTORY_WAL_VERSION||
          entry?.op!=="UPSERT"
        ) throw new Error("unsupported evidence WAL entry");
        const record=sanitizeRecord(entry.record);
        if(!record) throw new Error("invalid evidence WAL record");
        rows.push(record);
      }catch{
        // Preserve all complete valid rows before a torn/corrupt tail. A later
        // snapshot compaction will canonicalize those recovered rows.
        recoveredFromCorrupt=true;
        break;
      }
    }
    if(recoveredFromCorrupt){
      try{await rename(walPath,walPath+".corrupt-"+Date.now());}catch{}
    }
    return {records:rows,bytes:stored.length,recoveredFromCorrupt};
  }catch(err){
    if(err?.code==="ENOENT") return {records:[],bytes:0,recoveredFromCorrupt:false};
    try{await rename(walPath,walPath+".corrupt-"+Date.now());}catch{}
    return {records:[],bytes:0,recoveredFromCorrupt:true};
  }
}

export async function loadEvidenceHistory(filePath,{
  maxLogicalBytes=DEFAULT_MAX_LOGICAL_BYTES,
  walPath=evidenceHistoryWalPath(filePath),
  maxWalBytes=DEFAULT_MAX_WAL_BYTES,
  maxPerSymbol=2000
}={}){
  await mkdir(path.dirname(filePath),{recursive:true});

  let snapshotRecords=[];
  let recoveredFromCorrupt=false;
  let storageEncoding=null;
  let storageBytes=0;
  let logicalBytes=0;
  try{
    const stored=await readFile(filePath);
    storageEncoding=isGzipBuffer(stored)?"gzip":"json";
    const logical=storageEncoding==="gzip"?await gunzip(stored):stored;
    if(logical.length>Math.max(1024,Number(maxLogicalBytes)||DEFAULT_MAX_LOGICAL_BYTES)){
      throw new Error("evidence history exceeds configured logical safety limit");
    }
    const parsed=JSON.parse(logical.toString("utf8"));
    if(parsed?.schemaVersion!==SCHEMA_VERSION) throw new Error("unsupported evidence history schema");
    snapshotRecords=(Array.isArray(parsed.records)?parsed.records:[]).map(sanitizeRecord).filter(Boolean);
    storageBytes=stored.length;
    logicalBytes=logical.length;
  }catch(err){
    if(err?.code!=="ENOENT"){
      try{await rename(filePath,filePath+".corrupt-"+Date.now());}catch{}
      recoveredFromCorrupt=true;
    }
  }

  const wal=await readEvidenceHistoryWal(walPath,{maxWalBytes});
  const records=mergeEvidenceWalRecords(snapshotRecords,wal.records,{maxPerSymbol});
  return {
    records,
    recoveredFromCorrupt,
    recoveredWalFromCorrupt:wal.recoveredFromCorrupt===true,
    storageEncoding,
    storageBytes,
    logicalBytes,
    walBytes:wal.bytes,
    walRecords:wal.records.length,
    walPath
  };
}

async function* evidenceHistoryJsonChunks(clean,{updatedAt,maxBytes}){
  let logicalBytes=0;
  const checked=chunk=>{
    const text=String(chunk);
    logicalBytes+=Buffer.byteLength(text,"utf8");
    if(logicalBytes>maxBytes){
      throw new Error("evidence history exceeds configured persistence safety limit");
    }
    return text;
  };

  yield checked(
    '{"schemaVersion":'+SCHEMA_VERSION+
    ',"version":'+JSON.stringify(EVIDENCE_HISTORY_VERSION)+
    ',"updatedAt":'+JSON.stringify(updatedAt)+
    ',"records":['
  );
  for(let i=0;i<clean.length;i++){
    yield checked((i?",":"")+JSON.stringify(clean[i]));
  }
  yield checked("]}");
}

export async function saveEvidenceHistory(filePath,records,{
  maxPerSymbol=500,
  maxLogicalBytes=DEFAULT_MAX_LOGICAL_BYTES,
  reuseCanonicalRecords=false
}={}){
  await mkdir(path.dirname(filePath),{recursive:true});
  const clean=normalizedEvidenceRecords(records,{maxPerSymbol,reuseCanonicalRecords});
  const maxBytes=Math.max(1024,Number(maxLogicalBytes)||DEFAULT_MAX_LOGICAL_BYTES);
  const tmp=filePath+".tmp-"+process.pid;
  await unlink(tmp).catch(err=>{if(err?.code!=="ENOENT") throw err;});

  try{
    await pipeline(
      Readable.from(evidenceHistoryJsonChunks(clean,{
        updatedAt:new Date().toISOString(),
        maxBytes
      })),
      createGzip({level:1}),
      createWriteStream(tmp,{flags:"wx",mode:0o600})
    );
    const fh=await openFile(tmp,"r");
    try{await fh.sync();}finally{await fh.close();}
    await rename(tmp,filePath);
  }catch(err){
    await unlink(tmp).catch(()=>{});
    throw err;
  }
  return clean;
}

export async function compactEvidenceHistory(filePath,records,{
  walPath=evidenceHistoryWalPath(filePath),
  ...options
}={}){
  const clean=await saveEvidenceHistory(filePath,records,options);
  // Snapshot rename happens before WAL removal. If the process dies between
  // these operations, replaying the WAL is idempotent and cannot lose rows.
  await clearEvidenceHistoryWal(filePath,{walPath});
  return clean;
}

export function evidenceHistoryFor(history,symbol,{limit=12}={}){
  const s=String(symbol||"").toUpperCase();
  return (Array.isArray(history)?history:[])
    .filter(r=>r.symbol===s)
    .sort((a,b)=>a.capturedAt-b.capturedAt)
    .slice(-Math.max(1,Number(limit)||12));
}
