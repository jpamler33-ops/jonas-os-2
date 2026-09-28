import path from "node:path";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { gzip as gzipCallback, gunzip as gunzipCallback } from "node:zlib";

const gzip=promisify(gzipCallback);
const gunzip=promisify(gunzipCallback);
import { createStateFingerprint, validateStateFingerprint } from "./state-validity.mjs";

export const EVIDENCE_HISTORY_VERSION="TCX_EVIDENCE_HISTORY_V2";
export const EVIDENCE_HISTORY_SCHEMA_VERSION=1;
const SCHEMA_VERSION=EVIDENCE_HISTORY_SCHEMA_VERSION;
const SYMBOL_RE=/^[A-Z0-9]{2,18}USDT$/;
const DEFAULT_MAX_LOGICAL_BYTES=128*1024*1024;

function isGzipBuffer(value){
  return Buffer.isBuffer(value)&&value.length>=2&&value[0]===0x1f&&value[1]===0x8b;
}

function normalizedEvidenceRecords(records,{maxPerSymbol=500}={}){
  const grouped=new Map();
  for(const r of Array.isArray(records)?records:[]){
    const x=sanitizeRecord(r);
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

export async function loadEvidenceHistory(filePath,{maxLogicalBytes=DEFAULT_MAX_LOGICAL_BYTES}={}){
  await mkdir(path.dirname(filePath),{recursive:true});
  try{
    const stored=await readFile(filePath);
    const encoding=isGzipBuffer(stored)?"gzip":"json";
    const logical=encoding==="gzip"?await gunzip(stored):stored;
    if(logical.length>Math.max(1024,Number(maxLogicalBytes)||DEFAULT_MAX_LOGICAL_BYTES)){
      throw new Error("evidence history exceeds configured logical safety limit");
    }
    const parsed=JSON.parse(logical.toString("utf8"));
    if(parsed?.schemaVersion!==SCHEMA_VERSION) throw new Error("unsupported evidence history schema");
    return {
      records:(Array.isArray(parsed.records)?parsed.records:[]).map(sanitizeRecord).filter(Boolean),
      recoveredFromCorrupt:false,
      storageEncoding:encoding,
      storageBytes:stored.length,
      logicalBytes:logical.length
    };
  }catch(err){
    if(err?.code==="ENOENT") return {records:[],recoveredFromCorrupt:false,storageEncoding:null,storageBytes:0,logicalBytes:0};
    try{await rename(filePath,filePath+".corrupt-"+Date.now());}catch{}
    return {records:[],recoveredFromCorrupt:true,storageEncoding:null,storageBytes:0,logicalBytes:0};
  }
}

export async function saveEvidenceHistory(filePath,records,{maxPerSymbol=500,maxLogicalBytes=DEFAULT_MAX_LOGICAL_BYTES}={}){
  await mkdir(path.dirname(filePath),{recursive:true});
  const clean=normalizedEvidenceRecords(records,{maxPerSymbol});
  const payload={
    schemaVersion:SCHEMA_VERSION,
    version:EVIDENCE_HISTORY_VERSION,
    updatedAt:new Date().toISOString(),
    records:clean
  };
  const serialized=JSON.stringify(payload);
  const logicalBytes=Buffer.byteLength(serialized);
  const maxBytes=Math.max(1024,Number(maxLogicalBytes)||DEFAULT_MAX_LOGICAL_BYTES);
  if(logicalBytes>maxBytes) throw new Error("evidence history exceeds configured persistence safety limit");
  const compressed=await gzip(Buffer.from(serialized,"utf8"),{level:1});
  const tmp=filePath+".tmp-"+process.pid;
  await writeFile(tmp,compressed,{mode:0o600});
  await rename(tmp,filePath);
  return clean;
}

export function evidenceHistoryFor(history,symbol,{limit=12}={}){
  const s=String(symbol||"").toUpperCase();
  return (Array.isArray(history)?history:[])
    .filter(r=>r.symbol===s)
    .sort((a,b)=>a.capturedAt-b.capturedAt)
    .slice(-Math.max(1,Number(limit)||12));
}
