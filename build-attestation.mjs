import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { sha256 } from './institutional-kernel.mjs';
import { institutionalRuntimeFiles } from './runtime-release-registry.mjs';

export const BUILD_TEST_ATTESTATION_VERSION='TCX_BUILD_TEST_ATTESTATION_V1';
export const DEFAULT_BUILD_ATTESTATION_FILE='/app/.tcx-build-attestation.json';

export const REQUIRED_BUILD_TEST_SCRIPTS=Object.freeze([
  'check',
  'test:auto-shadow',
  'test:portfolio',
  'test:academy',
  'test:training',
  'test:league',
  'test:discovery',
  'test:learning-v2',
  'test:learning-v3',
  'test:learning-v4',
  'test:coverage',
  'test:stability',
  'test:telegram-resilience',
  'test:ui',
  'test:intel',
  'test:forecast-core',
  'test:autolearn',
  'test:shadow-worker',
  'test:competition',
  'test:feature-research',
  'test:data-plane',
  'test:data-lineage',
  'test:epistemic',
  'test:promotion-review'
]);

async function fileHashes(rootDir,files){
  const out={};
  for(const name of [...files].sort()){
    const bytes=await readFile(path.resolve(rootDir,name));
    out[name]=sha256(bytes);
  }
  return out;
}
function deepFreeze(v){
  if(v&&typeof v==='object'&&!Object.isFrozen(v)){
    Object.freeze(v);
    for(const x of Object.values(v)) deepFreeze(x);
  }
  return v;
}

export async function createBuildTestAttestation({
  rootDir='.',
  files=institutionalRuntimeFiles(),
  testScripts=REQUIRED_BUILD_TEST_SCRIPTS,
  generatedAt=Date.now()
}={}){
  const packageInfo=JSON.parse(await readFile(path.resolve(rootDir,'package.json'),'utf8'));
  const missingScripts=testScripts.filter(name=>!packageInfo?.scripts?.[name]);
  if(missingScripts.length) throw new Error('BUILD_ATTESTATION_TEST_SCRIPT_MISSING:'+missingScripts.join(','));

  const hashes=await fileHashes(rootDir,files);
  const core={
    version:BUILD_TEST_ATTESTATION_VERSION,
    generatedAt:Number(generatedAt),
    packageName:String(packageInfo?.name||'UNKNOWN'),
    packageVersion:String(packageInfo?.version||'UNKNOWN'),
    nodeVersion:process.version,
    files:[...files].sort(),
    fileHashes:hashes,
    sourceFingerprint:sha256(hashes),
    testScripts:[...testScripts],
    testContractFingerprint:sha256(testScripts.map(name=>({name,command:String(packageInfo.scripts[name])}))),
    testsPassed:true,
    provenance:'GENERATED_ONLY_AFTER_DOCKER_TEST_CHAIN',
    executionMode:'SHADOW_ONLY',
    canExecute:false
  };
  return deepFreeze({...core,fingerprint:sha256(core)});
}

export async function verifyBuildTestAttestation(attestation,{rootDir='.'}={}){
  const reasons=[];
  try{
    if(attestation?.version!==BUILD_TEST_ATTESTATION_VERSION) reasons.push('VERSION_INVALID');
    if(attestation?.testsPassed!==true) reasons.push('TESTS_NOT_ATTESTED');
    if(attestation?.executionMode!=='SHADOW_ONLY'||attestation?.canExecute!==false) reasons.push('SAFETY_INVARIANT_INVALID');
    const {fingerprint,...core}=attestation||{};
    if(fingerprint!==sha256(core)) reasons.push('FINGERPRINT_MISMATCH');

    const scripts=Array.isArray(attestation?.testScripts)?attestation.testScripts:[];
    if(sha256(scripts)!==sha256(REQUIRED_BUILD_TEST_SCRIPTS)) reasons.push('TEST_CONTRACT_MISMATCH');

    const files=Array.isArray(attestation?.files)?attestation.files:[];
    if(!files.length) reasons.push('FILES_MISSING');
    else{
      const current=await fileHashes(rootDir,files);
      if(sha256(current)!==String(attestation?.sourceFingerprint||'')) reasons.push('SOURCE_FINGERPRINT_MISMATCH');
      for(const name of files){
        if(current[name]!==attestation?.fileHashes?.[name]){
          reasons.push('FILE_HASH_MISMATCH:'+name);
          break;
        }
      }
    }
  }catch(err){
    reasons.push('ATTESTATION_VERIFY_ERROR:'+(err instanceof Error?err.message:String(err)));
  }
  return deepFreeze({
    ok:reasons.length===0,
    reasons,
    version:BUILD_TEST_ATTESTATION_VERSION,
    generatedAt:Number(attestation?.generatedAt||0)||null,
    sourceFingerprint:attestation?.sourceFingerprint??null,
    testContractFingerprint:attestation?.testContractFingerprint??null,
    executionMode:'SHADOW_ONLY',
    canExecute:false
  });
}

export async function writeBuildTestAttestation(filePath=DEFAULT_BUILD_ATTESTATION_FILE,{rootDir='.'}={}){
  const attestation=await createBuildTestAttestation({rootDir});
  await writeFile(filePath,JSON.stringify(attestation,null,2)+'\n',{encoding:'utf8',mode:0o444});
  return attestation;
}

export async function loadBuildTestAttestation(filePath=DEFAULT_BUILD_ATTESTATION_FILE,{rootDir='.'}={}){
  try{
    const attestation=JSON.parse(await readFile(filePath,'utf8'));
    const verification=await verifyBuildTestAttestation(attestation,{rootDir});
    return {filePath,attestation,verification};
  }catch(err){
    return {
      filePath,
      attestation:null,
      verification:{
        ok:false,
        reasons:['ATTESTATION_LOAD_ERROR:'+(err instanceof Error?err.message:String(err))],
        version:BUILD_TEST_ATTESTATION_VERSION,
        generatedAt:null,
        sourceFingerprint:null,
        testContractFingerprint:null,
        executionMode:'SHADOW_ONLY',
        canExecute:false
      }
    };
  }
}

if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname)){
  const command=process.argv[2];
  if(command==='write'){
    const filePath=process.argv[3]||DEFAULT_BUILD_ATTESTATION_FILE;
    const attestation=await writeBuildTestAttestation(filePath,{rootDir:process.cwd()});
    console.log(JSON.stringify({
      version:attestation.version,
      generatedAt:attestation.generatedAt,
      sourceFingerprint:attestation.sourceFingerprint,
      testContractFingerprint:attestation.testContractFingerprint,
      filePath
    }));
  }
}
