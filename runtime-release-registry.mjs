import path from 'node:path';
import { open as openFile, mkdir, readFile } from 'node:fs/promises';
import { canonicalJson, sha256 } from './institutional-kernel.mjs';

const SCHEMA_VERSION=1;
const GENESIS='0'.repeat(64);

export const DEFAULT_RUNTIME_FILES=[
  'bot.mjs',
  'state-store.mjs',
  'market-structure.mjs',
  'chart-renderer.mjs',
  'dashboard-state.mjs',
  'episode-memory.mjs',
  'mechanism-transition-engine.mjs',
  'independent-witness-network.mjs',
  'institutional-kernel.mjs',
  'market-data-fabric.mjs',
  'deterministic-replay.mjs',
  'runtime-release-registry.mjs',
  'package.json'
];

function cleanDeployment(d={}){
  const gitCommit=/^[0-9a-f]{7,64}$/i.test(String(d.gitCommit||''))?String(d.gitCommit):null;
  const gitBranch=String(d.gitBranch||'').slice(0,120)||null;
  const service=String(d.service||'').slice(0,120)||null;
  return {gitCommit,gitBranch,service};
}

export async function buildRuntimeManifest({
  rootDir='.',
  files=DEFAULT_RUNTIME_FILES,
  config={},
  packageInfo={},
  deployment={},
  versions={}
}={}){
  const componentHashes={};
  for(const name of [...files].sort()){
    const full=path.resolve(rootDir,name);
    const content=await readFile(full);
    componentHashes[name]=sha256(content);
  }

  const core={
    schemaVersion:SCHEMA_VERSION,
    kind:'TCX_RUNTIME_RELEASE',
    package:{
      name:String(packageInfo.name||'tcx-telegram-railway'),
      version:String(packageInfo.version||'UNKNOWN')
    },
    runtime:{
      node:process.version,
      platform:process.platform,
      arch:process.arch
    },
    deployment:cleanDeployment(deployment),
    versions,
    configHash:sha256(config),
    componentHashes
  };
  return {...core,releaseId:sha256(core)};
}

function registryCore({seq,prevHash,registeredAt,manifest}){
  return {
    schemaVersion:SCHEMA_VERSION,
    seq,
    prevHash,
    registeredAt:Number(registeredAt),
    releaseId:String(manifest.releaseId),
    manifestHash:sha256(manifest),
    manifest
  };
}

export function hashReleaseRecord(record){
  const {recordHash,...without}=record;
  return sha256(without);
}

export function verifyReleaseRegistry(records){
  let prev=GENESIS,seq=1;
  for(const record of records){
    if(Number(record.seq)!==seq) return {ok:false,error:'SEQ_GAP',seq:record.seq,expected:seq};
    if(record.prevHash!==prev) return {ok:false,error:'PREV_HASH_MISMATCH',seq:record.seq};
    if(record.manifestHash!==sha256(record.manifest)) return {ok:false,error:'MANIFEST_HASH_MISMATCH',seq:record.seq};
    if(record.releaseId!==record.manifest?.releaseId) return {ok:false,error:'RELEASE_ID_MISMATCH',seq:record.seq};
    if(record.recordHash!==hashReleaseRecord(record)) return {ok:false,error:'RECORD_HASH_MISMATCH',seq:record.seq};
    prev=record.recordHash;
    seq++;
  }
  return {ok:true,count:records.length,lastSeq:seq-1,tailHash:prev};
}

export async function openReleaseRegistry(filePath){
  await mkdir(path.dirname(filePath),{recursive:true});
  let records=[];
  try{
    const raw=await readFile(filePath,'utf8');
    records=raw.split(/\r?\n/).filter(Boolean).map((line,i)=>{
      try{return JSON.parse(line);}
      catch{throw new Error(`Invalid release-registry JSON at line ${i+1}`);}
    });
  }catch(err){
    if(err?.code!=='ENOENT'){
      return {
        filePath,healthy:false,
        verification:{ok:false,error:'REGISTRY_READ_OR_PARSE_FAILURE',detail:err instanceof Error?err.message:String(err)},
        records:[],seq:0,tailHash:GENESIS
      };
    }
  }
  const verification=verifyReleaseRegistry(records);
  return {
    filePath,
    healthy:verification.ok,
    verification,
    records,
    seq:verification.ok?verification.lastSeq:0,
    tailHash:verification.ok?verification.tailHash:GENESIS
  };
}

export async function registerRuntimeRelease(registry,manifest,{registeredAt=Date.now()}={}){
  if(!registry?.healthy) throw new Error('Release Registry unhealthy: fail closed');
  const existing=registry.records.find(r=>r.releaseId===manifest.releaseId);
  if(existing) return {record:existing,duplicate:true};

  const core=registryCore({
    seq:registry.seq+1,
    prevHash:registry.tailHash,
    registeredAt,
    manifest
  });
  const record={...core,recordHash:sha256(core)};

  let fh;
  try{
    fh=await openFile(registry.filePath,'a',0o600);
    await fh.write(canonicalJson(record)+'\n',null,'utf8');
    await fh.sync();
  }catch(err){
    registry.healthy=false;
    registry.verification={ok:false,error:'REGISTRY_APPEND_FAILURE',detail:err instanceof Error?err.message:String(err)};
    throw err;
  }finally{
    if(fh) await fh.close();
  }

  registry.records.push(record);
  registry.seq=record.seq;
  registry.tailHash=record.recordHash;
  return {record,duplicate:false};
}

export function releaseRegistrySummary(registry,currentManifest=null){
  const currentRecord=currentManifest
    ? registry?.records?.find(r=>r.releaseId===currentManifest.releaseId)||null
    : null;
  return {
    healthy:registry?.healthy===true,
    seq:Number(registry?.seq||0),
    tailHash:String(registry?.tailHash||GENESIS),
    filePath:String(registry?.filePath||''),
    releases:Array.isArray(registry?.records)?registry.records.length:0,
    currentReleaseId:currentManifest?.releaseId||null,
    currentRegistered:Boolean(currentRecord),
    currentRegistrySeq:currentRecord?.seq??null
  };
}

export const RELEASE_REGISTRY_VERSION='RR_V1';
