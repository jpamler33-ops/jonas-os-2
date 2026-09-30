import path from 'node:path';
import { open as openFile, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { canonicalJson, sha256 } from './institutional-kernel.mjs';

const SCHEMA_VERSION=1;
const GENESIS='0'.repeat(64);

export const DEFAULT_RUNTIME_FILES=[
  'bot.mjs',
  'state-store.mjs',
  'market-structure.mjs',
  'chart-renderer.mjs',
  'biggj-visual-intelligence.mjs',
  'dashboard-state.mjs',
  'episode-memory.mjs',
  'mechanism-transition-engine.mjs',
  'independent-witness-network.mjs',
  'institutional-kernel.mjs',
  'audit-ledger-rotation.mjs',
  'market-data-fabric.mjs',
  'deterministic-replay.mjs',
  'observability.mjs',
  'operational-readiness.mjs',
  'persistence-contracts.mjs',
  'chaos-engineering.mjs',
  'shadow-oms.mjs',
  'streaming-json-persistence.mjs',
  'autonomous-shadow-trader.mjs',
  'biggj-trading-policy.mjs',
  'shadow-portfolio-ledger.mjs',
  'shadow-capital-academy.mjs',
  'biggj-trading-academy.mjs',
  'shadow-training-supervisor.mjs',
  'strategy-evidence-engine.mjs',
  'shadow-trade-quality-learner.mjs',
  'mandatory-shadow-discovery.mjs',
  'shadow-coverage-curriculum.mjs',
  'learned-challenger-engine.mjs',
  'shadow-regime-brain.mjs',
  'adversarial-stress-lab.mjs',
  'shadow-strategy-league.mjs',
  'multi-venue-shadow-sor.mjs',
  'venue-quality-memory.mjs',
  'execution-research-lab.mjs',
  'telegram-product-ui.mjs',
  'alert-engine.mjs',
  'evidence-history.mjs',
  'state-validity.mjs',
  'research-lifecycle.mjs',
  'market-data-provider.mjs',
  'telegram-command-router.mjs',
  'telegram-update-dispatcher.mjs',
  'telegram-read-command-handlers.mjs',
  'telegram-mutation-command-handlers.mjs',
  'discord-telegram-bridge.mjs',
  'discord-component-ids.mjs',
  'discord-serial-dedupe-queue.mjs',
  'runtime-release-registry.mjs',
  'package.json'
];

export const INSTITUTIONAL_STAGED_RUNTIME_FILES=[
  'forecast-contract.mjs',
  'scientific-validity.mjs',
  'scientific-core.mjs',
  'institutional-admission.mjs',
  'research-trace.mjs',
  'claim-assumption-graph.mjs',
  'forecast-claim-assumption-sidecar.mjs',
  'claim-assumption-research-evaluator.mjs',
  'forecast-thesis-declarations.mjs',
  'forecast-thesis-revision-memory.mjs',
  'forecast-assumption-stability.mjs',
  'biggj-capability-map.mjs',
  'biggj-skill-dependency-graph.mjs',
  'biggj-skill-tree.mjs',
  'biggj-living-research-runtime.mjs',
  'biggj-research-protocol-compiler.mjs',
  'biggj-research-episode-resolver.mjs',
  'tcx-research-os-contract.mjs',
  'institutional-forecast-issuance.mjs',
  'institutional-forecast-runtime.mjs',
  'model-promotion-ladder.mjs',
  'model-candidate-registry.mjs',
  'model-governance-audit.mjs',
  'model-release-binding.mjs',
  'institutional-audit-binding.mjs',
  'forecast-input-adapter.mjs',
  'forecast-science-adapter.mjs',
  'forecast-product.mjs',
  'forecast-candidate-lab.mjs',
  'forecast-learning-center.mjs',
  'forecast-hypothesis-generator.mjs',
  'forecast-shadow-competition.mjs',
  'forecast-shadow-evaluation-client.mjs',
  'forecast-shadow-evaluation-worker.mjs',
  'forecast-experiment-governor.mjs',
  'forecast-feature-research.mjs',
  'research-data-plane.mjs',
  'research-data-plane-adapters.mjs',
  'research-feature-catalog.mjs',
  'research-source-contracts.mjs',
  'research-data-governance.mjs',

  // Direct production dependencies imported by bot.mjs. Keep the release
  // component identity closed over the serving entrypoint, not just feature subsets.
  'opportunity-allocator.mjs',
  'strategy-edge-decay.mjs',
  'evidence-promotion-gate.mjs',
  'independent-proof-auditor.mjs',
  'rolling-walk-forward.mjs',
  'frozen-policy-oos-accumulator.mjs',
  'tail-risk-bootstrap.mjs',
  'shadow-leverage-risk.mjs',
  'portfolio-risk-brain.mjs',
  'pit-correlation-engine.mjs',
  'leverage-counterfactual-lab.mjs',
  'tcx-proof-system.mjs',
  'shadow-policy-freeze.mjs',
  'trade-lifecycle-v2.mjs',
  'setup-performance-memory.mjs',
  'chart-intelligence.mjs',
  'market-xray-view.mjs',
  'liquidation-confluence-view.mjs',
  'structure-event-radar.mjs',
  'forecast-chart-overlay.mjs',
  'flow-radar-view.mjs',
  'forecast-accuracy-view.mjs',
  'superchart-intel.mjs',
  'intelligence-terminal.mjs',
  'cognitive-core.mjs',
  'scientific-brain.mjs',
  'world-model-foundation.mjs',
  'final-foundation-pack.mjs',
  'mission-control.mjs',
  'market-fabric-rotation.mjs',
  'market-fabric-archive.mjs',
  'market-fabric-cold-store.mjs',
  'market-fabric-cold-tier.mjs',
  'market-fabric-cold-replay.mjs',
  'persistence-smoke.mjs',
  'storage-maintenance.mjs',
  'trade-discovery-diagnostics.mjs',
  'telegram-ui-runtime.mjs',
  'forecast-cold-archive.mjs',
  'research-dependency-graph.mjs',
  'research-coverage-doctor.mjs',
  'research-intelligence-features.mjs',
  'research-provider-fanout.mjs',
  'model-promotion-review-service.mjs',
  'expansion-runtime/dexscreener-public-provider.mjs',
  'expansion-runtime/public-market-context-provider.mjs',
  'expansion-runtime/external-research-provider.mjs',

  'forecast-runtime/utils/math.js',
  'forecast-runtime/forecast/index.js',
  'forecast-runtime/forecast/forecast_bot_api.js',
  'forecast-runtime/forecast/intelligence_telegram.js',
  'forecast-runtime/forecast/telegram.js',
  'forecast-runtime/forecast/types.js',
  'forecast-runtime/forecast/calibration.js',
  'forecast-runtime/forecast/reliability.js',
  'forecast-runtime/forecast/model_performance.js',
  'forecast-runtime/forecast/interval_calibration.js',
  'forecast-runtime/forecast/drift.js',
  'forecast-runtime/forecast/path_engine.js',
  'forecast-runtime/forecast/regime_transition.js',
  'forecast-runtime/forecast/invalidation.js',
  'forecast-runtime/forecast/revision_tracker.js',
  'forecast-runtime/forecast/counterfactual.js',
  'forecast-runtime/forecast/history_builder.js',
  'forecast-runtime/forecast/evaluation.js',
  'forecast-runtime/forecast/journal.js',
  'forecast-runtime/forecast/engine.js',
  'forecast-runtime/forecast/tcx_adapter.js',
  'forecast-runtime/forecast/intelligence.js',
  'forecast-runtime/forecast/intelligence_service.js',

  'science-runtime/empirical-support.mjs',
  'science-runtime/research-integrity.mjs',
  'science-runtime/concept-stability.mjs',
  'science-runtime/nonlinear-concept-stability.mjs',
  'science-runtime/temporal-recency.mjs',
  'science-runtime/sequential-evidence.mjs',
  'science-runtime/specification-multiverse.mjs',
  'science-runtime/transportability.mjs',
  'science-runtime/evidence-lineage-independence.mjs',
  'science-runtime/epistemic-integrity.mjs',

  'expansion-runtime/provenance.mjs',
  'expansion-runtime/institutional-expansion.mjs',
  'expansion-runtime/future-intelligence.mjs',
  'expansion-runtime/memecoin-intelligence.mjs',
  'expansion-runtime/narrative-reflexivity.mjs',
  'expansion-runtime/trader-wallet-intelligence.mjs',
  'expansion-runtime/source-intelligence.mjs',
  'expansion-runtime/event-impact-memory.mjs',
  'expansion-runtime/liquidity-intelligence.mjs',
  'expansion-runtime/derivatives-public-provider.mjs',
  'expansion-runtime/liquidation-public-stream.mjs',
  'expansion-runtime/onchain-research-provider.mjs',
  'expansion-runtime/wallet-cohort-public-provider.mjs',
  'expansion-runtime/verified-entity-registry.mjs',
  'expansion-runtime/entity-flow-engine.mjs'
];

export function institutionalRuntimeFiles(){
  return [...new Set([...DEFAULT_RUNTIME_FILES,...INSTITUTIONAL_STAGED_RUNTIME_FILES])].sort();
}

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

  let resolvedPackage={...packageInfo};
  if(!resolvedPackage.name||!resolvedPackage.version){
    try{
      const parsed=JSON.parse(await readFile(path.resolve(rootDir,'package.json'),'utf8'));
      resolvedPackage={
        name:resolvedPackage.name||parsed.name,
        version:resolvedPackage.version||parsed.version
      };
    }catch{}
  }

  const core={
    schemaVersion:SCHEMA_VERSION,
    kind:'TCX_RUNTIME_RELEASE',
    package:{
      name:String(resolvedPackage.name||'tcx-telegram-railway'),
      version:String(resolvedPackage.version||'UNKNOWN')
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
  let recoveredFromTruncatedTail=false;
  let backupPath=null;
  try{
    const raw=await readFile(filePath,'utf8');
    const lines=raw.split(/\r?\n/);
    for(let i=0;i<lines.length;i++){
      const line=lines[i];
      if(!line.trim()) continue;
      try{records.push(JSON.parse(line));}
      catch{
        const trailingOnly=lines.slice(i+1).every(x=>!x.trim());
        const prefix=verifyReleaseRegistry(records);
        if(!trailingOnly||!prefix.ok){
          throw new Error(`Invalid release-registry JSON at line ${i+1}`);
        }
        const stamp=Date.now();
        const tempPath=filePath+'.repair-'+stamp;
        backupPath=filePath+'.truncated-tail-'+stamp;
        const repaired=records.length?records.map(canonicalJson).join('\n')+'\n':'';
        let tempHandle;
        try{
          await writeFile(tempPath,repaired,{encoding:'utf8',mode:0o600,flag:'wx'});
          tempHandle=await openFile(tempPath,'r+');
          await tempHandle.sync();
          await tempHandle.close();
          tempHandle=null;
          await rename(filePath,backupPath);
          try{await rename(tempPath,filePath);}
          catch(err){
            await rename(backupPath,filePath).catch(()=>{});
            throw err;
          }
          recoveredFromTruncatedTail=true;
        }catch(err){
          if(tempHandle) await tempHandle.close().catch(()=>{});
          await unlink(tempPath).catch(()=>{});
          throw new Error(`Could not preserve and repair truncated release-registry tail: ${err instanceof Error?err.message:String(err)}`);
        }
        break;
      }
    }
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
    tailHash:verification.ok?verification.tailHash:GENESIS,
    recoveredFromTruncatedTail,
    backupPath
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
    currentRegistrySeq:currentRecord?.seq??null,
    recoveredFromTruncatedTail:registry?.recoveredFromTruncatedTail===true,
    backupPath:registry?.backupPath??null
  };
}

export const RELEASE_REGISTRY_VERSION='RR_V1';
